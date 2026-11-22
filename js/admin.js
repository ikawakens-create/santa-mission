// =============================================================
//  admin.js  パパ用 隠し管理画面 ／ 隠し早送り
//   ・左上ロゴを3秒長押し → 暗証番号 → 管理画面
//   ・左上ロゴ ＋ 右下コーナーを 同時に2秒長押し → 早送り／強制クリア
// =============================================================
import { CONFIG } from "../config.js";
import * as store from "./storage.js";
import { getCtx, decodeBlob } from "./audio.js";
import { createSynth } from "./posegame.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SCREEN_NAMES = ["0 スタート", "1 メール", "2 カギ①", "3 カギ②", "4 ワープ＋カギ③", "5 おいわいの うた", "6 エンディング"];

let api = null;
const root = () => $("#admin-root");

export function initAdmin(appApi) {
  api = appApi;
  const logo = $("#logo");
  const br = $("#corner-br");
  const down = { tl: new Set(), br: new Set() };
  const downAt = {};
  let adminTimer = null, skipTimer = null, skipFired = false;

  const both = () => down.tl.size > 0 && down.br.size > 0;
  const clearTimers = () => { clearTimeout(adminTimer); clearTimeout(skipTimer); adminTimer = skipTimer = null; };

  const onChange = () => {
    if (both()) {
      clearTimeout(adminTimer); adminTimer = null;
      if (!skipTimer) {
        skipTimer = setTimeout(() => {
          skipTimer = null;
          if (both()) { skipFired = true; flashCorner(); api.skip(); }
        }, 2000);
      }
    } else {
      clearTimeout(skipTimer); skipTimer = null;
    }
  };

  const bind = (el, key) => {
    el.addEventListener("pointerdown", e => {
      e.preventDefault();
      if (!down.tl.size && !down.br.size) skipFired = false;
      downAt[e.pointerId] = performance.now();
      down[key].add(e.pointerId);
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      if (key === "tl" && !both()) {
        clearTimeout(adminTimer);
        adminTimer = setTimeout(() => { adminTimer = null; if (!both() && down.tl.size) openPin(); }, 3000);
      }
      onChange();
    });
    const up = e => {
      if (!down[key].has(e.pointerId)) return;
      down[key].delete(e.pointerId);
      // みじかい 1かいタップ（もう片方は おしていない）
      const other = key === "tl" ? down.br : down.tl;
      if (e.type === "pointerup" && !skipFired && !other.size && performance.now() - (downAt[e.pointerId] || 0) < 450) {
        api.cornerTap && api.cornerTap();
      }
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

function close() {
  if (window.__stopSongPreview) { window.__stopSongPreview(); window.__stopSongPreview = null; }
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
        <p class="a-note">進行状況とカギ①のミス回数だけ消します（名前・完成図は残ります）。</p>
        <button class="a-btn a-danger" id="aReset">最初からリセット</button>
      </section>

      <section class="a-sec">
        <h3>3. 画面ジャンプ</h3>
        <div class="a-grid">${SCREEN_NAMES.map((n, i) => `<button class="a-btn" data-jump="${i}">${n}</button>`).join("")}</div>
      </section>

      <section class="a-sec">
        <h3>4. 現在のステージを強制クリア</h3>
        <p class="a-note">本番中は「左上ロゴ＋右下の角を同時に2秒長押し」でも同じことができます。<br>
        まねまねポーズでは、ゲームを飛ばしてケーキ完成の場面に進みます。</p>
        <button class="a-btn a-primary" id="aSkip">強制クリア</button>
      </section>

      <section class="a-sec">
        <h3>5. 完成図エディタ</h3>
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
      <section class="a-sec">
        <h3>6. おいわいの うた（音源）</h3>
        <p class="a-note">何も入れなければ、アプリに入っている「${esc(CONFIG.key3.songTitle)}」が流れます。
        好きな音源（mp3など）を入れると、それに差しかわります。音源はこのスマホの中だけに保存され、GitHubには上がりません。</p>
        <div class="a-row"><input type="file" accept="audio/*" id="aSongFile"></div>
        <label class="a-row">曲名 <input type="text" class="a-input" id="aSongTitle" placeholder="例：あわてんぼうの サンタクロース" value="${esc(store.load("songTitle", ""))}"></label>
        <div class="a-row">
          <button class="a-btn a-primary" id="aSongSave">音源を保存</button>
          <button class="a-btn" id="aSongPlay">▶ 試聴</button>
          <button class="a-btn a-danger a-small" id="aSongDel">音源を消して元に戻す</button>
        </div>
      </section>

      <section class="a-sec">
        <h3>7. テレビの ズレ調整（まねまねポーズ）</h3>
        <p class="a-note">テレビにつないだ状態で「テスト」を押し、「ポン」という音と●の光るタイミングを比べてください。
        光るのが音より遅いときは −（はやく）、早いときは ＋（おそく）に動かします。</p>
        <div class="a-row">
          <span>はやく</span><input type="range" min="-400" max="400" step="20" id="aOffset" class="a-dial" value="${Number(store.load("videoOffsetMs", 0)) || 0}"><span>おそく</span>
          <b id="aOffsetVal"></b>
        </div>
        <div class="a-row">
          <button class="a-btn" id="aSyncTest">▶ テスト（8拍）</button>
          <span class="a-sync-dot" id="aSyncDot"></span>
        </div>
      </section>
      <div class="a-foot">左上ロゴ3秒長押し＋PINでいつでも開けます</div>
    </div>`;

  const changed = { names: false, sil: false };
  const status = async () => {
    const sil = store.load("silhouette", null);
    const hasSil = !!(sil && sil.rows && sil.rows.some(r => r.includes("1")));
    const hasSong = !!(await store.getBlob("song"));
    if (!$("#aStatus")) return;
    $("#aStatus").innerHTML = `
      <span class="badge ${hasSil ? "ok" : "ng"}">完成図：${hasSil ? "あり" : "なし"}</span>
      <span class="badge ${hasSong ? "ok" : ""}">歌：${hasSong ? "差しかえ音源" : "アプリのジングルベル"}</span>
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

  // 6. おいわいの うた
  let songPreview = null;
  const stopPreview = () => { if (songPreview) { try { songPreview.stop(); } catch (e) {} songPreview = null; $("#aSongPlay").textContent = "▶ 試聴"; } };
  window.__stopSongPreview = stopPreview;
  const songStatus = () => status();
  $("#aSongSave").onclick = async () => {
    const f = $("#aSongFile").files[0];
    store.save("songTitle", $("#aSongTitle").value.trim());
    if (f) {
      try { await decodeBlob(f); } catch (e) { alert("この音源は読み込めませんでした。mp3 などで試してください。"); return; }
      await store.saveBlob("song", f);
    }
    toast(f ? "音源を保存しました" : "曲名を保存しました");
    songStatus();
  };
  $("#aSongPlay").onclick = async () => {
    if (songPreview) { stopPreview(); return; }
    const b = await store.getBlob("song");
    if (!b) { toast("差しかえ音源がありません（本番はアプリのジングルベルが流れます）"); return; }
    const c = getCtx(); try { await c.resume(); } catch (e) {}
    const buf = await decodeBlob(b);
    const s = c.createBufferSource(); s.buffer = buf; s.connect(c.destination); s.start();
    songPreview = s; $("#aSongPlay").textContent = "■ 停止";
    s.onended = () => stopPreview();
  };
  $("#aSongDel").onclick = async () => {
    if (!confirm("差しかえ音源を消して、アプリのジングルベルに戻しますか？")) return;
    stopPreview();
    await store.deleteBlob("song");
    toast("アプリのジングルベルに戻しました");
    songStatus();
  };

  // 7. テレビの ズレ調整
  const off = $("#aOffset");
  const showOff = () => { $("#aOffsetVal").textContent = `${off.value > 0 ? "+" : ""}${off.value}ミリ秒`; };
  showOff();
  off.oninput = () => { showOff(); store.save("videoOffsetMs", Number(off.value)); };
  $("#aSyncTest").onclick = async () => {
    const c = getCtx(); try { await c.resume(); } catch (e) {}
    const synth = createSynth();
    const spb = 0.5, t0 = c.currentTime + 0.3;
    const lat = Math.min(0.2, (c.outputLatency || 0) + (c.baseLatency || 0) || 0.04) + Number(off.value) / 1000;
    const dot = $("#aSyncDot");
    for (let i = 0; i < 8; i++) {
      synth.count(t0 + i * spb, i % 4 === 0);
      const wait = (t0 + i * spb + lat - c.currentTime) * 1000;
      setTimeout(() => { if (!dot.isConnected) return; dot.classList.remove("on"); void dot.offsetWidth; dot.classList.add("on"); }, Math.max(0, wait));
    }
    setTimeout(() => synth.stop(), 5000);
  };

  // 5. 完成図エディタ
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
