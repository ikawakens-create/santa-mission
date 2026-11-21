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

// =============================================================
//  サンタの声（5ゾーン）プレイヤー
// =============================================================
export const ZONES = [
  { id: "monster", emoji: "🦖", label: "かいじゅう？", rate: 0.5, noise: 0.32 },
  { id: "robot",   emoji: "🤖", label: "ロボット？",   rate: 1.0, noise: 0.18 },
  { id: "santa",   emoji: "🎅", label: "でんぱ バッチリ！", rate: 0.8, noise: 0 },
  { id: "water",   emoji: "🐠", label: "みずの なか？", rate: 0.9, noise: 0.18 },
  { id: "squirrel",emoji: "🐿️", label: "リス？",       rate: 1.75, noise: 0.32 }
];

export function zoneOf(v) { return Math.min(4, Math.floor(v / 20)); }

export class VoicePlayer {
  constructor(buffer, { santaFx = true } = {}) {
    const c = getCtx();
    this.c = c;
    this.buffer = buffer;
    this.santaFx = santaFx;
    this.playing = false;
    this.src = null;
    this.noiseSrc = null;
    this.rate = 1;
    this.oscs = [];

    this.master = c.createGain(); this.master.gain.value = 0;
    this.master.connect(c.destination);
    this.input = c.createGain();

    // --- 5つのエフェクトチェーンを最初に全部つくる ---
    this.chainGains = ZONES.map(() => { const g = c.createGain(); g.gain.value = 0; g.connect(this.master); return g; });

    // 0: かいじゅう（ローパス）
    { const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400;
      const mk = c.createGain(); mk.gain.value = 1.5;
      this.input.connect(lp).connect(mk).connect(this.chainGains[0]); }

    // 1: ロボット（リングモジュレーション＋バンドパス）
    { const carrier = c.createGain(); carrier.gain.value = 0;
      const osc = c.createOscillator(); osc.type = "sine"; osc.frequency.value = 52;
      osc.connect(carrier.gain); osc.start(); this.oscs.push(osc);
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1100; bp.Q.value = 0.9;
      const mk = c.createGain(); mk.gain.value = 2.2;
      this.input.connect(carrier).connect(bp).connect(mk).connect(this.chainGains[1]); }

    // 2: サンタ（正解）… 加工ONなら低音ブースト＋エコー
    { const out = this.chainGains[2];
      const shelf = c.createBiquadFilter(); shelf.type = "lowshelf"; shelf.frequency.value = 250;
      shelf.gain.value = santaFx ? 5 : 0;
      this.input.connect(shelf);
      shelf.connect(out);
      if (santaFx) {
        const dl = c.createDelay(1.0); dl.delayTime.value = 0.2;
        const fb = c.createGain(); fb.gain.value = 0.32;
        const wet = c.createGain(); wet.gain.value = 0.35;
        shelf.connect(dl); dl.connect(fb).connect(dl); dl.connect(wet).connect(out);
      } }

    // 3: みずの なか（つよいローパス＋LFOでゆらす）
    { const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420; lp.Q.value = 7;
      const lfo = c.createOscillator(); lfo.frequency.value = 2.6;
      const depth = c.createGain(); depth.gain.value = 140;
      lfo.connect(depth).connect(lp.frequency); lfo.start(); this.oscs.push(lfo);
      const mk = c.createGain(); mk.gain.value = 1.8;
      this.input.connect(lp).connect(mk).connect(this.chainGains[3]); }

    // 4: リス（ハイパス＋高域ブースト）
    { const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 280;
      const hs = c.createBiquadFilter(); hs.type = "highshelf"; hs.frequency.value = 3000; hs.gain.value = 6;
      this.input.connect(hp).connect(hs).connect(this.chainGains[4]); }

    // ラジオの砂嵐ノイズ
    this.noiseGain = c.createGain(); this.noiseGain.gain.value = 0;
    this.noiseFilter = c.createBiquadFilter(); this.noiseFilter.type = "bandpass";
    this.noiseFilter.frequency.value = 1900; this.noiseFilter.Q.value = 0.6;
    this.noiseFilter.connect(this.noiseGain).connect(this.master);
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      // ときどき「パチッ」と鳴るクラックル入り
      d[i] = (Math.random() * 2 - 1) * 0.6 + (Math.random() < 0.0015 ? (Math.random() * 2 - 1) * 3 : 0);
    }
    this.noiseBuf = nb;

