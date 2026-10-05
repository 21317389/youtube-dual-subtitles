/**
 * src/ui/tooltip-controller.js
 * 字幕單字/片語選詞視窗與懸停控制 (Tooltip Controller & Hover Pause Manager)
 * 職責：
 *  1. 選詞查詢氣泡視窗 (#yt-translate-tooltip) 的建立、幾何定位與動態內容渲染
 *  2. 警告通知 Toast (#yt-dual-warning-toast) 的防抖展示與自動隱藏
 *  3. 懸停暫停/續播 (Hover-to-Pause) 生命週期管理，徹底杜絕重複註冊導致的記憶體洩漏
 *  4. 語音原聲片段重播 (Audio Snippet Playback) 與 TTS 單字朗讀 (Speech Synthesis)
 */

/**
 * 計算 Tooltip 於 YouTube 播放器內的邊界限制座標
 * @param {DOMRect|Object} rect - 選取文字的視窗矩形範圍
 * @param {DOMRect|Object} playerRect - 播放器容器視窗矩形範圍
 * @param {number} tooltipWidth - Tooltip 寬度 (預設 230)
 * @param {number} tooltipHeight - Tooltip 高度 (預設 100)
 * @returns {{ left: number, top: number }}
 */
function calculateTooltipPosition(rect, playerRect, tooltipWidth = 230, tooltipHeight = 100) {
  let left = rect.left - playerRect.left;
  let top = rect.bottom - playerRect.top + 8;

  const maxLeft = playerRect.width - tooltipWidth - 12;
  left = Math.max(10, Math.min(left, maxLeft));

  if (top + tooltipHeight > playerRect.height - 10) {
    top = Math.max(10, (rect.top - playerRect.top) - tooltipHeight - 8);
  }

  return { left, top };
}

/**
 * 確保 Tooltip 元素存在且掛載於播放器容器內
 * @param {HTMLElement} player
 * @param {Document} [doc]
 * @param {string} [tooltipId='yt-translate-tooltip']
 * @returns {HTMLElement|null}
 */
function ensureTooltipElement(player, doc = (typeof document !== 'undefined' ? document : null), tooltipId = 'yt-translate-tooltip') {
  if (!player || !doc) return null;
  let tooltip = doc.getElementById(tooltipId);
  if (!tooltip) {
    tooltip = doc.createElement('div');
    tooltip.id = tooltipId;
    tooltip.style.display = 'none';
    player.appendChild(tooltip);
  } else if (tooltip.parentElement !== player) {
    player.appendChild(tooltip);
  }
  return tooltip;
}

/**
 * 確保 Warning Toast 提示元素存在且掛載於播放器內
 * @param {HTMLElement} player
 * @param {Document} [doc]
 * @param {string} [toastId='yt-dual-warning-toast']
 * @returns {HTMLElement|null}
 */
function ensureToastElement(player, doc = (typeof document !== 'undefined' ? document : null), toastId = 'yt-dual-warning-toast') {
  if (!player || !doc) return null;
  let toast = doc.getElementById(toastId);
  if (!toast) {
    toast = doc.createElement('div');
    toast.id = toastId;
    player.appendChild(toast);
  } else if (toast.parentElement !== player) {
    player.appendChild(toast);
  }
  return toast;
}

/**
 * 播放指定起訖時間的語音片段 (精準截取講者原聲)
 * @param {HTMLVideoElement} video
 * @param {number} start
 * @param {number} end
 * @param {Object} [state] - 用於存放 timer ID 的物件 (如 { timer: null })
 * @returns {any} timerId
 */
function playVideoSnippet(video, start, end, state = {}) {
  if (!video) return null;
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }

  video.currentTime = Math.max(0, start - 0.05);
  video.play().catch(() => {});

  state.timer = setInterval(() => {
    if (video.currentTime >= end + 0.1 || video.paused) {
      clearInterval(state.timer);
      state.timer = null;
      video.pause();
    }
  }, 30);

  return state.timer;
}

/**
 * 呼叫瀏覽器原生語音合成發音
 * @param {string} text
 * @param {string} [lang='en-US']
 * @param {SpeechSynthesis} [synth]
 */
function speakSelectedWord(text, lang = 'en-US', synth = (typeof window !== 'undefined' ? window.speechSynthesis : null)) {
  if (!synth) return;
  try {
    synth.cancel();
    if (typeof SpeechSynthesisUtterance !== 'undefined') {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang || 'en-US';
      utterance.rate = 0.95;
      synth.speak(utterance);
    }
  } catch (e) {}
}

