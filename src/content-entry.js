/**
 * src/content-entry.js - 擴充功能內容腳本核心入口 (Modular Content Script Entrypoint)
 * 職責：
 *  1. 匯總各領域核心模組 (SessionState, SentencePolicy, StreamingExtractor, CaptionParser, TranslationScheduler, SubtitleRenderer, TooltipController)
 *  2. 集中由 SessionState 管理全生命週期狀態，消除頂層 40+ 個散落變數
 *  3. 透過 TranslationScheduler 聚合在途翻譯請求，徹底阻絕重複發送與 Request Storm
 *  4. Content 端透過 Protocol 常量收斂通訊鍵名，並經由契約測試防護與 inject.js / background.js 協議一致性
 *  5. 經由 esbuild 打包輸出為 dist/content.js (100% 零依賴、嚴格遵從 MV3 規範)
 */

const {
  WindowMessageType,
  RuntimeAction,
  isValidWindowMessage
} = require('./bridge/protocol');

const { SessionState } = require('./core/session-state');

const {
  cleanSubtitleNoise,
  isConjunction,
  shouldMergeShortSentence,
  SENTENCE_END_REGEX,
  FALLBACK_LONG_PAUSE_SECONDS,
  MAX_SENTENCE_CHARS,
  MAX_SENTENCE_DURATION
} = require('./core/sentence-policy');

const { StreamingSentenceExtractor } = require('./core/streaming-sentence-extractor');

const {
  parseUniversalCaptionText
} = require('./core/caption-parser');

const { TranslationScheduler } = require('./core/translation-scheduler');

const {
  SubtitleRenderer,
  DEFAULT_SIZE_MAP
} = require('./ui/subtitle-renderer');

const {
  TooltipController
} = require('./ui/tooltip-controller');

// ==========================================
// 1. 常量設定 (Configuration)
// ==========================================
const CONFIG = {
  PRELOAD_SECONDS: 45,        // 滑動窗口預載秒數
  WINDOW_CHECK_INTERVAL: 1.5, // 窗口檢查節流間隔 (秒)
  BATCH_TRANSLATE_LIMIT: 8,   // 批次翻譯單次最大句數
  SENTENCE_END_REGEX: SENTENCE_END_REGEX,
  FALLBACK_LONG_PAUSE_SECONDS: FALLBACK_LONG_PAUSE_SECONDS,
  MAX_SENTENCE_CHARS: MAX_SENTENCE_CHARS,
  MAX_SENTENCE_DURATION: MAX_SENTENCE_DURATION,
  BACKGROUND_FETCH_TIMEOUT: 6000,
  INNERTUBE_FETCH_TIMEOUT: 4000,
  MAIN_WORLD_FETCH_TIMEOUT: 2000,
  TRANSCRIPT_FETCH_TIMEOUT: 1200,
  RATE_LIMIT_COOLDOWN_MS: 60000,
  MODE2_DEBOUNCE_MS: 350,
  UI_SIZE_MAP: DEFAULT_SIZE_MAP
};

// ==========================================
// 2. 核心架構實例與單一狀態源 (Single Source of Truth)
// ==========================================
// 唯一會話狀態機 (收斂全域 40+ 個變數)
const session = new SessionState();

// 串流斷句引擎 (Mode 2 滾動隊列狀態機)
const streamingExtractor = new StreamingSentenceExtractor({
  maxSentenceChars: CONFIG.MAX_SENTENCE_CHARS
});

// 安全訊息傳遞包裝器
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

// 請求調度聚合器 (防止在途重複請求與 Request Storm)
const scheduler = new TranslationScheduler({
  sendRuntimeMessage: safeSendMessage
});

// DOM 雙槽雙語字幕渲染器 (100% Trusted Types 合規原地更新)
const renderer = new SubtitleRenderer({
  sizeMap: CONFIG.UI_SIZE_MAP,
  onTrackSuccess: () => {
    trackEvent('subtitle_render_success', {
      target_lang: session.userTargetLang,
      mode: session.sentenceList.length > 0 ? 'mode1_static' : 'mode2_rolling'
    });
  }
});

