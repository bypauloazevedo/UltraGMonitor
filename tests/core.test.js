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
  assert.deepEqual(sanitize({ historyBounds: { x: 120, y: 80, width: 900, height: 700 }, historyMaximized: true }), { historyBounds: { x: 120, y: 80, width: 900, height: 700 }, historyMaximized: true });
  assert.deepEqual(sanitize({ historyBounds: { x: 0, y: 0, width: 1, height: 20000 } }), { historyBounds: { x: 0, y: 0, width: 460, height: 10000 } });
  assert.deepEqual(sanitize({ historyBounds: { x: 'fora', y: 0, width: 900, height: 700 }, historyMaximized: 'sim' }), {});
});

function historyFixture(values = {}, area = { x: 0, y: 0, width: 1920, height: 1080 }) {
  const created = [];
  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.bounds = Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, options[key]]));
      this.webContents = { send() {} };
      this.maximized = false;
      created.push(this);
    }
    isDestroyed() { return false; }
    isMinimized() { return false; }
    isMaximized() { return this.maximized; }
    getNormalBounds() { return { ...this.bounds }; }
    loadFile() {}
    show() {}
    focus() {}
    hide() { this.emit('hide'); }
    maximize() { this.maximized = true; this.emit('maximize'); }
  }
  const { History } = load('src/main/history.js', { electron: {
    BrowserWindow: Window,
    screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ workArea: area }), getDisplayMatching: () => ({ workArea: area }) },
  } });
  const options = { toast: {}, getSettings: () => values, saveSettings: patch => Object.assign(values, sanitize(patch)), pinFile() {} };
  return { history: new History(options), reopen: () => new History(options), created, values };
}

test('Últimos prints guarda expansão, posição e maximização entre aberturas', () => {
  const { history, reopen, created, values } = historyFixture();
  history.open();
  const first = created[0];
  assert.equal(first.options.resizable, true);
  assert.equal(first.options.maximizable, true);
  first.bounds = { x: 120, y: 80, width: 1020, height: 760 };
  first.emit('resize');
  first.hide();
  history.open();
  assert.equal(created.length, 1);
  assert.deepEqual(values.historyBounds, first.bounds);
  const next = reopen();
  next.open();
  assert.deepEqual(created[1].bounds, first.bounds);
  first.maximize();
  assert.equal(values.historyMaximized, true);
  const restored = reopen();
  restored.open();
  created[2].emit('ready-to-show');
  assert.equal(created[2].isMaximized(), true);
  assert.deepEqual(values.historyBounds, first.bounds);
});

test('Últimos prints volta para a área visível quando a tela salva não existe mais', () => {
  const { history, created } = historyFixture({ historyBounds: { x: -5000, y: 3000, width: 3000, height: 2000 } }, { x: 0, y: 0, width: 1280, height: 720 });
  history.open();
  assert.deepEqual(created[0].bounds, { x: 0, y: 0, width: 1280, height: 720 });
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

function captureFixture(displays = [{ id: 1, bounds: { x: 0, y: 0, width: 640, height: 360 }, size: { width: 640, height: 360 }, scaleFactor: 1 }]) {
  const shortcuts = new Set(['PrintScreen']);
  const timers = new Map();
  const sent = [];
  const calls = [];
  let id = 0;
  let focused = true;
  const previous = { isDestroyed: () => false, isVisible: () => true, focus: () => calls.push('focus'), webContents: { focus() {} } };
  let foreground = previous;
  const { Capture } = load('src/main/capture.js', { electron: {
    app: { on() {} }, BrowserWindow: { getFocusedWindow: () => foreground },
    screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => displays[0], getAllDisplays: () => displays },
    globalShortcut: { isRegistered: (key) => shortcuts.has(key), register: (key) => { shortcuts.add(key); return true; }, unregister: (key) => shortcuts.delete(key) },
  } }, { setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; }, clearTimeout: (timer) => timers.delete(timer) });
  const capture = new Capture({ sensors: {}, getSettings: () => ({}), toast: { show: () => calls.push('error') }, beforeShot: () => calls.push('before'), afterShot: () => calls.push('after') });
  for (const display of displays) {
    let destroyed = false;
    let visible = false;
    const win = { isDestroyed: () => destroyed, isVisible: () => visible, isFocused: () => focused, destroy: () => { destroyed = true; }, setBounds: bounds => { win.bounds = bounds; }, showInactive: () => { visible = true; }, hide: () => { visible = false; }, moveTop() {}, focus() {}, webContents: { send: (channel) => sent.push(channel), focus() {} } };
    capture.windows.set(display.id, { win, display, ready: false, shot: null, keysEnabled: true });
  }
  capture.targets = Array.from(capture.windows.values());
  capture.win = capture.targets[0].win;
  capture.warm = () => Promise.resolve();
  return { capture, shortcuts, timers, sent, calls, previous, foreground: value => { foreground = value; }, focus: (value) => { focused = value; } };
}

