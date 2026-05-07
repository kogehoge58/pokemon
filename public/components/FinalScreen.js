import { defineComponent, computed } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { store, enemy, abilityOfPokemon, openModal, api } from '../store.js';

export default defineComponent({
  name: 'FinalScreen',
  setup() {
    const game = computed(() => store.game);
    const data = computed(() => store.masterData);
    const side = computed(() => store.role === 'B' ? 'B' : 'A');
    const otherSide = computed(() => enemy(side.value));

    const ownPool = computed(() => game.value?.finalPool?.[side.value] || []);
    const otherPool = computed(() => game.value?.finalPool?.[otherSide.value] || []);
    const fixedSet = computed(() => new Set(game.value?.selected?.[side.value] || []));
    const chosen = computed(() => game.value?.finalSelected?.[side.value] || []);
    const confirmed = computed(() => game.value?.finalConfirmed?.[side.value] || false);
    const otherConfirmed = computed(() => game.value?.finalConfirmed?.[otherSide.value] || false);

    function finalPick(name) { api('/final-pick', { side: side.value, name }); }
    function finalRemove(index) { api('/final-remove-pick', { side: side.value, index }); }
    function finalReorder(from, to) { api('/final-reorder-pick', { side: side.value, from, to }); }
    function finalConfirm() { api('/final-confirm', { side: side.value }); }

    return { store, game, data, side, otherSide, ownPool, otherPool, fixedSet, chosen, confirmed, otherConfirmed, finalPick, finalRemove, finalReorder, finalConfirm, openModal, abilityOfPokemon };
  },
  template: `
    <section v-if="!store.role" class="panel">
      <h2>最初に接続設定からプレイヤーA / Bを選んでください</h2>
      <button class="primary" style="margin-top:12px" @click="openModal('connectionSettings')">接続設定を開く</button>
    </section>

    <section v-else class="final-screen">
      <!-- 左：自分の最終選出パネル -->
      <div class="panel selected-panel">
        <h2>プレイヤー{{ side }}：最終選出</h2>
        <div class="small">6体からバトルに出す3体を選んでください。選んだ順番が先発順です。</div>

        <!-- 最終選出状況 -->
        <div class="selected-info">
          <h4>最終選出状況</h4>
          <div>A：{{ game.finalConfirmed.A ? '確定済み' : \`選択中（\${game.finalSelected.A.length}/3）\` }}</div>
          <div>B：{{ game.finalConfirmed.B ? '確定済み' : \`選択中（\${game.finalSelected.B.length}/3）\` }}</div>
        </div>

        <!-- 6体パーティグリッド -->
        <div class="selected-info">
          <h4>プレイヤー{{ side }}の6体パーティ</h4>
          <div class="final-party-grid">
            <div v-for="name in ownPool" :key="name" class="final-party-card" :class="{ picked: chosen.includes(name) }">
              <div class="final-card-top">
                <div>
                  <div class="dex-name">
                    <sprite-img :mon="data.DEX[name]" cls="mini-sprite" />
                    {{ name }}
                  </div>
                  <div class="types">
                    <type-badge v-for="t in data.DEX[name].types" :key="t" :type="t" />
                  </div>
                  <div class="ability-badge">特性：{{ abilityOfPokemon(name) }}</div>
                </div>
                <span class="final-badge" :class="fixedSet.has(name) ? 'fixed' : 'added'">
                  {{ fixedSet.has(name) ? '固定' : '追加' }}
                </span>
              </div>
              <div class="dex-actions">
                <button class="mini-btn" @click="openModal('details', { name })">詳細</button>
                <button
                  class="primary mini-btn"
                  :disabled="confirmed || chosen.includes(name) || chosen.length >= 3"
                  @click="finalPick(name)"
                >選ぶ</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 選んだ3体 -->
        <div class="selected-info">
          <h4>選出済み（先発順）</h4>
          <div class="selected-list">
            <div v-for="(name, i) in chosen" :key="name" class="selected-mon">
              <div class="selected-main">
                <div class="selected-row">
                  <b>{{ i + 1 }}. <sprite-img :mon="data.DEX[name]" cls="mini-sprite" /> {{ name }}</b>
                  <div class="types">
                    <type-badge v-for="t in data.DEX[name].types" :key="t" :type="t" />
                  </div>
                </div>
                <div class="ability-badge">特性：{{ abilityOfPokemon(name) }}</div>
                <div class="selected-actions" style="margin-top:8px">
                  <button class="mini-btn" :disabled="confirmed || i === 0" @click="finalReorder(i, i - 1)">↑</button>
                  <button class="mini-btn" :disabled="confirmed || i === chosen.length - 1" @click="finalReorder(i, i + 1)">↓</button>
                  <button class="mini-btn" @click="openModal('details', { name })">詳細</button>
                  <button class="mini-btn danger" :disabled="confirmed" @click="finalRemove(i)">外す</button>
                </div>
              </div>
            </div>
            <div v-if="!chosen.length" class="small">まだ未選択です</div>
          </div>

          <button
            v-if="chosen.length === 3 && !confirmed"
            class="primary"
            style="margin-top:12px;width:100%"
            @click="finalConfirm"
          >プレイヤー{{ side }}の最終選出確定</button>
          <div v-if="confirmed" class="message-box" style="margin-top:12px">確定済み。相手の選出完了を待っています。</div>
        </div>
      </div>

      <!-- 右：相手パーティ確認パネル -->
      <div class="panel selected-panel">
        <h2>相手パーティ確認</h2>
        <div class="small">相手の6体パーティとタイプ相性を見て、最終選出を決められます。</div>
        <div class="selected-info">
          <h4>プレイヤー{{ otherSide }}の6体パーティ</h4>
          <div class="final-party-grid">
            <div v-for="name in otherPool" :key="name" class="final-party-card">
              <div class="final-card-top">
                <div>
                  <div class="dex-name">
                    <sprite-img :mon="data.DEX[name]" cls="mini-sprite" />
                    {{ name }}
                  </div>
                  <div class="types">
                    <type-badge v-for="t in data.DEX[name].types" :key="t" :type="t" />
                  </div>
                  <div class="ability-badge">特性：{{ abilityOfPokemon(name) }}</div>
                </div>
              </div>
              <div class="dex-actions">
                <button class="mini-btn" @click="openModal('details', { name })">詳細</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `
});
