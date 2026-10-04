/**
 * src/core/session-state.js
 * 擴充功能會話狀態機 (Session State Machine)
 * 職責：
 *  1. 收斂 content.js 散落的 40+ 個全域狀態變數，統一集中管理
 *  2. 定義清晰的生命週期變遷（影片導航切換、字幕重置、Seek 跳躍、即時串流重置）
 *  3. 保證狀態變更的不可變性與一致性 (Invariants Guarantee)
 *  4. 隔離使用者設定、字幕軌道、靜態預載 (Mode 1)、即時串流 (Mode 2)、UI 定時器與遙測指標
 */

class SessionState {
  constructor(initial = {}) {
    // 1. 使用者偏好設定 (User Settings)
    this.settings = {
      isExtensionEnabled: initial.isExtensionEnabled !== false,
      userTargetLang: initial.userTargetLang || 'zh-TW',
      userUiSize: initial.userUiSize || 'medium',
      isHoverPauseEnabled: !!initial.isHoverPauseEnabled,
      subtitleOffset: initial.subtitleOffset || 0
    };

    // 2. 字幕軌道與播放情境 (Track & Video Context)
    this.track = {
      currentTrack: initial.currentTrack || null,
      isCaptionsEnabled: !!initial.isCaptionsEnabled,
      lastObservedVideoId: initial.videoId || ''
    };

    // 3. 字幕抓取會話與冷卻保護 (Fetch Session & Transport)
    this.fetch = {
      currentSessionId: 0,
      inFlightKey: '',
      timedtextCooldownUntil: 0
    };

    // 4. Mode 1 靜態預載與滑動窗口 (Mode 1 Static Cues)
    this.mode1 = {
      sentenceList: [],
      lastWindowCheckTime: -999,
      consecutiveTranslateErrors: 0,
      lastRenderedSignature: ''
    };

    // 5. Mode 2 即時串流斷句與雙槽滾動 (Mode 2 Rolling ASR)
    this.mode2 = {
      speechTokenQueue: [],
      prevSlot: { orig: '', trans: '' },
      currSlot: { orig: '', trans: '' },
      lastLockedCompletedSentence: '',
      completedSentenceHistory: [],
      lastRawObservedWindowText: '',
      prevSlotTimeRange: { start: 0, end: 0 },
      currentSentenceStartTime: 0,
      lastFinishedSentence: '',
      lastFinishedTrans: '',
      lastRequestedLiveText: '',
      currentLiveTransId: 0,
      lastRenderedRollingSig: ''
    };

    // 6. UI 動畫幀與定時器 (UI Timers & Animation)
    this.ui = {
      animationFrameId: null,
      wasPlayingBeforeHover: false,
      isHoveringSubtitleOrTooltip: false,
      hoverResumeTimer: null,
      snippetPauseTimer: null,
      toastCooldownTimer: null,
      lastToastTime: 0
    };

    // 7. 遙測事件單次觸發防禦標記 (Per-Video Telemetry Flags)
    this.telemetry = {
      hasTrackedVideoView: false,
      hasTrackedSubtitleSuccess: false,
      hasTrackedRateLimit429: false,
      hasTrackedMode2Fallback: false,
      hasTrackedTranslateError: false
    };
  }

  // ==========================================
  // 便利存取器 (Convenience Getters / Setters)
  // ==========================================
  get isExtensionEnabled() { return this.settings.isExtensionEnabled; }
  set isExtensionEnabled(v) { this.settings.isExtensionEnabled = !!v; }

  get userTargetLang() { return this.settings.userTargetLang; }
  set userTargetLang(v) { this.settings.userTargetLang = v; }

  get userUiSize() { return this.settings.userUiSize; }
  set userUiSize(v) { this.settings.userUiSize = v; }

  get isHoverPauseEnabled() { return this.settings.isHoverPauseEnabled; }
  set isHoverPauseEnabled(v) { this.settings.isHoverPauseEnabled = !!v; }

