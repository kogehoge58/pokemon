'use strict';

const { applyStatStage } = require('./pokemon.js');
const { canApplyStatus, applyStatus, applyConfusion } = require('./status.js');
const { checkSitrusBerry } = require('./items.js');

// 技の優先度テーブル（デフォルト 0）
const MOVE_PRIORITY = {
  'まもる': 4, 'みきり': 4,
  'ねこだまし': 3,
  'しんそく': 2,
  'アクアジェット': 1, 'バレットパンチ': 1, 'マッハパンチ': 1,
  'こおりのつぶて': 1, 'かげうち': 1, 'ふいうち': 1,
  'テレポート': -6,
  'トリックルーム': -7,
};

// 高急所率の技（ステージ+1 = 1/8）
const MOVE_CRIT_STAGE = {
  'ストーンエッジ': 1, 'クロスチョップ': 1, 'サイコカッター': 1,
  'つじぎり': 1, 'シャドークロー': 1,
  'クラブハンマー': 1,
};

function getMoveBaseCritStage(moveName) {
  return MOVE_CRIT_STAGE[moveName] || 0;
}

// 技追加効果レジストリ
// fn(attackerSide, attacker, defender, dmg, ctx)
// ⚠️ 新規追加前に同名キーが既に存在しないか必ず確認すること（後の定義が前を上書きするため）
const MOVE_EFFECTS = {};

// -------- ステータス付与ヘルパー --------
function tryStatus(def, defSide, statusId, ctx, isPrimary = false) {
  if (!applyStatus(def, statusId)) {
    if (isPrimary) {
      const msg = `${def.name}には効果がない！`;
      ctx.state.game.log.push(msg);
      ctx.addEffect({ kind: 'miss', side: defSide, text: '効果なし', message: msg });
    }
    return;
  }
  const msgs = { brn: 'やけどを負った', par: 'まひした', psn: 'どくを負った', tox: 'もうどく状態になった', slp: '眠った', frz: 'こおった' };
  const msg = `${def.name}は${msgs[statusId]}！`;
  ctx.state.game.log.push(msg);
  const targetIndex = ctx.state.game.active[defSide];
  ctx.addEffect({ kind: 'status', side: defSide, status: statusId, message: msg, targetIndex });
  // シンクロ：状態異常を相手に反射（brn/par/psn/toxのみ）
  if (def.ability === 'シンクロ' && ['brn', 'par', 'psn', 'tox'].includes(statusId)) {
    const atkSide = ctx.enemy(defSide);
    const atk = ctx.active(atkSide);
    if (atk && !atk.fainted && applyStatus(atk, statusId)) {
      const sMsg = `${def.name}のシンクロ！ ${atk.name}も${msgs[statusId]}！`;
      ctx.state.game.log.push(sMsg);
      const atkIndex = ctx.state.game.active[atkSide];
      ctx.addEffect({ kind: 'status', side: atkSide, status: statusId, message: sMsg, targetIndex: atkIndex });
    }
  }
}

function tryStatDrop(target, targetSide, stat, delta, ctx, isSelfInflicted = false) {
  // クリアボディ/しろいけむり：相手からの能力低下を無効
  if (delta < 0 && !isSelfInflicted && (target.ability === 'クリアボディ' || target.ability === 'しろいけむり')) {
    const blockMsg = `${target.name}の${target.ability}！ 能力が下がらなかった！`;
    ctx.state.game.log.push(blockMsg);
    ctx.addEffect({ kind: 'message', side: targetSide, message: blockMsg });
    return;
  }
  const applied = applyStatStage(target, stat, delta);
  if (!applied) return;
  const statNames = { atk: '攻撃', def: '防御', spa: '特攻', spd: '特防', spe: '素早さ', acc: '命中', eva: '回避' };
  const dir = delta < 0 ? '↓' : '↑';
  const amount = Math.abs(delta) >= 2 ? dir.repeat(Math.abs(delta)) : dir;
  const labelText = `${statNames[stat]}${amount}`;
  const tone = delta < 0 ? 'ability-blue' : 'ability-red';
  const msg = `${target.name}の${statNames[stat]}が${Math.abs(delta) > 1 ? 'がくっと' : ''}${delta < 0 ? '下がった' : '上がった'}！`;
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'stat', side: targetSide, targetIndex: ctx.state.game.active[targetSide], labels: [{ text: labelText, tone }], message: msg, statStages: { ...target.statStages } });
  // ※ しろいハーブは applyMoveAdditionalEffect 内で全能力変化後に一括チェック
}

function tryStatUp(target, targetSide, stat, delta, ctx) {
  tryStatDrop(target, targetSide, stat, delta, ctx);
}

function tryFlinch(def, atkSide) {
  // ひるみは後攻のポケモンにのみ有効（ターン中に既に動いていない）
  def.flinched = true;
  void atkSide;
}

