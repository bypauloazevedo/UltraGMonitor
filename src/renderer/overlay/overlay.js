const fmt = window.HudFmt;
const { t } = window.HudI18n;
const icons = window.HudIcons;
const fonts = window.HudFonts;
const ui = icons.ui;
const root = document.getElementById('hud');

const TEMP = { cpu: [80, 90], gpu: [78, 85], disk: [55, 65] };
const LOAD = [65, 80];
const LABELS = { cpu: 'CPU', gpu: 'GPU', ram: 'RAM', disk: 'SSD' };
const SECOND_ICONS = { cpu: ui.thermo, gpu: ui.thermo, ram: ui.memory, disk: ui.thermo };
const MINI_PLACEHOLDERS = {
  fps: ['888', '1% 888'],
  cpu: ['100%', '88°'],
  gpu: ['100%', '88°'],
  ram: ['100%', '88.8G'],
  disk: ['100%', '88°'],
};

let settings = null;
let sensors = null;
let weather = null;
let dock = { height: 48, light: false };
let structureKey = '';
let lastIcon = '';
let resizing = false;
let sliding = false;
let fpsLive = false;
let fpsEnter = false;
let fpsHideTimer = 0;

function isDock() {
  return settings.layout === 'dock';
}

function pickDisk(list) {
  if (!list || !list.length) return null;
  return list.find((d) => d.id === settings.diskId) || list.find((d) => d.system) || list.find((d) => fmt.has(d.temp)) || list[0];
}

function showFps() {
  return settings.modules.fps && settings.fpsEnabled;
}

function fpsVisible() {
  return showFps() && fpsLive;
}

function metricKeys() {
  return ['cpu', 'gpu', 'ram', 'disk'].filter((k) => settings.modules[k]);
}

function anchor() {
  const pos = settings.position || { anchorX: 'right', anchorY: 'top' };
  return { x: pos.anchorX === 'left' ? 'r' : 'l', y: pos.anchorY === 'top' ? 'b' : 't' };
}

function hwMode() {
  const near = settings.layout === 'card' || settings.layout === 'compact';
  return near ? settings.hwNames || 'name' : settings.hwNamesStrip || 'model';
}

function hwLabel(key) {
  const raw = sensors && sensors[key] && sensors[key].name;
  return window.HudHardware.label(key, raw, hwMode()) || LABELS[key];
}

function label(key) {
  return `<span class="lbl" data-k="${key}.label">${LABELS[key]}</span>`;
}

function stable(placeholder, key, right) {
  return `<span class="stable${right ? ' r' : ''}" data-ph="${placeholder}"><span data-k="${key}">—</span></span>`;
}

function timePlaceholder() {
  return `88:88${settings.showSeconds ? ':88' : ''}${settings.clock24h ? '' : ' PM'}`;
}

function grip() {
  const a = anchor();
  const isBar = settings.layout === 'bar';
  const style = [a.x === 'r' ? 'right:.4em' : 'left:.4em'];
  if (!isBar) style.push(a.y === 'b' ? 'bottom:.35em' : 'top:.35em');
  const flip = (a.x === 'l') !== (a.y === 't');
  style.push(`--flip:scale(${a.x === 'l' ? -1 : 1},${a.y === 't' ? -1 : 1})`);
  style.push(`cursor:${flip ? 'nesw-resize' : 'nwse-resize'}`);
  return `<div class="grip" style="${style.join(';')}">${ui.corner}</div>`;
}

function cardLayout() {
  return ['list', 'tall'].includes(settings.cardLayout) ? settings.cardLayout : 'grid';
}

function compactLayout() {
  return settings.compactLayout === 'tall' ? 'tall' : 'list';
}

function hasMedia() {
  const bg = settings.background;
  return !!(bg && bg.file) && (settings.layout === 'card' || settings.layout === 'compact');
}

