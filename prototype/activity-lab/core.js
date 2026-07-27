'use strict';

const MAX_OUTPUT_BYTES = 256 * 1024;
const VALID_STATES = new Set(['idle', 'launching', 'working', 'completed', 'failed', 'cancelled']);
const productionSignals = require('../renderer/signals');

function boundedAppend(current, chunk, limit = MAX_OUTPUT_BYTES) {
  const combined = Buffer.concat([Buffer.from(current || ''), Buffer.from(chunk || '')]);
  return combined.subarray(Math.max(0, combined.length - limit)).toString('utf8');
}

function parseJsonLines(buffer, chunk) {
  const input = `${buffer || ''}${chunk || ''}`;
  const lines = input.split(/\r?\n/);
  const remainder = lines.pop() || '';
  return {
    remainder,
    records: lines.map((line) => {
      if (!line.trim()) return null;
      try { return { ok: true, rawType: 'jsonl', event: JSON.parse(line) }; }
      catch { return { ok: false, rawType: 'malformed-jsonl', detail: 'Malformed structured event' }; }
    }).filter(Boolean),
  };
}

function structuredTransition(record) {
  if (!record || !record.ok || !record.event || typeof record.event.type !== 'string') {
    return { state: null, source: 'structured:unknown', confidence: 'none' };
  }
  const type = record.event.type;
  if (type === 'turn.started') return { state: 'working', source: 'structured:turn.started', confidence: 'ground-truth' };
  if (type === 'turn.completed') return { state: 'completed', source: 'structured:turn.completed', confidence: 'ground-truth' };
  if (type === 'turn.failed' || type === 'error') return { state: 'failed', source: `structured:${type}`, confidence: 'ground-truth' };
  return { state: null, source: `structured:${type}`, confidence: 'observed' };
}

function extractTerminalTitles(buffer, chunk) {
  const parsed = productionSignals.extractTerminalTitles(buffer, chunk);
  return { titles: parsed.titles.map((row) => row.title), remainder: parsed.buf };
}

function normalizeState(state) {
  return VALID_STATES.has(state) ? state : null;
}

function traceRecord({ runId, lane, rawType, state, source, confidence, processStatus, detail, at = Date.now() }) {
  return {
    at,
    runId,
    lane,
    rawType: String(rawType || 'unknown').slice(0, 80),
    state: normalizeState(state),
    source: String(source || 'unknown').slice(0, 120),
    confidence: String(confidence || 'none').slice(0, 40),
    processStatus: String(processStatus || 'unknown').slice(0, 40),
    ...(detail ? { detail: String(detail).slice(0, 240) } : {}),
  };
}

function intervals(trace, lane) {
  const rows = trace.filter((row) => row.lane === lane && row.state);
  const result = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    result.push({ state: row.state, start: row.at, end: rows[index + 1]?.at || row.at });
  }
  return result;
}

function workingWindows(trace, lane) {
  return intervals(trace, lane).filter((row) => row.state === 'working');
}

function overlapMs(left, right) {
  return Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start));
}

function compareLanes(trace) {
  const pty = workingWindows(trace, 'interactive');
  const reference = workingWindows(trace, 'reference');
  const sum = (items) => items.reduce((total, row) => total + Math.max(0, row.end - row.start), 0);
  const overlap = pty.reduce((total, a) => total + reference.reduce((inner, b) => inner + overlapMs(a, b), 0), 0);
  const ptyStart = pty[0]?.start || null;
  const refStart = reference[0]?.start || null;
  const ptyEnd = pty.at(-1)?.end || null;
  const refEnd = reference.at(-1)?.end || null;
  const exited = trace.filter((row) => row.rawType === 'process-exit');
  const staleSpinner = exited.some((exit) => trace.some((row) => (
    row.lane === exit.lane && row.state === 'working' && row.at >= exit.at
  )));
  return {
    falseWorkingMs: Math.max(0, sum(pty) - overlap),
    missedWorkingMs: Math.max(0, sum(reference) - overlap),
    lateStartMs: ptyStart && refStart ? Math.max(0, ptyStart - refStart) : null,
    lateCompletionMs: ptyEnd && refEnd ? Math.max(0, ptyEnd - refEnd) : null,
    crossSessionSignalLeakage: false,
    staleSpinnerAfterExitOrCancellation: staleSpinner,
  };
}

function sanitizeReport(report) {
  const cleanTrace = (report.trace || []).map(({ detail, ...row }) => row);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    chromuxVersion: report.chromuxVersion || 'unknown',
    codexVersion: report.codexVersion || 'unknown',
    safety: {
      temporaryWorkspaces: true,
      sandbox: 'read-only',
      approvals: 'never',
      userConfigIgnoredByReference: true,
      responseTextExcluded: true,
    },
    scenarios: (report.scenarios || []).map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      turns: scenario.turns,
      startedAt: scenario.startedAt,
      endedAt: scenario.endedAt,
      outcome: scenario.outcome,
      mismatches: scenario.mismatches || {},
    })),
    trace: cleanTrace,
  };
}

module.exports = {
  MAX_OUTPUT_BYTES,
  boundedAppend,
  compareLanes,
  extractTerminalTitles,
  normalizeState,
  parseJsonLines,
  sanitizeReport,
  structuredTransition,
  traceRecord,
};
