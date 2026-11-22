// =============================================================
//  santa-rig.js  ひじ・ひざの関節がある オリジナルのサンタ（SVG）
//  pose("disco") のように よぶと、ピョコッと はずんで ポーズを きめる
// =============================================================

// 角度は「時計まわりが +」。うで・あしは まっすぐ下が 0 度。
// L = 画面の左がわ（サンタの右手） / R = 画面の右がわ
export const POSES = {
  idle:       { y: 0,   lean: 0,   head: 0,   uaL: 18,  faL: -10, uaR: -18, faR: 10,  thL: 6,   shL: 0,    thR: -6,  shR: 0,   face: "smile" },
  // がにまた ばんざい
  banzai:     { y: 16,  lean: 0,   head: 0,   uaL: 140, faL: -28, uaR: -140, faR: 28,  thL: 58,  shL: -58,  thR: -58, shR: 58,  face: "open" },
  // あたまの うえで パチパチ（つまさきだち）
  pachi:      { y: -8,  lean: 0,   head: 0,   uaL: 160, faL: 42,  uaR: -160, faR: -42, thL: 4,   shL: 0,    thR: -4,  shR: 0,   face: "laugh" },
  // ディスコ（みぎうえを ゆびさす）
  disco:      { y: 0,   lean: -10, head: -12, uaL: 35,  faL: -115, uaR: -140, faR: -5, thL: 14,  shL: 0,    thR: -32, shR: 28,  face: "wink" },
  // フラミンゴ（かたあしだち）
  flamingo:   { y: -6,  lean: 4,   head: 8,   uaL: 100, faL: -10, uaR: -100, faR: 10,  thL: 2,   shL: 0,    thR: -95, shR: 110, face: "open" },
  // ホッホッホー（こしに て）
  hohoho:     { y: 0,   lean: 0,   head: -6,  uaL: 48,  faL: -120, uaR: -48, faR: 120, thL: 16,  shL: 0,    thR: -16, shR: 0,   face: "laugh" },
  // ケンケン（かたあしジャンプで てを ふる）
  kenken:     { y: -26, lean: 8,   head: 10,  uaL: 150, faL: -30, uaR: -40,  faR: -40, thL: 4,   shL: 10,   thR: -70, shR: 100, face: "open" },
  // ロボット
  robot:      { y: 0,   lean: 0,   head: 0,   uaL: 90,  faL: 90,  uaR: -90,  faR: 90,  thL: 10,  shL: 0,    thR: -10, shR: 0,   face: "robot" },
  // ゆきだるま（ちいさく しゃがむ）
  yukidaruma: { y: 44,  lean: 0,   head: 0,   uaL: 60,  faL: -110, uaR: -60, faR: 110, thL: 80,  shL: -150, thR: -80, shR: 150, face: "squint" },
  // ほし（だいのじ ジャンプ）
  hoshi:      { y: -34, lean: 0,   head: 0,   uaL: 128, faL: 0,   uaR: -128, faR: 0,   thL: 34,  shL: 0,    thR: -34, shR: 0,   face: "open" },
  // トナカイの つの
  tonakai:    { y: 0,   lean: 0,   head: 0,   uaL: 150, faL: 75,  uaR: -150, faR: -75, thL: 10,  shL: 0,    thR: -10, shR: 0,   face: "smile", antlers: true },
  // ハ…ハ…（くしゃみの まえ）
  haa:        { y: -6,  lean: 0,   head: -14, uaL: 24,  faL: -20, uaR: -24, faR: 20,   thL: 6,   shL: 0,    thR: -6,  shR: 0,   face: "haa" },
  // ハックション！
  sneeze:     { y: 10,  lean: 0,   head: 16,  uaL: 60,  faL: -100, uaR: -60, faR: 100, thL: 16,  shL: -10,  thR: -16, shR: 10,  face: "sneeze" }
};

export const POSE_NAMES = {
  banzai: "がにまた ばんざい！", disco: "ディスコ！", flamingo: "フラミンゴ！", hohoho: "ホッホッホー！",
  kenken: "ケンケン！", robot: "ロボット！", pachi: "パチパチ！", yukidaruma: "ゆきだるま…",
  hoshi: "ほし！", tonakai: "トナカイ！", haa: "ハ…", sneeze: "ハックション！", idle: ""
};

const NUM_KEYS = ["y", "lean", "head", "uaL", "faL", "uaR", "faR", "thL", "shL", "thR", "shR"];

const SKIN = "#f6d2b0", RED = "#e63946", RED_D = "#b81f2c", WHITE = "#ffffff", BLACK = "#2b2b2b", GOLD = "#ffc93c";

function leg(id, bootDir) {
  return `
  <g id="${id}">
    <line x1="0" y1="0" x2="0" y2="40" stroke="${RED_D}" stroke-width="22" stroke-linecap="round"/>
    <g id="${id}Shin" transform="translate(0 40)">
      <line x1="0" y1="0" x2="0" y2="34" stroke="${RED_D}" stroke-width="20" stroke-linecap="round"/>
      <rect x="-13" y="26" width="26" height="9" rx="4.5" fill="${WHITE}"/>
      <rect x="${bootDir > 0 ? -12 : -22}" y="34" width="34" height="16" rx="8" fill="${BLACK}"/>
    </g>
  </g>`;
}

