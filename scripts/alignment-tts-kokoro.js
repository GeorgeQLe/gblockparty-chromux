/**
 * Alignment TTS — Kokoro-powered "Brief Me" narration for alignment pages.
 *
 * Loaded as <script src="..."> from alignment pages (not type="module",
 * because module scripts are blocked by CORS on file:// URLs).
 * Uses kokoro-js for natural-sounding client-side TTS via WebGPU/WASM.
 * Falls back to Web Speech API if Kokoro fails to load.
 */

(function() {
'use strict';

const KOKORO_CDN = 'https://esm.sh/kokoro-js@1.2.1';
const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICES = [
  { id: 'af_heart', label: 'Heart' },
  { id: 'af_sky', label: 'Sky' },
  { id: 'af_nicole', label: 'Nicole' },
  { id: 'am_michael', label: 'Michael' },
  { id: 'af_bella', label: 'Bella' },
  { id: 'bf_emma', label: 'Emma' },
];
const LS_VOICE_KEY = 'tts-kokoro-voice';
const LS_SPEED_KEY = 'tts-kokoro-speed';
const LS_USED_KEY = 'tts-kokoro-used';
const FIRST_CHUNK_LEN = 250;
// Chunks are kept small so each synthesis call is short; PREFETCH_AHEAD chunks
// generate during playback, absorbing slow-chunk variance without gaps.
const MAX_CHUNK_LEN = 300;
const PREFETCH_AHEAD = 2;

let ttsInstance = null;
let ttsLoadPromise = null;
let progressHook = null;
let usingFallback = false;
let audioCtx = null;
let sections = [];
let currentIdx = -1;
let speed = parseFloat(localStorage.getItem(LS_SPEED_KEY) || '1');
let paused = false;
let active = false;
let bar = null;
let skipId = 0;
let currentSource = null;
let currentStream = null;
let briefBtn = null;
let cacheNoteShown = false;

// Model weights persist between visits via Cache API origin storage. Verified
// 2026-06-09 (instrumented probe, Windows Chrome on file://wsl.localhost):
// caches IS available on file:// origins and entries persist across reloads
// and browser restarts, so file:// pages do not re-download. Warn only when
// the Cache API is genuinely absent — there a re-download per visit is certain.
function noteCacheCapability() {
  if (cacheNoteShown) return;
  cacheNoteShown = true;
  if (typeof caches === 'undefined') {
    console.info('Kokoro TTS: Cache API unavailable on this origin; the voice model will re-download on each visit. Serve this page over http://localhost for persistent caching.');
  }
}

function getSelectedVoice() {
  return localStorage.getItem(LS_VOICE_KEY) || VOICES[0].id;
}

// Block elements whose text should end as its own sentence. Raw textContent
// flattening glues "<h3>Risks</h3><p>The main..." into one run-on sentence;
// Kokoro derives sentence breaks and prosody from punctuation, so each block
// boundary gets terminal punctuation if the text doesn't already have it.
const BLOCK_TAGS = { P:1, LI:1, H1:1, H2:1, H3:1, H4:1, H5:1, H6:1, TD:1, TH:1, TR:1, BLOCKQUOTE:1, DT:1, DD:1, FIGCAPTION:1, SUMMARY:1, DIV:1, PRE:1 };

function textWithSentenceBreaks(root) {
  let out = '';
  const closeBlock = () => {
    const t = out.replace(/\s+$/, '');
    if (!t) { out = t; return; }
    out = /[.!?:;,]$/.test(t) ? t + ' ' : t + '. ';
  };
  const walk = (node) => {
    if (node.nodeType === 3) { out += node.textContent; return; }
    if (node.nodeType !== 1) return;
    node.childNodes.forEach(walk);
    if (BLOCK_TAGS[node.tagName]) closeBlock();
  };
  walk(root);
  return out.replace(/\s+/g, ' ').trim();
}

// h2 stripped because callers prefix the section text with the heading label
// themselves — keeping it would read every heading twice.
const STRIP_SELECTOR = 'h2, .section-feedback, .question-block, .gate, .compile-box, .radio-group, .answer-notes, .local-yaml, .local-yaml-actions, .compile-actions, button, textarea, input, .tts-bar';
const NARRATIVE_SELECTOR = '.chart-container, .table-wrap, .stat-grid';

function extractText(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll(STRIP_SELECTOR).forEach(n => n.remove());
  clone.querySelectorAll(NARRATIVE_SELECTOR).forEach(n => {
    const narrative = n.getAttribute('data-tts-narrative');
    if (narrative) {
      const span = document.createElement('span');
      span.textContent = ' ' + narrative + ' ';
      n.replaceWith(span);
    } else {
      n.remove();
    }
  });
  return textWithSentenceBreaks(clone);
}

// Live-DOM counterpart of extractText: same text rules, but each block-level
// flush is emitted as {el, text} against the LIVE element, so spoken chunks
// can be mapped back to the blocks they came from for follow-along highlight.
function extractSegments(rootEl) {
  const segments = [];
  let buf = '';
  const punctuate = (t) => /[.!?:;,]$/.test(t) ? t : t + '.';
  const flush = (el, addPunct) => {
    const t = buf.replace(/\s+/g, ' ').trim();
    buf = '';
    if (!t) return;
    segments.push({ el, text: addPunct ? punctuate(t) : t });
  };
  const walk = (node) => {
    if (node.nodeType === 3) { buf += node.textContent; return; }
    if (node.nodeType !== 1) return;
    if (node.matches(STRIP_SELECTOR)) return;
    if (node.matches(NARRATIVE_SELECTOR)) {
      const narrative = node.getAttribute('data-tts-narrative');
      if (!narrative) return;
      flush(node.parentElement || rootEl, true);
      segments.push({ el: node, text: punctuate(narrative.replace(/\s+/g, ' ').trim()) });
      return;
    }
    node.childNodes.forEach(walk);
    if (BLOCK_TAGS[node.tagName]) flush(node, true);
  };
  rootEl.childNodes.forEach(walk);
  // Trailing inline text directly under the root; legacy extractText adds no
  // terminal punctuation here unless the root itself is a block element.
  flush(rootEl, !!BLOCK_TAGS[rootEl.tagName]);
  return segments;
}

// Join {el, text} segments into one section string with [start,end) offsets,
// so chunk offsets from chunkTextWithOffsets map back to live elements.
function joinSegments(segs) {
  let text = '';
  const segments = [];
  segs.forEach(s => {
    if (text) text += ' ';
    const start = text.length;
    text += s.text;
    segments.push({ el: s.el, start, end: text.length });
  });
  return { text, segments };
}

function buildSectionSource(sectionEl, headingLabel, headingEl) {
  const segs = extractSegments(sectionEl);
  // Synthetic heading segment replaces the `${heading}. ${text}` prefix so the
  // heading element highlights while its label is spoken.
  segs.unshift({ el: headingEl || sectionEl, text: headingLabel + '.' });
  return joinSegments(segs);
}

// Text normalization: expand symbols and abbreviations the TTS front-end would
// otherwise read as glyph names ("~" -> "tilde"). Order matters: the tilde
// rule only fires before digits, since a bare ~ in a path really is "tilde".
function normalizeForSpeech(text) {
  return text
    .replace(/~\s?(?=\d)/g, 'approximately ')
    .replace(/\bv(\d+(?:\.\d+)+)/g, 'version $1')
    .replace(/\be\.g\.,?/gi, 'for example,')
    .replace(/\bi\.e\.,?/gi, 'that is,')
    .replace(/\bvs\.?(?=\s)/gi, 'versus')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s&\s/g, ' and ')
    .replace(/→/g, ' to ')
    .replace(/≥/g, ' at least ')
    .replace(/≤/g, ' at most ')
    .replace(/±/g, ' plus or minus ')
    .replace(/\s{2,}/g, ' ');
}

function gatherSections() {
  sections = [];
  const header = document.querySelector('header');
  const h1 = document.querySelector('h1');
  const lead = document.querySelector('.lead');
  const title = h1?.textContent?.trim() || 'Alignment Page';
  const leadText = lead?.textContent?.trim() || '';
  const introEl = header || h1?.parentElement || document.querySelector('main') || document.body;
  if (title) {
    const introSegs = [{ el: h1 || introEl, text: `${title}.` }];
    if (lead && leadText) introSegs.push({ el: lead, text: leadText });
    const src = joinSegments(introSegs);
    sections.push({ el: introEl, label: 'Introduction', text: src.text, segments: src.segments });
  }
  document.querySelectorAll('section').forEach(sec => {
    const id = sec.id;
    if (id === 'compile' || id === 'review-gates') return;
    const h2 = sec.querySelector('h2');
    const heading = h2?.textContent?.trim() || 'Section';
    const src = buildSectionSource(sec, heading, h2);
    // Body length gate: same >10 threshold as before, measured past the
    // synthetic heading segment.
    const bodyLen = Math.max(0, src.text.length - src.segments[0].end - 1);
    if (bodyLen > 10) sections.push({ el: sec, label: heading, text: src.text, segments: src.segments });
  });
  if (sections.length <= 1) {
    const container = document.querySelector('main') || document.body;
    const h2s = container.querySelectorAll('h2');
    h2s.forEach(h2 => {
      const heading = h2.textContent.trim();
      const tempDiv = document.createElement('div');
      tempDiv.appendChild(h2.cloneNode(true));
      let sib = h2.nextElementSibling;
      while (sib && sib.tagName !== 'H2') {
        tempDiv.appendChild(sib.cloneNode(true));
        sib = sib.nextElementSibling;
      }
      const text = extractText(tempDiv);
      if (text.length > 10) {
        const el = h2.parentElement || h2;
        const full = `${heading}. ${text}`;
        // Clone-based fallback: one whole-section segment (no follow-along).
        sections.push({ el, label: heading, text: full, segments: [{ el, start: 0, end: full.length }] });
      }
    });
  }
  if (!sections.length) {
    const body = extractText(document.querySelector('main') || document.body);
    if (body.length > 10) {
      sections.push({ el: document.body, label: 'Page', text: body, segments: [{ el: document.body, start: 0, end: body.length }] });
    }
  }
}

function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function highlight(el, scroll) {
  if (scroll === undefined) scroll = true;
  document.querySelectorAll('.tts-active-section').forEach(e => e.classList.remove('tts-active-section'));
  if (el) {
    el.classList.add('tts-active-section');
    if (scroll) el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  } else {
    clearChunkHighlight();
  }
}

// --- Follow-along chunk highlight ---

let chunkEls = [];

function clearChunkHighlight() {
  chunkEls.forEach(el => el.classList.remove('tts-active-chunk'));
  chunkEls = [];
}

// Already roughly centered (middle ~60% of the viewport)? Skip the scroll —
// consecutive chunks inside one long block would otherwise jitter.
function inMidViewport(el) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  return r.top >= vh * 0.2 && r.bottom <= vh * 0.8;
}

