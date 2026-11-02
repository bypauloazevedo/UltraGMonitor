const fonts = window.HudFonts;
const theme = window.HudTheme;
const i18n = window.HudI18n;
const { t } = i18n;
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
  markSegmented('language', i18n.lang());
  markSegmented('theme', settings.theme || 'system');
  markSegmented('layout', settings.layout);
  markSegmented('cardLayout', settings.cardLayout || 'grid');
  $('card-layout-field').hidden = settings.layout !== 'card';
  markSegmented('compactLayout', settings.compactLayout || 'list');
  $('compact-layout-field').hidden = settings.layout !== 'compact';
  setRange('scale', settings.scale, `${Math.round(settings.scale * 100)}%`);
  setRange('opacity', settings.opacity, `${Math.round(settings.opacity * 100)}%`);
}

function renderAccents() {
  const wrap = $('accent');
  if (!wrap.children.length) {
    for (const { color, name } of theme.accents) {
      const btn = document.createElement('button');
      btn.style.setProperty('--c', color);
      btn.addEventListener('click', () => save({ accent: color }));
      wrap.appendChild(btn);
    }
  }
  const current = theme.accents.find((a) => a.color === settings.accent);
  [...wrap.children].forEach((btn, i) => {
    btn.classList.toggle('on', theme.accents[i].color === settings.accent);
    btn.title = t(theme.accents[i].name);
  });
  $('accent-out').textContent = current ? t(current.name) : '';
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
  el.textContent = bg.file ? bg.name || bg.file : t('Nenhum fundo animado');
  el.classList.toggle('empty', !bg.file);
  $('bg-clear').hidden = !bg.file;
  $('bg-opacity-field').hidden = !bg.file;
  const opacity = bg.opacity ?? 0.6;
  setRange('bg-opacity', opacity, `${Math.round(opacity * 100)}%`);
}

