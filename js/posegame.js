// =============================================================
//  posegame.js  まねまねポーズ クリスマスケーキ
//   ・ふめん（config.poseGame.sets）を「いつ なにが おきるか」の リストに へんかん
//   ・リズムの おと（ドラム／ベース／すず／サンタの こえ）を ごうせい
//   ・ケーキの え（かざりが ふえていく）
// =============================================================
import { getCtx } from "./audio.js";

// ---------------- おと ----------------
let noiseBuf = null;
function noise(c) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.5), c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

export function createSynth() {
  const c = getCtx();
  const bus = c.createGain(); bus.gain.value = 0.7; bus.connect(c.destination);
  const env = (g, t, a, peak, d) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  };
  const osc = (type, f, t, dur, vol, glideTo, out = bus) => {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    env(g, t, 0.005, vol, dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  };
  const nz = (t, dur, vol, type, freq, q = 1) => {
    const s = c.createBufferSource(); s.buffer = noise(c);
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); env(g, t, 0.002, vol, dur);
    s.connect(f).connect(g).connect(bus); s.start(t); s.stop(t + dur + 0.05);
  };
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  return {
    kick(t) { osc("sine", 140, t, 0.2, 0.9, 42); },
    clap(t) { nz(t, 0.09, 0.5, "bandpass", 1500, 0.8); nz(t + 0.012, 0.12, 0.4, "bandpass", 1300, 0.8); },
    bell(t, accent) { nz(t, 0.05, accent ? 0.28 : 0.14, "highpass", 7000); },
    bass(t, midi, dur) { osc("triangle", mtof(midi), t, dur, 0.5); osc("sine", mtof(midi - 12), t, dur, 0.35); },
    stab(t, midis) { midis.forEach(m => osc("square", mtof(m), t, 0.12, 0.05)); },
    // メロディ（ジングルベル）
    lead(t, midi, dur) { osc("square", mtof(midi), t, dur, 0.085); osc("sine", mtof(midi + 12), t, Math.min(0.25, dur), 0.05); },
    count(t, hi) { osc("square", hi ? 1568 : 1046.5, t, 0.1, 0.15); },
    // サンタの「ホッ！」（ポーズごとに すこし たかさが かわる）
    ho(t, pitch = 1) {
      const o = c.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(190 * pitch, t); o.frequency.exponentialRampToValueAtTime(140 * pitch, t + 0.2);
      const f1 = c.createBiquadFilter(); f1.type = "bandpass"; f1.frequency.value = 560; f1.Q.value = 5;
      const f2 = c.createBiquadFilter(); f2.type = "bandpass"; f2.frequency.value = 950; f2.Q.value = 7;
      const g = c.createGain(); env(g, t, 0.015, 1.4, 0.2);
      o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(bus);
      o.start(t); o.stop(t + 0.3);
      nz(t, 0.04, 0.15, "highpass", 3000);
    },
    // みんなの ポーズ！（キラーン＋パシャ）
    pose(t) {
      [1568, 1975.5, 2349.3].forEach((f, i) => osc("sine", f, t + i * 0.025, 0.4, 0.16));
      nz(t, 0.06, 0.35, "highpass", 2500);
      osc("triangle", 523.25, t, 0.15, 0.25, 1046.5);
    },
    sneeze(t) { nz(t, 0.35, 0.6, "bandpass", 2200, 0.7); osc("sawtooth", 300, t, 0.25, 0.2, 120); },
    tada(t) {
      [[72, 0], [76, 0.1], [79, 0.2], [84, 0.32]].forEach(([m, d]) => osc("square", mtof(m), t + d, d === 0.32 ? 0.8 : 0.15, 0.1));
      [1046.5, 1318.5, 1568].forEach(f => osc("sine", f, t + 0.32, 1.0, 0.12));
    },
    stop() { const now = c.currentTime; bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(bus.gain.value, now); bus.gain.linearRampToValueAtTime(0, now + 0.05); setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, 300); }
  };
}

