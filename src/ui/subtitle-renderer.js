/**
 * src/ui/subtitle-renderer.js
 * 雙語字幕 DOM 渲染引擎 (Subtitle Renderer)
 * 職責：
 *  1. 字幕容器 (#yt-dual-subtitle-container) 生命週期管理與安全掛載
 *  2. 響應式字級與樣式設定 (applySubtitleSize / CSS Variables)
 *  3. 雙槽 (Slot 1 上槽歷史 / Slot 2 下槽活躍) 膠囊滾動渲染
 *  4. 遵從 Trusted Types 安全規範，100% 透過 createElement + textContent 原地更新，消除畫面抖動與重繪閃爍
 *  5. 抗抖動防塌陷佔位保護 (\u00A0) 與去重過濾 (物理防禦)
 */

const DEFAULT_SIZE_MAP = {
  small:  { orig: '16px', trans: '13px', minW: '160px', maxW: '260px', pad: '8px 12px',  head: '13px', body: '12px', btn: '11px', btnPad: '3px 7px' },
  medium: { orig: '20px', trans: '16px', minW: '190px', maxW: '320px', pad: '10px 14px', head: '15px', body: '14px', btn: '12px', btnPad: '4px 9px' },
  large:  { orig: '24px', trans: '19px', minW: '230px', maxW: '380px', pad: '12px 16px', head: '17px', body: '16px', btn: '13px', btnPad: '5px 11px' },
  xlarge: { orig: '28px', trans: '23px', minW: '270px', maxW: '440px', pad: '14px 18px', head: '20px', body: '18px', btn: '15px', btnPad: '6px 13px' }
};

/**
 * 依據使用者設定字級，動態設置 HTML 根節點 CSS 自訂變數
 * @param {string} size - 'small' | 'medium' | 'large' | 'xlarge'
 * @param {Object} [sizeMap] - 自訂字級映射表 (預設為 DEFAULT_SIZE_MAP)
 * @param {Document} [doc] - DOM 文件物件
 */
function applySubtitleSize(size, sizeMap = DEFAULT_SIZE_MAP, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || !doc.documentElement) return;
  const conf = sizeMap[size] || sizeMap.medium || DEFAULT_SIZE_MAP.medium;
  const root = doc.documentElement;
  if (root.style && typeof root.style.setProperty === 'function') {
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
}

/**
 * 確保雙語字幕容器存在且正確掛載至播放器節點下
 * @param {HTMLElement} player - YouTube 播放器 DOM 元素
 * @param {Document} [doc] - DOM 文件物件
 * @param {string} [containerId] - 容器元素 ID (預設 'yt-dual-subtitle-container')
 * @returns {HTMLElement|null}
 */
function ensureSubtitleContainer(player, doc = (typeof document !== 'undefined' ? document : null), containerId = 'yt-dual-subtitle-container') {
  if (!player || !doc) return null;
  let container = doc.getElementById(containerId);
  if (!container) {
    container = doc.createElement('div');
    container.id = containerId;
    player.appendChild(container);
  } else if (container.parentElement !== player) {
    player.appendChild(container);
  }
  return container;
}

/**
 * 物理防禦輔助：若下槽 (Slot 2) 開頭包含上槽 (Slot 1) 完結句，乾淨剝除重疊字
 * @param {string} prevOrig
 * @param {string} currOrig
 * @returns {string}
 */
function stripOverlappingPrefix(prevOrig, currOrig) {
  if (!prevOrig || !currOrig) return currOrig || '';
  const prevClean = prevOrig.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const currClean = currOrig.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  if (currClean.startsWith(prevClean)) {
    const prevWordCount = prevOrig.trim().split(/\s+/).length;
    const currWords = currOrig.trim().split(/\s+/);
    return currWords.slice(prevWordCount).join(' ').trim();
  }
  return currOrig;
}

/**
 * 建立單一槽位 (Slot) DOM 節點結構
 * @param {Document} doc
 * @param {string} className
 * @returns {HTMLElement}
 */
function createSlotNode(doc, className) {
  const slot = doc.createElement('div');
  slot.className = `cue-slot ${className}`;
  slot.style.display = 'none';

  const orig = doc.createElement('div');
  orig.className = 'cue-slot-orig';
  slot.appendChild(orig);

  const trans = doc.createElement('div');
  trans.className = 'cue-slot-trans';
  trans.style.display = 'none';
  slot.appendChild(trans);

  return slot;
}

/**
 * 渲染雙槽雙語字幕 (Slot 1 歷史句 + Slot 2 當前活躍句)
 * 100% 原地 textContent 更新，零 flicker，100% 符合 Trusted Types
 * 
 * @param {HTMLElement} container - 字幕容器 DOM 元素
 * @param {Object} prev - { orig: string, trans: string }
 * @param {Object} curr - { orig: string, trans: string }
 * @param {Object} [options]
 * @param {boolean} [options.isExtensionEnabled=true]
 * @param {boolean} [options.isCaptionsEnabled=true]
 * @param {HTMLElement} [options.player]
 * @param {string} [options.lastRenderedSig]
 * @param {Function} [options.onSignatureChange]
 * @param {Function} [options.onFirstRenderSuccess]
 * @returns {boolean} 是否成功渲染或維持顯示
 */
