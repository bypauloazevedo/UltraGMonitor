const { EventEmitter } = require('events');
const { spawn } = require('child_process');

const LATEST = 'https://api.github.com/repos/bypauloazevedo/UltraGMonitor/releases/latest';
const WINGET_ID = 'PauloAzevedo.UltraGMonitor';
const FIRST_CHECK = 30 * 1000;
const EVERY = 24 * 60 * 60 * 1000;

function parts(version) {
  return String(version || '')
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

function isNewer(candidate, current) {
  const a = parts(candidate);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

class Updates extends EventEmitter {
  constructor(current, enabled) {
    super();
    this.current = current;
    this.enabled = enabled;
    this.latest = null;
    this.timer = null;
  }

  start() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.check(), FIRST_CHECK);
  }

  async check() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.check(), EVERY);
    if (!this.enabled()) return;
    try {
      const res = await fetch(LATEST, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'UltraGMonitor' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.draft || data.prerelease || !isNewer(data.tag_name, this.current)) return;
      this.latest = { version: String(data.tag_name).replace(/^v/i, ''), url: data.html_url };
      this.emit('update', this.latest);
    } catch {}
  }

  stop() {
    clearTimeout(this.timer);
  }
}

function upgradeWithWinget() {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(
        'winget',
        ['upgrade', '--id', WINGET_ID, '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'],
        { detached: true, windowsHide: true, stdio: 'ignore' },
      );
    } catch {
      resolve(false);
      return;
    }
    child.once('error', () => resolve(false));
    child.once('exit', (code) => resolve(code === 0));
    child.unref();
  });
}

module.exports = { Updates, isNewer, upgradeWithWinget };
