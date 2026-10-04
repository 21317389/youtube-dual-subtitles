/**
 * test_ui_modules.js
 * 
 * 單元測試：針對抽離後的 UI 模組進行獨立驗證
 * 1. src/ui/subtitle-renderer.js
 * 2. src/ui/tooltip-controller.js
 */

const assert = require('assert');
const {
  DEFAULT_SIZE_MAP,
  applySubtitleSize,
  ensureSubtitleContainer,
  stripOverlappingPrefix,
  renderDualSlotSubtitle,
  hideSubtitle,
  SubtitleRenderer
} = require('../src/ui/subtitle-renderer');

const {
  calculateTooltipPosition,
  ensureTooltipElement,
  ensureToastElement,
  playVideoSnippet,
  HoverPauseManager,
  TooltipController
} = require('../src/ui/tooltip-controller');

// 簡易 Mock DOM 節點
class MockElement {
  constructor(id = '', tag = 'div') {
    this.id = id;
    this.tagName = tag.toUpperCase();
    this.parentElement = null;
    this.children = [];
    this.classList = {
      _classes: new Set(),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
      contains: (c) => this.classList._classes.has(c)
    };
    this.style = {
      _props: {},
      setProperty: (k, v) => { this.style._props[k] = v; },
      getPropertyValue: (k) => this.style._props[k] || '',
      display: '',
      visibility: '',
      left: '',
      top: ''
    };
    this.textContent = '';
    this._listeners = {};
    this.offsetWidth = 230;
    this.offsetHeight = 100;
  }

  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.removeChild(child);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }

  removeEventListener(type, fn) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter(f => f !== fn);
  }

  contains(el) {
    if (!el) return false;
    if (el === this) return true;
    return this.children.some(c => c.contains(el));
  }

  querySelector(selector) {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      const findClass = (node) => {
        if (node.className && node.className.split(' ').includes(cls)) return node;
        for (const child of node.children) {
          const match = findClass(child);
          if (match) return match;
        }
        return null;
      };
      return findClass(this);
    }
    if (selector.startsWith('#')) {
      const targetId = selector.slice(1);
      const findId = (node) => {
        if (node.id === targetId) return node;
        for (const child of node.children) {
          const match = findId(child);
          if (match) return match;
        }
        return null;
      };
      return findId(this);
    }
    return null;
  }
}

class MockDocument {
  constructor() {
    this.documentElement = new MockElement('html', 'html');
    this.elements = new Map();
  }

