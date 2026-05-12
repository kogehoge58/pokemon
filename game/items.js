'use strict';

const { applyStatStage } = require('./pokemon.js');
const { applyStatus } = require('./status.js');

// 持ち物エフェクトレジストリ
// ITEM_HOOKS[itemName] = { onEntry(side, ctx), onEndTurn(side, ctx) }
const ITEM_HOOKS = {};

// -------- たべのこし：毎ターン 1/16 回復 --------
ITEM_HOOKS['たべのこし'] = {
  onEndTurn(side, ctx) {
    const p = ctx.active(side);
    if (!p || p.fainted || p.hp >= p.maxHp) return;
    const heal = Math.max(1, Math.floor(p.maxHp / 16));
    const hpBefore = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + heal);
    const msg = `${p.name}はたべのこしでHPを${p.hp - hpBefore}回復した！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'hit', side, hpAfter: p.hp, targetIndex: ctx.state.game.active[side], labels: [{ text: 'たべのこし', tone: 'heal' }], message: msg });
  },
};

// -------- くろいヘドロ：毒タイプなら1/16回復、それ以外は1/16ダメージ --------
ITEM_HOOKS['くろいヘドロ'] = {
  onEndTurn(side, ctx) {
    const p = ctx.active(side);
    if (!p || p.fainted) return;
    if (p.types.includes('どく')) {
      if (p.hp >= p.maxHp) return;
      const heal = Math.max(1, Math.floor(p.maxHp / 16));
      const hpBefore = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + heal);
      const msg = `${p.name}はくろいヘドロでHPを${p.hp - hpBefore}回復した！`;
      ctx.state.game.log.push(msg);
      ctx.addEffect({ kind: 'hit', side, hpAfter: p.hp, targetIndex: ctx.state.game.active[side], labels: [{ text: 'くろいヘドロ', tone: 'heal' }], message: msg });
    } else {
      const dmg = Math.max(1, Math.floor(p.maxHp / 16));
      const hpBefore = p.hp;
      p.hp = Math.max(0, p.hp - dmg);
      const msg = `${p.name}はくろいヘドロで${dmg}ダメージを受けた！`;
      ctx.state.game.log.push(msg);
      ctx.addEffect({ kind: 'hit', side, hpAfter: p.hp, targetIndex: ctx.state.game.active[side], labels: [{ text: 'くろいヘドロ', tone: 'status-psn' }], message: msg });
      if (p.hp <= 0 && !p.fainted) {
        p.fainted = true;
        const fm = `${p.name}は気絶した！`;
        ctx.state.game.log.push(fm);
        ctx.addEffect({ kind: 'faint', side, targetIndex: ctx.state.game.active[side], hpAfter: 0, message: fm });
      }
    }
  },
};

// -------- かえんだま：ターン終了時にやけど --------
ITEM_HOOKS['かえんだま'] = {
  onEndTurn(side, ctx) {
    const p = ctx.active(side);
    if (!p || p.fainted || p.status) return;
    if (applyStatus(p, 'brn')) {
      const msg = `${p.name}はかえんだまのせいでやけどした！`;
      ctx.state.game.log.push(msg);
      ctx.addEffect({ kind: 'status', side, status: 'brn', message: msg, targetIndex: ctx.state.game.active[side] });
    }
  },
};

// -------- オボンのみ即時発動チェック（HP半分以下になった時点でどこからでも呼べる） --------
function checkSitrusBerry(pokemon, side, ctx) {
  if (!pokemon || pokemon.fainted || pokemon.itemUsed || pokemon.item !== 'オボンのみ') return;
  if (pokemon.hp <= 0 || pokemon.hp > Math.floor(pokemon.maxHp / 2)) return;
  const opp = ctx.active(ctx.enemy(side));
  if (opp && opp.ability === 'きんちょうかん') return;
  const heal = Math.max(1, Math.floor(pokemon.maxHp / 4));
  const hpBefore = pokemon.hp;
  pokemon.hp = Math.min(pokemon.maxHp, pokemon.hp + heal);
  pokemon.itemUsed = true;
  const msg = `${pokemon.name}はオボンのみでHPを${pokemon.hp - hpBefore}回復した！`;
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'hit', side, hpAfter: pokemon.hp, targetIndex: ctx.state.game.active[side], labels: [{ text: 'オボンのみ', tone: 'heal' }], message: msg });
}

// -------- オボンのみ：HP半分以下で1/4回復 --------
ITEM_HOOKS['オボンのみ'] = {
  // ターン終了時の状態異常ダメージ等でHP半分以下になった場合のフォールバック
  onEndTurn(side, ctx) {
    checkSitrusBerry(ctx.active(side), side, ctx);
  },
};

// -------- ラムのみ：状態異常を1回回復 --------
ITEM_HOOKS['ラムのみ'] = {
  onEndTurn(side, ctx) {
    const p = ctx.active(side);
    if (!p || p.fainted || p.itemUsed || !p.status) return;
    const opp = ctx.active(ctx.enemy(side));
    if (opp && opp.ability === 'きんちょうかん') return;
    const oldStatus = p.status;
    p.status = null;
    p.statusTurns = 0;
    p.itemUsed = true;
    const labels = { brn: 'やけど', par: 'まひ', psn: 'どく', tox: 'もうどく', slp: 'ねむり', frz: 'こおり' };
    const msg = `${p.name}はラムのみで${labels[oldStatus] || oldStatus}が治った！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'status', side, status: null, message: msg, targetIndex: ctx.state.game.active[side] });
  },
};