function highlightChunk(sec, chunk) {
  if (!sec.segments) return;
  const els = [];
  sec.segments.forEach(s => {
    if (s.start >= chunk.end || s.end <= chunk.start) return;
    let el = s.el;
    if (el.tagName === 'TD' || el.tagName === 'TH') el = el.closest('tr') || el;
    if (!els.includes(el)) els.push(el);
  });
  chunkEls.forEach(el => { if (!els.includes(el)) el.classList.remove('tts-active-chunk'); });
  els.forEach(el => el.classList.add('tts-active-chunk'));
  chunkEls = els;
  if (els[0] && !inMidViewport(els[0])) {
    els[0].scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  }
}

function updateStatus() {
  if (!bar) return;
  const label = bar.querySelector('.tts-status');
  if (!label) return;
  const sec = sections[currentIdx];
  const state = paused ? 'Paused' : 'Reading';
  label.textContent = sec ? `${state}: ${sec.label} (${currentIdx + 1}/${sections.length})` : '';
}

function updateButtonLabel(text) {
  if (briefBtn) briefBtn.textContent = text;
}

// --- Web Speech API fallback ---

const fallback = {
  synth: typeof speechSynthesis !== 'undefined' ? speechSynthesis : null,

  speak(text, onEnd) {
    if (!this.synth) { onEnd(); return; }
    this.synth.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = speed;
    utt.onend = onEnd;
    utt.onerror = (e) => { if (e.error !== 'canceled') onEnd(); };
    this.synth.speak(utt);
  },

  pause() { this.synth?.pause(); },
  resume() { this.synth?.resume(); },
  cancel() { this.synth?.cancel(); },
};

