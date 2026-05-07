import { reactive } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated';
const SPRITE_STATIC_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

export const store = reactive({
  masterData: null,   // { TYPES, CHART, MOVES, DEX, ABILITY_DETAILS, ABILITY_BY_POKEMON, POKEAPI_SPRITE_IDS }
  game: null,
  version: 0,
  role: (() => { const r = localStorage.getItem('pokemonBattleRole') || ''; return (r === 'A' || r === 'B') ? r : ''; })(),
  requestBusy: false,
  selectedTypeFilter: '',

  // エフェクト再生用ローカル状態
  localAnim: null,                        // { side, type: 'attack'|'hit'|'faint' }
  localBurstMove: { A: '', B: '' },       // 技名/交換/気絶
  localBurstAbility: { A: '', B: '' },    // 特性テキスト
  localEffectMessage: '',
  localEffectTags: { A: [], B: [] },      // [{ text, tone, damage? }]
  localHpOverrides: {},                   // { 'A:0': hp, ... }
  localActiveOverrides: {},               // { A: index, ... }
  faintVisualReady: {},                   // { 'A:0': bool }
  seenEffectId: 0,
  seenPopupCloseId: 0,
  playingEffects: false,
  resultStampVisible: false,

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

  if (!newGame || newGame.mode === 'select' || newGame.mode === 'final' || incomingEffectId < store.seenEffectId) {
    store.seenEffectId = 0;
    store.playingEffects = false;
    store.localAnim = null;
    store.localBurstMove = { A: '', B: '' };
    store.localBurstAbility = { A: '', B: '' };
    store.localEffectMessage = '';
    store.localEffectTags = { A: [], B: [] };
    store.localHpOverrides = {};
    store.faintVisualReady = {};
    store.resultStampVisible = false;
  }
  if (newGame && !newGame.winner) {
    store.resultStampVisible = false;
  }

  const hasNewEffects = shouldPlay && incomingEffectId > store.seenEffectId && newGame?.effects?.length;

  if (hasNewEffects) {
    // エフェクト再生前にHPをスナップショット
    store.localHpOverrides = snapshotHp(store.game || newGame);
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

  store.game = newGame;
  store.version = newVersion;

  // 両者コマンド送信済みならモーダルを閉じる
  if (newGame?.mode === 'battle' && newGame?.commands?.A && newGame?.commands?.B) closeModal();

  if (hasNewEffects && newGame?.mode === 'battle') {
    store.seenEffectId = incomingEffectId;
    playEffects(newGame.effects);
  } else if (incomingEffectId > store.seenEffectId) {
    store.seenEffectId = incomingEffectId;
  }
}

function snapshotHp(srcGame) {
  const map = {};
  if (!srcGame?.teams) return map;
  ['A', 'B'].forEach(side => (srcGame.teams[side] || []).forEach((p, i) => { map[`${side}:${i}`] = p.hp; }));
  return map;
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
      await sleep(560);
      store.localAnim = null;
      store.localBurstMove[e.side] = '';
      store.localBurstAbility[e.side] = '';
      await sleep(180);

    } else if (e.kind === 'hit') {
      store.localAnim = { side: e.side, type: 'hit' };
      store.localEffectTags[e.side] = e.labels || [];
      // タグ表示中は再描画を抑えるため、HP更新はタグ消去後に行う
      await sleep(620);
      store.localEffectTags[e.side] = [];
      store.localAnim = null;
      if (e.hpAfter !== undefined && e.targetIndex !== undefined) {
        store.localHpOverrides[`${e.side}:${e.targetIndex}`] = e.hpAfter;
      }
      await sleep(260);

    } else if (e.kind === 'miss') {
      store.localEffectTags[e.side] = [{ text: '外れた', tone: 'miss' }];
      await sleep(760);
      store.localEffectTags[e.side] = [];

    } else if (e.kind === 'switch') {
      if (e.fromIndex !== undefined) store.localActiveOverrides[e.side] = e.fromIndex;
      store.localBurstMove[e.side] = '交換';
      await sleep(720);
      store.localBurstMove[e.side] = '';
      if (e.toIndex !== undefined) store.localActiveOverrides[e.side] = e.toIndex;
      else delete store.localActiveOverrides[e.side];
      await sleep(160);
      delete store.localActiveOverrides[e.side];

    } else if (e.kind === 'ability') {
      store.localEffectTags[e.side] = e.labels || [{ text: e.ability || '特性', tone: 'ability-blue' }];
      await sleep(760);
      store.localEffectTags[e.side] = [];

    } else if (e.kind === 'faint') {
      store.localBurstMove[e.side] = '気絶';
      if (e.hpAfter !== undefined && e.targetIndex !== undefined) {
        store.localHpOverrides[`${e.side}:${e.targetIndex}`] = e.hpAfter;
      }
      store.localAnim = { side: e.side, type: 'faint' };
      await sleep(850);
      if (e.targetIndex !== undefined) {
        store.faintVisualReady[`${e.side}:${e.targetIndex}`] = true;
      }
      store.localAnim = null;
      store.localBurstMove[e.side] = '';
      await sleep(120);

    } else {
      await sleep(650);
    }
  }

  store.localEffectMessage = '';
  store.localEffectTags = { A: [], B: [] };
  store.playingEffects = false;
  store.localHpOverrides = {};
  store.localActiveOverrides = {};
  if (store.game?.winner) store.resultStampVisible = true;
}
