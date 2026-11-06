const { app, BrowserWindow, clipboard, dialog, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const { Capture } = require('../src/main/capture');

if (process.env.CI !== 'true' && !process.argv.includes('--com-janelas')) {
  console.log('Teste com janelas desativado. Use --com-janelas para habilitar.');
  app.exit(0);
}

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ultragmonitor-captura-retorno-'));
app.setPath('userData', output);
fs.writeFileSync(path.join(output, 'settings.json'), JSON.stringify({ language: 'pt', locked: false, monitoring: true, updateCheck: false, captureWinShiftS: false, autoSaveShots: false, fpsEnabled: false, hotkeys: { capture: '', record: '', history: '', lock: '', fps: '', visible: '' } }));
const write = async () => {};
clipboard.write = write;
clipboard.has = async () => true;
assert.equal(clipboard.write, write);
dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(output, 'print.png') });
let capture;
let visibleAtGrab;
let failShot = false;
Capture.prototype.grab = async function () {
  capture = this;
  visibleAtGrab = BrowserWindow.getAllWindows().find((win) => win.getTitle() === 'UltraGMonitor').isVisible();
  if (failShot) throw new Error('Falha simulada na captura');
  const pixels = Buffer.alloc(640 * 360 * 4, 255);
  return { pixels, width: 640, height: 360, format: 'rgba' };
};
const errors = [];
app.on('browser-window-created', (_event, win) => {
  win.webContents.on('preload-error', (_e, _file, error) => errors.push(error.message));
  win.webContents.on('render-process-gone', (_e, detail) => errors.push(detail.reason));
});
require('../src/main/main');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(test, message) {
  for (let retry = 0; retry < 80; retry++) { if (await test()) return; await wait(50); }
  throw new Error(message);
}

app.whenReady().then(async () => {
  try {
    const overlay = BrowserWindow.getAllWindows().find((win) => win.getTitle() === 'UltraGMonitor');
    await until(() => overlay.isVisible(), 'O painel não apareceu');
    await overlay.webContents.executeJavaScript('window.hud.openSettings()');
    let config;
    await until(() => {
      config = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('/settings/'));
      return config && config.isVisible();
    }, 'As configurações não apareceram');
    const js = (code) => config.webContents.executeJavaScript(code);
    for (const action of ['copy', 'save', 'cancel']) {
      config.focus();
      await wait(80);
      assert.equal(overlay.isFocusable(), true, 'O menu aberto precisa aceitar foco ao clicar');
      app.emit('second-instance', {}, ['app', '--capture']);
      await until(() => capture && capture.win.isVisible(), 'A captura não apareceu');
      assert.equal(overlay.isFocusable(), false, 'O painel precisa liberar a interação durante a seleção');
      await capture.win.webContents.executeJavaScript('sel={x:20,y:30,w:320,h:180};schedule();true;');
      await wait(30);
      if (action === 'cancel') capture.win.webContents.executeJavaScript('window.hud.captureClose();true;');
      else await capture.win.webContents.executeJavaScript('act(' + JSON.stringify(action) + ');true;');
      await until(() => !capture.busy && !capture.win.isVisible(), 'A captura não fechou');
      await wait(80);
      console.log(JSON.stringify({ action, visibleAtGrab, painel: overlay.isVisible(), foco: BrowserWindow.getFocusedWindow()?.getTitle() || null }));
      assert.equal(visibleAtGrab, true, 'O painel precisa continuar visível durante o print');
      assert.equal(overlay.isVisible(), true, 'O painel sumiu depois do print');
      assert.equal(overlay.isFocusable(), true, 'O menu não recuperou a interação depois da captura');
      assert.equal(BrowserWindow.getFocusedWindow(), config, 'O foco não voltou às configurações');
      assert.equal(globalShortcut.isRegistered('CommandOrControl+C'), false);
      assert.equal(globalShortcut.isRegistered('Escape'), false);
      await js('document.querySelector("#tabs [data-tab=aparencia]").click();true;');
      await js('document.querySelector("#layout [data-value=compact]").click();true;');
      await until(async () => (await js('window.hud.getSettings()')).layout === 'compact', 'O controle de layout parou de funcionar');
      await js('document.querySelector("#layout [data-value=card]").click();true;');
      await until(async () => (await js('window.hud.getSettings()')).layout === 'card', 'O controle de layout não respondeu');
      await js('document.getElementById("opacity").focus();true;');
      config.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'RIGHT' });
      config.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'RIGHT' });
      await until(async () => (await js('window.hud.getSettings()')).opacity > 0.82, 'O controle pelo teclado parou de funcionar');
      await js('window.hud.setSettings({opacity:0.82})');
    }
    config.focus();
    app.emit('second-instance', {}, ['app', '--capture']);
    await until(() => capture.busy && capture.win.isVisible(), 'A captura não reabriu');
    config.focus();
    await until(() => !capture.busy && !capture.win.isVisible(), 'Voltar às configurações deixou a captura por cima');
    assert.equal(globalShortcut.isRegistered('CommandOrControl+C'), false);
    assert.equal(overlay.isVisible(), true);
    failShot = true;
    app.emit('second-instance', {}, ['app', '--capture']);
    await until(() => !capture.busy && !capture.win, 'A falha deixou uma captura pendurada');
    assert.equal(overlay.isVisible(), true);
    assert.equal(BrowserWindow.getFocusedWindow(), config);
    failShot = false;
    app.emit('second-instance', {}, ['app', '--capture']);
    await until(() => capture.busy && capture.win.isVisible(), 'A captura não recuperou depois da falha');
    await capture.win.webContents.executeJavaScript('window.hud.captureClose();true;');
    await until(() => !capture.busy, 'A captura recuperada não fechou');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ resultado: 'Painel preservado, configurações respondendo, atalhos liberados e recuperação após falha de captura verificados' }));
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});

setTimeout(() => { console.error('O teste de retorno da captura demorou demais'); app.exit(1); }, 30000);
