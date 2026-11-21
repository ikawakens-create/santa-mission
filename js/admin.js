// =============================================================
//  admin.js  パパ用 隠し管理画面 ／ 隠し早送り
//   ・左上ロゴを3秒長押し → 暗証番号 → 管理画面
//   ・左上ロゴ ＋ 右下コーナーを 同時に2秒長押し → 早送り／強制クリア
// =============================================================
import { CONFIG } from "../config.js";
import * as store from "./storage.js";
import { startRecording, decodeBlob, VoicePlayer, ZONES, zoneOf, getDemoVoice } from "./audio.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SCREEN_NAMES = ["0 スタート", "1 メール", "2 カギ①", "3 カギ②", "4 こえ", "5 カギ③", "6 エンディング"];

let api = null;
const root = () => $("#admin-root");

export function initAdmin(appApi) {
  api = appApi;
  const logo = $("#logo");
  const br = $("#corner-br");
  const down = { tl: new Set(), br: new Set() };
  let adminTimer = null, skipTimer = null;

  const both = () => down.tl.size > 0 && down.br.size > 0;
  const clearTimers = () => { clearTimeout(adminTimer); clearTimeout(skipTimer); adminTimer = skipTimer = null; };

  const onChange = () => {
    if (both()) {
      clearTimeout(adminTimer); adminTimer = null;
      if (!skipTimer) {
        skipTimer = setTimeout(() => {
          skipTimer = null;
          if (both()) { flashCorner(); api.skip(); }
        }, 2000);
      }
    } else {
      clearTimeout(skipTimer); skipTimer = null;
    }
  };

  const bind = (el, key) => {
    el.addEventListener("pointerdown", e => {
      e.preventDefault();
      down[key].add(e.pointerId);
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      if (key === "tl" && !both()) {
        clearTimeout(adminTimer);
        adminTimer = setTimeout(() => { adminTimer = null; if (!both() && down.tl.size) openPin(); }, 3000);
      }
      onChange();
    });
    const up = e => {
      down[key].delete(e.pointerId);
      if (key === "tl") { clearTimeout(adminTimer); adminTimer = null; }
      onChange();
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
  };
  bind(logo, "tl");
  bind(br, "br");
  window.addEventListener("blur", () => { down.tl.clear(); down.br.clear(); clearTimers(); });
}

function flashCorner() {
  const f = document.createElement("div");
  f.className = "skip-flash";
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 500);
}

