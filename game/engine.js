'use strict';

const { MOVES } = require('../data.js');
const { state, enemy, active, addEffect, startEffects, finishEffects, effectiveness, effText } = require('./context.js');
const { resetVolatileStats, accStageMultiplier } = require('./pokemon.js');
const {
  triggerOnEntry, triggerOnEndTurn,
  checkMoveImmunity,
  getModifiedMove, getCritRate, getStabMult,
  getAttackerMult, getDefenderMult, checkGanjoSurvive,
} = require('./abilities.js');
const { triggerItemOnEntry, triggerItemOnEndTurn, getItemAttackerMult, getItemDefenderMult } = require('./items.js');
const { MOVE_PRIORITY, applyMoveAdditionalEffect } = require('./moves.js');
const {
  checkCanMove, applyStatusEndOfTurn,
  getBurnAttackMult, getParalysisSpeedMult,
} = require('./status.js');
const { getWeatherMoveMult, getSandSpDefBoost, applyWeatherEndOfTurn, thunderAccuracy, hurricaneAccuracy } = require('./weather.js');
const { applyHazardsOnEntry } = require('./hazards.js');

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
  const incoming = active(s);
  incoming.firstTurnOut = true;
  state.game.log.push(`プレイヤー${s}は ${incoming.name} を繰り出した！`);
  addEffect({ kind: 'message', side: s, message: `プレイヤー${s}は ${incoming.name} を繰り出した！` });
  if (triggerEntry) {
    triggerOnEntry(s, ctx);
    triggerItemOnEntry(s, ctx);
    applyHazardsOnEntry(s, incoming, ctx);
  }
}

// こんらん自傷ダメージ（ノーマルタイプ・威力40・物理）
function doConfusionSelfHurt(side) {
  const p = active(side);
  const dmg = Math.max(1, Math.floor((((22 * 40 * p.stats.atk / p.stats.def) / 50) + 2) * ((Math.floor(Math.random() * 16) + 85) / 100)));
  const hpBefore = p.hp;
  p.hp = Math.max(0, p.hp - dmg);
  const msg = `${p.name}は混乱して自分を傷つけた！ (-${dmg})`;
  state.game.log.push(msg);
  addEffect({ kind: 'damage', side, hpBefore, hpAfter: p.hp, message: msg });
  if (p.hp <= 0 && !p.fainted) {
    p.fainted = true;
    const fm = `${p.name}は気絶した！`;
    state.game.log.push(fm);
    addEffect({ kind: 'faint', side, targetIndex: state.game.active[side], hpAfter: 0, message: fm });
  }
}

function isAttackMove(moveName) {
  const m = MOVES[moveName];
  return m && (m.category === '物理' || m.category === '特殊');
}

