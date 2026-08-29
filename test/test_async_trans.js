// Simulate async translation return
let prevSlot = { orig: '', trans: '' };
let currSlot = { orig: '', trans: '' };
let translationCache = new Map();

function onSentence1Complete() {
  const sentence = "All of the walls are built into the rock.";
  currSlot = { orig: sentence, trans: '' };
  
  // Async translation simulates 500ms delay
  setTimeout(() => {
    const translated = "所有的牆壁都建在岩石中。";
    translationCache.set(sentence, translated);

    // OLD BUGGY CODE:
    // if (currSlot.orig === sentence) currSlot.trans = translated;
    
    // NEW ROBUST CODE:
    let updated = false;
    if (currSlot.orig === sentence) {
      currSlot.trans = translated;
      updated = true;
    }
    if (prevSlot.orig === sentence) {
      prevSlot.trans = translated;
      updated = true;
    }
    console.log('Async callback fired. Updated:', updated);
    console.log('Slot 1 (歷史):', prevSlot.orig, '| 譯:', prevSlot.trans);
    console.log('Slot 2 (當前):', currSlot.orig, '| 譯:', currSlot.trans);
  }, 50);
}

function onSentence2Start() {
  // Speaker starts next sentence after 20ms (before translation returns)
  prevSlot = {
    orig: currSlot.orig,
    trans: currSlot.trans || translationCache.get(currSlot.orig) || ''
  };
  currSlot = { orig: "It was free to", trans: '' };
}

onSentence1Complete();
setTimeout(onSentence2Start, 20);