// 選詞氣泡視窗、懸停控制與語音重播控制器
const tooltipCtrl = new TooltipController({
  getPlayer: getActivePlayer,
  getVideo: getActiveVideo,
  isHoverPauseEnabled: () => session.isHoverPauseEnabled,
  getLanguage: () => session.currentTrack?.languageCode || 'en-US',
  onTranslate: (selectedText, callback) => {
    scheduler.requestTranslation(selectedText, 'auto', session.userTargetLang, (res) => {
      callback(res?.translatedText || null);
    });
  }
});

// 少量 DOM 運行時輔助控制變數 (從 47 個大幅收斂至僅 3 個)
let nativeCaptionObserver = null;
let animationFrameId = null;
let liveTransDebounceTimer = null;

console.log('[YT-Dual-Sub Content] 雙語字幕模組化核心腳本已啟動 (v1.5.0 Modular Architecture)');

// ==========================================
// 3. 遙測與播放器 DOM 工具
// ==========================================
function isShortsPage() {
  if (typeof window === 'undefined' || !window?.location?.href) return false;
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
  if (typeof document === 'undefined') return null;
  return document.querySelector('ytd-reel-video-renderer[is-active] .html5-video-player') ||
         document.querySelector('#shorts-player') ||
         document.querySelector('#movie_player') ||
         document.querySelector('.html5-video-player');
}

function getActiveVideo() {
  if (typeof document === 'undefined') return null;
  const player = getActivePlayer();
  return (player && player.querySelector('video')) ||
         document.querySelector('ytd-reel-video-renderer[is-active] video') ||
         document.querySelector('#shorts-player video') ||
         document.querySelector('video');
}

function getCurrentVideoId() {
  if (typeof window === 'undefined' || !window?.location?.href) return '';
  const url = window.location.href;
  const match = url.match(/[?&]v=([^&#]+)/) || url.match(/\/shorts\/([^/?&#]+)/);
  return match ? match[1] : '';
}

function getSystemDefaultTargetLang() {
  const uiLang = (chrome?.i18n?.getUILanguage?.() || navigator.language || 'en').toLowerCase();
  if (uiLang.startsWith('zh-tw') || uiLang.startsWith('zh-hk')) return 'zh-TW';
  if (uiLang.startsWith('zh')) return 'zh-CN';
  if (uiLang.startsWith('ja')) return 'ja';
  if (uiLang.startsWith('ko')) return 'ko';
  if (uiLang.startsWith('es')) return 'es';
  if (uiLang.startsWith('fr')) return 'fr';
  if (uiLang.startsWith('de')) return 'de';
  if (uiLang.startsWith('ru')) return 'ru';
  return 'zh-TW';
}

// ==========================================
// 4. 設定同步 (Settings Synchronization)
// ==========================================
try {
  if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
    chrome.storage.sync.get(['targetLang', 'extensionEnabled', 'uiSize', 'hoverPause', 'subtitleOffset'], (result) => {
      if (result.targetLang) session.userTargetLang = result.targetLang;
      else session.userTargetLang = getSystemDefaultTargetLang();

      if (result.extensionEnabled !== undefined) session.isExtensionEnabled = !!result.extensionEnabled;
      if (result.uiSize) session.userUiSize = result.uiSize;
      if (result.hoverPause !== undefined) session.isHoverPauseEnabled = !!result.hoverPause;
      if (result.subtitleOffset !== undefined) session.subtitleOffset = Number(result.subtitleOffset) || 0;

      renderer.applySize(session.userUiSize);

      if (!session.isExtensionEnabled) {
        resetSubtitles();
      }
    });
  }
} catch (e) {}

try {
  if (typeof chrome !== 'undefined' && chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace !== 'sync') return;

      if (changes.extensionEnabled !== undefined) {
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
        renderer.resetSignature();
        const video = getActiveVideo();
        if (video) {
          prioritizeCurrentSentence(video.currentTime);
          checkAndTriggerSlidingWindow(video.currentTime);
        }
      }

      if (changes.uiSize) {
        session.userUiSize = changes.uiSize.newValue;
        renderer.applySize(session.userUiSize);
      }

      if (changes.hoverPause !== undefined) {
        session.isHoverPauseEnabled = !!changes.hoverPause.newValue;
      }

      if (changes.subtitleOffset !== undefined) {
        session.subtitleOffset = Number(changes.subtitleOffset.newValue) || 0;
        renderer.resetSignature();
        const video = getActiveVideo();
        if (video) renderCurrentSubtitle(video.currentTime);
      }
    });
  }
} catch (e) {}

