/**
 * sentence-policy.js
 * 
 * 雙語字幕智慧斷句核心語言規則策略庫 (Single Source of Truth)
 * 統一 Mode 1 (靜態全片預載) 與 Mode 2 (Rolling ASR 即時串流) 之語言與音訊文字規範：
 *   1. 音效、語音辨識雜訊標籤過濾
 *   2. 嚴格句末標點正規表達式 (含 Lookbehind 防口語省略號 "..." 誤切)
 *   3. 語意從屬連詞清單與邊界切分門檻
 *   4. 短句合流門檻 (< 5 字)
 *   5. 歷史完結句尾部消除比對 (Tail Overlap Detection)
 */

const SENTENCE_END_REGEX = /(?:(?<!\.)\.(?!\.)|[?!。？！])["'”’)]*$/;
const INTRA_SPLIT_REGEX = /(?<=(?:(?<!\.)\.(?!\.)|[?!。？！])["'”’)]*)\s+/;
const METADATA_HEADER_REGEX = /(?:Transcriber|Reviewer|Subtitles by):/i;

const COMMON_CONJUNCTIONS = [
  'and',
  'but',
  'so',
  'because',
  'which',
  'that',
  'now',
  'if',
  'or',
  'then'
];

const SENTENCE_LIMITS = {
  MAX_SENTENCE_CHARS: 320,
  MAX_SENTENCE_DURATION: 25.0,
  MIN_SENTENCE_WORD_COUNT: 5,
  MIN_CONJUNCTION_SPLIT_PREFIX: 12,
  MIN_CONJUNCTION_SPLIT_SUFFIX: 6,
  PUNCTUATION_SPARSE_THRESHOLD: 0.25,
  SPARSE_NATURAL_PAUSE_SECONDS: 0.7,
  SPARSE_NATURAL_PAUSE_MIN_WORDS: 6,
  SPARSE_CONJUNCTION_MIN_WORDS: 12,
  SPARSE_SOFT_LIMIT_WORDS: 22,
  STREAM_SOFT_LIMIT_TRIGGER_WORDS: 20,
  STREAM_HARD_LIMIT_WORDS: 26,
  STREAM_HARD_LIMIT_SPLIT_INDEX: 18
};

/**
 * 音效與背景噪音標籤過濾器
 * 清洗 >>, >>>, [Laughter], [Chuckles], [Music], [Applause], ♪, [音樂] 等無效音訊註釋
 */
function cleanSubtitleNoise(text) {
  if (!text) return '';
  return text
    .replace(/(?:&gt;|>){1,3}/g, '')
    .replace(/[\[\(](?:music|applause|laughter|chuckle|chuckles|giggle|giggles|snicker|snickers|cheering|screaming|snort|gasp|sigh|crying|groan|groaning|bell|chime|silence|whisper|cough|coughing|throat clearing|instrumental|sound effect|bgm|inaudible|unintelligible|音樂|掌聲|笑聲|鼓掌|歓声|拍手|音楽)[\]\)]/gi, '')
    .replace(/[♪♫♩♬]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 單字標準化 (去除標點符號與多餘空白，轉小寫)
 */
function normalizeWord(word) {
  if (!word) return '';
  return word.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * 判定單字是否為常見從屬連詞
 */
function isConjunction(word) {
  const norm = normalizeWord(word);
  return COMMON_CONJUNCTIONS.includes(norm);
}

/**
 * 判定字串結尾是否為標準句末標點
 */
function isSentenceEnd(text) {
  if (!text) return false;
  return SENTENCE_END_REGEX.test(text.trim());
}

/**
 * 檢查片語是否為歷史完結句的尾部殘留或完全重複
 * @param {string} phrase - 候選片語
 * @param {string[]|string} targets - 歷史完結句陣列或單句
 */
function isTailOfImmediatePrev(phrase, targets) {
  if (!phrase) return false;
  const clean = phrase.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return false;

  const targetList = Array.isArray(targets)
    ? targets.filter(Boolean)
    : (targets ? [targets] : []);

  for (const target of targetList) {
    const prevClean = target.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    if (prevClean.endsWith(clean) || prevClean === clean) return true;
  }
  return false;
}

/**
 * 在串流單字隊列中尋找安全連詞切分點 (具備雙端邊界保護)
 * @param {string[]} tokens - 單字陣列
 * @param {number} minPrefix - 前半句最少單字數 (預設 12)
 * @param {number} minSuffix - 後半句最少單字數 (預設 6)
 * @returns {number} 切分位置 index，若無合適位置回傳 -1
 */
function findConjunctionSplitIndex(
  tokens,
  minPrefix = SENTENCE_LIMITS.MIN_CONJUNCTION_SPLIT_PREFIX,
  minSuffix = SENTENCE_LIMITS.MIN_CONJUNCTION_SPLIT_SUFFIX
) {
  if (!Array.isArray(tokens) || tokens.length < minPrefix + minSuffix) return -1;
  const maxIdx = tokens.length - minSuffix;
  for (let i = minPrefix; i <= maxIdx; i++) {
    if (isConjunction(tokens[i])) {
      return i;
    }
  }
  return -1;
}

/**
 * 判斷是否為應向後合流的極短句 (< 5 個字)
 */
function shouldMergeShortSentence(wordCount) {
  return typeof wordCount === 'number' && wordCount < SENTENCE_LIMITS.MIN_SENTENCE_WORD_COUNT;
}

const FALLBACK_LONG_PAUSE_SECONDS = 2.5;
const MAX_SENTENCE_CHARS = SENTENCE_LIMITS.MAX_SENTENCE_CHARS;
const MAX_SENTENCE_DURATION = SENTENCE_LIMITS.MAX_SENTENCE_DURATION;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SENTENCE_END_REGEX,
    INTRA_SPLIT_REGEX,
    METADATA_HEADER_REGEX,
    COMMON_CONJUNCTIONS,
    SENTENCE_LIMITS,
    FALLBACK_LONG_PAUSE_SECONDS,
    MAX_SENTENCE_CHARS,
    MAX_SENTENCE_DURATION,
    cleanSubtitleNoise,
    normalizeWord,
    isConjunction,
    isSentenceEnd,
    isTailOfImmediatePrev,
    findConjunctionSplitIndex,
    shouldMergeShortSentence
  };
}
