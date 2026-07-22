'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = 1;
const MAX_DRAFT_BYTES = 64 * 1024;
const MAX_ENTRIES_PER_PROJECT = 100;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PROJECTS = 2048;
const MAX_CWD_LENGTH = 4096;
const MAX_SESSION_NAME_LENGTH = 80;
const AGENTS = new Set(['claude', 'codex', 'grok', 'shell']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function validDate(value) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time) || time < Date.UTC(2000, 0, 1) || time > Date.now() + (24 * 60 * 60 * 1000)) return null;
  return date.toISOString();
}

function canonicalCwd(cwd) {
  if (typeof cwd !== 'string' || !cwd || cwd.length > MAX_CWD_LENGTH || cwd.includes('\0') || !path.isAbsolute(cwd)) return null;
  try {
    const resolved = fs.realpathSync(cwd);
    return fs.statSync(resolved).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

function normalizeEntry(candidate) {
  if (!isPlainObject(candidate)) return null;
  const text = typeof candidate.text === 'string' ? candidate.text : '';
  if (!text.trim() || byteLength(text) > MAX_DRAFT_BYTES) return null;
  const submittedAt = validDate(candidate.submittedAt);
  if (!submittedAt) return null;
  const agent = AGENTS.has(candidate.agent) ? candidate.agent : null;
  if (!agent) return null;
  const sessionName = typeof candidate.sessionName === 'string'
    ? candidate.sessionName.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_SESSION_NAME_LENGTH)
    : '';
  if (!sessionName) return null;
  const id = typeof candidate.id === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(candidate.id)
    ? candidate.id
    : null;
  if (!id) return null;
  return { id, text, submittedAt, agent, sessionName };
}

function normalizeProject(candidate) {
  if (!isPlainObject(candidate)) return null;
  const cwd = canonicalCwd(candidate.cwd);
  const updatedAt = validDate(candidate.updatedAt);
  if (!cwd || !updatedAt || !Array.isArray(candidate.entries) || candidate.entries.length > MAX_ENTRIES_PER_PROJECT * 2) return null;
  const seenText = new Set();
  const seenIds = new Set();
  const entries = [];
  for (const raw of candidate.entries) {
    const entry = normalizeEntry(raw);
    if (!entry || seenText.has(entry.text) || seenIds.has(entry.id)) continue;
    seenText.add(entry.text);
    seenIds.add(entry.id);
    entries.push(entry);
    if (entries.length >= MAX_ENTRIES_PER_PROJECT) break;
  }
  entries.sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
  return { cwd, updatedAt, entries };
}

function emptyPayload() {
  return { schemaVersion: SCHEMA_VERSION, projects: [] };
}

function serialize(payload) {
  return JSON.stringify(payload, null, 2) + '\n';
}

function normalizePayload(candidate) {
  if (!isPlainObject(candidate) || candidate.schemaVersion !== SCHEMA_VERSION || !Array.isArray(candidate.projects) || candidate.projects.length > MAX_PROJECTS) {
    return emptyPayload();
  }
  const projectsByCwd = new Map();
  for (const raw of candidate.projects) {
    const project = normalizeProject(raw);
    if (!project) continue;
    const prior = projectsByCwd.get(project.cwd);
    if (!prior || Date.parse(project.updatedAt) > Date.parse(prior.updatedAt)) projectsByCwd.set(project.cwd, project);
  }
  return { schemaVersion: SCHEMA_VERSION, projects: [...projectsByCwd.values()] };
}

function fitPayload(payload) {
  const next = normalizePayload(payload);
  while (byteLength(serialize(next)) > MAX_FILE_BYTES) {
    let oldestProject = null;
    let oldestIndex = -1;
    let oldestTime = Infinity;
    for (const project of next.projects) {
      for (let index = 0; index < project.entries.length; index += 1) {
        const time = Date.parse(project.entries[index].submittedAt);
        if (time < oldestTime) {
          oldestTime = time;
          oldestProject = project;
          oldestIndex = index;
        }
      }
    }
    if (!oldestProject || oldestIndex < 0) break;
    oldestProject.entries.splice(oldestIndex, 1);
    if (oldestProject.entries.length === 0) next.projects = next.projects.filter((project) => project !== oldestProject);
  }
  return next;
}

function createPromptHistoryStore({ filePath }) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('prompt history requires an absolute storage location');

  function readPayload() {
    try {
      if (fs.statSync(filePath).size > MAX_FILE_BYTES) return emptyPayload();
      return normalizePayload(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch {
      return emptyPayload();
    }
  }

  function writePayload(payload) {
    const fitted = fitPayload(payload);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = path.join(path.dirname(filePath), `.prompt-history-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`);
    try {
      fs.writeFileSync(temporary, serialize(fitted), { mode: 0o600 });
      fs.renameSync(temporary, filePath);
      try { fs.chmodSync(filePath, 0o600); } catch { /* best effort */ }
    } finally {
      try { fs.unlinkSync(temporary); } catch { /* renamed or absent */ }
    }
    return fitted;
  }

  function readProject(cwd) {
    const canonical = canonicalCwd(cwd);
    if (!canonical) return [];
    const project = readPayload().projects.find((item) => item.cwd === canonical);
    return project ? project.entries.map((entry) => ({ ...entry })) : [];
  }

  function append(cwd, input) {
    const canonical = canonicalCwd(cwd);
    if (!canonical || !isPlainObject(input)) throw new Error('prompt history append rejected invalid metadata');
    const submittedAt = validDate(input.submittedAt || new Date().toISOString());
    const candidate = normalizeEntry({
      id: crypto.randomUUID(),
      text: input.text,
      submittedAt,
      agent: input.agent || 'shell',
      sessionName: input.sessionName,
    });
    if (!candidate) throw new Error('prompt history append rejected invalid entry');
    const payload = readPayload();
    let project = payload.projects.find((item) => item.cwd === canonical);
    if (!project) {
      project = { cwd: canonical, updatedAt: submittedAt, entries: [] };
      payload.projects.push(project);
    }
    project.entries = [candidate, ...project.entries.filter((entry) => entry.text !== candidate.text)]
      .slice(0, MAX_ENTRIES_PER_PROJECT);
    project.updatedAt = submittedAt;
    return writePayload(payload).projects.find((item) => item.cwd === canonical)?.entries || [];
  }

  function remove(cwd, id) {
    const canonical = canonicalCwd(cwd);
    if (!canonical || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(id)) throw new Error('prompt history delete rejected invalid metadata');
    const payload = readPayload();
    const project = payload.projects.find((item) => item.cwd === canonical);
    if (!project) return [];
    project.entries = project.entries.filter((entry) => entry.id !== id);
    project.updatedAt = new Date().toISOString();
    if (project.entries.length === 0) payload.projects = payload.projects.filter((item) => item !== project);
    writePayload(payload);
    return readProject(canonical);
  }

  function clear(cwd) {
    const canonical = canonicalCwd(cwd);
    if (!canonical) throw new Error('prompt history clear rejected invalid project');
    const payload = readPayload();
    payload.projects = payload.projects.filter((item) => item.cwd !== canonical);
    writePayload(payload);
    return [];
  }

  return { readPayload, readProject, append, remove, clear };
}

module.exports = {
  MAX_DRAFT_BYTES,
  MAX_ENTRIES_PER_PROJECT,
  MAX_FILE_BYTES,
  SCHEMA_VERSION,
  canonicalCwd,
  createPromptHistoryStore,
  normalizeEntry,
  normalizePayload,
};