function doAttack(s, moveName, isLastMove) {
  const g = state.game;
  const atk = active(s);
  const defSide = enemy(s);
  const def = active(defSide);
  const m = MOVES[moveName];
  if (!atk || !def || atk.fainted || g.winner) return;

  // 使用時にみちづれをリセット（別の技を使う場合）
  if (moveName !== 'みちづれ') atk.destinyBond = false;

  const weather = g.weather?.type || null;

  // まもる判定
  if (def.protected) {
    const attackMsg = `${atk.name} の ${moveName}！`;
    g.log.push(attackMsg);
    addEffect({ kind: 'attack', side: s, moveName, message: attackMsg });
    const protMsg = `${def.name}は身を守っている！`;
    g.log.push(protMsg);
    addEffect({ kind: 'miss', side: defSide, message: protMsg });
    atk.lastMoveUsed = moveName;
    return;
  }

  // タイプ吸収・無効特性チェック
  const immunity = checkMoveImmunity(atk, def, m.type, m.category, ctx);
  if (immunity) {
    const attackMsg = `${atk.name} の ${moveName}！`;
    g.log.push(attackMsg);
    addEffect({ kind: 'attack', side: s, moveName, message: attackMsg });
    g.log.push(immunity.message);
    addEffect({ kind: 'ability', side: defSide, ability: immunity.ability, message: immunity.message });
    atk.lastMoveUsed = moveName;
    return;
  }

  // かんそうはだ炎技追加ダメージチェック用フラグ
  const drySkindFire = def.ability === 'かんそうはだ' && m.type === 'ほのお';

  const attackMsg = `${atk.name} の ${moveName}（${m.type}）！`;
  g.log.push(attackMsg);

  // 命中チェック
  const adjusted = getModifiedMove(atk, def, m);
  const accStage = (atk.statStages?.acc || 0) - (def.statStages?.eva || 0);
  const accMult = accStageMultiplier(accStage);
  let accuracy = adjusted.accuracy * accMult;
  // 天候命中修正
  if (moveName === 'かみなり') accuracy = thunderAccuracy(weather);
  if (moveName === 'ぼうふう') accuracy = hurricaneAccuracy(weather);

  if (!adjusted.noGuard && accuracy < 9999 && Math.random() * 100 >= accuracy) {
    addEffect({ kind: 'attack', side: s, moveName, message: attackMsg });
    const missMsg = `${atk.name} の攻撃は当たらなかった！`;
    g.log.push(missMsg);
    addEffect({ kind: 'miss', side: defSide, message: missMsg });
    atk.lastMoveUsed = moveName;
    return;
  }

  // 効果なし判定（命中チェック後）
  const eff = effectiveness(m.type, def.types);
  if (eff === 0) {
    addEffect({ kind: 'attack', side: s, moveName, message: attackMsg });
    const noEffMsg = `${def.name}には効果がない...`;
    g.log.push(noEffMsg);
    addEffect({ kind: 'miss', side: defSide, message: noEffMsg });
    atk.lastMoveUsed = moveName;
    return;
  }

  // 固定ダメージ技
  let fixedDmg = null;
  if (moveName === 'カウンター') {
    if (atk.lastMoveDamage.physical === 0) {
      const fMsg = `${atk.name}のカウンターは失敗した！`;
      g.log.push(fMsg);
      addEffect({ kind: 'miss', side: defSide, message: fMsg });
      atk.lastMoveUsed = moveName;
      return;
    }
    fixedDmg = atk.lastMoveDamage.physical * 2;
  }
  if (moveName === 'ミラーコート') {
    if (atk.lastMoveDamage.special === 0) {
      const fMsg = `${atk.name}のミラーコートは失敗した！`;
      g.log.push(fMsg);
      addEffect({ kind: 'miss', side: defSide, message: fMsg });
      atk.lastMoveUsed = moveName;
      return;
    }
    fixedDmg = atk.lastMoveDamage.special * 2;
  }
  if (moveName === 'ちきゅうなげ' || moveName === 'ナイトヘッド') fixedDmg = 50;

  // サイコショック：特攻で防御を割る
  const atkStatKey = m.category === '物理' ? 'atk' : 'spa';
  const defStatKey = (m.category === '物理' || moveName === 'サイコショック') ? 'def' : 'spd';

  const atkStat = atk.stats[atkStatKey];
  const rawDefStat = def.stats[defStatKey];

  const baseStab = atk.types.includes(m.type) ? 1.5 : 1;
  const stab = getStabMult(atk, m, baseStab);
  const random = fixedDmg === null ? (Math.floor(Math.random() * 16) + 85) / 100 : 1;
  const isCritical = fixedDmg === null && Math.random() < getCritRate(atk, moveName);
  const critical = isCritical ? 1.5 : 1;

  const burnMult = getBurnAttackMult(atk, m.category, atk.ability);
  const weatherMult = getWeatherMoveMult(weather, m.type);
  const sandSpDefBoost = defStatKey === 'spd' ? getSandSpDefBoost(def, weather) : 1;
  const defStat = rawDefStat * sandSpDefBoost;

  // かんそうはだ：炎技で追加1.25倍被ダメージ
  const drySkinFireMult = drySkindFire ? 1.25 : 1;

  // あついしぼう：炎・氷技0.5倍
  const thickFatMult = (def.ability === 'あついしぼう' && (m.type === 'ほのお' || m.type === 'こおり')) ? 0.5 : 1;

  const atkAbility = getAttackerMult(atk, m, eff, isLastMove, weather);
  const defAbility = getDefenderMult(def, eff);
  const atkItem = getItemAttackerMult(atk, m);
  const defItem = getItemDefenderMult(def, m);

  // ふしぎなまもりで eff<2 なら 0倍（getDefenderMult 側で処理済み）
  const abilityMultiplier = atkAbility.mult * defAbility.mult * atkItem.mult * defItem.mult;

  let dmg;
  if (fixedDmg !== null) {
    dmg = fixedDmg;
  } else {
    dmg = Math.floor(((((22 * adjusted.power * atkStat / defStat) / 50) + 2) * stab * eff * random) * critical * abilityMultiplier * burnMult * weatherMult * drySkinFireMult * thickFatMult);
    if (dmg < 1 && eff > 0) dmg = 1;
  }

  const abilityAttackLabels = [...atkAbility.labels];
  const abilityHitLabels = [...defAbility.labels];
  const abilityLogs = [...atkAbility.logs, ...defAbility.logs, ...atkItem.logs, ...defItem.logs];

  if (stab !== baseStab) {
    const msg = `${atk.name}のてきおうりょく！ タイプ一致補正が2.0倍！`;
    abilityLogs.unshift(msg);
    abilityAttackLabels.unshift({ text: 'てきおうりょく', tone: 'ability-red' });
  }
  if (burnMult !== 1) abilityLogs.push(`${atk.name}はやけどで攻撃が弱まった！`);
  if (weatherMult > 1) abilityLogs.push(weather === 'sun' ? 'はれで炎技の威力が上がった！' : 'あめで水技の威力が上がった！');
  if (weatherMult < 1) abilityLogs.push(weather === 'sun' ? 'はれで水技の威力が下がった！' : 'あめで炎技の威力が下がった！');
  if (sandSpDefBoost > 1) abilityLogs.push(`すなあらしで${def.name}の特防が上がった！`);

  const targetIndex = g.active[defSide];
  const hpBefore = def.hp;

  const ganjo = (fixedDmg === null) ? checkGanjoSurvive(def, hpBefore, dmg, eff) : null;
  if (ganjo) {
    dmg = ganjo.dmg;
    abilityHitLabels.unshift(ganjo.label);
    abilityLogs.push(ganjo.log);
  }

  addEffect({ kind: 'attack', side: s, moveName, message: attackMsg, abilityLabels: abilityAttackLabels });
  for (const msg of abilityLogs) g.log.push(msg);

  // カウンター/ミラーコート用にダメージ記録
  if (m.category === '物理') def.lastMoveDamage.physical = dmg;
  if (m.category === '特殊') def.lastMoveDamage.special = dmg;

  def.hp = Math.max(0, def.hp - dmg);

  const damageMsg = `${def.name} に ${dmg} ダメージ！ 相性：${effText(eff)}`;
  const labels = [{ text: effText(eff), tone: eff >= 2 ? 'super' : (eff < 1 ? 'resist' : ''), damage: dmg }];
  if (abilityHitLabels.length) labels.unshift(...abilityHitLabels);
  if (isCritical && eff > 0) labels.unshift({ text: '急所！', tone: 'critical', damage: dmg });
  g.log.push(damageMsg);
  addEffect({ kind: 'hit', side: defSide, targetIndex, hpBefore, hpAfter: def.hp, message: damageMsg, labels });
  if (isCritical && eff > 0) g.log.push('急所に当たった！');

  // ちからずく：追加効果を発動しない
  if (atk.ability !== 'ちからずく') {
    applyMoveAdditionalEffect(moveName, s, atk, def, dmg, ctx);
  }

  // リコイルや追加効果で攻撃側が気絶した可能性を先にチェック
  if (atk.hp <= 0 && !atk.fainted) {
    atk.fainted = true;
    const fm = `${atk.name}は気絶した！`;
    g.log.push(fm);
    addEffect({ kind: 'faint', side: s, targetIndex: g.active[s], hpAfter: 0, message: fm });
    checkWinner(defSide);
  }

  if (def.hp <= 0 && !def.fainted) {
    def.fainted = true;
    const faintMsg = `${def.name} は気絶した！`;
    g.log.push(faintMsg);
    addEffect({ kind: 'faint', side: defSide, targetIndex, hpAfter: 0, message: faintMsg });

    // みちづれ
    if (def.destinyBond && !atk.fainted) {
      atk.hp = 0;
      atk.fainted = true;
      const dbMsg = `みちづれで ${atk.name} も道連れになった！`;
      g.log.push(dbMsg);
      addEffect({ kind: 'faint', side: s, targetIndex: g.active[s], hpAfter: 0, message: dbMsg });
    }
    checkWinner(s);
  }

  atk.lastMoveUsed = moveName;
}

