// =============================================================
//  audio.js  効果音の合成 / 5ゾーン声変化 / 録音
//  外部の音声ファイルは使わず、すべて Web Audio API で作る
// =============================================================
let ctx = null;
let sfxBus = null;

export function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.55;
    sfxBus.connect(ctx.destination);
  }
  return ctx;
}

// 最初のタップで呼ぶ（自動再生ポリシーの解除）
export async function unlockAudio() {
  const c = getCtx();
  try { await c.resume(); } catch (e) { /* noop */ }
  // 無音を一瞬鳴らして確実に解除
  const b = c.createBuffer(1, 1, c.sampleRate);
  const s = c.createBufferSource();
  s.buffer = b; s.connect(c.destination); s.start();
  return c.state;
}

// ---------- 小さな部品 ----------
function tone({ freq = 440, start = 0, dur = 0.2, type = "sine", vol = 0.5, glide = null, attack = 0.01, out = null }) {
  const c = getCtx();
  const t0 = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out || sfxBus);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function bell(freq, start = 0, dur = 0.8, vol = 0.35) {
  tone({ freq, start, dur, type: "sine", vol });
  tone({ freq: freq * 2.01, start, dur: dur * 0.6, type: "sine", vol: vol * 0.35 });
  tone({ freq: freq * 3.02, start, dur: dur * 0.3, type: "sine", vol: vol * 0.15 });
}

function noiseBurst({ start = 0, dur = 0.3, vol = 0.3, from = 400, to = 4000 }) {
  const c = getCtx();
  const t0 = c.currentTime + start;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(sfxBus);
  s.start(t0);
}

// ドレミ（ペンタトニック）… キーパッドで1つずつ音がかわる
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];

export const sfx = {
  pop() { tone({ freq: 600, dur: 0.12, glide: 1200, type: "sine", vol: 0.4 }); },
  key(n) {
    const f = PENTA[n % PENTA.length];
    tone({ freq: f, dur: 0.25, type: "triangle", vol: 0.45 });
    tone({ freq: f * 2, dur: 0.12, type: "sine", vol: 0.12 });
  },
  erase() { tone({ freq: 700, dur: 0.15, glide: 300, type: "triangle", vol: 0.35 }); },
  ring() {
    // プルルル…（2回）
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 10; i++) {
        tone({ freq: i % 2 ? 1320 : 1660, start: r * 0.6 + i * 0.04, dur: 0.05, type: "square", vol: 0.12, attack: 0.002 });
      }
    }
  },
  whoosh() { noiseBurst({ dur: 0.35, vol: 0.25, from: 300, to: 5000 }); },
  correct() { // ピンポーン
    bell(1318.5, 0, 0.5, 0.45);
    bell(1046.5, 0.28, 1.0, 0.45);
  },
  wrong() { // ブブー
    tone({ freq: 160, dur: 0.22, type: "square", vol: 0.22 });
    tone({ freq: 150, start: 0.27, dur: 0.4, type: "square", vol: 0.22 });
  },
  unlock() { // カギが あいた！
    tone({ freq: 220, dur: 0.08, type: "square", vol: 0.15 });
    tone({ freq: 330, start: 0.1, dur: 0.08, type: "square", vol: 0.15 });
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => bell(f, 0.25 + i * 0.08, 0.9, 0.3));
    noiseBurst({ start: 0.25, dur: 0.8, vol: 0.08, from: 3000, to: 9000 });
  },
  scanBeep() { tone({ freq: 1800, dur: 0.06, type: "sine", vol: 0.25 }); },
  perfect() { // ピピッ！
    tone({ freq: 2000, dur: 0.07, type: "square", vol: 0.15 });
    tone({ freq: 2000, start: 0.11, dur: 0.07, type: "square", vol: 0.15 });
    [784, 988, 1175].forEach(f => bell(f, 0.3, 1.0, 0.25));
  },
  pikon() { // ピコーン！
    tone({ freq: 880, dur: 0.12, glide: 1760, type: "sine", vol: 0.4 });
    bell(1760, 0.12, 0.9, 0.35);
  },
  twinkle() {
    const f = PENTA[5 + Math.floor(Math.random() * 5)];
    bell(f, 0, 0.5, 0.12);
  },
  freeze() { // ピタッ！（キュッと止まる音）
    tone({ freq: 1400, dur: 0.18, glide: 180, type: "sawtooth", vol: 0.18 });
    bell(1568, 0.18, 0.6, 0.35);
  },
  count() { tone({ freq: 1046.5, dur: 0.12, type: "square", vol: 0.15 }); },
  moved() { // うごいた〜！（ボヨヨーン）
    const c = getCtx();
    const t0 = c.currentTime;
    const o = c.createOscillator(); const g = c.createGain();
    const lfo = c.createOscillator(); const lg = c.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(420, t0); o.frequency.exponentialRampToValueAtTime(90, t0 + 0.9);
    lfo.frequency.value = 9; lg.gain.value = 40; lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.45, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.0);
    o.connect(g).connect(sfxBus); o.start(t0); lfo.start(t0); o.stop(t0 + 1.05); lfo.stop(t0 + 1.05);
    tone({ freq: 150, start: 1.0, dur: 0.35, type: "square", vol: 0.18 });
  },
  safe() { // セーフ！
    [784, 988, 1175, 1568].forEach((f, i) => bell(f, i * 0.07, 0.7, 0.3));
  },
  fanfare() { // パッパッパッ パーーン！
    const notes = [
      [523.25, 0, 0.14], [523.25, 0.16, 0.14], [523.25, 0.32, 0.14],
      [698.46, 0.5, 0.5], [880, 1.05, 0.25], [783.99, 1.32, 0.25], [1046.5, 1.6, 1.4]
    ];
    const c = getCtx();
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
    lp.connect(sfxBus);
    notes.forEach(([f, s, d]) => {
      tone({ freq: f, start: s, dur: d, type: "sawtooth", vol: 0.22, attack: 0.02, out: lp });
      tone({ freq: f / 2, start: s, dur: d, type: "square", vol: 0.08, attack: 0.02, out: lp });
    });
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(f, 1.6 + i * 0.07, 1.2, 0.18));
  }
};

