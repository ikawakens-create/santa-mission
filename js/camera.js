// カギ② スキャン用カメラ（必ず track.stop() で止める）
let stream = null;

export async function startCamera(videoEl) {
  stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera api");
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false
  });
  videoEl.srcObject = stream;
  videoEl.setAttribute("playsinline", "");
  videoEl.muted = true;
  await videoEl.play().catch(() => {});
  return true;
}

export function stopCamera(videoEl) {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  if (videoEl) videoEl.srcObject = null;
}
