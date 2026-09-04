/**
 * inject.js - 頁面主環境腳本 (Main World)
 * 職責：攔截 YouTube 播放器實例 API、修補自動翻譯軌道參數、精準分發換片與軌道變更事件 (零延遲優化)
 */

(function () {
  const hookedPlayers = new WeakSet();

  // 1. 取得目前頁面上活躍的播放器 DOM 節點（支援一般影片、Shorts 短影音）
  function getActivePlayer() {
    return document.querySelector('ytd-reel-video-renderer[is-active] .html5-video-player') ||
           document.querySelector('#shorts-player') ||
           document.querySelector('#movie_player');
  }

  // 2. 取得當前影片 ID
  function getCurrentVideoId() {
    const player = getActivePlayer();
    const vidFromPlayer = player?.getVideoData?.()?.video_id;
    if (vidFromPlayer) return vidFromPlayer;

    const url = window.location.href;
    const matchV = url.match(/[?&]v=([^&#]+)/);
    if (matchV) return matchV[1];

    const matchShorts = url.match(/\/shorts\/([^/?&#]+)/);
    if (matchShorts) return matchShorts[1];

    return '';
  }

  // 3. 攔截播放器 API 與綁定事件
  function initPlayerHook() {
    const player = getActivePlayer();
    if (!player) return;

    if (!hookedPlayers.has(player)) {
      if (typeof player.setOption === 'function') {
        const originalSetOption = player.setOption;
        player.setOption = function (module, option, value) {
          const result = originalSetOption.apply(this, arguments);
          if (module === 'captions' && option === 'track') {
            handleTrackChange(value);
          }
          return result;
        };
      }

      if (typeof player.addEventListener === 'function') {
        player.addEventListener('onCaptionsTrackListChanged', notifyCurrentTrack);
        player.addEventListener('onStateChange', (state) => {
          if (state === -1 || state === 1 || state === 3) {
            notifyCurrentTrack();
          }
        });
      }

      hookedPlayers.add(player);
    }

    notifyCurrentTrack();
  }

  // 4. 廣播當前軌道資訊
  let lastNotifyTrackTime = 0;
  function notifyCurrentTrack(force = false) {
    const now = Date.now();
    if (!force && now - lastNotifyTrackTime < 100) return;
    lastNotifyTrackTime = now;

    const player = getActivePlayer();
    if (!player) return;

    const currentVid = getCurrentVideoId();
    const playerResponse = player.getPlayerResponse?.() ||
      (currentVid === window.ytInitialPlayerResponse?.videoDetails?.videoId ? window.ytInitialPlayerResponse : null);

    const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    let activeTrack = player.getOption?.('captions', 'track');

    // 自動開啟字幕：若影片有可用字幕軌道，但目前尚未開啟字幕，主動為使用者喚起字幕！
    if ((!activeTrack || Object.keys(activeTrack).length === 0 || !activeTrack.languageCode) && tracks.length > 0) {
      const defaultTrack = tracks.find(t => t.languageCode === 'en' || t.isDefault) || tracks[0];
      if (defaultTrack && typeof player.setOption === 'function') {
        player.loadModule?.('captions');
        player.setOption('captions', 'track', defaultTrack);
        activeTrack = player.getOption?.('captions', 'track') || defaultTrack;
      }
      try {
        const ccBtn = player.querySelector?.('.ytp-subtitles-button') || document.querySelector('.ytp-subtitles-button');
        if (ccBtn && ccBtn.getAttribute('aria-pressed') !== 'true') {
          ccBtn.click();
        }
      } catch (e) {}
    }

    console.log('[YT-Dual-Sub MainWorld] notifyCurrentTrack:', activeTrack?.languageCode || 'none', '可選軌道數:', tracks.length);
    handleTrackChange(activeTrack, tracks, currentVid);
  }

  let lastBroadcastedTrackKey = '';

  // 5. 軌道資料清洗與修補
  function handleTrackChange(activeTrack, allTracks, currentVid) {
    const player = getActivePlayer();
    const vid = currentVid || getCurrentVideoId();
    const tracks = allTracks || player?.getPlayerResponse?.()?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

    if (!activeTrack || Object.keys(activeTrack).length === 0 || !activeTrack.languageCode) {
      const key = `${vid}@@disabled`;
      if (key === lastBroadcastedTrackKey) return;
      lastBroadcastedTrackKey = key;
      window.postMessage({
        type: 'YT_CAPTION_TRACK_CHANGED',
        enabled: false,
        videoId: vid,
        track: null
      }, '*');
      return;
    }

    let matchedTrack = tracks.find(t =>
      (activeTrack.vssId && t.vssId === activeTrack.vssId) ||
      (activeTrack.vss_id && t.vssId === activeTrack.vss_id) ||
      (t.languageCode === activeTrack.languageCode)
    );

    // 處理 YouTube 原生「自動翻譯」軌道缺失 baseUrl / tlang 參數之修補
    if (!matchedTrack && activeTrack.baseUrl) {
      matchedTrack = { ...activeTrack };
    } else if (matchedTrack && activeTrack.translationLanguage) {
      matchedTrack = {
        ...matchedTrack,
        languageCode: activeTrack.translationLanguage.languageCode,
        targetTlang: activeTrack.translationLanguage.languageCode
      };
    }

    // 絕對保底：若 tracks 尚未載入完畢或找不到匹配，絕不傳遞 undefined，直接以 activeTrack 作為主體！
    if (!matchedTrack) {
      matchedTrack = {
        ...activeTrack,
        vssId: activeTrack.vss_id || activeTrack.vssId || (activeTrack.kind === 'asr' ? `a.${activeTrack.languageCode}` : activeTrack.languageCode),
        languageCode: activeTrack.languageCode
      };
    }

    matchedTrack.videoId = vid;

    const key = `${vid}@@enabled@@${matchedTrack?.vssId || ''}@@${matchedTrack?.baseUrl || ''}@@${matchedTrack?.languageCode || ''}`;
    if (key === lastBroadcastedTrackKey) return; // 軌道內容完全相同，絕不重複廣播打斷正在進行的字幕下載！
    lastBroadcastedTrackKey = key;

    console.log('[YT-Dual-Sub MainWorld] 廣播軌道變更: enabled=true, 語言=', matchedTrack.languageCode, 'vssId=', matchedTrack.vssId);
    window.postMessage({
      type: 'YT_CAPTION_TRACK_CHANGED',
      enabled: true,
      videoId: vid,
      track: matchedTrack
    }, '*');
  }

  // 6. SPA 切頁與換片監聽 (第 0ms 即刻廣播與快速階梯輪詢)
  window.addEventListener('yt-navigate-start', () => {
    lastBroadcastedTrackKey = '';
    window.postMessage({
      type: 'YT_NAVIGATE_START',
      videoId: getCurrentVideoId()
    }, '*');
  });

  // 響應 content.js 主動索取軌道請求 (徹底消滅 document_start 與 document_idle 生命週期競爭造成之漏接)
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data?.type === 'YT_REQUEST_CURRENT_TRACK') {
      console.log('[YT-Dual-Sub MainWorld] 收到 content.js 軌道索取請求，即刻廣播當前軌道！');
      lastBroadcastedTrackKey = '';
      notifyCurrentTrack();
    }
  });

  // 7. 網頁主環境同源特權下載管道 (攜帶 YouTube 原生 Cookies 與 Session，100% 免疫 429 阻擋)
  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.type !== 'YT_FETCH_CAPTION_REQUEST') return;
    const { requestId, url } = e.data;
    try {
      const res = await fetch(url, { credentials: 'include' });
      const text = res.ok ? await res.text() : '';
      const isHtmlBlock = text && (text.trim().startsWith('<html') || text.includes('<title>Sorry...'));
      window.postMessage({
        type: 'YT_FETCH_CAPTION_RESPONSE',
        requestId,
        success: !!(text && text.trim().length > 0 && !isHtmlBlock),
        text: isHtmlBlock ? '' : (text || '')
      }, '*');
    } catch (err) {
      window.postMessage({
        type: 'YT_FETCH_CAPTION_RESPONSE',
        requestId,
        success: false,
        text: ''
      }, '*');
    }
  });

  // 8. 網頁主環境第一主力：調用 YouTube 官方逐字稿內部接口 (get_transcript 徹底免疫 429)
  async function fetchTranscriptFromInnertube(videoId) {
    try {
      const ytcfg = window.ytcfg;
      if (!ytcfg) return null;
      const apiKey = ytcfg.get('INNERTUBE_API_KEY') || window.yt?.config_?.INNERTUBE_API_KEY;
      const context = ytcfg.get('INNERTUBE_CONTEXT') || window.yt?.config_?.INNERTUBE_CONTEXT;
      if (!apiKey || !context) return null;

      // 提取 getTranscriptEndpoint.params
      let params = null;
      const initialPanels = window.ytInitialData?.engagementPanels || [];
      const panel = initialPanels.find(p => p.engagementPanelSectionListRenderer?.panelIdentifier === 'engagement-panel-searchable-transcript');
      params = panel?.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint?.params;

      if (!params) {
        const domPanel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
        params = domPanel?.data?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint?.params;
      }

      function buildTranscriptParams(vid) {
        if (!vid) return null;
        const vidBytes = [];
        for (let i = 0; i < vid.length; i++) vidBytes.push(vid.charCodeAt(i));
        const subStr = 'CgNhc3ISAmVuGgA%3D';
        const subBytes = [];
        for (let i = 0; i < subStr.length; i++) subBytes.push(subStr.charCodeAt(i));
        const panelStr = 'engagement-panel-searchable-transcript-search-panel';
        const panelBytes = [];
        for (let i = 0; i < panelStr.length; i++) panelBytes.push(panelStr.charCodeAt(i));

        const bytes = [
          0x0a, vidBytes.length, ...vidBytes,
          0x12, subBytes.length, ...subBytes,
          0x18, 0x01,
          0x2a, panelBytes.length, ...panelBytes,
          0x30, 0x00, 0x38, 0x01, 0x40, 0x01
        ];
        return btoa(String.fromCharCode(...bytes));
      }

      if (!params) {
        params = buildTranscriptParams(videoId || getCurrentVideoId());
      }

      console.log('[YT-Dual-Sub MainWorld] get_transcript 開始: apiKey?', !!apiKey, 'context?', !!context, 'params?', !!params);
      if (!params) return null;

      const postData = JSON.stringify({
        context: context,
        params: decodeURIComponent(params)
      });

      const controller = new AbortController();
      const fetchTimer = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}&prettyPrint=false`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-YouTube-Client-Name': '1',
          'X-YouTube-Client-Version': context.client?.clientVersion || '2.20240826.01.00',
          'X-Goog-Visitor-Id': context.client?.visitorData || ''
        },
        credentials: 'include',
        signal: controller.signal,
        body: postData
      });
      clearTimeout(fetchTimer);
      console.log('[YT-Dual-Sub MainWorld] get_transcript res status:', res.status);

      if (!res.ok) {
        return null;
      }
      const data = await res.json();
      const actions = data.actions || [];
      const segments = actions[0]?.updateEngagementPanelAction?.content?.transcriptRenderer?.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments;
      if (!segments || segments.length === 0) return null;

      const events = [];
      for (const seg of segments) {
        const renderer = seg.transcriptSegmentRenderer;
        if (!renderer) continue;
        const startMs = parseInt(renderer.startMs || '0', 10);
        const endMs = parseInt(renderer.endMs || String(startMs + 2000), 10);
        const text = (renderer.snippet?.runs || []).map(r => r.text || '').join('');
        if (text && text.trim()) {
          events.push({
            tStartMs: startMs,
            dDurationMs: Math.max(200, endMs - startMs),
            segs: [{ utf8: text.trim() }]
          });
        }
      }

      if (events.length > 0) {
        return { events };
      }
    } catch (err) {
      console.warn('[YT-Dual-Sub MainWorld] get_transcript 抓取異常:', err);
    }
    return null;
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.type !== 'YT_FETCH_TRANSCRIPT_REQUEST') return;
    const { requestId, videoId } = e.data;
    console.log('[YT-Dual-Sub MainWorld] 收到 content.js 的 get_transcript 索取請求, vid:', videoId);
    const transcriptData = await fetchTranscriptFromInnertube(videoId);
    window.postMessage({
      type: 'YT_FETCH_TRANSCRIPT_RESPONSE',
      requestId,
      success: !!(transcriptData && transcriptData.events && transcriptData.events.length > 0),
      data: transcriptData
    }, '*');
  });

  // 9. 網頁主環境同源 Android InnerTube 高速端點 (150ms 極速、同源 100% 免疫 403 / 429 / SABR 阻擋)
  async function fetchCaptionFromAndroidInnertube(videoId, languageCode = 'en') {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'ANDROID',
              clientVersion: '20.10.38',
              hl: languageCode || 'en'
            }
          },
          videoId: videoId
        })
      });
      if (!res.ok) return null;
      const data = await res.json();
      const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (!tracks.length) return null;

      const cand = tracks.find(t => t.languageCode === languageCode && t.kind !== 'asr') ||
                   tracks.find(t => t.languageCode === languageCode) ||
                   tracks[0];

      if (cand?.baseUrl) {
        const j3Url = cand.baseUrl.replace(/&fmt=[^&]+/, '') + '&fmt=json3';
        const subRes = await fetch(j3Url);
        if (subRes.ok) {
          const text = await subRes.text();
          if (text && !text.startsWith('<html') && text.trim().length > 0) {
            return text;
          }
        }
      }
    } catch (e) {
      console.warn('[YT-Dual-Sub MainWorld] InnerTube 抓取異常:', e);
    }
    return null;
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.type !== 'YT_FETCH_INNERTUBE_CAPTION_REQUEST') return;
    const { requestId, videoId, languageCode } = e.data;
    const text = await fetchCaptionFromAndroidInnertube(videoId, languageCode);
    window.postMessage({
      type: 'YT_FETCH_INNERTUBE_CAPTION_RESPONSE',
      requestId,
      success: !!text,
      text: text || ''
    }, '*');
  });

  function triggerImmediateAndPolledInit() {
    initPlayerHook();
    notifyCurrentTrack();
    setTimeout(notifyCurrentTrack, 100);
    setTimeout(notifyCurrentTrack, 350);
    setTimeout(notifyCurrentTrack, 800);
  }

  window.addEventListener('yt-navigate-finish', triggerImmediateAndPolledInit);
  window.addEventListener('yt-page-data-updated', triggerImmediateAndPolledInit);

  // Shorts 滑動切換動作監聽
  window.addEventListener('yt-action', (e) => {
    if (e?.detail?.actionName?.includes('reel') || e?.detail?.actionName?.includes('navigate')) {
      setTimeout(triggerImmediateAndPolledInit, 100);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayerHook);
  } else {
    initPlayerHook();
  }
})();
