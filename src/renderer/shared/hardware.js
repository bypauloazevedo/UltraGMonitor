window.HudHardware = (() => {
  const LABELS = { cpu: 'CPU', gpu: 'GPU' };

  const cpuName = (raw) =>
    raw
      .replace(/\((R|TM)\)|®|™/gi, '')
      .replace(/\b\d+(st|nd|rd|th) Gen\b/i, '')
      .replace(/\b(Intel|AMD|Core)\b/gi, '')
      .replace(/\b\d+-Core\b|\bProcessor\b/gi, '')
      .replace(/\bCPU\b.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();

  const gpuName = (raw) =>
    raw
      .replace(/\((R|TM)\)|®|™/gi, '')
      .replace(/\b(NVIDIA|GeForce|AMD|Intel|Graphics)\b/gi, '')
      .replace(/\bRadeon\b(?=.*\bRX\b)/i, '')
      .replace(/\s+/g, ' ')
      .trim();

  const modelOnly = (key, name) => {
    const parts = name.split(/[\s-]+/).filter(Boolean);
    if (key === 'cpu') return parts[parts.length - 1] || name;
    return (/^(RTX|GTX|RX|Arc)$/i.test(parts[0]) ? parts.slice(1) : parts).join(' ') || name;
  };

  const label = (key, raw, mode) => {
    if (!LABELS[key] || !raw || mode === 'label') return LABELS[key];
    const name = key === 'cpu' ? cpuName(raw) : gpuName(raw);
    return mode === 'model' ? modelOnly(key, name) : name;
  };

  return { label };
})();
