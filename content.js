/**
 * content.js - 擴充功能內容腳本 (Content Script)
 * 職責：雙語字幕 60fps 幀同步渲染、智慧合句引擎、滑動窗口翻譯、選詞視窗與快捷鍵操控
 */

// ==========================================
// 1. 全域設定與狀態管理
// ==========================================
const CONFIG = {
  PRELOAD_SECONDS: 45,        // 滑動窗口預載秒數
  WINDOW_CHECK_INTERVAL: 1.5, // 窗口檢查節流間隔 (秒)
  BATCH_TRANSLATE_LIMIT: 8,   // 批次翻譯單次最大句數 (防範 URL 過長引發 414 / 400 失敗)
  SENTENCE_END_REGEX: /(?:(?<!\.)\.(?!\.)|[?!。？！])["'”’)]*$/, // 全域統一句末標點符號 (嚴格排除省略號 ... 與口語停頓)
  FALLBACK_LONG_PAUSE_SECONDS: 2.5, // 僅用於無標點音軌的自然長停頓保底 (秒)
  MAX_SENTENCE_CHARS: 320,    // 句子字元長度安全上限 (放寬確保完整從屬複合句不被截斷)
  MAX_SENTENCE_DURATION: 25.0, // 句子持續時長安全上限 (秒)
  UI_SIZE_MAP: {
    small:  { orig: '16px', trans: '13px', minW: '160px', maxW: '260px', pad: '8px 12px',  head: '13px', body: '12px', btn: '11px', btnPad: '3px 7px' },
    medium: { orig: '20px', trans: '16px', minW: '190px', maxW: '320px', pad: '10px 14px', head: '15px', body: '14px', btn: '12px', btnPad: '4px 9px' },
    large:  { orig: '24px', trans: '19px', minW: '230px', maxW: '380px', pad: '12px 16px', head: '17px', body: '16px', btn: '13px', btnPad: '5px 11px' },
    xlarge: { orig: '28px', trans: '23px', minW: '270px', maxW: '440px', pad: '14px 18px', head: '20px', body: '18px', btn: '15px', btnPad: '6px 13px' }
  }
};

// 安全訊息傳遞包裝器 (防範擴充功能重新載入時 context invalidated / undefined 崩潰)
function safeSendMessage(message, callback) {
  try {
    if (typeof chrome !== 'undefined' && chrome?.runtime?.id) {
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

let isExtensionEnabled = true;
let sentenceList = [];
let userTargetLang = 'zh-TW';
let userUiSize = 'medium';
let isHoverPauseEnabled = false;
let subtitleOffset = 0;
let currentTrack = null;
let isCaptionsEnabled = true;
console.log('[YT-Dual-Sub Content] 雙語字幕內容腳本 (content.js) 已注入 YouTube 頁面！');

let lastRenderedSignature = '';
let lastWindowCheckTime = 0;
let currentFetchSessionId = 0;
let inFlightFetchKey = '';
let animationFrameId = null;
let lastObservedVideoId = getCurrentVideoId();

let wasPlayingBeforeHover = false;
let isHoveringSubtitleOrTooltip = false;
let hoverResumeTimer = null;
let snippetPauseTimer = null;

function getSystemDefaultTargetLang() {
  const uiLang = (chrome?.i18n?.getUILanguage?.() || navigator.language || 'en').toLowerCase();
  if (uiLang.startsWith('zh-tw') || uiLang.startsWith('zh-hk') || uiLang.startsWith('zh-mo')) return 'zh-TW';
  if (uiLang.startsWith('zh')) return 'zh-CN';
  if (uiLang.startsWith('ja')) return 'ja';
  if (uiLang.startsWith('ko')) return 'ko';
  if (uiLang.startsWith('es')) return 'es';
  if (uiLang.startsWith('fr')) return 'fr';
  if (uiLang.startsWith('de')) return 'de';
  if (uiLang.startsWith('vi')) return 'vi';
  if (uiLang.startsWith('th')) return 'th';
  return 'en';
}

// ==========================================
// 2. Storage 設定讀取與動態更新
// ==========================================
try {
  if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
    const defaultTargetLang = getSystemDefaultTargetLang();
    chrome.storage.sync.get({
      extensionEnabled: true,
      targetLang: defaultTargetLang,
      uiSize: 'medium',
      hoverPause: false,
      subtitleOffset: 0
    }, (items) => {
      isExtensionEnabled = items.extensionEnabled !== false;
      userTargetLang = items.targetLang;
      userUiSize = items.uiSize;
      isHoverPauseEnabled = !!items.hoverPause;
      subtitleOffset = parseFloat(items.subtitleOffset) || 0;
      applySubtitleSize(userUiSize);
    });
  }
} catch (e) {}

function applySubtitleSize(size) {
  const conf = CONFIG.UI_SIZE_MAP[size] || CONFIG.UI_SIZE_MAP.medium;
  const root = document.documentElement;
  root.style.setProperty('--cue-orig-size', conf.orig);
  root.style.setProperty('--cue-trans-size', conf.trans);
  root.style.setProperty('--tooltip-min-width', conf.minW);
  root.style.setProperty('--tooltip-max-width', conf.maxW);
  root.style.setProperty('--tooltip-padding', conf.pad);
  root.style.setProperty('--tooltip-header-size', conf.head);
  root.style.setProperty('--tooltip-body-size', conf.body);
  root.style.setProperty('--tooltip-btn-size', conf.btn);
  root.style.setProperty('--tooltip-btn-padding', conf.btnPad);
}

try {
  if (typeof chrome !== 'undefined' && chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace !== 'sync') return;

      if (changes.extensionEnabled !== undefined) {
        isExtensionEnabled = !!changes.extensionEnabled.newValue;
        const container = document.getElementById('yt-dual-subtitle-container');
        const tooltip = document.getElementById('yt-translate-tooltip');
        if (!isExtensionEnabled) {
          if (container) container.style.display = 'none';
          if (tooltip) tooltip.style.display = 'none';
          stopSyncLoop();
        } else {
          ensureUIElements();
          const video = getActiveVideo();
          if (video) {
            renderCurrentSubtitle(video.currentTime);
            startSyncLoop();
          }
        }
      }

      if (changes.targetLang) {
        userTargetLang = changes.targetLang.newValue;
        sentenceList.forEach(s => { s.status = 'idle'; s.transText = ''; });
        lastRenderedSignature = '';
        lastRenderedRollingSig = '';
        if (typeof translationCache !== 'undefined') translationCache.clear();
        if (prevSlot.orig) {
          prevSlot.trans = '';
          renderDualSlotSubtitle(prevSlot, currSlot);
          const srcLang = currentTrack?.languageCode || 'auto';
          safeSendMessage({
            action: 'translate',
            text: prevSlot.orig,
            sourceLang: srcLang,
            targetLang: userTargetLang
          }, (res) => {
            if (res?.translatedText && prevSlot.orig) {
              prevSlot.trans = res.translatedText;
              renderDualSlotSubtitle(prevSlot, currSlot);
            }
          });
        }
        const video = getActiveVideo();
        if (video) {
          checkAndTriggerSlidingWindow(video.currentTime);
          renderCurrentSubtitle(video.currentTime);
        }
      }
      if (changes.uiSize) {
        userUiSize = changes.uiSize.newValue;
        applySubtitleSize(userUiSize);
      }
      if (changes.hoverPause !== undefined) {
        isHoverPauseEnabled = !!changes.hoverPause.newValue;
      }
      if (changes.subtitleOffset !== undefined) {
        subtitleOffset = parseFloat(changes.subtitleOffset.newValue) || 0;
        lastRenderedSignature = '';
        const video = getActiveVideo();
        if (video) renderCurrentSubtitle(video.currentTime);
      }
    });
  }
} catch (e) {}

// ==========================================
// 3. DOM 節點選取與掛載管理
// ==========================================
function getActivePlayer() {
  return document.querySelector('ytd-reel-video-renderer[is-active] .html5-video-player') ||
         document.querySelector('#shorts-player') ||
         document.querySelector('#movie_player') ||
         document.querySelector('.html5-video-player');
}

function getActiveVideo() {
  return document.querySelector('ytd-reel-video-renderer[is-active] video') ||
         document.querySelector('#shorts-player video') ||
         document.querySelector('video');
}

