/**
 * test_mode2_realworld_defense.js
 * 
 * 針對使用者真實遭遇之「得到一句不完整對話」與「下槽無中文譯文」兩大盲區，
 * 建立嚴密的自動化防禦測試套件：
 * 
 * 1. 複合長句（Compound Sentences）防腰斬測試（Casey Muratori 10x Developer 案例）
 * 2. 關係代名詞（that / who）連詞誤殺防禦測試（Pamela Trauma Episode 案例）
 * 3. Mode 2 下槽（Slot 2）即時防抖雙語翻譯非空斷言（No Empty Translation）
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const contentJs = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

function runMode2RealworldDefenseTest() {
  console.log('========================================================');
  console.log('🧪 執行【Mode 2 真實世界極端防禦測試 (Mode 2 Defense Test)】');
  console.log('========================================================\n');

  global.isExtensionEnabled = true;
  global.isCaptionsEnabled = true;
  global.sentenceList = [];
  global.lastRenderedSignature = '';
  global.lastRenderedRollingSig = '';
  global.userTargetLang = 'zh-TW';
  global.currentTrack = { languageCode: 'en' };
  global.subtitleOffset = 0;
  global.lastWindowCheckTime = -999;
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

  global.safeSendMessage = (msg, cb) => {
    if (msg.action === 'translate') {
      if (cb) cb({ translatedText: `[譯] ${msg.text}` });
    } else {
      if (cb) cb({});
    }
  };

  global.getActivePlayer = () => ({
    querySelector: () => null
  });
  global.ensureUIElements = () => {};
  global.getActiveVideo = () => ({ currentTime: 10.0 });
  global.startSyncLoop = () => {};
  global.stopSyncLoop = () => {};
  global.prioritizeCurrentSentence = () => {};
  global.checkAndTriggerSlidingWindow = () => {};
  global.renderCurrentSubtitle = () => {};
  global.renderDualSlotSubtitle = () => {};

  // 抽出 Mode 2 核心函數
  eval(contentJs.slice(
    contentJs.indexOf('// 13. YouTube 雙語純句級對稱雙槽滾動引擎'),
    contentJs.indexOf('function renderDualSlotSubtitle(')
  ));

  // ----------------------------------------------------
  // 【測試 1】複合長句防腰斬測試（Casey Muratori 10x Developer 案例）
  // "So there's this idea that they generate 10 times as much code, and that having one of these" (17 字)
  // 過去在第 13 字 "and" 處被切碎；新規則必須保持完整，絕不在腰部切斷！
  // ----------------------------------------------------
  console.log('【測試 1】複合長句（Compound Sentences）防腰斬測試 (Casey Muratori 案例)');
  resetStreamingState();
  const caseyStream1 = "So there's this idea that they generate 10 times as much code, and that having one of these";
  const res1 = ingestAndExtractSentence(caseyStream1);

  console.log('  - 餵入 17 字複合句 (包含 and 連詞):', `"${caseyStream1}"`);
  console.log('  - 提取完結句 (completed):', res1.completed ? `"${res1.completed}"` : '(null, 正常保持完整延續)');
  console.log('  - 隊列在進行內容 (inProgress):', `"${res1.inProgress}"`);

  assert.strictEqual(res1.completed, null, '17字自然複句不應在 and 處被腰斬切割！');
  assert.strictEqual(res1.inProgress, caseyStream1, '隊列應完整保留全部 17 字！');
  console.log('  - 結果: ✅ PASS (自然複句未被切碎)\n');

  // ----------------------------------------------------
  // 【測試 2】關係子句（that / who）連詞誤殺防禦
  // "In this episode, I'm so grateful that my friend, who is a therapist who specializes in trauma," (16 字)
  // 過去因 that / who 被誤列為連詞而切斷；新規則絕不在 that / who 處切割！
  // ----------------------------------------------------
  console.log('【測試 2】關係子句（that / who）非連詞誤殺防禦');
  resetStreamingState();
  const pamelaStream = "In this episode, I'm so grateful that my friend, who is a therapist who specializes in trauma,";
  const res2 = ingestAndExtractSentence(pamelaStream);

  console.log('  - 餵入帶 that / who 關係代名詞句子:', `"${pamelaStream}"`);
  console.log('  - 提取完結句 (completed):', res2.completed ? `"${res2.completed}"` : '(null, 正常保持完整延續)');

  assert.strictEqual(res2.completed, null, '關係代名詞 that / who 絕不能誤判為斷句連詞！');
  console.log('  - 結果: ✅ PASS (關係子句未被誤切)\n');

  // ----------------------------------------------------
  // 【測試 3】Mode 2 下槽即時防抖雙語翻譯（No Empty Translation）
  // 過去下槽在講話中永遠為空 (currSlot.trans = '')；
  // 新規則下發起防抖翻譯，350ms 後下槽必須具備中文譯文！
  // ----------------------------------------------------
  console.log('【測試 3】Mode 2 下槽即時防抖雙語翻譯 (No Empty Translation 斷言)');
  setStreamingSlots(
    { orig: "Previous complete thought.", trans: "[譯] 上一句完整思想。" },
    { orig: "they generate 10 times as much code", trans: '' }
  );

  console.log('  - 下槽初始狀態:', JSON.stringify(getStreamingSlots().curr));
  assert.strictEqual(getStreamingSlots().curr.trans, '', '初始無快取時譯文為空');

  // 觸發防抖即時翻譯
  debouncedTranslateLiveProgress("they generate 10 times as much code");

  // 模擬防抖計時器過期 (350ms)
  return new Promise((resolve) => {
    setTimeout(() => {
      const current = getStreamingSlots().curr;
      console.log('  - 350ms 防抖觸發後下槽狀態:', JSON.stringify(current));
      assert.strictEqual(current.trans.length > 0, true, '防抖完成後下槽必須取得中文譯文，絕不允許留空！');
      assert.strictEqual(current.trans.includes('[譯]'), true, '下槽譯文內容正確注入！');
      console.log('  - 結果: ✅ PASS (下槽即時雙語翻譯驗證成功)\n');

      console.log('========================================================');
      console.log('🏆 Mode 2 真實世界極端防禦測試全部通過！(All Mode 2 Defended)');
      console.log('========================================================\n');
      resolve();
    }, 400);
  });
}

module.exports = { runMode2RealworldDefenseTest };

if (require.main === module) {
  runMode2RealworldDefenseTest().then(() => process.exit(0)).catch(err => {
    console.error('❌ Mode 2 防禦測試失敗:', err);
    process.exit(1);
  });
}