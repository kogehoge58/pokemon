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
  bgmUserPaused: false,  // ユーザーが手動で一時停止中

  // エフェクト再生用ローカル状態
  localAnim: null,                        // { side, type: 'attack'|'hit'|'faint' }
  localBurstMove: { A: '', B: '' },       // 技名/交換/気絶
  localBurstAbility: { A: '', B: '' },    // 特性テキスト
  localEffectMessage: '',
  localEffectTags: { A: [], B: [] },      // [{ text, tone, damage? }]
  localHpOverrides: {},                   // { 'A:0': hp, ... }
  localSubstituteOverrides: {},           // { 'A:0': subHp, ... }
  localActiveOverrides: {},               // { A: index, ... }
  localStatusOverrides: {},               // { 'A:0': status|null } エフェクト完了まで旧ステータスを保持
  localStatStageOverrides: {},            // { 'A:0': {atk:0,...} } 能力変化矢印の表示タイミング制御
  localYawnOverrides: {},                 // { 'A:0': 0|1 } ねむけバッジの表示タイミング制御
  localTauntOverrides: {},                // { 'A:0': 0|N } ちょうはつバッジの表示タイミング制御
  localEncoreOverrides: {},               // { 'A:0': 0|N } アンコールバッジの表示タイミング制御
  localConfusionOverrides: {},            // { 'A:0': bool } こんらんバッジの表示タイミング制御
  localHazardOverrides: null,             // { A:{...}, B:{...} } 設置技バッジの表示タイミング制御
  localTrickRoomOverride: null,           // null=サーバー値使用, number=表示タイミング制御
  localWeatherOverride: null,             // null=サーバー値使用, {type,turns}=表示タイミング制御
  localPerishSongOverrides: {},           // { 'A:0': count } ほろびバッジの表示タイミング制御
  localItemUsedOverrides: {},             // { 'A:0': bool } itemUsedの表示タイミング制御（エフェクト完了まで旧状態保持）
  localItemOverrides: {},                 // { 'A:0': string|null } はたきおとす後の持ち物バッジ表示タイミング制御
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
  if (store.userName) applyUserSettings(store.userName);
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
    store.localStatStageOverrides = {};
    store.localYawnOverrides = {};
    store.localTauntOverrides = {};
    store.localHazardOverrides = null;
    store.localItemUsedOverrides = {};
    store.localItemOverrides = {};
    store.localEncoreOverrides = {};
    store.localConfusionOverrides = {};
    store.faintVisualReady = {};
    store.resultStampVisible = false;
  }
  if (newGame && !newGame.winner) {
    store.resultStampVisible = false;
  }

  const hasNewEffects = shouldPlay && incomingEffectId > store.seenEffectId && newGame?.effects?.length;

  if (hasNewEffects) {
    // エフェクト再生前にHP・みがわり・ステータス・能力変化・あくび・ちょうはつ・消耗品をスナップショット
    store.localHpOverrides = snapshotHp(store.game || newGame);
    store.localSubstituteOverrides = snapshotSubstitutes(store.game || newGame);
    store.localStatusOverrides = snapshotStatus(store.game || newGame);
    store.localStatStageOverrides = snapshotStatStages(store.game || newGame);
    store.localYawnOverrides = snapshotYawn(store.game || newGame);
    store.localTauntOverrides = snapshotTaunt(store.game || newGame);
    store.localEncoreOverrides = snapshotEncore(store.game || newGame);
    store.localConfusionOverrides = snapshotConfusion(store.game || newGame);
    store.localHazardOverrides = snapshotHazards(store.game || newGame);
    store.localItemUsedOverrides = snapshotItemUsed(store.game || newGame);
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
    // pre-scan は即座に実行してバッジ/オーバーレイの初期値を確定させる
    // （バトル開始遅延中でも天候オーバーレイが一瞬見えるのを防ぐ）
    preScanEffects(newGame.effects);
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
let _bgmFile = null; // 現在再生中 or 一時停止中のファイル
let _bgmLoop = true;

export function playBgm(relPath, loop = true) {
  _bgmLoop = loop;

  if (store.bgmUserPaused) {
    // ユーザーが手動ポーズ中：曲が変わったら古いaudioを破棄して準備だけする
    if (_bgmFile !== relPath) {
      if (_bgm) { _bgm.pause(); _bgm.currentTime = 0; _bgm = null; }
      _bgmFile = relPath;
    }
    // 再生はしない（ユーザーが▶を押すまで待つ）
    return;
  }

  // 同じ曲が既に再生中なら何もしない
  if (_bgmFile === relPath && _bgm && !_bgm.paused) return;

  if (_bgm) { _bgm.pause(); _bgm.currentTime = 0; _bgm = null; }
  _bgmFile = relPath;
  const encodedPath = relPath.split('/').map(encodeURIComponent).join('/');
  _bgm = new Audio('/music/' + encodedPath);
  _bgm.loop = loop;
  _bgm.volume = 0.55;
  _bgm.play().catch(() => {});
}

// ヘッダーの再生/一時停止ボタン用トグル
export function toggleUserBgm() {
  if (store.bgmUserPaused) {
    // 再生再開
    store.bgmUserPaused = false;
    if (!_bgmFile) return;
    if (_bgm) {
      // 同じ曲が残っていれば止めた位置から再開
      _bgm.play().catch(() => {});
    } else {
      // 画面遷移で曲が変わっていた → 先頭から再生
      const encodedPath = _bgmFile.split('/').map(encodeURIComponent).join('/');
      _bgm = new Audio('/music/' + encodedPath);
      _bgm.loop = _bgmLoop;
      _bgm.volume = 0.55;
      _bgm.play().catch(() => {});
    }
  } else {
    // 一時停止（audioは破棄せず currentTime を保持）
    store.bgmUserPaused = true;
    if (_bgm && !_bgm.paused) _bgm.pause();
  }
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

export async function saveUserSetting(user, key, value) {
  try {
    const res = await fetch('/save-user-setting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, key, value }),
    });
    if (!res.ok) return false;
    if (store.parties?.[user]) store.parties[user][key] = value || null;
    return true;
  } catch { return false; }
}

// ログインユーザーの背景テーマをCSSに即時反映
export function applyUserSettings(user) {
  const u = store.parties?.[user];
  const root = document.documentElement;
  if (u?.bgTheme) {
    root.style.setProperty('--body-bg', u.bgTheme);
  } else {
    root.style.removeProperty('--body-bg');
  }
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

// 一時停止したBGMを再開（プレビュー終了後用 - ユーザー手動ポーズ中はスルー）
export function resumeBgm() {
  if (store.bgmUserPaused) return;
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
    map[`${side}:${i}`] = p.substitute ?? 0;  // 0も含める（みがわり使用直後に画像が切り替わるバグを防ぐ）
  }));
  return map;
}

