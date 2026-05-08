'use strict';

const { applyStatStage } = require('./pokemon.js');
const { canApplyStatus, applyStatus, applyConfusion } = require('./status.js');

// 技の優先度テーブル（デフォルト 0）
const MOVE_PRIORITY = {
  'まもる': 4, 'みきり': 4,
  'ねこだまし': 3,
  'しんそく': 2,
  'アクアジェット': 1, 'バレットパンチ': 1, 'マッハパンチ': 1,
  'こおりのつぶて': 1, 'かげうち': 1, 'ふいうち': 1,
  'みちづれ': -6, 'ほろびのうた': -6, 'テレポート': -6,
  'トリックルーム': -7,
};

// 高急所率の技（ステージ+1 = 1/8）
const MOVE_CRIT_STAGE = {
  'ストーンエッジ': 1, 'クロスチョップ': 1, 'サイコカッター': 1,
  'つじぎり': 1, 'シャドークロー': 1, 'ブレイズキック': 1,
  'クラブハンマー': 1,
};

function getMoveBaseCritStage(moveName) {
  return MOVE_CRIT_STAGE[moveName] || 0;
}

// 技追加効果レジストリ
// fn(attackerSide, attacker, defender, dmg, ctx)
const MOVE_EFFECTS = {};

// -------- ステータス付与ヘルパー --------
function tryStatus(def, defSide, statusId, ctx) {
  if (!applyStatus(def, statusId)) return;
  const labels = { brn: 'やけど', par: 'まひ', psn: 'どく', tox: 'もうどく', slp: 'ねむり', frz: 'こおり' };
  const msgs = { brn: 'やけどを負った', par: 'まひした', psn: 'どくを負った', tox: 'もうどく状態になった', slp: '眠った', frz: 'こおった' };
  const msg = `${def.name}は${msgs[statusId]}！`;
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'status', side: defSide, status: statusId, message: msg });
}

function tryStatDrop(target, targetSide, stat, delta, ctx) {
  const applied = applyStatStage(target, stat, delta);
  if (!applied) return;
  const statNames = { atk: '攻撃', def: '防御', spa: '特攻', spd: '特防', spe: '素早さ', acc: '命中', eva: '回避' };
  const dir = delta < 0 ? '下がった' : '上がった';
  const amount = Math.abs(delta) > 1 ? 'がくっと' : '';
  const msg = `${target.name}の${statNames[stat]}が${amount}${dir}！`;
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'message', side: targetSide, message: msg });
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
MOVE_EFFECTS['ブレイズキック'] = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatus(def, ctx.enemy(as), 'brn', ctx); };
MOVE_EFFECTS['ほのおのキバ']   = (as, atk, def, dmg, ctx) => {
  const defSide = ctx.enemy(as);
  if (Math.random() < 0.10) tryStatus(def, defSide, 'brn', ctx);
  if (Math.random() < 0.10) tryFlinch(def, as);
};

// -------- 追加効果：でんき技 --------
MOVE_EFFECTS['10まんボルト']    = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatus(def, ctx.enemy(as), 'par', ctx); };
MOVE_EFFECTS['かみなりパンチ']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatus(def, ctx.enemy(as), 'par', ctx); };
MOVE_EFFECTS['かみなり']        = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryStatus(def, ctx.enemy(as), 'par', ctx); };
MOVE_EFFECTS['かみなりのキバ']  = (as, atk, def, dmg, ctx) => {
  const defSide = ctx.enemy(as);
  if (Math.random() < 0.10) tryStatus(def, defSide, 'par', ctx);
  if (Math.random() < 0.10) tryFlinch(def, as);
};

// -------- 追加効果：こおり技 --------
MOVE_EFFECTS['れいとうビーム']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatus(def, ctx.enemy(as), 'frz', ctx); };
MOVE_EFFECTS['れいとうパンチ']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatus(def, ctx.enemy(as), 'frz', ctx); };
MOVE_EFFECTS['ふぶき']          = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatus(def, ctx.enemy(as), 'frz', ctx); };
MOVE_EFFECTS['こおりのキバ']    = (as, atk, def, dmg, ctx) => {
  const defSide = ctx.enemy(as);
  if (Math.random() < 0.10) tryStatus(def, defSide, 'frz', ctx);
  if (Math.random() < 0.10) tryFlinch(def, as);
};