// --- Kokoro engine ---

async function loadKokoro(onProgress) {
  const { KokoroTTS } = await import(KOKORO_CDN);
  const dtype = navigator.gpu ? 'fp32' : 'q8';
  const device = navigator.gpu ? 'webgpu' : 'wasm';
  const instance = await KokoroTTS.from_pretrained(MODEL_ID, {
    dtype,
    device,
    progress_callback: (progress) => {
      if (progress.status === 'progress' && progress.total) {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        onProgress(pct);
      }
    },
  });
  return instance;
}

function reportProgress(pct) {
  if (progressHook) progressHook(pct);
}

// Single shared load promise: a click during a background warm start waits on
// the in-flight load instead of starting a second one (or worse, proceeding
// with no instance).
function ensureTTS(onProgress) {
  if (onProgress) progressHook = onProgress;
  if (ttsInstance) return Promise.resolve(ttsInstance);
  if (!ttsLoadPromise) {
    noteCacheCapability();
    ttsLoadPromise = loadKokoro(reportProgress).then((instance) => {
      ttsInstance = instance;
      usingFallback = false;
      try { localStorage.setItem(LS_USED_KEY, '1'); } catch (_) {}
      return instance;
    }).catch((err) => {
      console.warn('Kokoro TTS failed to load, falling back to Web Speech API:', err);
      usingFallback = true;
      ttsLoadPromise = null;
      return null;
    });
  }
  return ttsLoadPromise;
}

