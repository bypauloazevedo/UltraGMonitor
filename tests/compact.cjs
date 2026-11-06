const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');

app.disableHardwareAcceleration();
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ultragmonitor-compacto-'));
app.setPath('userData', output);
const settings = require('../src/main/settings');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let win;
let sensors = { receivedAt: Date.now(), admin: true, pawnio: true, cpu: { name: 'Intel Core i7-12700F', load: 11, clock: 4200, temp: 52 }, gpu: { name: 'NVIDIA GeForce RTX 4060 Ti', load: 2, temp: 38 }, ram: { load: 61, used: 19.4, total: 31.84 }, disks: [], fps: { enabled: false } };
const state = () => ({ platform: 'win32', version: '0.5.0', sensor: { running: true }, persistence: {} });
const weather = { temp: 27, icon: 'rain', isDay: true, city: 'Vila Valqueire', max: 30, min: 22, rain: 75, raining: true };
const errors = [];

async function until(test, message) {
  for (let retry = 0; retry < 80; retry++) { if (await test()) return; await wait(30); }
  throw new Error(message);
}

app.whenReady().then(async () => {
  try {
    settings.load();
    settings.update({ language: 'pt', layout: 'compact', compactLayout: 'tall', locked: false, scale: 1, opacity: 0.35, modules: { disk: false, fps: false }, city: { name: 'Vila Valqueire', latitude: -22.8, longitude: -43.3 } });
    for (const [name, handler] of Object.entries({
      'settings:get': () => settings.get(), 'state:get': state, 'sensors:last': () => sensors, 'weather:last': () => weather,
      'dock:info': () => ({ height: 48, light: false }),
      'settings:set': (_event, patch) => { settings.update(patch); win.webContents.send('settings', settings.get()); return settings.get(); },
    })) ipcMain.handle(name, handler);
    win = new BrowserWindow({ width: 640, height: 900, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, sandbox: true, preload: path.resolve(__dirname, '../src/preload/preload.js') } });
    ipcMain.on('overlay:resize', (event, size) => {
      if (event.sender === win.webContents && Number.isFinite(size.width) && Number.isFinite(size.height)) win.setContentSize(Math.ceil(size.width), Math.ceil(size.height));
    });
    win.webContents.on('render-process-gone', (_event, details) => errors.push(details.reason));
    const js = (code) => win.webContents.executeJavaScript(code);
    await win.loadFile(path.resolve(__dirname, '../src/renderer/overlay/index.html'));
    await until(async () => await js('!!document.querySelector(".tb-ok")'), 'O Compacto não carregou');
    await js('document.fonts.ready.then(()=>true)');
    await wait(150);
    const order = await js('({hora:document.querySelector(".foot .time").getBoundingClientRect().top,monitor:document.querySelector(".mini > .row > .k").getBoundingClientRect().top})');
    assert.ok(order.hora < order.monitor, 'A hora precisa aparecer acima dos monitoramentos');
    const singleLine = await js('Array.from(document.querySelectorAll(".mini > .row")).every(row=>{const name=row.querySelector(".k").getBoundingClientRect();const values=row.querySelector(".readings").getBoundingClientRect();return values.left>name.left && Math.abs((name.top+name.height/2)-(values.top+values.height/2))<1;})');
    assert.equal(singleLine, true, 'Nome e leituras precisam ficar na mesma linha');
    const gaps = await js('Array.from(document.querySelectorAll(".readings")).map(el=>getComputedStyle(el).columnGap)');
    assert.ok(gaps.every(gap => parseFloat(gap) <= 8), 'Uso e temperatura ficaram afastados');
    const clipped = await js('Array.from(document.querySelectorAll(".tb-seg button, .mini .k .lbl, .mini .stable")).filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>({texto:el.textContent,largura:el.clientWidth,necessario:el.scrollWidth}))');
    console.log(JSON.stringify({ cortados: clipped }));
    fs.writeFileSync(path.join(output, 'compacto-edicao.png'), (await win.webContents.capturePage()).toPNG());
    await js('Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>"hidden"});document.querySelector("[data-action=done]").click();true;');
    await until(() => settings.get().locked, 'O clique em Pronto não chegou ao app');
    await wait(100);
    const menu = await js('({aberto:!!document.querySelector(".toolbar"),editando:document.body.classList.contains("editing")})');
    console.log(JSON.stringify({ pronto: menu, pasta: output }));
    assert.equal(menu.aberto, false, 'Pronto manteve o menu aberto depois da captura');
    assert.equal(menu.editando, false);
    assert.deepEqual(clipped, [], 'O Compacto está cortando textos');
    await js('delete document.visibilityState;document.dispatchEvent(new Event("visibilitychange"));true;');
    for (const layout of ['tall', 'list']) {
      settings.update({ compactLayout: layout, locked: false, typography: { metrics: { font: 'audiowide', size: 1.6 } } });
      win.webContents.send('settings', settings.get());
      sensors = { ...sensors, cpu: { ...sensors.cpu, name: 'Intel Core Ultra 9 285K' }, gpu: { ...sensors.gpu, name: 'NVIDIA GeForce RTX 5090 Laptop GPU' }, ram: { ...sensors.ram, used: 119.4, total: 128 } };
      win.webContents.send('sensors', sensors);
      await wait(180);
      await js('document.fonts.ready.then(()=>true)');
      assert.equal(await js('Array.from(document.querySelectorAll(".mini > .row > .k, .mini .readings")).every(el=>getComputedStyle(el).fontFamily.toLowerCase().includes("audiowide"))'), true, 'O Compacto precisa respeitar a fonte escolhida para o Monitor');
      assert.equal(await js('Array.from(document.querySelectorAll(".tb-seg button, .mini .k .lbl, .mini .stable")).every(el=>el.scrollWidth<=el.clientWidth+1)'), true, 'O Compacto cortou dados em texto maior');
      await js('document.querySelector("[data-action=done]").click();true;');
      await until(async () => await js('!document.querySelector(".toolbar")'), 'O menu não fechou');
      await wait(100);
      fs.writeFileSync(path.join(output, 'compacto-' + layout + '.png'), (await win.webContents.capturePage()).toPNG());
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ resultado: 'Compacto sem cortes e Pronto funcionando mesmo após mudança de visibilidade', pasta: output }));
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});

setTimeout(() => { console.error('A verificação do Compacto demorou demais'); app.exit(1); }, 15000);