// -------- 追加効果：どく技 --------
MOVE_EFFECTS['ヘドロばくだん']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryStatus(def, ctx.enemy(as), 'psn', ctx); };
MOVE_EFFECTS['どくづき']        = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryStatus(def, ctx.enemy(as), 'psn', ctx); };
MOVE_EFFECTS['ダストシュート']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryStatus(def, ctx.enemy(as), 'psn', ctx); };

// -------- 追加効果：ひるみ --------
MOVE_EFFECTS['アイアンヘッド']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryFlinch(def, as); };
MOVE_EFFECTS['いわなだれ']      = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryFlinch(def, as); };
MOVE_EFFECTS['エアスラッシュ']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryFlinch(def, as); };
MOVE_EFFECTS['ねこだまし']      = (as, atk, def, dmg, ctx) => { tryFlinch(def, as); };
MOVE_EFFECTS['しねんのずつき']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryFlinch(def, as); };

// -------- 追加効果：能力変化 --------
MOVE_EFFECTS['むしのさざめき']  = (as, atk, def, dmg, ctx) => tryStatDrop(def, ctx.enemy(as), 'spd', -1, ctx);
MOVE_EFFECTS['ラスターカノン']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatDrop(def, ctx.enemy(as), 'spd', -1, ctx); };
MOVE_EFFECTS['シャドーボール']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.20) tryStatDrop(def, ctx.enemy(as), 'spd', -1, ctx); };
MOVE_EFFECTS['サイコキネシス']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatDrop(def, ctx.enemy(as), 'spd', -1, ctx); };
MOVE_EFFECTS['ムーンフォース']  = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryStatDrop(def, ctx.enemy(as), 'spa', -1, ctx); };
MOVE_EFFECTS['こごえるかぜ']    = (as, atk, def, dmg, ctx) => tryStatDrop(def, ctx.enemy(as), 'spe', -1, ctx);
MOVE_EFFECTS['リーフストーム']  = (as, atk, def, dmg, ctx) => tryStatDrop(atk, as, 'spa', -2, ctx);

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
  const msg = `${atk.name}は体力を${atk.hp - hpBefore}回復した！`;
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'damage', side: atkSide, hpBefore, hpAfter: atk.hp, message: msg });
}

MOVE_EFFECTS['ギガドレイン']   = (as, atk, def, dmg, ctx) => applyDrain(atk, as, dmg, 0.5, ctx);
MOVE_EFFECTS['ドレインパンチ'] = (as, atk, def, dmg, ctx) => applyDrain(atk, as, dmg, 0.5, ctx);

// -------- リコイル技 --------
function applyRecoil(atk, atkSide, dmg, ratio, ctx) {
  const recoil = Math.max(1, Math.floor(dmg * ratio));
  const hpBefore = atk.hp;
  atk.hp = Math.max(0, atk.hp - recoil);
  const msg = `${atk.name}は反動ダメージ ${recoil} を受けた！`;
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'damage', side: atkSide, hpBefore, hpAfter: atk.hp, message: msg });
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
MOVE_EFFECTS['てっぺき']       = (as, atk, def, dmg, ctx) => tryStatUp(atk, as, 'def', 2, ctx);
MOVE_EFFECTS['こうそくいどう'] = (as, atk, def, dmg, ctx) => tryStatUp(atk, as, 'spe', 2, ctx);
MOVE_EFFECTS['ちょうのまい']   = (as, atk, def, dmg, ctx) => {
  tryStatUp(atk, as, 'spa', 1, ctx);
  tryStatUp(atk, as, 'spd', 1, ctx);
  tryStatUp(atk, as, 'spe', 1, ctx);
};

