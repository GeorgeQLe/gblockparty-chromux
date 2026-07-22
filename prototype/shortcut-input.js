'use strict';

const CHROMUX_SHORTCUT_FOCUS_KINDS = new Set([
  'terminal',
  'hostEditable',
  'guestEditable',
  'modal',
  'appSurface',
]);

const CHROMUX_SHORTCUT_ACTIONS = {
  SESSION_INDEX: 'session-index',
  QUEUE_FOCUS: 'queue-focus',
  BROWSER_TOGGLE: 'browser-toggle',
  GUARDED_QUIT: 'guarded-quit',
  NEW_SESSION: 'new-session',
  DETECT: 'detect',
  COMPOSER_OPEN: 'composer-open',
};

const ALLOWED_CHROMUX_SHORTCUT_FOCUS_KINDS = new Set(['terminal', 'appSurface']);

function modifierActive(input = {}, name) {
  const direct = Boolean(input[name]);
  const dom = Boolean(input[`${name}Key`]);
  const modifiers = Array.isArray(input.modifiers)
    ? input.modifiers.map((value) => String(value).toLowerCase())
    : [];
  if (name === 'meta') return direct || dom || modifiers.includes('meta') || modifiers.includes('command') || modifiers.includes('cmd');
  if (name === 'control') return direct || dom || modifiers.includes('control') || modifiers.includes('ctrl');
  if (name === 'alt') return direct || dom || modifiers.includes('alt') || modifiers.includes('option');
  if (name === 'shift') return direct || dom || modifiers.includes('shift');
  return direct || dom;
}

function sessionShortcutDigit(input = {}) {
  for (const candidate of [input.key, input.keyCode]) {
    const key = String(candidate || '').toLowerCase();
    if (/^[1-9]$/.test(key)) return key;
  }

  const code = String(input.code || '');
  const match = /^Digit([1-9])$/.exec(code);
  return match ? match[1] : null;
}

function shortcutLetter(input = {}) {
  for (const candidate of [input.key, input.keyCode]) {
    const key = String(candidate || '');
    if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  }

  const code = String(input.code || '');
  const match = /^Key([A-Z])$/.exec(code);
  return match ? match[1] : null;
}

function shortcutNamedKey(input = {}) {
  for (const candidate of [input.key, input.keyCode, input.code]) {
    const key = String(candidate || '').toLowerCase();
    if (key === 'enter' || key === 'numpadenter') return 'ENTER';
  }
  return null;
}

function shortcutInputType(input = {}) {
  if (!input.type) return 'keyDown';
  return String(input.type);
}

function normalizeShortcutChord(input = {}) {
  const digit = sessionShortcutDigit(input);
  return {
    type: shortcutInputType(input),
    key: digit || shortcutLetter(input) || shortcutNamedKey(input),
    meta: modifierActive(input, 'meta'),
    shift: modifierActive(input, 'shift'),
    alt: modifierActive(input, 'alt'),
    control: modifierActive(input, 'control'),
  };
}

function chromuxShortcutAction(input = {}) {
  const chord = normalizeShortcutChord(input);
  if (chord.type !== 'keyDown') return null;
  if (!chord.meta || chord.alt || chord.control || !chord.key) return null;

  if (/^[1-9]$/.test(chord.key) && !chord.shift) {
    return {
      id: CHROMUX_SHORTCUT_ACTIONS.SESSION_INDEX,
      index: Number(chord.key) - 1,
      key: chord.key,
      label: `Cmd+${chord.key}`,
    };
  }
  if (chord.key === 'J' && !chord.shift) {
    return { id: CHROMUX_SHORTCUT_ACTIONS.QUEUE_FOCUS, key: 'J', label: 'Cmd+J' };
  }
  if (chord.key === 'B' && chord.shift) {
    return { id: CHROMUX_SHORTCUT_ACTIONS.BROWSER_TOGGLE, key: 'B', label: 'Cmd+Shift+B' };
  }
  if (chord.key === 'Q' && !chord.shift) {
    return { id: CHROMUX_SHORTCUT_ACTIONS.GUARDED_QUIT, key: 'Q', label: 'Cmd+Q' };
  }
  if (chord.key === 'T' && !chord.shift) {
    return { id: CHROMUX_SHORTCUT_ACTIONS.NEW_SESSION, key: 'T', label: 'Cmd+T' };
  }
  if (chord.key === 'D' && !chord.shift) {
    return { id: CHROMUX_SHORTCUT_ACTIONS.DETECT, key: 'D', label: 'Cmd+D' };
  }
  if (chord.key === 'ENTER' && chord.shift) {
    return { id: CHROMUX_SHORTCUT_ACTIONS.COMPOSER_OPEN, key: 'ENTER', label: 'Cmd+Shift+Enter' };
  }
  return null;
}

function classifyShortcutFocusContext(context = {}) {
  if (typeof context === 'string') {
    return CHROMUX_SHORTCUT_FOCUS_KINDS.has(context) ? context : 'appSurface';
  }
  if (context && typeof context.focusKind === 'string') {
    return classifyShortcutFocusContext(context.focusKind);
  }
  if (context && context.modalOpen) return 'modal';
  if (context && context.hostEditable) return 'hostEditable';
  if (context && context.guestEditable) return 'guestEditable';
  if (context && context.terminal) return 'terminal';
  return 'appSurface';
}

function shortcutContextDisabledReason(context = {}) {
  const kind = classifyShortcutFocusContext(context);
  if (kind === 'modal') return 'modal open';
  if (kind === 'hostEditable') return 'host editable';
  if (kind === 'guestEditable') return 'guest editable';
  return null;
}

function shouldRouteChromuxShortcut(input = {}, context = {}) {
  if (!chromuxShortcutAction(input)) return false;
  return ALLOWED_CHROMUX_SHORTCUT_FOCUS_KINDS.has(classifyShortcutFocusContext(context));
}

module.exports = {
  CHROMUX_SHORTCUT_ACTIONS,
  CHROMUX_SHORTCUT_FOCUS_KINDS,
  chromuxShortcutAction,
  classifyShortcutFocusContext,
  normalizeShortcutChord,
  sessionShortcutDigit,
  shortcutContextDisabledReason,
  shouldRouteChromuxShortcut,
};
