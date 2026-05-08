import { reactive } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated';
const SPRITE_STATIC_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

export const store = reactive({
  masterData: null,   // { TYPES, CHART, MOVES, DEX, ABILITY_DETAILS, ABILITY_BY_POKEMON, POKEAPI_SPRITE_IDS }
  game: null,
  version: 0,
  role: (() => { const r = localStorage.getItem('pokemonBattleRole') || ''; return (r === 'A' || r === 'B') ? r : ''; })(),
  userName: '',
  parties: null,      // { ひびき: [...], くさの: [...], かいと: [...] }
  showPartyScreen: false,
  requestBusy: false,
  selectedTypeFilter: '',

  // エフェクト再生用ローカル状態
  localAnim: null,                        // { side, type: 'attack'|'hit'|'faint' }
  localBurstMove: { A: '', B: '' },       // 技名/交換/気絶
  localBurstAbility: { A: '', B: '' },    // 特性テキスト
  localEffectMessage: '',
  localEffectTags: { A: [], B: [] },      // [{ text, tone, damage? }]
  localHpOverrides: {},                   // { 'A:0': hp, ... }
  localSubstituteOverrides: {},           // { 'A:0': subHp, ... }
  localActiveOverrides: {},               // { A: index, ... }
  faintVisualReady: {},                   // { 'A:0': bool }
  seenEffectId: 0,
  seenPopupCloseId: 0,
  playingEffects: false,
  resultStampVisible: false,
  battleStartAnim: false,

  // モーダル制御
  activeModal: null,      // 'fight'|'switch'|'forceSwitch'|'details'|'typeChart'|'connectionSettings'|'battleLog'|'opponentParty'|'confirmSurrender'|'confirmSwitch'|'confirmForceSwitch'
  modalProps: {},
  modalWide: false,
  stackModal: null,       // 'details' のみ
  stackModalProps: {},
});

// --- ヘルパー ---

export function spriteUrl(name) {
  const id = store.masterData?.POKEAPI_SPRITE_IDS?.[name];
  return id ? `${SPRITE_BASE}/${id}.gif` : '';
}
export function staticSpriteUrl(name) {
  const id = store.masterData?.POKEAPI_SPRITE_IDS?.[name];
  return id ? `${SPRITE_STATIC_BASE}/${id}.png` : '';
}
export function enemy(s) { return s === 'A' ? 'B' : 'A'; }
export function abilityOfPokemon(name) { return store.masterData?.ABILITY_BY_POKEMON?.[name] || 'なし'; }

export function effectiveness(moveType, targetTypes) {
  const chart = store.masterData?.CHART;
  if (!chart) return 1;
  return targetTypes.reduce((m, t) => m * ((chart[moveType]?.[t] !== undefined) ? chart[moveType][t] : 1), 1);
}
export function effText(e) {
  if (e === 0) return '効果なし'; if (e >= 4) return '超ばつぐん'; if (e > 1) return 'ばつぐん';
  if (e === 1) return 'ふつう'; if (e <= 0.25) return '超いまひとつ'; return 'いまひとつ';
}
export function effGroupLabel(e) {
  if (e === 0) return '効果なし'; if (e >= 4) return '超ばつぐん'; if (e > 1) return 'ばつぐん';
  if (e <= 0.25) return '超いまひとつ'; if (e < 1) return 'いまひとつ'; return 'ふつう';
}
export function hpClass(pct) { return pct <= 25 ? 'low' : pct <= 50 ? 'mid' : ''; }

export function displayedActiveIndex(s) {
  return store.localActiveOverrides[s] !== undefined ? store.localActiveOverrides[s] : store.game?.active[s];
}
export function displayedHp(side, index, pokemon) {
  const key = `${side}:${index}`;
  return store.localHpOverrides[key] !== undefined ? store.localHpOverrides[key] : pokemon.hp;
}

// --- ロール ---

export function setRole(r) {
  if (r !== 'A' && r !== 'B') return;
  store.role = r;
  localStorage.setItem('pokemonBattleRole', r);
}