// -------- ゴツゴツメット：接触技を受けた時に相手に1/6ダメージ --------
// ※ エンジン側（engine.js）で接触判定後に呼び出す必要あり
// onContactを追加して engine.js から呼ぶ（Session 3で完全対応予定）
ITEM_HOOKS['ゴツゴツメット'] = {};

// -------- しゅうかく：ターン終了時にきのみを復活させる（晴れなら確実） --------
ITEM_HOOKS['しゅうかく'] = {
  onEndTurn(side, ctx) {
    const p = ctx.active(side);
    if (!p || p.fainted || !p.ability === 'しゅうかく' || !p.itemUsed) return;
    const weather = ctx.state.game.weather;
    const revive = weather === 'sun' || Math.random() < 0.5;
    if (revive) {
      p.itemUsed = false;
      const msg = `${p.name}のしゅうかく！きのみが復活した！`;
      ctx.state.game.log.push(msg);
      ctx.addEffect({ kind: 'message', side, message: msg });
    }
  },
};

// -------- いのちのたま：攻撃後に最大HPの1/10ダメージ（getItemAttackerMult で1.3倍、反動はここで） --------
ITEM_HOOKS['いのちのたま'] = {
  // 反動はエンジン側でgetItemAttackerMultを使った後に別途処理
  // Session 3で onAfterAttack フックを実装予定
};

function triggerItemOnEntry(side, ctx) {
  const p = ctx.active(side);
  if (!p || !p.item) return;
  const hook = ITEM_HOOKS[p.item];
  if (hook && hook.onEntry) hook.onEntry(side, ctx);
}

function triggerItemOnEndTurn(side, ctx) {
  const p = ctx.active(side);
  if (!p || p.fainted || !p.item) return;
  const hook = ITEM_HOOKS[p.item];
  if (hook && hook.onEndTurn) hook.onEndTurn(side, ctx);
}

// -------- 攻撃側アイテム倍率 --------
// returns { mult, labels, logs }
function getItemAttackerMult(attacker, move) {
  const labels = [];
  const logs = [];
  let mult = 1;

  if (!attacker || !attacker.item) return { mult, labels, logs };

  // いのちのたま：全攻撃技 1.3倍
  if (attacker.item === 'いのちのたま' && move.power > 0) {
    mult *= 1.3;
    labels.push({ text: 'いのちのたま', tone: 'ability-red' });
    logs.push(`${attacker.name}のいのちのたま！威力が1.3倍！`);
  }

  // こだわりメガネ：特殊技 1.5倍
  if (attacker.item === 'こだわりメガネ' && move.category === '特殊') {
    mult *= 1.5;
    labels.push({ text: 'こだわりメガネ', tone: 'ability-red' });
    logs.push(`${attacker.name}のこだわりメガネ！特殊技が1.5倍！`);
  }

  // こだわりハチマキ：物理技 1.5倍
  if (attacker.item === 'こだわりハチマキ' && move.category === '物理') {
    mult *= 1.5;
    labels.push({ text: 'こだわりハチマキ', tone: 'ability-red' });
    logs.push(`${attacker.name}のこだわりハチマキ！物理技が1.5倍！`);
  }

  return { mult, labels, logs };
}