// -------- 追加効果：ほのお技 --------
MOVE_EFFECTS['だいもんじ']     = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatus(def, ctx.enemy(as), 'brn', ctx); };
MOVE_EFFECTS['かえんほうしゃ'] = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatus(def, ctx.enemy(as), 'brn', ctx); };
MOVE_EFFECTS['ほのおのパンチ'] = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatus(def, ctx.enemy(as), 'brn', ctx); };

// -------- 追加効果：でんき技 --------
MOVE_EFFECTS['10まんボルト']    = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatus(def, ctx.enemy(as), 'par', ctx); };

// -------- 追加効果：こおり技 --------
MOVE_EFFECTS['れいとうビーム']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatus(def, ctx.enemy(as), 'frz', ctx); };

// -------- 追加効果：どく技 --------
MOVE_EFFECTS['ヘドロばくだん']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryStatus(def, ctx.enemy(as), 'psn', ctx); };

// -------- 追加効果：ひるみ --------
MOVE_EFFECTS['アイアンヘッド']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryFlinch(def, as); };
MOVE_EFFECTS['エアスラッシュ']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryFlinch(def, as); };
MOVE_EFFECTS['ねこだまし']      = (as, atk, def, dmg, ctx) => { tryFlinch(def, as); };
MOVE_EFFECTS['しねんのずつき']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryFlinch(def, as); };

// -------- 追加効果：能力変化 --------
MOVE_EFFECTS['ラスターカノン']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatDrop(def, ctx.enemy(as), 'spd', -1, ctx); };
MOVE_EFFECTS['シャドーボール']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.20) tryStatDrop(def, ctx.enemy(as), 'spd', -1, ctx); };
MOVE_EFFECTS['サイコキネシス']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatDrop(def, ctx.enemy(as), 'spd', -1, ctx); };
MOVE_EFFECTS['ムーンフォース']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryStatDrop(def, ctx.enemy(as), 'spa', -1, ctx); };
MOVE_EFFECTS['リーフストーム']  = (as, atk, def, dmg, ctx) => tryStatDrop(atk, as, 'spa', -2, ctx, true);

// -------- 追加効果：トライアタック（20%で焼き/凍り/痺れいずれか） --------
MOVE_EFFECTS['トライアタック'] = (as, atk, def, dmg, ctx) => {
  if (Math.random() < 0.20) {
    const statuses = ['brn', 'frz', 'par'];
    const s = statuses[Math.floor(Math.random() * 3)];
    tryStatus(def, ctx.enemy(as), s, ctx);
  }
};

// -------- ドレイン技（回復） --------
function applyDrain(atk, atkSide, dmg, ratio, ctx) {
  const heal = Math.max(1, Math.floor(dmg * ratio));
  const hpBefore = atk.hp;
  atk.hp = Math.min(atk.maxHp, atk.hp + heal);
  const recovered = atk.hp - hpBefore;
  if (recovered <= 0) return;
  const msg = `${atk.name}は体力を${recovered}回復した！`;
  ctx.state.game.log.push(msg);
  // kind:'hit' + healトーンでキラキラ演出（パネル揺れなし）
  ctx.addEffect({ kind: 'hit', side: atkSide, hpAfter: atk.hp, targetIndex: ctx.state.game.active[atkSide], labels: [{ text: `+${recovered}`, tone: 'heal' }], message: msg });
}

MOVE_EFFECTS['ギガドレイン']   = (as, atk, def, dmg, ctx) => applyDrain(atk, as, dmg, 0.5, ctx);

// -------- リコイル技 --------
function applyRecoil(atk, atkSide, dmg, ratio, ctx) {
  if (atk.ability === 'マジックガード') return; // 反動なし
  const recoil = Math.max(1, Math.floor(dmg * ratio));
  const hpBefore = atk.hp;
  atk.hp = Math.max(0, atk.hp - recoil);
  const msg = `${atk.name}は反動ダメージ ${recoil} を受けた！`;
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'recoil', side: atkSide, hpBefore, hpAfter: atk.hp, targetIndex: ctx.state.game.active[atkSide], message: msg });
  checkSitrusBerry(atk, atkSide, ctx);
  if (atk.hp <= 0 && !atk.fainted) {
    atk.fainted = true;
    const fm = `${atk.name}は気絶した！`;
    ctx.state.game.log.push(fm);
    ctx.addEffect({ kind: 'faint', side: atkSide, targetIndex: ctx.state.game.active[atkSide], hpAfter: 0, message: fm });
  }
}

MOVE_EFFECTS['フレアドライブ'] = (as, atk, def, dmg, ctx) => {
  applyRecoil(atk, as, dmg, 1 / 3, ctx);
  if (Math.random() < 0.10) tryStatus(def, ctx.enemy(as), 'brn', ctx);
};
MOVE_EFFECTS['ブレイブバード'] = (as, atk, def, dmg, ctx) => applyRecoil(atk, as, dmg, 1 / 3, ctx);
MOVE_EFFECTS['ボルトチェンジ'] = (as, atk, def, dmg, ctx) => {
  // ダメージ後に自発的交代（強制交代フラグは engine.js で判定）
  ctx.state.game._voltSwitch = as;
};
MOVE_EFFECTS['とんぼがえり'] = (as, atk, def, dmg, ctx) => {
  ctx.state.game._voltSwitch = as;
};