function media() {
  if (!hasMedia()) return '';
  const bg = settings.background;
  const src = `ugm://background/${encodeURIComponent(bg.file)}`;
  return bg.kind === 'video'
    ? `<div class="media"><video src="${src}" autoplay muted loop playsinline></video></div>`
    : `<div class="media"><img src="${src}" alt="" /></div>`;
}

function surfaceClass(base) {
  const a = anchor();
  return `${base} surface grip-${a.y} grip-${a.x}${hasMedia() ? ' has-media' : ''}`;
}

function tile(key) {
  const temp = key !== 'ram'
    ? `<span class="chip" data-k="${key}.chipbox" hidden><span class="ico">${ui.thermo}</span>${stable('88°', `${key}.chip`)}</span>`
    : '';
  return `
    <div class="tile">
      <div class="tile-head"><span class="tile-name"><span class="ico">${ui[key]}</span>${label(key)}</span>${temp}</div>
      <div class="tile-value num" data-k="${key}.tone"><span data-k="${key}.value">—</span><small>%</small></div>
      <div class="meter"><i data-k="${key}.meter"></i></div>
      <div class="tile-extra num" data-k="${key}.extra"></div>
    </div>`;
}

function buildCard() {
  const m = settings.modules;
  const hasTop = m.clock || m.date || m.weather;
  const parts = [];
  if (hasTop) {
    const left = [];
    if (m.clock) {
      left.push(`<div class="clock num">${stable('88:88', 'time.hm', true)}${settings.showSeconds ? `<span class="sec">${stable('88', 'time.sec')}</span>` : ''}${settings.clock24h ? '' : `<span class="suffix">${stable('PM', 'time.suffix')}</span>`}</div>`);
    }
    if (m.date) left.push('<div class="day"><div class="weekday" data-k="time.weekday"></div><div class="date" data-k="time.date"></div></div>');
    let right = '';
    if (m.weather) {
      right = settings.city
        ? `<div class="wx">
            <div class="wx-now"><span class="ico" data-k="wx.icon"></span><span class="wx-temp num">${stable('-88°', 'wx.temp', true)}</span></div>
            <div class="wx-rain" data-k="wx.rainbox"><span class="ico" data-k="wx.rainicon"></span><span data-k="wx.rain"></span></div>
            <div class="wx-meta num" data-k="wx.meta"></div>
          </div>`
        : `<div class="wx"><div class="wx-empty">${t('Escolha a cidade nas configurações pra ver o clima')}</div></div>`;
    }
    parts.push(`<div class="top"><div>${left.join('')}</div>${right}</div>`);
  }
  const keys = metricKeys();
  const hasBottom = fpsVisible() || keys.length;
  if (hasTop && hasBottom) parts.push('<div class="rule"></div>');
  if (hasBottom) {
    const inner = [];
    if (fpsVisible()) {
      inner.push(`
        <div class="fps is-fps">
          <div class="fps-app" data-k="fps.app"></div>
          <div class="fps-main" data-k="fps.tone"><span class="ico">${ui.fps}</span><span class="fps-value num">${stable('888', 'fps.value', true)}</span><span class="fps-unit">FPS</span></div>
          <div class="fps-detail num">${stable('1% 888 · 88.8 ms', 'fps.detail', true)}</div>
        </div>`);
    }
    if (keys.length) inner.push(`<div class="tiles">${keys.map(tile).join('')}</div>`);
    parts.push(`<div class="metrics">${inner.join('')}</div>`);
  }
  if (!parts.length) parts.push(`<div class="wx-empty">${t('Nada selecionado')}</div>`);
  return `<div class="${surfaceClass(`card card-${cardLayout()}`)}">${media()}${parts.join('')}${grip()}</div>`;
}

function row(key) {
  const [ph, ph2] = MINI_PLACEHOLDERS[key];
  const icon = SECOND_ICONS[key];
  const name = key === 'fps' ? '<span class="lbl">FPS</span>' : label(key);
  const v2 = `<span class="v2" data-k="${key}.mini2box" hidden>${icon ? `<span class="ico">${icon}</span>` : ''}${stable(ph2, `${key}.mini2`)}</span>`;
  return `<div class="row${key === 'fps' ? ' is-fps' : ''}" data-k="${key}.tone"><span class="k"><span class="ico">${key === 'fps' ? ui.fps : ui[key]}</span>${name}</span><span class="v">${stable(ph, `${key}.mini`, true)}</span>${v2}</div>`;
}