// After the first successful use on this machine, preload the model during
// idle time on later page loads so it is ready by the time the user clicks.
// Gated by the localStorage flag so users who never click pay nothing.
function warmStart() {
  let used = null;
  try { used = localStorage.getItem(LS_USED_KEY); } catch (_) {}
  if (used !== '1') return;
  const kick = () => {
    console.info('Kokoro TTS: pre-warming voice model in background');
    ensureTTS(null);
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(kick, { timeout: 10000 });
  } else {
    setTimeout(kick, 3000);
  }
}

function stopCurrentAudio() {
  if (currentStream) {
    currentStream.abort = true;
    currentStream = null;
  }
  if (currentSource) {
    try { currentSource.stop(); } catch (_) {}
    currentSource = null;
  }
  if (usingFallback) fallback.cancel();
  clearChunkHighlight();
}

// The first chunk is kept short (firstLen) so audio starts after synthesizing
// only a sentence or two; later chunks use maxLen and are prefetched during
// playback, so their size never delays audio. Each chunk carries its [start,
// end) offsets into the input text so it can be mapped back to segments.
function chunkTextWithOffsets(text, maxLen, firstLen) {
  maxLen = maxLen || 1000;
  var limit = firstLen || maxLen;
  if (text.length <= limit) return [{ text: text, start: 0, end: text.length }];
  var chunks = [];
  var pos = 0;
  var push = (from, to) => {
    // Offset-aware trim: advance past leading/trailing whitespace.
    while (from < to && /\s/.test(text[from])) from++;
    while (to > from && /\s/.test(text[to - 1])) to--;
    if (to > from) chunks.push({ text: text.slice(from, to), start: from, end: to });
  };
  while (text.length - pos > limit) {
    var remaining = text.slice(pos);
    var cut = -1;
    var seps = ['. ', '? ', '! '];
    for (var i = 0; i < seps.length; i++) {
      var idx = remaining.lastIndexOf(seps[i], limit);
      if (idx > cut) cut = idx + seps[i].length;
    }
    if (cut <= 0) {
      // No sentence end within the limit: prefer a clause boundary, then a
      // word boundary, before resorting to a hard mid-word cut. Em/en dashes
      // are clause boundaries too (they read as pauses).
      var clauseSeps = [', ', '; ', ': ', ' — ', ' – '];
      for (var j = 0; j < clauseSeps.length; j++) {
        var cIdx = remaining.lastIndexOf(clauseSeps[j], limit);
        if (cIdx > cut) cut = cIdx + clauseSeps[j].length;
      }
    }
    if (cut <= 0) {
      var sp = remaining.lastIndexOf(' ', limit);
      if (sp > 0) cut = sp + 1;
    }
    if (cut <= 0) cut = limit;
    push(pos, pos + cut);
    pos += cut;
    while (pos < text.length && /\s/.test(text[pos])) pos++;
    limit = maxLen;
  }
  push(pos, text.length);
  return chunks;
}

