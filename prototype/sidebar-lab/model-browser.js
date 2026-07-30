'use strict';

(function expose() {
  const statusLabel = (status) => ({
    approval: 'Action required', ready: 'Ready to finish', working: 'Working',
    idle: 'Idle', snoozed: 'Snoozed', completed: 'Settled',
  }[status] || status);
  const groupBy = (items, keyFor, labelFor = (key) => key) => {
    const groups = [];
    items.forEach((item) => {
      const key = keyFor(item);
      let group = groups.find((row) => row.key === key);
      if (!group) { group = { key, label: labelFor(key), sessions: [] }; groups.push(group); }
      group.sessions.push(item);
    });
    return groups;
  };
  const projectGroups = (sessions, projects) => projects.map((project) => ({
    key: project.id, label: project.name,
    sessions: sessions.filter((session) => session.projectId === project.id),
  })).filter((group) => group.sessions.length);

  function buildLayout(variantId, fixture, options = {}) {
    const projects = fixture.projects;
    let sessions = fixture.sessions.filter((session) => options.includeHistory || !session.history);
    const query = String(options.query || '').trim().toLowerCase();
    if (query) sessions = sessions.filter((session) => [
      session.title, session.agent, session.status, session.branch,
      projects.find((row) => row.id === session.projectId)?.name,
    ].some((value) => String(value || '').toLowerCase().includes(query)));
    if (options.status && options.status !== 'all') sessions = sessions.filter((row) => row.status === options.status);
    if (options.project && options.project !== 'all') sessions = sessions.filter((row) => row.projectId === options.project);
    const live = sessions.filter((row) => !row.history);
    const history = sessions.filter((row) => row.history);
    const recent = [...live].sort((a, b) => a.activityMinutes - b.activityMinutes);
    let groups;
    let secondary = [];
    if (variantId === 'current') {
      groups = ['approval', 'ready', 'working'].map((status) => ({
        key: status, label: statusLabel(status), sessions: recent.filter((row) => row.status === status),
      })).concat(projectGroups(
        recent.filter((row) => !['approval', 'ready', 'working'].includes(row.status)), projects,
      )).filter((group) => group.sessions.length);
    } else if (variantId === 'cursor') {
      groups = [{ key: 'fleet', label: 'All agents · recent', sessions: recent }];
    } else if (variantId === 't3') {
      groups = [
        { key: 'active', label: 'Active', sessions: recent.filter((row) => !['snoozed', 'completed'].includes(row.status)) },
        { key: 'snoozed', label: 'Snoozed', sessions: recent.filter((row) => row.status === 'snoozed'), compact: true },
        { key: 'settled', label: 'Settled', sessions: recent.filter((row) => row.status === 'completed'), compact: true },
      ].filter((group) => group.sessions.length);
    } else if (variantId === 'vibe') {
      groups = groupBy(recent, (row) => row.status, statusLabel);
    } else {
      const pinned = live.filter((row) => row.pinned);
      const ordinary = live.filter((row) => !row.pinned);
      groups = [
        ...(variantId === 'codex' && pinned.length ? [{ key: 'pinned', label: 'Pinned threads', sessions: pinned }] : []),
        ...projectGroups(variantId === 'codex' ? ordinary : live, projects),
      ];
      if (variantId === 'linear') secondary = recent.filter((row) => ['approval', 'ready'].includes(row.status)).slice(0, 4);
      if (variantId === 'claude') secondary = recent.slice(0, 2);
      if (variantId === 'agmux') secondary = recent.filter((row) => ['approval', 'ready', 'working'].includes(row.status)).slice(0, 6);
      if (variantId === 'focus') secondary = recent.filter((row) => ['approval', 'ready', 'working'].includes(row.status)).slice(0, 2);
    }
    if (history.length) groups.push({ key: 'history', label: 'Searchable history', sessions: history, history: true });
    return { groups: groups.filter((group) => group.sessions.length), secondary };
  }

  const applyTransition = (fixture, transition) => {
    const next = structuredClone(fixture);
    const session = next.sessions.find((row) => row.id === transition.id);
    if (!session) throw new Error(`Unknown transition session: ${transition.id}`);
    Object.assign(session, Object.fromEntries(Object.entries(transition).filter(([key]) => key !== 'id')));
    return next;
  };
  const placementMap = (variantId, fixture, options) => new Map(buildLayout(variantId, fixture, options).groups.flatMap(
    (group, groupIndex) => group.sessions.map((session, rowIndex) => [session.id, `${groupIndex}:${rowIndex}`]),
  ));
  const countRelocations = (variantId, before, after, options) => {
    const left = placementMap(variantId, before, options);
    const right = placementMap(variantId, after, options);
    return [...left].filter(([id, placement]) => right.has(id) && right.get(id) !== placement).length;
  };
  const seededOrder = (seed, items) => {
    let value = [...String(seed)].reduce(
      (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0, 2166136261,
    );
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      const swap = value % (index + 1);
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  };
  window.sidebarLabModel = Object.freeze({ applyTransition, buildLayout, countRelocations, seededOrder });
}());
