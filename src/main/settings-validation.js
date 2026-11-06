const path = require('path');
const FONTS = new Set(['geist', 'geist-mono', 'outfit', 'space-grotesk', 'orbitron', 'rajdhani', 'oxanium', 'bebas-neue', 'playfair', 'doto', 'press-start', 'sixtyfour', 'audiowide', 'vt323', 'share-tech-mono', 'chakra-petch']);
const ENUMS = {
  language: ['pt', 'en', 'es', null], theme: ['system', 'light', 'dark'], layout: ['card', 'compact', 'bar', 'dock'],
  cardLayout: ['grid', 'list', 'tall'], compactLayout: ['list', 'tall'], layoutBeforeDock: ['card', 'compact', 'bar'],
  hwNames: ['label', 'name', 'model'], hwNamesStrip: ['label', 'name', 'model'],
};
const BOOLEAN = new Set(['updateCheck', 'monitoring', 'captureWinShiftS', 'autoSaveShots', 'hoverFade', 'captureCloseOnCopy', 'recordSystemAudio', 'recordMic', 'fpsEnabled', 'clock24h', 'showSeconds', 'adminSensors', 'locked', 'hidden', 'startWithWindows', 'historyMaximized']);
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const string = (value, max = 500) => typeof value === 'string' && value.length <= max && !value.includes('\0');
const color = (value) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
const clamp = (value, min, max) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined;

function sanitize(patch) {
  if (!plain(patch)) return {};
  const next = {};
  for (const [key, value] of Object.entries(patch)) {
    if (BOOLEAN.has(key) && typeof value === 'boolean') next[key] = value;
    else if (Object.hasOwn(ENUMS, key) && ENUMS[key].includes(value)) next[key] = value;
    else if (['scale', 'opacity'].includes(key)) {
      const number = key === 'scale' ? clamp(value, 0.6, 3) : clamp(value, 0, 1);
      if (number !== undefined) next[key] = number;
    } else if (key === 'accent' && color(value)) next[key] = value;
    else if (['shotsFolder', 'videosFolder'].includes(key) && (value === null || string(value, 32000) && path.isAbsolute(value))) next[key] = value;
    else if (['diskId', 'updateNotified'].includes(key) && (value === null || string(value))) next[key] = value;
    else if (key === 'modules' && plain(value)) {
      next.modules = Object.fromEntries(Object.entries(value).filter(([name, on]) => ['clock', 'date', 'weather', 'fps', 'cpu', 'gpu', 'ram', 'disk'].includes(name) && typeof on === 'boolean'));
    } else if (key === 'hotkeys' && plain(value)) {
      next.hotkeys = Object.fromEntries(Object.entries(value).filter(([name, accelerator]) => ['capture', 'record', 'history', 'lock', 'fps', 'visible'].includes(name) && string(accelerator, 120)));
    } else if (key === 'scales' && plain(value)) {
      next.scales = Object.fromEntries(Object.entries(value).filter(([name, size]) => ['card', 'compact', 'bar', 'dock'].includes(name) && clamp(size, 0.6, 3) !== undefined).map(([name, size]) => [name, clamp(size, 0.6, 3)]));
    } else if (key === 'typography' && plain(value)) {
      next.typography = {};
      for (const part of ['clock', 'date', 'weather', 'metrics']) {
        if (!plain(value[part])) continue;
        const item = {};
        if (FONTS.has(value[part].font)) item.font = value[part].font;
        if (clamp(value[part].size, 0.6, 2.5) !== undefined) item.size = clamp(value[part].size, 0.6, 2.5);
        if (clamp(value[part].weight, 100, 900) !== undefined) item.weight = clamp(value[part].weight, 100, 900);
        next.typography[part] = item;
      }
    } else if (key === 'background' && plain(value)) {
      const bg = {};
      if (value.file === null || string(value.file) && path.basename(value.file) === value.file) bg.file = value.file;
      if ([null, 'image', 'video'].includes(value.kind)) bg.kind = value.kind;
      if (value.name === null || string(value.name)) bg.name = value.name;
      if (clamp(value.opacity, 0.05, 1) !== undefined) bg.opacity = clamp(value.opacity, 0.05, 1);
      next.background = bg;
    } else if (key === 'capture' && plain(value)) {
      next.capture = {};
      if (color(value.color)) next.capture.color = value.color;
      if (clamp(value.size, 1, 32) !== undefined) next.capture.size = clamp(value.size, 1, 32);
    } else if (key === 'city') {
      if (value === null) next.city = null;
      else if (plain(value) && string(value.name) && clamp(value.latitude, -90, 90) === value.latitude && clamp(value.longitude, -180, 180) === value.longitude && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)) {
        next.city = { name: value.name, latitude: value.latitude, longitude: value.longitude, admin1: string(value.admin1) ? value.admin1 : '', country: string(value.country) ? value.country : '' };
      }
    } else if (['position', 'dock', 'settingsBounds', 'historyBounds'].includes(key)) {
      if (value === null) { next[key] = null; continue; }
      if (!plain(value)) continue;
      const windowBounds = key === 'settingsBounds' || key === 'historyBounds';
      const fields = windowBounds ? ['x', 'y', 'width', 'height'] : key === 'dock' ? ['displayId', 'offsetX'] : ['displayId', 'offsetX', 'offsetY'];
      if (!fields.every((name) => Number.isFinite(value[name]))) continue;
      const item = Object.fromEntries(fields.map((name) => [name, Math.round(value[name])]));
      if (key === 'position') {
        item.anchorX = value.anchorX === 'left' ? 'left' : 'right';
        item.anchorY = value.anchorY === 'bottom' ? 'bottom' : 'top';
        item.offsetX = Math.max(0, item.offsetX); item.offsetY = Math.max(0, item.offsetY);
      }
      if (windowBounds) {
        item.width = Math.max(key === 'historyBounds' ? 460 : 420, Math.min(10000, item.width)); item.height = Math.max(key === 'historyBounds' ? 360 : 520, Math.min(10000, item.height));
      }
      next[key] = item;
    }
  }
  return next;
}

module.exports = { sanitize };
