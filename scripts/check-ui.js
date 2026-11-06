const { spawnSync } = require('child_process');
const path = require('path');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const inCi = process.env.CI === 'true';
const visible = inCi || process.argv.includes('--com-janelas');
const files = ['ui.cjs', 'recording.cjs', 'ocr.cjs', 'compact.cjs', 'capture-multimonitor.cjs', 'preview-stability.cjs'];
if (visible) files.push('settings-startup.cjs', 'capture-lifecycle.cjs');
for (const file of files) {
  const args = process.platform === 'linux' && inCi ? ['--no-sandbox'] : [];
  const result = spawnSync(require('electron'), [...args, path.resolve(__dirname, '../tests', file), ...(visible ? ['--com-janelas'] : [])], { env, encoding: 'utf8', timeout: 60000, windowsHide: true });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!visible) console.log('Testes que abrem janelas foram pulados. Use --com-janelas para habilitar.');
