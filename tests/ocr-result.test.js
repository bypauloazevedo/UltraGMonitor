const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const { combineResults, hasUncertainWords, refineWords } = require('../src/main/ocr-result');
const { prepareImage, prepareContrast } = require('../src/main/ocr-image');

function word(text, x0, y0, x1, y1, confidence = 95) {
  return { text, confidence, bbox: { x0, y0, x1, y1 } };
}

function line(words) {
  return {
    words, text: words.map((entry) => entry.text).join(' '), confidence: 95,
    bbox: { x0: Math.min(...words.map((entry) => entry.bbox.x0)), y0: Math.min(...words.map((entry) => entry.bbox.y0)), x1: Math.max(...words.map((entry) => entry.bbox.x1)), y1: Math.max(...words.map((entry) => entry.bbox.y1)) },
  };
}

function result(...paragraphs) {
  return { blocks: [{ paragraphs: paragraphs.map((lines) => ({ lines })) }] };
}

test('OCR preserva números, moeda, acentos e operadores em textos comuns', () => {
  const texts = ['Preço: R$ 32,50', 'ação != informação', 'x + y = 3', 'a || b', '{', 'return valor + 2;', '}'];
  const source = result(texts.map((text, index) => line(text.split(' ').map((text, i) => word(text, i * 80, index * 30, i * 80 + 70, index * 30 + 20)))));
  const output = combineResults(source);
  assert.equal(output.text, texts.join('\n'));
  assert.equal(output.lowConfidence, false);
});

test('OCR separa enfeites de palavras usando proporção e posição', () => {
  const source = result([
    line([word('p=', 50, 310, 180, 355, 38), word('===', 210, 310, 240, 320), word('-', 300, 300, 305, 305), word('D¿', 380, 310, 430, 335), word('1', 450, 335, 455, 340)]),
    line([word('é', 65, 375, 76, 391), word('Nome', 120, 345, 214, 390), word('legível', 225, 325, 438, 390, 65)]),
  ], [line([word('Texto', 160, 460, 230, 490), word('correto.', 240, 460, 340, 490)])]);
  const alternate = result([line([word('Texto', 160, 461, 230, 490), word('correto.', 240, 461, 340, 490)])], [line([word('Tipo', 175, 605, 330, 650, 40)])]);
  const output = combineResults(source, alternate);
  assert.equal(output.text, 'Nome legível\n\nTexto correto.\n\nTipo');
  assert.equal(output.lowConfidence, true);
});

test('Duas leituras da mesma área não duplicam o texto', () => {
  const source = result([line([word('Informação', 10, 10, 150, 30, 85)])]);
  const alternate = result([line([word('Informação', 11, 11, 149, 29, 96)])]);
  const output = combineResults(source, alternate);
  assert.equal(output.text, 'Informação');
  assert.equal(output.confidence, 96);
});

test('Leitura alternativa incompleta não substitui uma linha inteira', () => {
  const source = result([line([word('Texto', 10, 10, 60, 30, 90), word('completo', 70, 10, 170, 30, 90)])]);
  const alternate = result([line([word('Texto', 11, 11, 60, 29, 99)])]);
  assert.equal(combineResults(source, alternate).text, 'Texto completo');
});

test('Palavras difíceis continuam disponíveis para revisão', () => {
  const source = result([line([word('Palavra', 10, 10, 150, 30, 25)])]);
  assert.deepEqual(combineResults(source), { text: 'Palavra', confidence: 25, lowConfidence: true });
  assert.deepEqual(combineResults(result([])), { text: '', confidence: 0, lowConfidence: false });
});

test('Tratamento de ilustrações não interfere em uma imagem branca comum', () => {
  const image = new PNG({ width: 100, height: 100 });
  image.data.fill(255);
  assert.equal(prepareImage(PNG.sync.write(image)), null);
});

test('Tratamento realça letras claras e conserva as dimensões da imagem', () => {
  const image = new PNG({ width: 100, height: 100 });
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const index = (y * image.width + x) * 4;
      const light = x >= 40 && x < 60 && y >= 40 && y < 60;
      image.data[index] = light ? 255 : 120;
      image.data[index + 1] = light ? 255 : 60;
      image.data[index + 2] = light ? 255 : 0;
      image.data[index + 3] = 255;
    }
  }
  const output = PNG.sync.read(prepareImage(PNG.sync.write(image)));
  assert.equal(output.width, 100);
  assert.equal(output.height, 100);
  assert.equal(output.data[(50 * 100 + 50) * 4], 0);
  assert.equal(output.data[0], 255);
});

test('Leitura com contraste revisa somente palavras incertas na mesma posição', () => {
  const source = result([line([word('Uogar', 10, 10, 70, 40, 59), word('Antigos.', 80, 10, 180, 40, 96)])]);
  const alternate = result([line([word('Jogar', 11, 11, 69, 39, 95), word('Antigo.', 81, 11, 179, 39, 99)])]);
  assert.equal(hasUncertainWords(source), true);
  const output = refineWords(source, alternate);
  assert.equal(combineResults(output).text, 'Jogar Antigos.');
  assert.equal(hasUncertainWords(output), false);
});

test('Revisão visual não muda números e separadores por uma confiança maior', () => {
  for (const candidate of ['22/15', '2275', '22:75']) {
    const source = result([line([word('22/75', 10, 10, 100, 40, 61)])]);
    const alternate = result([line([word(candidate, 11, 11, 99, 39, 99)])]);
    assert.equal(combineResults(refineWords(source, alternate)).text, '22/75');
  }
});

test('Revisão não usa palavras distantes, incompletas ou com leitura insegura', () => {
  for (const candidate of [word('Jogar', 200, 10, 270, 40, 99), word('Jogar', 11, 11, 69, 39, 70), word('Cartão', 11, 11, 69, 39, 99)]) {
    const source = result([line([word('Uogar', 10, 10, 70, 40, 59)])]);
    assert.equal(combineResults(refineWords(source, result([line([candidate])]))).text, 'Uogar');
  }
});

test('Contraste mantém as dimensões e separa letras escuras do fundo claro', () => {
  const image = new PNG({ width: 2, height: 1 });
  image.data.set([30, 20, 45, 255, 230, 200, 160, 255]);
  const output = PNG.sync.read(prepareContrast(PNG.sync.write(image)));
  assert.equal(output.width, 2);
  assert.equal(output.height, 1);
  assert.equal(output.data[0], 0);
  assert.equal(output.data[4], 255);
});