export function setUserName(name) {
  store.userName = name;
  localStorage.setItem('pokemonBattleUser', name);
}

// --- モーダル ---

export function openModal(type, props = {}, wide = false) {
  if (store.activeModal) {
    store.stackModal = type;
    store.stackModalProps = props;
  } else {
    store.activeModal = type;
    store.modalProps = props;
    store.modalWide = wide;
  }
}
export function closeModal() {
  store.activeModal = null;
  store.modalProps = {};
  store.modalWide = false;
  store.stackModal = null;
  store.stackModalProps = {};
}
export function closeStackModal() {
  store.stackModal = null;
  store.stackModalProps = {};
}

// --- API ---

export async function api(path, body = {}) {
  store.requestBusy = true;
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'エラーが発生しました'); return; }
    if (data.game) updateState(data.game, data.version);
  } catch (e) {
    alert('通信エラー: ' + e.message);
  } finally {
    store.requestBusy = false;
  }
}

export async function loadData() {
  const res = await fetch('/data');
  const data = await res.json();
  // DEXエントリにスプライトURLを付加
  for (const name of Object.keys(data.DEX)) {
    const id = data.POKEAPI_SPRITE_IDS[name];
    data.DEX[name].spriteUrl = id ? `${SPRITE_BASE}/${id}.gif` : '';
    data.DEX[name].staticSpriteUrl = id ? `${SPRITE_STATIC_BASE}/${id}.png` : '';
    data.DEX[name].spriteEmoji = data.DEX[name].sprite;
  }
  store.masterData = data;
}

export async function loadState() {
  const res = await fetch('/state');
  const data = await res.json();
  updateState(data.game, data.version, false);
  listen();
}

export async function fetchParties() {
  const res = await fetch('/parties');
  store.parties = await res.json();
}

export async function saveParty(user, slotIndex, name, pokemon) {
  try {
    const res = await fetch('/save-party', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, slotIndex, name, pokemon }) });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'エラーが発生しました'); return false; }
    await fetchParties();
    return true;
  } catch (e) {
    alert('通信エラー: ' + e.message);
    return false;
  }
}

export async function setActiveParty(user, slotIndex) {
  try {
    const res = await fetch('/set-active-party', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, slotIndex }) });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'エラーが発生しました'); return false; }
    await fetchParties();
    return true;
  } catch (e) {
    alert('通信エラー: ' + e.message);
    return false;
  }
}