// ---------- 暗証番号 ----------
function openPin() {
  if (root().childElementCount) return;
  try { navigator.vibrate && navigator.vibrate(30); } catch (e) { /* noop */ }
  root().innerHTML = `
    <div class="pin-modal">
      <div class="pin-card" id="pinCard">
        <div class="pin-title">🔐 あんしょうばんごう</div>
        <div class="pin-dots" id="pinDots"><i></i><i></i><i></i><i></i></div>
        <div class="pin-pad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${n}</button>`).join("")}
          <button data-act="cancel" class="pin-cancel">やめる</button>
          <button data-n="0">0</button>
          <button data-act="del">←</button>
        </div>
      </div>
    </div>`;
  let pin = "";
  const dots = () => $("#pinDots").querySelectorAll("i").forEach((d, i) => d.classList.toggle("on", i < pin.length));
  root().querySelector(".pin-pad").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.act === "cancel") { close(); return; }
    if (b.dataset.act === "del") { pin = pin.slice(0, -1); dots(); return; }
    pin += b.dataset.n; dots();
    if (pin.length === 4) {
      if (pin === String(CONFIG.adminPin)) { openPanel(); }
      else {
        const card = $("#pinCard");
        card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
        setTimeout(() => { pin = ""; dots(); }, 400);
      }
    }
  });
}

let testPlayer = null;
let recorder = null;
let recTimer = null;

function close() {
  if (testPlayer) { testPlayer.dispose(); testPlayer = null; }
  if (recorder) { recorder.stop(); recorder = null; }
  clearInterval(recTimer);
  root().innerHTML = "";
}

// ---------- 管理画面 ----------
async function openPanel() {
  const names = store.load("names", []);
  const hints = CONFIG.key1.hints;
  root().innerHTML = `
    <div class="admin">
      <div class="admin-head">
        <b>🛠 管理画面</b>
        <button class="a-btn" id="aClose">閉じる</button>
      </div>
      <div class="a-status" id="aStatus"></div>

      <section class="a-sec">
        <h3>1. なまえ設定</h3>
        <p class="a-note">ここに入れた名前はこのスマホの中だけに保存されます（公開されません）。空欄はconfig.jsの仮名を使います。</p>
        ${hints.map((h, i) => `
          <label class="a-row">${i + 1}.
            <input type="text" class="a-input" data-i="${i}" value="${esc(names[i] || "")}" placeholder="${esc(h.defaultName)}（例：はなちゃん）">
          </label>`).join("")}
        <button class="a-btn a-primary" id="aSaveNames">名前を保存</button>
      </section>

      <section class="a-sec">
        <h3>2. 最初からリセット</h3>
        <p class="a-note">進行状況とカギ①のミス回数だけ消します（名前・録音・完成図は残ります）。</p>
        <button class="a-btn a-danger" id="aReset">最初からリセット</button>
      </section>

      <section class="a-sec">
        <h3>3. 画面ジャンプ</h3>
        <div class="a-grid">${SCREEN_NAMES.map((n, i) => `<button class="a-btn" data-jump="${i}">${n}</button>`).join("")}</div>
      </section>

      <section class="a-sec">
        <h3>4. 現在のステージを強制クリア</h3>
        <p class="a-note">本番中は「左上ロゴ＋右下の角を同時に2秒長押し」でも同じことができます。</p>
        <button class="a-btn a-primary" id="aSkip">強制クリア</button>
      </section>

      <section class="a-sec">
        <h3>5. サンタの声 録音スタジオ</h3>
        <p class="a-note">※すこし早口で話すと、正解ゾーン（0.8倍速）でちょうどよい低い声になります。<br>
        話す曲名は「${esc(CONFIG.key3.songTitle)}」にそろえてください。</p>
        <div class="a-rec">
          <button class="a-btn a-rec-btn" id="aRec">● 録音開始</button>
          <span id="aRecTime"></span>
        </div>
        <label class="a-row a-switch"><input type="checkbox" id="aFx" ${store.load("santaFx", true) ? "checked" : ""}> サンタ風加工（正解ゾーンで0.8倍速＋エコー）</label>
        <div class="a-test">
          <button class="a-btn" id="aPlay">▶ テスト再生</button>
          <input type="range" min="0" max="100" value="50" id="aDial" class="a-dial">
          <span id="aZone"></span>
        </div>
        <button class="a-btn a-danger a-small" id="aDelRec">録音を削除</button>
      </section>

      <section class="a-sec">
        <h3>6. 完成図エディタ</h3>
        <p class="a-note">実物のピース5個で先に組んでから、その形をなぞってください。マスをタップでON/OFF。</p>
        <div class="a-row">
          <button class="a-btn" data-size="8x6">8×6</button>
          <button class="a-btn" data-size="6x6">6×6</button>
          <span id="aCellCount" class="a-note"></span>
        </div>
        <div class="a-editor" id="aEditor"></div>
        <div class="a-row">
          <button class="a-btn" id="aClearSil">全部けす</button>
          <button class="a-btn a-primary" id="aSaveSil">完成図を保存</button>
        </div>
      </section>
      <div class="a-foot">左上ロゴ3秒長押し＋PINでいつでも開けます</div>
    </div>`;

  const changed = { names: false, sil: false };
  const status = async () => {
    const hasVoice = !!(await store.getVoiceBlob());
    const sil = store.load("silhouette", null);
    const hasSil = !!(sil && sil.rows && sil.rows.some(r => r.includes("1")));
    $("#aStatus").innerHTML = `
      <span class="badge ${hasVoice ? "ok" : "ng"}">録音：${hasVoice ? "あり" : "なし"}</span>
      <span class="badge ${hasSil ? "ok" : "ng"}">完成図：${hasSil ? "あり" : "なし"}</span>
      <span class="badge">現在：${SCREEN_NAMES[api.getStage()]}</span>`;
  };
  status();

  $("#aClose").onclick = () => { close(); if (changed.names || changed.sil) api.refresh(); };

  // 1. なまえ
  $("#aSaveNames").onclick = () => {
    const vals = [...root().querySelectorAll(".a-input")].map(i => i.value.trim());
    store.save("names", vals);
    changed.names = true;
    toast("名前を保存しました");
  };

  // 2. リセット
  $("#aReset").onclick = () => {
    if (!confirm("最初（スタート画面）に戻します。よろしいですか？")) return;
    close(); api.reset();
  };

  // 3. ジャンプ
  root().querySelectorAll("[data-jump]").forEach(b => b.onclick = () => { close(); api.goTo(Number(b.dataset.jump)); });

  // 4. 強制クリア
  $("#aSkip").onclick = () => { close(); if (changed.names || changed.sil) api.refresh(); api.skip(); };

  // 5. 録音
  const recBtn = $("#aRec");
  recBtn.onclick = async () => {
    if (!recorder) {
      try {
        await api.ensureAudio();
        if (testPlayer) { testPlayer.dispose(); testPlayer = null; $("#aPlay").textContent = "▶ テスト再生"; }
        recorder = await startRecording();
        recBtn.textContent = "■ 録音停止";
        recBtn.classList.add("recording");
        const t0 = Date.now();
        recTimer = setInterval(() => { $("#aRecTime").textContent = `${((Date.now() - t0) / 1000).toFixed(1)} 秒`; }, 100);
      } catch (e) {
        alert("マイクが使えませんでした。マイクの権限を確認してください。\n" + e.message);
      }
    } else {
      const r = recorder; recorder = null;
      clearInterval(recTimer);
      recBtn.textContent = "● 録音開始";
      recBtn.classList.remove("recording");
      const blob = await r.stop();
      if (blob && blob.size > 0) {
        await store.saveVoiceBlob(blob);
        toast("録音を保存しました");
        status();
      } else {
        toast("録音できませんでした");
      }
    }
  };

  $("#aFx").onchange = e => {
    store.save("santaFx", e.target.checked);
    if (testPlayer) { testPlayer.dispose(); testPlayer = null; $("#aPlay").textContent = "▶ テスト再生"; }
  };

  const dial = $("#aDial");
  const showZone = () => { const z = ZONES[zoneOf(Number(dial.value))]; $("#aZone").textContent = `${z.emoji} ${dial.value}%`; };
  showZone();
  dial.oninput = () => { showZone(); if (testPlayer) testPlayer.setPosition(Number(dial.value)); };

  $("#aPlay").onclick = async () => {
    if (testPlayer && testPlayer.playing) {
      testPlayer.stop(); $("#aPlay").textContent = "▶ テスト再生"; return;
    }
    await api.ensureAudio();
    if (!testPlayer) {
      const blob = await store.getVoiceBlob();
      let buf = null;
      if (blob) { try { buf = await decodeBlob(blob); } catch (e) { alert("録音データを読み込めませんでした"); } }
      if (!buf) { buf = await getDemoVoice(); toast("録音がないので見本の声で再生します"); }
      testPlayer = new VoicePlayer(buf, { santaFx: $("#aFx").checked });
    }
    testPlayer.setPosition(Number(dial.value), true);
    testPlayer.start(0);
    $("#aPlay").textContent = "■ 停止";
  };

  $("#aDelRec").onclick = async () => {
    if (!confirm("録音を削除しますか？")) return;
    if (testPlayer) { testPlayer.dispose(); testPlayer = null; $("#aPlay").textContent = "▶ テスト再生"; }
    await store.deleteVoiceBlob();
    toast("録音を削除しました"); status();
  };

  // 6. 完成図エディタ
  const saved = store.load("silhouette", null);
  let grid = saved && saved.rows ? saved.rows.map(r => r.split("").map(c => c === "1")) : makeGrid(8, 6);
  const renderEditor = () => {
    const cols = grid[0].length;
    const ed = $("#aEditor");
    ed.style.setProperty("--cols", cols);
    ed.innerHTML = grid.map((row, y) => row.map((on, x) => `<button class="a-cell ${on ? "on" : ""}" data-x="${x}" data-y="${y}"></button>`).join("")).join("");
    const count = grid.flat().filter(Boolean).length;
    $("#aCellCount").textContent = `ぬったマス：${count}`;
  };
  renderEditor();
  $("#aEditor").addEventListener("click", e => {
    const c = e.target.closest(".a-cell"); if (!c) return;
    const x = +c.dataset.x, y = +c.dataset.y;
    grid[y][x] = !grid[y][x];
    renderEditor();
  });
  root().querySelectorAll("[data-size]").forEach(b => b.onclick = () => {
    const [w, h] = b.dataset.size.split("x").map(Number);
    if (grid.flat().some(Boolean) && !confirm("サイズを変えると今の図は消えます。よろしいですか？")) return;
    grid = makeGrid(w, h); renderEditor();
  });
  $("#aClearSil").onclick = () => { grid = makeGrid(grid[0].length, grid.length); renderEditor(); };
  $("#aSaveSil").onclick = () => {
    store.save("silhouette", { rows: grid.map(r => r.map(v => (v ? "1" : "0")).join("")) });
    changed.sil = true;
    toast("完成図を保存しました"); status();
  };
}

function makeGrid(w, h) { return Array.from({ length: h }, () => Array(w).fill(false)); }

function toast(msg) {
  const t = document.createElement("div");
  t.className = "a-toast"; t.textContent = msg;
  root().appendChild(t);
  setTimeout(() => t.remove(), 1800);
}
