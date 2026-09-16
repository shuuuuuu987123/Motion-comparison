'use strict';
// ===== 格ゲー技比較ツール Java版：比較ページのロジック =====
// HTML版で検証済みの同期制御（同期点→確定→共通タイムライン→自動補正）を移植

const videoA = document.getElementById('videoA');
const videoB = document.getElementById('videoB');
const offA = document.getElementById('offA');
const offB = document.getElementById('offB');
const btnAConfirm = document.getElementById('btnAConfirm');
const btnBConfirm = document.getElementById('btnBConfirm');
const btnAClear = document.getElementById('btnAClear');
const btnBClear = document.getElementById('btnBClear');
const btnPlay = document.getElementById('btnPlay');
const btnRestart = document.getElementById('btnRestart');
const btnAutoStep = document.getElementById('btnAutoStep');
const btnPause = document.getElementById('btnPause');
const autoSec = document.getElementById('autoSec');
const loopOn = document.getElementById('loopOn');
const loopSec = document.getElementById('loopSec');
const fpsInput = document.getElementById('fps');
const frameInfo = document.getElementById('frameInfo');

const SLOT_IDS = { A: videoA.dataset.vid, B: videoB.dataset.vid };
const lsKey = s => 'kakuge_sync_' + SLOT_IDS[s];

const offset = { A: 0, B: 0 };
const confirmed = { A: false, B: false };
let syncT = 0;
let playing = false;
let playMode = 'none'; // 'sync' | 'auto' | 'none'
let playStartAt = 0;
let syncTStart = 0;
let corrTimer = null;
let autoMode = false;
let autoRAF = null;
let autoLastStep = 0;
let autoIntervalMs = 500;
let lastProgSeek = 0;
const playRetrying = { A: false, B: false };

function getFps() {
  const f = parseFloat(fpsInput.value);
  return (f && f > 0) ? f : 60;
}
function getFrame() { return 1 / getFps(); }
function durationOf(v) { const d = v.duration; return (d && isFinite(d)) ? d : null; }
function slotVideo(s) { return s === 'A' ? videoA : videoB; }

function persist(slot) {
  try {
    if (confirmed[slot]) localStorage.setItem(lsKey(slot), String(offset[slot]));
    else localStorage.removeItem(lsKey(slot));
  } catch (e) {}
}

function updateBadges() {
  [['A', offA], ['B', offB]].forEach(([s, el]) => {
    const o = offset[s];
    if (confirmed[s]) {
      el.textContent = '確定済み ✓ 同期点 ' + o.toFixed(2) + '秒 (' + Math.round(o * getFps()) + 'f)';
      el.className = 'offset-badge';
    } else if (o > 0) {
      el.textContent = '候補 ' + o.toFixed(2) + '秒（未確定）';
      el.className = 'offset-badge offset-off';
    } else {
      el.textContent = '同期点 未設定';
      el.className = 'offset-badge offset-off';
    }
  });
}
function updateConfirmButtons() {
  btnAConfirm.textContent = confirmed.A ? '確定済み ✓' : '押して確定';
  btnAConfirm.className = confirmed.A ? 'confirmed' : 'unconfirmed';
  btnBConfirm.textContent = confirmed.B ? '確定済み ✓' : '押して確定';
  btnBConfirm.className = confirmed.B ? 'confirmed' : 'unconfirmed';
}
function updateFrameInfo() {
  const txt = ['A', 'B'].map(s => {
    const v = slotVideo(s);
    if (!v.src) return s + ':-';
    return s + ':' + Math.round((v.currentTime - offset[s]) * getFps()) + 'f';
  }).join(' / ');
  frameInfo.textContent = '同期点から ' + txt;
}

// 共通タイムラインを両動画へ適用
function applySyncT(t) {
  [['A', videoA], ['B', videoB]].forEach(([s, v]) => {
    if (!v.src) return;
    let target = offset[s] + t;
    const d = durationOf(v);
    if (d !== null && target > d) target = d;
    if (target < 0) target = 0;
    try { v.currentTime = target; } catch (e) {}
    lastProgSeek = performance.now();
  });
  updateFrameInfo();
}

