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
    this.cache = options.cache || new Map();
    this.onCacheHit = options.onCacheHit || ((k) => this.cache.get(k) || null);
    this.onCacheSet = options.onCacheSet || ((k, t, res) => this.cache.set(k, res));
  }

  getCacheKey(sourceLang, targetLang, text) {
    return `${sourceLang || 'auto'}->${targetLang || 'zh-TW'}:${text}`;
  }

  clearCache() {
    this.cache.clear();
  }

  /**
   * 調度單句翻譯，具備在途請求聚合
   */
  requestTranslation(text, sourceLang, targetLang, callback) {
    if (!text || !text.trim()) {
      if (callback) callback({ translatedText: '' });
      return;
    }

    const key = this.getCacheKey(sourceLang, targetLang, text);
    const cached = this.onCacheHit(key, text);
    if (cached) {
      if (callback) callback(typeof cached === 'object' && cached !== null ? cached : { translatedText: cached });
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
      const resultObj = res?.translatedText !== undefined ? res : { translatedText };
      cbs.forEach(cb => {
        try {
          if (cb) cb(resultObj);
        } catch (e) {}
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
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TranslationScheduler };
}
