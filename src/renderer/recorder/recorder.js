const MIME_TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

let recorder = null;
let writes = Promise.resolve();
let pending = 0;
let streams = [];
let timer = 0;
let audioContext = null;
let cancelled = false;

async function desktopVideo(cfg) {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: cfg.sourceId,
        minWidth: cfg.width,
        maxWidth: cfg.width,
        minHeight: cfg.height,
        maxHeight: cfg.height,
        maxFrameRate: 30,
      },
    },
  });
}

async function systemAudio() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'desktop' } },
    video: { mandatory: { chromeMediaSource: 'desktop', maxWidth: 16, maxHeight: 16 } },
  });
  stream.getVideoTracks().forEach((t) => t.stop());
  return stream;
}

async function mixAudio(cfg) {
  const inputs = [];
  if (cfg.system) {
    try {
      inputs.push(await systemAudio());
    } catch { window.hud.recorderWarning('O áudio do PC não está sendo gravado'); }
  }
  if (cfg.mic) {
    try {
      inputs.push(await navigator.mediaDevices.getUserMedia({ audio: true, video: false }));
    } catch { window.hud.recorderWarning('O microfone não está sendo gravado'); }
  }
  if (!inputs.length) return null;
  for (const input of inputs) {
    for (const track of input.getAudioTracks()) track.addEventListener('ended', () => {
      if (!cancelled) window.hud.recorderWarning('Uma fonte de áudio foi desconectada');
    });
  }
  streams.push(...inputs);
  audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  for (const input of inputs) audioContext.createMediaStreamSource(input).connect(destination);
  return destination.stream.getAudioTracks()[0];
}

async function start(cfg) {
  cancelled = false;
  writes = Promise.resolve();
  pending = 0;
  const screenStream = await desktopVideo(cfg);
  streams.push(screenStream);
  const video = document.createElement('video');
  video.muted = true;
  video.srcObject = screenStream;
  await video.play();
  const rect = cfg.rect;
  const canvas = document.createElement('canvas');
  canvas.width = rect.w;
  canvas.height = rect.h;
  const ctx = canvas.getContext('2d', { alpha: false });
  const draw = () => {
    if (!recorder || recorder.state !== 'paused') ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  };
  draw();
  timer = setInterval(draw, 1000 / 30);
  const output = canvas.captureStream(30);
  const audio = await mixAudio(cfg);
  if (audio) output.addTrack(audio);
  const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  recorder = new MediaRecorder(output, { mimeType, videoBitsPerSecond: 6000000 });
  streams.push(output);
  await window.hud.recorderOpen(recorder.mimeType || mimeType || 'video/webm');
  recorder.ondataavailable = (e) => {
    if (cancelled || !e.data || !e.data.size) return;
    if (++pending > 4) {
      fail('O disco não conseguiu acompanhar a gravação');
      return;
    }
    writes = writes.then(async () => {
      const data = new Uint8Array(await e.data.arrayBuffer());
      if (!cancelled && !await window.hud.recorderChunk(data)) throw new Error('Não deu pra salvar o vídeo');
    }).finally(() => { pending--; });
    writes.catch((err) => fail(err.message));
  };
  recorder.onerror = (event) => fail(event.error && event.error.message);
  recorder.onstop = async () => {
    clearInterval(timer);
    streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streams = [];
    if (audioContext) audioContext.close();
    if (cancelled) return;
    try {
      await writes;
      if (!cancelled) await window.hud.recorderDone();
    } catch (err) { fail(err.message); }
  };
  recorder.start(1000);
  window.hud.recorderStarted();
}

function fail(message) {
  if (cancelled) return;
  cancelled = true;
  clearInterval(timer);
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
  if (audioContext) audioContext.close();
  window.hud.recorderError(String(message || 'Não deu pra gravar'));
}

window.hud.onRecorderCommand(async (cmd) => {
  try {
    if (cmd.action === 'start') await start(cmd);
    else if (!recorder) return;
    else if (cmd.action === 'pause' && recorder.state === 'recording') recorder.pause();
    else if (cmd.action === 'resume' && recorder.state === 'paused') recorder.resume();
    else if (cmd.action === 'stop' && recorder.state !== 'inactive') recorder.stop();
    else if (cmd.action === 'cancel' && recorder.state !== 'inactive') {
      cancelled = true;
      recorder.stop();
    }
  } catch (err) {
    fail(String((err && err.message) || err));
  }
});
