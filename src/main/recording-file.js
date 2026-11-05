const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class RecordingFile {
  constructor(folder, name) {
    this.folder = folder;
    this.name = name;
    this.handle = null;
    this.bytes = 0;
    this.queue = Promise.resolve();
    this.closed = false;
  }

  async open(mime) {
    if (this.handle || this.closed) throw new Error('Gravação já iniciada');
    if (!/^video\/(mp4|webm)(;|$)/.test(mime)) throw new Error('Formato de vídeo inválido');
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    await fs.promises.mkdir(this.folder, { recursive: true });
    const id = crypto.randomBytes(4).toString('hex');
    this.file = path.join(this.folder, `${this.name} ${id}.${ext}`);
    this.partial = path.join(this.folder, `${this.name} ${id}.partial.${ext}`);
    this.handle = await fs.promises.open(this.partial, 'wx');
  }

  append(data) {
    if (!this.handle || this.closed) return Promise.reject(new Error('Gravação não está aberta'));
    if (!(data instanceof Uint8Array) || data.byteLength > 16 * 1024 * 1024) return Promise.reject(new Error('Bloco de vídeo inválido'));
    this.queue = this.queue.then(async () => {
      await this.handle.writeFile(data);
      await this.handle.datasync();
      this.bytes += data.byteLength;
    });
    return this.queue;
  }

  async finish() {
    await this.queue;
    if (!this.handle || this.closed || !this.bytes) throw new Error('Gravação vazia');
    await this.handle.sync();
    await this.handle.close();
    this.handle = null;
    this.closed = true;
    await fs.promises.rename(this.partial, this.file);
    return this.file;
  }

  async close(discard = false) {
    this.closed = true;
    await this.queue.catch(() => {});
    if (this.handle) await this.handle.close().catch(() => {});
    this.handle = null;
    if (this.partial && (discard || !this.bytes)) await fs.promises.unlink(this.partial).catch(() => {});
    return this.bytes && !discard ? this.partial : null;
  }
}

module.exports = { RecordingFile };
