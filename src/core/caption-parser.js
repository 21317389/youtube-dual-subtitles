/**
 * caption-parser.js
 * 
 * 靜態字幕多格式解析器 (Universal Caption Parser)
 * 支援 YouTube 三大多元字幕協議：
 *   1. JSON3 (pb3, InnerTube events 結構)
 *   2. WebVTT (時間戳解析與雙行 Rollup 消除)
 *   3. XML / TimedText / SRV3 (DOMParser + 正則雙保險還原 HTML 轉義字元)
 */

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseXmlCaptions(xmlString) {
  if (!xmlString) return null;

  // 途徑 1: DOMParser 解析
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
      const events = [];

      // 格式 A: <p t="0" d="2000">文字</p> (srv3/timedtext 格式)
      const pElements = xmlDoc.querySelectorAll('p');
      if (pElements.length > 0) {
        pElements.forEach(p => {
          const tStartMs = parseInt(p.getAttribute('t') || '0', 10);
          const dDurationMs = parseInt(p.getAttribute('d') || '2000', 10);
          const text = p.textContent || '';
          if (text.trim()) {
            events.push({
              tStartMs,
              dDurationMs,
              segs: [{ utf8: text }]
            });
          }
        });
        if (events.length > 0) return { events };
      }

      // 格式 B: <text start="1.5" dur="2.0">文字</text> (傳統 transcript 格式)
      const textElements = xmlDoc.querySelectorAll('text');
      if (textElements.length > 0) {
        textElements.forEach(t => {
          const startSec = parseFloat(t.getAttribute('start') || '0');
          const durSec = parseFloat(t.getAttribute('dur') || '2.0');
          const text = t.textContent || '';
          if (text.trim()) {
            events.push({
              tStartMs: Math.round(startSec * 1000),
              dDurationMs: Math.round(durSec * 1000),
              segs: [{ utf8: text }]
            });
          }
        });
        if (events.length > 0) return { events };
      }
    } catch (e) {}
  }

  // 途徑 2: 高相容正則引擎保底 (適用於無 DOMParser 環境、Service Worker 或破損 XML)
  try {
    const regexEvents = [];
    const pRegex = /<p\s+[^>]*t="(\d+)"[^>]*d="(\d+)"[^>]*>([\s\S]*?)<\/p>/gi;
    let match;
    while ((match = pRegex.exec(xmlString)) !== null) {
      const tStartMs = parseInt(match[1], 10);
      const dDurationMs = parseInt(match[2], 10);
      const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, '').trim());
      if (text) {
        regexEvents.push({ tStartMs, dDurationMs, segs: [{ utf8: text }] });
      }
    }
    if (regexEvents.length > 0) return { events: regexEvents };

    const textRegex = /<text\s+[^>]*start="([\d.]+)"[^>]*dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
    while ((match = textRegex.exec(xmlString)) !== null) {
      const startSec = parseFloat(match[1]);
      const durSec = parseFloat(match[2]);
      const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, '').trim());
      if (text) {
        regexEvents.push({
          tStartMs: Math.round(startSec * 1000),
          dDurationMs: Math.round(durSec * 1000),
          segs: [{ utf8: text }]
        });
      }
    }
    if (regexEvents.length > 0) return { events: regexEvents };
  } catch (err) {}

  return null;
}

function parseVttCaptions(vttString) {
  if (!vttString || (!vttString.includes('WEBVTT') && !vttString.includes('-->'))) return null;

  const events = [];
  const timeRegex = /(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/;
  const blocks = vttString.split(/\r?\n\r?\n/);
  let lastAppendedLine = '';

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    let timeLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (timeRegex.test(lines[i])) {
        timeLineIdx = i;
        break;
      }
    }

    if (timeLineIdx === -1) continue;

    const match = lines[timeLineIdx].match(timeRegex);
    if (!match) continue;

    const startH = parseInt(match[1] || '0', 10);
    const startM = parseInt(match[2], 10);
    const startS = parseInt(match[3], 10);
    const startMs = parseInt(match[4], 10);
    const tStartMs = (startH * 3600 + startM * 60 + startS) * 1000 + startMs;

    const endH = parseInt(match[5] || '0', 10);
    const endM = parseInt(match[6], 10);
    const endS = parseInt(match[7], 10);
    const endMs = parseInt(match[8], 10);
    const endTotalMs = (endH * 3600 + endM * 60 + endS) * 1000 + endMs;

    if (endTotalMs - tStartMs <= 20) continue; // 略過微過渡幀

    // 取得文字行並清除內聯標籤
    const textLines = lines.slice(timeLineIdx + 1).map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    if (textLines.length === 0) continue;

    // 處理 YouTube 雙行 Rollup 滾動重疊
    let freshText = '';
    if (textLines.length === 1) {
      freshText = textLines[0];
    } else if (textLines.length >= 2) {
      if (textLines[0] === lastAppendedLine) {
        freshText = textLines.slice(1).join(' ');
      } else {
        freshText = textLines.join(' ');
      }
    }

    if (freshText && freshText !== lastAppendedLine) {
      events.push({
        tStartMs,
        dDurationMs: Math.max(endTotalMs - tStartMs, 500),
        segs: [{ utf8: freshText }]
      });
      lastAppendedLine = freshText;
    }
  }

  return events.length > 0 ? { events } : null;
}

function parseUniversalCaptionText(rawText) {
  if (!rawText || !rawText.trim()) return null;

  // 1. JSON3
  try {
    const data = JSON.parse(rawText);
    if (data?.events && data.events.length > 0) {
      return data;
    }
  } catch (e) {}

  // 2. XML / TimedText / SRV3
  const xmlData = parseXmlCaptions(rawText);
  if (xmlData?.events && xmlData.events.length > 0) {
    return xmlData;
  }

  // 3. WebVTT
  const vttData = parseVttCaptions(rawText);
  if (vttData?.events && vttData.events.length > 0) {
    return vttData;
  }

  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    decodeHtmlEntities,
    parseXmlCaptions,
    parseVttCaptions,
    parseUniversalCaptionText
  };
}
