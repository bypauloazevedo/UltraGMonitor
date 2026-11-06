const path = require('path');
const { BrowserWindow, Menu, clipboard, ClipboardItem, nativeImage, screen, shell } = require('electron');
const paths = require('./paths');
const folders = require('./folders');
const { copyFileToClipboard } = require('./clipfile');
const { t } = require('../renderer/shared/i18n');
const { HistoryFiles } = require('./history-files');

const LIMIT = 30;
const SIZE = { width: 760, height: 620 };
const MIN_SIZE = { width: 460, height: 360 };
const IMAGE = /\.(png|jpe?g|webp|bmp)$/i;
const VIDEO = /\.(mp4|webm|mkv)$/i;

async function thumbnail(item) {
  try {
    if (process.platform === 'win32' || process.platform === 'darwin') {
      const image = await nativeImage.createThumbnailFromPath(item.file, { width: 320, height: 200 });
      if (!image.isEmpty()) return image.toDataURL();
    }
    if (item.kind === 'image') {
      const image = nativeImage.createFromPath(item.file);
      if (!image.isEmpty()) return image.resize({ width: 320, quality: 'good' }).toDataURL();
    }
  } catch {}
  return null;
}

class History {
  constructor({ toast, getSettings, saveSettings = () => {}, pinFile, activeRecording = () => null }) {
    this.toast = toast;
    this.getSettings = getSettings;
    this.saveSettings = saveSettings;
    this.pinFile = pinFile;
    this.activeRecording = activeRecording;
    this.win = null;
    this.items = [];
    this.files = new HistoryFiles(thumbnail, LIMIT);
  }

  async list() {
    const result = await this.files.list([
      { path: folders.folder('shots'), kind: 'image', pattern: IMAGE },
      { path: folders.folder('videos'), kind: 'video', pattern: VIDEO },
    ], [this.activeRecording()]);
    this.items = result.items;
    return result;
  }

  known(file) {
    return this.items.some((item) => item.file === file);
  }

  bounds() {
    const saved = this.getSettings().historyBounds;
    const display = saved ? screen.getDisplayMatching(saved) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const area = display.workArea;
    const width = Math.min(area.width, Math.max(MIN_SIZE.width, saved ? saved.width : SIZE.width));
    const height = Math.min(area.height, Math.max(MIN_SIZE.height, saved ? saved.height : SIZE.height));
    return {
      x: Math.round(saved ? Math.max(area.x, Math.min(saved.x, area.x + area.width - width)) : area.x + (area.width - width) / 2),
      y: Math.round(saved ? Math.max(area.y, Math.min(saved.y, area.y + area.height - height)) : area.y + (area.height - height) / 2),
      width,
      height,
    };
  }

  open() {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('history:refresh');
      this.win.show();
      this.win.focus();
      return;
    }
    const maximized = this.getSettings().historyMaximized;
    const win = new BrowserWindow({
      ...this.bounds(),
      minWidth: MIN_SIZE.width,
      minHeight: MIN_SIZE.height,
      frame: false,
      resizable: true,
      minimizable: false,
      maximizable: true,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      backgroundColor: '#0d0f14',
      title: t('UltraGMonitor · Últimos prints'),
      icon: paths.asset('icon.png'),
      webPreferences: {
        preload: paths.preload(),
        contextIsolation: true,
        sandbox: true,
      },
    });
    win.loadFile(paths.page('history'));
    win.once('ready-to-show', () => {
      if (maximized) win.maximize();
      win.show();
      win.focus();
    });
    win.on('blur', () => {
      if (!this.menuOpen && !win.isDestroyed()) win.hide();
    });
    const remember = () => {
      if (win.isDestroyed() || win.isMinimized()) return;
      this.saveSettings({ historyBounds: win.getNormalBounds(), historyMaximized: win.isMaximized() });
    };
    for (const event of ['resize', 'move', 'maximize', 'unmaximize', 'hide', 'close']) win.on(event, remember);
    win.on('closed', () => {
      this.win = null;
    });
    this.win = win;
  }

  hide() {
    if (this.win && !this.win.isDestroyed()) this.win.hide();
  }

  async copy(file) {
    if (!this.known(file)) return false;
    let ok = false;
    try {
      if (IMAGE.test(file)) {
        const png = nativeImage.createFromPath(file).toPNG();
        for (let i = 0; i < 3 && !ok; i++) {
          await clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]);
          ok = await clipboard.has('image/png');
        }
      } else {
        ok = await copyFileToClipboard(file);
      }
    } catch {}
    if (ok) this.hide();
    if (ok) this.toast.show(`${IMAGE.test(file) ? t('Print copiado') : t('Vídeo copiado')}|${t('Ctrl+V pra colar')}`, 'ok');
    else this.toast.show(t('Não deu pra copiar'), 'error');
    return ok;
  }

  launch(file) {
    if (this.known(file)) shell.openPath(file);
  }

  drag(file, sender) {
    if (!this.known(file)) return;
    let icon = nativeImage.createFromPath(IMAGE.test(file) ? file : paths.asset('icon.png'));
    if (icon.isEmpty()) icon = nativeImage.createFromPath(paths.asset('icon.png'));
    sender.startDrag({ file, icon: icon.resize({ width: 96 }) });
  }

  menu(file, sender) {
    if (!this.known(file)) return;
    const isImage = IMAGE.test(file);
    const template = [
      { label: t('Copiar'), click: () => this.copy(file) },
      ...(isImage ? [{ label: t('Fixar na tela'), click: () => this.pin(file) }] : []),
      { label: t('Abrir'), click: () => this.launch(file) },
      { label: t('Mostrar na pasta'), click: () => shell.showItemInFolder(file) },
      { type: 'separator' },
      { label: t('Mover pra lixeira'), click: () => this.trash(file, sender) },
    ];
    this.menuOpen = true;
    Menu.buildFromTemplate(template).popup({
      window: BrowserWindow.fromWebContents(sender),
      callback: () => {
        this.menuOpen = false;
      },
    });
  }

  pin(file) {
    this.hide();
    this.pinFile(file);
  }

  async trash(file, sender) {
    if (!this.known(file)) return;
    try {
      await shell.trashItem(file);
    } catch {
      this.toast.show(t('Não deu pra mover o arquivo pra lixeira'), 'error');
      return;
    }
    if (!sender.isDestroyed()) sender.send('history:refresh');
  }

  async openFolder(kind) {
    try {
      const error = await shell.openPath(folders.ensure(kind));
      if (error) throw new Error(error);
      this.hide();
    } catch {
      this.toast.show(t('Não deu pra abrir a pasta. Confira o acesso nas configurações.'), 'error');
    }
  }
}

module.exports = { History };
