import { defineComponent, computed } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { store, enemy, effectiveness, openModal, api } from '../store.js';

export default defineComponent({
  name: 'SelectScreen',
  setup() {
    const game = computed(() => store.game);
    const data = computed(() => store.masterData);

    const side = computed(() => store.role === 'B' ? 'B' : 'A');
    const otherSide = computed(() => enemy(side.value));

    const myPool = computed(() => game.value?.pickPool?.[side.value] || []);
    const oppPool = computed(() => game.value?.pickPool?.[otherSide.value] || []);
    const picked = computed(() => game.value?.selected?.[side.value] || []);
    const confirmed = computed(() => game.value?.confirmed?.[side.value] || false);
    const oppConfirmed = computed(() => game.value?.confirmed?.[otherSide.value] || false);

    // タイプ一貫チェック
    const holes = computed(() => {
      const names = picked.value;
      if (!names.length || !data.value) return [];
      return Object.keys(data.value.TYPES).filter(atkType =>
        !names.some(n => effectiveness(atkType, data.value.DEX[n].types) <= 0.5)
      );
    });

    function confirmPick() { api('/confirm', { side: side.value }); }

    function togglePokemon(name) {
      if (confirmed.value) return;
      const idx = picked.value.indexOf(name);
      if (idx !== -1) {
        api('/remove-pick', { side: side.value, index: idx });
      } else if (picked.value.length < 3) {
        api('/pick', { side: side.value, name });
      }
    }

    return {
      store, game, data, side, otherSide,
      myPool, oppPool, picked, confirmed, oppConfirmed,
      holes,
      confirmPick, togglePokemon, openModal, effectiveness,
    };
  },
  template: `
    <!-- 選出フェーズ -->
    <section class="pick-screen">

      <!-- 相手の6体パネル -->
      <div class="panel pick-opp-panel">
        <h2>相手（プレイヤー{{ otherSide }}）の6体</h2>
        <div class="small" style="margin-bottom:10px">{{ game.entries[otherSide] || '相手' }}のパーティ</div>
        <div class="pick-opp-grid">
          <div v-for="name in oppPool" :key="name" class="pick-opp-card">
            <sprite-img :mon="data.DEX[name]" cls="mini-sprite" />
            <div class="pick-opp-name">{{ name }}</div>
            <div class="types" style="justify-content:center;margin-top:3px">
              <type-badge v-for="t in data.DEX[name].types" :key="t" :type="t" />
            </div>
            <button class="mini-btn" style="margin-top:4px" @click="openModal('details', { name, isOpponent: true })">詳細</button>
          </div>
        </div>
      </div>

      <!-- 自分の選出パネル -->
      <div class="panel pick-mine-panel">
        <h2>プレイヤー{{ side }}（{{ game.entries[side] || store.userName }}）の選出</h2>

        <!-- 選出状況 -->
        <div class="pick-status-row">
          <span>A：{{ game.confirmed.A ? '✓ 確定済み' : \`選択中（\${game.selected.A.length}/3）\` }}</span>
          <span>B：{{ game.confirmed.B ? '✓ 確定済み' : \`選択中（\${game.selected.B.length}/3）\` }}</span>
        </div>

        <!-- 自分の6体（タップで選択トグル） -->
        <h3 style="margin-top:14px;margin-bottom:8px">自分の6体から選ぶ（{{ picked.length }}/3）</h3>
        <div class="pick-pool-list">
          <div
            v-for="name in myPool" :key="name"
            class="pick-pool-card"
            :class="{ picked: picked.includes(name), 'pick-full': !picked.includes(name) && picked.length >= 3, 'pick-confirmed': confirmed }"
            @click="togglePokemon(name)"
          >
            <div class="pick-pool-main">
              <sprite-img :mon="data.DEX[name]" cls="mini-sprite" />
              <div>
                <div class="pick-pool-name">{{ name }}</div>
                <div class="types">
                  <type-badge v-for="t in data.DEX[name].types" :key="t" :type="t" />
                </div>
              </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <button class="mini-btn" @click.stop="openModal('details', { name, item: data.ITEM_BY_POKEMON?.[name] })">詳細</button>
              <span v-if="picked.includes(name)" class="pick-order-badge">{{ picked.indexOf(name) + 1 }}番手</span>
              <span v-else-if="picked.length < 3 && !confirmed" class="pick-hint">タップで選択</span>
            </div>
          </div>
        </div>

        <!-- タイプ一貫 -->
        <div v-if="picked.length" class="selected-info" style="margin-top:12px">
          <h4>一貫タイプ</h4>
          <div class="coverage-list">
            <type-badge v-for="t in holes" :key="t" :type="t" />
            <span v-if="!holes.length" class="coverage-empty">なし</span>
          </div>
        </div>

        <!-- 確定ボタン -->
        <button
          v-if="picked.length === 3 && !confirmed"
          class="primary"
          style="margin-top:14px;width:100%"
          @click="confirmPick"
        >プレイヤー{{ side }}の選出確定</button>
        <div v-if="confirmed" class="message-box" style="margin-top:12px">確定済み。{{ oppConfirmed ? 'バトル開始します！' : '相手の選出完了を待っています。' }}</div>
      </div>
    </section>
  `
});
