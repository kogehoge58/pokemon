'use strict';

const { CHART } = require('../data.js');

const state = {
  game: null,
  version: 0,
  waiters: [],
  popupCloseSeq: 0
};

function enemy(s) { return s === 'A' ? 'B' : 'A'; }
function active(s) { return state.game.teams[s][state.game.active[s]]; }

function addEffect(e) { state.game.effects.push(e); }
function startEffects() { state.game.effects = []; }
function finishEffects() { if (state.game.effects.length) state.game.effectId = (state.game.effectId || 0) + 1; }

function effectiveness(moveType, targetTypes) {
  return targetTypes.reduce((mul, t) => mul * ((CHART[moveType] && CHART[moveType][t] !== undefined) ? CHART[moveType][t] : 1), 1);
}
function effText(e) {
  if (e === 0) return '効果なし';
  if (e >= 4) return '超ばつぐん';
  if (e > 1) return 'ばつぐん';
  if (e === 1) return 'ふつう';
  if (e <= 0.25) return '超いまひとつ';
  return 'いまひとつ';
}

module.exports = { state, enemy, active, addEffect, startEffects, finishEffects, effectiveness, effText };