// ==========================================
// 5. 介面建立與事件綁定 (UI Mounting & Video Events)
// ==========================================
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

// 60fps 動畫幀同步
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
// 6. 字幕軌道請求與同源傳輸 (Caption Transport)
// ==========================================
if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
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
  if (typeof window !== 'undefined') {
    window.postMessage({ type: WindowMessageType.REQUEST_CURRENT_TRACK }, '*');
  }
}

// Bounded Ready Retry Ladder 握手機制
function requestCurrentTrackWithRetry() {
  requestCurrentTrackFromMainWorld();
  setTimeout(requestCurrentTrackFromMainWorld, 100);
  setTimeout(requestCurrentTrackFromMainWorld, 350);
  setTimeout(requestCurrentTrackFromMainWorld, 800);
}

if (typeof window !== 'undefined') {
  ensureUIElements();
  requestCurrentTrackWithRetry();
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        ensureUIElements();
        requestCurrentTrackWithRetry();
      }, { once: true });
    }
    window.addEventListener('load', () => {
      ensureUIElements();
      requestCurrentTrackWithRetry();
    }, { once: true });
  }
}

async function loadCaptionTrack(track) {
  if (!session.isExtensionEnabled || !session.isCaptionsEnabled) return;
  if (!track || !track.languageCode) return;

  const currentVid = getCurrentVideoId();
  if (track.videoId && currentVid && track.videoId !== currentVid) {
    console.warn('[YT-Dual-Sub] 丟棄過期舊影片軌道廣播:', track.videoId, '!= 當前影片:', currentVid);
    return;
  }
  ensureUIElements();

  const vid = track.videoId || currentVid;
  if (vid && session.lastObservedVideoId && vid !== session.lastObservedVideoId) {
    session.resetVideoNavigation(vid);
  }

  const currentTrackKey = `${track.vssId || track.languageCode}_${vid || currentVid}`;
  if (session.fetch.inFlightKey === currentTrackKey && session.sentenceList.length > 0) return;

  session.currentTrack = track;
  session.fetch.inFlightKey = currentTrackKey;
  session.sentenceList = [];
  renderer.resetSignature();

  const player = getActivePlayer();
  const container = document.getElementById(renderer.containerId);
  renderer.hide(container, player);

  const sessionId = session.nextFetchSessionId();
  console.log('[YT-Dual-Sub] 收到軌道變更:', track.languageCode, 'vid:', vid);
  console.log('[YT-Dual-Sub] Caption session started:', vid, 'sessionId:', sessionId);

  // 核心防禦：立即啟動 Mode 2 作為實時緩衝橋樑 (0 毫秒延遲)
  observeNativePlayerCaptions();

  // 第一主力：Main World Android InnerTube 同源端點 (150ms 極速)
  try {
    const mainWorldText = await fetchCaptionViaMainWorldInnerTube(vid, track.languageCode);
    if (mainWorldText && mainWorldText.trim()) {
      if (!session.isSessionActive(sessionId)) return;
      const data = parseUniversalCaptionText(mainWorldText);
      if (data && data.events && data.events.length > 0) {
        console.log('[YT-Dual-Sub] ✅ 網頁同源 InnerTube 高速字幕下載成功！events 筆數:', data.events.length, '啟動 Mode 1');
        session.fetch.inFlightKey = '';
        stopNativeCaptionObserver();
        parseCues(data, track.languageCode);
        return;
      }
    }
  } catch (err) {
    console.warn('[YT-Dual-Sub] 網頁同源 InnerTube 下載受阻，嘗試次級通道:', err);
  }

  // 第二主力：background.js 特權通道下載 timedtext
  try {
    const rawText = await fetchCaptionTextWithFallback(track);
    if (rawText && rawText.trim()) {
      if (!session.isSessionActive(sessionId)) return;
      const data = parseUniversalCaptionText(rawText);
      if (data && data.events && data.events.length > 0) {
        console.log('[YT-Dual-Sub] ✅ 靜態字幕高速下載成功！events 筆數:', data.events.length, '啟動 Mode 1');
        session.fetch.inFlightKey = '';
        stopNativeCaptionObserver();
        parseCues(data, track.languageCode);
        return;
      }
    }
  } catch (err) {
    console.warn('[YT-Dual-Sub] 第二主力 timedtext 下載受阻，嘗試次級通道:', err);
  }

  // 第三主力：get_transcript 官方逐字稿
  try {
    const transcriptData = await fetchTranscriptViaMainWorld(vid);
    if (transcriptData && transcriptData.events && transcriptData.events.length > 0) {
      if (!session.isSessionActive(sessionId)) return;
      console.log('[YT-Dual-Sub] ✅ 次級備援 get_transcript 成功取得全片逐字稿！events 筆數:', transcriptData.events.length, '升級 Mode 1');
      session.fetch.inFlightKey = '';
      stopNativeCaptionObserver();
      parseCues(transcriptData, track.languageCode);
      return;
    }
  } catch (err) {
    console.warn('[YT-Dual-Sub] 次級備援 get_transcript 失敗:', err);
  }

  console.log('[YT-Dual-Sub] 靜態字幕不可用，啟動 Mode 2 (Gemini / DOM 串流監聽)');
  trackEvent('fallback_mode2_active', { language_code: track.languageCode || 'unknown' });
  observeNativePlayerCaptions();
}

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
    }, CONFIG.INNERTUBE_FETCH_TIMEOUT);

    function onMsg(e) {
      if (e.source !== window || e.data?.type !== WindowMessageType.FETCH_INNERTUBE_CAPTION_RESPONSE) return;
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
      type: WindowMessageType.FETCH_INNERTUBE_CAPTION_REQUEST,
      requestId,
      videoId,
      languageCode
    }, '*');
  });
}

