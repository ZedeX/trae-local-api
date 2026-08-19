// Centralized cross-platform path resolution for Trae data/install directories.
// Used by auth.js, trae-decrypt.js, and scripts/fetch-models-vscdb.js so that
// path logic is defined in exactly one place.
//
// Everything that used to be hardcoded (edition, folder names, data dir) is now
// env-configurable with sensible OS defaults, so non-default installations and
// non-Windows platforms work without code changes.
const os = require('os');
const path = require('path');

/**
 * Normalize an edition value. Accepts 'cn' / 'sg' (case-insensitive); anything
 * else falls back to the configured default edition (TRAE_EDITION, or 'cn').
 * @param {string} [edition]
 * @returns {'cn'|'sg'}
 */
function normalizeEdition(edition) {
  if (typeof edition === 'string') {
    const ed = edition.toLowerCase();
    if (ed === 'cn' || ed === 'sg') return ed;
  }
  return getDefaultEdition();
}

/**
 * Default edition, read from TRAE_EDITION env var (defaults to 'cn').
 * Kept as a function (not a module-level const) so changes to process.env
 * after process start are honoured.
 * @returns {'cn'|'sg'}
 */
function getDefaultEdition() {
  const envEdition = process.env.TRAE_EDITION;
  if (envEdition) {
    const ed = String(envEdition).toLowerCase();
    if (ed === 'cn' || ed === 'sg') return ed;
  }
  return 'cn';
}

/**
 * Base app-data directory for VS Code-based (Electron) apps, cross-platform.
 * - Windows: %APPDATA%                (e.g. C:\Users\<user>\AppData\Roaming)
 * - macOS:   ~/Library/Application Support
 * - Linux:   $XDG_CONFIG_HOME or ~/.config
 */
function getAppDataBaseDir() {
  const platform = process.platform;
  if (platform === 'win32') {
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  }
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  // linux / other unix-like
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

/**
 * Base directory for installed programs, cross-platform.
 * - Windows: %LOCALAPPDATA%\Programs
 * - macOS:   /Applications
 * - Linux:   /opt
 */
function getProgramsBaseDir() {
  const platform = process.platform;
  if (platform === 'win32') {
    return process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Programs')
      : path.join(os.homedir(), 'AppData', 'Local', 'Programs');
  }
  if (platform === 'darwin') {
    return '/Applications';
  }
  return '/opt';
}

/**
 * Folder name used for an edition's data directory under the app-data base dir.
 * Configurable via env so non-default install folder names are supported:
 *   - CN: TRAE_CN_FOLDER  (default "Trae CN")
 *   - SG: TRAE_SG_FOLDER  (default "Trae")
 * @param {'cn'|'sg'} edition
 * @returns {string}
 */
function getDataFolderName(edition) {
  const ed = normalizeEdition(edition);
  if (ed === 'cn') {
    return process.env.TRAE_CN_FOLDER || 'Trae CN';
  }
  return process.env.TRAE_SG_FOLDER || 'Trae';
}

/**
 * Folder name used for an edition's install directory under the programs base dir.
 * Configurable via env:
 *   - CN: TRAE_CN_INSTALL_FOLDER  (default "Trae-CN")
 *   - SG: TRAE_SG_INSTALL_FOLDER  (default "Trae")
 * @param {'cn'|'sg'} edition
 * @returns {string}
 */
function getInstallFolderName(edition) {
  const ed = normalizeEdition(edition);
  if (ed === 'cn') {
    return process.env.TRAE_CN_INSTALL_FOLDER || 'Trae-CN';
  }
  return process.env.TRAE_SG_INSTALL_FOLDER || 'Trae';
}

/**
 * Resolve the Trae data directory for a given edition.
 *
 * Priority (highest first):
 *   1. Edition-specific env override:
 *        - CN: TRAE_CN_DATA_DIR
 *        - SG: TRAE_SG_DATA_DIR
 *   2. TRAE_DATA_DIR env var — generic override (backward compat, any edition)
 *   3. OS-default path: <appDataBaseDir>/<edition folder name>
 *
 * @param {'cn'|'sg'} [edition] — defaults to TRAE_EDITION env var, or 'cn'
 * @returns {string} absolute path to the Trae data directory
 */
function getTraeDataDir(edition) {
  const ed = normalizeEdition(edition);
  // 1. Edition-specific explicit override (highest priority)
  if (ed === 'cn' && process.env.TRAE_CN_DATA_DIR) {
    return process.env.TRAE_CN_DATA_DIR;
  }
  if (ed === 'sg' && process.env.TRAE_SG_DATA_DIR) {
    return process.env.TRAE_SG_DATA_DIR;
  }
  // 2. Generic override (backward compatibility with auth.js)
  if (process.env.TRAE_DATA_DIR) {
    return process.env.TRAE_DATA_DIR;
  }
  // 3. OS defaults
  return path.join(getAppDataBaseDir(), getDataFolderName(ed));
}

/**
 * Resolve the Trae install directory (where manifest.json lives) for a given edition.
 * @param {'cn'|'sg'} [edition] — defaults to TRAE_EDITION env var, or 'cn'
 * @returns {string} absolute path to the Trae install directory
 */
function getTraeInstallDir(edition) {
  const ed = normalizeEdition(edition);
  return path.join(getProgramsBaseDir(), getInstallFolderName(ed));
}

module.exports = {
  normalizeEdition,
  getDefaultEdition,
  getAppDataBaseDir,
  getProgramsBaseDir,
  getDataFolderName,
  getInstallFolderName,
  getTraeDataDir,
  getTraeInstallDir,
};
