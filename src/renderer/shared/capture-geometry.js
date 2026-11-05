(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.HudCaptureGeometry = api;
})(function () {
  function region(selection, width, height, cssWidth, video = false) {
    if (![selection && selection.x, selection && selection.y, selection && selection.w, selection && selection.h, width, height, cssWidth].every(Number.isFinite)) return null;
    if (selection.w < 2 || selection.h < 2 || width < 2 || height < 2 || cssWidth <= 0) return null;
    const x = Math.max(0, Math.min(Math.round(selection.x), Math.floor(width) - 2));
    const y = Math.max(0, Math.min(Math.round(selection.y), Math.floor(height) - 2));
    const size = (value) => video ? Math.floor(value / 2) * 2 : Math.floor(value);
    const w = size(Math.min(selection.w, width - x));
    const h = size(Math.min(selection.h, height - y));
    if (w < 2 || h < 2) return null;
    const ratio = width / cssWidth;
    return { rect: { x, y, w, h }, css: { x: x / ratio, y: y / ratio, width: w / ratio, height: h / ratio } };
  }
  return { region };
});