function snapshotStatus(srcGame) {
  const map = {};
  if (!srcGame?.teams) return map;
  ['A', 'B'].forEach(side => (srcGame.teams[side] || []).forEach((p, i) => {
    map[`${side}:${i}`] = p.status || null;
  }));
  return map;
}

export function displayedStatus(side, index, pokemon) {
  const key = `${side}:${index}`;
  if (key in store.localStatusOverrides) return store.localStatusOverrides[key];
  return pokemon?.status || null;
}

function snapshotStatStages(srcGame) {
  const map = {};
  if (!srcGame?.teams) return map;
  ['A', 'B'].forEach(side => (srcGame.teams[side] || []).forEach((p, i) => {
    map[`${side}:${i}`] = { ...(p.statStages || {}) };
  }));
  return map;
}

export function displayedStatStages(side, index, pokemon) {
  const key = `${side}:${index}`;
  if (key in store.localStatStageOverrides) return store.localStatStageOverrides[key];
  return pokemon?.statStages || {};
}

function snapshotYawn(srcGame) {
  const map = {};
  if (!srcGame?.teams) return map;
  ['A', 'B'].forEach(side => (srcGame.teams[side] || []).forEach((p, i) => {
    map[`${side}:${i}`] = p.yawnCounter || 0;
  }));
  return map;
}

export function displayedYawnCounter(side, index, pokemon) {
  const key = `${side}:${index}`;
  if (key in store.localYawnOverrides) return store.localYawnOverrides[key];
  return pokemon?.yawnCounter || 0;
}