function buildMini() {
  const m = settings.modules;
  const isBar = settings.layout === 'bar';
  const time = m.clock ? `<div class="row time"><span class="v num">${stable(timePlaceholder(), 'time.mini')}</span></div>` : '';
  const day = m.date ? '<div class="row day"><span class="v" data-k="time.short"></span></div>' : '';
  const wx = m.weather && settings.city
    ? `<div class="row weather"><span class="k"><span class="ico" data-k="wx.icon"></span></span><span class="v num">${stable('-88°', 'wx.temp', true)}</span><span class="v2" data-k="wx.minirain"></span></div>`
    : '';
  const metrics = [];
  if (fpsVisible()) metrics.push(row('fps'));
  for (const key of metricKeys()) metrics.push(row(key));
  const foot = [time, day, wx].filter(Boolean).join('');
  const footHtml = foot ? `<div class="foot">${foot}</div>` : '';
  const items = isBar ? [footHtml, ...metrics] : [...metrics, footHtml];
  const html = items.filter(Boolean).join('') || '<div class="row"><span class="k">UltraG</span></div>';
  return `<div class="${surfaceClass(isBar ? 'mini bar' : `mini compact-${compactLayout()}`)}">${media()}${html}${grip()}</div>`;
}

function dockItem(key) {
  const [ph, ph2] = MINI_PLACEHOLDERS[key];
  return `
    <div class="dk${key === 'fps' ? ' is-fps' : ''}" data-k="${key}.tone">
      <span class="ico dk-ico">${key === 'fps' ? ui.fps : ui[key]}</span>
      <div class="dk-text">
        <div class="dk-top num">${stable(ph, `${key}.mini`, true)}<span class="dk-second" data-k="${key}.mini2box" hidden>${stable(ph2, `${key}.mini2`)}</span></div>
        <div class="dk-sub">${key === 'fps' ? '<span class="lbl">FPS</span>' : label(key)}</div>
      </div>
    </div>`;
}

function buildDock() {
  const items = [];
  if (settings.modules.weather && settings.city) {
    items.push(`
      <div class="dk dk-wx">
        <span class="ico dk-ico" data-k="wx.icon"></span>
        <div class="dk-text">
          <div class="dk-big num">${stable('-88°', 'wx.temp', true)}</div>
          <div class="dk-sub dk-rain" data-k="wx.rainbox"><span data-k="wx.dockrain"></span></div>
        </div>
      </div>`);
  }
  if (fpsVisible()) items.push(dockItem('fps'));
  for (const key of metricKeys()) items.push(dockItem(key));
  if (!items.length) items.push('<div class="dk"><div class="dk-sub">UltraGMonitor</div></div>');
  const tools = settings.locked
    ? handle('dk-handle')
    : `<span class="dk-tools"><button class="tb-icon" data-action="settings" title="${t('Configurações')}">${ui.gear}</button><button class="tb-icon tb-ok" data-action="done" title="${t('Pronto')}">${ui.check}</button></span>`;
  return `<div class="dock surface${dock.light ? ' light' : ''}">${items.join('<i class="dk-sep"></i>')}${tools}</div>`;
}

function handle(extra) {
  return `<button class="handle${extra ? ` ${extra}` : ''}" data-action="edit" title="${t('Ajustar posição e estilo')}">${ui.sliders}</button>`;
}

