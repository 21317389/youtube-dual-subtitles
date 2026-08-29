const translationCache = new Map();

function getCachedTranslation(text) {
  if (!text) return '';
  if (translationCache.has(text)) return translationCache.get(text);
  const stripped = text.replace(/[.?!。？！]+$/, '').trim();
  if (translationCache.has(stripped)) return translationCache.get(stripped);
  return '';
}

// 1. In-progress pre-translation finishes while speaker is talking:
const inProgressText = "All of the walls are built into the rock";
translationCache.set(inProgressText, "所有的牆壁都建在岩石中。");

// 2. Speaker finishes sentence with period:
const completedSentence = "All of the walls are built into the rock.";

// 3. Instant cache lookup with period stripping:
const instantTrans = getCachedTranslation(completedSentence);
console.log('Instant translation available on period completion:', instantTrans);
console.log('Cache hit without waiting for network:', Boolean(instantTrans));
