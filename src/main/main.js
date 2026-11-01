const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, nativeImage, nativeTheme, screen, shell } = require('electron');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const settings = require('./settings');
const paths = require('./paths');
const background = require('./background');
const { Overlay } = require('./overlay');
const { Sensors } = require('./sensors');
const { Weather, searchCity } = require('./weather');
const { Capture } = require('./capture');
const { Toast } = require('./toast');
const { Recorder } = require('./recorder');
const i18n = require('../renderer/shared/i18n');
const { t } = i18n;

const PAWNIO_URL = 'https://pawnio.eu/';
const TITLE_BAR = {
  dark: { color: '#0d0f14', symbolColor: '#c9d1dc' },
  light: { color: '#eef1f5', symbolColor: '#3a4250' },
};

app.disableHardwareAcceleration();
app.setAppUserModelId('dev.paulo.ultragmonitor');
background.registerScheme();

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();

let overlay = null;
let sensors = null;
let weather = null;
let tray = null;
let settingsWin = null;
let lastSensors = null;
let capture = null;
let toast = null;
let recorder = null;

function toggleRecording() {
  if (recorder.active) recorder.stop();
  else capture.start('video');
}
let hotkeyStatus = {};

function hotkeys() {
  return settings.get().hotkeys || {};
}

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function displayList() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: `${t('Monitor')} ${i + 1} · ${d.size.width}×${d.size.height}${d.id === primary ? ` · ${t('principal')}` : ''}`,
  }));
}

function state() {
  return {
    sensor: sensors ? sensors.status : null,
    electronAdmin: sensors ? sensors.electronAdmin : false,
    displays: displayList(),
    hotkeys: hotkeys(),
    hotkeyStatus,
    version: app.getVersion(),
  };
}

function setStartWithWindows(on) {
  if (!app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: on });
    return;
  }
  const script = path.join(process.resourcesPath, 'setup', 'task.ps1');
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, on ? '-Enable' : '-Disable', '-Exe', process.execPath];
  const revert = (err) => {
    if (!err) return;
    settings.update({ startWithWindows: !on });
    broadcast('settings', settings.get());
  };
  if (sensors.electronAdmin) {
    execFile('powershell.exe', args, { windowsHide: true }, revert);
    return;
  }
  const line = args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ').replace(/'/g, "''");
  const command = `$ErrorActionPreference = "Stop"; try { Start-Process -FilePath powershell.exe -ArgumentList '${line}' -Verb RunAs -WindowStyle Hidden -Wait; exit 0 } catch { exit 1 }`;
  const encoded = Buffer.from(command, 'utf16le').toString('base64');
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true }, revert);
}

function taskbarIsLight() {
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'SystemUsesLightTheme'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return /0x1\b/.test(out);
  } catch {
    return false;
  }
}

function titleBarColors() {
  return nativeTheme.shouldUseDarkColors ? TITLE_BAR.dark : TITLE_BAR.light;
}

function applyTheme() {
  const theme = settings.get().theme;
  nativeTheme.themeSource = theme === 'light' || theme === 'dark' ? theme : 'system';
}

function paintSettingsWindow() {
  if (!settingsWin || settingsWin.isDestroyed()) return;
  const colors = titleBarColors();
  settingsWin.setTitleBarOverlay(colors);
  settingsWin.setBackgroundColor(colors.color);
}

function applySettings(patch) {
  const before = settings.get();
  const next = settings.update(patch);
  if (patch.locked !== undefined && patch.locked !== before.locked) overlay.applyLock();
  if (patch.hidden !== undefined) overlay.refreshVisibility();
  if (patch.layout !== undefined && patch.layout !== before.layout) {
    if (next.layout !== 'dock') overlay.autoHidden = false;
    overlay.sendDock({ light: taskbarIsLight() });
    overlay.place();
    overlay.refreshVisibility();
  }
  if (patch.fpsEnabled !== undefined && patch.fpsEnabled !== before.fpsEnabled) {
    if (next.fpsEnabled && lastSensors && !lastSensors.admin) startSensors(true);
    else sensors.setFps(next.fpsEnabled);
  }
  if (patch.city !== undefined) weather.refresh();
  if (patch.hotkeys !== undefined) registerHotkeys();
  if (patch.theme !== undefined) applyTheme();
  if (patch.language !== undefined) {
    i18n.setLang(next.language);
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.setTitle(t('UltraGMonitor · Configurações'));
    broadcast('state', state());
  }
  if (patch.startWithWindows !== undefined && patch.startWithWindows !== before.startWithWindows) setStartWithWindows(!!next.startWithWindows);
  broadcast('settings', next);
  refreshTray();
  return next;
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  const saved = savedSettingsBounds();
  settingsWin = new BrowserWindow({
    width: saved ? saved.width : 480,
    height: saved ? saved.height : 720,
    x: saved ? saved.x : undefined,
    y: saved ? saved.y : undefined,
    minWidth: 420,
    minHeight: 520,
    title: t('UltraGMonitor · Configurações'),
    backgroundColor: titleBarColors().color,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...titleBarColors(), height: 40 },
    icon: paths.asset('icon.png'),
    show: false,
    webPreferences: {
      preload: paths.preload(),
      contextIsolation: true,
      sandbox: true,
    },
  });
  settingsWin.loadFile(paths.page('settings'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  let boundsTimer = null;
  const rememberBounds = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (settingsWin && !settingsWin.isDestroyed() && !settingsWin.isMinimized() && !settingsWin.isMaximized()) {
        settings.update({ settingsBounds: settingsWin.getBounds() });
      }
    }, 400);
  };
  settingsWin.on('resize', rememberBounds);
  settingsWin.on('move', rememberBounds);
  settingsWin.on('closed', () => {
    clearTimeout(boundsTimer);
    settingsWin = null;
  });
}