test('Falha da captura preserva o foco das configurações sem ativar o app sobre o jogo', () => {
  const fixture = captureFixture();
  fixture.capture.busy = true;
  fixture.focus(false);
  fixture.capture.win.destroy = () => fixture.foreground(null);
  fixture.capture.fail({});
  assert.deepEqual(fixture.calls, ['after', 'error', 'focus']);
  const cached = captureFixture();
  cached.capture.busy = true;
  cached.focus(false);
  cached.capture.fail({});
  assert.deepEqual(cached.calls, ['after', 'error', 'focus']);
  const game = captureFixture();
  game.capture.busy = true;
  game.capture.returnFocus = game.previous;
  game.focus(false);
  game.foreground(null);
  game.capture.fail({});
  assert.deepEqual(game.calls, ['after', 'error']);
});

test('Atalhos da captura só atuam com a janela focada e respeitam a edição de texto', () => {
  const { capture, shortcuts, focus } = captureFixture();
  capture.busy = true;
  capture.setKeysEnabled(true);
  assert.equal(shortcuts.has('CommandOrControl+C'), true);
  capture.releaseKeys();
  focus(false);
  capture.holdKeys();
  assert.deepEqual([...shortcuts], ['PrintScreen']);
  focus(true);
  capture.holdKeys();
  capture.setKeysEnabled(false);
  capture.holdKeys();
  assert.deepEqual([...shortcuts], ['PrintScreen']);
});

test('Captura que excede o tempo libera a tela e ignora o carregamento atrasado', async () => {
  const { capture, timers, sent, calls } = captureFixture();
  let finishLoading;
  capture.warm = () => new Promise((resolve) => { finishLoading = resolve; });
  const pending = capture.start();
  [...timers.values()].find((timer) => timer.ms === 10000).fn();
  assert.equal(capture.busy, false);
  assert.equal(capture.win.isDestroyed(), true);
  finishLoading();
  await pending;
  assert.equal(sent.includes('capture:start'), false);
  assert.deepEqual(calls, ['after', 'error', 'focus']);
});

test('Cancelar enquanto o print está sendo obtido não reabre a captura depois', async () => {
  const { capture, timers, sent, calls } = captureFixture();
  let finishShot;
  capture.grab = () => new Promise((resolve) => { finishShot = resolve; });
  const pending = capture.start();
  await Promise.resolve();
  const [id, timer] = [...timers].find(([, entry]) => entry.ms === 50);
  timers.delete(id);
  timer.fn();
  await Promise.resolve();
  assert.equal(typeof finishShot, 'function');
  capture.close();
  finishShot({ pixels: new Uint8Array(4), width: 1, height: 1 });
  await pending;
  assert.equal(capture.busy, false);
  assert.equal(capture.shot, null);
  assert.equal(sent.includes('capture:start'), false);
  assert.deepEqual(calls, ['before', 'after', 'focus']);
});

