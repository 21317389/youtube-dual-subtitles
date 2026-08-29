const fs = require('fs');
const path = require('path');
const fixturePath = path.join(__dirname, 'fixtures', 'eclipse_asr.en.vtt');
const vttRaw = fs.readFileSync(fixturePath, 'utf8');

const { parseVttToMutationStream } = require('./test_gemini_stream');
// Or define it directly
function cleanSubtitleNoise(text) {
  if (!text) return '';
  return text
    .replace(/(?:&gt;|>){1,3}/g, '')
    .replace(/[\[\(](?:music|applause|laughter|chuckle|chuckles|giggle|giggles|snicker|snickers|cheering|screaming|snort|gasp|sigh|crying|groan|groaning|bell|chime|silence|whisper|cough|coughing|throat clearing|instrumental|sound effect|bgm|inaudible|unintelligible|音樂|掌聲|笑聲|鼓掌|歓声|拍手|音楽)[\]\)]/gi, '')
    .replace(/[♪♫♩♬]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseVtt(vttString) {
  const blocks = vttString.split(/\r?\n\r?\n/);
  const timeRegex = /(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/;
  const snapshots = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const timeIdx = lines.findIndex(l => timeRegex.test(l));
    if (timeIdx === -1) continue;
    const textLines = lines.slice(timeIdx + 1)
      .map(l => l.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    if (textLines.length > 0) {
      snapshots.push(cleanSubtitleNoise(textLines.join(' ')));
    }
  }
  return snapshots;
}

const snaps = parseVtt(vttRaw);
console.log('Total snapshots:', snaps.length);
const matches = snaps.filter(s => s.toLowerCase().includes('village in'));
console.log('Snapshots with "village in":', matches.length);
matches.forEach(m => console.log('  ->', m));