// -------- 変化技 --------
// つるぎのまい
MOVE_EFFECTS['つるぎのまい']   = (as, atk, def, dmg, ctx) => tryStatUp(atk, as, 'atk', 2, ctx);
MOVE_EFFECTS['わるだくみ']     = (as, atk, def, dmg, ctx) => tryStatUp(atk, as, 'spa', 2, ctx);
MOVE_EFFECTS['りゅうのまい']   = (as, atk, def, dmg, ctx) => {
  tryStatUp(atk, as, 'atk', 1, ctx);
  tryStatUp(atk, as, 'spe', 1, ctx);
};
MOVE_EFFECTS['めいそう']       = (as, atk, def, dmg, ctx) => {
  tryStatUp(atk, as, 'spa', 1, ctx);
  tryStatUp(atk, as, 'spd', 1, ctx);
};
// 状態異常変化技
MOVE_EFFECTS['でんじは']       = (as, atk, def, dmg, ctx) => tryStatus(def, ctx.enemy(as), 'par', ctx, true);
MOVE_EFFECTS['どくどく']       = (as, atk, def, dmg, ctx) => tryStatus(def, ctx.enemy(as), 'tox', ctx, true);
MOVE_EFFECTS['おにび']         = (as, atk, def, dmg, ctx) => tryStatus(def, ctx.enemy(as), 'brn', ctx, true);
// 粉技：草タイプには無効（Gen6以降）
function tryPowderMove(def, defSide, statusId, ctx) {
  if (def.types.includes('くさ')) {
    const msg = `${def.name}には効果がない！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'miss', side: defSide, text: '効果なし', message: msg });
    return;
  }
  tryStatus(def, defSide, statusId, ctx, true);
}
MOVE_EFFECTS['キノコのほうし'] = (as, atk, def, dmg, ctx) => tryPowderMove(def, ctx.enemy(as), 'slp', ctx);
MOVE_EFFECTS['ねむりごな']     = (as, atk, def, dmg, ctx) => tryPowderMove(def, ctx.enemy(as), 'slp', ctx);
MOVE_EFFECTS['あくまのキッス'] = (as, atk, def, dmg, ctx) => tryStatus(def, ctx.enemy(as), 'slp', ctx, true);

// はたきおとす：命中後に守備側の持ち物を消す
MOVE_EFFECTS['はたきおとす'] = (as, atk, def, dmg, ctx) => {
  if (!def.item) return;
  const lost = def.item;
  const defSide = ctx.enemy(as);
  const targetIndex = ctx.state.game.active[defSide];
  def.item = null;
  const msg = `${def.name}の${lost}が落とされた！`;
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'ability', side: defSide, labels: [{ text: `${lost}を失った`, tone: 'ability-red' }], message: msg });
  // ラベル消去後に持ち物バッジを非表示にする
  ctx.addEffect({ kind: 'item-lost', side: defSide, targetIndex, item: lost });
};
// アンコール：相手の直前の技を固定（3ターン）
MOVE_EFFECTS['アンコール'] = (as, atk, def, dmg, ctx) => {
  const g = ctx.state.game;
  const defSide = ctx.enemy(as);
  const targetIndex = g.active[defSide];
  // 失敗条件：すでにアンコール中 or 一度も技を使っていない（交代したてを含む）
  if (def.encored || !def.lastMoveUsed) {
    const failMsg = `${atk.name}のアンコールは失敗した！`;
    g.log.push(failMsg);
    ctx.addEffect({ kind: 'miss', side: as, text: '失敗！', message: failMsg });
    return;
  }
  // メンタルハーブ：アンコールを防ぐ
  if (!def.itemUsed && def.item === 'メンタルハーブ') {
    def.itemUsed = true;
    const herbMsg = `${def.name}のメンタルハーブ！ アンコールを防いだ！`;
    g.log.push(herbMsg);
    ctx.addEffect({ kind: 'ability', side: defSide, labels: [{ text: 'メンタルハーブ', tone: 'ability-blue' }], message: herbMsg });
    return;
  }
  def.encored = def.lastMoveUsed;
  def.encoreTurns = 3;
  const msg = `${def.name}はアンコールされた！`;
  g.log.push(msg);
  ctx.addEffect({ kind: 'encore', side: defSide, targetIndex, turns: 3, move: def.encored, message: msg });
};

MOVE_EFFECTS['あくび']   = (as, atk, def, dmg, ctx) => {
  const defSide = ctx.enemy(as);
  if (!def.status && !def.yawnCounter) {
    def.yawnCounter = 2;
    const msg = `${def.name}は眠そうにあくびをした！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'yawn', side: defSide, targetIndex: ctx.state.game.active[defSide], message: msg });
  }
};
// みちづれ
MOVE_EFFECTS['みちづれ'] = (as, atk, def, dmg, ctx) => {
  // 連続使用は失敗
  if (atk.lastMoveUsed === 'みちづれ') {
    const failMsg = `${atk.name}のみちづれは失敗した！`;
    ctx.state.game.log.push(failMsg);
    ctx.addEffect({ kind: 'miss', side: as, text: '失敗！', message: failMsg });
    return;
  }
  atk.destinyBond = true;
  const msg = `${atk.name}はみちづれの準備をした！`;
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'ability', side: as, ability: 'みちづれ', labels: [{ text: 'みちづれ', tone: 'ability-red' }], message: msg });
};

