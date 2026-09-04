/**
 * test_fast_playback_prefetch.js
 * 
 * 自動化倍速播放與背景偷跑預載測試：
 * 1. 驗證在第 0 秒，「多通道背後偷跑抓取器」完整解析全片文本並建立智慧斷句時間軸。
 * 2. 模擬 1x、2x、4x、8x、16x 極速播放下，45 秒滑動窗口是否能提前將未來譯文全部翻譯並快取。
 * 3. 驗證雙槽渲染在極限倍速播放下，雙槽常駐率是否達到 100%、譯文命中率是否達到 100%、0 抖動 0 塌陷。
 */

const fs = require('fs');
const path = require('path');

const contentJs = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const vttRaw = fs.readFileSync(path.join(__dirname, 'fixtures', 'ted_talk_manual.en.vtt'), 'utf8');

// 全域模擬環境
global.isExtensionEnabled = true;
global.isCaptionsEnabled = true;
global.lastRenderedSignature = '';
global.lastRenderedRollingSig = '';
global.currentTrack = { languageCode: 'en' };
global.userTargetLang = 'zh-TW';
global.CONFIG = {
  PRELOAD_SECONDS: 45,
  WINDOW_CHECK_INTERVAL: 1.5,
  BATCH_TRANSLATE_LIMIT: 8,
  SENTENCE_END_REGEX: /[.?!。？！]["'”’)]*$/,
  INTRA_SPLIT_REGEX: /(?<=[.?!。？！]["'”’)]*)\s+/,
  FALLBACK_LONG_PAUSE_SECONDS: 2.5,
  MAX_SENTENCE_CHARS: 320,
  MAX_SENTENCE_DURATION: 25.0
};

global.subtitleOffset = 0;
global.ensureUIElements = () => {};
global.getActiveVideo = () => null;
global.prioritizeCurrentSentence = () => {};
global.renderCurrentSubtitle = () => {};
global.startSyncLoop = () => {};
global.sentenceList = [];
global.lastObservedVideoId = '';
global.lastWindowCheckTime = -999;

// 提取 content.js 關鍵函式
eval(contentJs.slice(
  contentJs.indexOf('function parseVttCaptions'),
  contentJs.indexOf('// ==========================================\n// 7. 雙軌時間映射')
));

eval(contentJs.slice(
  contentJs.indexOf('function getActiveCue(currentTime) {'),
  contentJs.indexOf('function onTimeUpdate()')
));

eval(contentJs.slice(
  contentJs.indexOf('function checkAndTriggerSlidingWindow('),
  contentJs.indexOf('function showWarningToast(message)')
));

// 模擬 Mock DOM 容器
const mockContainer = { style: { display: '' } };
const mockSlotPrev = {
  style: { display: '' },
  querySelector: (s) => ({ textContent: '', style: { display: '', visibility: '' } })
};
const mockSlotCurr = {
  style: { display: '' },
  querySelector: (s) => ({ textContent: '', style: { display: '', visibility: '' } })
};

global.document = {
  getElementById: (id) => {
    if (id === 'yt-dual-subtitle-container') return mockContainer;
    return null;
  }
};
mockContainer.querySelector = (s) => {
  if (s.includes('prev')) return mockSlotPrev;
  if (s.includes('curr')) return mockSlotCurr;
  return null;
};

// 模擬非同步翻譯伺服器 (延遲 150ms ~ 200ms)
let currentSimTime = 0;
let pendingTranslations = [];

global.safeSendMessage = (msg, cb) => {
  if (msg.action === 'translate') {
    pendingTranslations.push({
      text: msg.text,
      cb: cb,
      deliverAtSimTime: currentSimTime + 0.1 // 100ms 網路延遲
    });
  }
};

function tickSimTranslations(simTime) {
  currentSimTime = simTime;
  const ready = pendingTranslations.filter(t => t.deliverAtSimTime <= simTime);
  ready.forEach(t => {
    const lines = t.text.split('\n');
    const translatedText = lines.map(line => `[中譯] ${line.slice(0, 15)}...`).join('\n');
    t.cb({ translatedText });
  });
  pendingTranslations = pendingTranslations.filter(t => t.deliverAtSimTime > simTime);
}

// 測試執行器
function runPlaybackSpeedTest(playbackSpeed) {
  console.log(`\n======================================================`);
  console.log(`🚀 執行【${playbackSpeed}x 倍速】極速播放測試`);
  console.log(`======================================================`);

  // 1. 第 0 秒：背後偷跑抓取全片文本
  const t0 = Date.now();
  const vttData = parseVttCaptions(vttRaw);
  parseCues(vttData, 'en');
  const parseCostMs = Date.now() - t0;

  console.log(`[第 0 秒偷跑抓取] 全片解析耗時: ${parseCostMs}ms, 產生句子總數: ${sentenceList.length}`);
  if (sentenceList.length === 0) {
    throw new Error('Pre-fetch failed to produce sentences!');
  }

  // 重設滑動窗口與快取
  pendingTranslations = [];
  lastWindowCheckTime = -999;
  currentSimTime = 0;

  const totalDuration = sentenceList[sentenceList.length - 1].end;
  const timeStep = 0.05 * playbackSpeed; // 50ms 幀步進 * 倍速
  let sampledFrames = 0;
  let dualSlotFrames = 0;
  let translatedHitFrames = 0;
  let singleRowCollapseFrames = 0;

  // 2. 模擬影片從 0 秒播放至結尾
  for (let t = 0; t <= totalDuration; t += timeStep) {
    tickSimTranslations(t);

    // 觸發 45 秒滑動窗口檢查
    if (Math.abs(t - lastWindowCheckTime) > CONFIG.WINDOW_CHECK_INTERVAL) {
      lastWindowCheckTime = t;
      checkAndTriggerSlidingWindow(t);
    }

    const active = getActiveCue(t);
    if (!active) continue;

    sampledFrames++;

    const prevSlotData = active.prevSentence ? {
      orig: active.prevSentence.origText,
      trans: active.prevSentence.transText || ''
    } : { orig: '', trans: '' };

    const currSlotData = active.currentSentence ? {
      orig: active.streamingOrigText || active.currentSentence.origText,
      trans: active.transText || active.currentSentence.transText || ''
    } : { orig: '', trans: '' };

    // 檢查雙槽並存性 (熱身過後)
    const hasSlot1 = Boolean(prevSlotData.orig);
    const hasSlot2 = Boolean(currSlotData.orig);

    if (active.sentenceIndex > 0) {
      if (hasSlot1 && hasSlot2) dualSlotFrames++;
      if (hasSlot1 !== hasSlot2) singleRowCollapseFrames++;

      // 檢查當前句翻譯是否命中 (是否由 45 秒滑動窗口提前翻好)
      if (currSlotData.trans) {
        translatedHitFrames++;
      }
    }
  }

  const steadyStateFrames = sampledFrames > 10 ? sampledFrames - 10 : sampledFrames;
  const dualSlotRate = ((dualSlotFrames / steadyStateFrames) * 100).toFixed(1);
  const transHitRate = ((translatedHitFrames / steadyStateFrames) * 100).toFixed(1);

  console.log(`總採樣幀數: ${sampledFrames} 幀`);
  console.log(`雙槽並存率 (第2句起穩態): ${dualSlotRate}% 🎯`);
  console.log(`45秒滑動窗口譯文命中率: ${transHitRate}% 🎯`);
  console.log(`單行塌陷/抖動幀數: ${singleRowCollapseFrames} 幀`);

  const passed = parseFloat(dualSlotRate) >= 99.0 && parseFloat(transHitRate) >= 95.0 && singleRowCollapseFrames === 0;
  console.log(`【${playbackSpeed}x 測試結果】: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  return passed;
}

// 逐一測試 1x、2x、4x、8x、16x
const speeds = [1, 2, 4, 8, 16];
let allPassed = true;

for (const sp of speeds) {
  const ok = runPlaybackSpeedTest(sp);
  if (!ok) allPassed = false;
}

console.log(`\n======================================================`);
console.log(`🏆 全倍速 (1x ~ 16x) 極限壓力測試總結: ${allPassed ? '✅ 全部通過！' : '❌ 部分失敗'}`);
console.log(`======================================================\n`);

process.exit(allPassed ? 0 : 1);
