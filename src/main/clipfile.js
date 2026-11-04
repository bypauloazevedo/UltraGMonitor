const { execFile } = require('child_process');
const { pathToFileURL } = require('url');
const { clipboard } = require('electron');

function run(command, args, input) {
  return new Promise((resolve) => {
    const child = execFile(command, args, { windowsHide: true }, (err) => resolve(!err));
    child.on('error', () => resolve(false));
    if (input !== undefined) child.stdin.end(input);
  });
}

async function copyFileToClipboard(file) {
  if (process.platform === 'win32') {
    const command = `Set-Clipboard -Path '${file.replace(/'/g, "''")}'`;
    const encoded = Buffer.from(command, 'utf16le').toString('base64');
    return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
  }
  const uri = `${pathToFileURL(file).href}\n`;
  if (process.env.WAYLAND_DISPLAY && (await run('wl-copy', ['--type', 'text/uri-list'], uri))) return true;
  if (await run('xclip', ['-selection', 'clipboard', '-t', 'text/uri-list'], uri)) return true;
  await clipboard.writeText(file);
  return false;
}

module.exports = { copyFileToClipboard };
