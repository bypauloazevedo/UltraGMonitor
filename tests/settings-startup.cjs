const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');

if (process.env.CI !== 'true' && !process.argv.includes('--com-janelas')) {
  console.log('Teste com janelas desativado. Use --com-janelas para habilitar.');
  app.exit(0);
}

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ultragmonitor-abertura-'));
app.setPath('userData', output);
fs.writeFileSync(path.join(output, 'settings.json'), JSON.stringify({ language: 'pt', locked: false, monitoring: false, updateCheck: false, captureWinShiftS: false, hotkeys: { capture: '', record: '', history: '', lock: '', fps: '', visible: '' } }));
const errors = [];
app.on('browser-window-created', (_event, win) => {
  win.webContents.on('preload-error', (_e, _file, error) => errors.push(error.message));
  win.webContents.on('render-process-gone', (_e, details) => errors.push(details.reason));
});
require('../src/main/main');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  try {
    const overlay = BrowserWindow.getAllWindows().find((win) => win.getTitle() === 'UltraGMonitor');
    await overlay.webContents.executeJavaScript('new Promise(resolve=>{if(document.querySelector("[data-action=settings]"))resolve();else{const observer=new MutationObserver(()=>{if(document.querySelector("[data-action=settings]")){observer.disconnect();resolve();}});observer.observe(document.body,{childList:true,subtree:true});}})');
    for (let attempt = 0; attempt < 3; attempt++) {
      await overlay.webContents.executeJavaScript('document.querySelector("[data-action=settings]").click();true;');
      let win;
      for (let retry = 0; retry < 60; retry++) {
        win = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes('/settings/'));
        if (win && win.isVisible()) break;
        await wait(100);
      }
      assert.ok(win && win.isVisible(), 'As configurações precisam aparecer na primeira abertura');
      assert.equal(win.webContents.isLoading(), false);
      const content = await win.webContents.executeJavaScript('({abas:document.querySelectorAll("#tabs button").length,icones:document.querySelectorAll("#tabs button svg").length,conteudo:document.querySelector("main").innerText.length,estado:document.readyState})');
      assert.equal(content.abas, 5);
      assert.equal(content.icones, 5);
      assert.ok(content.conteudo > 50);
      assert.equal(content.estado, 'complete');
      win.minimize();
      await overlay.webContents.executeJavaScript('document.querySelector("[data-action=settings]").click();true;');
      await wait(150);
      assert.equal(win.isMinimized(), false);
      assert.equal(BrowserWindow.getAllWindows().filter((candidate) => candidate.webContents.getURL().includes('/settings/')).length, 1);
      win.close();
      await wait(100);
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ resultado: 'Configurações abertas pelo botão, restauradas e reabertas três vezes com os cinco ícones visíveis' }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});

setTimeout(() => { console.error('A abertura das configurações demorou demais'); app.exit(1); }, 30000);
