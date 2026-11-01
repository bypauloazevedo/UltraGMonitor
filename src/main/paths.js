const path = require('path');
const { app } = require('electron');

const root = path.join(__dirname, '..', '..');

function fromResources(dev, packaged) {
  return app.isPackaged ? path.join(process.resourcesPath, ...packaged) : path.join(root, ...dev);
}

module.exports = {
  sensorExe: () => fromResources(['sensor', 'out', 'UltraGMonitor.Sensor.exe'], ['sensor', 'UltraGMonitor.Sensor.exe']),
  presentMonExe: () => fromResources(['resources', 'presentmon', 'PresentMon.exe'], ['presentmon', 'PresentMon.exe']),
  asset: (name) => path.join(root, 'assets', name),
  page: (name) => path.join(root, 'src', 'renderer', name, 'index.html'),
  preload: () => path.join(root, 'src', 'preload', 'preload.js'),
};
