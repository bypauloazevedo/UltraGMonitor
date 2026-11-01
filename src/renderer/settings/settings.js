const fonts = window.HudFonts;
const theme = window.HudTheme;
const MODULES = [
  ['clock', 'Relógio'],
  ['date', 'Dia'],
  ['weather', 'Clima'],
  ['fps', 'FPS'],
  ['cpu', 'CPU'],
  ['gpu', 'GPU'],
  ['ram', 'RAM'],
  ['disk', 'SSD'],
];
const $ = (id) => document.getElementById(id);

let settings = null;
let appState = null;
let sensors = null;

function save(patch) {
  return window.hud.setSettings(patch);
}

function setFill(input) {
  const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--fill', `${pct}%`);
}

function setRange(id, value, label) {
  const input = $(id);
  if (document.activeElement !== input) input.value = value;
  $(`${id}-out`).textContent = label;
  setFill(input);
}

function markSegmented(id, value) {
  for (const btn of $(id).querySelectorAll('button')) btn.classList.toggle('on', btn.dataset.value === value);
}

function renderVisual() {
  markSegmented('layout', settings.layout);
  setRange('scale', settings.scale, `${Math.round(settings.scale * 100)}%`);
  setRange('opacity', settings.opacity, `${Math.round(settings.opacity * 100)}%`);
}

function renderAccents() {
  const wrap = $('accent');
  if (!wrap.children.length) {
    for (const { color, name } of theme.accents) {
      const btn = document.createElement('button');
      btn.style.setProperty('--c', color);
      btn.title = name;
      btn.addEventListener('click', () => save({ accent: color }));
      wrap.appendChild(btn);
    }
  }
  const current = theme.accents.find((a) => a.color === settings.accent);
  [...wrap.children].forEach((btn, i) => btn.classList.toggle('on', theme.accents[i].color === settings.accent));
  $('accent-out').textContent = current ? current.name : '';
  theme.apply(settings.accent);
}

function fitPreview(btn) {
  const sample = btn.firstElementChild;
  sample.style.fontSize = '';
  const room = btn.clientWidth - 16;
  if (room > 0 && sample.scrollWidth > room) sample.style.fontSize = `${(13 * room) / sample.scrollWidth}px`;
}

function fitPreviews() {
  for (const btn of document.querySelectorAll('.font-grid button')) fitPreview(btn);
}

function fitPreviewsWhenLoaded() {
  const loads = fonts.list.map((f) => document.fonts.load(`13px ${f.family}`, 'UltraGMonitor').catch(() => null));
  Promise.all(loads).then(() => requestAnimationFrame(fitPreviews));
}

function fontGrid(id, part, group) {
  const grid = $(id);
  if (!grid.children.length) {
    for (const f of fonts.forGroup(group)) {
      const btn = document.createElement('button');
      btn.dataset.font = f.id;
      btn.title = f.label;
      const sample = document.createElement('span');
      sample.textContent = 'UltraGMonitor';
      sample.style.fontFamily = fonts.stack(f.id);
      sample.style.fontWeight = Math.max(450, f.weight);
      btn.appendChild(sample);
      btn.addEventListener('click', () => {
        const patch = { font: f.id };
        if (part === 'clock') patch.weight = f.weight;
        save({ typography: { [part]: patch } });
      });
      grid.appendChild(btn);
    }
  }
  const current = settings.typography[part].font;
  for (const btn of grid.children) btn.classList.toggle('on', btn.dataset.font === current);
  $(`${id}-out`).textContent = fonts.byId(current).label;
}

function renderTypography() {
  fontGrid('fonts-display', 'clock', 'display');
  fontGrid('fonts-metrics', 'metrics', 'metrics');
  for (const part of ['clock', 'date', 'weather', 'metrics']) {
    const size = settings.typography[part].size;
    setRange(`size-${part}`, size, `${Math.round(size * 100)}%`);
  }
  const clock = settings.typography.clock;
  const weight = clock.weight || fonts.byId(clock.font).weight;
  setRange('weight', weight, String(weight));
}

