'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { TYPES, CHART, MOVES, DEX, ABILITY_DETAILS, ABILITY_BY_POKEMON, POKEAPI_SPRITE_IDS, ITEMS, ITEM_DETAILS, ITEM_BY_POKEMON } = require('./data.js');
const { state, enemy } = require('./game/context.js');
const { makePokemon, abilityOfPokemon, spriteUrlByName } = require('./game/pokemon.js');
const { doSwitch, resolveTurn } = require('./game/engine.js');
const { startBattleFromPick } = require('./game/selection.js');
const { makeHazards } = require('./game/hazards.js');

// スプライトURLをDEXエントリに付加
Object.keys(DEX).forEach(name => {
  DEX[name].spriteUrl = spriteUrlByName(name);
  DEX[name].spriteEmoji = DEX[name].sprite;
});

// --- パーティ管理 ---
const PARTIES_FILE = path.join(__dirname, 'parties.json');
const VALID_USERS = ['ひびき', 'くさの', 'かいと', 'ゲスト'];

function makeEmptyUserParties() {
  return {
    active: 0,
    parties: [
      { name: 'パーティ1', pokemon: [] },
      { name: 'パーティ2', pokemon: [] },
      { name: 'パーティ3', pokemon: [] },
    ],
  };
}

function loadParties() {
  try {
    const raw = JSON.parse(fs.readFileSync(PARTIES_FILE, 'utf8'));
    let migrated = false;
    const result = {};
    for (const user of VALID_USERS) {
      if (!raw[user]) {
        result[user] = makeEmptyUserParties();
        migrated = true;
      } else if (Array.isArray(raw[user])) {
        // 旧形式（フラット配列）→ 新形式に自動移行
        const newEntry = makeEmptyUserParties();
        if (raw[user].length === 6) {
          newEntry.parties[0] = { name: 'パーティ1', pokemon: raw[user] };
        }
        result[user] = newEntry;
        migrated = true;
      } else {
        result[user] = raw[user];
      }
    }
    if (migrated) saveParties(result);
    return result;
  } catch {
    return { ひびき: makeEmptyUserParties(), くさの: makeEmptyUserParties(), かいと: makeEmptyUserParties(), ゲスト: makeEmptyUserParties() };
  }
}

function getActivePartyPokemon(parties, user) {
  const u = parties[user];
  if (!u || !u.parties) return [];
  const slot = u.parties[u.active ?? 0];
  return slot?.pokemon || [];
}
function saveParties(parties) {
  fs.writeFileSync(PARTIES_FILE, JSON.stringify(parties, null, 2), 'utf8');
}

function notify() {
  state.version++;
  const body = JSON.stringify({ version: state.version, game: state.game });
  for (const res of state.waiters.splice(0)) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  }
}

function resetGame(closePopups = false) {
  const nextPopupCloseId = closePopups ? ++state.popupCloseSeq : state.popupCloseSeq;
  state.game = {
    mode: 'entry',
    entries: { A: null, B: null },
    pickPool: { A: [], B: [] },
    selected: { A: [], B: [] },
    confirmed: { A: false, B: false },
    turn: 1,
    teams: { A: [], B: [] },
    active: { A: 0, B: 0 },
    commands: { A: null, B: null },
    popupCloseId: nextPopupCloseId,
    forceSwitch: null,
    log: ['対戦ルームを作成しました。エントリーしてください。'],
    winner: null,
    message: 'ひびき/くさの/かいと/ゲストが接続設定からエントリーしてください。',
    revealed: { A: [false, false, false], B: [false, false, false] },
    effects: [],
    effectId: 0,
    weather: { type: null, turns: 0 },
    hazards: { A: makeHazards(), B: makeHazards() },
    trickRoom: 0,
  };
  notify();
}

function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); } });
  });
}
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function validSide(s) { return s === 'A' || s === 'B'; }

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.gif': 'image/gif', '.png': 'image/png', '.mp3': 'audio/mpeg' };