function fetchCaptionViaMainWorld(url) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null);
    const requestId = 'main_world_' + Math.random().toString(36).slice(2) + Date.now();
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        window.removeEventListener('message', onMsg);
        resolve(null);
      }
    }, CONFIG.MAIN_WORLD_FETCH_TIMEOUT);

    function onMsg(e) {
      if (e.source !== window || e.data?.type !== WindowMessageType.FETCH_CAPTION_RESPONSE) return;
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
      type: WindowMessageType.FETCH_CAPTION_REQUEST,
      requestId,
      url
    }, '*');
  });
}

function fetchTranscriptViaMainWorld(videoId) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null);
    const requestId = 'transcript_' + Math.random().toString(36).slice(2) + Date.now();
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        window.removeEventListener('message', onMsg);
        resolve(null);
      }
    }, CONFIG.TRANSCRIPT_FETCH_TIMEOUT);

    function onMsg(e) {
      if (e.source !== window || e.data?.type !== WindowMessageType.FETCH_TRANSCRIPT_RESPONSE) return;
      if (e.data.requestId !== requestId) return;
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        resolve(e.data.success ? e.data.data : null);
      }
    }

    window.addEventListener('message', onMsg);
    window.postMessage({
      type: WindowMessageType.FETCH_TRANSCRIPT_REQUEST,
      requestId,
      videoId
    }, '*');
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
    { fmt: 'json3', url: baseUrl.includes('fmt=') ? baseUrl.replace(/fmt=[^&]+/, 'fmt=json3') : baseUrl + '&fmt=json3' },
    { fmt: 'vtt',   url: baseUrl.includes('fmt=') ? baseUrl.replace(/fmt=[^&]+/, 'fmt=vtt') : baseUrl + '&fmt=vtt' },
    { fmt: 'raw',   url: baseUrl.replace(/&fmt=[^&]+/, '') }
  ];

  for (const f of formats) {
    try {
      const mainWorldText = await fetchCaptionViaMainWorld(f.url);
      if (mainWorldText && mainWorldText.trim()) return mainWorldText;
    } catch (e) {}

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
    } catch (e) {}
  }
  return null;
}

