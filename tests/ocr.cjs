const { app, BrowserWindow, ipcMain, nativeImage, utilityProcess } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { Ocr } = require('../src/main/ocr');

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ultragmonitor-ocr-'));
app.setPath('userData', path.join(output, 'dados'));
const ocr = new Ocr({ fork: (file, args, options) => {
  const child = utilityProcess.fork(file, args, { ...options, stdio: 'pipe', execArgv: ['--require', path.resolve(__dirname, 'fixtures/ocr-offline.cjs')] });
  child.stderr.on('data', (data) => process.stderr.write(data));
  child.on('message', (message) => { if (message.type === 'error') console.error(message.reason); });
  return child;
} });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let clipboardText = 'Conteúdo anterior';
let keysEnabled = true;
let scenario = 'real';
let copyFails = false;
const errors = [];

async function until(test, message) {
  for (let n = 0; n < 150; n++) { if (await test()) return; await wait(100); }
  throw new Error(message);
}

app.whenReady().then(async () => {
  try {
    const imageWindow = new BrowserWindow({ show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
    await imageWindow.loadURL('data:text/html,<html><body></body></html>');
    const bytes = await imageWindow.webContents.executeJavaScript(`(async()=>{
      const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=720;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1200,720);ctx.fillStyle='#111';ctx.font='30px Arial';
      ctx.fillText('Olá, Paulo! Texto da imagem 123.',40,100);
      ctx.fillText('Ação, café e informação.',40,150);
      ctx.font='14px Arial';ctx.fillText('OK',40,230);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));return Array.from(new Uint8Array(await blob.arrayBuffer()));
    })()`);
    imageWindow.destroy();
    const image = nativeImage.createFromBuffer(Buffer.from(bytes));
    const pixels = image.toBitmap();
    const settings = { language: 'pt', accent: '#5ee6ff', capture: { color: '#ff3b5c', size: 4 }, recordSystemAudio: true, recordMic: false };
    ipcMain.handle('settings:get', () => settings);
    ipcMain.handle('capture:image', () => ({ pixels, width: 1200, height: 720, cssWidth: 1200, format: 'bgra' }));
    ipcMain.handle('capture:keys', (_event, enabled) => { keysEnabled = enabled; return true; });
    ipcMain.handle('capture:ocr-cancel', () => ocr.cancel());
    ipcMain.handle('capture:copy-text', (_event, text) => { if (copyFails) return false; clipboardText = text; return true; });
    ipcMain.handle('capture:ocr', (event, png) => scenario === 'low' ? { status: 'done', text: 'Texto para revisar', lowConfidence: true } : ocr.recognize(png, (value) => event.sender.send('ocr:progress', value)));
    const win = new BrowserWindow({ width: 1200, height: 720, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, sandbox: true, preload: path.resolve(__dirname, '../src/preload/preload.js') } });
    win.webContents.on('console-message', (...args) => { const detail = args.find((value) => value && typeof value === 'object' && typeof value.message === 'string'); if (detail && (detail.level === 'error' || detail.level === 3)) errors.push(detail.message); });
    const js = (code) => win.webContents.executeJavaScript(code);
    await win.loadFile(path.resolve(__dirname, '../src/renderer/capture/index.html'));
    win.setContentSize(1200, 720);
    const ready = new Promise((resolve) => ipcMain.once('capture:ready', resolve));
    win.webContents.send('capture:start');
    await ready;
    await js('sel={x:20,y:50,w:750,h:150};schedule();true;');
    await wait(100);
    await js('document.querySelector("[data-act=ocr]").click();true;');
    await until(async () => await js('ocr.opened && !ocr.busy'), 'O reconhecimento não terminou');
    const recognized = await js('document.getElementById("ocr-result").value');
    if (!recognized) console.log(await js('ocr.status.textContent'));
    assert.match(recognized, /Paulo/);
    assert.match(recognized, /123/);
    assert.match(recognized, /informa[çc][ãa]o/i);
    assert.equal(clipboardText, 'Conteúdo anterior');
    assert.equal(keysEnabled, false);
    fs.writeFileSync(path.join(output, 'ocr-previa.png'), (await win.webContents.capturePage()).toPNG());
    assert.equal(await js('getComputedStyle(bar).display'), 'none');
    const revised = 'Texto revisado pelo usuário\nSegunda linha';
    await js('ocr.text.value=' + JSON.stringify(revised) + ';ocr.text.dispatchEvent(new Event("input"));ocr.text.setSelectionRange(0,0);document.getElementById("ocr-copy").click();true;');
    await until(() => clipboardText.startsWith('Texto revisado'), 'O texto revisado não foi copiado');
    assert.equal(clipboardText, revised);
    assert.equal(await js('ocr.opened'), true);
    await js('ocr.text.setSelectionRange(0,5);document.getElementById("ocr-copy").click();true;');
    await until(() => clipboardText === 'Texto', 'O trecho selecionado não foi copiado');
    copyFails = true;
    await js('document.getElementById("ocr-copy").click();true;');
    await until(async () => (await js('ocr.status.textContent')).includes('Não deu pra copiar'), 'A falha de cópia não apareceu');
    assert.equal(await js('ocr.text.value'), revised);
    copyFails = false;
    await js('document.getElementById("ocr-back").click();true;');
    await until(() => keysEnabled, 'Os atalhos da captura não voltaram');
    scenario = 'low';
    await js('document.querySelector("[data-act=ocr]").click();true;');
    await until(async () => await js('ocr.opened && !ocr.busy'), 'A prévia de revisão não abriu');
    assert.equal(await js('ocr.advice.classList.contains("ocr-low-confidence")'), true);
    fs.writeFileSync(path.join(output, 'ocr-aviso.png'), (await win.webContents.capturePage()).toPNG());
    win.setContentSize(1024, 600);
    await wait(100);
    assert.equal(await js('ocr.panel.getBoundingClientRect().bottom <= innerHeight - 15 && ocr.panel.scrollWidth <= ocr.panel.clientWidth'), true);
    fs.writeFileSync(path.join(output, 'ocr-previa-menor.png'), (await win.webContents.capturePage()).toPNG());
    win.setContentSize(1200, 720);
    await js('document.getElementById("ocr-back").click();true;');
    scenario = 'real';
    await js('sel={x:36,y:212,w:30,h:25};document.querySelector("[data-act=ocr]").click();true;');
    await until(async () => await js('ocr.opened && !ocr.busy'), 'O texto curto não foi processado');
    assert.match(await js('ocr.text.value'), /OK/i);
    await js('document.getElementById("ocr-back").click();true;');
    await js('sel={x:20,y:300,w:700,h:140};document.querySelector("[data-act=ocr]").click();true;');
    await until(async () => await js('ocr.opened && !ocr.busy'), 'A imagem vazia não foi processada');
    assert.match(await js('ocr.status.textContent'), /Não encontramos texto/);
    assert.equal(await js('ocr.copy.disabled'), true);
    assert.equal(clipboardText, 'Texto');
    await js('document.getElementById("ocr-back").click();sel={x:20,y:50,w:750,h:150};document.querySelector("[data-act=ocr]").click();true;');
    await until(() => !!ocr.job, 'O processo de OCR não iniciou');
    await js('document.getElementById("ocr-back").click();true;');
    await until(() => ocr.job === null && keysEnabled, 'O reconhecimento não foi cancelado');
    assert.equal(await js('ocr.opened'), false);
    await wait(100);
    assert.notEqual(await js('getComputedStyle(bar).display'), 'none');
    assert.equal(await js('bar.getBoundingClientRect().right <= innerWidth && bar.getBoundingClientRect().bottom <= innerHeight'), true);
    fs.writeFileSync(path.join(output, 'ocr-botao.png'), (await win.webContents.capturePage()).toPNG());
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ resultado: 'OCR offline real, revisão, seleção, aviso, imagem vazia e cancelamento verificados', texto: recognized, pasta: output }));
    ocr.cancel();
    app.exit(0);
  } catch (error) {
    console.error(error);
    console.log(JSON.stringify({ pasta: output, erros: errors }));
    ocr.cancel();
    app.exit(1);
  }
});

setTimeout(() => { ocr.cancel(); console.error('O teste de OCR demorou demais'); app.exit(1); }, 60000);
