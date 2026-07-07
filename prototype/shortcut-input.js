'use strict';

function sessionShortcutDigit(input = {}) {
  const key = String(input.key || '').toLowerCase();
  if (/^[1-9]$/.test(key)) return key;

  const code = String(input.code || '');
  const match = /^Digit([1-9])$/.exec(code);
  return match ? match[1] : null;
}

module.exports = { sessionShortcutDigit };
