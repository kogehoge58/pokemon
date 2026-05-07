'use strict';

const { MOVES } = require('../data.js');
const { state, enemy, active, addEffect, startEffects, finishEffects, effectiveness, effText } = require('./context.js');
const { resetVolatileStats } = require('./pokemon.js');
const {
  triggerOnEntry, triggerOnEndTurn,
  getModifiedMove, getCritRate, getStabMult,
  getAttackerMult, getDefenderMult, checkGanjoSurvive
} = require('./abilities.js');
const { triggerItemOnEntry, triggerItemOnEndTurn, getItemAttackerMult, getItemDefenderMult } = require('./items.js');
const { applyMoveAdditionalEffect } = require('./moves.js');

// エンジン全体で使うコンテキスト（クエリ関数に渡す）
const ctx = { state, enemy, active, addEffect };

function checkWinner(attackerSide) {
  const loser = enemy(attackerSide);
  if (state.game.teams[loser].every(p => p.fainted)) {
    state.game.winner = attackerSide;
    state.game.forceSwitch = null;
    state.game.message = `プレイヤー${attackerSide}の勝利！`;
    state.game.log.push(state.game.message);
  }
}

function doSurrender(loser) {
  const winner = enemy(loser);
  const msg = `プレイヤー${loser}が降参しました。プレイヤー${winner}の勝利！`;
  state.game.winner = winner;
  state.game.forceSwitch = null;
  state.game.message = msg;
  state.game.log.push(msg);
  addEffect({ kind: 'message', side: loser, message: msg });
}

function nextTurn() {
  state.game.turn++;
  state.game.commands = { A: null, B: null };
  state.game.forceSwitch = null;
  state.game.message = `${state.game.turn}ターン目。両プレイヤーのコマンド選択待ちです。`;
  state.game.log.push(`--- ${state.game.turn}ターン目 ---`);
}

function doSwitch(s, i, triggerEntry = true) {
  const fromIndex = state.game.active[s];
  addEffect({ kind: 'switch', side: s, fromIndex, toIndex: i, message: '交換' });
  const beforeMon = active(s);
  state.game.log.push(`プレイヤー${s}は ${beforeMon.name} を引っ込めた！`);
  addEffect({ kind: 'message', side: s, message: `プレイヤー${s}は ${beforeMon.name} を引っ込めた！` });
  resetVolatileStats(beforeMon);
  state.game.active[s] = i;
  if (state.game.revealed?.[s]) state.game.revealed[s][i] = true;
  state.game.log.push(`プレイヤー${s}は ${active(s).name} を繰り出した！`);
  addEffect({ kind: 'message', side: s, message: `プレイヤー${s}は ${active(s).name} を繰り出した！` });
  if (triggerEntry) {
    triggerOnEntry(s, ctx);
    triggerItemOnEntry(s, ctx);
  }
}