function renderBackground() {
  const bg = settings.background || {};
  const el = $('bg-current');
  el.textContent = bg.file ? bg.name || bg.file : 'Nenhum fundo animado';
  el.classList.toggle('empty', !bg.file);
  $('bg-clear').hidden = !bg.file;
  $('bg-opacity-field').hidden = !bg.file;
  const opacity = bg.opacity ?? 0.6;
  setRange('bg-opacity', opacity, `${Math.round(opacity * 100)}%`);
}

function renderModules() {
  const wrap = $('modules');
  if (!wrap.children.length) {
    for (const [key, label] of MODULES) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.dataset.key = key;
      btn.addEventListener('click', () => {
        const on = !settings.modules[key];
        const patch = { modules: { [key]: on } };
        if (key === 'fps') patch.fpsEnabled = on;
        save(patch);
      });
      wrap.appendChild(btn);
    }
  }
  for (const btn of wrap.children) btn.classList.toggle('on', !!settings.modules[btn.dataset.key]);
}

function renderSwitches() {
  for (const id of ['clock24h', 'showSeconds', 'fpsEnabled', 'adminSensors', 'startWithWindows', 'hoverFade']) {
    $(id).checked = !!settings[id];
  }
  renderHardwareNames();
}

const HW_MODES = [
  ['label', 'Rótulo'],
  ['name', 'Nome'],
  ['model', 'Simplificado'],
];

function renderHardwareNames() {
  const cpu = sensors && sensors.cpu && sensors.cpu.name;
  const gpu = sensors && sensors.gpu && sensors.gpu.name;
  const signature = `${cpu}|${gpu}`;
  const defaults = { hwNames: 'name', hwNamesStrip: 'model' };
  for (const id of ['hwNames', 'hwNamesStrip']) {
    const wrap = $(id);
    if (wrap.dataset.sig !== signature) {
      wrap.dataset.sig = signature;
      wrap.innerHTML = '';
      for (const [mode, caption] of HW_MODES) {
        const btn = document.createElement('button');
        btn.dataset.value = mode;
        for (const [key, raw] of [['cpu', cpu], ['gpu', gpu]]) {
          const line = document.createElement('span');
          line.className = 'hw-line';
          line.textContent = window.HudHardware.label(key, raw || (key === 'cpu' ? 'Intel Core i7-12700F' : 'NVIDIA GeForce RTX 4060 Ti'), mode);
          btn.appendChild(line);
        }
        const small = document.createElement('small');
        small.textContent = caption;
        btn.appendChild(small);
        wrap.appendChild(btn);
      }
    }
    const current = settings[id] || defaults[id];
    for (const btn of wrap.children) btn.classList.toggle('on', btn.dataset.value === current);
  }
}

function renderCity() {
  const el = $('city-current');
  const c = settings.city;
  el.classList.toggle('empty', !c);
  el.innerHTML = '';
  if (!c) {
    el.textContent = 'Nenhuma cidade escolhida';
    return;
  }
  el.textContent = c.name;
  const small = document.createElement('small');
  small.textContent = [c.admin1, c.country].filter(Boolean).join(', ');
  el.appendChild(small);
}

function defaultDisk(disks) {
  return disks.find((d) => d.system) || disks.find((d) => typeof d.temp === 'number') || disks[0];
}

function renderDisks() {
  const select = $('disk');
  const disks = (sensors && sensors.disks) || [];
  const signature = disks.map((d) => `${d.id}:${d.name}`).join('|') + settings.diskId;
  if (select.dataset.sig === signature) return;
  select.dataset.sig = signature;
  select.innerHTML = '';
  if (!disks.length) {
    const opt = document.createElement('option');
    opt.textContent = 'Nenhum disco lido';
    select.appendChild(opt);
    select.disabled = true;
    return;
  }
  select.disabled = false;
  const chosen = disks.find((d) => d.id === settings.diskId) || defaultDisk(disks);
  for (const d of disks) {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.letters ? `${d.letters} · ${d.name}` : d.name;
    opt.selected = d === chosen;
    select.appendChild(opt);
  }
}

