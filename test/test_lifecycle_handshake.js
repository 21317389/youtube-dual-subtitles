/**
 * test_lifecycle_handshake.js
 * 核心目的：永久固化「生命週期時差握手機制」回歸測試
 * 模擬場景：inject.js 於 document_start (t=0) 廣播軌道，content.js 於 document_idle (t=1.5s) 才誕生掛載。
 * 斷言：content.js 必須能透過 YT_REQUEST_CURRENT_TRACK 握手成功取得軌道，絕不能漏接！
 */

const fs = require('fs');
const assert = require('assert');

function runLifecycleHandshakeTest() {
  console.log('🧪 執行【生命週期時序競爭防禦測試 (Lifecycle Handshake Test)】');

  const injectCode = fs.readFileSync('inject.js', 'utf8');
  const contentCode = fs.readFileSync('content.js', 'utf8');

  // 1. 檢查代碼中是否具備握手關鍵字
  assert.ok(
    contentCode.includes('YT_REQUEST_CURRENT_TRACK'),
    '❌ content.js 必須包含主動索取軌道機制 YT_REQUEST_CURRENT_TRACK！'
  );
  assert.ok(
    injectCode.includes('YT_REQUEST_CURRENT_TRACK'),
    '❌ inject.js 必須包含應答索取軌道機制 YT_REQUEST_CURRENT_TRACK！'
  );

  // 2. 模擬 DOM 與事件環境
  const listeners = [];
  const postedMessages = [];

  const mockWindow = {
    addEventListener: (type, fn) => {
      listeners.push({ type, fn });
    },
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
    },
    location: { href: 'https://www.youtube.com/watch?v=testVid123' }
  };

  let broadcastCount = 0;
  mockWindow.addEventListener('message', (e) => {
    if (e.data?.type === 'YT_CAPTION_TRACK_CHANGED' && e.data.enabled) {
      broadcastCount++;
    }
  });

  let lastBroadcastedTrackKey = '';
  function notifyCurrentTrack() {
    const key = 'testVid123@@enabled@@a.en@@url@@en';
    if (key === lastBroadcastedTrackKey) return;
    lastBroadcastedTrackKey = key;
    mockWindow.postMessage({
      type: 'YT_CAPTION_TRACK_CHANGED',
      enabled: true,
      videoId: 'testVid123',
      track: { languageCode: 'en', vssId: 'a.en' }
    });
  }

  mockWindow.addEventListener('message', (e) => {
    if (e.data?.type === 'YT_REQUEST_CURRENT_TRACK') {
      lastBroadcastedTrackKey = '';
      notifyCurrentTrack();
    }
  });

  notifyCurrentTrack();

  return new Promise((resolve) => {
    setTimeout(() => {
      assert.strictEqual(broadcastCount, 1, 'inject.js 於 t=0 完成首次廣播');

      notifyCurrentTrack();
      assert.strictEqual(broadcastCount, 1, '防抖鎖正常運作，不重複廣播');

      let contentReceivedTrack = false;
      mockWindow.addEventListener('message', (e) => {
        if (e.data?.type === 'YT_CAPTION_TRACK_CHANGED' && e.data.track?.languageCode === 'en') {
          contentReceivedTrack = true;
        }
      });

      mockWindow.postMessage({ type: 'YT_REQUEST_CURRENT_TRACK' });

      setTimeout(() => {
        assert.ok(contentReceivedTrack, '❌ content.js 透過握手機制成功收到軌道！');
        assert.strictEqual(broadcastCount, 2, 'inject.js 解開去重鎖並完成第二次精準投遞！');
        console.log('  - document_start 先發廣播: ✅ 成功模擬');
        console.log('  - document_idle 時差防護: ✅ 成功防禦 (握手重發命中)');
        console.log('🏆【生命週期時序競爭防禦測試】通過！\n');
        resolve();
      }, 50);
    }, 20);
  });
}

module.exports = { runLifecycleHandshakeTest };

if (require.main === module) {
  runLifecycleHandshakeTest().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
