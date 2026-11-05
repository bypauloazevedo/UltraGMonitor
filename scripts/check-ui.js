const { spawnSync } = require('child_process');
const path = require('path');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
for (const file of ['ui.cjs', 'recording.cjs', 'settings-startup.cjs', 'ocr.cjs']) {
  const args = process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : [];
  const result = spawnSync(require('electron'), [...args, path.resolve(__dirname, '../tests', file)], { env, encoding: 'utf8', timeout: 60000, windowsHide: true });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status || 1);
}
