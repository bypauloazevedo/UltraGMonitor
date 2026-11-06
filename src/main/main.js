const { app, BrowserWindow, Tray, Menu, Notification, dialog, ipcMain, globalShortcut, nativeImage, nativeTheme, screen, shell } = require('electron');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const settings = require('./settings');
const paths = require('./paths');
const folders = require('./folders');
const background = require('./background');
const { Overlay } = require('./overlay');
const IS_WIN = process.platform === 'win32';
const { Sensors } = IS_WIN ? require('./sensors') : require('./sensors-linux');
const { setLinuxAutostart } = require('./autostart');
const { Weather, searchCity } = require('./weather');
const { Capture } = require('./capture');
const { Toast } = require('./toast');
const { Recorder } = require('./recorder');
const { Updates, upgradeWithWinget } = require('./updates');
const { History } = require('./history');
const { Ocr } = require('./ocr');
const i18n = require('../renderer/shared/i18n');
const { t } = i18n;

const PAWNIO_URL = 'https://pawnio.eu/';
const TITLE_BAR = {
  dark: { color: '#0d0f14', symbolColor: '#c9d1dc' },
  light: { color: '#eef1f5', symbolColor: '#3a4250' },
};

app.disableHardwareAcceleration();
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform', 'x11');
  app.commandLine.appendSwitch('enable-transparent-visuals');
}
app.setAppUserModelId('dev.paulo.ultragmonitor');
background.registerScheme();

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();

let overlay = null;
let sensors = null;
let keyboard = null;
let weather = null;
let tray = null;
let settingsWin = null;
let lastSensors = null;
let capture = null;
let toast = null;
let recorder = null;
let updates = null;
let updateNotice = null;
let updating = false;
let history = null;
let ocr = null;

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
    if (!win.isDestroyed() && (!['sensors', 'weather'].includes(channel) || (win.isVisible() && !win.isMinimized()))) win.webContents.send(channel, payload);
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
    captureShortcut: keyboard ? keyboard.status : null,
    version: app.getVersion(),
    update: updates ? updates.latest : null,
    folders: { shots: folders.folder('shots'), videos: folders.folder('videos') },
    platform: process.platform,
    persistence: settings.persistence(),
  };
}

function monitoringOn() {
  return settings.get().monitoring !== false;
}

function openHistory() {
  if (capture && capture.busy) capture.close();
  history.open();
}

