const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel) {
  return (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('hud', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  getState: () => ipcRenderer.invoke('state:get'),
  lastSensors: () => ipcRenderer.invoke('sensors:last'),
  lastWeather: () => ipcRenderer.invoke('weather:last'),
  searchCity: (query) => ipcRenderer.invoke('weather:search', query),
  refreshWeather: () => ipcRenderer.invoke('weather:refresh'),
  restartSensors: (elevated) => ipcRenderer.invoke('sensors:restart', elevated),
  moveToDisplay: (id) => ipcRenderer.invoke('overlay:move-to-display', id),
  openPawnIo: () => ipcRenderer.invoke('open:pawnio'),
  openSettings: () => ipcRenderer.invoke('open:settings'),
  resize: (width, height) => ipcRenderer.send('overlay:resize', { width, height }),
  setHandleRect: (rect) => ipcRenderer.send('overlay:handle', rect),
  dockInfo: () => ipcRenderer.invoke('dock:info'),
  chooseBackground: () => ipcRenderer.invoke('background:choose'),
  clearBackground: () => ipcRenderer.invoke('background:clear'),
  onSettings: subscribe('settings'),
  onSensors: subscribe('sensors'),
  onWeather: subscribe('weather'),
  onState: subscribe('state'),
  onDock: subscribe('dock'),
  onPeek: subscribe('peek'),
  onHandle: subscribe('handle'),
});