  get subtitleOffset() { return this.settings.subtitleOffset; }
  set subtitleOffset(v) { this.settings.subtitleOffset = v; }

  get currentTrack() { return this.track.currentTrack; }
  set currentTrack(v) { this.track.currentTrack = v; }

  get isCaptionsEnabled() { return this.track.isCaptionsEnabled; }
  set isCaptionsEnabled(v) { this.track.isCaptionsEnabled = !!v; }

  get lastObservedVideoId() { return this.track.lastObservedVideoId; }
  set lastObservedVideoId(v) { this.track.lastObservedVideoId = v; }

  get currentSessionId() { return this.fetch.currentSessionId; }
  get inFlightKey() { return this.fetch.inFlightKey; }
  set inFlightKey(v) { this.fetch.inFlightKey = v; }

  get timedtextCooldownUntil() { return this.fetch.timedtextCooldownUntil; }
  set timedtextCooldownUntil(v) { this.fetch.timedtextCooldownUntil = v; }

  get sentenceList() { return this.mode1.sentenceList; }
  set sentenceList(v) { this.mode1.sentenceList = v; }

  get lastWindowCheckTime() { return this.mode1.lastWindowCheckTime; }
  set lastWindowCheckTime(v) { this.mode1.lastWindowCheckTime = v; }

  get lastRenderedSignature() { return this.mode1.lastRenderedSignature; }
  set lastRenderedSignature(v) { this.mode1.lastRenderedSignature = v; }

  get consecutiveTranslateErrors() { return this.mode1.consecutiveTranslateErrors; }
  set consecutiveTranslateErrors(v) { this.mode1.consecutiveTranslateErrors = v; }

  get speechTokenQueue() { return this.mode2.speechTokenQueue; }
  set speechTokenQueue(v) { this.mode2.speechTokenQueue = v; }

  get prevSlot() { return this.mode2.prevSlot; }
  set prevSlot(v) { this.mode2.prevSlot = v; }

  get currSlot() { return this.mode2.currSlot; }
  set currSlot(v) { this.mode2.currSlot = v; }

  get lastLockedCompletedSentence() { return this.mode2.lastLockedCompletedSentence; }
  set lastLockedCompletedSentence(v) { this.mode2.lastLockedCompletedSentence = v; }

  get completedSentenceHistory() { return this.mode2.completedSentenceHistory; }
  set completedSentenceHistory(v) { this.mode2.completedSentenceHistory = v; }

  get lastRawObservedWindowText() { return this.mode2.lastRawObservedWindowText; }
  set lastRawObservedWindowText(v) { this.mode2.lastRawObservedWindowText = v; }

  get prevSlotTimeRange() { return this.mode2.prevSlotTimeRange; }
  set prevSlotTimeRange(v) { this.mode2.prevSlotTimeRange = v; }

  get currentSentenceStartTime() { return this.mode2.currentSentenceStartTime; }
  set currentSentenceStartTime(v) { this.mode2.currentSentenceStartTime = v; }

  get lastFinishedSentence() { return this.mode2.lastFinishedSentence; }
  set lastFinishedSentence(v) { this.mode2.lastFinishedSentence = v; }

  get lastFinishedTrans() { return this.mode2.lastFinishedTrans; }
  set lastFinishedTrans(v) { this.mode2.lastFinishedTrans = v; }

  get lastRequestedLiveText() { return this.mode2.lastRequestedLiveText; }
  set lastRequestedLiveText(v) { this.mode2.lastRequestedLiveText = v; }

  get currentLiveTransId() { return this.mode2.currentLiveTransId; }
  set currentLiveTransId(v) { this.mode2.currentLiveTransId = v; }

  get lastRenderedRollingSig() { return this.mode2.lastRenderedRollingSig; }
  set lastRenderedRollingSig(v) { this.mode2.lastRenderedRollingSig = v; }

  // ==========================================
  // 生命週期狀態機方法 (Lifecycle State Transitions)
  // ==========================================

