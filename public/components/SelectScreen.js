import { defineComponent, computed } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { store, enemy, abilityOfPokemon, effectiveness, effGroupLabel, openModal, api } from '../store.js';

export default defineComponent({
  name: 'SelectScreen',
  setup() {
    const game = computed(() => store.game);
    const data = computed(() => store.masterData);

    const side = computed(() => store.role === 'B' ? 'B' : 'A');
    const otherSide = computed(() => enemy(side.value));
    const picked = computed(() => game.value?.selected?.[side.value] || []);
    const confirmed = computed(() => game.value?.confirmed?.[side.value] || false);

    const allNames = computed(() => Object.keys(data.value?.DEX || {}));
    const filteredNames = computed(() => {
      const f = store.selectedTypeFilter;
      if (!f) return allNames.value;
      return allNames.value.filter(n => data.value.DEX[n].types.includes(f));
    });

    // タイプ一貫チェック
    const holes = computed(() => {
      const names = picked.value;
      if (!names.length || !data.value) return [];
      return Object.keys(data.value.TYPES).filter(atkType =>
        !names.some(n => effectiveness(atkType, data.value.DEX[n].types) <= 0.5)
      );
    });

    const recommendedRows = computed(() => {
      const h = holes.value;
      if (!h.length || !data.value) return [];
      return Object.keys(data.value.TYPES).map(defType => {
        const covers = h.filter(atkType => effectiveness(atkType, [defType]) <= 0.5);
        return { defType, covers };
      }).filter(r => r.covers.length > 1)
        .sort((a, b) => b.covers.length - a.covers.length);
    });

    function confirmPick() { api('/confirm', { side: side.value }); }
    function removePick(index) { api('/remove-pick', { side: side.value, index }); }
    function pickPokemon(name) { api('/pick', { side: side.value, name }); }

    return { store, game, data, side, otherSide, picked, confirmed, allNames, filteredNames, holes, recommendedRows, confirmPick, removePick, pickPokemon, openModal, abilityOfPokemon, effectiveness, effGroupLabel };
  },
  template: `
    <section v-if="!store.role" class="panel">
      <h2>最初に接続設定からプレイヤーA / Bを選んでください</h2>
      <button class="primary" style="margin-top:12px" @click="openModal('connectionSettings')">接続設定を開く</button>
    </section>

    <section v-else class="select-screen">
      <!-- 左：図鑑パネル -->
      <div class="panel dex-panel">
        <h2>プレイヤー{{ side }}：自分の3体を選択</h2>
        <div class="small">相手の選出確定状況：{{ game.confirmed[otherSide] ? '確定済み' : '選択中' }}</div>

        <!-- タイプフィルター -->
        <div class="dex-toolbar">
          <div class="dex-filter-summary">
            <span>タイプ検索：{{ store.selectedTypeFilter || 'すべて' }}（{{ filteredNames.length }}/{{ allNames.length }}）</span>
            <button v-if="store.selectedTypeFilter" class="mini-btn" @click="store.selectedTypeFilter = ''">検索解除</button>
          </div>
          <div class="type-filter-row">
            <button
              class="type-filter-btn all"
              :class="{ active: !store.selectedTypeFilter }"
              @click="store.selectedTypeFilter = ''"
            >すべて</button>
            <button
              v-for="(td, tn) in data.TYPES"
              :key="tn"
              class="type-filter-btn"
              :class="{ active: store.selectedTypeFilter === tn }"
              :style="{ background: td.color }"
              @click="store.selectedTypeFilter = tn"
            >{{ tn }}</button>
          </div>
        </div>

        <!-- 図鑑グリッド -->
        <div class="dex-grid">
          <div v-for="name in filteredNames" :key="name" class="dex-card">
            <div class="dex-top">
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
              <sprite-img :mon="data.DEX[name]" cls="dex-sprite" />
            </div>
            <div class="dex-actions">
              <button @click="openModal('details', { name })">詳細</button>
              <button
                class="primary"
                :disabled="confirmed || picked.includes(name) || picked.length >= 3"
                @click="pickPokemon(name)"
              >選ぶ</button>
            </div>
          </div>
          <div v-if="!filteredNames.length" class="coverage-empty">該当するポケモンがいません。</div>
        </div>
      </div>

      <!-- 右：選択済みパネル -->
      <div class="panel selected-panel">
        <h3>選択済み</h3>

        <!-- 選出状況 -->
        <div class="selected-info">
          <h4>選出状況</h4>
          <div>A：{{ game.confirmed.A ? '確定済み' : \`選択中（\${game.selected.A.length}/3）\` }}</div>
          <div>B：{{ game.confirmed.B ? '確定済み' : \`選択中（\${game.selected.B.length}/3）\` }}</div>
        </div>

        <!-- 選択済みリスト -->
        <div class="selected-list">
          <div v-for="(name, i) in picked" :key="name" class="selected-mon">
            <div class="selected-main">
              <div class="selected-row">
                <b>{{ i + 1 }}. <sprite-img :mon="data.DEX[name]" cls="mini-sprite" /> {{ name }}</b>
                <div class="types">
                  <type-badge v-for="t in data.DEX[name].types" :key="t" :type="t" />
                </div>
              </div>
              <div class="ability-badge">特性：{{ abilityOfPokemon(name) }}</div>
              <div class="selected-actions" style="margin-top:8px">
                <button class="mini-btn" @click="openModal('details', { name })">詳細</button>
                <button class="mini-btn danger" :disabled="confirmed" @click="removePick(i)">外す</button>
              </div>
            </div>
          </div>
          <div v-if="!picked.length" class="small">まだ未選択です</div>
        </div>

        <!-- タイプ一貫 -->
        <div class="selected-info" v-if="picked.length">
          <h4>一貫タイプ（半減以下で受けられないタイプ）</h4>
          <div class="small">全タイプを対象に、パーティ内に半減以下で受けられるポケモンが1体もいない攻撃タイプです。</div>
          <div class="coverage-list" style="margin-top:8px">
            <type-badge v-for="t in holes" :key="t" :type="t" />
            <span v-if="!holes.length" class="coverage-empty">なし</span>
          </div>
          <template v-if="recommendedRows.length">
            <h4 style="margin-top:12px">おすすめタイプ</h4>
            <div class="small">一貫タイプを半減以下で受けられるタイプ（2タイプ以上に対応）</div>
            <div class="recommend-type-list">
              <div v-for="row in recommendedRows" :key="row.defType" class="recommend-type-row">
                <div class="recommend-type-head">
                  <type-badge :type="row.defType" />
                  <span>{{ row.covers.length }}タイプを半減以下</span>
                </div>
                <div class="recommend-type-covers">
                  <span>受けられる一貫タイプ：</span>
                  <type-badge v-for="t in row.covers" :key="t" :type="t" />
                </div>
              </div>
            </div>
          </template>
        </div>

        <button
          v-if="picked.length === 3 && !confirmed"
          class="primary"
          style="margin-top:12px;width:100%"
          @click="confirmPick"
        >プレイヤー{{ side }}の選択確定</button>
        <div v-if="confirmed" class="message-box" style="margin-top:12px">確定済み。相手の選出完了を待っています。</div>
      </div>
    </section>
  `
});