// A/Bそれぞれ独立に再生開始（失敗時は読み込み完了を待って再試行）
function attemptPlay(v, slot) {
  if (!v.src) return;
  if (playRetrying[slot]) return;
  const p = v.play();
  if (p && typeof p.catch === 'function') {
    p.catch(() => {
      playRetrying[slot] = true;
      const retry = () => {
        playRetrying[slot] = false;
        if (v.error || !playing) return;
        try { v.currentTime = offset[slot] + syncT; } catch (e) {}
        lastProgSeek = performance.now();
        v.play().catch(() => {});
      };
      if (v.readyState >= 3) retry();
      else {
        v.addEventListener('loadeddata', retry, { once: true });
        v.addEventListener('canplay', retry, { once: true });
        setTimeout(() => { if (!v.error && v.readyState >= 3 && playing) retry(); }, 2500);
      }
    });
  }
}

// 再生に関する全リソースを必ずリセット（2回目再生バグの対策）
function stopAll() {
  playing = false;
  playMode = 'none';
  if (corrTimer) { clearInterval(corrTimer); corrTimer = null; }
  if (autoRAF) { cancelAnimationFrame(autoRAF); autoRAF = null; }
  autoMode = false;
  playRetrying.A = false;
  playRetrying.B = false;
  try { videoA.pause(); } catch (e) {}
  try { videoB.pause(); } catch (e) {}
}

function guard() {
  const need = ['A', 'B'].filter(s => slotVideo(s).src && !confirmed[s]);
  if (need.length) {
    alert('動画' + need.join('・') + ' の【確定】を押してください。');
    return false;
  }
  return true;
}

function loopEndSeconds() {
  if (loopOn.checked) {
    const s = parseFloat(loopSec.value);
    if (s && s > 0) return s;
  }
  // 共通タイムライン上の残り = min(各動画の残り)
  const la = (durationOf(videoA) ?? 0) - offset.A;
  const lb = (durationOf(videoB) ?? 0) - offset.B;
  const m = Math.min(la, lb);
  return m > 0 ? m : 0;
}

function startSync(fromStart) {
  if (!guard()) return;
  stopAll();
  if (fromStart || videoA.ended || videoB.ended) syncT = 0;
  playing = true;
  playMode = 'sync';
  syncTStart = syncT;
  playStartAt = performance.now();
  applySyncT(syncT);
  attemptPlay(videoA, 'A');
  attemptPlay(videoB, 'B');
  corrTimer = setInterval(correctionTick, 60);
}

function startAutoStep() {
  if (!guard()) return;
  stopAll();
  if (videoA.ended || videoB.ended) syncT = 0;
  autoMode = true;
  playMode = 'auto';
  autoIntervalMs = Math.max(0.03, (parseFloat(autoSec.value) || 0.5)) * 1000;
  applySyncT(syncT);
  autoLastStep = performance.now();
  autoRAF = requestAnimationFrame(autoStepTick);
}

function autoStepTick(now) {
  if (!autoMode) return;
  if (now - autoLastStep >= autoIntervalMs) {
    const endT = loopEndSeconds();
    let next = syncT + getFrame();
    if (endT > 0 && next > endT) {
      if (loopOn.checked) next = 0;
      else { syncT = endT; applySyncT(syncT); stopAll(); return; }
    }
    syncT = next;
    applySyncT(syncT);
    autoLastStep = now;
  }
  autoRAF = requestAnimationFrame(autoStepTick);
}

function pauseAll() { stopAll(); }

function correctionTick() {
  if (!playing || playMode !== 'sync') return;
  const now = performance.now();
  syncT = syncTStart + (now - playStartAt) / 1000;
  const endT = loopEndSeconds();
  if (endT > 0 && syncT > endT + 0.05) {
    if (loopOn.checked) {
      syncT = 0;
      syncTStart = 0;
      playStartAt = performance.now();
      applySyncT(0);
      [['A', videoA], ['B', videoB]].forEach(([s, v]) => {
        if (v.src && (v.paused || v.ended)) attemptPlay(v, s);
      });
    } else {
      pauseAll();
      return;
    }
  }
  [['A', videoA], ['B', videoB]].forEach(([s, v]) => {
    if (!v.src) return;
    const target = offset[s] + syncT;
    const d = durationOf(v);
    if (d !== null && target > d) return;
    if (Math.abs(v.currentTime - target) > 0.05) {
      try { v.currentTime = target; } catch (e) {}
      lastProgSeek = performance.now();
    }
    if (v.paused && !v.error) attemptPlay(v, s);
  });
  updateFrameInfo();
}

