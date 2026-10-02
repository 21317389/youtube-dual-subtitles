/**
 * test_cc_and_plugin_toggle.js
 * 核心目的：驗證「尊重使用者 CC 開關與插件開關切換」之 5 大核心行為：
 *   1. 預設未開 CC 時，絕不自動強開 CC，也不渲染雙語字幕
 *   2. 使用者開啟 CC 且插件開啟時，正常渲染雙語字幕並遮蔽原生 CC
 *   3. 使用者點擊插件開關關閉時，立即隱藏雙語字幕並恢復 YouTube 原始 CC (移除 yt-dual-sub-active)
 *   4. 使用者重新打開插件開關時，若 CC 為開啟狀態則立即恢復雙語字幕
 *   5. 使用者手動關閉 CC 後，雙語字幕隱藏，且暫停/播放/緩衝 (onStateChange) 絕不反覆強開 CC
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runCcAndPluginToggleTest() {
  console.log('🧪 執行【CC 字幕與插件開關尊重機制測試 (CC & Plugin Toggle Test)】');

  const injectCode = fs.readFileSync(path.join(__dirname, '..', 'inject.js'), 'utf8');
  const contentCode = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
  const vtt = fs.readFileSync(path.join(__dirname, 'fixtures', 'internet_of_bugs_ZfcHwBKcNzY.en.vtt'), 'utf8');

  let ccBtnClicked = 0;
  let setOptionCalled = 0;
  let ccEnabledState = false; // 初始預設：使用者未開啟 YouTube CC
  let storageOnChangedListener = null;

  const windowListeners = new Map();
  const docListeners = new Map();

  global.window = {
    location: { href: 'https://www.youtube.com/watch?v=ZfcHwBKcNzY' },
    addEventListener: (type, fn) => {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(fn);
    },
    removeEventListener: () => {},
    postMessage: (data) => {
      const handlers = windowListeners.get('message') || [];
      handlers.forEach(h => h({ source: global.window, data }));
    },
    requestAnimationFrame: (cb) => setTimeout(cb, 16),
    cancelAnimationFrame: (id) => clearTimeout(id)
  };
  global.requestAnimationFrame = global.window.requestAnimationFrame;
  global.cancelAnimationFrame = global.window.cancelAnimationFrame;

  const classes = new Set();
  const ccBtn = {
    getAttribute: (attr) => attr === 'aria-pressed' ? (ccEnabledState ? 'true' : 'false') : null,
    click: () => { ccBtnClicked++; },
    closest: (sel) => sel === '.ytp-subtitles-button' ? ccBtn : null
  };

  const stateChangeListeners = [];
  const mockPlayer = {
    id: 'movie_player',
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c)
    },
    appendChild: (el) => { el.parentElement = mockPlayer; return el; },
    querySelector: (sel) => sel === '.ytp-subtitles-button' ? ccBtn : null,
    querySelectorAll: () => [],
    getVideoData: () => ({ video_id: 'ZfcHwBKcNzY' }),
    getPlayerResponse: () => ({
      videoDetails: { videoId: 'ZfcHwBKcNzY' },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [{ languageCode: 'en', vssId: '.en', baseUrl: 'https://www.youtube.com/api/timedtext?v=ZfcHwBKcNzY' }]
        }
      }
    }),
    getOption: (mod, opt) => {
      if (mod === 'captions' && opt === 'track') {
        return ccEnabledState ? { languageCode: 'en', vssId: '.en' } : {};
      }
      return null;
    },
    setOption: () => { setOptionCalled++; },
    addEventListener: (type, fn) => {
      if (type === 'onStateChange') stateChangeListeners.push(fn);
    }
  };

  const domMap = new Map();
  function makeEl(id) {
    return {
      id,
      style: { display: 'none', setProperty: () => {} },
      classList: { add: () => {}, remove: () => {}, contains: () => false },
      appendChild: function (c) { this.children = this.children || []; this.children.push(c); return c; },
      querySelector: function (sel) {
        if (sel.includes('prev')) return this.prev || (this.prev = makeEl('prev'));
        if (sel.includes('curr')) return this.curr || (this.curr = makeEl('curr'));
        if (sel.includes('orig')) return this.orig || (this.orig = makeEl('orig'));
        if (sel.includes('trans')) return this.trans || (this.trans = makeEl('trans'));
        return null;
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      textContent: ''
    };
  }

  global.document = {
    readyState: 'complete',
    documentElement: makeEl('html'),
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => {
      if (!domMap.has(id)) domMap.set(id, makeEl(id));
      return domMap.get(id);
    },
    querySelector: (sel) => {
      if (sel.includes('video') && !sel.includes('player')) {
        return { currentTime: 5.0, paused: false, ended: false, addEventListener: () => {}, removeEventListener: () => {} };
      }
      return mockPlayer;
    },
    addEventListener: (type, fn) => {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    removeEventListener: () => {}
  };
  global.window.document = global.document;

  global.chrome = {
    i18n: { getUILanguage: () => 'zh-TW' },
    storage: {
      sync: {
        get: (defaults, cb) => cb({ ...defaults, extensionEnabled: true })
      },
      onChanged: {
        addListener: (fn) => { storageOnChangedListener = fn; }
      }
    },
    runtime: {
      id: 'test-id',
      sendMessage: (msg, cb) => {
        if (msg.action === 'translate') {
          const lines = String(msg.text).split('\n').map(() => '測試中文字幕');
          if (cb) cb({ translatedText: lines.join('\n') });
        } else if (cb) {
          cb({});
        }
      }
    }
  };

  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [{ languageCode: 'en', vssId: '.en', baseUrl: 'https://www.youtube.com/api/timedtext?v=ZfcHwBKcNzY' }]
        }
      }
    }),
    text: async () => vtt
  });

  eval(contentCode);
  eval(injectCode);

  return (async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    await sleep(100);

    const container = global.document.getElementById('yt-dual-subtitle-container');

    // 1. 預設未開 CC 時，絕不自動強開 CC，也不渲染雙語字幕
    assert.strictEqual(ccBtnClicked, 0, '不應自動點擊 CC 按鈕');
    assert.strictEqual(setOptionCalled, 0, '不應自動呼叫 setOption 強開字幕');
    assert.strictEqual(container.style.display, 'none', '未開 CC 時雙語容器應保持隱藏');
    assert.strictEqual(classes.has('yt-dual-sub-active'), false, '未開 CC 時不應遮蔽原生字幕');
    console.log('  - 預設未開 CC 不強開、不渲染: ✅ PASS');

    // 2. 使用者開啟 CC 且插件開啟時，正常渲染雙語字幕
    ccEnabledState = true;
    (docListeners.get('click') || []).forEach(fn => fn({ target: ccBtn }));
    await sleep(150);
    assert.strictEqual(container.style.display, 'flex', '開啟 CC + 插件開啟時應顯示雙語字幕');
    assert.strictEqual(classes.has('yt-dual-sub-active'), true, '雙語字幕顯示時應加上 yt-dual-sub-active 遮蔽原生字幕');
    console.log('  - 開啟 CC + 插件開啟時正常渲染: ✅ PASS');

    // 3. 點擊插件開關關閉時，隱藏雙語字幕並恢復 YouTube 原始 CC
    storageOnChangedListener({ extensionEnabled: { newValue: false } }, 'sync');
    assert.strictEqual(container.style.display, 'none', '關閉插件開關時應隱藏雙語字幕');
    assert.strictEqual(classes.has('yt-dual-sub-active'), false, '關閉插件開關時必須移除 yt-dual-sub-active 以恢復 YouTube 原始 CC');
    console.log('  - 關閉插件開關時恢復 YouTube 原始 CC: ✅ PASS');

    // 4. 重新打開插件開關時，立即恢復雙語字幕
    storageOnChangedListener({ extensionEnabled: { newValue: true } }, 'sync');
    await sleep(100);
    assert.strictEqual(container.style.display, 'flex', '重新開啟插件開關時應恢復顯示雙語字幕');
    assert.strictEqual(classes.has('yt-dual-sub-active'), true, '重新開啟插件開關時應恢復 yt-dual-sub-active');
    console.log('  - 重新開啟插件開關時恢復雙語字幕: ✅ PASS');

    // 5. 使用者手動關閉 CC 後，雙語字幕關閉，且暫停/播放/緩衝 (onStateChange) 絕不重新強開 CC
    ccEnabledState = false;
    (docListeners.get('click') || []).forEach(fn => fn({ target: ccBtn }));
    await sleep(100);
    assert.strictEqual(container.style.display, 'none', '使用者關閉 CC 後應立即隱藏雙語字幕');
    assert.strictEqual(classes.has('yt-dual-sub-active'), false, '使用者關閉 CC 後應移除 yt-dual-sub-active');

    stateChangeListeners.forEach(fn => { fn(1); fn(3); });
    await sleep(150);
    assert.strictEqual(ccBtnClicked, 0, 'onStateChange 絕不可重新點擊 CC 按鈕');
    assert.strictEqual(setOptionCalled, 0, 'onStateChange 絕不可呼叫 setOption 強開字幕');
    assert.strictEqual(container.style.display, 'none', 'onStateChange 後雙語字幕仍維持關閉');
    console.log('  - 尊重使用者關閉 CC (onStateChange 不反覆強開): ✅ PASS');
    console.log('🏆【CC 字幕與插件開關尊重機制測試】全部通過！\n');
  })();
}

module.exports = { runCcAndPluginToggleTest };

if (require.main === module) {
  runCcAndPluginToggleTest().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
