'use strict';

// 技の追加効果レジストリ（将来実装用）
// MOVE_EFFECTS[moveName] = (attacker, defender, dmg, ctx) => void
const MOVE_EFFECTS = {};

function applyMoveAdditionalEffect(_moveName, _attacker, _defender, _dmg, _ctx) {
  // placeholder: 追加効果なし
}

module.exports = { MOVE_EFFECTS, applyMoveAdditionalEffect };
