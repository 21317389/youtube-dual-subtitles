/**
 * test_caption_fallback_matrix.js
 * 
 * 真實字幕通道階梯降級矩陣測試 (Priority 5: Caption Transport Fallback Matrix)
 * 
 * 測試架構：
 * 執行 production loadCaptionTrack(track)，透過真實 postMessage 通訊與狀態移轉驗證：
 *   Case A: InnerTube 成功 -> 不應呼叫 timedtext 與 get_transcript -> 進入 Mode 1
 *   Case B: InnerTube 失敗 -> timedtext 成功 -> 不應呼叫 get_transcript -> 進入 Mode 1
 *   Case C: InnerTube 失敗 -> timedtext 失敗 -> get_transcript 成功 -> 進入 Mode 1
 *   Case D: 所有靜態 fetch 均失敗 -> Mode 2 native caption observer 接手運行
 */

const assert = require('assert');
const {
  session,
  renderer,
  loadCaptionTrack
} = require('../src/content-entry');

async function runCaptionFallbackMatrixTest() {
  console.log('========================================================');
  console.log('🧪 執行【字幕通道階梯降級矩陣測試 (Priority 5: Fallback Matrix)】');
  console.log('========================================================\n');

  // 1. 環境 Mock 準備
  let requestsSent = [];
  let messageHandlers = [];

  global.window = global.window || {};
  global.window.window = global.window;
  global.window.addEventListener = (event, handler) => {
    if (event === 'message') messageHandlers.push(handler);
  };
  global.window.removeEventListener = (event, handler) => {
    if (event === 'message') {
      const idx = messageHandlers.indexOf(handler);
      if (idx !== -1) messageHandlers.splice(idx, 1);
    }
  };

  let mockPostMessageResponder = () => {};
  global.window.postMessage = (data, targetOrigin) => {
    if (!data || !data.type) return;
    requestsSent.push(data.type);
    setImmediate(() => {
      mockPostMessageResponder(data);
    });
  };

  global.requestAnimationFrame = global.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
  global.cancelAnimationFrame = global.cancelAnimationFrame || ((id) => clearTimeout(id));

  const mutationObserverInstances = [];
  global.MutationObserver = class {
    constructor(cb) {
      this.cb = cb;
      this.isObserving = false;
      mutationObserverInstances.push(this);
    }
    observe() { this.isObserving = true; }
    disconnect() { this.isObserving = false; }
  };

  class MockElement {
    constructor(tagName, id = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.style = {};
      this.classList = {
        _classes: new Set(),
        add: (c) => this.classList._classes.add(c),
        remove: (c) => this.classList._classes.delete(c),
        contains: (c) => this.classList._classes.has(c)
      };
      this.children = [];
    }
    appendChild(c) { this.children.push(c); return c; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    addEventListener() {}
    removeEventListener() {}
  }

  const mockPlayerEl = new MockElement('div', 'movie_player');
  const mockContainerEl = new MockElement('div', renderer.containerId);
  mockPlayerEl.appendChild(mockContainerEl);

  global.document = {
    getElementById: (id) => {
      if (id === renderer.containerId) return mockContainerEl;
      if (id === 'movie_player') return mockPlayerEl;
      return null;
    },
    querySelector: (sel) => {
      if (sel === '#movie_player') return mockPlayerEl;
      if (sel === 'video') return { currentTime: 0, paused: true, addEventListener: () => {}, removeEventListener: () => {} };
      return null;
    },
    createElement: (tag) => new MockElement(tag)
  };

  global.chrome = global.chrome || {};
  global.chrome.runtime = global.chrome.runtime || {};
  global.chrome.runtime.sendMessage = (msg, cb) => {
    if (cb) cb({ text: '' });
  };

  function dispatchMessageToWindow(data) {
    const event = { source: global.window, data };
    [...messageHandlers].forEach(h => h(event));
  }

  function resetSession(vid = 'test_vid') {
    requestsSent = [];
    session.isExtensionEnabled = true;
    session.isCaptionsEnabled = true;
    session.sentenceList = [];
    session.lastObservedVideoId = vid;
    session.fetch.inFlightKey = '';
    global.window.location = { href: `https://www.youtube.com/watch?v=${vid}` };
  }

  // ------------------------------------------------------------------
  // Case A: InnerTube 成功 -> 不應呼叫 timedtext 與 get_transcript
  // ------------------------------------------------------------------
  console.log('【Case A: Main World InnerTube 成功】');
  resetSession('vid_a');

  mockPostMessageResponder = (req) => {
    if (req.type === 'YT_FETCH_INNERTUBE_CAPTION_REQUEST') {
      dispatchMessageToWindow({
        type: 'YT_FETCH_INNERTUBE_CAPTION_RESPONSE',
        requestId: req.requestId,
        success: true,
        text: JSON.stringify({
          events: [
            { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'InnerTube Case A Success.' }] }
          ]
        })
      });
    }
  };

  await loadCaptionTrack({ videoId: 'vid_a', languageCode: 'en', baseUrl: 'https://timedtext.com/a' });

  assert.strictEqual(session.sentenceList.length > 0, true, 'InnerTube 成功後應解析出 sentenceList (Mode 1)');
  assert.strictEqual(session.sentenceList[0].origText.includes('InnerTube Case A Success'), true, '首句文字應吻合');
  assert.strictEqual(requestsSent.includes('YT_FETCH_CAPTION_REQUEST'), false, 'InnerTube 成功時絕對不可發起 timedtext 請求');
  assert.strictEqual(requestsSent.includes('YT_FETCH_TRANSCRIPT_REQUEST'), false, 'InnerTube 成功時絕對不可發起 get_transcript 請求');
  console.log('  - InnerTube 命中 -> Mode 1 成功啟動: ✅ PASS');
  console.log('  - 嚴格守門：未觸發次級 timedtext 與逐字稿請求: ✅ PASS\n');

  // ------------------------------------------------------------------
  // Case B: InnerTube 失敗 -> timedtext 成功 -> 不應呼叫 get_transcript
  // ------------------------------------------------------------------
  console.log('【Case B: InnerTube 失敗 -> timedtext 成功】');
  resetSession('vid_b');

  mockPostMessageResponder = (req) => {
    if (req.type === 'YT_FETCH_INNERTUBE_CAPTION_REQUEST') {
      dispatchMessageToWindow({
        type: 'YT_FETCH_INNERTUBE_CAPTION_RESPONSE',
        requestId: req.requestId,
        success: false,
        text: null
      });
    } else if (req.type === 'YT_FETCH_CAPTION_REQUEST') {
      dispatchMessageToWindow({
        type: 'YT_FETCH_CAPTION_RESPONSE',
        requestId: req.requestId,
        success: true,
        text: '<?xml version="1.0" encoding="utf-8" ?><transcript><text start="1.5" dur="2.5">Timedtext Case B Success.</text></transcript>'
      });
    }
  };

  await loadCaptionTrack({ videoId: 'vid_b', languageCode: 'en', baseUrl: 'https://timedtext.com/b' });

  assert.strictEqual(session.sentenceList.length > 0, true, 'timedtext 成功後應解析出 sentenceList (Mode 1)');
  assert.strictEqual(session.sentenceList[0].origText.includes('Timedtext Case B Success'), true, '首句文字應吻合');
  assert.strictEqual(requestsSent.includes('YT_FETCH_INNERTUBE_CAPTION_REQUEST'), true, '必須先嘗試過 InnerTube');
  assert.strictEqual(requestsSent.includes('YT_FETCH_CAPTION_REQUEST'), true, 'InnerTube 失敗後必須呼叫 timedtext');
  assert.strictEqual(requestsSent.includes('YT_FETCH_TRANSCRIPT_REQUEST'), false, 'timedtext 成功時絕對不可呼叫 get_transcript');
  console.log('  - InnerTube 失敗 -> timedtext 順暢降級命中: ✅ PASS');
  console.log('  - 嚴格守門：未觸發次級逐字稿請求: ✅ PASS\n');

  // ------------------------------------------------------------------
  // Case C: InnerTube 失敗 -> timedtext 失敗 -> get_transcript 成功
  // ------------------------------------------------------------------
  console.log('【Case C: InnerTube 失敗 -> timedtext 失敗 -> get_transcript 成功】');
  resetSession('vid_c');

  mockPostMessageResponder = (req) => {
    if (req.type === 'YT_FETCH_INNERTUBE_CAPTION_REQUEST') {
      dispatchMessageToWindow({
        type: 'YT_FETCH_INNERTUBE_CAPTION_RESPONSE',
        requestId: req.requestId,
        success: false,
        text: null
      });
    } else if (req.type === 'YT_FETCH_CAPTION_REQUEST') {
      dispatchMessageToWindow({
        type: 'YT_FETCH_CAPTION_RESPONSE',
        requestId: req.requestId,
        success: false,
        text: null
      });
    } else if (req.type === 'YT_FETCH_TRANSCRIPT_REQUEST') {
      dispatchMessageToWindow({
        type: 'YT_FETCH_TRANSCRIPT_RESPONSE',
        requestId: req.requestId,
        success: true,
        data: {
          events: [
            { tStartMs: 3000, dDurationMs: 2500, segs: [{ utf8: 'Transcript Case C Success.' }] }
          ]
        }
      });
    }
  };

  await loadCaptionTrack({ videoId: 'vid_c', languageCode: 'en', baseUrl: 'https://timedtext.com/c' });

  assert.strictEqual(session.sentenceList.length > 0, true, 'get_transcript 成功後應升級為 Mode 1');
  assert.strictEqual(session.sentenceList[0].origText.includes('Transcript Case C Success'), true, '首句文字應吻合');
  assert.strictEqual(requestsSent.includes('YT_FETCH_INNERTUBE_CAPTION_REQUEST'), true, '必須嘗試過 InnerTube');
  assert.strictEqual(requestsSent.includes('YT_FETCH_CAPTION_REQUEST'), true, '必須嘗試過 timedtext');
  assert.strictEqual(requestsSent.includes('YT_FETCH_TRANSCRIPT_REQUEST'), true, '前兩者失敗後必須呼叫 get_transcript');
  console.log('  - 前兩層失敗 -> get_transcript 三級備援成功升級 Mode 1: ✅ PASS\n');

  // ------------------------------------------------------------------
  // Case D: 所有靜態 fetch 失敗 -> Mode 2 接手運行
  // ------------------------------------------------------------------
  console.log('【Case D: 所有靜態 fetch 失敗 -> Mode 2 串流接手】');
  resetSession('vid_d');

  mockPostMessageResponder = (req) => {
    if (req.type === 'YT_FETCH_INNERTUBE_CAPTION_REQUEST') {
      dispatchMessageToWindow({
        type: 'YT_FETCH_INNERTUBE_CAPTION_RESPONSE',
        requestId: req.requestId,
        success: false,
        text: null
      });
    } else if (req.type === 'YT_FETCH_CAPTION_REQUEST') {
      dispatchMessageToWindow({
        type: 'YT_FETCH_CAPTION_RESPONSE',
        requestId: req.requestId,
        success: false,
        text: null
      });
    } else if (req.type === 'YT_FETCH_TRANSCRIPT_REQUEST') {
      dispatchMessageToWindow({
        type: 'YT_FETCH_TRANSCRIPT_RESPONSE',
        requestId: req.requestId,
        success: false,
        data: null
      });
    }
  };

  await loadCaptionTrack({ videoId: 'vid_d', languageCode: 'en', baseUrl: 'https://timedtext.com/d' });

  assert.strictEqual(session.sentenceList.length, 0, '所有靜態字幕不可用時 sentenceList 必須為空 (非 Mode 1)');
  const lastObserver = mutationObserverInstances[mutationObserverInstances.length - 1];
  assert.ok(lastObserver, '必須實例化 MutationObserver');
  assert.strictEqual(lastObserver.isObserving, true, '靜態字幕全數失敗後 Mode 2 observer 必須處於 active 監聽狀態');
  console.log('  - 全靜態失敗 -> 保全機制啟動，Mode 2 observer 成功接管: ✅ PASS\n');

  console.log('🏆【字幕通道階梯降級矩陣測試】全部通過！\n');
  return { success: true };
}

if (require.main === module) {
  runCaptionFallbackMatrixTest();
}

module.exports = { runCaptionFallbackMatrixTest };
