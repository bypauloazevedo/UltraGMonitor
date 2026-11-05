const net = require('net');
const crypto = require('crypto');
const fs = require('fs');
const { spawn, execFile, execFileSync } = require('child_process');
const { EventEmitter } = require('events');

function processIsAdmin() {
  try {
    execFileSync('net', ['session'], { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

class Sensors extends EventEmitter {
  constructor({ exe, presentMon }) {
    super();
    this.exe = exe;
    this.presentMon = presentMon;
    this.server = null;
    this.socket = null;
    this.child = null;
    this.fps = false;
    this.hook = false;
    this.monitoring = true;
    this.stopping = false;
    this.crashes = 0;
    this.restartTimer = null;
    this.shots = new Map();
    this.elevatedRequested = false;
    this.connectionTimer = null;
    this.watchdog = null;
    this.lastReading = 0;
    this.readings = 0;
    this.generation = 0;
    this.electronAdmin = processIsAdmin();
    this.status = { running: false, elevated: false, elevationDenied: false, missing: false };
  }

  setStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.status);
  }

  start({ elevated, fps }) {
    this.stop();
    this.generation++;
    this.stopping = false;
    this.fps = fps;
    this.elevatedRequested = !!elevated;
    this.readings = 0;
    this.setStatus({ running: false, starting: true, missing: false, failed: false });
    if (!fs.existsSync(this.exe)) {
      this.setStatus({ running: false, starting: false, missing: true });
      return;
    }
    const name = `ugm-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
    const server = net.createServer((socket) => this.onConnection(socket));
    this.server = server;
    server.on('error', (err) => {
      this.emit('log', `pipe: ${err.message}`);
      if (this.server === server && !this.stopping) this.scheduleRestart();
    });
    server.listen(`\\\\.\\pipe\\${name}`, () => {
      if (this.server !== server || this.stopping) return;
      const args = ['--pipe', name, '--presentmon', this.presentMon];
      if (fps) args.push('--fps');
      if (elevated && !this.electronAdmin) this.launchElevated(args);
      else this.launchDirect(args);
    });
    this.connectionTimer = setTimeout(() => {
      if (!this.socket && !this.stopping) this.scheduleRestart();
    }, 30000);
  }

  launchDirect(args) {
    this.setStatus({ elevated: this.electronAdmin });
    const child = spawn(this.exe, args, { windowsHide: true, stdio: 'ignore' });
    this.child = child;
    child.on('error', (err) => {
      this.emit('log', `sensor: ${err.message}`);
      if (this.child === child && !this.stopping) this.scheduleRestart();
    });
    child.on('exit', () => {
      if (this.child === child) this.child = null;
    });
  }

  launchElevated(args) {
    const generation = this.generation;
    const list = args.map((a) => psQuote(a.includes(' ') ? `"${a}"` : a)).join(',');
    const script = [
      '$ErrorActionPreference = "Stop"',
      'try {',
      `  Start-Process -FilePath ${psQuote(this.exe)} -ArgumentList @(${list}) -Verb RunAs -WindowStyle Hidden`,
      '  exit 0',
      '} catch { exit 1 }',
    ].join('\n');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true }, (err) => {
      if (this.stopping || generation !== this.generation) return;
      if (err) {
        this.elevatedRequested = false;
        this.setStatus({ elevationDenied: true, elevated: false });
        this.launchDirect(args);
      } else {
        this.setStatus({ elevationDenied: false, elevated: true });
      }
    });
  }

  onConnection(socket) {
    if (this.socket) {
      socket.destroy();
      return;
    }
    this.socket = socket;
    clearTimeout(this.connectionTimer);
    this.lastReading = Date.now();
    this.setStatus({ running: true, starting: false, missing: false });
    clearInterval(this.watchdog);
    this.watchdog = setInterval(() => {
      if (this.monitoring && Date.now() - this.lastReading > 8000) socket.destroy();
    }, 2000);
    this.send(`monitor ${this.monitoring ? 'on' : 'off'}`);
    this.send(`hook ${this.hook ? 'on' : 'off'}`);
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > 4 * 1024 * 1024) { socket.destroy(); return; }
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        try {
          const data = JSON.parse(line);
          if (data.type === 'sensors') {
            this.lastReading = Date.now();
            if (++this.readings >= 10) this.crashes = 0;
            this.elevatedRequested = data.admin === true;
            this.emit('data', data);
          } else if (data.type === 'shot') {
            const pending = this.shots.get(data.id);
            if (pending) {
              this.shots.delete(data.id);
              pending(data);
            }
          } else if (data.type === 'key') {
            this.emit('key', data.name);
          } else if (data.type === 'error') {
            this.emit('log', `sensor: ${data.message}`);
          }
        } catch {
          this.emit('log', `linha inválida: ${line.slice(0, 120)}`);
        }
      }
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.setStatus({ running: false });
      if (!this.stopping) this.scheduleRestart();
    });
  }

  scheduleRestart() {
    if (this.restartTimer || this.stopping) return;
    clearTimeout(this.connectionTimer);
    clearInterval(this.watchdog);
    this.crashes += 1;
    this.setStatus({ running: false, starting: this.crashes <= 5, failed: this.crashes > 5 });
    if (this.crashes > 5) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.start(this.restartOptions());
    }, 2000 * this.crashes);
  }

  restartOptions() {
    return { elevated: this.elevatedRequested, fps: this.fps };
  }

  send(command) {
    if (this.socket && !this.socket.destroyed) this.socket.write(`${command}\n`);
  }

  shot(rect, file, timeout = 1500) {
    if (!this.socket || this.socket.destroyed) return Promise.reject(new Error('ajudante parado'));
    const id = crypto.randomBytes(4).toString('hex');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.shots.delete(id);
        reject(new Error('ajudante demorou'));
      }, timeout);
      this.shots.set(id, (data) => {
        clearTimeout(timer);
        if (data.ok) resolve(data);
        else reject(new Error(data.error || 'falhou'));
      });
      this.send(`shot ${id} ${Math.round(rect.x)} ${Math.round(rect.y)} ${Math.round(rect.width)} ${Math.round(rect.height)} ${file}`);
    });
  }

  setFps(on) {
    this.fps = on;
    this.send(`fps ${on ? 'on' : 'off'}`);
  }

  setHook(on) {
    this.hook = on;
    this.send(`hook ${on ? 'on' : 'off'}`);
  }

  setMonitoring(on) {
    this.monitoring = on;
    this.lastReading = Date.now();
    this.send(`monitor ${on ? 'on' : 'off'}`);
  }

  stop() {
    this.stopping = true;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    clearTimeout(this.connectionTimer);
    clearInterval(this.watchdog);
    for (const pending of this.shots.values()) pending({ ok: false, error: 'Leitura interrompida' });
    this.shots.clear();
    if (this.socket) {
      try {
        this.socket.write('quit\n');
      } catch {}
      this.socket.destroy();
      this.socket = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    if (this.child) {
      const child = this.child;
      this.child = null;
      setTimeout(() => {
        if (child.exitCode === null) child.kill();
      }, 1500);
    }
  }
}

module.exports = { Sensors };
