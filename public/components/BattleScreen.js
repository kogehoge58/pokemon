import { defineComponent, computed } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { store, enemy, abilityOfPokemon, effectiveness, effText, hpClass, displayedActiveIndex, displayedHp, displayedSubstituteHp, displayedStatus, displayedStatStages, displayedYawnCounter, displayedTaunt, displayedEncore, displayedConfusion, displayedHazards, displayedWeather, displayedItemUsed, displayedItem, displayedPerishSong, openModal, api } from '../store.js';

export default defineComponent({
  name: 'BattleScreen',
  setup() {
    const game = computed(() => store.game);
    const data = computed(() => store.masterData);
    const role = computed(() => store.role);

    const battleMessage = computed(() => {
      if (store.localEffectMessage) return store.localEffectMessage;
      const g = game.value;
      if ((role.value === 'A' || role.value === 'B') && g && g.mode === 'battle' && !g.winner && !store.playingEffects && !g.forceSwitch) {
        const me = role.value, other = enemy(me);
        if (!g.commands[me] && g.commands[other]) return `プレイヤー${other}は選択済み。あなたの選択待ちです。`;
        if (g.commands[me] && !g.commands[other]) return `プレイヤー${me}は選択済み。相手の選択待ちです。`;
      }
      return g?.message || '';
    });

    const stabWeakTypes = computed(() => {
      const g = game.value;
      const d = data.value;
      if (!g || g.winner || store.playingEffects || (role.value !== 'A' && role.value !== 'B')) return null;
      const ownSide = role.value;
      const oppSide = enemy(ownSide);
      const ownIndex = displayedActiveIndex(ownSide);
      const oppIndex = displayedActiveIndex(oppSide);
      const own = g.teams[ownSide]?.[ownIndex];
      const opp = g.teams[oppSide]?.[oppIndex];
      if (!own || !opp || !d) return null;
      return [...new Set(
        opp.moves
          .map(mn => d.MOVES[mn])
          .filter(m => m && opp.types.includes(m.type) && effectiveness(m.type, own.types) >= 2)
          .map(m => m.type)
      )];
    });

    const isDisabled = computed(() => (role.value !== 'A' && role.value !== 'B') || store.playingEffects);
    const commandChosen = computed(() => {
      if (role.value !== 'A' && role.value !== 'B') return false;
      return !!game.value?.commands?.[role.value];
    });
    // 充電中の技（ソーラービーム等）
    const chargingMyMove = computed(() => {
      if (role.value !== 'A' && role.value !== 'B') return null;
      const g = game.value;
      if (!g) return null;
      return g.teams?.[role.value]?.[g.active?.[role.value]]?.chargingMove || null;
    });
    const ownWaiting = computed(() => {
      const g = game.value;
      // 'AB'（両者同時気絶）は両プレイヤーが同時選択なので「待ち」ではない
      if (!g?.forceSwitch || g.forceSwitch === 'AB') return false;
      return g.forceSwitch !== role.value;
    });
    const selectedCmd = computed(() => {
      if (role.value !== 'A' && role.value !== 'B') return null;
      return game.value?.commands?.[role.value] || null;
    });

    function battleBadge(s) {
      const g = game.value;
      if (!g) return '';
      if (g.winner) return g.winner === 'draw' ? '引き分け' : (g.winner === s ? '勝利' : '敗北');
      if (g.forceSwitch === 'AB') return '交代選択中';
      if (g.forceSwitch === s) return '交代選択中';
      if (g.forceSwitch) return '相手交代待ち';
      return g.commands[s] ? '選択済み' : '選択中';
    }

    function canSeePartyMon(side, index) {
      if (role.value === side) return true;
      return !!(game.value?.revealed?.[side]?.[index]);
    }

    function isFaintVisualReady(side, index, pokemon) {
      return pokemon.fainted && store.faintVisualReady[`${side}:${index}`] !== false;
    }

    function animClass(side) {
      const a = store.localAnim;
      return (a && a.side === side) ? a.type : '';
    }

    function resultClass(side) {
      const g = game.value;
      if (!g?.winner || !store.resultStampVisible || store.playingEffects) return '';
      if (g.winner === 'draw') return 'result-draw';
      return g.winner === side ? 'result-win' : 'result-lose';
    }

    function stampTone(side) {
      const g = game.value;
      if (g?.winner === 'draw') return 'draw';
      return g?.winner === side ? 'win' : 'lose';
    }

    function stampText(side) {
      const g = game.value;
      if (g?.winner === 'draw') return '引き分け';
      return g?.winner === side ? '勝ち' : '負け';
    }

    function getShownHp(side, index) {
      const pokemon = game.value?.teams?.[side]?.[index];
      if (!pokemon) return 0;
      return displayedHp(side, index, pokemon);
    }

    function getActivePokemon(side) {
      const idx = displayedActiveIndex(side);
      return game.value?.teams?.[side]?.[idx];
    }

    function getActiveIndex(side) {
      return displayedActiveIndex(side);
    }

    function statArrows(side, index, key) {
      const stages = displayedStatStages(side, index, game.value?.teams?.[side]?.[index]);
      const stage = stages?.[key] || 0;
      if (stage > 0) return { dir: 'up', count: stage };
      if (stage < 0) return { dir: 'down', count: Math.abs(stage) };
      return null;
    }

    function statVal(p, key) {
      return (p.baseStats?.[key] ?? p.stats?.[key]);
    }

    const STATUS_LABELS = { brn: 'やけど', par: 'まひ', psn: 'どく', tox: 'もうどく', slp: 'ねむり', frz: 'こおり' };
    function statusLabel(s) { return STATUS_LABELS[s] || s; }

    function movePanelStyle(type) {
      const color = data.value?.TYPES?.[type]?.color || '#4776ff';
      return `--move-color:${color};background:${color};color:white`;
    }

    function burstStyle(s) {
      const moveName = store.localBurstMove[s];
      if (!moveName || !data.value?.MOVES?.[moveName]) return '';
      const type = data.value.MOVES[moveName].type;
      if (!type) return '';
      const color = data.value?.TYPES?.[type]?.color;
      if (!color) return '';
      return `background:${color};border-color:rgba(0,0,0,.15);color:white`;
    }

    function moveEffText(moveName, targetTypes) {
      const m = data.value?.MOVES?.[moveName];
      if (!m) return '';
      return effText(effectiveness(m.type, targetTypes));
    }

    function isSelectedFight() { return selectedCmd.value?.type === 'move'; }
    function isSelectedSwitch() { return selectedCmd.value?.type === 'switch'; }
    function isSelectedSurrender() { return selectedCmd.value?.type === 'surrender'; }

    const STAT_KEYS = [['hp','HP'],['atk','攻撃'],['def','防御'],['spa','特攻'],['spd','特防'],['spe','素早さ']];

    return {
      store, game, data, role, battleMessage, stabWeakTypes, isDisabled, commandChosen, chargingMyMove, ownWaiting, selectedCmd,
      battleBadge, canSeePartyMon, isFaintVisualReady, animClass, resultClass, stampTone, stampText,
      getShownHp, getActivePokemon, getActiveIndex, statArrows, statVal, statusLabel, movePanelStyle, moveEffText, burstStyle,
      isSelectedFight, isSelectedSwitch, isSelectedSurrender,
      STAT_KEYS, enemy, abilityOfPokemon, hpClass, openModal, api, effectiveness, effText, displayedPerishSong,
      displayedActiveIndex, displayedHp, displayedSubstituteHp, displayedStatus,
      displayedStatStages, displayedYawnCounter, displayedTaunt, displayedEncore, displayedConfusion, displayedHazards, displayedWeather, displayedItemUsed, displayedItem
    };
  },
  template: `
    <div v-if="game" class="battle-root">

      <!-- 天候・設置技ステータスバー（最上部・3カラム） -->
      <div class="battle-status-bar panel">

        <!-- 左：プレイヤーA設置技 -->
        <div class="battle-status-col left">
          <template v-if="displayedHazards('A').stealthRock || displayedHazards('A').spikes > 0 || displayedHazards('A').stickyWeb">
            <span v-if="displayedHazards('A').stealthRock" class="hazard-tag" style="background:#afa981">ステルスロック</span>
            <span v-if="displayedHazards('A').spikes > 0" class="hazard-tag">まきびし×{{ displayedHazards('A').spikes }}</span>
            <span v-if="displayedHazards('A').stickyWeb" class="hazard-tag" style="background:#91a119">ねばねばネット</span>
          </template>
          <span v-else class="battle-status-empty">—</span>
        </div>

        <!-- 中央：天候・トリックルーム（両者共通） -->
        <div class="battle-status-col center">
          <div v-if="displayedWeather()?.type" class="battle-weather-badge" :class="'weather-' + displayedWeather().type">
            {{ { sun:'☀ 晴れ', rain:'🌧 雨', sand:'🌪 砂嵐', hail:'❄ あられ' }[displayedWeather().type] || displayedWeather().type }}
            <span v-if="displayedWeather().turns > 0" class="weather-turns">残り{{ displayedWeather().turns }}ターン</span>
          </div>
          <div v-if="(store.localTrickRoomOverride ?? game.trickRoom) > 0" class="battle-weather-badge" style="background:linear-gradient(135deg,#9c59d1,#6a1fa0)">
            🔀 トリックルーム <span class="weather-turns">残り{{ store.localTrickRoomOverride ?? game.trickRoom }}T</span>
          </div>
          <span v-if="!displayedWeather()?.type && !(store.localTrickRoomOverride ?? game.trickRoom)" class="battle-status-empty">—</span>
        </div>

        <!-- 右：プレイヤーB設置技 -->
        <div class="battle-status-col right">
          <template v-if="displayedHazards('B').stealthRock || displayedHazards('B').spikes > 0 || displayedHazards('B').stickyWeb">
            <span v-if="displayedHazards('B').stealthRock" class="hazard-tag" style="background:#afa981">ステルスロック</span>
            <span v-if="displayedHazards('B').spikes > 0" class="hazard-tag">まきびし×{{ displayedHazards('B').spikes }}</span>
            <span v-if="displayedHazards('B').stickyWeb" class="hazard-tag" style="background:#91a119">ねばねばネット</span>
          </template>
          <span v-else class="battle-status-empty">—</span>
        </div>

      </div>

      <!-- バトルフィールド: A | B 横並び -->
      <section class="battlefield">
        <div v-for="s in ['A', 'B']" :key="s" class="side" :class="s.toLowerCase()">
          <template v-if="getActivePokemon(s)">
            <div class="trainer">
              <h2>プレイヤー{{ s }}</h2>
              <span class="status-badge">{{ battleBadge(s) }}</span>
            </div>
            <div
              class="pokemon-card"
              :class="[animClass(s), resultClass(s), isFaintVisualReady(s, getActiveIndex(s), getActivePokemon(s)) ? 'active-fainted' : '']"
            >
              <!-- 結果スタンプ -->
              <div
                v-if="game.winner && store.resultStampVisible && !store.playingEffects"
                class="result-stamp"
                :class="[stampTone(s)]"
              >{{ stampText(s) }}</div>

              <!-- エフェクトタグ -->
              <div v-if="store.localEffectTags[s]?.length" class="battle-effect-tags">
                <div
                  v-for="(tag, ti) in store.localEffectTags[s]"
                  :key="ti"
                  class="battle-effect-tag"
                  :class="tag.tone || ''"
                >
                  {{ tag.text }}
                  <span v-if="tag.damage !== undefined" class="battle-effect-damage">{{ tag.damage }}ダメージ</span>
                </div>
              </div>

              <!-- ポケモン情報 -->
              <div class="poke-top">
                <div>
                  <div class="poke-name">{{ getActivePokemon(s).name }}</div>
                  <div class="types">
                    <type-badge v-for="t in getActivePokemon(s).types" :key="t" :type="t" />
                  </div>
                  <!-- 特性は常に表示、持ち物は自分側のみ ※消耗品はitemUsed=trueで非表示・はたきおとすでitem=nullで自動消える -->
                  <div class="ability-badge">特性：{{ getActivePokemon(s).ability || abilityOfPokemon(getActivePokemon(s).name) }}</div>
                  <template v-if="role !== 'A' && role !== 'B' || s === role">
                    <div v-if="displayedItem(s, getActiveIndex(s), getActivePokemon(s)) && !displayedItemUsed(s, getActiveIndex(s), getActivePokemon(s))" class="item-badge">持ち物：{{ displayedItem(s, getActiveIndex(s), getActivePokemon(s)) }}</div>
                  </template>
                  <div v-if="displayedStatus(s, getActiveIndex(s), getActivePokemon(s)) && !isFaintVisualReady(s, getActiveIndex(s), getActivePokemon(s))" class="poke-status-badge" :class="'status-' + displayedStatus(s, getActiveIndex(s), getActivePokemon(s))">
                    {{ statusLabel(displayedStatus(s, getActiveIndex(s), getActivePokemon(s))) }}
                  </div>
                  <div v-if="displayedYawnCounter(s, getActiveIndex(s), getActivePokemon(s)) > 0 && !isFaintVisualReady(s, getActiveIndex(s), getActivePokemon(s))" class="poke-status-badge status-slp">
                    ねむけ
                  </div>
                  <div v-if="displayedTaunt(s, getActiveIndex(s), getActivePokemon(s)) > 0 && !isFaintVisualReady(s, getActiveIndex(s), getActivePokemon(s))" class="poke-status-badge status-taunt">
                    ちょうはつ {{ displayedTaunt(s, getActiveIndex(s), getActivePokemon(s)) }}
                  </div>
                  <div v-if="displayedEncore(s, getActiveIndex(s), getActivePokemon(s)) > 0 && !isFaintVisualReady(s, getActiveIndex(s), getActivePokemon(s))" class="poke-status-badge" style="background:#e67e22">
                    アンコール {{ displayedEncore(s, getActiveIndex(s), getActivePokemon(s)) }}
                  </div>
                  <div v-if="displayedConfusion(s, getActiveIndex(s), getActivePokemon(s)) && !isFaintVisualReady(s, getActiveIndex(s), getActivePokemon(s))" class="poke-status-badge" style="background:#9b59b6">
                    こんらん
                  </div>
                  <div v-if="getActivePokemon(s)?.destinyBond && !isFaintVisualReady(s, getActiveIndex(s), getActivePokemon(s))" class="poke-status-badge" style="background:#6b5bff">みちづれ</div>
                  <div v-if="displayedPerishSong(s, getActiveIndex(s), getActivePokemon(s)) > 0 && !isFaintVisualReady(s, getActiveIndex(s), getActivePokemon(s))" class="poke-status-badge" style="background:#7a0000">ほろび {{ displayedPerishSong(s, getActiveIndex(s), getActivePokemon(s)) }}</div>
                  <!-- みがわりHP表示 -->
                  <div v-if="displayedSubstituteHp(s, getActiveIndex(s), getActivePokemon(s)) > 0" class="substitute-badge">みがわりHP:{{ displayedSubstituteHp(s, getActiveIndex(s), getActivePokemon(s)) }}</div>
                </div>
                <!-- みがわり中はみがわり画像を表示 -->
                <template v-if="displayedSubstituteHp(s, getActiveIndex(s), getActivePokemon(s)) > 0 && !isFaintVisualReady(s, getActiveIndex(s), getActivePokemon(s))">
                  <span class="sprite substitute-sprite">
                    <img src="https://play.pokemonshowdown.com/sprites/gen5ani/substitute.gif" alt="みがわり" style="width:96px;height:96px;object-fit:contain" />
                  </span>
                </template>
                <sprite-img
                  v-else
                  :mon="getActivePokemon(s)"
                  cls="sprite"
                  :fainted="isFaintVisualReady(s, getActiveIndex(s), getActivePokemon(s))"
                />
              </div>

              <!-- HP バー -->
              <div class="hp-label">
                <span>HP</span>
                <span>{{ Math.max(0, getShownHp(s, getActiveIndex(s))) }} / {{ getActivePokemon(s).maxHp }}</span>
              </div>
              <div class="hpbar">
                <div
                  class="hpfill"
                  :class="hpClass(Math.max(0, Math.round(getShownHp(s, getActiveIndex(s)) / getActivePokemon(s).maxHp * 100)))"
                  :style="{ width: Math.max(0, Math.round(getShownHp(s, getActiveIndex(s)) / getActivePokemon(s).maxHp * 100)) + '%' }"
                ></div>
              </div>

              <!-- ムーブバースト -->
              <div v-if="store.localBurstMove[s]" class="move-burst" :style="burstStyle(s)">
                <div>{{ store.localBurstMove[s] }}</div>
              </div>

              <!-- スタッツ -->
              <div class="stats">
                <div v-for="[key, label] in STAT_KEYS" :key="key" class="stat">
                  {{ label }}<br>
                  <b>{{ statVal(getActivePokemon(s), key) }}</b><span v-if="statArrows(s, getActiveIndex(s), key)?.dir === 'up'" class="stat-arrow-up">{{ '↑'.repeat(statArrows(s, getActiveIndex(s), key).count) }}</span><span v-if="statArrows(s, getActiveIndex(s), key)?.dir === 'down'" class="stat-arrow-down">{{ '↓'.repeat(statArrows(s, getActiveIndex(s), key).count) }}</span>
                </div>
              </div>
            </div>

            <!-- パーティ -->
            <div class="party">
              <template v-for="(m, i) in game.teams[s]" :key="i">
                <div v-if="!canSeePartyMon(s, i)" class="party-mon hidden">
                  <div>？</div>
                  <div class="small">未公開</div>
                </div>
                <div v-else class="party-mon" :class="{ active: i === displayedActiveIndex(s), fainted: m.fainted }">
                  <div><sprite-img :mon="m" cls="mini-sprite" /> {{ m.name }}</div>
                  <div class="types" style="justify-content:center">
                    <type-badge v-for="t in m.types" :key="t" :type="t" />
                  </div>
                  <div class="party-hpbar">
                    <div class="hpfill" :class="hpClass(Math.max(0,Math.round(Math.max(0,displayedHp(s,i,m))/m.maxHp*100)))" :style="{width:Math.max(0,Math.round(Math.max(0,displayedHp(s,i,m))/m.maxHp*100))+'%'}"></div>
                  </div>
                  <div v-if="m.status && !m.fainted" class="party-status-badge" :class="'status-' + m.status">{{ statusLabel(m.status) }}</div>
                  <button
                    @click="openModal('details', { name: m.name, item: m.item, ability: m.ability, isOpponent: (role === 'A' || role === 'B') ? s !== role : false, pokemon: m })"
                  >詳細</button>
                </div>
              </template>
            </div>
          </template>
        </div>
      </section>

      <!-- コマンドパネル -->
      <section class="panel battle-compact-panel">
        <!-- アクションボタン -->
        <div class="battle-action-row">
          <template v-if="game.winner">
            <button class="primary" @click="api('/reset', {})">もう一度</button>
            <button @click="openModal('battleLog')">バトルログ</button>
          </template>
          <!-- 充電中（ソーラービーム等）：コマンド選択不可 -->
          <template v-else-if="chargingMyMove && !commandChosen">
            <div class="charging-wait-msg">☀️ 光を集めている... 次のターン発射！</div>
            <button @click="openModal('battleLog')">バトルログ</button>
          </template>
          <template v-else>
            <button
              class="primary"
              :class="{ 'command-selected': isSelectedFight() }"
              :disabled="isDisabled || !!game.forceSwitch"
              @click="openModal('fight')"
            >{{ isSelectedFight() ? '✓ ' : '' }}たたかう</button>

            <button
              :class="{ 'command-selected': isSelectedSwitch() }"
              :disabled="isDisabled || ownWaiting"
              @click="openModal(game.forceSwitch === role || game.forceSwitch === 'AB' ? 'forceSwitch' : 'pokemon')"
            >{{ isSelectedSwitch() ? '✓ ' : '' }}ポケモン</button>

            <button @click="openModal('battleLog')">バトルログ</button>

            <button
              class="danger"
              :class="{ 'command-selected': isSelectedSurrender() }"
              :disabled="isDisabled || commandChosen || !!game.forceSwitch"
              @click="openModal('confirmSurrender', { side: role })"
            >{{ isSelectedSurrender() ? '✓ ' : '' }}降参する</button>
          </template>
        </div>
      </section>
    </div>
  `
});
