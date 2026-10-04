/**
 * translation-scheduler.js
 * 
 * 翻譯調度引擎 (Translation Scheduler)
 * 具備：
 *   1. In-flight 請求聚合防風暴 (Request Coalescing / Deduplication)
 *   2. 即時串流過時前綴請求即刻作廢 (Live Rolling Supersede Guard)
 *   3. 批次請求斷行安全與失敗降級處理
 */

class TranslationScheduler {
  constructor(options = {}) {
    this.inFlightRequests = new Map(); // key -> [callbacks]
    this.activeLiveRequestId = 0;
    this.sendRuntimeMessage = options.sendRuntimeMessage || ((msg, cb) => cb && cb({}));
    this.onCacheHit = options.onCacheHit || (() => null);
    this.onCacheSet = options.onCacheSet || (() => {});
  }

  getCacheKey(sourceLang, targetLang, text) {
    return `${sourceLang || 'auto'}->${targetLang || 'zh-TW'}:${text}`;
  }

  /**
   * 調度單句翻譯，具備在途請求聚合
   */
  requestTranslation(text, sourceLang, targetLang, callback) {
    if (!text || !text.trim()) {
      if (callback) callback('');
      return;
    }

    const key = this.getCacheKey(sourceLang, targetLang, text);
    const cached = this.onCacheHit(key, text);
    if (cached) {
      if (callback) callback(cached);
      return;
    }

    if (this.inFlightRequests.has(key)) {
      this.inFlightRequests.get(key).push(callback);
      return;
    }

    this.inFlightRequests.set(key, [callback]);

    this.sendRuntimeMessage({
      action: 'translate',
      text,
      sourceLang: sourceLang || 'auto',
      targetLang: targetLang || 'zh-TW'
    }, (res) => {
      const translatedText = res?.translatedText?.trim() || '';
      if (translatedText) {
        this.onCacheSet(key, text, translatedText);
      }
      const cbs = this.inFlightRequests.get(key) || [];
      this.inFlightRequests.delete(key);
      cbs.forEach(cb => {
        try {
          if (cb) cb(translatedText);
        } catch (e) {}
      });
    });
  }

  /**
   * 調度 Mode 2 即時串流滾動翻譯 (過時前綴請求自動作廢)
   */
  requestLiveTranslation(text, sourceLang, targetLang, callback) {
    const currentId = ++this.activeLiveRequestId;
    this.requestTranslation(text, sourceLang, targetLang, (translatedText) => {
      if (currentId !== this.activeLiveRequestId) return;
      if (callback) callback(translatedText);
    });
    return currentId;
  }

  cancelActiveLiveRequests() {
    this.activeLiveRequestId++;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TranslationScheduler };
}
