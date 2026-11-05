const path = require('path');
const { createWorker } = require('tesseract.js');
const { prepareImage, prepareContrast } = require('./ocr-image');
const { combineResults, hasUncertainWords, refineWords } = require('./ocr-result');

process.parentPort.once('message', async ({ data }) => {
  let worker;
  try {
    const image = Buffer.from(data);
    const prepared = prepareImage(image);
    let lastProgress = 0;
    let pass = 0;
    worker = await createWorker('por+eng+spa', 1, {
      langPath: path.join(__dirname, 'languages'), cacheMethod: 'none', gzip: true,
      errorHandler: (error) => process.parentPort.postMessage({ type: 'error', reason: String(error).slice(0, 1000) }),
      logger: (event) => {
        const now = Date.now();
        if (now - lastProgress < 100) return;
        lastProgress = now;
        const value = event.status === 'recognizing text' ? prepared ? 0.2 + (pass + event.progress) * 0.4 : 0.2 + event.progress * 0.7 : 0.05;
        process.parentPort.postMessage({ type: 'progress', value });
      },
    });
    await worker.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '0', user_defined_dpi: '150' });
    let primary = (await worker.recognize(image, {}, { text: true, blocks: true })).data;
    if (!prepared && !primary.text.trim()) {
      await worker.setParameters({ tessedit_pageseg_mode: '6' });
      primary = (await worker.recognize(image, {}, { text: true, blocks: true })).data;
    }
    let secondary = null;
    if (prepared) {
      pass = 1;
      secondary = (await worker.recognize(prepared, {}, { text: true, blocks: true })).data;
    }
    if (hasUncertainWords(primary)) {
      const contrast = prepareContrast(image);
      if (contrast) {
        await worker.setParameters({ tessedit_pageseg_mode: '3' });
        const refined = (await worker.recognize(contrast, {}, { text: true, blocks: true })).data;
        primary = refineWords(primary, refined);
      }
    }
    const result = combineResults(primary, secondary);
    await worker.terminate();
    worker = null;
    process.parentPort.postMessage({ type: 'progress', value: 1 });
    process.parentPort.postMessage({ type: 'result', ...result });
  } catch (error) {
    if (worker) await worker.terminate().catch(() => {});
    process.parentPort.postMessage({ type: 'error', reason: String(error && error.message || error).slice(0, 1000) });
  }
});