export async function enterGame(user, side, partyIndex) {
  store.requestBusy = true;
  try {
    const res = await fetch('/enter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, side, partyIndex }) });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'エントリーエラー'); return; }
    setUserName(user);
    setRole(side);
    if (data.game) updateState(data.game, data.version);
  } catch (e) {
    alert('通信エラー: ' + e.message);
  } finally {
    store.requestBusy = false;
  }
}

export async function leaveGame(user) {
  store.requestBusy = true;
  try {
    const res = await fetch('/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user }) });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'エラーが発生しました'); return; }
    setRole('');
    if (data.game) updateState(data.game, data.version);
  } catch (e) {
    alert('通信エラー: ' + e.message);
  } finally {
    store.requestBusy = false;
  }
}

async function listen() {
  while (true) {
    try {
      const res = await fetch('/events?version=' + store.version);
      const data = await res.json();
      updateState(data.game, data.version);
    } catch {
      await sleep(1000);
    }
  }
}

function updateState(newGame, newVersion, shouldPlay = true) {
  const incomingEffectId = newGame?.effectId || 0;

  if (!newGame || newGame.mode === 'entry' || newGame.mode === 'pick' || incomingEffectId < store.seenEffectId) {
    store.seenEffectId = 0;
    store.playingEffects = false;
    store.localAnim = null;
    store.localBurstMove = { A: '', B: '' };
    store.localBurstAbility = { A: '', B: '' };
    store.localEffectMessage = '';
    store.localEffectTags = { A: [], B: [] };
    store.localHpOverrides = {};
    store.localSubstituteOverrides = {};
    store.faintVisualReady = {};
    store.resultStampVisible = false;
  }
  if (newGame && !newGame.winner) {
    store.resultStampVisible = false;
  }

  const hasNewEffects = shouldPlay && incomingEffectId > store.seenEffectId && newGame?.effects?.length;

  if (hasNewEffects) {
    // エフェクト再生前にHP・みがわりをスナップショット
    store.localHpOverrides = snapshotHp(store.game || newGame);
    store.localSubstituteOverrides = snapshotSubstitutes(store.game || newGame);
    // 気絶エフェクトがあるポケモンは、アニメーション完了まで通常表示
    for (const e of newGame.effects) {
      if (e.kind === 'faint' && e.side && e.targetIndex !== undefined) {
        store.faintVisualReady[`${e.side}:${e.targetIndex}`] = false;
      }
    }
    store.resultStampVisible = false;
  } else if (newGame?.winner && incomingEffectId <= store.seenEffectId) {
    store.resultStampVisible = true;
  }

  const incomingPopupCloseId = newGame?.popupCloseId || 0;
  if (incomingPopupCloseId > store.seenPopupCloseId) {
    closeModal();
    store.seenPopupCloseId = incomingPopupCloseId;
  }

  // エントリー完了（entry→pick）：選出画面へ遷移 + 選出BGM
  if (newGame?.mode === 'pick' && (store.game?.mode === 'entry' || store.game?.mode == null)) {
    closeModal();
    store.showPartyScreen = false;
    playBgm('バトルスタジアムスタンバイ.mp3');
  }

  // リセット検知（battle/pick → entry）：パーティ登録画面へ遷移 + センターBGM
  if (newGame?.mode === 'entry' && store.game?.mode && store.game.mode !== 'entry') {
    closeModal();
    store.showPartyScreen = true;
    playBgm('ポケモンセンター.mp3');
  }

  // バトル開始演出（pick → battle）+ バトルBGM（ユーザー設定優先）
  const isBattleStart = newGame?.mode === 'battle' && store.game?.mode === 'pick';
  if (isBattleStart) {
    store.battleStartAnim = true;
    setTimeout(() => { store.battleStartAnim = false; }, 2700);
    const userBgm = store.parties?.[store.userName]?.bgm;
    playBgm(userBgm ? `battle/${userBgm}` : 'ブルベリーグ四天王戦.mp3');
  }

  store.game = newGame;
  store.version = newVersion;

  // 両者コマンド送信済みならモーダルを閉じる
  if (newGame?.mode === 'battle' && newGame?.commands?.A && newGame?.commands?.B) closeModal();

  if (hasNewEffects && newGame?.mode === 'battle') {
    store.seenEffectId = incomingEffectId;
    if (isBattleStart) {
      // 演出が完全に終わってからエフェクト再生
      setTimeout(() => playEffects(newGame.effects), 2700);
    } else {
      playEffects(newGame.effects);
    }
  } else if (incomingEffectId > store.seenEffectId) {
    store.seenEffectId = incomingEffectId;
  }
}

// --- BGM管理 ---
let _bgm = null;
let _bgmFile = null;
let _bgmNodes = null; // { src, comp, gain }
let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  }
  if (_audioCtx?.state === 'suspended') _audioCtx.resume().catch(() => {});
  return _audioCtx;
}

// Web Audio API の DynamicsCompressor で音量を均一化（だいたい）
export function attachCompressor(audio) {
  const ctx = getAudioCtx();
  if (!ctx) return null;
  try {
    const src = ctx.createMediaElementSource(audio);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 10;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.20;
    const gain = ctx.createGain();
    gain.gain.value = 1.15; // makeup gain
    src.connect(comp);
    comp.connect(gain);
    gain.connect(ctx.destination);
    return { src, comp, gain };
  } catch { return null; }
}

