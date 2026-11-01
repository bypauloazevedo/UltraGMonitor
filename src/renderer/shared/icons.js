window.HudIcons = (() => {
  const svg = (body) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const cloudBase = '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.24"/>';

  const set = {
    'clear-day': svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
    'clear-night': svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
    'partly-day': svg('<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.95 12.65a4 4 0 0 0-5.93-4.13"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>'),
    'partly-night': svg('<path d="M10.19 8.5A6 6 0 0 1 16 4a1 1 0 0 0 6 6 6 6 0 0 1-3 5.2"/><path d="M13 16a3 3 0 1 1 0 6H7a5 5 0 1 1 4.9-6Z"/>'),
    cloud: svg('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'),
    fog: svg(`${cloudBase}<path d="M16 17H7M17 21H9"/>`),
    drizzle: svg(`${cloudBase}<path d="M8 19v1M8 14v1M16 19v1M16 14v1M12 21v1M12 16v1"/>`),
    rain: svg(`${cloudBase}<path d="M16 14v6M8 14v6M12 16v6"/>`),
    snow: svg(`${cloudBase}<path d="M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01"/>`),
    storm: svg('<path d="M6 16.33A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 .5 8.97"/><path d="m13 12-3 5h4l-3 5"/>'),
  };

  const ui = {
    cpu: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>'),
    gpu: svg('<rect x="2" y="6" width="20" height="11" rx="2"/><circle cx="9" cy="11.5" r="2.75"/><path d="M15 9.5h3.5M15 13.5h3.5M6 17v3M10 17v3M14 17v3"/>'),
    ram: svg('<path d="M6 19v-3M10 19v-3M14 19v-3M18 19v-3M8 11V9M12 11V9M16 11V9M2 15h20"/><path d="M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1.1a2 2 0 0 0 0 3.84V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5.06a2 2 0 0 0 0-3.84Z"/>'),
    disk: svg('<path d="M22 12H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/><path d="M6 16h.01M10 16h.01"/>'),
    fps: svg('<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>'),
    thermo: svg('<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>'),
    zap: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>'),
    pulse: svg('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
    memory: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10v4M11 10v4M15 10v4"/>'),
    down: svg('<path d="M12 5v14M19 12l-7 7-7-7"/>'),
    up: svg('<path d="M12 19V5M5 12l7-7 7 7"/>'),
    umbrella: svg('<path d="M22 12a10.06 10.06 0 0 0-20 0Z"/><path d="M12 12v8a2 2 0 0 0 4 0M12 2v1"/>'),
    droplet: svg('<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7Z"/>'),
    corner: svg('<path d="M7 7l10 10M17 9v8H9"/>'),
    sliders: svg('<path d="M21 5h-7M10 5H3M21 12h-9M8 12H3M21 19h-5M12 19H3M14 3v4M8 10v4M16 17v4"/>'),
    move: svg('<path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.82-.33 1.7 1.7 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.51 1.7 1.7 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .33-1.82 1.7 1.7 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.51-1.1 1.7 1.7 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.82.33H9a1.7 1.7 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.51 1.7 1.7 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.33 1.82V9a1.7 1.7 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>'),
  };

  const weather = (icon, isDay) => {
    if (icon === 'clear') return set[isDay ? 'clear-day' : 'clear-night'];
    if (icon === 'partly') return set[isDay ? 'partly-day' : 'partly-night'];
    return set[icon] || set.cloud;
  };

  return { weather, ui };
})();
