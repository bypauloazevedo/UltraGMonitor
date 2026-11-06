const { app, BrowserWindow, ipcMain, nativeTheme, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');

app.disableHardwareAcceleration();
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ultragmonitor-visual-'));
app.setPath('userData', path.join(output, 'dados'));
const settings = require('../src/main/settings');
const pages = path.resolve(__dirname, '../src/renderer');
const errors = [];
const windows = [];
let status = { running: true, starting: false, missing: false };
let historyItems = [];
let captureShortcut = null;
const sample = () => ({ receivedAt: Date.now(), admin: false, pawnio: true, cpu: { name: 'Intel Core i7-12700F', load: 26, clock: 4200, temp: null, maxCore: 65 }, gpu: { name: 'NVIDIA GeForce RTX 4060 Ti', load: 99, temp: 52, vramUsed: 3600, vramTotal: 8192, power: 90 }, ram: { load: 78, used: 24.8, total: 31.84 }, disks: [{ id: 'ssd', name: 'SSD', system: true, activity: 8, read: 12000000, write: 400000, temp: null }], fps: { enabled: false } });
const weather = { temp: 30, icon: 'clear', isDay: true, city: 'Vila Valqueire', max: 32, min: 23, rain: 10, raining: false };
const state = () => ({ platform: 'win32', version: '0.5.0', sensor: status, captureShortcut, displays: [{ id: 1, label: 'Monitor principal' }], hotkeys: {}, hotkeyStatus: {}, folders: { shots: output, videos: output }, persistence: {} });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function create(page, width, height) {
  const win = new BrowserWindow({ width, height, show: false, backgroundColor: '#17202c', webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, sandbox: true, preload: path.resolve(__dirname, '../src/preload/preload.js') } });
  windows.push(win);
  win.webContents.on('console-message', (...args) => {
    const detail = args.find((value) => value && typeof value === 'object' && typeof value.message === 'string');
    if (detail && (detail.level === 'error' || detail.level === 3)) errors.push(detail.message);
    else if (args[1] === 3) errors.push(args[2]);
  });
  win.webContents.on('preload-error', (_event, _file, error) => errors.push(error.message));
  await win.loadFile(path.join(pages, page, 'index.html'));
  await wait(650);
  return win;
}

async function screenshot(win, name) {
  const image = await win.webContents.capturePage();
  assert.ok(!image.isEmpty());
  fs.writeFileSync(path.join(output, `${name}.png`), image.toPNG());
}