  /**
   * 生成下一輪全新的字幕抓取會話 ID
   * 任何過時會話的非同步回呼皆會被阻絕
   * @returns {number}
   */
  nextFetchSessionId() {
    return ++this.fetch.currentSessionId;
  }

  /**
   * 驗證給定的 sessionId 是否為當前唯一活躍會話
   * @param {number} sessionId
   * @returns {boolean}
   */
  isSessionActive(sessionId) {
    return sessionId === this.fetch.currentSessionId;
  }

  /**
   * 字幕重置：當切換軌道、關閉 CC 或切換插件開關時呼叫
   * 清空字幕資料與抓取標記，保留使用者個人化設定
   */
  resetSubtitles() {
    this.nextFetchSessionId();
    this.fetch.inFlightKey = '';
    this.mode1.sentenceList = [];
    this.mode1.lastWindowCheckTime = -999;
    this.mode1.lastRenderedSignature = '';
    this.mode1.consecutiveTranslateErrors = 0;
    this.resetStreaming();
    this.clearSnippetTimer();
  }

  /**
   * Mode 2 即時串流狀態重置
   * 清空暫存隊列與雙槽雙語內容
   */
  resetStreaming() {
    this.mode2.lastRenderedRollingSig = '';
    this.mode2.speechTokenQueue = [];
    this.mode2.prevSlot = { orig: '', trans: '' };
    this.mode2.currSlot = { orig: '', trans: '' };
    this.mode2.lastLockedCompletedSentence = '';
    this.mode2.completedSentenceHistory = [];
    this.mode2.lastRawObservedWindowText = '';
    this.mode2.prevSlotTimeRange = { start: 0, end: 0 };
    this.mode2.currentSentenceStartTime = 0;
    this.mode2.lastFinishedSentence = '';
    this.mode2.lastFinishedTrans = '';
    this.mode2.lastRequestedLiveText = '';
  }

  /**
   * 進度條跳轉 (Seek) 重置保護
   * 清空瞬態進行中文字，防止跨時間點污染
   * @param {number} currentTime - 跳轉落點當前秒數
   */
  resetSeek(currentTime = 0) {
    this.clearSnippetTimer();
    this.mode2.speechTokenQueue = [];
    this.mode2.lastLockedCompletedSentence = '';
    this.mode2.lastRawObservedWindowText = '';
    this.mode2.currentSentenceStartTime = currentTime;
  }

  /**
   * 全影片導航重置 (YouTube SPA 換片)
   * @param {string} newVideoId
   */
  resetVideoNavigation(newVideoId) {
    this.resetTelemetry();
    this.resetSubtitles();
    this.track.lastObservedVideoId = newVideoId || '';
    this.track.currentTrack = null;
    this.telemetry.hasTrackedVideoView = false;
  }

  /**
   * 重置單片遙測旗標 (每部影片僅追蹤一次)
   */
  resetTelemetry() {
    this.telemetry.hasTrackedSubtitleSuccess = false;
    this.telemetry.hasTrackedRateLimit429 = false;
    this.telemetry.hasTrackedMode2Fallback = false;
    this.telemetry.hasTrackedTranslateError = false;
  }

  /**
   * 清理音訊片段定時器
   */
  clearSnippetTimer() {
    if (this.ui.snippetPauseTimer) {
      clearInterval(this.ui.snippetPauseTimer);
      this.ui.snippetPauseTimer = null;
    }
  }

  /**
   * 清理全部 UI 定時器
   */
  clearAllTimers() {
    this.clearSnippetTimer();
    if (this.ui.hoverResumeTimer) {
      clearTimeout(this.ui.hoverResumeTimer);
      this.ui.hoverResumeTimer = null;
    }
    if (this.ui.toastCooldownTimer) {
      clearTimeout(this.ui.toastCooldownTimer);
      this.ui.toastCooldownTimer = null;
    }
  }
}

// 支援 CommonJS / Node 測試環境
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SessionState
  };
}
