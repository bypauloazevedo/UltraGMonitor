const { BrowserWindow, screen } = require('electron');
const paths = require('./paths');

const MARGIN = 16;
const SNAP = 40;
const DOCK_OFFSET = 220;
const PEEK_DELAY = 2000;
const HANDLE_DELAY = 250;
const HANDLE_GRACE = 700;

function dockArea(display) {
  const b = display.bounds;
  const w = display.workArea;
  const bottomGap = b.y + b.height - (w.y + w.height);
  if (bottomGap > 0) return { x: b.x, y: w.y + w.height, width: b.width, height: bottomGap };
  if (w.y > b.y) return { x: b.x, y: b.y, width: b.width, height: w.y - b.y };
  return { x: b.x, y: b.y + b.height - 48, width: b.width, height: 48 };
}

function contains(rect, point, pad = 0) {
  return point.x >= rect.x - pad && point.x < rect.x + rect.width + pad && point.y >= rect.y - pad && point.y < rect.y + rect.height + pad;
}

class Overlay {
  constructor(settings, { onLayout }) {
    this.settings = settings;
    this.onLayout = onLayout;
    this.win = null;
    this.size = { width: 320, height: 200 };
    this.timers = [];
    this.placing = false;
    this.autoHidden = false;
    this.hoverSince = 0;
    this.peeking = false;
    this.ticks = 0;
    this.ignoring = null;
    this.handleRect = null;
    this.handleShown = false;
    this.enterAt = 0;
    this.lastInside = 0;
  }