// ほろびのうた
MOVE_EFFECTS['ほろびのうた'] = (as, atk, def, dmg, ctx) => {
  const g = ctx.state.game;
  const affected = [];
  ['A', 'B'].forEach(side => {
    const p = ctx.active(side);
    // すでにほろび状態のポケモンにはカウントをリセットしない
    if (p && !p.fainted && !p.perishSongCounter) {
      p.perishSongCounter = 3;
      affected.push({ side, targetIndex: g.active[side], name: p.name });
    }
  });
  // バースト消去後すぐにほろびバッジを表示（メッセージより先）
  for (const { side, targetIndex } of affected) {
    ctx.addEffect({ kind: 'perishSong', side, targetIndex, before: 0, after: 3 });
  }
  // カウントダウン開始メッセージ
  for (const { side, name } of affected) {
    const msg = `${name}はほろびのカウントダウンが始まった！（3）`;
    g.log.push(msg);
    ctx.addEffect({ kind: 'message', side, message: msg });
  }
};

// トリックルーム
MOVE_EFFECTS['トリックルーム'] = (as, atk, def, dmg, ctx) => {
  const g = ctx.state.game;
  const oldTrickRoom = g.trickRoom;
  if (g.trickRoom > 0) {
    g.trickRoom = 0;
    const msg = 'トリックルームが解除された！';
    g.log.push(msg);
    ctx.addEffect({ kind: 'message', side: as, message: msg });
    ctx.addEffect({ kind: 'trickRoom', before: oldTrickRoom, after: 0 });
  } else {
    g.trickRoom = 5;
    const msg = 'トリックルームが発動！素早さが逆転した！';
    g.log.push(msg);
    ctx.addEffect({ kind: 'message', side: as, message: msg });
    ctx.addEffect({ kind: 'trickRoom', before: 0, after: 5 });
  }
};

// 設置技
MOVE_EFFECTS['ステルスロック'] = (as, atk, def, dmg, ctx) => {
  const { addHazard } = require('./hazards.js');
  const defSide = ctx.enemy(as);
  const added = addHazard(defSide, 'stealthRock', ctx.state.game);
  const msg = added ? 'ステルスロックが設置された！' : 'ステルスロックはすでに設置されている！';
  ctx.state.game.log.push(msg);
  if (added) {
    ctx.addEffect({ kind: 'hazard-set', side: defSide, text: 'ステルスロックを置いた', message: msg, hazards: { ...ctx.state.game.hazards[defSide] } });
  } else {
    ctx.addEffect({ kind: 'miss', side: defSide, text: '効果なし', message: msg });
  }
};
MOVE_EFFECTS['まきびし'] = (as, atk, def, dmg, ctx) => {
  const { addHazard } = require('./hazards.js');
  const defSide = ctx.enemy(as);
  const added = addHazard(defSide, 'spikes', ctx.state.game);
  const msg = added ? 'まきびしがまかれた！' : 'まきびしはこれ以上まけない！';
  ctx.state.game.log.push(msg);
  if (added) {
    ctx.addEffect({ kind: 'hazard-set', side: defSide, text: 'まきびしが散らばった', message: msg, hazards: { ...ctx.state.game.hazards[defSide] } });
  } else {
    ctx.addEffect({ kind: 'miss', side: defSide, text: '効果なし', message: msg });
  }
};
MOVE_EFFECTS['ねばねばネット'] = (as, atk, def, dmg, ctx) => {
  const { addHazard } = require('./hazards.js');
  const defSide = ctx.enemy(as);
  const added = addHazard(defSide, 'stickyWeb', ctx.state.game);
  const msg = added ? 'ねばねばネットが設置された！' : 'ねばねばネットはすでに設置されている！';
  ctx.state.game.log.push(msg);
  if (added) {
    ctx.addEffect({ kind: 'hazard-set', side: defSide, text: 'ねばねばネットを張った', message: msg, hazards: { ...ctx.state.game.hazards[defSide] } });
  } else {
    ctx.addEffect({ kind: 'miss', side: defSide, text: '効果なし', message: msg });
  }
};

