const fs = require('fs');
const path = require('path');

class HistoryFiles {
  constructor(thumbnail, limit = 30) {
    this.thumbnail = thumbnail;
    this.limit = limit;
    this.cache = new Map();
  }

  async scan(dir, kind, pattern) {
    let names;
    try {
      names = (await fs.promises.readdir(dir)).filter((name) => pattern.test(name));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    const result = [];
    for (let offset = 0; offset < names.length; offset += 32) {
      const batch = await Promise.all(names.slice(offset, offset + 32).map(async (name) => {
        try {
          const file = path.join(dir, name);
          const stat = await fs.promises.stat(file);
          return stat.isFile() ? { file, name, kind, time: stat.mtimeMs, size: stat.size, interrupted: /\.partial\.(mp4|webm)$/.test(name) } : null;
        } catch { return null; }
      }));
      result.push(...batch.filter(Boolean));
    }
    return result;
  }

  async list(directories, exclude = []) {
    const scanned = await Promise.allSettled(directories.map((dir) => this.scan(dir.path, dir.kind, dir.pattern)));
    const all = scanned.flatMap((result) => result.status === 'fulfilled' ? result.value : []).filter((item) => !exclude.includes(item.file));
    all.sort((a, b) => b.time - a.time || a.file.localeCompare(b.file));
    const items = all.slice(0, this.limit);
    const output = [];
    for (let offset = 0; offset < items.length; offset += 4) {
      output.push(...await Promise.all(items.slice(offset, offset + 4).map(async (item) => {
        const key = `${item.file}:${item.time}:${item.size}`;
        if (!this.cache.has(key)) this.cache.set(key, Promise.resolve().then(() => this.thumbnail(item)).catch(() => null));
        return { ...item, thumb: await this.cache.get(key) };
      })));
    }
    const active = new Set(items.map((item) => `${item.file}:${item.time}:${item.size}`));
    for (const key of this.cache.keys()) if (!active.has(key)) this.cache.delete(key);
    return { items: output, warning: scanned.some((result) => result.status === 'rejected') };
  }
}

module.exports = { HistoryFiles };