    this.zone = -1;
    this.setPosition(10, true);
  }

  rateFor(zone) {
    if (zone === 2) return this.santaFx ? 0.8 : 1.0;
    return ZONES[zone].rate;
  }

  setPosition(v, immediate = false) {
    const z = zoneOf(v);
    const now = this.c.currentTime;
    const tc = immediate ? 0.001 : 0.06;
    // ゾーンが変わったときだけクロスフェード
    if (z !== this.zone) {
      this.chainGains.forEach((g, i) => g.gain.setTargetAtTime(i === z ? 1 : 0, now, tc));
      this.rate = this.rateFor(z);
      if (this.src) this.src.playbackRate.setTargetAtTime(this.rate, now, tc * 1.5);
      this.zone = z;
    }
    // ノイズは正解ゾーンから はなれるほど つよく
    const dist = Math.max(0, Math.abs(v - 50) - 10); // 0〜40
    const n = z === 2 ? 0 : 0.06 + (dist / 40) * 0.34;
    this.noiseGain.gain.setTargetAtTime(n, now, 0.05);
    return z;
  }

  start(offset = 0) {
    if (!this.buffer) return;
    this.stopSources();
    const c = this.c;
    const s = c.createBufferSource();
    s.buffer = this.buffer; s.loop = true;
    s.playbackRate.value = this.rate;
    s.connect(this.input);
    s.start(0, offset);
    this.src = s;
    const ns = c.createBufferSource(); ns.buffer = this.noiseBuf; ns.loop = true;
    ns.connect(this.noiseFilter); ns.start();
    this.noiseSrc = ns;
    this.master.gain.setTargetAtTime(1, c.currentTime, 0.03);
    this.playing = true;
  }

  stopSources() {
    try { this.src && this.src.stop(); } catch (e) { /* noop */ }
    try { this.noiseSrc && this.noiseSrc.stop(); } catch (e) { /* noop */ }
    this.src = null; this.noiseSrc = null;
  }

  stop() {
    this.master.gain.setTargetAtTime(0, this.c.currentTime, 0.03);
    const s = this.src, n = this.noiseSrc;
    this.src = null; this.noiseSrc = null;
    setTimeout(() => { try { s && s.stop(); } catch (e) {} try { n && n.stop(); } catch (e) {} }, 150);
    this.playing = false;
  }

  dispose() {
    this.stop();
    this.oscs.forEach(o => { try { o.stop(); } catch (e) {} });
    setTimeout(() => { try { this.master.disconnect(); } catch (e) {} }, 300);
  }
}

// 録音した Blob → AudioBuffer
export async function decodeBlob(blob) {
  const c = getCtx();
  const ab = await blob.arrayBuffer();
  return await new Promise((resolve, reject) => {
    const p = c.decodeAudioData(ab, resolve, reject);
    if (p && p.then) p.then(resolve, reject);
  });
}

// 録音がないときの「ホッホッホー！メリークリスマス！」っぽい合成ボイス
let demoBuf = null;
export async function getDemoVoice() {
  if (demoBuf) return demoBuf;
  const sr = 44100, len = 4.2;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const oc = new OAC(1, Math.ceil(sr * len), sr);
  const V = { a: [800, 1250], i: [320, 2300], u: [360, 1300], e: [480, 1900], o: [480, 820] };
  // [母音, 開始, 長さ, 音の高さ]
  const syl = [
    ["o", 0.10, 0.22, 170], ["o", 0.45, 0.22, 160], ["o", 0.80, 0.55, 150],
    ["e", 1.70, 0.18, 190], ["i", 1.90, 0.30, 210], ["u", 2.25, 0.14, 180],
    ["i", 2.42, 0.14, 175], ["u", 2.59, 0.12, 170], ["a", 2.74, 0.20, 160], ["u", 2.98, 0.40, 140]
  ];
  const osc = oc.createOscillator(); osc.type = "sawtooth";
  const vib = oc.createOscillator(); vib.frequency.value = 5.5;
  const vibG = oc.createGain(); vibG.gain.value = 4;
  vib.connect(vibG).connect(osc.frequency);
  const f1 = oc.createBiquadFilter(); f1.type = "bandpass"; f1.Q.value = 6;
  const f2 = oc.createBiquadFilter(); f2.type = "bandpass"; f2.Q.value = 9;
  const g1 = oc.createGain(); g1.gain.value = 1.0;
  const g2 = oc.createGain(); g2.gain.value = 0.55;
  const env = oc.createGain(); env.gain.value = 0;
  osc.connect(f1).connect(g1).connect(env);
  osc.connect(f2).connect(g2).connect(env);
  const out = oc.createGain(); out.gain.value = 2.2;
  env.connect(out).connect(oc.destination);
  syl.forEach(([v, s, d, p]) => {
    osc.frequency.setValueAtTime(p, s);
    osc.frequency.linearRampToValueAtTime(p * 0.9, s + d);
    f1.frequency.setValueAtTime(V[v][0], s);
    f2.frequency.setValueAtTime(V[v][1], s);
    env.gain.setValueAtTime(0, s);
    env.gain.linearRampToValueAtTime(1, s + 0.03);
    env.gain.setValueAtTime(1, s + d - 0.04);
    env.gain.linearRampToValueAtTime(0, s + d);
  });
  osc.start(0); vib.start(0);
  demoBuf = await oc.startRendering();
  return demoBuf;
}

// =============================================================
//  録音（管理画面用）
// =============================================================
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  const mimeType = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.start();
  return {
    stop: () => new Promise(resolve => {
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop()); // マイクを必ず止める
        resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      };
      try { rec.stop(); } catch (e) { stream.getTracks().forEach(t => t.stop()); resolve(null); }
    })
  };
}