function arm(id) {
  return `
  <g id="${id}">
    <line x1="0" y1="0" x2="0" y2="30" stroke="${RED}" stroke-width="20" stroke-linecap="round"/>
    <g id="${id}Fore" transform="translate(0 30)">
      <line x1="0" y1="0" x2="0" y2="26" stroke="${RED}" stroke-width="18" stroke-linecap="round"/>
      <circle cx="0" cy="26" r="11" fill="${WHITE}"/>
      <circle cx="0" cy="34" r="12" fill="${WHITE}" stroke="#e5e5e5" stroke-width="2"/>
    </g>
  </g>`;
}

const SVG = `
<svg viewBox="0 -40 240 340" class="santa-rig" aria-hidden="true">
  <ellipse id="rigShadow" cx="120" cy="292" rx="62" ry="10" fill="rgba(0,0,0,.28)"/>
  <g id="rigRoot">
    ${leg("legL", -1)}
    ${leg("legR", 1)}
    <g id="rigTorso">
      <ellipse cx="0" cy="-40" rx="48" ry="52" fill="${RED}"/>
      <ellipse cx="0" cy="8" rx="44" ry="9" fill="${WHITE}"/>
      <rect x="-6" y="-88" width="12" height="90" rx="6" fill="${WHITE}"/>
      <rect x="-48" y="-30" width="96" height="13" fill="${BLACK}"/>
      <rect x="-11" y="-33" width="22" height="19" rx="4" fill="none" stroke="${GOLD}" stroke-width="5"/>
      <g id="rigHead" transform="translate(0 -112)">
        <g id="antlers" style="display:none">
          <path d="M-18 -26 L-30 -62 M-25 -46 L-44 -54 M-28 -56 L-22 -72 M18 -26 L30 -62 M25 -46 L44 -54 M28 -56 L22 -72"
                stroke="#8b5a2b" stroke-width="7" stroke-linecap="round" fill="none"/>
        </g>
        <circle cx="0" cy="0" r="32" fill="${SKIN}"/>
        <circle cx="-19" cy="8" r="7" fill="#ffb3b3" opacity=".8"/>
        <circle cx="19" cy="8" r="7" fill="#ffb3b3" opacity=".8"/>
        <g id="eyesOpen"><ellipse cx="-11" cy="-4" rx="4" ry="5.5" fill="${BLACK}"/><ellipse cx="11" cy="-4" rx="4" ry="5.5" fill="${BLACK}"/>
          <circle cx="-9.5" cy="-6" r="1.5" fill="#fff"/><circle cx="12.5" cy="-6" r="1.5" fill="#fff"/></g>
        <g id="eyesHappy" style="display:none"><path d="M-16 -3 Q-11 -10 -6 -3 M6 -3 Q11 -10 16 -3" stroke="${BLACK}" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>
        <g id="eyesWink" style="display:none"><path d="M-16 -4 Q-11 -9 -6 -4" stroke="${BLACK}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
          <ellipse cx="11" cy="-4" rx="4" ry="5.5" fill="${BLACK}"/><circle cx="12.5" cy="-6" r="1.5" fill="#fff"/></g>
        <g id="eyesSquint" style="display:none"><path d="M-16 -6 L-7 -3 L-16 0 M16 -6 L7 -3 L16 0" stroke="${BLACK}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
        <g id="eyesRobot" style="display:none"><rect x="-16" y="-8" width="10" height="8" fill="${BLACK}"/><rect x="6" y="-8" width="10" height="8" fill="${BLACK}"/></g>
        <path d="M-30 6 Q-30 46 0 52 Q30 46 30 6 Q16 16 0 14 Q-16 16 -30 6Z" fill="${WHITE}"/>
        <path d="M-14 12 Q-6 6 0 11 Q6 6 14 12 Q8 18 0 14 Q-8 18 -14 12Z" fill="#f2f2f2" stroke="#e0e0e0" stroke-width="1"/>
        <circle cx="0" cy="6" r="6" fill="#ff8a8a"/>
        <g id="mouthSmile"><path d="M-7 22 Q0 28 7 22" stroke="${BLACK}" stroke-width="3" fill="none" stroke-linecap="round"/></g>
        <g id="mouthOpen" style="display:none"><ellipse cx="0" cy="24" rx="7" ry="8" fill="#7a1f2b"/><ellipse cx="0" cy="28" rx="4" ry="3" fill="#ff7a8a"/></g>
        <g id="mouthLaugh" style="display:none"><path d="M-10 19 Q0 36 10 19 Z" fill="#7a1f2b"/></g>
        <g id="mouthRobot" style="display:none"><rect x="-8" y="21" width="16" height="4" fill="${BLACK}"/></g>
        <g id="mouthHaa" style="display:none"><ellipse cx="0" cy="24" rx="4" ry="5" fill="#7a1f2b"/></g>
        <path d="M-34 -10 Q-32 -56 6 -58 Q36 -56 46 -30 L30 -14 Z" fill="${RED}"/>
        <rect x="-36" y="-18" width="72" height="14" rx="7" fill="${WHITE}"/>
        <circle cx="46" cy="-30" r="10" fill="${WHITE}"/>
      </g>
      <g id="armL" transform="translate(-42 -74)">${arm("armLin")}</g>
      <g id="armR" transform="translate(42 -74)">${arm("armRin")}</g>
    </g>
  </g>
  <g id="sneezeFx" style="display:none" transform="translate(150 70)">
    <circle cx="0" cy="0" r="14" fill="#dff3ff"/><circle cx="20" cy="-8" r="10" fill="#dff3ff"/><circle cx="34" cy="4" r="8" fill="#dff3ff"/>
  </g>
</svg>`;