function doStatusMove(s, moveName, isLastMove) {
  const g = state.game;
  const atk = active(s);
  const defSide = enemy(s);
  const def = active(defSide);
  const m = MOVES[moveName];
  if (!atk || atk.fainted || g.winner) return;

  if (moveName !== 'みちづれ') atk.destinyBond = false;

  const attackMsg = `${atk.name} の ${moveName}！`;
  g.log.push(attackMsg);
  addEffect({ kind: 'attack', side: s, moveName, message: attackMsg });

  // 命中チェック（accuracy が設定されている変化技のみ）
  if (m.accuracy < 100) {
    const adjusted = getModifiedMove(atk, def, m);
    if (!adjusted.noGuard) {
      const accStage = (atk.statStages?.acc || 0) - (def?.statStages?.eva || 0);
      const accMult = accStageMultiplier(accStage);
      const accuracy = adjusted.accuracy * accMult;
      if (Math.random() * 100 >= accuracy) {
        const missMsg = `${atk.name}のわざは失敗した！`;
        g.log.push(missMsg);
        addEffect({ kind: 'miss', side: defSide, message: missMsg });
        atk.lastMoveUsed = moveName;
        return;
      }
    }
  }

  applyMoveAdditionalEffect(moveName, s, atk, def, 0, ctx);
  atk.lastMoveUsed = moveName;
}