function toolbar() {
  const layouts = [
    ['card', 'Card'],
    ['compact', 'Compacto'],
    ['bar', 'Barra'],
  ];
  const buttons = layouts.map(([value, label]) => `<button data-layout="${value}"${settings.layout === value ? ' class="on"' : ''}>${t(label)}</button>`).join('');
  const opacity = Math.round(settings.opacity * 100);
  return `
    <div class="toolbar">
      <div class="tb-row">
        <div class="tb-seg">${buttons}</div>
        <button class="tb-icon" data-action="settings" title="${t('Configurações')}">${ui.gear}</button>
        <button class="tb-ok" data-action="done"><span class="ico">${ui.check}</span>${t('Pronto')}</button>
      </div>
      <label class="tb-range">
        <span>${t('Fundo')}</span>
        <input type="range" min="0" max="1" step="0.05" value="${settings.opacity}" style="--fill:${opacity}%" />
        <output class="num" data-k="tb.opacity">${opacity}%</output>
      </label>
      <div class="tb-hint">${t('Arraste pra mover · puxe o canto pra mudar o tamanho · solte na barra de tarefas pra virar Dock')}</div>
    </div>`;
}

function syncToolbar() {
  const range = root.querySelector('.tb-range input');
  if (!range || sliding) return;
  const opacity = Math.round(settings.opacity * 100);
  range.value = settings.opacity;
  range.style.setProperty('--fill', `${opacity}%`);
  text('tb.opacity', `${opacity}%`);
}

function reportHandle() {
  const el = root.querySelector('.handle');
  if (!el) {
    window.hud.setHandleRect(null);
    return;
  }
  const r = el.getBoundingClientRect();
  window.hud.setHandleRect({ x: r.left, y: r.top, width: r.width, height: r.height });
}

function build() {
  const bg = settings.background || {};
  const key = JSON.stringify([settings.language, settings.layout, cardLayout(), compactLayout(), settings.modules, settings.fpsEnabled, fpsLive, settings.showSeconds, settings.clock24h, !!settings.city, settings.locked, anchor(), bg.file, dock.light, hwMode()]);
  if (key === structureKey) return;
  structureKey = key;
  lastIcon = '';
  if (isDock()) root.innerHTML = buildDock();
  else root.innerHTML = settings.layout === 'card' ? buildCard() : buildMini();
  if (!isDock()) {
    const surface = root.querySelector('.surface');
    if (settings.locked) surface.insertAdjacentHTML('beforeend', handle());
    else root.insertAdjacentHTML('beforeend', toolbar());
  }
  if (fpsEnter) {
    fpsEnter = false;
    for (const el of root.querySelectorAll('.is-fps')) {
      el.classList.add('fps-in');
      el.addEventListener('animationend', () => el.classList.remove('fps-in'), { once: true });
    }
  }
  updateClock();
  updateWeather();
  updateSensors();
  requestAnimationFrame(reportHandle);
}

function hasFpsValue() {
  return !!(sensors && sensors.fps && fmt.has(sensors.fps.value));
}

function syncFps() {
  if (hasFpsValue()) {
    clearTimeout(fpsHideTimer);
    fpsHideTimer = 0;
    for (const el of root.querySelectorAll('.is-fps.fps-out')) el.classList.remove('fps-out');
    if (!fpsLive) {
      fpsLive = true;
      fpsEnter = true;
      build();
    }
    return;
  }
  if (!fpsLive || fpsHideTimer) return;
  fpsHideTimer = setTimeout(() => {
    const items = root.querySelectorAll('.is-fps');
    for (const el of items) el.classList.add('fps-out');
    setTimeout(() => {
      fpsHideTimer = 0;
      if (hasFpsValue()) return;
      fpsLive = false;
      build();
    }, items.length ? 300 : 0);
  }, 3000);
}

function each(key, fn) {
  for (const el of root.querySelectorAll(`[data-k="${key}"]`)) fn(el);
}

function text(key, value) {
  each(key, (el) => {
    if (el.textContent !== value) el.textContent = value;
  });
}

function html(key, value) {
  each(key, (el) => {
    if (el.dataset.html !== value) {
      el.innerHTML = value;
      el.dataset.html = value;
    }
  });
}

