'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { TYPES, CHART, MOVES, DEX, ABILITY_DETAILS, ABILITY_BY_POKEMON, POKEAPI_SPRITE_IDS, ITEMS, ITEM_DETAILS } = require('./data.js');
const { state, enemy } = require('./game/context.js');
const { makePokemon, abilityOfPokemon, spriteUrlByName } = require('./game/pokemon.js');
const { doSwitch, resolveTurn } = require('./game/engine.js');
const { prepareFinalSelectionIfReady, startBattleIfFinalReady } = require('./game/selection.js');

// スプライトURLをDEXエントリに付加
Object.keys(DEX).forEach(name => {
  DEX[name].spriteUrl = spriteUrlByName(name);
  DEX[name].spriteEmoji = DEX[name].sprite;
});

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
    mode: 'select',
    selected: { A: [], B: [] },
    confirmed: { A: false, B: false },
    finalPool: { A: [], B: [] },
    finalSelected: { A: [], B: [] },
    finalConfirmed: { A: false, B: false },
    turn: 1,
    teams: { A: [], B: [] },
    active: { A: 0, B: 0 },
    commands: { A: null, B: null },
    popupCloseId: nextPopupCloseId,
    forceSwitch: null,
    log: ['対戦ルームを作成しました。プレイヤーA/Bを選んでください。'],
    winner: null,
    message: 'プレイヤーA/Bがそれぞれ3体選出してください。',
    revealed: { A: [false, false, false], B: [false, false, false] },
    effects: [],
    effectId: 0
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

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.gif': 'image/gif', '.png': 'image/png' };

resetGame();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/data') {
    return sendJson(res, 200, { TYPES, CHART, MOVES, DEX, ABILITY_DETAILS, ABILITY_BY_POKEMON, POKEAPI_SPRITE_IDS, ITEMS, ITEM_DETAILS });
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

  if (req.method === 'GET') {
    const filePath = url.pathname === '/'
      ? path.join(__dirname, 'public', 'index.html')
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

    if (url.pathname === '/pick') {
      const { side, name } = body;
      if (!validSide(side) || !DEX[name] || g.mode !== 'select' || g.confirmed[side]) return sendJson(res, 400, { error: '選択できません' });
      if (!g.selected[side].includes(name) && g.selected[side].length < 3) g.selected[side].push(name);
      g.log.push(`プレイヤー${side}が ${g.selected[side].length}体目を選択しました。`);
      notify(); return sendJson(res, 200, { version: state.version, game: g });
    }

    if (url.pathname === '/remove-pick') {
      const { side, index } = body;
      if (!validSide(side) || g.mode !== 'select' || g.confirmed[side]) return sendJson(res, 400, { error: '外せません' });
      g.selected[side].splice(index, 1);
      notify(); return sendJson(res, 200, { version: state.version, game: g });
    }

    if (url.pathname === '/reorder-pick') {
      const { side, from, to } = body;
      if (!validSide(side) || g.mode !== 'select' || g.confirmed[side]) return sendJson(res, 400, { error: '順番変更できません' });
      const list = g.selected[side];
      const f = Number(from), t = Number(to);
      if (!Number.isInteger(f) || !Number.isInteger(t) || f < 0 || t < 0 || f >= list.length || t >= list.length) return sendJson(res, 400, { error: '順番変更できません' });
      const [item] = list.splice(f, 1);
      list.splice(t, 0, item);
      notify(); return sendJson(res, 200, { version: state.version, game: g });
    }

    if (url.pathname === '/confirm') {
      const { side } = body;
      if (!validSide(side) || g.mode !== 'select' || g.selected[side].length !== 3) return sendJson(res, 400, { error: '3体選んでください' });
      g.confirmed[side] = true;
      g.log.push(`プレイヤー${side}の選出が確定しました。`);
      if (g.confirmed.A && g.confirmed.B) {
        g.mode = 'preparingFinal';
        g.message = '読み込み中... 最終選出画面を準備しています。';
        notify();
        setTimeout(() => {
          if (state.game && state.game.mode === 'preparingFinal') {
            prepareFinalSelectionIfReady();
            notify();
          }
        }, 700);
        return sendJson(res, 200, { version: state.version, game: g });
      }
      notify(); return sendJson(res, 200, { version: state.version, game: g });
    }

    if (url.pathname === '/final-pick') {
      const { side, name } = body;
      if (!validSide(side) || g.mode !== 'final' || g.finalConfirmed[side] || !g.finalPool[side].includes(name)) return sendJson(res, 400, { error: '最終選出できません' });
      if (!g.finalSelected[side].includes(name) && g.finalSelected[side].length < 3) g.finalSelected[side].push(name);
      g.log.push(`プレイヤー${side}が最終選出 ${g.finalSelected[side].length}体目を選択しました。`);
      notify(); return sendJson(res, 200, { version: state.version, game: g });
    }

    if (url.pathname === '/final-remove-pick') {
      const { side, index } = body;
      if (!validSide(side) || g.mode !== 'final' || g.finalConfirmed[side]) return sendJson(res, 400, { error: '外せません' });
      g.finalSelected[side].splice(index, 1);
      notify(); return sendJson(res, 200, { version: state.version, game: g });
    }

    if (url.pathname === '/final-reorder-pick') {
      const { side, from, to } = body;
      if (!validSide(side) || g.mode !== 'final' || g.finalConfirmed[side]) return sendJson(res, 400, { error: '順番変更できません' });
      const list = g.finalSelected[side];
      const f = Number(from), t = Number(to);
      if (!Number.isInteger(f) || !Number.isInteger(t) || f < 0 || t < 0 || f >= list.length || t >= list.length) return sendJson(res, 400, { error: '順番変更できません' });
      const [item] = list.splice(f, 1);
      list.splice(t, 0, item);
      notify(); return sendJson(res, 200, { version: state.version, game: g });
    }

    if (url.pathname === '/final-confirm') {
      const { side } = body;
      if (!validSide(side) || g.mode !== 'final' || g.finalSelected[side].length !== 3) return sendJson(res, 400, { error: '最終選出を3体選んでください' });
      g.finalConfirmed[side] = true;
      g.log.push(`プレイヤー${side}の最終選出が確定しました。`);
      startBattleIfFinalReady();
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
      if (!validSide(side) || g.forceSwitch !== side || !g.teams[side][index] || g.teams[side][index].fainted) return sendJson(res, 400, { error: '交代できません' });
      const { startEffects, finishEffects, addEffect, active } = require('./game/context.js');
      const { resetVolatileStats } = require('./game/pokemon.js');
      const { triggerOnEntry } = require('./game/abilities.js');
      const { triggerItemOnEntry } = require('./game/items.js');
      const { nextTurn } = require('./game/engine.js');
      startEffects();
      const fromIndex = g.active[side];
      addEffect({ kind: 'switch', side, fromIndex, toIndex: index, message: '交換' });
      resetVolatileStats(active(side));
      g.active[side] = index;
      if (g.revealed?.[side]) g.revealed[side][index] = true;
      const fsMsg = `プレイヤー${side}は ${active(side).name} を繰り出した！`;
      g.log.push(fsMsg);
      addEffect({ kind: 'message', side, message: fsMsg });
      triggerOnEntry(side, { state, enemy, active, addEffect });
      triggerItemOnEntry(side, { state, enemy, active, addEffect });
      nextTurn();
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
