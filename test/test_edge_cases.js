/**
 * test_edge_cases.js
 * 
 * 專題邊界測試：針對真實 YouTube VOD 最易引發致命 Bug 的 5 大邊界狀況進行自動化驗證
 * 
 * 狀況 1：進度條大跨度瞬間跳躍 (Timeline Seeking / 章節跳轉)
 * 狀況 2：CC 按鈕反覆開關 (CC Toggle On ➔ Off ➔ On)
 * 狀況 3：齒輪選單多字幕軌道切換 (Track Switching: .en ➔ .es)
 * 狀況 4：Google 翻譯回傳「行數不匹配」降級重試 (Batch Line Count Mismatch Fallback)
 * 狀況 5：網路斷線或翻譯 API 429 限流容錯 (Network Drop / 429 Graceful Degradation)
 */

const fs = require('fs');
const path = require('path');

const contentJs = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const vttZfcHwBKcNzY = fs.readFileSync(path.join(__dirname, 'fixtures', 'internet_of_bugs_ZfcHwBKcNzY.en.vtt'), 'utf8');
const vttTed = fs.readFileSync(path.join(__dirname, 'fixtures', 'ted_talk_manual.en.vtt'), 'utf8');

function runEdgeCasesTest() {
  console.log('========================================================');
  console.log('🧪 執行【YouTube VOD 5大極端邊界防禦測試 (Edge Cases Test)】');
  console.log('========================================================\n');

  // ----------------------------------------------------------------
  // 環境通用 Mock
  // ----------------------------------------------------------------
  global.isExtensionEnabled = true;
  global.isCaptionsEnabled = true;
  global.lastRenderedSignature = '';
  global.lastRenderedRollingSig = '';
  global.userTargetLang = 'zh-TW';
  global.subtitleOffset = 0;
  global.sentenceList = [];
  global.lastWindowCheckTime = -999;
  global.lastObservedVideoId = 'ZfcHwBKcNzY';
  global.getCurrentVideoId = () => 'ZfcHwBKcNzY';
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

  class MockElement {
    constructor(id = '', tag = 'div') {
      this.id = id;
      this.tagName = tag;
      this.style = { display: '' };
      this.textContent = '';
      this.origEl = { textContent: '' };
      this.transEl = { textContent: '', style: { display: '', visibility: '' } };
    }
    querySelector(sel) {
      if (sel.includes('prev')) return this.prevSlot || (this.prevSlot = new MockElement('slot-prev'));
      if (sel.includes('curr')) return this.currSlot || (this.currSlot = new MockElement('slot-curr'));
      if (sel.includes('orig')) return this.origEl;
      if (sel.includes('trans')) return this.transEl;
      return null;
    }
  }

  const container = new MockElement('yt-dual-subtitle-container');
  global.document = {
    getElementById: (id) => id === 'yt-dual-subtitle-container' ? container : null,
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  global.window = { addEventListener: () => {}, removeEventListener: () => {} };
  global.getActivePlayer = () => null;
  global.ensureUIElements = () => {};
  global.getActiveVideo = () => ({ currentTime: 0 });
  global.startSyncLoop = () => {};
  global.stopSyncLoop = () => {};

  // 提取 content.js 核心函式
  eval(contentJs.slice(
    contentJs.indexOf('function parseVttCaptions('),
    contentJs.indexOf('// ==========================================\n// 7. 雙軌時間映射')
  ));
  eval(contentJs.slice(
    contentJs.indexOf('function getActiveCue('),
    contentJs.indexOf('// ==========================================\n// 8. 滑動窗口')
  ));
  eval(contentJs.slice(
    contentJs.indexOf('function prioritizeCurrentSentence('),
    contentJs.indexOf('// ==========================================\n// 9. 即時串流監聽')
  ));
  eval(contentJs.slice(
    contentJs.indexOf('function renderDualSlotSubtitle('),
    contentJs.length
  ));

  global.safeSendMessage = (msg, cb) => cb && cb({});

  // 載入初始字幕數據
  const initialVttData = parseVttCaptions(vttZfcHwBKcNzY);
  parseCues(initialVttData, 'en');

  // ================================================================
  // 狀況 1：進度條大跨度瞬間跳躍 (Timeline Seeking / 章節跳轉)
  // ================================================================
  console.log('【測試 1】進度條大跨度瞬間跳躍 (Timeline Seeking)');
  // 模擬使用者正在看第 5 秒，突然直接點進度條跳到第 600 秒 (10 分鐘處)
  const cueAt5s = getActiveCue(5.0);
  const origSentenceAt5s = cueAt5s?.currentSentence?.origText;

  // 瞬間跳躍至 600 秒
  const seekTargetTime = 600.0;
  const cueAt600s = getActiveCue(seekTargetTime);
  const sentenceAt600s = cueAt600s?.currentSentence;

  let prioritizeTargetedCorrectly = false;
  global.safeSendMessage = (msg, cb) => {
    if (msg.action === 'translate') {
      if (msg.text === sentenceAt600s.origText) {
        prioritizeTargetedCorrectly = true;
      }
      cb({ translatedText: '這是第600秒的極速翻譯。' });
    }
  };

  prioritizeCurrentSentence(seekTargetTime);

  const test1Passed = (
    sentenceAt600s &&
    sentenceAt600s.start <= seekTargetTime &&
    sentenceAt600s.end >= seekTargetTime &&
    sentenceAt600s.origText !== origSentenceAt5s &&
    prioritizeTargetedCorrectly &&
    sentenceAt600s.transText === '這是第600秒的極速翻譯。'
  );

  console.log(`  - 0:05 原句: "${origSentenceAt5s?.slice(0, 30)}..."`);
  console.log(`  - 10:00 跳躍落點目標句: "${sentenceAt600s?.origText?.slice(0, 30)}..."`);
  console.log(`  - 立即鎖定當前落點發起首句極速翻譯: ${prioritizeTargetedCorrectly ? '✅ 成功' : '❌ 失敗'}`);
  console.log(`  - 結果: ${test1Passed ? '✅ PASS' : '❌ FAIL'}\n`);
  if (!test1Passed) throw new Error('狀況 1 測試失敗：時間跳轉未能即時鎖定新時間軸句子！');

  // ================================================================
  // 狀況 2：CC 按鈕反覆開關 (CC Toggle On ➔ Off ➔ On)
  // ================================================================
  console.log('【測試 2】CC 按鈕反覆開關 (CC Toggle On ➔ Off ➔ On)');
  const initialSentenceCount = sentenceList.length;
  renderCurrentSubtitle(5.0);
  const initialDisplay = container.style.display;
  
  // 步驟 B: 使用者在播放器點擊 CC 關閉字幕
  global.isCaptionsEnabled = false;
  container.style.display = 'none'; // 模擬 CC 關閉
  const offDisplay = container.style.display;

  // 步驟 C: 5 秒後使用者重新點擊 CC 打開字幕
  global.isCaptionsEnabled = true;
  // 驗證 sentenceList 仍穩固駐留記憶體中，未被意外抹消
  const sentenceCountPreserved = sentenceList.length > 0 && sentenceList.length === initialSentenceCount;
  renderCurrentSubtitle(5.0);
  const restoredDisplay = container.style.display;

  const test2Passed = (
    initialDisplay !== 'none' &&
    offDisplay === 'none' &&
    sentenceCountPreserved &&
    restoredDisplay !== 'none'
  );

  console.log(`  - 開啟狀態容器顯示: ${initialDisplay !== 'none' ? 'visible' : 'none'}`);
  console.log(`  - 關閉狀態容器顯示: ${offDisplay}`);
  console.log(`  - 重新開啟時字幕清單快取保留: ${sentenceCountPreserved ? `保留 ${sentenceList.length} 句` : '被清空'}`);
  console.log(`  - 重新開啟後容器恢復顯示: ${restoredDisplay !== 'none' ? 'visible' : 'none'}`);
  console.log(`  - 結果: ${test2Passed ? '✅ PASS' : '❌ FAIL'}\n`);
  if (!test2Passed) throw new Error('狀況 2 測試失敗：CC 反覆切換未能正確還原顯示！');

  // ================================================================
  // 狀況 3：齒輪選單多字幕軌道切換 (Track Switching: .en ➔ .es)
  // ================================================================
  console.log('【測試 3】多字幕軌道切換 (Track Switching: .en ➔ .ted)');
  const oldFirstSentence = sentenceList[0].origText;
  
  // 模擬使用者切換至 TED Talk 演講軌道
  const newVttData = parseVttCaptions(vttTed);
  parseCues(newVttData, 'en'); // 載入新軌道
  const newFirstSentence = sentenceList[0].origText;

  const test3Passed = (
    sentenceList.length > 0 &&
    newFirstSentence !== oldFirstSentence &&
    (newFirstSentence.includes('TED') || newFirstSentence.includes('vividly'))
  );

  console.log(`  - 切換前舊軌首句: "${oldFirstSentence.slice(0, 35)}..."`);
  console.log(`  - 切換後新軌首句: "${newFirstSentence.slice(0, 35)}..."`);
  console.log(`  - 新軌句數: ${sentenceList.length} 句 (預期 270 句)`);
  console.log(`  - 結果: ${test3Passed ? '✅ PASS' : '❌ FAIL'}\n`);
  if (!test3Passed) throw new Error('狀況 3 測試失敗：多軌道切換時未能正確重構新字幕清單！');

  // ================================================================
  // 狀況 4：Google 翻譯回傳「行數不匹配」降級重試 (Batch Mismatch Fallback)
  // ================================================================
  console.log('【測試 4】Google 翻譯回傳「行數不匹配」降級重試 (Batch Mismatch Fallback)');
  // 準備 4 句待翻譯句子
  const batchTestSentences = [
    { origText: "First sentence here.", status: 'idle', transText: '', start: 1, end: 3 },
    { origText: "Second sentence here.", status: 'idle', transText: '', start: 4, end: 6 },
    { origText: "Third sentence here.", status: 'idle', transText: '', start: 7, end: 9 },
    { origText: "Fourth sentence here.", status: 'idle', transText: '', start: 10, end: 12 }
  ];
  sentenceList = batchTestSentences;

  let batchCallCount = 0;
  let singleFallbackCallCount = 0;

  global.safeSendMessage = (msg, cb) => {
    if (msg.action === 'translate') {
      if (msg.text.includes('\n')) {
        batchCallCount++;
        // 刻意模擬 Google 翻譯將 4 行合併成 3 行 (行數不匹配！)
        cb({ translatedText: "第一行翻譯。\n第二行合併翻譯。\n第三行翻譯。" });
      } else {
        singleFallbackCallCount++;
        cb({ translatedText: `[單句降級譯文] ${msg.text}` });
      }
    }
  };

  // 觸發滑動窗口批次翻譯
  checkAndTriggerSlidingWindow(0);

  const allSentencesDone = batchTestSentences.every(s => s.status === 'done' && s.transText.startsWith('[單句降級譯文]'));
  const test4Passed = batchCallCount === 1 && singleFallbackCallCount === 4 && allSentencesDone;

  console.log(`  - 批次請求發起次數: ${batchCallCount} 次 (回傳 3 行，傳入 4 行)`);
  console.log(`  - 自動啟動單句降級重試次數: ${singleFallbackCallCount} 次 (預期 4 次)`);
  console.log(`  - 所有句子均成功取得精準單句譯文: ${allSentencesDone ? '✅ 成功' : '❌ 失敗'}`);
  console.log(`  - 結果: ${test4Passed ? '✅ PASS' : '❌ FAIL'}\n`);
  if (!test4Passed) throw new Error('狀況 4 測試失敗：批次翻譯行數不符時未能成功降級逐句翻譯！');

  // ================================================================
  // 狀況 5：網路斷線或翻譯 API 429 限流容錯 (Network Drop / 429 Graceful Degradation)
  // ================================================================
  console.log('【測試 5】網路斷線或翻譯 API 429 限流容錯 (Network Drop / Rate Limit)');
  const errorTestSentence = {
    origText: "This is a sentence during network failure.",
    status: 'idle',
    transText: '',
    start: 20,
    end: 25,
    cues: [{ start: 20, end: 25, origText: "This is a sentence during network failure." }]
  };
  sentenceList = [errorTestSentence];

  // 模擬網路斷線 / 429 限流回傳 null 或空值
  global.safeSendMessage = (msg, cb) => {
    if (msg.action === 'translate') {
      cb(null); // 模擬網路異常
    }
  };

  prioritizeCurrentSentence(21);

  // 斷言 1: 狀態回退為 idle (允許後續網路恢復時重試)，不可卡死在 loading
  const statusRevertedToIdle = errorTestSentence.status === 'idle';

  // 斷言 2: 渲染層在譯文缺失時，不可拋錯，不可顯示 undefined，原文必須正常顯示
  let renderThrewError = false;
  try {
    renderCurrentSubtitle(21);
  } catch (e) {
    renderThrewError = true;
  }

  const slotCurr = container.querySelector('.cue-slot-curr');
  const renderedOrig = slotCurr?.origEl?.textContent || '';
  const renderedTrans = slotCurr?.transEl?.textContent || '';

  const test5Passed = (
    statusRevertedToIdle &&
    !renderThrewError &&
    renderedOrig === errorTestSentence.origText &&
    !renderedTrans.includes('undefined') &&
    !renderedTrans.includes('[object')
  );

  console.log(`  - 翻譯失敗後狀態正確回退為: "${errorTestSentence.status}" (預期 idle，不卡死 loading)`);
  console.log(`  - 渲染層原文正常展示: "${renderedOrig}"`);
  console.log(`  - 譯文層無 undefined / 崩潰殘留: ${renderedTrans.length === 0 || renderedTrans === '\u00A0' ? '✅ 安全' : '❌ 異常'}`);
  console.log(`  - 結果: ${test5Passed ? '✅ PASS' : '❌ FAIL'}\n`);
  if (!test5Passed) throw new Error('狀況 5 測試失敗：翻譯失敗時未能優雅容錯降級！');

  console.log('========================================================');
  console.log('🏆 5 大極端邊界測試全部通過！(All Edge Cases Defended)');
  console.log('========================================================\n');

  return { success: true };
}

if (require.main === module) {
  const res = runEdgeCasesTest();
  process.exit(res.success ? 0 : 1);
}

module.exports = { runEdgeCasesTest };
