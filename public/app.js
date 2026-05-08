import { createApp, computed, ref } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { store, openModal, api, loadData, loadState, fetchParties, setUserName, playBgm } from './store.js';
import SelectScreen from './components/SelectScreen.js';
import BattleScreen from './components/BattleScreen.js';
import ModalLayer from './components/ModalLayer.js';
import PartyScreen from './components/PartyScreen.js';

const VALID_USERS = ['ひびき', 'くさの', 'かいと'];

const app = createApp({
  setup() {
    const game = computed(() => store.game);
    const mode = computed(() => game.value?.mode || '');

    // ログイン中ユーザーのエントリー状況（'A'/'B'/''）
    const entryStatus = computed(() => {
      const g = game.value;
      if (!g || !store.userName) return '';
      if (g.entries?.A === store.userName) return 'A';
      if (g.entries?.B === store.userName) return 'B';
      return '';
    });

    function openEntryOrLogin() {
      openModal(store.userName ? 'entry' : 'login');
    }

    function doLogin(name) {
      setUserName(name);
      store.showPartyScreen = true;
      playBgm('ポケモンセンター.mp3');
    }

    return { store, game, mode, entryStatus, openModal, openEntryOrLogin, doLogin, api, VALID_USERS };
  },
  template: `
    <div class="app">
      <!-- ヘッダー（ログイン済みのときのみ表示） -->
      <header v-if="store.userName">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="header-title">⚔️ ポケモンバトル</div>
          <span class="header-login-label">{{ store.userName }}でログイン中</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;align-items:center">
          <button @click="openModal('typeChart')">辞書</button>
          <template v-if="store.showPartyScreen">
            <button :class="entryStatus ? 'primary command-selected' : 'primary'" @click="openEntryOrLogin()">{{ entryStatus ? 'P' + entryStatus + ' エントリー中' : 'エントリー' }}</button>
          </template>
          <template v-if="mode !== 'battle' && mode !== 'pick' && !store.showPartyScreen">
            <button @click="store.showPartyScreen = true">パーティ登録</button>
          </template>
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

      <!-- ログイン画面 -->
      <div v-else-if="!store.userName" class="login-screen">
        <div class="login-card">
          <div class="login-title">🎮 ポケモンバトル</div>
          <div class="login-subtitle">ログインしてください</div>
          <div class="login-buttons">
            <button
              v-for="u in VALID_USERS" :key="u"
              class="primary login-btn"
              @click="doLogin(u)"
            >{{ u }}</button>
          </div>
        </div>
      </div>

      <!-- パーティ登録画面 -->
      <party-screen v-else-if="store.showPartyScreen" />

      <!-- メインコンテンツ -->
      <main v-else>
        <select-screen v-if="mode === 'pick'" />
        <battle-screen v-else-if="mode === 'battle'" />
        <div v-else class="panel" style="text-align:center;padding:60px 40px;color:#666">
          <div style="font-size:48px;margin-bottom:16px">⚔️</div>
          <div style="font-size:16px;font-weight:700;margin-bottom:8px">エントリーを待っています</div>
          <div class="small">ヘッダーの「エントリー」ボタンから着席してください</div>
        </div>
      </main>

      <!-- モーダルレイヤー -->
      <modal-layer v-if="store.masterData && store.userName" />

      <!-- 天候オーバーレイ -->
      <div v-if="mode === 'battle' && game?.weather?.type"
           :class="'weather-overlay weather-' + game.weather.type"></div>

      <!-- バトル開始演出オーバーレイ -->
      <div v-if="store.battleStartAnim" class="battle-start-overlay">
        <div class="battle-start-bg-lines"></div>
        <div class="battle-start-content">
          <div class="battle-start-players">
            <span class="battle-start-player-name">{{ store.game?.entries?.A || '？' }}</span>
            <span class="battle-start-vs-badge">VS</span>
            <span class="battle-start-player-name">{{ store.game?.entries?.B || '？' }}</span>
          </div>
          <div class="battle-start-divider"></div>
          <div class="battle-start-main-text">バトル開始！</div>
        </div>
      </div>
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
    substitute: { type: Boolean, default: false },
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
app.component('BattleScreen', BattleScreen);
app.component('ModalLayer', ModalLayer);
app.component('PartyScreen', PartyScreen);

app.mount('#app');

loadData().then(() => {
  loadState();
  fetchParties();
});
