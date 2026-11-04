const theme = window.HudTheme;
const { t } = window.HudI18n;
const view = document.getElementById('view');
const ctx = view.getContext('2d');
const selBox = document.getElementById('sel');
const sizeLabel = document.getElementById('size');
const hint = document.getElementById('hint');
const bar = document.getElementById('bar');
const textInput = document.getElementById('text');
const tip = document.getElementById('tip');

const ICONS = {
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  line: '<path d="M5 19 19 5"/>',
  arrow: '<path d="M7 17 17 7M8 7h9v9"/>',
  rect: '<rect x="4" y="5" width="16" height="14" rx="2"/>',
  fill: '<rect x="4" y="5" width="16" height="14" rx="2" fill="currentColor"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  marker: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  text: '<path d="M5 6h14M12 6v13M9 19h6"/>',
  blur: '<circle cx="7" cy="7" r="1.5"/><circle cx="12" cy="7" r="1.5"/><circle cx="17" cy="7" r="1.5"/><circle cx="7" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="17" cy="12" r="1.5"/><circle cx="7" cy="17" r="1.5"/><circle cx="12" cy="17" r="1.5"/><circle cx="17" cy="17" r="1.5"/>',
  step: '<circle cx="12" cy="12" r="9"/><path d="M11 9l2-1v8"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  pin: '<path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3Z"/>',
  save: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z"/><circle cx="12" cy="13" r="3"/>',
  video: '<path d="m16 13 5.2 3.1a.5.5 0 0 0 .8-.4V8.3a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  speaker: '<path d="M11 5 6 9H2v6h4l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  speakerOff: '<path d="M11 5 6 9H2v6h4l5 4Z"/><path d="m22 9-6 6M16 9l6 6"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  micOff: '<path d="m2 2 20 20"/><path d="M18.9 13.2A7 7 0 0 0 19 12v-2M5 10v2a7 7 0 0 0 12 5M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v3a3 3 0 0 0 5.1 2.1M12 19v3"/>',
  record: '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
};

const TOOLS = [
  ['pen', 'Lápis'],
  ['line', 'Linha'],
  ['arrow', 'Seta'],
  ['rect', 'Retângulo'],
  ['fill', 'Retângulo cheio'],
  ['circle', 'Círculo'],
  ['marker', 'Marcador'],
  ['text', 'Texto'],
  ['blur', 'Desfocar'],
  ['step', 'Número'],
];

let base = null;
let blurred = null;
let ratio = 1;
let sel = null;
let shapes = [];
let undone = [];
let draft = null;
let tool = null;
let palette = [];
let color = '#ff3b5c';
let size = 4;
let drag = null;
let editing = null;
let frame = 0;
let mode = 'shot';
let audio = { system: true, mic: false };

const svg = (name) => `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`;
const AUDIO = {
  system: { name: 'Som do PC', on: 'speaker', off: 'speakerOff' },
  mic: { name: 'Microfone', on: 'mic', off: 'micOff' },
};
let tipTimer = 0;
const toImage = (e) => ({ x: e.clientX * ratio, y: e.clientY * ratio });
const norm = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });
const inside = (p, r, pad = 0) => r && p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;

function schedule() {
  if (!frame) frame = requestAnimationFrame(render);
}

function buildBlurred() {
  if (blurred || !base) return;
  blurred = document.createElement('canvas');
  blurred.width = base.width;
  blurred.height = base.height;
  const b = blurred.getContext('2d');
  b.filter = `blur(${Math.round(12 * ratio)}px)`;
  b.drawImage(base, 0, 0);
}

function strokeStyle(c, s) {
  c.strokeStyle = s.color;
  c.fillStyle = s.color;
  c.lineWidth = s.size * ratio;
  c.lineCap = 'round';
  c.lineJoin = 'round';
}

