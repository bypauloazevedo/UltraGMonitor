const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const work = path.join(root, '.build');
const dist = path.join(root, 'dist');
const keep = process.argv.includes('--keep');

function run(args) {
  execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
}

run([path.join(__dirname, 'fetch-deps.js')]);
run([path.join(__dirname, 'build-sensor.js')]);
fs.rmSync(work, { recursive: true, force: true });
run([require.resolve('electron-builder/cli.js'), '--win', 'nsis', '--publish', 'never']);

const setup = fs.readdirSync(work).find((f) => f.endsWith('-Setup.exe'));
if (!setup) throw new Error('instalador não foi gerado');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.copyFileSync(path.join(work, setup), path.join(dist, setup));
if (!keep) fs.rmSync(work, { recursive: true, force: true });
console.log(`instalador pronto: ${path.join(dist, setup)}`);
