const fs = require('fs');
const path = require('path');
const { app, nativeImage, utilityProcess } = require('electron');

function runtimeFolder() {
  return app.isPackaged ? path.join(process.resourcesPath, 'ocr') : path.resolve(__dirname, '../../resources/ocr');
}

class Ocr {
  constructor({ fork = (file, args, options) => utilityProcess.fork(file, args, options), timeout = 60000 } = {}) {
    this.job = null;
    this.fork = fork;
    this.timeout = timeout;
  }

  recognize(png, onProgress = () => {}) {
    this.cancel();
    if (!(png instanceof Uint8Array) || png.byteLength > 32 * 1024 * 1024 || !png.byteLength) return Promise.resolve({ status: 'error' });
    const image = nativeImage.createFromBuffer(Buffer.from(png));
    const { width, height } = image.getSize();
    if (!width || !height || width > 16384 || height > 16384 || width * height > 24000000) return Promise.resolve({ status: 'invalid' });
    const folder = runtimeFolder();
    if (!['worker.cjs', 'ocr-image.js', 'ocr-result.js', ...['por', 'eng', 'spa'].map((code) => path.join('languages', `${code}.traineddata.gz`))].every((file) => fs.existsSync(path.join(folder, file)))) return Promise.resolve({ status: 'missing' });
    return new Promise((resolve) => {
      const child = this.fork(path.join(folder, 'worker.cjs'), [], { stdio: 'ignore', serviceName: 'Reconhecimento de texto' });
      const finish = (result) => {
        if (this.job && this.job.child === child) this.job = null;
        clearTimeout(timer);
        child.kill();
        resolve(result);
      };
      const timer = setTimeout(() => finish({ status: 'timeout' }), this.timeout);
      this.job = { child, finish };
      child.on('message', (message) => {
        if (!this.job || this.job.child !== child) return;
        if (message.type === 'progress') onProgress(Math.max(0, Math.min(1, Number(message.value) || 0)));
        else if (message.type === 'result') {
          const text = String(message.text || '').replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
          finish({ status: text ? 'done' : 'empty', text: text.slice(0, 1000000), lowConfidence: !!message.lowConfidence || !Number.isFinite(message.confidence) || message.confidence < 75 });
        } else if (message.type === 'error') finish({ status: 'error' });
      });
      child.on('exit', () => { if (this.job && this.job.child === child) finish({ status: 'error' }); });
      child.once('spawn', () => {
        if (!this.job || this.job.child !== child) { child.kill(); return; }
        child.postMessage(png);
      });
    });
  }

  cancel() {
    if (this.job) this.job.finish({ status: 'cancelled' });
  }
}

module.exports = { Ocr, runtimeFolder };
