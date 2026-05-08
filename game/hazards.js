'use strict';

const { effectiveness } = require('./context.js');

function makeHazards() {
  return { stealthRock: false, spikes: 0, stickyWeb: false };
}

function addHazard(side, type, game) {
  const h = game.hazards[side];
  if (type === 'stealthRock') {
    if (h.stealthRock) return false;
    h.stealthRock = true;
    return true;
  }
  if (type === 'spikes') {
    if (h.spikes >= 3) return false;
    h.spikes++;
    return true;
  }
  if (type === 'stickyWeb') {
    if (h.stickyWeb) return false;
    h.stickyWeb = true;
    return true;
  }
  return false;
}

function clearHazards(side, game) {
  game.hazards[side] = makeHazards();
}

function applyHazardsOnEntry(side, pokemon, ctx) {
  const g = ctx.state.game;
  if (!g.hazards?.[side]) return;
  const h = g.hazards[side];
  const push = (msg) => g.log.push(msg);

  if (pokemon.item === 'あつぞこブーツ') return;

  if (h.stealthRock) {
    const eff = effectiveness('いわ', pokemon.types);
    const dmg = Math.max(1, Math.floor(pokemon.maxHp * eff / 8));
    const hpBefore = pokemon.hp;
    pokemon.hp = Math.max(0, pokemon.hp - dmg);
    const msg = `ステルスロックが ${pokemon.name} に ${dmg} ダメージ！（相性 ${eff}倍）`;
    push(msg);
    ctx.addEffect({ kind: 'damage', side, hpBefore, hpAfter: pokemon.hp, message: msg });
    if (pokemon.hp <= 0 && !pokemon.fainted) {
      pokemon.fainted = true;
      const fm = `${pokemon.name}は気絶した！`;
      push(fm);
      ctx.addEffect({ kind: 'faint', side, targetIndex: g.active[side], hpAfter: 0, message: fm });
    }
  }

  if (pokemon.fainted) return;

  if (h.spikes > 0) {
    const isFlying = pokemon.types.includes('ひこう') || pokemon.ability === 'ふゆう';
    const isGround = pokemon.types.includes('じめん');
    if (!isFlying && !isGround) {
      const ratio = [0, 1 / 8, 1 / 6, 1 / 4][h.spikes] || 1 / 4;
      const dmg = Math.max(1, Math.floor(pokemon.maxHp * ratio));
      const hpBefore = pokemon.hp;
      pokemon.hp = Math.max(0, pokemon.hp - dmg);
      const msg = `まきびしで ${pokemon.name} に ${dmg} ダメージ！`;
      push(msg);
      ctx.addEffect({ kind: 'damage', side, hpBefore, hpAfter: pokemon.hp, message: msg });
      if (pokemon.hp <= 0 && !pokemon.fainted) {
        pokemon.fainted = true;
        const fm = `${pokemon.name}は気絶した！`;
        push(fm);
        ctx.addEffect({ kind: 'faint', side, targetIndex: g.active[side], hpAfter: 0, message: fm });
      }
    }
  }

  if (pokemon.fainted) return;

  if (h.stickyWeb) {
    const isFlying = pokemon.types.includes('ひこう') || pokemon.ability === 'ふゆう';
    if (!isFlying) {
      const { applyStatStage } = require('./pokemon.js');
      const applied = applyStatStage(pokemon, 'spe', -1);
      if (applied) {
        const msg = `ねばねばネットで ${pokemon.name} の素早さが下がった！`;
        push(msg);
        ctx.addEffect({ kind: 'message', side, message: msg });
      }
    }
  }
}

module.exports = { makeHazards, addHazard, clearHazards, applyHazardsOnEntry };