// 状態異常変化技
MOVE_EFFECTS['でんじは'] = (as, atk, def, dmg, ctx) => tryStatus(def, ctx.enemy(as), 'par', ctx);
MOVE_EFFECTS['どくどく'] = (as, atk, def, dmg, ctx) => tryStatus(def, ctx.enemy(as), 'tox', ctx);
MOVE_EFFECTS['あくび']   = (as, atk, def, dmg, ctx) => {
  const defSide = ctx.enemy(as);
  if (!def.status && !def.yawnCounter) {
    def.yawnCounter = 2;
    const msg = `${def.name}は眠そうにあくびをした！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'message', side: defSide, message: msg });
  }
};
MOVE_EFFECTS['こんらんこうせん'] = (as, atk, def, dmg, ctx) => {
  if (Math.random() < 0.50 && applyConfusion(def)) {
    const msg = `${def.name}は混乱した！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'message', side: ctx.enemy(as), message: msg });
  }
};

// みちづれ
MOVE_EFFECTS['みちづれ'] = (as, atk, def, dmg, ctx) => {
  atk.destinyBond = true;
  const msg = `${atk.name}はみちづれの準備をした！`;
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'message', side: as, message: msg });
};

// ほろびのうた
MOVE_EFFECTS['ほろびのうた'] = (as, atk, def, dmg, ctx) => {
  ['A', 'B'].forEach(side => {
    const p = ctx.active(side);
    if (p && !p.fainted && !p.perishSongCounter) {
      p.perishSongCounter = 3;
      const msg = `${p.name}はほろびのカウントダウンが始まった！（3）`;
      ctx.state.game.log.push(msg);
      ctx.addEffect({ kind: 'message', side, message: msg });
    }
  });
};

// トリックルーム
MOVE_EFFECTS['トリックルーム'] = (as, atk, def, dmg, ctx) => {
  const g = ctx.state.game;
  if (g.trickRoom > 0) {
    g.trickRoom = 0;
    const msg = 'トリックルームが解除された！';
    g.log.push(msg);
    ctx.addEffect({ kind: 'message', side: as, message: msg });
  } else {
    g.trickRoom = 5;
    const msg = 'トリックルームが発動！素早さが逆転した！';
    g.log.push(msg);
    ctx.addEffect({ kind: 'message', side: as, message: msg });
  }
};

// 天候変化
MOVE_EFFECTS['にほんばれ']   = (as, atk, def, dmg, ctx) => {
  const { setWeather } = require('./weather.js');
  setWeather(ctx.state.game, 'sun', 5, ctx);
};
MOVE_EFFECTS['あまごい']     = (as, atk, def, dmg, ctx) => {
  const { setWeather } = require('./weather.js');
  setWeather(ctx.state.game, 'rain', 5, ctx);
};
MOVE_EFFECTS['すなあらし']   = (as, atk, def, dmg, ctx) => {
  const { setWeather } = require('./weather.js');
  setWeather(ctx.state.game, 'sand', 5, ctx);
};

// 設置技
MOVE_EFFECTS['ステルスロック'] = (as, atk, def, dmg, ctx) => {
  const { addHazard } = require('./hazards.js');
  const defSide = ctx.enemy(as);
  const added = addHazard(defSide, 'stealthRock', ctx.state.game);
  const msg = added ? 'ステルスロックが設置された！' : 'ステルスロックはすでに設置されている！';
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'message', side: defSide, message: msg });
};
MOVE_EFFECTS['まきびし'] = (as, atk, def, dmg, ctx) => {
  const { addHazard } = require('./hazards.js');
  const defSide = ctx.enemy(as);
  const added = addHazard(defSide, 'spikes', ctx.state.game);
  const msg = added ? 'まきびしがまかれた！' : 'まきびしはこれ以上まけない！';
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'message', side: defSide, message: msg });
};
MOVE_EFFECTS['ねばねばネット'] = (as, atk, def, dmg, ctx) => {
  const { addHazard } = require('./hazards.js');
  const defSide = ctx.enemy(as);
  const added = addHazard(defSide, 'stickyWeb', ctx.state.game);
  const msg = added ? 'ねばねばネットが設置された！' : 'ねばねばネットはすでに設置されている！';
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'message', side: defSide, message: msg });
};

// -------- 追加効果：のしかかり・たきのぼり・ねっとう・ほっぺすりすり --------
MOVE_EFFECTS['のしかかり'] = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryStatus(def, ctx.enemy(as), 'par', ctx); };
MOVE_EFFECTS['たきのぼり'] = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.20) tryFlinch(def, as); };
MOVE_EFFECTS['ねっとう']   = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryStatus(def, ctx.enemy(as), 'brn', ctx); };
MOVE_EFFECTS['ふんえん']   = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.30) tryStatus(def, ctx.enemy(as), 'brn', ctx); };
MOVE_EFFECTS['ほっぺすりすり'] = (as, atk, def, dmg, ctx) => { tryStatus(def, ctx.enemy(as), 'par', ctx); };