function savedSettingsBounds() {
  const b = settings.get().settingsBounds;
  if (!b || !Number.isFinite(b.width) || !Number.isFinite(b.height)) return null;
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x < a.x + a.width - 80 && b.x + b.width > a.x + 80 && b.y >= a.y - 10 && b.y < a.y + a.height - 60;
  });
  return visible ? b : { width: b.width, height: b.height };
}

function toggleLock() {
  applySettings({ locked: !settings.get().locked });
}

function toggleFps() {
  const s = settings.get();
  const on = !s.fpsEnabled;
  applySettings({ fpsEnabled: on, modules: { fps: on ? true : s.modules.fps } });
}

function toggleVisible() {
  applySettings({ hidden: !settings.get().hidden });
}

function startSensors(elevated) {
  const s = settings.get();
  sensors.start({ elevated, fps: s.fpsEnabled });
}

function refreshTray() {
  if (!tray) return;
  const s = settings.get();
  const layoutItem = (value, label) => ({
    label,
    type: 'radio',
    checked: s.layout === value,
    click: () => applySettings({ layout: value }),
  });
  const opacityItem = (value) => ({
    label: `${Math.round(value * 100)}%`,
    type: 'radio',
    checked: Math.abs(s.opacity - value) < 0.01,
    click: () => applySettings({ opacity: value }),
  });
  const menu = Menu.buildFromTemplate([
    { label: t('Capturar tela'), accelerator: hotkeys().capture || undefined, click: () => capture.start() },
    {
      label: recorder && recorder.active ? t('Parar gravação') : t('Gravar vídeo'),
      accelerator: hotkeys().record || undefined,
      click: toggleRecording,
    },
    { type: 'separator' },
    { label: s.hidden ? t('Mostrar UltraGMonitor') : t('Esconder UltraGMonitor'), accelerator: hotkeys().visible || undefined, click: toggleVisible },
    { label: s.locked ? t('Destravar pra mover') : t('Travar posição'), accelerator: hotkeys().lock || undefined, click: toggleLock },
    { label: t('Medir FPS'), type: 'checkbox', checked: s.fpsEnabled, accelerator: hotkeys().fps || undefined, click: toggleFps },
    { type: 'separator' },
    { label: t('Visual'), submenu: [layoutItem('card', t('Card')), layoutItem('compact', t('Compacto')), layoutItem('bar', t('Barra')), layoutItem('dock', t('Dock (barra de tarefas)'))] },
    { label: t('Fundo'), submenu: [1, 0.82, 0.6, 0.35, 0].map(opacityItem) },
    {
      label: t('Mover pro monitor'),
      submenu: displayList().map((d) => ({ label: d.label, click: () => overlay.moveToDisplay(d.id) })),
    },
    { type: 'separator' },
    { label: t('Configurações…'), click: openSettings },
    { label: t('Reiniciar sensores como admin'), click: () => startSensors(true) },
    { type: 'separator' },
    { label: t('Sair'), click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip('UltraGMonitor');
}

function createTray() {
  const image = nativeImage.createFromPath(paths.asset('tray.png'));
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.on('click', openSettings);
  refreshTray();
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  const actions = {
    capture: () => capture.start(),
    record: toggleRecording,
    lock: toggleLock,
    fps: toggleFps,
    visible: toggleVisible,
  };
  hotkeyStatus = {};
  for (const [name, accelerator] of Object.entries(hotkeys())) {
    if (!accelerator || !actions[name]) continue;
    try {
      hotkeyStatus[name] = globalShortcut.register(accelerator, actions[name]) ? 'ok' : 'busy';
    } catch {
      hotkeyStatus[name] = 'invalid';
    }
  }
  broadcast('state', state());
}

function registerIpc() {
  ipcMain.handle('settings:get', () => settings.get());
  ipcMain.handle('settings:set', (_e, patch) => applySettings(patch || {}));
  ipcMain.handle('state:get', () => state());
  ipcMain.handle('sensors:last', () => lastSensors);
  ipcMain.handle('weather:last', () => weather.last);
  ipcMain.handle('weather:search', (_e, q) => searchCity(q).catch(() => []));
  ipcMain.handle('weather:refresh', () => weather.refresh());
  ipcMain.handle('sensors:restart', (_e, elevated) => startSensors(!!elevated));
  ipcMain.handle('overlay:move-to-display', (_e, id) => overlay.moveToDisplay(id));
  ipcMain.handle('open:pawnio', () => shell.openExternal(PAWNIO_URL));
  ipcMain.handle('open:settings', () => openSettings());
  ipcMain.handle('dock:info', () => overlay.dockInfo(overlay.dockExtra));
  ipcMain.handle('background:choose', async () => {
    const chosen = await background.choose(settingsWin);
    if (chosen) applySettings({ background: chosen });
    return settings.get();
  });
  ipcMain.handle('background:clear', () => {
    background.clear();
    return applySettings({ background: { file: null, kind: null, name: null } });
  });
  ipcMain.on('overlay:handle', (_e, rect) => overlay.setHandleRect(rect));
  ipcMain.handle('hotkeys:pause', () => globalShortcut.unregisterAll());
  ipcMain.handle('hotkeys:resume', () => registerHotkeys());
  ipcMain.handle('capture:image', () => capture.image());
  ipcMain.on('capture:ready', () => capture.ready());
  ipcMain.handle('capture:copy', (_e, png) => capture.copy(png));
  ipcMain.handle('capture:save', (_e, png) => capture.save(png));
  ipcMain.handle('capture:pin', (_e, png, rect) => capture.pin(png, rect));
  ipcMain.on('capture:close', () => capture.close());
  ipcMain.handle('record:start', (_e, cfg) => {
    settings.update({ recordSystemAudio: !!cfg.system, recordMic: !!cfg.mic });
    const display = capture.region();
    if (display) recorder.start({ display, ...cfg });
  });
  ipcMain.on('record:command', (_e, action) => {
    if (action === 'cancel') recorder.cancel();
    else recorder.command(action);
  });
  ipcMain.on('recorder:started', () => recorder.started());
  ipcMain.on('recorder:done', (_e, data, mime) => recorder.done(data, mime));
  ipcMain.on('recorder:error', (_e, message) => recorder.fail(message));
  ipcMain.on('window:close', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win && win !== overlay.win && win !== settingsWin) win.close();
  });
  ipcMain.on('overlay:resize', (_e, size) => {
    if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) overlay.resize(size.width, size.height);
  });
}

