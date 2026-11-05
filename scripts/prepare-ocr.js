const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'resources', 'ocr');
const copied = new Set();

function copyPackage(name, from) {
  const requireFrom = createRequire(from);
  let directory = path.dirname(requireFrom.resolve(name));
  while (!fs.existsSync(path.join(directory, 'package.json'))) {
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`Pacote não encontrado: ${name}`);
    directory = parent;
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  if (copied.has(pkg.name)) return;
  copied.add(pkg.name);
  const destination = path.join(target, 'node_modules', pkg.name);
  fs.cpSync(directory, destination, { recursive: true, filter: (file) => !file.split(path.sep).slice(directory.split(path.sep).length).includes('node_modules') });
  for (const dependency of Object.keys(pkg.dependencies || {})) copyPackage(dependency, path.join(directory, 'package.json'));
}

fs.mkdirSync(path.join(target, 'languages'), { recursive: true });
copyPackage('tesseract.js', path.join(root, 'package.json'));
copyPackage('pngjs', path.join(root, 'package.json'));
for (const language of ['por', 'eng', 'spa']) {
  const pkg = path.dirname(require.resolve(`@tesseract.js-data/${language}/package.json`));
  fs.copyFileSync(path.join(pkg, '4.0.0_best_int', `${language}.traineddata.gz`), path.join(target, 'languages', `${language}.traineddata.gz`));
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
    const license = path.join(pkg, name);
    if (fs.existsSync(license)) fs.copyFileSync(license, path.join(target, 'languages', `${language}-${name}`));
  }
}
fs.copyFileSync(path.join(root, 'src', 'main', 'ocr-worker.js'), path.join(target, 'worker.cjs'));
for (const name of ['ocr-image', 'ocr-result']) fs.copyFileSync(path.join(root, 'src', 'main', `${name}.js`), path.join(target, `${name}.js`));
console.log('Reconhecimento de texto offline preparado: português, inglês e espanhol.');