function snapshotTaunt(srcGame) {
  const map = {};
  if (!srcGame?.teams) return map;
  ['A', 'B'].forEach(side => (srcGame.teams[side] || []).forEach((p, i) => {
    map[`${side}:${i}`] = p.taunt || 0;
  }));
  return map;
}

export function displayedTaunt(side, index, pokemon) {
  const key = `${side}:${index}`;
  if (key in store.localTauntOverrides) return store.localTauntOverrides[key];
  return pokemon?.taunt || 0;
}

function snapshotEncore(srcGame) {
  const map = {};
  if (!srcGame?.teams) return map;
  ['A', 'B'].forEach(side => (srcGame.teams[side] || []).forEach((p, i) => {
    map[`${side}:${i}`] = p.encoreTurns || 0;
  }));
  return map;
}

export function displayedEncore(side, index, pokemon) {
  const key = `${side}:${index}`;
  if (key in store.localEncoreOverrides) return store.localEncoreOverrides[key];
  return pokemon?.encoreTurns || 0;
}

function snapshotConfusion(srcGame) {
  const map = {};
  if (!srcGame?.teams) return map;
  ['A', 'B'].forEach(side => (srcGame.teams[side] || []).forEach((p, i) => {
    map[`${side}:${i}`] = !!p.confused;
  }));
  return map;
}

export function displayedConfusion(side, index, pokemon) {
  const key = `${side}:${index}`;
  if (key in store.localConfusionOverrides) return store.localConfusionOverrides[key];
  return !!pokemon?.confused;
}

function snapshotHazards(srcGame) {
  return {
    A: { ...(srcGame?.hazards?.A || {}) },
    B: { ...(srcGame?.hazards?.B || {}) },
  };
}

function snapshotItemUsed(srcGame) {
  const map = {};
  if (!srcGame?.teams) return map;
  ['A', 'B'].forEach(side => (srcGame.teams[side] || []).forEach((p, i) => {
    map[`${side}:${i}`] = p.itemUsed || false;
  }));
  return map;
}

export function displayedItemUsed(side, index, pokemon) {
  const key = `${side}:${index}`;
  if (key in store.localItemUsedOverrides) return store.localItemUsedOverrides[key];
  return pokemon?.itemUsed || false;
}

export function displayedItem(side, index, pokemon) {
  const key = `${side}:${index}`;
  if (key in store.localItemOverrides) return store.localItemOverrides[key];
  return pokemon?.item || null;
}

export function displayedPerishSong(side, index, pokemon) {
  const key = `${side}:${index}`;
  if (key in store.localPerishSongOverrides) return store.localPerishSongOverrides[key];
  return pokemon?.perishSongCounter || 0;
}

export function displayedHazards(side) {
  if (store.localHazardOverrides) return store.localHazardOverrides[side] || {};
  return store.game?.hazards?.[side] || {};
}

export function displayedWeather() {
  if (store.localWeatherOverride !== null) return store.localWeatherOverride;
  return store.game?.weather || null;
}

