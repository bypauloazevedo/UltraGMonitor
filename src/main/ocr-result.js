const letters = (text) => (text.match(/[\p{L}\p{N}]/gu) || []).length;
const height = (box) => Math.max(1, box.y1 - box.y0);

function readLines(result, clean, source) {
  const lines = [];
  let removed = false;
  let paragraph = 0;
  for (const block of result.blocks || []) {
    for (const part of block.paragraphs || []) {
      for (const line of part.lines || []) {
        const original = (line.words || []).filter((word) => word.text.trim());
        const raw = String(line.text || '').trim();
        if (!raw) continue;
        if (clean && letters(raw) / raw.replace(/\s/g, '').length < 0.5 && !/^[{}();]{1,3}$/.test(raw)) { removed = true; continue; }
        const anchors = original.filter((word) => letters(word.text) > 1);
        const heights = anchors.map((word) => height(word.bbox)).sort((a, b) => a - b);
        const typical = heights[Math.floor(heights.length / 2)] || 0;
        const words = clean ? original.filter((word, index) => {
          if (/^[|\\~_]+$/.test(word.text) && (index === 0 || index === original.length - 1)) return false;
          if (letters(word.text) !== 1 || !typical || height(word.bbox) >= typical * 0.45 || index !== 0 && index !== original.length - 1) return true;
          const nearest = index === 0 ? original[1] : original[index - 1];
          return !nearest || Math.max(nearest.bbox.x0 - word.bbox.x1, word.bbox.x0 - nearest.bbox.x1) <= typical * 0.35;
        }) : original;
        if (words.length !== original.length) removed = true;
        const text = words.length ? words.map((word) => word.text).join(' ') : original.length ? '' : raw.replace(/[ \t]+/g, ' ');
        if (!text) continue;
        const bbox = words.length ? {
          x0: Math.min(...words.map((word) => word.bbox.x0)), y0: Math.min(...words.map((word) => word.bbox.y0)),
          x1: Math.max(...words.map((word) => word.bbox.x1)), y1: Math.max(...words.map((word) => word.bbox.y1)),
        } : line.bbox;
        const count = words.reduce((sum, word) => sum + word.text.length, 0);
        const confidence = count ? words.reduce((sum, word) => sum + word.confidence * word.text.length, 0) / count : line.confidence;
        lines.push({ text, bbox, confidence, group: `${source}:${paragraph}` });
      }
      paragraph++;
    }
  }
  return { lines, removed };
}

function overlaps(a, b) {
  const width = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const vertical = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  return width / Math.max(1, Math.min(a.x1 - a.x0, b.x1 - b.x0)) > 0.5 && vertical / Math.min(height(a), height(b)) > 0.5;
}

function combineResults(primary, secondary = null) {
  const first = readLines(primary, !!secondary, 0);
  const second = secondary ? readLines(secondary, true, 1) : { lines: [], removed: false };
  const lines = first.lines.slice();
  for (const candidate of second.lines) {
    const index = lines.findIndex((line) => overlaps(line.bbox, candidate.bbox));
    if (index < 0) lines.push(candidate);
    else if (candidate.confidence > lines[index].confidence + 2 && candidate.text.length >= lines[index].text.length * 0.8) lines[index] = candidate;
  }
  if (secondary) lines.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  let text = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const previous = lines[i - 1];
    const separate = previous && (previous.group !== line.group && line.bbox.y0 - previous.bbox.y1 > Math.min(height(previous.bbox), height(line.bbox)) * 0.6);
    text += `${i ? separate ? '\n\n' : '\n' : ''}${line.text}`;
  }
  const count = lines.reduce((sum, line) => sum + line.text.length, 0);
  const confidence = count ? lines.reduce((sum, line) => sum + line.confidence * line.text.length, 0) / count : 0;
  return { text: text.trim(), confidence, lowConfidence: first.removed || second.removed || lines.some((line) => line.confidence < 75) };
}

function allWords(result) {
  return (result.blocks || []).flatMap((block) => (block.paragraphs || []).flatMap((part) => (part.lines || []).flatMap((line) => line.words || [])));
}

function hasUncertainWords(result) {
  return allWords(result).some((word) => word.confidence < 75 && letters(word.text) >= 2 && word.text.length <= 100);
}

function distance(a, b) {
  const first = Array.from(a.normalize('NFC'));
  const second = Array.from(b.normalize('NFC'));
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let i = 1; i <= first.length; i++) {
    const row = [i];
    for (let j = 1; j <= second.length; j++) row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (first[i - 1] === second[j - 1] ? 0 : 1));
    previous = row;
  }
  return previous[second.length];
}

function refineWords(primary, refined) {
  const candidates = allWords(refined).filter((word) => word.confidence >= 85 && word.text.length <= 100);
  for (const block of primary.blocks || []) {
    for (const part of block.paragraphs || []) {
      for (const line of part.lines || []) {
        let changed = false;
        for (const word of line.words || []) {
          if (word.confidence >= 75 || letters(word.text) < 2 || word.text.length > 100) continue;
          const options = candidates.filter((candidate) => candidate.confidence >= word.confidence + 12
            && overlaps(word.bbox, candidate.bbox)
            && candidate.text.length >= word.text.length * 0.7 && candidate.text.length <= word.text.length * 1.3
            && JSON.stringify(word.text.match(/\d+(?:[.,:/-]\d+)*/g)) === JSON.stringify(candidate.text.match(/\d+(?:[.,:/-]\d+)*/g))
            && distance(word.text, candidate.text) <= Math.max(1, Math.floor(word.text.length * 0.3)));
          options.sort((a, b) => b.confidence - a.confidence);
          if (!options.length) continue;
          word.text = options[0].text;
          word.confidence = options[0].confidence;
          changed = true;
        }
        if (changed) line.text = line.words.map((word) => word.text).join(' ');
      }
    }
  }
  return primary;
}

module.exports = { combineResults, hasUncertainWords, refineWords };