function getCurrentVideoId() {
  if (typeof window === 'undefined' || !window?.location?.href) return '';
  const url = window.location.href;
  const match = url.match(/[?&]v=([^&#]+)/) || url.match(/\/shorts\/([^/?&#]+)/);
  return match ? match[1] : '';
}

function resetSubtitles() {
  ++currentFetchSessionId;
  clearInterval(snippetPauseTimer);
  stopNativeCaptionObserver();
  stopSyncLoop();
  sentenceList = [];
  currentTrack = null;
  lastRenderedSignature = '';

  const container = document.getElementById('yt-dual-subtitle-container');
  if (container) {
    container.style.display = 'none';
    container.textContent = '';
  }
  const player = getActivePlayer();
  if (player) player.classList.remove('yt-dual-sub-active');
  const tooltip = document.getElementById('yt-translate-tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

function ensureUIElements() {
  const player = getActivePlayer();
  if (!player) return null;

  let subtitleContainer = document.getElementById('yt-dual-subtitle-container');
  if (!subtitleContainer) {
    subtitleContainer = document.createElement('div');
    subtitleContainer.id = 'yt-dual-subtitle-container';
    player.appendChild(subtitleContainer);
  } else if (subtitleContainer.parentElement !== player) {
    player.appendChild(subtitleContainer);
  }
  bindSubtitleSelectionEvents(subtitleContainer);

  let tooltip = document.getElementById('yt-translate-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'yt-translate-tooltip';
    tooltip.style.display = 'none';
    player.appendChild(tooltip);
  } else if (tooltip.parentElement !== player) {
    player.appendChild(tooltip);
  }

  applySubtitleSize(userUiSize);
  bindHoverPauseEvents(subtitleContainer, tooltip);
  bindVideoEvents();
}

function bindVideoEvents() {
  const video = getActiveVideo();
  if (!video) return;

  video.removeEventListener('timeupdate', onTimeUpdate);
  video.addEventListener('timeupdate', onTimeUpdate);

  video.removeEventListener('play', startSyncLoop);
  video.addEventListener('play', startSyncLoop);

  video.removeEventListener('pause', stopSyncLoop);
  video.addEventListener('pause', stopSyncLoop);

  video.removeEventListener('seeking', handleUserSeek);
  video.addEventListener('seeking', handleUserSeek);

  video.removeEventListener('seeked', onTimeUpdate);
  video.addEventListener('seeked', onTimeUpdate);

  if (!video.paused && !video.ended) {
    startSyncLoop();
  }
}

function handleUserSeek() {
  clearInterval(snippetPauseTimer);
  const video = getActiveVideo();
  if (video) {
    prioritizeCurrentSentence(video.currentTime);
    checkAndTriggerSlidingWindow(video.currentTime);
  }

  // 跨模式 Seek 安全防護：重置即時語音隊列與暫存，防止前段瞬態殘留詞 (如 "We") 污染新時間點的字幕！
  speechTokenQueue = [];
  lastLockedCompletedSentence = '';
  lastRawObservedWindowText = '';
  currentSentenceStartTime = video ? video.currentTime : 0;

  onTimeUpdate();
}

// ==========================================
// 4. 高頻率 60fps 動畫幀同步
// ==========================================
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

// ==========================================
// 5. 訊息接收與軌道載入
// ==========================================
window.addEventListener('message', async (event) => {
  if (event.source !== window || !event.data?.type) return;

  if (event.data.type === 'YT_NAVIGATE_START') {
    resetSubtitles();
    return;
  }

  if (event.data.type !== 'YT_CAPTION_TRACK_CHANGED') return;

  const { enabled, track, videoId } = event.data;
  const currentVid = getCurrentVideoId();

  if (videoId && currentVid && videoId !== currentVid) return;

  const container = document.getElementById('yt-dual-subtitle-container');

  if (!enabled || !track) {
    isCaptionsEnabled = false;
    sentenceList = [];
    lastRenderedSignature = '';
    lastRenderedRollingSig = '';
    stopNativeCaptionObserver();
    stopSyncLoop();
    if (container) container.style.display = 'none';
    return;
  }

  const currentTrackKey = `${track.videoId || currentVid}@@${track.baseUrl || ''}@@${track.languageCode || ''}@@${track.targetTlang || ''}`;

  // 正在下載中或已載入完全相同軌道時，絕不重複發起下載或抹消當前會話！
  if (inFlightFetchKey === currentTrackKey || (currentTrack &&
      currentTrack.videoId === track.videoId &&
      currentTrack.baseUrl === track.baseUrl &&
      currentTrack.targetTlang === track.targetTlang &&
      sentenceList.length > 0)) {
    isCaptionsEnabled = true;
    return;
  }

  isCaptionsEnabled = true;
  currentTrack = track;
  inFlightFetchKey = currentTrackKey;
  sentenceList = [];
  lastRenderedSignature = '';

  const sessionId = ++currentFetchSessionId;
  const vid = track.videoId || getCurrentVideoId();
  console.log('[YT-Dual-Sub] 收到軌道變更:', track.languageCode, 'vid:', vid);

  // 核心防禦：立即啟動 Mode 2 作為實時緩衝橋樑 (確保在 Mode 1 嘗試下載與解析期間，使用者畫面 0 毫秒延遲，絕不黑畫面)
  observeNativePlayerCaptions();

  // 第一主力：優先透過 Main World 網頁同源 Android InnerTube 端點直接下載 (150ms 極速、同源 100% 免疫 403 / 429 / SABR)
  try {
    const mainWorldInnerTubeText = await fetchCaptionViaMainWorldInnerTube(vid, track.languageCode);
    if (mainWorldInnerTubeText && mainWorldInnerTubeText.trim()) {
      if (sessionId !== currentFetchSessionId) return;
      const data = parseUniversalCaptionText(mainWorldInnerTubeText);
      if (data && data.events && data.events.length > 0) {
        console.log('[YT-Dual-Sub] ✅ 網頁同源 InnerTube 高速字幕下載成功！events 筆數:', data.events.length, '啟動 Mode 1 (全片 45 秒整句預載)');
        inFlightFetchKey = '';
        stopNativeCaptionObserver();
        parseCues(data, track.languageCode);
        return;
      }
    }
  } catch (err) {
    console.warn('[YT-Dual-Sub] 網頁同源 InnerTube 下載受阻，嘗試次級通道:', err);
  }

  // 第二主力：透過 background.js 特權通道下載 timedtext (JSON3 / VTT / Raw XML)
  try {
    const rawText = await fetchCaptionTextWithFallback(track);
    if (rawText && rawText.trim()) {
      if (sessionId !== currentFetchSessionId) return;
      const data = parseUniversalCaptionText(rawText);
      if (data && data.events && data.events.length > 0) {
        console.log('[YT-Dual-Sub] ✅ 靜態字幕高速下載成功！events 筆數:', data.events.length, '啟動 Mode 1 (全片 45 秒整句預載)');
        inFlightFetchKey = '';
        stopNativeCaptionObserver();
        parseCues(data, track.languageCode);
        return;
      }
    }
  } catch (err) {
    console.warn('[YT-Dual-Sub] 第二主力 timedtext 下載受阻，嘗試次級通道:', err);
  }

  // 第三主力 (次級備援)：向主環境請求 get_transcript 官方逐字稿
  try {
    const transcriptData = await fetchTranscriptViaMainWorld(vid);
    if (transcriptData && transcriptData.events && transcriptData.events.length > 0) {
      if (sessionId !== currentFetchSessionId) return;
      console.log('[YT-Dual-Sub] ✅ 次級備援 get_transcript 成功取得全片逐字稿！events 筆數:', transcriptData.events.length, '升級 Mode 1');
      inFlightFetchKey = '';
      stopNativeCaptionObserver();
      parseCues(transcriptData, track.languageCode);
      return;
    }
  } catch (err) {}

  // 兜底降級：兩大靜態通道均不可用時，啟動 Mode 2 即時串流監聽
  console.log('[YT-Dual-Sub] 靜態字幕不可用，啟動 Mode 2 (Gemini / DOM 串流監聽)');
  inFlightFetchKey = '';
  stopSyncLoop();
  observeNativePlayerCaptions();
});

// 註冊完事件監聽後，立即主動向 inject.js 索取當前軌道資訊 (徹底解決 document_idle 與 document_start 載入時差造成之廣播漏接！)
function requestCurrentTrackFromMainWorld() {
  if (typeof window !== 'undefined') {
    window.postMessage({ type: 'YT_REQUEST_CURRENT_TRACK' }, '*');
  }
}
requestCurrentTrackFromMainWorld();

// 第一主力：網頁主環境 get_transcript 逐字稿下載管道 (透過 inject.js 呼叫 YouTube 內部業務接口，100% 免疫 429 阻擋)
function fetchTranscriptViaMainWorld(videoId) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null);
    const requestId = 'trans_' + Math.random().toString(36).slice(2) + Date.now();
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        window.removeEventListener('message', onMsg);
        resolve(null);
      }
    }, 1200);

    function onMsg(e) {
      if (e.source !== window || e.data?.type !== 'YT_FETCH_TRANSCRIPT_RESPONSE') return;
      if (e.data.requestId !== requestId) return;
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        resolve(e.data.data || null);
      }
    }

    window.addEventListener('message', onMsg);
    window.postMessage({
      type: 'YT_FETCH_TRANSCRIPT_REQUEST',
      requestId,
      videoId
    }, '*');
  });
}

// 網頁主環境 Android InnerTube 高速端點下載管道 (透過 inject.js 同源 150ms 極速下載，100% 免疫 403 / 429)
function fetchCaptionViaMainWorldInnerTube(videoId, languageCode) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null);
    const requestId = 'innertube_' + Math.random().toString(36).slice(2) + Date.now();
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        window.removeEventListener('message', onMsg);
        resolve(null);
      }
    }, 4000);

    function onMsg(e) {
      if (e.source !== window || e.data?.type !== 'YT_FETCH_INNERTUBE_CAPTION_RESPONSE') return;
      if (e.data.requestId !== requestId) return;
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        resolve(e.data.success ? e.data.text : null);
      }
    }

    window.addEventListener('message', onMsg);
    window.postMessage({
      type: 'YT_FETCH_INNERTUBE_CAPTION_REQUEST',
      requestId,
      videoId,
      languageCode
    }, '*');
  });
}

// 網頁主環境同源特權下載管道 (透過 inject.js 攜帶原生 Cookies 與 Session，徹底免疫 429 阻擋)
function fetchCaptionViaMainWorld(url) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null);
    const requestId = 'req_' + Math.random().toString(36).slice(2) + Date.now();
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        window.removeEventListener('message', onMsg);
        resolve(null);
      }
    }, 2000);

    function onMsg(e) {
      if (e.source !== window || e.data?.type !== 'YT_FETCH_CAPTION_RESPONSE') return;
      if (e.data.requestId !== requestId) return;
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        resolve(e.data.success ? e.data.text : null);
      }
    }

    window.addEventListener('message', onMsg);
    window.postMessage({
      type: 'YT_FETCH_CAPTION_REQUEST',
      requestId,
      url
    }, '*');
  });
}