const easeOutBack = t => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export class SantaRig {
  constructor(container) {
    container.innerHTML = SVG;
    this.svg = container.querySelector("svg");
    const q = id => this.svg.querySelector("#" + id);
    this.el = {
      root: q("rigRoot"), head: q("rigHead"), shadow: q("rigShadow"),
      legL: q("legL"), legLShin: q("legLShin"), legR: q("legR"), legRShin: q("legRShin"),
      armL: q("armLin"), armLFore: q("armLinFore"), armR: q("armRin"), armRFore: q("armRinFore"),
      antlers: q("antlers"), sneezeFx: q("sneezeFx")
    };
    this.faces = {
      eyes: { open: q("eyesOpen"), happy: q("eyesHappy"), wink: q("eyesWink"), squint: q("eyesSquint"), robot: q("eyesRobot") },
      mouth: { smile: q("mouthSmile"), open: q("mouthOpen"), laugh: q("mouthLaugh"), robot: q("mouthRobot"), haa: q("mouthHaa") }
    };
    this.cur = { ...POSES.idle };
    this.from = { ...POSES.idle };
    this.to = { ...POSES.idle };
    this.t0 = 0; this.dur = 1;
    this.bobT = -1;
    this.alive = true;
    this.setFace("smile");
    this.render(this.cur, 0);
    const loop = now => {
      if (!this.alive) return;
      const k = Math.min(1, (now - this.t0) / this.dur);
      const e = easeOutBack(k);
      NUM_KEYS.forEach(key => { this.cur[key] = this.from[key] + (this.to[key] - this.from[key]) * e; });
      // ビートに あわせた ちいさな はずみ
      let bob = 0;
      if (this.bobT >= 0) {
        const b = (now - this.bobT) / 220;
        if (b < 1) bob = Math.sin(b * Math.PI) * 7; else this.bobT = -1;
      }
      this.render(this.cur, bob);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  pose(name, ms = 150) {
    const p = POSES[name] || POSES.idle;
    this.from = { ...this.cur };
    this.to = { ...POSES.idle, ...p };
    this.t0 = performance.now();
    this.dur = ms;
    this.setFace(p.face || "smile");
    this.el.antlers.style.display = p.antlers ? "" : "none";
    this.el.sneezeFx.style.display = name === "sneeze" ? "" : "none";
    this.name = name;
  }

  bob() { if (this.name === "idle" || !this.name) this.bobT = performance.now(); }

  setFace(face) {
    const map = {
      smile: ["happy", "smile"], open: ["open", "open"], wink: ["wink", "smile"], laugh: ["happy", "laugh"],
      robot: ["robot", "robot"], squint: ["squint", "smile"], haa: ["open", "haa"], sneeze: ["squint", "open"]
    }[face] || ["happy", "smile"];
    Object.entries(this.faces.eyes).forEach(([k, el]) => { el.style.display = k === map[0] ? "" : "none"; });
    Object.entries(this.faces.mouth).forEach(([k, el]) => { el.style.display = k === map[1] ? "" : "none"; });
  }

  render(p, bob) {
    const r = (v) => v.toFixed(1);
    this.el.root.setAttribute("transform", `translate(120 ${r(190 + p.y - bob)}) rotate(${r(p.lean)})`);
    this.el.head.setAttribute("transform", `translate(0 -112) rotate(${r(p.head)})`);
    this.el.legL.setAttribute("transform", `translate(-18 0) rotate(${r(p.thL)})`);
    this.el.legLShin.setAttribute("transform", `translate(0 40) rotate(${r(p.shL)})`);
    this.el.legR.setAttribute("transform", `translate(18 0) rotate(${r(p.thR)})`);
    this.el.legRShin.setAttribute("transform", `translate(0 40) rotate(${r(p.shR)})`);
    this.el.armL.setAttribute("transform", `rotate(${r(p.uaL)})`);
    this.el.armLFore.setAttribute("transform", `translate(0 30) rotate(${r(p.faL)})`);
    this.el.armR.setAttribute("transform", `rotate(${r(p.uaR)})`);
    this.el.armRFore.setAttribute("transform", `translate(0 30) rotate(${r(p.faR)})`);
    // ジャンプすると かげが ちいさく なる
    const s = Math.max(0.5, 1 + Math.min(0, p.y) / 60);
    this.el.shadow.setAttribute("rx", r(62 * s));
  }

  destroy() { this.alive = false; }
}
