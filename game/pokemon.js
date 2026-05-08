'use strict';

const { DEX, ABILITY_BY_POKEMON, MOVES, ITEM_BY_POKEMON } = require('../data.js');

const POKEAPI_SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated';

function spriteUrlByName(name) {
  const { POKEAPI_SPRITE_IDS } = require('../data.js');
  const id = POKEAPI_SPRITE_IDS[name];
  return id ? `${POKEAPI_SPRITE_BASE}/${id}.gif` : '';
}

function abilityOfPokemon(name) { return ABILITY_BY_POKEMON[name] || 'なし'; }

function makePokemon(name) {
  const d = DEX[name];
  const battleStats = {
    hp:  Math.floor(((2 * d.stats.hp  + 31) * 50) / 100) + 60,
    atk: Math.floor(((2 * d.stats.atk + 31) * 50) / 100) + 5,
    def: Math.floor(((2 * d.stats.def + 31) * 50) / 100) + 5,
    spa: Math.floor(((2 * d.stats.spa + 31) * 50) / 100) + 5,
    spd: Math.floor(((2 * d.stats.spd + 31) * 50) / 100) + 5,
    spe: Math.floor(((2 * d.stats.spe + 31) * 50) / 100) + 5,
  };
  // ヌケニンのHPは常に1（ふしぎなまもりを持つ）
  if (name === 'ヌケニン') battleStats.hp = 1;
  return {
    name,
    sprite: d.sprite,
    spriteUrl: d.spriteUrl || spriteUrlByName(name),
    staticSpriteUrl: d.staticSpriteUrl || '',
    spriteEmoji: d.spriteEmoji || d.sprite,
    types: [...d.types],
    ability: abilityOfPokemon(name),
    item: (ITEM_BY_POKEMON && ITEM_BY_POKEMON[name]) || null,
    stats: { ...battleStats },
    rawStats: { ...battleStats },
    baseStats: { ...d.stats },
    displayStats: { ...d.stats },
    statStages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 },
    statColors: {},
    moves: [...d.moves],
    movePP: Object.fromEntries(d.moves.map(mn => [mn, MOVES[mn]?.pp || 20])),
    maxHp: battleStats.hp,
    hp: battleStats.hp,
    fainted: false,
    // 状態異常
    status: null,
    sleepTurns: 0,
    toxicCounter: 1,
    // 揮発性状態
    confused: false,
    confusionTurns: 0,
    yawnCounter: 0,
    protected: false,
    protectCounter: 0,
    destinyBond: false,
    perishSongCounter: 0,
    // 戦闘追跡
    lastMoveDamage: { physical: 0, special: 0 },
    lastMoveUsed: null,
    firstTurnOut: false,
    flinched: false,
    flashFire: false,
    // アイテム消費フラグ
    itemUsed: false,
    // こだわりロック
    choiceMove: null,
    // みがわりHP
    substitute: 0,
    // ちょうはつカウント
    taunt: 0,
    // アンコール
    encored: null,
    encoreTurns: 0,
  };
}

function stageMultiplier(stage) {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

// 命中・回避段階用（3段階基準）
function accStageMultiplier(stage) {
  return stage >= 0 ? (3 + stage) / 3 : 3 / (3 - stage);
}

function resetVolatileStats(p) {
  if (!p || !p.rawStats) return;
  // かわりもの変身リセット（引いたら元のメタモンに戻る）
  if (p._originalData) {
    const o = p._originalData;
    p.sprite = o.sprite; p.spriteUrl = o.spriteUrl;
    p.staticSpriteUrl = o.staticSpriteUrl; p.spriteEmoji = o.spriteEmoji;
    p.types = [...o.types];
    p.ability = o.ability;
    p.moves = [...o.moves]; p.movePP = { ...o.movePP };
    p.rawStats = { ...o.rawStats }; p.baseStats = { ...o.baseStats };
    p.displayStats = { ...o.displayStats };
    p.transformed = false;
  }
  p.stats = { ...p.rawStats };
  p.displayStats = { ...p.baseStats };
  p.statStages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 };
  p.statColors = {};
  p.confused = false;
  p.confusionTurns = 0;
  p.yawnCounter = 0;
  p.protected = false;
  p.protectCounter = 0;
  p.destinyBond = false;
  p.flinched = false;
  p.lastMoveDamage = { physical: 0, special: 0 };
  p.substitute = 0;
  p.choiceMove = null;
  p.taunt = 0;
  p.encored = null;
  p.encoreTurns = 0;
  // perishSongCounter は交代でも維持
  // status/sleepTurns は維持
  // もうどくカウンターは交代でリセット（Gen4仕様）
  if (p.status === 'tox') p.toxicCounter = 1;
}

function applyStatStage(p, stat, delta) {
  if (!p || !p.statStages || p.statStages[stat] === undefined) return false;
  const before = p.statStages[stat];
  const after = Math.max(-6, Math.min(6, before + delta));
  if (after === before) return false;
  p.statStages[stat] = after;
  // acc/eva は段階のみ保持（命中計算時に accStageMultiplier で使用）
  if (stat === 'acc' || stat === 'eva') {
    p.statColors[stat] = after > 0 ? 'red' : (after < 0 ? 'blue' : '');
    return true;
  }
  const mult = stageMultiplier(after);
  p.stats[stat] = Math.max(1, Math.floor(p.rawStats[stat] * mult));
  p.displayStats[stat] = Math.max(1, Math.floor(p.baseStats[stat] * mult));
  p.statColors[stat] = after > 0 ? 'red' : (after < 0 ? 'blue' : '');
  return true;
}

module.exports = {
  makePokemon, stageMultiplier, accStageMultiplier,
  resetVolatileStats, applyStatStage,
  abilityOfPokemon, spriteUrlByName,
};
