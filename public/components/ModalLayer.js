import { defineComponent, computed } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { store, enemy, abilityOfPokemon, effectiveness, effText, effGroupLabel, closeModal, closeStackModal, setRole, api } from '../store.js';

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

    // --- タイプ相性 ---
    function selectTypeChart(t) { store.modalProps = { selectedType: t }; }

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

    // --- 相手パーティ ---
    const opponentNames = computed(() => {
      const g = game.value;
      if (!g || !data.value) return [];
      const tgt = (role.value === 'A' || role.value === 'B') ? enemy(role.value) : 'B';
      return g.finalPool?.[tgt]?.length ? g.finalPool[tgt] : (g.teams?.[tgt] || []).map(m => m.name);
    });

    // --- スタックモーダル詳細を開く ---
    function openStack(name, isOpponent = false) {
      store.stackModal = 'details';
      store.stackModalProps = { name, isOpponent };
    }

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

    return {
      store, game, data, role, enemy, abilityOfPokemon, effectiveness, effText, closeModal, closeStackModal, api, setRole,
      STAT_LABELS,
      getDefGroups, currentOpponent, moveEffForDetail,
      typeChartSelected, typeChartAtkGroups, typeChartDefGroups, selectTypeChart,
      fightPokemon, fightTarget, fightSelectedCmd, fightLocked, fightMoveStyle, fightAdj, fightEff, submitMove,
      isForceSwitch, switchCmd, switchLocked, switchConfirm,
      opponentNames, openStack,
      submitConfirmSwitch, submitConfirmSurrender,
    };
  },
  template: `
    <!-- メインモーダル -->
    <div v-if="store.activeModal" class="modal-backdrop show" @click.self="closeModal()">
      <div class="modal" :class="{ wide: store.modalWide }">

        <!-- 接続設定 -->
        <template v-if="store.activeModal === 'connectionSettings'">
          <div class="modal-head">
            <div><h2>接続設定</h2><div class="small">あなたのロールを選択してください</div></div>
            <button class="danger" @click="closeModal()">閉じる</button>
          </div>
          <div class="confirm-actions">
            <button class="primary" :class="{ 'command-selected': store.role === 'A' }" @click="setRole('A'); closeModal()">プレイヤーA</button>
            <button class="primary" :class="{ 'command-selected': store.role === 'B' }" @click="setRole('B'); closeModal()">プレイヤーB</button>
          </div>
          <div v-if="store.role" style="margin-top:12px;text-align:center;font-weight:800">現在：プレイヤー{{ store.role }}</div>
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
                :class="{ 'command-selected': fightSelectedCmd?.type === 'move' && fightSelectedCmd.moveName === mn, 'command-locked': fightLocked }"
                :style="fightMoveStyle(data.MOVES[mn]?.type)"
                :disabled="fightLocked"
                @click="submitMove(mn)"
              >
                <span class="move-name">{{ fightSelectedCmd?.type === 'move' && fightSelectedCmd.moveName === mn ? '✓ ' : '' }}{{ mn }}</span>
                <span class="move-meta" v-if="data.MOVES[mn]">
                  {{ data.MOVES[mn].type }} / {{ data.MOVES[mn].category }} / 威力<template v-if="fightAdj(mn)?.powerTone"><span :class="'move-num-' + fightAdj(mn).powerTone">{{ fightAdj(mn).power }}{{ fightAdj(mn).powerTone === 'up' ? '↑' : '↓' }}</span></template><template v-else>{{ fightAdj(mn)?.power }}</template> / 命中<template v-if="fightAdj(mn)?.accuracyTone"><span :class="'move-num-' + fightAdj(mn).accuracyTone">{{ fightAdj(mn).accuracy }}{{ fightAdj(mn).accuracyTone === 'up' ? '↑' : '↓' }}</span></template><template v-else>{{ fightAdj(mn)?.accuracy }}</template>
                </span>
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
                v-for="(m, i) in game.teams[role]"
                :key="i"
                :class="{ 'command-selected': switchCmd?.type === 'switch' && switchCmd.index === i, 'command-locked': switchLocked }"
                :disabled="switchLocked || (!isForceSwitch && i === game.active[role]) || m.fainted"
                @click="switchConfirm(i)"
              >
                {{ switchCmd?.type === 'switch' && switchCmd.index === i ? '✓ ' : '' }}<sprite-img :mon="m" cls="mini-sprite" /> {{ m.name }}<br>
                <span class="types" style="justify-content:center;margin-top:4px">
                  <type-badge v-for="t in m.types" :key="t" :type="t" />
                </span>
                <span class="small">HP {{ Math.max(0, m.hp) }}/{{ m.maxHp }}</span><br>
                <span style="text-decoration:underline" @click.stop="openStack(m.name)">詳細</span>
              </button>
            </div>
            <div v-if="switchLocked" class="command-summary">コマンド選択済みです。相手の選択完了まで変更できません。</div>
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

        <!-- タイプ相性 -->
        <template v-else-if="store.activeModal === 'typeChart'">
          <div class="modal-head">
            <div><h2>タイプ相性</h2><div class="small">攻撃したとき／攻撃されたときの両方を確認できます。ふつうは表示しません。</div></div>
            <button class="danger" @click="closeModal()">閉じる</button>
          </div>
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
          <div v-if="data.ABILITY_DETAILS[abilityOfPokemon(store.modalProps.name)]" class="ability-detail">
            <b>特性：{{ abilityOfPokemon(store.modalProps.name) }}</b><br>{{ data.ABILITY_DETAILS[abilityOfPokemon(store.modalProps.name)].detail }}
          </div>
          <div v-else class="ability-detail"><b>特性：なし</b></div>
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
                {{ data.MOVES[mn]?.type }} / {{ data.MOVES[mn]?.category }} / 威力{{ data.MOVES[mn]?.power }} / 命中{{ data.MOVES[mn]?.accuracy }}
                <template v-if="currentOpponent()">
                  <br><span class="move-eff">相手への通り：{{ moveEffForDetail(mn, currentOpponent()) }}</span>
                </template>
              </div>
            </div>
          </template>
          <div v-else class="coverage-empty" style="margin-top:14px">相手ポケモンの詳細では、わざは非表示です。</div>
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
        <div v-if="data.ABILITY_DETAILS[abilityOfPokemon(store.stackModalProps.name)]" class="ability-detail">
          <b>特性：{{ abilityOfPokemon(store.stackModalProps.name) }}</b><br>{{ data.ABILITY_DETAILS[abilityOfPokemon(store.stackModalProps.name)].detail }}
        </div>
        <div v-else class="ability-detail"><b>特性：なし</b></div>
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
              {{ data.MOVES[mn]?.type }} / {{ data.MOVES[mn]?.category }} / 威力{{ data.MOVES[mn]?.power }} / 命中{{ data.MOVES[mn]?.accuracy }}
              <template v-if="currentOpponent()">
                <br><span class="move-eff">相手への通り：{{ moveEffForDetail(mn, currentOpponent()) }}</span>
              </template>
            </div>
          </div>
        </template>
        <div v-else class="coverage-empty" style="margin-top:14px">相手ポケモンの詳細では、わざは非表示です。</div>
      </div>
    </div>
  `
});