// -------- 追加効果：のしかかり・たきのぼり・ねっとう・ほっぺすりすり --------
MOVE_EFFECTS['のしかかり'] = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryStatus(def, ctx.enemy(as), 'par', ctx); };
MOVE_EFFECTS['たきのぼり'] = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.20) tryFlinch(def, as); };
MOVE_EFFECTS['ねっとう']   = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryStatus(def, ctx.enemy(as), 'brn', ctx); };
MOVE_EFFECTS['ふんえん']   = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryStatus(def, ctx.enemy(as), 'brn', ctx); };
MOVE_EFFECTS['ほっぺすりすり'] = (as, atk, def, dmg, ctx) => { tryStatus(def, ctx.enemy(as), 'par', ctx, true); };

// -------- 追加効果：フリーズドライ（水タイプにも抜群）--------
MOVE_EFFECTS['フリーズドライ'] = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatus(def, ctx.enemy(as), 'frz', ctx); };

// -------- 追加効果：かみくだく・あくのはどう --------
MOVE_EFFECTS['かみくだく']   = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.20) tryStatDrop(def, ctx.enemy(as), 'def', -1, ctx); };
MOVE_EFFECTS['あくのはどう'] = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.20) tryFlinch(def, as); };

// -------- こんらん付与ヘルパー --------
function tryConfuse(target, targetSide, ctx) {
  const { applyConfusion } = require('./status.js');
  if (!applyConfusion(target)) return;
  const msg = `${target.name}は混乱した！`;
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'confusion', side: targetSide, targetIndex: ctx.state.game.active[targetSide], message: msg });
}

// -------- こんらんこうせん（必ずこんらん）--------
MOVE_EFFECTS['こんらんこうせん'] = (as, atk, def, dmg, ctx) => {
  tryConfuse(def, ctx.enemy(as), ctx);
};

// -------- いばる（相手の攻撃↑2・こんらん）--------
MOVE_EFFECTS['いばる'] = (as, atk, def, dmg, ctx) => {
  const defSide = ctx.enemy(as);
  tryStatUp(def, defSide, 'atk', 2, ctx);
  tryConfuse(def, defSide, ctx);
};

// -------- どろかけ（命中↓1）--------
MOVE_EFFECTS['どろかけ'] = (as, atk, def, dmg, ctx) => {
  tryStatDrop(def, ctx.enemy(as), 'acc', -1, ctx);
};

// -------- 追加効果：ぼうふう（30%こんらん）--------
MOVE_EFFECTS['ぼうふう'] = (as, atk, def, dmg, ctx) => {
  if (Math.random() < 0.30) {
    const { applyConfusion } = require('./status.js');
    const defSide = ctx.enemy(as);
    if (applyConfusion(def)) {
      const msg = `${def.name}は混乱した！`;
      ctx.state.game.log.push(msg);
      ctx.addEffect({ kind: 'confusion', side: defSide, targetIndex: ctx.state.game.active[defSide], message: msg });
    }
  }
};

// -------- 追加効果：コメットパンチ（20%で攻撃↑）--------
MOVE_EFFECTS['コメットパンチ'] = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.20) tryStatUp(atk, as, 'atk', 1, ctx); };

// -------- 追加効果：じゃれつく（10%で攻撃↓）--------
MOVE_EFFECTS['じゃれつく'] = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatDrop(def, ctx.enemy(as), 'atk', -1, ctx); };

// -------- 追加効果：アクアブレイク（20%で防御↓）--------
MOVE_EFFECTS['アクアブレイク'] = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.20) tryStatDrop(def, ctx.enemy(as), 'def', -1, ctx); };

// -------- 自己能力低下技 --------
MOVE_EFFECTS['インファイト']   = (as, atk, def, dmg, ctx) => {
  tryStatDrop(atk, as, 'def', -1, ctx, true);
  tryStatDrop(atk, as, 'spd', -1, ctx, true);
};
MOVE_EFFECTS['ばかぢから']     = (as, atk, def, dmg, ctx) => {
  tryStatDrop(atk, as, 'atk', -1, ctx, true);
  tryStatDrop(atk, as, 'def', -1, ctx, true);
};
MOVE_EFFECTS['オーバーヒート'] = (as, atk, def, dmg, ctx) => { tryStatDrop(atk, as, 'spa', -2, ctx, true); };
MOVE_EFFECTS['りゅうせいぐん'] = (as, atk, def, dmg, ctx) => { tryStatDrop(atk, as, 'spa', -2, ctx, true); };

