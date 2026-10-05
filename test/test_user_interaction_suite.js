/**
 * test_user_interaction_suite.js
 * 
 * 專屬自動化測試套件：全面覆蓋使用者互動與邊界功能 (真實 Production Path)
 * 
 * 涵蓋範疇：
 * 1. 字幕選詞反白與 Tooltip 互動全流程 (選詞、翻譯回填、聽原聲、TTS 朗讀、關閉)
 * 2. 時間軸偏置微調 (Subtitle Sync Offset: 提前 0.2s / 延後 0.2s / 歸零)
 * 3. 播放中動態切換目標翻譯語言 (Dynamic Target Language Switch & Invalidation via handleStorageChange)
 * 4. YouTube 廣告播放狀態避讓 (ad-showing / ad-interrupting 字幕自動隱藏 via onTimeUpdate)
 * 5. YouTube Shorts 短影音播放器適配 (Shorts URL 正則與 active reel player 選取)
 * 6. YouTube 原生自動翻譯軌道參數修補 (執行真實 inject.js 產權代碼)
 * 7. 點擊空白處自動關閉選詞彈窗 (Click-outside dismissal via handleDocumentMouseDown)
 * 8. Chrome Storage 設定事件連線 (handleStorageChange settings wiring)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  session,
  scheduler,
  renderer,
  tooltipCtrl,
  handleSubtitleMouseUp,
  handleDocumentMouseDown,
  handleStorageChange,
  onTimeUpdate,
  getActiveCue,
  prioritizeCurrentSentence,
  checkAndTriggerSlidingWindow,
  renderCurrentSubtitle,
  isShortsPage,
  getCurrentVideoId,
  getActivePlayer,
  getActiveVideo
} = require('../src/content-entry');

async function runUserInteractionSuite() {
  console.log('========================================================');
  console.log('🧪 執行【專屬使用者互動與邊界功能測試 (User Interaction Suite)】');
  console.log('========================================================\n');

  // ------------------------------------------------------------------
  // 1. 字幕選詞反白與 Tooltip 互動全流程
  // ------------------------------------------------------------------
  console.log('【1. 字幕選詞反白與 Tooltip 互動全流程檢驗】');

  session.isExtensionEnabled = true;
  session.isCaptionsEnabled = true;
  session.userTargetLang = 'zh-TW';
  session.sentenceList = [
    {
      start: 1.0,
      end: 5.0,
      origText: 'This is an extraordinary test sentence.',
      transText: '這是一個非凡的測試句子。',
      status: 'done',
      subCues: [{ start: 1.0, end: 5.0, text: 'This is an extraordinary test sentence.' }]
    }
  ];

  let playedSnippetStart = null;
  let playedSnippetEnd = null;
  let spokenText = null;
  let spokenLang = null;

  // Mock 瀏覽器 Web Speech API
  global.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
      this.lang = '';
      this.rate = 1.0;
    }
  };
  global.window = global.window || {};
  global.window.postMessage = global.window.postMessage || (() => {});
  global.window.addEventListener = global.window.addEventListener || (() => {});
  global.window.removeEventListener = global.window.removeEventListener || (() => {});
  global.window.speechSynthesis = {
    cancel: () => {},
    speak: (utterance) => {
      spokenText = utterance.text;
      spokenLang = utterance.lang;
    }
  };

  class MockDOMElement {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase();
      this.className = '';
      this.id = '';
      this.textContent = '';
      this.children = [];
      this.parentElement = null;
      this.listeners = {};
      this.style = { display: '', left: '', top: '' };
      this.classList = {
        _classes: new Set(),
        add: (c) => this.classList._classes.add(c),
        remove: (c) => this.classList._classes.delete(c),
        contains: (c) => this.classList._classes.has(c)
      };
    }
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }
    querySelector(sel) {
      for (const c of this.children) {
        if ((c.id && `#${c.id}` === sel) || (c.className && `.${c.className}` === sel)) return c;
        const sub = c.querySelector?.(sel);
        if (sub) return sub;
      }
      return null;
    }
    contains(node) {
      if (!node) return false;
      if (node === this) return true;
      for (const c of this.children) {
        if (c === node || (c.contains && c.contains(node))) return true;
      }
      return false;
    }
    addEventListener(event, fn) { this.listeners[event] = fn; }
    removeEventListener(event, fn) { delete this.listeners[event]; }
    click() { if (this.listeners.click) this.listeners.click({ stopPropagation: () => {} }); }
  }

  // 建立 Mock DOM 結構
  const mockTooltipEl = new MockDOMElement('div');
  mockTooltipEl.id = tooltipCtrl.tooltipId;
  mockTooltipEl.style.display = 'none';
  mockTooltipEl.offsetWidth = 230;
  mockTooltipEl.offsetHeight = 100;

  const mockVideo = {
    currentTime: 2.0,
    paused: false,
    play: async () => {},
    pause: () => {}
  };

  const mockPlayer = new MockDOMElement('div');
  mockPlayer.id = 'movie_player';
  mockPlayer.appendChild(mockTooltipEl);
  mockPlayer.getBoundingClientRect = () => ({ left: 100, top: 100, width: 800, height: 450, right: 900, bottom: 550 });
  const origPlayerQuery = mockPlayer.querySelector.bind(mockPlayer);
  mockPlayer.querySelector = (sel) => {
    if (sel === 'video') return mockVideo;
    if (sel === `#${tooltipCtrl.tooltipId}`) return mockTooltipEl;
    return origPlayerQuery(sel);
  };

  const mockDoc = {
    createElement: (tag) => new MockDOMElement(tag),
    getElementById: (id) => {
      if (id === tooltipCtrl.tooltipId) return mockTooltipEl;
      if (id === 'movie_player') return mockPlayer;
      return null;
    },
    querySelector: (sel) => {
      if (sel === '#movie_player') return mockPlayer;
      if (sel === 'video') return mockVideo;
      if (sel === `#${tooltipCtrl.tooltipId}`) return mockTooltipEl;
      return null;
    }
  };
  mockPlayer.ownerDocument = mockDoc;
  mockTooltipEl.ownerDocument = mockDoc;
  global.document = mockDoc;

  // 1.1 測試反白空文字時自動隱藏
  global.window.getSelection = () => ({
    toString: () => '   ',
    getRangeAt: () => null
  });
  handleSubtitleMouseUp({ stopPropagation: () => {} });
  assert.strictEqual(mockTooltipEl.style.display, 'none', '反白文字為空時應隱藏 Tooltip');

  // 1.2 測試反白有效單字 'extraordinary'
  let translationRequestedText = null;
  scheduler.sendRuntimeMessage = (msg, cb) => {
    if (msg.action === 'translate') {
      translationRequestedText = msg.text;
      cb({ translatedText: '非凡的' });
    }
  };

  global.window.getSelection = () => ({
    toString: () => 'extraordinary',
    getRangeAt: () => ({
      getBoundingClientRect: () => ({ left: 200, top: 300, right: 280, bottom: 320, width: 80, height: 20 })
    })
  });

  handleSubtitleMouseUp({ stopPropagation: () => {} });
  assert.strictEqual(mockTooltipEl.style.display, 'block', '選取單詞後 Tooltip 必須顯示');
  assert.strictEqual(translationRequestedText, 'extraordinary', '選詞後必須發起對應單詞的翻譯請求');

  const transBody = mockTooltipEl.querySelector('#tooltipTransBody');
  assert.ok(transBody, 'Tooltip 必須包含 tooltipTransBody 節點');
  assert.strictEqual(transBody.textContent, '非凡的', '翻譯結果必須成功回填至 Tooltip 內容');

  // 1.3 測試點擊「🎬 聽原聲」
  const btnPlay = mockTooltipEl.querySelector('#btnPlaySnippet');
  assert.ok(btnPlay, '必須存在 🎬 聽原聲 按鈕');
  btnPlay.click();
  assert.ok(mockVideo.currentTime >= 0.9 && mockVideo.currentTime <= 1.05, '點擊聽原聲應跳轉至原音起點');

  // 1.4 測試點擊「🗣️ 朗讀」
  const btnSpeak = mockTooltipEl.querySelector('#btnSpeakWord');
  assert.ok(btnSpeak, '必須存在 🗣️ 朗讀 按鈕');
  btnSpeak.click();
  assert.strictEqual(spokenText, 'extraordinary', '朗讀內容必須為選取的單字');

  // 1.5 測試點擊「✕」關閉按鈕
  const closeBtn = mockTooltipEl.querySelector('#tooltipCloseBtn');
  assert.ok(closeBtn, '必須存在 ✕ 關閉按鈕');
  closeBtn.click();
  assert.strictEqual(mockTooltipEl.style.display, 'none', '點擊關閉按鈕後 Tooltip 必須隱藏');

  // 1.6 測試翻譯受限/失敗時的警告提示
  scheduler.clearCache();
  global.window.getSelection = () => ({
    toString: () => 'failingword',
    getRangeAt: () => ({
      getBoundingClientRect: () => ({ left: 200, top: 300, right: 280, bottom: 320, width: 80, height: 20 })
    })
  });
  scheduler.sendRuntimeMessage = (msg, cb) => {
    if (msg.action === 'translate') cb(null);
  };
  handleSubtitleMouseUp({ stopPropagation: () => {} });
  const updatedTransBody = mockTooltipEl.querySelector('#tooltipTransBody');
  assert.strictEqual(updatedTransBody.textContent.includes('翻譯暫時受限'), true, '翻譯失敗時應顯示受限提示');

  console.log('  - 字幕反白選詞觸發 Tooltip: ✅ PASS');
  console.log('  - 非同步單詞翻譯回填: ✅ PASS');
  console.log('  - 聽原聲按鈕跳轉播放: ✅ PASS');
  console.log('  - 語音朗讀調用 Web Speech: ✅ PASS');
  console.log('  - 關閉按鈕與失敗防禦: ✅ PASS\n');

  // ------------------------------------------------------------------
  // 2. 時間軸偏置微調 (Subtitle Sync Offset: +/- 0.2s, 歸零)
  // ------------------------------------------------------------------
  console.log('【2. 時間軸偏置微調 (Subtitle Sync Offset) 檢驗】');

  session.sentenceList = [
    { start: 2.0, end: 5.0, origText: 'Sentence A', transText: '句子A', status: 'done' },
    { start: 6.0, end: 9.0, origText: 'Sentence B', transText: '句子B', status: 'done' }
  ];

  // 2.1 基準無偏置 (offset = 0)
  session.subtitleOffset = 0;
  let cueAt1_9 = getActiveCue(1.9);
  assert.strictEqual(cueAt1_9, null, '無偏置下 1.9s 不應命中 2.0s 開始的句子A');

  // 2.2 提前 0.2 秒 (offset = +0.2s: adjustedTime = 1.9 + 0.2 = 2.1s)
  session.subtitleOffset = 0.2;
  cueAt1_9 = getActiveCue(1.9);
  assert.ok(cueAt1_9, '提前 0.2s 後，1.9s 應成功提前命中句子A');
  assert.strictEqual(cueAt1_9.currentSentence.origText, 'Sentence A');

  // 2.3 延後 0.2 秒 (offset = -0.2s: adjustedTime = 2.1 - 0.2 = 1.9s)
  session.subtitleOffset = -0.2;
  const cueAt2_1 = getActiveCue(2.1);
  assert.strictEqual(cueAt2_1, null, '延後 0.2s 後，2.1s 不應命中句子A');

  // 2.4 透過 production handleStorageChange 觸發 offset 變更
  handleStorageChange({ subtitleOffset: { newValue: 0.2 } }, 'sync');
  assert.strictEqual(session.subtitleOffset, 0.2, 'handleStorageChange 應成功同步 subtitleOffset 到 0.2');

  handleStorageChange({ subtitleOffset: { newValue: 0 } }, 'sync');
  assert.strictEqual(session.subtitleOffset, 0, 'handleStorageChange 應成功歸零 subtitleOffset');

  console.log('  - Subtitle Offset 時間戳位移計算: ✅ PASS');
  console.log('  - 提前/延後雙向偏置檢驗: ✅ PASS');
  console.log('  - production storage change offset 事件連線: ✅ PASS\n');

  // ------------------------------------------------------------------
  // 3. 影片播放中動態切換目標翻譯語言 (Priority 1: Real Regression Path)
  // ------------------------------------------------------------------
  console.log('【3. 播放中動態切換目標翻譯語言檢驗 (Priority 1: Real Invalidation)】');

  // 初始狀態：句子已翻譯完成 (status = 'done')，譯文為中文
  session.userTargetLang = 'zh-TW';
  session.sentenceList = [
    { start: 1.0, end: 5.0, origText: 'Testing language switch', transText: '舊譯文 (zh-TW)', status: 'done' }
  ];
  let requestedLanguages = [];
  scheduler.sendRuntimeMessage = (msg, cb) => {
    if (msg.action === 'translate') {
      requestedLanguages.push(msg.targetLang);
      cb({ translatedText: `[${msg.targetLang}] 測試譯文` });
    }
  };

  // 觸發 production storage change listener: targetLang -> ja
  // 測試不可自行修改 sentenceList[0].status = 'idle'！
  handleStorageChange({ targetLang: { newValue: 'ja' } }, 'sync');

  // 驗證 production listener 自動讓所有句子狀態失效為 idle，並觸發重新翻譯
  assert.strictEqual(session.userTargetLang, 'ja', 'session 目標語言應更新為 ja');
  assert.strictEqual(requestedLanguages.includes('ja'), true, '切換語言後 production handler 必須發起 ja 翻譯請求');
  assert.strictEqual(session.sentenceList[0].transText, '[ja] 測試譯文', '舊翻譯失效後，新譯文必須套用為日文');
  assert.strictEqual(session.sentenceList[0].status, 'done', '重新翻譯後狀態應為 done');

  console.log('  - 目標語言動態切換: ✅ PASS');
  console.log('  - 舊翻譯自動作廢與新語言重譯 (真實 production path): ✅ PASS\n');

  // ------------------------------------------------------------------
  // 3.2 Mode 2 串流模式下動態切換目標翻譯語言 (Task 8: Mode 2 Target Language Switch)
  // ------------------------------------------------------------------
  console.log('【3.2 Mode 2 串流模式動態切換目標翻譯語言檢驗 (Task 8)】');

  // 設置 Mode 2 狀態：無 sentenceList，但當前槽位有字幕
  session.sentenceList = [];
  session.userTargetLang = 'zh-TW';
  session.currSlot = { orig: 'Good morning', trans: '早安 (zh-TW)' };
  session.prevSlot = { orig: 'Hello everyone', trans: '大家好 (zh-TW)' };

  let mode2RequestedLanguages = [];
  scheduler.sendRuntimeMessage = (msg, cb) => {
    if (msg.action === 'translate') {
      mode2RequestedLanguages.push({ targetLang: msg.targetLang, text: msg.text });
      cb({ translatedText: `[${msg.targetLang}] ${msg.text}` });
    }
  };

  // 觸發 production storage change: targetLang -> ja
  handleStorageChange({ targetLang: { newValue: 'ja' } }, 'sync');

  // 1. 舊語言譯文必須立即被清除 (Old translation cleared: YES)
  assert.strictEqual(session.currSlot.trans, '', '舊當前槽位中文譯文必須立即清除');
  assert.notStrictEqual(session.prevSlot.trans, '大家好 (zh-TW)', '舊上一槽位中文譯文必須被清除');
  assert.strictEqual(session.userTargetLang, 'ja', '目標語言已切換為 ja');

  // 2. 等候 debouncedTranslateLiveProgress 觸發即時翻譯 (350ms debounce)
  await new Promise(resolve => setTimeout(resolve, 400));

  // 3. 驗證新 targetLang = ja 請求已被發送 (New target language request emitted: YES)
  const jaRequests = mode2RequestedLanguages.filter(r => r.targetLang === 'ja');
  assert.strictEqual(jaRequests.length > 0, true, '必須向 background 發起 targetLang === ja 翻譯請求');

  // 4. 驗證新日文譯文成功渲染至 session.currSlot (New translation rendered: YES)
  assert.strictEqual(session.currSlot.trans.includes('[ja]'), true, '新日文譯文應成功填入當前槽位');
  assert.strictEqual(session.currSlot.trans.includes('Good morning'), true, '當前槽位譯文應對應 Good morning');

  console.log('  - Mode 2 舊語言譯文即刻清除: ✅ PASS');
  console.log('  - Mode 2 新目標語言翻譯請求重新發送: ✅ PASS');
  console.log('  - Mode 2 新譯文成功渲染回當前槽位: ✅ PASS\n');

  // ------------------------------------------------------------------
  // 4. YouTube 廣告播放狀態避讓 (Priority 8: Real onTimeUpdate Flow)
  // ------------------------------------------------------------------
  console.log('【4. YouTube 廣告播放狀態避讓檢驗 (Priority 8: onTimeUpdate Flow)】');

  let containerEl = mockDoc.getElementById(renderer.containerId);
  if (!containerEl) {
    containerEl = new MockDOMElement('div');
    containerEl.id = renderer.containerId;
    mockPlayer.appendChild(containerEl);
  }
  const origGetElementById = mockDoc.getElementById;
  mockDoc.getElementById = (id) => {
    if (id === renderer.containerId) return containerEl;
    return origGetElementById(id);
  };

  session.isExtensionEnabled = true;
  session.isCaptionsEnabled = true;
  session.sentenceList = [
    { start: 1.0, end: 5.0, origText: 'Ad avoidance sentence', transText: '廣告避讓測試', status: 'done' }
  ];
  mockVideo.currentTime = 2.0;

  // 正常播放狀態下呼叫 onTimeUpdate() -> 字幕應顯示且 player 帶有 active 類名
  mockPlayer.classList.remove('ad-showing');
  mockPlayer.classList.remove('ad-interrupting');
  onTimeUpdate();
  assert.notStrictEqual(containerEl.style.display, 'none', '正常播放時字幕容器不可被隱藏');
  assert.strictEqual(mockPlayer.classList.contains('yt-dual-sub-active'), true, '正常播放時播放器應掛載 yt-dual-sub-active');

  // 4.1 模擬進入 ad-showing 狀態 -> 呼叫 production onTimeUpdate()
  mockPlayer.classList.add('ad-showing');
  onTimeUpdate();
  assert.strictEqual(containerEl.style.display, 'none', '遭遇 ad-showing 廣告時 production onTimeUpdate 必須隱藏字幕容器');
  assert.strictEqual(mockPlayer.classList.contains('yt-dual-sub-active'), false, '遭遇廣告時必須移除 yt-dual-sub-active 標記');

  // 4.2 模擬進入 ad-interrupting 狀態 -> 呼叫 production onTimeUpdate()
  mockPlayer.classList.remove('ad-showing');
  mockPlayer.classList.add('ad-interrupting');
  onTimeUpdate();
  assert.strictEqual(containerEl.style.display, 'none', '遭遇 ad-interrupting 廣告時 production onTimeUpdate 必須隱藏字幕容器');
  assert.strictEqual(mockPlayer.classList.contains('yt-dual-sub-active'), false, '遭遇廣告時必須移除 yt-dual-sub-active 標記');

  // 4.3 廣告結束 -> 呼叫 production onTimeUpdate() -> 字幕自動恢復渲染
  mockPlayer.classList.remove('ad-interrupting');
  onTimeUpdate();
  assert.notStrictEqual(containerEl.style.display, 'none', '廣告結束後 production onTimeUpdate 應自動恢復字幕渲染');
  assert.strictEqual(mockPlayer.classList.contains('yt-dual-sub-active'), true, '廣告結束後應恢復 yt-dual-sub-active');

  console.log('  - 廣告播放狀態 (ad-showing / ad-interrupting) 觸發 renderer.hide: ✅ PASS');
  console.log('  - 廣告結束後字幕即時恢復與 active class 重建: ✅ PASS\n');

  // ------------------------------------------------------------------
  // 5. YouTube Shorts 短影音播放器適配 (Priority 9: Shorts Real Player Selection)
  // ------------------------------------------------------------------
  console.log('【5. YouTube Shorts 短影音播放器適配檢驗 (Priority 9: Active Player Selection)】');

  // 5.1 測試 Shorts 網址正則識別
  global.window.location = { href: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' };
  assert.strictEqual(isShortsPage(), true, '應成功判定為 Shorts 頁面');
  assert.strictEqual(getCurrentVideoId(), 'dQw4w9WgXcQ', '應精準提取 Shorts 影片 ID');

  global.window.location = { href: 'https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share' };
  assert.strictEqual(getCurrentVideoId(), 'dQw4w9WgXcQ', '帶 query 參數時應精準提取 Shorts 影片 ID');

  // 5.2 一般影片
  global.window.location = { href: 'https://www.youtube.com/watch?v=K7qz54nsWf0' };
  assert.strictEqual(isShortsPage(), false, '一般觀看頁面不應判定為 Shorts');
  assert.strictEqual(getCurrentVideoId(), 'K7qz54nsWf0', '一般觀看頁面應提取 v 參數 ID');

  // 5.3 測試 Shorts vs 正常頁面的 getActivePlayer() 與 getActiveVideo()
  const inactiveShortsPlayer = new MockDOMElement('div');
  inactiveShortsPlayer.className = 'html5-video-player';
  const inactiveVideo = { id: 'inactiveVideo' };
  inactiveShortsPlayer.querySelector = (s) => s === 'video' ? inactiveVideo : null;

  const inactiveReelRenderer = new MockDOMElement('ytd-reel-video-renderer');
  inactiveReelRenderer.appendChild(inactiveShortsPlayer);

  const activeShortsPlayer = new MockDOMElement('div');
  activeShortsPlayer.className = 'html5-video-player';
  const activeVideo = { id: 'activeVideo' };
  activeShortsPlayer.querySelector = (s) => s === 'video' ? activeVideo : null;

  const activeReelRenderer = new MockDOMElement('ytd-reel-video-renderer');
  activeReelRenderer.appendChild(activeShortsPlayer);

  global.window.location = { href: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' };
  const origDocQuery = mockDoc.querySelector;
  mockDoc.querySelector = (sel) => {
    if (isShortsPage()) {
      if (sel === 'ytd-reel-video-renderer[is-active] .html5-video-player') return activeShortsPlayer;
      if (sel === 'ytd-reel-video-renderer[is-active] video') return activeVideo;
      if (sel === 'ytd-reel-video-renderer[is-active]') return activeReelRenderer;
    }
    if (sel === '#movie_player') return mockPlayer;
    return origDocQuery(sel);
  };
  activeReelRenderer.querySelector = (sel) => {
    if (sel === '.html5-video-player') return activeShortsPlayer;
    if (sel === 'video') return activeVideo;
    return null;
  };

  const selectedShortsPlayer = getActivePlayer();
  assert.strictEqual(selectedShortsPlayer, activeShortsPlayer, 'Shorts 頁面必須精準選中 is-active renderer 內的播放器，而非其他 reel');
  const selectedShortsVideo = getActiveVideo();
  assert.strictEqual(selectedShortsVideo, activeVideo, 'Shorts 頁面必須精準選中 is-active renderer 內的 video');

  // 切回一般觀看頁面
  global.window.location = { href: 'https://www.youtube.com/watch?v=K7qz54nsWf0' };
  const watchPlayer = getActivePlayer();
  assert.strictEqual(watchPlayer, mockPlayer, '一般觀看頁面應選中 #movie_player');
  mockDoc.querySelector = origDocQuery;

  console.log('  - Shorts 網址格式與 ID 提取: ✅ PASS');
  console.log('  - 一般影片與 Shorts 互斥判斷: ✅ PASS');
  console.log('  - Shorts is-active 活躍播放器精確選取: ✅ PASS\n');

  // ------------------------------------------------------------------
  // 6. YouTube 原生自動翻譯軌道參數修補 (Priority 7: Real inject.js Execution)
  // ------------------------------------------------------------------
  console.log('【6. YouTube 原生自動翻譯軌道修補機制檢驗 (Priority 7: Real inject.js)】');

  let postedMessages = [];
  const messageListeners = [];
  const sandboxWindowListeners = {};

  const sandboxWindow = {
    addEventListener: (type, fn) => {
      if (type === 'message') {
        messageListeners.push(fn);
      } else {
        sandboxWindowListeners[type] = sandboxWindowListeners[type] || [];
        sandboxWindowListeners[type].push(fn);
      }
    },
    removeEventListener: (type, fn) => {
      if (type === 'message') {
        const idx = messageListeners.indexOf(fn);
        if (idx !== -1) messageListeners.splice(idx, 1);
      }
    },
    postMessage: (msg) => {
      postedMessages.push(msg);
    },
    location: { href: 'https://www.youtube.com/watch?v=mock_inject_vid' },
    ytInitialPlayerResponse: null
  };

  const mockSandboxPlayer = {
    getOption: (module, opt) => {
      if (module === 'captions' && opt === 'track') {
        return {
          vss_id: '.en',
          languageCode: 'en',
          translationLanguage: {
            languageCode: 'ja',
            languageName: { simpleText: 'Japanese' }
          }
        };
      }
      return null;
    },
    getPlayerResponse: () => ({
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              vssId: '.en',
              languageCode: 'en',
              baseUrl: 'https://www.youtube.com/api/timedtext'
            }
          ]
        }
      }
    }),
    querySelector: () => null,
    addEventListener: () => {}
  };

  const sandboxDoc = {
    querySelector: (sel) => {
      if (sel === '#movie_player') return mockSandboxPlayer;
      return null;
    },
    getElementById: (id) => (id === 'movie_player' ? mockSandboxPlayer : null),
    addEventListener: () => {}
  };

  const sandbox = {
    window: sandboxWindow,
    document: sandboxDoc,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math,
    JSON,
    AbortController,
    fetch: async () => ({ ok: true, json: async () => ({}) })
  };
  let simulatedTime = 1000000;
  sandbox.Date = class extends Date {
    static now() { return simulatedTime; }
    getTime() { return simulatedTime; }
  };

  const injectCode = fs.readFileSync(path.resolve(__dirname, '../inject.js'), 'utf8');
  vm.runInNewContext(injectCode, sandbox);

  // 時間推進超過 100ms 節流閥，並模擬 content-entry 發送 YT_REQUEST_CURRENT_TRACK
  simulatedTime += 200;
  postedMessages = [];
  const reqEvent = {
    source: sandboxWindow,
    data: { type: 'YT_REQUEST_CURRENT_TRACK' }
  };
  for (const fn of messageListeners) {
    fn(reqEvent);
  }

  const trackChangedMsg = postedMessages.find(m => m.type === 'YT_CAPTION_TRACK_CHANGED');
  assert.ok(trackChangedMsg, 'inject.js 必須回應 YT_CAPTION_TRACK_CHANGED 訊息');
  assert.strictEqual(trackChangedMsg.enabled, true, '字幕軌道應為 enabled');
  assert.strictEqual(trackChangedMsg.track.languageCode, 'ja', 'inject.js production 必須將主語言代碼修補為 ja');
  assert.strictEqual(trackChangedMsg.track.targetTlang, 'ja', 'inject.js production 必須修補 targetTlang 為 ja');

  console.log('  - 執行真實 inject.js 產權代碼: ✅ PASS');
  console.log('  - 原生自動翻譯 targetTlang 與 languageCode 完整修補: ✅ PASS\n');

  // ------------------------------------------------------------------
  // 7. 點擊空白處自動關閉選詞彈窗 (Priority 10: Real handleDocumentMouseDown Event)
  // ------------------------------------------------------------------
  console.log('【7. 點擊空白處自動關閉選詞彈窗檢驗 (Priority 10: handleDocumentMouseDown)】');

  mockTooltipEl.style.display = 'block';
  assert.strictEqual(mockTooltipEl.style.display, 'block', '先設置 Tooltip 處於顯示狀態');

  // 7.1 點擊在 Tooltip 內部：不應隱藏
  handleDocumentMouseDown({ target: mockTooltipEl });
  assert.strictEqual(mockTooltipEl.style.display, 'block', '點擊 Tooltip 內部時不可隱藏');

  // 7.2 點擊在字幕容器內部：不應隱藏
  const subContainer = mockDoc.getElementById(renderer.containerId);
  handleDocumentMouseDown({ target: subContainer });
  assert.strictEqual(mockTooltipEl.style.display, 'block', '點擊字幕容器內部時不可隱藏');

  // 7.3 點擊在外部元素：應隱藏 Tooltip
  const outsideElement = new MockDOMElement('div');
  outsideElement.id = 'outside-player-area';
  handleDocumentMouseDown({ target: outsideElement });
  assert.strictEqual(mockTooltipEl.style.display, 'none', '點擊空白處後 production listener 必須隱藏 Tooltip');

  console.log('  - 點擊 Tooltip 與字幕內部維持顯示: ✅ PASS');
  console.log('  - 點擊空白處透過 handleDocumentMouseDown 關閉 Tooltip: ✅ PASS\n');

  // ------------------------------------------------------------------
  // 8. Chrome Storage 設定事件連線 (Priority 11 & 12: Settings Wiring)
  // ------------------------------------------------------------------
  console.log('【8. Chrome Storage 設定事件連線檢驗 (Settings Event Wiring)】');

  // 8.1 擴充功能開關
  session.isExtensionEnabled = true;
  handleStorageChange({ extensionEnabled: { newValue: false } }, 'sync');
  assert.strictEqual(session.isExtensionEnabled, false, 'extensionEnabled=false 應同步至 session');
  handleStorageChange({ extensionEnabled: { newValue: true } }, 'sync');
  assert.strictEqual(session.isExtensionEnabled, true, 'extensionEnabled=true 應同步至 session');

  // 8.2 UI 字體大小
  handleStorageChange({ uiSize: { newValue: 'large' } }, 'sync');
  assert.strictEqual(session.userUiSize, 'large', 'uiSize=large 應同步至 session');

  // 8.3 懸停暫停
  handleStorageChange({ hoverPause: { newValue: true } }, 'sync');
  assert.strictEqual(session.isHoverPauseEnabled, true, 'hoverPause=true 應同步至 session');

  // 8.4 時間軸偏置
  handleStorageChange({ subtitleOffset: { newValue: 0.4 } }, 'sync');
  assert.strictEqual(session.subtitleOffset, 0.4, 'subtitleOffset=0.4 應同步至 session');

  console.log('  - master toggle / uiSize / hoverPause / subtitleOffset 設定連線: ✅ PASS\n');

  return { success: true };
}

if (require.main === module) {
  runUserInteractionSuite();
}

module.exports = { runUserInteractionSuite };
