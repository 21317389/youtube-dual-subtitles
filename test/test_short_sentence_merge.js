/**
 * test_short_sentence_merge.js
 * 
 * 測試目標：
 * 針對新功能「遇到短句 (< 5 個字數) 就跟後面合併為一句」進行全方位單元測試與回歸驗證
 */

const fs = require('fs');
const path = require('path');

const contentJs = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

function runShortSentenceMergeTest() {
  console.log('========================================================');
  console.log('🧪 執行【短句 (<5個字數) 向後智慧合流功能測試】');
  console.log('========================================================\n');

  global.isExtensionEnabled = true;
  global.isCaptionsEnabled = true;
  global.sentenceList = [];
  global.lastRenderedSignature = '';
  global.lastRenderedRollingSig = '';
  global.userTargetLang = 'zh-TW';
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
  global.safeSendMessage = (msg, cb) => cb && cb({});
  global.getActivePlayer = () => null;
  global.ensureUIElements = () => {};
  global.getActiveVideo = () => null;
  global.startSyncLoop = () => {};
  global.stopSyncLoop = () => {};
  global.prioritizeCurrentSentence = () => {};
  global.checkAndTriggerSlidingWindow = () => {};
  global.renderCurrentSubtitle = () => {};

  eval(contentJs.slice(
    contentJs.indexOf('function parseVttCaptions('),
    contentJs.indexOf('// ==========================================\n// 7. 雙軌時間映射')
  ));

  // ----------------------------------------------------
  // 案例 1：單一短句與後續長句合流
  // "Thank you." (2字) + "Welcome to our technical discussion tonight." (6字)
  // 預期：合併為 1 句 8 字
  // ----------------------------------------------------
  console.log('【測試案例 1】單一短句合流 (2字 + 6字 ➔ 8字)');
  const vttSample1 = `WEBVTT

00:00:01.000 --> 00:00:02.000
Thank you.

00:00:02.500 --> 00:00:06.000
Welcome to our technical discussion tonight.
`;
  parseCues(parseVttCaptions(vttSample1), 'en');
  console.log(`  合句後總句數: ${sentenceList.length} 句 (預期 1 句)`);
  console.log(`  合句文本: "${sentenceList[0]?.origText}"`);
  console.log(`  合句時間範圍: ${sentenceList[0]?.start}s ~ ${sentenceList[0]?.end}s (預期 1s ~ 6s)`);

  const pass1 = sentenceList.length === 1 &&
    sentenceList[0].origText === 'Thank you. Welcome to our technical discussion tonight.' &&
    sentenceList[0].start === 1.0 && sentenceList[0].end === 6.0;
  if (!pass1) throw new Error('案例 1 失敗：單一短句未能正確向後合併！');
  console.log('  結果: ✅ PASS\n');

  // ----------------------------------------------------
  // 案例 2：連續多個短句連環合流
  // "Yes." (1字) + "I do." (2字) + "Here is why." (3字)
  // 預期：1 + 2 = 3 (<5) ➔ 再接 3 = 6 (>=5)，全部合為 1 句 6 字
  // ----------------------------------------------------
  console.log('【測試案例 2】連續多個短句連環合流 (1字 + 2字 + 3字 ➔ 6字)');
  const vttSample2 = `WEBVTT

00:00:01.000 --> 00:00:01.500
Yes.

00:00:01.600 --> 00:00:02.500
I do.

00:00:02.800 --> 00:00:04.000
Here is why.
`;
  parseCues(parseVttCaptions(vttSample2), 'en');
  console.log(`  合句後總句數: ${sentenceList.length} 句 (預期 1 句)`);
  console.log(`  合句文本: "${sentenceList[0]?.origText}"`);
  const pass2 = sentenceList.length === 1 &&
    sentenceList[0].origText === 'Yes. I do. Here is why.' &&
    sentenceList[0].start === 1.0 && sentenceList[0].end === 4.0;
  if (!pass2) throw new Error('案例 2 失敗：連續短句未能連環合併！');
  console.log('  結果: ✅ PASS\n');

  // ----------------------------------------------------
  // 案例 3：片尾短句邊界保護 (最後一句只有 2 字，後方無句子)
  // "Good night." (2字)
  // 預期：無後句可合，安全作為最後一句保留
  // ----------------------------------------------------
  console.log('【測試案例 3】片尾末句短句邊界保護');
  const vttSample3 = `WEBVTT

00:00:01.000 --> 00:00:05.000
This is a standard long sentence for testing.

00:00:06.000 --> 00:00:07.000
Good night.
`;
  parseCues(parseVttCaptions(vttSample3), 'en');
  console.log(`  合句後總句數: ${sentenceList.length} 句 (預期 2 句)`);
  console.log(`  末句文本: "${sentenceList[1]?.origText}"`);
  const pass3 = sentenceList.length === 2 &&
    sentenceList[1].origText === 'Good night.' &&
    sentenceList[1].start === 6.0 && sentenceList[1].end === 7.0;
  if (!pass3) throw new Error('案例 3 失敗：末句短句未能安全保留！');
  console.log('  結果: ✅ PASS\n');

  // ----------------------------------------------------
  // 案例 4：正常句子 (>= 5 字) 獨立不受影響
  // ----------------------------------------------------
  console.log('【測試案例 4】正常長度句子 (>= 5字) 保持獨立');
  const vttSample4 = `WEBVTT

00:00:01.000 --> 00:00:05.000
This is the first standard sentence here.

00:00:06.000 --> 00:00:10.000
And this is the second sentence right after.
`;
  parseCues(parseVttCaptions(vttSample4), 'en');
  console.log(`  合句後總句數: ${sentenceList.length} 句 (預期 2 句)`);
  const pass4 = sentenceList.length === 2;
  if (!pass4) throw new Error('案例 4 失敗：正常長度句子被錯誤合併！');
  console.log('  結果: ✅ PASS\n');

  console.log('========================================================');
  console.log('🏆 短句智慧合流功能測試全部通過！(All Short Sentence Merges Verified)');
  console.log('========================================================\n');

  return { success: true };
}

if (require.main === module) {
  const res = runShortSentenceMergeTest();
  process.exit(res.success ? 0 : 1);
}

module.exports = { runShortSentenceMergeTest };
