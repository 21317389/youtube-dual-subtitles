(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // src/bridge/protocol.js
  var require_protocol = __commonJS({
    "src/bridge/protocol.js"(exports, module) {
      var WindowMessageType = Object.freeze({
        NAVIGATE_START: "YT_NAVIGATE_START",
        CAPTION_TRACK_CHANGED: "YT_CAPTION_TRACK_CHANGED",
        REQUEST_CURRENT_TRACK: "YT_REQUEST_CURRENT_TRACK",
        FETCH_CAPTION_REQUEST: "YT_FETCH_CAPTION_REQUEST",
        FETCH_CAPTION_RESPONSE: "YT_FETCH_CAPTION_RESPONSE",
        FETCH_TRANSCRIPT_REQUEST: "YT_FETCH_TRANSCRIPT_REQUEST",
        FETCH_TRANSCRIPT_RESPONSE: "YT_FETCH_TRANSCRIPT_RESPONSE",
        FETCH_INNERTUBE_CAPTION_REQUEST: "YT_FETCH_INNERTUBE_CAPTION_REQUEST",
        FETCH_INNERTUBE_CAPTION_RESPONSE: "YT_FETCH_INNERTUBE_CAPTION_RESPONSE"
      });
      var RuntimeAction = Object.freeze({
        TRANSLATE: "translate",
        FETCH_CAPTION: "fetchCaption",
        TELEMETRY_EVENT: "telemetry_event"
      });
      function isValidWindowMessage(data) {
        return data && typeof data === "object" && typeof data.type === "string";
      }
      if (typeof module !== "undefined" && module.exports) {
        module.exports = {
          WindowMessageType,
          RuntimeAction,
          isValidWindowMessage
        };
      }
    }
  });

  // src/core/session-state.js
  var require_session_state = __commonJS({
    "src/core/session-state.js"(exports, module) {
      var SessionState = class {
        constructor(initial = {}) {
          this.settings = {
            isExtensionEnabled: initial.isExtensionEnabled !== false,
            userTargetLang: initial.userTargetLang || "zh-TW",
            userUiSize: initial.userUiSize || "medium",
            isHoverPauseEnabled: !!initial.isHoverPauseEnabled,
            subtitleOffset: initial.subtitleOffset || 0
          };
          this.track = {
            currentTrack: initial.currentTrack || null,
            isCaptionsEnabled: !!initial.isCaptionsEnabled,
            lastObservedVideoId: initial.videoId || ""
          };
          this.fetch = {
            currentSessionId: 0,
            inFlightKey: "",
            timedtextCooldownUntil: 0
          };
          this.mode1 = {
            sentenceList: [],
            lastWindowCheckTime: -999,
            consecutiveTranslateErrors: 0
          };
          this.mode2 = {
            speechTokenQueue: [],
            prevSlot: { orig: "", trans: "" },
            currSlot: { orig: "", trans: "" },
            lastLockedCompletedSentence: "",
            completedSentenceHistory: [],
            lastRawObservedWindowText: "",
            prevSlotTimeRange: { start: 0, end: 0 },
            currentSentenceStartTime: 0,
            lastFinishedSentence: "",
            lastFinishedTrans: ""
          };
          this.telemetry = {
            hasTrackedTranslateError: false
          };
        }
        // ==========================================
        // 便利存取器 (Convenience Getters / Setters)
        // ==========================================
        get isExtensionEnabled() {
          return this.settings.isExtensionEnabled;
        }
        set isExtensionEnabled(v) {
          this.settings.isExtensionEnabled = !!v;
        }
        get userTargetLang() {
          return this.settings.userTargetLang;
        }
        set userTargetLang(v) {
          this.settings.userTargetLang = v;
        }
        get userUiSize() {
          return this.settings.userUiSize;
        }
        set userUiSize(v) {
          this.settings.userUiSize = v;
        }
        get isHoverPauseEnabled() {
          return this.settings.isHoverPauseEnabled;
        }
        set isHoverPauseEnabled(v) {
          this.settings.isHoverPauseEnabled = !!v;
        }
        get subtitleOffset() {
          return this.settings.subtitleOffset;
        }
        set subtitleOffset(v) {
          this.settings.subtitleOffset = v;
        }
        get currentTrack() {
          return this.track.currentTrack;
        }
        set currentTrack(v) {
          this.track.currentTrack = v;
        }
        get isCaptionsEnabled() {
          return this.track.isCaptionsEnabled;
        }
        set isCaptionsEnabled(v) {
          this.track.isCaptionsEnabled = !!v;
        }
        get lastObservedVideoId() {
          return this.track.lastObservedVideoId;
        }
        set lastObservedVideoId(v) {
          this.track.lastObservedVideoId = v;
        }
        get currentSessionId() {
          return this.fetch.currentSessionId;
        }
        get inFlightKey() {
          return this.fetch.inFlightKey;
        }
        set inFlightKey(v) {
          this.fetch.inFlightKey = v;
        }
        get timedtextCooldownUntil() {
          return this.fetch.timedtextCooldownUntil;
        }
        set timedtextCooldownUntil(v) {
          this.fetch.timedtextCooldownUntil = v;
        }
        get sentenceList() {
          return this.mode1.sentenceList;
        }
        set sentenceList(v) {
          this.mode1.sentenceList = v;
        }
        get lastWindowCheckTime() {
          return this.mode1.lastWindowCheckTime;
        }
        set lastWindowCheckTime(v) {
          this.mode1.lastWindowCheckTime = v;
        }
        get consecutiveTranslateErrors() {
          return this.mode1.consecutiveTranslateErrors;
        }
        set consecutiveTranslateErrors(v) {
          this.mode1.consecutiveTranslateErrors = v;
        }
        get speechTokenQueue() {
          return this.mode2.speechTokenQueue;
        }
        set speechTokenQueue(v) {
          this.mode2.speechTokenQueue = v;
        }
        get prevSlot() {
          return this.mode2.prevSlot;
        }
        set prevSlot(v) {
          this.mode2.prevSlot = v;
        }
        get currSlot() {
          return this.mode2.currSlot;
        }
        set currSlot(v) {
          this.mode2.currSlot = v;
        }
        get lastLockedCompletedSentence() {
          return this.mode2.lastLockedCompletedSentence;
        }
        set lastLockedCompletedSentence(v) {
          this.mode2.lastLockedCompletedSentence = v;
        }
        get completedSentenceHistory() {
          return this.mode2.completedSentenceHistory;
        }
        set completedSentenceHistory(v) {
          this.mode2.completedSentenceHistory = v;
        }
        get lastRawObservedWindowText() {
          return this.mode2.lastRawObservedWindowText;
        }
        set lastRawObservedWindowText(v) {
          this.mode2.lastRawObservedWindowText = v;
        }
        get prevSlotTimeRange() {
          return this.mode2.prevSlotTimeRange;
        }
        set prevSlotTimeRange(v) {
          this.mode2.prevSlotTimeRange = v;
        }
        get currentSentenceStartTime() {
          return this.mode2.currentSentenceStartTime;
        }
        set currentSentenceStartTime(v) {
          this.mode2.currentSentenceStartTime = v;
        }
        get lastFinishedSentence() {
          return this.mode2.lastFinishedSentence;
        }
        set lastFinishedSentence(v) {
          this.mode2.lastFinishedSentence = v;
        }
        get lastFinishedTrans() {
          return this.mode2.lastFinishedTrans;
        }
        set lastFinishedTrans(v) {
          this.mode2.lastFinishedTrans = v;
        }
        // ==========================================
        // 生命週期狀態機方法 (Lifecycle State Transitions)
        // ==========================================
        /**
         * 生成下一輪全新的字幕抓取會話 ID
         * 任何過時會話的非同步回呼皆會被阻絕
         * @returns {number}
         */
        nextFetchSessionId() {
          return ++this.fetch.currentSessionId;
        }
        /**
         * 驗證給定的 sessionId 是否為當前唯一活躍會話
         * @param {number} sessionId
         * @returns {boolean}
         */
        isSessionActive(sessionId) {
          return sessionId === this.fetch.currentSessionId;
        }
        /**
         * 字幕重置：當切換軌道、關閉 CC 或切換插件開關時呼叫
         * 清空字幕資料與抓取標記，保留使用者個人化設定
         */
        resetSubtitles() {
          this.nextFetchSessionId();
          this.fetch.inFlightKey = "";
          this.mode1.sentenceList = [];
          this.mode1.lastWindowCheckTime = -999;
          this.mode1.consecutiveTranslateErrors = 0;
          this.resetStreaming();
        }
        /**
         * Mode 2 即時串流狀態重置
         * 清空暫存隊列與雙槽雙語內容
         */
        resetStreaming() {
          this.mode2.speechTokenQueue = [];
          this.mode2.prevSlot = { orig: "", trans: "" };
          this.mode2.currSlot = { orig: "", trans: "" };
          this.mode2.lastLockedCompletedSentence = "";
          this.mode2.completedSentenceHistory = [];
          this.mode2.lastRawObservedWindowText = "";
          this.mode2.prevSlotTimeRange = { start: 0, end: 0 };
          this.mode2.currentSentenceStartTime = 0;
          this.mode2.lastFinishedSentence = "";
          this.mode2.lastFinishedTrans = "";
        }
        /**
         * 進度條跳轉 (Seek) 重置保護
         * 清空瞬態進行中文字，防止跨時間點污染
         * @param {number} currentTime - 跳轉落點當前秒數
         */
        resetSeek(currentTime = 0) {
          this.mode2.speechTokenQueue = [];
          this.mode2.lastLockedCompletedSentence = "";
          this.mode2.lastRawObservedWindowText = "";
          this.mode2.currentSentenceStartTime = currentTime;
        }
        /**
         * 全影片導航重置 (YouTube SPA 換片)
         * @param {string} newVideoId
         */
        resetVideoNavigation(newVideoId) {
          this.resetTelemetry();
          this.resetSubtitles();
          this.track.lastObservedVideoId = newVideoId || "";
          this.track.currentTrack = null;
        }
        /**
         * 重置單片遙測旗標 (每部影片僅追蹤一次)
         */
        resetTelemetry() {
          this.telemetry.hasTrackedTranslateError = false;
        }
      };
      if (typeof module !== "undefined" && module.exports) {
        module.exports = {
          SessionState
        };
      }
    }
  });

  // src/core/sentence-policy.js
  var require_sentence_policy = __commonJS({
    "src/core/sentence-policy.js"(exports, module) {
      var SENTENCE_END_REGEX = /(?:(?<!\.)\.(?!\.)|[?!。？！])["'”’)]*$/;
      var INTRA_SPLIT_REGEX = /(?<=(?:(?<!\.)\.(?!\.)|[?!。？！])["'”’)]*)\s+/;
      var COMMON_CONJUNCTIONS = [
        "and",
        "but",
        "so",
        "because",
        "which",
        "that",
        "now",
        "if",
        "or",
        "then"
      ];
      var SENTENCE_LIMITS = {
        MAX_SENTENCE_CHARS: 320,
        MAX_SENTENCE_DURATION: 25,
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
      function cleanSubtitleNoise(text) {
        if (!text) return "";
        return text.replace(/(?:&gt;|>){1,3}/g, "").replace(/[\[\(](?:music|applause|laughter|chuckle|chuckles|giggle|giggles|snicker|snickers|cheering|screaming|snort|gasp|sigh|crying|groan|groaning|bell|chime|silence|whisper|cough|coughing|throat clearing|instrumental|sound effect|bgm|inaudible|unintelligible|音樂|掌聲|笑聲|鼓掌|歓声|拍手|音楽)[\]\)]/gi, "").replace(/[♪♫♩♬]/g, "").replace(/\s+/g, " ").trim();
      }
      function normalizeWord(word) {
        if (!word) return "";
        return word.toLowerCase().replace(/[^a-z0-9]/g, "");
      }
      function isConjunction(word) {
        const norm = normalizeWord(word);
        return COMMON_CONJUNCTIONS.includes(norm);
      }
      function isSentenceEnd(text) {
        if (!text) return false;
        return SENTENCE_END_REGEX.test(text.trim());
      }
      function isTailOfImmediatePrev(phrase, targets) {
        if (!phrase) return false;
        const clean = phrase.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
        if (!clean) return false;
        const targetList = Array.isArray(targets) ? targets.filter(Boolean) : targets ? [targets] : [];
        for (const target of targetList) {
          const prevClean = target.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
          if (prevClean.endsWith(clean) || prevClean === clean) return true;
        }
        return false;
      }
      function findConjunctionSplitIndex(tokens, minPrefix = SENTENCE_LIMITS.MIN_CONJUNCTION_SPLIT_PREFIX, minSuffix = SENTENCE_LIMITS.MIN_CONJUNCTION_SPLIT_SUFFIX) {
        if (!Array.isArray(tokens) || tokens.length < minPrefix + minSuffix) return -1;
        const maxIdx = tokens.length - minSuffix;
        for (let i = minPrefix; i <= maxIdx; i++) {
          if (isConjunction(tokens[i])) {
            return i;
          }
        }
        return -1;
      }
      function shouldMergeShortSentence(wordCount) {
        return typeof wordCount === "number" && wordCount < SENTENCE_LIMITS.MIN_SENTENCE_WORD_COUNT;
      }
      var FALLBACK_LONG_PAUSE_SECONDS = 2.5;
      var MAX_SENTENCE_CHARS = SENTENCE_LIMITS.MAX_SENTENCE_CHARS;
      var MAX_SENTENCE_DURATION = SENTENCE_LIMITS.MAX_SENTENCE_DURATION;
      if (typeof module !== "undefined" && module.exports) {
        module.exports = {
          SENTENCE_END_REGEX,
          INTRA_SPLIT_REGEX,
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
    }
  });

  // src/core/streaming-sentence-extractor.js
  var require_streaming_sentence_extractor = __commonJS({
    "src/core/streaming-sentence-extractor.js"(exports, module) {
      var {
        SENTENCE_END_REGEX,
        SENTENCE_LIMITS,
        isTailOfImmediatePrev,
        findConjunctionSplitIndex,
        shouldMergeShortSentence
      } = require_sentence_policy();
      var StreamingSentenceExtractor = class {
        constructor(options = {}) {
          this.speechTokenQueue = [];
          this.lastLockedCompletedSentence = "";
          this.completedSentenceHistory = [];
          this.maxSentenceChars = options.maxSentenceChars || SENTENCE_LIMITS.MAX_SENTENCE_CHARS;
          this.historyLimit = options.historyLimit || 5;
        }
        reset() {
          this.speechTokenQueue = [];
          this.lastLockedCompletedSentence = "";
          this.completedSentenceHistory = [];
        }
        recordLockedCompleted(sentence) {
          if (!sentence) return;
          this.lastLockedCompletedSentence = sentence;
          if (this.completedSentenceHistory[this.completedSentenceHistory.length - 1] !== sentence) {
            this.completedSentenceHistory.push(sentence);
            if (this.completedSentenceHistory.length > this.historyLimit) {
              this.completedSentenceHistory.shift();
            }
          }
        }
        ingest(windowText) {
          if (!windowText || typeof windowText !== "string") return null;
          let words = windowText.trim().split(/\s+/).filter(Boolean);
          if (words.length === 0) return null;
          const returnResult = (completed, inProgress) => {
            if (completed) {
              this.recordLockedCompleted(completed);
            }
            return { completed, inProgress };
          };
          const targets = [this.lastLockedCompletedSentence, ...this.completedSentenceHistory].filter(Boolean);
          for (const target of targets) {
            const targetWords = target.trim().split(/\s+/).filter(Boolean);
            for (let s = Math.min(words.length, targetWords.length + 2); s > 0; s--) {
              const candidate = words.slice(0, s).join(" ");
              if (isTailOfImmediatePrev(candidate, targets)) {
                words = words.slice(s);
                break;
              }
            }
          }
          if (words.length === 0) {
            return returnResult(null, this.speechTokenQueue.join(" "));
          }
          let maxMatchedWordCount = 0;
          for (let matchLen = Math.min(words.length, this.speechTokenQueue.length); matchLen > 0; matchLen--) {
            const queueSuffix = this.speechTokenQueue.slice(-matchLen).map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, "")).join(" ");
            const incomingPrefix = words.slice(0, matchLen).map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, "")).join(" ");
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
            const qClean = this.speechTokenQueue.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, "")).join(" ");
            let matchedMid = false;
            for (let len = Math.min(words.length, 6); len > 0; len--) {
              const inPrefix = words.slice(0, len).map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, "")).join(" ");
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
              const currentQueueText = this.speechTokenQueue.join(" ");
              const isOverLimit = currentQueueText.length > this.maxSentenceChars;
              const endsWithPunctuation = SENTENCE_END_REGEX.test(currentQueueText);
              if (!endsWithPunctuation && !isOverLimit) {
                this.speechTokenQueue.push(...words);
              } else {
                if (this.speechTokenQueue.length >= 6) {
                  const completed = this.speechTokenQueue.join(" ");
                  this.speechTokenQueue = [...words];
                  return returnResult(completed, this.speechTokenQueue.join(" "));
                }
                this.speechTokenQueue = [...words];
              }
            }
          }
          const fullText = this.speechTokenQueue.join(" ");
          const match = fullText.match(/^([\s\S]+?(?:(?<!\.)\.(?!\.)|[?!。？！])["'”’)]*)(?:\s+([\s\S]*))?$/);
          if (match) {
            const completed = match[1].trim();
            const remainder = (match[2] || "").trim();
            const words2 = completed.split(/\s+/).filter(Boolean);
            if (shouldMergeShortSentence(words2.length) && remainder.length > 0) {
              const secondMatch = fullText.match(/^([\s\S]+?(?:(?<!\.)\.(?!\.)|[?!。？！])["'”’)]*[\s\S]+?(?:(?<!\.)\.(?!\.)|[?!。？！])["'”’)]*)(?:\s+([\s\S]*))?$/);
              if (secondMatch) {
                const doubleCompleted = secondMatch[1].trim();
                const doubleRemainder = (secondMatch[2] || "").trim();
                this.speechTokenQueue = doubleRemainder ? doubleRemainder.split(/\s+/).filter(Boolean) : [];
                return returnResult(doubleCompleted, doubleRemainder);
              }
              return returnResult(null, fullText);
            }
            const cleanCompleted = completed.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
            const cleanPrev = this.lastLockedCompletedSentence.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
            const isDuplicate = cleanCompleted === cleanPrev;
            if (!isDuplicate) {
              this.speechTokenQueue = remainder ? remainder.split(/\s+/).filter(Boolean) : [];
              return returnResult(completed, remainder);
            } else {
              this.speechTokenQueue = remainder ? remainder.split(/\s+/).filter(Boolean) : [];
              return returnResult(null, remainder);
            }
          }
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
              const completed = this.speechTokenQueue.slice(0, splitIdx).join(" ");
              const remainder = this.speechTokenQueue.slice(splitIdx).join(" ");
              this.speechTokenQueue = remainder ? remainder.split(/\s+/).filter(Boolean) : [];
              return returnResult(completed, remainder);
            }
          }
          return returnResult(null, fullText);
        }
      };
      if (typeof module !== "undefined" && module.exports) {
        module.exports = { StreamingSentenceExtractor };
      }
    }
  });

  // src/core/caption-parser.js
  var require_caption_parser = __commonJS({
    "src/core/caption-parser.js"(exports, module) {
      function decodeHtmlEntities(str) {
        if (!str) return "";
        return str.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
      }
      function parseXmlCaptions(xmlString) {
        if (!xmlString) return null;
        if (typeof DOMParser !== "undefined") {
          try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
            const events = [];
            const pElements = xmlDoc.querySelectorAll("p");
            if (pElements.length > 0) {
              pElements.forEach((p) => {
                const tStartMs = parseInt(p.getAttribute("t") || "0", 10);
                const dDurationMs = parseInt(p.getAttribute("d") || "2000", 10);
                const text = p.textContent || "";
                if (text.trim()) {
                  events.push({
                    tStartMs,
                    dDurationMs,
                    segs: [{ utf8: text }]
                  });
                }
              });
              if (events.length > 0) return { events };
            }
            const textElements = xmlDoc.querySelectorAll("text");
            if (textElements.length > 0) {
              textElements.forEach((t) => {
                const startSec = parseFloat(t.getAttribute("start") || "0");
                const durSec = parseFloat(t.getAttribute("dur") || "2.0");
                const text = t.textContent || "";
                if (text.trim()) {
                  events.push({
                    tStartMs: Math.round(startSec * 1e3),
                    dDurationMs: Math.round(durSec * 1e3),
                    segs: [{ utf8: text }]
                  });
                }
              });
              if (events.length > 0) return { events };
            }
          } catch (e) {
          }
        }
        try {
          const regexEvents = [];
          const pRegex = /<p\s+[^>]*t="(\d+)"[^>]*d="(\d+)"[^>]*>([\s\S]*?)<\/p>/gi;
          let match;
          while ((match = pRegex.exec(xmlString)) !== null) {
            const tStartMs = parseInt(match[1], 10);
            const dDurationMs = parseInt(match[2], 10);
            const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, "").trim());
            if (text) {
              regexEvents.push({ tStartMs, dDurationMs, segs: [{ utf8: text }] });
            }
          }
          if (regexEvents.length > 0) return { events: regexEvents };
          const textRegex = /<text\s+[^>]*start="([\d.]+)"[^>]*dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
          while ((match = textRegex.exec(xmlString)) !== null) {
            const startSec = parseFloat(match[1]);
            const durSec = parseFloat(match[2]);
            const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, "").trim());
            if (text) {
              regexEvents.push({
                tStartMs: Math.round(startSec * 1e3),
                dDurationMs: Math.round(durSec * 1e3),
                segs: [{ utf8: text }]
              });
            }
          }
          if (regexEvents.length > 0) return { events: regexEvents };
        } catch (err) {
        }
        return null;
      }
      function parseVttCaptions(vttString) {
        if (!vttString || !vttString.includes("WEBVTT") && !vttString.includes("-->")) return null;
        const events = [];
        const timeRegex = /(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/;
        const blocks = vttString.split(/\r?\n\r?\n/);
        let lastAppendedLine = "";
        for (const block of blocks) {
          const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          if (lines.length === 0) continue;
          let timeLineIdx = -1;
          for (let i = 0; i < lines.length; i++) {
            if (timeRegex.test(lines[i])) {
              timeLineIdx = i;
              break;
            }
          }
          if (timeLineIdx === -1) continue;
          const match = lines[timeLineIdx].match(timeRegex);
          if (!match) continue;
          const startH = parseInt(match[1] || "0", 10);
          const startM = parseInt(match[2], 10);
          const startS = parseInt(match[3], 10);
          const startMs = parseInt(match[4], 10);
          const tStartMs = (startH * 3600 + startM * 60 + startS) * 1e3 + startMs;
          const endH = parseInt(match[5] || "0", 10);
          const endM = parseInt(match[6], 10);
          const endS = parseInt(match[7], 10);
          const endMs = parseInt(match[8], 10);
          const endTotalMs = (endH * 3600 + endM * 60 + endS) * 1e3 + endMs;
          if (endTotalMs - tStartMs <= 20) continue;
          const textLines = lines.slice(timeLineIdx + 1).map((l) => l.replace(/<[^>]+>/g, "").trim()).filter(Boolean);
          if (textLines.length === 0) continue;
          let freshText = "";
          if (textLines.length === 1) {
            freshText = textLines[0];
          } else if (textLines.length >= 2) {
            if (textLines[0] === lastAppendedLine) {
              freshText = textLines.slice(1).join(" ");
            } else {
              freshText = textLines.join(" ");
            }
          }
          if (freshText && freshText !== lastAppendedLine) {
            events.push({
              tStartMs,
              dDurationMs: Math.max(endTotalMs - tStartMs, 500),
              segs: [{ utf8: freshText }]
            });
            lastAppendedLine = freshText;
          }
        }
        return events.length > 0 ? { events } : null;
      }
      function parseUniversalCaptionText(rawText) {
        if (!rawText || !rawText.trim()) return null;
        try {
          const data = JSON.parse(rawText);
          if (data?.events && data.events.length > 0) {
            return data;
          }
        } catch (e) {
        }
        const xmlData = parseXmlCaptions(rawText);
        if (xmlData?.events && xmlData.events.length > 0) {
          return xmlData;
        }
        const vttData = parseVttCaptions(rawText);
        if (vttData?.events && vttData.events.length > 0) {
          return vttData;
        }
        return null;
      }
      if (typeof module !== "undefined" && module.exports) {
        module.exports = {
          decodeHtmlEntities,
          parseXmlCaptions,
          parseVttCaptions,
          parseUniversalCaptionText
        };
      }
    }
  });

  // src/core/translation-scheduler.js
  var require_translation_scheduler = __commonJS({
    "src/core/translation-scheduler.js"(exports, module) {
      var TranslationScheduler = class {
        constructor(options = {}) {
          this.inFlightRequests = /* @__PURE__ */ new Map();
          this.activeLiveRequestId = 0;
          this.sendRuntimeMessage = options.sendRuntimeMessage || ((msg, cb) => cb && cb({}));
          this.cache = options.cache || /* @__PURE__ */ new Map();
          this.onCacheHit = options.onCacheHit || ((k) => this.cache.get(k) || null);
          this.onCacheSet = options.onCacheSet || ((k, t, res) => this.cache.set(k, res));
        }
        getCacheKey(sourceLang, targetLang, text) {
          return `${sourceLang || "auto"}->${targetLang || "zh-TW"}:${text}`;
        }
        clearCache() {
          this.cache.clear();
        }
        /**
         * 調度單句翻譯，具備在途請求聚合
         */
        requestTranslation(text, sourceLang, targetLang, callback) {
          if (!text || !text.trim()) {
            if (callback) callback({ translatedText: "" });
            return;
          }
          const key = this.getCacheKey(sourceLang, targetLang, text);
          const cached = this.onCacheHit(key, text);
          if (cached) {
            if (callback) callback(typeof cached === "object" && cached !== null ? cached : { translatedText: cached });
            return;
          }
          if (this.inFlightRequests.has(key)) {
            this.inFlightRequests.get(key).push(callback);
            return;
          }
          this.inFlightRequests.set(key, [callback]);
          this.sendRuntimeMessage({
            action: "translate",
            text,
            sourceLang: sourceLang || "auto",
            targetLang: targetLang || "zh-TW"
          }, (res) => {
            const translatedText = res?.translatedText?.trim() || "";
            if (translatedText) {
              this.onCacheSet(key, text, translatedText);
            }
            const cbs = this.inFlightRequests.get(key) || [];
            this.inFlightRequests.delete(key);
            const resultObj = res?.translatedText !== void 0 ? res : { translatedText };
            cbs.forEach((cb) => {
              try {
                if (cb) cb(resultObj);
              } catch (e) {
              }
            });
          });
        }
        /**
         * 調度 Mode 2 即時串流滾動翻譯 (過時前綴請求自動作廢)
         */
        requestLiveTranslation(text, sourceLang, targetLang, callback) {
          const currentId = ++this.activeLiveRequestId;
          this.requestTranslation(text, sourceLang, targetLang, (res) => {
            if (currentId !== this.activeLiveRequestId) return;
            if (callback) callback(res);
          });
          return currentId;
        }
        cancelActiveLiveRequests() {
          this.activeLiveRequestId++;
        }
      };
      if (typeof module !== "undefined" && module.exports) {
        module.exports = { TranslationScheduler };
      }
    }
  });

  // src/ui/subtitle-renderer.js
  var require_subtitle_renderer = __commonJS({
    "src/ui/subtitle-renderer.js"(exports, module) {
      var DEFAULT_SIZE_MAP = {
        small: { orig: "16px", trans: "13px", minW: "160px", maxW: "260px", pad: "8px 12px", head: "13px", body: "12px", btn: "11px", btnPad: "3px 7px" },
        medium: { orig: "20px", trans: "16px", minW: "190px", maxW: "320px", pad: "10px 14px", head: "15px", body: "14px", btn: "12px", btnPad: "4px 9px" },
        large: { orig: "24px", trans: "19px", minW: "230px", maxW: "380px", pad: "12px 16px", head: "17px", body: "16px", btn: "13px", btnPad: "5px 11px" },
        xlarge: { orig: "28px", trans: "23px", minW: "270px", maxW: "440px", pad: "14px 18px", head: "20px", body: "18px", btn: "15px", btnPad: "6px 13px" }
      };
      function applySubtitleSize(size, sizeMap = DEFAULT_SIZE_MAP, doc = typeof document !== "undefined" ? document : null) {
        if (!doc || !doc.documentElement) return;
        const conf = sizeMap[size] || sizeMap.medium || DEFAULT_SIZE_MAP.medium;
        const root = doc.documentElement;
        if (root.style && typeof root.style.setProperty === "function") {
          root.style.setProperty("--cue-orig-size", conf.orig);
          root.style.setProperty("--cue-trans-size", conf.trans);
          root.style.setProperty("--tooltip-min-width", conf.minW);
          root.style.setProperty("--tooltip-max-width", conf.maxW);
          root.style.setProperty("--tooltip-padding", conf.pad);
          root.style.setProperty("--tooltip-header-size", conf.head);
          root.style.setProperty("--tooltip-body-size", conf.body);
          root.style.setProperty("--tooltip-btn-size", conf.btn);
          root.style.setProperty("--tooltip-btn-padding", conf.btnPad);
        }
      }
      function ensureSubtitleContainer(player, doc = typeof document !== "undefined" ? document : null, containerId = "yt-dual-subtitle-container") {
        if (!player || !doc) return null;
        let container = doc.getElementById(containerId);
        if (!container) {
          container = doc.createElement("div");
          container.id = containerId;
          player.appendChild(container);
        } else if (container.parentElement !== player) {
          player.appendChild(container);
        }
        return container;
      }
      function stripOverlappingPrefix(prevOrig, currOrig) {
        if (!prevOrig || !currOrig) return currOrig || "";
        const prevClean = prevOrig.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
        const currClean = currOrig.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
        if (currClean.startsWith(prevClean)) {
          const prevWordCount = prevOrig.trim().split(/\s+/).length;
          const currWords = currOrig.trim().split(/\s+/);
          return currWords.slice(prevWordCount).join(" ").trim();
        }
        return currOrig;
      }
      function createSlotNode(doc, className) {
        const slot = doc.createElement("div");
        slot.className = `cue-slot ${className}`;
        slot.style.display = "none";
        const orig = doc.createElement("div");
        orig.className = "cue-slot-orig";
        slot.appendChild(orig);
        const trans = doc.createElement("div");
        trans.className = "cue-slot-trans";
        trans.style.display = "none";
        slot.appendChild(trans);
        return slot;
      }
      function renderDualSlotSubtitle(container, prev, curr, options = {}) {
        const isExtensionEnabled = options.isExtensionEnabled !== false;
        const isCaptionsEnabled = options.isCaptionsEnabled !== false;
        const player = options.player || null;
        if (!isExtensionEnabled || !isCaptionsEnabled) {
          if (container) container.style.display = "none";
          if (player && player.classList) player.classList.remove("yt-dual-sub-active");
          return false;
        }
        if (!container) return false;
        const currOrig = curr?.orig || "";
        const currTrans = curr?.trans || "";
        const displayCurrOrig = stripOverlappingPrefix(prev?.orig, currOrig);
        const currentSig = `${prev?.orig || ""}@@${prev?.trans || ""}@@${displayCurrOrig}@@${currTrans}`;
        if (options.lastRenderedSig && currentSig === options.lastRenderedSig && container.style.display !== "none") {
          return true;
        }
        if (typeof options.onSignatureChange === "function") {
          options.onSignatureChange(currentSig);
        }
        if (!prev?.orig && !displayCurrOrig) {
          container.style.display = "none";
          if (player && player.classList) player.classList.remove("yt-dual-sub-active");
          return false;
        }
        if ((currTrans || prev?.trans) && typeof options.onFirstRenderSuccess === "function") {
          options.onFirstRenderSuccess();
        }
        let slotPrev = container.querySelector(".cue-slot-prev");
        let slotCurr = container.querySelector(".cue-slot-curr");
        if (!slotPrev || !slotCurr) {
          container.textContent = "";
          const doc = container.ownerDocument || (typeof document !== "undefined" ? document : null);
          if (!doc) return false;
          slotPrev = createSlotNode(doc, "cue-slot-prev");
          slotCurr = createSlotNode(doc, "cue-slot-curr");
          container.appendChild(slotPrev);
          container.appendChild(slotCurr);
        }
        if (prev?.orig) {
          const origEl = slotPrev.querySelector(".cue-slot-orig");
          const transEl = slotPrev.querySelector(".cue-slot-trans");
          if (origEl) origEl.textContent = prev.orig;
          if (transEl) {
            if (prev.trans) {
              transEl.textContent = prev.trans;
              transEl.style.display = "";
              transEl.style.visibility = "visible";
            } else {
              transEl.textContent = "\xA0";
              transEl.style.display = "";
              transEl.style.visibility = "hidden";
            }
          }
          slotPrev.style.display = "flex";
        } else {
          slotPrev.style.display = "none";
        }
        if (displayCurrOrig) {
          const origEl = slotCurr.querySelector(".cue-slot-orig");
          const transEl = slotCurr.querySelector(".cue-slot-trans");
          if (origEl) origEl.textContent = displayCurrOrig;
          if (transEl) {
            if (currTrans) {
              transEl.textContent = currTrans;
              transEl.style.display = "";
            } else {
              transEl.textContent = "";
              transEl.style.display = "none";
            }
          }
          slotCurr.style.display = "flex";
        } else {
          slotCurr.style.display = "none";
        }
        container.style.display = "flex";
        if (player && player.classList) {
          player.classList.add("yt-dual-sub-active");
        }
        return true;
      }
      function hideSubtitle(container, player) {
        if (container) {
          container.style.display = "none";
          if (typeof container.querySelectorAll === "function") {
            const texts = container.querySelectorAll(".cue-slot-orig, .cue-slot-trans");
            texts.forEach((el) => {
              el.textContent = "";
            });
          }
        }
        if (player && player.classList) player.classList.remove("yt-dual-sub-active");
      }
      var SubtitleRenderer = class {
        constructor(options = {}) {
          this.containerId = options.containerId || "yt-dual-subtitle-container";
          this.sizeMap = options.sizeMap || DEFAULT_SIZE_MAP;
          this.lastRenderedSig = "";
          this.hasTrackedRenderSuccess = false;
          this.onTrackSuccess = options.onTrackSuccess || null;
        }
        applySize(size, doc) {
          applySubtitleSize(size, this.sizeMap, doc);
        }
        ensureContainer(player, doc) {
          return ensureSubtitleContainer(player, doc, this.containerId);
        }
        render(container, prev, curr, options = {}) {
          return renderDualSlotSubtitle(container, prev, curr, {
            ...options,
            lastRenderedSig: this.lastRenderedSig,
            onSignatureChange: (sig) => {
              this.lastRenderedSig = sig;
              if (typeof options.onSignatureChange === "function") options.onSignatureChange(sig);
            },
            onFirstRenderSuccess: () => {
              if (!this.hasTrackedRenderSuccess) {
                this.hasTrackedRenderSuccess = true;
                if (typeof this.onTrackSuccess === "function") this.onTrackSuccess();
              }
              if (typeof options.onFirstRenderSuccess === "function") options.onFirstRenderSuccess();
            }
          });
        }
        hide(container, player) {
          this.lastRenderedSig = "";
          hideSubtitle(container, player);
        }
        resetSignature() {
          this.lastRenderedSig = "";
        }
      };
      if (typeof module !== "undefined" && module.exports) {
        module.exports = {
          DEFAULT_SIZE_MAP,
          applySubtitleSize,
          ensureSubtitleContainer,
          stripOverlappingPrefix,
          createSlotNode,
          renderDualSlotSubtitle,
          hideSubtitle,
          SubtitleRenderer
        };
      }
    }
  });

  // src/ui/tooltip-controller.js
  var require_tooltip_controller = __commonJS({
    "src/ui/tooltip-controller.js"(exports, module) {
      function calculateTooltipPosition(rect, playerRect, tooltipWidth = 230, tooltipHeight = 100) {
        let left = rect.left - playerRect.left;
        let top = rect.bottom - playerRect.top + 8;
        const maxLeft = playerRect.width - tooltipWidth - 12;
        left = Math.max(10, Math.min(left, maxLeft));
        if (top + tooltipHeight > playerRect.height - 10) {
          top = Math.max(10, rect.top - playerRect.top - tooltipHeight - 8);
        }
        return { left, top };
      }
      function ensureTooltipElement(player, doc = typeof document !== "undefined" ? document : null, tooltipId = "yt-translate-tooltip") {
        if (!player || !doc) return null;
        let tooltip = doc.getElementById(tooltipId);
        if (!tooltip) {
          tooltip = doc.createElement("div");
          tooltip.id = tooltipId;
          tooltip.style.display = "none";
          player.appendChild(tooltip);
        } else if (tooltip.parentElement !== player) {
          player.appendChild(tooltip);
        }
        return tooltip;
      }
      function ensureToastElement(player, doc = typeof document !== "undefined" ? document : null, toastId = "yt-dual-warning-toast") {
        if (!player || !doc) return null;
        let toast = doc.getElementById(toastId);
        if (!toast) {
          toast = doc.createElement("div");
          toast.id = toastId;
          player.appendChild(toast);
        } else if (toast.parentElement !== player) {
          player.appendChild(toast);
        }
        return toast;
      }
      function playVideoSnippet(video, start, end, state = {}) {
        if (!video) return null;
        if (state.timer) {
          clearInterval(state.timer);
          state.timer = null;
        }
        video.currentTime = Math.max(0, start - 0.05);
        video.play().catch(() => {
        });
        state.timer = setInterval(() => {
          if (video.currentTime >= end + 0.1 || video.paused) {
            clearInterval(state.timer);
            state.timer = null;
            video.pause();
          }
        }, 30);
        return state.timer;
      }
      function speakSelectedWord(text, lang = "en-US", synth = typeof window !== "undefined" ? window.speechSynthesis : null) {
        if (!synth) return;
        try {
          synth.cancel();
          if (typeof SpeechSynthesisUtterance !== "undefined") {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = lang || "en-US";
            utterance.rate = 0.95;
            synth.speak(utterance);
          }
        } catch (e) {
        }
      }
      var HoverPauseManager = class {
        constructor(options = {}) {
          this.getVideo = options.getVideo || (() => null);
          this.isHoverPauseEnabled = options.isHoverPauseEnabled || (() => false);
          this.elementsGetter = options.getElements || (() => []);
          this.wasPlayingBeforeHover = false;
          this.isHovering = false;
          this.hoverResumeTimer = null;
          this.onMouseEnter = this.handleMouseEnter.bind(this);
          this.onMouseLeave = this.handleMouseLeave.bind(this);
        }
        handleMouseEnter() {
          if (!this.isHoverPauseEnabled()) return;
          const video = this.getVideo();
          if (!video) return;
          if (this.hoverResumeTimer) {
            clearTimeout(this.hoverResumeTimer);
            this.hoverResumeTimer = null;
          }
          if (!this.isHovering) {
            this.isHovering = true;
            this.wasPlayingBeforeHover = !video.paused && !video.ended;
            if (this.wasPlayingBeforeHover) {
              video.pause();
            }
          }
        }
        handleMouseLeave(e) {
          if (!this.isHoverPauseEnabled()) return;
          const elements = this.elementsGetter().filter(Boolean);
          const nextTarget = e?.relatedTarget;
          if (nextTarget && elements.some((el) => el.contains(nextTarget))) {
            return;
          }
          if (this.hoverResumeTimer) {
            clearTimeout(this.hoverResumeTimer);
          }
          this.hoverResumeTimer = setTimeout(() => {
            if (typeof window !== "undefined" && window.getSelection && window.getSelection().toString().trim().length > 0) {
              return;
            }
            this.isHovering = false;
            const video = this.getVideo();
            if (video && this.wasPlayingBeforeHover) {
              video.play().catch(() => {
              });
              this.wasPlayingBeforeHover = false;
            }
          }, 150);
        }
        bind(elements = []) {
          const validElements = (elements.length > 0 ? elements : this.elementsGetter()).filter(Boolean);
          validElements.forEach((el) => {
            el.removeEventListener("mouseenter", this.onMouseEnter);
            el.removeEventListener("mouseleave", this.onMouseLeave);
            el.addEventListener("mouseenter", this.onMouseEnter);
            el.addEventListener("mouseleave", this.onMouseLeave);
          });
        }
        unbind(elements = []) {
          const validElements = (elements.length > 0 ? elements : this.elementsGetter()).filter(Boolean);
          validElements.forEach((el) => {
            el.removeEventListener("mouseenter", this.onMouseEnter);
            el.removeEventListener("mouseleave", this.onMouseLeave);
          });
        }
      };
      var TooltipController = class {
        constructor(options = {}) {
          this.tooltipId = options.tooltipId || "yt-translate-tooltip";
          this.toastId = options.toastId || "yt-dual-warning-toast";
          this.getPlayer = options.getPlayer || (() => null);
          this.getVideo = options.getVideo || (() => null);
          this.onTranslate = options.onTranslate || null;
          this.getLanguage = options.getLanguage || (() => "en-US");
          this.lastToastTime = 0;
          this.toastTimer = null;
          this.snippetState = { timer: null };
          this.hoverManager = new HoverPauseManager({
            getVideo: this.getVideo,
            isHoverPauseEnabled: options.isHoverPauseEnabled || (() => false),
            getElements: () => {
              const player = this.getPlayer();
              if (!player) return [];
              const subtitleEl = player.querySelector("#yt-dual-subtitle-container");
              const tooltipEl = player.querySelector(`#${this.tooltipId}`);
              return [subtitleEl, tooltipEl].filter(Boolean);
            }
          });
        }
        ensureElements(player) {
          const targetPlayer = player || this.getPlayer();
          if (!targetPlayer) return null;
          const doc = targetPlayer.ownerDocument || (typeof document !== "undefined" ? document : null);
          const tooltip = ensureTooltipElement(targetPlayer, doc, this.tooltipId);
          return tooltip;
        }
        showWarningToast(message, options = {}) {
          const player = options.player || this.getPlayer();
          if (!player) return;
          const debounceMs = options.debounceMs || 8e3;
          const now = Date.now();
          if (now - this.lastToastTime < debounceMs) return;
          this.lastToastTime = now;
          const doc = player.ownerDocument || (typeof document !== "undefined" ? document : null);
          const toast = ensureToastElement(player, doc, this.toastId);
          if (!toast) return;
          toast.textContent = message;
          toast.classList.add("show");
          if (this.toastTimer) clearTimeout(this.toastTimer);
          this.toastTimer = setTimeout(() => {
            toast.classList.remove("show");
          }, options.durationMs || 5e3);
        }
        showTooltip({ selectedText, rect, playerRect, snippetRange, i18n = {} }) {
          const player = this.getPlayer();
          if (!player) return null;
          const tooltip = ensureTooltipElement(player, player.ownerDocument, this.tooltipId);
          if (!tooltip) return null;
          const doc = tooltip.ownerDocument || document;
          tooltip.textContent = "";
          const closeBtn = doc.createElement("button");
          closeBtn.className = "tooltip-close-btn";
          closeBtn.id = "tooltipCloseBtn";
          closeBtn.textContent = "\u2715";
          tooltip.appendChild(closeBtn);
          const header = doc.createElement("div");
          header.className = "tooltip-header";
          header.textContent = selectedText;
          tooltip.appendChild(header);
          tooltip.appendChild(doc.createElement("hr"));
          const body = doc.createElement("div");
          body.className = "tooltip-body";
          body.id = "tooltipTransBody";
          body.textContent = i18n.translating || "\u7FFB\u8B6F\u4E2D...";
          tooltip.appendChild(body);
          const actions = doc.createElement("div");
          actions.className = "tooltip-actions";
          const btnPlay = doc.createElement("button");
          btnPlay.className = "tooltip-btn";
          btnPlay.id = "btnPlaySnippet";
          btnPlay.textContent = i18n.playSnippet || "\u{1F3AC} \u807D\u539F\u8072";
          actions.appendChild(btnPlay);
          const btnSpeak = doc.createElement("button");
          btnSpeak.className = "tooltip-btn";
          btnSpeak.id = "btnSpeakWord";
          btnSpeak.textContent = i18n.speak || "\u{1F5E3}\uFE0F \u6717\u8B80";
          actions.appendChild(btnSpeak);
          tooltip.appendChild(actions);
          tooltip.style.display = "block";
          const tooltipWidth = tooltip.offsetWidth || 230;
          const tooltipHeight = tooltip.offsetHeight || 100;
          const pos = calculateTooltipPosition(rect, playerRect, tooltipWidth, tooltipHeight);
          tooltip.style.left = `${pos.left}px`;
          tooltip.style.top = `${pos.top}px`;
          closeBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            this.hideTooltip();
          });
          btnPlay.addEventListener("click", (ev) => {
            ev.stopPropagation();
            if (snippetRange) {
              this.playSnippet(snippetRange.start, snippetRange.end);
            }
          });
          btnSpeak.addEventListener("click", (ev) => {
            ev.stopPropagation();
            this.speakWord(selectedText);
          });
          if (typeof this.onTranslate === "function") {
            this.onTranslate(selectedText, (translatedText) => {
              const transBody = tooltip.querySelector("#tooltipTransBody");
              if (transBody) {
                if (translatedText) {
                  transBody.textContent = translatedText;
                } else {
                  transBody.textContent = "\u26A0\uFE0F \u7FFB\u8B6F\u66AB\u6642\u53D7\u9650 (\u8ACB\u7A0D\u5F8C\u91CD\u8A66)";
                  this.showWarningToast("\u26A0\uFE0F \u7FFB\u8B6F\u670D\u52D9\u66AB\u6642\u53D7\u9650\uFF0C\u8ACB\u7A0D\u5F8C\u91CD\u8A66");
                }
              }
            });
          }
          return tooltip;
        }
        clearSnippetTimer() {
          if (this.snippetState && this.snippetState.timer) {
            clearInterval(this.snippetState.timer);
            this.snippetState.timer = null;
          }
        }
        hideTooltip() {
          const player = this.getPlayer();
          if (!player) return;
          const tooltip = player.querySelector(`#${this.tooltipId}`);
          if (tooltip) {
            tooltip.style.display = "none";
          }
          this.clearSnippetTimer();
        }
        playSnippet(start, end) {
          const video = this.getVideo();
          return playVideoSnippet(video, start, end, this.snippetState);
        }
        speakWord(text) {
          const lang = this.getLanguage ? this.getLanguage() : "en-US";
          speakSelectedWord(text, lang);
        }
        bindHover(elements = []) {
          this.hoverManager.bind(elements);
        }
        unbindHover(elements = []) {
          this.hoverManager.unbind(elements);
        }
      };
      if (typeof module !== "undefined" && module.exports) {
        module.exports = {
          calculateTooltipPosition,
          ensureTooltipElement,
          ensureToastElement,
          playVideoSnippet,
          speakSelectedWord,
          HoverPauseManager,
          TooltipController
        };
      }
    }
  });

  // src/content-entry.js
  var require_content_entry = __commonJS({
    "src/content-entry.js"(exports, module) {
      var {
        WindowMessageType,
        RuntimeAction,
        isValidWindowMessage
      } = require_protocol();
      var { SessionState } = require_session_state();
      var {
        cleanSubtitleNoise,
        isConjunction,
        shouldMergeShortSentence,
        SENTENCE_END_REGEX,
        INTRA_SPLIT_REGEX,
        FALLBACK_LONG_PAUSE_SECONDS,
        MAX_SENTENCE_CHARS,
        MAX_SENTENCE_DURATION
      } = require_sentence_policy();
      var { StreamingSentenceExtractor } = require_streaming_sentence_extractor();
      var {
        parseUniversalCaptionText
      } = require_caption_parser();
      var { TranslationScheduler } = require_translation_scheduler();
      var {
        SubtitleRenderer,
        DEFAULT_SIZE_MAP
      } = require_subtitle_renderer();
      var {
        TooltipController
      } = require_tooltip_controller();
      var CONFIG = {
        PRELOAD_SECONDS: 45,
        // 滑動窗口預載秒數
        WINDOW_CHECK_INTERVAL: 1.5,
        // 窗口檢查節流間隔 (秒)
        BATCH_TRANSLATE_LIMIT: 8,
        // 批次翻譯單次最大句數
        SENTENCE_END_REGEX,
        FALLBACK_LONG_PAUSE_SECONDS,
        MAX_SENTENCE_CHARS,
        MAX_SENTENCE_DURATION,
        BACKGROUND_FETCH_TIMEOUT: 6e3,
        INNERTUBE_FETCH_TIMEOUT: 4e3,
        MAIN_WORLD_FETCH_TIMEOUT: 2e3,
        TRANSCRIPT_FETCH_TIMEOUT: 1200,
        RATE_LIMIT_COOLDOWN_MS: 6e4,
        MODE2_DEBOUNCE_MS: 350,
        UI_SIZE_MAP: DEFAULT_SIZE_MAP
      };
      var session = new SessionState();
      var streamingExtractor = new StreamingSentenceExtractor({
        maxSentenceChars: CONFIG.MAX_SENTENCE_CHARS
      });
      function safeSendMessage(message, callback) {
        try {
          if (typeof chrome !== "undefined" && chrome?.runtime?.id) {
            chrome.runtime.sendMessage(message, (res) => {
              if (chrome?.runtime?.lastError) {
                if (callback) callback(null);
                return;
              }
              if (callback) callback(res);
            });
          } else {
            if (callback) callback(null);
          }
        } catch (e) {
          if (callback) callback(null);
        }
      }
      var scheduler = new TranslationScheduler({
        sendRuntimeMessage: safeSendMessage
      });
      var renderer = new SubtitleRenderer({
        sizeMap: CONFIG.UI_SIZE_MAP,
        onTrackSuccess: () => {
          trackEvent("subtitle_render_success", {
            target_lang: session.userTargetLang,
            mode: session.sentenceList.length > 0 ? "mode1_static" : "mode2_rolling"
          });
        }
      });
      var tooltipCtrl = new TooltipController({
        getPlayer: getActivePlayer,
        getVideo: getActiveVideo,
        isHoverPauseEnabled: () => session.isHoverPauseEnabled,
        getLanguage: () => session.currentTrack?.languageCode || "en-US",
        onTranslate: (selectedText, callback) => {
          scheduler.requestTranslation(selectedText, "auto", session.userTargetLang, (res) => {
            callback(res?.translatedText || null);
          });
        }
      });
      var nativeCaptionObserver = null;
      var animationFrameId = null;
      var liveTransDebounceTimer = null;
      console.log("[YT-Dual-Sub Content] \u96D9\u8A9E\u5B57\u5E55\u6A21\u7D44\u5316\u6838\u5FC3\u8173\u672C\u5DF2\u555F\u52D5 (v1.5.0 Modular Architecture)");
      function isShortsPage() {
        if (typeof window === "undefined" || !window?.location?.href) return false;
        return /\/shorts\//.test(window.location.href);
      }
      function trackEvent(eventName, params = {}) {
        safeSendMessage({
          action: RuntimeAction.TELEMETRY_EVENT,
          eventName,
          params
        });
      }
      function getActivePlayer() {
        if (typeof document === "undefined") return null;
        return document.querySelector("ytd-reel-video-renderer[is-active] .html5-video-player") || document.querySelector("#shorts-player") || document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
      }
      function getActiveVideo() {
        if (typeof document === "undefined") return null;
        const player = getActivePlayer();
        return player && typeof player.querySelector === "function" && player.querySelector("video") || typeof document.querySelector === "function" && (document.querySelector("ytd-reel-video-renderer[is-active] video") || document.querySelector("#shorts-player video") || document.querySelector("video"));
      }
      function getCurrentVideoId() {
        if (typeof window === "undefined" || !window?.location?.href) return "";
        const url = window.location.href;
        const match = url.match(/[?&]v=([^&#]+)/) || url.match(/\/shorts\/([^/?&#]+)/);
        return match ? match[1] : "";
      }
      function getSystemDefaultTargetLang() {
        const uiLang = (typeof chrome !== "undefined" && chrome?.i18n?.getUILanguage?.() || typeof navigator !== "undefined" && navigator.language || "en").toLowerCase();
        if (uiLang.startsWith("zh-tw") || uiLang.startsWith("zh-hk")) return "zh-TW";
        if (uiLang.startsWith("zh")) return "zh-CN";
        if (uiLang.startsWith("ja")) return "ja";
        if (uiLang.startsWith("ko")) return "ko";
        if (uiLang.startsWith("es")) return "es";
        if (uiLang.startsWith("fr")) return "fr";
        if (uiLang.startsWith("de")) return "de";
        if (uiLang.startsWith("ru")) return "ru";
        return "zh-TW";
      }
      try {
        if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
          chrome.storage.sync.get(["targetLang", "extensionEnabled", "uiSize", "hoverPause", "subtitleOffset"], (result) => {
            if (result.targetLang) session.userTargetLang = result.targetLang;
            else session.userTargetLang = getSystemDefaultTargetLang();
            if (result.extensionEnabled !== void 0) session.isExtensionEnabled = !!result.extensionEnabled;
            if (result.uiSize) session.userUiSize = result.uiSize;
            if (result.hoverPause !== void 0) session.isHoverPauseEnabled = !!result.hoverPause;
            if (result.subtitleOffset !== void 0) session.subtitleOffset = Number(result.subtitleOffset) || 0;
            renderer.applySize(session.userUiSize);
            if (!session.isExtensionEnabled) {
              resetSubtitles();
            }
          });
        }
      } catch (e) {
      }
      function handleStorageChange(changes, namespace) {
        if (namespace !== "sync") return;
        if (changes.extensionEnabled !== void 0) {
          session.isExtensionEnabled = !!changes.extensionEnabled.newValue;
          if (!session.isExtensionEnabled) {
            resetSubtitles();
          } else {
            renderer.resetSignature();
            requestCurrentTrackFromMainWorld();
          }
        }
        if (changes.targetLang) {
          session.userTargetLang = changes.targetLang.newValue;
          scheduler.clearCache();
          scheduler.cancelActiveLiveRequests();
          renderer.resetSignature();
          if (session.sentenceList && session.sentenceList.length > 0) {
            for (let i = 0; i < session.sentenceList.length; i++) {
              session.sentenceList[i].status = "idle";
              session.sentenceList[i].transText = "";
            }
            session.currSlot.trans = "";
            session.prevSlot.trans = "";
            const video = getActiveVideo();
            if (video) {
              prioritizeCurrentSentence(video.currentTime);
              checkAndTriggerSlidingWindow(video.currentTime);
              renderCurrentSubtitle(video.currentTime);
            }
          } else {
            session.currSlot.trans = "";
            session.prevSlot.trans = "";
            const container = document.getElementById(renderer.containerId);
            const player = getActivePlayer();
            if (container && player) {
              renderer.render(container, session.prevSlot, session.currSlot, {
                isExtensionEnabled: session.isExtensionEnabled,
                isCaptionsEnabled: session.isCaptionsEnabled,
                player
              });
            }
            if (session.currSlot.orig) {
              debouncedTranslateLiveProgress(session.currSlot.orig);
            }
            if (session.prevSlot.orig) {
              const prevOrig = session.prevSlot.orig;
              const targetLang = session.userTargetLang;
              const srcLang = session.currentTrack?.languageCode || "auto";
              scheduler.requestTranslation(prevOrig, srcLang, targetLang, (res) => {
                if (session.prevSlot.orig !== prevOrig || session.userTargetLang !== targetLang) {
                  return;
                }
                const transText = res?.translatedText?.trim() || "";
                if (transText) {
                  session.prevSlot.trans = transText;
                  const c = document.getElementById(renderer.containerId);
                  const p = getActivePlayer();
                  if (c && p) {
                    renderer.render(c, session.prevSlot, session.currSlot, {
                      isExtensionEnabled: session.isExtensionEnabled,
                      isCaptionsEnabled: session.isCaptionsEnabled,
                      player: p
                    });
                  }
                }
              });
            }
          }
        }
        if (changes.uiSize) {
          session.userUiSize = changes.uiSize.newValue;
          renderer.applySize(session.userUiSize);
        }
        if (changes.hoverPause !== void 0) {
          session.isHoverPauseEnabled = !!changes.hoverPause.newValue;
        }
        if (changes.subtitleOffset !== void 0) {
          session.subtitleOffset = Number(changes.subtitleOffset.newValue) || 0;
          renderer.resetSignature();
          const video = getActiveVideo();
          if (video) renderCurrentSubtitle(video.currentTime);
        }
      }
      try {
        if (typeof chrome !== "undefined" && chrome?.storage?.onChanged) {
          chrome.storage.onChanged.addListener(handleStorageChange);
        }
      } catch (e) {
      }
      function ensureUIElements() {
        const player = getActivePlayer();
        if (!player) return null;
        const subtitleContainer = renderer.ensureContainer(player);
        if (subtitleContainer) {
          bindSubtitleSelectionEvents(subtitleContainer);
        }
        const tooltip = tooltipCtrl.ensureElements(player);
        renderer.applySize(session.userUiSize);
        if (subtitleContainer && tooltip) {
          tooltipCtrl.bindHover([subtitleContainer, tooltip]);
        }
        bindVideoEvents();
      }
      function bindVideoEvents() {
        const video = getActiveVideo();
        if (!video) return;
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.addEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("play", startSyncLoop);
        video.addEventListener("play", startSyncLoop);
        video.removeEventListener("pause", stopSyncLoop);
        video.addEventListener("pause", stopSyncLoop);
        video.removeEventListener("seeking", handleUserSeek);
        video.addEventListener("seeking", handleUserSeek);
        video.removeEventListener("seeked", onTimeUpdate);
        video.addEventListener("seeked", onTimeUpdate);
        if (!video.paused && !video.ended) {
          startSyncLoop();
        }
      }
      function handleUserSeek() {
        const video = getActiveVideo();
        session.resetSeek(video ? video.currentTime : 0);
        streamingExtractor.reset();
        if (video) {
          prioritizeCurrentSentence(video.currentTime);
          checkAndTriggerSlidingWindow(video.currentTime);
        }
        onTimeUpdate();
      }
      function cleanupRuntimeUI() {
        scheduler.cancelActiveLiveRequests();
        tooltipCtrl.unbindHover();
        streamingExtractor.reset();
        stopNativeCaptionObserver();
        stopSyncLoop();
        const player = getActivePlayer();
        const container = document.getElementById(renderer.containerId);
        renderer.hide(container, player);
        tooltipCtrl.hideTooltip();
      }
      function resetSubtitles() {
        session.resetSubtitles();
        cleanupRuntimeUI();
      }
      function startSyncLoop() {
        if (animationFrameId) return;
        const loop = () => {
          const video = getActiveVideo();
          if (video && !video.paused && !video.ended) {
            onTimeUpdate();
            animationFrameId = requestAnimationFrame(loop);
          } else {
            animationFrameId = null;
          }
        };
        animationFrameId = requestAnimationFrame(loop);
      }
      function stopSyncLoop() {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      }
      if (typeof window !== "undefined") {
        window.addEventListener("message", (event) => {
          if (event.source !== window || !isValidWindowMessage(event.data)) return;
          if (event.data.type === WindowMessageType.NAVIGATE_START) {
            const newVid = event.data.videoId || getCurrentVideoId();
            if (newVid && newVid !== session.lastObservedVideoId) {
              handleVideoChange(newVid);
            } else {
              resetSubtitles();
            }
            return;
          }
          if (event.data.type === WindowMessageType.CAPTION_TRACK_CHANGED) {
            const { track, enabled } = event.data;
            if (enabled && track) {
              session.isCaptionsEnabled = true;
              ensureUIElements();
              loadCaptionTrack(track);
            } else {
              session.isCaptionsEnabled = false;
              const container = document.getElementById(renderer.containerId);
              const player = getActivePlayer();
              renderer.hide(container, player);
              tooltipCtrl.hideTooltip();
            }
          }
        });
      }
      function requestCurrentTrackFromMainWorld() {
        if (typeof window !== "undefined") {
          window.postMessage({ type: WindowMessageType.REQUEST_CURRENT_TRACK }, "*");
        }
      }
      function requestCurrentTrackWithRetry() {
        requestCurrentTrackFromMainWorld();
        setTimeout(requestCurrentTrackFromMainWorld, 100);
        setTimeout(requestCurrentTrackFromMainWorld, 350);
        setTimeout(requestCurrentTrackFromMainWorld, 800);
      }
      if (typeof window !== "undefined") {
        ensureUIElements();
        requestCurrentTrackWithRetry();
        if (typeof document !== "undefined") {
          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => {
              ensureUIElements();
              requestCurrentTrackWithRetry();
            }, { once: true });
          }
          window.addEventListener("load", () => {
            ensureUIElements();
            requestCurrentTrackWithRetry();
          }, { once: true });
        }
      }
      function buildTrackKey(track, videoId = "") {
        if (!track) return "";
        const vid = track.videoId || videoId || "";
        const vssId = track.vssId || "";
        const lang = track.languageCode || "";
        const tlang = track.targetTlang || "";
        if (vssId) {
          return `${vid}_${vssId}_${lang}_${tlang}`;
        }
        const baseUrl = track.baseUrl || "";
        return `${vid}_${lang}_${tlang}_${baseUrl}`;
      }
      async function loadCaptionTrack(track) {
        if (!session.isExtensionEnabled || !session.isCaptionsEnabled) return;
        if (!track || !track.languageCode) return;
        const currentVid = getCurrentVideoId();
        if (track.videoId && currentVid && track.videoId !== currentVid) {
          console.warn("[YT-Dual-Sub] \u4E1F\u68C4\u904E\u671F\u820A\u5F71\u7247\u8ECC\u9053\u5EE3\u64AD:", track.videoId, "!= \u7576\u524D\u5F71\u7247:", currentVid);
          return;
        }
        ensureUIElements();
        const vid = track.videoId || currentVid;
        if (vid && session.lastObservedVideoId && vid !== session.lastObservedVideoId) {
          session.resetVideoNavigation(vid);
        }
        const currentTrackKey = buildTrackKey(track, vid || currentVid);
        if (session.fetch.inFlightKey === currentTrackKey) return;
        if (session.currentTrack && buildTrackKey(session.currentTrack, vid || currentVid) === currentTrackKey && session.sentenceList.length > 0) {
          return;
        }
        session.currentTrack = track;
        session.fetch.inFlightKey = currentTrackKey;
        session.sentenceList = [];
        renderer.resetSignature();
        const player = getActivePlayer();
        const container = document.getElementById(renderer.containerId);
        renderer.hide(container, player);
        const sessionId = session.nextFetchSessionId();
        console.log("[YT-Dual-Sub] \u6536\u5230\u8ECC\u9053\u8B8A\u66F4:", track.languageCode, "vid:", vid);
        console.log("[YT-Dual-Sub] Caption session started:", vid, "sessionId:", sessionId);
        observeNativePlayerCaptions();
        try {
          const mainWorldText = await fetchCaptionViaMainWorldInnerTube(vid, track.languageCode);
          if (mainWorldText && mainWorldText.trim()) {
            if (!session.isSessionActive(sessionId)) return;
            const data = parseUniversalCaptionText(mainWorldText);
            if (data && data.events && data.events.length > 0) {
              console.log("[YT-Dual-Sub] \u2705 \u7DB2\u9801\u540C\u6E90 InnerTube \u9AD8\u901F\u5B57\u5E55\u4E0B\u8F09\u6210\u529F\uFF01events \u7B46\u6578:", data.events.length, "\u555F\u52D5 Mode 1");
              session.fetch.inFlightKey = "";
              stopNativeCaptionObserver();
              parseCues(data, track.languageCode);
              return;
            }
          }
        } catch (err) {
          console.warn("[YT-Dual-Sub] \u7DB2\u9801\u540C\u6E90 InnerTube \u4E0B\u8F09\u53D7\u963B\uFF0C\u5617\u8A66\u6B21\u7D1A\u901A\u9053:", err);
        }
        try {
          const rawText = await fetchCaptionTextWithFallback(track);
          if (rawText && rawText.trim()) {
            if (!session.isSessionActive(sessionId)) return;
            const data = parseUniversalCaptionText(rawText);
            if (data && data.events && data.events.length > 0) {
              console.log("[YT-Dual-Sub] \u2705 \u975C\u614B\u5B57\u5E55\u9AD8\u901F\u4E0B\u8F09\u6210\u529F\uFF01events \u7B46\u6578:", data.events.length, "\u555F\u52D5 Mode 1");
              session.fetch.inFlightKey = "";
              stopNativeCaptionObserver();
              parseCues(data, track.languageCode);
              return;
            }
          }
        } catch (err) {
          console.warn("[YT-Dual-Sub] \u7B2C\u4E8C\u4E3B\u529B timedtext \u4E0B\u8F09\u53D7\u963B\uFF0C\u5617\u8A66\u6B21\u7D1A\u901A\u9053:", err);
        }
        try {
          const transcriptData = await fetchTranscriptViaMainWorld(vid);
          if (transcriptData && transcriptData.events && transcriptData.events.length > 0) {
            if (!session.isSessionActive(sessionId)) return;
            console.log("[YT-Dual-Sub] \u2705 \u6B21\u7D1A\u5099\u63F4 get_transcript \u6210\u529F\u53D6\u5F97\u5168\u7247\u9010\u5B57\u7A3F\uFF01events \u7B46\u6578:", transcriptData.events.length, "\u5347\u7D1A Mode 1");
            session.fetch.inFlightKey = "";
            stopNativeCaptionObserver();
            parseCues(transcriptData, track.languageCode);
            return;
          }
        } catch (err) {
          console.warn("[YT-Dual-Sub] \u6B21\u7D1A\u5099\u63F4 get_transcript \u5931\u6557:", err);
        }
        session.fetch.inFlightKey = "";
        console.log("[YT-Dual-Sub] \u975C\u614B\u5B57\u5E55\u4E0D\u53EF\u7528\uFF0C\u555F\u52D5 Mode 2 (Gemini / DOM \u4E32\u6D41\u76E3\u807D)");
        trackEvent("fallback_mode2_active", { language_code: track.languageCode || "unknown" });
        observeNativePlayerCaptions();
      }
      function fetchCaptionViaMainWorldInnerTube(videoId, languageCode) {
        return new Promise((resolve) => {
          if (typeof window === "undefined") return resolve(null);
          const requestId = "innertube_" + Math.random().toString(36).slice(2) + Date.now();
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              window.removeEventListener("message", onMsg);
              resolve(null);
            }
          }, CONFIG.INNERTUBE_FETCH_TIMEOUT);
          function onMsg(e) {
            if (e.source !== window || e.data?.type !== WindowMessageType.FETCH_INNERTUBE_CAPTION_RESPONSE) return;
            if (e.data.requestId !== requestId) return;
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              window.removeEventListener("message", onMsg);
              resolve(e.data.success ? e.data.text : null);
            }
          }
          window.addEventListener("message", onMsg);
          window.postMessage({
            type: WindowMessageType.FETCH_INNERTUBE_CAPTION_REQUEST,
            requestId,
            videoId,
            languageCode
          }, "*");
        });
      }
      function fetchCaptionViaMainWorld(url) {
        return new Promise((resolve) => {
          if (typeof window === "undefined") return resolve(null);
          const requestId = "main_world_" + Math.random().toString(36).slice(2) + Date.now();
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              window.removeEventListener("message", onMsg);
              resolve(null);
            }
          }, CONFIG.MAIN_WORLD_FETCH_TIMEOUT);
          function onMsg(e) {
            if (e.source !== window || e.data?.type !== WindowMessageType.FETCH_CAPTION_RESPONSE) return;
            if (e.data.requestId !== requestId) return;
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              window.removeEventListener("message", onMsg);
              resolve(e.data.success ? e.data.text : null);
            }
          }
          window.addEventListener("message", onMsg);
          window.postMessage({
            type: WindowMessageType.FETCH_CAPTION_REQUEST,
            requestId,
            url
          }, "*");
        });
      }
      function fetchTranscriptViaMainWorld(videoId) {
        return new Promise((resolve) => {
          if (typeof window === "undefined") return resolve(null);
          const requestId = "transcript_" + Math.random().toString(36).slice(2) + Date.now();
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              window.removeEventListener("message", onMsg);
              resolve(null);
            }
          }, CONFIG.TRANSCRIPT_FETCH_TIMEOUT);
          function onMsg(e) {
            if (e.source !== window || e.data?.type !== WindowMessageType.FETCH_TRANSCRIPT_RESPONSE) return;
            if (e.data.requestId !== requestId) return;
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              window.removeEventListener("message", onMsg);
              resolve(e.data.success ? e.data.data : null);
            }
          }
          window.addEventListener("message", onMsg);
          window.postMessage({
            type: WindowMessageType.FETCH_TRANSCRIPT_REQUEST,
            requestId,
            videoId
          }, "*");
        });
      }
      async function fetchCaptionTextWithFallback(track) {
        const baseUrl = track.baseUrl;
        if (!baseUrl) return null;
        const now = Date.now();
        if (now < session.fetch.timedtextCooldownUntil) {
          return null;
        }
        const formats = [
          { fmt: "json3", url: baseUrl.includes("fmt=") ? baseUrl.replace(/fmt=[^&]+/, "fmt=json3") : baseUrl + "&fmt=json3" },
          { fmt: "vtt", url: baseUrl.includes("fmt=") ? baseUrl.replace(/fmt=[^&]+/, "fmt=vtt") : baseUrl + "&fmt=vtt" },
          { fmt: "raw", url: baseUrl.replace(/&fmt=[^&]+/, "") }
        ];
        for (const f of formats) {
          try {
            const mainWorldText = await fetchCaptionViaMainWorld(f.url);
            if (mainWorldText && mainWorldText.trim()) return mainWorldText;
          } catch (e) {
          }
          try {
            const bgRes = await new Promise((res) => {
              const timeout = setTimeout(() => res(null), CONFIG.BACKGROUND_FETCH_TIMEOUT);
              safeSendMessage({ action: RuntimeAction.FETCH_CAPTION, url: f.url }, (r) => {
                clearTimeout(timeout);
                res(r);
              });
            });
            if (bgRes?.status === 429) {
              session.fetch.timedtextCooldownUntil = Date.now() + CONFIG.RATE_LIMIT_COOLDOWN_MS;
              break;
            }
            if (bgRes?.success && bgRes.text && bgRes.text.trim()) {
              return bgRes.text;
            }
          } catch (e) {
          }
        }
        return null;
      }
      function handleVideoChange(vid) {
        if (!vid || vid === session.lastObservedVideoId) return;
        console.log("[YT-Dual-Sub] \u6AA2\u6E2C\u5230\u5F71\u7247\u8DE8\u7247\u5207\u63DB:", session.lastObservedVideoId, "->", vid);
        cleanupRuntimeUI();
        session.resetVideoNavigation(vid);
        const detectEventName = isShortsPage() ? "youtube_shorts_detected" : "youtube_video_detected";
        trackEvent(detectEventName);
        ensureUIElements();
        requestCurrentTrackFromMainWorld();
      }
      if (typeof window !== "undefined") {
        setInterval(() => {
          const vid = getCurrentVideoId();
          if (vid && session.lastObservedVideoId && vid !== session.lastObservedVideoId) {
            handleVideoChange(vid);
          } else if (vid && !session.lastObservedVideoId) {
            session.lastObservedVideoId = vid;
            trackEvent(isShortsPage() ? "youtube_shorts_detected" : "youtube_video_detected");
          }
        }, 500);
        window.addEventListener("yt-navigate-start", () => {
          const vid = getCurrentVideoId();
          if (vid && session.lastObservedVideoId && vid !== session.lastObservedVideoId) {
            handleVideoChange(vid);
          }
        });
        window.addEventListener("yt-navigate-finish", () => {
          const vid = getCurrentVideoId();
          if (vid && session.lastObservedVideoId && vid !== session.lastObservedVideoId) {
            handleVideoChange(vid);
          }
        });
      }
      function parseCues(captionJson, sourceLang) {
        if (!captionJson || !captionJson.events) return;
        const rawSegments = [];
        for (const e of captionJson.events) {
          if (!e.segs || e.segs.length === 0) continue;
          let text = e.segs.map((s) => s.utf8 || "").join("").replace(/\n/g, " ");
          text = cleanSubtitleNoise(text);
          if (!text) continue;
          const start = (e.tStartMs || 0) / 1e3;
          const duration = e.dDurationMs !== void 0 && e.dDurationMs !== null ? e.dDurationMs / 1e3 : 2;
          const end = start + Math.max(duration, 0.4);
          rawSegments.push({ start, end, text });
        }
        if (rawSegments.length === 0) {
          session.sentenceList = [];
          return;
        }
        rawSegments.sort((a, b) => a.start - b.start);
        for (let i = 0; i < rawSegments.length - 1; i++) {
          const nextStart = rawSegments[i + 1].start;
          if (rawSegments[i].end > nextStart) {
            rawSegments[i].end = Math.max(rawSegments[i].start + 0.3, nextStart);
          }
        }
        const normalizedSegments = [];
        for (const seg of rawSegments) {
          const parts = seg.text.split(INTRA_SPLIT_REGEX).filter((p) => p.trim().length > 0);
          if (parts.length > 1) {
            const totalChars = seg.text.length;
            const totalDur = seg.end - seg.start;
            let currStart = seg.start;
            for (let p = 0; p < parts.length; p++) {
              const partText = parts[p].trim();
              const partDur = Math.max(0.3, partText.length / totalChars * totalDur);
              const partEnd = p === parts.length - 1 ? seg.end : Math.min(seg.end, currStart + partDur);
              normalizedSegments.push({ start: currStart, end: partEnd, text: partText });
              currStart = partEnd;
            }
          } else {
            normalizedSegments.push({ start: seg.start, end: seg.end, text: seg.text.trim() });
          }
        }
        let totalSegments = normalizedSegments.length;
        let punctSegments = 0;
        for (const seg of normalizedSegments) {
          if (CONFIG.SENTENCE_END_REGEX.test(seg.text.trim())) punctSegments++;
        }
        const punctRatio = punctSegments / Math.max(1, totalSegments);
        const isSparsePunctuation = punctRatio < 0.2;
        const sentences = [];
        let currentGroup = [];
        for (let i = 0; i < normalizedSegments.length; i++) {
          const seg = normalizedSegments[i];
          currentGroup.push(seg);
          const currentText = currentGroup.map((s) => s.text).join(" ").trim();
          const currentDuration = seg.end - currentGroup[0].start;
          const nextSeg = normalizedSegments[i + 1];
          const pauseGap = nextSeg ? Math.max(0, nextSeg.start - seg.end) : 999;
          let shouldSplit = false;
          if (!isSparsePunctuation) {
            if (CONFIG.SENTENCE_END_REGEX.test(seg.text.trim())) {
              shouldSplit = true;
            } else if (pauseGap >= CONFIG.FALLBACK_LONG_PAUSE_SECONDS && currentText.length > 25) {
              shouldSplit = true;
            }
          } else {
            const words = currentText.split(/\s+/).filter(Boolean);
            const wordCount = words.length;
            const lastWord = words[words.length - 1]?.toLowerCase() || "";
            const endsWithPunct = CONFIG.SENTENCE_END_REGEX.test(currentText);
            const isWeakEnding = isConjunction(lastWord);
            if (endsWithPunct && wordCount >= 3) {
              shouldSplit = true;
            } else if (pauseGap >= 0.7 && wordCount >= 6 && !isWeakEnding) {
              shouldSplit = true;
            } else if (wordCount >= 12 && isConjunction(nextSeg?.text?.trim()?.split(/\s+/)?.[0]?.toLowerCase())) {
              shouldSplit = true;
            } else if (wordCount >= 22) {
              shouldSplit = true;
            }
          }
          if (currentDuration >= CONFIG.MAX_SENTENCE_DURATION || currentText.length >= CONFIG.MAX_SENTENCE_CHARS) {
            shouldSplit = true;
          }
          if (i === normalizedSegments.length - 1) {
            shouldSplit = true;
          }
          if (shouldSplit && currentGroup.length > 0) {
            sentences.push({
              start: currentGroup[0].start,
              end: currentGroup[currentGroup.length - 1].end,
              origText: currentGroup.map((s) => s.text).join(" ").trim(),
              transText: "",
              status: "idle",
              subCues: currentGroup.map((s) => ({ start: s.start, end: s.end, text: s.text })),
              sourceLang: sourceLang || "auto"
            });
            currentGroup = [];
          }
        }
        const mergedSentences = [];
        for (let i = 0; i < sentences.length; i++) {
          const curr = sentences[i];
          const next = sentences[i + 1];
          const currWords = curr.origText.split(/\s+/).filter(Boolean).length;
          if (shouldMergeShortSentence(currWords) && next) {
            const combinedDuration = next.end - curr.start;
            const combinedLength = curr.origText.length + 1 + next.origText.length;
            if (combinedDuration <= CONFIG.MAX_SENTENCE_DURATION && combinedLength <= CONFIG.MAX_SENTENCE_CHARS) {
              next.start = curr.start;
              next.origText = `${curr.origText} ${next.origText}`;
              next.subCues = [...curr.subCues, ...next.subCues];
              continue;
            }
          }
          mergedSentences.push(curr);
        }
        session.sentenceList = mergedSentences;
        if (typeof window !== "undefined") window.__ytDualSub_sentenceList = mergedSentences;
        console.log(`[YT-Dual-Sub] Mode 1 \u5408\u53E5\u5B8C\u6210\uFF0C\u7E3D\u5171\u53E5\u6578: ${session.sentenceList.length} \u9996\u53E5: ${session.sentenceList[0]?.origText?.slice(0, 35)}...`);
        ensureUIElements();
        renderer.resetSignature();
        const video = getActiveVideo();
        if (video && session.isExtensionEnabled && session.isCaptionsEnabled) {
          prioritizeCurrentSentence(video.currentTime);
          checkAndTriggerSlidingWindow(video.currentTime);
          renderCurrentSubtitle(video.currentTime);
          startSyncLoop();
        }
      }
      function getActiveCue(currentTime) {
        if (session.sentenceList.length === 0) return null;
        const adjustedTime = currentTime + session.subtitleOffset;
        let activeSentenceIndex = -1;
        for (let i = 0; i < session.sentenceList.length; i++) {
          const s = session.sentenceList[i];
          if (adjustedTime >= s.start && adjustedTime <= s.end) {
            activeSentenceIndex = i;
            break;
          }
        }
        if (activeSentenceIndex !== -1) {
          const activeSentence = session.sentenceList[activeSentenceIndex];
          let streamingText = "";
          let currentSubCue = null;
          if (activeSentence.subCues && activeSentence.subCues.length > 0) {
            for (const cue of activeSentence.subCues) {
              if (adjustedTime >= cue.start) {
                streamingText += (streamingText ? " " : "") + cue.text;
                currentSubCue = cue;
              }
            }
          }
          if (!streamingText) streamingText = activeSentence.origText;
          const prevSentence = activeSentenceIndex > 0 ? session.sentenceList[activeSentenceIndex - 1] : null;
          return {
            type: "active",
            streamingOrigText: streamingText,
            fullOrigText: activeSentence.origText,
            transText: activeSentence.transText,
            currentSentence: activeSentence,
            prevSentence,
            currentSubCue,
            sentenceIndex: activeSentenceIndex
          };
        } else {
          let lastFinishedSentence = null;
          let lastFinishedIndex = -1;
          for (let i = session.sentenceList.length - 1; i >= 0; i--) {
            const s = session.sentenceList[i];
            if (adjustedTime > s.end && adjustedTime - s.end <= 5) {
              lastFinishedSentence = s;
              lastFinishedIndex = i;
              break;
            }
          }
          if (!lastFinishedSentence) return null;
          const prevOfFinished = lastFinishedIndex > 0 ? session.sentenceList[lastFinishedIndex - 1] : null;
          return {
            type: "sticky_gap",
            streamingOrigText: lastFinishedSentence.origText,
            fullOrigText: lastFinishedSentence.origText,
            transText: lastFinishedSentence.transText,
            currentSentence: lastFinishedSentence,
            prevSentence: prevOfFinished,
            sentenceIndex: lastFinishedIndex
          };
        }
      }
      function onTimeUpdate() {
        const player = getActivePlayer();
        const container = document.getElementById(renderer.containerId);
        if (!session.isExtensionEnabled || !session.isCaptionsEnabled) {
          renderer.hide(container, player);
          return;
        }
        if (player && (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting"))) {
          renderer.hide(container, player);
          return;
        }
        if (session.sentenceList.length === 0) return;
        const video = getActiveVideo();
        if (!video) return;
        const currentTime = video.currentTime;
        renderCurrentSubtitle(currentTime);
        if (Math.abs(currentTime - session.lastWindowCheckTime) > CONFIG.WINDOW_CHECK_INTERVAL) {
          session.lastWindowCheckTime = currentTime;
          checkAndTriggerSlidingWindow(currentTime);
        }
      }
      function renderCurrentSubtitle(currentTime) {
        const container = document.getElementById(renderer.containerId);
        const player = getActivePlayer();
        if (!container) return;
        if (!session.isExtensionEnabled || !session.isCaptionsEnabled) {
          renderer.hide(container, player);
          return;
        }
        const active = getActiveCue(currentTime);
        if (!active) {
          renderer.hide(container, player);
          return;
        }
        const prevSlotData = active.prevSentence ? {
          orig: active.prevSentence.origText,
          trans: active.prevSentence.transText || ""
        } : { orig: "", trans: "" };
        const currSlotData = active.currentSentence ? {
          orig: active.currentSentence.origText,
          trans: active.transText || active.currentSentence.transText || ""
        } : { orig: "", trans: "" };
        renderer.render(container, prevSlotData, currSlotData, {
          isExtensionEnabled: session.isExtensionEnabled,
          isCaptionsEnabled: session.isCaptionsEnabled,
          player
        });
      }
      function prioritizeCurrentSentence(currentTime) {
        if (session.sentenceList.length === 0) return;
        const adjustedTime = currentTime + session.subtitleOffset;
        const target = session.sentenceList.find((s) => adjustedTime >= s.start && adjustedTime <= s.end) || session.sentenceList[0];
        if (target && target.status === "idle") {
          target.status = "loading";
          scheduler.requestTranslation(target.origText, target.sourceLang || "auto", session.userTargetLang, (res) => {
            if (res?.translatedText) {
              target.transText = res.translatedText;
              target.status = "done";
              renderer.resetSignature();
              const video = getActiveVideo();
              if (video) renderCurrentSubtitle(video.currentTime);
            } else {
              target.status = "idle";
            }
          });
        }
      }
      function checkAndTriggerSlidingWindow(currentTime) {
        const adjustedTime = currentTime + session.subtitleOffset;
        const windowEnd = adjustedTime + CONFIG.PRELOAD_SECONDS;
        const pendingSentences = [];
        for (let i = 0; i < session.sentenceList.length; i++) {
          const s = session.sentenceList[i];
          if (s.start > windowEnd) break;
          if (s.start >= adjustedTime - 3 && s.status === "idle") {
            pendingSentences.push(s);
            if (pendingSentences.length >= CONFIG.BATCH_TRANSLATE_LIMIT) break;
          }
        }
        if (pendingSentences.length === 0) return;
        pendingSentences.forEach((s) => s.status = "loading");
        const combinedText = pendingSentences.map((s) => s.origText).join("\n");
        const sourceLang = pendingSentences[0].sourceLang || "auto";
        scheduler.requestTranslation(combinedText, sourceLang, session.userTargetLang, (res) => {
          if (res?.translatedText) {
            session.consecutiveTranslateErrors = 0;
            const lines = res.translatedText.split("\n");
            if (lines.length === pendingSentences.length) {
              pendingSentences.forEach((s, idx) => {
                s.transText = lines[idx] || s.origText;
                s.status = "done";
              });
            } else {
              pendingSentences.forEach((s) => {
                scheduler.requestTranslation(s.origText, sourceLang, session.userTargetLang, (singleRes) => {
                  s.transText = singleRes?.translatedText || s.origText;
                  s.status = "done";
                });
              });
            }
            renderer.resetSignature();
            const video = getActiveVideo();
            if (video) renderCurrentSubtitle(video.currentTime);
          } else {
            session.consecutiveTranslateErrors++;
            if (session.consecutiveTranslateErrors >= 2) {
              tooltipCtrl.showWarningToast("\u26A0\uFE0F \u7FFB\u8B6F\u670D\u52D9\u66AB\u6642\u53D7\u9650 (429/\u7DB2\u8DEF\u7570\u5E38)\uFF0C\u5DF2\u81EA\u52D5\u4FDD\u7559\u539F\u6587\u5B57\u5E55\uFF0C\u7A0D\u5F8C\u5C07\u81EA\u52D5\u91CD\u8A66");
              if (!session.telemetry.hasTrackedTranslateError) {
                session.telemetry.hasTrackedTranslateError = true;
                trackEvent("fail_translate_error", { target_lang: session.userTargetLang });
              }
            }
            pendingSentences.forEach((s) => {
              s.status = "error";
              s.transText = "\u26A0\uFE0F \u7FFB\u8B6F\u66AB\u6642\u53D7\u9650 (\u7A0D\u5F8C\u91CD\u8A66)";
            });
            setTimeout(() => {
              pendingSentences.forEach((s) => {
                if (s.status === "error") s.status = "idle";
              });
            }, 4e3);
            renderer.resetSignature();
            const video = getActiveVideo();
            if (video) renderCurrentSubtitle(video.currentTime);
          }
        });
      }
      function bindSubtitleSelectionEvents(container) {
        if (!container) return;
        container.removeEventListener("mouseup", handleSubtitleMouseUp);
        container.addEventListener("mouseup", handleSubtitleMouseUp);
      }
      function handleSubtitleMouseUp(e) {
        if (!session.isExtensionEnabled) return;
        e.stopPropagation();
        const selection = window.getSelection();
        const selectedText = selection ? selection.toString().trim() : "";
        if (!selectedText) {
          tooltipCtrl.hideTooltip();
          return;
        }
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const player = getActivePlayer();
        const playerRect = player.getBoundingClientRect();
        const video = getActiveVideo();
        const currentTime = video ? video.currentTime : 0;
        const active = getActiveCue(currentTime);
        let snippetStart = active?.currentSubCue?.start ?? active?.currentSentence?.start;
        let snippetEnd = active?.currentSubCue?.end ?? active?.currentSentence?.end;
        if (snippetStart === void 0 || snippetEnd === void 0) {
          if (session.prevSlotTimeRange.end > session.prevSlotTimeRange.start) {
            snippetStart = session.prevSlotTimeRange.start;
            snippetEnd = session.prevSlotTimeRange.end;
          } else {
            snippetStart = Math.max(0, currentTime - 2.5);
            snippetEnd = currentTime + 0.5;
          }
        }
        const msgTranslating = typeof chrome !== "undefined" && chrome?.i18n?.getMessage?.("tooltipTranslating") || "\u7FFB\u8B6F\u4E2D...";
        const msgPlaySnippet = typeof chrome !== "undefined" && chrome?.i18n?.getMessage?.("tooltipPlaySnippet") || "\u{1F3AC} \u807D\u539F\u8072";
        const msgSpeak = typeof chrome !== "undefined" && chrome?.i18n?.getMessage?.("tooltipSpeak") || "\u{1F5E3}\uFE0F \u6717\u8B80";
        tooltipCtrl.showTooltip({
          selectedText,
          rect,
          playerRect,
          snippetRange: { start: snippetStart, end: snippetEnd },
          i18n: {
            translating: msgTranslating,
            playSnippet: msgPlaySnippet,
            speak: msgSpeak
          }
        });
      }
      function handleKeyDown(e) {
        if (!session.isExtensionEnabled) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (isUserTyping(e.target)) return;
        const key = (e.key || "").toLowerCase();
        const code = e.code || "";
        const isKeyA = key === "a" || code === "KeyA" || e.keyCode === 65;
        const isKeyD = key === "d" || code === "KeyD" || e.keyCode === 68;
        const isKeyR = key === "r" || code === "KeyR" || e.keyCode === 82;
        if (!isKeyA && !isKeyD && !isKeyR) return;
        const video = getActiveVideo();
        if (!video) return;
        if (isKeyR) {
          if (typeof e.preventDefault === "function") e.preventDefault();
          if (typeof e.stopPropagation === "function") e.stopPropagation();
          const active = getActiveCue(video.currentTime);
          if (active?.currentSentence) {
            tooltipCtrl.playSnippet(active.currentSentence.start, active.currentSentence.end);
          } else if (session.prevSlotTimeRange.end > session.prevSlotTimeRange.start) {
            tooltipCtrl.playSnippet(session.prevSlotTimeRange.start, session.prevSlotTimeRange.end);
          } else {
            tooltipCtrl.playSnippet(Math.max(0, video.currentTime - 3), video.currentTime);
          }
        } else if (isKeyA || isKeyD) {
          if (session.sentenceList.length === 0) {
            if (session.isCaptionsEnabled) {
              tooltipCtrl.showWarningToast("\u26A0\uFE0F \u76EE\u524D\u5B57\u5E55\u5C1A\u672A\u8F09\u5165\u6216\u70BA\u5373\u6642\u8A9E\u97F3\u8FA8\u8B58\u6A21\u5F0F");
            }
            return;
          }
          if (typeof e.preventDefault === "function") e.preventDefault();
          if (typeof e.stopPropagation === "function") e.stopPropagation();
          jumpToSentence(isKeyD ? 1 : -1);
        }
      }
      if (typeof window !== "undefined") {
        window.addEventListener("keydown", handleKeyDown, true);
      }
      function isUserTyping(el) {
        if (!el) return false;
        const tagName = el.tagName?.toLowerCase();
        if (tagName === "input" || tagName === "textarea") return true;
        if (el.isContentEditable) return true;
        if (el.getAttribute?.("role") === "textbox") return true;
        if (typeof el.closest === "function") {
          if (el.closest('input, textarea, [contenteditable="true"], [role="textbox"], #search-form, #search-input, ytd-searchbox, ytd-comments')) {
            return true;
          }
        }
        return false;
      }
      function jumpToSentence(direction) {
        const video = getActiveVideo();
        if (!video || session.sentenceList.length === 0) return;
        tooltipCtrl.clearSnippetTimer?.();
        const currentTime = video.currentTime + session.subtitleOffset;
        let currentIdx = -1;
        for (let i = 0; i < session.sentenceList.length; i++) {
          const s = session.sentenceList[i];
          if (currentTime >= s.start && currentTime <= s.end) {
            currentIdx = i;
            break;
          }
        }
        let targetIndex = -1;
        if (currentIdx !== -1) {
          targetIndex = currentIdx + direction;
        } else {
          let nextIdx = -1;
          for (let i = 0; i < session.sentenceList.length; i++) {
            if (session.sentenceList[i].start > currentTime) {
              nextIdx = i;
              break;
            }
          }
          if (nextIdx !== -1) {
            targetIndex = direction > 0 ? nextIdx : Math.max(0, nextIdx - 1);
          } else {
            targetIndex = session.sentenceList.length - 1;
          }
        }
        targetIndex = Math.max(0, Math.min(targetIndex, session.sentenceList.length - 1));
        const targetSentence = session.sentenceList[targetIndex];
        if (targetSentence) {
          video.currentTime = Math.max(0, targetSentence.start + 0.01);
          prioritizeCurrentSentence(video.currentTime);
          checkAndTriggerSlidingWindow(video.currentTime);
          renderCurrentSubtitle(video.currentTime);
        }
      }
      function handleDocumentMouseDown(e) {
        const tooltip = document.getElementById(tooltipCtrl.tooltipId);
        const container = document.getElementById(renderer.containerId);
        if (tooltip && !tooltip.contains(e.target) && !container?.contains(e.target)) {
          tooltipCtrl.hideTooltip();
        }
      }
      if (typeof document !== "undefined") {
        document.addEventListener("mousedown", handleDocumentMouseDown);
      }
      function observeNativePlayerCaptions() {
        if (typeof MutationObserver === "undefined") return;
        const player = getActivePlayer();
        if (!player || nativeCaptionObserver) return;
        ensureUIElements();
        const handleCaptionMutation = () => {
          if (!session.isExtensionEnabled || !session.isCaptionsEnabled) return;
          if (session.sentenceList.length > 0) return;
          const segmentNodes = player.querySelectorAll(".ytp-caption-segment");
          if (!segmentNodes || segmentNodes.length === 0) return;
          const textParts = [];
          segmentNodes.forEach((node) => {
            const t = (node.textContent || "").trim();
            if (t) textParts.push(t);
          });
          if (textParts.length === 0) return;
          const liveWindowText = cleanSubtitleNoise(textParts.join(" ").replace(/\s+/g, " ").trim());
          if (!liveWindowText || liveWindowText === session.lastRawObservedWindowText) return;
          session.lastRawObservedWindowText = liveWindowText;
          const result = streamingExtractor.ingest(liveWindowText);
          session.speechTokenQueue = streamingExtractor.speechTokenQueue;
          session.lastLockedCompletedSentence = streamingExtractor.lastLockedCompletedSentence;
          session.completedSentenceHistory = streamingExtractor.completedSentenceHistory;
          if (!result) return;
          let container = document.getElementById(renderer.containerId);
          if (!container) {
            ensureUIElements();
            container = document.getElementById(renderer.containerId);
          }
          if (result.completed) {
            const completedSentence = result.completed;
            const v = getActiveVideo();
            const sentenceEndTime = v ? v.currentTime : 0;
            const sentenceStartTime = session.currentSentenceStartTime > 0 ? session.currentSentenceStartTime : Math.max(0, sentenceEndTime - 3);
            session.prevSlotTimeRange = { start: sentenceStartTime, end: sentenceEndTime };
            session.currentSentenceStartTime = 0;
            session.prevSlot = {
              orig: completedSentence,
              trans: scheduler.cache.get(`${session.currentTrack?.languageCode || "auto"}->${session.userTargetLang}:${completedSentence}`) || ""
            };
            session.currSlot = {
              orig: result.inProgress || "",
              trans: ""
            };
            session.lastFinishedSentence = completedSentence;
            renderer.render(container, session.prevSlot, session.currSlot, {
              isExtensionEnabled: session.isExtensionEnabled,
              isCaptionsEnabled: session.isCaptionsEnabled,
              player
            });
            const srcLang = session.currentTrack?.languageCode || "auto";
            const targetLang = session.userTargetLang;
            scheduler.requestTranslation(completedSentence, srcLang, targetLang, (res) => {
              if (session.userTargetLang !== targetLang) return;
              const transText = res?.translatedText?.trim() || "";
              if (transText) {
                let needRender = false;
                if (session.prevSlot.orig === completedSentence) {
                  session.prevSlot.trans = transText;
                  needRender = true;
                }
                if (session.lastFinishedSentence === completedSentence) {
                  session.lastFinishedTrans = transText;
                }
                if (needRender) {
                  renderer.render(container, session.prevSlot, session.currSlot, {
                    isExtensionEnabled: session.isExtensionEnabled,
                    isCaptionsEnabled: session.isCaptionsEnabled,
                    player
                  });
                }
              }
            });
          } else if (result.inProgress) {
            if (session.currentSentenceStartTime === 0) {
              const v = getActiveVideo();
              session.currentSentenceStartTime = v ? v.currentTime : 0;
            }
            if (session.lastFinishedSentence) {
              session.prevSlot = {
                orig: session.lastFinishedSentence,
                trans: session.lastFinishedTrans || scheduler.cache.get(`${session.currentTrack?.languageCode || "auto"}->${session.userTargetLang}:${session.lastFinishedSentence}`) || ""
              };
              session.lastFinishedSentence = "";
              session.lastFinishedTrans = "";
            }
            const liveText = result.inProgress;
            const cacheKey = `${session.currentTrack?.languageCode || "auto"}->${session.userTargetLang}:${liveText}`;
            const cachedLiveTrans = scheduler.cache.get(cacheKey) || "";
            const isExtendingCurrent = session.currSlot.orig && liveText.startsWith(session.currSlot.orig.slice(0, Math.min(10, session.currSlot.orig.length)));
            const preservedTrans = cachedLiveTrans || (isExtendingCurrent ? session.currSlot.trans : "");
            session.currSlot = { orig: liveText, trans: preservedTrans };
            renderer.render(container, session.prevSlot, session.currSlot, {
              isExtensionEnabled: session.isExtensionEnabled,
              isCaptionsEnabled: session.isCaptionsEnabled,
              player
            });
            if (!cachedLiveTrans && liveText.split(/\s+/).length >= 3) {
              debouncedTranslateLiveProgress(liveText);
            }
          }
        };
        nativeCaptionObserver = new MutationObserver(handleCaptionMutation);
        nativeCaptionObserver.observe(player, {
          childList: true,
          subtree: true,
          characterData: true
        });
        handleCaptionMutation();
      }
      function debouncedTranslateLiveProgress(text) {
        clearTimeout(liveTransDebounceTimer);
        liveTransDebounceTimer = setTimeout(() => {
          const srcLang = session.currentTrack?.languageCode || "auto";
          scheduler.requestLiveTranslation(text, srcLang, session.userTargetLang, (res) => {
            const transText = res?.translatedText?.trim() || "";
            if (transText) {
              if (session.currSlot.orig && (session.currSlot.orig.trim() === text.trim() || session.currSlot.orig.startsWith(text.trim()))) {
                session.currSlot.trans = transText;
                const container = document.getElementById(renderer.containerId);
                const player = getActivePlayer();
                renderer.render(container, session.prevSlot, session.currSlot, {
                  isExtensionEnabled: session.isExtensionEnabled,
                  isCaptionsEnabled: session.isCaptionsEnabled,
                  player
                });
              }
            }
          });
        }, CONFIG.MODE2_DEBOUNCE_MS);
      }
      function stopNativeCaptionObserver() {
        clearTimeout(liveTransDebounceTimer);
        if (nativeCaptionObserver) {
          nativeCaptionObserver.disconnect();
          nativeCaptionObserver = null;
        }
        const player = getActivePlayer();
        const container = document.getElementById(renderer.containerId);
        renderer.hide(container, player);
        session.resetStreaming();
      }
      if (typeof module !== "undefined" && module.exports) {
        module.exports = {
          CONFIG,
          session,
          scheduler,
          renderer,
          streamingExtractor,
          ingestAndExtractSentence: (text) => streamingExtractor.ingest(text),
          parseCues,
          getActiveCue,
          prioritizeCurrentSentence,
          checkAndTriggerSlidingWindow,
          renderCurrentSubtitle,
          debouncedTranslateLiveProgress,
          jumpToSentence,
          isUserTyping,
          handleKeyDown,
          tooltipCtrl,
          handleSubtitleMouseUp,
          handleDocumentMouseDown,
          handleStorageChange,
          onTimeUpdate,
          loadCaptionTrack,
          buildTrackKey,
          isShortsPage,
          getCurrentVideoId,
          getActivePlayer,
          getActiveVideo
        };
      }
    }
  });
  require_content_entry();
})();