function renderDualSlotSubtitle(container, prev, curr, options = {}) {
  const isExtensionEnabled = options.isExtensionEnabled !== false;
  const isCaptionsEnabled = options.isCaptionsEnabled !== false;
  const player = options.player || null;

  if (!isExtensionEnabled || !isCaptionsEnabled) {
    if (container) container.style.display = 'none';
    if (player && player.classList) player.classList.remove('yt-dual-sub-active');
    return false;
  }
  if (!container) return false;

  const currOrig = curr?.orig || '';
  const currTrans = curr?.trans || '';
  const displayCurrOrig = stripOverlappingPrefix(prev?.orig, currOrig);

  const currentSig = `${prev?.orig || ''}@@${prev?.trans || ''}@@${displayCurrOrig}@@${currTrans}`;
  if (options.lastRenderedSig && currentSig === options.lastRenderedSig && container.style.display !== 'none') {
    return true;
  }
  if (typeof options.onSignatureChange === 'function') {
    options.onSignatureChange(currentSig);
  }

  if (!prev?.orig && !displayCurrOrig) {
    container.style.display = 'none';
    if (player && player.classList) player.classList.remove('yt-dual-sub-active');
    return false;
  }

  // 首度渲染成功回報 hook (可供遙測追蹤)
  if ((currTrans || prev?.trans) && typeof options.onFirstRenderSuccess === 'function') {
    options.onFirstRenderSuccess();
  }

  let slotPrev = container.querySelector('.cue-slot-prev');
  let slotCurr = container.querySelector('.cue-slot-curr');

  // DOM 節點僅初始化一次，後續全部原地 textContent 更新
  if (!slotPrev || !slotCurr) {
    container.textContent = '';
    const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc) return false;

    slotPrev = createSlotNode(doc, 'cue-slot-prev');
    slotCurr = createSlotNode(doc, 'cue-slot-curr');
    container.appendChild(slotPrev);
    container.appendChild(slotCurr);
  }

  // 原地更新 Slot 1 (上槽 - 歷史完結句)
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
        // 抗抖動防塌陷保護：若上槽有英文但譯文尚在等待中，保持 DOM 佔位，絕不塌陷成一行！
        transEl.textContent = '\u00A0';
        transEl.style.display = '';
        transEl.style.visibility = 'hidden';
      }
    }
    slotPrev.style.display = 'flex';
  } else {
    slotPrev.style.display = 'none';
  }

  // 原地更新 Slot 2 (下槽 - 當前活躍句)
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
  if (player && player.classList) {
    player.classList.add('yt-dual-sub-active');
  }
  return true;
}

/**
 * 隱藏字幕容器並移除播放器標記樣式
 * @param {HTMLElement} container
 * @param {HTMLElement} [player]
 */
function hideSubtitle(container, player) {
  if (container) container.style.display = 'none';
  if (player && player.classList) player.classList.remove('yt-dual-sub-active');
}

/**
 * SubtitleRenderer 類別封裝
 */
class SubtitleRenderer {
  constructor(options = {}) {
    this.containerId = options.containerId || 'yt-dual-subtitle-container';
    this.sizeMap = options.sizeMap || DEFAULT_SIZE_MAP;
    this.lastRenderedSig = '';
    this.hasTrackedRenderSuccess = false;
    this.onTrackSuccess = options.onTrackSuccess || null;
  }

  applySize(size, doc) {
    applySubtitleSize(size, this.sizeMap, doc);
  }

  ensureContainer(player, doc) {
    return ensureSubtitleContainer(player, doc, this.containerId);
  }

  render(container, prev, curr, options = {}) {
    return renderDualSlotSubtitle(container, prev, curr, {
      ...options,
      lastRenderedSig: this.lastRenderedSig,
      onSignatureChange: (sig) => {
        this.lastRenderedSig = sig;
        if (typeof options.onSignatureChange === 'function') options.onSignatureChange(sig);
      },
      onFirstRenderSuccess: () => {
        if (!this.hasTrackedRenderSuccess) {
          this.hasTrackedRenderSuccess = true;
          if (typeof this.onTrackSuccess === 'function') this.onTrackSuccess();
        }
        if (typeof options.onFirstRenderSuccess === 'function') options.onFirstRenderSuccess();
      }
    });
  }

  hide(container, player) {
    this.lastRenderedSig = '';
    hideSubtitle(container, player);
  }

  resetSignature() {
    this.lastRenderedSig = '';
  }
}

// 支援 CommonJS / Node 測試環境
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_SIZE_MAP,
    applySubtitleSize,
    ensureSubtitleContainer,
    stripOverlappingPrefix,
    createSlotNode,
    renderDualSlotSubtitle,
    hideSubtitle,
    SubtitleRenderer
  };
}
