const { EventEmitter } = require('events');
const { LinuxReader } = require('./linux-reader');

const INTERVAL = 1000;

class Sensors extends EventEmitter {
  constructor() {
    super();
    this.reader = new LinuxReader();
    this.timer = null;
    this.fps = false;
    this.hook = false;
    this.monitoring = true;
    this.electronAdmin = typeof process.getuid === 'function' && process.getuid() === 0;
    this.status = { running: false, elevated: this.electronAdmin, elevationDenied: false, missing: false };
  }

  setStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.status);
  }

  start() {
    this.stop();
    this.setStatus({ running: true });
    if (this.monitoring) this.run();
  }

  run() {
    clearInterval(this.timer);
    const tick = () => {
      try {
        this.emit('data', this.reader.sample());
      } catch (err) {
        this.emit('log', `sensores: ${err.message}`);
      }
    };
    tick();
    this.timer = setInterval(tick, INTERVAL);
  }

  send() {}

  shot() {
    return Promise.reject(new Error('sem ajudante no Linux'));
  }

  setFps(on) {
    this.fps = on;
  }

  setHook(on) {
    this.hook = on;
  }

  setMonitoring(on) {
    this.monitoring = on;
    if (on && this.status.running) this.run();
    else clearInterval(this.timer);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.status.running) this.setStatus({ running: false });
  }
}

module.exports = { Sensors };
