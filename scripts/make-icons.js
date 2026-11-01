const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const assets = path.join(root, 'assets');
const fontsCss = pathToFileURL(path.join(root, 'src', 'renderer', 'shared', 'fonts.css')).href;
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const MARK_UP_TO = 24;
const RENDER = 512;

function pageFor(svgFile) {
  const svg = fs.readFileSync(svgFile, 'utf8');
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${fontsCss}"><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:100vw;height:100vh}</style></head><body>${svg}</body></html>`;
  const file = path.join(os.tmpdir(), `ugm-${path.basename(svgFile, '.svg')}.html`);
  fs.writeFileSync(file, html);
  return file;
}

async function render(svgFile) {
  const win = new BrowserWindow({
    width: RENDER,
    height: RENDER,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  await win.loadFile(pageFor(svgFile));
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
  await new Promise((resolve) => setTimeout(resolve, 400));
  const image = await win.webContents.capturePage();
  win.destroy();
  return image;
}

function png(image, size) {
  return image.resize({ width: size, height: size, quality: 'best' }).toPNG();
}

function ico(frames) {
  const header = Buffer.alloc(6 + 16 * frames.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...frames.map((f) => f.data)]);
}

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const logo = await render(path.join(assets, 'logo.svg'));
  const mark = await render(path.join(assets, 'logo-mark.svg'));
  const frames = ICO_SIZES.map((size) => ({ size, data: png(size <= MARK_UP_TO ? mark : logo, size) }));
  fs.writeFileSync(path.join(assets, 'icon.ico'), ico(frames));
  fs.writeFileSync(path.join(assets, 'icon.png'), png(logo, 256));
  fs.writeFileSync(path.join(assets, 'logo.png'), png(logo, 512));
  fs.writeFileSync(path.join(assets, 'tray.png'), png(mark, 32));
  console.log('ícones gerados em assets/');
  app.quit();
});