function doAttack(s, mn, isLastMove = false) {
  const atk = active(s), def = active(enemy(s)), m = MOVES[mn];
  if (!atk || !def || atk.fainted || state.game.winner) return;

  const adjusted = getModifiedMove(atk, def, m);
  const attackMsg = `${atk.name} の ${mn}（${m.type}）！`;
  state.game.log.push(attackMsg);

  if (!adjusted.noGuard && adjusted.accuracy < 100 && Math.random() * 100 >= adjusted.accuracy) {
    addEffect({ kind: 'attack', side: s, moveName: mn, message: attackMsg });
    const missMsg = `${atk.name} の攻撃は当たらなかった！`;
    state.game.log.push(missMsg);
    addEffect({ kind: 'miss', side: enemy(s), message: missMsg });
    return;
  }

  const atkStat = m.category === '物理' ? atk.stats.atk : atk.stats.spa;
  const defStat = m.category === '物理' ? def.stats.def : def.stats.spd;
  const baseStab = atk.types.includes(m.type) ? 1.5 : 1;
  const stab = getStabMult(atk, m, baseStab);
  const eff = effectiveness(m.type, def.types);
  const random = 0.9 + Math.random() * 0.1;
  const isCritical = Math.random() < getCritRate(atk);
  const critical = isCritical ? 1.5 : 1;

  const atkAbility = getAttackerMult(atk, m, eff, isLastMove);
  const defAbility = getDefenderMult(def, eff);
  const atkItem = getItemAttackerMult(atk, m);
  const defItem = getItemDefenderMult(def, m);

  const abilityAttackLabels = [...atkAbility.labels];
  const abilityHitLabels = [...defAbility.labels];
  const abilityLogs = [...atkAbility.logs, ...defAbility.logs, ...atkItem.logs, ...defItem.logs];

  if (stab !== baseStab) {
    const msg = `${atk.name}のてきおうりょく！ タイプ一致補正が2.0倍になった！`;
    abilityLogs.unshift(msg);
    abilityAttackLabels.unshift({ text: 'てきおうりょく', tone: 'ability-red' });
  }

  const abilityMultiplier = atkAbility.mult * defAbility.mult * atkItem.mult * defItem.mult;
  let dmg = Math.floor(((((22 * adjusted.power * atkStat / defStat) / 50) + 2) * stab * eff * random) * critical * abilityMultiplier);
  if (eff === 0) dmg = 0;
  if (dmg < 1 && eff > 0) dmg = 1;

  const targetSide = enemy(s);
  const targetIndex = state.game.active[targetSide];
  const hpBefore = def.hp;

  const ganjo = checkGanjoSurvive(def, hpBefore, dmg, eff);
  if (ganjo) {
    dmg = ganjo.dmg;
    abilityHitLabels.unshift(ganjo.label);
    abilityLogs.push(ganjo.log);
  }

  addEffect({ kind: 'attack', side: s, moveName: mn, message: attackMsg, abilityLabels: abilityAttackLabels });
  for (const msg of abilityLogs) state.game.log.push(msg);
  def.hp = Math.max(0, def.hp - dmg);

  const damageMsg = `${def.name} に ${dmg} ダメージ！ 相性：${effText(eff)}`;
  const labels = [{ text: effText(eff), tone: eff >= 2 ? 'super' : (eff < 1 ? 'resist' : ''), damage: dmg }];
  if (abilityHitLabels.length) labels.unshift(...abilityHitLabels);
  if (isCritical && eff > 0) labels.unshift({ text: '急所！', tone: 'critical', damage: dmg });
  state.game.log.push(damageMsg);
  addEffect({ kind: 'hit', side: targetSide, targetIndex, hpBefore, hpAfter: def.hp, message: damageMsg, labels });
  if (isCritical && eff > 0) state.game.log.push('急所に当たった！');

  applyMoveAdditionalEffect(mn, atk, def, dmg, ctx);

  if (def.hp <= 0) {
    def.fainted = true;
    const faintMsg = `${def.name} は気絶した！`;
    state.game.log.push(faintMsg);
    addEffect({ kind: 'faint', side: targetSide, targetIndex, hpAfter: def.hp, message: faintMsg });
    checkWinner(s);
  }
}

function resolveTurn() {
  startEffects();
  const actions = [{ side: 'A', cmd: state.game.commands.A }, { side: 'B', cmd: state.game.commands.B }];

  const surrenderActions = actions.filter(a => a.cmd?.type === 'surrender');
  if (surrenderActions.length === 2) {
    const msg = '両プレイヤーが降参しました。引き分け！';
    state.game.winner = 'draw';
    state.game.forceSwitch = null;
    state.game.message = msg;
    state.game.log.push(msg);
    addEffect({ kind: 'message', side: 'A', message: msg });
    addEffect({ kind: 'message', side: 'B', message: msg });
    finishEffects();
    return;
  }
  if (surrenderActions.length) {
    doSurrender(surrenderActions[0].side);
    finishEffects();
    return;
  }

  const switchActions = actions.filter(a => a.cmd?.type === 'switch');
  for (const a of switchActions) doSwitch(a.side, a.cmd.index, false);
  for (const a of switchActions) {
    triggerOnEntry(a.side, ctx);
    triggerItemOnEntry(a.side, ctx);
  }

  const moveActions = actions
    .filter(a => a.cmd?.type === 'move')
    .map(a => ({ ...a, tie: Math.random() }))
    .sort((x, y) => {
      const diff = active(y.side).stats.spe - active(x.side).stats.spe;
      return diff !== 0 ? diff : x.tie - y.tie;
    });
  for (let i = 0; i < moveActions.length; i++) {
    doAttack(moveActions[i].side, moveActions[i].cmd.moveName, i === moveActions.length - 1);
  }

  if (!state.game.winner) {
    ['A', 'B'].forEach(s => {
      triggerOnEndTurn(s, ctx);
      triggerItemOnEndTurn(s, ctx);
    });
    const need = ['A', 'B'].find(s => active(s).fainted);
    if (need) {
      state.game.forceSwitch = need;
      state.game.commands = { A: null, B: null };
      state.game.message = `プレイヤー${need}は次に出すポケモンを選んでください。`;
      state.game.log.push(state.game.message);
    } else {
      nextTurn();
    }
  }
  finishEffects();
}

module.exports = { checkWinner, doSurrender, nextTurn, doSwitch, doAttack, resolveTurn };
