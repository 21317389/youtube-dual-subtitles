/**
 * background.js - 擴充功能背景服務 (Service Worker)
 * 職責：管理持久化 LRU 快取、多格式高速端點輪替、極速 2.5 秒超時熔斷保護
 */

const CONFIG = {
  MAX_CACHE_SIZE: 3000,
  SAVE_DEBOUNCE_MS: 1000,
  FETCH_TIMEOUT_MS: 2500 // 嚴格 2.5 秒超時保護，徹底根除 20 秒卡頓
};

// 1. 高可靠性 Google 翻譯專屬 API 端點清單 (去除會引發 Cookie 授權重定向與網路懸掛的無效端點)
const ENDPOINTS = [
  {
    name: 'googleapis-gtx-array',
    buildUrl: (sl, tl, q) => `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(q)}`,
    parse: (data) => {
      if (Array.isArray(data?.[0])) {
        return data[0].map(item => item?.[0] || '').join('');
      }
      return Array.isArray(data) ? data.join('') : String(data || '');
    }
  },
  {
    name: 'googleapis-gtx-json',
    buildUrl: (sl, tl, q) => `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&dj=1&q=${encodeURIComponent(q)}`,
    parse: (data) => {
      if (Array.isArray(data?.sentences)) {
        return data.sentences.map(s => s?.trans || '').join('');
      }
      return '';
    }
  },
  {
    name: 'googleapis-gtx-simple',
    buildUrl: (sl, tl, q) => `https://translate.googleapis.com/translate_a/t?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(q)}`,
    parse: (data) => {
      if (Array.isArray(data)) {
        return typeof data[0] === 'string' ? data.join('\n') : (data[0]?.[0] || '');
      }
      return String(data || '');
    }
  }
];

const translationCache = new Map();
let saveDebounceTimer = null;

// 2. 初始化持久化快取 (防 Service Worker 休眠)
chrome.storage.local.get('translationCache', (result) => {
  if (Array.isArray(result?.translationCache)) {
    result.translationCache.forEach(([key, val]) => {
      translationCache.set(key, val);
    });
  }
});

function persistCache() {
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    chrome.storage.local.set({
      translationCache: Array.from(translationCache.entries())
    });
  }, CONFIG.SAVE_DEBOUNCE_MS);
}

function setCache(key, value) {
  if (translationCache.size >= CONFIG.MAX_CACHE_SIZE) {
    const oldestKey = translationCache.keys().next().value;
    translationCache.delete(oldestKey);
  }
  translationCache.set(key, value);
  persistCache();
}

// 3. 具備超時熔斷之多端點高速請求引擎
async function requestTranslationWithFallback(text, sourceLang, targetLang) {
  let lastError = null;

  for (let i = 0; i < ENDPOINTS.length; i++) {
    const endpoint = ENDPOINTS[i];
    const url = endpoint.buildUrl(sourceLang, targetLang, text);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} (${response.statusText})`);
      }

      const data = await response.json();
      const translatedText = endpoint.parse(data);

      if (translatedText && translatedText.trim().length > 0) {
        return translatedText;
      }
      throw new Error('解析譯文結果為空');
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err.name === 'AbortError';
      console.warn(`[YT-Dual-Sub] 端點 [${endpoint.name}] ${isAbort ? '請求超時 (>2.5s)' : '失敗 (' + err.message + ')'}，切換備用端點...`);
      lastError = err;
    }
  }

  throw lastError || new Error('所有備用翻譯端點均無法連線');
}

// 4. 監聽 Content Script 請求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchCaption') {
    const { url } = request;
    if (!url) {
      sendResponse({ error: 'Missing url' });
      return false;
    }

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          sendResponse({ error: `HTTP ${res.status} (${res.statusText})` });
          return;
        }
        const text = await res.text();
        sendResponse({ text });
      })
      .catch((err) => {
        sendResponse({ error: err.message });
      });

    return true;
  }

  if (request.action !== 'translate') return;

  const { text, sourceLang = 'auto', targetLang = 'zh-TW' } = request;
  const cacheKey = `${sourceLang}->${targetLang}:${text}`;

  // 本地快取命中直接瞬時回傳 (0ms)
  if (translationCache.has(cacheKey)) {
    sendResponse({ translatedText: translationCache.get(cacheKey) });
    return true;
  }

  requestTranslationWithFallback(text, sourceLang, targetLang)
    .then(translatedText => {
      setCache(cacheKey, translatedText);
      sendResponse({ translatedText });
    })
    .catch(err => {
      console.error('[YT-Dual-Sub] 翻譯嘗試失敗:', err);
      sendResponse({ error: err.message });
    });

  return true;
});
