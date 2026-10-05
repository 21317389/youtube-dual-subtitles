/**
 * run_all_tests.js
 * 
 * 測試總入口：執行 test/ 目錄下所有自動化測試並產生標準化儀表板
 */

const { runGeminiStreamTest } = require('./test_gemini_stream');
const { runStaticPlaybackTest } = require('./test_static_playback');
const { runZfcHwBKcNzYTest } = require('./test_video_ZfcHwBKcNzY');
const { runE2EPipelineTest } = require('./test_e2e_pipeline');
const { runEdgeCasesTest } = require('./test_edge_cases');
const { runShortSentenceMergeTest } = require('./test_short_sentence_merge');
const { runMode2RealworldDefenseTest } = require('./test_mode2_realworld_defense');
const { runRealworldMatrixTest } = require('./test_realworld_matrix');
const { runLifecycleHandshakeTest } = require('./test_lifecycle_handshake');
const { runMainWorldInnerTubeChannelTest } = require('./test_mainworld_innertube_channel');
const { runCcAndPluginToggleTest } = require('./test_cc_and_plugin_toggle');
const { runCoreModulesTest } = require('./test_core_modules');
const { runUIModuleTests } = require('./test_ui_modules');
const { runUserInteractionSuite } = require('./test_user_interaction_suite');
const { runPopupSettingsIntegrationTest } = require('./test_popup_settings_integration');
const { runCaptionFallbackMatrixTest } = require('./test_caption_fallback_matrix');
const { runBackgroundReliabilityTest } = require('./test_background_reliability');
const { execSync } = require('child_process');

async function main() {
  console.log('========================================================');
  console.log('  YOUTUBE DUAL SUBTITLES: UNIFIED AUTOMATED TEST RUNNER');
  console.log('========================================================\n');

  const res1 = runGeminiStreamTest();
  console.log('\n--------------------------------------------------------\n');
  const res2 = runStaticPlaybackTest();
  console.log('\n--------------------------------------------------------\n');
  const res3 = runZfcHwBKcNzYTest();
  console.log('\n--------------------------------------------------------\n');
  const resE2E = await runE2EPipelineTest();
  console.log('\n--------------------------------------------------------\n');
  const resEdge = runEdgeCasesTest();
  console.log('\n--------------------------------------------------------\n');
  const resMerge = runShortSentenceMergeTest();
  console.log('\n--------------------------------------------------------\n');

  let resMode2Success = false;
  try {
    await runMode2RealworldDefenseTest();
    resMode2Success = true;
  } catch (e) {
    resMode2Success = false;
  }
  console.log('\n--------------------------------------------------------\n');

  let resMatrixSuccess = false;
  try {
    const matrixRes = await runRealworldMatrixTest();
    resMatrixSuccess = matrixRes.success;
  } catch (e) {
    resMatrixSuccess = false;
  }
  console.log('\n--------------------------------------------------------\n');

  let resFastSuccess = false;
  try {
    execSync('node test/test_fast_playback_prefetch.js', { stdio: 'inherit' });
    resFastSuccess = true;
  } catch (e) {
    resFastSuccess = false;
  }

  let resHandshakeSuccess = false;
  try {
    await runLifecycleHandshakeTest();
    resHandshakeSuccess = true;
  } catch (e) {
    resHandshakeSuccess = false;
  }
  console.log('\n--------------------------------------------------------\n');

  let resInnerTubeSuccess = false;
  try {
    await runMainWorldInnerTubeChannelTest();
    resInnerTubeSuccess = true;
  } catch (e) {
    resInnerTubeSuccess = false;
  }
  console.log('\n--------------------------------------------------------\n');

  let resToggleSuccess = false;
  try {
    await runCcAndPluginToggleTest();
    resToggleSuccess = true;
  } catch (e) {
    resToggleSuccess = false;
  }
  console.log('\n--------------------------------------------------------\n');

  let resCoreSuccess = false;
  try {
    const coreRes = runCoreModulesTest();
    resCoreSuccess = coreRes.success;
  } catch (e) {
    resCoreSuccess = false;
  }
  console.log('\n--------------------------------------------------------\n');

  let resUISuccess = false;
  try {
    runUIModuleTests();
    resUISuccess = true;
  } catch (e) {
    resUISuccess = false;
  }
  console.log('\n--------------------------------------------------------\n');

  let resInteractionSuccess = false;
  try {
    const interRes = runUserInteractionSuite();
    resInteractionSuccess = interRes.success;
  } catch (e) {
    resInteractionSuccess = false;
  }
  console.log('\n--------------------------------------------------------\n');

  let resPopupSuccess = false;
  try {
    const popupRes = runPopupSettingsIntegrationTest();
    resPopupSuccess = popupRes.success;
  } catch (e) {
    resPopupSuccess = false;
  }
  console.log('\n--------------------------------------------------------\n');

  let resFallbackSuccess = false;
  try {
    const fallbackRes = await runCaptionFallbackMatrixTest();
    resFallbackSuccess = fallbackRes.success;
  } catch (e) {
    resFallbackSuccess = false;
  }
  console.log('\n--------------------------------------------------------\n');

  let resBgSuccess = false;
  try {
    const bgRes = await runBackgroundReliabilityTest();
    resBgSuccess = bgRes.success;
  } catch (e) {
    resBgSuccess = false;
  }
  console.log('\n--------------------------------------------------------\n');

  console.log('\n========================================================');
  console.log('  FINAL VERIFICATION DASHBOARD');
  console.log('========================================================');
  console.log(`  1. Gemini Stream Test:        ${res1.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  2. Static Playback Test:       ${res2.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  3. Video ZfcHwBKcNzY Test:     ${res3.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  4. E2E Pipeline Real Test:     ${resE2E.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  5. 5大極端邊界測試 (Edge):     ${resEdge.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  6. 短句 (<5字) 智慧合流測試:   ${resMerge.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  7. Mode 2 真實極端防禦測試:   ${resMode2Success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  8. 7大真實世界極限矩陣測試:   ${resMatrixSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  9. Fast Playback Prefetch:     ${resFastSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 10. 時差握手機制 (Handshake):  ${resHandshakeSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 11. 主環境同源 InnerTube 通道: ${resInnerTubeSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 12. CC 與插件開關尊重機制:     ${resToggleSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 13. Phase 2 核心架構解耦模組:  ${resCoreSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 14. Phase 2 UI 介面解耦模組:   ${resUISuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 15. 使用者互動與邊界功能套件:  ${resInteractionSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 16. Popup 設定面板整合測試:   ${resPopupSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 17. 字幕通道階梯降級矩陣:     ${resFallbackSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 18. 背景翻譯容錯與可靠性:     ${resBgSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log('========================================================\n');

  const isAllPassed = res1.success && res2.success && res3.success && resE2E.success && resEdge.success && resMerge.success && resMode2Success && resMatrixSuccess && resFastSuccess && resHandshakeSuccess && resInnerTubeSuccess && resToggleSuccess && resCoreSuccess && resUISuccess && resInteractionSuccess && resPopupSuccess && resFallbackSuccess && resBgSuccess;
  process.exit(isAllPassed ? 0 : 1);
}

main();