async function chooseFolder(kind) {
  const result = await dialog.showOpenDialog(settingsWin || undefined, {
    title: kind === 'shots' ? t('Escolher a pasta dos prints') : t('Escolher a pasta dos vídeos'),
    defaultPath: folders.folder(kind),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return settings.get();
  return applySettings({ [folders.KEYS[kind]]: result.filePaths[0] });
}

function setStartWithWindows(on) {
  if (process.platform === 'linux') {
    try {
      setLinuxAutostart(on);
    } catch {
      settings.update({ startWithWindows: !on });
      broadcast('settings', settings.get());
    }
    return;
  }
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
  if (!IS_WIN) return false;
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
  patch = settings.sanitize(patch);
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
    if (next.fpsEnabled && monitoringOn() && lastSensors && !lastSensors.admin) startSensors(true);
    else sensors.setFps(next.fpsEnabled && monitoringOn());
  }
  if (patch.monitoring !== undefined && patch.monitoring !== before.monitoring) {
    const on = monitoringOn();
    sensors.setMonitoring(on);
    if (on && next.fpsEnabled && lastSensors && !lastSensors.admin) startSensors(true);
    else sensors.setFps(on && next.fpsEnabled);
    overlay.refreshVisibility();
  }
  if (patch.captureWinShiftS !== undefined) setCaptureShortcut(!!next.captureWinShiftS);
  if (patch.shotsFolder !== undefined || patch.videosFolder !== undefined) broadcast('state', state());
  if (patch.city !== undefined) weather.refresh();
  if (patch.hotkeys !== undefined) registerHotkeys();
  if (patch.theme !== undefined) applyTheme();
  if (patch.language !== undefined) {
    i18n.setLang(next.language);
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.setTitle(t('UltraGMonitor · Configurações'));
    broadcast('state', state());
  }
  if (patch.startWithWindows !== undefined && patch.startWithWindows !== before.startWithWindows) setStartWithWindows(!!next.startWithWindows);
  if (patch.updateCheck === true && before.updateCheck === false) updates.check();
  broadcast('settings', next);
  refreshTray();
  return next;
}

function openSettings() {
  if (capture && capture.busy) capture.close();
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.emit('settings:present');
    return;
  }
  const saved = savedSettingsBounds();
  const win = new BrowserWindow({
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
  settingsWin = win;
  let loaded = false;
  let initialized = false;
  let presentTimer = null;
  const present = () => {
    if (!loaded || !initialized || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    clearTimeout(presentTimer);
    presentTimer = setTimeout(() => {
      if (!win.isDestroyed() && !win.isVisible()) {
        win.show();
        win.focus();
      }
    }, 50);
  };
  const startupTimer = setTimeout(() => {
    if (win.isDestroyed() || loaded && initialized) return;
    win.destroy();
    dialog.showErrorBox(t('Configurações indisponíveis'), t('Não deu pra carregar as configurações. Tente abrir de novo.'));
  }, 10000);
  win.on('settings:present', present);
  win.once('settings:ready', () => {
    initialized = true;
    present();
  });
  win.loadFile(paths.page('settings')).then(() => {
    loaded = true;
    present();
  }).catch((error) => console.error('falha ao abrir configurações', error));
  let boundsTimer = null;
  const rememberBounds = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (settingsWin && !settingsWin.isDestroyed() && !settingsWin.isMinimized() && !settingsWin.isMaximized()) {
        settings.update({ settingsBounds: settingsWin.getBounds() });
      }
    }, 400);
  };
  win.on('resize', rememberBounds);
  win.on('move', rememberBounds);
  win.on('closed', () => {
    clearTimeout(boundsTimer);
    clearTimeout(presentTimer);
    clearTimeout(startupTimer);
    if (settingsWin === win) settingsWin = null;
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
  if (!monitoringOn()) {
    applySettings({ monitoring: true, hidden: false });
    return;
  }
  applySettings({ hidden: !settings.get().hidden });
}

function startSensors(elevated) {
  const s = settings.get();
  sensors.monitoring = monitoringOn();
  sensors.start({ elevated, fps: s.fpsEnabled && monitoringOn() });
}

function setCaptureShortcut(on) {
  if (!keyboard) return;
  if (!on) {
    keyboard.stop();
    keyboard.setStatus({ enabled: false, running: false, starting: false, hookActive: false });
    return;
  }
  keyboard.setStatus({ enabled: true });
  if (!keyboard.server && !keyboard.status.starting) {
    keyboard.hook = true;
    keyboard.start({ elevated: false, fps: false });
  }
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
  const update = updates && updates.latest;
  const menu = Menu.buildFromTemplate([
    ...(update ? [{ label: t('Atualizar pra versão {v}', { v: update.version }), enabled: !updating, click: openUpdate }, { type: 'separator' }] : []),
    { label: t('Capturar tela'), accelerator: hotkeys().capture || undefined, click: () => capture.start() },
    {
      label: recorder && recorder.active ? t('Parar gravação') : t('Gravar vídeo'),
      accelerator: hotkeys().record || undefined,
      click: toggleRecording,
    },
    { label: t('Últimos prints'), accelerator: hotkeys().history || undefined, click: openHistory },
    { type: 'separator' },
    { label: t('Monitoramento'), type: 'checkbox', checked: monitoringOn(), click: () => applySettings({ monitoring: !monitoringOn() }) },
    ...(monitoringOn()
      ? [
          { label: s.hidden ? t('Mostrar UltraGMonitor') : t('Esconder UltraGMonitor'), accelerator: hotkeys().visible || undefined, click: toggleVisible },
          { label: s.locked ? t('Destravar pra mover') : t('Travar posição'), accelerator: hotkeys().lock || undefined, click: toggleLock },
          ...(IS_WIN ? [{ label: t('Medir FPS'), type: 'checkbox', checked: s.fpsEnabled, accelerator: hotkeys().fps || undefined, click: toggleFps }] : []),
          { type: 'separator' },
          {
            label: t('Visual'),
            submenu: [layoutItem('card', t('Card')), layoutItem('compact', t('Compacto')), layoutItem('bar', t('Barra')), ...(IS_WIN ? [layoutItem('dock', t('Dock (barra de tarefas)'))] : [])],
          },
          { label: t('Fundo'), submenu: [1, 0.82, 0.6, 0.35, 0].map(opacityItem) },
          {
            label: t('Mover pro monitor'),
            submenu: displayList().map((d) => ({ label: d.label, click: () => overlay.moveToDisplay(d.id) })),
          },
        ]
      : []),
    { type: 'separator' },
    { label: t('Configurações…'), click: openSettings },
    ...(monitoringOn() && IS_WIN ? [{ label: t('Reiniciar sensores como admin'), click: () => startSensors(true) }] : []),
    { type: 'separator' },
    { label: t('Sair'), click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip('UltraGMonitor');
}

async function openUpdate() {
  const update = updates && updates.latest;
  if (!update || updating) return;
  if (!app.isPackaged || !IS_WIN) {
    shell.openExternal(update.url);
    return;
  }
  updating = true;
  refreshTray();
  toast.show(`${t('Atualizando pra versão {v}', { v: update.version })}|${t('O app fecha e abre de novo sozinho')}`, 'ok');
  const ok = await upgradeWithWinget();
  updating = false;
  refreshTray();
  if (!ok) shell.openExternal(update.url);
}

function onUpdate(info) {
  refreshTray();
  broadcast('state', state());
  if (settings.get().updateNotified === info.version || !Notification.isSupported()) return;
  settings.update({ updateNotified: info.version });
  updateNotice = new Notification({
    title: t('Nova versão do UltraGMonitor'),
    body: t('A versão {v} já pode ser instalada. Clique pra atualizar.', { v: info.version }),
    icon: paths.asset('icon.png'),
  });
  updateNotice.on('click', openUpdate);
  updateNotice.show();
}

function createTray() {
  const image = nativeImage.createFromPath(paths.asset('tray.png'));
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.on('click', openSettings);
  refreshTray();
}

function registerHotkeys() {
  if (capture) capture.releaseKeys();
  globalShortcut.unregisterAll();
  const actions = {
    capture: () => capture.start(),
    record: toggleRecording,
    history: openHistory,
    lock: toggleLock,
    fps: IS_WIN ? toggleFps : null,
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
  if (capture) capture.holdKeys();
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
  ipcMain.handle('open:update', openUpdate);
  ipcMain.handle('folder:choose', (_e, kind) => (folders.KEYS[kind] ? chooseFolder(kind) : settings.get()));
  ipcMain.handle('folder:open', async (_e, kind) => {
    if (!folders.KEYS[kind]) return '';
    try {
      const error = await shell.openPath(folders.ensure(kind));
      if (error) throw new Error(error);
      return '';
    } catch {
      toast.show(t('Não deu pra abrir a pasta. Confira o acesso nas configurações.'), 'error');
      return 'pasta indisponível';
    }
  });
  ipcMain.on('history:open', openHistory);
  ipcMain.handle('history:list', () => history.list());
  ipcMain.handle('history:copy', (_e, file) => history.copy(String(file)));
  ipcMain.on('history:drag', (e, file) => history.drag(String(file), e.sender));
  ipcMain.on('history:menu', (e, file) => history.menu(String(file), e.sender));
  ipcMain.on('history:folder', (_e, kind) => {
    if (folders.KEYS[kind]) history.openFolder(kind);
  });
  ipcMain.on('history:close', () => history.hide());
  ipcMain.handle('open:settings', () => openSettings());
  ipcMain.on('settings:ready', (e) => {
    if (settingsWin && !settingsWin.isDestroyed() && e.sender === settingsWin.webContents) settingsWin.emit('settings:ready');
  });
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
  ipcMain.on('overlay:handle', (e, rect) => { if (e.sender === overlay.win?.webContents) overlay.setHandleRect(rect); });
  ipcMain.handle('hotkeys:pause', () => { globalShortcut.unregisterAll(); if (keyboard) keyboard.setHook(false); });
  ipcMain.handle('hotkeys:resume', () => { registerHotkeys(); if (keyboard && settings.get().captureWinShiftS) keyboard.setHook(true); });
  ipcMain.handle('capture:image', (e) => capture.image(e.sender));
  ipcMain.on('capture:ready', (e, session) => { if (capture.owns(e.sender)) capture.ready(session, e.sender); });
  ipcMain.on('capture:select', (e, session) => capture.select(session, e.sender));
  ipcMain.on('capture:options', (e, value) => capture.setOptions(value?.session, e.sender, value));
  ipcMain.handle('capture:copy', (e, png) => capture.use(e.sender) ? capture.copy(png) : false);
  ipcMain.handle('capture:save', (e, png) => capture.use(e.sender) ? capture.save(png) : false);
  ipcMain.handle('capture:pin', (e, png, rect) => capture.use(e.sender) ? capture.pin(png, rect) : false);
  ipcMain.on('capture:close', (e) => { if (capture.owns(e.sender)) capture.close(); });
  ipcMain.handle('capture:ocr', async (e, png) => {
    if (!capture.owns(e.sender)) return { status: 'cancelled' };
    try {
      return await ocr.recognize(png, (value) => {
        if (capture.owns(e.sender)) e.sender.send('ocr:progress', value);
      });
    } catch { return { status: 'error' }; }
  });
  ipcMain.handle('capture:ocr-cancel', (e) => { if (capture.owns(e.sender)) ocr.cancel(); });
  ipcMain.handle('capture:copy-text', (e, text) => capture.owns(e.sender) ? capture.copyText(text) : false);
  ipcMain.handle('capture:keys', (e, enabled) => {
    if (!capture.owns(e.sender)) return false;
    capture.setKeysEnabled(enabled, e.sender);
    return true;
  });
  ipcMain.handle('record:start', (e, cfg) => {
    if (!capture.use(e.sender)) return false;
    settings.update({ recordSystemAudio: !!cfg.system, recordMic: !!cfg.mic });
    const display = capture.region();
    if (display) recorder.start({ display, ...cfg });
  });
  ipcMain.on('record:command', (_e, action) => {
    if (action === 'cancel') recorder.cancel();
    else recorder.command(action);
  });
  ipcMain.on('recorder:started', (e) => { if (recorder.owns(e.sender)) recorder.started(); });
  ipcMain.handle('recorder:open', (e, mime) => recorder.owns(e.sender) ? recorder.open(mime) : false);
  ipcMain.handle('recorder:chunk', (e, data) => recorder.owns(e.sender) ? recorder.append(data) : false);
  ipcMain.handle('recorder:done', (e) => recorder.owns(e.sender) ? recorder.done() : false);
  ipcMain.on('recorder:warning', (e, message) => { if (recorder.owns(e.sender)) recorder.warning(message); });
  ipcMain.on('recorder:error', (e, message) => { if (recorder.owns(e.sender)) recorder.fail(message); });
  ipcMain.on('window:close', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win && win !== overlay.win && win !== settingsWin) win.close();
  });
  ipcMain.on('overlay:resize', (e, size) => {
    if (e.sender === overlay.win?.webContents && size && Number.isFinite(size.width) && Number.isFinite(size.height)) overlay.resize(size.width, size.height);
  });
}

function runCommand(argv) {
  if (!capture) return false;
  if (argv.includes('--capture')) capture.start();
  else if (argv.includes('--record')) toggleRecording();
  else if (argv.includes('--history')) openHistory();
  else return false;
  return true;
}

app.on('second-instance', (_e, argv) => {
  if (!runCommand(argv)) openSettings();
});

app.whenReady().then(() => {
  if (!hasLock) return;
  settings.load();
  settings.onPersistence(() => broadcast('state', state()));
  if (!IS_WIN && settings.get().layout === 'dock') settings.update({ layout: settings.get().layoutBeforeDock || 'card' });
  if (app.isPackaged && settings.isFirstRun()) settings.update({ startWithWindows: true });
  if (!i18n.LANGS.includes(settings.get().language)) settings.update({ language: i18n.pick(app.getLocale()) });
  i18n.setLang(settings.get().language);
  applyTheme();
  nativeTheme.on('updated', paintSettingsWindow);
  const s = settings.get();

  sensors = new Sensors({ exe: paths.sensorExe(), presentMon: paths.presentMonExe() });
  sensors.on('data', (data) => {
    lastSensors = { ...data, receivedAt: Date.now() };
    overlay.setFullscreen(data.fullscreen);
    broadcast('sensors', lastSensors);
  });
  sensors.on('status', () => broadcast('state', state()));
  if (process.argv.includes('--smoke-test')) {
    let readings = 0;
    sensors.on('data', (data) => {
      readings += 1;
      if (readings < 2) return;
      process.stdout.write(`${JSON.stringify({ platform: process.platform, cpu: data.cpu, gpu: data.gpu, ram: data.ram, disks: (data.disks || []).map((d) => d.name) })}\n`);
      app.exit(0);
    });
    setTimeout(() => app.exit(1), 30000);
  }
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
    beforeShot: () => overlay.setCapturing(true),
    afterShot: () => overlay.setCapturing(false),
    onClose: () => { if (ocr) ocr.cancel(); },
  });
  if (IS_WIN) {
    keyboard = new Sensors({ exe: paths.keyboardExe(), keyboardOnly: true });
    keyboard.on('status', () => broadcast('state', state()));
    keyboard.on('log', (message) => console.log(message));
    keyboard.on('key', (name) => {
      if (name === 'capture' && settings.get().captureWinShiftS) capture.start();
    });
    setCaptureShortcut(!!s.captureWinShiftS);
  }
  ocr = new Ocr();
  history = new History({ toast, getSettings: () => settings.get(), saveSettings: (patch) => settings.update(patch), pinFile: (file) => capture.pinFile(file), activeRecording: () => recorder.file && recorder.file.partial });
  setTimeout(() => capture.warm(), 1500);
  createTray();
  registerHotkeys();

  startSensors(s.adminSensors || (s.fpsEnabled && monitoringOn()));
  weather.start();
  updates = new Updates(app.getVersion(), () => settings.get().updateCheck !== false);
  updates.on('update', onUpdate);
  updates.start();

  screen.on('display-added', () => {
    refreshTray();
    broadcast('state', state());
  });
  screen.on('display-removed', () => {
    refreshTray();
    broadcast('state', state());
  });

  if (['--capture', '--record', '--history'].some((flag) => process.argv.includes(flag))) setTimeout(() => runCommand(process.argv), 1500);
  else if (settings.isFirstRun() && !process.argv.includes('--autostart')) openSettings();
});

app.on('window-all-closed', () => {});

app.on('browser-window-focus', (_event, win) => {
  if (win === settingsWin && capture && capture.busy) capture.close();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (sensors) sensors.stop();
  if (keyboard) keyboard.stop();
  if (weather) weather.stop();
  if (updates) updates.stop();
  if (ocr) ocr.cancel();
  settings.flush();
});
