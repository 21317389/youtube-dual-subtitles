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

// 4. InnerTube 官方播放器通道兜底抓取器 (當前置網頁 URL 受 exp=xpe 污染返回 0 字元時啟動)
async function fetchFreshCaptionTrack(videoId, preferredLang = 'en') {
  try {
    const postData = JSON.stringify({
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '20.10.38',
          osName: 'Android',
          osVersion: '11',
          hl: preferredLang || 'en'
        }
      },
      videoId: videoId
    });

    const response = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: postData
    });

    if (!response.ok) return null;
    const playerJson = await response.json();
    const tracks = playerJson?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (tracks.length === 0) return null;

    const candidateTracks = [
      tracks.find(t => t.languageCode === preferredLang && t.kind !== 'asr'),
      tracks.find(t => t.languageCode === preferredLang),
      tracks.find(t => t.kind !== 'asr'),
      tracks[0]
    ].filter(Boolean);

    for (const trk of candidateTracks) {
      const urlsToTry = [];
      if (trk.baseUrl) {
        let j3 = trk.baseUrl.includes('&fmt=') ? trk.baseUrl.replace(/&fmt=[^&]+/, '&fmt=json3') : (trk.baseUrl + '&fmt=json3');
        urlsToTry.push(j3);
        let vtt = trk.baseUrl.includes('&fmt=') ? trk.baseUrl.replace(/&fmt=[^&]+/, '&fmt=vtt') : (trk.baseUrl + '&fmt=vtt');
        urlsToTry.push(vtt);
        urlsToTry.push(trk.baseUrl);
      }
      for (const u of urlsToTry) {
        try {
          const subRes = await fetch(u);
          if (subRes.ok) {
            const subText = await subRes.text();
            const isHtmlBlock = subText && (subText.trim().startsWith('<html') || subText.includes('<title>Sorry...'));
            if (subText && subText.trim().length > 0 && !isHtmlBlock) {
              return { track: trk, text: subText, vtt: subText };
            }
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    console.warn('[YT-Dual-Sub Background] InnerTube 兜底抓取異常:', e);
  }
  return null;
}

// 5. 監聽 Content Script 請求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchCaption') {
    const { url, videoId, languageCode } = request;
    if (!url) {
      sendResponse({ error: 'Missing url' });
      return false;
    }

    (async () => {
      // 若 URL 已包含 exp=xpe，表示受 YouTube SABR 伺服器端 Token-Gate 鎖定，直接 fetch 必定回傳 0 字元，
      // 立即啟動 Android InnerTube 偷跑通道，省去 2~4 秒的無效網路等待！
      if (url.includes('exp=xpe') && videoId) {
        try {
          console.log('[YT-Dual-Sub Background] 檢測到 exp=xpe 標記，極速啟動 InnerTube 偷跑通道:', videoId);
          const fresh = await fetchFreshCaptionTrack(videoId, languageCode);
          if (fresh && (fresh.text || fresh.vtt)) {
            sendResponse({ text: fresh.text || fresh.vtt });
            return;
          }
        } catch (err) {
          console.warn('[YT-Dual-Sub Background] InnerTube 兜底失敗:', err.message);
        }
      }

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
        console.warn('[YT-Dual-Sub Background] 初次字幕抓取受阻:', e.message);
      }

      // 若直接抓取返回 0 字元 (且非 429)，自動啟動 InnerTube 偷跑通道
      if (videoId) {
        try {
          console.log('[YT-Dual-Sub Background] 檢測到 timedtext 返回 0 字元，啟動 InnerTube 偷跑通道:', videoId);
          const fresh = await fetchFreshCaptionTrack(videoId, languageCode);
          if (fresh && (fresh.text || fresh.vtt)) {
            sendResponse({ text: fresh.text || fresh.vtt });
            return;
          }
        } catch (err) {
          console.warn('[YT-Dual-Sub Background] InnerTube 兜底失敗:', err.message);
        }
      }

      sendResponse({ text: '' });
    })();

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