  create() {
    const win = new BrowserWindow({
      width: this.size.width,
      height: this.size.height,
      useContentSize: true,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      alwaysOnTop: true,
      show: false,
      title: 'UltraGMonitor',
      webPreferences: {
        preload: paths.preload(),
        backgroundThrottling: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    this.win = win;
    win.setAlwaysOnTop(true, 'screen-saver');
    win.loadFile(paths.page('overlay'));
    win.once('ready-to-show', () => {
      this.place();
      this.applyLock();
      this.refreshVisibility();
    });
    win.on('moved', () => this.onMoved());
    this.timers.push(setInterval(() => this.keepOnTop(), 500));
    this.timers.push(setInterval(() => this.tickPointer(), 100));
    win.on('closed', () => {
      this.timers.forEach(clearInterval);
      this.win = null;
    });
    for (const event of ['display-removed', 'display-added', 'display-metrics-changed']) {
      screen.on(event, () => {
        this.place();
        this.sendDock();
      });
    }
    return win;
  }

  alive() {
    return this.win && !this.win.isDestroyed();
  }

  isDock() {
    return this.settings.get().layout === 'dock';
  }

  defaultPosition() {
    return { displayId: screen.getPrimaryDisplay().id, anchorX: 'right', anchorY: 'top', offsetX: MARGIN * 2, offsetY: MARGIN * 2 };
  }

  findDisplay(id) {
    return screen.getAllDisplays().find((d) => d.id === id) || screen.getPrimaryDisplay();
  }

  dockDisplay() {
    const s = this.settings.get();
    const id = s.dock ? s.dock.displayId : (s.position || this.defaultPosition()).displayId;
    return this.findDisplay(id);
  }

  dockInfo(extra) {
    return { height: dockArea(this.dockDisplay()).height, ...extra };
  }

  sendDock(extra) {
    this.dockExtra = { ...this.dockExtra, ...extra };
    this.send('dock', this.dockInfo(this.dockExtra));
  }

  place() {
    if (!this.alive()) return;
    const { width, height } = this.size;
    let x;
    let y;
    if (this.isDock()) {
      const dock = this.settings.get().dock || {};
      const area = dockArea(this.dockDisplay());
      const offset = Number.isFinite(dock.offsetX) ? dock.offsetX : DOCK_OFFSET;
      x = area.x + Math.max(0, Math.min(offset, area.width - width));
      y = area.y + (area.height - height) / 2;
    } else {
      const pos = this.settings.get().position || this.defaultPosition();
      const area = this.findDisplay(pos.displayId).workArea;
      const offsetX = Math.max(0, Math.min(pos.offsetX, area.width - width));
      const offsetY = Math.max(0, Math.min(pos.offsetY, area.height - height));
      x = pos.anchorX === 'left' ? area.x + offsetX : area.x + area.width - offsetX - width;
      y = pos.anchorY === 'top' ? area.y + offsetY : area.y + area.height - offsetY - height;
    }
    this.placing = true;
    this.win.setBounds({ x: Math.round(x), y: Math.round(y), width, height });
    this.placing = false;
  }

  positionFrom(bounds) {
    const display = screen.getDisplayMatching(bounds);
    const area = display.workArea;
    const left = bounds.x - area.x;
    const right = area.x + area.width - (bounds.x + bounds.width);
    const top = bounds.y - area.y;
    const bottom = area.y + area.height - (bounds.y + bounds.height);
    const snap = (v) => (v < SNAP ? MARGIN : v);
    return {
      displayId: display.id,
      anchorX: left <= right ? 'left' : 'right',
      anchorY: top <= bottom ? 'top' : 'bottom',
      offsetX: snap(Math.max(0, Math.min(left, right))),
      offsetY: snap(Math.max(0, Math.min(top, bottom))),
    };
  }

  onMoved() {
    if (this.placing || !this.alive()) return;
    const bounds = this.win.getBounds();
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const area = dockArea(display);
    const wasDock = this.isDock();
    if (process.platform === 'win32' && contains(area, cursor, 6)) {
      const offsetX = wasDock ? bounds.x - area.x : cursor.x - area.x - 24;
      this.settings.update({ dock: { displayId: display.id, offsetX: Math.max(0, Math.round(offsetX)) } });
      if (wasDock) this.place();
      else this.onLayout({ layoutBeforeDock: this.settings.get().layout, layout: 'dock' });
      return;
    }
    this.settings.update({ position: this.positionFrom(bounds) });
    if (wasDock) this.onLayout({ layout: this.settings.get().layoutBeforeDock || 'card' });
    else this.place();
  }

  moveToDisplay(displayId) {
    if (this.isDock()) {
      const dock = this.settings.get().dock || {};
      this.settings.update({ dock: { ...dock, displayId } });
    } else {
      const current = this.settings.get().position || this.defaultPosition();
      this.settings.update({ position: { ...current, displayId } });
    }
    this.place();
    this.sendDock();
  }

  resize(width, height) {
    const w = Math.max(40, Math.ceil(width));
    const h = Math.max(20, Math.ceil(height));
    if (w === this.size.width && h === this.size.height) return;
    this.size = { width: w, height: h };
    this.place();
  }

  setIgnore(ignore) {
    if (!this.alive() || this.ignoring === ignore) return;
    this.ignoring = ignore;
    this.win.setIgnoreMouseEvents(ignore);
  }

  applyLock() {
    this.setIgnore(this.settings.get().locked);
    if (!this.settings.get().locked) this.setHandle(false);
  }

  setHandleRect(rect) {
    this.handleRect = rect && Number.isFinite(rect.x) ? rect : null;
  }

  setHandle(on) {
    if (this.handleShown === on) return;
    this.handleShown = on;
    this.send('handle', on);
  }

  refreshVisibility() {
    if (!this.alive()) return;
    const s = this.settings.get();
    const visible = !s.hidden && s.monitoring !== false && !this.autoHidden;
    if (visible) {
      if (!this.win.isVisible()) this.win.showInactive();
      this.win.setAlwaysOnTop(true, 'screen-saver');
    } else if (this.win.isVisible()) {
      this.win.hide();
    }
  }

  setFullscreen(info) {
    let hide = false;
    if (this.isDock() && info && info.active) {
      const point = screen.screenToDipPoint({ x: info.x, y: info.y });
      hide = screen.getDisplayNearestPoint(point).id === this.dockDisplay().id;
    }
    if (hide === this.autoHidden) return;
    this.autoHidden = hide;
    this.refreshVisibility();
  }

  keepOnTop() {
    if (!this.alive() || !this.win.isVisible()) return;
    this.ticks += 1;
    if (this.isDock()) {
      this.win.setAlwaysOnTop(true, 'screen-saver');
      this.win.moveTop();
    } else if (this.ticks % 8 === 0) {
      this.win.setAlwaysOnTop(true, 'screen-saver');
    }
  }

  tickPointer() {
    const s = this.settings.get();
    if (!this.alive() || !this.win.isVisible() || !s.locked) {
      this.enterAt = 0;
      this.hoverSince = 0;
      this.setPeek(false);
      this.setHandle(false);
      return;
    }
    const now = Date.now();
    const bounds = this.win.getBounds();
    const cursor = screen.getCursorScreenPoint();
    const inside = contains(bounds, cursor);
    if (inside) {
      this.lastInside = now;
      if (!this.enterAt) this.enterAt = now;
    } else {
      this.enterAt = 0;
    }
    const show = (inside && now - this.enterAt >= HANDLE_DELAY) || (this.handleShown && now - this.lastInside < HANDLE_GRACE);
    this.setHandle(show);
    const local = { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
    const overHandle = show && this.handleRect && contains(this.handleRect, local, 4);
    this.setIgnore(!overHandle);
    if (s.hoverFade && inside && !overHandle) {
      if (!this.hoverSince) this.hoverSince = now;
      if (now - this.hoverSince >= PEEK_DELAY) this.setPeek(true);
    } else {
      this.hoverSince = 0;
      this.setPeek(false);
    }
  }

  setPeek(on) {
    if (this.peeking === on) return;
    this.peeking = on;
    this.send('peek', on);
  }

  send(channel, payload) {
    if (this.alive()) this.win.webContents.send(channel, payload);
  }
}

module.exports = { Overlay, dockArea };
