const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const health = require('../src/renderer/shared/sensor-state');
const geometry = require('../src/renderer/shared/capture-geometry');
const { sanitize } = require('../src/main/settings-validation');
const atomic = require('../src/main/atomic-json');
const { RecordingFile } = require('../src/main/recording-file');
const { HistoryFiles } = require('../src/main/history-files');

function temporary(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ultragmonitor-teste-'));
  assert.equal(path.dirname(path.resolve(folder)), path.resolve(os.tmpdir()));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}

function load(file, mocks, timers = {}) {
  const filename = path.resolve(__dirname, '..', file);
  const real = createRequire(filename);
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', '__dirname', fs.readFileSync(filename, 'utf8'))(
    (name) => Object.hasOwn(mocks, name) ? mocks[name] : real(name), module, module.exports,
    timers.setTimeout || setTimeout, timers.clearTimeout || clearTimeout, timers.setInterval || setInterval, timers.clearInterval || clearInterval,
    path.dirname(filename),
  );
  return module.exports;
}

test('Sensores distinguem zero, carregamento, interrupção e leitura antiga', () => {
  const data = { receivedAt: 1000, cpu: { load: 0, temp: 0 }, admin: true, pawnio: true };
  assert.equal(health.reading(null, {}, {}, 1000), 'loading');
  assert.equal(health.reading(data, { running: true }, {}, 1000), 'ready');
  assert.equal(health.reason('cpu', data, {}, {}, 1000).status, 'ready');
  assert.equal(health.reading(data, { running: false }, {}, 1000), 'stopped');
  assert.equal(health.reading(data, {}, {}, 8000), 'stale');
  assert.equal(health.reading(data, { missing: true }, {}, 1000), 'missing');
  assert.equal(health.reading(data, {}, { monitoring: false }, 1000), 'disabled');
});

test('Temperatura explica permissão, driver e hardware sem exigir admin no Linux', () => {
  assert.equal(health.reason('cpu', { admin: false }, {}, {}).status, 'permission');
  assert.equal(health.reason('cpu', { admin: true, pawnio: false }, {}, {}).status, 'driver');
  assert.equal(health.reason('cpu', { admin: false, pawnio: false, platform: 'linux', cpu: { temp: 52 } }, {}, {}).status, 'ready');
  assert.equal(health.reason('gpu', { gpu: { temp: null } }, {}, {}).status, 'unavailable');
  assert.equal(health.reason('fps', { admin: true, fps: {} }, {}, { fpsEnabled: true }).status, 'waiting');
});

test('Alertas de pressão e FPS esperam persistência e limpam ao normalizar', () => {
  let state = health.sustained(null, 'hot', 0);
  assert.equal(state.level, '');
  state = health.sustained(state, 'hot', 2999);
  assert.equal(state.level, '');
  state = health.sustained(state, 'hot', 3000);
  assert.equal(state.level, 'hot');
  assert.equal(health.sustained(state, '', 3100).level, '');
});

for (const scale of [1, 1.25, 1.5, 2]) {
  test(`Captura mantém área e escala em ${scale * 100}%`, () => {
    const result = geometry.region({ x: 100 * scale, y: 40 * scale, w: 400 * scale, h: 200 * scale }, 1920 * scale, 1080 * scale, 1920, true);
    assert.deepEqual(result.css, { x: 100, y: 40, width: 400, height: 200 });
    assert.equal(result.rect.w % 2, 0);
    assert.equal(result.rect.h % 2, 0);
  });
}

test('Captura limita seleção na borda e rejeita dimensões inválidas', () => {
  const { rect } = geometry.region({ x: 1919.8, y: 1079.8, w: 99, h: 99 }, 1920, 1080, 1920, true);
  assert.ok(rect.x + rect.w <= 1920 && rect.y + rect.h <= 1080);
  assert.equal(geometry.region({ x: NaN, y: 0, w: 10, h: 10 }, 1920, 1080, 1920), null);
});

test('Configurações limitam valores, rejeitam tipos e bloqueiam chaves estranhas', () => {
  const input = JSON.parse('{"scale":100,"opacity":-5,"modules":{"cpu":false,"gpu":"sim"},"__proto__":{"poluido":true},"constructor":{},"theme":"inventado"}');
  assert.deepEqual(sanitize(input), { scale: 3, opacity: 0, modules: { cpu: false } });
  assert.equal({}.poluido, undefined);
  assert.deepEqual(sanitize({ typography: { clock: { size: -1, font: 'inexistente' } }, background: { file: '../fora.png' } }), { typography: { clock: { size: 0.6 } }, background: {} });
});

