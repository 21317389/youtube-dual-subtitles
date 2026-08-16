/**
 * popup.js - 擴充功能設定面板邏輯
 * 職責：管理總開關、目標語言、字幕與選詞視窗大小、同步時間軸微調、懸停暫停開關
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

  let currentOffset = 0;

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

  // 讀取既有設定 (extensionEnabled 預設為 true)
  chrome.storage.sync.get({
    extensionEnabled: true,
    targetLang: 'zh-TW',
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

  // 總開關切換
  extensionEnabledCheckbox.addEventListener('change', () => {
    const enabled = extensionEnabledCheckbox.checked;
    updateDisabledState(enabled);
    chrome.storage.sync.set({ extensionEnabled: enabled }, showSavedStatus);
  });

  // 目標翻譯語言切換
  targetLangSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ targetLang: targetLangSelect.value }, showSavedStatus);
  });

  // 字幕與選詞視窗大小切換
  uiSizeSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ uiSize: uiSizeSelect.value }, showSavedStatus);
  });

  // 懸停暫停開關
  hoverPauseCheckbox.addEventListener('change', () => {
    chrome.storage.sync.set({ hoverPause: hoverPauseCheckbox.checked }, showSavedStatus);
  });

  // 時間軸微調：提前 0.2 秒
  offsetMinus.addEventListener('click', () => {
    currentOffset = Math.round((currentOffset + 0.2) * 10) / 10;
    updateOffsetDisplay();
    chrome.storage.sync.set({ subtitleOffset: currentOffset }, showSavedStatus);
  });

  // 時間軸微調：延後 0.2 秒
  offsetPlus.addEventListener('click', () => {
    currentOffset = Math.round((currentOffset - 0.2) * 10) / 10;
    updateOffsetDisplay();
    chrome.storage.sync.set({ subtitleOffset: currentOffset }, showSavedStatus);
  });

  // 時間軸微調：重設為 0
  offsetReset.addEventListener('click', () => {
    currentOffset = 0;
    updateOffsetDisplay();
    chrome.storage.sync.set({ subtitleOffset: 0 }, showSavedStatus);
  });
});