export function displayedSubstituteHp(side, index, pokemon) {
  const key = `${side}:${index}`;
  if (store.localSubstituteOverrides[key] !== undefined) return store.localSubstituteOverrides[key];
  return pokemon?.substitute ?? 0;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 先読みパス（pre-scan）：エフェクト再生前にバッジ・オーバーレイの初期表示値を設定する
// playEffects より先に呼ぶことで、バトル開始演出の遅延中も正しい初期状態を維持できる
function preScanEffects(effects) {
  let foundTrickRoom = false;
  let foundWeatherSet = false;
  for (const e of effects) {
    if (e.kind === 'switch' && e.side && e.fromIndex !== undefined) {
      store.localActiveOverrides[e.side] = e.fromIndex;
    }
    if (e.kind === 'trickRoom' && !foundTrickRoom) {
      store.localTrickRoomOverride = e.before;
      foundTrickRoom = true;
    }
    if (e.kind === 'perishSong' && e.targetIndex !== undefined) {
      const psKey = `${e.side}:${e.targetIndex}`;
      if (!(psKey in store.localPerishSongOverrides)) {
        store.localPerishSongOverrides[psKey] = e.before;
      }
    }
    if (e.kind === 'item-lost' && e.targetIndex !== undefined && e.side) {
      store.localItemOverrides[`${e.side}:${e.targetIndex}`] = e.item;
    }
    if (e.kind === 'item-swap') {
      store.localItemOverrides[`${e.atkSide}:${e.atkIndex}`] = e.atkOldItem;
      store.localItemOverrides[`${e.defSide}:${e.defIndex}`] = e.defOldItem;
    }
    if (e.kind === 'weather-set' && !foundWeatherSet) {
      // 天候特性：特性ラベルが消えるまで旧天候バッジ／オーバーレイを維持する
      store.localWeatherOverride = e.before ? { type: e.before, turns: null } : { type: null, turns: 0 };
      foundWeatherSet = true;
    }
    if (e.kind === 'weather-tick' && !foundWeatherSet) {
      // ターン終了天候カウント：エフェクト再生前は旧カウントで表示
      store.localWeatherOverride = { type: e.before.type, turns: e.before.turns };
      foundWeatherSet = true;
    }
    if (e.kind === 'encore' && e.targetIndex !== undefined && e.side) {
      const encKey = `${e.side}:${e.targetIndex}`;
      if (!(encKey in store.localEncoreOverrides)) {
        store.localEncoreOverrides[encKey] = 0;
      }
    }
  }
}

async function playEffects(effects) {
  store.playingEffects = true;

  // 先読みパス（preScanEffects）は updateState 側で既に実行済み
  // バトル開始時の遅延中も正しい初期値が維持される
  // ※ 通常ターンでも preScanEffects が先に走るので、ここでは再実行しない

  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    store.localEffectMessage = e.message || '';

    if (e.kind === 'attack') {
      store.localAnim = { side: e.side, type: 'attack' };
      store.localBurstMove[e.side] = e.moveName || '';
      // 特性・持ち物ラベルは技バーストに表示しない
      await sleep(800);
      store.localAnim = null;
      store.localBurstMove[e.side] = '';
      await sleep(300);

    } else if (e.kind === 'hit') {
      // 回復ラベルのみならキラキラ演出（healトーンのみのとき）
      const isHeal = (e.labels || []).length > 0 && (e.labels || []).every(l => l.tone === 'heal');

      // 次がrecoilなら同時にラベルを出してHP更新は分離する
      const nextE = effects[i + 1];
      const hasRecoil = nextE?.kind === 'recoil' && nextE.side !== e.side;

      store.localAnim = { side: e.side, type: isHeal ? 'heal' : 'hit' };
      store.localEffectTags[e.side] = e.labels || [];
      await sleep(950);
      store.localEffectTags[e.side] = [];
      store.localAnim = null;
      if (e.hpAfter !== undefined && e.targetIndex !== undefined) {
        store.localHpOverrides[`${e.side}:${e.targetIndex}`] = e.hpAfter;
      }
      await sleep(200);

      if (hasRecoil) {
        // ダメージラベル消去後に反動ラベルを表示（逐次）
        store.localEffectTags[nextE.side] = [{ text: '反動', tone: 'status-brn' }];
        store.localAnim = { side: nextE.side, type: 'hit' };
        await sleep(820);
        store.localEffectTags[nextE.side] = [];
        store.localAnim = null;
        if (nextE.hpAfter !== undefined && nextE.targetIndex !== undefined) {
          store.localHpOverrides[`${nextE.side}:${nextE.targetIndex}`] = nextE.hpAfter;
        }
        await sleep(200);
        i++; // recoilエフェクトをスキップ
      }

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
      // 能力変化を伴う特性（かそく・ムラっけ等）はラベル消去後に矢印を段階的に更新
      if (e.statStages !== undefined && e.statTargetIndex !== undefined && e.side) {
        store.localStatStageOverrides[`${e.side}:${e.statTargetIndex}`] = e.statStages;
      }
      // 設置除去はラベル消去後にハザードバッジを更新
      if (e.updateHazards && store.localHazardOverrides && e.side) {
        store.localHazardOverrides[e.side] = { ...(store.game?.hazards?.[e.side] || {}) };
      }
      await sleep(220);

    } else if (e.kind === 'faint') {
      store.localEffectTags[e.side] = [{ text: e.text || '気絶', tone: 'miss' }];
      if (e.hpAfter !== undefined && e.targetIndex !== undefined) {
        store.localHpOverrides[`${e.side}:${e.targetIndex}`] = e.hpAfter;
      }
      store.localAnim = { side: e.side, type: 'faint' };
      await sleep(1200);
      if (e.targetIndex !== undefined) {
        store.faintVisualReady[`${e.side}:${e.targetIndex}`] = true;
      }
      store.localAnim = null;
      store.localEffectTags[e.side] = [];
      await sleep(300);

    } else if (e.kind === 'status') {
      const STATUS_NAMES = { brn: 'やけど', par: 'まひ', psn: 'どく', tox: 'もうどく', slp: 'ねむり', frz: 'こおり' };
      const STATUS_TONES = { brn: 'status-brn', par: 'status-par', psn: 'status-psn', tox: 'status-tox', slp: 'status-slp', frz: 'status-frz' };
      if (e.status) {
        store.localEffectTags[e.side] = [{ text: STATUS_NAMES[e.status] || e.status, tone: STATUS_TONES[e.status] || 'ability-blue' }];
        await sleep(1000);
        store.localEffectTags[e.side] = [];
        // ラベルが消えた後にバッジを表示（スナップショットを新ステータスで上書き）
        if (e.targetIndex !== undefined) {
          store.localStatusOverrides[`${e.side}:${e.targetIndex}`] = e.status;
          // ねむりになった場合はねむけバッジを消す
          if (e.status === 'slp') store.localYawnOverrides[`${e.side}:${e.targetIndex}`] = 0;
        }
        await sleep(200);
      } else {
        store.localEffectTags[e.side] = [{ text: '回復！', tone: 'heal' }];
        await sleep(1100);
        store.localEffectTags[e.side] = [];
        // 回復アニメーション後にバッジを消す
        if (e.targetIndex !== undefined) {
          store.localStatusOverrides[`${e.side}:${e.targetIndex}`] = null;
        }
        await sleep(220);
      }

    } else if (e.kind === 'stat') {
      store.localEffectTags[e.side] = e.labels || [{ text: '能力変化', tone: 'ability-blue' }];
      await sleep(1000);
      store.localEffectTags[e.side] = [];
      // ラベルが消えた後に能力変化矢印を段階的に更新
      if (e.targetIndex !== undefined) {
        if (e.statStages !== undefined) {
          store.localStatStageOverrides[`${e.side}:${e.targetIndex}`] = e.statStages;
        } else {
          delete store.localStatStageOverrides[`${e.side}:${e.targetIndex}`];
        }
      }
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

    } else if (e.kind === 'substitute-activate') {
      // みがわり作成：HP減少後に画像を切り替える
      if (e.targetIndex !== undefined && e.subHp !== undefined) {
        store.localSubstituteOverrides[`${e.side}:${e.targetIndex}`] = e.subHp;
      }
      await sleep(200);

    } else if (e.kind === 'substitute-break') {
      store.localEffectTags[e.side] = [{ text: 'みがわり消滅！', tone: 'ability-blue' }];
      await sleep(1000);
      store.localEffectTags[e.side] = [];
      await sleep(200);
      if (e.targetIndex !== undefined) {
        store.localSubstituteOverrides[`${e.side}:${e.targetIndex}`] = 0;
      }

    } else if (e.kind === 'yawn') {
      store.localEffectTags[e.side] = [{ text: 'ねむけをさそわれた', tone: 'status-slp' }];
      await sleep(1000);
      store.localEffectTags[e.side] = [];
      if (e.targetIndex !== undefined) store.localYawnOverrides[`${e.side}:${e.targetIndex}`] = 1;
      await sleep(200);

    } else if (e.kind === 'taunt') {
      store.localEffectTags[e.side] = [{ text: 'ちょうはつされた', tone: 'ability-red' }];
      await sleep(1000);
      store.localEffectTags[e.side] = [];
      if (e.targetIndex !== undefined) store.localTauntOverrides[`${e.side}:${e.targetIndex}`] = e.turns || 3;
      await sleep(200);

    } else if (e.kind === 'taunt-end') {
      store.localEffectTags[e.side] = [{ text: 'ちょうはつ回復', tone: 'ability-blue' }];
      await sleep(1000);
      store.localEffectTags[e.side] = [];
      if (e.targetIndex !== undefined) store.localTauntOverrides[`${e.side}:${e.targetIndex}`] = 0;
      await sleep(200);

    } else if (e.kind === 'encore') {
      store.localEffectTags[e.side] = [{ text: 'アンコール！', tone: 'ability-red' }];
      await sleep(1100);
      store.localEffectTags[e.side] = [];
      // ラベルが消えた後にアンコールバッジを表示
      if (e.targetIndex !== undefined) store.localEncoreOverrides[`${e.side}:${e.targetIndex}`] = e.turns || 3;
      await sleep(200);

    } else if (e.kind === 'encore-end') {
      store.localEffectTags[e.side] = [{ text: 'アンコール終了', tone: 'ability-blue' }];
      await sleep(1000);
      store.localEffectTags[e.side] = [];
      if (e.targetIndex !== undefined) store.localEncoreOverrides[`${e.side}:${e.targetIndex}`] = 0;
      await sleep(200);

    } else if (e.kind === 'confusion') {
      // ラベル表示→消去後にバッジを表示
      store.localEffectTags[e.side] = [{ text: 'こんらん！', tone: 'ability-red' }];
      await sleep(1100);
      store.localEffectTags[e.side] = [];
      if (e.targetIndex !== undefined) store.localConfusionOverrides[`${e.side}:${e.targetIndex}`] = true;
      await sleep(200);

    } else if (e.kind === 'confusion-end') {
      // 「こんらんが解けた」ラベル表示→消去後にバッジを非表示
      store.localEffectTags[e.side] = [{ text: 'こんらん解除', tone: 'ability-blue' }];
      await sleep(1100);
      store.localEffectTags[e.side] = [];
      if (e.targetIndex !== undefined) store.localConfusionOverrides[`${e.side}:${e.targetIndex}`] = false;
      await sleep(200);

    } else if (e.kind === 'weather-set') {
      // 特性ラベル消去後（ability ハンドラ完了後）に天候バッジを更新
      store.localWeatherOverride = e.after ? { type: e.after, turns: e.turns } : null;
      await sleep(100);

    } else if (e.kind === 'weather-tick') {
      if (e.ended) {
        // 「○○がやんだ！」メッセージを表示してからバッジ／オーバーレイを消す
        await sleep(900); // localEffectMessage でメッセージ表示中
        store.localWeatherOverride = null; // サーバー値（type:null）へ → バッジ消去
        await sleep(200);
      } else {
        // カウント更新：サーバー値（デクリメント済み）を即反映
        store.localWeatherOverride = null;
        await sleep(150);
      }

    } else if (e.kind === 'item-swap') {
      // 両者に「もちものがすりかわった」ラベルを同時表示
      store.localEffectTags[e.atkSide] = [{ text: 'もちものが\nすりかわった！', tone: 'ability-blue' }];
      store.localEffectTags[e.defSide] = [{ text: 'もちものが\nすりかわった！', tone: 'ability-blue' }];
      await sleep(1100);
      store.localEffectTags[e.atkSide] = [];
      store.localEffectTags[e.defSide] = [];
      // ラベル消去後に持ち物バッジを新しい持ち物（サーバー値）に切り替え
      delete store.localItemOverrides[`${e.atkSide}:${e.atkIndex}`];
      delete store.localItemOverrides[`${e.defSide}:${e.defIndex}`];
      await sleep(300);

    } else if (e.kind === 'pain-split') {
      store.localEffectTags[e.atkSide] = [{ text: 'HP平均化', tone: 'ability-blue' }];
      store.localEffectTags[e.defSide] = [{ text: 'HP平均化', tone: 'ability-blue' }];
      await sleep(1000);
      store.localEffectTags[e.atkSide] = [];
      store.localEffectTags[e.defSide] = [];
      await sleep(200);
      if (e.atkTargetIndex !== undefined) store.localHpOverrides[`${e.atkSide}:${e.atkTargetIndex}`] = e.atkHpAfter;
      if (e.defTargetIndex !== undefined) store.localHpOverrides[`${e.defSide}:${e.defTargetIndex}`] = e.defHpAfter;
      await sleep(400);

    } else if (e.kind === 'recoil') {
      store.localEffectTags[e.side] = [{ text: '反動', tone: 'status-brn' }];
      store.localAnim = { side: e.side, type: 'hit' };
      await sleep(850);
      store.localEffectTags[e.side] = [];
      store.localAnim = null;
      if (e.hpAfter !== undefined && e.targetIndex !== undefined) {
        store.localHpOverrides[`${e.side}:${e.targetIndex}`] = e.hpAfter;
      }
      await sleep(280);

    } else if (e.kind === 'stat-reset') {
      store.localEffectTags[e.side] = [{ text: '能力変化リセット', tone: 'ability-blue' }];
      await sleep(1000);
      store.localEffectTags[e.side] = [];
      if (e.targetIndex !== undefined) delete store.localStatStageOverrides[`${e.side}:${e.targetIndex}`];
      await sleep(200);

    } else if (e.kind === 'trickRoom') {
      // バースト/メッセージ再生後にバッジ表示を更新
      store.localTrickRoomOverride = e.after;
      await sleep(200);

    } else if (e.kind === 'perishSong') {
      // ほろびバッジをメッセージ再生後に更新
      if (e.targetIndex !== undefined) {
        store.localPerishSongOverrides[`${e.side}:${e.targetIndex}`] = e.after;
      }
      await sleep(200);

    } else if (e.kind === 'hazard-set') {
      store.localEffectTags[e.side] = [{ text: e.text || 'まきびし', tone: 'ability-blue' }];
      await sleep(1000);
      store.localEffectTags[e.side] = [];
      // ラベル消去後にハザードバッジを更新（e.hazards = 設置直後の中間状態）
      if (store.localHazardOverrides && e.side) {
        store.localHazardOverrides[e.side] = e.hazards ? { ...e.hazards } : { ...(store.game?.hazards?.[e.side] || {}) };
      }
      await sleep(200);

    } else if (e.kind === 'item-lost') {
      // 「○○を失った」ラベルが消えた直後にここが実行される → 持ち物バッジを非表示に
      if (e.targetIndex !== undefined && e.side) {
        store.localItemOverrides[`${e.side}:${e.targetIndex}`] = null;
      }
      await sleep(100);

    } else if (e.kind === 'healing-wish') {
      // 「ねがいが叶った」ラベルを表示し、消えた後にHP全回復・状態異常回復を反映
      store.localEffectTags[e.side] = [{ text: 'ねがいが叶った！', tone: 'heal' }];
      store.localAnim = { side: e.side, type: 'heal' };
      await sleep(1100);
      store.localEffectTags[e.side] = [];
      store.localAnim = null;
      // ラベル消去後にHP・ステータスを更新
      if (e.hpAfter !== undefined && e.targetIndex !== undefined) {
        store.localHpOverrides[`${e.side}:${e.targetIndex}`] = e.hpAfter;
      }
      if (e.targetIndex !== undefined) {
        store.localStatusOverrides[`${e.side}:${e.targetIndex}`] = null;
      }
      await sleep(300);

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
  store.localStatusOverrides = {};
  store.localStatStageOverrides = {};
  store.localYawnOverrides = {};
  store.localTauntOverrides = {};
  store.localHazardOverrides = null;
  store.localTrickRoomOverride = null;
  store.localWeatherOverride = null;
  store.localPerishSongOverrides = {};
  store.localItemUsedOverrides = {};
  store.localItemOverrides = {};
  store.localEncoreOverrides = {};
  store.localConfusionOverrides = {};
  if (store.game?.winner) {
    store.resultStampVisible = true;
    playBgm('ジムリーダーに勝利.mp3', false);
  }

  // 気絶・ピボット技による強制交代：自分のサイドなら自動でポップアップ表示
  // forceSwitch === 'AB' の場合は両プレイヤーが同時にポップアップを表示
  if (store.game?.forceSwitch) {
    const fs = store.game.forceSwitch;
    if (fs === 'AB' || fs === store.role) {
      openModal('forceSwitch');
    }
  }
}