test('Configurações são gravadas inteiras e recuperadas do backup se houver corrupção', (t) => {
  const folder = temporary(t);
  const file = path.join(folder, 'settings.json');
  atomic.write(file, { scale: 1 });
  atomic.write(file, { scale: 2 });
  assert.deepEqual(atomic.read(file).value, { scale: 2 });
  fs.writeFileSync(file, '{');
  assert.deepEqual(atomic.read(file), { value: { scale: 1 }, recovered: true });
  atomic.write(file, { scale: 1.5 });
  assert.deepEqual(atomic.read(file).value, { scale: 1.5 });
  fs.writeFileSync(file, 'null');
  atomic.write(file, { scale: 1.75 });
  assert.deepEqual(atomic.read(`${file}.bak`).value, { scale: 1 });
  assert.equal(fs.readdirSync(folder).some((name) => name.endsWith('.tmp')), false);
});

test('Gravação salva os blocos em ordem antes de finalizar', async (t) => {
  const folder = temporary(t);
  const file = new RecordingFile(folder, 'Gravação');
  await file.open('video/webm');
  await Promise.all([file.append(Buffer.from('primeiro')), file.append(Buffer.from('segundo'))]);
  assert.equal(fs.readFileSync(file.partial, 'utf8'), 'primeirosegundo');
  const complete = await file.finish();
  assert.equal(fs.readFileSync(complete, 'utf8'), 'primeirosegundo');
  assert.equal(fs.existsSync(file.partial), false);
});

test('Gravação interrompida preserva blocos; descarte apaga só a gravação atual', async (t) => {
  const folder = temporary(t);
  const interrupted = new RecordingFile(folder, 'Interrompida');
  await interrupted.open('video/mp4');
  await interrupted.append(Buffer.from('preservado'));
  await interrupted.close();
  assert.equal(fs.readFileSync(interrupted.partial, 'utf8'), 'preservado');
  const discard = new RecordingFile(folder, 'Descartar');
  await discard.open('video/webm');
  await discard.append(Buffer.from('descartar'));
  await discard.close(true);
  assert.equal(fs.existsSync(discard.partial), false);
  assert.equal(fs.existsSync(interrupted.partial), true);
});

test('Gravação rejeita bloco gigante, formato desconhecido e vídeo vazio', async (t) => {
  const folder = temporary(t);
  const bad = new RecordingFile(folder, 'Inválido');
  await assert.rejects(bad.open('text/html'));
  const file = new RecordingFile(folder, 'Vazio');
  await file.open('video/webm');
  await assert.rejects(file.append(new Uint8Array(16 * 1024 * 1024 + 1)));
  await assert.rejects(file.finish());
  await file.close();
  assert.equal(fs.existsSync(file.partial), false);
});

test('Últimos prints limita miniaturas, reutiliza cache e detecta arquivo alterado', async (t) => {
  const folder = temporary(t);
  for (let n = 0; n < 45; n++) fs.writeFileSync(path.join(folder, `${n}.png`), 'imagem');
  let generated = 0;
  const index = new HistoryFiles(async () => { generated++; return 'miniatura'; });
  const dirs = [{ path: folder, kind: 'image', pattern: /\.png$/ }];
  const first = await index.list(dirs);
  assert.equal(first.items.length, 30);
  assert.equal(generated, 30);
  await index.list(dirs);
  assert.equal(generated, 30);
  fs.writeFileSync(first.items[0].file, 'imagem modificada');
  await index.list(dirs);
  assert.equal(generated, 31);
});

test('Últimos prints diferencia pasta inacessível e gravação parcial', async (t) => {
  const folder = temporary(t);
  fs.writeFileSync(path.join(folder, 'video.partial.webm'), 'bloco');
  const index = new HistoryFiles(async () => null);
  const result = await index.list([{ path: folder, kind: 'video', pattern: /\.webm$/ }, { path: path.join(folder, 'video.partial.webm'), kind: 'image', pattern: /\.png$/ }]);
  assert.equal(result.warning, true);
  assert.equal(result.items[0].interrupted, true);
  const hidden = await index.list([{ path: folder, kind: 'video', pattern: /\.webm$/ }], [result.items[0].file]);
  assert.equal(hidden.items.length, 0);
});

test('RAM do Linux usa memória física e não soma swap', (t) => {
  const folder = temporary(t);
  fs.mkdirSync(path.join(folder, 'proc'));
  fs.writeFileSync(path.join(folder, 'proc/meminfo'), 'MemTotal: 33554432 kB\nMemAvailable: 8388608 kB\nSwapTotal: 16777216 kB\n');
  const { LinuxReader } = require('../src/main/linux-reader');
  const reader = new LinuxReader({ root: folder });
  assert.deepEqual(reader.ram(), { total: 32, used: 24, load: 75 });
});