// シークバーで止めた位置＝同期点の候補（未確定）
function bindSeekFollow(v, slot) {
  v.addEventListener('seeked', () => {
    if (performance.now() - lastProgSeek < 600) return;
    if (!v.paused) return;
    const d = durationOf(v);
    let t = v.currentTime;
    if (d !== null && d > 0 && t > d - 0.02) t = Math.max(0, d - 0.02);
    offset[slot] = t;
    confirmed[slot] = false;
    syncT = 0;
    persist(slot);
    updateBadges();
    updateConfirmButtons();
    updateFrameInfo();
  });
}

function confirmSlot(slot) {
  const v = slotVideo(slot);
  const d = durationOf(v);
  let t = v.currentTime;
  if (d !== null && d > 0 && t > d - 0.02) t = Math.max(0, d - 0.02);
  offset[slot] = t;
  confirmed[slot] = true;
  syncT = 0;
  applySyncT(0);
  persist(slot);
  updateBadges();
  updateConfirmButtons();
  updateFrameInfo();
}

function adjustSlot(slot, deltaFrames) {
  const v = slotVideo(slot);
  const d = durationOf(v);
  let t = offset[slot] + deltaFrames * getFrame();
  if (d !== null) t = Math.min(Math.max(t, 0), Math.max(0, d - 0.02));
  offset[slot] = t;
  confirmed[slot] = false;
  syncT = 0;
  applySyncT(0);
  persist(slot);
  updateBadges();
  updateConfirmButtons();
  updateFrameInfo();
}

function clearSlot(slot) {
  offset[slot] = 0;
  confirmed[slot] = false;
  syncT = 0;
  persist(slot);
  const v = slotVideo(slot);
  try { v.currentTime = 0; } catch (e) {}
  lastProgSeek = performance.now();
  updateBadges();
  updateConfirmButtons();
  updateFrameInfo();
}

btnAConfirm.addEventListener('click', () => confirmSlot('A'));
btnBConfirm.addEventListener('click', () => confirmSlot('B'));
btnAClear.addEventListener('click', () => clearSlot('A'));
btnBClear.addEventListener('click', () => clearSlot('B'));
document.getElementById('btnA3Back').addEventListener('click', () => adjustSlot('A', -3));
document.getElementById('btnA3Fwd').addEventListener('click', () => adjustSlot('A', 3));
document.getElementById('btnABack').addEventListener('click', () => adjustSlot('A', -1));
document.getElementById('btnAFwd').addEventListener('click', () => adjustSlot('A', 1));
document.getElementById('btnB3Back').addEventListener('click', () => adjustSlot('B', -3));
document.getElementById('btnB3Fwd').addEventListener('click', () => adjustSlot('B', 3));
document.getElementById('btnBBack').addEventListener('click', () => adjustSlot('B', -1));
document.getElementById('btnBFwd').addEventListener('click', () => adjustSlot('B', 1));

btnPlay.addEventListener('click', () => startSync(false));
btnRestart.addEventListener('click', () => startSync(true));
btnAutoStep.addEventListener('click', startAutoStep);
btnPause.addEventListener('click', pauseAll);

// キーボード ← / → で比較タイムラインを1フレーム移動
document.addEventListener('keydown', e => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  e.preventDefault();
  if (!confirmed.A || !confirmed.B) return;
  stopAll();
  syncT = Math.max(0, syncT + (e.key === 'ArrowRight' ? 1 : -1) * getFrame());
  applySyncT(syncT);
});

// 初期化：保存済みの同期点があれば復元
['A', 'B'].forEach(s => {
  bindSeekFollow(slotVideo(s), s);
  try {
    const raw = localStorage.getItem(lsKey(s));
    if (raw !== null) {
      const t = parseFloat(raw);
      if (t > 0) { offset[s] = t; confirmed[s] = true; }
    }
  } catch (e) {}
});
if (confirmed.A || confirmed.B) applySyncT(0);
updateBadges();
updateConfirmButtons();
updateFrameInfo();
