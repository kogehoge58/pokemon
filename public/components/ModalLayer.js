import { defineComponent, computed, ref, watch, nextTick } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { store, enemy, abilityOfPokemon, effectiveness, effText, effGroupLabel, closeModal, closeStackModal, setRole, setUserName, api, enterGame, leaveGame } from '../store.js';

const VALID_USERS = ['ひびき', 'くさの', 'かいと'];

function defenseGroups(defTypes, data) {
  const labels = ['超ばつぐん','ばつぐん','いまひとつ','超いまひとつ','効果なし'];
  const groups = Object.fromEntries(labels.map(k => [k, []]));
  Object.keys(data.TYPES).forEach(atkType => {
    const lbl = effGroupLabel(effectiveness(atkType, defTypes));
    if (groups[lbl]) groups[lbl].push(atkType);
  });
  return Object.entries(groups).filter(([, ts]) => ts.length);
}

function attackGroups(atkType, data) {
  const labels = ['超ばつぐん','ばつぐん','いまひとつ','超いまひとつ','効果なし'];
  const groups = Object.fromEntries(labels.map(k => [k, []]));
  Object.keys(data.TYPES).forEach(defType => {
    const lbl = effGroupLabel(effectiveness(atkType, [defType]));
    if (groups[lbl]) groups[lbl].push(defType);
  });
  return Object.entries(groups).filter(([, ts]) => ts.length);
}

function adjustedMove(attacker, defender, move) {
  let power = move.power, accuracy = move.accuracy;
  let powerTone = '', accuracyTone = '';
  const hustle = attacker?.ability === 'はりきり' && move.category === '物理';
  const noGuard = attacker?.ability === 'ノーガード' || defender?.ability === 'ノーガード';
  if (hustle) { power = Math.round(power * 1.5); powerTone = 'up'; accuracy = Math.floor(accuracy * 0.8); accuracyTone = 'down'; }
  if (noGuard) { accuracy = 100; accuracyTone = move.accuracy === 100 ? '' : 'up'; }
  return { power, accuracy, powerTone, accuracyTone };
}

const STAT_LABELS = [['hp','HP'],['atk','攻撃'],['def','防御'],['spa','特攻'],['spd','特防'],['spe','素早さ']];

