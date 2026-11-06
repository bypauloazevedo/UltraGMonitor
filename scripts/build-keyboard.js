const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.platform !== 'win32') process.exit(0);
const root = path.resolve(__dirname, '..');
const compiler = ['Framework64', 'Framework'].map(folder => path.join(process.env.WINDIR, 'Microsoft.NET', folder, 'v4.0.30319', 'csc.exe')).find(file => fs.existsSync(file));
if (!compiler) throw new Error('Não encontrei o compilador do .NET Framework para o atalho de captura.');
const out = path.join(root, 'keyboard', 'out');
fs.mkdirSync(out, { recursive: true });
execFileSync(compiler, ['/nologo', '/target:winexe', '/optimize+', '/debug-', `/win32icon:${path.join(root, 'assets', 'icon.ico')}`, `/out:${path.join(out, 'UltraGMonitor.Keys.exe')}`, ...['Program.cs', 'KeyHook.cs', 'CaptureChord.cs'].map(file => path.join(root, 'keyboard', file))], { stdio: 'inherit', windowsHide: true });
console.log('Atalho de captura compilado.');
