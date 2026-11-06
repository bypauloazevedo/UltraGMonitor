const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
app.disableHardwareAcceleration();
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ultragmonitor-previa-'));
app.setPath('userData', output);
const settings = require('../src/main/settings');
const sensors = { receivedAt: Date.now(), admin: true, pawnio: true, cpu: { name: 'Intel Core i7-12700F', load: 34, temp: 57 }, gpu: { name: 'NVIDIA GeForce RTX 4060 Ti', load: 40, temp: 42 }, ram: { load: 61, used: 19.5, total: 32 }, disks: [], fps: { enabled: false } };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, message) {
  for (let i = 0; i < 100; i++) { if (await test()) return; await wait(30); }
  throw new Error(message);
}
app.whenReady().then(async () => {
  try {
    settings.load();
    settings.update({ language: 'pt', theme: 'dark', layout: 'compact', compactLayout: 'tall', typography: { clock: { font: 'outfit' }, metrics: { font: 'orbitron' } } });
    let win;
    for (const [name, handler] of Object.entries({
      'settings:get': () => settings.get(),
      'settings:set': (_event, patch) => { settings.update(patch); win.webContents.send('settings', settings.get()); return settings.get(); },
      'state:get': () => ({ platform: 'win32', version: '0.5.0', sensor: { running: true }, hotkeyStatus: {}, folders: {}, displays: [], persistence: {} }),
      'sensors:last': () => sensors, 'weather:last': () => null, 'hotkeys:pause': () => {}, 'hotkeys:resume': () => {},
    })) ipcMain.handle(name, handler);
    win = new BrowserWindow({ width: 1460, height: 1040, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, sandbox: true, preload: path.resolve(__dirname, '../src/preload/preload.js') } });
    const js = code => win.webContents.executeJavaScript(code);
    await win.loadFile(path.resolve(__dirname, '../src/renderer/settings/index.html'));
    await until(() => js('!!document.querySelector("#tabs button.on")'), 'As configurações não iniciaram');
    await js('document.querySelector("#tabs [data-tab=aparencia]").click();true;');
    await until(() => js('!!document.querySelector("iframe")?.contentDocument?.querySelector(".mini")'), 'A prévia não carregou');
    await wait(150);
    await js('window.originalPreviewDocument=previewFrame.contentDocument;previewFrame.contentWindow.previewAlive="preservado";document.getElementById("scale").focus();true;');
    for (const scale of [1.29, .8, 1.5, 1.1]) {
      await js('window.hud.setSettings({scale:' + scale + '})');
      await wait(150);
      assert.equal(await js('previewFrame.contentDocument===originalPreviewDocument && previewFrame.contentWindow.previewAlive==="preservado"'), true, 'Redimensionar o widget recarregou a prévia');
      assert.equal(await js('document.activeElement.id'), 'scale', 'O controle perdeu o foco durante o ajuste');
    }
    for (const width of [960, 480, 1460]) {
      win.setContentSize(width, 1040);
      await wait(180);
      assert.equal(await js('previewFrame.contentDocument===originalPreviewDocument && previewFrame.contentWindow.previewAlive==="preservado"'), true, 'Reorganizar as colunas recarregou a prévia');
    }
    for (const tab of ['sistema', 'aparencia', 'captura', 'aparencia']) {
      await js('document.querySelector("#tabs [data-tab=' + tab + ']").click();true;');
      await wait(100);
      assert.equal(await js('previewFrame.contentDocument===originalPreviewDocument && previewFrame.contentWindow.previewAlive==="preservado"'), true, 'Trocar de aba recriou a prévia');
    }
    await js('document.querySelector("#accent button").click();true;');
    await until(() => settings.get().accent === '#5ee6ff', 'O botão parou de responder');
    fs.writeFileSync(path.join(output, 'previa-estavel.png'), (await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({ resultado: 'Prévia preservada durante escala, colunas e abas; controles continuam respondendo', pasta: output }));
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
setTimeout(() => { console.error('A verificação da prévia demorou demais'); app.exit(1); }, 20000);
