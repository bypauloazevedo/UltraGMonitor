const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');

const FILE = path.join(os.homedir(), '.config', 'autostart', 'ultragmonitor.desktop');

function command() {
  if (process.env.APPIMAGE) return `"${process.env.APPIMAGE}" --autostart`;
  if (app.isPackaged) return `"${process.execPath}" --autostart`;
  return `"${process.execPath}" "${app.getAppPath()}" --autostart`;
}

function setLinuxAutostart(on) {
  if (!on) {
    fs.rmSync(FILE, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, ['[Desktop Entry]', 'Type=Application', 'Name=UltraGMonitor', `Exec=${command()}`, 'Icon=ultragmonitor', 'Terminal=false', 'X-GNOME-Autostart-enabled=true', ''].join('\n'));
}

module.exports = { setLinuxAutostart };
