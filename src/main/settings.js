const path = require('path');
const { app } = require('electron');
const storage = require('./atomic-json');
const { sanitize } = require('./settings-validation');

const DEFAULTS = {
  language: null,
  theme: 'system',
  layout: 'card',
  cardLayout: 'grid',
  compactLayout: 'list',
  updateCheck: true,
  updateNotified: null,
  monitoring: true,
  captureWinShiftS: false,
  autoSaveShots: true,
  shotsFolder: null,
  videosFolder: null,
  scale: 1,
  scales: {},
  opacity: 0.82,
  accent: '#5ee6ff',
  modules: {
    clock: true,
    date: true,
    weather: true,
    fps: true,
    cpu: true,
    gpu: true,
    ram: true,
    disk: true,
  },
  typography: {
    clock: { font: 'geist', size: 1, weight: 230 },
    date: { font: 'geist', size: 1 },
    weather: { font: 'geist', size: 1 },
    metrics: { font: 'geist-mono', size: 1 },
  },
  background: { file: null, kind: null, name: null, opacity: 0.6 },
  hoverFade: false,
  hwNames: 'name',
  hwNamesStrip: 'model',
  hotkeys: {
    capture: 'PrintScreen',
    record: '',
    history: '',
    lock: 'CommandOrControl+Shift+H',
    fps: 'CommandOrControl+Shift+F',
    visible: 'CommandOrControl+Shift+O',
  },
  capture: { color: '#ff3b5c', size: 4 },
  captureCloseOnCopy: true,
  recordSystemAudio: true,
  recordMic: false,
  fpsEnabled: false,
  clock24h: true,
  showSeconds: true,
  diskId: null,
  city: null,
  adminSensors: false,
  locked: true,
  hidden: false,
  startWithWindows: false,
  position: null,
  dock: null,
  layoutBeforeDock: 'card',
  historyBounds: null,
  historyMaximized: false,
};

let current = null;
let file = null;
let firstRun = false;
let saveTimer = null;
let persistence = { recovered: false, error: false };
let onPersistence = () => {};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function merge(base, extra) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra || {})) {
    out[key] = isPlainObject(value) && isPlainObject(base[key]) ? merge(base[key], value) : value;
  }
  return out;
}

function load() {
  file = path.join(app.getPath('userData'), 'settings.json');
  const result = storage.read(file);
  current = merge(DEFAULTS, sanitize(result.value));
  firstRun = !!result.fresh;
  persistence = { recovered: result.recovered, error: false };
  return current;
}

function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!current || !file) return;
  const before = persistence.error;
  try {
    storage.write(file, current);
    persistence.error = false;
  } catch (err) {
    console.error('falha ao salvar configurações', err);
    persistence.error = true;
  }
  if (before !== persistence.error) onPersistence();
}

function withLayoutScale(partial) {
  const next = { ...partial };
  const layoutChanged = next.layout !== undefined && next.layout !== current.layout;
  const scales = { ...current.scales, ...next.scales };
  if (layoutChanged) {
    scales[current.layout] = current.scale;
    if (next.scale === undefined) next.scale = scales[next.layout] ?? DEFAULTS.scale;
  }
  if (next.scale !== undefined) scales[next.layout ?? current.layout] = next.scale;
  if (layoutChanged || next.scale !== undefined) next.scales = scales;
  return next;
}

function update(partial) {
  const patch = sanitize(partial);
  if (!Object.keys(patch).length) return current;
  current = merge(current, withLayoutScale(patch));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
  return current;
}

module.exports = {
  load,
  update,
  flush,
  get: () => current,
  isFirstRun: () => firstRun,
  persistence: () => ({ ...persistence }),
  onPersistence: (callback) => { onPersistence = callback; },
  sanitize,
};
