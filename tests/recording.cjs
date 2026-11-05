const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const { RecordingFile } = require('../src/main/recording-file');

app.disableHardwareAcceleration();
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ultragmonitor-gravacao-'));
app.setPath('userData', path.join(output, 'dados'));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let file;
let done;
let ready;
let blocks = 0;
const warnings = [];
let failure;

app.whenReady().then(async () => {
  try {
    let finished;
    const complete = new Promise((resolve) => { finished = resolve; });
    const started = new Promise((resolve) => { ready = resolve; });
    ipcMain.handle('recorder:open', async (_event, mime) => { file = new RecordingFile(output, 'Teste'); await file.open(mime); return true; });
    ipcMain.handle('recorder:chunk', async (_event, data) => { await file.append(data); blocks++; return true; });
    ipcMain.handle('recorder:done', async () => { done = await file.finish(); finished(); return true; });
    ipcMain.on('recorder:started', () => ready());
    ipcMain.on('recorder:warning', (_event, message) => warnings.push(message));
    ipcMain.on('recorder:error', (_event, message) => { failure = message; finished(); });
    const worker = new BrowserWindow({ show: false, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true, preload: path.resolve(__dirname, '../src/preload/preload.js') } });
    await worker.loadFile(path.resolve(__dirname, '../src/renderer/recorder/index.html'));
    await worker.webContents.executeJavaScript(`
      const fixture = document.createElement('canvas'); fixture.width = 640; fixture.height = 360;
      const brush = fixture.getContext('2d'); let frame = 0;
      setInterval(() => { brush.fillStyle = '#132535'; brush.fillRect(0,0,640,360); brush.fillStyle = '#5ee6ff'; brush.fillRect((frame++*4)%500, 40, 100, 150); }, 33);
      const fixtureStream = fixture.captureStream(30);
      navigator.mediaDevices.getUserMedia = async (options) => { if (options.audio) throw new Error('Áudio de teste indisponível'); return fixtureStream; };
      true;
    `);
    worker.webContents.send('recorder:command', { action: 'start', rect: { x: 10, y: 10, w: 320, h: 180 }, sourceId: 'teste', width: 640, height: 360, system: true, mic: true });
    await started;
    for (let attempt = 0; attempt < 12 && !file.bytes; attempt++) await wait(500);
    if (!file.bytes) console.log(await worker.webContents.executeJavaScript('JSON.stringify({estado:recorder.state,pendentes:pending,codec:recorder.mimeType,faixas:streams.map(s=>s.getVideoTracks().map(t=>({estado:t.readyState,settings:t.getSettings()})))})'));
    assert.ok(file.bytes > 0 && fs.statSync(file.partial).size > 0);
    assert.ok(blocks >= 1);
    worker.webContents.send('recorder:command', { action: 'pause' });
    await wait(200);
    assert.equal(await worker.webContents.executeJavaScript('recorder.state'), 'paused');
    worker.webContents.send('recorder:command', { action: 'resume' });
    await wait(1500);
    worker.webContents.send('recorder:command', { action: 'stop' });
    await complete;
    assert.equal(failure, undefined);
    assert.equal(warnings.length, 2);
    assert.ok(done && fs.statSync(done).size > 0);
    const playerPage = path.join(output, 'reproduzir.html');
    fs.writeFileSync(playerPage, '<!doctype html><html><body><video id="video" muted></video></body></html>');
    const player = new BrowserWindow({ show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
    await player.loadFile(playerPage);
    const info = await player.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const video = document.getElementById('video');
      video.onloadeddata = () => resolve({width:video.videoWidth,height:video.videoHeight,duration:video.duration});
      video.onerror = () => reject(new Error('O vídeo salvo não abriu'));
      video.src = ${JSON.stringify(path.basename(done))}; video.load();
    })`);
    assert.equal(info.width, 320);
    assert.equal(info.height, 180);
    console.log(JSON.stringify({ resultado: 'Gravação, pausa, retomada, áudio e reprodução verificados', blocos: blocks, video: done, ...info }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    console.log(JSON.stringify({ pasta: output, falha: failure, avisos: warnings }));
    app.exit(1);
  }
});

setTimeout(() => { console.error('O teste de gravação demorou demais'); app.exit(1); }, 30000);
