// Chromux — deterministic agent-attention signals (wire protocol v1).
// Extracts Chromux OSC sequences from PTY output:
//   ESC ] 777 ; chromux ; v1 ; <event> ; <session-id> [ ; <detail-b64url> ] BEL
// (ST — ESC \ — is accepted as an alternate terminator.)
//
// Chunk-boundary safe: a trailing fragment that could still become a Chromux
// sequence (a prefix of the marker, or an unterminated sequence) is held back
// in `buf` and re-fed with the next chunk. Non-chromux OSC passes through
// untouched. Sequences longer than MAX_SEQ_BYTES flush raw — the parser must
// never swallow terminal output.
'use strict';

(function attachChromuxSignals(global) {
  const MARKER = '\x1b]777;chromux;';
  const MAX_SEQ_BYTES = 512;
  const OSC = '\x1b]';
  const TITLE_CODES = new Set(['0', '1', '2']);
  const MAX_TITLE_SEQ_BYTES = 2048;
  const MAX_TITLE_CHARS = 160;
  const EVENTS = new Set(['turn-start', 'input-needed', 'turn-end']);
  const ID_RE = /^[A-Za-z0-9_-]+$/;

  function decodeDetail(b64url) {
    try {
      const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 === 0 ? b64 : b64 + '='.repeat(4 - (b64.length % 4));
      const bin = typeof atob === 'function'
        ? atob(pad)
        : Buffer.from(pad, 'base64').toString('binary');
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return null;
    }
  }

  function parseBody(body) {
    const parts = body.split(';');
    if (parts.length < 3 || parts.length > 4) return { malformed: true, body };
    const [version, event, sessionId, detail] = parts;
    if (version !== 'v1' || !EVENTS.has(event) || !ID_RE.test(sessionId || '')) {
      return { malformed: true, body };
    }
    return { event, sessionId, detail: detail ? decodeDetail(detail) : null };
  }

  // Index where the longest suffix of `data` (at/after `from`) that is a
  // proper prefix of MARKER starts; data.length when there is none.
  function markerPrefixStart(data, from) {
    const maxLen = Math.min(MARKER.length - 1, data.length - from);
    for (let k = maxLen; k > 0; k -= 1) {
      if (data.endsWith(MARKER.slice(0, k))) return data.length - k;
    }
    return data.length;
  }

  // First BEL or ST at/after `from` → { end, next }; null while unterminated.
  // A trailing lone ESC is unterminated: the next chunk may complete an ST.
  function findTerminator(data, from) {
    for (let i = from; i < data.length; i += 1) {
      const ch = data[i];
      if (ch === '\x07') return { end: i, next: i + 1 };
      if (ch === '\x1b') {
        if (i + 1 >= data.length) return null;
        if (data[i + 1] === '\\') return { end: i, next: i + 2 };
      }
    }
    return null;
  }

  function oscPrefixStart(data, from) {
    if (data.length > from && data.endsWith(OSC)) return data.length - OSC.length;
    if (data.length > from && data.endsWith('\x1b')) return data.length - 1;
    return data.length;
  }

  function sanitizeTerminalTitle(raw) {
    const title = String(raw || '')
      .replace(/[\x00-\x1f\x7f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return title ? title.slice(0, MAX_TITLE_CHARS) : '';
  }

  function extractTerminalTitles(buf, chunk) {
    const data = (buf || '') + (chunk || '');
    const titles = [];
    let i = 0;
    for (;;) {
      const at = data.indexOf(OSC, i);
      if (at === -1) {
        const hold = Math.max(i, oscPrefixStart(data, i));
        return { buf: data.slice(hold), titles };
      }
      if (data.length - at < 4) {
        return { buf: data.slice(at), titles };
      }

      const code = data[at + 2];
      const sep = data[at + 3];
      if (!TITLE_CODES.has(code) || sep !== ';') {
        i = at + OSC.length;
        continue;
      }

      const term = findTerminator(data, at + 4);
      if (!term) {
        if (data.length - at > MAX_TITLE_SEQ_BYTES) {
          i = at + OSC.length;
          continue;
        }
        return { buf: data.slice(at), titles };
      }

      if (term.end - at <= MAX_TITLE_SEQ_BYTES) {
        const title = sanitizeTerminalTitle(data.slice(at + 4, term.end));
        if (title) titles.push({ code, title });
      }
      i = term.next;
    }
  }

  function extractChromuxSignals(buf, chunk) {
    const data = (buf || '') + (chunk || '');
    let clean = '';
    const signals = [];
    let i = 0;
    for (;;) {
      const at = data.indexOf(MARKER, i);
      if (at === -1) {
        const hold = Math.max(i, markerPrefixStart(data, i));
        clean += data.slice(i, hold);
        return { buf: data.slice(hold), clean, signals };
      }
      clean += data.slice(i, at);
      const term = findTerminator(data, at + MARKER.length);
      if (!term) {
        if (data.length - at > MAX_SEQ_BYTES) {
          clean += data.slice(at);
          return { buf: '', clean, signals };
        }
        return { buf: data.slice(at), clean, signals };
      }
      if (term.end - at > MAX_SEQ_BYTES) {
        clean += data.slice(at, term.next);
      } else {
        signals.push(parseBody(data.slice(at + MARKER.length, term.end)));
      }
      i = term.next;
    }
  }

  const api = { extractChromuxSignals, extractTerminalTitles, MARKER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.chromuxSignals = api;
})(typeof window !== 'undefined' ? window : globalThis);
