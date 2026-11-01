window.HudFonts = (() => {
  const list = [
    { id: 'geist', label: 'Geist', family: "'Geist Variable'", weight: 230, group: 'both' },
    { id: 'geist-mono', label: 'Geist Mono', family: "'Geist Mono Variable'", weight: 300, group: 'both' },
    { id: 'outfit', label: 'Outfit', family: "'Outfit Variable'", weight: 200, group: 'both' },
    { id: 'space-grotesk', label: 'Space Grotesk', family: "'Space Grotesk Variable'", weight: 300, group: 'both' },
    { id: 'orbitron', label: 'Orbitron', family: "'Orbitron Variable'", weight: 500, group: 'both' },
    { id: 'rajdhani', label: 'Rajdhani', family: "'Rajdhani'", weight: 500, group: 'both' },
    { id: 'oxanium', label: 'Oxanium', family: "'Oxanium Variable'", weight: 300, group: 'both' },
    { id: 'bebas-neue', label: 'Bebas Neue', family: "'Bebas Neue'", weight: 400, group: 'both' },
    { id: 'playfair', label: 'Playfair Display', family: "'Playfair Display Variable'", weight: 400, group: 'both' },
    { id: 'doto', label: 'Doto', family: "'Doto Variable'", weight: 700, group: 'both' },
    { id: 'press-start', label: 'Press Start 2P', family: "'Press Start 2P'", weight: 400, group: 'display' },
    { id: 'sixtyfour', label: 'Sixtyfour', family: "'Sixtyfour'", weight: 400, group: 'display' },
    { id: 'audiowide', label: 'Audiowide', family: "'Audiowide'", weight: 400, group: 'display' },
    { id: 'vt323', label: 'VT323', family: "'VT323'", weight: 400, group: 'metrics' },
    { id: 'share-tech-mono', label: 'Share Tech Mono', family: "'Share Tech Mono'", weight: 400, group: 'metrics' },
    { id: 'chakra-petch', label: 'Chakra Petch', family: "'Chakra Petch'", weight: 500, group: 'metrics' },
  ];
  const fallback = "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif";
  const byId = (id) => list.find((f) => f.id === id) || list[0];
  const stack = (id) => `${byId(id).family}, ${fallback}`;
  const forGroup = (group) => [...list.filter((f) => f.group === group), ...list.filter((f) => f.group !== group)];
  return { list, byId, stack, forGroup };
})();
