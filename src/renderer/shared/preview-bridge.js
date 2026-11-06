if (new URLSearchParams(location.search).has('preview') && window.parent !== window) {
  document.body.classList.add('preview');
  const listeners = new Map();
  let snapshot;
  let ready;
  let lastSize = '';
  const initial = new Promise((resolve) => { ready = resolve; });
  const subscribe = (name) => (callback) => {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(callback);
    return () => listeners.set(name, listeners.get(name).filter((fn) => fn !== callback));
  };
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || !event.data || event.data.type !== 'preview:update') return;
    const wasActive = snapshot && snapshot.visible !== false;
    snapshot = event.data;
    const active = snapshot.visible !== false;
    document.body.hidden = !active;
    if (wasActive !== active) document.dispatchEvent(new Event('visibilitychange'));
    if (!active) return;
    ready(snapshot);
    for (const [name, payload] of [['settings', snapshot.settings], ['sensors', snapshot.sensors], ['state', snapshot.state], ['weather', snapshot.weather]]) {
      for (const callback of listeners.get(name) || []) callback(payload);
    }
  });
  const request = (key) => initial.then(() => snapshot[key]);
  window.hud = {
    getSettings: () => request('settings'), lastSensors: () => request('sensors'), getState: () => request('state'), lastWeather: () => request('weather'),
    dockInfo: async () => ({ height: 48, light: false }),
    resize: (width, height) => {
      if (width <= 0 || height <= 0) return;
      const size = `${Math.ceil(width)}:${Math.ceil(height)}`;
      if (size === lastSize) return;
      lastSize = size;
      window.parent.postMessage({ type: 'preview:size', width, height }, '*');
    },
    setHandleRect: () => {}, setSettings: () => {}, openSettings: () => {}, restartSensors: () => {},
    onSettings: subscribe('settings'), onSensors: subscribe('sensors'), onState: subscribe('state'), onWeather: subscribe('weather'),
    onDock: subscribe('dock'), onPeek: subscribe('peek'), onHandle: subscribe('handle'),
  };
  window.parent.postMessage({ type: 'preview:ready' }, '*');
}