test('Quadro atrasado de uma captura anterior não exibe a próxima janela', () => {
  const { capture } = captureFixture();
  const shown = [];
  capture.busy = true;
  capture.session = 4;
  capture.display = { bounds: { width: 640, height: 360 } };
  capture.shot = { width: 640, height: 360 };
  capture.win.showInactive = () => shown.push('show');
  capture.win.moveTop = () => {};
  capture.win.focus = () => {};
  capture.ready(2);
  assert.equal(shown.length, 0);
  assert.notEqual(capture.shot, null);
  capture.ready(4);
  assert.deepEqual(shown, ['show']);
  assert.equal(capture.shot, null);
});

test('Captura mantém o painel visível sem disputar os cliques e a posição das janelas', () => {
  const { Overlay } = load('src/main/overlay.js', { electron: {} });
  const values = { locked: false, hidden: false, monitoring: true, layout: 'dock' };
  const overlay = new Overlay({ get: () => values }, {});
  const calls = [];
  let visible = true;
  overlay.win = { isDestroyed: () => false, isVisible: () => visible, setFocusable() {}, setIgnoreMouseEvents: (ignore) => calls.push(ignore), setAlwaysOnTop: () => calls.push('top'), moveTop: () => calls.push('move'), hide: () => { visible = false; }, showInactive: () => { visible = true; } };
  overlay.setCapturing(true);
  overlay.keepOnTop();
  overlay.setFullscreen({ active: true });
  assert.equal(visible, true);
  assert.equal(overlay.autoHidden, false);
  assert.deepEqual(calls, [true]);
  overlay.setCapturing(false);
  assert.equal(visible, true);
  assert.equal(calls.includes(false), true);
  values.hidden = true;
  overlay.setCapturing(true);
  overlay.setCapturing(false);
  assert.equal(visible, false);
});

test('Menu aberto recupera a interação depois da captura sem receber foco automaticamente', () => {
  const { Overlay } = load('src/main/overlay.js', { electron: {} });
  const values = { locked: false, hidden: false, monitoring: true };
  const overlay = new Overlay({ get: () => values }, {});
  let focusable;
  let ignoring;
  overlay.win = {
    isDestroyed: () => false,
    isVisible: () => true,
    setFocusable: (value) => { focusable = value; },
    setIgnoreMouseEvents: (value) => { ignoring = value; },
    setAlwaysOnTop() {},
  };
  for (let i = 0; i < 3; i++) {
    overlay.applyLock();
    assert.equal(focusable, true);
    assert.equal(ignoring, false);
    overlay.setCapturing(true);
    assert.equal(focusable, false);
    assert.equal(ignoring, true);
    overlay.applyLock();
    assert.equal(focusable, false);
    assert.equal(ignoring, true);
    overlay.setCapturing(false);
    assert.equal(values.locked, false);
    assert.equal(focusable, true);
    assert.equal(ignoring, false);
    values.locked = true;
    overlay.applyLock();
    assert.equal(focusable, false);
    assert.equal(ignoring, true);
    values.locked = false;
  }
});

test('Setinha de abrir o menu recupera cliques após cancelar capturas repetidas', () => {
  let cursor = { x: 12, y: 12 };
  const { Overlay } = load('src/main/overlay.js', { electron: { screen: { getCursorScreenPoint: () => cursor } } });
  const overlay = new Overlay({ get: () => ({ locked: true, hidden: false, monitoring: true }) }, {});
  let focusable;
  let ignoring;
  overlay.win = {
    isDestroyed: () => false,
    isVisible: () => true,
    getBounds: () => ({ x: 0, y: 0, width: 224, height: 300 }),
    setFocusable: (value) => { focusable = value; },
    setIgnoreMouseEvents: (value) => { ignoring = value; },
    setAlwaysOnTop() {},
    webContents: { send() {} },
  };
  overlay.setHandleRect({ x: 0, y: 0, width: 28, height: 28 });
  for (let i = 0; i < 5; i++) {
    overlay.setCapturing(true);
    overlay.setCapturing(false);
    assert.equal(focusable, false);
    assert.equal(ignoring, true);
    cursor = { x: 12, y: 12 };
    overlay.enterAt = Date.now() - 300;
    overlay.tickPointer();
    assert.equal(overlay.handleShown, true);
    assert.equal(focusable, true);
    assert.equal(ignoring, false);
    cursor = { x: 500, y: 500 };
    overlay.tickPointer();
    assert.equal(focusable, false);
    assert.equal(ignoring, true);
  }
});

