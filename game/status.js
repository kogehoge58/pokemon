'use strict';

const STATUS_TYPE_IMMUNITY = {
  brn: ['ほのお'],
  par: ['でんき'],
  psn: ['どく', 'はがね'],
  tox: ['どく', 'はがね'],
  frz: ['こおり'],
};

function canApplyStatus(pokemon, statusId) {
  if (pokemon.status) return false;
  const immunity = STATUS_TYPE_IMMUNITY[statusId];
  if (!immunity) return true;
  return !pokemon.types.some(t => immunity.includes(t));
}

function applyStatus(pokemon, statusId) {
  if (!canApplyStatus(pokemon, statusId)) return false;
  pokemon.status = statusId;
  if (statusId === 'slp') pokemon.sleepTurns = 2 + Math.floor(Math.random() * 4);
  return true;
}

function clearStatus(pokemon) {
  pokemon.status = null;
  pokemon.sleepTurns = 0;
  pokemon.toxicCounter = 1;
}

function applyConfusion(pokemon) {
  if (pokemon.confused) return false;
  pokemon.confused = true;
  pokemon.confusionTurns = 2 + Math.floor(Math.random() * 4);
  return true;
}

function clearConfusion(pokemon) {
  pokemon.confused = false;
  pokemon.confusionTurns = 0;
}

// returns { canMove, reason?, wakeUp?, thawed?, selfHurt? }
function checkCanMove(pokemon) {
  if (pokemon.status === 'par' && Math.random() < 0.25) {
    return { canMove: false, reason: 'par' };
  }

  if (pokemon.status === 'slp') {
    pokemon.sleepTurns--;
    if (pokemon.sleepTurns <= 0) {
      pokemon.status = null;
      pokemon.sleepTurns = 0;
      return { canMove: true, wakeUp: true };
    }
    return { canMove: false, reason: 'slp' };
  }

  if (pokemon.status === 'frz') {
    if (Math.random() < 0.2) {
      pokemon.status = null;
      return { canMove: true, thawed: true };
    }
    return { canMove: false, reason: 'frz' };
  }

  if (pokemon.confused) {
    pokemon.confusionTurns--;
    if (pokemon.confusionTurns <= 0) {
      clearConfusion(pokemon);
    } else if (Math.random() < 0.5) {
      return { canMove: false, reason: 'confused', selfHurt: true };
    }
  }

  return { canMove: true };
}

function applyStatusEndOfTurn(pokemon, side, ctx) {
  const msgs = [];
  if (pokemon.fainted) return msgs;

  const push = (msg) => { msgs.push(msg); ctx.state.game.log.push(msg); };
  const addDmg = (hpBefore, hpAfter, msg) => ctx.addEffect({ kind: 'damage', side, hpBefore, hpAfter, message: msg });

  if (pokemon.status === 'brn') {
    const dmg = Math.max(1, Math.floor(pokemon.maxHp / 8));
    const hpBefore = pokemon.hp;
    pokemon.hp = Math.max(0, pokemon.hp - dmg);
    const msg = `${pokemon.name}はやけどのダメージを受けた！ (-${dmg})`;
    push(msg);
    addDmg(hpBefore, pokemon.hp, msg);
    if (pokemon.hp <= 0 && !pokemon.fainted) {
      pokemon.fainted = true;
      const fm = `${pokemon.name}は気絶した！`;
      push(fm);
      ctx.addEffect({ kind: 'faint', side, targetIndex: ctx.state.game.active[side], hpAfter: 0, message: fm });
    }
  } else if (pokemon.status === 'psn') {
    const dmg = Math.max(1, Math.floor(pokemon.maxHp / 8));
    const hpBefore = pokemon.hp;
    pokemon.hp = Math.max(0, pokemon.hp - dmg);
    const msg = `${pokemon.name}はどくのダメージを受けた！ (-${dmg})`;
    push(msg);
    addDmg(hpBefore, pokemon.hp, msg);
    if (pokemon.hp <= 0 && !pokemon.fainted) {
      pokemon.fainted = true;
      const fm = `${pokemon.name}は気絶した！`;
      push(fm);
      ctx.addEffect({ kind: 'faint', side, targetIndex: ctx.state.game.active[side], hpAfter: 0, message: fm });
    }
  } else if (pokemon.status === 'tox') {
    const dmg = Math.max(1, Math.floor(pokemon.maxHp * pokemon.toxicCounter / 16));
    pokemon.toxicCounter = Math.min(pokemon.toxicCounter + 1, 15);
    const hpBefore = pokemon.hp;
    pokemon.hp = Math.max(0, pokemon.hp - dmg);
    const msg = `${pokemon.name}はもうどくのダメージを受けた！ (-${dmg})`;
    push(msg);
    addDmg(hpBefore, pokemon.hp, msg);
    if (pokemon.hp <= 0 && !pokemon.fainted) {
      pokemon.fainted = true;
      const fm = `${pokemon.name}は気絶した！`;
      push(fm);
      ctx.addEffect({ kind: 'faint', side, targetIndex: ctx.state.game.active[side], hpAfter: 0, message: fm });
    }
  }

  if (!pokemon.fainted && pokemon.yawnCounter > 0) {
    pokemon.yawnCounter--;
    if (pokemon.yawnCounter === 0) {
      if (applyStatus(pokemon, 'slp')) {
        const msg = `${pokemon.name}は眠ってしまった！`;
        push(msg);
        ctx.addEffect({ kind: 'status', side, status: 'slp', message: msg });
      }
    }
  }

  return msgs;
}

function getBurnAttackMult(pokemon, category, ability) {
  if (pokemon.status === 'brn' && category === '物理' && ability !== 'こんじょう') return 0.5;
  return 1;
}

function getParalysisSpeedMult(pokemon) {
  return pokemon.status === 'par' ? 0.5 : 1;
}

module.exports = {
  canApplyStatus, applyStatus, clearStatus,
  applyConfusion, clearConfusion,
  checkCanMove, applyStatusEndOfTurn,
  getBurnAttackMult, getParalysisSpeedMult,
};
