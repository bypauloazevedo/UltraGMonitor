window.HudFmt = (() => {
  const has = (v) => typeof v === 'number' && Number.isFinite(v);
  const round = (v) => (has(v) ? String(Math.round(v)) : '—');
  const temp = (v) => (has(v) ? `${Math.round(v)}°` : '—');
  const fixed = (v, digits = 1) => (has(v) ? v.toFixed(digits) : '—');
  const level = (v, warn, hot) => (!has(v) ? '' : v >= hot ? 'hot' : v >= warn ? 'warn' : '');
  const lowLevel = (v, warn, hot) => (!has(v) ? '' : v <= hot ? 'hot' : v <= warn ? 'warn' : '');
  const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const rate = (bytes) => {
    if (!has(bytes)) return '—';
    const mb = bytes / 1048576;
    if (mb >= 10) return `${Math.round(mb)} MB/s`;
    if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
    return `${Math.round(bytes / 1024)} KB/s`;
  };

  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });
  const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' });
  const shortDate = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

  const time = (now, h24) => {
    let h = now.getHours();
    let suffix = '';
    if (!h24) {
      suffix = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
    }
    return {
      hm: `${h24 ? String(h).padStart(2, '0') : h}:${String(now.getMinutes()).padStart(2, '0')}`,
      sec: String(now.getSeconds()).padStart(2, '0'),
      suffix,
      weekday: capitalize(weekday.format(now)),
      date: dayMonth.format(now),
      short: capitalize(shortDate.format(now).replace(/\./g, '')),
    };
  };

  return { has, round, temp, fixed, level, lowLevel, rate, capitalize, time };
})();
