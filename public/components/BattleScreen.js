import { defineComponent, computed } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { store, enemy, abilityOfPokemon, effectiveness, effText, hpClass, displayedActiveIndex, displayedHp, openModal, api } from '../store.js';

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
    const ownWaiting = computed(() => {
      const g = game.value;
      return !!(g?.forceSwitch && g.forceSwitch !== role.value);
    });
    const selectedCmd = computed(() => {
      if (role.value !== 'A' && role.value !== 'B') return null;
      return game.value?.commands?.[role.value] || null;
    });

    function battleBadge(s) {
      const g = game.value;
      if (!g) return '';
      if (g.winner) return g.winner === 'draw' ? '引き分け' : (g.winner === s ? '勝利' : '敗北');
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

    function statArrows(p, key) {
      const stage = p.statStages?.[key] || 0;
      if (stage > 0) return { dir: 'up', count: stage };
      if (stage < 0) return { dir: 'down', count: Math.abs(stage) };
      return null;
    }

    function statVal(p, key) {
      const stage = p.statStages?.[key] || 0;
      if (stage !== 0) return null;
      return (p.displayStats?.[key] ?? p.baseStats?.[key] ?? p.stats?.[key]);
    }

    function movePanelStyle(type) {
      const color = data.value?.TYPES?.[type]?.color || '#4776ff';
      return `--move-color:${color};background:${color};color:white`;
    }

    function moveEffText(moveName, targetTypes) {
      const m = data.value?.MOVES?.[moveName];
      if (!m) return '';
      return effText(effectiveness(m.type, targetTypes));
    }

    function isSelectedFight() { return selectedCmd.value?.type === 'move'; }
    function isSelectedSwitch() { return selectedCmd.value?.type === 'switch'; }
    function isSelectedSurrender() { return selectedCmd.value?.type === 'surrender'; }

    const STAT_KEYS = [['atk','攻撃'],['def','防御'],['spa','特攻'],['spd','特防'],['spe','素早さ'],['hp','HP']];

    return {
      store, game, data, role, battleMessage, stabWeakTypes, isDisabled, commandChosen, ownWaiting, selectedCmd,
      battleBadge, canSeePartyMon, isFaintVisualReady, animClass, resultClass, stampTone, stampText,
      getShownHp, getActivePokemon, getActiveIndex, statArrows, statVal, movePanelStyle, moveEffText,
      isSelectedFight, isSelectedSwitch, isSelectedSurrender,
      STAT_KEYS, enemy, abilityOfPokemon, hpClass, openModal, api, effectiveness, effText,
      displayedActiveIndex, displayedHp
    };
  },
  template: `
    <template v-if="game">
      <!-- バトルフィールド -->
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
                  <div class="ability-badge">特性：{{ getActivePokemon(s).ability || abilityOfPokemon(getActivePokemon(s).name) }}</div>
                </div>
                <sprite-img
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
              <div v-if="store.localBurstMove[s] || store.localBurstAbility[s]" class="move-burst">
                <div v-if="store.localBurstMove[s]">{{ store.localBurstMove[s] }}</div>
                <div v-if="store.localBurstAbility[s]" class="move-burst-ability">{{ store.localBurstAbility[s] }}</div>
              </div>

              <!-- スタッツ -->
              <div class="stats">
                <div v-for="[key, label] in STAT_KEYS" :key="key" class="stat">
                  {{ label }}<br>
                  <b v-if="statVal(getActivePokemon(s), key) !== null">{{ statVal(getActivePokemon(s), key) }}</b>
                  <span v-if="statArrows(getActivePokemon(s), key)?.dir === 'up'" class="stat-arrow-up">{{ '↑'.repeat(statArrows(getActivePokemon(s), key).count) }}</span>
                  <span v-if="statArrows(getActivePokemon(s), key)?.dir === 'down'" class="stat-arrow-down">{{ '↓'.repeat(statArrows(getActivePokemon(s), key).count) }}</span>
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
                  <div>{{ Math.max(0, displayedHp(s, i, m)) }}/{{ m.maxHp }}</div>
                  <button
                    style="margin-top:6px;padding:6px 8px"
                    @click="openModal('details', { name: m.name, isOpponent: (role === 'A' || role === 'B') ? s !== role : false })"
                  >詳細</button>
                </div>
              </template>
            </div>
          </template>
        </div>
      </section>

      <!-- コマンドパネル -->
      <section class="panel battle-compact-panel">
        <div class="battle-command-head">
          <div>
            <div v-if="battleMessage" class="message-box">{{ battleMessage }}</div>
            <div v-if="store.playingEffects" class="busy-note">演出中...</div>
          </div>

          <!-- STAB 弱点通知 -->
          <template v-if="stabWeakTypes !== null">
            <div v-if="!stabWeakTypes.length" class="battle-threat-note safe">
              {{ game.teams[role][displayedActiveIndex(role)]?.name }}は{{ game.teams[enemy(role)][displayedActiveIndex(enemy(role))]?.name }}のタイプ一致技でばつぐん以上をとられていません。
            </div>
            <div v-else class="battle-threat-note">
              {{ game.teams[role][displayedActiveIndex(role)]?.name }}は{{ game.teams[enemy(role)][displayedActiveIndex(enemy(role))]?.name }}の
              <span class="battle-threat-types">
                <type-badge v-for="t in stabWeakTypes" :key="t" :type="t" />
              </span>
              の技にタイプ一致でばつぐん以上をとられています。
            </div>
          </template>
        </div>

        <!-- アクションボタン -->
        <div class="battle-action-row">
          <template v-if="game.winner">
            <button class="primary" @click="api('/reset', {})">もう一度</button>
            <button @click="openModal('opponentParty')">相手のパーティ</button>
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
              @click="openModal(game.forceSwitch === role ? 'forceSwitch' : 'switch')"
            >{{ isSelectedSwitch() ? '✓ ' : '' }}こうかん</button>

            <button @click="openModal('opponentParty')">相手のパーティ</button>
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
    </template>
  `
});
