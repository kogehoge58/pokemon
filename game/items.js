'use strict';

// 持ち物エフェクトレジストリ（将来実装用）
// ITEM_HOOKS[itemName] = { onEntry(side, ctx), onEndTurn(side, ctx) }
const ITEM_HOOKS = {};

function triggerItemOnEntry(side, ctx) {
  const p = ctx.active(side);
  if (!p || !p.item || !ITEM_HOOKS[p.item]?.onEntry) return;
  ITEM_HOOKS[p.item].onEntry(side, ctx);
}

function triggerItemOnEndTurn(side, ctx) {
  const p = ctx.active(side);
  if (!p || p.fainted || !p.item || !ITEM_HOOKS[p.item]?.onEndTurn) return;
  ITEM_HOOKS[p.item].onEndTurn(side, ctx);
}

function getItemAttackerMult(attacker, _move) {
  void attacker;
  return { mult: 1, labels: [], logs: [] };
}

function getItemDefenderMult(defender, _move) {
  void defender;
  return { mult: 1, labels: [], logs: [] };
}

module.exports = { ITEM_HOOKS, triggerItemOnEntry, triggerItemOnEndTurn, getItemAttackerMult, getItemDefenderMult };
