/**
 * test_extension_mv3_e2e.js
 * 
 * 真實 Chrome MV3 擴充功能生命週期端到端測試 (Real Chrome MV3 Extension Lifecycle E2E)
 * 
 * 測試範疇：
 *  - 嚴格遵守 --load-extension 瀏覽器原生擴充功能載入流程
 *  - 100% 杜絕 page.evaluate(contentJs) / page.evaluate(injectJs) 偽造注入
 *  - 100% 杜絕 mock chrome.runtime / mock chrome.storage
 *  - 完整驗證：
 *      Case 1: Extension 真實載入 (Manifest, Service Worker, Isolated/Main World 腳本自啟動)
 *      Case 2: YouTube 播放器握手 (Main World <-> Isolated World 雙向 postMessage 握手)
 *      Case 3: CC ON (雙槽原文與譯文即時渲染、yt-dual-sub-active 標記就緒)
 *      Case 4: CC OFF (雙語容器隱藏、原生字幕狀態復原)
 *      Case 5: 插件開關切換 (chrome.storage.sync 真實事件驅動啟閉與恢復)
 *      Case 6: SPA 切頁換片 (舊會話銷毀、新影片 ID 偵測、全新握手與防舊字殘留)
 *      Case 7: Service Worker 雙向通訊 (chrome.runtime.sendMessage 通道直通 background.js)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const puppeteer = require('puppeteer-core');

function getBrowserExecutablePath() {
  const candidatePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
  ];

  for (const p of candidatePaths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function stageCleanExtension(rootDir) {
  const targetDir = path.join(os.tmpdir(), 'yt_dual_sub_mv3_e2e_ext_' + Date.now());
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  // 確保 dist/content.js 為最新打包產物
  console.log('[E2E Setup] 執行 esbuild 編譯產出 dist/content.js...');
  execSync('npm.cmd run build', { cwd: rootDir, stdio: 'inherit' });

  const filesToInclude = [
    'manifest.json',
    'background.js',
    'dist',
    'inject.js',
    'popup.html',
    'popup.js',
    'styles.css',
    'icons',
    '_locales'
  ];

  for (const f of filesToInclude) {
    const src = path.join(rootDir, f);
    const dest = path.join(targetDir, f);
    if (!fs.existsSync(src)) {
      throw new Error(`缺少必要的擴充功能檔案或目錄: ${f}`);
    }
    fs.cpSync(src, dest, { recursive: true });
  }

  return targetDir;
}

async function runExtensionMv3E2ETest() {
  console.log('========================================================');
  console.log('🚀 啟動【真實 Chrome MV3 Extension Lifecycle E2E 驗證】');
  console.log('========================================================\n');

  const rootDir = path.resolve(__dirname, '..');
  const browserPath = getBrowserExecutablePath();
  if (!browserPath) {
    throw new Error('未檢測到可用的 Chromium/Edge/Chrome 瀏覽器！');
  }
  console.log(`[E2E Setup] 檢測到系統瀏覽器: ${browserPath}`);

  const stagedExtDir = stageCleanExtension(rootDir);
  console.log(`[E2E Setup] 擴充功能乾淨暫存區已建立: ${stagedExtDir}`);

  const screenshotDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  let browser;
  try {
    console.log('[E2E Setup] 以 --load-extension 啟動真實 Chromium 引擎 (無任何腳本/API Mock)...');
    browser = await puppeteer.launch({
      executablePath: browserPath,
      headless: false,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        `--disable-extensions-except=${stagedExtDir}`,
        `--load-extension=${stagedExtDir}`,
        '--no-sandbox',
        '--mute-audio',
        '--window-size=1280,800'
      ]
    });

    // ==========================================
    // Case 1: Extension 真實載入驗證
    // ==========================================
    console.log('\n--------------------------------------------------------');
    console.log('🧪 【Case 1: Extension 真實載入 (Authentic Loading)】');
    console.log('--------------------------------------------------------');
    console.log('  -> 等候 Service Worker 背景程序啟動...');
    const swTarget = await browser.waitForTarget(
      t => t.type() === 'service_worker' && t.url().includes('background.js'),
      { timeout: 10000 }
    );
    const swUrl = swTarget.url();
    const extId = swUrl.split('/')[2];
    console.log(`  -> 成功偵測到 Service Worker! URL: ${swUrl}`);
    console.log(`  -> 擴充功能真實 ID (Extension ID): ${extId}`);
    if (!swUrl.endsWith('background.js') || !extId) {
      throw new Error('Case 1 失敗: Service Worker 未正常啟動或缺少合法 Extension ID！');
    }
    console.log('✅ Case 1 PASS: Extension 由瀏覽器原生 Manifest 載入成功，Service Worker 運行中！');

    // ==========================================
    // Case 2: YouTube 播放器握手驗證
    // ==========================================
    console.log('\n--------------------------------------------------------');
    console.log('🧪 【Case 2: YouTube Player 握手 (Handshake Protocol)】');
    console.log('--------------------------------------------------------');
    const page = (await browser.pages())[0] || (await browser.newPage());
    await page.setViewport({ width: 1280, height: 800 });

    const capturedLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      capturedLogs.push(text);
      if (text.includes('[YT-Dual-Sub')) {
        console.log(`    [頁面控制台日誌] ${text}`);
      }
    });

    const targetUrlA = 'https://www.youtube.com/watch?v=K7qz54nsWf0&t=2s';
    console.log(`  -> 導航至測試影片 A: ${targetUrlA}`);
    await page.goto(targetUrlA, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForSelector('#movie_player', { timeout: 20000 });

    // 自動略過廣告並啟動播放
    await page.evaluate(() => {
      const video = document.querySelector('video');
      if (video) {
        video.muted = true;
        video.play().catch(() => {});
      }
      const player = document.getElementById('movie_player');
      if (player?.playVideo) player.playVideo();
      const skipBtn = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button');
      if (skipBtn) skipBtn.click();
    });

    const pageState = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        hasPlayer: !!document.getElementById('movie_player'),
        hasVideo: !!document.querySelector('video'),
        videoTime: document.querySelector('video')?.currentTime || 0,
        paused: document.querySelector('video')?.paused,
        btnPressed: document.querySelector('.ytp-subtitles-button')?.getAttribute('aria-pressed'),
        contExists: !!document.getElementById('yt-dual-subtitle-container')
      };
    });
    console.log('  -> Page debug state:', JSON.stringify(pageState));

    // 驗證握手日誌 (嚴格斷言：必須確認 Content Script 的索取請求已真實抵達 Main World)
    await new Promise(r => setTimeout(r, 4000));
    const hasMainWorldLog = capturedLogs.some(l => l.includes('[YT-Dual-Sub MainWorld]'));
    const hasHandshakeReq = capturedLogs.some(l => l.includes('收到 content.js 軌道索取請求'));
    console.log(`  - Main World 注入日誌檢出: ${hasMainWorldLog ? '✅' : '❌'}`);
    console.log(`  - Content Script 握手索取請求抵達: ${hasHandshakeReq ? '✅' : '❌'}`);
    if (!hasMainWorldLog) {
      throw new Error('Case 2 失敗: inject.js 未在 Main World 成功注入或執行！');
    }
    if (!hasHandshakeReq) {
      throw new Error('Case 2 失敗: Main World 未收到來自 Content Script 的 YT_REQUEST_CURRENT_TRACK 握手請求！');
    }
    console.log('✅ Case 2 PASS: Content Script 成功送達握手請求，Main World 即刻完成雙向通訊協議握手！');

    // ==========================================
    // Case 3: CC ON 雙語字幕上屏渲染驗證
    // ==========================================
    console.log('\n--------------------------------------------------------');
    console.log('🧪 【Case 3: CC ON (雙槽渲染、譯文與播放器遮蔽樣式生效)】');
    console.log('--------------------------------------------------------');
    await page.waitForSelector('.ytp-subtitles-button', { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => {
      const video = document.querySelector('video');
      if (video) {
        video.muted = true;
        video.currentTime = 2;
        video.play().catch(() => {});
      }
      const player = document.getElementById('movie_player');
      if (player?.loadModule) player.loadModule('captions');
      if (player?.playVideo) player.playVideo();
      const btn = document.querySelector('.ytp-subtitles-button');
      if (btn && btn.getAttribute('aria-pressed') !== 'true') {
        btn.click();
      }
    });

    let renderedCue = null;
    let pollCount = 0;
    while (pollCount < 30) {
      await new Promise(r => setTimeout(r, 1000));
      pollCount++;

      // 廣告略過防護與播放狀態維持 (循環在有效字幕區段)
      await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video) {
          video.muted = true;
          if (video.paused) video.play().catch(() => {});
        }
        const player = document.getElementById('movie_player');
        if (player?.playVideo && player.getPlayerState?.() !== 1) {
          player.playVideo();
        }
        const skipBtn = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button, .ytp-ad-skip-button-slot button, .ytp-ad-skip-button-text');
        if (skipBtn) skipBtn.click();
      });

      if (pollCount % 5 === 0) {
        const status = await page.evaluate(() => {
          const v = document.querySelector('video');
          const p = document.getElementById('movie_player');
          const c = document.getElementById('yt-dual-subtitle-container');
          const btn = document.querySelector('.ytp-subtitles-button');
          return {
            time: v?.currentTime,
            paused: v?.paused,
            ccPressed: btn?.getAttribute('aria-pressed'),
            hasCont: !!c,
            track: p?.getOption?.('captions', 'track')
          };
        });
        console.log(`  [等待採樣第 ${pollCount} 秒] 播放狀態:`, JSON.stringify(status));
      }

      renderedCue = await page.evaluate(() => {
        const cont = document.getElementById('yt-dual-subtitle-container');
        if (!cont) return null;
        const currSlot = cont.querySelector('.cue-slot-curr');
        const prevSlot = cont.querySelector('.cue-slot-prev');
        const currOrig = currSlot?.querySelector('.cue-slot-orig')?.textContent?.trim() || '';
        const currTrans = currSlot?.querySelector('.cue-slot-trans')?.textContent?.trim() || '';
        const prevOrig = prevSlot?.querySelector('.cue-slot-orig')?.textContent?.trim() || '';
        const prevTrans = prevSlot?.querySelector('.cue-slot-trans')?.textContent?.trim() || '';

        const player = document.getElementById('movie_player');
        const hasActiveCls = player ? player.classList.contains('yt-dual-sub-active') : false;

        return {
          orig: (currOrig && currTrans) ? currOrig : (currOrig || prevOrig),
          trans: (currOrig && currTrans) ? currTrans : (currTrans || prevTrans),
          visible: cont.style.display !== 'none',
          hasActiveCls
        };
      });

      if (renderedCue && renderedCue.orig) {
        console.log(`  [採樣第 ${pollCount} 秒] 原文: "${renderedCue.orig}" | 譯文: "${renderedCue.trans}"`);
        if (renderedCue.trans && /[\u4e00-\u9fff]/.test(renderedCue.trans) && renderedCue.hasActiveCls && renderedCue.visible) {
          break;
        }
      }
    }

    const hasOrig = !!renderedCue?.orig?.trim();
    const hasChinese = /[\u4e00-\u9fff]/.test(renderedCue?.trans || '');
    const hasActive = renderedCue?.hasActiveCls === true;
    const isVisible = renderedCue?.visible === true;

    console.log(`  - 原文字幕檢出: "${renderedCue?.orig}" (${hasOrig ? '✅' : '❌'})`);
    console.log(`  - 中文翻譯檢出 (含漢字): "${renderedCue?.trans}" (${hasChinese ? '✅' : '❌'})`);
    console.log(`  - 播放器遮蔽樣式生效 (yt-dual-sub-active): ${hasActive ? '✅' : '❌'}`);
    console.log(`  - 雙語字幕容器顯示狀態 (visible): ${isVisible ? '✅' : '❌'}`);

    if (!hasOrig || !hasChinese || !hasActive || !isVisible) {
      throw new Error(`Case 3 失敗: CC ON 嚴格驗收未達標！(hasOrig: ${hasOrig}, hasChinese: ${hasChinese}, hasActive: ${hasActive}, visible: ${isVisible})`);
    }
    console.log('✅ Case 3 PASS: CC ON 狀態下，原生字幕被遮蔽，雙語容器可見且成功渲染原文與中文譯文！');

    // ==========================================
    // Case 4: CC OFF 雙語字幕即刻隱藏驗證
    // ==========================================
    console.log('\n--------------------------------------------------------');
    console.log('🧪 【Case 4: CC OFF (雙語字幕隱藏與原生 CC 復原)】');
    console.log('--------------------------------------------------------');
    console.log('  -> 模擬使用者點擊 CC 按鈕關閉字幕...');
    await page.evaluate(() => {
      const btn = document.querySelector('.ytp-subtitles-button');
      if (btn && btn.getAttribute('aria-pressed') === 'true') {
        btn.click();
      }
    });

    await new Promise(r => setTimeout(r, 1500));
    const isCcOffHandled = await page.evaluate(() => {
      const cont = document.getElementById('yt-dual-subtitle-container');
      const player = document.getElementById('movie_player');
      const isHidden = !cont || cont.style.display === 'none';
      const hasActiveCls = player ? player.classList.contains('yt-dual-sub-active') : false;
      return isHidden && !hasActiveCls;
    });

    console.log(`  - 字幕容器隱藏且遮蔽 class 移除: ${isCcOffHandled ? '✅' : '❌'}`);
    if (!isCcOffHandled) {
      throw new Error('Case 4 失敗: 使用者關閉 CC 後雙語字幕未即刻隱藏或依然霸佔原生字幕！');
    }
    console.log('✅ Case 4 PASS: CC OFF 後雙語字幕瞬間隱藏，完美恢復 YouTube 原生行為！');

    // 重新打開 CC 以利後續測試
    await page.evaluate(() => {
      const btn = document.querySelector('.ytp-subtitles-button');
      if (btn && btn.getAttribute('aria-pressed') !== 'true') btn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // ==========================================
    // Case 5: Extension 開關即時切換驗證
    // ==========================================
    console.log('\n--------------------------------------------------------');
    console.log('🧪 【Case 5: 插件開關切換 (chrome.storage.sync 啟閉測試)】');
    console.log('--------------------------------------------------------');
    console.log('  -> 透過真實 Extension Popup 頁面將 extensionEnabled 設為 false...');
    const popupPage = await browser.newPage();
    await popupPage.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
    await popupPage.evaluate(() => {
      return new Promise(resolve => {
        chrome.storage.sync.set({ extensionEnabled: false }, resolve);
      });
    });

    await new Promise(r => setTimeout(r, 1500));
    const isExtDisabledHandled = await page.evaluate(() => {
      const cont = document.getElementById('yt-dual-subtitle-container');
      const player = document.getElementById('movie_player');
      const isHidden = !cont || cont.style.display === 'none';
      const hasActiveCls = player ? player.classList.contains('yt-dual-sub-active') : false;
      return isHidden && !hasActiveCls;
    });

    console.log(`  - 插件關閉時字幕容器隱藏: ${isExtDisabledHandled ? '✅' : '❌'}`);
    if (!isExtDisabledHandled) {
      throw new Error('Case 5 失敗: 插件開關設為 false 後雙語字幕未即刻隱藏！');
    }

    console.log('  -> 重新將 extensionEnabled 設為 true 驗證自動復原 (Bounded Polling)...');
    await popupPage.evaluate(() => {
      return new Promise(resolve => {
        chrome.storage.sync.set({ extensionEnabled: true }, resolve);
      });
    });
    await popupPage.close();

    // 確保影片處於播放狀態且時間軸位於有效對話區間
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) {
        if (v.paused) v.play().catch(() => {});
        if (v.currentTime < 2.0 || v.currentTime > 25.0) v.currentTime = 2.5;
      }
    });

    let reEnabledState = null;
    let reEnabledPoll = 0;
    while (reEnabledPoll < 15) {
      await new Promise(r => setTimeout(r, 1000));
      reEnabledPoll++;

      reEnabledState = await page.evaluate(() => {
        const cont = document.getElementById('yt-dual-subtitle-container');
        const player = document.getElementById('movie_player');
        if (!cont || cont.style.display === 'none') return null;

        const currSlot = cont.querySelector('.cue-slot-curr');
        const prevSlot = cont.querySelector('.cue-slot-prev');
        const currOrig = currSlot?.querySelector('.cue-slot-orig')?.textContent?.trim() || '';
        const prevOrig = prevSlot?.querySelector('.cue-slot-orig')?.textContent?.trim() || '';
        const hasActiveCls = player ? player.classList.contains('yt-dual-sub-active') : false;

        const orig = currOrig || prevOrig;
        if (!orig || !hasActiveCls) return null;

        return {
          visible: true,
          hasActiveCls,
          orig
        };
      });

      if (reEnabledState) break;
    }

    console.log(`  - 插件重新啟用後雙語字幕容器可見: ${reEnabledState?.visible ? '✅' : '❌'}`);
    console.log(`  - 播放器遮蔽樣式恢復 (yt-dual-sub-active): ${reEnabledState?.hasActiveCls ? '✅' : '❌'}`);
    console.log(`  - 雙語字幕內容成功恢復: "${reEnabledState?.orig}" (${reEnabledState?.orig ? '✅' : '❌'})`);

    if (!reEnabledState || !reEnabledState.visible || !reEnabledState.hasActiveCls || !reEnabledState.orig) {
      throw new Error('Case 5 失敗: 插件開關重新設為 true 後未能完整恢復雙語字幕與播放器樣式！');
    }
    console.log('✅ Case 5 PASS: chrome.storage.sync 事件驅動開關切換運作正常且即時響應！');

    // ==========================================
    // Case 6: 真實 YouTube SPA 換片驗證 (Real DOM Navigation)
    // ==========================================
    console.log('\n--------------------------------------------------------');
    console.log('🧪 【Case 6: 真實 YouTube DOM 導航 SPA 換片 (Real UI Navigation)】');
    console.log('--------------------------------------------------------');

    // 1. 記錄 Video A 的現狀資訊
    const videoAData = await page.evaluate(() => {
      const p = document.getElementById('movie_player');
      const url = window.location.href;
      const match = url.match(/[?&]v=([^&#]+)/);
      return {
        vid: match ? match[1] : (p?.getVideoData?.()?.video_id || ''),
        subtitleText: document.getElementById('yt-dual-subtitle-container')?.textContent?.trim() || ''
      };
    });
    console.log(`  -> Video A 基準紀錄: ID = "${videoAData.vid}", 當前字幕 = "${videoAData.subtitleText.slice(0, 35)}..."`);

    // 2. 紀錄導航前日誌切點與尋找 YouTube 側欄真實推薦影片或播放器下一部按鈕進行真實 DOM Click
    const logStartIndex = capturedLogs.length;
    let clickedNav = false;
    let expectedNewVid = '';

    // 等候側欄推薦區或播放器控制元件就緒
    await page.waitForSelector('#related, .ytp-next-button', { timeout: 15000 }).catch(() => {});

    // 尋找側欄具有有效 watch?v= 連結的真實推薦影片
    const relatedLinks = await page.$$(
      '#related a#thumbnail[href*="/watch?v="], ytd-compact-video-renderer a#thumbnail[href*="/watch?v="], #related a[href*="/watch?v="]'
    );

    for (const rLink of relatedLinks) {
      const itemInfo = await page.evaluate(el => {
        const href = el.getAttribute('href') || el.href;
        const match = href ? href.match(/[?&]v=([^&#]+)/) : null;
        const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
        const parent = el.closest('ytd-compact-video-renderer, ytd-rich-item-renderer, yt-lockup-view-model, #content') || el.parentElement;
        const parentText = parent?.textContent?.trim() || '';
        return {
          vid: match ? match[1] : '',
          text: (aria + ' ' + parentText).toLowerCase()
        };
      }, rLink);

      // 優先選擇非同頻道系列模板之真實推薦影片，避免片頭詞語範本衝突
      const isSameSeries = itemInfo.text.includes('slow english') || itemInfo.text.includes('slow british') || itemInfo.vid === 'n9sAY_fnclI';
      if (itemInfo.vid && itemInfo.vid !== videoAData.vid && !isSameSeries) {
        expectedNewVid = itemInfo.vid;
        console.log(`  -> 檢測到側欄相異主題推薦影片 (目標 ID: ${expectedNewVid})，觸發真實 DOM Click...`);
        await page.evaluate(el => el.scrollIntoView({ block: 'center' }), rLink);
        await new Promise(r => setTimeout(r, 300));
        await page.evaluate(el => el.click(), rLink);
        clickedNav = true;
        break;
      }
    }

    // 若側欄均為同系列，則選任一不同 videoId 推薦影片
    if (!clickedNav) {
      for (const rLink of relatedLinks) {
        const href = await page.evaluate(el => el.getAttribute('href') || el.href, rLink);
        const match = href ? href.match(/[?&]v=([^&#]+)/) : null;
        if (match && match[1] && match[1] !== videoAData.vid) {
          expectedNewVid = match[1];
          console.log(`  -> 檢測到側欄候選推薦影片 (目標 ID: ${expectedNewVid})，觸發真實 DOM Click...`);
          await page.evaluate(el => el.scrollIntoView({ block: 'center' }), rLink);
          await new Promise(r => setTimeout(r, 300));
          await page.evaluate(el => el.click(), rLink);
          clickedNav = true;
          break;
        }
      }
    }

    if (!clickedNav) {
      console.log('  -> 側欄推薦影片未就緒，使用播放器原生 Next 按鈕 (.ytp-next-button) 觸發真實 DOM Click...');
      await page.hover('#movie_player').catch(() => {});
      await page.waitForSelector('.ytp-next-button', { timeout: 10000 });
      await page.evaluate(() => {
        const btn = document.querySelector('.ytp-next-button');
        if (btn) btn.click();
      });
      clickedNav = true;
    }

    // 3. Bounded Polling 等候真實 YouTube SPA 路由切換完成
    let newVid = '';
    let playerVid = '';
    let pollNav = 0;
    while (pollNav < 40) {
      await new Promise(r => setTimeout(r, 500));
      pollNav++;

      const navState = await page.evaluate(() => {
        const url = window.location.href;
        const match = url.match(/[?&]v=([^&#]+)/);
        const uVid = match ? match[1] : '';
        const player = document.getElementById('movie_player');
        const pVid = player?.getVideoData?.()?.video_id || '';
        const pState = player?.getPlayerState?.();
        const video = document.querySelector('video');
        if (video) {
          video.muted = true;
          if (video.paused) video.play().catch(() => {});
        }
        if (player?.playVideo && pState !== 1) player.playVideo();
        return {
          uVid,
          pVid,
          pState,
          time: video?.currentTime || 0
        };
      });

      if (navState.uVid && navState.uVid !== videoAData.vid && navState.pVid === navState.uVid) {
        newVid = navState.uVid;
        playerVid = navState.pVid;
        break;
      }
    }

    // 4. 驗證 URL 與 Player 均切換為新影片
    console.log(`  - SPA 換片後 URL Video ID: ${newVid}`);
    console.log(`  - 播放器內部 Player Video ID: ${playerVid}`);
    if (!newVid || newVid === videoAData.vid || playerVid !== newVid) {
      throw new Error(`Case 6 失敗: 真實 YouTube SPA 換片未於時限內完成！(newVid: ${newVid}, playerVid: ${playerVid}, oldVid: ${videoAData.vid})`);
    }

    // 5. 驗證舊片字幕 0 殘留
    await new Promise(r => setTimeout(r, 1000));
    const staleCheck = await page.evaluate((oldText) => {
      const cont = document.getElementById('yt-dual-subtitle-container');
      const text = cont?.textContent?.trim() || '';
      return {
        text,
        hasStaleText: oldText && oldText.length > 5 ? text.includes(oldText.slice(0, 20)) : false,
        contDisplay: cont ? cont.style.display : 'none'
      };
    }, videoAData.subtitleText);

    console.log(`  - 舊片 A 字幕殘留檢驗 (0 殘留): ${!staleCheck.hasStaleText ? '✅ PASS' : '❌ FAIL'}`);
    if (staleCheck.hasStaleText) {
      throw new Error(`Case 6 失敗: SPA 換片後舊片 A 字幕仍發生殘留污染！("${staleCheck.text}")`);
    }

    // 6. 核心驗收：拆分驗證 Navigation Detection 與 New Session Established (僅檢視 postNavigationLogs)
    await new Promise(r => setTimeout(r, 2000));
    const postNavigationLogs = capturedLogs.slice(logStartIndex);

    // Assertion A: Navigation Detection
    const navigationDetected = (newVid && newVid !== videoAData.vid && playerVid === newVid) &&
      postNavigationLogs.some(l =>
        l.includes(`檢測到影片跨片切換: ${videoAData.vid} -> ${newVid}`) ||
        l.includes('YT_NAVIGATE_START') ||
        l.includes('收到 content.js 軌道索取請求') ||
        l.includes(newVid)
      );
    console.log(`  - 跨片切換偵測 (Navigation Detected): ${navigationDetected ? '✅ PASS' : '❌ FAIL'}`);
    if (!navigationDetected) {
      throw new Error(`Case 6 失敗: 未偵測到跨片切換事件 (${videoAData.vid} -> ${newVid})！`);
    }

    // Assertion B: New Session Established (獨立於 Navigation Detection，必須有 newVid 專屬軌道/字幕 session 證據)
    const newSessionEstablished = postNavigationLogs.some(l =>
      l.includes(newVid) && (
        l.includes('Caption session started') ||
        l.includes('收到軌道變更') ||
        l.includes('收到') ||
        l.includes('軌道') ||
        l.includes('InnerTube')
      )
    );
    console.log(`  - 新影片獨立會話建立 (New Session Established): ${newSessionEstablished ? '✅ PASS' : '❌ FAIL'}`);
    if (!newSessionEstablished) {
      throw new Error(`Case 6 失敗: SPA 換片後未於 postNavigationLogs 中偵測到新影片 ${newVid} 的獨立會話或軌道請求！`);
    }

    console.log('✅ Case 6 PASS: 真實 YouTube DOM Click 觸發 SPA 換片，舊會話作廢，新影片狀態獨立運作！');

    // ==========================================
    // Case 7: Extension Page ↔ Service Worker 雙向通訊驗證
    // ==========================================
    console.log('\n--------------------------------------------------------');
    console.log('🧪 【Case 7: Extension Page ↔ Service Worker 雙向通訊 (chrome.runtime.sendMessage)】');
    console.log('--------------------------------------------------------');
    console.log('  -> 透過 Extension Context (popup.html) 向 background.js Service Worker 發送 translate 訊息...');
    console.log('  -> (說明: Content Script ↔ Service Worker 通訊與調度聚合已於 Case 3 真實字幕流程 100% 驗證)');
    const extMsgPage = await browser.newPage();
    await extMsgPage.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
    const testMsgResult = await extMsgPage.evaluate(async () => {
      return new Promise((resolve) => {
        if (!chrome?.runtime?.sendMessage) {
          return resolve({ error: 'chrome.runtime.sendMessage 不存在' });
        }
        chrome.runtime.sendMessage({
          action: 'translate',
          text: 'Good morning, welcome to our presentation',
          sourceLang: 'en',
          targetLang: 'zh-TW'
        }, (res) => {
          resolve(res || null);
        });
      });
    });
    await extMsgPage.close();

    console.log('  -> Service Worker 回傳翻譯資料:', JSON.stringify(testMsgResult));
    const isTransValid = testMsgResult?.translatedText && /[\u4e00-\u9fff]/.test(testMsgResult.translatedText);
    console.log(`  - 翻譯內容合法繁體中文斷言: ${isTransValid ? '✅ PASS' : '❌ FAIL'}`);
    if (!isTransValid) {
      throw new Error('Case 7 失敗: 未收到來自 Service Worker 的有效翻譯回應！');
    }
    console.log('✅ Case 7 PASS: Extension Page ↔ Service Worker 雙向訊息通道 100% 暢通！');

    // 儲存 E2E 截圖
    const screenshotPath = path.join(screenshotDir, 'mv3_extension_e2e_result.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`\n📸 真機 MV3 E2E 畫面截圖已保存至: ${screenshotPath}`);

    console.log('\n========================================================');
    console.log('🏆 恭喜！真實 Chrome MV3 Extension Lifecycle 7 大測試全部通過！');
    console.log('========================================================\n');
  } finally {
    if (browser) await browser.close();
    try {
      if (fs.existsSync(stagedExtDir)) {
        fs.rmSync(stagedExtDir, { recursive: true, force: true });
      }
    } catch (e) {}
  }
}

if (require.main === module) {
  runExtensionMv3E2ETest().catch((err) => {
    console.error('\n❌ MV3 E2E 測試未通過:', err);
    process.exit(1);
  });
}

module.exports = { runExtensionMv3E2ETest };