function renderModules() {
  const wrap = $('modules');
  if (!wrap.children.length) {
    for (const [key] of MODULES) {
      const btn = document.createElement('button');
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
  for (const btn of wrap.children) {
    btn.classList.toggle('on', !!settings.modules[btn.dataset.key]);
    btn.textContent = t(MODULES.find(([key]) => key === btn.dataset.key)[1]);
  }
}

function renderSwitches() {
  for (const id of ['clock24h', 'showSeconds', 'fpsEnabled', 'adminSensors', 'startWithWindows', 'hoverFade', 'recordSystemAudio', 'recordMic']) {
    $(id).checked = !!settings[id];
  }
  $('captureCloseOnCopy').checked = settings.captureCloseOnCopy !== false;
  $('updateCheck').checked = settings.updateCheck !== false;
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
  const signature = `${cpu}|${gpu}|${i18n.lang()}`;
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
        small.textContent = t(caption);
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
    el.textContent = t('Nenhuma cidade escolhida');
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
  const signature = disks.map((d) => `${d.id}:${d.name}`).join('|') + settings.diskId + i18n.lang();
  if (select.dataset.sig === signature) return;
  select.dataset.sig = signature;
  select.innerHTML = '';
  if (!disks.length) {
    const opt = document.createElement('option');
    opt.textContent = t('Nenhum disco lido');
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
  body.textContent = t(title);
  if (detail) {
    const small = document.createElement('small');
    small.textContent = t(detail);
    body.appendChild(small);
  }
  li.appendChild(body);
  return li;
}

function renderVersion() {
  const update = appState && appState.update;
  const version = (appState && appState.version) || '';
  $('version-text').textContent = update ? t('Nova versão {v} disponível', { v: update.version }) : t('Versão {v}', { v: version });
  $('update-open').hidden = !update;
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
  $('lock').textContent = settings.locked ? t('Destravar pra mover') : t('Travar posição');
}

const HOTKEY_ROWS = [
  ['capture', 'Capturar tela'],
  ['record', 'Gravar vídeo (aperta de novo pra parar)'],
  ['lock', 'Destravar / travar pra mover e redimensionar'],
  ['fps', 'Liga / desliga FPS'],
  ['visible', 'Mostrar / esconder o monitor'],
];
const SOLO_KEYS = /^(F([1-9]|1[0-9]|2[0-4])|PrintScreen|Home|End|Insert|Delete|PageUp|PageDown|Scrolllock|num.+)$/;
const KEY_MAP = {
  PrintScreen: 'PrintScreen',
  Home: 'Home',
  End: 'End',
  Insert: 'Insert',
  Delete: 'Delete',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Enter',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  ScrollLock: 'Scrolllock',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec',
};
let recording = null;
let hotkeyError = '';

function keyName(e) {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.code)) return e.code;
  if (/^Numpad[0-9]$/.test(e.code)) return `num${e.code.slice(6)}`;
  return KEY_MAP[e.code] || null;
}

function pretty(accelerator) {
  return accelerator.replace('CommandOrControl', 'Ctrl').replace('PrintScreen', 'Print Screen').split('+');
}

function renderHotkeys() {
  const wrap = $('hotkeys');
  const keys = settings.hotkeys || {};
  const status = (appState && appState.hotkeyStatus) || {};
  wrap.innerHTML = '';
  for (const [id, label] of HOTKEY_ROWS) {
    const row = document.createElement('div');
    row.className = 'hotkey';
    const name = document.createElement('span');
    name.textContent = t(label);
    if (status[id] === 'busy' || status[id] === 'invalid') {
      row.classList.add('bad');
      const small = document.createElement('small');
      small.textContent = status[id] === 'busy' ? t('Outro programa já usa esse atalho') : t('Atalho inválido');
      name.appendChild(small);
    }
    const btn = document.createElement('button');
    btn.className = 'hk-btn';
    btn.dataset.id = id;
    if (recording === id) {
      btn.classList.add('rec');
      btn.textContent = t('Aperte a tecla…');
    } else if (keys[id]) {
      for (const part of pretty(keys[id])) {
        const kbd = document.createElement('kbd');
        kbd.textContent = part;
        btn.appendChild(kbd);
      }
    } else {
      btn.textContent = t('Sem atalho');
      btn.classList.add('empty');
    }
    row.append(name, btn);
    wrap.appendChild(row);
  }
  const help = $('hotkey-help');
  help.classList.toggle('error', !!hotkeyError);
  if (hotkeyError) help.textContent = hotkeyError;
  else help.textContent = t(help.dataset.text);
}

function startRecording(id) {
  recording = id;
  hotkeyError = '';
  window.hud.pauseHotkeys();
  renderHotkeys();
}

function stopRecording() {
  if (!recording) return;
  recording = null;
  window.hud.resumeHotkeys();
  renderHotkeys();
}

function onHotkeyKey(e) {
  if (!recording) return;
  e.preventDefault();
  e.stopPropagation();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');
  if (!mods.length && e.key === 'Escape') {
    hotkeyError = '';
    stopRecording();
    return;
  }
  if (!mods.length && e.key === 'Backspace') {
    const id = recording;
    stopRecording();
    save({ hotkeys: { [id]: '' } });
    return;
  }
  const key = keyName(e);
  if (!key) return;
  if (!mods.length && !SOLO_KEYS.test(key)) {
    hotkeyError = t('Essa tecla sozinha ia parar de funcionar no Windows inteiro. Use com Ctrl, Alt ou Shift, ou uma tecla especial (Print Screen, F13–F24, Home…).');
    renderHotkeys();
    return;
  }
  const value = [...mods, key].join('+');
  const taken = HOTKEY_ROWS.find(([other]) => other !== recording && (settings.hotkeys || {})[other] === value);
  if (taken) {
    hotkeyError = t('Esse atalho já tá em "{name}".', { name: t(taken[1]) });
    renderHotkeys();
    return;
  }
  const id = recording;
  hotkeyError = '';
  stopRecording();
  save({ hotkeys: { [id]: value } });
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
  renderVersion();
  renderLock();
  renderHotkeys();
  scheduleLayout();
}

const COLUMN_MIN = 400;
const TABS = ['sistema', 'captura', 'conteudo', 'atalhos', 'aparencia'];
const sections = [...document.querySelectorAll('main > section')];
let activeTab = readTab();
let layoutKey = '';
let layoutFrame = 0;

function readTab() {
  try {
    const saved = localStorage.getItem('ugm-tab');
    return TABS.includes(saved) ? saved : TABS[0];
  } catch {
    return TABS[0];
  }
}

function setTab(tab) {
  if (!TABS.includes(tab) || tab === activeTab) return;
  activeTab = tab;
  try {
    localStorage.setItem('ugm-tab', tab);
  } catch {}
  renderTabs();
  window.scrollTo(0, 0);
  layoutColumns();
}

function renderTabs() {
  for (const btn of document.querySelectorAll('#tabs button')) btn.classList.toggle('on', btn.dataset.tab === activeTab);
}

function makeColumns(count) {
  return Array.from({ length: count }, () => {
    const col = document.createElement('div');
    col.className = 'col';
    return col;
  });
}

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
  const stash = $('stash');
  const style = getComputedStyle(main);
  const gap = parseFloat(style.columnGap) || 12;
  const inner = main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const visible = sections.filter((s) => s.dataset.tab === activeTab);
  const count = Math.max(1, Math.min(3, visible.length, Math.floor((inner + gap) / (COLUMN_MIN + gap))));
  for (const s of sections) {
    if (s.dataset.tab !== activeTab && s.parentElement !== stash) stash.appendChild(s);
  }
  if (visible.some((s) => !main.contains(s)) || main.children.length !== count) {
    layoutKey = '';
    main.style.setProperty('--cols', String(count));
    const columns = makeColumns(count);
    visible.forEach((s, i) => columns[i % count].appendChild(s));
    main.replaceChildren(...columns);
  }
  const grown = visible.filter((s) => s.classList.contains('grow'));
  grown.forEach((s) => s.classList.remove('grow'));
  const heights = visible.map((s) => s.offsetHeight);
  const key = `${activeTab}:${count}:${heights.join(',')}`;
  if (key === layoutKey) {
    grown.forEach((s) => s.classList.add('grow'));
    return;
  }
  layoutKey = key;
  main.style.setProperty('--cols', String(count));
  const columns = makeColumns(count);
  const ranges = partition(heights, count, gap);
  ranges.forEach(([a, b], i) => {
    for (let j = a; j < b; j++) columns[i].appendChild(visible[j]);
    if (count > 1) visible[b - 1].classList.add('grow');
  });
  main.replaceChildren(...columns);
  requestAnimationFrame(fitPreviews);
}

