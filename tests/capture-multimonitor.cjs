const electron = require('electron');
const { app, BrowserWindow, ipcMain, nativeImage } = electron;
const { createRequire } = require('module');
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

app.disableHardwareAcceleration();
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ultragmonitor-telas-'));
app.setPath('userData', output);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const displays = [
  { id: 2, bounds: { x: -512, y: -40, width: 512, height: 288 }, size: { width: 512, height: 288 }, scaleFactor: 1.25 },
  { id: 1, bounds: { x: 0, y: 0, width: 640, height: 360 }, size: { width: 640, height: 360 }, scaleFactor: 1 },
  { id: 3, bounds: { x: 640, y: 0, width: 640, height: 360 }, size: { width: 640, height: 360 }, scaleFactor: 1 },
];
const shown = [];
const errors = [];
function HiddenWindow(options) {
  const win = new BrowserWindow({ ...options, show: false, webPreferences: { ...options.webPreferences, offscreen: true } });
  win.showInactive = () => { shown.push(win.id); };
  win.focus = () => {};
  win.moveTop = () => {};
  win.webContents.on('preload-error', (_e, _file, error) => errors.push(error.message));
  win.webContents.on('render-process-gone', (_e, details) => errors.push(details.reason));
  return win;
}
HiddenWindow.getFocusedWindow = () => null;
const filename = path.resolve(__dirname, '../src/main/capture.js');
const real = createRequire(filename);
const moduleCopy = { exports: {} };
new Function('require', 'module', 'exports', '__dirname', fs.readFileSync(filename, 'utf8'))(name => name === 'electron' ? {
  ...electron,
  BrowserWindow: HiddenWindow,
  screen: { getAllDisplays: () => displays, getPrimaryDisplay: () => displays[1], getCursorScreenPoint: () => ({ x: -400, y: 0 }), getDisplayNearestPoint: () => displays[0] },
} : real(name), moduleCopy, moduleCopy.exports, path.dirname(filename));
const { Capture } = moduleCopy.exports;
const capture = new Capture({ sensors: {}, toast: { show() {} }, getSettings: () => ({ autoSaveShots: false }), beforeShot() {}, afterShot() {} });
capture.grab = async display => {
  const width = Math.round(display.bounds.width * display.scaleFactor);
  const height = Math.round(display.bounds.height * display.scaleFactor);
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = display.id === 1 ? 200 : 20;
    pixels[i + 1] = display.id === 1 ? 20 : 200;
    pixels[i + 2] = 30;
    pixels[i + 3] = 255;
  }
  return { pixels, width, height, format: 'rgba' };
};
let copied;
capture.copy = async png => { copied = { png: Buffer.from(png), display: capture.display }; capture.close(); return true; };

async function until(test, message) {
  for (let i = 0; i < 100; i++) { if (await test()) return; await wait(25); }
  throw new Error(message);
}

