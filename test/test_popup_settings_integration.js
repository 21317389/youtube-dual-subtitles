/**
 * test_popup_settings_integration.js
 * 
 * 真實 Extension Popup 設定面板整合測試 (Priority 4)
 * 實際載入並執行 production popup.js，觸發真實 DOM 事件監聽器與 chrome.storage.sync.set 連線
 * 絕不在測試中自行重寫 Math.round 算法，完全透過真實按鈕點擊檢驗
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runPopupSettingsIntegrationTest() {
  console.log('========================================================');
  console.log('🧪 執行【Popup 設定面板真實事件整合測試 (Priority 4)】');
  console.log('========================================================\n');

  class MockElement {
    constructor(tagName, id = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.className = '';
      this.checked = false;
      this.value = '';
      this.textContent = '';
      this.style = {};
      this.listeners = {};
      this.classList = {
        _set: new Set(),
        add: (c) => this.classList._set.add(c),
        remove: (c) => this.classList._set.delete(c),
        contains: (c) => this.classList._set.has(c)
      };
      this.children = [];
    }
    addEventListener(event, fn) {
      this.listeners[event] = this.listeners[event] || [];
      this.listeners[event].push(fn);
    }
    dispatchEvent(event, evtObj = {}) {
      const fns = this.listeners[event] || [];
      fns.forEach(fn => fn({ stopPropagation: () => {}, target: this, ...evtObj }));
    }
    click() {
      this.dispatchEvent('click');
    }
    contains(other) {
      return other === this || this.children.includes(other);
    }
    querySelectorAll() {
      return [];
    }
  }

  const elements = {
    extensionEnabled: new MockElement('input', 'extensionEnabled'),
    settingsContent: new MockElement('div', 'settingsContent'),
    targetLang: new MockElement('select', 'targetLang'),
    uiSize: new MockElement('select', 'uiSize'),
    hoverPause: new MockElement('input', 'hoverPause'),
    statusMessage: new MockElement('div', 'statusMessage'),
    offsetDisplay: new MockElement('span', 'offsetDisplay'),
    offsetMinus: new MockElement('button', 'offsetMinus'),
    offsetPlus: new MockElement('button', 'offsetPlus'),
    offsetReset: new MockElement('button', 'offsetReset'),
    whatsNewCard: new MockElement('div', 'whatsNewCard'),
    whatsNewCloseBtn: new MockElement('button', 'whatsNewCloseBtn'),
    whatsNewToggleBtn: new MockElement('button', 'whatsNewToggleBtn'),
    footerNewDot: new MockElement('span', 'footerNewDot'),
    rateStoreBtn: new MockElement('button', 'rateStoreBtn')
  };

  const docListeners = {};
  const mockDocument = {
    addEventListener: (event, fn) => {
      docListeners[event] = docListeners[event] || [];
      docListeners[event].push(fn);
    },
    dispatchEvent: (event) => {
      (docListeners[event] || []).forEach(fn => fn());
    },
    getElementById: (id) => elements[id] || null,
    querySelectorAll: () => []
  };

  let syncStorageState = {
    extensionEnabled: true,
    targetLang: 'zh-TW',
    uiSize: 'medium',
    hoverPause: false,
    subtitleOffset: 0
  };

  let syncSetCalls = [];
  const mockChrome = {
    runtime: {
      getManifest: () => ({ version: '1.5.0' }),
      sendMessage: () => {}
    },
    action: {
      setBadgeText: () => {}
    },
    i18n: {
      getMessage: (key) => key,
      getUILanguage: () => 'zh-TW'
    },
    storage: {
      sync: {
        get: (defaults, cb) => {
          cb({ ...defaults, ...syncStorageState });
        },
        set: (data, cb) => {
          const plainData = JSON.parse(JSON.stringify(data));
          syncStorageState = { ...syncStorageState, ...plainData };
          syncSetCalls.push(plainData);
          if (cb) cb();
        }
      },
      local: {
        get: (defaults, cb) => {
          cb(defaults);
        },
        set: (data, cb) => {
          if (cb) cb();
        }
      }
    }
  };

  const sandbox = {
    document: mockDocument,
    chrome: mockChrome,
    console,
    setTimeout,
    clearTimeout,
    parseFloat,
    Math
  };

  // 載入並執行真實 popup.js
  const popupCode = fs.readFileSync(path.resolve(__dirname, '../popup.js'), 'utf8');
  vm.runInNewContext(popupCode, sandbox);

  // 觸發 DOMContentLoaded 初始化事件
  mockDocument.dispatchEvent('DOMContentLoaded');

  // ------------------------------------------------------------------
  // 1. 驗證初次載入資料綁定
  // ------------------------------------------------------------------
  console.log('【1. 初次載入與 storage 資料綁定檢驗】');
  assert.strictEqual(elements.extensionEnabled.checked, true, '總開關預設應為 true');
  assert.strictEqual(elements.targetLang.value, 'zh-TW', '目標語言預設應為 zh-TW');
  assert.strictEqual(elements.uiSize.value, 'medium', 'UI 大小預設應為 medium');
  assert.strictEqual(elements.hoverPause.checked, false, '懸停暫停預設應為 false');
  assert.strictEqual(elements.offsetDisplay.textContent, '0.0s', '時間軸偏置顯示預設應為 0.0s');
  assert.strictEqual(elements.settingsContent.classList.contains('disabled'), false, '總開關開啟時不應有 disabled 樣式');
  console.log('  - 初次載入 DOM 與 storage.sync.get 綁定: ✅ PASS\n');

  // ------------------------------------------------------------------
  // 2. 總開關切換 (Master Toggle)
  // ------------------------------------------------------------------
  console.log('【2. 總開關切換 (Master Toggle) 檢驗】');
  syncSetCalls = [];
  elements.extensionEnabled.checked = false;
  elements.extensionEnabled.dispatchEvent('change');
  assert.strictEqual(elements.settingsContent.classList.contains('disabled'), true, '關閉開關後 settingsContent 必須添加 disabled');
  assert.deepStrictEqual(syncSetCalls[syncSetCalls.length - 1], { extensionEnabled: false }, '必須向 storage.sync.set 寫入 extensionEnabled: false');

  elements.extensionEnabled.checked = true;
  elements.extensionEnabled.dispatchEvent('change');
  assert.strictEqual(elements.settingsContent.classList.contains('disabled'), false, '開啟開關後 settingsContent 必須移除 disabled');
  assert.deepStrictEqual(syncSetCalls[syncSetCalls.length - 1], { extensionEnabled: true }, '必須向 storage.sync.set 寫入 extensionEnabled: true');
  console.log('  - 總開關點擊 -> change 事件 -> storage.sync.set 與 UI 禁用聯動: ✅ PASS\n');

  // ------------------------------------------------------------------
  // 3. 目標翻譯語言切換 (Target Language Select)
  // ------------------------------------------------------------------
  console.log('【3. 目標翻譯語言切換 (Target Language) 檢驗】');
  elements.targetLang.value = 'ja';
  elements.targetLang.dispatchEvent('change');
  assert.deepStrictEqual(syncSetCalls[syncSetCalls.length - 1], { targetLang: 'ja' }, '切換語言必須向 storage.sync.set 寫入 targetLang: ja');

  elements.targetLang.value = 'en';
  elements.targetLang.dispatchEvent('change');
  assert.deepStrictEqual(syncSetCalls[syncSetCalls.length - 1], { targetLang: 'en' }, '切換語言必須向 storage.sync.set 寫入 targetLang: en');
  console.log('  - 目標語言下拉選單 change 事件 -> storage.sync.set: ✅ PASS\n');

  // ------------------------------------------------------------------
  // 4. UI 尺寸切換 (UI Size Select)
  // ------------------------------------------------------------------
  console.log('【4. UI 尺寸切換 (UI Size) 檢驗】');
  elements.uiSize.value = 'large';
  elements.uiSize.dispatchEvent('change');
  assert.deepStrictEqual(syncSetCalls[syncSetCalls.length - 1], { uiSize: 'large' }, '切換尺寸必須向 storage.sync.set 寫入 uiSize: large');
  console.log('  - 字體尺寸下拉選單 change 事件 -> storage.sync.set: ✅ PASS\n');

  // ------------------------------------------------------------------
  // 5. 懸停暫停開關 (Hover Pause Checkbox)
  // ------------------------------------------------------------------
  console.log('【5. 懸停暫停開關 (Hover Pause) 檢驗】');
  elements.hoverPause.checked = true;
  elements.hoverPause.dispatchEvent('change');
  assert.deepStrictEqual(syncSetCalls[syncSetCalls.length - 1], { hoverPause: true }, '切換懸停暫停必須向 storage.sync.set 寫入 hoverPause: true');
  console.log('  - 懸停暫停核取方塊 change 事件 -> storage.sync.set: ✅ PASS\n');

  // ------------------------------------------------------------------
  // 6. 時間軸微調按鈕點擊 (Subtitle Offset Click Integration)
  // ------------------------------------------------------------------
  console.log('【6. 時間軸微調按鈕點擊 (Subtitle Offset: Minus / Plus / Reset) 檢驗】');
  // 點擊 #offsetMinus (提前 0.2s: +0.2)
  elements.offsetMinus.click();
  assert.strictEqual(elements.offsetDisplay.textContent, '+0.2s', '點擊提前0.2秒後文字應顯示 +0.2s');
  assert.deepStrictEqual(syncSetCalls[syncSetCalls.length - 1], { subtitleOffset: 0.2 }, '點擊提前0.2秒後 storage.sync.set 應為 0.2');

  // 再點擊 #offsetMinus (再提前 0.2s: +0.4)
  elements.offsetMinus.click();
  assert.strictEqual(elements.offsetDisplay.textContent, '+0.4s', '再點擊提前0.2秒後文字應顯示 +0.4s');
  assert.deepStrictEqual(syncSetCalls[syncSetCalls.length - 1], { subtitleOffset: 0.4 }, '再點擊提前0.2秒後 storage.sync.set 應為 0.4');

  // 點擊 #offsetPlus (延後 0.2s: -0.2 -> 回到 +0.2)
  elements.offsetPlus.click();
  assert.strictEqual(elements.offsetDisplay.textContent, '+0.2s', '點擊延後0.2秒後文字應回到 +0.2s');
  assert.deepStrictEqual(syncSetCalls[syncSetCalls.length - 1], { subtitleOffset: 0.2 }, '點擊延後0.2秒後 storage.sync.set 應為 0.2');

  // 點擊 #offsetReset (歸零)
  elements.offsetReset.click();
  assert.strictEqual(elements.offsetDisplay.textContent, '0.0s', '點擊重設後文字應回到 0.0s');
  assert.deepStrictEqual(syncSetCalls[syncSetCalls.length - 1], { subtitleOffset: 0 }, '點擊重設後 storage.sync.set 應為 0');

  console.log('  - #offsetMinus 點擊提前與顯示同步: ✅ PASS');
  console.log('  - #offsetPlus 點擊延後與顯示同步: ✅ PASS');
  console.log('  - #offsetReset 點擊重設與顯示同步: ✅ PASS\n');

  console.log('🏆【Popup 設定面板真實事件整合測試】全部通過！\n');
  return { success: true };
}

if (require.main === module) {
  runPopupSettingsIntegrationTest();
}

module.exports = { runPopupSettingsIntegrationTest };
