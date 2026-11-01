const shot = document.getElementById('shot');

window.hud.onPinImage((src) => {
  shot.src = src;
});

window.hud.getSettings().then((settings) => {
  window.HudI18n.setLang(settings.language);
  window.HudI18n.apply();
});

document.getElementById('close').addEventListener('click', () => window.hud.closeWindow());

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.hud.closeWindow();
});
