const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const DISK = /^(nvme\d+n\d+|sd[a-z]+|vd[a-z]+|hd[a-z]+|mmcblk\d+)$/;
const NVIDIA_QUERY = 'name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw,clocks.gr,fan.speed';

function number(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function cleanCpuName(name) {
  return String(name || '')
    .replace(/\((R|TM|tm|r)\)/g, '')
    .replace(/\s+CPU\s+@.*$/i, '')
    .replace(/\s+\d+-Core Processor$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNvidia(text) {
  const line = String(text || '').split(/\r?\n/).find((l) => l.trim());
  if (!line) return null;
  const [name, load, temp, used, total, power, clock, fan] = line.split(',').map((v) => v.trim());
  return {
    name,
    load: number(load),
    temp: number(temp),
    vramUsed: number(used),
    vramTotal: number(total),
    power: number(power),
    clock: number(clock),
    fan: number(fan),
  };
}

class LinuxReader {
  constructor({ root = '/', exec = execFile } = {}) {
    this.root = root;
    this.exec = exec;
    this.prevCpu = null;
    this.prevDisks = null;
    this.prevEnergy = null;
    this.nvidia = null;
    this.nvidiaMissing = false;
    this.nvidiaBusy = false;
    this.cpuName = null;
  }

  file(...parts) {
    return path.join(this.root, ...parts);
  }

  read(...parts) {
    try {
      return fs.readFileSync(this.file(...parts), 'utf8');
    } catch {
      return null;
    }
  }

  value(...parts) {
    const text = this.read(...parts);
    return text === null ? null : number(text);
  }

  list(...parts) {
    try {
      return fs.readdirSync(this.file(...parts));
    } catch {
      return [];
    }
  }

  hwmons() {
    return this.list('sys', 'class', 'hwmon').map((dir) => ({
      dir: ['sys', 'class', 'hwmon', dir],
      name: (this.read('sys', 'class', 'hwmon', dir, 'name') || '').trim(),
    }));
  }

  hwmonTemp(dir, labels) {
    const inputs = this.list(...dir).filter((f) => /^temp\d+_input$/.test(f));
    const byLabel = inputs.map((input) => ({
      label: (this.read(...dir, input.replace('_input', '_label')) || '').trim(),
      value: this.value(...dir, input),
    }));
    for (const label of labels) {
      const hit = byLabel.find((t) => t.label === label && t.value !== null);
      if (hit) return hit.value / 1000;
    }
    const first = byLabel.find((t) => t.value !== null);
    return first ? first.value / 1000 : null;
  }

  sample(now = Date.now()) {
    const data = {
      type: 'sensors',
      admin: typeof process.getuid === 'function' && process.getuid() === 0,
      pawnio: false,
      platform: 'linux',
      cpu: this.cpu(now),
      gpu: this.gpu(),
      ram: this.ram(),
      disks: this.disks(now),
      fps: { enabled: false, error: null, unsupported: true },
      fullscreen: { active: false, x: 0, y: 0 },
    };
    this.refreshNvidia();
    return data;
  }

  cpu(now) {
    const stat = this.read('proc', 'stat');
    if (!stat) return null;
    const rows = {};
    for (const line of stat.split('\n')) {
      const match = line.match(/^(cpu\d*)\s+(.+)$/);
      if (!match) continue;
      const v = match[2].trim().split(/\s+/).map(Number);
      const idle = (v[3] || 0) + (v[4] || 0);
      const total = v.slice(0, 8).reduce((a, b) => a + (b || 0), 0);
      rows[match[1]] = { idle, total };
    }
    const prev = this.prevCpu;
    this.prevCpu = rows;
    const load = (key) => {
      if (!prev || !prev[key] || !rows[key]) return null;
      const total = rows[key].total - prev[key].total;
      const idle = rows[key].idle - prev[key].idle;
      return total > 0 ? Math.max(0, Math.min(100, ((total - idle) / total) * 100)) : null;
    };
    const cores = Object.keys(rows).filter((k) => k !== 'cpu').map(load).filter((v) => v !== null);
    if (!this.cpuName) {
      const info = this.read('proc', 'cpuinfo') || '';
      const match = info.match(/^model name\s*:\s*(.+)$/m) || info.match(/^Hardware\s*:\s*(.+)$/m);
      this.cpuName = cleanCpuName(match ? match[1] : 'CPU');
    }
    return {
      name: this.cpuName,
      load: load('cpu'),
      temp: this.cpuTemp(),
      clock: this.cpuClock(),
      power: this.cpuPower(now),
      maxCore: cores.length ? Math.max(...cores) : null,
    };
  }

  cpuTemp() {
    const sensors = this.hwmons();
    const pick = (names, labels) => {
      const hit = sensors.find((s) => names.includes(s.name));
      return hit ? this.hwmonTemp(hit.dir, labels) : null;
    };
    const temp = pick(['coretemp'], ['Package id 0']) ?? pick(['k10temp', 'zenpower'], ['Tdie', 'Tctl']) ?? pick(['cpu_thermal', 'soc_thermal'], []);
    if (temp !== null) return temp;
    for (const zone of this.list('sys', 'class', 'thermal')) {
      const type = (this.read('sys', 'class', 'thermal', zone, 'type') || '').trim();
      if (type === 'x86_pkg_temp') {
        const value = this.value('sys', 'class', 'thermal', zone, 'temp');
        if (value !== null) return value / 1000;
      }
    }
    return null;
  }

  cpuClock() {
    const values = this.list('sys', 'devices', 'system', 'cpu')
      .filter((d) => /^cpu\d+$/.test(d))
      .map((d) => this.value('sys', 'devices', 'system', 'cpu', d, 'cpufreq', 'scaling_cur_freq'))
      .filter((v) => v !== null && v > 0);
    if (values.length) return values.reduce((a, b) => a + b, 0) / values.length / 1000;
    const info = this.read('proc', 'cpuinfo') || '';
    const mhz = [...info.matchAll(/^cpu MHz\s*:\s*([\d.]+)$/gm)].map((m) => Number(m[1]));
    return mhz.length ? mhz.reduce((a, b) => a + b, 0) / mhz.length : null;
  }

  cpuPower(now) {
    const energy = this.value('sys', 'class', 'powercap', 'intel-rapl:0', 'energy_uj');
    if (energy === null) return null;
    const prev = this.prevEnergy;
    this.prevEnergy = { energy, now };
    if (!prev || energy < prev.energy || now <= prev.now) return null;
    return (energy - prev.energy) / 1e6 / ((now - prev.now) / 1000);
  }

  refreshNvidia() {
    if (this.nvidiaMissing || this.nvidiaBusy) return;
    this.nvidiaBusy = true;
    try {
      this.exec('nvidia-smi', [`--query-gpu=${NVIDIA_QUERY}`, '--format=csv,noheader,nounits'], { timeout: 3000, windowsHide: true }, (err, stdout) => {
        this.nvidiaBusy = false;
        if (err) {
          if (err.code === 'ENOENT') this.nvidiaMissing = true;
          return;
        }
        this.nvidia = parseNvidia(stdout);
      });
    } catch {
      this.nvidiaBusy = false;
      this.nvidiaMissing = true;
    }
  }

  gpu() {
    if (this.nvidia) return this.nvidia;
    const cards = this.list('sys', 'class', 'drm').filter((d) => /^card\d+$/.test(d));
    for (const card of cards) {
      const dev = ['sys', 'class', 'drm', card, 'device'];
      const vendor = (this.read(...dev, 'vendor') || '').trim();
      if (vendor === '0x1002') return this.amdGpu(dev);
    }
    for (const card of cards) {
      const dev = ['sys', 'class', 'drm', card, 'device'];
      if ((this.read(...dev, 'vendor') || '').trim() === '0x8086') {
        return { name: 'Intel Graphics', load: null, temp: null, vramUsed: null, vramTotal: null, power: null, clock: null, fan: null };
      }
    }
    return null;
  }

  amdGpu(dev) {
    const hwmon = this.list(...dev, 'hwmon')[0];
    const mon = hwmon ? [...dev, 'hwmon', hwmon] : null;
    const read = (file) => (mon ? this.value(...mon, file) : null);
    const used = this.value(...dev, 'mem_info_vram_used');
    const total = this.value(...dev, 'mem_info_vram_total');
    const power = read('power1_average') ?? read('power1_input');
    const clock = read('freq1_input');
    const name = (this.read(...dev, 'product_name') || '').trim() || 'AMD Radeon';
    return {
      name,
      load: this.value(...dev, 'gpu_busy_percent'),
      temp: mon ? this.hwmonTemp(mon, ['edge']) : null,
      hotspot: mon ? this.hwmonTemp(mon, ['junction']) : null,
      vramUsed: used === null ? null : used / 1024 / 1024,
      vramTotal: total === null ? null : total / 1024 / 1024,
      power: power === null ? null : power / 1e6,
      clock: clock === null ? null : clock / 1e6,
      fan: read('fan1_input'),
    };
  }

  ram() {
    const info = this.read('proc', 'meminfo');
    if (!info) return null;
    const field = (name) => {
      const match = info.match(new RegExp(`^${name}:\\s+(\\d+)`, 'm'));
      return match ? Number(match[1]) : null;
    };
    const total = field('MemTotal');
    const available = field('MemAvailable');
    if (!total || available === null) return null;
    const gb = (kb) => kb / 1024 / 1024;
    return { used: gb(total - available), total: gb(total), load: ((total - available) / total) * 100 };
  }

  mounts() {
    const map = {};
    for (const line of (this.read('proc', 'mounts') || '').split('\n')) {
      const [device, point] = line.split(' ');
      if (!device || !device.startsWith('/dev/')) continue;
      const part = device.slice(5);
      const disk = part.match(/^(nvme\d+n\d+|mmcblk\d+)(p\d+)?$/) ? part.replace(/p\d+$/, '') : part.replace(/\d+$/, '');
      const where = point.replace(/\\040/g, ' ');
      if (where.startsWith('/boot') || where.startsWith('/snap')) continue;
      (map[disk] = map[disk] || []).push(where);
    }
    return map;
  }

  diskTemp(name) {
    const dev = ['sys', 'block', name, 'device'];
    for (const hwmon of this.list(...dev, 'hwmon')) {
      const value = this.value(...dev, 'hwmon', hwmon, 'temp1_input');
      if (value !== null) return value / 1000;
    }
    return null;
  }

  disks(now) {
    const stats = {};
    for (const line of (this.read('proc', 'diskstats') || '').split('\n')) {
      const f = line.trim().split(/\s+/);
      if (f.length < 14 || !DISK.test(f[2])) continue;
      stats[f[2]] = { read: Number(f[5]), write: Number(f[9]), busy: Number(f[12]) };
    }
    const prev = this.prevDisks;
    this.prevDisks = { stats, now };
    const mounts = this.mounts();
    const names = this.list('sys', 'block').filter((n) => DISK.test(n)).sort();
    return names.map((name) => {
      const points = mounts[name] || [];
      const current = stats[name];
      const before = prev && prev.stats[name];
      const seconds = prev ? (now - prev.now) / 1000 : 0;
      const rate = (key) => (current && before && seconds > 0 ? Math.max(0, ((current[key] - before[key]) * 512) / seconds) : null);
      const activity = current && before && seconds > 0 ? Math.max(0, Math.min(100, ((current.busy - before.busy) / (seconds * 1000)) * 100)) : null;
      let used = null;
      const main = points.includes('/') ? '/' : points[0];
      if (main && typeof fs.statfsSync === 'function') {
        try {
          const s = fs.statfsSync(this.root === '/' ? main : this.file(main));
          if (s.blocks > 0) used = ((s.blocks - s.bfree) / s.blocks) * 100;
        } catch {}
      }
      return {
        id: name,
        name: (this.read('sys', 'block', name, 'device', 'model') || '').trim() || name,
        letters: points.join(' '),
        system: points.includes('/'),
        temp: this.diskTemp(name),
        used,
        activity,
        read: rate('read'),
        write: rate('write'),
      };
    });
  }
}

module.exports = { LinuxReader, parseNvidia, cleanCpuName };