function renderDisplays() {
  const select = $('display');
  const list = (appState && appState.displays) || [];
  const holder = settings.layout === 'dock' ? settings.dock : settings.position;
  const current = holder ? holder.displayId : list[0] && list[0].id;
  select.innerHTML = '';
  for (const d of list) {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.label;
    opt.selected = d.id === current;
    select.appendChild(opt);
  }
}

function statusItem(level, title, detail) {
  const li = document.createElement('li');
  if (level) li.className = level;
  const body = document.createElement('div');
  body.textContent = title;
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    body.appendChild(small);
  }
  li.appendChild(body);
  return li;
}

function renderStatus() {
  const list = $('status');
  list.innerHTML = '';
  const st = (appState && appState.sensor) || {};
  if (st.missing) {
    list.appendChild(statusItem('warn', 'Ajudante de sensores não encontrado', 'Rode "npm run setup" pra compilar'));
    return;
  }
  list.appendChild(statusItem(st.running ? 'ok' : 'warn', st.running ? 'Lendo sensores' : 'Sensores parados'));
  const admin = sensors ? sensors.admin : false;
  list.appendChild(
    statusItem(
      admin ? 'ok' : 'warn',
      admin ? 'Rodando como admin' : 'Rodando sem admin',
      admin ? '' : st.elevationDenied ? 'O pedido de admin foi recusado. FPS e temperatura da CPU e do SSD ficam de fora.' : 'FPS e temperatura da CPU e do SSD ficam de fora.',
    ),
  );
  const pawn = sensors ? sensors.pawnio : false;
  list.appendChild(
    statusItem(
      pawn ? 'ok' : 'warn',
      pawn ? 'PawnIO instalado' : 'PawnIO não instalado',
      pawn ? '' : 'É o driver que lê a temperatura da CPU. Instale e reinicie os sensores.',
    ),
  );
  $('pawnio').hidden = pawn;
  $('restart-admin').hidden = admin;
}

function renderLock() {
  $('lock').textContent = settings.locked ? 'Destravar pra mover' : 'Travar posição';
}

function renderAll() {
  renderVisual();
  renderAccents();
  renderTypography();
  renderBackground();
  renderModules();
  renderSwitches();
  renderCity();
  renderDisks();
  renderDisplays();
  renderStatus();
  renderLock();
  scheduleLayout();
}

const COLUMN_MIN = 400;
const sections = [...document.querySelectorAll('main > section')];
let layoutKey = '';
let layoutFrame = 0;

function partition(heights, count, gap) {
  const n = heights.length;
  const total = (a, b) => heights.slice(a, b).reduce((s, h) => s + h, 0) + gap * Math.max(0, b - a - 1);
  let best = null;
  const walk = (start, left, ranges) => {
    if (left === 1) {
      const all = [...ranges, [start, n]];
      const sizes = all.map(([a, b]) => total(a, b));
      const score = Math.max(...sizes) * 1000 + (Math.max(...sizes) - Math.min(...sizes));
      if (!best || score < best.score) best = { score, all };
      return;
    }
    for (let end = start + 1; end <= n - left + 1; end++) walk(end, left - 1, [...ranges, [start, end]]);
  };
  walk(0, Math.min(count, n), []);
  return best.all;
}

function layoutColumns() {
  layoutFrame = 0;
  const main = document.querySelector('main');
  const style = getComputedStyle(main);
  const gap = parseFloat(style.columnGap) || 12;
  const inner = main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const count = Math.max(1, Math.min(3, Math.floor((inner + gap) / (COLUMN_MIN + gap))));
  const grown = sections.filter((s) => s.classList.contains('grow'));
  grown.forEach((s) => s.classList.remove('grow'));
  const heights = sections.map((s) => s.offsetHeight);
  const key = `${count}:${heights.join(',')}`;
  if (key === layoutKey && main.children.length === count) {
    grown.forEach((s) => s.classList.add('grow'));
    return;
  }
  layoutKey = key;
  main.style.setProperty('--cols', String(count));
  const columns = [];
  for (let i = 0; i < count; i++) {
    const col = document.createElement('div');
    col.className = 'col';
    columns.push(col);
  }
  const ranges = partition(heights, count, gap);
  ranges.forEach(([a, b], i) => {
    for (let j = a; j < b; j++) columns[i].appendChild(sections[j]);
    if (count > 1) sections[b - 1].classList.add('grow');
  });
  main.replaceChildren(...columns);
  requestAnimationFrame(fitPreviews);
}