function handleVideoChange(vid) {
  if (!vid || vid === session.lastObservedVideoId) return;
  console.log('[YT-Dual-Sub] 檢測到影片跨片切換:', session.lastObservedVideoId, '->', vid);
  cleanupRuntimeUI();
  session.resetVideoNavigation(vid);
  const detectEventName = isShortsPage() ? 'youtube_shorts_detected' : 'youtube_video_detected';
  trackEvent(detectEventName);
  ensureUIElements();
  requestCurrentTrackFromMainWorld();
}

// URL SPA 換片監聽器
if (typeof window !== 'undefined') {
  setInterval(() => {
    const vid = getCurrentVideoId();
    if (vid && session.lastObservedVideoId && vid !== session.lastObservedVideoId) {
      handleVideoChange(vid);
    } else if (vid && !session.lastObservedVideoId) {
      session.lastObservedVideoId = vid;
      trackEvent(isShortsPage() ? 'youtube_shorts_detected' : 'youtube_video_detected');
    }
  }, 500);

  window.addEventListener('yt-navigate-start', () => {
    const vid = getCurrentVideoId();
    if (vid && session.lastObservedVideoId && vid !== session.lastObservedVideoId) {
      handleVideoChange(vid);
    }
  });

  window.addEventListener('yt-navigate-finish', () => {
    const vid = getCurrentVideoId();
    if (vid && session.lastObservedVideoId && vid !== session.lastObservedVideoId) {
      handleVideoChange(vid);
    }
  });
}

// ==========================================
// 7. Mode 1 智慧合句引擎 (Smart Sentence Merging)
// ==========================================
function parseCues(captionJson, sourceLang) {
  if (!captionJson || !captionJson.events) return;

  const rawSegments = [];
  for (const e of captionJson.events) {
    if (!e.segs || e.segs.length === 0) continue;
    let text = e.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ');
    text = cleanSubtitleNoise(text);
    if (!text) continue;

    const start = (e.tStartMs || 0) / 1000;
    const duration = (e.dDurationMs !== undefined && e.dDurationMs !== null) ? (e.dDurationMs / 1000) : 2.0;
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

  // 統計標點密度
  let totalSegments = rawSegments.length;
  let punctSegments = 0;
  for (const seg of rawSegments) {
    if (CONFIG.SENTENCE_END_REGEX.test(seg.text.trim())) punctSegments++;
  }
  const punctRatio = punctSegments / Math.max(1, totalSegments);
  const isSparsePunctuation = punctRatio < 0.20;

  const sentences = [];
  let currentGroup = [];

  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];
    currentGroup.push(seg);

    const currentText = currentGroup.map(s => s.text).join(' ').trim();
    const currentDuration = seg.end - currentGroup[0].start;
    const nextSeg = rawSegments[i + 1];
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
      const lastWord = words[words.length - 1]?.toLowerCase() || '';
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

    if (i === rawSegments.length - 1) {
      shouldSplit = true;
    }

    if (shouldSplit && currentGroup.length > 0) {
      sentences.push({
        start: currentGroup[0].start,
        end: currentGroup[currentGroup.length - 1].end,
        origText: currentGroup.map(s => s.text).join(' ').trim(),
        transText: '',
        status: 'idle',
        subCues: currentGroup.map(s => ({ start: s.start, end: s.end, text: s.text })),
        sourceLang: sourceLang || 'auto'
      });
      currentGroup = [];
    }
  }

  // 短句向後合流
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
  if (typeof window !== 'undefined') window.__ytDualSub_sentenceList = mergedSentences;
  console.log(`[YT-Dual-Sub] Mode 1 合句完成，總共句數: ${session.sentenceList.length} 首句: ${session.sentenceList[0]?.origText?.slice(0, 35)}...`);

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

