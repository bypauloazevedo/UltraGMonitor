const fs = require('fs');
const path = require('path');

function releaseNotes(changelog, input) {
  const version = String(input).replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Versão inválida para as notas da publicação');
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`## ${version} — `));
  if (start < 0) throw new Error(`A versão ${version} não está no changelog`);
  const remaining = lines.slice(start + 1);
  const end = remaining.findIndex((line) => line.startsWith('## '));
  const notes = (end < 0 ? remaining : remaining.slice(0, end)).join('\n').trim();
  if (!notes) throw new Error(`A versão ${version} está sem notas no changelog`);
  return `${notes}\n`;
}

if (require.main === module) {
  try {
    const root = path.resolve(__dirname, '..');
    const current = require(path.join(root, 'package.json')).version;
    const version = String(process.argv[2] || current).replace(/^v/, '');
    if (version !== current) throw new Error('A tag e a versão do app precisam ser iguais');
    process.stdout.write(releaseNotes(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { releaseNotes };
