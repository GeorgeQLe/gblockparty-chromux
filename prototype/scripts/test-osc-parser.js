// Plain-node unit test for renderer/signals.js — the Chromux OSC v1 parser.
'use strict';

const { extractChromuxSignals, MARKER } = require('../renderer/signals.js');

let failures = 0;
function expect(cond, msg) {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', msg);
  }
}

// Feed a list of chunks through the parser the way onPtyData would, carrying
// the hold-back buffer between calls.
function feed(chunks) {
  let buf = '';
  let clean = '';
  const signals = [];
  for (const chunk of chunks) {
    const r = extractChromuxSignals(buf, chunk);
    buf = r.buf;
    clean += r.clean;
    signals.push(...r.signals);
  }
  return { buf, clean, signals };
}

const osc = (body, terminator = '\x07') => `${MARKER}${body}${terminator}`;
const b64url = (s) => Buffer.from(s, 'utf8').toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ── whole-chunk parse, BEL terminator ──────────────────────────────────────
{
  const r = feed([`hello ${osc('v1;turn-end;s3')}world`]);
  expect(r.clean === 'hello world', `BEL: clean text, got ${JSON.stringify(r.clean)}`);
  expect(r.signals.length === 1, 'BEL: one signal');
  expect(r.signals[0].event === 'turn-end' && r.signals[0].sessionId === 's3', 'BEL: event + id extracted');
  expect(r.signals[0].detail === null, 'BEL: no detail → null');
  expect(r.buf === '', 'BEL: nothing held back');
}

// ── ST terminator ──────────────────────────────────────────────────────────
{
  const r = feed([`a${osc('v1;input-needed;s1', '\x1b\\')}b`]);
  expect(r.clean === 'ab', 'ST: clean text');
  expect(r.signals.length === 1 && r.signals[0].event === 'input-needed', 'ST: signal parsed');
}

// ── detail b64url decoding ─────────────────────────────────────────────────
{
  const r = feed([osc(`v1;input-needed;s9;${b64url('permission: run tests?')}`)]);
  expect(r.signals[0].detail === 'permission: run tests?', 'detail decodes from b64url');
}

// ── split at every byte boundary ───────────────────────────────────────────
{
  const whole = `before ${osc('v1;turn-start;s7')} after`;
  for (let cut = 0; cut <= whole.length; cut += 1) {
    const r = feed([whole.slice(0, cut), whole.slice(cut)]);
    if (r.clean !== 'before  after' || r.signals.length !== 1
      || r.signals[0].event !== 'turn-start' || r.signals[0].sessionId !== 's7' || r.buf !== '') {
      expect(false, `split at ${cut}: clean=${JSON.stringify(r.clean)} signals=${r.signals.length}`);
      break;
    }
  }
}

// ── split at every boundary, ST terminator (trailing lone ESC case) ────────
{
  const whole = `x${osc('v1;turn-end;s2', '\x1b\\')}y`;
  for (let cut = 0; cut <= whole.length; cut += 1) {
    const r = feed([whole.slice(0, cut), whole.slice(cut)]);
    if (r.clean !== 'xy' || r.signals.length !== 1 || r.signals[0].event !== 'turn-end') {
      expect(false, `ST split at ${cut}: clean=${JSON.stringify(r.clean)} signals=${r.signals.length}`);
      break;
    }
  }
}

// ── interleaving: two signals with text between, one chunk ─────────────────
{
  const r = feed([`A${osc('v1;turn-start;s1')}B${osc('v1;turn-end;s1')}C`]);
  expect(r.clean === 'ABC', 'interleave: clean');
  expect(r.signals.map((s) => s.event).join(',') === 'turn-start,turn-end', 'interleave: both signals in order');
}

// ── non-chromux OSC passes through untouched ───────────────────────────────
{
  const title = '\x1b]0;my window title\x07';
  const hyperlink = '\x1b]8;;http://example.com\x1b\\link\x1b]8;;\x1b\\';
  const r = feed([`${title}text${hyperlink}`]);
  expect(r.clean === `${title}text${hyperlink}`, 'non-chromux OSC passthrough');
  expect(r.signals.length === 0, 'non-chromux OSC produces no signals');
}

// ── partial non-chromux OSC split across chunks flushes next chunk ─────────
{
  const r = feed(['tail\x1b]', '0;title\x07done']);
  expect(r.clean === 'tail\x1b]0;title\x07done', 'held marker prefix flushes once disambiguated');
  expect(r.buf === '', 'no residual buffer');
}

// ── unterminated chromux sequence is held back, then completes ─────────────
{
  const first = extractChromuxSignals('', `out${MARKER}v1;turn-end`);
  expect(first.clean === 'out', 'unterminated: clean text only');
  expect(first.buf === `${MARKER}v1;turn-end`, 'unterminated: sequence held back');
  const second = extractChromuxSignals(first.buf, ';s5\x07more');
  expect(second.signals.length === 1 && second.signals[0].sessionId === 's5', 'unterminated: completes next chunk');
  expect(second.clean === 'more', 'unterminated: trailing text flows');
}

// ── overlong unterminated sequence flushes raw (never swallow output) ──────
{
  const junk = MARKER + 'v1;turn-end;' + 'x'.repeat(600);
  const r = feed([junk]);
  expect(r.clean === junk, 'overlong unterminated flushes raw');
  expect(r.buf === '' && r.signals.length === 0, 'overlong: no buffer, no signal');
}

// ── overlong terminated sequence flushes raw too ───────────────────────────
{
  const seq = osc('v1;turn-end;' + 'x'.repeat(600));
  const r = feed([`a${seq}b`]);
  expect(r.clean === `a${seq}b`, 'overlong terminated flushes raw');
  expect(r.signals.length === 0, 'overlong terminated: no signal');
}

// ── malformed bodies surface as malformed (renderer logs signal-rejected) ──
{
  const r = feed([
    osc('v2;turn-end;s1'), // wrong version
    osc('v1;party-time;s1'), // unknown event
    osc('v1;turn-end;'), // empty id
    osc('v1;turn-end;bad id!'), // invalid id chars
    osc('v1'), // too few fields
  ]);
  expect(r.signals.length === 5 && r.signals.every((s) => s.malformed), 'malformed bodies flagged');
  expect(r.clean === '', 'malformed chromux sequences are dropped from output');
}

// ── id extraction is exact (spoofed/foreign ids surface for rejection) ─────
{
  const r = feed([osc('v1;turn-end;other-session')]);
  expect(r.signals[0].sessionId === 'other-session', 'foreign id extracted verbatim for caller to reject');
}

if (failures > 0) {
  console.error(`OSC_PARSER_FAIL (${failures})`);
  process.exit(1);
}
console.log('OSC_PARSER_OK');
