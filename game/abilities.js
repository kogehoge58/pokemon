'use strict';

const { applyStatStage, stageMultiplier } = require('./pokemon.js');

// --- エントリー特性レジストリ ---
// ENTRY_HOOKS[abilityName] = (side, ctx) => void
const ENTRY_HOOKS = {
  'いかく': (side, ctx) => {
    const p = ctx.active(side);
    if (!p || p.fainted) return;
    const targetSide = ctx.enemy(side);
    const target = ctx.active(targetSide);
    if (!target || target.fainted) return;
    const applied = applyStatStage(target, 'atk', -1);
    if (!applied) return;
    const msg = `${p.name}のいかく！ ${target.name}の攻撃が0.67倍になった！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'ability', side, ability: 'いかく', labels: [{ text: 'いかく', tone: 'ability-blue' }], message: msg });
  }
};

// --- エンドターン特性レジストリ ---
// END_TURN_HOOKS[abilityName] = (side, ctx) => void
const END_TURN_HOOKS = {
  'かそく': (side, ctx) => {
    const p = ctx.active(side);
    if (!p || p.fainted) return;
    const applied = applyStatStage(p, 'spe', 1);
    if (!applied) return;
    const mult = stageMultiplier(p.statStages.spe).toFixed(2).replace(/\.00$/, '');
    const msg = `${p.name}のかそく！ ${p.name}の素早さが${mult}倍になった！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'ability', side, ability: 'かそく', labels: [{ text: 'かそく', tone: 'ability-red' }], message: msg });
  }
};

function triggerOnEntry(side, ctx) {
  const p = ctx.active(side);
  if (!p || p.fainted || !p.ability) return;
  const hook = ENTRY_HOOKS[p.ability];
  if (hook) hook(side, ctx);
}

function triggerOnEndTurn(side, ctx) {
  const p = ctx.active(side);
  if (!p || p.fainted || !p.ability) return;
  const hook = END_TURN_HOOKS[p.ability];
  if (hook) hook(side, ctx);
}

// --- パッシブ特性クエリ関数 ---

// 技の威力・命中を特性で調整した {power, accuracy, noGuard, hustle} を返す
function getModifiedMove(attacker, defender, move) {
  let power = move.power;
  let accuracy = move.accuracy;
  let noGuard = false;
  let hustle = false;

  if (attacker && attacker.ability === 'ノーガード') noGuard = true;
  if (defender && defender.ability === 'ノーガード') noGuard = true;

  if (attacker && attacker.ability === 'はりきり' && move.category === '物理') {
    power = Math.round(power * 1.5);
    accuracy = Math.floor(accuracy * 0.8);
    hustle = true;
  }
  if (noGuard) accuracy = 100;

  return { power, accuracy, noGuard, hustle };
}

// 急所率を返す（通常 1/24）
function getCritRate(attacker) {
  if (attacker && attacker.ability === 'きょううん') return 1 / 8;
  return 1 / 24;
}

// タイプ一致補正倍率を返す（デフォルト1.5、てきおうりょくで2.0）
function getStabMult(attacker, move, baseStab) {
  if (attacker && attacker.ability === 'てきおうりょく' && attacker.types.includes(move.type)) {
    return 2;
  }
  return baseStab;
}

// 攻撃側特性による最終ダメージ倍率・ラベルを返す
// returns { mult, labels, logs }
function getAttackerMult(attacker, move, eff, isLastMove) {
  const labels = [];
  const logs = [];
  let mult = 1;

  if (attacker && attacker.ability === 'アナライズ' && isLastMove) {
    mult *= 1.3;
    const msg = `${attacker.name}のアナライズ！ 最後に攻撃したためダメージが1.3倍になった！`;
    logs.push(msg);
    labels.push({ text: 'アナライズ', tone: 'ability-red' });
  }
  if (attacker && attacker.ability === 'いろめがね' && eff > 0 && eff < 1) {
    mult *= 2;
    const msg = `${attacker.name}のいろめがね！ いまひとつの技のダメージが2.0倍になった！`;
    logs.push(msg);
    labels.push({ text: 'いろめがね', tone: 'ability-red' });
  }

  return { mult, labels, logs };
}

// 防御側特性による最終ダメージ倍率・ラベルを返す
// returns { mult, labels, logs }
function getDefenderMult(defender, eff) {
  const labels = [];
  const logs = [];
  let mult = 1;

  if (defender && defender.ability === 'フィルター' && eff >= 2) {
    mult *= 0.75;
    const msg = `${defender.name}のフィルター！ 効果抜群の被ダメージが0.75倍になった！`;
    logs.push(msg);
    labels.push({ text: 'フィルター', tone: 'ability-blue' });
  }

  return { mult, labels, logs };
}

// がんじょう判定：1発でKOされる場合にHP1で耐えるか
// 耐えた場合はダメージを上書きした値と、ラベル・ログを返す
// returns { dmg, label, log } or null（発動しない場合）
function checkGanjoSurvive(defender, hpBefore, dmg, eff) {
  if (defender && defender.ability === 'がんじょう' && hpBefore === defender.maxHp && dmg >= hpBefore && eff > 0) {
    const newDmg = hpBefore - 1;
    const log = `${defender.name}のがんじょう！ HP満タンからの一撃をHP1で耐えた！`;
    const label = { text: 'がんじょう', tone: 'ability-blue' };
    return { dmg: newDmg, label, log };
  }
  return null;
}

module.exports = {
  ENTRY_HOOKS, END_TURN_HOOKS,
  triggerOnEntry, triggerOnEndTurn,
  getModifiedMove, getCritRate, getStabMult,
  getAttackerMult, getDefenderMult, checkGanjoSurvive
};
