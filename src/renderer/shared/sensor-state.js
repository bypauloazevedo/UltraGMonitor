(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.HudSensorState = api;
})(function () {
  const has = (value) => typeof value === 'number' && Number.isFinite(value);

  function reading(data, state = {}, settings = {}, now = Date.now()) {
    state = state || {};
    settings = settings || {};
    if (settings.monitoring === false) return 'disabled';
    if (state.missing) return 'missing';
    if (state.starting) return 'loading';
    if (state.running === false) return data || state.failed ? 'stopped' : 'loading';
    if (!data) return 'loading';
    if (has(data.receivedAt) && now - data.receivedAt > 6000) return 'stale';
    return 'ready';
  }

  function reason(key, data, state, settings, now) {
    const status = reading(data, state, settings, now);
    const messages = {
      disabled: 'Monitoramento desligado',
      missing: 'Ajudante de sensores não encontrado',
      loading: 'Carregando sensores…',
      stopped: 'Leitura interrompida. Reinicie os sensores.',
      stale: 'Leitura desatualizada. Reconectando os sensores…',
    };
    if (status !== 'ready') return { status, message: messages[status] };
    if (key === 'fps') {
      if (data.fps && data.fps.unsupported) return { status: 'unavailable', message: 'FPS ainda não funciona no Linux' };
      if (!settings.fpsEnabled) return { status: 'disabled', message: 'Medição de FPS desligada' };
      if (data.admin === false) return { status: 'permission', message: 'FPS precisa de administrador' };
      if (data.fps && data.fps.error) return { status: 'unavailable', message: 'FPS indisponível. Reinicie os sensores.' };
      if (!has(data.fps && data.fps.value)) return { status: 'waiting', message: 'Aguardando jogo em foco' };
      return { status, message: 'Lendo FPS do jogo em foco' };
    }
    const item = key === 'disk' ? (data.disks || []).find((d) => d.id === settings.diskId) || (data.disks || []).find((d) => d.system) || (data.disks || [])[0] : data[key];
    if (item && has(key === 'ram' ? item.load : item.temp)) return { status, message: 'Leitura atualizada' };
    if ((key === 'cpu' || key === 'disk') && data.platform !== 'linux' && data.admin === false) {
      return { status: 'permission', message: 'Temperatura indisponível — precisa de administrador' };
    }
    if (key === 'cpu' && data.platform !== 'linux' && data.pawnio === false) {
      return { status: 'driver', message: 'Temperatura indisponível — instale o PawnIO' };
    }
    if (!item) return { status: 'unavailable', message: 'Sensor indisponível neste dispositivo' };
    if (key === 'ram' && !has(item.load)) return { status: 'unavailable', message: 'Sensor indisponível neste dispositivo' };
    if (key !== 'ram' && !has(item.temp)) return { status: 'unavailable', message: 'Temperatura não informada pelo hardware' };
    return { status, message: 'Leitura atualizada' };
  }

  function sustained(previous, candidate, now, delay = 3000) {
    if (!candidate) return { candidate: '', since: now, level: '' };
    const since = previous && previous.candidate === candidate ? previous.since : now;
    return { candidate, since, level: now - since >= delay ? candidate : '' };
  }

  return { reading, reason, sustained };
});
