const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, clipboard, ClipboardItem, desktopCapturer, dialog, globalShortcut, nativeImage, screen } = require('electron');
const paths = require('./paths');
const folders = require('./folders');
const { t } = require('../renderer/shared/i18n');

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
  constructor({ sensors, toast, getSettings, beforeShot, afterShot, onClose = () => {} }) {
    this.sensors = sensors;
    this.toast = toast;
    this.getSettings = getSettings;
    this.beforeShot = beforeShot;
    this.afterShot = afterShot;
    this.onClose = onClose;
    this.win = null;
    this.windows = new Map();
    this.targets = [];
    this.toolbar = null;
    this.busy = false;
    this.display = null;
    this.shot = null;
    this.held = [];
    this.keysEnabled = false;
    this.loading = null;
    this.returnFocus = null;
    this.readyTimer = null;
    this.session = 0;
    this.quitting = false;
    app.on('before-quit', () => {
      this.quitting = true;
    });
    screen?.on?.('display-removed', () => { if (this.busy) this.close(); });
    screen?.on?.('display-metrics-changed', (_event, _display, metrics) => {
      if (this.busy && metrics.some(metric => ['bounds', 'scaleFactor', 'rotation'].includes(metric))) this.close();
    });
  }

  holdKeys() {
    this.releaseKeys();
    if (!this.busy || !this.keysEnabled || !this.win || this.win.isDestroyed() || !this.win.isFocused()) return;
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

  setKeysEnabled(enabled, sender) {
    const target = this.target(sender);
    if (target) {
      target.keysEnabled = enabled === true;
      if (target.win !== this.win) return;
    }
    this.keysEnabled = enabled === true;
    if (this.keysEnabled) this.holdKeys();
    else this.releaseKeys();
  }

  warm() {
    const displays = screen.getAllDisplays();
    for (const [id, target] of this.windows) {
      if (!displays.some(display => display.id === id)) {
        this.windows.delete(id);
        if (!target.win.isDestroyed()) target.win.destroy();
      }
    }
    for (const display of displays) this.warmDisplay(display);
    this.loading = Promise.all(displays.map(display => this.windows.get(display.id).loading));
    this.loading.catch(() => {});
    return this.loading;
  }

  warmDisplay(display) {
    const existing = this.windows.get(display.id);
    if (existing && !existing.win.isDestroyed()) { existing.display = display; return; }
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
    const target = { win, display, loading: win.loadFile(paths.page('capture')), shot: null, ready: false, keysEnabled: true };
    target.loading.catch(() => {});
    this.windows.set(display.id, target);
    win.on('focus', () => { if (this.use(win.webContents)) this.holdKeys(); });
    win.on('blur', () => { if (this.win === win) this.releaseKeys(); });
    win.on('close', (e) => {
      if (this.quitting) return;
      e.preventDefault();
      this.close();
    });
    win.on('closed', () => {
      if (this.busy && this.targets.includes(target)) this.close();
      if (this.windows.get(display.id) === target) this.windows.delete(display.id);
      if (this.win === win) this.win = null;
    });
    if (!this.win || this.win.isDestroyed()) this.win = win;
  }

  async grab(display) {
    const file = path.join(os.tmpdir(), `ultragmonitor-shot-${process.pid}-${display.id}.rgba`);
    try {
      const rect = screen.dipToScreenRect(null, display.bounds);
      const result = await this.sensors.shot(rect, file);
      return { pixels: fs.readFileSync(file), width: result.width, height: result.height, format: 'rgba' };
    } catch {
      const size = {
        width: Math.round(display.size.width * display.scaleFactor),
        height: Math.round(display.size.height * display.scaleFactor),
      };
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
      const source = sources.find((s) => s.display_id === String(display.id)) || (screen.getAllDisplays().length === 1 && sources.length === 1 ? sources[0] : null);
      if (!source) throw new Error('nenhuma tela encontrada');
      const image = source.thumbnail;
      return { pixels: image.toBitmap(), ...image.getSize(), format: 'bgra' };
    } finally {
      try { fs.unlinkSync(file); } catch {}
    }
  }

  async start(mode = 'shot') {
    if (this.busy) return;
    this.busy = true;
    const session = ++this.session;
    this.keysEnabled = true;
    this.returnFocus = BrowserWindow.getFocusedWindow();
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    this.readyTimer = setTimeout(() => {
      if (!this.busy || session !== this.session) return;
      this.fail(display);
    }, 10000);
    try {
      await this.warm();
      if (!this.busy || session !== this.session) return;
      this.targets = screen.getAllDisplays().map(item => this.windows.get(item.id));
      if (!this.targets.length || this.targets.some(target => !target || target.win.isDestroyed())) throw new Error('monitor indisponível');
      for (const target of this.targets) {
        target.ready = false;
        target.keysEnabled = true;
      }
      const active = this.targets.find(target => target.display.id === display.id) || this.targets[0];
      const primary = screen.getPrimaryDisplay?.() || this.targets[0].display;
      this.toolbar = this.targets.find(target => target.display.id === primary.id) || this.targets[0];
      this.win = active.win;
      this.display = active.display;
      this.beforeShot();
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (!this.busy || session !== this.session) return;
      const images = await Promise.all(this.targets.map(target => this.grab(target.display)));
      if (!this.busy || session !== this.session) return;
      this.targets.forEach((target, index) => {
        target.shot = { ...images[index], cssWidth: target.display.bounds.width, mode, toolbarActive: target === this.toolbar };
        target.win.setBounds(target.display.bounds);
        target.win.webContents.send('capture:start', session);
      });
      this.shot = active.shot;
    } catch (err) {
      if (session !== this.session) return;
      console.error('captura falhou', err);
      this.fail(display);
    }
  }

  fail(display) {
    const windows = new Set([this.win, ...Array.from(this.windows.values(), target => target.win)]);
    const focused = BrowserWindow.getFocusedWindow();
    const returnFocus = windows.has(focused) ? this.returnFocus : focused;
    this.close(false);
    for (const win of windows) if (win && !win.isDestroyed()) win.destroy();
    this.toast.show(t('Não deu pra capturar a tela. Tente de novo.'), 'error', display);
    if (!this.quitting && returnFocus && !returnFocus.isDestroyed() && returnFocus.isVisible()) {
      returnFocus.focus();
      returnFocus.webContents.focus();
    }
  }

  target(sender) {
    return this.targets.find(target => !target.win.isDestroyed() && target.win.webContents === (sender || this.win?.webContents));
  }

  image(sender) {
    return this.target(sender)?.shot || (!sender ? this.shot : null);
  }

  use(sender) {
    if (!this.owns(sender)) return false;
    const target = this.target(sender);
    this.win = target.win;
    this.display = target.display;
    this.shot = target.shot;
    this.keysEnabled = target.keysEnabled;
    return true;
  }

  select(session, sender) {
    if (session !== this.session || !this.targets.every(target => target.ready) || !this.use(sender)) return false;
    const target = this.target(sender);
    if (this.toolbar !== target) {
      this.toolbar = target;
      for (const item of this.targets) item.win.webContents.send('capture:toolbar', { session, active: item === target });
    }
    this.holdKeys();
    return true;
  }

  setOptions(session, sender, options) {
    if (session !== this.session || !this.owns(sender) || this.target(sender) !== this.toolbar || !options) return false;
    if (!['shot', 'video'].includes(options.mode) || !/^#[0-9a-f]{6}$/i.test(options.color) || !Number.isInteger(options.size) || options.size < 1 || options.size > 20) return false;
    const tool = ['pen', 'line', 'arrow', 'rect', 'fill', 'circle', 'marker', 'text', 'blur', 'step'].includes(options.tool) ? options.tool : null;
    const value = { session, mode: options.mode, color: options.color, size: options.size, tool, audio: { system: options.audio?.system === true, mic: options.audio?.mic === true } };
    for (const target of this.targets) if (target !== this.toolbar) target.win.webContents.send('capture:options', value);
    return true;
  }

  ready(session, sender) {
    if (!this.win || !this.busy || session !== this.session) return;
    const target = this.target(sender);
    if (!target || target.ready) return;
    target.ready = true;
    target.shot = null;
    if (target.win === this.win) this.shot = null;
    if (!this.targets.every(item => item.ready)) return;
    clearTimeout(this.readyTimer);
    this.readyTimer = null;
    for (const item of this.targets) {
      item.win.setBounds(item.display.bounds);
      item.win.showInactive();
    }
    this.win.moveTop();
    this.win.focus();
    this.win.webContents.focus();
    this.holdKeys();
    this.shot = null;
  }

  close(restoreFocus = true) {
    const wasBusy = this.busy;
    const returnFocus = this.returnFocus;
    const windows = new Set([this.win, ...Array.from(this.windows.values(), target => target.win)]);
    const focused = Array.from(windows).some(win => win && !win.isDestroyed() && win.isFocused());
    this.busy = false;
    this.toolbar = null;
    this.session++;
    this.returnFocus = null;
    this.keysEnabled = false;
    clearTimeout(this.readyTimer);
    this.readyTimer = null;
    this.releaseKeys();
    for (const win of windows) if (win && !win.isDestroyed() && win.isVisible()) win.hide();
    if (!wasBusy) return;
    this.onClose();
    this.shot = null;
    for (const target of this.targets) {
      target.shot = null;
      target.ready = false;
      if (!target.win.isDestroyed()) target.win.webContents.send('capture:release');
    }
    this.targets = [];
    this.afterShot();
    if (restoreFocus && focused && !this.quitting && returnFocus && !returnFocus.isDestroyed() && returnFocus.isVisible()) {
      returnFocus.focus();
      returnFocus.webContents.focus();
    }
  }

  owns(sender) {
    return this.busy && !!this.target(sender);
  }

  async copyText(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > 1000000) return false;
    try {
      await clipboard.writeText(text);
      return await clipboard.readText() === text;
    } catch { return false; }
  }

  region() {
    const display = this.display;
    this.close();
    return display;
  }

  keep(png) {
    if (this.getSettings().autoSaveShots === false) return { disabled: true };
    try {
      const folder = folders.ensure('shots');
      const name = `${t('Print')} ${stamp()}`;
      let file = path.join(folder, `${name}.png`);
      for (let i = 2; fs.existsSync(file); i++) file = path.join(folder, `${name} (${i}).png`);
      fs.writeFileSync(file, png);
      return { file };
    } catch (err) {
      console.error('não deu pra guardar o print', err);
      return { error: true };
    }
  }

  async copy(buffer) {
    const png = Buffer.from(buffer);
    const saved = this.keep(png);
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
      try {
        await clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]);
        ok = await clipboard.has('image/png');
      } catch {}
    }
    const display = this.display;
    const keepOpen = this.getSettings().captureCloseOnCopy === false;
    if (!keepOpen && ok) this.close();
    if (ok && saved.error) this.toast.show(`${t('Print copiado, mas não deu pra salvar')}|${t('Confira o acesso à pasta dos prints')}`, 'error', display);
    else if (ok) this.toast.show(`${t(saved.file ? 'Print salvo e copiado' : 'Print copiado')}|${t('Ctrl+V pra colar')}`, 'ok', display);
    else this.toast.show(t('Não deu pra copiar o print'), 'error', display);
    return ok;
  }

  async save(buffer) {
    let folder;
    try { folder = folders.ensure('shots'); }
    catch {
      this.toast.show(`${t('Não deu pra salvar o print')}|${t('Confira o acesso à pasta dos prints')}`, 'error', this.display);
      return false;
    }
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
    try {
      fs.writeFileSync(result.filePath, Buffer.from(buffer));
    } catch {
      if (this.busy) this.holdKeys();
      this.toast.show(`${t('Não deu pra salvar o print')}|${t('Confira o acesso à pasta dos prints')}`, 'error', this.display);
      return false;
    }
    const display = this.display;
    this.close();
    this.toast.show(`${t('Print salvo')}|${path.basename(result.filePath)}`, 'ok', display);
    return true;
  }

  pin(buffer, rect) {
    const { bounds } = this.display;
    const saved = this.keep(Buffer.from(buffer));
    const image = nativeImage.createFromBuffer(Buffer.from(buffer));
    this.openPin(image, { x: bounds.x + rect.x, y: bounds.y + rect.y, width: rect.width, height: rect.height });
    this.close();
    if (saved.error) this.toast.show(`${t('Print fixado, mas não deu pra salvar')}|${t('Confira o acesso à pasta dos prints')}`, 'error', this.display);
  }

  pinFile(file) {
    const image = nativeImage.createFromPath(file);
    if (image.isEmpty()) return;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const area = display.workArea;
    const size = image.getSize();
    const scale = Math.min(1 / display.scaleFactor, (area.width * 0.6) / size.width, (area.height * 0.6) / size.height);
    const width = size.width * scale;
    const height = size.height * scale;
    this.openPin(image, { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height });
  }

  openPin(image, rect) {
    const pin = new BrowserWindow({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
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
  }
}

module.exports = { Capture };
