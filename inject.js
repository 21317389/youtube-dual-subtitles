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
  function notifyCurrentTrack() {
    const player = getActivePlayer();
    if (!player) return;

    const currentVid = getCurrentVideoId();
    const playerResponse = player.getPlayerResponse?.() ||
      (currentVid === window.ytInitialPlayerResponse?.videoDetails?.videoId ? window.ytInitialPlayerResponse : null);

    const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const activeTrack = player.getOption?.('captions', 'track');

    handleTrackChange(activeTrack, tracks, currentVid);
  }

  // 5. 軌道資料清洗與修補
  function handleTrackChange(activeTrack, allTracks, currentVid) {
    const player = getActivePlayer();
    const vid = currentVid || getCurrentVideoId();
    const tracks = allTracks || player?.getPlayerResponse?.()?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

    if (!activeTrack || Object.keys(activeTrack).length === 0 || !activeTrack.languageCode) {
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

    if (matchedTrack) {
      matchedTrack.videoId = vid;
    }

    window.postMessage({
      type: 'YT_CAPTION_TRACK_CHANGED',
      enabled: true,
      videoId: vid,
      track: matchedTrack
    }, '*');
  }

  // 6. SPA 切頁與換片監聽 (第 0ms 即刻廣播與快速階梯輪詢)
  window.addEventListener('yt-navigate-start', () => {
    window.postMessage({
      type: 'YT_NAVIGATE_START',
      videoId: getCurrentVideoId()
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