function scheduleLayout() {
  if (!layoutFrame) layoutFrame = requestAnimationFrame(layoutColumns);
}

function bind() {
  window.addEventListener('resize', () => {
    scheduleLayout();
    fitPreviews();
  });
  document.fonts.ready.then(() => {
    fitPreviews();
    scheduleLayout();
  });
  $('layout').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) save({ layout: btn.dataset.value });
  });
  for (const id of ['scale', 'opacity']) {
    $(id).addEventListener('input', (e) => {
      setFill(e.target);
      save({ [id]: Number(e.target.value) });
    });
  }
  for (const part of ['clock', 'date', 'weather', 'metrics']) {
    $(`size-${part}`).addEventListener('input', (e) => {
      setFill(e.target);
      save({ typography: { [part]: { size: Number(e.target.value) } } });
    });
  }
  $('weight').addEventListener('input', (e) => {
    setFill(e.target);
    save({ typography: { clock: { weight: Number(e.target.value) } } });
  });
  $('bg-opacity').addEventListener('input', (e) => {
    setFill(e.target);
    save({ background: { opacity: Number(e.target.value) } });
  });
  for (const id of ['hwNames', 'hwNamesStrip']) {
    $(id).addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn) save({ [id]: btn.dataset.value });
    });
  }
  $('bg-choose').addEventListener('click', () => window.hud.chooseBackground());
  $('bg-clear').addEventListener('click', () => window.hud.clearBackground());
  for (const id of ['clock24h', 'showSeconds', 'adminSensors', 'startWithWindows', 'hoverFade']) {
    $(id).addEventListener('change', (e) => save({ [id]: e.target.checked }));
  }
  $('fpsEnabled').addEventListener('change', (e) => {
    const on = e.target.checked;
    save(on ? { fpsEnabled: true, modules: { fps: true } } : { fpsEnabled: false });
  });
  $('disk').addEventListener('change', (e) => save({ diskId: e.target.value }));
  $('display').addEventListener('change', (e) => window.hud.moveToDisplay(Number(e.target.value)));
  $('lock').addEventListener('click', () => save({ locked: !settings.locked }));
  $('restart-admin').addEventListener('click', () => window.hud.restartSensors(true));
  $('pawnio').addEventListener('click', () => window.hud.openPawnIo());

  let timer = null;
  let seq = 0;
  $('city-search').addEventListener('input', (e) => {
    clearTimeout(timer);
    const q = e.target.value;
    timer = setTimeout(async () => {
      const mine = ++seq;
      const results = await window.hud.searchCity(q);
      if (mine !== seq) return;
      const ul = $('city-results');
      ul.innerHTML = '';
      for (const r of results) {
        const li = document.createElement('li');
        li.textContent = r.name;
        const small = document.createElement('small');
        small.textContent = [r.admin1, r.country].filter(Boolean).join(', ');
        li.appendChild(small);
        li.addEventListener('click', () => {
          save({ city: r });
          ul.innerHTML = '';
          $('city-search').value = '';
        });
        ul.appendChild(li);
      }
      scheduleLayout();
    }, 300);
  });
}

async function init() {
  settings = await window.hud.getSettings();
  appState = await window.hud.getState();
  sensors = await window.hud.lastSensors();
  bind();
  renderAll();
  window.hud.onSettings((next) => {
    settings = next;
    renderAll();
  });
  window.hud.onState((next) => {
    appState = next;
    renderStatus();
    renderDisplays();
    scheduleLayout();
  });
  window.hud.onSensors((data) => {
    const statusChanged = !sensors || sensors.admin !== data.admin || sensors.pawnio !== data.pawnio;
    sensors = data;
    renderDisks();
    renderHardwareNames();
    if (statusChanged) {
      renderStatus();
      scheduleLayout();
    }
  });
  fitPreviewsWhenLoaded();
}

init();
