/**
 * background.js - 擴充功能背景服務 (Service Worker)
 * 職責：管理持久化 LRU 快取、多格式高速端點輪替、極速 2.5 秒超時熔斷保護
 */

const CONFIG = {
  MAX_CACHE_SIZE: 3000,
  SAVE_DEBOUNCE_MS: 1000,
  FETCH_TIMEOUT_MS: 2500 // 嚴格 2.5 秒超時保護，徹底根除 20 秒卡頓
};

// 1. 高可靠性 Google 翻譯專屬 API 端點清單 (多網域分散負載，徹底免疫單一網域 429 限流)
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
    name: 'clients5-dict-chrome-ex',
    buildUrl: (sl, tl, q) => `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(q)}`,
    parse: (data) => {
      if (Array.isArray(data?.[0])) {
        return data[0][0] || '';
      }
      if (Array.isArray(data)) {
        return typeof data[0] === 'string' ? data.join('\n') : (data[0]?.[0] || '');
      }
      return String(data || '');
    }
  },
  {
    name: 'translate-google-gtx',
    buildUrl: (sl, tl, q) => `https://translate.google.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(q)}`,
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
  }
];

const translationCache = new Map();
let saveDebounceTimer = null;

// 2. 初始化持久化快取 (防 Service Worker 休眠)
if (typeof chrome !== 'undefined' && chrome?.storage?.local?.get) {
  chrome.storage.local.get('translationCache', (result) => {
    if (Array.isArray(result?.translationCache)) {
      result.translationCache.forEach(([key, val]) => {
        translationCache.set(key, val);
      });
    }
  });
}

function persistCache() {
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local?.set) {
      chrome.storage.local.set({
        translationCache: Array.from(translationCache.entries())
      });
    }
  }, CONFIG.SAVE_DEBOUNCE_MS);
}

function setCache(key, value) {
  if (translationCache.has(key)) {
    translationCache.delete(key);
  } else if (translationCache.size >= CONFIG.MAX_CACHE_SIZE) {
    const oldestKey = translationCache.keys().next().value;
    if (oldestKey !== undefined) {
      translationCache.delete(oldestKey);
    }
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
function handleRuntimeMessage(request, sender, sendResponse) {
  if (request.action === 'fetchCaption') {
    const { url } = request;
    if (!url) {
      sendResponse({ error: 'Missing url' });
      return false;
    }

    (async () => {
      try {
        const res = await fetch(url);
        if (res.status === 429) {
          console.warn('[YT-Dual-Sub Background] 遇到 429 限流，即刻終止後續重試，保護 IP 安全');
          sendResponse({ text: '', error: 'RATE_LIMIT_429' });
          return;
        }
        if (res.ok) {
          const text = await res.text();
          const isHtmlBlock = text && (text.trim().startsWith('<html') || text.includes('<title>Sorry...'));
          if (isHtmlBlock) {
            console.warn('[YT-Dual-Sub Background] 收到 Sorry 風控頁面，即刻終止後續重試');
            sendResponse({ text: '', error: 'RATE_LIMIT_429' });
            return;
          }
          if (text && text.trim().length > 0) {
            sendResponse({ text });
            return;
          }
        }
      } catch (e) {
        console.warn('[YT-Dual-Sub Background] 字幕抓取受阻:', e.message);
      }

      sendResponse({ text: '' });
    })();

    return true;
  }

  if (request.action === 'telemetry_event') {
    sendGA4Event(request.eventName, request.params || {});
    sendResponse({ success: true });
    return true;
  }

  if (request.action !== 'translate') return;

  const { text, sourceLang = 'auto', targetLang = 'zh-TW' } = request;
  const cacheKey = `${sourceLang}->${targetLang}:${text}`;

  // 本地快取命中直接瞬時回傳 (0ms)，並依據 LRU 原則重排 Map insertion order 刷新存取順序
  if (translationCache.has(cacheKey)) {
    const cachedVal = translationCache.get(cacheKey);
    translationCache.delete(cacheKey);
    translationCache.set(cacheKey, cachedVal);
    sendResponse({ translatedText: cachedVal });
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
}

if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage?.addListener) {
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
}

// ==========================================
// 4. GA4 輕量開源遙測引擎与卸載原因問卷 (不含私密金鑰，100% 開源安全)
// ==========================================
const GA_MEASUREMENT_ID = 'G-041L0X1KC1';
const UNINSTALL_SURVEY_BASE_URL = 'https://21317389.github.io/youtube-dual-subtitles/uninstall.html';
const GA_SESSION_ID = String(Math.floor(Date.now() / 1000));

function storageLocalGet(key) {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome?.storage?.local?.get) return resolve({});
      let settled = false;
      const maybePromise = chrome.storage.local.get(key, (res) => {
        if (!settled) {
          settled = true;
          resolve(res || {});
        }
      });
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then((res) => {
          if (!settled) {
            settled = true;
            resolve(res || {});
          }
        }).catch(() => {
          if (!settled) {
            settled = true;
            resolve({});
          }
        });
      }
    } catch (e) {
      resolve({});
    }
  });
}