app.on('second-instance', openSettings);

app.whenReady().then(() => {
  if (!hasLock) return;
  settings.load();
  if (app.isPackaged && settings.isFirstRun()) settings.update({ startWithWindows: true });
  if (!i18n.LANGS.includes(settings.get().language)) settings.update({ language: i18n.pick(app.getLocale()) });
  i18n.setLang(settings.get().language);
  applyTheme();
  nativeTheme.on('updated', paintSettingsWindow);
  const s = settings.get();

  sensors = new Sensors({ exe: paths.sensorExe(), presentMon: paths.presentMonExe() });
  sensors.on('data', (data) => {
    lastSensors = data;
    overlay.setFullscreen(data.fullscreen);
    broadcast('sensors', data);
  });
  sensors.on('status', () => broadcast('state', state()));
  sensors.on('log', (msg) => console.log(msg));

  weather = new Weather(() => settings.get().city);
  weather.on('update', (data) => broadcast('weather', data));

  background.serve(() => settings.get().background);
  registerIpc();
  overlay = new Overlay(settings, { onLayout: applySettings });
  overlay.dockExtra = { light: taskbarIsLight() };
  overlay.create();
  toast = new Toast();
  recorder = new Recorder({
    toast,
    onChange: (state) => {
      if (overlay.win && !overlay.win.isDestroyed()) overlay.win.setContentProtection(state.active);
      refreshTray();
    },
  });
  capture = new Capture({
    sensors,
    toast,
    getSettings: () => settings.get(),
    beforeShot: () => {
      if (overlay.win && !overlay.win.isDestroyed()) overlay.win.hide();
    },
    afterShot: () => overlay.refreshVisibility(),
  });
  setTimeout(() => capture.warm(), 1500);
  createTray();
  registerHotkeys();

  startSensors(s.adminSensors || s.fpsEnabled);
  weather.start();

  screen.on('display-added', () => {
    refreshTray();
    broadcast('state', state());
  });
  screen.on('display-removed', () => {
    refreshTray();
    broadcast('state', state());
  });

  if (settings.isFirstRun() && !process.argv.includes('--autostart')) openSettings();
});

app.on('window-all-closed', () => {});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (sensors) sensors.stop();
  if (weather) weather.stop();
  settings.flush();
});