// 跨域/CSP 特權字幕下載器 (優先透過具有 host_permissions 之 background.js，失敗時自動升級主環境同源通道)
function fetchCaptionViaBackground(url, videoId, languageCode) {
  return new Promise((resolve) => {
    const vid = videoId || getCurrentVideoId();
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 12000);

    safeSendMessage({ action: 'fetchCaption', url, videoId: vid, languageCode }, async (res) => {
      if (settled) return;
      if (res?.error === 'RATE_LIMIT_429') {
        settled = true;
        clearTimeout(timer);
        timedtextCooldownUntil = Date.now() + 60000;
        console.warn('[YT-Dual-Sub] 收到 429 限流信號，立即啟動 60 秒冷卻，絕不發起任何二次請求！');
        resolve(null);
        return;
      }
      if (res?.text && res.text.trim().length > 0) {
        settled = true;
        clearTimeout(timer);
        resolve(res.text);
        return;
      }

      // 若 background.js 因 0 字元受阻 (且非 429)，立即啟動主環境同源特權通道 (帶 Cookies)
      const mainWorldText = await fetchCaptionViaMainWorld(url);
      if (mainWorldText && mainWorldText.trim().length > 0) {
        settled = true;
        clearTimeout(timer);
        resolve(mainWorldText);
        return;
      }

      // 兜底直接 fetch
      fetch(url)
        .then(r => (r.ok ? r.text() : ''))
        .then(text => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(text || null);
        })
        .catch(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(null);
        });
    });
  });
}

// 多候選 URL 自動適配下載器 (JSON3 -> 原生 Raw XML -> WebVTT 梯次重試)
let timedtextCooldownUntil = 0;
async function fetchCaptionTextWithFallback(track) {
  if (Date.now() < timedtextCooldownUntil) {
    console.warn('[YT-Dual-Sub] 處於 429 智能防護冷卻期中，跳過靜態重試以守護 IP 安全，直入 Mode 2');
    return null;
  }
  let baseUrl = track.baseUrl;
  if (track.targetTlang && !baseUrl.includes('&tlang=') && !baseUrl.includes('?tlang=')) {
    baseUrl += `&tlang=${encodeURIComponent(track.targetTlang)}`;
  }

  const urlsToTry = [];
  const vid = track.videoId || getCurrentVideoId();

  // 優先嘗試 1: 標準 JSON3 格式
  let json3Url = baseUrl;
  if (/[?&]fmt=/.test(json3Url)) {
    json3Url = json3Url.replace(/([?&])fmt=[^&]*/, '$1fmt=json3');
  } else {
    json3Url += (json3Url.includes('?') ? '&' : '?') + 'fmt=json3';
  }
  urlsToTry.push(json3Url);

  // 降級嘗試 2: WebVTT 格式 (fmt=vtt，許多 TED 或手動字幕優先支援)
  let vttUrl = baseUrl;
  if (/[?&]fmt=/.test(vttUrl)) {
    vttUrl = vttUrl.replace(/([?&])fmt=[^&]*/, '$1fmt=vtt');
  } else {
    vttUrl += (vttUrl.includes('?') ? '&' : '?') + 'fmt=vtt';
  }
  urlsToTry.push(vttUrl);

  // 降級嘗試 3: YouTube 原生未修改 URL (原汁原味 XML/SRV)
  if (baseUrl !== json3Url && baseUrl !== vttUrl) {
    urlsToTry.push(baseUrl);
  }

  for (const url of urlsToTry) {
    if (Date.now() < timedtextCooldownUntil) break;
    try {
      const text = await fetchCaptionViaBackground(url, vid, track.languageCode);
      if (text && text.trim().length > 0) {
        // 嚴格校驗：若回傳為 HTML 風控攔截頁面 (如 Google 429 Sorry 人機驗證)，立即啟動 60 秒冷卻保護 IP 安全，絕不連環轟炸！
        const trimmed = text.trim().toLowerCase();
        if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html') || trimmed.includes('<title>sorry') || trimmed.includes('captcharedirect')) {
          console.warn('[YT-Dual-Sub] 檢測到 429 風控頁面，立即啟動 60 秒熔斷冷卻期，保護 IP 避免遭封鎖！');
          timedtextCooldownUntil = Date.now() + 60000;
          return null;
        }
        console.log('[YT-Dual-Sub] 字幕下載成功，來源格式:', url.includes('fmt=json3') ? 'json3' : (url.includes('fmt=vtt') ? 'vtt' : 'raw/xml'), '字元數:', text.length);
        return text;
      }
    } catch (e) {
      console.warn('[YT-Dual-Sub] 嘗試下載字幕出錯:', url, e);
    }
  }

  return null;
}

// 通用字幕格式解析器 (自動辨識 JSON3、XML/TimedText、WebVTT)
function parseUniversalCaptionText(rawText) {
  if (!rawText || !rawText.trim()) return null;

  // 1. JSON3
  try {
    const data = JSON.parse(rawText);
    if (data?.events && data.events.length > 0) {
      return data;
    }
  } catch (e) {}

  // 2. XML / TimedText / SRV3
  const xmlData = parseXmlCaptions(rawText);
  if (xmlData?.events && xmlData.events.length > 0) {
    return xmlData;
  }

  // 3. WebVTT
  const vttData = parseVttCaptions(rawText);
  if (vttData?.events && vttData.events.length > 0) {
    return vttData;
  }

  return null;
}

// XML / TimedText 字幕解析器 (支援 <transcript><text> 與 <p t="" d=""> 格式)
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// XML / TimedText 字幕解析器 (支援 DOMParser 與通用正則雙保險，相容 <transcript><text> 與 <p t="" d=""> 格式)
function parseXmlCaptions(xmlString) {
  if (!xmlString) return null;

  // 途徑 1: DOMParser 解析
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
      const events = [];

      // 格式 A: <p t="0" d="2000">文字</p> (srv3/timedtext 格式)
      const pElements = xmlDoc.querySelectorAll('p');
      if (pElements.length > 0) {
        pElements.forEach(p => {
          const tStartMs = parseInt(p.getAttribute('t') || '0', 10);
          const dDurationMs = parseInt(p.getAttribute('d') || '2000', 10);
          const text = p.textContent || '';
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

      // 格式 B: <text start="1.5" dur="2.0">文字</text> (傳統 transcript 格式)
      const textElements = xmlDoc.querySelectorAll('text');
      if (textElements.length > 0) {
        textElements.forEach(t => {
          const startSec = parseFloat(t.getAttribute('start') || '0');
          const durSec = parseFloat(t.getAttribute('dur') || '2.0');
          const text = t.textContent || '';
          if (text.trim()) {
            events.push({
              tStartMs: Math.round(startSec * 1000),
              dDurationMs: Math.round(durSec * 1000),
              segs: [{ utf8: text }]
            });
          }
        });
        if (events.length > 0) return { events };
      }
    } catch (e) {}
  }

  // 途徑 2: 高相容正則引擎保底 (適用於無 DOMParser 環境、Service Worker 或破損 XML)
  try {
    const regexEvents = [];
    const pRegex = /<p\s+[^>]*t="(\d+)"[^>]*d="(\d+)"[^>]*>([\s\S]*?)<\/p>/gi;
    let match;
    while ((match = pRegex.exec(xmlString)) !== null) {
      const tStartMs = parseInt(match[1], 10);
      const dDurationMs = parseInt(match[2], 10);
      const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, '').trim());
      if (text) {
        regexEvents.push({ tStartMs, dDurationMs, segs: [{ utf8: text }] });
      }
    }
    if (regexEvents.length > 0) return { events: regexEvents };

    const textRegex = /<text\s+[^>]*start="([\d.]+)"[^>]*dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
    while ((match = textRegex.exec(xmlString)) !== null) {
      const startSec = parseFloat(match[1]);
      const durSec = parseFloat(match[2]);
      const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, '').trim());
      if (text) {
        regexEvents.push({
          tStartMs: Math.round(startSec * 1000),
          dDurationMs: Math.round(durSec * 1000),
          segs: [{ utf8: text }]
        });
      }
    }
    if (regexEvents.length > 0) return { events: regexEvents };
  } catch (err) {}

  return null;
}

// WebVTT 格式字幕解析器 (支援 00:01.000 --> 00:04.000 格式與 ASR 雙行滾動去重)
function parseVttCaptions(vttString) {
  if (!vttString.includes('WEBVTT') && !vttString.includes('-->')) return null;

  const events = [];
  const timeRegex = /(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/;
  const blocks = vttString.split(/\r?\n\r?\n/);
  let lastAppendedLine = '';

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
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

    const startH = parseInt(match[1] || '0', 10);
    const startM = parseInt(match[2], 10);
    const startS = parseInt(match[3], 10);
    const startMs = parseInt(match[4], 10);
    const tStartMs = (startH * 3600 + startM * 60 + startS) * 1000 + startMs;

    const endH = parseInt(match[5] || '0', 10);
    const endM = parseInt(match[6], 10);
    const endS = parseInt(match[7], 10);
    const endMs = parseInt(match[8], 10);
    const endTotalMs = (endH * 3600 + endM * 60 + endS) * 1000 + endMs;

    if (endTotalMs - tStartMs <= 20) continue; // 略過 10ms-20ms 的無內容微過渡幀

    // 取得文字行並清除內聯標籤
    const textLines = lines.slice(timeLineIdx + 1).map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    if (textLines.length === 0) continue;

    // 處理 YouTube 雙行 Rollup 滾動重疊：若第一行是上一幀已收錄的文字，只取第二行新出現的文字！
    let freshText = '';
    if (textLines.length === 1) {
      freshText = textLines[0];
    } else if (textLines.length >= 2) {
      if (lastAppendedLine && textLines[0].toLowerCase() === lastAppendedLine.toLowerCase()) {
        freshText = textLines.slice(1).join(' ');
      } else {
        freshText = textLines.join(' ');
      }
    }

    if (freshText && freshText.toLowerCase() !== lastAppendedLine.toLowerCase()) {
      const dDurationMs = Math.max(200, endTotalMs - tStartMs);
      events.push({
        tStartMs,
        dDurationMs,
        segs: [{ utf8: freshText }]
      });
      lastAppendedLine = textLines[textLines.length - 1];
    }
  }

  return events.length > 0 ? { events } : null;
}

