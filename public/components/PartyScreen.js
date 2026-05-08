import { defineComponent, computed, ref, watch, onUnmounted } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { store, saveParty, saveBgm, fetchParties, pauseBgm, resumeBgm, attachCompressor, effectiveness, openModal } from '../store.js';

export default defineComponent({
  name: 'PartyScreen',
  setup() {
    const data = computed(() => store.masterData);
    const parties = computed(() => store.parties || {});

    const selectedUser = computed(() => store.userName);
    const selectedSlot = ref(0);
    const typeFilter = ref('');
    const editParty = ref([]);
    const editName = ref('');
    const saved = ref(false);

    const userModified = ref(false);

    const userParties = computed(() => {
      const u = parties.value[selectedUser.value];
      if (!u || !u.parties) {
        return { active: 0, parties: [{ name: 'パーティ1', pokemon: [] }, { name: 'パーティ2', pokemon: [] }, { name: 'パーティ3', pokemon: [] }] };
      }
      return u;
    });
    const slotData = computed(() => userParties.value.parties?.[selectedSlot.value] || { name: `パーティ${selectedSlot.value + 1}`, pokemon: [] });

    function loadFromSlot() {
      editParty.value = [...(slotData.value.pokemon || [])];
      editName.value = slotData.value.name || `パーティ${selectedSlot.value + 1}`;
    }

    watch([selectedUser, selectedSlot], () => {
      loadFromSlot();
      saved.value = false;
      userModified.value = false;
    }, { immediate: true });

    watch(() => store.parties, () => {
      if (!userModified.value) {
        loadFromSlot();
      }
    });

    const allNames = computed(() => Object.keys(data.value?.DEX || {}));
    const filteredNames = computed(() => {
      const f = typeFilter.value;
      if (!f) return allNames.value;
      return allNames.value.filter(n => data.value.DEX[n].types.includes(f));
    });

    const holes = computed(() => {
      const names = editParty.value;
      if (!names.length || !data.value) return [];
      return Object.keys(data.value.TYPES).filter(atkType =>
        !names.some(n => effectiveness(atkType, data.value.DEX[n]?.types || []) <= 0.5)
      );
    });

    const recommendedTypes = computed(() => {
      const hs = holes.value;
      if (!hs.length || !data.value) return [];
      const result = [];
      for (const tn of Object.keys(data.value.TYPES)) {
        const covered = hs.filter(h => effectiveness(h, [tn]) <= 0.5).length;
        if (covered > 0) result.push({ type: tn, covered });
      }
      result.sort((a, b) => b.covered - a.covered);
      return result.slice(0, 8);
    });

    function addPokemon(name) {
      if (editParty.value.includes(name)) return;
      if (editParty.value.length >= 6) return;
      editParty.value.push(name);
      saved.value = false;
      userModified.value = true;
    }

    function removePokemon(index) {
      editParty.value.splice(index, 1);
      saved.value = false;
      userModified.value = true;
    }

    function clearAll() {
      editParty.value = [];
      saved.value = false;
      userModified.value = true;
    }

    function moveUp(index) {
      if (index <= 0) return;
      const a = editParty.value;
      [a[index - 1], a[index]] = [a[index], a[index - 1]];
      saved.value = false;
      userModified.value = true;
    }

    function moveDown(index) {
      const a = editParty.value;
      if (index >= a.length - 1) return;
      [a[index], a[index + 1]] = [a[index + 1], a[index]];
      saved.value = false;
      userModified.value = true;
    }

    function onNameInput() {
      saved.value = false;
      userModified.value = true;
    }

    async function handleSave() {
      const ok = await saveParty(selectedUser.value, selectedSlot.value, editName.value, [...editParty.value]);
      if (ok) {
        saved.value = true;
        userModified.value = false;
      }
    }

    const isDirty = computed(() => {
      const original = slotData.value.pokemon || [];
      const originalName = slotData.value.name || `パーティ${selectedSlot.value + 1}`;
      if (editName.value !== originalName) return true;
      if (editParty.value.length !== original.length) return true;
      return editParty.value.some((n, i) => n !== original[i]);
    });

    // --- BGM設定 ---
    const showBgm = ref(false);
    const bgmList = ref([]);
    const playingFile = ref('');
    let _previewAudio = null;
    let _previewNodes = null;

    const currentBgm = computed(() => store.parties?.[selectedUser.value]?.bgm || null);

    async function loadBgmList() {
      const res = await fetch('/battle-bgm-list');
      const d = await res.json();
      bgmList.value = d.files || [];
    }

    function stopPreviewAudio() {
      if (_previewNodes) {
        try { _previewNodes.src.disconnect(); } catch {}
        try { _previewNodes.comp.disconnect(); } catch {}
        try { _previewNodes.gain.disconnect(); } catch {}
        _previewNodes = null;
      }
      if (_previewAudio) { _previewAudio.pause(); _previewAudio = null; }
    }

    function playPreview(filename) {
      stopPreviewAudio();
      if (playingFile.value === filename) {
        // 同じ曲の▶を再押し → 停止してポケセンBGM再開
        playingFile.value = '';
        resumeBgm();
        return;
      }
      pauseBgm(); // ポケセンBGMを一時停止
      playingFile.value = filename;
      _previewAudio = new Audio('/music/battle/' + encodeURIComponent(filename));
      _previewAudio.volume = 0.55;
      _previewNodes = attachCompressor(_previewAudio); // 音量均一化
      _previewAudio.play().catch(() => {});
      _previewAudio.onended = () => { playingFile.value = ''; _previewAudio = null; _previewNodes = null; resumeBgm(); };
    }

    function pausePreview() {
      stopPreviewAudio();
      playingFile.value = '';
      resumeBgm(); // ポケセンBGM再開
    }

    async function setBgm(filename) {
      await saveBgm(selectedUser.value, filename);
    }

    watch(showBgm, (val) => {
      if (val && !bgmList.value.length) loadBgmList();
      if (!val) pausePreview(); // タブを離れたらプレビュー停止 & ポケセンBGM再開
    });

    onUnmounted(() => { stopPreviewAudio(); resumeBgm(); });

    return {
      store, data, parties, selectedUser, selectedSlot, typeFilter, editParty, editName, saved, isDirty,
      userParties, slotData,
      allNames, filteredNames, holes, recommendedTypes,
      addPokemon, removePokemon, clearAll, moveUp, moveDown, onNameInput, handleSave,
      showBgm, bgmList, playingFile, currentBgm, playPreview, pausePreview, setBgm,
      openModal, effectiveness,
    };
  },
  template: `
    <div class="party-screen">
      <div class="party-screen-header">
        <h2>パーティ登録</h2>
      </div>

      <!-- スロット選択 -->
      <div class="party-slot-tabs" style="display:flex;gap:6px;margin:8px 0;flex-wrap:wrap">
        <button
          v-for="(slot, si) in userParties.parties" :key="si"
          :class="['party-user-tab', !showBgm && selectedSlot === si && 'active']"
          @click="selectedSlot = si; showBgm = false"
        >{{ slot.name || ('パーティ' + (si + 1)) }}</button>
        <button
          :class="['party-user-tab', showBgm && 'active']"
          @click="showBgm = true"
        >🎵 BGM設定</button>
      </div>

      <div class="party-screen-body">
        <!-- BGM設定ビュー -->
        <div v-if="showBgm" class="panel party-edit-panel">
          <h3 style="margin-bottom:8px">バトルBGM設定</h3>
          <div class="small" style="margin-bottom:14px;color:#555">バトル開始時に流れるBGMを選択してください。未設定の場合はデフォルト曲が流れます。</div>
          <div v-if="currentBgm" class="bgm-current-info">♪ 現在の設定：<b>{{ currentBgm.replace(/\.mp3$/i, '') }}</b></div>
          <div v-else class="bgm-current-info" style="opacity:.6">未設定（デフォルト：ブルベリーグ四天王戦）</div>
          <div v-if="!bgmList.length" class="coverage-empty" style="margin-top:12px">BGMファイルが見つかりません</div>
          <div v-else class="bgm-list">
            <div
              v-for="f in bgmList" :key="f"
              :class="['bgm-item', currentBgm === f && 'bgm-active']"
            >
              <div class="bgm-name">
                {{ f.replace(/\.mp3$/i, '') }}
                <span v-if="currentBgm === f" class="bgm-current-badge">♪ 設定中</span>
              </div>
              <div class="bgm-actions">
                <button class="mini-btn" :disabled="playingFile === f" @click="playPreview(f)">▶ 再生</button>
                <button class="mini-btn" :disabled="playingFile !== f" @click="pausePreview()">⏸ 停止</button>
                <button :class="['mini-btn', 'primary', currentBgm === f && 'command-selected']" @click="setBgm(f)">設定</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 左：登録済みパーティ -->
        <div v-else class="panel party-edit-panel">
          <!-- スロット名編集 -->
          <div class="party-name-edit">
            <label class="party-name-label">パーティ名</label>
            <input
              v-model="editName"
              @input="onNameInput()"
              class="party-name-input"
              maxlength="20"
              placeholder="パーティ名を入力"
            />
          </div>

          <div class="small" style="margin-bottom:12px;color:#555">6体登録されたパーティのみエントリーできます。</div>

          <!-- 選択中ポケモン一覧ヘッダー -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:13px;font-weight:600;color:#333">選択中（{{ editParty.length }}/6）</span>
            <button
              v-if="editParty.length > 0"
              class="mini-btn danger"
              @click="clearAll()"
            >すべて外す</button>
          </div>

          <div v-if="editParty.length === 0" class="coverage-empty">まだ登録されていません。右の図鑑からポケモンを追加してください。</div>

          <div class="party-list">
            <div v-for="(name, i) in editParty" :key="name" class="party-entry">
              <div class="party-entry-left">
                <span class="party-entry-num">{{ i + 1 }}</span>
                <sprite-img :mon="data.DEX[name]" cls="mini-sprite" />
                <div>
                  <span class="party-entry-name">{{ name }}</span>
                  <div class="types" style="margin-top:2px">
                    <type-badge v-for="t in data.DEX[name].types" :key="t" :type="t" />
                  </div>
                  <div style="font-size:11px;color:#666;margin-top:1px">特性：{{ data.ABILITY_BY_POKEMON?.[name] || '—' }}</div>
                </div>
              </div>
              <div class="party-entry-actions">
                <button class="mini-btn" @click="openModal('details', { name, item: data.ITEM_BY_POKEMON?.[name] })">詳細</button>
                <button class="mini-btn" :disabled="i === 0" @click="moveUp(i)">↑</button>
                <button class="mini-btn" :disabled="i === editParty.length - 1" @click="moveDown(i)">↓</button>
                <button class="mini-btn danger" @click="removePokemon(i)">外す</button>
              </div>
            </div>
          </div>

          <!-- タイプ一貫 -->
          <div v-if="editParty.length" class="selected-info" style="margin-top:14px">
            <h4>一貫タイプ（相手から通る）</h4>
            <div class="coverage-list">
              <type-badge v-for="t in holes" :key="t" :type="t" />
              <span v-if="!holes.length" class="coverage-empty">なし</span>
            </div>
          </div>

          <!-- おすすめタイプ -->
          <div v-if="recommendedTypes.length" class="selected-info" style="margin-top:10px">
            <h4>おすすめタイプ（穴を埋めやすい）</h4>
            <div class="coverage-list">
              <span
                v-for="rt in recommendedTypes" :key="rt.type"
                style="display:inline-flex;align-items:center;gap:3px;margin:2px"
              >
                <type-badge :type="rt.type" />
                <span class="small" style="color:#888">×{{ rt.covered }}</span>
              </span>
            </div>
          </div>

          <div style="margin-top:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button
              class="primary"
              :disabled="!selectedUser"
              @click="handleSave"
            >{{ isDirty ? '保存する' : '✓ 保存済み' }}</button>
          </div>
        </div>

        <!-- 右：図鑑（BGM設定時は非表示）-->
        <div v-if="!showBgm" class="panel party-dex-panel">
          <h3>ポケモン図鑑から追加</h3>

          <!-- タイプフィルター -->
          <div class="dex-toolbar" style="margin-bottom:10px">
            <div class="type-filter-row">
              <button
                class="type-filter-btn all"
                :class="{ active: !typeFilter }"
                @click="typeFilter = ''"
              >すべて</button>
              <button
                v-for="(td, tn) in data.TYPES"
                :key="tn"
                class="type-filter-btn"
                :class="{ active: typeFilter === tn }"
                :style="{ background: td.color }"
                @click="typeFilter = tn"
              >{{ tn }}</button>
            </div>
          </div>

          <div class="party-dex-grid">
            <div v-for="name in filteredNames" :key="name" class="party-dex-card">
              <sprite-img :mon="data.DEX[name]" cls="mini-sprite" />
              <span class="party-dex-name">{{ name }}</span>
              <div class="types" style="margin:3px 0">
                <type-badge v-for="t in data.DEX[name].types" :key="t" :type="t" />
              </div>
              <div style="font-size:10px;color:#666;margin-bottom:2px">{{ data.ABILITY_BY_POKEMON?.[name] || '—' }}</div>
              <button
                class="mini-btn"
                style="width:100%;margin-top:2px;font-size:11px"
                @click="openModal('details', { name, item: data.ITEM_BY_POKEMON?.[name] })"
              >詳細</button>
              <button
                class="primary"
                style="width:100%;padding:4px;font-size:11px;margin-top:4px"
                :disabled="editParty.includes(name) || editParty.length >= 6"
                @click="addPokemon(name)"
              >{{ editParty.includes(name) ? '登録済み' : '追加' }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
});
