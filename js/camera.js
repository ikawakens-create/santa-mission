// カメラ（カギ②のスキャン＝背面 ／ サンタのビデオ電話＝自撮り）
// 使い終わったら必ず track.stop() で止める
let stream = null;

export async function startCamera(videoEl, facing = "environment") {
  stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera api");
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: facing } },
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
