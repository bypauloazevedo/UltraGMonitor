const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  language: null,
  theme: 'system',
  layout: 'card',
  cardLayout: 'grid',
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
};

let current = null;
let file = null;
let firstRun = false;
let saveTimer = null;

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
  try {
    current = merge(DEFAULTS, JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    current = merge(DEFAULTS, {});
    firstRun = true;
  }
  return current;
}

function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(current, null, 2));
  } catch (err) {
    console.error('falha ao salvar configurações', err);
  }
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
  current = merge(current, withLayoutScale(partial));
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
};