// One-entry cache for the next section's opening chunk, synthesized while the
// current section's last chunk plays so section boundaries are gapless too.
// Keyed by voice|speed|text so a stale prefetch (voice change, skip) is a
// cache miss, never wrong audio.
let sectionPrefetch = null;

function genKey(text, voice, spd) {
  return voice + '|' + spd + '|' + text;
}

// Speech normalization happens per chunk (not whole-section) so chunk offsets
// keep pointing into the raw section text the segments were built from.
function sectionSpeechText(sec) {
  return normalizeForSpeech(sec.text);
}

function prefetchNextSection(idx) {
  const next = sections[idx + 1];
  if (!next || usingFallback || !ttsInstance) return;
  const first = chunkTextWithOffsets(next.text, MAX_CHUNK_LEN, FIRST_CHUNK_LEN)[0];
  if (!first) return;
  const spoken = normalizeForSpeech(first.text);
  const voice = getSelectedVoice();
  const key = genKey(spoken, voice, speed);
  if (sectionPrefetch && sectionPrefetch.key === key) return;
  const p = ttsInstance.generate(spoken, { voice, speed });
  p.catch(() => {});
  sectionPrefetch = { key, promise: p };
}

async function speakKokoro(sec, id, idx, onEnd) {
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  const voice = getSelectedVoice();
  const streamState = { abort: false };
  currentStream = streamState;

  const chunks = chunkTextWithOffsets(sec.text, MAX_CHUNK_LEN, FIRST_CHUNK_LEN);
  const gens = new Array(chunks.length).fill(null);

  // Pipelined synthesis: while chunk N plays, chunks N+1..N+PREFETCH_AHEAD
  // generate (serially inside the onnx session), so chunk boundaries are
  // gapless even when one chunk synthesizes slower than the previous one
  // plays. The .catch(noop) marks abandoned prefetches as handled when
  // playback is aborted mid-flight.
  const startGen = (i) => {
    if (gens[i]) return gens[i];
    const spoken = normalizeForSpeech(chunks[i].text);
    const key = genKey(spoken, voice, speed);
    if (sectionPrefetch && sectionPrefetch.key === key) {
      gens[i] = sectionPrefetch.promise;
      sectionPrefetch = null;
      return gens[i];
    }
    gens[i] = ttsInstance.generate(spoken, { voice, speed });
    gens[i].catch(() => {});
    return gens[i];
  };

  try {
    for (let ci = 0; ci < chunks.length; ci++) {
      if (streamState.abort || id !== skipId) return;

      for (let k = ci; k < Math.min(ci + 1 + PREFETCH_AHEAD, chunks.length); k++) startGen(k);

      const rawAudio = await gens[ci];
      if (streamState.abort || id !== skipId) return;

      if (ci === chunks.length - 1) prefetchNextSection(idx);

      const samples = rawAudio.audio;
      if (!samples || samples.length === 0) continue;

      const sampleRate = rawAudio.sampling_rate || 24000;
      const buf = audioCtx.createBuffer(1, samples.length, sampleRate);
      buf.getChannelData(0).set(samples);

      await new Promise((resolve) => {
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(audioCtx.destination);
        src.onended = resolve;
        // Highlight when audio starts, not when synthesis starts.
        highlightChunk(sec, chunks[ci]);
        src.start();
        currentSource = src;
      });

      if (streamState.abort || id !== skipId) return;
    }
    onEnd();
  } catch (err) {
    if (!streamState.abort) {
      console.warn('Kokoro generate error:', err);
      onEnd();
    }
  }
}