test('RAM do Windows confere com a memória física do sistema', { skip: process.platform !== 'win32' || !fs.existsSync(path.resolve(__dirname, '../sensor/out/UltraGMonitor.Sensor.exe')) }, async () => {
  const { spawn } = require('child_process');
  const data = await new Promise((resolve, reject) => {
    const child = spawn(path.resolve(__dirname, '../sensor/out/UltraGMonitor.Sensor.exe'), ['--stdout'], { windowsHide: true });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Sensor demorou')); }, 15000);
    let buffer = '';
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const end = buffer.indexOf('\n');
      if (end < 0) return;
      clearTimeout(timer);
      child.kill();
      try { resolve(JSON.parse(buffer.slice(0, end))); } catch (error) { reject(error); }
    });
  });
  assert.ok(Math.abs(data.ram.total - os.totalmem() / 1024 ** 3) < 0.02);
  assert.ok(data.ram.used >= 0 && data.ram.used <= data.ram.total);
  assert.ok(Math.abs(data.ram.load - data.ram.used / data.ram.total * 100) < 0.1);
});

test('Sensores preservam admin na reconexão e respeitam recusa de elevação', () => {
  const scheduled = [];
  const { Sensors } = load('src/main/sensors.js', { child_process: { execFileSync() { throw new Error(); }, execFile(_exe, _args, _options, callback) { callback(new Error('Recusado')); } } }, {
    setTimeout: (fn) => { scheduled.push(fn); return scheduled.length; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
  });
  const sensor = new Sensors({ exe: 'sensor.exe', presentMon: 'presentmon.exe' });
  const socket = new EventEmitter();
  socket.write = () => {}; socket.setEncoding = () => {}; socket.destroyed = false;
  sensor.onConnection(socket);
  socket.emit('data', '{"type":"sensors","admin":true}\n');
  socket.emit('close');
  let restarted;
  sensor.start = (options) => { restarted = options; };
  scheduled.at(-1)();
  assert.equal(restarted.elevated, true);
  sensor.launchDirect = () => {};
  sensor.launchElevated([]);
  assert.equal(sensor.restartOptions().elevated, false);
  assert.equal(sensor.status.elevationDenied, true);
});

test('Falha de cópia mantém a captura aberta; salvamento parcial tem aviso próprio', async () => {
  const messages = [];
  let writeFails = true;
  const { Capture } = load('src/main/capture.js', { electron: { app: { on() {} }, clipboard: { async write() { if (writeFails) throw new Error(); }, async has() { return true; } }, ClipboardItem: class {} } });
  let closed = 0;
  const capture = new Capture({ toast: { show: (text) => messages.push(text) }, getSettings: () => ({}), sensors: {}, beforeShot() {}, afterShot() {} });
  capture.keep = () => ({ error: true }); capture.close = () => { closed++; };
  assert.equal(await capture.copy(new Uint8Array([1])), false);
  assert.equal(closed, 0);
  writeFails = false;
  assert.equal(await capture.copy(new Uint8Array([1])), true);
  assert.equal(closed, 1);
  assert.match(messages.at(-1), /Print copiado, mas não deu pra salvar/);
});

test('Vídeo salvo com falha de cópia não promete Ctrl+V', async () => {
  const messages = [];
  const { Recorder } = load('src/main/recorder.js', { './clipfile': { copyFileToClipboard: async () => false } });
  const recorder = new Recorder({ toast: { show: (text) => messages.push(text) }, onChange() {} });
  recorder.file = { finish: async () => 'video.webm' };
  assert.equal(await recorder.done(), true);
  assert.match(messages[0], /Vídeo salvo, mas não deu pra copiar/);
  assert.doesNotMatch(messages[0], /Ctrl\+V/);
});

test('Widget escondido não mantém os temporizadores de posição e mouse', () => {
  const active = new Set();
  let id = 0;
  const { Overlay } = load('src/main/overlay.js', { electron: {} }, { setInterval: () => { active.add(++id); return id; }, clearInterval: (timer) => active.delete(timer) });
  const overlay = new Overlay({}, { onLayout() {} });
  overlay.setActivity(true);
  assert.equal(active.size, 2);
  overlay.setActivity(false);
  assert.equal(active.size, 0);
  overlay.setActivity(true);
  assert.equal(active.size, 2);
  overlay.setActivity(true);
  assert.equal(active.size, 2);
  overlay.setActivity(false);
});

function ocrFixture({ size = { width: 100, height: 100 }, available = true } = {}) {
  const children = [];
  const timers = new Map();
  let id = 0;
  const { Ocr } = load('src/main/ocr.js', {
    fs: { existsSync: () => available },
    electron: { app: { isPackaged: false }, nativeImage: { createFromBuffer: () => ({ getSize: () => size }) } },
  }, { setTimeout: (fn) => { timers.set(++id, fn); return id; }, clearTimeout: (timer) => timers.delete(timer) });
  const service = new Ocr({ fork: () => {
    const child = new EventEmitter();
    child.killed = 0;
    child.sent = [];
    child.kill = () => { child.killed++; };
    child.postMessage = (message) => child.sent.push(message);
    children.push(child);
    return child;
  } });
  return { service, children, timers };
}

test('OCR recusa entrada inválida e arquivos ausentes antes de iniciar processo', async () => {
  const normal = ocrFixture();
  assert.equal((await normal.service.recognize('imagem')).status, 'error');
  assert.equal((await normal.service.recognize(new Uint8Array())).status, 'error');
  assert.equal(normal.children.length, 0);
  const invalid = ocrFixture({ size: { width: 20000, height: 100 } });
  assert.equal((await invalid.service.recognize(new Uint8Array([1]))).status, 'invalid');
  assert.equal(invalid.children.length, 0);
  const missing = ocrFixture({ available: false });
  assert.equal((await missing.service.recognize(new Uint8Array([1]))).status, 'missing');
  assert.equal(missing.children.length, 0);
});

test('OCR normaliza resultado, avisa baixa confiança e encerra o processo', async () => {
  const { service, children, timers } = ocrFixture();
  const progress = [];
  const pending = service.recognize(new Uint8Array([1]), (value) => progress.push(value));
  const child = children[0];
  child.emit('spawn');
  assert.equal(child.sent.length, 1);
  child.emit('message', { type: 'progress', value: 2 });
  child.emit('message', { type: 'result', text: '  Ação\r\nInformação\u0000  ', confidence: 50 });
  assert.deepEqual(await pending, { status: 'done', text: 'Ação\nInformação', lowConfidence: true });
  assert.deepEqual(progress, [1]);
  assert.equal(service.job, null);
  assert.equal(child.killed, 1);
  assert.equal(timers.size, 0);
});

test('Novo OCR cancela o anterior e ignora mensagens atrasadas', async () => {
  const { service, children } = ocrFixture();
  const previous = service.recognize(new Uint8Array([1]));
  const current = service.recognize(new Uint8Array([2]));
  assert.equal((await previous).status, 'cancelled');
  children[0].emit('spawn');
  children[0].emit('message', { type: 'result', text: 'Texto antigo', confidence: 99 });
  assert.equal(children[0].sent.length, 0);
  assert.equal(service.job.child, children[1]);
  children[1].emit('message', { type: 'result', text: '', confidence: 99 });
  assert.equal((await current).status, 'empty');
  assert.equal(service.job, null);
});

test('OCR encerra processo ao exceder o tempo ou ao falhar', async () => {
  const { service, children, timers } = ocrFixture();
  const pending = service.recognize(new Uint8Array([1]));
  [...timers.values()][0]();
  assert.equal((await pending).status, 'timeout');
  assert.equal(children[0].killed, 1);
  assert.equal(service.job, null);
  const next = service.recognize(new Uint8Array([1]));
  children[1].emit('exit', 1);
  assert.equal((await next).status, 'error');
  assert.equal(timers.size, 0);
});

test('Cópia do texto valida o conteúdo e confirma o que ficou na área de transferência', async () => {
  let text = '';
  let fails = false;
  const { Capture } = load('src/main/capture.js', { electron: { app: { on() {} }, clipboard: {
    writeText: async (value) => { if (fails) throw new Error('Indisponível'); text = value; },
    readText: async () => text,
  } } });
  const capture = new Capture({ sensors: {}, toast: {}, getSettings: () => ({}), beforeShot() {}, afterShot() {} });
  assert.equal(await capture.copyText(null), false);
  assert.equal(await capture.copyText('  '), false);
  assert.equal(await capture.copyText('Texto revisado\ncom acentuação'), true);
  assert.equal(text, 'Texto revisado\ncom acentuação');
  fails = true;
  assert.equal(await capture.copyText('Novo texto'), false);
  assert.equal(text, 'Texto revisado\ncom acentuação');
});
