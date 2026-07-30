'use strict';

const VARIANTS = Object.freeze([
  { id: 'current', name: 'Current Hybrid Control', source: 'Chromux', hypothesis: 'Priority partitions accelerate triage but increase spatial churn.' },
  { id: 'cursor', name: 'Unified Agent Fleet', source: 'Cursor', hypothesis: 'One searchable recency list keeps every agent visible.' },
  { id: 'linear', name: 'Triage Lens', source: 'Linear', hypothesis: 'Stable project navigation plus a triage lens separates place from urgency.' },
  { id: 't3', name: 'Lifecycle Shelves', source: 'T3 Code', hypothesis: 'Rich active cards and compact settled shelves match lifecycle density.' },
  { id: 'codex', name: 'Project Threads', source: 'Codex', hypothesis: 'Pins, project groups, worktrees, and history reinforce task identity.' },
  { id: 'claude', name: 'Parallel Sessions', source: 'Claude Code Desktop', hypothesis: 'Filters and explicit split-open reduce cross-project switching cost.' },
  { id: 'zed', name: 'Thread Navigator', source: 'Zed', hypothesis: 'Stable project sections and separate history preserve spatial memory.' },
  { id: 'agmux', name: 'Mission Control', source: 'agmux', hypothesis: 'Stable navigation with a separate attention dashboard improves reorientation.' },
  { id: 'vibe', name: 'Task Board', source: 'Vibe Kanban', hypothesis: 'Lifecycle lanes make work and review state directly comparable.' },
  { id: 'focus', name: 'Focus Split', source: 'Synthesis', hypothesis: 'Persistent navigation plus two contextual sessions balances memory and focus.' },
]);

const statusLabel = (status) => ({
  approval: 'Action required',
  ready: 'Ready to finish',
  working: 'Working',
  idle: 'Idle',
  snoozed: 'Snoozed',
  completed: 'Settled',
}[status] || status);

function groupBy(items, keyFor, labelFor = (key) => key) {
  const groups = [];
  for (const item of items) {
    const key = keyFor(item);
    let group = groups.find((row) => row.key === key);
    if (!group) {
      group = { key, label: labelFor(key), sessions: [] };
      groups.push(group);
    }
    group.sessions.push(item);
  }
  return groups;
}

function projectGroups(sessions, projects) {
  return projects.map((project) => ({
    key: project.id,
    label: project.name,
    sessions: sessions.filter((session) => session.projectId === project.id),
  })).filter((group) => group.sessions.length);
}

function buildLayout(variantId, fixture, options = {}) {
  const projects = fixture.projects;
  let sessions = fixture.sessions.filter((session) => options.includeHistory || !session.history);
  const query = String(options.query || '').trim().toLowerCase();
  if (query) {
    sessions = sessions.filter((session) => [
      session.title, session.agent, session.status, session.branch,
      projects.find((row) => row.id === session.projectId)?.name,
    ].some((value) => String(value || '').toLowerCase().includes(query)));
  }
  if (options.status && options.status !== 'all') {
    sessions = sessions.filter((session) => session.status === options.status);
  }
  if (options.project && options.project !== 'all') {
    sessions = sessions.filter((session) => session.projectId === options.project);
  }

  const live = sessions.filter((session) => !session.history);
  const history = sessions.filter((session) => session.history);
  const byRecent = [...live].sort((a, b) => a.activityMinutes - b.activityMinutes);
  let groups;
  let secondary = [];
  if (variantId === 'current') {
    groups = ['approval', 'ready', 'working'].map((status) => ({
      key: status, label: statusLabel(status), sessions: byRecent.filter((row) => row.status === status),
    })).concat(projectGroups(
      byRecent.filter((row) => !['approval', 'ready', 'working'].includes(row.status)), projects,
    )).filter((group) => group.sessions.length);
  } else if (variantId === 'cursor') {
    groups = [{ key: 'fleet', label: 'All agents · recent', sessions: byRecent }];
  } else if (variantId === 't3') {
    groups = [
      { key: 'active', label: 'Active', sessions: byRecent.filter((row) => !['snoozed', 'completed'].includes(row.status)) },
      { key: 'snoozed', label: 'Snoozed', sessions: byRecent.filter((row) => row.status === 'snoozed'), compact: true },
      { key: 'settled', label: 'Settled', sessions: byRecent.filter((row) => row.status === 'completed'), compact: true },
    ].filter((group) => group.sessions.length);
  } else if (variantId === 'vibe') {
    groups = groupBy(byRecent, (session) => session.status, statusLabel);
  } else {
    const pinned = live.filter((session) => session.pinned);
    const ordinary = live.filter((session) => !session.pinned);
    groups = [
      ...(variantId === 'codex' && pinned.length ? [{ key: 'pinned', label: 'Pinned threads', sessions: pinned }] : []),
      ...projectGroups(variantId === 'codex' ? ordinary : live, projects),
    ];
    if (variantId === 'linear') {
      secondary = byRecent.filter((row) => ['approval', 'ready'].includes(row.status)).slice(0, 4);
    }
    if (variantId === 'claude') secondary = byRecent.slice(0, 2);
    if (variantId === 'agmux') {
      secondary = byRecent.filter((row) => ['approval', 'ready', 'working'].includes(row.status)).slice(0, 6);
    }
    if (variantId === 'focus') {
      secondary = byRecent.filter((row) => ['approval', 'ready', 'working'].includes(row.status)).slice(0, 2);
    }
  }
  if (history.length) groups.push({ key: 'history', label: 'Searchable history', sessions: history, history: true });
  return { groups: groups.filter((group) => group.sessions.length), secondary };
}

module.exports = { VARIANTS, buildLayout, statusLabel };