function speakSection(idx) {
  if (idx < 0 || idx >= sections.length) { stop(); return; }
  stopCurrentAudio();
  currentIdx = idx;
  const id = ++skipId;
  const sec = sections[idx];
  // Kokoro path: no section-start scroll — chunk 0 contains the heading, so
  // its center-scroll lands at the section top without a double scroll. The
  // fallback stays section-level, so it keeps the section-start scroll.
  highlight(sec.el, usingFallback);
  updateStatus();

  const onEnd = () => {
    if (id === skipId && !paused && active) speakSection(currentIdx + 1);
  };

  if (usingFallback) {
    fallback.speak(sectionSpeechText(sec), onEnd);
  } else {
    speakKokoro(sec, id, idx, onEnd);
  }
}

async function play() {
  if (!audioCtx) audioCtx = new AudioContext();

  gatherSections();
  if (!sections.length) return;

  if (!ttsInstance && !usingFallback) {
    updateButtonLabel('Loading voice model...');
    showBar();
    const statusEl = bar?.querySelector('.tts-status');
    if (statusEl) statusEl.textContent = 'Downloading voice model...';

    await ensureTTS((pct) => {
      if (statusEl) statusEl.textContent = `Loading voice model... ${pct}%`;
      updateButtonLabel(`Loading... ${pct}%`);
    });
    updateButtonLabel('Brief Me');
  }

  active = true;
  paused = false;
  if (currentIdx < 0) currentIdx = 0;
  showBar();
  speakSection(currentIdx);
}

function togglePause() {
  if (!active) { play(); return; }
  if (paused) {
    paused = false;
    if (usingFallback) {
      fallback.resume();
    } else if (audioCtx?.state === 'suspended') {
      audioCtx.resume();
    }
    updateStatus();
  } else {
    paused = true;
    if (usingFallback) {
      fallback.pause();
    } else if (audioCtx) {
      audioCtx.suspend();
    }
    updateStatus();
  }
}

function stop() {
  stopCurrentAudio();
  sectionPrefetch = null;
  active = false;
  paused = false;
  currentIdx = -1;
  skipId = 0;
  highlight(null);
  hideBar();
}

function skipForward() {
  if (!active) return;
  paused = false;
  if (audioCtx?.state === 'suspended') audioCtx.resume();
  speakSection(currentIdx + 1);
}

function skipBack() {
  if (!active) return;
  paused = false;
  if (audioCtx?.state === 'suspended') audioCtx.resume();
  speakSection(Math.max(0, currentIdx - 1));
}

function setSpeed(s) {
  speed = s;
  localStorage.setItem(LS_SPEED_KEY, String(s));
  if (active && !paused) speakSection(currentIdx);
}

function setVoice(v) {
  localStorage.setItem(LS_VOICE_KEY, v);
  if (active && !paused && !usingFallback) speakSection(currentIdx);
}

// --- UI ---

function createBar() {
  const el = document.createElement('div');
  el.className = 'tts-bar';

  const savedVoice = getSelectedVoice();
  const voiceOpts = VOICES.map(v =>
    `<option value="${v.id}"${v.id === savedVoice ? ' selected' : ''}>${v.label}</option>`
  ).join('');

  const speedOpts = [0.8, 1, 1.25, 1.5, 2].map(s =>
    `<option value="${s}"${s === speed ? ' selected' : ''}>${s}x</option>`
  ).join('');

  el.innerHTML = `
    <button class="tts-btn" data-action="back" title="Previous section" aria-label="Previous section">&#9664;&#9664;</button>
    <button class="tts-btn" data-action="toggle" title="Play / Pause" aria-label="Play or Pause">&#9208;</button>
    <button class="tts-btn" data-action="stop" title="Stop" aria-label="Stop">&#9632;</button>
    <button class="tts-btn" data-action="forward" title="Next section" aria-label="Next section">&#9654;&#9654;</button>
    <span class="tts-status"></span>
    <select class="tts-voice" title="Voice" aria-label="Voice">${voiceOpts}</select>
    <select class="tts-speed" title="Playback speed" aria-label="Playback speed">${speedOpts}</select>
  `;

  el.querySelectorAll('.tts-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'toggle') togglePause();
      else if (action === 'stop') stop();
      else if (action === 'forward') skipForward();
      else if (action === 'back') skipBack();
    });
  });
  el.querySelector('.tts-speed').addEventListener('change', (e) => {
    setSpeed(parseFloat(e.target.value));
  });
  el.querySelector('.tts-voice').addEventListener('change', (e) => {
    setVoice(e.target.value);
  });
  return el;
}

