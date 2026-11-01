const { BrowserWindow, screen } = require('electron');
const paths = require('./paths');

const WIDTH = 360;
const HEIGHT = 64;

class Toast {
  constructor() {
    this.win = null;
    this.timer = null;
  }

  ensure() {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: paths.preload(),
        contextIsolation: true,
        sandbox: true,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true);
    win.setContentProtection(true);
    win.loadFile(paths.page('toast'));
    this.win = win;
    return win;
  }

  show(message, kind = 'ok', display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())) {
    const win = this.ensure();
    const area = display.workArea;
    win.setBounds({
      x: Math.round(area.x + (area.width - WIDTH) / 2),
      y: Math.round(area.y + area.height - HEIGHT - 48),
      width: WIDTH,
      height: HEIGHT,
    });
    const send = () => win.webContents.send('toast', { message, kind });
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send);
    else send();
    win.showInactive();
    win.moveTop();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!win.isDestroyed()) win.hide();
    }, 1900);
  }
}

module.exports = { Toast };
