const i18n = window.HudI18n;
const t = (text, vars) => i18n.t(text, vars);
const grid = document.getElementById('grid');
const empty = document.getElementById('empty');

const ICONS = {
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="m21 17-5-5-9 7"/></svg>',
  video: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/></svg>',
};

let items = [];

function ago(time) {
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return t('agora');
  if (minutes < 60) return t('há {n} min', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('há {n} h', { n: hours });
  const day = new Date(time);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (day.toDateString() === yesterday.toDateString()) return t('ontem');
  return day.toLocaleDateString(i18n.locale(), { day: '2-digit', month: 'short' });
}

function size(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', i18n.lang() === 'en' ? '.' : ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function render() {
  grid.innerHTML = '';
  empty.hidden = items.length > 0;
  items.forEach((item, index) => {
    const el = document.createElement('button');
    el.className = 'item';
    el.draggable = true;
    el.dataset.index = String(index);
    el.title = item.name;
    const thumb = item.thumb ? `<img src="${item.thumb}" alt="" />` : ICONS[item.kind];
    const badge = item.kind === 'video' ? `<span class="badge">${ICONS.video}${t(item.interrupted ? 'Interrompido' : 'Vídeo')}</span>` : '';
    el.setAttribute('aria-label', `${item.name}, ${ago(item.time)}, ${size(item.size)}`);
    el.innerHTML = `<span class="thumb">${thumb}${badge}</span><span class="meta"><b>${ago(item.time)}</b><span>${size(item.size)}</span></span>`;
    grid.appendChild(el);
  });
}

async function refresh() {
  const warning = document.getElementById('history-warning');
  try {
    const result = await window.hud.historyList();
    items = Array.isArray(result) ? result : result.items;
    empty.querySelector('strong').textContent = t(result.warning && !items.length ? 'Não foi possível listar os arquivos' : 'Nenhum print ainda');
    empty.querySelector('span').textContent = t(result.warning && !items.length ? 'Confira as pastas de captura nas configurações e tente de novo.' : 'Os prints e vídeos que você fizer aparecem aqui.');
    warning.hidden = !result.warning && !items.some((item) => item.interrupted);
    warning.textContent = t(result.warning ? 'Não deu pra ler uma das pastas. Confira o acesso nas configurações.' : 'Vídeo interrompido: o arquivo parcial foi preservado. A reprodução pode estar incompleta.');
  } catch {
    warning.hidden = false;
    warning.textContent = t('Não deu pra carregar os arquivos. Tente abrir esta janela de novo.');
  }
  render();
  grid.scrollTop = 0;
  const first = grid.querySelector('.item');
  if (first) first.focus({ preventScroll: true });
}

function itemOf(event) {
  const el = event.target.closest('.item');
  return el ? items[Number(el.dataset.index)] : null;
}

grid.addEventListener('click', (e) => {
  const item = itemOf(e);
  if (item) window.hud.historyCopy(item.file);
});

grid.addEventListener('dragstart', (e) => {
  const item = itemOf(e);
  if (!item) return;
  e.preventDefault();
  window.hud.historyDrag(item.file);
});

grid.addEventListener('contextmenu', (e) => {
  const item = itemOf(e);
  if (!item) return;
  e.preventDefault();
  window.hud.historyMenu(item.file);
});

grid.addEventListener('keydown', (e) => {
  const current = e.target.closest('.item');
  if (!current) return;
  const index = Number(current.dataset.index);
  const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[e.key];
  if (step === undefined) return;
  e.preventDefault();
  const next = grid.querySelector(`.item[data-index="${index + step}"]`);
  if (next) next.focus();
});

for (const btn of document.querySelectorAll('[data-folder]')) {
  btn.addEventListener('click', () => window.hud.historyFolder(btn.dataset.folder));
}

document.getElementById('close').addEventListener('click', () => window.hud.historyClose());

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.hud.historyClose();
});

window.hud.onHistoryRefresh(refresh);

window.hud.getSettings().then((settings) => {
  i18n.setLang(settings.language);
  i18n.apply();
  window.HudTheme.apply(settings.accent);
  refresh();
});