function showBar() {
  if (bar) { bar.style.display = 'flex'; return; }
  bar = createBar();
  document.body.appendChild(bar);
}

function hideBar() {
  if (bar) bar.style.display = 'none';
}

function injectButton() {
  const btn = document.createElement('button');
  btn.className = 'tts-brief-btn';
  btn.textContent = 'Brief Me';
  btn.title = 'Read this page aloud section by section';
  btn.setAttribute('aria-label', 'Brief Me — read this page aloud');
  btn.addEventListener('click', () => {
    if (active) { stop(); return; }
    play();
  });
  briefBtn = btn;

  const header = document.querySelector('header');
  if (header) { header.appendChild(btn); return; }
  const anchor = document.querySelector('.status') || document.querySelector('.lead') || document.querySelector('h1');
  if (anchor && anchor.parentNode) { anchor.parentNode.insertBefore(btn, anchor.nextSibling); return; }
  const main = document.querySelector('main');
  if (main) { main.insertBefore(btn, main.querySelector('nav, section')); }
}

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .tts-brief-btn {
      display: inline-flex; align-items: center; gap: 6px;
      min-height: 44px; padding: 10px 20px; border-radius: 6px;
      border: 1px solid var(--accent, #58a6ff); background: transparent;
      color: var(--accent, #58a6ff); font-size: 0.95rem; font-weight: 600;
      cursor: pointer; margin: 12px 0; transition: background 0.15s, color 0.15s;
    }
    .tts-brief-btn:hover { background: var(--accent, #58a6ff); color: #fff; }

    .tts-bar {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
      display: flex; align-items: center; gap: 8px;
      padding: 10px 16px; background: #161b22; border-top: 1px solid var(--border, #30363d);
      box-shadow: 0 -2px 12px rgba(0,0,0,0.4); flex-wrap: wrap;
    }
    .tts-btn {
      min-height: 44px; min-width: 44px; padding: 8px 12px;
      border: 1px solid var(--border, #30363d); border-radius: 6px;
      background: var(--bg, #0d1117); color: var(--text, #c9d1d9);
      cursor: pointer; font-size: 1rem;
    }
    .tts-btn:hover { border-color: var(--accent, #58a6ff); }
    .tts-status {
      flex: 1; min-width: 120px; color: var(--text-muted, #8b949e);
      font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .tts-voice, .tts-speed {
      min-height: 44px; padding: 8px 12px; border: 1px solid var(--border, #30363d);
      border-radius: 6px; background: var(--bg, #0d1117); color: var(--text, #c9d1d9);
      font-size: 0.85rem; cursor: pointer;
    }
    .tts-active-section {
      outline: 1px solid rgba(88,166,255,0.45); outline-offset: 4px;
      transition: outline-color 0.3s;
    }
    /* background (not box-shadow) so tr highlighting renders reliably */
    .tts-active-chunk {
      background: rgba(88,166,255,0.14); border-radius: 4px;
      transition: background 0.25s ease;
    }
    @media (prefers-reduced-motion: reduce) {
      .tts-active-chunk { transition: none; }
    }
    @media (max-width: 560px) {
      .tts-bar { gap: 4px; padding: 8px; }
      .tts-status { min-width: 80px; font-size: 0.8rem; }
    }
  `;
  document.head.appendChild(style);
}

function init() {
  injectStyles();
  injectButton();
  warmStart();
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === ' ' && active) { e.preventDefault(); togglePause(); }
    else if (e.key === 'Escape' && active) { stop(); }
    else if (e.key === 'ArrowRight' && active) { skipForward(); }
    else if (e.key === 'ArrowLeft' && active) { skipBack(); }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