// ==========================================
// 8. 雙軌時間映射 (Dual-Track Time Mapping)
// ==========================================
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
    let streamingText = '';
    let currentSubCue = null;

    if (activeSentence.subCues && activeSentence.subCues.length > 0) {
      for (const cue of activeSentence.subCues) {
        if (adjustedTime >= cue.start) {
          streamingText += (streamingText ? ' ' : '') + cue.text;
          currentSubCue = cue;
        }
      }
    }
    if (!streamingText) streamingText = activeSentence.origText;

    const prevSentence = activeSentenceIndex > 0 ? session.sentenceList[activeSentenceIndex - 1] : null;
    return {
      type: 'active',
      streamingOrigText: streamingText,
      fullOrigText: activeSentence.origText,
      transText: activeSentence.transText,
      currentSentence: activeSentence,
      prevSentence: prevSentence,
      currentSubCue: currentSubCue,
      sentenceIndex: activeSentenceIndex
    };
  } else {
    // 停頓期間：尋找最近 5.0 秒內剛完結的句子
    let lastFinishedSentence = null;
    let lastFinishedIndex = -1;
    for (let i = session.sentenceList.length - 1; i >= 0; i--) {
      const s = session.sentenceList[i];
      if (adjustedTime > s.end && (adjustedTime - s.end) <= 5.0) {
        lastFinishedSentence = s;
        lastFinishedIndex = i;
        break;
      }
    }

    if (!lastFinishedSentence) return null;

    const prevOfFinished = lastFinishedIndex > 0 ? session.sentenceList[lastFinishedIndex - 1] : null;
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
  const container = document.getElementById(renderer.containerId);

  if (!session.isExtensionEnabled || !session.isCaptionsEnabled) {
    renderer.hide(container, player);
    return;
  }

  // 廣告狀態避讓
  if (player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))) {
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
    trans: active.prevSentence.transText || ''
  } : { orig: '', trans: '' };

  const currSlotData = active.currentSentence ? {
    orig: active.currentSentence.origText,
    trans: active.transText || active.currentSentence.transText || ''
  } : { orig: '', trans: '' };

  renderer.render(container, prevSlotData, currSlotData, {
    isExtensionEnabled: session.isExtensionEnabled,
    isCaptionsEnabled: session.isCaptionsEnabled,
    player
  });
}

