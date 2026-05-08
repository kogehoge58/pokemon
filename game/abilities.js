'use strict';

const { applyStatStage, stageMultiplier } = require('./pokemon.js');
const { applyStatus } = require('./status.js');
const { setWeather } = require('./weather.js');

// --- エントリー特性レジストリ ---
const ENTRY_HOOKS = {
  'いかく': (side, ctx) => {
    const p = ctx.active(side);
    if (!p || p.fainted) return;
    const targetSide = ctx.enemy(side);
    const target = ctx.active(targetSide);
    if (!target || target.fainted) return;
    // クリアボディ/しろいけむり：いかくを無効化
    if (target.ability === 'クリアボディ' || target.ability === 'しろいけむり') {
      const blockMsg = `${target.name}の${target.ability}！ いかくを防いだ！`;
      ctx.state.game.log.push(blockMsg);
      ctx.addEffect({ kind: 'ability', side: targetSide, ability: target.ability, message: blockMsg });
      return;
    }
    const applied = applyStatStage(target, 'atk', -1);
    if (!applied) return;
    const msg = `${p.name}のいかく！ ${target.name}の攻撃が下がった！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'ability', side, ability: 'いかく', labels: [{ text: 'いかく', tone: 'ability-blue' }], message: msg });
  },
  'トレース': (side, ctx) => {
    const p = ctx.active(side);
    const opp = ctx.active(ctx.enemy(side));
    if (!p || p.fainted || !opp) return;
    const uncopyable = new Set(['トレース', 'マルチタイプ', 'ふとうのけん', 'イリュージョン', 'かわりもの']);
    const copiedAbility = opp.ability;
    if (!copiedAbility || uncopyable.has(copiedAbility)) return;
    p.ability = copiedAbility;
    const msg = `${p.name}のトレース！ ${opp.name}の${copiedAbility}をコピーした！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'ability', side, ability: 'トレース', labels: [{ text: 'トレース', tone: 'ability-blue' }], message: msg });
    // コピーした特性のエントリーフックを発動（天候・いかく等）
    const hook = ENTRY_HOOKS[copiedAbility];
    if (hook) hook(side, ctx);
  },
  'ひでり': (side, ctx) => {
    const p = ctx.active(side);
    if (!p || p.fainted) return;
    const turns = p.item === 'あついいわ' ? 8 : 5;
    setWeather(ctx.state.game, 'sun', turns, ctx);
    const msg = `${p.name}のひでり！ 日差しが強くなった！${turns === 8 ? '（あついいわで延長）' : ''}`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'ability', side, ability: 'ひでり', labels: [{ text: 'ひでり', tone: 'ability-red' }], message: msg });
  },
  'あめふらし': (side, ctx) => {
    const p = ctx.active(side);
    if (!p || p.fainted) return;
    const turns = p.item === 'しめったいわ' ? 8 : 5;
    setWeather(ctx.state.game, 'rain', turns, ctx);
    const msg = `${p.name}のあめふらし！ 雨が降り始めた！${turns === 8 ? '（しめったいわで延長）' : ''}`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'ability', side, ability: 'あめふらし', labels: [{ text: 'あめふらし', tone: 'ability-blue' }], message: msg });
  },
  'すなおこし': (side, ctx) => {
    const p = ctx.active(side);
    if (!p || p.fainted) return;
    setWeather(ctx.state.game, 'sand', 5, ctx);
    const msg = `${p.name}のすなおこし！ 砂嵐が起きた！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'ability', side, ability: 'すなおこし', labels: [{ text: 'すなおこし', tone: 'ability-red' }], message: msg });
  },
  'もらいび': (side, ctx) => {
    // もらいびは炎技を受けた時に発動（engine.js の免疫チェックで処理）
  },
};

// --- エンドターン特性レジストリ ---
const END_TURN_HOOKS = {
  'かそく': (side, ctx) => {
    const p = ctx.active(side);
    if (!p || p.fainted) return;
    const applied = applyStatStage(p, 'spe', 1);
    if (!applied) return;
    const mult = stageMultiplier(p.statStages.spe).toFixed(2).replace(/\.00$/, '');
    const msg = `${p.name}のかそく！ 素早さが${mult}倍になった！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'ability', side, ability: 'かそく', labels: [{ text: 'かそく', tone: 'ability-red' }], message: msg });
  },
  'さいせいりょく': (side, ctx) => {
    // さいせいりょく：交代時にHP1/3回復（engine.js の doSwitch で処理）
  },
  'ムラっけ': (side, ctx) => {
    const p = ctx.active(side);
    if (!p || p.fainted) return;
    const statKeys = ['atk', 'def', 'spa', 'spd', 'spe', 'acc', 'eva'];
    const statNames = { atk:'攻撃', def:'防御', spa:'特攻', spd:'特防', spe:'素早さ', acc:'命中', eva:'回避' };
    // ランダムに1つ+2、別の1つ-1
    const shuffled = [...statKeys].sort(() => Math.random() - 0.5);
    const upStat = shuffled[0];
    const downStat = shuffled.find(k => k !== upStat);
    applyStatStage(p, upStat, 2);
    applyStatStage(p, downStat, -1);
    const msg = `${p.name}のムラっけ！${statNames[upStat]}が上がり、${statNames[downStat]}が下がった！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'ability', side, ability: 'ムラっけ', labels: [{ text: 'ムラっけ', tone: 'ability-red' }], message: msg });
  },
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

// --- タイプ吸収・無効特性チェック ---
// returns { absorbed, ability, message } or null
function checkMoveImmunity(atk, def, moveType, moveCategory, ctx) {
  if (!def || !def.ability) return null;
  const ab = def.ability;

  if (ab === 'ふゆう' && moveType === 'じめん') {
    return { absorbed: false, ability: 'ふゆう', message: `${def.name}のふゆう！ じめん技を受けない！` };
  }
  if (ab === 'もらいび' && moveType === 'ほのお') {
    if (!def.flashFire) {
      def.flashFire = true;
      const msg = `${def.name}のもらいび！ ほのお技が無効化され、炎技の威力が上がった！`;
      return { absorbed: true, ability: 'もらいび', message: msg };
    }
    return { absorbed: true, ability: 'もらいび', message: `${def.name}のもらいび！ ほのお技を無効化した！` };
  }
  if (ab === 'ちくでん' && moveType === 'でんき') {
    const heal = Math.max(1, Math.floor(def.maxHp / 4));
    const hpBefore = def.hp;
    def.hp = Math.min(def.maxHp, def.hp + heal);
    if (ctx) {
      const msg = `${def.name}のちくでん！ でんき技でHPが回復した！ (+${def.hp - hpBefore})`;
      ctx.state.game.log.push(msg);
      ctx.addEffect({ kind: 'damage', side: null, hpBefore, hpAfter: def.hp, message: msg });
    }
    return { absorbed: true, ability: 'ちくでん', message: `${def.name}のちくでん！ でんき技を吸収した！` };
  }
  if (ab === 'ちょすい' && moveType === 'みず') {
    const heal = Math.max(1, Math.floor(def.maxHp / 4));
    const hpBefore = def.hp;
    def.hp = Math.min(def.maxHp, def.hp + heal);
    if (ctx) {
      const msg = `${def.name}のちょすい！ みず技でHPが回復した！ (+${def.hp - hpBefore})`;
      ctx.state.game.log.push(msg);
      ctx.addEffect({ kind: 'damage', side: null, hpBefore, hpAfter: def.hp, message: msg });
    }
    return { absorbed: true, ability: 'ちょすい', message: `${def.name}のちょすい！ みず技を吸収した！` };
  }
  if (ab === 'ひらいしん' && moveType === 'でんき') {
    const applied = applyStatStage(def, 'spa', 1);
    if (applied && ctx) {
      const msg = `${def.name}のひらいしん！ でんき技を吸収し、特攻が上がった！`;
      ctx.state.game.log.push(msg);
      ctx.addEffect({ kind: 'ability', side: null, ability: 'ひらいしん', message: msg });
    }
    return { absorbed: true, ability: 'ひらいしん', message: `${def.name}のひらいしん！ でんき技を無効化した！` };
  }
  if (ab === 'かんそうはだ' && moveType === 'みず') {
    const heal = Math.max(1, Math.floor(def.maxHp / 4));
    const hpBefore = def.hp;
    def.hp = Math.min(def.maxHp, def.hp + heal);
    if (ctx) {
      const msg = `${def.name}のかんそうはだ！ みず技でHPが回復した！ (+${def.hp - hpBefore})`;
      ctx.state.game.log.push(msg);
      ctx.addEffect({ kind: 'damage', side: null, hpBefore, hpAfter: def.hp, message: msg });
    }
    return { absorbed: true, ability: 'かんそうはだ', message: `${def.name}のかんそうはだ！ みず技を吸収した！` };
  }
  if (ab === 'じりょく' && moveType === 'はがね') {
    return { absorbed: false, ability: 'じりょく', message: `${def.name}のじりょく！ はがね技を無効化した！` };
  }
  if (ab === 'フラッシュファイア' && moveType === 'ほのお') {
    if (!def.flashFire) {
      def.flashFire = true;
      return { absorbed: true, ability: 'フラッシュファイア', message: `${def.name}のフラッシュファイア！ ほのお技を無効化し、炎技の威力が上がった！` };
    }
    return { absorbed: true, ability: 'フラッシュファイア', message: `${def.name}のフラッシュファイア！ ほのお技を無効化した！` };
  }
  return null;
}

// --- パッシブ特性クエリ関数 ---

function getModifiedMove(attacker, defender, move) {
  let power = move.power;
  let accuracy = move.accuracy;
  let noGuard = false;

  if (attacker && attacker.ability === 'ノーガード') noGuard = true;
  if (defender && defender.ability === 'ノーガード') noGuard = true;

  if (attacker && attacker.ability === 'はりきり' && move.category === '物理') {
    power = Math.round(power * 1.5);
    accuracy = Math.floor(accuracy * 0.8);
  }
  if (noGuard) accuracy = 100;

  // ちからずく：追加効果なし、威力1.3倍（moves.js の MOVE_EFFECTS 呼び出し側でスキップ）
  if (attacker && attacker.ability === 'ちからずく') {
    power = Math.round(power * 1.3);
  }

  return { power, accuracy, noGuard };
}

function getCritRate(attacker, moveName) {
  const { getMoveBaseCritStage } = require('./moves.js');
  let stage = getMoveBaseCritStage(moveName || '');
  if (attacker && attacker.ability === 'きょううん') stage += 1;
  if (stage <= 0) return 1 / 24;
  if (stage === 1) return 1 / 8;
  if (stage === 2) return 1 / 2;
  return 1;
}

function getStabMult(attacker, move, baseStab) {
  if (attacker && attacker.ability === 'てきおうりょく' && attacker.types.includes(move.type)) return 2;
  return baseStab;
}

// returns { mult, labels, logs }
function getAttackerMult(attacker, move, eff, isLastMove, weather) {
  const labels = [];
  const logs = [];
  let mult = 1;

  if (attacker && attacker.ability === 'アナライズ' && isLastMove) {
    mult *= 1.3;
    const msg = `${attacker.name}のアナライズ！ 最後に攻撃したため1.3倍！`;
    logs.push(msg);
    labels.push({ text: 'アナライズ', tone: 'ability-red' });
  }
  if (attacker && attacker.ability === 'いろめがね' && eff > 0 && eff < 1) {
    mult *= 2;
    const msg = `${attacker.name}のいろめがね！ いまひとつ技が2.0倍！`;
    logs.push(msg);
    labels.push({ text: 'いろめがね', tone: 'ability-red' });
  }
  if (attacker && attacker.ability === 'こんじょう' && attacker.status) {
    mult *= 1.5;
    const msg = `${attacker.name}のこんじょう！ 状態異常で1.5倍！`;
    logs.push(msg);
    labels.push({ text: 'こんじょう', tone: 'ability-red' });
  }
  if (attacker && attacker.ability === 'もらいび' && attacker.flashFire && move.type === 'ほのお') {
    mult *= 1.5;
    const msg = `${attacker.name}のもらいび！ ほのお技が1.5倍！`;
    logs.push(msg);
    labels.push({ text: 'もらいび', tone: 'ability-red' });
  }
  if (attacker && attacker.ability === 'サンパワー' && weather === 'sun' && move.type === 'ほのお') {
    mult *= 1.5;
    const msg = `${attacker.name}のサンパワー！ はれで特殊技1.5倍！`;
    logs.push(msg);
    labels.push({ text: 'サンパワー', tone: 'ability-red' });
  }
  if (attacker && attacker.ability === 'すいすい' && weather === 'rain') {
    // すいすいは素早さ上昇（エントリーで処理）、ダメージ倍率はなし
  }
  if (attacker && attacker.ability === 'テクニシャン' && move.power <= 60) {
    mult *= 1.5;
    const msg = `${attacker.name}のテクニシャン！ 威力60以下の技が1.5倍！`;
    logs.push(msg);
    labels.push({ text: 'テクニシャン', tone: 'ability-red' });
  }
  if (attacker && attacker.ability === 'ちからもち' && move.category === '物理') {
    mult *= 2;
    const msg = `${attacker.name}のちからもち！ 物理技ダメージ2倍！`;
    logs.push(msg);
    labels.push({ text: 'ちからもち', tone: 'ability-red' });
  }
  if (attacker && attacker.ability === 'スキルリンク') {
    // スキルリンク：連続技が5回ヒット（engine.js 側で使用回数を固定）
  }

  // げきりゅう：みず技がHP1/3以下で1.5倍
  if (attacker && attacker.ability === 'げきりゅう' && move.type === 'みず' && attacker.hp <= Math.floor(attacker.maxHp / 3)) {
    mult *= 1.5;
    const msg = `${attacker.name}のげきりゅう！ みず技が1.5倍！`;
    logs.push(msg);
    labels.push({ text: 'げきりゅう', tone: 'ability-red' });
  }
  // もうか：ほのお技がHP1/3以下で1.5倍
  if (attacker && attacker.ability === 'もうか' && move.type === 'ほのお' && attacker.hp <= Math.floor(attacker.maxHp / 3)) {
    mult *= 1.5;
    const msg = `${attacker.name}のもうか！ ほのお技が1.5倍！`;
    logs.push(msg);
    labels.push({ text: 'もうか', tone: 'ability-red' });
  }
  // しんりょく：くさ技がHP1/3以下で1.5倍
  if (attacker && attacker.ability === 'しんりょく' && move.type === 'くさ' && attacker.hp <= Math.floor(attacker.maxHp / 3)) {
    mult *= 1.5;
    const msg = `${attacker.name}のしんりょく！ くさ技が1.5倍！`;
    logs.push(msg);
    labels.push({ text: 'しんりょく', tone: 'ability-red' });
  }
  // むしのしらせ：むし技がHP1/3以下で1.5倍
  if (attacker && attacker.ability === 'むしのしらせ' && move.type === 'むし' && attacker.hp <= Math.floor(attacker.maxHp / 3)) {
    mult *= 1.5;
    const msg = `${attacker.name}のむしのしらせ！ むし技が1.5倍！`;
    logs.push(msg);
    labels.push({ text: 'むしのしらせ', tone: 'ability-red' });
  }

  return { mult, labels, logs };
}

// returns { mult, labels, logs }
function getDefenderMult(defender, eff) {
  const labels = [];
  const logs = [];
  let mult = 1;

  if (defender && defender.ability === 'フィルター' && eff >= 2) {
    mult *= 0.75;
    const msg = `${defender.name}のフィルター！ 効果抜群を0.75倍に！`;
    logs.push(msg);
    labels.push({ text: 'フィルター', tone: 'ability-blue' });
  }
  if (defender && defender.ability === 'マルチスケイル' && defender.hp === defender.maxHp) {
    mult *= 0.5;
    const msg = `${defender.name}のマルチスケイル！ HP満タンで被ダメージ0.5倍！`;
    logs.push(msg);
    labels.push({ text: 'マルチスケイル', tone: 'ability-blue' });
  }
  if (defender && defender.ability === 'かんそうはだ' && eff > 0) {
    // 炎技追加1.25倍ダメージ
    mult *= 1;
    // ※ 炎タイプへのかんそうはだダメージ追加は engine.js 側でチェック
  }
  if (defender && defender.ability === 'あついしぼう') {
    // 炎・氷技の被ダメージを0.5倍
    mult *= 1; // engine.js でタイプ別に処理
  }
  if (defender && defender.ability === 'ふしぎなまもり' && eff < 2) {
    mult = 0;
    logs.push(`${defender.name}のふしぎなまもり！ 効果抜群でない技は効かない！`);
    labels.push({ text: 'ふしぎなまもり', tone: 'ability-blue' });
  }

  return { mult, labels, logs };
}

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
  checkMoveImmunity,
  getModifiedMove, getCritRate, getStabMult,
  getAttackerMult, getDefenderMult, checkGanjoSurvive,
};
