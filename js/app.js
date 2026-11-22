// =============================================================
//  app.js  画面遷移・状態管理・演出
// =============================================================
import { CONFIG } from "../config.js";
import * as store from "./storage.js";
import { sfx, unlockAudio, getCtx } from "./audio.js";
import { SantaRig, POSE_NAMES } from "./santa-rig.js";
import { compileSet, createSynth, grooveBar, cakeSVG, DECO_COUNT } from "./posegame.js";
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
let current = { cleanup: null, skip: null, cornerTap: null };

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
  current = { cleanup: null, skip: null, cornerTap: null };
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
  current.cornerTap = res.cornerTap || null;
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
//  画面4  サンタからの ビデオでんわ ＆「まねまねポーズ クリスマスケーキ」
// =============================================================
const COLOR_HEX = { red: "#e63946", green: "#2a9d5c", gold: "#ffc93c", blue: "#4cc9f0", pink: "#ff8fb1" };
const POSE_PITCH = { banzai: 1, pachi: 1.12, disco: 1.25, flamingo: 0.9, hohoho: 0.8, kenken: 1.18, robot: 1.05, yukidaruma: 0.75, hoshi: 1.33, tonakai: 0.95, haa: 1.1 };

function screen4(el) {
  const G = CONFIG.poseGame;
  const names = getNames();
  const kidColor = i => COLOR_HEX[KID_COLORS[i % KID_COLORS.length]];
  el.innerHTML = `
    <section class="screen s4">
      <div class="vcall" id="vcall">
        <video id="selfie" class="selfie hidden" playsinline muted></video>
        <div class="vc-bg" id="vcBg"></div>

        <div class="vc-incoming" id="incoming">
          <div class="vc-in-label">📹 ビデオでんわ</div>
          <div class="vc-avatar">🎅</div>
          <div class="vc-caller">サンタさん</div>
          <div class="vc-decline-msg hidden" id="declineMsg">サンタ「でておくれ〜い！」</div>
          <div class="vc-buttons">
            <button class="vc-btn vc-no" id="decline"><span>📵</span>でない</button>
            <button class="vc-btn vc-yes" id="answer"><span>📞</span>でる</button>
          </div>
        </div>

        <div class="vc-live hidden" id="live">
          <div class="vc-win" id="vcWin"><span class="vc-win-face">🎅</span><span>サンタ</span><span class="vc-rec">● つうわちゅう</span></div>

          <!-- ゲーム -->
          <div class="pg hidden" id="pg">
            <div class="pg-stage" id="pgStage">
              <div class="pg-beam pg-beam-l" id="beamL"></div>
              <div class="pg-beam pg-beam-r" id="beamR"></div>
              <div class="pg-floor"></div>
              <div class="pg-santa" id="pgSanta"></div>
              <div class="pg-posename" id="pgPoseName"></div>
              <div class="pg-setlabel" id="pgSetLabel"></div>
              <div class="pg-cake" id="pgCake">${cakeSVG()}</div>
              <div class="pg-gauge"><div class="pg-gauge-fill" id="pgGauge"></div></div>
              <div class="pg-banner hidden" id="pgBanner"></div>
              <div class="pg-count hidden" id="pgCount"></div>
              <div class="pg-tame hidden" id="pgTame">ためて〜〜…</div>
            </div>
            <div class="pg-rhythm" id="pgRhythm">
              <div class="pg-turn" id="pgTurn"></div>
              <div class="pg-track" id="pgTrack"></div>
            </div>
            <div class="pg-cam" id="pgCam">
              <div class="pg-camlabel hidden" id="pgCamLabel"></div>
              <div class="pg-flash" id="pgFlash"></div>
              <div class="pg-fake hidden" id="pgFake"></div>
            </div>
          </div>

          <div class="vc-talk hidden" id="talkBox">
            <div class="vc-bubble" id="bubble"></div>
            <button class="btn btn-green" id="talkNext">つぎへ ▶</button>
          </div>

          <div class="vc-card hidden" id="rules">
            <div class="rules-title">あそびかた</div>
            <div class="rule"><span class="rn">1</span><span class="ri">🎅</span><span>サンタが ポーズを<br>みせるよ！ よく みてね</span></div>
            <div class="rule"><span class="rn">2</span><span class="ri">📣</span><span><b>なまえを よばれた こ</b>が<br>おなじ リズムで まねっこ！</span></div>
            <div class="rule"><span class="rn">3</span><span class="ri">🌈</span><span><b>「みんな！」</b>の ときは<br>5にん ぜんいんで！</span></div>
            <div class="rules-note">ポーズを きめるたびに<br>🎂 ケーキが できあがっていくよ！</div>
            <button class="btn btn-gold" id="rulesOk">わかった！</button>
          </div>

          <div class="vc-card hidden" id="setup">
            <div class="rules-title">じゅんび しよう！</div>
            <div class="setup-emoji">📱 ➡ 👧👧👧👧👧</div>
            <div class="setup-text">スマホを たてかけて、<br>5にん みんなが がめんに<br>うつるように ならんでね！</div>
            <button class="btn btn-red btn-xl btn-pulse" id="go">じゅんび OK！<br>スタート！</button>
          </div>

          <div class="vc-card gallery hidden" id="gallery">
            <div class="rules-title">📸 ベストポーズ しゃしんかん</div>
            <div class="gal-grid" id="galGrid"></div>
            <button class="btn btn-gold" id="galNext">つぎへ ▶</button>
          </div>
        </div>
      </div>
    </section>`;

  const video = $("#selfie", el);
  document.body.classList.add("in-call");
  let alive = true;
  let ringTimer = null, raf = null, synth = null, rig = null;
  let phase = "ring";
  let rot = 0, decoCount = 0;
  const shots = {};
  const show = (id, on = true) => $("#" + id, el).classList.toggle("hidden", !on);
  const later = (fn, ms) => setTimeout(() => alive && fn(), ms);

  // ---- ちゃくしん ----
  const ring = () => { sfx.ring(); vibrate([200, 100, 200]); };
  ring();
  ringTimer = setInterval(ring, 1800);
  $("#decline", el).addEventListener("click", () => { sfx.wrong(); show("declineMsg"); shake($("#incoming", el)); });
  $("#answer", el).addEventListener("click", async () => {
    clearInterval(ringTimer);
    sfx.correct();
    phase = "talk";
    show("incoming", false);
    show("live");
    try {
      await startCamera(video, "user");
      if (!alive) { stopCamera(video); return; }
      video.classList.remove("hidden");
    } catch (e) {
      $("#vcBg", el).classList.add("fallback");
    }
    talk(G.talk, () => { show("talkBox", false); show("rules"); sfx.pikon(); });
  });

  // ---- サンタの せりふ ----
  function talk(lines, done, lastLabel = "つぎへ ▶") {
    let i = 0;
    const bubble = $("#bubble", el);
    const btn = $("#talkNext", el);
    show("talkBox");
    const say = () => {
      bubble.innerHTML = nl2br(lines[i].replace(/\{song\}/g, CONFIG.key3.songTitle));
      bubble.classList.remove("pop-in"); void bubble.offsetWidth; bubble.classList.add("pop-in");
      [0, 120, 240].forEach(d => later(() => sfx.key(Math.floor(Math.random() * 5)), d));
      btn.innerHTML = i === lines.length - 1 ? lastLabel : "つぎへ ▶";
    };
    btn.onclick = () => {
      sfx.pop();
      i++;
      if (i < lines.length) say(); else { btn.onclick = null; show("talkBox", false); done(); }
    };
    say();
  }

  $("#rulesOk", el).addEventListener("click", () => { sfx.pop(); show("rules", false); show("setup"); });
  $("#go", el).addEventListener("click", () => {
    sfx.correct();
    show("setup", false);
    startGame();
  });

  // ---- ゲーム ----
  function whoText(who) {
    if (!who || who.type === "all" || who.type === "fake") return "みんな！";
    if (who.type === "relay") return "リレー！";
    return who.ids.map(i => names[i]).join(" と ") + "！";
  }
  function whoColors(who) {
    if (!who || who.type === "all" || who.type === "fake" || who.type === "relay") return null;
    return who.ids.map(kidColor);
  }
  function setBanner(who, mode) {
    const b = $("#pgBanner", el);
    const cols = whoColors(who);
    b.className = "pg-banner pop-in" + (cols ? "" : " rainbow");
    b.style.background = cols ? (cols.length > 1 ? `linear-gradient(90deg, ${cols.join(",")})` : cols[0]) : "";
    b.innerHTML = mode === "call"
      ? `<small>つぎは…</small>${esc(whoText(who))}`
      : `${esc(whoText(who))}<small> の ばん！</small>`;
    // スポットライトの いろ
    const c = cols ? cols[0] : "#fff6c9";
    const c2 = cols ? cols[cols.length - 1] : "#fff6c9";
    $("#beamL", el).style.setProperty("--beam", c);
    $("#beamR", el).style.setProperty("--beam", c2);
  }
  function setCamLabel(who) {
    const l = $("#pgCamLabel", el);
    const cols = whoColors(who);
    l.classList.remove("hidden");
    l.className = "pg-camlabel pop-in" + (cols ? "" : " rainbow");
    l.style.background = cols ? (cols.length > 1 ? `linear-gradient(90deg, ${cols.join(",")})` : cols[0]) : "";
    l.innerHTML = `📸 ${esc(whoText(who))}`;
    $("#pgCam", el).style.setProperty("--cam", cols ? cols[0] : "#ffffff");
  }

  let seg = null; // { start, len, spb, mode }
  function drawTrack(hits, len, who, mode) {
    const track = $("#pgTrack", el);
    const cols = whoColors(who);
    const col = mode === "call" ? "#ff5a67" : (cols ? cols[0] : "#ffc93c");
    let html = "";
    for (let b = 0; b < len; b++) html += `<span class="pg-tick ${b % 4 === 0 ? "bar" : ""}" style="left:${(b / len) * 100}%"></span>`;
    hits.forEach((h, i) => {
      const c = who && who.type === "relay" && mode === "resp" ? kidColor(who.ids[i]) : col;
      html += `<span class="pg-dot" data-i="${i}" style="left:${(h.pos / len) * 100}%;--dot:${c}"></span>`;
    });
    html += `<span class="pg-playhead" id="pgPlayhead"></span>`;
    track.innerHTML = html;
    track.className = `pg-track ${mode}`;
    $("#pgTurn", el).innerHTML = mode === "call"
      ? `👀 <b>サンタ</b>を よく みてね！`
      : `✨ <b>${esc(whoText(who).replace(/！$/, ""))}</b>の ばん！`;
    $("#pgRhythm", el).className = `pg-rhythm ${mode}`;
  }
  function pulseDot(i) {
    const d = el.querySelector(`.pg-dot[data-i="${i}"]`);
    if (d) { d.classList.remove("hit"); void d.offsetWidth; d.classList.add("hit"); }
  }
  function flash() {
    const f = $("#pgFlash", el);
    f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
  }
  const snapCanvas = document.createElement("canvas");
  function snap(key) {
    if (!video.videoWidth) return;
    const w = 360, h = Math.round(w * video.videoHeight / video.videoWidth);
    snapCanvas.width = w; snapCanvas.height = h;
    const g = snapCanvas.getContext("2d");
    g.setTransform(-1, 0, 0, 1, w, 0);
    g.drawImage(video, 0, 0, w, h);
    try { shots[key] = snapCanvas.toDataURL("image/jpeg", 0.75); } catch (e) { /* noop */ }
  }
  function addDeco() {
    const d = el.querySelector(`.deco[data-i="${decoCount}"]`);
    if (d) d.classList.add("on");
    decoCount++;
    $("#pgGauge", el).style.height = `${Math.min(100, (decoCount / DECO_COUNT) * 100)}%`;
    const cake = $("#pgCake", el);
    cake.classList.remove("boing"); void cake.offsetWidth; cake.classList.add("boing");
    if (decoCount >= 11) el.querySelector(".cake-cream").classList.add("on");
  }

  function startGame() {
    phase = "game";
    show("pg");
    $("#vcWin", el).classList.add("hidden");
    rig = new SantaRig($("#pgSanta", el));
    synth = createSynth();
    runSet(0, () => {
      rig.pose("hohoho");
      synth.tada(getCtx().currentTime + 0.05);
      $("#pgTurn", el).innerHTML = "🎉 ぜんはん クリア！";
      later(() => talk(G.halfTalk, () => runSet(1, finale), "スタート！"), 900);
    });
  }

  function runSet(si, onDone) {
    const set = G.sets[si];
    const comp = compileSet(set, rot, names.length);
    rot = comp.rot;
    const c = getCtx();
    const spb = 60 / set.bpm;
    const lat = Math.min(0.2, (c.outputLatency || 0) + (c.baseLatency || 0) || 0.04);
    const t0 = c.currentTime + 0.35;
    const totalBars = Math.ceil(comp.beats / 4);
    const items = comp.items.map(it => ({ ...it, t: t0 + it.beat * spb, a: false, v: false }));
    let barSched = 0, lastBeat = -1;
    $("#pgSetLabel", el).innerHTML = `${esc(set.title)}<small>${esc(set.subtitle)}</small>`;
    show("pgCamLabel", false);
    $("#pgTrack", el).innerHTML = "";
    $("#pgTurn", el).innerHTML = "♪ はじまるよ〜！";

    const audio = (it, t) => {
      if (it.kind === "count") synth.count(t, it.n === 3);
      else if (it.kind === "callHit") { if (it.pose === "sneeze") synth.sneeze(t); else synth.ho(t, POSE_PITCH[it.pose] || 1); }
      else if (it.kind === "respHit") synth.pose(t);
    };
    const visual = it => {
      switch (it.kind) {
        case "count": {
          const cnt = $("#pgCount", el);
          cnt.classList.remove("hidden");
          cnt.textContent = ["3", "2", "1", "スタート！"][it.n];
          cnt.className = "pg-count pop-in" + (it.n === 3 ? " go" : "");
          break;
        }
        case "callStart":
          show("pgCount", false); show("pgFake", false); show("pgTame", false);
          rig.pose("idle");
          setBanner(it.who, "call");
          drawTrack(it.hits, it.len, it.who, "call");
          seg = { start: it.t, len: it.len };
          $("#pgPoseName", el).textContent = "";
          if (it.who.type === "relay") setCamLabel({ type: "kids", ids: [it.who.ids[0]] });
          else setCamLabel(it.who);
          break;
        case "callHit":
          rig.pose(it.pose);
          $("#pgPoseName", el).textContent = POSE_NAMES[it.pose] || "";
          $("#pgPoseName", el).className = "pg-posename pop-in";
          pulseDot(it.i);
          break;
        case "tame": show("pgTame"); break;
        case "respStart":
          rig.pose("idle");
          setBanner(it.who.type === "fake" ? { type: "all" } : it.who, "resp");
          drawTrack(it.hits, it.len, it.who, "resp");
          seg = { start: it.t, len: it.len };
          show("pgTame", false);
          if (it.who.type === "relay") setCamLabel({ type: "kids", ids: [it.who.ids[0]] });
          break;
        case "respHit":
          rig.pose(it.pose);
          $("#pgPoseName", el).textContent = POSE_NAMES[it.pose] || "";
          $("#pgPoseName", el).className = "pg-posename pop-in";
          pulseDot(it.i);
          flash();
          vibrate(20);
          if (it.who.type === "relay") {
            const nextId = it.who.ids[it.i + 1];
            snap(it.who.ids[it.i]);
            if (nextId !== undefined) setCamLabel({ type: "kids", ids: [nextId] });
          } else if (it.last && it.target.type === "kids") {
            it.target.ids.forEach(id => { if (it.target.ids.length === 1 || !shots[id]) snap(id); });
          } else if (it.last && it.target.type === "all") {
            snap("all");
          }
          { const r = $("#pgCake", el).getBoundingClientRect(); confetti.burst(r.left + r.width / 2, r.top + r.height / 2, 14); }
          break;
        case "fakeResp": {
          const f = $("#pgFake", el);
          f.innerHTML = "ハックション〜！<br><b>まねしちゃ ダメ〜！</b><br><small>ひっかかった こは いるかな？</small>";
          f.classList.remove("hidden");
          f.className = "pg-fake pop-in";
          sfx.moved();
          break;
        }
        case "phraseEnd":
          rig.pose("idle");
          $("#pgPoseName", el).textContent = "";
          if (it.who.type !== "fake") addDeco();
          break;
      }
    };

    const loop = () => {
      if (!alive) return;
      const now = c.currentTime;
      while (barSched < totalBars && t0 + barSched * 4 * spb < now + 0.3) {
        if (barSched >= 1) grooveBar(synth, t0 + barSched * 4 * spb, spb, barSched - 1, si);
        else for (let b = 0; b < 4; b++) synth.bell(t0 + b * spb, true);
        barSched++;
      }
      let done = true;
      for (const it of items) {
        if (!it.a && it.t < now + 0.12) { it.a = true; audio(it, Math.max(it.t, now)); }
        if (!it.v && now - lat >= it.t) { it.v = true; visual(it); }
        if (!it.v) done = false;
      }
      const vnow = now - lat;
      const beatNo = Math.floor((vnow - t0) / spb);
      if (beatNo !== lastBeat && beatNo >= 0) { lastBeat = beatNo; rig.bob(); }
      if (seg) {
        const p = Math.max(0, Math.min(1, (vnow - seg.start) / (seg.len * spb)));
        const ph = el.querySelector("#pgPlayhead");
        if (ph) ph.style.left = `${p * 100}%`;
      }
      if (done) { raf = null; seg = null; onDone(); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  // ---- フィナーレ：なまえを よぶ → しゃしんかん ----
  function finale() {
    phase = "finale";
    show("pgCount", false); show("pgTame", false); show("pgFake", false);
    // のこりの かざりを ぜんぶ のせる
    while (decoCount < DECO_COUNT) addDeco();
    el.querySelector(".cake-cream").classList.add("on");
    $("#pgCake", el).classList.add("done");
    rig.pose("hoshi");
    $("#pgPoseName", el).textContent = "";
    $("#pgTurn", el).innerHTML = "🎂 ケーキ かんせい！";
    $("#pgTrack", el).innerHTML = "";
    sfx.fanfare();
    confetti.rain(5000);
    names.forEach((n, i) => later(() => {
      setBanner({ type: "kids", ids: [i] }, "resp");
      $("#pgBanner", el).innerHTML = `${esc(n)}<small> ありがとう！</small>`;
      sfx.key(i + 3);
      rig.pose(["banzai", "disco", "hohoho", "kenken", "pachi"][i % 5]);
    }, 1400 + i * 900));
    later(() => {
      setBanner({ type: "all" }, "resp");
      $("#pgBanner", el).innerHTML = "メリークリスマス！";
      $("#pgBanner", el).classList.add("wide");
      rig.pose("hoshi");
      sfx.correct();
    }, 1400 + names.length * 900);
    later(showGallery, 2600 + names.length * 900);
  }

  function showGallery() {
    phase = "gallery";
    const grid = $("#galGrid", el);
    grid.innerHTML = names.map((n, i) => `
      <div class="gal-card" style="--kc:${kidColor(i)}">
        ${shots[i] ? `<img src="${shots[i]}" alt="">` : `<div class="gal-noimg">🎅</div>`}
        <div class="gal-name">${esc(n)}</div>
      </div>`).join("") + (shots.all ? `
      <div class="gal-card gal-all" style="--kc:#ffc93c"><img src="${shots.all}" alt=""><div class="gal-name">みんなで ポーズ！</div></div>` : "");
    show("pg", false);
    show("gallery");
    sfx.pikon();
  }
  $("#galNext", el).addEventListener("click", () => {
    sfx.pop();
    show("gallery", false);
    show("pg", false);
    $("#vcWin", el).classList.remove("hidden");
    talk(G.clearTalk, () => { sfx.correct(); goTo(5); }, "わかった！<br>うたを うたう！");
  });

  function stopGame() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (synth) { synth.stop(); synth = null; }
  }

  return {
    cleanup: () => {
      document.body.classList.remove("in-call");
      alive = false;
      clearInterval(ringTimer);
      stopGame();
      if (rig) rig.destroy();
      stopCamera(video);
    },
    skip: () => {
      // 早送り：ゲームを とばして しゃしんかんへ
      if (phase === "gallery" || phase === "finale") return;
      clearInterval(ringTimer);
      stopGame();
      show("incoming", false); show("rules", false); show("setup", false); show("talkBox", false);
      show("live");
      if (!rig) { show("pg"); rig = new SantaRig($("#pgSanta", el)); }
      finale();
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
  cornerTap: () => { if (current.cornerTap) current.cornerTap(); },
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
