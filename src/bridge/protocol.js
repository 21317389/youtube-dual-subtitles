/**
 * protocol.js
 * 
 * 雙向通訊協議契約庫 (Typed Messaging Protocol)
 * 統一 Main World (inject.js), Isolated World (content.js) 與 Service Worker (background.js) 訊息型別與契約
 */

const WindowMessageType = Object.freeze({
  NAVIGATE_START: 'YT_NAVIGATE_START',
  CAPTION_TRACK_CHANGED: 'YT_CAPTION_TRACK_CHANGED',
  REQUEST_CURRENT_TRACK: 'YT_REQUEST_CURRENT_TRACK',
  FETCH_CAPTION_REQUEST: 'YT_FETCH_CAPTION_REQUEST',
  FETCH_CAPTION_RESPONSE: 'YT_FETCH_CAPTION_RESPONSE',
  FETCH_TRANSCRIPT_REQUEST: 'YT_FETCH_TRANSCRIPT_REQUEST',
  FETCH_TRANSCRIPT_RESPONSE: 'YT_FETCH_TRANSCRIPT_RESPONSE',
  FETCH_INNERTUBE_CAPTION_REQUEST: 'YT_FETCH_INNERTUBE_CAPTION_REQUEST',
  FETCH_INNERTUBE_CAPTION_RESPONSE: 'YT_FETCH_INNERTUBE_CAPTION_RESPONSE'
});

const RuntimeAction = Object.freeze({
  TRANSLATE: 'translate',
  FETCH_CAPTION: 'fetchCaption',
  TELEMETRY_EVENT: 'telemetry_event'
});

function isValidWindowMessage(data) {
  return data && typeof data === 'object' && typeof data.type === 'string';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WindowMessageType,
    RuntimeAction,
    isValidWindowMessage
  };
}
