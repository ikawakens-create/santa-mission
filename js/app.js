// =============================================================
//  app.js  画面遷移・状態管理・演出
// =============================================================
import { CONFIG } from "../config.js";
import * as store from "./storage.js";
import { sfx, unlockAudio, getCtx, VoicePlayer, ZONES, zoneOf, decodeBlob, getDemoVoice } from "./audio.js";
import { startCamera, stopCamera } from "./camera.js";
import { initAdmin } from "./admin.js";

const $ = (s, el = document) => el.querySelector(s);
const stageEl = $("#stage");
const overlayEl = $("#overlay");
const fxLayer = $("#fx-layer");

const KID_COLORS = ["red", "green", "gold", "blue", "pink"];

// ---------- 状態 ----------
const state = {
  stage: clampStage(store.load("stage", 0)),
  misses: store.load("misses", 0),
  started: false
};
let current = { cleanup: null, skip: null };

function clampStage(n) { n = Number(n) || 0; return Math.max(0, Math.min(6, n)); }

// ---------- 小さな道具 ----------
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const nl2br = s => esc(s).replace(/\n/g, "<br>");
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function getNames() {
  const saved = store.load("names", []);
  return CONFIG.key1.hints.map((h, i) => (saved[i] && saved[i].trim()) || h.defaultName);
}

function keysUnlocked(stage) { return stage >= 6 ? 3 : stage >= 4 ? 2 : stage >= 3 ? 1 : 0; }

function updateHud(count = keysUnlocked(state.stage)) {
  const keys = $("#keys");
  keys.classList.toggle("hidden", state.stage === 0);
  keys.querySelectorAll(".keyslot").forEach((el, i) => {
    const open = i < count;
    if (open && !el.classList.contains("open")) {
      el.classList.add("open", "just");
      setTimeout(() => el.classList.remove("just"), 900);
    }
    if (!open) el.classList.remove("open");
    el.textContent = open ? "🔑" : "🔒";
  });
}

function shake(el, cls = "shake") {
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 700);
}

function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* noop */ } }

// ---------- 画面遷移 ----------
function goTo(n) {
  if (current.cleanup) { try { current.cleanup(); } catch (e) { console.warn(e); } }
  current = { cleanup: null, skip: null };
  overlayEl.innerHTML = "";
  overlayEl.className = "";
  state.stage = clampStage(n);
  store.save("stage", state.stage);
  updateHud();
  stageEl.innerHTML = "";
  stageEl.scrollTop = 0;
  const screen = SCREENS[state.stage];
  const res = screen(stageEl) || {};
  current.cleanup = res.cleanup || null;
  current.skip = res.skip || null;
}

function skipCurrent() {
  if (current.skip) current.skip();
}

// カギがあく演出 → つぎの画面へ
function showUnlock(n, next) {
  overlayEl.className = "show";
  overlayEl.innerHTML = `
    <div class="unlock-card">
      <div class="unlock-lock">🔒</div>
      <div class="unlock-text hidden">${n}つめの カギが<br><b>あいた！</b></div>
      <div class="unlock-count hidden">カギ ${n} / 3</div>
      <button class="btn btn-gold hidden" id="unlockNext">${n < 3 ? "つぎへ すすむ！" : "さいごの ページへ！"}</button>
    </div>`;
  const lock = $(".unlock-lock", overlayEl);
  sfx.pop();
  lock.classList.add("wiggle");
  setTimeout(() => {
    lock.classList.remove("wiggle");
    lock.textContent = "🔓";
    lock.classList.add("burst");
    sfx.unlock();
    vibrate([60, 40, 120]);
    confetti.burst(window.innerWidth / 2, window.innerHeight * 0.35, 90);
    $(".unlock-text", overlayEl).classList.remove("hidden");
    $(".unlock-count", overlayEl).classList.remove("hidden");
    updateHud(n);
  }, 900);
  setTimeout(() => {
    const b = $("#unlockNext", overlayEl);
    if (!b) return;
    b.classList.remove("hidden");
    b.onclick = () => { sfx.pop(); goTo(next); };
  }, 2000);
}

