const path = require('path');
const { BrowserWindow, Menu, clipboard, ClipboardItem, nativeImage, screen, shell } = require('electron');
const paths = require('./paths');
const folders = require('./folders');
const { copyFileToClipboard } = require('./clipfile');
const { t } = require('../renderer/shared/i18n');
const { HistoryFiles } = require('./history-files');

const LIMIT = 30;
const SIZE = { width: 460, height: 560 };
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
  constructor({ toast, getSettings, pinFile, activeRecording = () => null }) {
    this.toast = toast;
    this.getSettings = getSettings;
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

  open() {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const area = display.workArea;
    const bounds = {
      x: Math.round(area.x + (area.width - SIZE.width) / 2),
      y: Math.round(area.y + (area.height - SIZE.height) / 2),
      ...SIZE,
    };
    if (this.win && !this.win.isDestroyed()) {
      this.win.setBounds(bounds);
      this.win.webContents.send('history:refresh');
      this.win.show();
      this.win.focus();
      return;
    }
    const win = new BrowserWindow({
      ...bounds,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
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
      win.show();
      win.focus();
    });
    win.on('blur', () => {
      if (!this.menuOpen && !win.isDestroyed()) win.hide();
    });
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
