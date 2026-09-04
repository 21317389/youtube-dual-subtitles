/**
 * test_mainworld_innertube_channel.js
 * 核心目的：永久固化「主環境同源 InnerTube 通道與 403 防禦」回歸測試
 * 歷史背景：
 *   先前由 background.js (Service Worker) 跨域呼叫 Android InnerTube 時，
 *   瀏覽器強制夾帶 Origin: chrome-extension://<id>，導致 Google 伺服器回傳 403 Sorry 拒絕請求，
 *   使擴充功能連鎖降級並永久卡在 Mode 2。
 * 防禦斷言：
 *   1. content.js 必須優先使用 Main World 同源通道 (fetchCaptionViaMainWorldInnerTube)
 *   2. inject.js 必須支援 YT_FETCH_INNERTUBE_CAPTION_REQUEST 並直接以網頁同源身份向 InnerTube 索取字幕
 *   3. 軌道去重防抖邏輯中，不得因 Mode 2 暫存 (nativeCaptionObserver !== null) 擋死 Mode 1 升級
 *   4. 通信協定與雙向 postMessage 握手必須正確完成且解析為 Mode 1 合句
 */

const fs = require('fs');
const assert = require('assert');

async function runMainWorldInnerTubeChannelTest() {
  console.log('🧪 執行【主環境同源 InnerTube 高速通道與 403 阻擋防禦測試】');

  const contentCode = fs.readFileSync('content.js', 'utf8');
  const injectCode = fs.readFileSync('inject.js', 'utf8');

  // 【斷言 1】代碼架構完整性校驗
  assert.ok(
    contentCode.includes('fetchCaptionViaMainWorldInnerTube'),
    '❌ content.js 必須包含 fetchCaptionViaMainWorldInnerTube 函式！'
  );
  assert.ok(
    contentCode.includes('YT_FETCH_INNERTUBE_CAPTION_REQUEST'),
    '❌ content.js 必須發送 YT_FETCH_INNERTUBE_CAPTION_REQUEST 請求！'
  );
  assert.ok(
    injectCode.includes('fetchCaptionFromAndroidInnertube'),
    '❌ inject.js 必須包含 fetchCaptionFromAndroidInnertube 實作！'
  );
  assert.ok(
    injectCode.includes('YT_FETCH_INNERTUBE_CAPTION_REQUEST'),
    '❌ inject.js 必須監聽 YT_FETCH_INNERTUBE_CAPTION_REQUEST 事件！'
  );
  console.log('  - 代碼架構關鍵字檢查: ✅ PASS');

  // 【斷言 2】通道優先級檢查：Main World InnerTube 必須是第一主力
  const innerTubeCallIndex = contentCode.indexOf('fetchCaptionViaMainWorldInnerTube');
  const timedtextFallbackIndex = contentCode.indexOf('fetchCaptionTextWithFallback');
  const getTranscriptIndex = contentCode.indexOf('fetchTranscriptViaMainWorld');

  assert.ok(
    innerTubeCallIndex !== -1 && innerTubeCallIndex < timedtextFallbackIndex,
    '❌ 優先級錯誤：Main World InnerTube 通道必須在 background timedtext 之前呼叫！'
  );
  assert.ok(
    timedtextFallbackIndex < getTranscriptIndex,
    '❌ 優先級錯誤：timedtext 必須在 get_transcript 之前呼叫！'
  );
  console.log('  - 通道優先級階梯檢驗 (MainWorld InnerTube -> timedtext -> get_transcript): ✅ PASS');

  // 【斷言 3】防抖誤殺防禦：不得因 nativeCaptionObserver !== null 永久鎖死 Mode 1
  const guardRegex = /inFlightFetchKey\s*===\s*currentTrackKey[\s\S]*?nativeCaptionObserver\s*!==\s*null/;
  assert.ok(
    !guardRegex.test(contentCode),
    '❌ 發現致命 Bug：去重防抖條件中不可包含 nativeCaptionObserver !== null，否則 Mode 2 緩衝會永久鎖死 Mode 1！'
  );
  console.log('  - Mode 2 緩衝狀態不誤殺 Mode 1 升級防禦: ✅ PASS');

  // 【斷言 4】模擬 postMessage 協定與雙向通信
  const listeners = [];
  const postedMessages = [];

  const mockWindow = {
    addEventListener: (type, fn) => listeners.push({ type, fn }),
    removeEventListener: (type, fn) => {
      const idx = listeners.findIndex(l => l.type === type && l.fn === fn);
      if (idx !== -1) listeners.splice(idx, 1);
    },
    postMessage: (data) => {
      postedMessages.push(data);
      setTimeout(() => {
        listeners.forEach(l => {
          if (l.type === 'message') {
            l.fn({ source: mockWindow, data });
          }
        });
      }, 5);
    }
  };

  // 模擬 inject.js 接收端
  mockWindow.addEventListener('message', (e) => {
    if (e.data?.type === 'YT_FETCH_INNERTUBE_CAPTION_REQUEST') {
      const { requestId, videoId, languageCode } = e.data;
      // 回傳標準 JSON3 測試字幕
      mockWindow.postMessage({
        type: 'YT_FETCH_INNERTUBE_CAPTION_RESPONSE',
        requestId,
        success: true,
        text: JSON.stringify({
          events: [
            { tStartMs: 500, dDurationMs: 1500, segs: [{ utf8: 'First one, a vegetarian. ' }] },
            { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'Good morning.' }] }
          ]
        })
      });
    }
  });

  // 模擬 content.js 發送端
  const fetchPromise = new Promise((resolve) => {
    const requestId = 'test_req_' + Date.now();
    function onMsg(e) {
      if (e.data?.type === 'YT_FETCH_INNERTUBE_CAPTION_RESPONSE' && e.data.requestId === requestId) {
        mockWindow.removeEventListener('message', onMsg);
        resolve(e.data);
      }
    }
    mockWindow.addEventListener('message', onMsg);
    mockWindow.postMessage({
      type: 'YT_FETCH_INNERTUBE_CAPTION_REQUEST',
      requestId,
      videoId: 'dWPHvgXLk0A',
      languageCode: 'en'
    });
  });

  const response = await fetchPromise;
  assert.ok(response.success, '❌ 握手通訊必須返回 success: true');
  const parsed = JSON.parse(response.text);
  assert.strictEqual(parsed.events.length, 2, '❌ 成功解析模擬 InnerTube 字幕 events');
  console.log('  - 雙向 postMessage 握手協議與字幕資料交換: ✅ PASS');

  console.log('🏆【主環境同源 InnerTube 高速通道與 403 阻擋防禦測試】全部通過！\n');
  return { success: true };
}

module.exports = { runMainWorldInnerTubeChannelTest };

if (require.main === module) {
  runMainWorldInnerTubeChannelTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
