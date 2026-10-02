/**
 * popup.js - 擴充功能設定面板邏輯
 * 職責：管理總開關、目標語言、字幕與選詞視窗大小、同步時間軸微調、懸停暫停開關、懸浮式更新重點卡片與紅點消除
 */

document.addEventListener('DOMContentLoaded', () => {
  const extensionEnabledCheckbox = document.getElementById('extensionEnabled');
  const settingsContent = document.getElementById('settingsContent');
  const targetLangSelect = document.getElementById('targetLang');
  const uiSizeSelect = document.getElementById('uiSize');
  const hoverPauseCheckbox = document.getElementById('hoverPause');
  const statusMessage = document.getElementById('statusMessage');
  const offsetDisplay = document.getElementById('offsetDisplay');
  const offsetMinus = document.getElementById('offsetMinus');
  const offsetPlus = document.getElementById('offsetPlus');
  const offsetReset = document.getElementById('offsetReset');
  const whatsNewCard = document.getElementById('whatsNewCard');
  const whatsNewCloseBtn = document.getElementById('whatsNewCloseBtn');
  const whatsNewToggleBtn = document.getElementById('whatsNewToggleBtn');
  const footerNewDot = document.getElementById('footerNewDot');

  let currentOffset = 0;
  const currentVersion = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest)
    ? (chrome.runtime.getManifest()?.version || '1.4.0')
    : '1.4.0';

  // 使用者主動打開 Popup 時，立即清除右上角工具列圖示的 NEW 紅點標記
  try {
    if (typeof chrome !== 'undefined' && chrome.action?.setBadgeText) {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (e) {}

  // 1. 自動套用 Chrome 國際化 (i18n) 語言文字
  function applyI18n() {
    if (typeof chrome === 'undefined' || !chrome.i18n?.getMessage) return;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const msg = chrome.i18n.getMessage(key);
      if (msg) {
        if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit')) {
          el.value = msg;
        } else {
          el.textContent = msg;
        }
      }
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const msg = chrome.i18n.getMessage(key);
      if (msg) el.title = msg;
    });
  }
  applyI18n();

  // 2. 管理「✨ 更新重點」紅點提示與懸浮卡片 (預設不自動撐開畫面，零跳動感)
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get({ dismissedWhatsNewVersion: '' }, (res) => {
      if (res.dismissedWhatsNewVersion === currentVersion) {
        if (footerNewDot) footerNewDot.style.display = 'none';
      } else {
        if (footerNewDot) footerNewDot.style.display = 'inline-block';
      }
    });
  } else {
    if (footerNewDot) footerNewDot.style.display = 'inline-block';
  }

  function markWhatsNewSeen() {
    if (footerNewDot) footerNewDot.style.display = 'none';
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ dismissedWhatsNewVersion: currentVersion });
    }
  }

  function closeWhatsNewCard() {
    if (whatsNewCard) whatsNewCard.style.display = 'none';
    if (whatsNewToggleBtn) whatsNewToggleBtn.classList.remove('active');
    markWhatsNewSeen();
  }

  if (whatsNewCloseBtn) {
    whatsNewCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeWhatsNewCard();
    });
  }

  if (whatsNewToggleBtn) {
    whatsNewToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!whatsNewCard) return;
      const isVisible = whatsNewCard.style.display === 'block';
      if (isVisible) {
        closeWhatsNewCard();
      } else {
        whatsNewCard.style.display = 'block';
        whatsNewToggleBtn.classList.add('active');
        markWhatsNewSeen();
      }
    });
  }

  // 點擊卡片外部區域時自動收起懸浮卡片
  document.addEventListener('click', (e) => {
    if (!whatsNewCard || whatsNewCard.style.display !== 'block') return;
    if (!whatsNewCard.contains(e.target) && e.target !== whatsNewToggleBtn && !whatsNewToggleBtn?.contains(e.target)) {
      closeWhatsNewCard();
    }
  });

  const rateStoreBtn = document.getElementById('rateStoreBtn');
  if (rateStoreBtn) {
    rateStoreBtn.addEventListener('click', () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({
            action: 'telemetry_event',
            eventName: 'popup_rate_clicked',
            params: { version: currentVersion }
          });
        }
      } catch (e) {}
    });
  }

  // 3. 依使用者系統/瀏覽器語言自動推薦預設目標翻譯語言
  function getSystemDefaultTargetLang() {
    const uiLang = ((typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.()) || navigator.language || 'en').toLowerCase();
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

  function showSavedStatus() {
    statusMessage.classList.add('show');
    setTimeout(() => {
      statusMessage.classList.remove('show');
    }, 1500);
  }

  function updateOffsetDisplay() {
    const sign = currentOffset > 0 ? '+' : '';
    offsetDisplay.textContent = `${sign}${currentOffset.toFixed(1)}s`;
  }

  function updateDisabledState(enabled) {
    if (enabled) {
      settingsContent.classList.remove('disabled');
    } else {
      settingsContent.classList.add('disabled');
    }
  }

  // 讀取既有設定 (若為首次安裝，自動適應用戶瀏覽器語言)
  const defaultTargetLang = getSystemDefaultTargetLang();
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    chrome.storage.sync.get({
      extensionEnabled: true,
      targetLang: defaultTargetLang,
      uiSize: 'medium',
      hoverPause: false,
      subtitleOffset: 0
    }, (items) => {
      extensionEnabledCheckbox.checked = items.extensionEnabled;
      targetLangSelect.value = items.targetLang;
      uiSizeSelect.value = items.uiSize;
      hoverPauseCheckbox.checked = items.hoverPause;
      currentOffset = parseFloat(items.subtitleOffset) || 0;
      updateOffsetDisplay();
      updateDisabledState(items.extensionEnabled);
    });
  }

  // 總開關切換
  extensionEnabledCheckbox.addEventListener('change', () => {
    const enabled = extensionEnabledCheckbox.checked;
    updateDisabledState(enabled);
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.set({ extensionEnabled: enabled }, showSavedStatus);
    } else {
      showSavedStatus();
    }
  });

  // 目標翻譯語言切換
  targetLangSelect.addEventListener('change', () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.set({ targetLang: targetLangSelect.value }, showSavedStatus);
    } else {
      showSavedStatus();
    }
  });

  // 字幕與選詞視窗大小切換
  uiSizeSelect.addEventListener('change', () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.set({ uiSize: uiSizeSelect.value }, showSavedStatus);
    } else {
      showSavedStatus();
    }
  });

  // 懸停暫停開關
  hoverPauseCheckbox.addEventListener('change', () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.set({ hoverPause: hoverPauseCheckbox.checked }, showSavedStatus);
    } else {
      showSavedStatus();
    }
  });

  // 時間軸微調：提前 0.2 秒
  offsetMinus.addEventListener('click', () => {
    currentOffset = Math.round((currentOffset + 0.2) * 10) / 10;
    updateOffsetDisplay();
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.set({ subtitleOffset: currentOffset }, showSavedStatus);
    } else {
      showSavedStatus();
    }
  });

  // 時間軸微調：延後 0.2 秒
  offsetPlus.addEventListener('click', () => {
    currentOffset = Math.round((currentOffset - 0.2) * 10) / 10;
    updateOffsetDisplay();
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.set({ subtitleOffset: currentOffset }, showSavedStatus);
    } else {
      showSavedStatus();
    }
  });

  // 時間軸微調：重設為 0
  offsetReset.addEventListener('click', () => {
    currentOffset = 0;
    updateOffsetDisplay();
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.set({ subtitleOffset: 0 }, showSavedStatus);
    } else {
      showSavedStatus();
    }
  });
});