/**
 * 懸停暫停狀態控制器 (管理穩定參考的事件監聽，防止 closure 洩漏)
 */
class HoverPauseManager {
  constructor(options = {}) {
    this.getVideo = options.getVideo || (() => null);
    this.isHoverPauseEnabled = options.isHoverPauseEnabled || (() => false);
    this.elementsGetter = options.getElements || (() => []);
    
    this.wasPlayingBeforeHover = false;
    this.isHovering = false;
    this.hoverResumeTimer = null;

    // 建立穩定的函式參照以利精確 removeEventListener
    this.onMouseEnter = this.handleMouseEnter.bind(this);
    this.onMouseLeave = this.handleMouseLeave.bind(this);
  }

  handleMouseEnter() {
    if (!this.isHoverPauseEnabled()) return;
    const video = this.getVideo();
    if (!video) return;

    if (this.hoverResumeTimer) {
      clearTimeout(this.hoverResumeTimer);
      this.hoverResumeTimer = null;
    }

    if (!this.isHovering) {
      this.isHovering = true;
      this.wasPlayingBeforeHover = !video.paused && !video.ended;
      if (this.wasPlayingBeforeHover) {
        video.pause();
      }
    }
  }

  handleMouseLeave(e) {
    if (!this.isHoverPauseEnabled()) return;
    const elements = this.elementsGetter().filter(Boolean);
    const nextTarget = e?.relatedTarget;

    // 若滑鼠僅是在字幕容器與 Tooltip 之間游移，則維持懸停暫停狀態，不中途閃爍續播
    if (nextTarget && elements.some(el => el.contains(nextTarget))) {
      return;
    }

    if (this.hoverResumeTimer) {
      clearTimeout(this.hoverResumeTimer);
    }

    this.hoverResumeTimer = setTimeout(() => {
      if (typeof window !== 'undefined' && window.getSelection && window.getSelection().toString().trim().length > 0) {
        return;
      }
      this.isHovering = false;
      const video = this.getVideo();
      if (video && this.wasPlayingBeforeHover) {
        video.play().catch(() => {});
        this.wasPlayingBeforeHover = false;
      }
    }, 150);
  }

  bind(elements = []) {
    const validElements = (elements.length > 0 ? elements : this.elementsGetter()).filter(Boolean);
    validElements.forEach(el => {
      el.removeEventListener('mouseenter', this.onMouseEnter);
      el.removeEventListener('mouseleave', this.onMouseLeave);
      el.addEventListener('mouseenter', this.onMouseEnter);
      el.addEventListener('mouseleave', this.onMouseLeave);
    });
  }

  unbind(elements = []) {
    const validElements = (elements.length > 0 ? elements : this.elementsGetter()).filter(Boolean);
    validElements.forEach(el => {
      el.removeEventListener('mouseenter', this.onMouseEnter);
      el.removeEventListener('mouseleave', this.onMouseLeave);
    });
  }
}

/**
 * TooltipController 類別封裝
 */
class TooltipController {
  constructor(options = {}) {
    this.tooltipId = options.tooltipId || 'yt-translate-tooltip';
    this.toastId = options.toastId || 'yt-dual-warning-toast';
    this.getPlayer = options.getPlayer || (() => null);
    this.getVideo = options.getVideo || (() => null);
    this.onTranslate = options.onTranslate || null;
    this.getLanguage = options.getLanguage || (() => 'en-US');

    this.lastToastTime = 0;
    this.toastTimer = null;
    this.snippetState = { timer: null };

    this.hoverManager = new HoverPauseManager({
      getVideo: this.getVideo,
      isHoverPauseEnabled: options.isHoverPauseEnabled || (() => false),
      getElements: () => {
        const player = this.getPlayer();
        if (!player) return [];
        const subtitleEl = player.querySelector('#yt-dual-subtitle-container');
        const tooltipEl = player.querySelector(`#${this.tooltipId}`);
        return [subtitleEl, tooltipEl].filter(Boolean);
      }
    });
  }

  ensureElements(player) {
    const targetPlayer = player || this.getPlayer();
    if (!targetPlayer) return null;
    const doc = targetPlayer.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const tooltip = ensureTooltipElement(targetPlayer, doc, this.tooltipId);
    return tooltip;
  }