function drawShape(c, s) {
  c.save();
  strokeStyle(c, s);
  if (s.type === 'pen' || s.type === 'marker') {
    if (s.type === 'marker') {
      c.globalAlpha = 0.38;
      c.lineWidth = s.size * ratio * 4;
      c.lineCap = 'square';
    }
    c.beginPath();
    s.points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    if (s.points.length === 1) c.lineTo(s.points[0][0] + 0.1, s.points[0][1]);
    c.stroke();
  } else if (s.type === 'line' || s.type === 'arrow') {
    const head = Math.max(14, s.size * 4) * ratio;
    const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const endX = s.type === 'arrow' ? s.x2 - Math.cos(angle) * head * 0.6 : s.x2;
    const endY = s.type === 'arrow' ? s.y2 - Math.sin(angle) * head * 0.6 : s.y2;
    c.beginPath();
    c.moveTo(s.x1, s.y1);
    c.lineTo(endX, endY);
    c.stroke();
    if (s.type === 'arrow') {
      c.beginPath();
      c.moveTo(s.x2, s.y2);
      c.lineTo(s.x2 - head * Math.cos(angle - 0.45), s.y2 - head * Math.sin(angle - 0.45));
      c.lineTo(s.x2 - head * Math.cos(angle + 0.45), s.y2 - head * Math.sin(angle + 0.45));
      c.closePath();
      c.fill();
    }
  } else if (s.type === 'rect') {
    c.strokeRect(s.x, s.y, s.w, s.h);
  } else if (s.type === 'fill') {
    c.fillRect(s.x, s.y, s.w, s.h);
  } else if (s.type === 'circle') {
    c.beginPath();
    c.ellipse(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
    c.stroke();
  } else if (s.type === 'blur') {
    buildBlurred();
    c.drawImage(blurred, s.x, s.y, s.w, s.h, s.x, s.y, s.w, s.h);
  } else if (s.type === 'text') {
    const px = (12 + s.size * 3) * ratio;
    c.font = `700 ${px}px "Geist Variable", "Segoe UI", sans-serif`;
    c.textBaseline = 'top';
    c.shadowColor = 'rgba(0, 0, 0, 0.35)';
    c.shadowBlur = 3 * ratio;
    s.text.split('\n').forEach((line, i) => c.fillText(line, s.x, s.y + i * px * 1.25));
  } else if (s.type === 'step') {
    const r = (11 + s.size * 1.2) * ratio;
    c.shadowColor = 'rgba(0, 0, 0, 0.4)';
    c.shadowBlur = 4 * ratio;
    c.beginPath();
    c.arc(s.x, s.y, r, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = theme.onAccent(s.color);
    c.font = `800 ${r * 1.1}px "Geist Variable", "Segoe UI", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(s.n), s.x, s.y + r * 0.06);
  }
  c.restore();
}

function render() {
  frame = 0;
  if (!base) return;
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.drawImage(base, 0, 0);
  ctx.save();
  ctx.fillStyle = 'rgba(5, 8, 12, 0.55)';
  ctx.beginPath();
  ctx.rect(0, 0, view.width, view.height);
  if (sel) ctx.rect(sel.x, sel.y, sel.w, sel.h);
  ctx.fill('evenodd');
  ctx.restore();
  if (sel && mode === 'shot') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(sel.x, sel.y, sel.w, sel.h);
    ctx.clip();
    for (const s of shapes) drawShape(ctx, s);
    if (draft) drawShape(ctx, draft);
    ctx.restore();
  }
  layout();
}

function layout() {
  const hasSel = sel && sel.w > 2 && sel.h > 2;
  selBox.hidden = !hasSel;
  sizeLabel.hidden = !hasSel;
  hint.hidden = !!hasSel;
  bar.hidden = !hasSel || (drag && drag.kind === 'new');
  if (bar.hidden) hideTip();
  if (!hasSel) return;
  const css = { x: sel.x / ratio, y: sel.y / ratio, w: sel.w / ratio, h: sel.h / ratio };
  Object.assign(selBox.style, { left: `${css.x}px`, top: `${css.y}px`, width: `${css.w}px`, height: `${css.h}px` });
  selBox.classList.toggle('drawing', mode === 'shot' && (!!tool || shapes.length > 0));
  sizeLabel.textContent = `${Math.round(sel.w)} × ${Math.round(sel.h)}`;
  sizeLabel.style.left = `${css.x}px`;
  sizeLabel.style.top = `${css.y - 30 < 4 ? css.y + 6 : css.y - 30}px`;
  if (bar.hidden) return;
  const bw = bar.offsetWidth;
  const bh = bar.offsetHeight;
  let top = css.y + css.h + 12;
  if (top + bh > window.innerHeight - 8) top = css.y - bh - 12;
  if (top < 8) top = css.y + css.h - bh - 12;
  const left = Math.min(Math.max(8, css.x + css.w / 2 - bw / 2), window.innerWidth - bw - 8);
  bar.style.left = `${left}px`;
  bar.style.top = `${top}px`;
  const undo = bar.querySelector('[data-act="undo"]');
  const redo = bar.querySelector('[data-act="redo"]');
  if (undo) undo.disabled = !shapes.length;
  if (redo) redo.disabled = !undone.length;
}

function setFill(input) {
  input.style.setProperty('--fill', `${((input.value - input.min) / (input.max - input.min)) * 100}%`);
}

function buildBar() {
  hideTip();
  const modes = `
    <span class="modes">
      <button data-mode="shot" class="${mode === 'shot' ? 'on' : ''}" data-tip="${t('Print')}">${svg('camera')}</button>
      <button data-mode="video" class="${mode === 'video' ? 'on' : ''}" data-tip="${t('Gravar vídeo')}">${svg('video')}</button>
    </span>
    <span class="sep"></span>`;
  hint.textContent = mode === 'video' ? t('Arraste pra escolher a área do vídeo · Esc cancela') : t('Arraste pra selecionar · Esc cancela');
  if (mode === 'video') {
    bar.innerHTML = `
      ${modes}
      <button data-audio="system" class="toggle"></button>
      <button data-audio="mic" class="toggle"></button>
      <span class="sep"></span>
      <button data-act="record" class="rec" data-tip="${t('Começar a gravar')}" data-key="Enter">${svg('record')}</button>
      <button data-act="close" data-tip="${t('Cancelar')}" data-key="Esc">${svg('close')}</button>`;
    markAudio();
    view.style.cursor = 'crosshair';
    return;
  }
  const tools = TOOLS.map(([id, name]) => `<button data-tool="${id}" data-tip="${t(name)}">${svg(id)}</button>`).join('');
  const swatches = palette.map((c) => `<button class="swatch" data-color="${c}" style="background:${c}"></button>`).join('');
  bar.innerHTML = `
    ${modes}
    ${tools}
    <span class="sep"></span>
    <span class="swatches">${swatches}</span>
    <span class="thick" data-tip="${t('Espessura')}"><input type="range" min="1" max="20" value="${size}" /><output>${size}</output></span>
    <span class="sep"></span>
    <button data-act="undo" data-tip="${t('Desfazer')}" data-key="Ctrl+Z">${svg('undo')}</button>
    <button data-act="redo" data-tip="${t('Refazer')}" data-key="Ctrl+Y">${svg('redo')}</button>
    <span class="sep"></span>
    <button data-act="history" data-tip="${t('Últimos prints')}">${svg('history')}</button>
    <button data-act="pin" data-tip="${t('Fixar na tela')}">${svg('pin')}</button>
    <button data-act="save" data-tip="${t('Salvar')}" data-key="Ctrl+S">${svg('save')}</button>
    <button data-act="copy" class="main" data-tip="${t('Copiar')}" data-key="Ctrl+C">${svg('copy')}</button>
    <button data-act="close" data-tip="${t('Cancelar')}" data-key="Esc">${svg('close')}</button>`;
  const range = bar.querySelector('input');
  setFill(range);
  range.addEventListener('input', () => {
    size = Number(range.value);
    bar.querySelector('output').textContent = String(size);
    setFill(range);
    remember();
  });
  markBar();
}

function markAudio() {
  for (const b of bar.querySelectorAll('[data-audio]')) {
    const info = AUDIO[b.dataset.audio];
    const on = audio[b.dataset.audio];
    b.classList.toggle('on', on);
    b.innerHTML = svg(on ? info.on : info.off);
    b.dataset.tip = t(info.name);
    b.dataset.state = on ? t('Ligado · clique pra desligar') : t('Desligado · clique pra ligar');
  }
}

function showTip(el) {
  tip.replaceChildren(document.createTextNode(el.dataset.tip));
  if (el.dataset.key) {
    const key = document.createElement('kbd');
    key.textContent = el.dataset.key;
    tip.append(key);
  }
  if (el.dataset.state) {
    const state = document.createElement('small');
    state.textContent = el.dataset.state;
    tip.append(state);
  }
  tip.hidden = false;
  const r = el.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const top = r.top - h - 10 >= 8 ? r.top - h - 10 : r.bottom + 10;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  requestAnimationFrame(() => tip.classList.add('show'));
}

function hideTip() {
  clearTimeout(tipTimer);
  tip.classList.remove('show');
  tip.hidden = true;
}

function markBar() {
  for (const b of bar.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === tool);
  for (const b of bar.querySelectorAll('[data-color]')) b.classList.toggle('on', b.dataset.color === color);
  view.style.cursor = tool ? (tool === 'text' ? 'text' : 'crosshair') : 'crosshair';
}

function remember() {
  window.hud.setSettings({ capture: { color, size } });
}

bar.addEventListener('pointerdown', (e) => e.stopPropagation());
bar.addEventListener('pointerover', (e) => {
  const el = e.target.closest('[data-tip]');
  if (!el || el.contains(e.relatedTarget)) return;
  hideTip();
  tipTimer = setTimeout(() => showTip(el), 250);
});
bar.addEventListener('pointerout', (e) => {
  const el = e.target.closest('[data-tip]');
  if (el && !el.contains(e.relatedTarget)) hideTip();
});
bar.addEventListener('click', (e) => {
  const m = e.target.closest('[data-mode]');
  if (m) {
    commitText();
    mode = m.dataset.mode;
    tool = null;
    buildBar();
    schedule();
    return;
  }
  const au = e.target.closest('[data-audio]');
  if (au) {
    audio[au.dataset.audio] = !audio[au.dataset.audio];
    markAudio();
    showTip(au);
    return;
  }
  const t = e.target.closest('[data-tool]');
  if (t) {
    commitText();
    tool = tool === t.dataset.tool ? null : t.dataset.tool;
    markBar();
    schedule();
    return;
  }
  const c = e.target.closest('[data-color]');
  if (c) {
    color = c.dataset.color;
    markBar();
    remember();
    return;
  }
  const a = e.target.closest('[data-act]');
  if (a) act(a.dataset.act);
});

async function exportPng() {
  commitText();
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sel.w));
  out.height = Math.max(1, Math.round(sel.h));
  const c = out.getContext('2d');
  c.translate(-Math.round(sel.x), -Math.round(sel.y));
  c.drawImage(base, 0, 0);
  for (const s of shapes) drawShape(c, s);
  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

async function act(name) {
  if (name === 'close') return window.hud.captureClose();
  if (name === 'history') return window.hud.openHistory();
  if (name === 'undo') {
    if (shapes.length) undone.push(shapes.pop());
    return schedule();
  }
  if (name === 'redo') {
    if (undone.length) shapes.push(undone.pop());
    return schedule();
  }
  if (!sel || sel.w < 2 || sel.h < 2) return;
  if (mode === 'video') {
    if (name !== 'record' && name !== 'copy') return;
    const even = (v) => Math.max(2, Math.floor(v / 2) * 2);
    const x = Math.round(sel.x);
    const y = Math.round(sel.y);
    window.hud.recordStart({
      rect: { x, y, w: even(Math.min(sel.w, view.width - x)), h: even(Math.min(sel.h, view.height - y)) },
      css: { x: sel.x / ratio, y: sel.y / ratio, width: sel.w / ratio, height: sel.h / ratio },
      system: audio.system,
      mic: audio.mic,
    });
    return;
  }
  if (name === 'record') return;
  const png = await exportPng();
  if (name === 'copy') window.hud.captureCopy(png);
  else if (name === 'save') window.hud.captureSave(png);
  else if (name === 'pin') window.hud.capturePin(png, { x: sel.x / ratio, y: sel.y / ratio, width: sel.w / ratio, height: sel.h / ratio });
}

function startText(p) {
  const px = 12 + size * 3;
  editing = { x: p.x, y: p.y, color, size };
  Object.assign(textInput.style, {
    left: `${p.x / ratio}px`,
    top: `${p.y / ratio}px`,
    color,
    fontSize: `${px}px`,
    width: '40px',
    height: `${px * 1.25 + 2}px`,
  });
  textInput.value = '';
  textInput.hidden = false;
  setTimeout(() => textInput.focus(), 0);
}

function fitText() {
  textInput.style.width = '0px';
  textInput.style.height = '0px';
  textInput.style.width = `${Math.max(40, textInput.scrollWidth + 6)}px`;
  textInput.style.height = `${textInput.scrollHeight}px`;
}

function commitText() {
  if (!editing) return;
  const text = textInput.value.replace(/\s+$/, '');
  if (text) {
    shapes.push({ type: 'text', x: editing.x, y: editing.y, text, color: editing.color, size: editing.size });
    undone = [];
  }
  editing = null;
  textInput.hidden = true;
  schedule();
}

textInput.addEventListener('input', fitText);
textInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') {
    editing = null;
    textInput.hidden = true;
    schedule();
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    commitText();
  }
});
textInput.addEventListener('blur', () => setTimeout(commitText, 0));

function handleAt(e) {
  const h = e.target.closest('#sel i');
  return h ? h.dataset.h : null;
}

selBox.addEventListener('pointerdown', (e) => {
  const h = handleAt(e);
  if (!h) return;
  e.stopPropagation();
  view.setPointerCapture(e.pointerId);
  drag = { kind: 'resize', h, start: toImage(e), orig: { ...sel } };
});

view.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const p = toImage(e);
  if (editing) {
    commitText();
    return;
  }
  view.setPointerCapture(e.pointerId);
  if (sel && tool && inside(p, sel)) {
    if (tool === 'text') {
      drag = null;
      startText(p);
      return;
    }
    if (tool === 'step') {
      shapes.push({ type: 'step', x: p.x, y: p.y, n: shapes.filter((s) => s.type === 'step').length + 1, color, size });
      undone = [];
      schedule();
      return;
    }
    const s = { type: tool, color, size };
    if (tool === 'pen' || tool === 'marker') s.points = [[p.x, p.y]];
    else if (tool === 'line' || tool === 'arrow') Object.assign(s, { x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    else Object.assign(s, { x: p.x, y: p.y, w: 0, h: 0, ox: p.x, oy: p.y });
    draft = s;
    drag = { kind: 'draw' };
    return;
  }
  if (sel && !tool && inside(p, sel)) {
    drag = { kind: 'move', start: p, orig: { ...sel } };
    return;
  }
  if (shapes.length && mode === 'shot') return;
  drag = { kind: 'new', start: p };
  sel = { x: p.x, y: p.y, w: 0, h: 0 };
  schedule();
});

view.addEventListener('pointermove', (e) => {
  const p = toImage(e);
  if (!drag) {
    if (sel && !tool && inside(p, sel)) view.style.cursor = 'move';
    else markBar();
    return;
  }
  if (drag.kind === 'new') {
    sel = norm(drag.start, p);
  } else if (drag.kind === 'move') {
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    sel = {
      ...drag.orig,
      x: Math.min(Math.max(0, drag.orig.x + dx), view.width - drag.orig.w),
      y: Math.min(Math.max(0, drag.orig.y + dy), view.height - drag.orig.h),
    };
  } else if (drag.kind === 'resize') {
    const o = drag.orig;
    let x1 = o.x;
    let y1 = o.y;
    let x2 = o.x + o.w;
    let y2 = o.y + o.h;
    if (drag.h.includes('w')) x1 = p.x;
    if (drag.h.includes('e')) x2 = p.x;
    if (drag.h.includes('n')) y1 = p.y;
    if (drag.h.includes('s')) y2 = p.y;
    sel = norm({ x: x1, y: y1 }, { x: x2, y: y2 });
  } else if (drag.kind === 'draw' && draft) {
    if (draft.points) draft.points.push([p.x, p.y]);
    else if ('x1' in draft) Object.assign(draft, { x2: p.x, y2: p.y });
    else Object.assign(draft, norm({ x: draft.ox, y: draft.oy }, p));
  }
  schedule();
});

view.addEventListener('pointerup', () => {
  if (drag && drag.kind === 'draw' && draft) {
    const big = draft.points
      ? draft.points.length > 1 || draft.type === 'pen'
      : 'x1' in draft
        ? Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 3
        : draft.w > 3 && draft.h > 3;
    if (big) {
      delete draft.ox;
      delete draft.oy;
      shapes.push(draft);
      undone = [];
    }
    draft = null;
  }
  if (drag && drag.kind === 'new' && sel && (sel.w < 4 || sel.h < 4)) sel = null;
  drag = null;
  schedule();
});

window.addEventListener('keydown', (e) => {
  if (editing) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape') window.hud.captureClose();
  else if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) act('undo');
  else if (ctrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) act('redo');
  else if (ctrl && e.key.toLowerCase() === 'c') act('copy');
  else if (ctrl && e.key.toLowerCase() === 's') {
    e.preventDefault();
    act('save');
  } else if (e.key === 'Enter') act('copy');
});

window.hud.onCaptureKey((action) => {
  if (editing) {
    if (action === 'enter' || action === 'copy') commitText();
    else if (action === 'escape') {
      editing = null;
      textInput.hidden = true;
      schedule();
    }
    if (action !== 'copy') return;
  }
  if (action === 'escape') window.hud.captureClose();
  else if (action === 'enter' || action === 'copy') act('copy');
  else act(action);
});

window.addEventListener('resize', () => {
  if (!base) return;
  ratio = base.width / window.innerWidth;
  schedule();
});

function toImageData(shot) {
  const pixels = new Uint8ClampedArray(shot.pixels.buffer, shot.pixels.byteOffset, shot.width * shot.height * 4);
  if (shot.format === 'bgra') {
    for (let i = 0; i < pixels.length; i += 4) {
      const b = pixels[i];
      pixels[i] = pixels[i + 2];
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  }
  return new ImageData(pixels, shot.width, shot.height);
}

async function begin() {
  const [settings, shot] = await Promise.all([window.hud.getSettings(), window.hud.captureImage()]);
  if (!shot) return window.hud.captureClose();
  window.HudI18n.setLang(settings.language);
  theme.apply(settings.accent);
  palette = ['#ff3b5c', '#ffd23f', settings.accent, '#3d7dff', '#ffffff'];
  color = (settings.capture && settings.capture.color) || palette[0];
  if (!palette.includes(color)) color = palette[0];
  size = (settings.capture && settings.capture.size) || 4;
  mode = shot.mode === 'video' ? 'video' : 'shot';
  audio = { system: settings.recordSystemAudio !== false, mic: !!settings.recordMic };
  if (base && base.close) base.close();
  base = await createImageBitmap(toImageData(shot));
  blurred = null;
  sel = null;
  shapes = [];
  undone = [];
  draft = null;
  tool = null;
  drag = null;
  editing = null;
  textInput.hidden = true;
  view.width = base.width;
  view.height = base.height;
  ratio = base.width / (shot.cssWidth || window.innerWidth);
  buildBar();
  frame = 0;
  render();
  window.hud.captureReady();
  setTimeout(buildBlurred, 200);
}

window.hud.onCaptureStart(begin);