app.whenReady().then(async () => {
  try {
    settings.load();
    settings.update({ language: 'pt', locked: false, layout: 'card', cardLayout: 'tall', opacity: 0.45, city: { name: 'Vila Valqueire', latitude: -22.8, longitude: -43.3 } });
    for (const [name, fn] of Object.entries({
      'settings:get': () => settings.get(), 'state:get': state, 'sensors:last': sample, 'weather:last': () => weather,
      'dock:info': () => ({ height: 48, light: false }), 'hotkeys:pause': () => {}, 'hotkeys:resume': () => {},
      'settings:set': (_event, patch) => { settings.update(patch); for (const win of windows) if (!win.isDestroyed()) win.webContents.send('settings', settings.get()); return settings.get(); },
      'history:list': () => ({ items: historyItems, warning: historyItems.length === 0 }),
    })) ipcMain.handle(name, fn);
    const overlay = await create('overlay', 420, 900);
    const diagnostic = await overlay.webContents.executeJavaScript('document.querySelector(".sensor-health")?.textContent || document.body.innerText');
    assert.match(diagnostic, /precisa de administrador/);
    assert.equal(await overlay.webContents.executeJavaScript(`document.querySelector(${JSON.stringify('[data-k="gpu.tone"]')}).dataset.level || ""`), '');
    await screenshot(overlay, 'widget-diagnostico');
    status = { running: false, starting: false };
    overlay.webContents.send('state', state());
    await wait(100);
    assert.equal(await overlay.webContents.executeJavaScript(`document.querySelector(${JSON.stringify('[data-k="cpu.value"]')}).textContent`), '—');
    await screenshot(overlay, 'widget-interrompido');
    status = { running: true, starting: false };
    settings.update({ locked: true, cardLayout: 'grid', theme: 'dark' });
    const config = await create('settings', 1280, 900);
    settings.update({ captureWinShiftS: true });
    config.webContents.send('settings', settings.get());
    for (const [status, text] of [[{ hookActive: true }, 'Win+Shift+S ativo'], [{ starting: true }, 'Ativando'], [{ hookActive: false, starting: false }, 'Tentando reconectar']]) {
      captureShortcut = status;
      config.webContents.send('state', state());
      await wait(50);
      assert.match(await config.webContents.executeJavaScript('document.getElementById("capture-shortcut-status").textContent'), new RegExp(text.replaceAll('+', '\\+')));
    }
    settings.update({ captureWinShiftS: false });
    config.webContents.send('settings', settings.get());
    await config.webContents.executeJavaScript('document.querySelector("#tabs [data-tab=aparencia]").click()');
    await wait(1200);
    const preview = await config.webContents.executeJavaScript('document.querySelector("#widget-preview iframe")?.contentDocument?.querySelector(".card")?.textContent || ""');
    assert.match(preview, /RAM/);
    assert.equal(await config.webContents.executeJavaScript('document.querySelectorAll("#fonts-display button:not([hidden])").length'), 6);
    await screenshot(config, 'aparencia-escuro');
    await config.webContents.executeJavaScript('document.querySelector("#fonts-more").click()');
    assert.equal(await config.webContents.executeJavaScript('document.querySelectorAll("#fonts-display button:not([hidden])").length'), 16);
    settings.update({ theme: 'light' });
    nativeTheme.themeSource = 'light';
    config.webContents.send('settings', settings.get());
    config.setBounds({ width: 480, height: 900 });
    await wait(500);
    assert.equal(await config.webContents.executeJavaScript('document.documentElement.scrollWidth <= window.innerWidth'), true);
    await screenshot(config, 'aparencia-claro-estreito');
    const history = await create('history', 460, 560);
    assert.equal(await history.webContents.executeJavaScript('document.getElementById("history-warning").hidden'), false);
    await screenshot(history, 'historico-aviso');
    const thumb = nativeImage.createFromBitmap(Buffer.alloc(32 * 20 * 4, 160), { width: 32, height: 20 }).toDataURL();
    historyItems = Array.from({ length: 12 }, (_v, index) => ({ file: path.join(output, `imagem-${index}.png`), name: `Imagem ${index}`, thumb, kind: 'image', size: 1024, time: Date.now() }));
    history.webContents.send('history:refresh');
    await wait(150);
    history.setContentSize(960, 640);
    await wait(100);
    const historyJs = code => history.webContents.executeJavaScript(code);
    assert.equal(await historyJs('getComputedStyle(grid).gridTemplateColumns.split(" ").length'), 4);
    await historyJs('grid.querySelector(".item").focus();true;');
    history.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'DOWN' });
    history.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'DOWN' });
    await wait(40);
    assert.equal(await historyJs('document.activeElement.dataset.index'), '4');
    assert.equal(await historyJs('document.documentElement.scrollWidth <= innerWidth && document.querySelector("footer").getBoundingClientRect().bottom <= innerHeight'), true);
    await screenshot(history, 'historico-ampliado');
    history.setContentSize(460, 560);
    await wait(100);
    assert.equal(await historyJs('getComputedStyle(grid).gridTemplateColumns.split(" ").length'), 2);
    assert.equal(await historyJs('document.documentElement.scrollWidth <= innerWidth'), true);
    const pixels = new Uint8Array(640 * 360 * 4);
    for (let offset = 0; offset < pixels.length; offset += 4) { pixels[offset] = 20; pixels[offset + 1] = 80; pixels[offset + 2] = 100; pixels[offset + 3] = 255; }
    ipcMain.handle('capture:image', () => ({ pixels, width: 640, height: 360, cssWidth: 640, format: 'rgba' }));
    const capture = await create('capture', 640, 360);
    capture.setContentSize(640, 360);
    let readyCount = 0;
    ipcMain.on('capture:ready', () => { readyCount++; });
    const begin = async () => {
      const ready = new Promise((resolve) => ipcMain.once('capture:ready', resolve));
      capture.webContents.send('capture:start');
      await ready;
    };
    await begin();
    await wait(60);
    const captureJs = (code) => capture.webContents.executeJavaScript(code);
    const pixel = async () => {
      const image = await capture.webContents.capturePage({ x: 100, y: 100, width: 1, height: 1 });
      return Array.from(image.toBitmap());
    };
    const unselectedPixel = await pixel();
    const visibleBar = () => captureJs('!bar.hidden && getComputedStyle(bar).display !== "none" && bar.getBoundingClientRect().left >= 0 && bar.getBoundingClientRect().right <= innerWidth && bar.getBoundingClientRect().top >= 0 && bar.getBoundingClientRect().bottom <= innerHeight');
    assert.equal(await visibleBar(), true);
    assert.equal(await captureJs('sel === null'), true);
    assert.equal(await captureJs('Array.from(bar.querySelectorAll("[data-act=copy], [data-act=save], [data-act=pin], [data-act=ocr], [data-act=undo], [data-act=redo]")).every(button=>button.disabled)'), true);
    assert.equal(await captureJs('bar.querySelector("[data-act=close]").disabled || bar.querySelector("[data-act=history]").disabled'), false);
    await screenshot(capture, 'captura-abertura-menor');
    capture.setContentSize(1280, 720);
    await wait(60);
    assert.equal(await visibleBar(), true);
    await screenshot(capture, 'captura-abertura');
    capture.setContentSize(640, 360);
    await wait(60);
    await captureJs('bar.querySelector("[data-tool=arrow]").click();true;');
    assert.equal(await captureJs('tool === "arrow" && sel === null'), true);
    capture.webContents.sendInputEvent({ type: 'mouseDown', x: 20, y: 30, button: 'left', clickCount: 1 });
    await wait(30);
    capture.webContents.sendInputEvent({ type: 'mouseMove', x: 340, y: 210, button: 'left' });
    await wait(30);
    assert.equal(await captureJs('bar.hidden'), true);
    capture.webContents.sendInputEvent({ type: 'mouseUp', x: 340, y: 210, button: 'left', clickCount: 1 });
    await wait(60);
    assert.equal(await visibleBar(), true);
    assert.deepEqual(await captureJs('sel'), { x: 20, y: 30, w: 320, h: 180 });
    assert.equal(await captureJs('tool === "arrow" && shapes.length === 0'), true);
    assert.equal(await captureJs('Array.from(bar.querySelectorAll("[data-act=copy], [data-act=save], [data-act=pin], [data-act=ocr]")).every(button=>!button.disabled)'), true);
    await screenshot(capture, 'captura-selecionada-menor');
    const png = await captureJs('exportPng().then(data=>Array.from(data))');
    assert.deepEqual(nativeImage.createFromBuffer(Buffer.from(png)).getSize(), { width: 320, height: 180 });
    assert.notDeepEqual(await pixel(), unselectedPixel);
    capture.webContents.send('capture:release');
    await wait(50);
    assert.equal(await capture.webContents.executeJavaScript('base===null && view.width===1'), true);
    assert.equal(await captureJs('selBox.hidden && sizeLabel.hidden && bar.hidden && textInput.hidden'), true);
    await begin();
    assert.deepEqual(await pixel(), unselectedPixel, 'A captura reabriu mostrando a seleção anterior');
    assert.equal(await capture.webContents.executeJavaScript('base.width'), 640);
    assert.equal(await visibleBar(), true);
    await captureJs('window.originalBitmap=createImageBitmap;window.createImageBitmap=(...args)=>new Promise(resolve=>window.finishBitmap=()=>originalBitmap(...args).then(resolve));true;');
    const previousReady = readyCount;
    capture.webContents.send('capture:start', 99);
    for (let retry = 0; retry < 80 && !(await captureJs('typeof finishBitmap === "function"')); retry++) await wait(20);
    assert.equal(await captureJs('typeof finishBitmap === "function"'), true);
    capture.webContents.send('capture:release');
    await captureJs('finishBitmap().then(()=>{window.createImageBitmap=originalBitmap;return true;})');
    await wait(80);
    assert.equal(readyCount, previousReady, 'Uma preparação cancelada pediu para reabrir a janela');
    assert.equal(await captureJs('base === null && selBox.hidden && bar.hidden'), true);
    await begin();
    capture.webContents.sendInputEvent({ type: 'mouseDown', x: 20, y: 30, button: 'left', clickCount: 1 });
    capture.webContents.sendInputEvent({ type: 'mouseUp', x: 20, y: 30, button: 'left', clickCount: 1 });
    await wait(60);
    assert.equal(await captureJs('sel === null'), true);
    assert.equal(await visibleBar(), true);
    await captureJs('bar.querySelector("[data-mode=video]").click();true;');
    await wait(60);
    assert.equal(await visibleBar(), true);
    assert.equal(await captureJs('bar.querySelector("[data-act=record]").disabled'), true);
    assert.equal(await captureJs('bar.querySelectorAll("[data-audio]").length'), 2);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ resultado: 'Telas verificadas', pasta: output }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    console.log(JSON.stringify({ erros: errors, pasta: output }));
    app.exit(1);
  }
});

setTimeout(() => { console.error('A verificação visual demorou demais'); app.exit(1); }, 45000);
