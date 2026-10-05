/**
 * test_core_modules.js
 * 
 * 核心解耦模組單元測試 (Core Modules Unit Tests)
 * 驗證 Phase 2 抽離之模組：
 *   1. sentence-policy.js
 *   2. streaming-sentence-extractor.js
 *   3. caption-parser.js
 *   4. translation-scheduler.js
 *   5. protocol.js
 */

const assert = require('assert');
const {
  cleanSubtitleNoise,
  isSentenceEnd,
  isConjunction,
  isTailOfImmediatePrev,
  shouldMergeShortSentence,
  SENTENCE_END_REGEX
} = require('../src/core/sentence-policy');
const { StreamingSentenceExtractor } = require('../src/core/streaming-sentence-extractor');
const {
  decodeHtmlEntities,
  parseXmlCaptions,
  parseVttCaptions,
  parseUniversalCaptionText
} = require('../src/core/caption-parser');
const { TranslationScheduler } = require('../src/core/translation-scheduler');
const { WindowMessageType, RuntimeAction, isValidWindowMessage } = require('../src/bridge/protocol');
const { SessionState } = require('../src/core/session-state');

function runCoreModulesTest() {
  console.log('========================================================');
  console.log('🧪 執行【Phase 2 核心架構解耦模組測試 (Core Modules)】');
  console.log('========================================================\n');

  // 1. Sentence Policy
  console.log('【1. Sentence Policy 語言規則檢驗】');
  assert.strictEqual(cleanSubtitleNoise('>> [Music] Hello world! ♪'), 'Hello world!');
  assert.strictEqual(cleanSubtitleNoise('&gt;&gt; [Laughter] (applause) Good morning'), 'Good morning');
  assert.strictEqual(isSentenceEnd('This is a test.'), true);
  assert.strictEqual(isSentenceEnd('Wait, but...'), false, '口語省略號 ... 嚴格禁止被判定為句末！');
  assert.strictEqual(isSentenceEnd('Really?!'), true);
  assert.strictEqual(isSentenceEnd('你好。'), true);
  assert.strictEqual(isConjunction('and'), true);
  assert.strictEqual(isConjunction('Because'), true);
  assert.strictEqual(isConjunction('apple'), false);
  assert.strictEqual(shouldMergeShortSentence(2), true);
  assert.strictEqual(shouldMergeShortSentence(5), false);
  assert.strictEqual(isTailOfImmediatePrev('going to the park', ['We are going to the park']), true);
  assert.strictEqual(isTailOfImmediatePrev('completely different', ['We are going to the park']), false);
  console.log('  - 結果: ✅ PASS\n');

  // 2. Streaming Sentence Extractor
  console.log('【2. Streaming Sentence Extractor 串流斷句狀態機檢驗】');
  const extractor = new StreamingSentenceExtractor();
  const res1 = extractor.ingest('Picture this,');
  assert.strictEqual(res1.completed, null);
  assert.strictEqual(res1.inProgress, 'Picture this,');

  const res2 = extractor.ingest('Picture this, you are on a boat.');
  assert.strictEqual(res2.completed, 'Picture this, you are on a boat.');
  assert.strictEqual(res2.inProgress, '');
  extractor.recordLockedCompleted(res2.completed);

  // 測試歷史完結句尾部剝除
  const res3 = extractor.ingest('boat. And the sun is shining');
  assert.strictEqual(res3.completed, null);
  assert.strictEqual(res3.inProgress, 'And the sun is shining');

  const ext2 = new StreamingSentenceExtractor();
  ext2.recordLockedCompleted('Picture this, you are on a boat.');
  const resFinal = ext2.ingest('boat. And the sun is shining.');
  assert.strictEqual(resFinal.completed, 'And the sun is shining.');
  console.log('  - 結果: ✅ PASS\n');

  // 3. Caption Parser
  console.log('【3. Caption Parser 多格式字幕解析檢驗】');
  assert.strictEqual(decodeHtmlEntities('&amp; &quot; &#39; &lt; &gt;'), '& " \' < >');
  
  const vttSample = `WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello from VTT`;
  const vttRes = parseVttCaptions(vttSample);
  assert.ok(vttRes?.events?.length === 1);
  assert.strictEqual(vttRes.events[0].segs[0].utf8, 'Hello from VTT');

  const xmlSample = `<transcript><text start="1.5" dur="2.5">Hello &amp; welcome</text></transcript>`;
  const xmlRes = parseXmlCaptions(xmlSample);
  assert.ok(xmlRes?.events?.length === 1);
  assert.strictEqual(xmlRes.events[0].segs[0].utf8, 'Hello & welcome');

  const uniRes = parseUniversalCaptionText(JSON.stringify({ events: [{ tStartMs: 0, segs: [{ utf8: 'json3' }] }] }));
  assert.ok(uniRes?.events?.length === 1);
  console.log('  - 結果: ✅ PASS\n');

  // 4. Translation Scheduler
  console.log('【4. Translation Scheduler 請求調度與聚合檢驗】');
  let sendCount = 0;
  const mockSend = (msg, cb) => {
    sendCount++;
    setTimeout(() => cb({ translatedText: '譯: ' + msg.text }), 5);
  };
  const cache = new Map();
  const scheduler = new TranslationScheduler({
    sendRuntimeMessage: mockSend,
    onCacheHit: (k) => cache.get(k),
    onCacheSet: (k, t, res) => cache.set(k, res)
  });

  scheduler.requestTranslation('apple', 'en', 'zh-TW', () => {});
  scheduler.requestTranslation('apple', 'en', 'zh-TW', () => {});
  assert.strictEqual(sendCount, 1, '同一在途請求必須被聚合為單次發送');
  console.log('  - 結果: ✅ PASS\n');

  // 5. Protocol Constants & Static Contract Verification
  console.log('【5. Protocol 型別常量與靜態契約檢驗 (Protocol Contract)】');
  assert.strictEqual(WindowMessageType.CAPTION_TRACK_CHANGED, 'YT_CAPTION_TRACK_CHANGED');
  assert.strictEqual(WindowMessageType.FETCH_CAPTION_REQUEST, 'YT_FETCH_CAPTION_REQUEST');
  assert.strictEqual(WindowMessageType.FETCH_CAPTION_RESPONSE, 'YT_FETCH_CAPTION_RESPONSE');
  assert.strictEqual(RuntimeAction.TRANSLATE, 'translate');
  assert.strictEqual(isValidWindowMessage({ type: 'TEST' }), true);
  assert.strictEqual(isValidWindowMessage('string'), false);

  // 靜態合約檢驗：掃描 src/content-entry.js 確保所有被引用的協議常量均在 protocol.js 具體定義
  const fs = require('fs');
  const path = require('path');
  const contentCode = fs.readFileSync(path.join(__dirname, '../src/content-entry.js'), 'utf8');

  const wndMsgMatches = [...contentCode.matchAll(/WindowMessageType\.([A-Za-z0-9_]+)/g)].map(m => m[1]);
  const runtimeActMatches = [...contentCode.matchAll(/RuntimeAction\.([A-Za-z0-9_]+)/g)].map(m => m[1]);

  assert.ok(wndMsgMatches.length > 0, 'content-entry.js 必須至少包含 WindowMessageType 引用');
  assert.ok(runtimeActMatches.length > 0, 'content-entry.js 必須至少包含 RuntimeAction 引用');

  const undefinedWndMsg = [];
  for (const prop of wndMsgMatches) {
    if (WindowMessageType[prop] === undefined) {
      undefinedWndMsg.push(prop);
    }
  }

  const undefinedRuntimeAct = [];
  for (const prop of runtimeActMatches) {
    if (RuntimeAction[prop] === undefined) {
      undefinedRuntimeAct.push(prop);
    }
  }

  assert.strictEqual(
    undefinedWndMsg.length,
    0,
    `content-entry.js 引用了不存在的 WindowMessageType 屬性: ${undefinedWndMsg.join(', ')}`
  );
  assert.strictEqual(
    undefinedRuntimeAct.length,
    0,
    `content-entry.js 引用了不存在的 RuntimeAction 屬性: ${undefinedRuntimeAct.join(', ')}`
  );

  console.log(`  - WindowMessageType 引用檢查 (${wndMsgMatches.length} 處引用): 全部合法 (0 undefined)`);
  console.log(`  - RuntimeAction 引用檢查 (${runtimeActMatches.length} 處引用): 全部合法 (0 undefined)`);
  console.log('  - 結果: ✅ PASS\n');

  // 6. Session State Machine
  console.log('【6. Session State 會話狀態機與生命週期檢驗】');
  const session = new SessionState({ videoId: 'abc1234' });
  assert.strictEqual(session.lastObservedVideoId, 'abc1234');
  assert.strictEqual(session.isExtensionEnabled, true);
  assert.strictEqual(session.userTargetLang, 'zh-TW');
  assert.strictEqual(session.currentSessionId, 0);

  // 測試會話 ID 遞增與唯一性
  const s1 = session.nextFetchSessionId();
  assert.strictEqual(s1, 1);
  assert.strictEqual(session.isSessionActive(1), true);
  assert.strictEqual(session.isSessionActive(0), false);

  // 測試 Mode 2 狀態填入與 Seek 重置
  session.speechTokenQueue = ['hello', 'world'];
  session.lastLockedCompletedSentence = 'hello';
  session.currentSentenceStartTime = 12.5;
  session.resetSeek(50.0);
  assert.strictEqual(session.speechTokenQueue.length, 0);
  assert.strictEqual(session.lastLockedCompletedSentence, '');
  assert.strictEqual(session.currentSentenceStartTime, 50.0);
  console.log('  - resetSeek 精準重置暫態隊列: ✅ PASS');

  // 測試字幕重置
  session.sentenceList = [{ start: 0, end: 2, origText: 'test' }];
  session.prevSlot = { orig: 'p', trans: 't' };
  session.currSlot = { orig: 'c', trans: 't' };
  session.resetSubtitles();
  assert.strictEqual(session.sentenceList.length, 0);
  assert.strictEqual(session.prevSlot.orig, '');
  assert.strictEqual(session.currSlot.orig, '');
  assert.strictEqual(session.isSessionActive(s1), false, '字幕重置必須終止舊有非同步會話');
  console.log('  - resetSubtitles 完整清除雙模字幕狀態: ✅ PASS');

  // 測試換片重置
  session.telemetry.hasTrackedSubtitleSuccess = true;
  session.resetVideoNavigation('newVid999');
  assert.strictEqual(session.lastObservedVideoId, 'newVid999');
  assert.strictEqual(session.telemetry.hasTrackedSubtitleSuccess, false, '換片必須重置遙測標記');
  console.log('  - resetVideoNavigation 換片重置全狀態: ✅ PASS\n');

  // 7. Session Ordering & Lifecycle Transition Invariant Contract (Task 1 & 6)
  console.log('【7. Session Ordering 會話順序性與狀態移轉防護檢驗】');
  const sessionOrder = new SessionState({ videoId: 'VideoA' });
  const oldTrackA = { languageCode: 'en', vssId: '.en', videoId: 'VideoA' };
  sessionOrder.currentTrack = oldTrackA;
  sessionOrder.inFlightKey = '.en_VideoA';
  const oldSessionA = sessionOrder.nextFetchSessionId();

  // 模擬 Video B 新軌道到達 loadCaptionTrack
  const newTrackB = { languageCode: 'es', vssId: '.es', videoId: 'VideoB' };
  const vidB = newTrackB.videoId;

  // 1. 偵測到新影片時，navigation reset 必須發生在建立 sessionId 之前
  if (vidB && sessionOrder.lastObservedVideoId && vidB !== sessionOrder.lastObservedVideoId) {
    sessionOrder.resetVideoNavigation(vidB);
  }
  // 2. 狀態與 inFlightKey 必須在 navigation reset 之後設定
  const trackKeyB = `${newTrackB.vssId}_${vidB}`;
  sessionOrder.currentTrack = newTrackB;
  sessionOrder.inFlightKey = trackKeyB;
  sessionOrder.sentenceList = [];
  // 3. 建立全新 fetch session ID
  const newSessionB = sessionOrder.nextFetchSessionId();

  // 斷言驗證 invariants:
  assert.strictEqual(sessionOrder.lastObservedVideoId, 'VideoB', '影片 ID 必須更新為 Video B');
  assert.strictEqual(sessionOrder.currentTrack, newTrackB, 'currentTrack 必須為新軌道，絕不能被 reset 覆蓋為 null');
  assert.strictEqual(sessionOrder.inFlightKey, '.es_VideoB', 'inFlightKey 必須保留新軌道標記');
  assert.strictEqual(sessionOrder.isSessionActive(oldSessionA), false, '舊影片會話必須作廢');
  assert.strictEqual(sessionOrder.isSessionActive(newSessionB), true, '新影片會話在非同步回傳前必須保持活躍 (isSessionActive === true)');
  console.log('  - navigation reset -> new session -> isSessionActive 狀態序約: ✅ PASS\n');

  return { success: true };
}

if (require.main === module) {
  runCoreModulesTest();
}

module.exports = { runCoreModulesTest };