export default defineComponent({
  name: 'ModalLayer',
  setup() {
    const game = computed(() => store.game);
    const data = computed(() => store.masterData);
    const role = computed(() => store.role);

    // --- 詳細ヘルパー ---
    function getDefGroups(name) {
      const p = data.value?.DEX?.[name];
      if (!p) return [];
      return defenseGroups(p.types, data.value);
    }

    function currentOpponent() {
      const g = game.value;
      if (!g || g.mode !== 'battle' || (role.value !== 'A' && role.value !== 'B')) return null;
      const opp = enemy(role.value);
      return g.teams[opp]?.[g.active[opp]] || null;
    }

    function moveEffForDetail(moveName, target) {
      const m = data.value?.MOVES?.[moveName];
      if (!m || !target) return '';
      return effText(effectiveness(m.type, target.types));
    }

    // --- 説明モーダル（タブ）---
    const typeChartTab = computed(() => store.modalProps?.tab || 'typeChart');
    function setTypeChartTab(tab) { store.modalProps = { ...store.modalProps, tab }; }

    // --- タイプ相性 ---
    function selectTypeChart(t) { store.modalProps = { ...store.modalProps, selectedType: t }; }

    const typeChartSelected = computed(() => store.modalProps?.selectedType || '');

    const typeChartAtkGroups = computed(() => {
      const t = typeChartSelected.value;
      if (!t || !data.value) return [];
      return attackGroups(t, data.value);
    });

    const typeChartDefGroups = computed(() => {
      const t = typeChartSelected.value;
      if (!t || !data.value) return [];
      return defenseGroups([t], data.value);
    });

    const STATUS_INFO = [
      { key: 'brn',  name: 'やけど',   tone: 'status-brn', desc: 'ぶつりわざで与えるダメージが0.5倍になる。毎ターン最大HPの1/16ダメージを受ける。炎タイプには効かない。' },
      { key: 'par',  name: 'まひ',     tone: 'status-par', desc: '素早さが1/2になる。毎ターン12.5%の確率で行動不能になる。電気タイプには効かない。' },
      { key: 'psn',  name: 'どく',     tone: 'status-psn', desc: '毎ターン最大HPの1/8ダメージを受ける。毒・鋼タイプには効かない。' },
      { key: 'tox',  name: 'もうどく', tone: 'status-tox', desc: 'ターンごとにダメージが増加（1/16→2/16→3/16…）。交代するとどく扱いになり蓄積がリセットされる。' },
      { key: 'slp',  name: 'ねむり',   tone: 'status-slp', desc: '1ターン目は必ず眠る。2ターン目は1/3の確率で回復。3ターン目には必ず回復する。交代しても継続する。' },
      { key: 'frz',  name: 'こおり',   tone: 'status-frz', desc: '1〜2ターン目は25%の確率で自然解除。3ターン目には必ず解除される。炎技を受けると強制解除。氷タイプには効かない。' },
    ];

    const WEATHER_INFO = [
      { key: 'sunny', name: '晴れ（にほんばれ）', emoji: '☀️', desc: '炎タイプの技が1.5倍になる。水タイプの技が0.5倍になる。5ターン継続。' },
      { key: 'rain',  name: '雨（あまごい）',     emoji: '🌧️', desc: '水タイプの技が1.5倍になる。炎タイプの技が0.5倍になる。5ターン継続。' },
      { key: 'sand',  name: '砂嵐（すなあらし）', emoji: '🌪️', desc: '岩・鋼・地面タイプ以外のポケモンが毎ターン最大HPの1/16ダメージを受ける。岩タイプの特防が1.5倍になる。5ターン継続。' },
      { key: 'hail',  name: 'あられ',             emoji: '❄️', desc: '氷タイプ以外のポケモンが毎ターン最大HPの1/16ダメージを受ける。5ターン継続。' },
    ];

    // --- たたかう ---
    const fightPokemon = computed(() => {
      const g = game.value;
      if (!g || !role.value) return null;
      return g.teams[role.value]?.[g.active[role.value]] || null;
    });
    const fightTarget = computed(() => {
      const g = game.value;
      if (!g || !role.value) return null;
      const opp = enemy(role.value);
      return g.teams[opp]?.[g.active[opp]] || null;
    });
    const fightSelectedCmd = computed(() => game.value?.commands?.[role.value] || null);
    const fightLocked = computed(() => !!fightSelectedCmd.value);

    function fightMoveStyle(type) {
      const color = data.value?.TYPES?.[type]?.color || '#4776ff';
      return `--move-color:${color};background:${color};color:white`;
    }
    function fightAdj(mn) {
      const m = data.value?.MOVES?.[mn];
      return m ? adjustedMove(fightPokemon.value, fightTarget.value, m) : null;
    }
    function fightEff(mn) {
      const m = data.value?.MOVES?.[mn];
      if (!m || !fightTarget.value) return '';
      return effText(effectiveness(m.type, fightTarget.value.types));
    }
    function submitMove(mn) { closeModal(); api('/command', { side: role.value, cmd: { type: 'move', moveName: mn } }); }

    // --- たたかうのアンコール/こだわり判定 ---
    const encored = computed(() => fightPokemon.value?.encored || null);
    function isMoveDisabled(mn) {
      if (fightLocked.value) return true;
      if ((fightPokemon.value?.movePP?.[mn] ?? 1) <= 0) return true;
      if (encored.value && mn !== encored.value) return true;
      return false;
    }

    // --- トラップ判定（相手がかげふみ・じりょく・ありじごく） ---
    const isTrapped = computed(() => {
      const g = game.value;
      if (!g || !role.value) return false;
      const me = role.value;
      const myMon = g.teams[me]?.[g.active[me]];
      const opp = g.teams[me === 'A' ? 'B' : 'A']?.[g.active[me === 'A' ? 'B' : 'A']];
      if (!myMon || !opp || opp.fainted) return false;
      if (myMon.types?.includes('ゴースト')) return false;
      const oppAb = opp.ability;
      if (oppAb === 'かげふみ') return true;
      if (oppAb === 'ありじごく' && !myMon.types?.includes('ひこう') && myMon.ability !== 'ふゆう') return true;
      if (oppAb === 'じりょく' && myMon.types?.includes('はがね')) return true;
      return false;
    });

    // --- バトルログ開いた時にスクロール最下部へ / エントリーモーダルリセット ---
    watch(() => store.activeModal, (modal) => {
      if (modal === 'entry') {
        entryStep.value = 'main';
        entrySide.value = '';
      }
      if (modal === 'battleLog') {
        nextTick(() => {
          const logEl = document.querySelector('.log');
          if (logEl) logEl.scrollTop = logEl.scrollHeight;
        });
      }
    });

    // --- ログイン ---
    function doLogin(name) {
      setUserName(name);
      closeModal();
      store.showPartyScreen = true;
    }

    // --- エントリー ---
    const entryStep = ref('main'); // 'main' | 'party'
    const entrySide = ref('');

    const myParties = computed(() => {
      const u = store.parties?.[store.userName];
      return u?.parties || [{ name: 'パーティ1', pokemon: [] }, { name: 'パーティ2', pokemon: [] }, { name: 'パーティ3', pokemon: [] }];
    });

    const myEntryRole = computed(() => {
      const g = game.value;
      if (!g || !store.userName) return '';
      if (g.entries?.A === store.userName) return 'A';
      if (g.entries?.B === store.userName) return 'B';
      return '';
    });

    function canEnterSide(side) {
      const g = game.value;
      if (!g || g.mode !== 'entry') return false;
      const other = side === 'A' ? 'B' : 'A';
      if (g.entries[other] === store.userName) return false;
      if (g.entries[side] && g.entries[side] !== store.userName) return false;
      return true;
    }

    function startEntryPartySelect(side) {
      entrySide.value = side;
      entryStep.value = 'party';
    }

    async function doEntryWithParty(pi) {
      closeModal();
      await enterGame(store.userName, entrySide.value, pi);
    }

    async function doLeave() {
      closeModal();
      await leaveGame(store.userName);
    }

    // --- こうかん ---
    const isForceSwitch = computed(() => game.value?.forceSwitch === role.value);
    const switchCmd = computed(() => game.value?.commands?.[role.value] || null);
    const switchLocked = computed(() => !isForceSwitch.value && !!switchCmd.value);

    function switchConfirm(index) {
      if (isForceSwitch.value) {
        closeModal();
        api('/force-switch', { side: role.value, index });
      } else {
        store.activeModal = 'confirmSwitch';
        store.modalProps = { side: role.value, index };
        store.modalWide = false;
      }
    }

    // --- こうかん用：pickPool 6体全部（選出外は非活性） ---
    const fullPartyForSwitch = computed(() => {
      const g = game.value;
      if (!g || !role.value) return [];
      const pool = g.pickPool?.[role.value] || (g.teams?.[role.value] || []).map(m => m.name);
      return pool.map(name => {
        const teamIdx = (g.teams?.[role.value] || []).findIndex(m => m.name === name);
        const teamMon = teamIdx !== -1 ? g.teams[role.value][teamIdx] : null;
        return { name, teamIdx, teamMon, notSelected: teamIdx === -1 };
      });
    });

    // --- 相手パーティ ---
    const opponentNames = computed(() => {
      const g = game.value;
      if (!g || !data.value) return [];
      const tgt = (role.value === 'A' || role.value === 'B') ? enemy(role.value) : 'B';
      return g.pickPool?.[tgt]?.length ? g.pickPool[tgt] : (g.teams?.[tgt] || []).map(m => m.name);
    });

    // --- スタックモーダル詳細を開く ---
    function openStack(name, isOpponent = false, item = null, ability = null) {
      store.stackModal = 'details';
      store.stackModalProps = { name, isOpponent, item, ability };
    }

    // --- 詳細で使う実際の特性名（トレース等でgame状態が変わっている場合はそちらを優先） ---
    const detailsAbility = computed(() => store.modalProps?.ability || abilityOfPokemon(store.modalProps?.name));
    const stackAbility = computed(() => store.stackModalProps?.ability || abilityOfPokemon(store.stackModalProps?.name));

    // --- 持ち物：props未渡しのときはDEXのITEM_BY_POKEMONをフォールバックとして使用
    // （どこからopenModal/openStackしても必ず持ち物が表示されるように、ここで一元解決する）
    const detailsItem = computed(() =>
      store.modalProps?.item ?? data.value?.ITEM_BY_POKEMON?.[store.modalProps?.name] ?? null
    );
    const stackItem = computed(() =>
      store.stackModalProps?.item ?? data.value?.ITEM_BY_POKEMON?.[store.stackModalProps?.name] ?? null
    );

    // --- 確認モーダル送信（closeModal前にpropsを取り出す） ---
    function submitConfirmSwitch() {
      const { side, index } = store.modalProps;
      closeModal();
      api('/command', { side, cmd: { type: 'switch', index } });
    }
    function submitConfirmSurrender() {
      const side = store.modalProps?.side;
      closeModal();
      api('/command', { side, cmd: { type: 'surrender' } });
    }

    // --- 接続設定 ---
    const connPickedUser = ref('');
    async function connEntry(user, side) {
      await enterGame(user, side);
      // enterGame shows alert on error; close only if entry state was actually set
      if (game.value?.entries?.[side] === user) closeModal();
    }
    function connEntryDisabled(user, side) {
      const g = game.value;
      if (!g || g.mode !== 'entry') return true;
      const otherSide = side === 'A' ? 'B' : 'A';
      if (g.entries[side] && g.entries[side] !== user) return true;  // side taken by someone else
      if (g.entries[otherSide] === user) return true;                // user already on other side
      return false;
    }
    function connEntryLabel(user, side) {
      const g = game.value;
      if (!g) return `P${side}でエントリー`;
      if (g.entries[side] === user) return `✓ P${side}に入室中`;
      return `P${side}でエントリー`;
    }

    return {
      store, game, data, role, enemy, abilityOfPokemon, effectiveness, effText, closeModal, closeStackModal, api, setRole,
      VALID_USERS,
      doLogin,
      entryStep, entrySide, myParties, myEntryRole, canEnterSide, startEntryPartySelect, doEntryWithParty, doLeave,
      STAT_LABELS,
      getDefGroups, currentOpponent, moveEffForDetail,
      typeChartTab, setTypeChartTab,
      typeChartSelected, typeChartAtkGroups, typeChartDefGroups, selectTypeChart,
      STATUS_INFO, WEATHER_INFO,
      fightPokemon, fightTarget, fightSelectedCmd, fightLocked, fightMoveStyle, fightAdj, fightEff, submitMove,
      encored, isMoveDisabled, isTrapped,
      isForceSwitch, switchCmd, switchLocked, switchConfirm,
      fullPartyForSwitch, opponentNames, openStack,
      detailsAbility, stackAbility, detailsItem, stackItem,
      submitConfirmSwitch, submitConfirmSurrender,
    };
  },
  template: `
    <!-- メインモーダル -->
    <div v-if="store.activeModal" class="modal-backdrop show" @click.self="closeModal()">
      <div class="modal" :class="{ wide: store.modalWide }">

        <!-- エントリー -->
        <template v-if="store.activeModal === 'entry'">
          <div class="modal-head">
            <div><h2>エントリー</h2></div>
            <button class="danger" @click="closeModal()">閉じる</button>
          </div>

          <!-- 現在のエントリー状況 -->
          <div class="conn-entry-status">
            <div class="conn-entry-slot" :class="{ filled: game?.entries?.A }">
              <span class="conn-slot-label">プレイヤーA</span>
              <span class="conn-slot-name">{{ game?.entries?.A || '未入室' }}</span>
            </div>
            <div class="conn-vs">VS</div>
            <div class="conn-entry-slot" :class="{ filled: game?.entries?.B }">
              <span class="conn-slot-label">プレイヤーB</span>
              <span class="conn-slot-name">{{ game?.entries?.B || '未入室' }}</span>
            </div>
          </div>

          <div v-if="game?.mode !== 'entry'" class="small" style="text-align:center;margin:8px 0;color:#888">
            エントリー期間外です
          </div>

          <!-- メインステップ：PA/PB/離席 -->
          <template v-if="entryStep === 'main'">
            <div style="display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap">
              <button
                class="primary"
                style="min-width:130px;padding:10px"
                :disabled="!canEnterSide('A')"
                @click="startEntryPartySelect('A')"
              >プレイヤーAで着席</button>
              <button
                class="primary"
                style="min-width:130px;padding:10px"
                :disabled="!canEnterSide('B')"
                @click="startEntryPartySelect('B')"
              >プレイヤーBで着席</button>
            </div>
            <div v-if="myEntryRole" style="text-align:center;margin-top:10px">
              <button class="ghost" @click="doLeave()">離席する（P{{ myEntryRole }}から抜ける）</button>
            </div>
          </template>

          <!-- パーティ選択ステップ -->
          <template v-else-if="entryStep === 'party'">
            <div style="margin:8px 0;display:flex;align-items:center;gap:8px">
              <button class="ghost" style="font-size:12px;padding:4px 8px" @click="entryStep = 'main'">← 戻る</button>
              <span class="small">プレイヤー{{ entrySide }}で使うパーティを選択</span>
            </div>
            <div class="entry-party-row">
              <button
                v-for="(party, pi) in myParties" :key="pi"
                class="entry-party-card"
                :disabled="party.pokemon.length !== 6"
                @click="doEntryWithParty(pi)"
              >
                <div class="entry-party-name">{{ party.name || 'パーティ' + (pi + 1) }}</div>
                <div v-if="party.pokemon.length === 6" class="entry-party-pokemon">
                  <div v-for="name in party.pokemon" :key="name" class="entry-party-mon">
                    <sprite-img :mon="data.DEX[name]" cls="mini-sprite" />
                    <span style="font-size:10px;display:block;text-align:center;line-height:1.2">{{ name }}</span>
                  </div>
                </div>
                <div v-else class="small" style="color:#c0392b;padding:8px 0">{{ party.pokemon.length }}体登録中（6体必要）</div>
              </button>
            </div>
          </template>
        </template>

        <!-- たたかう -->
        <template v-else-if="store.activeModal === 'fight'">
          <div class="modal-head">
            <div><h2>たたかう：プレイヤー{{ role }}</h2></div>
            <button class="danger" @click="closeModal()">閉じる</button>
          </div>
          <div class="battle-popup-section">
            <div v-if="fightPokemon" class="moves">
              <button
                v-for="mn in fightPokemon.moves"
                :key="mn"
                class="move-btn"
                :class="{ 'command-selected': fightSelectedCmd?.type === 'move' && fightSelectedCmd.moveName === mn, 'command-locked': fightLocked, 'move-pp-empty': (fightPokemon.movePP?.[mn] ?? 1) <= 0, 'move-encore-locked': encored && mn !== encored }"
                :style="fightMoveStyle(data.MOVES[mn]?.type)"
                :disabled="isMoveDisabled(mn)"
                @click="submitMove(mn)"
              >
                <span class="move-name">{{ fightSelectedCmd?.type === 'move' && fightSelectedCmd.moveName === mn ? '✓ ' : '' }}{{ mn }}</span>
                <span class="move-meta" v-if="data.MOVES[mn]">
                  {{ data.MOVES[mn].type }} / {{ data.MOVES[mn].category }} / 威力{{ data.MOVES[mn].power }} / 命中{{ data.MOVES[mn].accuracy }}
                </span>
                <span class="move-pp">PP {{ fightPokemon.movePP?.[mn] ?? data.MOVES[mn]?.pp ?? '?' }} / {{ data.MOVES[mn]?.pp ?? '?' }}</span>
                <span v-if="data.MOVES[mn]?.effect" class="move-effect">{{ data.MOVES[mn].effect }}</span>
                <span class="move-eff">相手への通り：{{ fightEff(mn) }}</span>
              </button>
            </div>
            <div v-if="fightLocked" class="command-summary">コマンド選択済みです。相手の選択完了まで変更できません。</div>
          </div>
        </template>

        <!-- こうかん / 強制交代 -->
        <template v-else-if="store.activeModal === 'switch' || store.activeModal === 'forceSwitch'">
          <div class="modal-head">
            <div><h2>{{ isForceSwitch ? '次に出すポケモン' : 'こうかん' }}：プレイヤー{{ role }}</h2></div>
            <button class="danger" @click="closeModal()">閉じる</button>
          </div>
          <div class="battle-popup-section">
            <div class="switches">
              <button
                v-for="entry in fullPartyForSwitch" :key="entry.name"
                :class="{ 'command-selected': switchCmd?.type === 'switch' && switchCmd.index === entry.teamIdx, 'command-locked': switchLocked }"
                :disabled="entry.notSelected || switchLocked || (!isForceSwitch && entry.teamIdx === game.active[role]) || entry.teamMon?.fainted || (!isForceSwitch && isTrapped)"
                @click="!entry.notSelected && switchConfirm(entry.teamIdx)"
              >
                {{ switchCmd?.type === 'switch' && switchCmd.index === entry.teamIdx ? '✓ ' : '' }}<sprite-img :mon="data.DEX[entry.name]" cls="mini-sprite" /> {{ entry.name }}
                <span v-if="entry.notSelected" class="small">（選出外）</span>
                <span v-else-if="entry.teamIdx === game.active[role]" class="small">（場に出中）</span>
                <br>
                <span class="types" style="justify-content:center;margin-top:4px">
                  <type-badge v-for="t in data.DEX[entry.name].types" :key="t" :type="t" />
                </span>
                <span v-if="entry.teamMon" class="small">HP {{ Math.max(0, entry.teamMon.hp) }}/{{ entry.teamMon.maxHp }}</span><br>
                <span style="text-decoration:underline" @click.stop="openStack(entry.name, false, entry.teamMon?.item, entry.teamMon?.ability)">詳細</span>
              </button>
            </div>
            <div v-if="switchLocked" class="command-summary">コマンド選択済みです。相手の選択完了まで変更できません。</div>
          </div>
        </template>

        <!-- ポケモン（自分6体＋相手6体） -->
        <template v-else-if="store.activeModal === 'pokemon'">
          <div class="modal-head">
            <div><h2>ポケモン：プレイヤー{{ role }}</h2></div>
            <button class="danger" @click="closeModal()">閉じる</button>
          </div>
          <div class="battle-popup-section">
            <!-- 自分の6体 -->
            <h3 style="margin-bottom:8px">自分のパーティ</h3>
            <div class="switches">
              <button
                v-for="entry in fullPartyForSwitch" :key="entry.name"
                :class="{ 'command-selected': switchCmd?.type === 'switch' && switchCmd.index === entry.teamIdx, 'command-locked': switchLocked }"
                :disabled="entry.notSelected || switchLocked || entry.teamIdx === game.active[role] || entry.teamMon?.fainted || isTrapped"
                @click="!entry.notSelected && switchConfirm(entry.teamIdx)"
              >
                {{ switchCmd?.type === 'switch' && switchCmd.index === entry.teamIdx ? '✓ ' : '' }}<sprite-img :mon="data.DEX[entry.name]" cls="mini-sprite" /> {{ entry.name }}
                <span v-if="entry.notSelected" class="small">（選出外）</span>
                <span v-else-if="entry.teamIdx === game.active[role]" class="small">（場に出中）</span>
                <br>
                <span class="types" style="justify-content:center;margin-top:4px">
                  <type-badge v-for="t in data.DEX[entry.name].types" :key="t" :type="t" />
                </span>
                <span v-if="entry.teamMon" class="small">HP {{ Math.max(0, entry.teamMon.hp) }}/{{ entry.teamMon.maxHp }}</span><br>
                <span style="text-decoration:underline" @click.stop="openStack(entry.name, false, entry.teamMon?.item, entry.teamMon?.ability)">詳細</span>
              </button>
            </div>
            <div v-if="switchLocked" class="command-summary">コマンド選択済みです。相手の選択完了まで変更できません。</div>
            <!-- 相手の6体 -->
            <h3 style="margin-top:16px;margin-bottom:8px">相手のパーティ</h3>
            <div class="battle-opponent-party">
              <div v-for="name in opponentNames" :key="name" class="battle-opponent-card">
                <div><sprite-img :mon="data.DEX[name]" cls="mini-sprite" /> <b>{{ name }}</b></div>
                <div class="types" style="justify-content:center">
                  <type-badge v-for="t in data.DEX[name].types" :key="t" :type="t" />
                </div>
                <button class="mini-btn" style="margin-top:6px" @click="openStack(name, true)">詳細</button>
              </div>
            </div>
          </div>
        </template>

        <!-- 降参確認 -->
        <template v-else-if="store.activeModal === 'confirmSurrender'">
          <div class="modal-head">
            <div><h2>降参確認</h2><div class="small">本当にプレイヤー{{ store.modalProps?.side }}は降参しますか？</div></div>
            <button class="danger" @click="closeModal()">閉じる</button>
          </div>
          <div class="confirm-actions">
            <button class="ghost" @click="closeModal()">キャンセル</button>
            <button class="danger" @click="submitConfirmSurrender()">降参する</button>
          </div>
        </template>

        <!-- 交換確認 -->
        <template v-else-if="store.activeModal === 'confirmSwitch'">
          <div class="modal-head">
            <div><h2>交換確認</h2><div class="small">本当に{{ game.teams[store.modalProps?.side]?.[store.modalProps?.index]?.name }}に交換しますか？</div></div>
            <button class="danger" @click="closeModal()">閉じる</button>
          </div>
          <div class="confirm-actions">
            <button class="ghost" @click="closeModal()">キャンセル</button>
            <button class="primary" @click="submitConfirmSwitch()">交換する</button>
          </div>
        </template>

        <!-- 強制交代確認 -->
        <template v-else-if="store.activeModal === 'confirmForceSwitch'">
          <div class="modal-head">
            <div><h2>交代確認</h2><div class="small">本当に{{ game.teams[store.modalProps?.side]?.[store.modalProps?.index]?.name }}に交換しますか？</div></div>
            <button class="danger" @click="closeModal()">閉じる</button>
          </div>
          <div class="confirm-actions">
            <button class="ghost" @click="closeModal()">キャンセル</button>
            <button class="primary" @click="closeModal(); api('/force-switch', { side: store.modalProps.side, index: store.modalProps.index })">交換する</button>
          </div>
        </template>

        <!-- 相手のパーティ -->
        <template v-else-if="store.activeModal === 'opponentParty'">
          <div class="modal-head">
            <div><h2>相手のパーティ</h2></div>
            <button class="danger" @click="closeModal()">閉じる</button>
          </div>
          <div class="battle-popup-section">
            <div class="selected-info">
              <h4>相手の6体パーティ</h4>
              <div class="battle-opponent-party">
                <div v-for="name in opponentNames" :key="name" class="battle-opponent-card">
                  <div><sprite-img :mon="data.DEX[name]" cls="mini-sprite" /> <b>{{ name }}</b></div>
                  <div class="types" style="justify-content:center">
                    <type-badge v-for="t in data.DEX[name].types" :key="t" :type="t" />
                  </div>
                  <button class="mini-btn" style="margin-top:6px" @click="openStack(name, true)">詳細</button>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- バトルログ -->
        <template v-else-if="store.activeModal === 'battleLog'">
          <div class="modal-head">
            <div><h2>バトルログ</h2></div>
            <button class="danger" @click="closeModal()">閉じる</button>
          </div>
          <div class="battle-popup-section">
            <div class="log" style="height:320px">
              <div v-for="(line, i) in game.log" :key="i">{{ line }}</div>
            </div>
          </div>
        </template>

        <!-- 説明（タブ：タイプ相性 / 状態異常 / 天候） -->
        <template v-else-if="store.activeModal === 'typeChart'">
          <div class="modal-head">
            <div><h2>辞書</h2></div>
            <button class="danger" @click="closeModal()">閉じる</button>
          </div>
          <!-- タブ切り替え -->
          <div class="info-tabs">
            <button :class="['info-tab', typeChartTab === 'typeChart' && 'active']" @click="setTypeChartTab('typeChart')">タイプ相性</button>
            <button :class="['info-tab', typeChartTab === 'status' && 'active']" @click="setTypeChartTab('status')">状態異常</button>
            <button :class="['info-tab', typeChartTab === 'weather' && 'active']" @click="setTypeChartTab('weather')">天候</button>
          </div>

          <!-- タイプ相性タブ -->
          <template v-if="typeChartTab === 'typeChart'">
            <div class="small" style="margin-bottom:8px">攻撃したとき／攻撃されたときの両方を確認できます。</div>
            <div class="type-chart-buttons">
              <button v-for="(td, tn) in data.TYPES" :key="tn" :style="{ background: td.color, color: 'white' }" @click="selectTypeChart(tn)">{{ tn }}</button>
            </div>
            <template v-if="typeChartSelected">
              <div class="selected-info">
                <h4>{{ typeChartSelected }}タイプで攻撃したとき</h4>
                <div class="type-chart-result">
                  <div v-for="[label, types] in typeChartAtkGroups" :key="label" class="type-rel-block">
                    <div class="type-rel-title">{{ label }}</div>
                    <div class="type-rel-list"><type-badge v-for="t in types" :key="t" :type="t" /></div>
                  </div>
                </div>
              </div>
              <div class="selected-info">
                <h4>{{ typeChartSelected }}タイプが攻撃されたとき</h4>
                <div class="type-chart-result">
                  <div v-for="[label, types] in typeChartDefGroups" :key="label" class="type-rel-block">
                    <div class="type-rel-title">{{ label }}</div>
                    <div class="type-rel-list"><type-badge v-for="t in types" :key="t" :type="t" /></div>
                  </div>
                </div>
              </div>
            </template>
            <div v-else class="coverage-empty" style="margin-top:12px">タイプを押すと、攻撃時・被攻撃時の相性を表示します。</div>
          </template>

          <!-- 状態異常タブ -->
          <template v-else-if="typeChartTab === 'status'">
            <div class="info-card-list">
              <div v-for="s in STATUS_INFO" :key="s.key" class="info-card">
                <div class="info-card-head">
                  <span :class="['status-badge', s.tone]">{{ s.name }}</span>
                </div>
                <div class="info-card-desc">{{ s.desc }}</div>
              </div>
            </div>
          </template>

          <!-- 天候タブ -->
          <template v-else-if="typeChartTab === 'weather'">
            <div class="info-card-list">
              <div v-for="w in WEATHER_INFO" :key="w.key" class="info-card">
                <div class="info-card-head">
                  <span class="weather-badge">{{ w.emoji }} {{ w.name }}</span>
                </div>
                <div class="info-card-desc">{{ w.desc }}</div>
              </div>
            </div>
          </template>
        </template>

        <!-- ポケモン詳細 -->
        <template v-else-if="store.activeModal === 'details' && store.modalProps?.name && data.DEX[store.modalProps.name]">
          <div class="modal-head">
            <div>
              <h2><sprite-img :mon="data.DEX[store.modalProps.name]" cls="mini-sprite" /> {{ store.modalProps.name }}</h2>
              <div class="types"><type-badge v-for="t in data.DEX[store.modalProps.name].types" :key="t" :type="t" /></div>
            </div>
            <button class="danger" @click="closeModal()">閉じる</button>
          </div>
          <div class="stats" style="margin-top:12px">
            <div v-for="[key, label] in STAT_LABELS" :key="key" class="stat">
              {{ label }}<br><b>{{ data.DEX[store.modalProps.name].stats[key] }}</b>
            </div>
          </div>
          <template v-if="!store.modalProps.isOpponent">
            <div v-if="data.ABILITY_DETAILS[detailsAbility]" class="ability-detail">
              <b>特性：{{ detailsAbility }}</b><br>{{ data.ABILITY_DETAILS[detailsAbility].detail }}
            </div>
            <div v-else class="ability-detail"><b>特性：{{ detailsAbility || 'なし' }}</b></div>
            <!-- ※ 持ち物表示は削除禁止。はたきおとすで消えるのは pokemon.item でありここではない -->
            <div v-if="detailsItem && data.ITEMS?.[detailsItem]" class="ability-detail" style="margin-top:4px">
              <b>持ち物：{{ detailsItem }}</b><br>{{ data.ITEMS[detailsItem].detail }}
            </div>
            <div v-else-if="detailsItem" class="ability-detail" style="margin-top:4px"><b>持ち物：{{ detailsItem }}</b></div>
            <div v-else class="ability-detail" style="margin-top:4px;opacity:.6"><b>持ち物：なし</b></div>
          </template>
          <template v-else>
            <div class="ability-detail" style="background:#f5f5f5;color:#999">特性・持ち物・使い方は相手ポケモンには非表示</div>
          </template>
          <h3 style="margin-top:14px">攻撃されたときのタイプ相性</h3>
          <div class="type-chart-result">
            <div v-for="[label, types] in getDefGroups(store.modalProps.name)" :key="label" class="type-rel-block">
              <div class="type-rel-title">{{ label }}</div>
              <div class="type-rel-list"><type-badge v-for="t in types" :key="t" :type="t" /></div>
            </div>
          </div>
          <template v-if="!store.modalProps.isOpponent">
            <h3 style="margin-top:14px">わざ</h3>
            <div v-if="currentOpponent()" class="small">現在の相手：{{ currentOpponent().name }}</div>
            <div class="move-list">
              <div
                v-for="mn in data.DEX[store.modalProps.name].moves"
                :key="mn"
                class="move-chip"
                :style="{ '--move-color': data.TYPES[data.MOVES[mn]?.type]?.color, background: data.TYPES[data.MOVES[mn]?.type]?.color, color: 'white' }"
              >
                <b>{{ mn }}</b><br>
                {{ data.MOVES[mn]?.type }} / {{ data.MOVES[mn]?.category }} / 威力{{ data.MOVES[mn]?.power }} / 命中{{ data.MOVES[mn]?.accuracy }} / PP{{ data.MOVES[mn]?.pp ?? '?' }}
                <br><span v-if="data.MOVES[mn]?.effect" class="move-effect-chip">{{ data.MOVES[mn].effect }}</span>
                <template v-if="currentOpponent()">
                  <br><span class="move-eff">相手への通り：{{ moveEffForDetail(mn, currentOpponent()) }}</span>
                </template>
              </div>
            </div>
            <div v-if="data.DEX[store.modalProps.name].usage" class="ability-detail" style="margin-top:8px;background:#f0f4ff">
              <b>使い方</b><br>{{ data.DEX[store.modalProps.name].usage }}
            </div>
          </template>
        </template>

      </div>
    </div>

    <!-- スタックモーダル（詳細ネスト） -->
    <div v-if="store.stackModal === 'details' && store.stackModalProps?.name && data?.DEX[store.stackModalProps.name]" class="modal-stack-backdrop show" @click.self="closeStackModal()">
      <div class="modal">
        <div class="modal-head">
          <div>
            <h2><sprite-img :mon="data.DEX[store.stackModalProps.name]" cls="mini-sprite" /> {{ store.stackModalProps.name }}</h2>
            <div class="types"><type-badge v-for="t in data.DEX[store.stackModalProps.name].types" :key="t" :type="t" /></div>
          </div>
          <button class="danger" @click="closeStackModal()">閉じる</button>
        </div>
        <div class="stats" style="margin-top:12px">
          <div v-for="[key, label] in STAT_LABELS" :key="key" class="stat">
            {{ label }}<br><b>{{ data.DEX[store.stackModalProps.name].stats[key] }}</b>
          </div>
        </div>
        <template v-if="!store.stackModalProps.isOpponent">
          <div v-if="data.ABILITY_DETAILS[stackAbility]" class="ability-detail">
            <b>特性：{{ stackAbility }}</b><br>{{ data.ABILITY_DETAILS[stackAbility].detail }}
          </div>
          <div v-else class="ability-detail"><b>特性：{{ stackAbility || 'なし' }}</b></div>
          <!-- ※ 持ち物表示は削除禁止。はたきおとすで消えるのは pokemon.item でありここではない -->
          <div v-if="stackItem && data.ITEMS?.[stackItem]" class="ability-detail" style="margin-top:4px">
            <b>持ち物：{{ stackItem }}</b><br>{{ data.ITEMS[stackItem].detail }}
          </div>
          <div v-else-if="stackItem" class="ability-detail" style="margin-top:4px"><b>持ち物：{{ stackItem }}</b></div>
          <div v-else class="ability-detail" style="margin-top:4px;opacity:.6"><b>持ち物：なし</b></div>
        </template>
        <template v-else>
          <div class="ability-detail" style="background:#f5f5f5;color:#999">特性・持ち物・使い方は相手ポケモンには非表示</div>
        </template>
        <h3 style="margin-top:14px">攻撃されたときのタイプ相性</h3>
        <div class="type-chart-result">
          <div v-for="[label, types] in getDefGroups(store.stackModalProps.name)" :key="label" class="type-rel-block">
            <div class="type-rel-title">{{ label }}</div>
            <div class="type-rel-list"><type-badge v-for="t in types" :key="t" :type="t" /></div>
          </div>
        </div>
        <template v-if="!store.stackModalProps.isOpponent">
          <h3 style="margin-top:14px">わざ</h3>
          <div v-if="currentOpponent()" class="small">現在の相手：{{ currentOpponent().name }}</div>
          <div class="move-list">
            <div
              v-for="mn in data.DEX[store.stackModalProps.name].moves"
              :key="mn"
              class="move-chip"
              :style="{ '--move-color': data.TYPES[data.MOVES[mn]?.type]?.color, background: data.TYPES[data.MOVES[mn]?.type]?.color, color: 'white' }"
            >
              <b>{{ mn }}</b><br>
              {{ data.MOVES[mn]?.type }} / {{ data.MOVES[mn]?.category }} / 威力{{ data.MOVES[mn]?.power }} / 命中{{ data.MOVES[mn]?.accuracy }} / PP{{ data.MOVES[mn]?.pp ?? '?' }}
              <br><span v-if="data.MOVES[mn]?.effect" class="move-effect-chip">{{ data.MOVES[mn].effect }}</span>
              <template v-if="currentOpponent()">
                <br><span class="move-eff">相手への通り：{{ moveEffForDetail(mn, currentOpponent()) }}</span>
              </template>
            </div>
          </div>
          <div v-if="data.DEX[store.stackModalProps.name].usage" class="ability-detail" style="margin-top:8px;background:#f0f4ff">
            <b>使い方</b><br>{{ data.DEX[store.stackModalProps.name].usage }}
          </div>
        </template>
      </div>
    </div>
  `
});