function disconnectNodes(nodes) {
  if (!nodes) return;
  try { nodes.src.disconnect(); } catch {}
  try { nodes.comp.disconnect(); } catch {}
  try { nodes.gain.disconnect(); } catch {}
}

export function playBgm(relPath, loop = true) {
  if (_bgmFile === relPath && _bgm && !_bgm.paused) return; // 既に再生中
  disconnectNodes(_bgmNodes); _bgmNodes = null;
  if (_bgm) { _bgm.pause(); _bgm.currentTime = 0; _bgm = null; }
  _bgmFile = relPath;
  // サブディレクトリを含むパスを正しくエンコード（例: battle/曲名.mp3）
  const encodedPath = relPath.split('/').map(encodeURIComponent).join('/');
  _bgm = new Audio('/music/' + encodedPath);
  _bgm.loop = loop;
  _bgm.volume = 0.55;
  _bgmNodes = attachCompressor(_bgm);
  _bgm.play().catch(() => {});
}

export async function saveBgm(user, filename) {
  try {
    const res = await fetch('/save-bgm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, bgm: filename }),
    });
    if (!res.ok) return false;
    if (store.parties?.[user]) store.parties[user].bgm = filename;
    return true;
  } catch { return false; }
}

export function stopBgm() {
  if (!_bgm) return;
  _bgm.pause(); _bgm.currentTime = 0;
  _bgm = null; _bgmFile = null;
}

// BGMを一時停止（状態は保持して resumeBgm で再開可能）
export function pauseBgm() {
  if (_bgm && !_bgm.paused) _bgm.pause();
}

// 一時停止したBGMを再開
export function resumeBgm() {
  if (_bgm && _bgm.paused) _bgm.play().catch(() => {});
}

function snapshotHp(srcGame) {
  const map = {};
  if (!srcGame?.teams) return map;
  ['A', 'B'].forEach(side => (srcGame.teams[side] || []).forEach((p, i) => { map[`${side}:${i}`] = p.hp; }));
  return map;
}

function snapshotSubstitutes(srcGame) {
  const map = {};
  if (!srcGame?.teams) return map;
  ['A', 'B'].forEach(side => (srcGame.teams[side] || []).forEach((p, i) => {
    if (p.substitute > 0) map[`${side}:${i}`] = p.substitute;
  }));
  return map;
}