// -------- 自己能力上昇変化技 --------
MOVE_EFFECTS['からをやぶる'] = (as, atk, def, dmg, ctx) => {
  tryStatUp(atk, as, 'atk', 2, ctx);
  tryStatUp(atk, as, 'spa', 2, ctx);
  tryStatUp(atk, as, 'spe', 2, ctx);
  tryStatDrop(atk, as, 'def', -1, ctx, true);
  tryStatDrop(atk, as, 'spd', -1, ctx, true);
};
MOVE_EFFECTS['せいちょう']   = (as, atk, def, dmg, ctx) => {
  const delta = ctx.state.game.weather?.type === 'sun' ? 2 : 1;
  tryStatUp(atk, as, 'atk', delta, ctx);
  tryStatUp(atk, as, 'spa', delta, ctx);
};
MOVE_EFFECTS['コットンガード'] = (as, atk, def, dmg, ctx) => { tryStatUp(atk, as, 'def', 3, ctx); };
MOVE_EFFECTS['のろい']        = (as, atk, def, dmg, ctx) => {
  tryStatUp(atk, as, 'atk', 1, ctx);
  tryStatUp(atk, as, 'def', 1, ctx);
  tryStatDrop(atk, as, 'spe', -1, ctx, true);
};

// -------- 回復変化技 --------
function applyHeal(p, side, ratio, ctx) {
  const heal = Math.max(1, Math.floor(p.maxHp * ratio));
  const hpBefore = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + heal);
  const recovered = p.hp - hpBefore;
  if (recovered > 0) {
    const msg = `${p.name}はHPを${recovered}回復した！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'hit', side, labels: [{ text: `+${recovered}`, tone: 'heal' }], hpAfter: p.hp, targetIndex: ctx.state.game.active[side], message: msg });
  }
}
MOVE_EFFECTS['なまける']   = (as, atk, def, dmg, ctx) => { applyHeal(atk, as, 0.5, ctx); };
MOVE_EFFECTS['じこさいせい'] = (as, atk, def, dmg, ctx) => { applyHeal(atk, as, 0.5, ctx); };
MOVE_EFFECTS['タマゴうみ'] = (as, atk, def, dmg, ctx) => { applyHeal(atk, as, 0.5, ctx); };
MOVE_EFFECTS['はねやすめ'] = (as, atk, def, dmg, ctx) => { applyHeal(atk, as, 0.5, ctx); };
MOVE_EFFECTS['つきのひかり'] = (as, atk, def, dmg, ctx) => {
  const weather = ctx.state.game.weather?.type;
  const ratio = weather === 'sun' ? 2 / 3 : weather === 'rain' || weather === 'sand' ? 0.25 : 0.5;
  applyHeal(atk, as, ratio, ctx);
};

// -------- ねむる（完全回復＋ねむり状態） --------
MOVE_EFFECTS['ねむる'] = (as, atk, def, dmg, ctx) => {
  if (atk.status && atk.status !== 'slp') {
    atk.status = null;
    atk.statusTurns = 0;
  }
  const hpBefore = atk.hp;
  atk.hp = atk.maxHp;
  const recovered = atk.hp - hpBefore;
  const { applyStatus } = require('./status.js');
  applyStatus(atk, 'slp');
  atk.statusTurns = 2;
  const msg = `${atk.name}はぐっすり眠り体力を全回復した！`;
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'status', side: as, status: 'slp', message: msg, targetIndex: ctx.state.game.active[as] });
  if (recovered > 0) {
    ctx.addEffect({ kind: 'hit', side: as, labels: [{ text: `+${recovered}`, tone: 'heal' }], hpAfter: atk.hp, targetIndex: ctx.state.game.active[as], message: msg });
  }
};

// -------- ちょうはつ（変化技を3ターン封じる） --------
MOVE_EFFECTS['ちょうはつ'] = (as, atk, def, dmg, ctx) => {
  const defSide = ctx.enemy(as);
  if (def.taunt) {
    // すでにちょうはつ状態 → 効果なし
    const noEffMsg = `${def.name}にはちょうはつが効かない！`;
    ctx.state.game.log.push(noEffMsg);
    ctx.addEffect({ kind: 'miss', side: defSide, text: '効果なし', message: noEffMsg });
    return;
  }
  // メンタルハーブ：ちょうはつを防ぐ
  if (!def.itemUsed && def.item === 'メンタルハーブ') {
    def.itemUsed = true;
    const herbMsg = `${def.name}のメンタルハーブ！ ちょうはつを防いだ！`;
    ctx.state.game.log.push(herbMsg);
    ctx.addEffect({ kind: 'message', side: defSide, message: herbMsg });
    return;
  }
  def.taunt = 3;
  const msg = `${def.name}は挑発された！変化技が使えない！`;
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'taunt', side: defSide, targetIndex: ctx.state.game.active[defSide], turns: 3, message: msg });
};

// -------- こうそくスピン（設置技除去＋素早さ↑） --------
MOVE_EFFECTS['こうそくスピン'] = (as, atk, def, dmg, ctx) => {
  const { removeHazards } = require('./hazards.js');
  const removed = removeHazards(as, ctx.state.game);
  if (removed) {
    const msg = `${atk.name}は設置技を吹き飛ばした！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'ability', side: as, labels: [{ text: '設置を除去', tone: 'ability-green' }], message: msg, updateHazards: true });
  }
  tryStatUp(atk, as, 'spe', 1, ctx);
};

