/**
 * test_gemini_stream.js
 * 
 * 測試目標：
 * 針對 Gemini / ASR 即時語音串流模式 (Mode 2)，驗證：
 * 1. 斷句完整性與字詞精確度（全片 586 個真實快照回歸）
 * 2. 徹底杜絕瞬態殘留詞拼接異常（如使用者截圖中 "We this cave..." 故障）
 * 3. 跨行 Rollup 自然平滑銜接
 * 4. 譯文全生命週期穩定留存（0 閃爍、0 消失）
 */

const fs = require('fs');
const path = require('path');

const fixturePath = path.join(__dirname, 'fixtures', 'eclipse_asr.en.vtt');

const { cleanSubtitleNoise } = require('../src/core/sentence-policy');
const { StreamingSentenceExtractor } = require('../src/core/streaming-sentence-extractor');

function parseVttToMutationStream(vttString) {
  const blocks = vttString.split(/\r?\n\r?\n/);
  const timeRegex = /(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/;
  const snapshots = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const timeIdx = lines.findIndex(l => timeRegex.test(l));
    if (timeIdx === -1) continue;

    const m = lines[timeIdx].match(timeRegex);
    const parseMs = (h, min, s, ms) => ((parseInt(h||0,10)*3600 + parseInt(min||0,10)*60 + parseInt(s||0,10))*1000 + parseInt(ms||0,10));
    const startMs = parseMs(m[1], m[2], m[3], m[4]);

    const textLines = lines.slice(timeIdx + 1)
      .map(l => l.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);

    if (textLines.length > 0) {
      snapshots.push({ timeMs: startMs, timeSec: startMs / 1000, rawText: textLines.join(' ') });
    }
  }

  return snapshots;
}

