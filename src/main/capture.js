const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, clipboard, desktopCapturer, dialog, globalShortcut, nativeImage, screen } = require('electron');
const paths = require('./paths');
const { t } = require('../renderer/shared/i18n');

const SHOT_FILE = path.join(os.tmpdir(), 'ultragmonitor-shot.rgba');
const CAPTURE_KEYS = {
  'CommandOrControl+C': 'copy',
  Enter: 'enter',
  Escape: 'escape',
  'CommandOrControl+S': 'save',
  'CommandOrControl+Z': 'undo',
  'CommandOrControl+Y': 'redo',
};

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

class Capture {
  constructor({ sensors, toast, getSettings, beforeShot, afterShot }) {
    this.sensors = sensors;
    this.toast = toast;
    this.getSettings = getSettings;
    this.beforeShot = beforeShot;
    this.afterShot = afterShot;
    this.win = null;
    this.busy = false;
    this.display = null;
    this.shot = null;
    this.held = [];
    this.quitting = false;
    app.on('before-quit', () => {
      this.quitting = true;
    });
  }

  holdKeys() {
    this.releaseKeys();
    for (const [accelerator, action] of Object.entries(CAPTURE_KEYS)) {
      try {
        if (globalShortcut.isRegistered(accelerator)) continue;
        const ok = globalShortcut.register(accelerator, () => {
          if (this.win && !this.win.isDestroyed()) this.win.webContents.send('capture:key', action);
        });
        if (ok) this.held.push(accelerator);
      } catch {}
    }
  }

  releaseKeys() {
    for (const accelerator of this.held) globalShortcut.unregister(accelerator);
    this.held = [];
  }

  warm() {
    if (this.win && !this.win.isDestroyed()) return;
    const win = new BrowserWindow({
      width: 800,
      height: 600,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      backgroundColor: '#000000',
      title: 'UltraGMonitor · Captura',
      webPreferences: {
        preload: paths.preload(),
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.loadFile(paths.page('capture'));
    win.on('close', (e) => {
      if (this.quitting) return;
      e.preventDefault();
      this.close();
    });
    win.on('closed', () => {
      this.win = null;
    });
    this.win = win;
  }

  async grab(display) {
    try {
      const rect = screen.dipToScreenRect(null, display.bounds);
      const result = await this.sensors.shot(rect, SHOT_FILE);
      return { pixels: fs.readFileSync(SHOT_FILE), width: result.width, height: result.height, format: 'rgba' };
    } catch {
      const size = {
        width: Math.round(display.size.width * display.scaleFactor),
        height: Math.round(display.size.height * display.scaleFactor),
      };
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
      const source = sources.find((s) => s.display_id === String(display.id)) || sources[0];
      if (!source) throw new Error('nenhuma tela encontrada');
      const image = source.thumbnail;
      return { pixels: image.toBitmap(), ...image.getSize(), format: 'bgra' };
    }
  }

  async start(mode = 'shot') {
    if (this.busy) return;
    this.busy = true;
    this.warm();
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    try {
      this.beforeShot();
      await new Promise((resolve) => setTimeout(resolve, 50));
      this.shot = { ...(await this.grab(display)), cssWidth: display.bounds.width, mode };
      this.display = display;
      this.win.setBounds(display.bounds);
      this.win.webContents.send('capture:start');
    } catch (err) {
      console.error('captura falhou', err);
      this.busy = false;
      this.afterShot();
    }
  }

  image() {
    return this.shot;
  }

  ready() {
    if (!this.win || !this.busy) return;
    this.win.setBounds(this.display.bounds);
    this.win.show();
    this.win.moveTop();
    this.win.focus();
    this.win.webContents.focus();
    this.holdKeys();
    this.shot = null;
  }

  close() {
    this.releaseKeys();
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) this.win.hide();
    if (!this.busy) return;
    this.busy = false;
    this.shot = null;
    this.afterShot();
  }

  region() {
    const display = this.display;
    this.close();
    return display;
  }

  copy(buffer) {
    const image = nativeImage.createFromBuffer(Buffer.from(buffer));
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
      clipboard.writeImage(image);
      ok = !clipboard.readImage().isEmpty();
    }
    const display = this.display;
    const keepOpen = this.getSettings().captureCloseOnCopy === false;
    if (!keepOpen) this.close();
    if (ok) this.toast.show(`${t('Print copiado')}|${t('Ctrl+V pra colar')}`, 'ok', display);
    else this.toast.show(t('Não deu pra copiar o print'), 'error', display);
    return ok;
  }

  async save(buffer) {
    const folder = path.join(app.getPath('pictures'), 'UltraGMonitor');
    fs.mkdirSync(folder, { recursive: true });
    this.releaseKeys();
    const result = await dialog.showSaveDialog(this.win, {
      title: t('Salvar print'),
      defaultPath: path.join(folder, `${t('Print')} ${stamp()}.png`),
      filters: [{ name: t('Imagem PNG'), extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) {
      if (this.busy) this.holdKeys();
      return false;
    }
    fs.writeFileSync(result.filePath, Buffer.from(buffer));
    const display = this.display;
    this.close();
    this.toast.show(`${t('Print salvo')}|${path.basename(result.filePath)}`, 'ok', display);
    return true;
  }

  pin(buffer, rect) {
    const { bounds } = this.display;
    const image = nativeImage.createFromBuffer(Buffer.from(buffer));
    const pin = new BrowserWindow({
      x: Math.round(bounds.x + rect.x),
      y: Math.round(bounds.y + rect.y),
      width: Math.max(40, Math.round(rect.width)),
      height: Math.max(40, Math.round(rect.height)),
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: true,
      backgroundColor: '#0d0f14',
      title: 'UltraGMonitor · Print fixado',
      webPreferences: {
        preload: paths.preload(),
        contextIsolation: true,
        sandbox: true,
      },
    });
    pin.setAlwaysOnTop(true, 'floating');
    pin.loadFile(paths.page('pin'));
    pin.webContents.once('did-finish-load', () => pin.webContents.send('pin:image', image.toDataURL()));
    this.close();
  }
}

module.exports = { Capture };