function tone(key, level) {
  each(key, (el) => {
    if (level) el.dataset.level = level;
    else delete el.dataset.level;
  });
}

function visible(key, on) {
  each(key, (el) => {
    el.hidden = !on;
  });
}

function meter(key, value) {
  each(key, (el) => {
    el.style.width = `${fmt.has(value) ? Math.max(0, Math.min(100, value)) : 0}%`;
  });
}

function updateClock() {
  const t = fmt.time(new Date(), settings.clock24h);
  text('time.hm', t.hm);
  text('time.sec', t.sec);
  text('time.suffix', t.suffix);
  text('time.weekday', t.weekday);
  text('time.date', t.date);
  text('time.short', t.short);
  text('time.mini', `${t.hm}${settings.showSeconds ? `:${t.sec}` : ''}${t.suffix ? ` ${t.suffix}` : ''}`);
}

function updateWeather() {
  if (!weather) {
    text('wx.temp', '—');
    text('wx.meta', '');
    text('wx.rain', '');
    text('wx.minirain', '');
    text('wx.dockrain', '');
    return;
  }
  const iconKey = `${weather.icon}-${weather.isDay}`;
  if (iconKey !== lastIcon) {
    html('wx.icon', icons.weather(weather.icon, weather.isDay));
    lastIcon = iconKey;
  }
  text('wx.temp', fmt.temp(weather.temp));
  const chance = fmt.has(weather.rain) && !weather.raining ? ` · ${t('{n}% hoje', { n: Math.round(weather.rain) })}` : '';
  text('wx.rain', weather.raining ? t('Chovendo') : `${t('Sem chuva')}${chance}`);
  text('wx.dockrain', weather.raining ? t('Chovendo') : t('Sem chuva'));
  html('wx.rainicon', weather.raining ? ui.umbrella : ui.droplet);
  tone('wx.rainbox', weather.raining ? 'rain' : '');
  text('wx.minirain', weather.raining ? t('chovendo') : '');
  const range = fmt.has(weather.max) ? ` · ${fmt.temp(weather.max)} / ${fmt.temp(weather.min)}` : '';
  text('wx.meta', `${weather.city}${range}`);
}

function extraHtml(items) {
  return items
    .filter(([, value]) => value)
    .map(([icon, value]) => `<span><span class="ico">${icon}</span>${value}</span>`)
    .join('');
}

function setMetric(key, { value, level, temp, tempLevel, extra, mini2 }) {
  text(`${key}.value`, fmt.round(value));
  tone(`${key}.tone`, level);
  meter(`${key}.meter`, value);
  tone(`${key}.meter`, level);
  const hasTemp = fmt.has(temp);
  visible(`${key}.chipbox`, hasTemp);
  text(`${key}.chip`, hasTemp ? fmt.temp(temp) : '');
  tone(`${key}.chipbox`, tempLevel);
  html(`${key}.extra`, extraHtml(extra || []));
  text(`${key}.mini`, fmt.has(value) ? `${Math.round(value)}%` : '—');
  const second = mini2 !== undefined ? mini2 : hasTemp ? fmt.temp(temp) : '';
  visible(`${key}.mini2box`, !!second);
  text(`${key}.mini2`, second);
  tone(`${key}.mini2box`, mini2 !== undefined ? '' : tempLevel);
}

function updateLabels() {
  for (const key of ['cpu', 'gpu', 'ram', 'disk']) {
    const value = hwLabel(key);
    text(`${key}.label`, value);
    each(`${key}.label`, (el) => el.classList.toggle('is-name', value !== LABELS[key]));
  }
}