// ---------------- ジングルベル（1857年・パブリックドメイン） ----------------
// [MIDIノート, はく]  16小節＝64はく で 1しゅう
const JINGLE = [
  [76,1],[76,1],[76,2], [76,1],[76,1],[76,2], [76,1],[79,1],[72,1.5],[74,0.5], [76,4],
  [77,1],[77,1],[77,1.5],[77,0.5], [77,1],[76,1],[76,1],[76,0.5],[76,0.5], [76,1],[74,1],[74,1],[76,1], [74,2],[79,2],
  [76,1],[76,1],[76,2], [76,1],[76,1],[76,2], [76,1],[79,1],[72,1.5],[74,0.5], [76,4],
  [77,1],[77,1],[77,1],[77,1], [77,1],[76,1],[76,1],[76,0.5],[76,0.5], [79,1],[79,1],[77,1],[74,1], [72,4]
];
// 小節ごとの [ベースの根音, コード]
const HARMONY = [
  [48, [60, 64, 67]], [48, [60, 64, 67]], [48, [60, 64, 67]], [48, [60, 64, 67]],
  [41, [60, 65, 69]], [48, [60, 64, 67]], [50, [60, 62, 66]], [43, [59, 62, 67]],
  [48, [60, 64, 67]], [48, [60, 64, 67]], [48, [60, 64, 67]], [48, [60, 64, 67]],
  [41, [60, 65, 69]], [48, [60, 64, 67]], [43, [59, 62, 67]], [48, [60, 64, 67]]
];
const MELODY_BARS = (() => {
  const bars = Array.from({ length: 16 }, () => []);
  let pos = 0;
  JINGLE.forEach(([n, b]) => { bars[Math.floor(pos / 4)].push([pos % 4, n, b]); pos += b; });
  return bars;
})();

// 1小節ぶんの おと（ドラム・ベース・すず・コード・メロディ）
export function grooveBar(synth, t0, spb, barIndex, intensity) {
  const bi = barIndex % 16;
  const [root, chord] = HARMONY[bi];
  for (let b = 0; b < 4; b++) {
    const t = t0 + b * spb;
    if (b % 2 === 0) synth.kick(t);
    else synth.clap(t);
    synth.bell(t, true);
    synth.bell(t + spb / 2, false);
    synth.bass(t, root + (b === 3 ? 7 : 0), spb * 0.8);
    if (b % 2 === 1 || intensity > 0) synth.stab(t + spb / 2, chord);
  }
  MELODY_BARS[bi].forEach(([p, n, b]) => synth.lead(t0 + p * spb, n, b * spb * 0.85));
}

// ---------------- ふめん → イベント ----------------
// return: { items:[{beat, kind, ...}], beats, rot }
export function compileSet(set, rot, nKids = 5) {
  const items = [];
  let beat = 0;
  // カウントイン（1小節）
  for (let i = 0; i < 4; i++) items.push({ beat: i, kind: "count", n: i });
  beat = 4;
  const next = () => { const id = rot % nKids; rot++; return id; };

  set.phrases.forEach((ph, pi) => {
    const L = 4 * (ph.bars || 1);
    let who;
    if (ph.who === "solo") who = { type: "kids", ids: [next()] };
    else if (ph.who === "pair") who = { type: "kids", ids: [next(), next()] };
    else if (ph.who === "trio") who = { type: "kids", ids: [next(), next(), next()] };
    else if (ph.who === "relay") who = { type: "relay", ids: ph.hits.map(() => next()) };
    else if (ph.who === "fake") who = { type: "fake" };
    else who = { type: "all" };

    const hits = ph.hits.map(([b, pose]) => ({ pos: b - 1, pose }));
    items.push({ beat, kind: "callStart", who, len: L, hits, tame: !!ph.tame, index: pi });
    hits.forEach((h, i) => items.push({ beat: beat + h.pos, kind: "callHit", pose: h.pose, i, who }));
    if (ph.tame) items.push({ beat: beat + hits[0].pos + 0.5, kind: "tame", phase: "call" });

    const r = beat + L;
    items.push({ beat: r, kind: "respStart", who, len: L, hits, tame: !!ph.tame, index: pi });
    if (who.type === "fake") {
      items.push({ beat: r + 1, kind: "fakeResp" });
    } else {
      hits.forEach((h, i) => items.push({ beat: r + h.pos - 1, kind: "preview", pose: h.pose, i }));
      hits.forEach((h, i) => items.push({
        beat: r + h.pos, kind: "respHit", pose: h.pose, i, last: i === hits.length - 1,
        target: who.type === "relay" ? { type: "kids", ids: [who.ids[i]] } : who, who
      }));
      if (ph.tame) items.push({ beat: r + hits[0].pos + 0.5, kind: "tame", phase: "resp" });
    }
    items.push({ beat: r + L - 0.01, kind: "phraseEnd", index: pi, who });
    beat = r + L;
  });
  items.push({ beat, kind: "setEnd" });
  items.sort((a, b) => a.beat - b.beat);
  return { items, beats: beat, rot };
}