test('Win+Shift+S e Ctrl+Win+Shift+S são reconhecidos pelo código nativo sem digitar no Windows', { skip: process.platform !== 'win32' }, (t) => {
  const { execFileSync } = require('node:child_process');
  const output = temporary(t);
  const executable = path.join(output, 'atalho.exe');
  const compiler = ['Framework64', 'Framework'].map(folder => path.join(process.env.WINDIR, 'Microsoft.NET', folder, 'v4.0.30319', 'csc.exe')).find(file => fs.existsSync(file));
  assert.ok(compiler, 'Compilador do .NET Framework não encontrado');
  execFileSync(compiler, ['/nologo', '/target:exe', `/out:${executable}`, path.resolve(__dirname, '../keyboard/CaptureChord.cs'), path.resolve(__dirname, 'shortcut-state.cs')], { windowsHide: true });
  assert.match(execFileSync(executable, [], { encoding: 'utf8', windowsHide: true }), /Combinações e repetição verificadas/);
});

test('Ajudante do atalho acompanha a instalação e se recupera além do limite dos sensores', () => {
  const scheduled = new Map();
  const intervals = [];
  let timer = 0;
  const { Sensors } = load('src/main/sensors.js', { child_process: {}, fs: {} }, {
    setTimeout: (fn, delay) => { scheduled.set(++timer, { fn, delay }); return timer; }, clearTimeout: id => scheduled.delete(id),
    setInterval: fn => { intervals.push(fn); return intervals.length; }, clearInterval() {},
  });
  const worker = new Sensors({ exe: 'teclado.exe', keyboardOnly: true });
  worker.hook = true;
  const commands = [];
  const socket = new EventEmitter();
  socket.destroyed = false;
  socket.write = line => commands.push(line.trim());
  socket.setEncoding = () => {};
  socket.destroy = () => { socket.destroyed = true; socket.emit('close'); };
  worker.onConnection(socket);
  assert.deepEqual(commands, ['hook on']);
  socket.emit('data', '{"type":"hook","active":true,"error":0}\n');
  assert.equal(worker.status.hookActive, true);
  let pressed;
  worker.on('key', key => { pressed = key; });
  socket.emit('data', '{"type":"key","name":"capture"}\n');
  assert.equal(pressed, 'capture');
  worker.setHook(false);
  worker.lastReading = 0;
  intervals[0]();
  assert.equal(socket.destroyed, false, 'Editar um atalho não deve reiniciar o ajudante em pausa');
  worker.setHook(true);
  worker.crashes = 20;
  worker.lastReading = 0;
  intervals[0]();
  assert.equal(socket.destroyed, true);
  assert.equal(worker.status.hookActive, false);
  assert.equal(worker.status.starting, true);
  assert.equal(worker.status.failed, false);
  assert.equal(scheduled.get(worker.restartTimer).delay, 10000);
  worker.stop();
  assert.equal(scheduled.size, 0);
});