// -------- 追加効果：フリーズドライ（水タイプにも抜群）--------
MOVE_EFFECTS['フリーズドライ'] = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.10) tryStatus(def, ctx.enemy(as), 'frz', ctx); };

// -------- 追加効果：睡眠技 --------
MOVE_EFFECTS['キノコのほうし'] = (as, atk, def, dmg, ctx) => { tryStatus(def, ctx.enemy(as), 'slp', ctx); };
MOVE_EFFECTS['ねむりごな']     = (as, atk, def, dmg, ctx) => { tryStatus(def, ctx.enemy(as), 'slp', ctx); };
MOVE_EFFECTS['あくまのキッス'] = (as, atk, def, dmg, ctx) => { tryStatus(def, ctx.enemy(as), 'slp', ctx); };

// -------- 追加効果：かみくだく・あくのはどう --------
MOVE_EFFECTS['かみくだく']   = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.20) tryStatDrop(def, ctx.enemy(as), 'def', -1, ctx); };
MOVE_EFFECTS['あくのはどう'] = (as, atk, def, dmg, ctx) => { if (Math.random() < 0.20) tryFlinch(def, as); };

// -------- 追加効果：ぼうふう（30%こんらん）--------
MOVE_EFFECTS['ぼうふう'] = (as, atk, def, dmg, ctx) => {
  if (Math.random() < 0.30) {
    const { applyConfusion } = require('./status.js');
    if (applyConfusion(def)) {
      const msg = `${def.name}は混乱した！`;
      ctx.state.game.log.push(msg);
      ctx.addEffect({ kind: 'message', side: ctx.enemy(as), message: msg });
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
  tryStatDrop(atk, as, 'def', -1, ctx);
  tryStatDrop(atk, as, 'spd', -1, ctx);
};
MOVE_EFFECTS['ばかぢから']     = (as, atk, def, dmg, ctx) => {
  tryStatDrop(atk, as, 'atk', -1, ctx);
  tryStatDrop(atk, as, 'def', -1, ctx);
};
MOVE_EFFECTS['オーバーヒート'] = (as, atk, def, dmg, ctx) => { tryStatDrop(atk, as, 'spa', -2, ctx); };
MOVE_EFFECTS['りゅうせいぐん'] = (as, atk, def, dmg, ctx) => { tryStatDrop(atk, as, 'spa', -2, ctx); };

// -------- 自己能力上昇変化技 --------
MOVE_EFFECTS['からをやぶる'] = (as, atk, def, dmg, ctx) => {
  tryStatUp(atk, as, 'atk', 2, ctx);
  tryStatUp(atk, as, 'spa', 2, ctx);
  tryStatUp(atk, as, 'spe', 2, ctx);
  tryStatDrop(atk, as, 'def', -1, ctx);
  tryStatDrop(atk, as, 'spd', -1, ctx);
};
MOVE_EFFECTS['せいちょう']   = (as, atk, def, dmg, ctx) => {
  tryStatUp(atk, as, 'atk', 1, ctx);
  tryStatUp(atk, as, 'spa', 1, ctx);
};
MOVE_EFFECTS['コットンガード'] = (as, atk, def, dmg, ctx) => { tryStatUp(atk, as, 'def', 3, ctx); };
MOVE_EFFECTS['のろい']        = (as, atk, def, dmg, ctx) => {
  tryStatUp(atk, as, 'atk', 1, ctx);
  tryStatUp(atk, as, 'def', 1, ctx);
  tryStatDrop(atk, as, 'spe', -1, ctx);
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
  const weather = ctx.state.game.weather;
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
  ctx.addEffect({ kind: 'status', side: as, status: 'slp', message: msg });
  if (recovered > 0) {
    ctx.addEffect({ kind: 'hit', side: as, labels: [{ text: `+${recovered}`, tone: 'heal' }], hpAfter: atk.hp, targetIndex: ctx.state.game.active[as], message: msg });
  }
};

// -------- ちょうはつ（簡易実装：メッセージのみ） --------
MOVE_EFFECTS['ちょうはつ'] = (as, atk, def, dmg, ctx) => {
  if (!def.taunt) {
    def.taunt = 3;
    const msg = `${def.name}は挑発された！変化技が使えない！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'message', side: ctx.enemy(as), message: msg });
  }
};

// -------- アンコール（簡易実装：メッセージのみ） --------
MOVE_EFFECTS['アンコール'] = (as, atk, def, dmg, ctx) => {
  if (def.lastMove && !def.encored) {
    def.encored = def.lastMove;
    def.encoreTurns = 3;
    const msg = `${def.name}はアンコール状態になった！直前の技しか使えない！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'message', side: ctx.enemy(as), message: msg });
  }
};