function runGeminiStreamTest() {
  console.log('====================================================');
  console.log('TEST SUITE: Gemini / Live ASR Stream Simulator (V3)');
  console.log('====================================================');

  if (!fs.existsSync(fixturePath)) {
    console.error('Fixture missing:', fixturePath);
    return { success: false, error: 'Fixture missing' };
  }

  const vttRaw = fs.readFileSync(fixturePath, 'utf8');
  const mutations = parseVttToMutationStream(vttRaw);
  console.log(`[INFO] Loaded ${mutations.length} live DOM mutation snapshots.`);

  const extractor = new StreamingSentenceExtractor();
  let prevSlot = { orig: '', trans: '' };
  let currSlot = { orig: '', trans: '' };
  let lastFinishedSentence = '';
  let lastFinishedTrans = '';
  let shrinkToOneCount = 0;
  let translationCache = new Map();

  // 測試指標
  let totalTestedMutations = 0;
  let translationLossAnomalies = 0;
  let corruptedSentencesDetected = 0;
  let lastSlot1Orig = '';
  let lastSlot1Trans = '';
  let asyncTranslationQueue = [];
  const completedSentences = [];

  // 注入真實使用者截圖的「Seek / 瞬態殘留詞」場景
  // 在 03:58 教堂洞穴段落前注入孤立瞬態字詞 "We"
  const testSnapshots = [...mutations];
  const caveIdx = testSnapshots.findIndex(m => m.rawText.includes('this cave'));
  if (caveIdx !== -1) {
    testSnapshots.splice(caveIdx, 0, {
      timeMs: testSnapshots[caveIdx].timeMs - 100,
      timeSec: testSnapshots[caveIdx].timeSec - 0.1,
      rawText: "We"
    });
  }

  testSnapshots.forEach((m) => {
    totalTestedMutations++;
    const cleaned = cleanSubtitleNoise(m.rawText);
    if (!cleaned) return;

    const res = extractor.ingest(cleaned);
    if (!res) return;

    if (res.completed) {
      extractor.recordLockedCompleted(res.completed);
      completedSentences.push({ sec: m.timeSec, text: res.completed });

      // 嚴格檢驗：是否出現截圖中的畸形殘留詞拼接（例如 "We this cave..."）
      if (/^We\s+this\s+cave/i.test(res.completed)) {
        corruptedSentencesDetected++;
        console.error(`[FATAL REGRESSION] User screenshot bug reproduced at t=${m.timeSec}s: "${res.completed}"`);
      }

      const cachedTrans = translationCache.get(res.completed);
      const applyPromotion = (trans) => {
        if (res.inProgress) {
          prevSlot = { orig: res.completed, trans: trans };
          currSlot = { orig: res.inProgress, trans: '' };
          lastFinishedSentence = '';
          lastFinishedTrans = '';
        } else {
          if (!prevSlot.orig && lastFinishedSentence) {
            prevSlot = { orig: lastFinishedSentence, trans: lastFinishedTrans };
          }
          currSlot = { orig: res.completed, trans: trans };
          lastFinishedSentence = res.completed;
          lastFinishedTrans = trans;
        }
      };

      if (cachedTrans) {
        applyPromotion(cachedTrans);
      } else {
        if (!res.inProgress) {
          currSlot = { orig: res.completed, trans: '' };
        }
        const pendingSentence = res.completed;
        const targetSnapshotIdx = totalTestedMutations + 2;
        asyncTranslationQueue.push({
          resolveAtIdx: targetSnapshotIdx,
          sentence: pendingSentence,
          trans: `[中譯] ${pendingSentence.slice(0, 15)}...`
        });
      }
    } else if (res.inProgress) {
      if (lastFinishedSentence) {
        prevSlot = { orig: lastFinishedSentence, trans: lastFinishedTrans };
        lastFinishedSentence = '';
        lastFinishedTrans = '';
      }
      currSlot.orig = res.inProgress;
      currSlot.trans = '';
    }

    // 處理非同步翻譯抵達
    const arriving = asyncTranslationQueue.filter(item => item.resolveAtIdx <= totalTestedMutations);
    if (arriving.length > 0) {
      arriving.forEach(item => {
        translationCache.set(item.sentence, item.trans);
        if (lastFinishedSentence === item.sentence) {
          lastFinishedTrans = item.trans;
          currSlot.trans = item.trans;
        } else {
          prevSlot = {
            orig: item.sentence,
            trans: item.trans
          };
        }
      });
      asyncTranslationQueue = asyncTranslationQueue.filter(item => item.resolveAtIdx > totalTestedMutations);
    }

    // 嚴格審計：上槽 (Slot 1) 一旦有了譯文，在切換到新句前「絕不允許譯文變成空字串消失」！
    if (lastSlot1Trans && !prevSlot.trans && prevSlot.orig) {
      translationLossAnomalies++;
      console.error(`[TRANSLATION FLICKER DETECTED at t=${m.timeSec}s] Slot 1 translation disappeared for: "${prevSlot.orig}"`);
    }

    // 嚴格審計：在熱身完畢後 (第 2 句起)，畫面絕不允許下槽消失而縮成單行！
    if (totalTestedMutations > 10) {
      const hasSlot1 = Boolean(prevSlot.orig);
      const hasSlot2 = Boolean(currSlot.orig);
      if (hasSlot1 !== hasSlot2) {
        shrinkToOneCount++;
      }
    }

    lastSlot1Orig = prevSlot.orig;
    lastSlot1Trans = prevSlot.trans;
  });

  const caveSentence = completedSentences.find(s => s.text.includes('stained glass'));

  console.log(`\n--- Gemini Stream Audit Results ---`);
  console.log(`Snapshots Tested: ${totalTestedMutations}`);
  console.log(`Completed Sentences Extracted: ${completedSentences.length}`);
  console.log(`Translation Disappear/Reappear Anomalies (譯文消失又出現次數): ${translationLossAnomalies}`);
  console.log(`Shrink-To-One Anomalies (瞬間縮成一行/下槽消失抖動次數): ${shrinkToOneCount}`);
  console.log(`Corrupted Screenshot Bug Count: ${corruptedSentencesDetected}`);
  console.log(`Cave Scene Sentence: "${caveSentence ? caveSentence.text : 'NOT FOUND'}"`);

  return {
    success: translationLossAnomalies === 0 && corruptedSentencesDetected === 0 && shrinkToOneCount === 0,
    metrics: { totalTestedMutations, completedSentences: completedSentences.length, translationLossAnomalies, shrinkToOneCount, corruptedSentencesDetected }
  };
}

if (require.main === module) {
  runGeminiStreamTest();
}

module.exports = { runGeminiStreamTest };