function updateSensors() {
  const s = sensors || {};
  const cpu = s.cpu || {};
  const gpu = s.gpu || {};
  const ram = s.ram || {};
  const disk = pickDisk(s.disks) || {};
  updateLabels();

  const coreText = cardLayout() === 'grid' ? 'máx {n}%' : 'núcleo máx {n}%';
  setMetric('cpu', {
    value: cpu.load,
    level: fmt.level(cpu.load, ...LOAD),
    temp: cpu.temp,
    tempLevel: fmt.level(cpu.temp, ...TEMP.cpu),
    extra: [
      [ui.pulse, fmt.has(cpu.clock) && `${(cpu.clock / 1000).toFixed(1)} GHz`],
      fmt.has(cpu.power) ? [ui.zap, `${Math.round(cpu.power)} W`] : [ui.cpu, fmt.has(cpu.maxCore) && t(coreText, { n: Math.round(cpu.maxCore) })],
    ],
  });

  const vram = fmt.has(gpu.vramUsed) && fmt.has(gpu.vramTotal) ? `${(gpu.vramUsed / 1024).toFixed(1)}/${Math.round(gpu.vramTotal / 1024)} GB` : '';
  setMetric('gpu', {
    value: gpu.load,
    level: fmt.level(gpu.load, ...LOAD),
    temp: gpu.temp,
    tempLevel: fmt.level(gpu.temp, ...TEMP.gpu),
    extra: [[ui.memory, vram], [ui.zap, fmt.has(gpu.power) && `${Math.round(gpu.power)} W`]],
  });

  setMetric('ram', {
    value: ram.load,
    level: fmt.level(ram.load, ...LOAD),
    extra: [[ui.memory, fmt.has(ram.used) && `${ram.used.toFixed(1)} / ${Math.round(ram.total)} GB`]],
    mini2: fmt.has(ram.used) ? `${ram.used.toFixed(1)}G` : '',
  });

  setMetric('disk', {
    value: disk.activity,
    level: fmt.level(disk.activity, 85, 98),
    temp: disk.temp,
    tempLevel: fmt.level(disk.temp, ...TEMP.disk),
    extra: [[ui.down, fmt.has(disk.read) && fmt.rate(disk.read)], [ui.up, fmt.has(disk.write) && fmt.rate(disk.write)]],
  });

  updateFps(s.fps || {});
}

function updateFps(fps) {
  if (!showFps()) return;
  const has = fmt.has(fps.value);
  const level = has ? fmt.lowLevel(fps.value, 50, 30) : '';
  text('fps.value', has ? String(Math.round(fps.value)) : '—');
  tone('fps.tone', level);
  let app = '';
  if (has) app = fps.app || '';
  else if (fps.enabled) app = t('Aguardando jogo…');
  else if (sensors && !sensors.admin) app = t('FPS precisa de admin');
  else if (fps.error) app = t('FPS indisponível');
  else app = t('Iniciando…');
  text('fps.app', app);
  text('fps.detail', has ? `1% ${fmt.round(fps.low1)} · ${fmt.fixed(fps.frametime)} ms` : '');
  text('fps.mini', has ? String(Math.round(fps.value)) : '—');
  visible('fps.mini2box', has);
  text('fps.mini2', has ? `1% ${fmt.round(fps.low1)}` : '');
}

function applyTheme() {
  window.HudI18n.setLang(settings.language);
  const style = document.documentElement.style;
  const t = settings.typography;
  const display = fonts.stack(t.clock.font);
  window.HudTheme.apply(settings.accent);
  style.setProperty('--bg-alpha', String(isDock() ? 0 : settings.opacity));
  style.setProperty('--media-alpha', String((settings.background && settings.background.opacity) ?? 0.6));
  if (!resizing) style.setProperty('--scale', String(settings.scale));
  style.setProperty('--clock-font', display);
  style.setProperty('--clock-size', String(t.clock.size));
  style.setProperty('--clock-weight', String(t.clock.weight || fonts.byId(t.clock.font).weight));
  style.setProperty('--date-font', display);
  style.setProperty('--date-size', String(t.date.size));
  style.setProperty('--wx-font', display);
  style.setProperty('--wx-size', String(t.weather.size));
  style.setProperty('--metrics-font', fonts.stack(t.metrics.font));
  style.setProperty('--metrics-size', String(t.metrics.size));
  style.setProperty('--dock-h', `${dock.height}px`);
  document.body.classList.toggle('editing', !settings.locked);
  document.body.classList.toggle('docked', isDock());
}