  createElement(tag) {
    const el = new MockElement('', tag);
    el.ownerDocument = this;
    return el;
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  register(el) {
    if (el.id) this.elements.set(el.id, el);
  }
}

function runUIModuleTests() {
  console.log('========================================================');
  console.log('🧪 執行【Phase 2 UI 模組單元測試 (UI Decoupled Modules)】');
  console.log('========================================================\n');

  // ----------------------------------------------------------------
  // 1. SubtitleRenderer 測試
  // ----------------------------------------------------------------
  console.log('【1. SubtitleRenderer 測試】');
  const mockDoc = new MockDocument();
  const player = mockDoc.createElement('div');
  player.id = 'movie_player';
  mockDoc.register(player);

  // 1.1 字級切換與 CSS 變數檢驗
  applySubtitleSize('large', DEFAULT_SIZE_MAP, mockDoc);
  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue('--cue-orig-size'), '24px');
  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue('--cue-trans-size'), '19px');
  console.log('  - applySubtitleSize CSS 變數設置: ✅ PASS');

  // 1.2 容器掛載檢驗
  const container = ensureSubtitleContainer(player, mockDoc);
  assert.strictEqual(container.id, 'yt-dual-subtitle-container');
  assert.strictEqual(container.parentElement, player);
  mockDoc.register(container);
  console.log('  - ensureSubtitleContainer 掛載: ✅ PASS');

  // 1.3 物理防禦：剝除重複開頭 (stripOverlappingPrefix)
  const prevOrig = 'So I vividly remember';
  const currOrig = 'So I vividly remember my first panic attack';
  const stripped = stripOverlappingPrefix(prevOrig, currOrig);
  assert.strictEqual(stripped, 'my first panic attack');
  console.log('  - stripOverlappingPrefix 重疊剝除: ✅ PASS');

  // 1.4 雙槽渲染與 Trusted Types 文本更新 (renderDualSlotSubtitle)
  let sigChangeCount = 0;
  let trackedFirstSuccess = false;
  const renderRes = renderDualSlotSubtitle(container, 
    { orig: 'First sentence', trans: '第一句' },
    { orig: 'Second sentence', trans: '第二句' },
    {
      player,
      isExtensionEnabled: true,
      isCaptionsEnabled: true,
      onSignatureChange: () => { sigChangeCount++; },
      onFirstRenderSuccess: () => { trackedFirstSuccess = true; }
    }
  );

  assert.strictEqual(renderRes, true);
  assert.strictEqual(container.style.display, 'flex');
  assert.strictEqual(player.classList.contains('yt-dual-sub-active'), true);
  assert.strictEqual(sigChangeCount, 1);
  assert.strictEqual(trackedFirstSuccess, true);

  const prevOrigEl = container.querySelector('.cue-slot-prev').querySelector('.cue-slot-orig');
  const prevTransEl = container.querySelector('.cue-slot-prev').querySelector('.cue-slot-trans');
  const currOrigEl = container.querySelector('.cue-slot-curr').querySelector('.cue-slot-orig');
  const currTransEl = container.querySelector('.cue-slot-curr').querySelector('.cue-slot-trans');

  assert.strictEqual(prevOrigEl.textContent, 'First sentence');
  assert.strictEqual(prevTransEl.textContent, '第一句');
  assert.strictEqual(currOrigEl.textContent, 'Second sentence');
  assert.strictEqual(currTransEl.textContent, '第二句');
  console.log('  - renderDualSlotSubtitle 雙槽原地更新: ✅ PASS');

  // 1.5 抗抖動防塌陷佔位檢驗 (Slot 1 譯文等待中)
  renderDualSlotSubtitle(container,
    { orig: 'Loading translation sentence', trans: '' },
    { orig: 'Current speaking', trans: '當前發言' },
    { player, isExtensionEnabled: true, isCaptionsEnabled: true }
  );
  assert.strictEqual(prevTransEl.textContent, '\u00A0');
  assert.strictEqual(prevTransEl.style.visibility, 'hidden');
  console.log('  - Slot 1 譯文等待中 \\u00A0 佔位防塌陷: ✅ PASS');

  // 1.6 開關停用時隱藏 (isCaptionsEnabled = false)
  renderDualSlotSubtitle(container,
    { orig: 'Disabled cue', trans: '關閉' },
    { orig: '', trans: '' },
    { player, isExtensionEnabled: true, isCaptionsEnabled: false }
  );
  assert.strictEqual(container.style.display, 'none');
  assert.strictEqual(player.classList.contains('yt-dual-sub-active'), false);
  console.log('  - isCaptionsEnabled=false 即時隱藏字幕: ✅ PASS\n');


  // ----------------------------------------------------------------
  // 2. TooltipController 測試
  // ----------------------------------------------------------------
  console.log('【2. TooltipController 測試】');
  
  // 2.1 幾何佈局計算 (calculateTooltipPosition)
  const posNormal = calculateTooltipPosition(
    { left: 100, top: 200, bottom: 220, width: 50, height: 20 },
    { left: 50, top: 50, width: 800, height: 600 },
    230, 100
  );
  assert.strictEqual(posNormal.left, 50); // 100 - 50 = 50
  assert.strictEqual(posNormal.top, 178);  // 220 - 50 + 8 = 178
  console.log('  - calculateTooltipPosition 正常幾何座標計算: ✅ PASS');

  // 2.2 邊界溢出翻轉 (下方溢出時向上反轉)
  const posOverflow = calculateTooltipPosition(
    { left: 750, top: 540, bottom: 560, width: 50, height: 20 },
    { left: 0, top: 0, width: 800, height: 600 },
    230, 100
  );
  // 750 接近右邊界 800 - 230 - 12 = 558
  assert.strictEqual(posOverflow.left, 558);
  // 560 + 100 = 660 > 590，向上反轉
  assert.strictEqual(posOverflow.top, 432); // 540 - 100 - 8 = 432
  console.log('  - calculateTooltipPosition 右方/下方溢出翻轉限制: ✅ PASS');

  // 2.3 元素安全掛載
  const tooltip = ensureTooltipElement(player, mockDoc);
  assert.strictEqual(tooltip.id, 'yt-translate-tooltip');
  assert.strictEqual(tooltip.style.display, 'none');
  mockDoc.register(tooltip);

  const toast = ensureToastElement(player, mockDoc);
  assert.strictEqual(toast.id, 'yt-dual-warning-toast');
  mockDoc.register(toast);
  console.log('  - Tooltip & Toast 元素掛載: ✅ PASS');

  // 2.4 HoverPauseManager 穩定引用與事件防洩漏
  let videoPaused = false;
  let videoPlayed = false;
  const mockVideo = {
    paused: false,
    ended: false,
    pause: () => { videoPaused = true; mockVideo.paused = true; },
    play: async () => { videoPlayed = true; mockVideo.paused = false; }
  };

  const hoverManager = new HoverPauseManager({
    getVideo: () => mockVideo,
    isHoverPauseEnabled: () => true,
    getElements: () => [container, tooltip]
  });

  hoverManager.handleMouseEnter();
  assert.strictEqual(videoPaused, true);
  assert.strictEqual(hoverManager.wasPlayingBeforeHover, true);
  console.log('  - HoverPauseManager 懸停暫停播放器: ✅ PASS');

  // 測試在兩元素間游移不觸發中途續播
  hoverManager.handleMouseLeave({ relatedTarget: tooltip });
  assert.strictEqual(hoverManager.isHovering, true);
  console.log('  - 字幕與 Tooltip 互移維持暫停: ✅ PASS');

  // 移除監聽器不殘留
  hoverManager.bind([container, tooltip]);
  assert.strictEqual(container._listeners['mouseenter'].length, 1);
  hoverManager.unbind([container, tooltip]);
  assert.strictEqual(container._listeners['mouseenter'].length, 0);
  console.log('  - Hover 事件監聽綁定與解綁無洩漏: ✅ PASS');

  console.log('\n========================================================');
  console.log('🏆 Phase 2 UI 模組單元測試全部通過！(All UI Modules Solid)');
  console.log('========================================================\n');
}

if (require.main === module) {
  runUIModuleTests();
}

module.exports = { runUIModuleTests };
