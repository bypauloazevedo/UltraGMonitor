const fs = require('fs');
const path = require('path');
const { BrowserWindow, desktopCapturer } = require('electron');
const paths = require('./paths');
const folders = require('./folders');
const { copyFileToClipboard } = require('./clipfile');
const { t } = require('../renderer/shared/i18n');

const BAR = { width: 236, height: 48 };

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function popup(options) {
  const win = new BrowserWindow({
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: paths.preload(),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
    ...options,
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setContentProtection(true);
  return win;
}

class Recorder {
  constructor({ toast, onChange }) {
    this.toast = toast;
    this.onChange = onChange;
    this.active = false;
    this.paused = false;
    this.windows = {};
    this.display = null;
    this.startedAt = 0;
    this.pausedTotal = 0;
    this.pausedAt = 0;
  }

  elapsed() {
    if (!this.startedAt) return 0;
    const now = this.paused ? this.pausedAt : Date.now();
    return now - this.startedAt - this.pausedTotal;
  }

  sendState() {
    const state = { active: this.active, paused: this.paused, elapsed: this.elapsed(), recording: !!this.startedAt };
    if (this.windows.bar && !this.windows.bar.isDestroyed()) this.windows.bar.webContents.send('record:state', state);
    this.onChange(state);
  }

  barBounds(display, css) {
    const { bounds } = display;
    const x = Math.round(bounds.x + css.x + css.width / 2 - BAR.width / 2);
    const below = bounds.y + css.y + css.height + 10;
    const above = bounds.y + css.y - BAR.height - 10;
    let y = below;
    if (below + BAR.height > bounds.y + bounds.height) y = above >= bounds.y ? above : bounds.y + css.y + 10;
    return {
      x: Math.min(Math.max(bounds.x + 8, x), bounds.x + bounds.width - BAR.width - 8),
      y: Math.round(y),
      ...BAR,
    };
  }

  async start({ display, rect, css, system, mic }) {
    if (this.active) return;
    this.active = true;
    this.paused = false;
    this.display = display;
    this.startedAt = 0;
    this.pausedTotal = 0;
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      const source = sources.find((s) => s.display_id === String(display.id)) || sources[0];
      if (!source) throw new Error('nenhuma tela encontrada');
      const { bounds } = display;
      const frame = popup({
        x: Math.round(bounds.x + css.x - 3),
        y: Math.round(bounds.y + css.y - 3),
        width: Math.round(css.width + 6),
        height: Math.round(css.height + 6),
        transparent: true,
        backgroundColor: '#00000000',
        focusable: false,
      });
      frame.setIgnoreMouseEvents(true);
      frame.loadFile(paths.page('recframe'));
      frame.once('ready-to-show', () => frame.showInactive());
      const bar = popup({ ...this.barBounds(display, css), transparent: true, backgroundColor: '#00000000' });
      bar.loadFile(paths.page('recbar'));
      bar.once('ready-to-show', () => {
        bar.showInactive();
        this.sendState();
      });
      const worker = new BrowserWindow({
        show: false,
        width: 320,
        height: 240,
        webPreferences: {
          preload: paths.preload(),
          contextIsolation: true,
          sandbox: true,
          backgroundThrottling: false,
        },
      });
      worker.loadFile(paths.page('recorder'));
      worker.webContents.once('did-finish-load', () => {
        worker.webContents.send('recorder:command', {
          action: 'start',
          sourceId: source.id,
          width: Math.round(display.size.width * display.scaleFactor),
          height: Math.round(display.size.height * display.scaleFactor),
          rect,
          system,
          mic,
        });
      });
      this.windows = { frame, bar, worker };
    } catch (err) {
      this.fail(err.message);
    }
  }

  started() {
    this.startedAt = Date.now();
    this.sendState();
  }

  command(action) {
    const { worker } = this.windows;
    if (!this.active || !worker || worker.isDestroyed()) return;
    if (action === 'pause' && !this.paused) {
      this.paused = true;
      this.pausedAt = Date.now();
    } else if (action === 'resume' && this.paused) {
      this.paused = false;
      this.pausedTotal += Date.now() - this.pausedAt;
    }
    worker.webContents.send('recorder:command', { action });
    this.sendState();
  }

  stop() {
    this.command('stop');
  }

  cancel() {
    this.command('cancel');
    this.cleanup();
  }

  toggle() {
    if (this.active) this.stop();
  }

  async done(data, mime) {
    const display = this.display;
    this.cleanup();
    try {
      const folder = folders.ensure('videos');
      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      const file = path.join(folder, `${t('Gravação')} ${stamp()}.${ext}`);
      fs.writeFileSync(file, Buffer.from(data));
      copyFileToClipboard(file);
      this.toast.show(`${t('Vídeo salvo')}|${t('Ctrl+V pra colar o arquivo')}`, 'ok', display);
    } catch (err) {
      this.toast.show(t('Não deu pra salvar o vídeo'), 'error', display);
    }
  }

  fail(message) {
    console.error('gravação falhou', message);
    const display = this.display;
    this.cleanup();
    this.toast.show(t('Não deu pra gravar'), 'error', display || undefined);
  }

  cleanup() {
    for (const win of Object.values(this.windows)) {
      if (win && !win.isDestroyed()) win.destroy();
    }
    this.windows = {};
    this.active = false;
    this.paused = false;
    this.startedAt = 0;
    this.sendState();
  }
}

module.exports = { Recorder };