app.whenReady().then(async () => {
  try {
    const settings = require('../src/main/settings');
    settings.load();
    for (const [name, handler] of Object.entries({
      'settings:get': () => settings.get(),
      'settings:set': () => true,
      'capture:image': event => capture.image(event.sender),
      'capture:copy': (event, png) => capture.use(event.sender) ? capture.copy(png) : false,
    })) ipcMain.handle(name, handler);
    ipcMain.on('capture:ready', (event, session) => capture.ready(session, event.sender));
    ipcMain.on('capture:select', (event, session) => capture.select(session, event.sender));
    ipcMain.on('capture:options', (event, value) => capture.setOptions(value?.session, event.sender, value));
    ipcMain.on('capture:close', event => { if (capture.owns(event.sender)) capture.close(); });
    const jsAt = (id, code) => capture.windows.get(id).win.webContents.executeJavaScript(code);
    const toolbarAt = async id => (await Promise.all(displays.map(async display => ({ id: display.id, shown: await jsAt(display.id, '!bar.hidden') })))).every(item => item.shown === (item.id === id));
    const selectAt = async id => {
      const contents = capture.windows.get(id).win.webContents;
      contents.sendInputEvent({ type: 'mouseDown', x: 30, y: 40, button: 'left', clickCount: 1 });
      contents.sendInputEvent({ type: 'mouseMove', x: 180, y: 140, button: 'left' });
      contents.sendInputEvent({ type: 'mouseUp', x: 180, y: 140, button: 'left', clickCount: 1 });
      await until(async () => await toolbarAt(id) && await jsAt(id, '!!sel && sel.w > 2 && sel.h > 2 && drag === null && !bar.querySelector(mode === "video" ? "[data-act=record]" : "[data-act=copy]").disabled'), 'A barra não acompanhou a seleção com exclusividade');
    };
    for (const id of [2, 3, 1, 2]) {
      copied = null;
      shown.length = 0;
      await capture.start();
      await until(() => shown.length === 3, 'As três telas não ficaram prontas');
      assert.equal(await toolbarAt(1), true);
      for (const display of displays) assert.equal(await jsAt(display.id, 'sel === null && selBox.hidden'), true);
      const target = capture.windows.get(id);
      const js = code => target.win.webContents.executeJavaScript(code);
      assert.equal(await js('ratio'), displays.find(display => display.id === id).scaleFactor);
      await js('window.dispatchEvent(new Event("focus"));view.dispatchEvent(new PointerEvent("pointermove",{clientX:20,clientY:20}));true;');
      assert.equal(await toolbarAt(1), true);
      await jsAt(1, 'document.querySelector("[data-mode=video]").click();document.querySelector("[data-audio=mic]").click();true;');
      await until(async () => await js('mode === "video" && audio.mic'), 'O modo de vídeo e o áudio não acompanharam a barra');
      await selectAt(id);
      assert.equal(await js('mode === "video" && audio.mic && !document.querySelector("[data-act=record]").disabled'), true);
      await js('document.querySelector("[data-mode=shot]").click();document.querySelector("[data-tool=arrow]").click();document.querySelector("input").value="9";document.querySelector("input").dispatchEvent(new Event("input"));true;');
      const other = id === 3 ? 2 : 3;
      await until(async () => await jsAt(other, 'mode === "shot" && tool === "arrow" && size === 9'), 'Os ajustes da ferramenta não acompanharam a barra');
      await selectAt(other);
      assert.equal(await jsAt(other, 'tool === "arrow" && size === 9'), true);
      assert.equal(capture.select(capture.session - 1, target.win.webContents), false);
      assert.equal(capture.select(capture.session, {}), false);
      assert.equal(capture.setOptions(capture.session, target.win.webContents, { mode: 'video', color: '#ff3b5c', size: 4 }), false);
      assert.equal(await toolbarAt(other), true);
      await selectAt(id);
      await js('shapes=[];undone=[];sel={x:40,y:50,w:120,h:80};render();act("copy");true;');
      await until(() => copied !== null, 'O print da tela escolhida não foi copiado');
      assert.equal(copied.display.id, id);
      const image = nativeImage.createFromBuffer(copied.png);
      assert.deepEqual(image.getSize(), { width: 120, height: 80 });
      const pixel = image.toBitmap();
      assert.equal(pixel[2], id === 1 ? 200 : 20);
      assert.equal(pixel[1], id === 1 ? 20 : 200);
      assert.equal(capture.busy, false);
      for (const item of capture.windows.values()) {
        assert.equal(item.win.isVisible(), false);
        await until(() => item.win.webContents.executeJavaScript('base === null && selBox.hidden'), 'Uma tela preservou a seleção antiga');
      }
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ resultado: 'Três telas, barra única na principal, transferência por seleção, modo de vídeo, ajustes das ferramentas, imagem correta, escala de 125%, posição negativa e reaberturas verificadas sem janelas visíveis' }));
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
setTimeout(() => { console.error('Teste de monitores demorou demais'); app.exit(1); }, 20000);