// =============================================================
//  画面0  スタート待機
// =============================================================
function screen0(el) {
  el.innerHTML = `
    <section class="screen s0">
      <div class="s0-title">
        <div class="s0-sub">サンタからの</div>
        <div class="s0-main">きんきゅう<br>ミッション</div>
      </div>
      <button class="touch-me" id="touchMe">
        <span class="touch-emoji">📩</span>
        <span class="touch-label">スマホを<br>タッチしてね！</span>
      </button>
      <div class="s0-deco">🎁 ⭐ 🎅 ⭐ 🎁</div>
    </section>`;
  const btn = $("#touchMe", el);
  let done = false;
  btn.addEventListener("click", async () => {
    if (done) return; done = true;
    await startSession();
    goTo(1);
  });
  return { skip: () => btn.click() };
}

async function startSession() {
  state.started = true;
  await unlockAudio();
  requestWakeLock();
}

// =============================================================
//  画面1  きんきゅうメール着信 ＆ オープニング
// =============================================================
function screen1(el) {
  el.innerHTML = `
    <section class="screen s1">
      <div class="ringing" id="ringing">
        <div class="phone-ring">📱</div>
        <div class="ring-waves"><span></span><span></span><span></span></div>
        <div class="popup pop-in">
          <div class="popup-icon">✉️</div>
          <div class="popup-title">${nl2br(CONFIG.opening.title)}</div>
          <button class="btn btn-red btn-pulse" id="openMail">メールを ひらく</button>
        </div>
      </div>
      <div class="letter hidden" id="letter">
        <div class="letter-santa">🎅</div>
        <div class="letter-paper">
          <div class="letter-from">サンタより</div>
          <div class="letter-body" id="letterBody"></div>
          <div class="letter-locks hidden" id="letterLocks"><span>🔒</span><span>🔒</span><span>🔒</span></div>
        </div>
        <div class="tap-note" id="tapNote">タッチすると はやく よめるよ</div>
        <button class="btn btn-green btn-pulse hidden" id="startMission">ミッション スタート！</button>
      </div>
    </section>`;

  // 着信演出（ひらくまで くりかえす）
  let ringCount = 0;
  const ring = () => {
    sfx.ring();
    vibrate([200, 100, 200]);
    shake(document.body, "screen-shake");
    if (++ringCount > 12) clearInterval(ringTimer);
  };
  ring();
  const ringTimer = setInterval(ring, 1800);

  let typingTimer = null;
  let typedAll = false;
  const finishTyping = () => {
    if (typedAll) return;
    typedAll = true;
    clearInterval(typingTimer);
    $("#letterBody", el).innerHTML = nl2br(CONFIG.opening.message);
    $("#tapNote", el).classList.add("hidden");
    $("#letterLocks", el).classList.remove("hidden");
    setTimeout(() => $("#startMission", el)?.classList.remove("hidden"), 500);
  };

  const openMail = () => {
    clearInterval(ringTimer);
    sfx.whoosh();
    $("#ringing", el).classList.add("hidden");
    $("#letter", el).classList.remove("hidden");
    // 1もじずつ でてくる
    const text = CONFIG.opening.message;
    const body = $("#letterBody", el);
    let i = 0;
    typingTimer = setInterval(() => {
      i++;
      body.innerHTML = nl2br(text.slice(0, i));
      if (i % 3 === 0 && text[i - 1] !== " " && text[i - 1] !== "\n") {
        // ぴこぴこ しゃべる音
        sfx.key(Math.floor(Math.random() * 4));
      }
      if (i >= text.length) finishTyping();
    }, 75);
  };

  $("#openMail", el).addEventListener("click", openMail);
  $("#letter", el).addEventListener("click", e => { if (e.target.id !== "startMission") finishTyping(); });
  $("#startMission", el).addEventListener("click", () => { sfx.correct(); goTo(2); });

  return {
    cleanup: () => { clearInterval(ringTimer); clearInterval(typingTimer); },
    skip: () => goTo(2)
  };
}