// URL 變更兜底防護 (僅當使用者確實由片 A 切換至不同片 B 時觸發重置)
setInterval(() => {
  const vid = getCurrentVideoId();
  if (vid && lastObservedVideoId && vid !== lastObservedVideoId) {
    console.log('[YT-Dual-Sub] 檢測到影片跨片切換:', lastObservedVideoId, '->', vid);
    lastObservedVideoId = vid;
    resetSubtitles();
    ensureUIElements();
  } else if (vid && !lastObservedVideoId) {
    lastObservedVideoId = vid;
  }
}, 500);

// ==========================================
// 6. 智慧合句引擎 (Smart Sentence Merging)
// ==========================================
// 音效與背景噪音標籤過濾器 (去除 >>, >>>, [Laughter], [Chuckles], [Music], [Applause], ♪, [音樂] 等無效音訊註釋)
function cleanSubtitleNoise(text) {
  if (!text) return '';
  return text
    .replace(/(?:&gt;|>){1,3}/g, '') // 去除 YouTube 原生笑聲/講者切換標記 (>>, >>>, &gt;&gt;)
    .replace(/[\[\(](?:music|applause|laughter|chuckle|chuckles|giggle|giggles|snicker|snickers|cheering|screaming|snort|gasp|sigh|crying|groan|groaning|bell|chime|silence|whisper|cough|coughing|throat clearing|instrumental|sound effect|bgm|inaudible|unintelligible|音樂|掌聲|笑聲|鼓掌|歓声|拍手|音楽)[\]\)]/gi, '')
    .replace(/[♪♫♩♬]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCues(captionJson, sourceLang) {
  if (!captionJson.events) return;

  // 步驟一：提取、清洗音效噪聲並過濾純音樂片段
  const rawSegments = [];
  for (const e of captionJson.events) {
    if (!e.segs || e.segs.length === 0) continue;
    let text = e.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ');
    text = cleanSubtitleNoise(text);
    if (!text) continue; // 若該片段純為 [Music] 或音符，直接過濾避免無效請求與介面雜訊

    const start = (e.tStartMs || 0) / 1000;
    const duration = (e.dDurationMs !== undefined && e.dDurationMs !== null) ? (e.dDurationMs / 1000) : 2.0;
    const end = start + Math.max(duration, 0.4);

    rawSegments.push({ start, end, text });
  }

  if (rawSegments.length === 0) {
    sentenceList = [];
    return;
  }

  rawSegments.sort((a, b) => a.start - b.start);

  // 消除片段間無效長度重疊
  for (let i = 0; i < rawSegments.length - 1; i++) {
    const nextStart = rawSegments[i + 1].start;
    if (rawSegments[i].end > nextStart) {
      rawSegments[i].end = Math.max(rawSegments[i].start + 0.3, nextStart);
    }
  }

  // 步驟二：拆解單片段內部多句（杜絕段內跨句）
  const normalizedSegments = [];
  const intraSplitRegex = /(?<=[.?!。？！]["'”’)]*)\s+/;

  for (const seg of rawSegments) {
    const parts = seg.text.split(intraSplitRegex).filter(p => p.trim().length > 0);
    if (parts.length > 1) {
      const totalChars = seg.text.length;
      const totalDur = seg.end - seg.start;
      let currStart = seg.start;

      for (let p = 0; p < parts.length; p++) {
        const partText = parts[p].trim();
        const partDur = Math.max(0.3, (partText.length / totalChars) * totalDur);
        const partEnd = (p === parts.length - 1) ? seg.end : Math.min(seg.end, currStart + partDur);

        normalizedSegments.push({ start: currStart, end: partEnd, text: partText });
        currStart = partEnd;
      }
    } else {
      normalizedSegments.push({ start: seg.start, end: seg.end, text: seg.text.trim() });
    }
  }

  // 步驟三：標點嚴格斷句與語意聚合
  const sentences = [];
  let currentGroup = {
    cues: [normalizedSegments[0]],
    origText: normalizedSegments[0].text
  };

  // 標點密度檢測：計算包含句末標點的片段比例 (防禦舊版 ASR 全片僅零星孤立句號)
  const punctCount = normalizedSegments.filter(s => CONFIG.SENTENCE_END_REGEX.test(s.text)).length;
  const punctDensity = punctCount / Math.max(1, normalizedSegments.length);
  const isPunctuationSparse = punctDensity < 0.25; // 低於 25% 片段帶標點，視為低標點/無標點音軌

  for (let i = 1; i < normalizedSegments.length; i++) {
    const prev = normalizedSegments[i - 1];
    const curr = normalizedSegments[i];

    // 核心判定：以標點符號作為標準句末標記
    const isCurrentGroupEnded = CONFIG.SENTENCE_END_REGEX.test(currentGroup.origText.trim());
    let shouldBreak = isCurrentGroupEnded;

    // 片頭工作人員資訊防污染（Transcriber / Reviewer / Subtitles by 獨立結算，絕不拖入講者第一句演說）
    const isMetadataBoundary = /(?:Transcriber|Reviewer|Subtitles by):/i.test(prev.text) || /(?:Transcriber|Reviewer|Subtitles by):/i.test(curr.text);
    if (isMetadataBoundary) shouldBreak = true;

    if (isPunctuationSparse) {
      // 針對無標點/低標點 ASR 音軌啟用：停頓換氣與從屬連詞智慧自然斷句
      const currentWords = currentGroup.origText.trim().split(/\s+/);
      const wordCount = currentWords.length;
      const pauseGap = curr.start - prev.end;

      // 1. 自然換氣停頓 (間隔 >= 0.7 秒且單字量 >= 6)
      const isNaturalPause = pauseGap >= 0.7 && wordCount >= 6;

      // 2. 語意從屬連詞斷句 (字數 >= 12 且新片段開頭為常見連詞)
      const firstWordOfCurr = curr.text.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
      const isConjunctionBreak = wordCount >= 12 && ['and', 'but', 'so', 'because', 'which', 'that', 'now', 'if', 'or', 'then'].includes(firstWordOfCurr);

      // 3. 單字量軟上限 (>= 22 個字)
      const isSoftLimit = wordCount >= 22;

      if (isNaturalPause || isConjunctionBreak || isSoftLimit) {
        shouldBreak = true;
      }
    }

    // 安全防爆框保護 (放寬至 320 字元 / 25 秒)
    const isTooLong = currentGroup.origText.length > CONFIG.MAX_SENTENCE_CHARS || (curr.end - currentGroup.cues[0].start) > CONFIG.MAX_SENTENCE_DURATION;
    if (isTooLong) shouldBreak = true;

    if (shouldBreak) {
      sentences.push(buildSentenceNode(currentGroup, sourceLang));
      currentGroup = { cues: [curr], origText: curr.text };
    } else {
      currentGroup.cues.push(curr);
      currentGroup.origText += ' ' + curr.text;
    }
  }

  if (currentGroup.cues.length > 0) {
    sentences.push(buildSentenceNode(currentGroup, sourceLang));
  }

  // 步驟四：短句智慧合流 (< 5 個單字與後句合併)
  const mergedSentences = [];
  for (let i = 0; i < sentences.length; i++) {
    let currNode = sentences[i];
    while (i + 1 < sentences.length) {
      const words = currNode.origText.trim().split(/\s+/).filter(Boolean);
      if (words.length < 5) {
        const nextNode = sentences[i + 1];
        const combinedText = `${currNode.origText} ${nextNode.origText}`;
        const combinedDuration = nextNode.end - currNode.start;
        if (combinedText.length <= CONFIG.MAX_SENTENCE_CHARS && combinedDuration <= CONFIG.MAX_SENTENCE_DURATION) {
          currNode = {
            start: currNode.start,
            end: nextNode.end,
            origText: combinedText,
            transText: '',
            status: 'idle',
            sourceLang: sourceLang,
            cues: [...currNode.cues, ...nextNode.cues]
          };
          i++; // 合併並消耗下一句
          continue;
        }
      }
      break;
    }
    mergedSentences.push(currNode);
  }

  sentenceList = mergedSentences;
  if (typeof window !== 'undefined') window.__ytDualSub_sentenceList = mergedSentences;
  console.log('[YT-Dual-Sub] Mode 1 合句完成，總共句數:', mergedSentences.length, '首句:', mergedSentences[0]?.origText?.slice(0, 40));

  ensureUIElements();
  const video = getActiveVideo();
  if (video) {
    prioritizeCurrentSentence(video.currentTime);
    checkAndTriggerSlidingWindow(video.currentTime);
    renderCurrentSubtitle(video.currentTime);
    startSyncLoop();
  }
}

function buildSentenceNode(group, sourceLang) {
  return {
    start: group.cues[0].start,
    end: group.cues[group.cues.length - 1].end,
    origText: group.origText.trim(),
    transText: '',
    status: 'idle',
    sourceLang: sourceLang,
    cues: group.cues.map(c => ({ start: c.start, end: c.end, origText: c.text }))
  };
}

// ==========================================
// 7. 雙軌時間映射與畫面渲染
// ==========================================
function getActiveCue(currentTime) {
  if (sentenceList.length === 0) return null;

  const adjustedTime = currentTime + subtitleOffset;
  let activeSentence = null;
  let activeSentenceIndex = -1;

  for (let i = sentenceList.length - 1; i >= 0; i--) {
    const s = sentenceList[i];
    if (adjustedTime >= s.start && adjustedTime <= (s.end + 0.2)) {
      activeSentence = s;
      activeSentenceIndex = i;
      break;
    }
  }

  // 黏性雙槽間隔 (Sticky Dual-Slot Gap) 處理：
  // 講者在兩句之間的停頓換氣 (5.0 秒內)，保持上一句在下槽完整留存，上槽保持前前句，
  // 徹底終結「講者一停頓下槽就消失、一下單槽一下雙槽」的視覺伸縮跳動！
  if (activeSentence) {
    // 講者開口時，整句英文與整句中文同步直接完整亮相，徹底杜絕逐字推進造成的排版微震與抖動！
    const streamingText = activeSentence.origText;
    const prevSentence = activeSentenceIndex > 0 ? sentenceList[activeSentenceIndex - 1] : null;

    return {
      type: 'active',
      streamingOrigText: streamingText,
      fullOrigText: activeSentence.origText,
      transText: activeSentence.transText,
      currentSentence: activeSentence,
      prevSentence: prevSentence,
      sentenceIndex: activeSentenceIndex
    };
  } else {
    // 停頓期間：尋找最近 5.0 秒內剛完結的句子
    let lastFinishedSentence = null;
    let lastFinishedIndex = -1;
    for (let i = sentenceList.length - 1; i >= 0; i--) {
      const s = sentenceList[i];
      if (adjustedTime > s.end && (adjustedTime - s.end) <= 5.0) {
        lastFinishedSentence = s;
        lastFinishedIndex = i;
        break;
      }
    }

    if (!lastFinishedSentence) return null;

    // 黏性雙槽：剛完結的句子穩固駐留下槽 (Slot 2 完備雙語)，前一句駐留上槽 (Slot 1 完備雙語)
    const prevOfFinished = lastFinishedIndex > 0 ? sentenceList[lastFinishedIndex - 1] : null;
    return {
      type: 'sticky_gap',
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
  const container = document.getElementById('yt-dual-subtitle-container');

  if (!isExtensionEnabled) {
    if (container) container.style.display = 'none';
    lastRenderedSignature = '';
    lastRenderedRollingSig = '';
    return;
  }

  // 廣告狀態避讓
  if (player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))) {
    if (container) container.style.display = 'none';
    lastRenderedSignature = '';
    lastRenderedRollingSig = '';
    return;
  }

  if (!isCaptionsEnabled || sentenceList.length === 0) return;

  const video = getActiveVideo();
  if (!video) return;

  const currentTime = video.currentTime;
  renderCurrentSubtitle(currentTime);

  if (Math.abs(currentTime - lastWindowCheckTime) > CONFIG.WINDOW_CHECK_INTERVAL) {
    lastWindowCheckTime = currentTime;
    checkAndTriggerSlidingWindow(currentTime);
  }
}

function renderCurrentSubtitle(currentTime) {
  const container = document.getElementById('yt-dual-subtitle-container');
  if (!container) return;

  const active = getActiveCue(currentTime);

  if (!active) {
    if (container.style.display !== 'none') {
      container.style.display = 'none';
      lastRenderedSignature = '';
      lastRenderedRollingSig = '';
    }
    return;
  }

  // 取得上一句歷史完結句 (若有，實現全模式統一雙槽膠囊滾動)
  const prevSlotData = active.prevSentence ? {
    orig: active.prevSentence.origText,
    trans: active.prevSentence.transText || ''
  } : { orig: '', trans: '' };

  const currSlotData = active.currentSentence ? {
    orig: active.currentSentence.origText,
    trans: active.transText || active.currentSentence.transText || ''
  } : { orig: '', trans: '' };

  renderDualSlotSubtitle(prevSlotData, currSlotData);
}

// ==========================================
// 8. 滑動窗口整句批次翻譯與首句極速通道
// ==========================================
function prioritizeCurrentSentence(currentTime) {
  if (sentenceList.length === 0) return;
  const adjustedTime = currentTime + subtitleOffset;
  const target = sentenceList.find(s => adjustedTime >= s.start && adjustedTime <= s.end) || sentenceList[0];

  if (target && target.status === 'idle') {
    target.status = 'loading';
    safeSendMessage({
      action: 'translate',
      text: target.origText,
      sourceLang: target.sourceLang || 'auto',
      targetLang: userTargetLang
    }, (res) => {
      if (res?.translatedText) {
        target.transText = res.translatedText;
        target.status = 'done';
        lastRenderedSignature = '';
        const video = getActiveVideo();
        if (video) renderCurrentSubtitle(video.currentTime);
      } else {
        target.status = 'idle';
      }
    });
  }
}

function checkAndTriggerSlidingWindow(currentTime) {
  const adjustedTime = currentTime + subtitleOffset;
  const windowEnd = adjustedTime + CONFIG.PRELOAD_SECONDS;
  const pendingSentences = [];

  for (let i = 0; i < sentenceList.length; i++) {
    const s = sentenceList[i];
    if (s.start > windowEnd) break;
    if (s.start >= (adjustedTime - 3) && s.status === 'idle') {
      pendingSentences.push(s);
      if (pendingSentences.length >= CONFIG.BATCH_TRANSLATE_LIMIT) break;
    }
  }

  if (pendingSentences.length === 0) return;

  pendingSentences.forEach(s => s.status = 'loading');
  const combinedText = pendingSentences.map(s => s.origText).join('\n');
  const sourceLang = pendingSentences[0].sourceLang || 'auto';

  safeSendMessage({
    action: 'translate',
    text: combinedText,
    sourceLang: sourceLang,
    targetLang: userTargetLang
  }, (res) => {
    if (res?.translatedText) {
      const lines = res.translatedText.split('\n');

      if (lines.length === pendingSentences.length) {
        pendingSentences.forEach((s, idx) => {
          s.transText = lines[idx] || s.origText;
          s.status = 'done';
        });
      } else {
        // 行數不匹配時降級獨立重試
        pendingSentences.forEach(s => {
          safeSendMessage({
            action: 'translate',
            text: s.origText,
            sourceLang: sourceLang,
            targetLang: userTargetLang
          }, (singleRes) => {
            s.transText = singleRes?.translatedText || s.origText;
            s.status = 'done';
          });
        });
      }

      lastRenderedSignature = '';
      const video = getActiveVideo();
      if (video) renderCurrentSubtitle(video.currentTime);
    } else {
      // 翻譯失敗或所有端點受阻：顯示 Warning Toast 並保護原文字幕正常顯示
      showWarningToast('⚠️ 翻譯服務暫時受限 (429/網路異常)，已自動保留原文字幕，稍後將自動重試');
      pendingSentences.forEach(s => {
        s.status = 'error';
        s.transText = '⚠️ 翻譯暫時受限 (稍後重試)';
      });

      // 延遲 6 秒後自動恢復為 idle 嘗試重新獲取
      setTimeout(() => {
        pendingSentences.forEach(s => {
          if (s.status === 'error') s.status = 'idle';
        });
      }, 6000);

      lastRenderedSignature = '';
      const video = getActiveVideo();
      if (video) renderCurrentSubtitle(video.currentTime);
    }
  });
}

// 全域 Warning Toast 提示器
let toastCooldownTimer = null;
let lastToastTime = 0;

function showWarningToast(message) {
  const now = Date.now();
  if (now - lastToastTime < 8000) return; // 8 秒防抖避免刷屏
  lastToastTime = now;

  const player = getActivePlayer();
  if (!player) return;

  let toast = document.getElementById('yt-dual-warning-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'yt-dual-warning-toast';
    player.appendChild(toast);
  } else if (toast.parentElement !== player) {
    player.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('show');

  clearTimeout(toastCooldownTimer);
  toastCooldownTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 5000);
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
}

// ==========================================
// 9. 字幕選詞隔離與 Tooltip 互動
// ==========================================
function bindSubtitleSelectionEvents(container) {
  if (!container) return;
  container.removeEventListener('mouseup', handleSubtitleMouseUp);
  container.addEventListener('mouseup', handleSubtitleMouseUp);
}

function handleSubtitleMouseUp(e) {
  if (!isExtensionEnabled) return;
  e.stopPropagation(); // 阻止冒泡避免觸發外部翻譯擴充功能視窗

  const selection = window.getSelection();
  const selectedText = selection ? selection.toString().trim() : '';
  const tooltip = document.getElementById('yt-translate-tooltip');
  if (!tooltip) return;

  if (!selectedText) {
    tooltip.style.display = 'none';
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

  if (snippetStart === undefined || snippetEnd === undefined) {
    if (prevSlotTimeRange.end > prevSlotTimeRange.start) {
      snippetStart = prevSlotTimeRange.start;
      snippetEnd = prevSlotTimeRange.end;
    } else {
      snippetStart = Math.max(0, currentTime - 2.5);
      snippetEnd = currentTime + 0.5;
    }
  }

  const msgTranslating = chrome?.i18n?.getMessage('tooltipTranslating') || '翻譯中...';
  const msgPlaySnippet = chrome?.i18n?.getMessage('tooltipPlaySnippet') || '🎬 聽原聲';
  const msgSpeak = chrome?.i18n?.getMessage('tooltipSpeak') || '🗣️ 朗讀';

  tooltip.textContent = '';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tooltip-close-btn';
  closeBtn.id = 'tooltipCloseBtn';
  closeBtn.textContent = '✕';
  tooltip.appendChild(closeBtn);

  const header = document.createElement('div');
  header.className = 'tooltip-header';
  header.textContent = selectedText;
  tooltip.appendChild(header);

  tooltip.appendChild(document.createElement('hr'));

  const body = document.createElement('div');
  body.className = 'tooltip-body';
  body.id = 'tooltipTransBody';
  body.textContent = msgTranslating;
  tooltip.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'tooltip-actions';

  const btnPlay = document.createElement('button');
  btnPlay.className = 'tooltip-btn';
  btnPlay.id = 'btnPlaySnippet';
  btnPlay.textContent = msgPlaySnippet;
  actions.appendChild(btnPlay);

  const btnSpeak = document.createElement('button');
  btnSpeak.className = 'tooltip-btn';
  btnSpeak.id = 'btnSpeakWord';
  btnSpeak.textContent = msgSpeak;
  actions.appendChild(btnSpeak);

  tooltip.appendChild(actions);
  tooltip.style.display = 'block';

  document.getElementById('tooltipCloseBtn')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    tooltip.style.display = 'none';
  });

  document.getElementById('btnPlaySnippet')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    playVideoSnippet(snippetStart, snippetEnd);
  });

  document.getElementById('btnSpeakWord')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    speakSelectedWord(selectedText);
  });

  const tooltipWidth = tooltip.offsetWidth || 230;
  const tooltipHeight = tooltip.offsetHeight || 100;

  let left = rect.left - playerRect.left;
  let top = rect.bottom - playerRect.top + 8;

  const maxLeft = playerRect.width - tooltipWidth - 12;
  left = Math.max(10, Math.min(left, maxLeft));

  if (top + tooltipHeight > playerRect.height - 10) {
    top = Math.max(10, (rect.top - playerRect.top) - tooltipHeight - 8);
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;

  safeSendMessage({
    action: 'translate',
    text: selectedText,
    sourceLang: 'auto',
    targetLang: userTargetLang
  }, (res) => {
    const transBody = document.getElementById('tooltipTransBody');
    if (transBody) {
      if (res?.translatedText) {
        transBody.textContent = res.translatedText;
      } else {
        transBody.textContent = '⚠️ 翻譯暫時受限 (請稍後重試)';
        showWarningToast('⚠️ 翻譯服務暫時受限，請稍後重試');
      }
    }
  });
}

