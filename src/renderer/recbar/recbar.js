const { t } = window.HudI18n;
const bar = document.getElementById('bar');
const time = document.getElementById('time');
const pause = document.getElementById('pause');
const PAUSE = '<svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7Z" fill="currentColor" stroke="none"/></svg>';

let state = { paused: false, elapsed: 0, recording: false };
let syncedAt = Date.now();

function format(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function paint() {
  const running = state.recording && !state.paused;
  const elapsed = state.elapsed + (running ? Date.now() - syncedAt : 0);
  time.textContent = state.finishing ? t('Salvando…') : format(elapsed);
  bar.classList.toggle('paused', state.paused);
  bar.classList.toggle('waiting', !state.recording);
  pause.innerHTML = state.paused ? PLAY : PAUSE;
  pause.title = state.paused ? t('Continuar') : t('Pausar');
  pause.disabled = state.finishing || !state.recording;
  document.getElementById('stop').disabled = state.finishing || !state.recording;
  document.getElementById('cancel').disabled = state.finishing;
  bar.title = (state.warnings || []).map((message) => t(message)).join('\n');
}

window.hud.onRecordState((next) => {
  state = next;
  syncedAt = Date.now();
  paint();
});

pause.addEventListener('click', () => (state.paused ? window.hud.recordResume() : window.hud.recordPause()));
document.getElementById('stop').addEventListener('click', () => window.hud.recordStop());
document.getElementById('cancel').addEventListener('click', () => window.hud.recordCancel());

window.hud.getSettings().then((settings) => {
  window.HudI18n.setLang(settings.language);
  window.HudI18n.apply();
  paint();
});

setInterval(paint, 250);
paint();
