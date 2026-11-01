const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function findDotnet() {
  const local = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Microsoft', 'dotnet', 'dotnet.exe');
  if (fs.existsSync(local)) return local;
  return 'dotnet';
}

const root = path.join(__dirname, '..');
const project = path.join(root, 'sensor', 'HudSensor.csproj');
const out = path.join(root, 'sensor', 'out');

fs.rmSync(out, { recursive: true, force: true });
execFileSync(findDotnet(), ['publish', project, '-c', 'Release', '-o', out, '--nologo'], { stdio: 'inherit' });
console.log(`sensor pronto em ${out}`);