// ==========================================
// 10. 音訊片段重播與 TTS 語音
// ==========================================
function playVideoSnippet(start, end) {
  const video = getActiveVideo();
  if (!video) return;

  clearInterval(snippetPauseTimer);
  video.currentTime = Math.max(0, start - 0.05);
  video.play().catch(() => {});

  snippetPauseTimer = setInterval(() => {
    if (video.currentTime >= end + 0.1 || video.paused) {
      clearInterval(snippetPauseTimer);
      video.pause();
    }
  }, 30);
}

function speakSelectedWord(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = currentTrack?.languageCode || 'en-US';
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

// ==========================================
// 11. 鍵盤熱鍵 (R: 重播原聲 / A: 上一句 / D: 下一句)
// ==========================================
window.addEventListener('keydown', (e) => {
  if (!isExtensionEnabled) return;
  if (isUserTyping(e.target)) return;

  const key = e.key.toLowerCase();
  const video = getActiveVideo();
  if (!video) return;

  if (key === 'r') {
    e.preventDefault();
    const active = getActiveCue(video.currentTime);
    if (active?.currentSentence) {
      playVideoSnippet(active.currentSentence.start, active.currentSentence.end);
    } else if (prevSlotTimeRange.end > prevSlotTimeRange.start) {
      playVideoSnippet(prevSlotTimeRange.start, prevSlotTimeRange.end);
    } else {
      playVideoSnippet(Math.max(0, video.currentTime - 3.0), video.currentTime);
    }
  } else if (key === 'a' && sentenceList.length > 0) {
    e.preventDefault();
    jumpToSentence(-1);
  } else if (key === 'd' && sentenceList.length > 0) {
    e.preventDefault();
    jumpToSentence(1);
  }
});

function isUserTyping(el) {
  if (!el) return false;
  const tagName = el.tagName?.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || el.isContentEditable || el.getAttribute?.('role') === 'textbox';
}

function jumpToSentence(direction) {
  const video = getActiveVideo();
  if (!video || sentenceList.length === 0) return;

  clearInterval(snippetPauseTimer);
  const currentTime = video.currentTime + subtitleOffset;

  let targetIndex = -1;
  for (let i = 0; i < sentenceList.length; i++) {
    const s = sentenceList[i];
    if (currentTime >= s.start && currentTime <= s.end) {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex === -1) {
    for (let i = 0; i < sentenceList.length; i++) {
      if (sentenceList[i].start > currentTime) {
        targetIndex = direction > 0 ? i : Math.max(0, i - 1);
        break;
      }
    }
    if (targetIndex === -1) targetIndex = sentenceList.length - 1;
  } else {
    targetIndex += direction;
  }

  targetIndex = Math.max(0, Math.min(targetIndex, sentenceList.length - 1));
  const targetSentence = sentenceList[targetIndex];

  if (targetSentence) {
    video.currentTime = Math.max(0, targetSentence.start - 0.05);
    renderCurrentSubtitle(video.currentTime);
  }
}

// ==========================================
// 12. 懸停與全域點擊事件
// ==========================================
function bindHoverPauseEvents(subtitleEl, tooltipEl) {
  const video = getActiveVideo();
  if (!video) return;

  const handleMouseEnter = () => {
    if (!isHoverPauseEnabled) return;
    clearTimeout(hoverResumeTimer);
    if (!isHoveringSubtitleOrTooltip) {
      isHoveringSubtitleOrTooltip = true;
      wasPlayingBeforeHover = !video.paused && !video.ended;
      if (wasPlayingBeforeHover) video.pause();
    }
  };

  const handleMouseLeave = (e) => {
    if (!isHoverPauseEnabled) return;
    const nextTarget = e.relatedTarget;
    if (
      (subtitleEl && subtitleEl.contains(nextTarget)) ||
      (tooltipEl && tooltipEl.contains(nextTarget))
    ) {
      return;
    }

    clearTimeout(hoverResumeTimer);
    hoverResumeTimer = setTimeout(() => {
      if (window.getSelection().toString().trim().length > 0) return;
      isHoveringSubtitleOrTooltip = false;
      if (wasPlayingBeforeHover) {
        video.play().catch(() => {});
        wasPlayingBeforeHover = false;
      }
    }, 150);
  };

  [subtitleEl, tooltipEl].forEach(element => {
    if (!element) return;
    element.removeEventListener('mouseenter', handleMouseEnter);
    element.removeEventListener('mouseleave', handleMouseLeave);
    element.addEventListener('mouseenter', handleMouseEnter);
    element.addEventListener('mouseleave', handleMouseLeave);
  });
}

document.addEventListener('mousedown', (e) => {
  const tooltip = document.getElementById('yt-translate-tooltip');
  const subtitleContainer = document.getElementById('yt-dual-subtitle-container');

  if (tooltip && !tooltip.contains(e.target) && !subtitleContainer?.contains(e.target)) {
    tooltip.style.display = 'none';
    clearInterval(snippetPauseTimer);
  }
});

// ==========================================
// 13. YouTube 雙軌解耦即時雙語引擎 (Dual-Track Decoupled Subtitle Engine)
// 軌道 1 (英文)：直接監聽 DOM 雙行即時逐字滾動 (A->B, B->C，零延遲跟隨講者發音)
// 軌道 2 (中文)：後台全域詞元時序隊列 (Token Queue) 提取完整句子，整句平滑翻譯
// ==========================================
// ==========================================
// 13. YouTube 雙語純句級對稱雙槽滾動引擎 (Sentence-Driven Bilingual Dual-Slot Engine)
// 上槽 (Slot 1)：上一句歷史完結句 (英 + 中，0.65 半透明膠囊背景，層次分明)
// 下槽 (Slot 2)：當前正在講的句子 (英文字幕在同一個膠囊內實時吐字延伸，未遇到句末標點符號前絕不跳槽折行)
// ==========================================
let nativeCaptionObserver = null;
let lastRenderedRollingSig = '';

let speechTokenQueue = [];
let prevSlot = { orig: '', trans: '' }; // 上槽 (Slot 1)
let currSlot = { orig: '', trans: '' }; // 下槽 (Slot 2) 當前活躍句
let lastLockedCompletedSentence = ''; // 同步即時鎖定已完結句子
let completedSentenceHistory = []; // 持久化歷史完結長句庫 (徹底免疫任何跨行或中段殘留切片)
let lastRawObservedWindowText = '';
let prevSlotTimeRange = { start: 0, end: 0 }; // 記錄上一句時間軸，供快捷鍵 R 重播原聲
let currentSentenceStartTime = 0; // 記錄當前正在講的句子開始時間
let lastFinishedSentence = ''; // 黏性雙槽：剛完結的句子
let lastFinishedTrans = ''; // 黏性雙槽：剛完結的句子譯文

function resetStreamingState() {
  lastRenderedRollingSig = '';
  speechTokenQueue = [];
  prevSlot = { orig: '', trans: '' };
  currSlot = { orig: '', trans: '' };
  lastLockedCompletedSentence = '';
  completedSentenceHistory = [];
  lastRawObservedWindowText = '';
  currentSentenceStartTime = 0;
  lastFinishedSentence = '';
  lastFinishedTrans = '';
  prevSlotTimeRange = { start: 0, end: 0 };
}

function getStreamingSlots() {
  return { prev: prevSlot, curr: currSlot };
}

function setStreamingSlots(prev, curr) {
  if (prev) prevSlot = prev;
  if (curr) currSlot = curr;
}

function isTailOfImmediatePrev(phrase) {
  if (!phrase) return false;
  const clean = phrase.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return false;

  const targets = [lastLockedCompletedSentence, ...completedSentenceHistory].filter(Boolean);
  for (const target of targets) {
    const prevClean = target.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    if (prevClean.endsWith(clean) || prevClean === clean) return true;
  }
  return false;
}

function ingestAndExtractSentence(windowText) {
  let words = windowText.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  // 1. 若 incoming words 開頭包含歷史完結句 (完整整句或末尾殘留)，精準從開頭剝除，絕不污染下句隊列！
  const targets = [lastLockedCompletedSentence, ...completedSentenceHistory].filter(Boolean);
  for (const target of targets) {
    const targetWords = target.trim().split(/\s+/).filter(Boolean);
    for (let s = Math.min(words.length, targetWords.length + 2); s > 0; s--) {
      const candidate = words.slice(0, s).join(' ');
      if (isTailOfImmediatePrev(candidate)) {
        words = words.slice(s);
        break;
      }
    }
  }

  if (words.length === 0) {
    return { completed: null, inProgress: speechTokenQueue.join(' ') };
  }

  // 2. 尋找 incoming words 在 speechTokenQueue 尾部的重疊切入點
  let maxMatchedWordCount = 0;
  for (let matchLen = Math.min(words.length, speechTokenQueue.length); matchLen > 0; matchLen--) {
    const queueSuffix = speechTokenQueue.slice(-matchLen).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).join(' ');
    const incomingPrefix = words.slice(0, matchLen).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).join(' ');
    if (queueSuffix === incomingPrefix && queueSuffix.length > 0) {
      maxMatchedWordCount = matchLen;
      break;
    }
  }

  if (maxMatchedWordCount > 0) {
    const newWords = words.slice(maxMatchedWordCount);
    speechTokenQueue.push(...newWords);
  } else if (speechTokenQueue.length === 0) {
    speechTokenQueue.push(...words);
  } else {
    // 跨視窗容錯：若 YouTube 滾動跳躍較大，在隊列中進行子序列比對
    const qClean = speechTokenQueue.map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).join(' ');
    let matchedMid = false;
    for (let len = Math.min(words.length, 6); len > 0; len--) {
      const inPrefix = words.slice(0, len).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).join(' ');
      const foundIdx = qClean.lastIndexOf(inPrefix);
      if (foundIdx !== -1) {
        const wordsBefore = qClean.slice(0, foundIdx).trim().split(/\s+/).filter(Boolean).length;
        const matchedQueuePos = wordsBefore + len;
        const newWords = words.slice(len);
        speechTokenQueue = speechTokenQueue.slice(0, matchedQueuePos).concat(newWords);
        matchedMid = true;
        break;
      }
    }
    if (!matchedMid) {
      const currentQueueText = speechTokenQueue.join(' ');
      const isOverLimit = currentQueueText.length > CONFIG.MAX_SENTENCE_CHARS;
      const endsWithPunctuation = CONFIG.SENTENCE_END_REGEX.test(currentQueueText);

      if (!endsWithPunctuation && !isOverLimit) {
        // 隊列尚未遇句末標點，新行/新切片為自然跨行延伸，忠實接續隊列，不隨意截斷講者話語！
        speechTokenQueue.push(...words);
      } else {
        // 當超過長度上限時，將已累積文字結算為完結句，絕不直接清空抹除！
        if (speechTokenQueue.length >= 6) {
          const completed = speechTokenQueue.join(' ');
          speechTokenQueue = [...words];
          return { completed, inProgress: speechTokenQueue.join(' ') };
        }
        speechTokenQueue = [...words];
      }
    }
  }

  // 3. 檢查隊列中是否包含句末標點符號 (嚴格排除省略號 ... 與口語停頓)
  const fullText = speechTokenQueue.join(' ');
  const match = fullText.match(/^([\s\S]+?(?:(?<!\.)\.(?!\.)|[?!。？！])["'”’)]*)(?:\s+([\s\S]*))?$/);
  if (match) {
    const completed = match[1].trim();
    const remainder = (match[2] || '').trim();
    const words = completed.split(/\s+/).filter(Boolean);

    // 短句 (< 5 個單字) 且隊列後續還有接續內容時，向後合流至下一句
    if (words.length < 5 && remainder.length > 0) {
      const secondMatch = fullText.match(/^([\s\S]+?(?:(?<!\.)\.(?!\.)|[?!。？！])["'”’)]*[\s\S]+?(?:(?<!\.)\.(?!\.)|[?!。？！])["'”’)]*)(?:\s+([\s\S]*))?$/);
      if (secondMatch) {
        const doubleCompleted = secondMatch[1].trim();
        const doubleRemainder = (secondMatch[2] || '').trim();
        speechTokenQueue = doubleRemainder ? doubleRemainder.split(/\s+/).filter(Boolean) : [];
        return { completed: doubleCompleted, inProgress: doubleRemainder };
      }
      // 後句仍在說話中，先暫留隊列中累計
      return { completed: null, inProgress: fullText };
    }

    const cleanCompleted = completed.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const cleanPrev = lastLockedCompletedSentence.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const isDuplicate = cleanCompleted === cleanPrev;

    if (!isDuplicate) {
      speechTokenQueue = remainder ? remainder.split(/\s+/).filter(Boolean) : [];
      return { completed, inProgress: remainder };
    } else {
      // 若隊列開頭與上一句剛完結的句子完全重複，立即清除
      speechTokenQueue = remainder ? remainder.split(/\s+/).filter(Boolean) : [];
      return { completed: null, inProgress: remainder };
    }
  }

  // 4. 無標點音軌智慧自然斷句 (防止單句無限累積至 30~50 字導致下槽爆滿且上槽停滯！)
  if (speechTokenQueue.length >= 20) {
    const conjunctions = ['and', 'but', 'so', 'because', 'which', 'now', 'if', 'then', 'or'];
    let splitIdx = -1;
    // 雙端邊界保護：前半句至少 12 個字，後半句至少保留 6 個字，絕不切出碎句懸掛！
    for (let i = 12; i <= speechTokenQueue.length - 6; i++) {
      const w = speechTokenQueue[i].toLowerCase().replace(/[^a-z]/g, '');
      if (conjunctions.includes(w)) {
        splitIdx = i;
        break;
      }
    }
    if (splitIdx === -1 && speechTokenQueue.length >= 26) {
      splitIdx = 18;
    }
    if (splitIdx !== -1) {
      const completed = speechTokenQueue.slice(0, splitIdx).join(' ');
      const remainder = speechTokenQueue.slice(splitIdx).join(' ');
      speechTokenQueue = remainder ? remainder.split(/\s+/).filter(Boolean) : [];
      return { completed, inProgress: remainder };
    }
  }

  return { completed: null, inProgress: fullText };
}

const translationCache = new Map();

function getCachedTranslation(text) {
  if (!text) return '';
  if (translationCache.has(text)) return translationCache.get(text);
  const stripped = text.replace(/[.?!。？！]["'”’)]*$/, '').trim();
  if (stripped && translationCache.has(stripped)) return translationCache.get(stripped);
  return '';
}

function setCachedTranslation(text, trans) {
  if (!text || !trans) return;
  translationCache.set(text, trans);
  const stripped = text.replace(/[.?!。？！]["'”’)]*$/, '').trim();
  if (stripped) translationCache.set(stripped, trans);
}

function observeNativePlayerCaptions() {
  if (typeof MutationObserver === 'undefined') return;
  if (nativeCaptionObserver) return; // 已經在監聽中，絕不重複重置或清空 Slot 1！

  const player = getActivePlayer();
  if (!player) return;

  ensureUIElements();
  stopSyncLoop(); // 避免與 60fps 幀循環競爭

  const handleCaptionMutation = (mutationsList) => {
    if (!isExtensionEnabled) return;

    // 嚴格過濾：若變更來自我們自己的雙語字幕容器或 Tooltip，直接忽略 (防止無窮遞迴與 CPU 飆高)
    if (mutationsList && mutationsList.length > 0) {
      const isSelfMutation = mutationsList.every(m => {
        const target = m.target;
        return target && (
          target.id === 'yt-dual-subtitle-container' ||
          target.closest?.('#yt-dual-subtitle-container') ||
          target.id === 'yt-dual-sub-tooltip' ||
          target.closest?.('#yt-dual-sub-tooltip')
        );
      });
      if (isSelfMutation) return;
    }

    const captionWindow = player.querySelector('.ytp-caption-window, .ytp-caption-window-bottom, .ytp-caption-window-rollup, .caption-window, [class*="caption-window"]');
    if (!captionWindow) return;

    // 讀取原生字幕視窗文字 (相容 segment 節點與純文本視窗)
    const segments = captionWindow.querySelectorAll('.ytp-caption-segment');
    const textParts = segments.length > 0
      ? Array.from(segments).map(s => s.textContent || '')
      : [captionWindow.textContent || ''];
    const liveWindowText = cleanSubtitleNoise(textParts.join(' ').replace(/\s+/g, ' ').trim());

    if (!liveWindowText) {
      // 停頓換氣期間：絕對不清除既有字幕，維持畫面雙槽穩固呈現，等待下一句講述！
      return;
    }

    if (liveWindowText === lastRawObservedWindowText) return;
    lastRawObservedWindowText = liveWindowText;

    const result = ingestAndExtractSentence(liveWindowText);
    if (!result) return;

    if (result.completed) {
      clearTimeout(liveTransDebounceTimer);
      ++currentLiveTransId; // 立即作廢所有先前發出的未完結前綴翻譯請求
      const completedSentence = result.completed;
      const inProgress = result.inProgress;

      // 記錄上一句時間戳，供快捷鍵 R 重播真實語音切片
      const video = getActiveVideo();
      const vTime = video ? video.currentTime : 0;
      prevSlotTimeRange = {
        start: currentSentenceStartTime > 0 ? currentSentenceStartTime : Math.max(0, vTime - 3.5),
        end: vTime
      };
      currentSentenceStartTime = vTime;

      // 零延遲同步鎖定已完結句子，並納入歷史庫
      lastLockedCompletedSentence = completedSentence;
      if (!completedSentenceHistory.includes(completedSentence)) {
        completedSentenceHistory.push(completedSentence);
        if (completedSentenceHistory.length > 10) completedSentenceHistory.shift();
      }

      // 檢查是否已有快取譯文
      const cachedTrans = getCachedTranslation(completedSentence) || '';

      // 0ms 即刻槽位鎖定 (不等待非同步網路回傳，徹底終結句號出現後直接消失的 BUG)
      if (inProgress) {
        // 完結瞬間已有新句在講 (inProgress)：剛完結的句子立即升為上槽，新句在下槽展開
        prevSlot = { orig: completedSentence, trans: cachedTrans };
        currSlot = { orig: inProgress, trans: '' };
        lastFinishedSentence = '';
        lastFinishedTrans = '';
        renderDualSlotSubtitle(prevSlot, currSlot);
      } else {
        // 停頓期（剛說完這句，還沒開口講下一句）：剛完結的句子穩固留存下槽，記錄為 lastFinishedSentence
        if (!prevSlot.orig && lastFinishedSentence) {
          prevSlot = { orig: lastFinishedSentence, trans: lastFinishedTrans };
        }
        currSlot = { orig: completedSentence, trans: cachedTrans };
        lastFinishedSentence = completedSentence;
        lastFinishedTrans = cachedTrans;
        renderDualSlotSubtitle(prevSlot, currSlot);
      }

      // 若尚未有譯文，異步發起翻譯
      if (!cachedTrans) {
        const srcLang = currentTrack?.languageCode || 'auto';
        safeSendMessage({
          action: 'translate',
          text: completedSentence,
          sourceLang: srcLang,
          targetLang: userTargetLang
        }, (res) => {
          const transText = res?.translatedText?.trim() || '';
          if (transText) {
            setCachedTranslation(completedSentence, transText);

            // 精確槽位填補 (Deterministic Slot Ownership)
            let needRender = false;

            // 情況 A：該句子已被升入上槽 (新句已在下槽展開)
            if (prevSlot.orig === completedSentence) {
              prevSlot.trans = transText;
              needRender = true;
            }

            // 情況 B：該句子仍在下槽停頓保留中 (講者換氣停頓中)
            if (currSlot.orig === completedSentence) {
              currSlot.trans = transText;
              needRender = true;
            }

            // 情況 C：該句子作為 lastFinishedSentence 等待下一次開口升槽
            if (lastFinishedSentence === completedSentence) {
              lastFinishedTrans = transText;
            }

            if (needRender) {
              renderDualSlotSubtitle(prevSlot, currSlot);
            }
          }
        });
      }
    } else if (result.inProgress) {
      // 尚無標點符號：講者正在講新的一句話 (inProgress)
      if (currentSentenceStartTime === 0) {
        const v = getActiveVideo();
        currentSentenceStartTime = v ? v.currentTime : 0;
      }

      // 講者開口講新句子瞬間：上一句正式優雅升槽！
      if (lastFinishedSentence) {
        prevSlot = {
          orig: lastFinishedSentence,
          trans: lastFinishedTrans || getCachedTranslation(lastFinishedSentence) || ''
        };
        lastFinishedSentence = '';
        lastFinishedTrans = '';
      }

      // 下槽 (Slot 2)：即時雙語顯示（若已有快取譯文立即呈現，並發起防抖即時翻譯）
      const liveText = result.inProgress;
      const cachedLiveTrans = getCachedTranslation(liveText) || '';
      // 若句子正在說話中持續延伸 (例如從逗號延展至句末)，保留上一小段既有翻譯以防畫面翻譯蒸發閃爍！
      const isExtendingCurrent = currSlot.orig && liveText.startsWith(currSlot.orig.slice(0, Math.min(10, currSlot.orig.length)));
      const preservedTrans = cachedLiveTrans || (isExtendingCurrent ? currSlot.trans : '');
      currSlot = { orig: liveText, trans: preservedTrans };
      renderDualSlotSubtitle(prevSlot, currSlot);

      // 防抖請求下槽即時翻譯 (Debounce 350ms，且至少要有 3 個單字)
      if (!cachedLiveTrans && liveText.split(/\s+/).length >= 3) {
        debouncedTranslateLiveProgress(liveText);
      }
    }
  };

  nativeCaptionObserver = new MutationObserver((mutations) => {
    handleCaptionMutation(mutations);
  });

  nativeCaptionObserver.observe(player, {
    childList: true,
    subtree: true,
    characterData: true
  });

  handleCaptionMutation([]);
}

let liveTransDebounceTimer = null;
let lastRequestedLiveText = '';

let currentLiveTransId = 0;
function debouncedTranslateLiveProgress(text) {
  clearTimeout(liveTransDebounceTimer);
  liveTransDebounceTimer = setTimeout(() => {
    if (text === lastRequestedLiveText) return;
    lastRequestedLiveText = text;
    const reqId = ++currentLiveTransId;
    const srcLang = currentTrack?.languageCode || 'auto';
    safeSendMessage({
      action: 'translate',
      text: text,
      sourceLang: srcLang,
      targetLang: userTargetLang
    }, (res) => {
      // 核心防禦：若後續已有更新或完結句子之翻譯請求發出，過時的短前綴翻譯絕對不允許覆蓋畫面！
      if (reqId !== currentLiveTransId) return;
      const transText = res?.translatedText?.trim() || '';
      if (transText) {
        setCachedTranslation(text, transText);
        if (currSlot.orig && (currSlot.orig.trim() === text.trim() || currSlot.orig.startsWith(text.trim()))) {
          currSlot.trans = transText;
          renderDualSlotSubtitle(prevSlot, currSlot);
        }
      }
    });
  }, 350);
}

function stopNativeCaptionObserver() {
  clearTimeout(liveTransDebounceTimer);
  if (nativeCaptionObserver) {
    nativeCaptionObserver.disconnect();
    nativeCaptionObserver = null;
  }
  const player = getActivePlayer();
  if (player) player.classList.remove('yt-dual-sub-active');
  resetStreamingState();
}

function renderDualSlotSubtitle(prev, curr) {
  if (!isExtensionEnabled) return;
  const container = document.getElementById('yt-dual-subtitle-container');
  if (!container) return;

  const currOrig = curr?.orig || '';
  const currTrans = curr?.trans || '';

  // 最後物理防禦：若下槽 (Slot 2) 開頭包含上槽 (Slot 1) 的歷史完結句，直接在渲染層乾淨剝除
  let displayCurrOrig = currOrig || '';
  if (prev?.orig && displayCurrOrig) {
    const prevClean = prev.orig.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const currClean = displayCurrOrig.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    if (currClean.startsWith(prevClean)) {
      const prevWordCount = prev.orig.trim().split(/\s+/).length;
      const currWords = displayCurrOrig.trim().split(/\s+/);
      displayCurrOrig = currWords.slice(prevWordCount).join(' ').trim();
    }
  }

  const currentSig = `${prev?.orig || ''}@@${prev?.trans || ''}@@${displayCurrOrig}@@${currTrans}`;
  if (currentSig === lastRenderedRollingSig && container.style.display !== 'none') return;
  lastRenderedRollingSig = currentSig;

  if (!prev?.orig && !displayCurrOrig) {
    container.style.display = 'none';
    const player = getActivePlayer();
    if (player) player.classList.remove('yt-dual-sub-active');
    return;
  }

  let slotPrev = container.querySelector('.cue-slot-prev');
  let slotCurr = container.querySelector('.cue-slot-curr');

  // DOM 節點僅初始化一次，後續全部原地 textContent 更新，徹底杜絕畫面抖動與重繪閃爍 (100% 遵從 Trusted Types 安全規範)
  if (!slotPrev || !slotCurr) {
    container.textContent = '';

    function createSlotNode(className) {
      const slot = document.createElement('div');
      slot.className = `cue-slot ${className}`;
      slot.style.display = 'none';

      const orig = document.createElement('div');
      orig.className = 'cue-slot-orig';
      slot.appendChild(orig);

      const trans = document.createElement('div');
      trans.className = 'cue-slot-trans';
      trans.style.display = 'none';
      slot.appendChild(trans);

      return slot;
    }

    slotPrev = createSlotNode('cue-slot-prev');
    slotCurr = createSlotNode('cue-slot-curr');
    container.appendChild(slotPrev);
    container.appendChild(slotCurr);
  }

  // 原地更新 Slot 1 (上槽 - 0.65 半透明歷史句)
  if (prev?.orig) {
    const origEl = slotPrev.querySelector('.cue-slot-orig');
    const transEl = slotPrev.querySelector('.cue-slot-trans');
    if (origEl) origEl.textContent = prev.orig;
    if (transEl) {
      if (prev.trans) {
        transEl.textContent = prev.trans;
        transEl.style.display = '';
        transEl.style.visibility = 'visible';
      } else {
        // 抗抖動防塌陷保護：若上槽有英文但譯文尚在非同步等待中，保持 DOM 佔位，絕不塌陷成一行！
        transEl.textContent = '\u00A0';
        transEl.style.display = '';
        transEl.style.visibility = 'hidden';
      }
    }
    slotPrev.style.display = 'flex';
  } else {
    slotPrev.style.display = 'none';
  }

  // 原地更新 Slot 2 (下槽 - 1.00 當前活躍句)
  if (displayCurrOrig) {
    const origEl = slotCurr.querySelector('.cue-slot-orig');
    const transEl = slotCurr.querySelector('.cue-slot-trans');
    if (origEl) origEl.textContent = displayCurrOrig;
    if (transEl) {
      if (currTrans) {
        transEl.textContent = currTrans;
        transEl.style.display = '';
      } else {
        transEl.textContent = '';
        transEl.style.display = 'none';
      }
    }
    slotCurr.style.display = 'flex';
  } else {
    slotCurr.style.display = 'none';
  }

  container.style.display = 'flex';
  const player = getActivePlayer();
  if (player) player.classList.add('yt-dual-sub-active');
}
