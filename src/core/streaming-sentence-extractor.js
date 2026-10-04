/**
 * streaming-sentence-extractor.js
 * 
 * Mode 2 (Live ASR / Gemini DOM 串流) 即時斷句狀態機
 * 封裝 speechTokenQueue 與歷史完結句邊界判定，徹底消滅測試與生產邏輯分歧。
 */

const {
  SENTENCE_END_REGEX,
  SENTENCE_LIMITS,
  isTailOfImmediatePrev,
  findConjunctionSplitIndex,
  shouldMergeShortSentence
} = require('./sentence-policy');

class StreamingSentenceExtractor {
  constructor(options = {}) {
    this.speechTokenQueue = [];
    this.lastLockedCompletedSentence = '';
    this.completedSentenceHistory = [];
    this.maxSentenceChars = options.maxSentenceChars || SENTENCE_LIMITS.MAX_SENTENCE_CHARS;
    this.historyLimit = options.historyLimit || 5;
  }

  reset() {
    this.speechTokenQueue = [];
    this.lastLockedCompletedSentence = '';
    this.completedSentenceHistory = [];
  }

  recordLockedCompleted(sentence) {
    if (!sentence) return;
    this.lastLockedCompletedSentence = sentence;
    this.completedSentenceHistory.push(sentence);
    if (this.completedSentenceHistory.length > this.historyLimit) {
      this.completedSentenceHistory.shift();
    }
  }