  showWarningToast(message, options = {}) {
    const player = options.player || this.getPlayer();
    if (!player) return;

    const debounceMs = options.debounceMs || 8000;
    const now = Date.now();
    if (now - this.lastToastTime < debounceMs) return;
    this.lastToastTime = now;

    const doc = player.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const toast = ensureToastElement(player, doc, this.toastId);
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('show');

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, options.durationMs || 5000);
  }

  showToast(message, options = {}) {
    return this.showWarningToast(message, options);
  }

  showTooltip({ selectedText, rect, playerRect, snippetRange, i18n = {} }) {
    const player = this.getPlayer();
    if (!player) return null;

    const tooltip = ensureTooltipElement(player, player.ownerDocument, this.tooltipId);
    if (!tooltip) return null;

    const doc = tooltip.ownerDocument || document;
    tooltip.textContent = '';

    // 關閉按鈕
    const closeBtn = doc.createElement('button');
    closeBtn.className = 'tooltip-close-btn';
    closeBtn.id = 'tooltipCloseBtn';
    closeBtn.textContent = '✕';
    tooltip.appendChild(closeBtn);

    // 原文標題
    const header = doc.createElement('div');
    header.className = 'tooltip-header';
    header.textContent = selectedText;
    tooltip.appendChild(header);

    tooltip.appendChild(doc.createElement('hr'));

    // 翻譯結果本體
    const body = doc.createElement('div');
    body.className = 'tooltip-body';
    body.id = 'tooltipTransBody';
    body.textContent = i18n.translating || '翻譯中...';
    tooltip.appendChild(body);

    // 操作按鈕列
    const actions = doc.createElement('div');
    actions.className = 'tooltip-actions';

    const btnPlay = doc.createElement('button');
    btnPlay.className = 'tooltip-btn';
    btnPlay.id = 'btnPlaySnippet';
    btnPlay.textContent = i18n.playSnippet || '🎬 聽原聲';
    actions.appendChild(btnPlay);

    const btnSpeak = doc.createElement('button');
    btnSpeak.className = 'tooltip-btn';
    btnSpeak.id = 'btnSpeakWord';
    btnSpeak.textContent = i18n.speak || '🗣️ 朗讀';
    actions.appendChild(btnSpeak);

    tooltip.appendChild(actions);
    tooltip.style.display = 'block';

    // 幾何佈局計算
    const tooltipWidth = tooltip.offsetWidth || 230;
    const tooltipHeight = tooltip.offsetHeight || 100;
    const pos = calculateTooltipPosition(rect, playerRect, tooltipWidth, tooltipHeight);
    tooltip.style.left = `${pos.left}px`;
    tooltip.style.top = `${pos.top}px`;

    // 綁定按鈕動作
    closeBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.hideTooltip();
    });

    btnPlay.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (snippetRange) {
        this.playSnippet(snippetRange.start, snippetRange.end);
      }
    });

    btnSpeak.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.speakWord(selectedText);
    });

    // 觸發非同步翻譯回填
    if (typeof this.onTranslate === 'function') {
      this.onTranslate(selectedText, (translatedText) => {
        const transBody = tooltip.querySelector('#tooltipTransBody');
        if (transBody) {
          if (translatedText) {
            transBody.textContent = translatedText;
          } else {
            transBody.textContent = '⚠️ 翻譯暫時受限 (請稍後重試)';
            this.showWarningToast('⚠️ 翻譯服務暫時受限，請稍後重試');
          }
        }
      });
    }

    return tooltip;
  }

  clearSnippetTimer() {
    if (this.snippetState && this.snippetState.timer) {
      clearInterval(this.snippetState.timer);
      this.snippetState.timer = null;
    }
  }

  hideTooltip() {
    const player = this.getPlayer();
    if (!player) return;
    const tooltip = player.querySelector(`#${this.tooltipId}`);
    if (tooltip) {
      tooltip.style.display = 'none';
    }
    this.clearSnippetTimer();
  }

  playSnippet(start, end) {
    const video = this.getVideo();
    return playVideoSnippet(video, start, end, this.snippetState);
  }

  speakWord(text) {
    const lang = this.getLanguage ? this.getLanguage() : 'en-US';
    speakSelectedWord(text, lang);
  }

  bindHover(elements = []) {
    this.hoverManager.bind(elements);
  }

  unbindHover(elements = []) {
    this.hoverManager.unbind(elements);
  }
}

// 支援 CommonJS / Node 測試環境
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateTooltipPosition,
    ensureTooltipElement,
    ensureToastElement,
    playVideoSnippet,
    speakSelectedWord,
    HoverPauseManager,
    TooltipController
  };
}