// -------- すりかえ（持ち物交換） --------
MOVE_EFFECTS['すりかえ'] = (as, atk, def, dmg, ctx) => {
  const g = ctx.state.game;
  const defSide = ctx.enemy(as);
  const CHOICE = new Set(['こだわりスカーフ', 'こだわりメガネ', 'こだわりハチマキ']);

  const atkOldItem = atk.item;
  const defOldItem = def.item;

  // 持ち物を交換
  atk.item = defOldItem;
  def.item = atkOldItem;
  // itemUsed フラグをリセット（新しい持ち物を持ったため）
  atk.itemUsed = false;
  def.itemUsed = false;
  // こだわりロックをリセット（こだわりアイテムが移った/外れたため）
  if (CHOICE.has(atkOldItem)) atk.choiceMove = null;
  if (CHOICE.has(defOldItem)) def.choiceMove = null;

  const msg = `${atk.name}と${def.name}のもちものがすりかわった！`;
  g.log.push(msg);
  ctx.addEffect({
    kind: 'item-swap',
    atkSide: as,   atkIndex: g.active[as],   atkOldItem,
    defSide,       defIndex: g.active[defSide], defOldItem,
    message: msg,
  });
};

// -------- テレポート（低優先度で交代） --------
MOVE_EFFECTS['テレポート'] = (as, atk, def, dmg, ctx) => {
  const g = ctx.state.game;
  const activeIdx = g.active[as];
  const hasAlt = g.teams[as].some((p, j) => !p.fainted && j !== activeIdx);
  if (!hasAlt) {
    const failMsg = `${atk.name}のテレポートは失敗した！`;
    g.log.push(failMsg);
    ctx.addEffect({ kind: 'miss', side: as, text: '失敗！', message: failMsg });
    return;
  }
  g._voltSwitch = as;
};

// -------- クイックターン（みず版とんぼがえり） --------
MOVE_EFFECTS['クイックターン'] = (as, atk, def, dmg, ctx) => {
  ctx.state.game._voltSwitch = as;
};

// -------- みがわり（HP1/4消費してみがわりを作る） --------
MOVE_EFFECTS['みがわり'] = (as, atk, def, dmg, ctx) => {
  if (atk.substitute > 0) {
    const msg = `${atk.name}はすでにみがわりを出している！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'miss', side: as, text: '失敗！', message: msg });
    return;
  }
  const cost = Math.floor(atk.maxHp / 4);
  if (atk.hp <= cost) {
    const msg = `${atk.name}はHPが足りない！みがわりに失敗した！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'miss', side: as, text: '失敗！', message: msg });
    return;
  }
  atk.hp -= cost;
  atk.substitute = Math.floor(atk.maxHp / 4);
  const msg = `${atk.name}はみがわりを作った！（みがわりHP：${atk.substitute}）`;
  ctx.state.game.log.push(msg);
  // バースト表示はdoStatusMoveが既にaddEffectしている。ここでは順序：HP減少→画像切り替え
  ctx.addEffect({ kind: 'hit', side: as, hpAfter: atk.hp, targetIndex: ctx.state.game.active[as], labels: [], message: msg });
  ctx.addEffect({ kind: 'substitute-activate', side: as, targetIndex: ctx.state.game.active[as], subHp: atk.substitute, message: '' });
};

// -------- いやしのねがい（自分が気絶し、次のポケモンを全回復） --------
MOVE_EFFECTS['いやしのねがい'] = (as, atk, def, dmg, ctx) => {
  const g = ctx.state.game;
  // 他の2体が全員気絶している場合は失敗
  const activeIdx = g.active[as];
  const hasAlt = g.teams[as].some((p, j) => !p.fainted && j !== activeIdx);
  if (!hasAlt) {
    const failMsg = `${atk.name}のいやしのねがいは失敗した！`;
    g.log.push(failMsg);
    ctx.addEffect({ kind: 'miss', side: as, text: '失敗！', message: failMsg });
    return;
  }
  atk.hp = 0;
  atk.fainted = true;
  g.healingWish = g.healingWish || {};
  g.healingWish[as] = true;
  const msg = `${atk.name}はいやしのねがいで力を使い果たした！`;
  g.log.push(msg);
  ctx.addEffect({ kind: 'faint', side: as, targetIndex: g.active[as], hpAfter: 0, message: msg });
  // 先攻使用時は交代後に残り行動を再開するフラグ
  g._healingWishSwitch = as;
};

// -------- いたみわけ（HPを平均化） --------
MOVE_EFFECTS['いたみわけ'] = (as, atk, def, dmg, ctx) => {
  const defSide = ctx.enemy(as);
  const avg = Math.floor((atk.hp + def.hp) / 2);
  atk.hp = Math.min(atk.maxHp, avg);
  def.hp = Math.min(def.maxHp, avg);
  const msg = `${atk.name}と${def.name}のHPが平均化された！`;
  ctx.state.game.log.push(msg);
  ctx.addEffect({
    kind: 'pain-split',
    atkSide: as, atkTargetIndex: ctx.state.game.active[as], atkHpAfter: atk.hp,
    defSide, defTargetIndex: ctx.state.game.active[defSide], defHpAfter: def.hp,
    message: msg,
  });
};

