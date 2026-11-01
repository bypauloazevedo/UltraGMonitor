const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'resources');

const DEPS = [
  {
    name: 'PresentMon 2.6.0',
    url: 'https://github.com/GameTechDev/PresentMon/releases/download/v2.6.0/PresentMon-2.6.0-x64.exe',
    target: path.join(root, 'presentmon', 'PresentMon.exe'),
  },
  {
    name: 'PawnIO 2.2.0',
    url: 'https://github.com/namazso/PawnIO.Setup/releases/download/2.2.0/PawnIO_setup.exe',
    target: path.join(root, 'pawnio', 'PawnIO_setup.exe'),
  },
];

async function download(dep) {
  if (fs.existsSync(dep.target)) {
    console.log(`${dep.name} já baixado`);
    return;
  }
  fs.mkdirSync(path.dirname(dep.target), { recursive: true });
  const res = await fetch(dep.url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`falha ao baixar ${dep.name}: ${res.status}`);
  fs.writeFileSync(dep.target, Buffer.from(await res.arrayBuffer()));
  console.log(`${dep.name} salvo em ${dep.target}`);
}

async function main() {
  for (const dep of DEPS) await download(dep);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
