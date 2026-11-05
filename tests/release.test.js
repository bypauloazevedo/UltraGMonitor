const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { releaseNotes } = require('../scripts/release-notes');

test('Notas da publicação incluem somente a versão solicitada', () => {
  const changelog = '# Histórico\n\n## 0.5.0 — 2026-11-05\n\nNovidade atual.\n\n## 0.4.0 — 2026-11-04\n\nNovidade anterior.\n';
  assert.equal(releaseNotes(changelog, 'v0.5.0'), 'Novidade atual.\n');
  assert.equal(releaseNotes(changelog, '0.4.0'), 'Novidade anterior.\n');
  assert.throws(() => releaseNotes(changelog, '0.6.0'), /não está no changelog/);
  assert.throws(() => releaseNotes(changelog, '../0.5.0'), /inválida/);
});

test('Publicação recusa uma versão sem notas', () => {
  assert.throws(() => releaseNotes('## 0.5.0 — 2026-11-05\n\n## 0.4.0 — 2026-11-04\nAnterior.', '0.5.0'), /sem notas/);
});

test('Versão do app, lockfile e changelog estão sincronizados', () => {
  const pkg = require('../package.json');
  const lock = require('../package-lock.json');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  const notes = releaseNotes(fs.readFileSync(path.resolve(__dirname, '../CHANGELOG.md'), 'utf8'), pkg.version);
  assert.match(notes, /Extrair texto/);
  assert.match(notes, /Windows/);
  assert.match(notes, /Linux/);
  assert.match(notes, /Downloads/);
});