// =============================================================
//  画面2  カギ①  5けたの パスコード
// =============================================================
function screen2(el) {
  const names = getNames();
  const hints = CONFIG.key1.hints;
  const code = String(CONFIG.key1.passcode);
  el.innerHTML = `
    <section class="screen s2">
      <div class="mission-head"><span class="mh-num">1</span><span>1つめの カギ</span></div>
      <p class="lead">5にんの「すうじ」を さがして、<br>じぶんの ばんで いれてね！</p>
      <div class="hints">
        ${hints.map((h, i) => `
          <div class="hint c-${KID_COLORS[i]}">
            <span class="hint-no">${i + 1}</span>
            <span class="hint-text">${esc(h.text).replace(/\{name\}/g, `<b>${esc(names[i])}</b>`)}</span>
          </div>`).join("")}
      </div>
      <div class="extra-hint ${state.misses >= 3 ? "" : "hidden"}" id="extraHint">
        <div class="eh-title">🎅 サンタからの ついかヒント！</div>
        <div>${nl2br(CONFIG.key1.extraHintAfter3Misses)}</div>
      </div>
      <div class="code-boxes" id="boxes">
        ${hints.map((h, i) => `
          <div class="cbox c-${KID_COLORS[i]}" data-i="${i}">
            <div class="cname">${esc(names[i])}</div>
            <div class="cdigit"></div>
          </div>`).join("")}
      </div>
      <div class="turn" id="turn"></div>
      <div class="keypad" id="keypad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="kp kp-n" data-n="${n}">${n}</button>`).join("")}
        <button class="kp kp-del" data-act="del">けす</button>
        <button class="kp kp-n" data-n="0">0</button>
        <button class="kp kp-ok" data-act="ok">けってい</button>
      </div>
      <div class="toast hidden" id="toast"></div>
    </section>`;

  const entered = [];
  let locked = false;
  let scrolledToPad = false;
  const boxes = [...el.querySelectorAll(".cbox")];
  const turnEl = $("#turn", el);
  const okBtn = el.querySelector('[data-act="ok"]');

  const refresh = () => {
    boxes.forEach((b, i) => {
      b.querySelector(".cdigit").textContent = entered[i] ?? "";
      b.classList.toggle("filled", entered[i] !== undefined);
      b.classList.toggle("active", i === entered.length);
    });
    if (entered.length < 5) {
      turnEl.innerHTML = `<span class="turn-name c-${KID_COLORS[entered.length]}">${esc(names[entered.length])}</span>の ばん！`;
    } else {
      turnEl.innerHTML = `そろったら「けってい」！`;
    }
    okBtn.classList.toggle("ready", entered.length === 5);
  };

  const toast = (msg, cls) => {
    const t = $("#toast", el);
    t.className = `toast ${cls}`;
    t.innerHTML = msg;
    setTimeout(() => t.classList.add("hidden"), 1600);
  };

  const success = () => {
    locked = true;
    sfx.correct();
    toast("ピンポーン！", "good");
    boxes.forEach((b, i) => setTimeout(() => b.classList.add("win"), i * 90));
    setTimeout(() => showUnlock(1, 3), 1300);
  };

  $("#keypad", el).addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b || locked) return;
    // さいしょに おしたら キーパッドが ぜんぶ みえるように スクロール
    if (!scrolledToPad) { scrolledToPad = true; $("#keypad", el).scrollIntoView({ behavior: "smooth", block: "end" }); }
    b.classList.remove("tapped"); void b.offsetWidth; b.classList.add("tapped");
    if (b.dataset.n !== undefined) {
      if (entered.length >= 5) { sfx.erase(); shake($("#boxes", el)); return; }
      const n = Number(b.dataset.n);
      entered.push(n);
      sfx.key(n);
      const box = boxes[entered.length - 1];
      box.classList.remove("popd"); void box.offsetWidth; box.classList.add("popd");
      refresh();
    } else if (b.dataset.act === "del") {
      if (entered.length) { entered.pop(); sfx.erase(); refresh(); }
    } else if (b.dataset.act === "ok") {
      if (entered.length < 5) { sfx.erase(); shake(turnEl); return; }
      if (entered.join("") === code) {
        success();
      } else {
        state.misses++;
        store.save("misses", state.misses);
        sfx.wrong();
        vibrate([80, 60, 80]);
        shake($("#boxes", el));
        toast("ブブー！<br>もういちど たしかめてみよう！", "bad");
        locked = true;
        setTimeout(() => {
          entered.length = 0; locked = false; refresh();
          if (state.misses >= 3) {
            const eh = $("#extraHint", el);
            if (eh.classList.contains("hidden")) {
              eh.classList.remove("hidden");
              eh.classList.add("pop-in");
              sfx.pikon();
              eh.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }
        }, 1300);
      }
    }
  });

  refresh();
  return {
    skip: () => {
      if (locked) return;
      entered.length = 0; code.split("").forEach(d => entered.push(Number(d))); refresh();
      success();
    }
  };
}

// =============================================================
//  画面3  カギ②  つみきパズル ＆ スキャン
// =============================================================
export function getSilhouette() {
  const saved = store.load("silhouette", null);
  if (saved && Array.isArray(saved.rows) && saved.rows.some(r => r.includes("1"))) return { rows: saved.rows, isSample: false };
  return { rows: CONFIG.key2.sampleSilhouette, isSample: true };
}

function silhouetteHTML(rows) {
  const cols = Math.max(...rows.map(r => r.length));
  return `<div class="sil-grid" style="--cols:${cols};--rows:${rows.length}">
    ${rows.map(r => r.padEnd(cols, "0").split("").map(c => `<div class="sil-cell ${c === "1" ? "on" : ""}"></div>`).join("")).join("")}
  </div>`;
}

function screen3(el) {
  const sil = getSilhouette();
  el.innerHTML = `
    <section class="screen s3">
      <div class="mission-head"><span class="mh-num">2</span><span>2つめの カギ</span></div>
      <div class="big-title"><span class="grow">とっても おおきな</span><br>つみきを つくろう！</div>
      <div class="hint-card">
        <span class="hc-icon">📦</span>
        <span>${nl2br(CONFIG.key2.boxHint)}</span>
      </div>
      <div class="sil-frame">
        <div class="sil-label">⭐ この かたちを みんなで つくってね ⭐</div>
        ${silhouetteHTML(sil.rows)}
      </div>
      <button class="btn btn-green btn-xl btn-pulse" id="done">できた！</button>

      <div class="scan hidden" id="scan">
        <video id="camVideo" playsinline muted></video>
        <div class="scan-fallback hidden" id="scanFallback">
          <div class="sf-santa">🎅</div><div class="sf-scope">🔭</div>
        </div>
        <div class="scan-top">サンタさんに みせてね！</div>
        <div class="scan-frame"><i></i><i></i><i></i><i></i><div class="laser"></div></div>
        <div class="scan-bottom">
          <div class="scan-status" id="scanStatus">スキャンちゅう…</div>
          <div class="scan-bar"><div class="scan-fill" id="scanFill"></div></div>
        </div>
        <button class="scan-back" id="scanBack">もどる</button>
        <div class="scan-perfect hidden" id="scanPerfect">ピピッ！<br><b>かんぺきじゃ！</b></div>
      </div>
    </section>`;

  const video = $("#camVideo", el);
  const scan = $("#scan", el);
  let timer = null, beepTimer = null, startAt = 0, finished = false, scanning = false;

  const stopScan = () => {
    clearInterval(timer); clearInterval(beepTimer);
    stopCamera(video);
    scanning = false;
  };

  const finish = () => {
    if (finished) return; finished = true;
    stopScan();
    $("#scanFill", el).style.width = "100%";
    $("#scanPerfect", el).classList.remove("hidden");
    $("#scanStatus", el).textContent = "かんりょう！";
    sfx.perfect();
    vibrate([50, 50, 50]);
    setTimeout(() => showUnlock(2, 4), 1600);
  };

  const begin = async () => {
    sfx.pop();
    scan.classList.remove("hidden");
    scanning = true;
    $("#scanFill", el).style.width = "0%";
    $("#scanPerfect", el).classList.add("hidden");
    try {
      await startCamera(video);
      if (!scanning) stopCamera(video); // 途中で もどった
    } catch (e) {
      $("#scanFallback", el).classList.remove("hidden");
      video.classList.add("hidden");
    }
    startAt = performance.now();
    const dur = CONFIG.key2.scanDurationMs || 5000;
    beepTimer = setInterval(() => sfx.scanBeep(), 500);
    timer = setInterval(() => {
      const p = Math.min(1, (performance.now() - startAt) / dur);
      $("#scanFill", el).style.width = `${p * 100}%`;
      if (p >= 1) finish();
    }, 50);
  };

  $("#done", el).addEventListener("click", begin);
  $("#scanBack", el).addEventListener("click", () => {
    sfx.erase(); stopScan(); scan.classList.add("hidden");
  });

  return {
    cleanup: stopScan,
    skip: () => { if (!finished) finish(); }
  };
}

// =============================================================
//  画面4  でんぱの わるい サンタの こえ
// =============================================================
function screen4(el) {
  el.innerHTML = `
    <section class="screen s4">
      <div class="mission-head mh-blue"><span class="mh-num">📻</span><span>こえの メッセージ！</span></div>
      <p class="lead">サンタさんから こえの メッセージが とどいたよ！<br><b>……あれ？ でんぱが わるくて へんな こえだよ！</b></p>
      <div class="radio zone-0" id="radio">
        <div class="antenna" id="antenna">
          <span></span><span></span><span></span><span></span><span></span>
          <em class="ant-label">でんぱ</em>
        </div>
        <div class="char" id="char">🦖</div>
        <div class="zone-label" id="zoneLabel">かいじゅう？</div>
        <div class="hold-ring" id="holdRing"><div class="hold-fill" id="holdFill"></div></div>
      </div>
      <button class="btn btn-red btn-play" id="play">▶ こえを きく</button>
      <div class="dial-wrap">
        <div class="dial-ends"><span>🦖</span><span>🤖</span><span>❓</span><span>🐠</span><span>🐿️</span></div>
        <input type="range" min="0" max="100" value="10" step="1" class="dial" id="dial" aria-label="ツマミ">
      </div>
      <p class="guide">みんなで じゅんばんに ツマミを うごかしてみよう！</p>
      <div class="got-it hidden" id="gotIt">ピコーン！ でんぱが あったよ！</div>
      <div class="bubble hidden" id="bubble">${nl2br(CONFIG.voice.fallbackMessage)}</div>
      <button class="btn btn-gold btn-xl btn-pulse hidden" id="next">わかった！<br>うたを うたう！</button>
      <div class="papa-note hidden" id="papaNote">（パパへ）こえが ろくおんされていません</div>
    </section>`;

  let player = null;
  let isFallback = false;
  let holdMs = 0, done = false, disposed = false;
  const dial = $("#dial", el);
  const radio = $("#radio", el);
  const charEl = $("#char", el);
  const playBtn = $("#play", el);
  let lastZone = -1;

  (async () => {
    const blob = await store.getVoiceBlob();
    let buf = null;
    if (blob) { try { buf = await decodeBlob(blob); } catch (e) { buf = null; } }
    if (!buf) {
      isFallback = true;
      $("#papaNote", el).classList.remove("hidden");
      try { buf = await getDemoVoice(); } catch (e) { buf = null; }
    }
    if (disposed) return;
    player = new VoicePlayer(buf, { santaFx: store.load("santaFx", true) });
    player.setPosition(Number(dial.value), true);
  })();

  const updateUI = v => {
    const z = zoneOf(v);
    const dist = Math.max(0, Math.abs(v - 50) - 10);
    const bars = z === 2 ? 5 : Math.max(1, 4 - Math.floor(dist / 10));
    $("#antenna", el).querySelectorAll("span").forEach((s, i) => s.classList.toggle("on", i < bars));
    $("#antenna", el).classList.toggle("full", z === 2);
    if (z !== lastZone) {
      radio.className = `radio zone-${z}`;
      charEl.textContent = ZONES[z].emoji;
      $("#zoneLabel", el).textContent = ZONES[z].label;
      charEl.classList.remove("boing"); void charEl.offsetWidth; charEl.classList.add("boing");
      if (lastZone !== -1) vibrate(15);
      lastZone = z;
    }
  };

  const setPlaying = on => {
    if (!player || !player.buffer) return;
    if (on && !player.playing) { player.start(0); playBtn.innerHTML = "■ とめる"; playBtn.classList.add("on"); }
    if (!on && player.playing) { player.stop(); playBtn.innerHTML = "▶ こえを きく"; playBtn.classList.remove("on"); }
  };

  playBtn.addEventListener("click", () => { sfx.pop(); setPlaying(!(player && player.playing)); });
  dial.addEventListener("input", () => {
    const v = Number(dial.value);
    if (player) { player.setPosition(v); if (!player.playing) setPlaying(true); }
    updateUI(v);
  });

  const succeed = () => {
    if (done) return; done = true;
    sfx.pikon();
    vibrate([40, 30, 40]);
    radio.classList.add("tuned");
    $("#gotIt", el).classList.remove("hidden");
    // 録音した こえは さいしょから はっきり ききなおせる
    if (player && player.playing) { player.start(0); }
    if (isFallback) $("#bubble", el).classList.remove("hidden");
    setTimeout(() => {
      $("#next", el).classList.remove("hidden");
      $("#next", el).scrollIntoView({ behavior: "smooth", block: "end" });
    }, isFallback ? 900 : 2500);
  };

  const holdFill = $("#holdFill", el);
  const loop = setInterval(() => {
    const z = zoneOf(Number(dial.value));
    const playing = player && player.playing;
    if (!done && z === 2 && (playing || (player && !player.buffer))) {
      holdMs += 100;
      holdFill.style.transform = `scaleX(${Math.min(1, holdMs / 1000)})`;
      $("#holdRing", el).classList.add("show");
      if (holdMs >= 1000) succeed();
    } else if (!done) {
      holdMs = 0;
      holdFill.style.transform = "scaleX(0)";
      $("#holdRing", el).classList.remove("show");
    }
  }, 100);

  $("#next", el).addEventListener("click", () => { sfx.correct(); goTo(5); });
  updateUI(Number(dial.value));

  return {
    cleanup: () => { disposed = true; clearInterval(loop); if (player) player.dispose(); },
    skip: () => {
      if (done) { goTo(5); return; }
      dial.value = 50; updateUI(50);
      if (player) { player.setPosition(50); setPlaying(true); }
      succeed();
    }
  };
}

// =============================================================
//  画面5  カギ③  みんなで うたおう（じかんで たまる ゲージ）
// =============================================================
const ORNAMENTS = [
  [50, 30, "red"], [42, 42, "gold"], [58, 44, "blue"], [35, 56, "pink"], [52, 58, "red"],
  [66, 57, "gold"], [30, 71, "blue"], [45, 73, "gold"], [60, 72, "pink"], [72, 70, "red"]
];

function treeSVG() {
  return `<svg viewBox="0 0 100 100" class="tree-svg" aria-hidden="true">
    <rect x="45" y="82" width="10" height="12" rx="2" fill="#8b5a2b"/>
    <polygon points="50,14 70,40 30,40" fill="#2a9d5c"/>
    <polygon points="50,26 78,60 22,60" fill="#23894f"/>
    <polygon points="50,42 86,84 14,84" fill="#1f7a46"/>
    ${ORNAMENTS.map(([x, y, c], i) => `<circle class="orn orn-${c}" data-i="${i}" cx="${x}" cy="${y}" r="3.6"/>`).join("")}
    <polygon class="tree-star" points="50,3 53,10.5 61,11 55,16 57,24 50,19.5 43,24 45,16 39,11 47,10.5"/>
  </svg>`;
}

function screen5(el) {
  el.innerHTML = `
    <section class="screen s5">
      <div class="mission-head"><span class="mh-num">3</span><span>3つめの カギ</span></div>
      <div class="big-title">みんなで<br>クリスマスソングを うたおう！</div>
      <div class="song-card">🎵「${esc(CONFIG.key3.songTitle)}」🎵</div>
      <div class="tree-wrap" id="treeWrap">${treeSVG()}<div class="notes" id="notes"></div></div>
      <div class="gauge">
        <div class="gauge-label">うたごえパワー <b id="gaugePct">0</b>%</div>
        <div class="gauge-bar"><div class="gauge-fill" id="gaugeFill"></div></div>
      </div>
      <button class="btn btn-red btn-xl btn-pulse" id="sing">うたを はじめる！</button>
      <p class="sending hidden" id="sending">サンタさんに うたごえを とどけているよ♪</p>
      <div class="delivered hidden" id="delivered">すてきな うたごえが<br>とどいたよ！</div>
    </section>`;

  const durMs = Math.max(5, Number(CONFIG.key3.gaugeDurationSec) || 90) * 1000;
  let raf = null, noteTimer = null, progress = 0, last = 0, fastForward = false, finished = false, singing = false;
  const orns = [...el.querySelectorAll(".orn")];

  const setProgress = p => {
    progress = Math.min(1, p);
    $("#gaugeFill", el).style.width = `${progress * 100}%`;
    $("#gaugePct", el).textContent = Math.floor(progress * 100);
    orns.forEach((o, i) => {
      const lit = progress >= (i + 1) / (ORNAMENTS.length + 1);
      if (lit && !o.classList.contains("lit")) { o.classList.add("lit"); sfx.twinkle(); }
    });
  };

  const spawnNote = () => {
    const n = document.createElement("span");
    n.className = "note";
    n.textContent = ["♪", "♫", "♬", "⭐", "♪"][Math.floor(Math.random() * 5)];
    n.style.left = `${10 + Math.random() * 80}%`;
    n.style.setProperty("--drift", `${(Math.random() - 0.5) * 80}px`);
    n.style.color = ["#ffc93c", "#ff8fb1", "#4cc9f0", "#fff", "#7be0a3"][Math.floor(Math.random() * 5)];
    $("#notes", el).appendChild(n);
    setTimeout(() => n.remove(), 2600);
  };

  const finish = () => {
    if (finished) return; finished = true;
    cancelAnimationFrame(raf); clearInterval(noteTimer);
    setProgress(1);
    el.querySelector(".tree-star").classList.add("lit");
    $("#treeWrap", el).classList.add("glow");
    $("#sending", el).classList.add("hidden");
    $("#delivered", el).classList.remove("hidden");
    sfx.correct();
    confetti.burst(window.innerWidth / 2, window.innerHeight * 0.4, 60);
    setTimeout(() => showUnlock(3, 6), 2200);
  };

  const tick = now => {
    const dt = now - last; last = now;
    const add = fastForward ? dt / 900 : dt / durMs;
    setProgress(progress + add);
    if (progress >= 1) { finish(); return; }
    raf = requestAnimationFrame(tick);
  };

  const begin = () => {
    if (singing) return; singing = true;
    sfx.pop();
    $("#sing", el).classList.add("hidden");
    $("#sending", el).classList.remove("hidden");
    $("#treeWrap", el).classList.add("singing");
    noteTimer = setInterval(spawnNote, 450);
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  $("#sing", el).addEventListener("click", begin);
  return {
    cleanup: () => { cancelAnimationFrame(raf); clearInterval(noteTimer); },
    skip: () => { if (!singing) begin(); fastForward = true; }
  };
}

// =============================================================
//  画面6  エンディング
// =============================================================
function screen6(el) {
  const img = CONFIG.ending.finalImage ? `<img class="final-img" src="${esc(CONFIG.ending.finalImage)}" alt="">` : "";
  el.innerHTML = `
    <section class="screen s6">
      <div class="clear-title">ミッション<br>クリア！</div>
      <div class="clear-keys"><span>🔑</span><span>🔑</span><span>🔑</span></div>
      <div class="end-santa">🎅</div>
      <div class="end-msg">${nl2br(CONFIG.ending.message)}</div>
      <div class="final-card">
        <div class="final-title">🎁 さいごの ヒント 🎁</div>
        <div class="final-hint">${nl2br(CONFIG.ending.finalHint)}</div>
        ${img}
      </div>
      <p class="guide">がめんを タッチすると かみふぶきが でるよ！</p>
    </section>`;
  sfx.fanfare();
  vibrate([100, 60, 100, 60, 300]);
  confetti.rain(7000);
  const onTap = e => { confetti.burst(e.clientX, e.clientY, 40); sfx.twinkle(); };
  el.addEventListener("pointerdown", onTap);
  return { cleanup: () => { el.removeEventListener("pointerdown", onTap); confetti.stop(); } };
}

const SCREENS = [screen0, screen1, screen2, screen3, screen4, screen5, screen6];

// =============================================================
//  ゆき・かみふぶき・タッチの キラキラ
// =============================================================
function initSnow() {
  const cv = $("#snow"); const g = cv.getContext("2d");
  let w, h, flakes;
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth; h = window.innerHeight;
    cv.width = w * dpr; cv.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);
  flakes = Array.from({ length: 50 }, () => ({
    x: Math.random() * w, y: Math.random() * h, r: 1 + Math.random() * 3,
    s: 0.3 + Math.random() * 0.9, d: Math.random() * Math.PI * 2
  }));
  const draw = () => {
    if (document.visibilityState === "visible") {
      g.clearRect(0, 0, w, h);
      g.fillStyle = "rgba(255,255,255,0.85)";
      for (const f of flakes) {
        f.y += f.s; f.d += 0.01; f.x += Math.sin(f.d) * 0.4;
        if (f.y > h + 5) { f.y = -5; f.x = Math.random() * w; }
        g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2); g.fill();
      }
    }
    requestAnimationFrame(draw);
  };
  draw();
}

const confetti = (() => {
  const cv = $("#confetti"); const g = cv.getContext("2d");
  const COLORS = ["#e63946", "#ffc93c", "#2a9d5c", "#4cc9f0", "#ff8fb1", "#ffffff"];
  let parts = [], running = false, rainUntil = 0, w = 0, h = 0;
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth; h = window.innerHeight;
    cv.width = w * dpr; cv.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize(); window.addEventListener("resize", resize);
  const add = (x, y, vx, vy) => parts.push({
    x, y, vx, vy, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, c: COLORS[Math.floor(Math.random() * COLORS.length)], life: 0
  });
  const loop = () => {
    g.clearRect(0, 0, w, h);
    if (performance.now() < rainUntil) for (let i = 0; i < 3; i++) add(Math.random() * w, -10, (Math.random() - 0.5) * 2, 2 + Math.random() * 2);
    parts.forEach(p => {
      p.vy += 0.12; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life++;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.life * 0.1)) + 1); g.restore();
    });
    parts = parts.filter(p => p.y < h + 20 && p.life < 400);
    if (parts.length || performance.now() < rainUntil) requestAnimationFrame(loop);
    else { running = false; g.clearRect(0, 0, w, h); }
  };
  const ensure = () => { if (!running) { running = true; requestAnimationFrame(loop); } };
  return {
    burst(x, y, n = 50) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 7;
        add(x, y, Math.cos(a) * s, Math.sin(a) * s - 4);
      }
      ensure();
    },
    rain(ms) { rainUntil = performance.now() + ms; ensure(); },
    stop() { rainUntil = 0; parts = []; }
  };
})();

function initSparkles() {
  const ICONS = ["⭐", "✨", "❄️", "💖", "⭐"];
  document.addEventListener("pointerdown", e => {
    if (e.target.closest("#admin-root")) return;
    if (fxLayer.childElementCount > 40) return;
    for (let i = 0; i < 5; i++) {
      const s = document.createElement("span");
      s.className = "spark";
      s.textContent = ICONS[Math.floor(Math.random() * ICONS.length)];
      const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 40;
      s.style.left = `${e.clientX}px`; s.style.top = `${e.clientY}px`;
      s.style.setProperty("--dx", `${Math.cos(a) * d}px`);
      s.style.setProperty("--dy", `${Math.sin(a) * d}px`);
      fxLayer.appendChild(s);
      setTimeout(() => s.remove(), 700);
    }
  }, { passive: true });
}

// =============================================================
//  Wake Lock・戻る防止・Service Worker
// =============================================================
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener?.("release", () => { wakeLock = null; });
    }
  } catch (e) { /* 取れなくても動く */ }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.started) {
    requestWakeLock();
    try { getCtx().resume(); } catch (e) { /* noop */ }
  }
});
// 音が止まっていたら、タッチのたびに再開を試みる
document.addEventListener("pointerdown", () => {
  if (state.started) { try { const c = getCtx(); if (c.state !== "running") c.resume(); } catch (e) { /* noop */ } }
}, { passive: true });

function initBackGuard() {
  try {
    history.replaceState({ guard: 0 }, "");
    history.pushState({ guard: 1 }, "");
    window.addEventListener("popstate", () => history.pushState({ guard: 1 }, ""));
  } catch (e) { /* noop */ }
}

function initSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(e => console.warn("SW", e));
  // 新しいバージョンが入ったら、スタート画面のときだけ自動で読みなおす
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded || state.stage !== 0 || state.started) return;
    reloaded = true; location.reload();
  });
}

// 途中から（リロードされたとき）は、タッチで音を解禁してから再開
function showResume() {
  overlayEl.className = "show";
  overlayEl.innerHTML = `
    <div class="resume-card">
      <div class="resume-emoji">🎅</div>
      <div>ミッションの つづきから はじめるよ！</div>
      <button class="btn btn-green btn-xl btn-pulse" id="resumeBtn">▶ つづきから</button>
    </div>`;
  $("#resumeBtn", overlayEl).addEventListener("click", async () => {
    await startSession();
    goTo(state.stage);
  });
}

// =============================================================
//  起動
// =============================================================
document.addEventListener("contextmenu", e => e.preventDefault());
initSnow();
initSparkles();
initBackGuard();
initSW();

initAdmin({
  getStage: () => state.stage,
  goTo: n => { state.misses = n === 0 ? 0 : state.misses; goTo(n); },
  skip: skipCurrent,
  reset: () => {
    state.misses = 0; store.save("misses", 0);
    state.started = false;
    goTo(0);
  },
  refresh: () => goTo(state.stage),
  ensureAudio: () => unlockAudio(),
  getNames,
  getSilhouette
});

updateHud();
if (state.stage === 0) goTo(0);
else { updateHud(); showResume(); }
