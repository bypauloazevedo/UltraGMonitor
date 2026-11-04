const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const settings = require('./settings');
const { t } = require('../renderer/shared/i18n');

const KEYS = { shots: 'shotsFolder', videos: 'videosFolder' };

function fallback(kind) {
  return path.join(app.getPath('pictures'), 'UltraGMonitor', kind === 'shots' ? t('Prints') : t('Vídeos'));
}

function folder(kind) {
  return settings.get()[KEYS[kind]] || fallback(kind);
}

function ensure(kind) {
  const dir = folder(kind);
  try {
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    const safe = fallback(kind);
    fs.mkdirSync(safe, { recursive: true });
    return safe;
  }
}

module.exports = { KEYS, folder, ensure };
