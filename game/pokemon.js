'use strict';

const { DEX, ABILITY_BY_POKEMON } = require('../data.js');

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
    spe: Math.floor(((2 * d.stats.spe + 31) * 50) / 100) + 5
  };
  return {
    name,
    sprite: d.sprite,
    spriteUrl: d.spriteUrl || spriteUrlByName(name),
    staticSpriteUrl: d.staticSpriteUrl || '',
    spriteEmoji: d.spriteEmoji || d.sprite,
    types: [...d.types],
    ability: abilityOfPokemon(name),
    item: null,
    stats: { ...battleStats },
    rawStats: { ...battleStats },
    baseStats: { ...d.stats },
    displayStats: { ...d.stats },
    statStages: { atk: 0, spe: 0 },
    statColors: {},
    moves: [...d.moves],
    maxHp: battleStats.hp,
    hp: battleStats.hp,
    fainted: false
  };
}

function stageMultiplier(stage) {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

function resetVolatileStats(p) {
  if (!p || !p.rawStats) return;
  p.stats = { ...p.rawStats };
  p.displayStats = { ...p.baseStats };
  p.statStages = { atk: 0, spe: 0 };
  p.statColors = {};
}

function applyStatStage(p, stat, delta) {
  if (!p || !p.statStages || p.statStages[stat] === undefined) return false;
  const before = p.statStages[stat];
  const after = Math.max(-6, Math.min(6, before + delta));
  if (after === before) return false;
  p.statStages[stat] = after;
  const mult = stageMultiplier(after);
  p.stats[stat] = Math.max(1, Math.floor(p.rawStats[stat] * mult));
  p.displayStats[stat] = Math.max(1, Math.floor(p.baseStats[stat] * mult));
  p.statColors[stat] = after > 0 ? 'red' : (after < 0 ? 'blue' : '');
  return true;
}

module.exports = { makePokemon, stageMultiplier, resetVolatileStats, applyStatStage, abilityOfPokemon, spriteUrlByName };
