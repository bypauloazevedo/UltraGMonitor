const root = document.getElementById('root');
const ICONS = {
  ok: '<path d="M20 6 9 17l-5-5"/>',
  error: '<path d="M18 6 6 18M6 6l12 12"/>',
};

window.hud.onToast(({ message, kind }) => {
  const [title, detail] = message.split('|');
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = `toast${kind === 'error' ? ' error' : ''}`;
  const icon = document.createElement('i');
  icon.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[kind] || ICONS.ok}</svg>`;
  const text = document.createElement('span');
  text.textContent = title;
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    text.appendChild(small);
  }
  box.append(icon, text);
  root.appendChild(box);
});
