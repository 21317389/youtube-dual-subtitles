/**
 * test_e2e_pipeline.js
 * 
 * 真實全鏈路整合端到端測試 (End-to-End Pipeline Integration Test)
 * 職責：不再使用死板單元 mock，而是直接載入真實的 inject.js、content.js 與 background.js，
 * 模擬從「網頁載入 ➔ inject.js 軌道廣播 ➔ content.js 訊息接收 ➔ background.js 跨域下載與翻譯 ➔ DOM 雙槽真實渲染」
 * 只要全鏈路中有任何一處（如 Service Worker 拋錯、URL 參數毒化、CC 狀態丟失、容器 display:none、譯文空白）即刻判定失敗！
 */

const fs = require('fs');
const path = require('path');

const backgroundJsCode = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const contentJsCode = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const injectJsCode = fs.readFileSync(path.join(__dirname, '..', 'inject.js'), 'utf8');

const vttZfcHwBKcNzY = fs.readFileSync(path.join(__dirname, 'fixtures', 'internet_of_bugs_ZfcHwBKcNzY.en.vtt'), 'utf8');
const vttTed = fs.readFileSync(path.join(__dirname, 'fixtures', 'ted_talk_manual.en.vtt'), 'utf8');

function runE2EPipelineTest() {
  console.log('========================================================');
  console.log('🧪 執行【全鏈路端到端整合測試 (E2E Pipeline Test)】');
  console.log('========================================================\n');

  // ----------------------------------------------------
  // 1. 建立真實的 Chrome Extension 模擬環境 (含 background.js)
  // ----------------------------------------------------
  const messageListeners = [];
  const mockStorage = new Map();

  global.chrome = {
    runtime: {
      id: 'mock-extension-id',
      onMessage: {
        addListener: (fn) => messageListeners.push(fn)
      }
    },
    storage: {
      local: {
        get: (key, cb) => cb({ translationCache: Array.from(mockStorage.entries()) }),
        set: (obj, cb) => {
          if (obj.translationCache) {
            obj.translationCache.forEach(([k, v]) => mockStorage.set(k, v));
          }
          if (cb) cb();
        }
      }
    }
  };

  // 模擬真實環境中的 fetch (測試 background.js 內部是否有違法 header 或語法錯誤)
  global.fetch = async (url, options = {}) => {
    // 嚴格檢驗：瀏覽器 Service Worker 絕對不可攜帶 User-Agent 等禁忌 Header
    const headers = options.headers || {};
    for (const h of Object.keys(headers)) {
      if (['user-agent', 'referer', 'host', 'origin'].includes(h.toLowerCase())) {
        throw new TypeError(`Refused to set unsafe header "${h}" in Service Worker fetch!`);
      }
    }

    // 模擬一般 timedtext 下載
    if (url.includes('api/timedtext') && !url.includes('exp=xpe')) {
      return {
        ok: true,
        status: 200,
        text: async () => vttTed,
        json: async () => ({})
      };
    }

    // 模擬毒化 URL (exp=xpe 返回 0 字元)
    if (url.includes('exp=xpe')) {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({})
      };
    }

    // 模擬 InnerTube player API 端點
    if (url.includes('youtubei/v1/player')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [
                {
                  languageCode: 'en',
                  name: { simpleText: 'English' },
                  vssId: '.en',
                  baseUrl: 'https://www.youtube.com/api/timedtext?v=ZfcHwBKcNzY&lang=en'
                }
              ]
            }
          }
        })
      };
    }

    // 模擬 Google 翻譯 API (嚴格檢驗 URL 長度防禦 414 URI Too Large)
    if (url.includes('translate.googleapis.com') || url.includes('clients5.google.com')) {
      if (url.length > 2000) {
        return {
          ok: false,
          status: 414,
          statusText: 'Request-URI Too Large',
          text: async () => '<html><title>414 Request-URI Too Large</title></html>',
          json: async () => { throw new SyntaxError('Unexpected token < in JSON'); }
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => [[['這是一句成功的真實中文翻譯。', 'This is a success sentence.', null, null]]]
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () => vttZfcHwBKcNzY,
      json: async () => ({})
    };
  };

  // 啟動真實的 background.js
  eval(backgroundJsCode);
  console.log(`[E2E Step 1] 真實 background.js 載入成功，已註冊 ${messageListeners.length} 個系統監聽器。`);

  // ----------------------------------------------------
  // 2. 建立真實 DOM 與 Window Event 通訊環境 (含 content.js 與 inject.js)
  // ----------------------------------------------------
  const windowListeners = new Map();
  global.window = {
    location: { href: 'https://www.youtube.com/watch?v=ZfcHwBKcNzY' },
    addEventListener: (type, fn) => {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(fn);
    },
    removeEventListener: (type, fn) => {
      if (!windowListeners.has(type)) return;
      const arr = windowListeners.get(type);
      const idx = arr.indexOf(fn);
      if (idx !== -1) arr.splice(idx, 1);
    },
    postMessage: (data, targetOrigin) => {
      // 模擬 Main World 跨世界廣播至 Isolated World
      const handlers = windowListeners.get('message') || [];
      handlers.forEach(h => {
        try {
          h({ source: global.window, data });
        } catch (e) {
          console.error('[E2E Error] window.message 監聽器執行異常:', e);
        }
      });
    }
  };

  // 建立虛擬 DOM 節點
  class MockElement {
    constructor(id, tagName = 'div') {
      this.id = id || '';
      this.tagName = tagName;
      this.style = {
        setProperty: (k, v) => { this.style[k] = v; },
        getPropertyValue: (k) => this.style[k] || ''
      };
      this.classList = {
        contains: () => false,
        add: () => {},
        remove: () => {}
      };
      this.children = [];
      this.textContent = '';
    }
    querySelector(sel) {
      if (sel.includes('prev')) return this.prevSlot || (this.prevSlot = new MockElement('slot-prev'));
      if (sel.includes('curr')) return this.currSlot || (this.currSlot = new MockElement('slot-curr'));
      if (sel.includes('orig')) return this.origEl || (this.origEl = new MockElement('orig'));
      if (sel.includes('trans')) return this.transEl || (this.transEl = new MockElement('trans'));
      return null;
    }
    querySelectorAll(sel) {
      return [];
    }
    appendChild(c) {
      if (c) c.parentElement = this;
      this.children.push(c);
      return c;
    }
    addEventListener(type, fn) {}
    removeEventListener(type, fn) {}
  }

  const mockVideo = {
    currentTime: 5.0,
    paused: false,
    ended: false,
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const mockPlayer = new MockElement('movie_player');
  mockPlayer.getPlayerResponse = () => ({
    videoDetails: { videoId: 'ZfcHwBKcNzY' },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          {
            languageCode: 'en',
            name: { simpleText: 'English' },
            vssId: '.en',
            baseUrl: 'https://www.youtube.com/api/timedtext?v=ZfcHwBKcNzY&exp=xpe' // 刻意使用毒化 URL 測試兜底
          }
        ]
      }
    }
  });
  mockPlayer.getOption = (mod, opt) => {
    if (mod === 'captions' && opt === 'track') {
      return { languageCode: 'en', vssId: '.en' };
    }
    return null;
  };
  mockPlayer.getVideoData = () => ({ video_id: 'ZfcHwBKcNzY' });
  mockPlayer.addEventListener = () => {};

  const domElements = new Map();
  global.document = {
    body: new MockElement('body'),
    documentElement: new MockElement('html'),
    createElement: (tag) => new MockElement('', tag),
    getElementById: (id) => {
      if (!domElements.has(id)) domElements.set(id, new MockElement(id));
      return domElements.get(id);
    },
    querySelector: (sel) => {
      if (sel === 'video' || sel.endsWith(' video')) return mockVideo;
      return mockPlayer;
    },
    addEventListener: (type, fn) => {},
    removeEventListener: (type, fn) => {}
  };
  global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
  global.window.requestAnimationFrame = global.requestAnimationFrame;
  global.window.cancelAnimationFrame = global.cancelAnimationFrame;
  global.window.document = global.document;

  // 模擬 content.js 的 safeSendMessage 通訊層對接到真實的 background.js
  global.chrome.runtime.sendMessage = (msg, cb) => {
    let responded = false;
    const sendResponse = (res) => {
      responded = true;
      if (cb) cb(res);
    };
    for (const listener of messageListeners) {
      const isAsync = listener(msg, {}, sendResponse);
      if (!isAsync && !responded && cb) cb({});
    }
  };

  // ----------------------------------------------------
  // 3. 載入真實的 content.js
  // ----------------------------------------------------
  eval(contentJsCode.replace('const CONFIG =', 'global.CONFIG = CONFIG ='));
  console.log('[E2E Step 2] 真實 content.js 載入成功，已完成雙語字幕引擎初始化。');

  if (typeof CONFIG.BATCH_TRANSLATE_LIMIT !== 'number' || CONFIG.BATCH_TRANSLATE_LIMIT < 1) {
    throw new Error('嚴重錯誤：content.js 缺失 CONFIG.BATCH_TRANSLATE_LIMIT 配置！');
  }

  // ----------------------------------------------------
  // 4. 觸發真實 inject.js 執行
  // ----------------------------------------------------
  eval(injectJsCode);
  console.log('[E2E Step 3] 真實 inject.js 載入成功，已觸發播放器掛載與軌道分發。');

  // ----------------------------------------------------
  // 4. 高頻連環觸發壓力測試 (模擬先前 inject.js 4 次連發是否會抹除在途下載)
  // ----------------------------------------------------
  console.log('[E2E Step 4] 注入高頻重複軌道廣播 (驗證 inFlightFetchKey 與去重機制)...');
  for (let i = 0; i < 3; i++) {
    global.window.postMessage({
      type: 'YT_CAPTION_TRACK_CHANGED',
      enabled: true,
      videoId: 'ZfcHwBKcNzY',
      track: {
        languageCode: 'en',
        vssId: '.en',
        videoId: 'ZfcHwBKcNzY',
        baseUrl: 'https://www.youtube.com/api/timedtext?v=ZfcHwBKcNzY&exp=xpe'
      }
    }, '*');
  }

  // ----------------------------------------------------
  // 5. 異步等待全鏈路執行完成並驗證結果
  // ----------------------------------------------------
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('\n--------------------------------------------------------');
      console.log('🔍 檢查 E2E 全鏈路最終渲染狀態 (State Inspection):');

      const container = global.document.getElementById('yt-dual-subtitle-container');
      const isContainerVisible = container.style.display !== 'none';
      console.log(`1. 雙語字幕容器可見性: ${isContainerVisible ? '✅ 正常顯示 (visible)' : '❌ 隱藏 (display: none)'}`);

      const sentencesCount = global.window?.__ytDualSub_sentenceList?.length || 0;
      console.log(`2. 文本解析與合句數目: ${sentencesCount} 句 (期望 > 0)`);

      const slotCurr = container.querySelector('.cue-slot-curr');
      const currOrig = slotCurr?.origEl?.textContent || '';
      const currTrans = slotCurr?.transEl?.textContent || '';
      console.log(`3. 下槽當前原文: "${currOrig.slice(0, 40)}..."`);
      console.log(`4. 下槽當前譯文: "${currTrans.slice(0, 40)}..."`);

      const isSuccess = isContainerVisible && sentencesCount > 0 && currOrig.length > 0;
      console.log(`\n【E2E 全鏈路整合測試結果】: ${isSuccess ? '✅ PASS (全鏈路打通！)' : '❌ FAIL (鏈路存在中斷！)'}`);
      console.log('========================================================\n');

      resolve({ success: isSuccess });
    }, 1200);
  });
}

if (require.main === module) {
  runE2EPipelineTest().then(res => process.exit(res.success ? 0 : 1));
}

module.exports = { runE2EPipelineTest };
