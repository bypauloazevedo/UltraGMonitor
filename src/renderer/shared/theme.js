window.HudTheme = (() => {
  const accents = [
    { color: '#5ee6ff', name: 'Ciano' },
    { color: '#39ff88', name: 'Verde neon' },
    { color: '#e8173c', name: 'Carmesim' },
    { color: '#ffd23f', name: 'Amarelo' },
    { color: '#ff4fb0', name: 'Rosa' },
    { color: '#9d6bff', name: 'Roxo' },
    { color: '#ff8a2a', name: 'Laranja' },
    { color: '#3d7dff', name: 'Azul elétrico' },
    { color: '#2ee6c5', name: 'Menta' },
    { color: '#eef2f7', name: 'Gelo' },
  ];

  const onAccent = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const channel = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const lum = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
    return lum > 0.22 ? '#071114' : '#ffffff';
  };

  const apply = (hex) => {
    const style = document.documentElement.style;
    style.setProperty('--accent', hex);
    style.setProperty('--on-accent', onAccent(hex));
  };

  return { accents, onAccent, apply };
})();
