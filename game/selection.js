'use strict';

const { DEX, TYPES } = require('../data.js');
const { state, enemy, active, addEffect, startEffects, finishEffects, effectiveness } = require('./context.js');
const { makePokemon } = require('./pokemon.js');
const { triggerOnEntry } = require('./abilities.js');
const { triggerItemOnEntry } = require('./items.js');

const ctx = { state, enemy, active, addEffect };
const TYPE_KEYS = Object.keys(TYPES);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uniqueTypesFromNames(names) {
  return [...new Set(names.flatMap(n => DEX[n].types))];
}

function throughTypes(names) {
  if (!names || !names.length) return [...TYPE_KEYS];
  return TYPE_KEYS.filter(atkType => !names.some(n => effectiveness(atkType, DEX[n].types) <= 0.5));
}

function typeOverlapPenalty(baseNames, addNames) {
  const baseTypes = new Set(uniqueTypesFromNames(baseNames));
  const seenAddTypes = new Set();
  let penalty = 0;
  addNames.forEach(name => {
    DEX[name].types.forEach(t => {
      if (baseTypes.has(t)) penalty += 3;
      if (seenAddTypes.has(t)) penalty += 2;
      seenAddTypes.add(t);
    });
  });
  return penalty;
}

function chooseCoverageAdds(baseNames) {
  const baseSet = new Set(baseNames);
  const candidates = Object.keys(DEX).filter(n => !baseSet.has(n));
  const bestSets = [];
  let bestScore = null;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      for (let k = j + 1; k < candidates.length; k++) {
        const adds = [candidates[i], candidates[j], candidates[k]];
        const holes = throughTypes([...baseNames, ...adds]).length;
        const overlap = typeOverlapPenalty(baseNames, adds);
        const score = holes * 1000 + overlap;
        if (bestScore === null || score < bestScore) {
          bestScore = score;
          bestSets.length = 0;
          bestSets.push(adds);
        } else if (score === bestScore) {
          bestSets.push(adds);
        }
      }
    }
  }
  return bestSets.length
    ? shuffle(bestSets[Math.floor(Math.random() * bestSets.length)])
    : shuffle(candidates).slice(0, 3);
}

function prepareFinalSelectionIfReady() {
  const g = state.game;
  if (!(g.confirmed.A && g.confirmed.B && g.selected.A.length === 3 && g.selected.B.length === 3)) return;
  ['A', 'B'].forEach(side => {
    const fixed = [...g.selected[side]];
    const adds = chooseCoverageAdds(fixed);
    g.finalPool[side] = shuffle([...fixed, ...adds]);
    g.finalSelected[side] = [];
    g.finalConfirmed[side] = false;
  });
  g.mode = 'final';
  g.message = '一貫タイプをできるだけ消し、タイプ被りを抑えた6体パーティが完成しました。6体から最終選出3体を選んでください。';
  g.log.push('両プレイヤーの初回選出が完了。最終選出フェーズへ移行しました。');
}

function startBattleIfFinalReady() {
  const g = state.game;
  if (!(g.finalConfirmed.A && g.finalConfirmed.B && g.finalSelected.A.length === 3 && g.finalSelected.B.length === 3)) return;

  g.teams.A = g.finalSelected.A.map(makePokemon);
  g.teams.B = g.finalSelected.B.map(makePokemon);
  g.mode = 'battle';
  g.turn = 1;
  g.active = { A: 0, B: 0 };
  g.commands = { A: null, B: null };
  g.popupCloseId = state.popupCloseSeq;
  g.forceSwitch = null;
  g.revealed = { A: [true, false, false], B: [true, false, false] };
  g.effects = [];
  g.effectId = 0;
  g.winner = null;
  g.log.push('両プレイヤーの最終選出が完了。バトル開始！');
  g.message = '1ターン目。両プレイヤーのコマンド選択待ちです。';

  startEffects();
  triggerOnEntry('A', ctx);
  triggerItemOnEntry('A', ctx);
  triggerOnEntry('B', ctx);
  triggerItemOnEntry('B', ctx);
  finishEffects();
}

module.exports = { chooseCoverageAdds, prepareFinalSelectionIfReady, startBattleIfFinalReady };