resetGame();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/data') {
    return sendJson(res, 200, { TYPES, CHART, MOVES, DEX, ABILITY_DETAILS, ABILITY_BY_POKEMON, POKEAPI_SPRITE_IDS, ITEMS, ITEM_DETAILS, ITEM_BY_POKEMON });
  }

  if (req.method === 'GET' && url.pathname === '/state') {
    return sendJson(res, 200, { version: state.version, game: state.game });
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    const clientVersion = Number(url.searchParams.get('version') || 0);
    if (clientVersion !== state.version) return sendJson(res, 200, { version: state.version, game: state.game });
    state.waiters.push(res);
    req.on('close', () => { state.waiters = state.waiters.filter(x => x !== res); });
    setTimeout(() => {
      if (state.waiters.includes(res)) {
        state.waiters = state.waiters.filter(x => x !== res);
        sendJson(res, 200, { version: state.version, game: state.game });
      }
    }, 25000);
    return;
  }

  // パーティ一覧取得
  if (req.method === 'GET' && url.pathname === '/parties') {
    return sendJson(res, 200, loadParties());
  }

  // バトルBGMリスト取得（汎用GETより前に処理）
  if (req.method === 'GET' && url.pathname === '/battle-bgm-list') {
    try {
      const dir = path.join(__dirname, 'music', 'battle');
      const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.mp3')).sort();
      return sendJson(res, 200, { files });
    } catch {
      return sendJson(res, 200, { files: [] });
    }
  }

  if (req.method === 'GET') {
    const filePath = url.pathname === '/'
      ? path.join(__dirname, 'public', 'index.html')
      : url.pathname.startsWith('/music/')
        ? path.join(__dirname, 'music', decodeURIComponent(url.pathname.slice('/music/'.length)))
        : path.join(__dirname, 'public', url.pathname);
    try {
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath);
      const mime = MIME[ext] || 'text/plain';
      res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
    return;
  }

  if (req.method !== 'POST') return sendJson(res, 404, { error: 'not found' });
  const body = await parseBody(req);

  try {
    const g = state.game;

    if (url.pathname === '/reset') {
      resetGame(true);
      return sendJson(res, 200, { version: state.version, game: state.game });
    }

    // BGM保存
    if (url.pathname === '/save-bgm') {
      const { user, bgm } = body;
      if (!VALID_USERS.includes(user)) return sendJson(res, 400, { error: 'ユーザーが不正です' });
      const parties = loadParties();
      if (!parties[user]) parties[user] = makeEmptyUserParties();
      parties[user].bgm = bgm || null;
      saveParties(parties);
      return sendJson(res, 200, { ok: true });
    }

    // 個別設定保存（panelColor / bgTheme）
    if (url.pathname === '/save-user-setting') {
      const { user, key, value } = body;
      if (!VALID_USERS.includes(user)) return sendJson(res, 400, { error: 'ユーザーが不正です' });
      const ALLOWED_KEYS = ['bgTheme'];
      if (!ALLOWED_KEYS.includes(key)) return sendJson(res, 400, { error: 'キーが不正です' });
      const parties = loadParties();
      if (!parties[user]) parties[user] = makeEmptyUserParties();
      parties[user][key] = value || null;
      saveParties(parties);
      return sendJson(res, 200, { ok: true });
    }

    // パーティ保存
    if (url.pathname === '/save-party') {
      const { user, slotIndex, name, pokemon } = body;
      if (!VALID_USERS.includes(user)) return sendJson(res, 400, { error: 'ユーザーが不正です' });
      const si = Number(slotIndex);
      if (!Number.isInteger(si) || si < 0 || si > 2) return sendJson(res, 400, { error: 'スロット番号が不正です' });
      if (!pokemon.every(n => DEX[n])) return sendJson(res, 400, { error: '図鑑に存在しないポケモンが含まれています' });
      if (pokemon.length === 6 && new Set(pokemon).size !== 6) return sendJson(res, 400, { error: '同じポケモンを重複登録できません' });
      const parties = loadParties();
      if (!parties[user] || !parties[user].parties) parties[user] = makeEmptyUserParties();
      parties[user].parties[si] = { name: name || `パーティ${si + 1}`, pokemon };
      saveParties(parties);
      return sendJson(res, 200, { ok: true });
    }

    // アクティブパーティ変更
    if (url.pathname === '/set-active-party') {
      const { user, slotIndex } = body;
      if (!VALID_USERS.includes(user)) return sendJson(res, 400, { error: 'ユーザーが不正です' });
      const si = Number(slotIndex);
      if (!Number.isInteger(si) || si < 0 || si > 2) return sendJson(res, 400, { error: 'スロット番号が不正です' });
      const parties = loadParties();
      if (!parties[user] || !parties[user].parties) parties[user] = makeEmptyUserParties();
      parties[user].active = si;
      saveParties(parties);
      return sendJson(res, 200, { ok: true });
    }

    // 離席
    if (url.pathname === '/leave') {
      const { user } = body;
      if (!VALID_USERS.includes(user)) return sendJson(res, 400, { error: 'ユーザーが不正です' });
      if (g.mode !== 'entry') return sendJson(res, 400, { error: 'エントリー期間外です' });
      for (const side of ['A', 'B']) {
        if (g.entries[side] === user) {
          g.entries[side] = null;
          g.pickPool[side] = [];
        }
      }
      g.message = `${user}が離席しました。`;
      g.log.push(`${user}が離席しました。`);
      notify();
      return sendJson(res, 200, { version: state.version, game: g });
    }

    // エントリー
    if (url.pathname === '/enter') {
      const { user, side, partyIndex } = body;
      if (!VALID_USERS.includes(user)) return sendJson(res, 400, { error: 'ユーザーが不正です' });
      if (!validSide(side)) return sendJson(res, 400, { error: 'サイドが不正です' });
      if (g.mode !== 'entry') return sendJson(res, 400, { error: 'エントリー期間外です' });
      const parties = loadParties();
      const userParties = parties[user];
      const pi = (partyIndex !== undefined && partyIndex !== null) ? Number(partyIndex) : (userParties?.active ?? 0);
      const slot = userParties?.parties?.[pi];
      const activePokemon = slot?.pokemon || [];
      if (activePokemon.length !== 6) return sendJson(res, 400, { error: `選択したパーティに6体登録されていません。パーティ登録画面で登録してください。` });
      const otherSide = side === 'A' ? 'B' : 'A';
      if (g.entries[otherSide] === user) return sendJson(res, 400, { error: `${user}は既にプレイヤー${otherSide}としてエントリー済みです` });
      if (g.entries[side] && g.entries[side] !== user) return sendJson(res, 400, { error: `プレイヤー${side}は既に${g.entries[side]}がエントリー済みです` });
      g.entries[side] = user;
      g.pickPool[side] = [...activePokemon];
      g.log.push(`${user}がプレイヤー${side}としてエントリーしました。`);
      if (g.entries.A && g.entries.B) {
        g.mode = 'pick';
        g.message = '両プレイヤーがエントリーしました。相手の6体を見ながら、自分の3体を選出してください。';
        g.log.push('エントリー完了。選出フェーズへ移行します。');
      } else {
        g.message = `${user}がプレイヤー${side}としてエントリーしました。相手のエントリーを待っています。`;
      }
      notify();
      return sendJson(res, 200, { version: state.version, game: g });
    }

    // 選出ピック
    if (url.pathname === '/pick') {
      const { side, name } = body;
      if (!validSide(side) || g.mode !== 'pick' || g.confirmed[side]) return sendJson(res, 400, { error: '選択できません' });
      if (!g.pickPool[side].includes(name)) return sendJson(res, 400, { error: 'そのポケモンはパーティにいません' });
      if (!g.selected[side].includes(name) && g.selected[side].length < 3) g.selected[side].push(name);
      g.log.push(`プレイヤー${side}が ${g.selected[side].length}体目を選択しました。`);
      notify(); return sendJson(res, 200, { version: state.version, game: g });
    }

    if (url.pathname === '/remove-pick') {
      const { side, index } = body;
      if (!validSide(side) || g.mode !== 'pick' || g.confirmed[side]) return sendJson(res, 400, { error: '外せません' });
      g.selected[side].splice(index, 1);
      notify(); return sendJson(res, 200, { version: state.version, game: g });
    }

    if (url.pathname === '/reorder-pick') {
      const { side, from, to } = body;
      if (!validSide(side) || g.mode !== 'pick' || g.confirmed[side]) return sendJson(res, 400, { error: '順番変更できません' });
      const list = g.selected[side];
      const f = Number(from), t = Number(to);
      if (!Number.isInteger(f) || !Number.isInteger(t) || f < 0 || t < 0 || f >= list.length || t >= list.length) return sendJson(res, 400, { error: '順番変更できません' });
      const [item] = list.splice(f, 1);
      list.splice(t, 0, item);
      notify(); return sendJson(res, 200, { version: state.version, game: g });
    }

    if (url.pathname === '/confirm') {
      const { side } = body;
      if (!validSide(side) || g.mode !== 'pick' || g.selected[side].length !== 3) return sendJson(res, 400, { error: '3体選んでください' });
      g.confirmed[side] = true;
      g.log.push(`プレイヤー${side}の選出が確定しました。`);
      if (g.confirmed.A && g.confirmed.B) {
        startBattleFromPick();
      }
      notify(); return sendJson(res, 200, { version: state.version, game: g });
    }

    if (url.pathname === '/command') {
      const { side, cmd } = body;
      if (!validSide(side) || g.mode !== 'battle' || g.winner) return sendJson(res, 400, { error: 'コマンド選択できません' });
      if (g.forceSwitch) return sendJson(res, 400, { error: '交代フェーズ中です' });
      if (g.commands[side]) return sendJson(res, 400, { error: '選択済みです' });
      if (!cmd || !['move', 'switch', 'surrender'].includes(cmd.type)) return sendJson(res, 400, { error: '不正なコマンドです' });
      const activeMon = g.teams[side][g.active[side]];
      if (cmd.type === 'move' && !activeMon.moves.includes(cmd.moveName)) return sendJson(res, 400, { error: 'その技は使えません' });
      if (cmd.type === 'switch' && (cmd.index === g.active[side] || !g.teams[side][cmd.index] || g.teams[side][cmd.index].fainted)) return sendJson(res, 400, { error: 'そのポケモンには交代できません' });
      g.commands[side] = cmd;
      g.log.push(`プレイヤー${side}がコマンドを選択しました。`);
      // 充電中（ソーラービーム等）のポケモンのコマンドを自動設定
      for (const s of ['A', 'B']) {
        if (!g.commands[s]) {
          const mon = g.teams[s][g.active[s]];
          if (mon && mon.chargingMove && !mon.fainted) {
            g.commands[s] = { type: 'move', moveName: mon.chargingMove };
          }
        }
      }
      if (g.commands.A && g.commands.B) {
        g.popupCloseId = ++state.popupCloseSeq;
        resolveTurn();
      } else {
        g.message = `プレイヤー${side}は選択済み。もう片方のプレイヤーの選択待ちです。`;
      }
      notify(); return sendJson(res, 200, { version: state.version, game: g });
    }

    if (url.pathname === '/force-switch') {
      const { side, index } = body;
      if (!validSide(side)) return sendJson(res, 400, { error: '交代できません' });
      if (!g.teams[side][index] || g.teams[side][index].fainted) return sendJson(res, 400, { error: '交代できません' });
      const isBothSwitch = g.forceSwitch === 'AB';
      if (!isBothSwitch && g.forceSwitch !== side) return sendJson(res, 400, { error: '交代フェーズ中です' });

      const { startEffects, finishEffects, addEffect, active } = require('./game/context.js');
      const { resetVolatileStats } = require('./game/pokemon.js');
      const { triggerOnEntry } = require('./game/abilities.js');
      const { triggerItemOnEntry } = require('./game/items.js');
      const { applyHazardsOnEntry } = require('./game/hazards.js');
      const { nextTurn, resumeAfterPivot } = require('./game/engine.js');
      const fsCtx = { state, enemy, active, addEffect };

      // ⚠️ 注意：この /force-switch ハンドラは engine.js の doSwitch() を経由しないインライン実装。
      // doSwitch() に処理を追加した場合は、下の isBothSwitch パスと単独強制交代パスの両方にも必ず追加すること。

      if (isBothSwitch) {
        // 両者同時気絶：どちらかのサイドの選択を記録し、両方揃ったら実行
        if (!g.pendingSwitch) g.pendingSwitch = {};
        g.pendingSwitch[side] = index;
        const hasA = g.pendingSwitch.A !== undefined;
        const hasB = g.pendingSwitch.B !== undefined;
        if (hasA && hasB) {
          // 両方揃った → 同時に交代処理
          g.popupCloseId = ++state.popupCloseSeq;
          startEffects();
          for (const s of ['A', 'B']) {
            const idx = g.pendingSwitch[s];
            const fromIndex = g.active[s];
            addEffect({ kind: 'switch', side: s, fromIndex, toIndex: idx, message: '交換' });
            resetVolatileStats(active(s));
            g.active[s] = idx;
            if (g.revealed?.[s]) g.revealed[s][idx] = true;
            const incoming = active(s);
            incoming.firstTurnOut = true;
            const fsMsg = `プレイヤー${s}は ${incoming.name} を繰り出した！`;
            g.log.push(fsMsg);
            addEffect({ kind: 'message', side: s, message: fsMsg });
            // いやしのねがい：エントリー処理より優先してHP全回復・状態異常回復
            if (g.healingWish?.[s]) {
              delete g.healingWish[s];
              if (!incoming.fainted) {
                incoming.hp = incoming.maxHp; incoming.status = null;
                incoming.sleepTurns = 0; incoming.toxicCounter = 1;
                const hwMsg = `いやしのねがいの効果で ${incoming.name} のHPが全回復した！`;
                g.log.push(hwMsg);
                addEffect({ kind: 'healing-wish', side: s, targetIndex: idx, hpAfter: incoming.hp, message: hwMsg });
              }
            }
            applyHazardsOnEntry(s, incoming, fsCtx);
            triggerOnEntry(s, fsCtx);
            triggerItemOnEntry(s, fsCtx);
          }
          delete g.pendingSwitch;
          g.forceSwitch = null;
          nextTurn();
          finishEffects();
        } else {
          // 片方が選択済み→もう片方待ち
          const waitSide = hasA ? 'B' : 'A';
          g.message = `プレイヤー${side}は選択済み。プレイヤー${waitSide}の選択待ちです。`;
          g.log.push(g.message);
        }
        notify(); return sendJson(res, 200, { version: state.version, game: g });
      }

      // 通常の片側強制交代
      startEffects();
      const fromIndex = g.active[side];
      addEffect({ kind: 'switch', side, fromIndex, toIndex: index, message: '交換' });
      resetVolatileStats(active(side));
      g.active[side] = index;
      if (g.revealed?.[side]) g.revealed[side][index] = true;
      const fsIncoming = active(side);
      fsIncoming.firstTurnOut = true;
      const fsMsg = `プレイヤー${side}は ${fsIncoming.name} を繰り出した！`;
      g.log.push(fsMsg);
      addEffect({ kind: 'message', side, message: fsMsg });
      // いやしのねがい：エントリー処理より優先してHP全回復・状態異常回復
      if (g.healingWish?.[side]) {
        delete g.healingWish[side];
        if (!fsIncoming.fainted) {
          fsIncoming.hp = fsIncoming.maxHp; fsIncoming.status = null;
          fsIncoming.sleepTurns = 0; fsIncoming.toxicCounter = 1;
          const hwMsg = `いやしのねがいの効果で ${fsIncoming.name} のHPが全回復した！`;
          g.log.push(hwMsg);
          addEffect({ kind: 'healing-wish', side, targetIndex: index, hpAfter: fsIncoming.hp, message: hwMsg });
        }
      }
      applyHazardsOnEntry(side, fsIncoming, fsCtx);
      triggerOnEntry(side, fsCtx);
      triggerItemOnEntry(side, fsCtx);
      if (g._dbSeqSecond) {
        // みちづれ順番交代：1番手完了 → 2番手の交代フェーズへ
        const second = g._dbSeqSecond;
        delete g._dbSeqSecond;
        const secondActive = g.teams[second]?.[g.active[second]];
        const secondNeed = secondActive?.fainted && g.teams[second].some(p => !p.fainted) && !g.winner;
        if (secondNeed) {
          g.forceSwitch = second;
          g.commands = { A: null, B: null };
          g.message = `プレイヤー${second}は次に出すポケモンを選んでください。`;
          g.log.push(g.message);
        } else {
          nextTurn();
        }
      } else if (g._resumeActions?.length) {
        resumeAfterPivot();
      } else {
        // ピボット技でKOした場合、相手側も交代が必要か確認
        const otherSide = enemy(side);
        const otherActive = g.teams[otherSide]?.[g.active[otherSide]];
        const otherNeedsSwitch = otherActive?.fainted && g.teams[otherSide].some(p => !p.fainted) && !g.winner;
        if (otherNeedsSwitch) {
          g.forceSwitch = otherSide;
          g.commands = { A: null, B: null };
          g.message = `プレイヤー${otherSide}は次に出すポケモンを選んでください。`;
          g.log.push(g.message);
        } else {
          nextTurn();
        }
      }
      finishEffects();
      notify(); return sendJson(res, 200, { version: state.version, game: g });
    }

    return sendJson(res, 404, { error: 'not found' });
  } catch (e) {
    return sendJson(res, 500, { error: e.message });
  }
});

server.listen(3000, () => {
  console.log('http://localhost:3000 で起動しました');
});
