'use strict';

const DEV_MODE_ON_FLAG = '--dev-mode';
const DEV_MODE_OFF_FLAG = '--no-dev-mode';

function explicitDevMode(argv = []) {
  for (let index = argv.length - 1; index >= 0; index -= 1) {
    if (argv[index] === DEV_MODE_ON_FLAG) return true;
    if (argv[index] === DEV_MODE_OFF_FLAG) return false;
  }
  return null;
}

function resolveDevMode({ argv = [], persisted = null, isPackaged = false } = {}) {
  const explicit = explicitDevMode(argv);
  if (explicit !== null) return explicit;
  if (typeof persisted === 'boolean') return persisted;
  return !isPackaged;
}

function restartArgs(argv = [], enabled) {
  return argv
    .filter((arg) => arg !== DEV_MODE_ON_FLAG && arg !== DEV_MODE_OFF_FLAG)
    .concat(enabled ? DEV_MODE_ON_FLAG : DEV_MODE_OFF_FLAG);
}

function createDevModeRestart({ persist, snapshot, relaunch, quit }) {
  return ({ enabled, sessions } = {}) => {
    if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean');
    if (!Array.isArray(sessions)) throw new TypeError('sessions must be an array');
    const restore = snapshot({ reason: 'dev-mode-restart', sessions });
    persist(enabled);
    relaunch(enabled);
    quit();
    return { ok: true, enabled, restoreId: restore && restore.restoreId || null };
  };
}

module.exports = {
  DEV_MODE_OFF_FLAG,
  DEV_MODE_ON_FLAG,
  createDevModeRestart,
  explicitDevMode,
  resolveDevMode,
  restartArgs,
};
