// =============================================================
//  app.js  画面遷移・状態管理・演出
// =============================================================
import { CONFIG } from "../config.js";
import * as store from "./storage.js";
import { sfx, unlockAudio, getCtx, decodeBlob } from "./audio.js";
import { SantaRig, POSE_NAMES, POSE_LOOK } from "./santa-rig.js";
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

function keysUnlocked(stage) { return stage >= 5 ? 3 : stage >= 4 ? 2 : stage >= 3 ? 1 : 0; }

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
  let res = {};
  try {
    res = screen(stageEl) || {};
  } catch (e) {
    // 古い ファイルが まざった ときなど：まっしろに しないで よみこみなおしボタンを だす
    console.error(e);
    document.body.classList.remove("in-call");
    stageEl.innerHTML = `
      <section class="screen">
        <div class="resume-card">
          <div class="resume-emoji">🎅</div>
          <div>あれれ？ がめんが うまく ひらけなかったよ</div>
          <button class="btn btn-green btn-xl" id="reloadBtn">もういちど よみこむ</button>
          <div class="papa-note">（パパへ）${esc(e && e.message)}</div>
        </div>
      </section>`;
    $("#reloadBtn", stageEl).addEventListener("click", () => location.reload());
  }
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
      <div class="unlock-side">
        <div class="unlock-text hidden">${n}つめの カギが<br><b>あいた！</b></div>
        <div class="unlock-count hidden">カギ ${n} / 3</div>
        <button class="btn btn-gold hidden" id="unlockNext">${n < 3 ? "つぎへ すすむ！" : "🎉 おいわいへ！"}</button>
      </div>
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
    <section class="screen s0 land">
      <div class="col col-l">
        <div class="s0-title">
          <div class="s0-sub">サンタからの</div>
          <div class="s0-main">きんきゅう<br>ミッション</div>
        </div>
        <div class="s0-deco">🎁 ⭐ 🎅 ⭐ 🎁</div>
      </div>
      <div class="col col-r">
        <button class="touch-me" id="touchMe">
          <span class="touch-emoji">📩</span>
          <span class="touch-label">スマホを<br>タッチしてね！</span>
        </button>
      </div>
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
  // よこむきに こてい（ホーム画面から ひらいた ときは manifest で こてい される）
  try { await screen.orientation?.lock?.("landscape"); } catch (e) { /* noop */ }
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
        <div class="letter-side">
          <div class="letter-paper">
            <div class="letter-from">サンタより</div>
            <div class="letter-body" id="letterBody"></div>
          </div>
          <div class="letter-foot">
            <div class="tap-note" id="tapNote">タッチすると はやく よめるよ</div>
            <div class="letter-locks hidden" id="letterLocks"><span>🔒</span><span>🔒</span><span>🔒</span></div>
            <button class="btn btn-green btn-pulse hidden" id="startMission">ミッション スタート！</button>
          </div>
        </div>
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
    <section class="screen s2 land">
      <div class="col col-l">
      <div class="mission-head"><span class="mh-num">1</span><span>1つめの カギ</span></div>
      <p class="lead">5にんの「すうじ」を さがして、じぶんの ばんで いれてね！</p>
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
      </div>
      <div class="col col-r">
      <div class="code-boxes" id="boxes">
        ${hints.map((h, i) => `
          <div class="cbox c-${KID_COLORS[i]}" data-i="${i}">
            <div class="cname">${esc(names[i])}</div>
            <div class="cdigit"></div>
          </div>`).join("")}
      </div>
      <div class="turn" id="turn"></div>
      <div class="keypad" id="keypad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(n => `<button class="kp kp-n" data-n="${n}">${n}</button>`).join("")}
        <button class="kp kp-del" data-act="del">けす</button>
        <button class="kp kp-ok" data-act="ok">けってい</button>
      </div>
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
    <section class="screen s3 land">
      <div class="col col-l">
        <div class="mission-head"><span class="mh-num">2</span><span>2つめの カギ</span></div>
        <div class="big-title"><span class="grow">とっても おおきな</span><br>つみきを つくろう！</div>
        <div class="hint-card">
          <span class="hc-icon">📦</span>
          <span>${nl2br(CONFIG.key2.boxHint)}</span>
        </div>
        <button class="btn btn-green btn-xl btn-pulse" id="done">できた！</button>
      </div>
      <div class="col col-r">
        <div class="sil-frame">
          <div class="sil-label">⭐ この かたちを みんなで つくってね ⭐</div>
          ${silhouetteHTML(sil.rows)}
        </div>
      </div>

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
        <div class="scan-santa" id="scanSanta">
          <div class="ss-rig" id="ssRig"></div>
          <div class="ss-glass">🔍</div>
          <div class="ss-bubble" id="ssBubble">どれどれ…</div>
        </div>
        <div class="scan-count hidden" id="scanCount"></div>
        <button class="scan-back" id="scanBack">もどる</button>
        <div class="scan-perfect hidden" id="scanPerfect">ピピッ！<br><b>かんぺきじゃ！</b></div>
      </div>
    </section>`;

  const video = $("#camVideo", el);
  const scan = $("#scan", el);
  let timer = null, beepTimer = null, startAt = 0, finished = false, scanning = false;
  let ssRig = null, lastCount = -1;

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
    $("#scanCount", el).classList.add("hidden");
    $("#scanSanta", el).classList.add("happy");
    $("#ssBubble", el).textContent = "かんぺきじゃ！";
    if (ssRig) { ssRig.pose("banzai"); ssRig.hop(); }
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
    $("#scanSanta", el).classList.remove("happy");
    $("#ssBubble", el).textContent = "どれどれ…";
    if (!ssRig) ssRig = new SantaRig($("#ssRig", el));
    ssRig.pose("hohoho");
    lastCount = -1;
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
      // さいごの 3びょうは カウントダウン
      const left = Math.ceil((dur - (performance.now() - startAt)) / 1000);
      if (left <= 3 && left >= 1 && left !== lastCount) {
        lastCount = left;
        const c = $("#scanCount", el);
        c.textContent = left;
        c.className = "scan-count pop-in";
        sfx.count();
        if (left === 3) $("#ssBubble", el).textContent = "ふむふむ…";
      }
      if (p >= 1) finish();
    }, 50);
  };

  $("#done", el).addEventListener("click", begin);
  $("#scanBack", el).addEventListener("click", () => {
    sfx.erase(); stopScan(); scan.classList.add("hidden");
  });

  return {
    cleanup: () => { stopScan(); if (ssRig) ssRig.destroy(); },
    skip: () => { if (!finished) finish(); }
  };
}

// =============================================================
//  画面4  サンタからの ビデオでんわ ＆「まねまねポーズ クリスマスケーキ」
//  （カメラは つかわない。がめん いっぱいに サンタを おおきく）
// =============================================================
const POSE_PITCH = { banzai: 1, pachi: 1.12, disco: 1.25, flamingo: 0.9, hohoho: 0.8, kenken: 1.18, robot: 1.05, yukidaruma: 0.75, hoshi: 1.33, tonakai: 0.95, haa: 1.1 };

function screen4(el) {
  const G = CONFIG.poseGame;
  el.innerHTML = `
    <section class="screen s4">
      <div class="vcall" id="vcall">
        <div class="vc-bg"></div>

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
          <div class="pg" id="pg">
            <div class="pg-stage call" id="pgStage">
              <div class="pg-beam pg-beam-l"></div>
              <div class="pg-beam pg-beam-r"></div>
              <div class="pg-floor"></div>
              <div class="pg-phase hidden" id="pgPhase"></div>
              <div class="pg-setlabel" id="pgSetLabel"></div>
              <div class="pg-cake" id="pgCake">${cakeSVG()}</div>
              <div class="pg-gauge"><div class="pg-gauge-fill" id="pgGauge"></div></div>
              <div class="pg-posebg" id="pgPoseBg"><span id="pgPoseIcon"></span></div>
              <div class="pg-santa" id="pgSanta"></div>
              <div class="pg-posename" id="pgPoseName"></div>
              <div class="pg-next hidden" id="pgNext"></div>
              <div class="pg-count hidden" id="pgCount"></div>
              <div class="pg-tame hidden" id="pgTame">ためて〜〜…</div>
              <div class="pg-fake hidden" id="pgFake"></div>
              <div class="pg-flash" id="pgFlash"></div>
              <div class="pg-done hidden" id="pgDone">🎂 ケーキ かんせい！<br><b>メリークリスマス！</b></div>
            </div>
            <div class="pg-rhythm hidden" id="pgRhythm">
              <div class="pg-track" id="pgTrack"></div>
            </div>
          </div>

          <div class="vc-win" id="vcWin"><span class="vc-win-face">🎅</span><span>サンタ</span><span class="vc-rec">● つうわちゅう</span></div>

          <div class="vc-talk hidden" id="talkBox">
            <div class="vc-bubble" id="bubble"></div>
            <button class="btn btn-green" id="talkNext">つぎへ ▶</button>
          </div>

          <div class="vc-card hidden" id="rules">
            <div class="rules-title">あそびかた</div>
            <div class="rules-row">
            <div class="rule"><span class="rn">1</span><span class="ri">👀</span><span>まずは サンタが おどるよ！<br>よく みてね</span></div>
            <div class="rule"><span class="rn">2</span><span class="ri">🙌</span><span>がめんが きんいろに なったら<br><b>サンタと いっしょに</b><br>5にんで おどろう！</span></div>
            </div>
            <div class="rules-note">ポーズを きめるたびに<br>🎂 ケーキが できあがっていくよ！</div>
            <button class="btn btn-red btn-xl btn-pulse" id="go">わかった！<br>スタート！</button>
          </div>

          <div class="vc-card warp-card hidden" id="warpWait">
            <div class="warp-tv">📺</div>
            <div class="warp-side">
              <div class="rules-title">テレビに ワープ！</div>
              <div class="warp-step"><span class="rn">1</span>テレビを つけてね</div>
              <div class="warp-step"><span class="rn">2</span>パパに つないで もらってね</div>
              <div class="rules-note">テレビに うつったら ボタンを おしてね！</div>
              <button class="btn btn-red btn-xl btn-pulse" id="warpBtn">✨ ワープ！</button>
            </div>
          </div>
          <div class="warp-fx hidden" id="warpFx"><div class="warp-ring"></div><div class="warp-ring r2"></div><div class="warp-text">シュワーン！</div></div>
        </div>
      </div>
    </section>`;

  document.body.classList.add("in-call");
  let alive = true;
  let ringTimer = null, raf = null, synth = null, rig = null;
  let phase = "ring", decoCount = 0;
  const show = (id, on = true) => $("#" + id, el).classList.toggle("hidden", !on);
  const later = (fn, ms) => setTimeout(() => alive && fn(), ms);
  const stage = $("#pgStage", el);

  // ---- ちゃくしん ----
  const ring = () => { sfx.ring(); vibrate([200, 100, 200]); };
  ring();
  ringTimer = setInterval(ring, 1800);
  $("#decline", el).addEventListener("click", () => { sfx.wrong(); show("declineMsg"); shake($("#incoming", el)); });
  $("#answer", el).addEventListener("click", () => {
    clearInterval(ringTimer);
    sfx.correct();
    phase = "talk";
    show("incoming", false);
    show("live");
    rig = new SantaRig($("#pgSanta", el));
    rig.pose("hohoho");
    talk(G.talk.concat(G.warpTalk || []), () => {
      rig.pose("idle");
      show("warpWait");
      sfx.pikon();
    });
  });

  // ---- テレビに ワープ ----
  $("#warpBtn", el).addEventListener("click", () => {
    show("warpWait", false);
    phase = "warp";
    sfx.whoosh();
    later(() => sfx.unlock(), 250);
    vibrate([40, 30, 80]);
    const fx = $("#warpFx", el);
    fx.classList.remove("hidden");
    rig.pose("yukidaruma");
    later(() => { rig.pose("hoshi"); rig.hop(); confetti.burst(window.innerWidth / 2, window.innerHeight * 0.45, 80); }, 900);
    later(() => {
      fx.classList.add("hidden");
      rig.pose("banzai");
      talk(G.afterWarpTalk || [], () => { rig.pose("idle"); show("rules"); sfx.pikon(); });
    }, 1700);
  });

  // ---- サンタの せりふ ----
  function talk(lines, done, lastLabel = "つぎへ ▶") {
    let i = 0;
    const bubble = $("#bubble", el);
    const btn = $("#talkNext", el);
    show("talkBox");
    show("vcWin");
    const say = () => {
      bubble.innerHTML = nl2br(lines[i].replace(/\{song\}/g, CONFIG.key3.songTitle));
      bubble.classList.remove("pop-in"); void bubble.offsetWidth; bubble.classList.add("pop-in");
      [0, 120, 240].forEach(d => later(() => sfx.key(Math.floor(Math.random() * 5)), d));
      if (rig) { rig.pose(i % 2 ? "pachi" : "hohoho"); }
      btn.innerHTML = i === lines.length - 1 ? lastLabel : "つぎへ ▶";
    };
    btn.onclick = () => {
      sfx.pop();
      i++;
      if (i < lines.length) say(); else { btn.onclick = null; show("talkBox", false); show("vcWin", false); done(); }
    };
    say();
  }

  $("#go", el).addEventListener("click", () => {
    sfx.correct();
    show("rules", false);
    startGame();
  });

  // ---- ポーズの みせかた ----
  function showPose(pose, strong) {
    rig.pose(pose);
    rig.hop();
    const look = POSE_LOOK[pose] || { icon: "", color: "#fff" };
    const bg = $("#pgPoseBg", el);
    bg.style.setProperty("--pc", look.color);
    $("#pgPoseIcon", el).textContent = look.icon;
    bg.classList.remove("show", "strong"); void bg.offsetWidth;
    bg.classList.add("show");
    if (strong) bg.classList.add("strong");
    const name = $("#pgPoseName", el);
    name.textContent = POSE_NAMES[pose] || "";
    name.style.setProperty("--pc", look.color);
    name.classList.remove("pop-in"); void name.offsetWidth; name.classList.add("pop-in");
  }
  function clearPose() {
    rig.pose("idle");
    $("#pgPoseBg", el).classList.remove("show", "strong");
    $("#pgPoseName", el).textContent = "";
  }
  function setPhase(mode) {
    stage.classList.toggle("call", mode === "call");
    stage.classList.toggle("resp", mode === "resp");
    const ph = $("#pgPhase", el);
    show("pgPhase");
    ph.className = `pg-phase ${mode} pop-in`;
    ph.innerHTML = mode === "call" ? "👀 サンタが おどるよ！" : "🙌 サンタと いっしょに！";
  }

  let seg = null;
  function drawTrack(hits, len, mode) {
    const track = $("#pgTrack", el);
    let html = "";
    for (let b = 0; b < len; b++) html += `<span class="pg-tick ${b % 4 === 0 ? "bar" : ""}" style="left:${(b / len) * 100}%"></span>`;
    hits.forEach((h, i) => {
      const look = POSE_LOOK[h.pose] || { icon: "★", color: "#fff" };
      const icon = mode === "call" ? "？" : look.icon;
      html += `<span class="pg-dot ${mode}" data-i="${i}" style="left:${(h.pos / len) * 100}%;--dot:${look.color}"><i>${icon}</i></span>`;
    });
    html += `<span class="pg-playhead" id="pgPlayhead"></span>`;
    track.innerHTML = html;
    $("#pgRhythm", el).className = `pg-rhythm ${mode}`;
  }
  function revealDot(i, pose) {
    const d = el.querySelector(`.pg-dot[data-i="${i}"]`);
    if (!d) return;
    const look = POSE_LOOK[pose] || { icon: "★" };
    d.querySelector("i").textContent = look.icon;
    d.classList.remove("hit"); void d.offsetWidth; d.classList.add("hit");
  }
  function flash() {
    const f = $("#pgFlash", el);
    f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
  }
  function addDeco(n = 2) {
    for (let k = 0; k < n; k++) {
      const d = el.querySelector(`.deco[data-i="${decoCount}"]`);
      if (d) d.classList.add("on");
      decoCount++;
    }
    $("#pgGauge", el).style.height = `${Math.min(100, (decoCount / DECO_COUNT) * 100)}%`;
    const cake = $("#pgCake", el);
    cake.classList.remove("boing"); void cake.offsetWidth; cake.classList.add("boing");
    if (decoCount >= 11) el.querySelector(".cake-cream").classList.add("on");
  }

  function startGame() {
    phase = "game";
    synth = createSynth();
    runSet(0, () => {
      show("pgRhythm", false); show("pgPhase", false);
      synth.tada(getCtx().currentTime + 0.05);
      later(() => talk(G.halfTalk, () => runSet(1, finale), "スタート！"), 700);
    });
  }

  function runSet(si, onDone) {
    const set = G.sets[si];
    const comp = compileSet(set, 0, 5);
    const c = getCtx();
    const spb = 60 / set.bpm;
    // 映像の ズレ ちょうせい（管理画面）：＋で 映像を おそく、−で はやく
    const lat = Math.min(0.2, (c.outputLatency || 0) + (c.baseLatency || 0) || 0.04) + (Number(store.load("videoOffsetMs", 0)) || 0) / 1000;
    const t0 = c.currentTime + 0.35;
    const totalBars = Math.ceil(comp.beats / 4);
    const items = comp.items.map(it => ({ ...it, t: t0 + it.beat * spb, a: false, v: false }));
    let barSched = 0, lastBeat = -1;
    $("#pgSetLabel", el).innerHTML = `${esc(set.title)}<small>${esc(set.subtitle)}</small>`;
    $("#pgTrack", el).innerHTML = "";
    show("pgRhythm");
    clearPose();

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
          clearPose();
          setPhase("call");
          drawTrack(it.hits, it.len, "call");
          seg = { start: it.t, len: it.len };
          break;
        case "callHit":
          showPose(it.pose, false);
          revealDot(it.i, it.pose);
          break;
        case "tame": show("pgTame"); break;
        case "respStart":
          clearPose();
          setPhase("resp");
          drawTrack(it.hits, it.len, "resp");
          seg = { start: it.t, len: it.len };
          show("pgTame", false);
          break;
        case "preview": {
          const look = POSE_LOOK[it.pose] || { icon: "", color: "#fff" };
          const nx = $("#pgNext", el);
          nx.style.setProperty("--pc", look.color);
          nx.innerHTML = `<small>つぎは</small><span>${look.icon}</span>`;
          nx.className = "pg-next pop-in";
          break;
        }
        case "respHit":
          show("pgNext", false);
          showPose(it.pose, true);
          revealDot(it.i, it.pose);
          flash();
          vibrate(20);
          { const r = $("#pgCake", el).getBoundingClientRect(); confetti.burst(r.left + r.width / 2, r.top + r.height / 2, 12); }
          break;
        case "fakeResp": {
          const f = $("#pgFake", el);
          f.innerHTML = "ハックション〜！<br><b>まねしちゃ ダメ〜！</b><br><small>ひっかかった こは いるかな？</small>";
          f.className = "pg-fake pop-in";
          sfx.moved();
          break;
        }
        case "phraseEnd":
          clearPose();
          show("pgNext", false);
          if (it.who.type !== "fake") addDeco(2);
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

  // ---- ケーキ かんせい ----
  function finale() {
    phase = "finale";
    stopGame();
    show("pgCount", false); show("pgTame", false); show("pgFake", false); show("pgRhythm", false); show("pgPhase", false); show("pgNext", false);
    while (decoCount < DECO_COUNT) addDeco(1);
    el.querySelector(".cake-cream").classList.add("on");
    $("#pgCake", el).classList.add("done");
    stage.classList.remove("call", "resp");
    stage.classList.add("finale");
    showPose("hoshi", true);
    show("pgDone");
    sfx.fanfare();
    confetti.rain(4000);
    later(() => {
      show("pgDone", false);
      $("#pgCake", el).classList.remove("done");
      stage.classList.remove("finale");
      clearPose();
      rig.pose("hohoho");
      talk(G.clearTalk, () => { rig.pose("banzai"); showUnlock(3, 5); }, "🔑 カギを あける！");
    }, 3200);
  }

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
    },
    skip: () => {
      if (phase === "finale") return;
      clearInterval(ringTimer);
      show("incoming", false); show("rules", false); show("talkBox", false); show("vcWin", false); show("warpWait", false); show("warpFx", false);
      show("live");
      if (!rig) rig = new SantaRig($("#pgSanta", el));
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
  const S = CONFIG.key3;
  el.innerHTML = `
    <section class="screen s5 land">
      <div class="col col-l">
        <div class="tree-wrap" id="treeWrap">${treeSVG()}<div class="notes" id="notes"></div></div>
      </div>
      <div class="col col-r">
        <div class="mission-head"><span class="mh-num">🎉</span><span>おいわい</span></div>
        <div class="big-title">サンタさんに おれいの うたを とどけよう！</div>
        <div class="song-card" id="songTitle">🎵「${esc(S.songTitle)}」🎵</div>
        <div class="gauge">
          <div class="gauge-label">うたごえパワー <b id="gaugePct">0</b>%</div>
          <div class="gauge-bar"><div class="gauge-fill" id="gaugeFill"></div></div>
        </div>
        <button class="btn btn-red btn-xl btn-pulse" id="sing">♪ うたを はじめる！</button>
        <p class="sending hidden" id="sending">♪ みんなで いっしょに うたおう！</p>
        <div class="delivered hidden" id="delivered">すてきな うたごえが とどいたよ！</div>
      </div>
    </section>`;

  let raf = null, noteTimer = null, progress = 0, finished = false, singing = false, alive = true;
  let synth = null, src = null, customBuf = null;
  const orns = [...el.querySelectorAll(".orn")];

  // パパが 管理画面で 入れた 音源が あれば それを つかう
  (async () => {
    const blob = await store.getBlob("song");
    if (!blob || !alive) return;
    try {
      customBuf = await decodeBlob(blob);
      const t = store.load("songTitle", "");
      if (t) $("#songTitle", el).textContent = `🎵「${t}」🎵`;
    } catch (e) { customBuf = null; }
  })();

  const setProgress = p => {
    progress = Math.min(1, p);
    $("#gaugeFill", el).style.width = `${progress * 100}%`;
    $("#gaugePct", el).textContent = Math.floor(progress * 100);
    orns.forEach((o, i) => {
      const lit = progress >= (i + 1) / (ORNAMENTS.length + 1);
      if (lit && !o.classList.contains("lit")) o.classList.add("lit");
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

  const stopMusic = () => {
    cancelAnimationFrame(raf); raf = null;
    if (synth) { synth.stop(); synth = null; }
    if (src) { try { src.stop(); } catch (e) {} src = null; }
  };

  const finish = () => {
    if (finished) return; finished = true;
    stopMusic(); clearInterval(noteTimer);
    setProgress(1);
    el.querySelector(".tree-star").classList.add("lit");
    $("#treeWrap", el).classList.add("glow");
    $("#sending", el).classList.add("hidden");
    $("#delivered", el).classList.remove("hidden");
    sfx.fanfare();
    confetti.burst(window.innerWidth / 2, window.innerHeight * 0.4, 80);
    setTimeout(() => alive && goTo(6), 3000);
  };

  const begin = () => {
    if (singing) return; singing = true;
    const c = getCtx();
    $("#sing", el).classList.add("hidden");
    $("#sending", el).classList.remove("hidden");
    $("#treeWrap", el).classList.add("singing");
    noteTimer = setInterval(spawnNote, 450);
    let start, dur, schedule = null;
    if (customBuf) {
      src = c.createBufferSource();
      src.buffer = customBuf;
      src.connect(c.destination);
      start = c.currentTime + 0.1;
      src.start(start);
      dur = customBuf.duration;
    } else {
      // アプリの ジングルベル：カウント1小節 ＋ サビ×loops
      synth = createSynth();
      const spb = 60 / (S.bpm || 116);
      const bars = 1 + 16 * Math.max(1, S.loops || 2);
      start = c.currentTime + 0.2;
      dur = bars * 4 * spb;
      let sched = 0;
      schedule = () => {
        while (sched < bars && start + sched * 4 * spb < c.currentTime + 0.3) {
          const t = start + sched * 4 * spb;
          if (sched === 0) for (let b = 0; b < 4; b++) synth.count(t + b * spb, b === 3);
          else grooveBar(synth, t, spb, sched - 1, 1);
          sched++;
        }
      };
    }
    const tick = () => {
      if (!alive || finished) return;
      if (schedule) schedule();
      setProgress((c.currentTime - start) / dur);
      if (progress >= 1) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  $("#sing", el).addEventListener("click", () => { sfx.pop(); begin(); });
  return {
    cleanup: () => { alive = false; stopMusic(); clearInterval(noteTimer); },
    skip: () => { if (!singing) { singing = true; } finish(); }
  };
}

// =============================================================
//  画面6  エンディング
// =============================================================
function screen6(el) {
  const img = CONFIG.ending.finalImage ? `<img class="final-img" src="${esc(CONFIG.ending.finalImage)}" alt="">` : "";
  el.innerHTML = `
    <section class="screen s6 land">
      <div class="col col-l">
        <div class="clear-title">ミッション<br>クリア！</div>
        <div class="clear-keys"><span>🔑</span><span>🔑</span><span>🔑</span></div>
        <div class="end-santa">🎅</div>
      </div>
      <div class="col col-r">
      <div class="end-msg">${nl2br(CONFIG.ending.message)}</div>
      <div class="final-card">
        <div class="final-title">🎁 さいごの ヒント 🎁</div>
        <div class="final-hint">${nl2br(CONFIG.ending.finalHint)}</div>
        ${img}
      </div>
      <p class="guide">がめんを タッチすると かみふぶきが でるよ！</p>
      </div>
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
