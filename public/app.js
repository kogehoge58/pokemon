import { createApp, computed } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { store, openModal, api, loadData, loadState } from './store.js';
import SelectScreen from './components/SelectScreen.js';
import FinalScreen from './components/FinalScreen.js';
import BattleScreen from './components/BattleScreen.js';
import ModalLayer from './components/ModalLayer.js';

const app = createApp({
  setup() {
    const game = computed(() => store.game);
    const mode = computed(() => game.value?.mode || '');
    const rolePill = computed(() => {
      if (!store.role) return 'あなたは未選択です';
      return `あなたはプレイヤー${store.role}です`;
    });

    return { store, game, mode, rolePill, openModal, api };
  },
  template: `
    <div class="app">
      <!-- ヘッダー -->
      <header>
        <div>
          <h1>簡易ポケモンバトル</h1>
          <div class="small">3体選出 / タイプ相性 / 種族値ベース / 交換あり / アイテムなし</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;align-items:center">
          <button @click="openModal('typeChart')">タイプ相性</button>
          <button @click="openModal('connectionSettings')">接続設定</button>
          <span class="role-pill">{{ rolePill }}</span>
          <button class="primary" @click="api('/reset', {})">リセット</button>
        </div>
      </header>

      <!-- ローディング -->
      <div v-if="!store.masterData" class="loading-lock">
        <div class="loading-card">
          <div class="loading-spinner"></div>
          <div>データ読み込み中...</div>
        </div>
      </div>

      <!-- メインコンテンツ -->
      <main v-if="store.masterData && game">
        <select-screen v-if="mode === 'select'" />
        <final-screen v-else-if="mode === 'final'" />
        <battle-screen v-else-if="mode === 'battle'" />
        <div v-else class="panel" style="text-align:center;padding:40px">
          <div class="loading-spinner" style="margin-bottom:12px"></div>
          <div>ゲーム読み込み中...</div>
        </div>
      </main>

      <!-- モーダルレイヤー -->
      <modal-layer v-if="store.masterData" />
    </div>
  `
});

// --- グローバルコンポーネント登録 ---

// スプライト画像
app.component('sprite-img', {
  props: {
    mon: Object,
    cls: { type: String, default: 'sprite' },
    fainted: { type: Boolean, default: false },
  },
  setup(props) {
    function getUrl() {
      if (!props.mon) return '';
      if (props.fainted) {
        return props.mon.staticSpriteUrl || props.mon.spriteUrl || '';
      }
      return props.mon.spriteUrl || '';
    }
    function getFallback() {
      return (props.mon?.spriteEmoji || props.mon?.sprite) || '？';
    }
    return { getUrl, getFallback };
  },
  template: `
    <span :class="cls">
      <img
        v-if="getUrl()"
        :src="getUrl()"
        :alt="getFallback()"
        @error="$event.target.replaceWith(document.createTextNode(getFallback()))"
      />
      <template v-else>{{ getFallback() }}</template>
    </span>
  `
});

// タイプバッジ
app.component('type-badge', {
  props: { type: String },
  setup(props) {
    const color = computed(() => store.masterData?.TYPES?.[props.type]?.color || '#888');
    return { color };
  },
  template: `<span class="type" :style="{ background: color }">{{ type }}</span>`
});

app.component('SelectScreen', SelectScreen);
app.component('FinalScreen', FinalScreen);
app.component('BattleScreen', BattleScreen);
app.component('ModalLayer', ModalLayer);

app.mount('#app');

loadData().then(() => loadState());
