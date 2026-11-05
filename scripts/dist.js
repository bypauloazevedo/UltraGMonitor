const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const work = path.join(root, '.build');
const dist = path.join(root, 'dist');
const keep = process.argv.includes('--keep');
const windows = process.platform === 'win32';

function run(args) {
  execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
}

run([path.join(__dirname, 'prepare-ocr.js')]);
if (windows) {
  run([path.join(__dirname, 'fetch-deps.js')]);
  run([path.join(__dirname, 'build-sensor.js')]);
}
fs.rmSync(work, { recursive: true, force: true });
run([require.resolve('electron-builder/cli.js'), ...(windows ? ['--win', 'nsis'] : ['--linux', 'AppImage', 'deb']), '--publish', 'never']);

const outputs = fs.readdirSync(work).filter((f) => (windows ? f.endsWith('-Setup.exe') : /\.(AppImage|deb)$/.test(f)));
if (!outputs.length) throw new Error('instalador não foi gerado');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const file of outputs) fs.copyFileSync(path.join(work, file), path.join(dist, file));
if (!keep) fs.rmSync(work, { recursive: true, force: true });
for (const file of outputs) console.log(`instalador pronto: ${path.join(dist, file)}`);