// ==========================================
// 9. 滑動窗口整句批次翻譯 (Sliding Window Scheduling)
// ==========================================
function prioritizeCurrentSentence(currentTime) {
  if (session.sentenceList.length === 0) return;
  const adjustedTime = currentTime + session.subtitleOffset;
  const target = session.sentenceList.find(s => adjustedTime >= s.start && adjustedTime <= s.end) || session.sentenceList[0];

  if (target && target.status === 'idle') {
    target.status = 'loading';
    scheduler.requestTranslation(target.origText, target.sourceLang || 'auto', session.userTargetLang, (res) => {
      if (res?.translatedText) {
        target.transText = res.translatedText;
        target.status = 'done';
        renderer.resetSignature();
        const video = getActiveVideo();
        if (video) renderCurrentSubtitle(video.currentTime);
      } else {
        target.status = 'idle';
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
    if (s.start >= (adjustedTime - 3) && s.status === 'idle') {
      pendingSentences.push(s);
      if (pendingSentences.length >= CONFIG.BATCH_TRANSLATE_LIMIT) break;
    }
  }

  if (pendingSentences.length === 0) return;

  pendingSentences.forEach(s => s.status = 'loading');
  const combinedText = pendingSentences.map(s => s.origText).join('\n');
  const sourceLang = pendingSentences[0].sourceLang || 'auto';

  scheduler.requestTranslation(combinedText, sourceLang, session.userTargetLang, (res) => {
    if (res?.translatedText) {
      session.consecutiveTranslateErrors = 0;
      const lines = res.translatedText.split('\n');

      if (lines.length === pendingSentences.length) {
        pendingSentences.forEach((s, idx) => {
          s.transText = lines[idx] || s.origText;
          s.status = 'done';
        });
      } else {
        // 行數不匹配時降級獨立聚合重試
        pendingSentences.forEach(s => {
          scheduler.requestTranslation(s.origText, sourceLang, session.userTargetLang, (singleRes) => {
            s.transText = singleRes?.translatedText || s.origText;
            s.status = 'done';
          });
        });
      }

      renderer.resetSignature();
      const video = getActiveVideo();
      if (video) renderCurrentSubtitle(video.currentTime);
    } else {
      session.consecutiveTranslateErrors++;
      if (session.consecutiveTranslateErrors >= 2) {
        tooltipCtrl.showWarningToast('⚠️ 翻譯服務暫時受限 (429/網路異常)，已自動保留原文字幕，稍後將自動重試');
        if (!session.telemetry.hasTrackedTranslateError) {
          session.telemetry.hasTrackedTranslateError = true;
          trackEvent('fail_translate_error', { target_lang: session.userTargetLang });
        }
      }

      pendingSentences.forEach(s => {
        s.status = 'error';
        s.transText = '⚠️ 翻譯暫時受限 (稍後重試)';
      });

      setTimeout(() => {
        pendingSentences.forEach(s => {
          if (s.status === 'error') s.status = 'idle';
        });
      }, 4000);

      renderer.resetSignature();
      const video = getActiveVideo();
      if (video) renderCurrentSubtitle(video.currentTime);
    }
  });
}

// ==========================================
// 10. 字幕選詞與 Tooltip 互動
// ==========================================
function bindSubtitleSelectionEvents(container) {
  if (!container) return;
  container.removeEventListener('mouseup', handleSubtitleMouseUp);
  container.addEventListener('mouseup', handleSubtitleMouseUp);
}

function handleSubtitleMouseUp(e) {
  if (!session.isExtensionEnabled) return;
  e.stopPropagation();

  const selection = window.getSelection();
  const selectedText = selection ? selection.toString().trim() : '';
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

  if (snippetStart === undefined || snippetEnd === undefined) {
    if (session.prevSlotTimeRange.end > session.prevSlotTimeRange.start) {
      snippetStart = session.prevSlotTimeRange.start;
      snippetEnd = session.prevSlotTimeRange.end;
    } else {
      snippetStart = Math.max(0, currentTime - 2.5);
      snippetEnd = currentTime + 0.5;
    }
  }

  const msgTranslating = chrome?.i18n?.getMessage('tooltipTranslating') || '翻譯中...';
  const msgPlaySnippet = chrome?.i18n?.getMessage('tooltipPlaySnippet') || '🎬 聽原聲';
  const msgSpeak = chrome?.i18n?.getMessage('tooltipSpeak') || '🗣️ 朗讀';

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

// ==========================================
// 11. 鍵盤熱鍵 (Keyboard Controls)
// ==========================================
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (!session.isExtensionEnabled) return;
    if (isUserTyping(e.target)) return;

    const key = e.key.toLowerCase();
    const video = getActiveVideo();
    if (!video) return;

    if (key === 'r') {
      e.preventDefault();
      const active = getActiveCue(video.currentTime);
      if (active?.currentSentence) {
        tooltipCtrl.playSnippet(active.currentSentence.start, active.currentSentence.end);
      } else if (session.prevSlotTimeRange.end > session.prevSlotTimeRange.start) {
        tooltipCtrl.playSnippet(session.prevSlotTimeRange.start, session.prevSlotTimeRange.end);
      } else {
        tooltipCtrl.playSnippet(Math.max(0, video.currentTime - 3.0), video.currentTime);
      }
    } else if (key === 'a' && session.sentenceList.length > 0) {
      e.preventDefault();
      jumpToSentence(-1);
    } else if (key === 'd' && session.sentenceList.length > 0) {
      e.preventDefault();
      jumpToSentence(1);
    }
  });
}

function isUserTyping(el) {
  if (!el) return false;
  const tagName = el.tagName?.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || el.isContentEditable || el.getAttribute?.('role') === 'textbox';
}

function jumpToSentence(direction) {
  const video = getActiveVideo();
  if (!video || session.sentenceList.length === 0) return;

  tooltipCtrl.clearSnippetTimer();
  const currentTime = video.currentTime + session.subtitleOffset;

  let targetIndex = -1;
  for (let i = 0; i < session.sentenceList.length; i++) {
    const s = session.sentenceList[i];
    if (currentTime >= s.start && currentTime <= s.end) {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex === -1) {
    for (let i = 0; i < session.sentenceList.length; i++) {
      if (session.sentenceList[i].start > currentTime) {
        targetIndex = direction > 0 ? i : Math.max(0, i - 1);
        break;
      }
    }
    if (targetIndex === -1) targetIndex = session.sentenceList.length - 1;
  } else {
    targetIndex += direction;
  }

  targetIndex = Math.max(0, Math.min(targetIndex, session.sentenceList.length - 1));
  const targetSentence = session.sentenceList[targetIndex];

  if (targetSentence) {
    video.currentTime = Math.max(0, targetSentence.start - 0.05);
    renderCurrentSubtitle(video.currentTime);
  }
}

// 點擊空白處關閉選詞彈窗
if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', (e) => {
    const tooltip = document.getElementById(tooltipCtrl.tooltipId);
    const container = document.getElementById(renderer.containerId);
    if (tooltip && !tooltip.contains(e.target) && !container?.contains(e.target)) {
      tooltipCtrl.hideTooltip();
    }
  });
}