  ingest(windowText) {
    if (!windowText || typeof windowText !== 'string') return null;
    let words = windowText.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;

    // 1. 若 incoming words 開頭包含歷史完結句 (完整整句或末尾殘留)，精準從開頭剝除，絕不污染下句隊列！
    const targets = [this.lastLockedCompletedSentence, ...this.completedSentenceHistory].filter(Boolean);
    for (const target of targets) {
      const targetWords = target.trim().split(/\s+/).filter(Boolean);
      for (let s = Math.min(words.length, targetWords.length + 2); s > 0; s--) {
        const candidate = words.slice(0, s).join(' ');
        if (isTailOfImmediatePrev(candidate, targets)) {
          words = words.slice(s);
          break;
        }
      }
    }

    if (words.length === 0) {
      return { completed: null, inProgress: this.speechTokenQueue.join(' ') };
    }

    // 2. 尋找 incoming words 在 speechTokenQueue 尾部的重疊切入點
    let maxMatchedWordCount = 0;
    for (let matchLen = Math.min(words.length, this.speechTokenQueue.length); matchLen > 0; matchLen--) {
      const queueSuffix = this.speechTokenQueue.slice(-matchLen).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).join(' ');
      const incomingPrefix = words.slice(0, matchLen).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).join(' ');
      if (queueSuffix === incomingPrefix && queueSuffix.length > 0) {
        maxMatchedWordCount = matchLen;
        break;
      }
    }

    if (maxMatchedWordCount > 0) {
      const newWords = words.slice(maxMatchedWordCount);
      this.speechTokenQueue.push(...newWords);
    } else if (this.speechTokenQueue.length === 0) {
      this.speechTokenQueue.push(...words);
    } else {
      // 跨視窗容錯：若 YouTube 滾動跳躍較大，在隊列中進行子序列比對
      const qClean = this.speechTokenQueue.map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).join(' ');
      let matchedMid = false;
      for (let len = Math.min(words.length, 6); len > 0; len--) {
        const inPrefix = words.slice(0, len).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).join(' ');
        const foundIdx = qClean.lastIndexOf(inPrefix);
        if (foundIdx !== -1) {
          const wordsBefore = qClean.slice(0, foundIdx).trim().split(/\s+/).filter(Boolean).length;
          const matchedQueuePos = wordsBefore + len;
          const newWords = words.slice(len);
          this.speechTokenQueue = this.speechTokenQueue.slice(0, matchedQueuePos).concat(newWords);
          matchedMid = true;
          break;
        }
      }
      if (!matchedMid) {
        const currentQueueText = this.speechTokenQueue.join(' ');
        const isOverLimit = currentQueueText.length > this.maxSentenceChars;
        const endsWithPunctuation = SENTENCE_END_REGEX.test(currentQueueText);

        if (!endsWithPunctuation && !isOverLimit) {
          // 隊列尚未遇句末標點，新行/新切片為自然跨行延伸，忠實接續隊列
          this.speechTokenQueue.push(...words);
        } else {
          // 當超過長度上限時，將已累積文字結算為完結句，絕不直接清空抹除！
          if (this.speechTokenQueue.length >= 6) {
            const completed = this.speechTokenQueue.join(' ');
            this.speechTokenQueue = [...words];
            return { completed, inProgress: this.speechTokenQueue.join(' ') };
          }
          this.speechTokenQueue = [...words];
        }
      }
    }

    // 3. 檢查隊列中是否包含句末標點符號 (嚴格排除省略號 ... 與口語停頓)
    const fullText = this.speechTokenQueue.join(' ');
    const match = fullText.match(/^([\s\S]+?(?:(?<!\.)\.(?!\.)|[?!。？！])["'”’)]*)(?:\s+([\s\S]*))?$/);
    if (match) {
      const completed = match[1].trim();
      const remainder = (match[2] || '').trim();
      const words = completed.split(/\s+/).filter(Boolean);

      // 短句 (< 5 個單字) 且隊列後續還有接續內容時，向後合流至下一句
      if (shouldMergeShortSentence(words.length) && remainder.length > 0) {
        const secondMatch = fullText.match(/^([\s\S]+?(?:(?<!\.)\.(?!\.)|[?!。？！])["'”’)]*[\s\S]+?(?:(?<!\.)\.(?!\.)|[?!。？！])["'”’)]*)(?:\s+([\s\S]*))?$/);
        if (secondMatch) {
          const doubleCompleted = secondMatch[1].trim();
          const doubleRemainder = (secondMatch[2] || '').trim();
          this.speechTokenQueue = doubleRemainder ? doubleRemainder.split(/\s+/).filter(Boolean) : [];
          return { completed: doubleCompleted, inProgress: doubleRemainder };
        }
        // 後句仍在說話中，先暫留隊列中累計
        return { completed: null, inProgress: fullText };
      }

      const cleanCompleted = completed.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      const cleanPrev = this.lastLockedCompletedSentence.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      const isDuplicate = cleanCompleted === cleanPrev;

      if (!isDuplicate) {
        this.speechTokenQueue = remainder ? remainder.split(/\s+/).filter(Boolean) : [];
        return { completed, inProgress: remainder };
      } else {
        // 若隊列開頭與上一句剛完結的句子完全重複，立即清除
        this.speechTokenQueue = remainder ? remainder.split(/\s+/).filter(Boolean) : [];
        return { completed: null, inProgress: remainder };
      }
    }

    // 4. 無標點音軌智慧自然斷句 (防止單句無限累積至 30~50 字導致下槽爆滿且上槽停滯！)
    if (this.speechTokenQueue.length >= SENTENCE_LIMITS.STREAM_SOFT_LIMIT_TRIGGER_WORDS) {
      let splitIdx = findConjunctionSplitIndex(
        this.speechTokenQueue,
        SENTENCE_LIMITS.MIN_CONJUNCTION_SPLIT_PREFIX,
        SENTENCE_LIMITS.MIN_CONJUNCTION_SPLIT_SUFFIX
      );
      if (splitIdx === -1 && this.speechTokenQueue.length >= SENTENCE_LIMITS.STREAM_HARD_LIMIT_WORDS) {
        splitIdx = SENTENCE_LIMITS.STREAM_HARD_LIMIT_SPLIT_INDEX;
      }
      if (splitIdx !== -1) {
        const completed = this.speechTokenQueue.slice(0, splitIdx).join(' ');
        const remainder = this.speechTokenQueue.slice(splitIdx).join(' ');
        this.speechTokenQueue = remainder ? remainder.split(/\s+/).filter(Boolean) : [];
        return { completed, inProgress: remainder };
      }
    }

    return { completed: null, inProgress: fullText };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StreamingSentenceExtractor };
}
