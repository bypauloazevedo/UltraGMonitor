const MIME_TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

let recorder = null;
let chunks = [];
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
    } catch {}
  }
  if (cfg.mic) {
    try {
      inputs.push(await navigator.mediaDevices.getUserMedia({ audio: true, video: false }));
    } catch {}
  }
  if (!inputs.length) return null;
  streams.push(...inputs);
  audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  for (const input of inputs) audioContext.createMediaStreamSource(input).connect(destination);
  return destination.stream.getAudioTracks()[0];
}

async function start(cfg) {
  cancelled = false;
  chunks = [];
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
  const draw = () => ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  draw();
  timer = setInterval(draw, 1000 / 30);
  const output = canvas.captureStream(30);
  const audio = await mixAudio(cfg);
  if (audio) output.addTrack(audio);
  const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  recorder = new MediaRecorder(output, { mimeType, videoBitsPerSecond: 6000000 });
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  recorder.onstop = async () => {
    clearInterval(timer);
    streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streams = [];
    if (audioContext) audioContext.close();
    if (cancelled) return;
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
    const data = new Uint8Array(await blob.arrayBuffer());
    window.hud.recorderDone(data, recorder.mimeType || mimeType || 'video/webm');
  };
  recorder.start(1000);
  window.hud.recorderStarted();
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
    window.hud.recorderError(String((err && err.message) || err));
  }
});
