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
  BATCH_TRANSLATE_LIMIT: 10,  // 批次翻譯單次最大句數
  LONG_PAUSE_SECONDS: 0.65,   // 斷句判定長停頓閾值 (秒)
  CAPITAL_PAUSE_SECONDS: 0.3, // 大寫首字母斷句停頓閾值 (秒)
  MAX_SENTENCE_CHARS: 120,    // 句子字元長度上限
  MAX_SENTENCE_DURATION: 8.0, // 句子持續時長上限 (秒)
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
          return;
        }
        if (callback) callback(res);
      });
    }
  } catch (e) {
    // 擴充功能已被重新整理或上下文失效，靜默略過
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

let lastRenderedSignature = '';
let lastWindowCheckTime = 0;
let currentFetchSessionId = 0;
let animationFrameId = null;
let lastObservedVideoId = '';

let wasPlayingBeforeHover = false;
let isHoveringSubtitleOrTooltip = false;
let hoverResumeTimer = null;
let snippetPauseTimer = null;

// ==========================================
// 2. Storage 設定讀取與動態更新
// ==========================================
try {
  if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
    chrome.storage.sync.get({
      extensionEnabled: true,
      targetLang: 'zh-TW',
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
        const video = getActiveVideo();
        if (video) checkAndTriggerSlidingWindow(video.currentTime);
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
         document.body;
}

function getActiveVideo() {
  return document.querySelector('ytd-reel-video-renderer[is-active] video') ||
         document.querySelector('#shorts-player video') ||
         document.querySelector('video');
}

function getCurrentVideoId() {
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
    container.innerHTML = '';
  }
  const tooltip = document.getElementById('yt-translate-tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

function ensureUIElements() {
  const player = getActivePlayer();

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
    if (container) container.style.display = 'none';
    return;
  }

  // 同影片、同網址、同目標語言快取命中檢查 (支援靜態字幕與串流即時監聽)
  if (currentTrack &&
      currentTrack.videoId === track.videoId &&
      currentTrack.baseUrl === track.baseUrl &&
      currentTrack.targetTlang === track.targetTlang &&
      (sentenceList.length > 0 || nativeCaptionObserver !== null)) {
    isCaptionsEnabled = true;
    return;
  }

  isCaptionsEnabled = true;
  currentTrack = track;
  sentenceList = [];
  lastRenderedSignature = '';

  const sessionId = ++currentFetchSessionId;

  try {
    const rawText = await fetchCaptionTextWithFallback(track);
    if (!rawText || !rawText.trim()) {
      // 該影片在 YouTube 官方端為串流音軌 (如 variant=gemini)，直接從 YouTube 播放器 DOM 提取字幕並即時雙語翻譯
      stopSyncLoop();
      observeNativePlayerCaptions();
      return;
    }

    if (sessionId !== currentFetchSessionId) return;

    const data = parseUniversalCaptionText(rawText);
    if (data && data.events && data.events.length > 0) {
      stopNativeCaptionObserver();
      disableLiveSpeechRecognition();
      parseCues(data, track.languageCode);
    } else {
      stopSyncLoop();
      observeNativePlayerCaptions();
    }
  } catch (err) {
    stopSyncLoop();
    observeNativePlayerCaptions();
  }
});

// 多候選 URL 自動適配下載器 (JSON3 -> 原生 Raw XML -> WebVTT 梯次重試)
async function fetchCaptionTextWithFallback(track) {
  let baseUrl = track.baseUrl;
  if (track.targetTlang && !baseUrl.includes('&tlang=') && !baseUrl.includes('?tlang=')) {
    baseUrl += `&tlang=${encodeURIComponent(track.targetTlang)}`;
  }

  const urlsToTry = [];

  // 優先嘗試 1: 標準 JSON3 格式
  let json3Url = baseUrl;
  if (/[?&]fmt=/.test(json3Url)) {
    json3Url = json3Url.replace(/([?&])fmt=[^&]*/, '$1fmt=json3');
  } else {
    json3Url += (json3Url.includes('?') ? '&' : '?') + 'fmt=json3';
  }
  urlsToTry.push(json3Url);

  // 降級嘗試 2: YouTube 原生未修改 URL (原汁原味 XML/SRV，解決 fmt=json3 回傳 0 位元組問題)
  if (baseUrl !== json3Url) {
    urlsToTry.push(baseUrl);
  }

  // 降級嘗試 3: WebVTT 格式 (fmt=vtt)
  let vttUrl = baseUrl;
  if (/[?&]fmt=/.test(vttUrl)) {
    vttUrl = vttUrl.replace(/([?&])fmt=[^&]*/, '$1fmt=vtt');
  } else {
    vttUrl += (vttUrl.includes('?') ? '&' : '?') + 'fmt=vtt';
  }
  urlsToTry.push(vttUrl);

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.trim().length > 0) {
        return text;
      }
    } catch (e) {}
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
function parseXmlCaptions(xmlString) {
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
  return null;
}

// WebVTT 格式字幕解析器 (支援 00:01.000 --> 00:04.000 格式)
function parseVttCaptions(vttString) {
  if (!vttString.includes('WEBVTT') && !vttString.includes('-->')) return null;

  const events = [];
  const timeRegex = /(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/;
  const blocks = vttString.split(/\r?\n\r?\n/);

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

    const dDurationMs = Math.max(200, endTotalMs - tStartMs);
    const textLines = lines.slice(timeLineIdx + 1).join(' ').replace(/<[^>]+>/g, '').trim();

    if (textLines) {
      events.push({
        tStartMs,
        dDurationMs,
        segs: [{ utf8: textLines }]
      });
    }
  }

  return events.length > 0 ? { events } : null;
}

// URL 變更兜底防護
setInterval(() => {
  const vid = getCurrentVideoId();
  if (vid && vid !== lastObservedVideoId) {
    lastObservedVideoId = vid;
    resetSubtitles();
    ensureUIElements();
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

  const sentenceEndRegex = /[.?!。？！]["'”’)]*$/;
  const sentenceStartRegex = /^[A-Z0-9]/;

  for (let i = 1; i < normalizedSegments.length; i++) {
    const prev = normalizedSegments[i - 1];
    const curr = normalizedSegments[i];

    const isPrevEndedByPunctuation = sentenceEndRegex.test(prev.text);
    const isCurrentGroupEnded = sentenceEndRegex.test(currentGroup.origText.trim());
    const isLongPause = (curr.start - prev.end) >= CONFIG.LONG_PAUSE_SECONDS;
    const isCapitalizedAfterPause = sentenceStartRegex.test(curr.text) && (curr.start - prev.end) >= CONFIG.CAPITAL_PAUSE_SECONDS && !prev.text.endsWith(',');
    const isTooLong = currentGroup.origText.length > CONFIG.MAX_SENTENCE_CHARS || (prev.end - currentGroup.cues[0].start) > CONFIG.MAX_SENTENCE_DURATION;

    if (isPrevEndedByPunctuation || isCurrentGroupEnded || isLongPause || isCapitalizedAfterPause || isTooLong) {
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

  sentenceList = sentences;

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

  if (!activeSentence) return null;

  let activeSubCue = null;
  for (let j = activeSentence.cues.length - 1; j >= 0; j--) {
    const c = activeSentence.cues[j];
    if (adjustedTime >= c.start) {
      activeSubCue = c;
      break;
    }
  }

  if (!activeSubCue) {
    activeSubCue = activeSentence.cues[0];
  }

  return {
    origText: activeSubCue.origText,
    fullOrigText: activeSentence.origText,
    transText: activeSentence.transText,
    currentSentence: activeSentence,
    currentSubCue: activeSubCue,
    sentenceIndex: activeSentenceIndex
  };
}

function onTimeUpdate() {
  const player = getActivePlayer();
  const container = document.getElementById('yt-dual-subtitle-container');

  if (!isExtensionEnabled) {
    if (container) container.style.display = 'none';
    lastRenderedSignature = '';
    return;
  }

  // 廣告狀態避讓
  if (player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))) {
    if (container) container.style.display = 'none';
    lastRenderedSignature = '';
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
    }
    return;
  }

  const currentSignature = `${active.origText}__${active.transText}`;
  if (lastRenderedSignature === currentSignature) return;

  lastRenderedSignature = currentSignature;
  container.innerHTML = `
    <div class="cue-orig">${escapeHtml(active.origText)}</div>
    <div class="cue-trans">${escapeHtml(active.transText || '翻譯中...')}</div>
  `;
  container.style.display = 'flex';
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

  const snippetStart = active?.currentSubCue?.start ?? active?.currentSentence?.start ?? (currentTime - 0.5);
  const snippetEnd = active?.currentSubCue?.end ?? active?.currentSentence?.end ?? (currentTime + 2.0);

  tooltip.innerHTML = `
    <button class="tooltip-close-btn" id="tooltipCloseBtn">✕</button>
    <div class="tooltip-header">${escapeHtml(selectedText)}</div>
    <hr/>
    <div class="tooltip-body" id="tooltipTransBody">翻譯中...</div>
    <div class="tooltip-actions">
      <button class="tooltip-btn" id="btnPlaySnippet">🎬 聽原聲</button>
      <button class="tooltip-btn" id="btnSpeakWord">🗣️ 朗讀</button>
    </div>
  `;
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
  if (sentenceList.length === 0) return;

  const key = e.key.toLowerCase();
  const video = getActiveVideo();
  if (!video) return;

  if (key === 'r') {
    e.preventDefault();
    const active = getActiveCue(video.currentTime);
    if (active?.currentSentence) {
      playVideoSnippet(active.currentSentence.start, active.currentSentence.end);
    }
  } else if (key === 'a') {
    e.preventDefault();
    jumpToSentence(-1);
  } else if (key === 'd') {
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
let nativeTranslateDebounceTimer = null;

let speechTokenQueue = [];
let prevSlot = { orig: '', trans: '' }; // 上槽 (Slot 1)
let currSlotOrig = ''; // 下槽 (Slot 2) 當前實時單膠囊文字
let lastLockedCompletedSentence = ''; // 同步即時鎖定已完結句子
let completedSentenceHistory = []; // 持久化歷史完結長句庫 (徹底免疫任何中段殘留或單字殘留切片)
let lastRawObservedWindowText = '';

function isPartOfCompletedHistory(phrase) {
  const clean = phrase.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return false;
  const cleanWords = clean.split(/\s+/);

  const targets = [lastLockedCompletedSentence, ...completedSentenceHistory].filter(Boolean);
  return targets.some(h => {
    const hWords = h.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim().split(/\s+/);
    if (hWords.length < cleanWords.length) return false;

    // 1~2 個單字必須精準是上一句的「末尾後綴 (Tail)」才算殘留尾巴 (避免誤殺新句子中的 "and", "that", "I" 等常用詞)
    if (cleanWords.length < 3) {
      return hWords.slice(-cleanWords.length).join(' ') === clean;
    }

    // 3 個詞以上才進行全句連續子片段比對
    for (let i = 0; i <= hWords.length - cleanWords.length; i++) {
      if (hWords.slice(i, i + cleanWords.length).join(' ') === clean) {
        return true;
      }
    }
    return false;
  });
}

function cleanQueueOfCompletedHistory() {
  while (speechTokenQueue.length > 0) {
    const fullText = speechTokenQueue.join(' ');
    const match = fullText.match(/^([\s\S]+?[.!?。！？]+)(?:\s+([\s\S]*))?$/);
    if (match) {
      const completed = match[1].trim();
      const remainder = (match[2] || '').trim();
      if (isPartOfCompletedHistory(completed)) {
        speechTokenQueue = remainder ? remainder.split(/\s+/).filter(Boolean) : [];
        continue;
      }
    }
    break;
  }
}

function ingestAndExtractSentence(windowText) {
  let words = windowText.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  // 1. 若 incoming words 開頭屬於任何已完結歷史句子（包含整句或中段切片），精準將歷史句子的所有單字從開頭全部剝除！
  let strippedCount = 0;
  for (let s = Math.min(words.length, 30); s > 0; s--) {
    const candidate = words.slice(0, s).join(' ');
    if (isPartOfCompletedHistory(candidate)) {
      strippedCount = s;
      break;
    }
  }
  if (strippedCount > 0) {
    words = words.slice(strippedCount);
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
      // 若無重疊且不匹配，直接替換隊列為新詞，絕不重複追加！
      speechTokenQueue = [...words];
    }
  }

  // 3. 檢查隊列中是否包含句末標點符號 (. ! ? 。 ！ ？)
  const fullText = speechTokenQueue.join(' ');
  const match = fullText.match(/^([\s\S]+?[.!?。！？]+)(?:\s+([\s\S]*))?$/);
  if (match) {
    const completed = match[1].trim();
    const remainder = (match[2] || '').trim();

    if (!isPartOfCompletedHistory(completed)) {
      speechTokenQueue = remainder ? remainder.split(/\s+/).filter(Boolean) : [];
      return { completed, inProgress: remainder };
    } else {
      // 若隊列開頭是已在歷史中的完結句，立即從隊列中清除，避免後續累積重複
      speechTokenQueue = remainder ? remainder.split(/\s+/).filter(Boolean) : [];
      return { completed: null, inProgress: remainder };
    }
  }

  return { completed: null, inProgress: fullText };
}

const translationCache = new Map();

function observeNativePlayerCaptions() {
  if (nativeCaptionObserver) return; // 已經在監聽中，絕不重複重置或清空 Slot 1！

  const player = getActivePlayer();
  if (!player) return;

  ensureUIElements();
  stopSyncLoop(); // 避免與 60fps 幀循環競爭

  const handleCaptionMutation = (mutationsList) => {
    if (!isExtensionEnabled) return;

    // 嚴格過濾：若變更來自我們自己的雙語字幕容器或 Tooltip，直接忽略 (防止無窮遞迴與 CPU 飆高)
    if (mutationsList && mutationsList.length > 0) {
      let isOurContainerMutation = true;
      for (const m of mutationsList) {
        const target = m.target;
        if (!target.closest || (!target.closest('#yt-dual-subtitle-container') && !target.closest('#yt-translate-tooltip'))) {
          isOurContainerMutation = false;
          break;
        }
      }
      if (isOurContainerMutation) return;
    }

    const captionWindow = player.querySelector('.ytp-caption-window-bottom, .caption-window');
    if (!captionWindow) return;

    // 讀取原生字幕視窗文字
    const segments = captionWindow.querySelectorAll('.ytp-caption-segment');
    const liveWindowText = cleanSubtitleNoise(Array.from(segments).map(s => s.textContent || '').join(' ').replace(/\s+/g, ' ').trim());

    if (!liveWindowText) {
      // 若遇到說話者停頓/靜音，下槽清空，但上槽 (Slot 1) 歷史完結句必須永久保留！
      if (prevSlot.orig) {
        currSlotOrig = '';
        renderDualSlotSubtitle(prevSlot, currSlotOrig);
      } else if (sentenceList.length === 0) {
        const container = document.getElementById('yt-dual-subtitle-container');
        if (container) container.style.display = 'none';
      }
      return;
    }

    if (liveWindowText === lastRawObservedWindowText) return;
    lastRawObservedWindowText = liveWindowText;

    const result = ingestAndExtractSentence(liveWindowText);
    if (!result) return;

    if (result.completed) {
      const completedSentence = result.completed;
      const inProgress = result.inProgress;

      // 零延遲同步鎖定已完結句子，並納入歷史庫
      lastLockedCompletedSentence = completedSentence;
      if (!completedSentenceHistory.includes(completedSentence)) {
        completedSentenceHistory.push(completedSentence);
        if (completedSentenceHistory.length > 10) completedSentenceHistory.shift();
      }

      // 句號完結瞬間：立即同步推升為 上槽 (Slot 1)，若快取已有譯文立即賦予，下槽 (Slot 2) 展開新句子
      prevSlot = {
        orig: completedSentence,
        trans: translationCache.get(completedSentence) || ''
      };
      currSlotOrig = inProgress;
      renderDualSlotSubtitle(prevSlot, currSlotOrig);

      const srcLang = currentTrack?.languageCode || 'auto';
      safeSendMessage({
        action: 'translate',
        text: completedSentence,
        sourceLang: srcLang,
        targetLang: userTargetLang
      }, (res) => {
        if (res?.translatedText) {
          translationCache.set(completedSentence, res.translatedText);
          if (prevSlot.orig === completedSentence) {
            prevSlot.trans = res.translatedText;
            renderDualSlotSubtitle(prevSlot, currSlotOrig);
          }
        }
      });
    } else {
      // 尚無標點符號：下槽 (Slot 2) 在同一個膠囊內實時逐字吐字延伸，上槽 (Slot 1) 始終穩固保持
      currSlotOrig = result.inProgress;
      renderDualSlotSubtitle(prevSlot, currSlotOrig);
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

function stopNativeCaptionObserver() {
  if (nativeCaptionObserver) {
    nativeCaptionObserver.disconnect();
    nativeCaptionObserver = null;
  }
  clearTimeout(nativeTranslateDebounceTimer);
  lastRenderedRollingSig = '';
  speechTokenQueue = [];
  prevSlot = { orig: '', trans: '' };
  currSlotOrig = '';
  lastLockedCompletedSentence = '';
  lastRawObservedWindowText = '';
}

function renderDualSlotSubtitle(prev, currOrig) {
  if (!isExtensionEnabled) return;
  const container = document.getElementById('yt-dual-subtitle-container');
  if (!container) return;

  // 最後物理防禦：若下槽 (Slot 2) 開頭包含上槽 (Slot 1) 的歷史完結句，直接在渲染層乾淨剝除
  let displayCurrOrig = currOrig || '';
  if (prev.orig && displayCurrOrig) {
    const prevClean = prev.orig.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const currClean = displayCurrOrig.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    if (currClean.startsWith(prevClean)) {
      const prevWordCount = prev.orig.trim().split(/\s+/).length;
      const currWords = displayCurrOrig.trim().split(/\s+/);
      displayCurrOrig = currWords.slice(prevWordCount).join(' ').trim();
    }
  }

  const currentSig = `${prev.orig}@@${prev.trans}@@${displayCurrOrig}`;
  if (currentSig === lastRenderedRollingSig) return;
  lastRenderedRollingSig = currentSig;

  let html = '';

  // 上槽 (Slot 1)：上一句歷史完結句 (英 + 中，0.65 半透明膠囊背景，層次分明)
  if (prev.orig) {
    html += `
      <div class="cue-slot cue-slot-prev">
        <div class="cue-slot-orig">${escapeHtml(prev.orig)}</div>
        ${prev.trans ? `<div class="cue-slot-trans">${escapeHtml(prev.trans)}</div>` : ''}
      </div>
    `;
  }

  // 下槽 (Slot 2)：當前正在講的句子 (英文字幕在同一個膠囊內實時吐字延伸，未遇到句末標點符號前絕不跳槽折行)
  if (displayCurrOrig) {
    html += `
      <div class="cue-slot cue-slot-curr">
        <div class="cue-slot-orig">${escapeHtml(displayCurrOrig)}</div>
      </div>
    `;
  }

  if (!html) {
    container.style.display = 'none';
    return;
  }

  container.innerHTML = html;
  container.style.display = 'flex';
}