function storageLocalSet(obj) {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome?.storage?.local?.set) return resolve();
      let settled = false;
      const maybePromise = chrome.storage.local.set(obj, () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(() => {
          if (!settled) {
            settled = true;
            resolve();
          }
        }).catch(() => {
          if (!settled) {
            settled = true;
            resolve();
          }
        });
      }
    } catch (e) {
      resolve();
    }
  });
}

async function getOrCreateClientId() {
  const result = await storageLocalGet('ga_client_id');
  if (result && result.ga_client_id) return result.ga_client_id;
  const newId = `${Math.floor(Math.random() * 2147483647)}.${Math.floor(Date.now() / 1000)}`;
  await storageLocalSet({ ga_client_id: newId });
  return newId;
}

function isProductionExtension() {
  try {
    return Boolean(chrome?.runtime?.getManifest?.()?.update_url);
  } catch (e) {
    return false;
  }
}

async function configureUninstallSurveyUrl() {
  try {
    if (!isProductionExtension()) return;
    if (typeof chrome === 'undefined' || typeof chrome?.runtime?.setUninstallURL !== 'function') return;
    const cid = await getOrCreateClientId();
    const version = chrome.runtime?.getManifest?.()?.version || 'unknown';
    const uiLang = chrome.i18n?.getUILanguage?.() || 'zh-TW';
    const surveyUrl = `${UNINSTALL_SURVEY_BASE_URL}?cid=${encodeURIComponent(cid)}&v=${encodeURIComponent(version)}&lang=${encodeURIComponent(uiLang)}`;
    chrome.runtime.setUninstallURL(surveyUrl);
  } catch (e) {
    // 忽略環境不支援錯誤
  }
}

async function sendGA4Event(eventName, params = {}) {
  try {
    // 僅在 Chrome Web Store 正式安裝環境 (具備 update_url) 發送 GA4 遙測，避免本機開發與 E2E 測試污染數據
    if (!isProductionExtension()) return;

    const clientId = await getOrCreateClientId();
    const payload = new URLSearchParams({
      v: '2',
      tid: GA_MEASUREMENT_ID,
      cid: clientId,
      sid: GA_SESSION_ID,
      seg: '1',
      _et: '100',
      en: eventName,
      _s: '1'
    });

    // 附帶自訂參數 (隱私防線：嚴格遵守零個人資料與無觀看歷史原則，徹底剔除 video_id 等識別資訊)
    const sanitizedParams = { ...params };
    delete sanitizedParams.video_id;
    delete sanitizedParams.videoId;
    delete sanitizedParams.url;

    for (const [key, value] of Object.entries(sanitizedParams)) {
      payload.append(`ep.${key}`, String(value));
    }

    await fetch(`https://www.google-analytics.com/g/collect?${payload.toString()}`, {
      method: 'POST',
      mode: 'no-cors'
    });
  } catch (err) {
    // 遙測失敗不影響主要功能
  }
}

async function syncWhatsNewBadge() {
  try {
    const currentVersion = chrome.runtime?.getManifest?.()?.version || '1.4.0';
    const stored = await storageLocalGet('dismissedWhatsNewVersion');
    if (stored?.dismissedWhatsNewVersion !== currentVersion) {
      chrome.action?.setBadgeText?.({ text: 'NEW' });
      chrome.action?.setBadgeBackgroundColor?.({ color: '#ef4444' });
    } else {
      chrome.action?.setBadgeText?.({ text: '' });
    }
  } catch (e) {}
}

// 啟動時立即綁定卸載問卷網址與更新紅點狀態 (確保既有更新用戶與新安裝用戶皆生效)
if (typeof chrome !== 'undefined') {
  configureUninstallSurveyUrl();
  syncWhatsNewBadge();

  // 監聽初次安裝 / 更新事件
  chrome.runtime?.onInstalled?.addListener((details) => {
    configureUninstallSurveyUrl();
    syncWhatsNewBadge();
    const currentVersion = chrome.runtime?.getManifest?.()?.version || 'unknown';
    if (details.reason === 'install') {
      sendGA4Event('extension_installed', { version: currentVersion });
    } else if (details.reason === 'update') {
      sendGA4Event('extension_updated', { version: currentVersion });
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CONFIG,
    ENDPOINTS,
    translationCache,
    setCache,
    persistCache,
    requestTranslationWithFallback,
    handleRuntimeMessage
  };
}



