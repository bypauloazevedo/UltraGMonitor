const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  layout: 'card',
  scale: 1,
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

function update(partial) {
  current = merge(current, partial);
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