// -------- こうそくスピン（設置技除去＋素早さ↑） --------
MOVE_EFFECTS['こうそくスピン'] = (as, atk, def, dmg, ctx) => {
  const { removeHazards } = require('./hazards.js');
  const removed = removeHazards(as, ctx.state.game);
  if (removed) {
    const msg = `${atk.name}は設置技を吹き飛ばした！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'message', side: as, message: msg });
  }
  tryStatUp(atk, as, 'spe', 1, ctx);
};

// -------- テレポート（低優先度で交代） --------
MOVE_EFFECTS['テレポート'] = (as, atk, def, dmg, ctx) => {
  ctx.state.game._voltSwitch = as;
};

// -------- いたみわけ（HPを平均化） --------
MOVE_EFFECTS['いたみわけ'] = (as, atk, def, dmg, ctx) => {
  const defSide = ctx.enemy(as);
  const avg = Math.floor((atk.hp + def.hp) / 2);
  const atkHpBefore = atk.hp;
  const defHpBefore = def.hp;
  atk.hp = Math.min(atk.maxHp, avg);
  def.hp = Math.min(def.maxHp, avg);
  const msg = `${atk.name}と${def.name}のHPが平均化された！`;
  ctx.state.game.log.push(msg);
  ctx.addEffect({ kind: 'hit', side: as, hpAfter: atk.hp, targetIndex: ctx.state.game.active[as], labels: [], message: msg });
  ctx.addEffect({ kind: 'hit', side: defSide, hpAfter: def.hp, targetIndex: ctx.state.game.active[defSide], labels: [], message: msg });
};

// -------- クリアスモッグ（能力変化リセット） --------
MOVE_EFFECTS['クリアスモッグ'] = (as, atk, def, dmg, ctx) => {
  const defSide = ctx.enemy(as);
  let resetAny = false;
  if (def.statStages) {
    for (const k of Object.keys(def.statStages)) {
      if (def.statStages[k] !== 0) { def.statStages[k] = 0; resetAny = true; }
    }
  }
  if (resetAny) {
    const msg = `${def.name}の能力変化がリセットされた！`;
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'message', side: defSide, message: msg });
  }
};

// -------- はらだいこ（HP半分消費、攻撃最大） --------
MOVE_EFFECTS['はらだいこ'] = (as, atk, def, dmg, ctx) => {
  const cost = Math.floor(atk.maxHp / 2);
  if (atk.hp <= cost) return; // HP足りなければ失敗
  const hpBefore = atk.hp;
  atk.hp = Math.max(1, atk.hp - cost);
  const msg = `${atk.name}はお腹を叩き攻撃を最大まで上げた！`;
  ctx.state.game.log.push(msg);
  atk.statStages = atk.statStages || {};
  atk.statStages.atk = 6;
  ctx.addEffect({ kind: 'hit', side: as, hpAfter: atk.hp, targetIndex: ctx.state.game.active[as], labels: [{ text: 'はらだいこ', tone: 'ability-red' }], message: msg });
};

function applyMoveAdditionalEffect(moveName, attackerSide, attacker, defender, dmg, ctx) {
  const fn = MOVE_EFFECTS[moveName];
  if (fn) fn(attackerSide, attacker, defender, dmg, ctx);
}

module.exports = {
  MOVE_PRIORITY, MOVE_CRIT_STAGE, MOVE_EFFECTS,
  getMoveBaseCritStage, applyMoveAdditionalEffect,
};