function scheduleClock() {
  const now = Date.now();
  setTimeout(() => {
    updateClock();
    scheduleClock();
  }, 1000 - (now % 1000) + 5);
}

root.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('.grip');
  if (!handle) return;
  event.preventDefault();
  handle.setPointerCapture(event.pointerId);
  resizing = true;
  const a = anchor();
  const rect = root.getBoundingClientRect();
  const startX = event.screenX;
  const startY = event.screenY;
  const startScale = settings.scale;
  let target = startScale;
  let shown = startScale;
  let frame = 0;
  let released = false;
  document.documentElement.classList.add('resizing');
  const finish = () => {
    resizing = false;
    document.documentElement.classList.remove('resizing');
    const final = Math.round(target * 100) / 100;
    if (final !== startScale) window.hud.setSettings({ scale: final });
  };
  const step = () => {
    shown += (target - shown) * 0.2;
    if (Math.abs(target - shown) < 0.002) shown = target;
    document.documentElement.style.setProperty('--scale', shown.toFixed(3));
    if (shown !== target) {
      frame = requestAnimationFrame(step);
      return;
    }
    frame = 0;
    if (released) finish();
  };
  const onMove = (ev) => {
    const dx = (ev.screenX - startX) * (a.x === 'r' ? 1 : -1);
    const dy = (ev.screenY - startY) * (a.y === 'b' ? 1 : -1);
    const factor = Math.max((rect.width + dx) / rect.width, (rect.height + dy) / rect.height);
    target = Math.min(3, Math.max(0.6, startScale * factor));
    if (!frame) frame = requestAnimationFrame(step);
  };
  const onUp = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
    released = true;
    if (!frame) finish();
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
});

root.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.tb-range input')) return;
  sliding = true;
  const stop = () => {
    sliding = false;
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  };
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
});

root.addEventListener('input', (event) => {
  const range = event.target.closest('.tb-range input');
  if (!range) return;
  const value = Number(range.value);
  const opacity = Math.round(value * 100);
  range.style.setProperty('--fill', `${opacity}%`);
  text('tb.opacity', `${opacity}%`);
  document.documentElement.style.setProperty('--bg-alpha', String(value));
  window.hud.setSettings({ opacity: value });
});

root.addEventListener('click', (event) => {
  const layout = event.target.closest('[data-layout]');
  if (layout) {
    window.hud.setSettings({ layout: layout.dataset.layout });
    return;
  }
  const action = event.target.closest('[data-action]');
  if (!action) return;
  if (action.dataset.action === 'edit') window.hud.setSettings({ locked: false });
  else if (action.dataset.action === 'done') window.hud.setSettings({ locked: true });
  else if (action.dataset.action === 'settings') window.hud.openSettings();
});

new ResizeObserver(() => {
  const rect = root.getBoundingClientRect();
  window.hud.resize(rect.width, rect.height);
  reportHandle();
}).observe(root);

async function init() {
  settings = await window.hud.getSettings();
  sensors = await window.hud.lastSensors();
  fpsLive = hasFpsValue();
  weather = await window.hud.lastWeather();
  dock = { ...dock, ...(await window.hud.dockInfo()) };
  applyTheme();
  build();
  scheduleClock();

  window.hud.onSettings((next) => {
    settings = next;
    applyTheme();
    build();
    syncToolbar();
    updateSensors();
  });
  window.hud.onSensors((data) => {
    sensors = data;
    syncFps();
    updateSensors();
  });
  window.hud.onWeather((data) => {
    weather = data;
    updateWeather();
  });
  window.hud.onDock((info) => {
    dock = { ...dock, ...info };
    applyTheme();
    build();
  });
  window.hud.onPeek((on) => {
    document.body.classList.toggle('peek', !!on);
  });
  window.hud.onHandle((on) => {
    document.body.classList.toggle('handle-on', !!on);
  });
}

init();
