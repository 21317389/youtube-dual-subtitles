/**
 * test_background_reliability.js
 * 
 * 背景服務 (background.js) 高可靠性與容錯機制測試 (Priority 6)
 * 
 * 測試範疇：
 * 1. 端點自動輪替 (Endpoint Rotation): Endpoint 1 失敗時自動切換至 Endpoint 2 成功回傳
 * 2. HTTP 失敗防禦 (HTTP 429 / 5xx): 端點全數失敗時不卡死 callback，正確 reject / 回傳 error
 * 3. 超時熔斷保護 (Timeout AbortController): 模擬端點懸掛，驗證 AbortController 觸發並切換備用端點
 * 4. LRU 快取機制: 驗證讀取重排 (Access Reordering) 與滿額剔除 (Eviction) 邏輯
 */

const assert = require('assert');
const {
  CONFIG,
  ENDPOINTS,
  translationCache,
  setCache,
  requestTranslationWithFallback,
  handleRuntimeMessage
} = require('../background');

async function runBackgroundReliabilityTest() {
  console.log('========================================================');
  console.log('🧪 執行【背景翻譯可靠性與端點容錯測試 (Priority 6)】');
  console.log('========================================================\n');

  const originalFetch = global.fetch;
  const originalSetTimeout = global.setTimeout;

  // ------------------------------------------------------------------
  // 1. 端點自動輪替 (Endpoint Rotation)
  // ------------------------------------------------------------------
  console.log('【1. 端點自動輪替 (Endpoint Rotation) 檢驗】');
  let fetchedUrls = [];

  global.fetch = async (url, options) => {
    fetchedUrls.push(url);
    if (url.includes('translate.googleapis.com/translate_a/single') && !url.includes('dj=1')) {
      // Endpoint 1 (googleapis-gtx-array) 模擬伺服器 500 錯誤
      return {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      };
    }
    if (url.includes('clients5.google.com/translate_a/t')) {
      // Endpoint 2 (clients5-dict-chrome-ex) 成功回傳
      return {
        ok: true,
        json: async () => [['Rotation Success']]
      };
    }
    return { ok: false, status: 404, statusText: 'Not Found' };
  };

  const result1 = await requestTranslationWithFallback('Hello', 'en', 'zh-TW');
  assert.strictEqual(result1, 'Rotation Success', 'Endpoint 1 失敗後應自動輪替至 Endpoint 2 並成功取得譯文');
  assert.strictEqual(fetchedUrls.length >= 2, true, '必須嘗試過至少兩個端點');
  console.log('  - 第一端點 500 異常 -> 自動切換第二端點成功回傳: ✅ PASS\n');

  // ------------------------------------------------------------------
  // 2. HTTP 429 限流與全端點失敗不卡死 callback
  // ------------------------------------------------------------------
  console.log('【2. HTTP 429 / 5xx 全端點失敗不卡死檢驗】');
  global.fetch = async () => ({
    ok: false,
    status: 429,
    statusText: 'Too Many Requests'
  });

  // 2.1 驗證 requestTranslationWithFallback 拋出異常而非卡住
  let errorCaught = null;
  try {
    await requestTranslationWithFallback('Hello', 'en', 'zh-TW');
  } catch (err) {
    errorCaught = err;
  }
  assert.ok(errorCaught, '全端點 429 失敗時必須拋出 Error');
  assert.strictEqual(errorCaught.message.includes('429'), true, '錯誤訊息應包含 HTTP 429');

  // 2.2 驗證 handleRuntimeMessage 回調函式不會懸掛
  let callbackResponse = null;
  const dummyRequest = { action: 'translate', text: 'TestFail', sourceLang: 'en', targetLang: 'zh-TW' };
  translationCache.clear();

  const isAsync = handleRuntimeMessage(dummyRequest, {}, (res) => {
    callbackResponse = res;
  });
  assert.strictEqual(isAsync, true, '非同步翻譯請求應回傳 true');

  // 等待非同步 Promise catch 執行完畢
  await new Promise(r => setTimeout(r, 50));
  assert.ok(callbackResponse, '翻譯失敗時 sendResponse callback 必須被呼叫');
  assert.ok(callbackResponse.error, '回傳物件必須包含 error 欄位');
  console.log('  - 全端點 429/5xx 失敗時 Promise 正常拒絕: ✅ PASS');
  console.log('  - 監聽器 sendResponse callback 即時回傳不懸掛: ✅ PASS\n');

  // ------------------------------------------------------------------
  // 3. 超時熔斷保護 (Timeout AbortController)
  // ------------------------------------------------------------------
  console.log('【3. 超時熔斷保護 (Timeout AbortController) 檢驗】');
  let abortSignalReceived = false;

  // 模擬計時器：當偵測到設定 FETCH_TIMEOUT_MS (2500ms) 時，立即以 setImmediate 觸發 abort
  global.setTimeout = (fn, delay) => {
    if (delay === CONFIG.FETCH_TIMEOUT_MS) {
      return originalSetTimeout(fn, 10); // 10ms 極速觸發超時熔斷，免等待 2.5 秒
    }
    return originalSetTimeout(fn, delay);
  };

  global.fetch = async (url, options) => {
    if (url.includes('translate.googleapis.com/translate_a/single') && !url.includes('dj=1')) {
      // 第一端點：模擬網路卡住不回應，直到收到 signal abort
      return new Promise((resolve, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            abortSignalReceived = true;
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        }
      });
    }
    // 第二端點：成功回傳
    return {
      ok: true,
      json: async () => [['Timeout Fallback Success']]
    };
  };

  const result3 = await requestTranslationWithFallback('TimeoutTest', 'en', 'zh-TW');
  assert.strictEqual(abortSignalReceived, true, '第一端點逾時必須觸發 AbortController.signal abort 事件');
  assert.strictEqual(result3, 'Timeout Fallback Success', '第一端點超時熔斷後必須順暢切換至備用端點並取得結果');
  console.log('  - 端點逾時 (>2.5s) 觸發 AbortController 熔斷: ✅ PASS');
  console.log('  - 熔斷後自動切換次級端點接力完成: ✅ PASS\n');

  // ------------------------------------------------------------------
  // 4. LRU 快取機制 (LRU Cache: Order Refresh & Eviction)
  // ------------------------------------------------------------------
  console.log('【4. LRU 快取存取重排與滿額剔除檢驗】');
  translationCache.clear();

  const keyA = 'en->zh-TW:WordA';
  const keyB = 'en->zh-TW:WordB';
  const keyC = 'en->zh-TW:WordC';

  setCache(keyA, '譯文A');
  setCache(keyB, '譯文B');
  setCache(keyC, '譯文C');

  // 初始順序: keyA, keyB, keyC
  assert.deepStrictEqual(Array.from(translationCache.keys()), [keyA, keyB, keyC], '初始插入順序應為 A, B, C');

  // 4.1 讀取 keyA (模擬快取命中存取)
  let hitResult = null;
  handleRuntimeMessage({ action: 'translate', text: 'WordA', sourceLang: 'en', targetLang: 'zh-TW' }, {}, (res) => {
    hitResult = res.translatedText;
  });
  assert.strictEqual(hitResult, '譯文A', '快取命中應瞬時回傳');
  // 存取後順序應重排為: keyB, keyC, keyA (keyA 刷新為最新)
  assert.deepStrictEqual(Array.from(translationCache.keys()), [keyB, keyC, keyA], '讀取 keyA 後順序應刷新為 B, C, A');

  // 4.2 滿額淘汰驗證 (Eviction)
  const originalMaxSize = CONFIG.MAX_CACHE_SIZE;
  CONFIG.MAX_CACHE_SIZE = 3; // 臨時設為 3 容量便於檢驗

  const keyD = 'en->zh-TW:WordD';
  setCache(keyD, '譯文D');

  // keyB 應被剔除，剩餘 keyC, keyA, keyD
  assert.strictEqual(translationCache.has(keyB), false, '最久未被使用的 keyB 必須被 LRU 機制剔除');
  assert.strictEqual(translationCache.has(keyA), true, '被讀取刷新過的 keyA 必須保留在快取中');
  assert.strictEqual(translationCache.has(keyC), true, 'keyC 必須保留');
  assert.strictEqual(translationCache.has(keyD), true, '新加入的 keyD 必須存在');
  assert.deepStrictEqual(Array.from(translationCache.keys()), [keyC, keyA, keyD], '淘汰後順序應為 C, A, D');

  CONFIG.MAX_CACHE_SIZE = originalMaxSize;
  console.log('  - 快取命中存取順序重排 (LRU Refresh): ✅ PASS');
  console.log('  - 容量滿載時剔除最舊項目 (LRU Eviction): ✅ PASS\n');

  // 恢復環境
  global.fetch = originalFetch;
  global.setTimeout = originalSetTimeout;

  console.log('🏆【背景翻譯可靠性與端點容錯測試】全部通過！\n');
  return { success: true };
}

if (require.main === module) {
  runBackgroundReliabilityTest();
}

module.exports = { runBackgroundReliabilityTest };
