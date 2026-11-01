const { app, dialog, protocol, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { t } = require('../renderer/shared/i18n');

const SCHEME = 'ugm';
const IMAGES = ['gif', 'webp', 'png', 'apng', 'jpg', 'jpeg'];
const VIDEOS = ['mp4', 'webm'];

function folder() {
  return path.join(app.getPath('userData'), 'background');
}

function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

function serve(getBackground) {
  protocol.handle(SCHEME, () => {
    const bg = getBackground();
    if (!bg || !bg.file) return new Response('', { status: 404 });
    const file = path.join(folder(), path.basename(bg.file));
    if (!fs.existsSync(file)) return new Response('', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

async function choose(parent) {
  const result = await dialog.showOpenDialog(parent, {
    title: t('Escolher fundo animado'),
    properties: ['openFile'],
    filters: [{ name: t('GIF, imagem ou vídeo'), extensions: [...IMAGES, ...VIDEOS] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const source = result.filePaths[0];
  const ext = path.extname(source).slice(1).toLowerCase();
  if (!IMAGES.includes(ext) && !VIDEOS.includes(ext)) return null;
  fs.rmSync(folder(), { recursive: true, force: true });
  fs.mkdirSync(folder(), { recursive: true });
  const file = `fundo-${Date.now()}.${ext}`;
  fs.copyFileSync(source, path.join(folder(), file));
  return { file, kind: VIDEOS.includes(ext) ? 'video' : 'image', name: path.basename(source) };
}

function clear() {
  fs.rmSync(folder(), { recursive: true, force: true });
}

module.exports = { registerScheme, serve, choose, clear };
