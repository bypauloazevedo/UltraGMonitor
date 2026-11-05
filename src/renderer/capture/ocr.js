window.CaptureOcr = class {
  constructor({ exportImage, onVisibility }) {
    this.panel = document.getElementById('ocr-panel');
    this.text = document.getElementById('ocr-result');
    this.label = document.getElementById('ocr-label');
    this.status = document.getElementById('ocr-status');
    this.progress = document.getElementById('ocr-progress');
    this.meter = document.getElementById('ocr-meter');
    this.copy = document.getElementById('ocr-copy');
    this.retry = document.getElementById('ocr-retry');
    this.advice = document.getElementById('ocr-advice');
    this.image = document.getElementById('ocr-image');
    this.exportImage = exportImage;
    this.onVisibility = onVisibility;
    this.sequence = 0;
    this.opened = false;
    this.busy = false;
    this.copying = false;
    this.imageUrl = null;
    document.getElementById('ocr-close').addEventListener('click', () => this.close());
    document.getElementById('ocr-back').addEventListener('click', () => this.close());
    this.copy.addEventListener('click', () => this.copyText());
    this.retry.addEventListener('click', () => this.recognize());
    this.text.addEventListener('input', () => { this.copy.disabled = !this.text.value.trim() || this.copying; this.setStatus(''); });
    this.panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); }
      else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); this.copyText(); }
    });
    window.hud.onOcrProgress((value) => { if (this.opened && this.busy) this.meter.value = Math.max(this.meter.value, value); });
  }

  t(text) { return window.HudI18n.t(text); }

  setStatus(text, kind = '') {
    this.status.textContent = this.t(text);
    this.status.dataset.kind = kind;
  }

  async open() {
    if (this.opened) return;
    this.opened = true;
    this.panel.hidden = false;
    this.onVisibility();
    await this.recognize();
  }

  async recognize() {
    const sequence = ++this.sequence;
    this.busy = true;
    this.text.hidden = this.label.hidden = true;
    this.text.value = '';
    this.copy.disabled = true;
    this.retry.hidden = true;
    this.progress.hidden = false;
    this.meter.value = 0;
    this.advice.classList.remove('ocr-low-confidence');
    this.advice.textContent = this.t('Confira antes de copiar. Letras pequenas, imagens borradas e fundos com pouco contraste podem causar erros no reconhecimento.');
    this.setStatus('Reconhecendo texto…');
    document.getElementById('ocr-back').focus();
    try {
      await window.hud.setCaptureKeys(false);
      const png = await this.exportImage();
      if (sequence !== this.sequence || !this.opened) return;
      if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
      this.imageUrl = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
      this.image.src = this.imageUrl;
      const result = await window.hud.recognizeText(png);
      if (sequence !== this.sequence || !this.opened) return;
      this.busy = false;
      this.progress.hidden = true;
      if (result.status === 'done') {
        this.text.hidden = this.label.hidden = false;
        this.text.value = result.text;
        this.copy.disabled = !result.text.trim();
        this.setStatus('Texto reconhecido. Você pode corrigir antes de copiar.');
        if (result.lowConfidence) {
          this.advice.textContent = this.t('Alguns trechos podem estar incorretos. Revise o texto ou selecione uma imagem mais nítida.');
          this.advice.classList.add('ocr-low-confidence');
        }
        this.text.focus();
        this.text.setSelectionRange(0, 0);
      } else if (result.status === 'empty') {
        this.setStatus('Não encontramos texto nessa área. Tente selecionar um trecho maior ou mais legível.', 'warning');
      } else if (result.status === 'missing') {
        this.setStatus('Os arquivos de reconhecimento não estão disponíveis. Reinstale o app e tente de novo.', 'error');
      } else if (result.status === 'invalid') {
        this.setStatus('Essa imagem é grande demais para reconhecer. Selecione uma área menor.', 'warning');
      } else {
        this.setStatus('Não deu pra reconhecer o texto. Tente de novo ou selecione uma área mais legível.', 'error');
        this.retry.hidden = false;
      }
    } catch {
      if (sequence !== this.sequence || !this.opened) return;
      this.busy = false;
      this.progress.hidden = true;
      this.retry.hidden = false;
      this.setStatus('Não deu pra reconhecer o texto. Tente de novo ou selecione uma área mais legível.', 'error');
    }
  }

  async copyText() {
    if (this.busy || this.copying || !this.text.value.trim() || this.text.hidden) return;
    const sequence = this.sequence;
    const selected = this.text.selectionStart !== this.text.selectionEnd;
    const text = selected ? this.text.value.slice(this.text.selectionStart, this.text.selectionEnd) : this.text.value;
    if (!text.trim()) return;
    this.copying = true;
    this.copy.disabled = true;
    try {
      const copied = await window.hud.copyText(text);
      if (sequence === this.sequence && this.opened) this.setStatus(copied ? selected ? 'Texto selecionado copiado' : 'Texto copiado' : 'Não deu pra copiar o texto. Tente novamente.', copied ? 'success' : 'error');
    } catch {
      if (sequence === this.sequence && this.opened) this.setStatus('Não deu pra copiar o texto. Tente novamente.', 'error');
    } finally {
      this.copying = false;
      this.copy.disabled = !this.text.value.trim();
    }
  }

  close(restoreKeys = true) {
    const wasOpen = this.opened;
    this.sequence++;
    this.opened = false;
    this.busy = false;
    this.panel.hidden = true;
    this.text.value = '';
    this.copy.disabled = true;
    this.image.removeAttribute('src');
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
    this.imageUrl = null;
    document.getElementById('ocr-source').open = false;
    if (wasOpen) {
      window.hud.cancelOcr().catch(() => {});
      if (restoreKeys) window.hud.setCaptureKeys(true).catch(() => {});
      this.onVisibility();
      if (restoreKeys) document.querySelector('[data-act="ocr"]')?.focus();
    }
  }
};