// ---------------- ケーキ ----------------
// かざりの いち（ぜんはん 11こ・こうはん 11こ）
const DECOS = [
  // ぜんはん：クリームと いちご
  ["cream", 70, 92], ["cream", 130, 92], ["cream", 100, 88], ["berry", 85, 84], ["berry", 115, 84],
  ["cream", 55, 96], ["cream", 145, 96], ["berry", 62, 90], ["berry", 138, 90], ["berry", 100, 80], ["sprinkle", 100, 120],
  // こうはん：ロウソク・サンタ・ほし など
  ["candle", 74, 70], ["candle", 126, 70], ["plate", 100, 104], ["holly", 50, 118], ["holly", 150, 118],
  ["candle", 100, 64], ["tree", 78, 112], ["tree", 122, 112], ["santa", 100, 62], ["star", 100, 30], ["sparkle", 100, 60]
];

function decoSVG([type, x, y], i) {
  const g = (inner) => `<g class="deco" data-i="${i}" transform="translate(${x} ${y})">${inner}</g>`;
  switch (type) {
    case "cream": return g(`<circle r="9" fill="#fff"/><circle cy="-6" r="6" fill="#fff"/><circle cy="-10" r="3" fill="#fff"/>`);
    case "berry": return g(`<path d="M-7 -2 Q0 14 7 -2 Q0 -6 -7 -2Z" fill="#e63946"/><path d="M-5 -4 L0 -9 L5 -4Z" fill="#2a9d5c"/>`);
    case "sprinkle": return g(`<g fill="#ffc93c"><circle cx="-40" cy="-6" r="2"/><circle cx="-20" cy="4" r="2"/><circle cx="10" cy="-2" r="2"/><circle cx="34" cy="6" r="2"/></g><g fill="#ff8fb1"><circle cx="-30" cy="6" r="2"/><circle cx="0" cy="8" r="2"/><circle cx="22" cy="-4" r="2"/><circle cx="44" cy="-2" r="2"/></g>`);
    case "candle": return g(`<rect x="-4" y="-22" width="8" height="24" rx="2" fill="#4cc9f0"/><rect x="-4" y="-16" width="8" height="4" fill="#fff"/><path class="flame" d="M0 -34 Q6 -26 0 -22 Q-6 -26 0 -34Z" fill="#ffc93c"/>`);
    case "plate": return g(`<rect x="-26" y="-9" width="52" height="18" rx="4" fill="#6b3e1f"/><text x="0" y="4" text-anchor="middle" font-size="8" fill="#fff" font-weight="700">メリークリスマス</text>`);
    case "holly": return g(`<path d="M0 0 Q-10 -10 -18 -2 Q-10 2 0 0Z M0 0 Q10 -10 18 -2 Q10 2 0 0Z" fill="#2a9d5c"/><circle cx="-2" cy="-2" r="3" fill="#e63946"/><circle cx="3" cy="-3" r="3" fill="#e63946"/>`);
    case "tree": return g(`<path d="M0 -18 L10 2 L-10 2Z" fill="#2a9d5c"/><circle cy="-18" r="2.5" fill="#ffc93c"/>`);
    case "santa": return g(`<path d="M-10 4 L10 4 L6 -14 L-6 -14Z" fill="#e63946"/><circle cy="-18" r="7" fill="#f6d2b0"/><path d="M-7 -16 Q0 -6 7 -16Z" fill="#fff"/><path d="M-7 -22 Q0 -34 8 -26 L6 -22Z" fill="#e63946"/><circle cx="8" cy="-26" r="2.5" fill="#fff"/>`);
    case "star": return g(`<polygon points="0,-14 4,-4 14,-4 6,2 9,12 0,6 -9,12 -6,2 -14,-4 -4,-4" fill="#ffc93c" stroke="#c9921a" stroke-width="1.5"/>`);
    case "sparkle": return g(`<g fill="#fff"><path d="M-60 -20 l3 -8 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3Z"/><path d="M56 -30 l2 -6 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2Z"/></g>`);
    default: return "";
  }
}

export const DECO_COUNT = DECOS.length;

export function cakeSVG() {
  return `<svg viewBox="0 0 200 170" class="cake-svg" aria-hidden="true">
    <ellipse cx="100" cy="150" rx="86" ry="14" fill="#dfe7f2"/>
    <ellipse cx="100" cy="146" rx="78" ry="10" fill="#fff"/>
    <rect x="36" y="96" width="128" height="50" rx="10" fill="#f3c98b"/>
    <rect x="36" y="116" width="128" height="8" fill="#fff4f6"/>
    <ellipse class="cake-top" cx="100" cy="96" rx="64" ry="14" fill="#f3c98b"/>
    <ellipse class="cake-cream" cx="100" cy="96" rx="64" ry="14" fill="#fff"/>
    ${DECOS.map(decoSVG).join("")}
  </svg>`;
}