// -------- 防御側アイテム倍率 --------
// returns { mult, labels, logs }
function getItemDefenderMult(defender, move) {
  const labels = [];
  const logs = [];
  let mult = 1;

  if (!defender || !defender.item) return { mult, labels, logs };

  // とつげきチョッキ：特殊技の被ダメージ 1/1.5 倍
  if (defender.item === 'とつげきチョッキ' && move.category === '特殊') {
    mult *= (2 / 3);
    logs.push(`${defender.name}のとつげきチョッキ！特殊被ダメージ軽減！`);
  }

  // しんかのきせき：防御・特防が 1.5倍 → 被ダメ 1/1.5 倍
  if (defender.item === 'しんかのきせき') {
    const isPhysical = move.category === '物理';
    const isSpecial = move.category === '特殊';
    if (isPhysical || isSpecial) {
      mult *= (2 / 3);
      logs.push(`${defender.name}のしんかのきせき！耐久が1.5倍！`);
    }
  }

  return { mult, labels, logs };
}

// -------- 速度アイテム倍率（engine.js の速度比較で使う） --------
function getItemSpeedMult(pokemon) {
  if (!pokemon || !pokemon.item) return 1;
  if (pokemon.item === 'こだわりスカーフ') return 1.5;
  return 1;
}

// -------- きあいのタスキ：HP満タンから一撃耐え --------
function checkItemSurvive(defender, hpBefore, dmg) {
  if (defender && defender.item === 'きあいのタスキ' && !defender.itemUsed
      && hpBefore === defender.maxHp && dmg >= hpBefore) {
    const newDmg = hpBefore - 1;
    const label = { text: 'きあいのタスキ', tone: 'ability-blue' };
    const log = `${defender.name}のきあいのタスキ！HP満タンからの一撃をHP1で耐えた！`;
    defender.itemUsed = true;
    return { dmg: newDmg, label, log };
  }
  return null;
}

// -------- じゃくてんほけん：弱点技を受けた後に +2/+2 --------
function checkWeaknessPolicy(defender, defSide, eff, ctx) {
  if (!defender || defender.item !== 'じゃくてんほけん' || defender.itemUsed) return;
  if (eff < 2) return;
  defender.itemUsed = true;
  const { applyStatStage: _aS } = require('./pokemon.js');
  _aS(defender, 'atk', 2);
  _aS(defender, 'spa', 2);
  const msg = `${defender.name}のじゃくてんほけん！攻撃・特攻が大きく上がった！`;
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'ability', side: defSide, ability: 'じゃくてんほけん', labels: [{ text: 'じゃくてんほけん', tone: 'ability-red' }], message: msg });
}

// -------- いのちのたま反動：攻撃後に最大HPの1/10ダメージ --------
function applyLifeOrbRecoil(attacker, atkSide, ctx) {
  if (!attacker || attacker.item !== 'いのちのたま' || attacker.fainted) return;
  // マジックガードは受けない
  if (attacker.ability === 'マジックガード') return;
  const dmg = Math.max(1, Math.floor(attacker.maxHp / 10));
  const hpBefore = attacker.hp;
  attacker.hp = Math.max(0, attacker.hp - dmg);
  const msg = `${attacker.name}はいのちのたまの反動で${dmg}ダメージ！`;
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'hit', side: atkSide, hpAfter: attacker.hp, targetIndex: ctx.state.game.active[atkSide], labels: [{ text: 'いのちのたま', tone: 'status-brn' }], message: msg });
  checkSitrusBerry(attacker, atkSide, ctx);
  if (attacker.hp <= 0 && !attacker.fainted) {
    attacker.fainted = true;
    const fm = `${attacker.name}は気絶した！`;
    ctx.state.game.log.push(fm);
    ctx.addEffect({ kind: 'faint', side: atkSide, targetIndex: ctx.state.game.active[atkSide], hpAfter: 0, message: fm });
  }
}

module.exports = {
  ITEM_HOOKS,
  triggerItemOnEntry, triggerItemOnEndTurn,
  getItemAttackerMult, getItemDefenderMult, getItemSpeedMult,
  checkItemSurvive, checkWeaknessPolicy, applyLifeOrbRecoil, checkSitrusBerry,
};