// -------- クリアスモッグ（能力変化リセット） --------
MOVE_EFFECTS['クリアスモッグ'] = (as, atk, def, dmg, ctx) => {
  const defSide = ctx.enemy(as);
  let resetAny = false;
  if (def.statStages) {
    for (const k of Object.keys(def.statStages)) {
      const stage = def.statStages[k] || 0;
      if (stage !== 0) {
        // applyStatStageを通してstats[k]も正しくリセット
        applyStatStage(def, k, -stage);
        resetAny = true;
      }
    }
  }
  if (resetAny) {
    const msg = `${def.name}の能力変化がリセットされた！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'stat-reset', side: defSide, targetIndex: ctx.state.game.active[defSide], message: msg });
  }
};

// -------- はらだいこ（HP半分消費、攻撃最大） --------
MOVE_EFFECTS['はらだいこ'] = (as, atk, def, dmg, ctx) => {
  const cost = Math.floor(atk.maxHp / 2);
  if (atk.hp <= cost) {
    const failMsg = `${atk.name}はHPが足りない！はらだいこに失敗した！`;
    ctx.state.game.log.push(failMsg);
    ctx.addEffect({ kind: 'miss', side: as, text: '失敗！', message: failMsg });
    return;
  }
  atk.hp = Math.max(1, atk.hp - cost);
  const msg = `${atk.name}はお腹を叩き攻撃を最大まで上げた！`;
  ctx.state.game.log.push(msg);
  atk.statStages = atk.statStages || {};
  const currentAtk = atk.statStages.atk || 0;
  const delta = Math.max(0, 6 - currentAtk);
  // applyStatStageを使ってstats.atkを正しく更新（直接代入するとダメージ計算に反映されない）
  if (delta > 0) applyStatStage(atk, 'atk', delta);
  // HP減少のみのhitエフェクト（ラベルなし）
  ctx.addEffect({ kind: 'hit', side: as, hpAfter: atk.hp, targetIndex: ctx.state.game.active[as], labels: [], message: msg });
  // オボンのみ即時発動チェック（はらだいこでHP半分以下になった時点）
  checkSitrusBerry(atk, as, ctx);
  // 攻撃段階上昇エフェクト
  if (delta > 0) {
    const arrows = '↑'.repeat(Math.min(delta, 6));
    ctx.addEffect({ kind: 'stat', side: as, targetIndex: ctx.state.game.active[as],
      labels: [{ text: `攻撃${arrows}`, tone: 'ability-red' }],
      message: `${atk.name}の攻撃が最大まで上がった！`,
      statStages: { ...atk.statStages } });
  }
};

// しろいハーブ：全ての能力変化ラベル表示後に一括でリセット
function checkWhiteHerb(pokemon, side, ctx) {
  if (!pokemon || pokemon.fainted || pokemon.itemUsed || pokemon.item !== 'しろいハーブ') return;
  const statKeys = ['atk', 'def', 'spa', 'spd', 'spe'];
  const hasNegative = statKeys.some(k => (pokemon.statStages?.[k] || 0) < 0);
  if (!hasNegative) return;
  pokemon.itemUsed = true;
  statKeys.forEach(k => {
    const stage = pokemon.statStages?.[k] || 0;
    if (stage < 0) applyStatStage(pokemon, k, -stage);
  });
  const herbMsg = `${pokemon.name}のしろいハーブ！ 下がった能力が元に戻った！`;
  ctx.state.game.log.push(herbMsg);
  const targetIndex = ctx.state.game.active[side];
  ctx.addEffect({
    kind: 'ability', side, ability: 'しろいハーブ',
    labels: [{ text: 'しろいハーブ', tone: 'ability-blue' }],
    message: herbMsg,
    statStages: { ...pokemon.statStages },
    statTargetIndex: targetIndex,
  });
}

function applyMoveAdditionalEffect(moveName, attackerSide, attacker, defender, dmg, ctx) {
  const fn = MOVE_EFFECTS[moveName];
  if (fn) fn(attackerSide, attacker, defender, dmg, ctx);
  // 全ての能力変化エフェクト追加後にしろいハーブをチェック
  checkWhiteHerb(attacker, attackerSide, ctx);
  const defenderSide = attackerSide === 'A' ? 'B' : 'A';
  if (defender) checkWhiteHerb(defender, defenderSide, ctx);
}

module.exports = {
  MOVE_PRIORITY, MOVE_CRIT_STAGE, MOVE_EFFECTS,
  getMoveBaseCritStage, applyMoveAdditionalEffect,
};
