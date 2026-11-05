const { PNG } = require('pngjs');

function prepareImage(buffer) {
  const image = PNG.sync.read(buffer);
  let samples = 0;
  let colored = 0;
  let dark = 0;
  let light = 0;
  for (let i = 0; i < image.data.length; i += 64) {
    const [r, g, b] = image.data.subarray(i, i + 3);
    const range = Math.max(r, g, b) - Math.min(r, g, b);
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    samples++;
    if (range > 60) colored++;
    if (gray < 128) dark++;
    if (gray > 160 && range < 65) light++;
  }
  if (colored / samples < 0.08 || dark / samples < 0.15 || light / samples < 0.002 || light / samples > 0.4) return null;
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i];
    const g = image.data[i + 1];
    const b = image.data[i + 2];
    const value = Math.round(0.299 * r + 0.587 * g + 0.114 * b) > 160 && Math.max(r, g, b) - Math.min(r, g, b) < 65 ? 0 : 255;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  return PNG.sync.write(image, { colorType: 2 });
}

function prepareContrast(buffer) {
  const image = PNG.sync.read(buffer);
  if (image.width * image.height > 12000000) return null;
  for (let i = 0; i < image.data.length; i += 4) {
    const value = Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114) < 96 ? 0 : 255;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  return PNG.sync.write(image, { colorType: 2 });
}

module.exports = { prepareImage, prepareContrast };