// ==========================================
// 12. Mode 2 即時串流斷句與雙槽滾動 (Mode 2 Rolling ASR)
// ==========================================
function observeNativePlayerCaptions() {
  if (typeof MutationObserver === 'undefined') return;
  const player = getActivePlayer();
  if (!player || nativeCaptionObserver) return;

  ensureUIElements();

  const handleCaptionMutation = () => {
    if (!session.isExtensionEnabled || !session.isCaptionsEnabled) return;
    if (session.sentenceList.length > 0) return; // Mode 1 優先原則

    const segmentNodes = player.querySelectorAll('.ytp-caption-segment');
    if (!segmentNodes || segmentNodes.length === 0) return;

    const textParts = [];
    segmentNodes.forEach(node => {
      const t = (node.textContent || '').trim();
      if (t) textParts.push(t);
    });

    if (textParts.length === 0) return;

    const liveWindowText = cleanSubtitleNoise(textParts.join(' ').replace(/\s+/g, ' ').trim());
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
      const sentenceStartTime = session.currentSentenceStartTime > 0 ? session.currentSentenceStartTime : Math.max(0, sentenceEndTime - 3.0);
      session.prevSlotTimeRange = { start: sentenceStartTime, end: sentenceEndTime };
      session.currentSentenceStartTime = 0;

      session.prevSlot = {
        orig: completedSentence,
        trans: scheduler.cache.get(`${session.currentTrack?.languageCode || 'auto'}->${session.userTargetLang}:${completedSentence}`) || ''
      };
      session.currSlot = {
        orig: result.inProgress || '',
        trans: ''
      };
      session.lastFinishedSentence = completedSentence;

      renderer.render(container, session.prevSlot, session.currSlot, {
        isExtensionEnabled: session.isExtensionEnabled,
        isCaptionsEnabled: session.isCaptionsEnabled,
        player
      });

      const srcLang = session.currentTrack?.languageCode || 'auto';
      scheduler.requestTranslation(completedSentence, srcLang, session.userTargetLang, (res) => {
        const transText = res?.translatedText?.trim() || '';
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
          trans: session.lastFinishedTrans || scheduler.cache.get(`${session.currentTrack?.languageCode || 'auto'}->${session.userTargetLang}:${session.lastFinishedSentence}`) || ''
        };
        session.lastFinishedSentence = '';
        session.lastFinishedTrans = '';
      }

      const liveText = result.inProgress;
      const cacheKey = `${session.currentTrack?.languageCode || 'auto'}->${session.userTargetLang}:${liveText}`;
      const cachedLiveTrans = scheduler.cache.get(cacheKey) || '';
      const isExtendingCurrent = session.currSlot.orig && liveText.startsWith(session.currSlot.orig.slice(0, Math.min(10, session.currSlot.orig.length)));
      const preservedTrans = cachedLiveTrans || (isExtendingCurrent ? session.currSlot.trans : '');

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
    const srcLang = session.currentTrack?.languageCode || 'auto';
    scheduler.requestLiveTranslation(text, srcLang, session.userTargetLang, (res) => {
      const transText = res?.translatedText?.trim() || '';
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

// 供 Node.js 測試或外部調試匯出
if (typeof module !== 'undefined' && module.exports) {
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
    debouncedTranslateLiveProgress
  };
}
