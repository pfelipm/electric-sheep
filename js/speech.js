'use strict';
/* Voz sintetizada con la Web Speech API (si el navegador la ofrece).
   Se busca una voz inglesa grave y se baja el tono para un timbre "replicante". */
window.Speech = (function () {
  const ok = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  let voice = null;
  function pick() {
    if (!ok) return;
    const vs = speechSynthesis.getVoices(); if (!vs.length) return;
    const en = vs.filter(v => /^en/i.test(v.lang));
    const pref = [/Google UK English Male/i, /Daniel/i, /Microsoft (Ryan|George|Guy|David)/i, /\bmale\b/i, /en-GB/i];
    for (const re of pref) { const v = en.find(x => re.test(x.name) || re.test(x.lang)); if (v) { voice = v; return; } }
    voice = en[0] || vs[0];
  }
  return {
    init() {
      if (!ok) return;
      pick();
      speechSynthesis.onvoiceschanged = pick;
      // "Desbloquea" la síntesis durante el gesto del usuario
      try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) { /* sin voz */ }
    },
    say(text, o = {}) {
      if (!ok) return;
      const u = new SpeechSynthesisUtterance(text.toLowerCase());
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
      u.rate = o.rate || 0.85;
      u.pitch = o.pitch !== undefined ? o.pitch : 0.4;
      u.onstart = o.onstart || null;
      u.onend = u.onerror = o.onend || null;
      speechSynthesis.speak(u);
    },
    cancel() { if (ok) speechSynthesis.cancel(); },
  };
})();