test('Ajudante nativo conecta e encerra pelo pipe sem sensores, janela ou interceptação de teclas', { skip: process.platform !== 'win32' }, async (t) => {
  const { execFileSync } = require('node:child_process');
  const { Sensors } = require('../src/main/sensors');
  const output = temporary(t);
  const executable = path.join(output, 'teclado.exe');
  const compiler = ['Framework64', 'Framework'].map(folder => path.join(process.env.WINDIR, 'Microsoft.NET', folder, 'v4.0.30319', 'csc.exe')).find(file => fs.existsSync(file));
  execFileSync(compiler, ['/nologo', '/target:winexe', `/out:${executable}`, ...['Program.cs', 'KeyHook.cs', 'CaptureChord.cs'].map(file => path.resolve(__dirname, '../keyboard', file))], { windowsHide: true });
  const worker = new Sensors({ exe: executable, keyboardOnly: true });
  t.after(() => worker.stop());
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('O ajudante não confirmou a conexão')), 5000);
    worker.on('status', status => {
      if (status.running && status.hookActive === false && status.hookError === 0) { clearTimeout(timeout); resolve(); }
    });
    worker.start({ elevated: false, fps: false });
  });
  const child = worker.child;
  const exited = new Promise(resolve => child.once('exit', resolve));
  worker.stop();
  await exited;
  assert.equal(worker.socket, null);
});

test('Captura prepara todos os monitores e encaminha a imagem e a região da tela escolhida', async () => {
  const displays = [
    { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 },
    { id: 2, bounds: { x: -1280, y: -100, width: 1280, height: 720 }, size: { width: 1280, height: 720 }, scaleFactor: 1.5 },
  ];
  const { capture, timers } = captureFixture(displays);
  capture.grab = async display => ({ pixels: Buffer.from([display.id]), width: display.bounds.width * display.scaleFactor, height: display.bounds.height * display.scaleFactor, format: 'rgba' });
  const pending = capture.start();
  await Promise.resolve();
  [...timers.values()].find(entry => entry.ms === 50).fn();
  await pending;
  const [primary, secondary] = capture.targets;
  assert.equal(capture.image(primary.win.webContents).pixels[0], 1);
  assert.equal(capture.image(secondary.win.webContents).pixels[0], 2);
  assert.equal(capture.image(secondary.win.webContents).width / capture.image(secondary.win.webContents).cssWidth, 1.5);
  capture.ready(capture.session, primary.win.webContents);
  assert.equal(primary.win.isVisible(), false);
  assert.equal(secondary.win.isVisible(), false);
  capture.ready(capture.session, secondary.win.webContents);
  assert.equal(primary.win.isVisible(), true);
  assert.equal(secondary.win.isVisible(), true);
  assert.deepEqual(secondary.win.bounds, displays[1].bounds);
  assert.equal(capture.use(secondary.win.webContents), true);
  assert.equal(capture.display.id, 2);
  assert.deepEqual(capture.region(), displays[1]);
  assert.equal(primary.win.isVisible(), false);
  assert.equal(secondary.win.isVisible(), false);
  assert.equal(capture.owns(secondary.win.webContents), false);
});

test('Alternativa de captura procura o monitor pelo identificador e não troca pelo principal', async () => {
  const primary = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 };
  const secondary = { id: 2, bounds: { x: -1280, y: 0, width: 1280, height: 720 }, size: { width: 1280, height: 720 }, scaleFactor: 1.5 };
  const image = id => ({ display_id: String(id), thumbnail: { toBitmap: () => Buffer.from([id]), getSize: () => ({ width: 1920, height: 1080 }) } });
  let sources = [image(1), image(2)];
  const { Capture } = load('src/main/capture.js', { fs: { unlinkSync() {} }, electron: {
    app: { on() {} }, screen: { getAllDisplays: () => [primary, secondary], dipToScreenRect: () => { throw new Error('Sem ajudante'); } },
    desktopCapturer: { getSources: async () => sources },
  } });
  const capture = new Capture({ sensors: {}, toast: {}, getSettings: () => ({}), beforeShot() {}, afterShot() {} });
  assert.equal((await capture.grab(secondary)).pixels[0], 2);
  sources = [image(1)];
  await assert.rejects(capture.grab(secondary), /nenhuma tela encontrada/);
});
