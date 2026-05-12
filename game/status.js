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
  if (statusId === 'slp') pokemon.sleepTurns = 0;   // 眠りターンカウンター（インクリメント方式）
  if (statusId === 'frz') pokemon.freezeTurns = 0;  // 凍りターンカウンター（インクリメント方式）
  return true;
}

function clearStatus(pokemon) {
  pokemon.status = null;
  pokemon.sleepTurns = 0;
  pokemon.freezeTurns = 0;
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
  if (pokemon.status === 'par' && Math.random() < 0.125) {
    return { canMove: false, reason: 'par' };
  }

  if (pokemon.status === 'slp') {
    pokemon.sleepTurns = (pokemon.sleepTurns || 0) + 1;
    // 1ターン目：必ず眠る / 2ターン目：1/3で回復 / 3ターン目以降：必ず回復
    if (pokemon.sleepTurns >= 3 || (pokemon.sleepTurns >= 2 && Math.random() < 1/3)) {
      pokemon.status = null;
      pokemon.sleepTurns = 0;
      return { canMove: true, wakeUp: true };
    }
    return { canMove: false, reason: 'slp' };
  }

  if (pokemon.status === 'frz') {
    pokemon.freezeTurns = (pokemon.freezeTurns || 0) + 1;
    // 1〜2ターン目：25%で解除 / 3ターン目以降：必ず解除
    if (pokemon.freezeTurns >= 3 || Math.random() < 0.25) {
      pokemon.status = null;
      pokemon.freezeTurns = 0;
      return { canMove: true, thawed: true };
    }
    return { canMove: false, reason: 'frz' };
  }

  if (pokemon.confused) {
    pokemon.confusionTurns--;
    if (pokemon.confusionTurns <= 0) {
      clearConfusion(pokemon);
      return { canMove: true, confusionCleared: true };
    } else if (Math.random() < 0.5) {
      return { canMove: false, reason: 'confused', selfHurt: true };
    }
  }

  return { canMove: true };
}

function applyStatusEndOfTurn(pokemon, side, ctx) {
  const msgs = [];
  if (pokemon.fainted || pokemon.hp <= 0) return msgs;

  const push = (msg) => { msgs.push(msg); ctx.state.game.log.push(msg); };
  const ti = ctx.state.game.active[side];
  const addDmg = (hpBefore, hpAfter, msg, labels) => ctx.addEffect({ kind: 'damage', side, hpBefore, hpAfter, message: msg, labels, targetIndex: ti });

  if (pokemon.status === 'brn') {
    if (pokemon.ability !== 'マジックガード') {
      const dmg = Math.max(1, Math.floor(pokemon.maxHp / 16));
      const hpBefore = pokemon.hp;
      pokemon.hp = Math.max(0, pokemon.hp - dmg);
      const msg = `${pokemon.name}はやけどのダメージを受けた！ (-${dmg})`;
      push(msg);
      addDmg(hpBefore, pokemon.hp, msg, [{ text: 'やけど', tone: 'status-brn' }]);
      if (pokemon.hp <= 0 && !pokemon.fainted) {
        pokemon.fainted = true;
        const fm = `${pokemon.name}は気絶した！`;
        push(fm);
        ctx.addEffect({ kind: 'faint', side, targetIndex: ti, hpAfter: 0, message: fm });
      }
    }
  } else if (pokemon.status === 'psn') {
    if (pokemon.ability !== 'マジックガード') {
      const dmg = Math.max(1, Math.floor(pokemon.maxHp / 8));
      const hpBefore = pokemon.hp;
      pokemon.hp = Math.max(0, pokemon.hp - dmg);
      const msg = `${pokemon.name}はどくのダメージを受けた！ (-${dmg})`;
      push(msg);
      addDmg(hpBefore, pokemon.hp, msg, [{ text: 'どく', tone: 'status-psn' }]);
      if (pokemon.hp <= 0 && !pokemon.fainted) {
        pokemon.fainted = true;
        const fm = `${pokemon.name}は気絶した！`;
        push(fm);
        ctx.addEffect({ kind: 'faint', side, targetIndex: ti, hpAfter: 0, message: fm });
      }
    }
  } else if (pokemon.status === 'tox') {
    if (pokemon.ability !== 'マジックガード') {
      const dmg = Math.max(1, Math.floor(pokemon.maxHp * pokemon.toxicCounter / 16));
      pokemon.toxicCounter = Math.min(pokemon.toxicCounter + 1, 15);
      const hpBefore = pokemon.hp;
      pokemon.hp = Math.max(0, pokemon.hp - dmg);
      const msg = `${pokemon.name}はもうどくのダメージを受けた！ (-${dmg})`;
      push(msg);
      addDmg(hpBefore, pokemon.hp, msg, [{ text: 'もうどく', tone: 'status-tox' }]);
      if (pokemon.hp <= 0 && !pokemon.fainted) {
        pokemon.fainted = true;
        const fm = `${pokemon.name}は気絶した！`;
        push(fm);
        ctx.addEffect({ kind: 'faint', side, targetIndex: ti, hpAfter: 0, message: fm });
      }
    }
  }

  if (!pokemon.fainted && pokemon.yawnCounter > 0) {
    pokemon.yawnCounter--;
    if (pokemon.yawnCounter === 0) {
      if (applyStatus(pokemon, 'slp')) {
        const msg = `${pokemon.name}は眠ってしまった！`;
        push(msg);
        ctx.addEffect({ kind: 'status', side, status: 'slp', message: msg, targetIndex: ctx.state.game.active[side] });
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