export function displayedSubstituteHp(side, index, pokemon) {
  const key = `${side}:${index}`;
  if (store.localSubstituteOverrides[key] !== undefined) return store.localSubstituteOverrides[key];
  return pokemon?.substitute ?? 0;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function playEffects(effects) {
  store.playingEffects = true;

  // スイッチエフェクトは最初に「交換前」ポケモンを表示するために先読み
  for (const e of effects) {
    if (e.kind === 'switch' && e.side && e.fromIndex !== undefined) {
      store.localActiveOverrides[e.side] = e.fromIndex;
    }
  }

  for (const e of effects) {
    store.localEffectMessage = e.message || '';

    if (e.kind === 'attack') {
      store.localAnim = { side: e.side, type: 'attack' };
      const abilityText = (e.abilityLabels || []).map(x => x.text).filter(Boolean).join('・');
      store.localBurstMove[e.side] = e.moveName || '';
      store.localBurstAbility[e.side] = abilityText;
      await sleep(800);
      store.localAnim = null;
      store.localBurstMove[e.side] = '';
      store.localBurstAbility[e.side] = '';
      await sleep(300);

    } else if (e.kind === 'hit') {
      store.localAnim = { side: e.side, type: 'hit' };
      store.localEffectTags[e.side] = e.labels || [];
      // タグ表示中は再描画を抑えるため、HP更新はタグ消去後に行う
      await sleep(950);
      store.localEffectTags[e.side] = [];
      store.localAnim = null;
      if (e.hpAfter !== undefined && e.targetIndex !== undefined) {
        store.localHpOverrides[`${e.side}:${e.targetIndex}`] = e.hpAfter;
      }
      await sleep(380);

    } else if (e.kind === 'miss') {
      store.localEffectTags[e.side] = [{ text: e.text || '外れた', tone: 'miss' }];
      await sleep(1050);
      store.localEffectTags[e.side] = [];
      await sleep(200);

    } else if (e.kind === 'switch') {
      if (e.fromIndex !== undefined) store.localActiveOverrides[e.side] = e.fromIndex;
      store.localBurstMove[e.side] = '交換';
      await sleep(1000);
      store.localBurstMove[e.side] = '';
      if (e.toIndex !== undefined) store.localActiveOverrides[e.side] = e.toIndex;
      else delete store.localActiveOverrides[e.side];
      await sleep(280);
      delete store.localActiveOverrides[e.side];

    } else if (e.kind === 'ability') {
      store.localEffectTags[e.side] = e.labels || [{ text: e.ability || '特性', tone: 'ability-blue' }];
      await sleep(1100);
      store.localEffectTags[e.side] = [];
      await sleep(220);

    } else if (e.kind === 'faint') {
      store.localBurstMove[e.side] = '気絶';
      if (e.hpAfter !== undefined && e.targetIndex !== undefined) {
        store.localHpOverrides[`${e.side}:${e.targetIndex}`] = e.hpAfter;
      }
      store.localAnim = { side: e.side, type: 'faint' };
      await sleep(1200);
      if (e.targetIndex !== undefined) {
        store.faintVisualReady[`${e.side}:${e.targetIndex}`] = true;
      }
      store.localAnim = null;
      store.localBurstMove[e.side] = '';
      await sleep(300);

    } else if (e.kind === 'status') {
      const STATUS_NAMES = { brn: 'やけど', par: 'まひ', psn: 'どく', tox: 'もうどく', slp: 'ねむり', frz: 'こおり' };
      if (e.status) {
        store.localEffectTags[e.side] = [{ text: STATUS_NAMES[e.status] || e.status, tone: 'status-' + e.status }];
      } else {
        store.localEffectTags[e.side] = [{ text: '回復！', tone: 'heal' }];
      }
      await sleep(1100);
      store.localEffectTags[e.side] = [];
      await sleep(220);

    } else if (e.kind === 'stat') {
      store.localEffectTags[e.side] = e.labels || [{ text: '能力変化', tone: 'ability-blue' }];
      await sleep(1000);
      store.localEffectTags[e.side] = [];
      await sleep(200);

    } else if (e.kind === 'damage') {
      // ダメージ系（回復含む）: HPバー更新 + 簡易タグ表示
      store.localAnim = { side: e.side, type: 'hit' };
      if (e.labels) {
        store.localEffectTags[e.side] = e.labels;
      }
      await sleep(850);
      store.localEffectTags[e.side] = [];
      store.localAnim = null;
      if (e.hpAfter !== undefined && e.targetIndex !== undefined) {
        store.localHpOverrides[`${e.side}:${e.targetIndex}`] = e.hpAfter;
      }
      await sleep(320);

    } else if (e.kind === 'substitute-break') {
      store.localEffectTags[e.side] = [{ text: 'みがわり消滅！', tone: 'ability-blue' }];
      await sleep(1000);
      store.localEffectTags[e.side] = [];
      await sleep(200);
      if (e.targetIndex !== undefined) {
        store.localSubstituteOverrides[`${e.side}:${e.targetIndex}`] = 0;
      }

    } else {
      await sleep(900);
    }
  }

  store.localEffectMessage = '';
  store.localEffectTags = { A: [], B: [] };
  store.playingEffects = false;
  store.localHpOverrides = {};
  store.localSubstituteOverrides = {};
  store.localActiveOverrides = {};
  if (store.game?.winner) {
    store.resultStampVisible = true;
    playBgm('ジムリーダーに勝利.mp3', false);
  }

  // 気絶・ピボット技による強制交代：自分のサイドなら自動でポップアップ表示
  if (store.game?.forceSwitch && store.game.forceSwitch === store.role) {
    openModal('forceSwitch');
  }
}
