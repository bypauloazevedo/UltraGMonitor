const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function replace(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  let handle;
  try {
    handle = fs.openSync(temporary, 'wx');
    fs.writeFileSync(handle, text, 'utf8');
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = undefined;
    fs.renameSync(temporary, file);
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function read(file) {
  const parse = (name) => {
    const value = JSON.parse(fs.readFileSync(name, 'utf8').replace(/^\uFEFF/, ''));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuração inválida');
    return value;
  };
  try { return { value: parse(file), recovered: false }; }
  catch {
    try { return { value: parse(`${file}.bak`), recovered: true }; }
    catch { return { value: {}, recovered: fs.existsSync(file), fresh: !fs.existsSync(file) }; }
  }
}

function write(file, value) {
  const text = JSON.stringify(value, null, 2);
  try {
    const old = fs.readFileSync(file, 'utf8');
    const previous = JSON.parse(old.replace(/^\uFEFF/, ''));
    if (!previous || typeof previous !== 'object' || Array.isArray(previous)) throw new SyntaxError('Configuração inválida');
    replace(`${file}.bak`, old);
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  replace(file, text);
}

module.exports = { read, write };