function resolveTurn() {
  startEffects();
  const g = state.game;
  const actions = [{ side: 'A', cmd: g.commands.A }, { side: 'B', cmd: g.commands.B }];

  // 降参処理
  const surrenderActions = actions.filter(a => a.cmd?.type === 'surrender');
  if (surrenderActions.length === 2) {
    const msg = '両プレイヤーが降参しました。引き分け！';
    g.winner = 'draw';
    g.forceSwitch = null;
    g.message = msg;
    g.log.push(msg);
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

  // 交代処理（同時）
  const switchActions = actions.filter(a => a.cmd?.type === 'switch');
  for (const a of switchActions) doSwitch(a.side, a.cmd.index, false);
  for (const a of switchActions) {
    triggerOnEntry(a.side, ctx);
    triggerItemOnEntry(a.side, ctx);
    applyHazardsOnEntry(a.side, active(a.side), ctx);
  }

  // 技行動：優先度 → 素早さ（まひ/トリックルーム考慮）でソート
  const moveActions = actions
    .filter(a => a.cmd?.type === 'move')
    .map(a => {
      const poke = active(a.side);
      const mn = a.cmd.moveName;
      const priority = MOVE_PRIORITY[mn] || 0;
      const spe = Math.floor(poke.stats.spe * getParalysisSpeedMult(poke));
      return { ...a, priority, spe, tie: Math.random() };
    })
    .sort((x, y) => {
      if (x.priority !== y.priority) return y.priority - x.priority;
      if (g.trickRoom > 0) return x.spe !== y.spe ? x.spe - y.spe : x.tie - y.tie;
      return x.spe !== y.spe ? y.spe - x.spe : x.tie - y.tie;
    });

  // プロテクト使用追跡
  const protectUsedSides = new Set();

  for (let i = 0; i < moveActions.length; i++) {
    const a = moveActions[i];
    const poke = active(a.side);
    const mn = a.cmd.moveName;
    if (!poke || poke.fainted || g.winner) continue;

    // まもる / みきり
    if (mn === 'まもる' || mn === 'みきり') {
      protectUsedSides.add(a.side);
      const successRate = 1 / Math.pow(2, poke.protectCounter);
      if (Math.random() < successRate) {
        poke.protected = true;
        poke.protectCounter++;
        const msg = `${poke.name}は身を守った！`;
        g.log.push(msg);
        addEffect({ kind: 'message', side: a.side, message: msg });
      } else {
        poke.protectCounter = 0;
        const msg = `${poke.name}のまもるは失敗した！`;
        g.log.push(msg);
        addEffect({ kind: 'message', side: a.side, message: msg });
      }
      poke.lastMoveUsed = mn;
      continue;
    }

    // ふいうち：相手が攻撃技を選択しておらず/既に動いた場合は失敗
    if (mn === 'ふいうち') {
      const targetSide = enemy(a.side);
      const targetCmd = g.commands[targetSide];
      const targetAlreadyMoved = moveActions.slice(0, i).some(prev => prev.side === targetSide);
      const targetIsAttacking = targetCmd?.type === 'move' && isAttackMove(targetCmd.moveName);
      if (!targetIsAttacking || targetAlreadyMoved) {
        const msg = `${poke.name}のふいうちは失敗した！`;
        g.log.push(msg);
        addEffect({ kind: 'message', side: a.side, message: msg });
        poke.lastMoveUsed = mn;
        continue;
      }
    }

    // ねこだまし：初登場ターン以外は失敗
    if (mn === 'ねこだまし' && !poke.firstTurnOut) {
      const msg = `${poke.name}のねこだましは失敗した！`;
      g.log.push(msg);
      addEffect({ kind: 'message', side: a.side, message: msg });
      poke.lastMoveUsed = mn;
      continue;
    }

    // 行動可否チェック（まひ/ねむり/こおり/こんらん）
    const canMoveResult = checkCanMove(poke);
    if (canMoveResult.wakeUp) {
      const msg = `${poke.name}は目を覚ました！`;
      g.log.push(msg);
      addEffect({ kind: 'status', side: a.side, status: null, message: msg });
    }
    if (canMoveResult.thawed) {
      const msg = `${poke.name}のこおりが溶けた！`;
      g.log.push(msg);
      addEffect({ kind: 'status', side: a.side, status: null, message: msg });
    }
    if (!canMoveResult.canMove) {
      if (canMoveResult.reason === 'par') {
        const msg = `${poke.name}はまひで動けない！`;
        g.log.push(msg);
        addEffect({ kind: 'message', side: a.side, message: msg });
      } else if (canMoveResult.reason === 'slp') {
        const msg = `${poke.name}はぐーぐー眠っている...`;
        g.log.push(msg);
        addEffect({ kind: 'message', side: a.side, message: msg });
      } else if (canMoveResult.reason === 'frz') {
        const msg = `${poke.name}はこおって動けない！`;
        g.log.push(msg);
        addEffect({ kind: 'message', side: a.side, message: msg });
      } else if (canMoveResult.reason === 'confused') {
        const confMsg = `${poke.name}は混乱している！`;
        g.log.push(confMsg);
        addEffect({ kind: 'message', side: a.side, message: confMsg });
        if (canMoveResult.selfHurt) doConfusionSelfHurt(a.side);
      }
      poke.lastMoveUsed = mn;
      continue;
    }

    // ひるみチェック
    if (poke.flinched) {
      const msg = `${poke.name}はひるんで動けない！`;
      g.log.push(msg);
      addEffect({ kind: 'message', side: a.side, message: msg });
      poke.lastMoveUsed = mn;
      continue;
    }

    // 技実行
    const m = MOVES[mn];
    if (!m) continue;
    const isLastAction = i === moveActions.length - 1;
    if (m.category === '変化') {
      doStatusMove(a.side, mn, isLastAction);
    } else {
      doAttack(a.side, mn, isLastAction);
    }

    // ボルトチェンジ/とんぼがえり（自発的交代フラグ処理は将来実装）
    if (g._voltSwitch) {
      delete g._voltSwitch; // TODO: 実装後に交代UIを呼び出す
    }
  }

  // ターン終了処理
  if (!g.winner) {
    // 1. 状態異常ダメージ（A→B）
    ['A', 'B'].forEach(side => {
      if (g.winner) return;
      const p = active(side);
      if (p && !p.fainted) {
        applyStatusEndOfTurn(p, side, ctx);
        if (p.fainted) checkWinner(enemy(side));
      }
    });

    // 2. 天候ダメージ・カウントダウン
    if (!g.winner) {
      applyWeatherEndOfTurn(ctx);
      ['A', 'B'].forEach(side => {
        if (active(side)?.fainted && !g.winner) checkWinner(enemy(side));
      });
    }

    // 3. 持ち物・特性エンドターン
    if (!g.winner) {
      ['A', 'B'].forEach(side => {
        if (g.winner) return;
        triggerItemOnEndTurn(side, ctx);
        triggerOnEndTurn(side, ctx);
        if (active(side)?.fainted) checkWinner(enemy(side));
      });
    }

    // 4. ほろびのうたカウントダウン
    if (!g.winner) {
      ['A', 'B'].forEach(side => {
        if (g.winner) return;
        const p = active(side);
        if (p && !p.fainted && p.perishSongCounter > 0) {
          p.perishSongCounter--;
          const msg = `${p.name}のほろびのカウント：${p.perishSongCounter}`;
          g.log.push(msg);
          addEffect({ kind: 'message', side, message: msg });
          if (p.perishSongCounter === 0) {
            p.hp = 0;
            p.fainted = true;
            const fm = `${p.name}はほろびのうたで気絶した！`;
            g.log.push(fm);
            addEffect({ kind: 'faint', side, targetIndex: g.active[side], hpAfter: 0, message: fm });
            checkWinner(enemy(side));
          }
        }
      });
    }

    // 5. トリックルームカウントダウン
    if (g.trickRoom > 0) {
      g.trickRoom--;
      if (g.trickRoom === 0) {
        const msg = 'トリックルームが終わった！';
        g.log.push(msg);
        addEffect({ kind: 'message', side: 'A', message: msg });
      }
    }

    // 6. 揮発性フラグのクリーンアップ
    ['A', 'B'].forEach(side => {
      const p = active(side);
      if (!p) return;
      p.flinched = false;
      p.protected = false;
      // まもるを使わなかったポケモンはカウンターをリセット
      if (!protectUsedSides.has(side)) p.protectCounter = 0;
      p.firstTurnOut = false;
      // lastMoveDamageは次のターン用にリセット
      p.lastMoveDamage = { physical: 0, special: 0 };
    });

    // 次のターンへ or 強制交代
    if (!g.winner) {
      const need = ['A', 'B'].find(s => {
        const p = active(s);
        return p && p.fainted;
      });
      if (need) {
        g.forceSwitch = need;
        g.commands = { A: null, B: null };
        g.message = `プレイヤー${need}は次に出すポケモンを選んでください。`;
        g.log.push(g.message);
      } else {
        nextTurn();
      }
    }
  }

  finishEffects();
}

module.exports = { checkWinner, doSurrender, nextTurn, doSwitch, doAttack, resolveTurn };
