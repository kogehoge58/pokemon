# ポケモンバトルシステム

2人対戦用の簡易ポケモンバトルシミュレーター。

## 技術スタック

- **サーバー**: Node.js 標準 `http` モジュール（フレームワークなし）
- **フロントエンド**: Vue 3 CDN ESM（ビルドステップなし、`import` from unpkg）
- **DB**: なし（ゲーム状態はメモリ上）
- **リアルタイム同期**: ロングポーリング（`/events` エンドポイント）

## 起動

```
node server.js
```

→ http://localhost:3000

## ディレクトリ構成

```
server.js          HTTPルーティングのみ（ゲームロジックは game/ に委譲）
data.js            マスターデータ（TYPES, CHART, MOVES, DEX, ABILITIES, ITEMS）
game/
  context.js       共有state・enemy()/active()・addEffect・effectiveness/effText
  pokemon.js       makePokemon()・applyStatStage()・resetVolatileStats()
  abilities.js     特性レジストリ（ENTRY_HOOKS, END_TURN_HOOKS）+ passive query関数
  items.js         持ち物レジストリ（ITEM_HOOKS）placeholder
  moves.js         技追加効果レジストリ（MOVE_EFFECTS）placeholder
  engine.js        doAttack()・doSwitch()・resolveTurn() バトルエンジン本体
  selection.js     chooseCoverageAdds()・prepareFinalSelectionIfReady()
public/
  app.js           Vueアプリエントリ・グローバルコンポーネント登録
  store.js         クライアント側リアクティブstate・API関数
  style.css
  components/
    SelectScreen.js
    FinalScreen.js
    BattleScreen.js
    ModalLayer.js
```

## ゲームフロー

1. **select**: A・B各3体を選出 → confirm
2. **final**: AI補完で6体パーティ構成 → 最終3体を選出 → confirm
3. **battle**: コマンド選択（たたかう/こうかん/降参）→ターン解決

## 拡張方法

### 特性を追加する

`game/abilities.js` の対応するレジストリにエントリを追加：

```js
// 場に出た時の特性
ENTRY_HOOKS['新特性名'] = (side, ctx) => { ... };

// ターン終了時の特性
END_TURN_HOOKS['新特性名'] = (side, ctx) => { ... };
```

パッシブ（ダメージ計算に影響）は `getAttackerMult` / `getDefenderMult` / `getModifiedMove` に `if` 節を追加。

`data.js` の `ABILITY_DETAILS` と `ABILITY_BY_POKEMON` にも忘れずに追記。

### 持ち物を追加する

1. `data.js` の `ITEMS` と `ITEM_DETAILS` にデータ追加
2. `game/items.js` の `ITEM_HOOKS` にフック実装

```js
ITEM_HOOKS['きのみ名'] = {
  onEntry: (side, ctx) => { ... },      // 場に出た時
  onEndTurn: (side, ctx) => { ... },    // ターン終了時
};
```

ダメージ倍率に影響させる場合は `getItemAttackerMult` / `getItemDefenderMult` に追記。

### 技の追加効果を追加する

1. `data.js` の `MOVES` にデータ追加（`power`, `category`, `accuracy`, `type`）
2. `game/moves.js` の `MOVE_EFFECTS` にコールバック実装

```js
MOVE_EFFECTS['技名'] = (attacker, defender, dmg, ctx) => {
  // ヒット後の追加効果（状態異常・能力変化など）
};
```

### ポケモンを追加する

`data.js` の `DEX` にエントリ追加。`ABILITY_BY_POKEMON` と `POKEAPI_SPRITE_IDS` も合わせて追記。

## 既存の特性一覧

| 特性 | 種別 | 効果 |
|------|------|------|
| いかく | エントリー | 相手の攻撃-1段階 |
| かそく | エンドターン | 自分の素早さ+1段階 |
| てきおうりょく | パッシブ | タイプ一致補正2.0倍 |
| はりきり | パッシブ | 物理技威力1.5倍・命中0.8倍 |
| いろめがね | パッシブ | いまひとつの技ダメージ2.0倍 |
| フィルター | パッシブ | ばつぐん被ダメージ0.75倍 |
| きょううん | パッシブ | 急所率1/8 |
| がんじょう | パッシブ | HP満タンから一撃耐え |
| ノーガード | パッシブ | 両者必中 |
| アナライズ | パッシブ | 最後に攻撃した時1.3倍 |