function scheduleLayout() {
  if (!layoutFrame) layoutFrame = requestAnimationFrame(layoutColumns);
}

function bind() {
  renderTabs();
  $('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) setTab(btn.dataset.tab);
  });
  window.addEventListener('resize', () => {
    scheduleLayout();
    fitPreviews();
  });
  $('hotkey-help').dataset.text = $('hotkey-help').textContent.replace(/\s+/g, ' ').trim();
  $('hotkeys').addEventListener('click', (e) => {
    const btn = e.target.closest('.hk-btn');
    if (!btn) return;
    if (recording === btn.dataset.id) stopRecording();
    else startRecording(btn.dataset.id);
  });
  window.addEventListener('keydown', onHotkeyKey, true);
  window.addEventListener('keyup', (e) => {
    if (recording && e.code === 'PrintScreen') onHotkeyKey(e);
  }, true);
  window.addEventListener('blur', stopRecording);
  document.fonts.ready.then(() => {
    fitPreviews();
    scheduleLayout();
  });
  for (const id of ['language', 'theme', 'cardLayout', 'compactLayout']) {
    $(id).addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn) save({ [id]: btn.dataset.value });
    });
  }
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
  for (const id of ['clock24h', 'showSeconds', 'adminSensors', 'startWithWindows', 'hoverFade', 'captureCloseOnCopy', 'recordSystemAudio', 'recordMic', 'updateCheck']) {
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
  $('update-open').addEventListener('click', () => window.hud.openUpdate());

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
  i18n.setLang(settings.language);
  i18n.apply();
  renderAll();
  window.hud.onSettings((next) => {
    settings = next;
    if (settings.language !== i18n.lang()) {
      i18n.setLang(settings.language);
      i18n.apply();
    }
    renderAll();
  });
  window.hud.onState((next) => {
    appState = next;
    renderStatus();
    renderVersion();
    renderDisplays();
    renderHotkeys();
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
