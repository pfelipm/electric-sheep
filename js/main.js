'use strict';
/* Bucle principal: el audio es el reloj maestro y los gráficos le siguen. */
(function () {
  const canvas = document.getElementById('screen');
  const stage = document.getElementById('stage');
  const startEl = document.getElementById('start');
  const osd = document.getElementById('osd');
  GFX.init(canvas);
  const SONG = Song.compile();
  const PARTS = Parts.list;
  const audio = new SIDAudio();
  const params = new URLSearchParams(location.search);
  let state = 'idle', bootT0 = 0, lastSec = -1, lastLocal = 0, wave = null;
  let voice = 'sam';   // 'sam' = voz sintetizada por el SID; 'browser' = Web Speech API

  function resize() {
    const s = Math.min(innerWidth / 384, innerHeight / 272);
    stage.style.width = Math.floor(384 * s) + 'px';
    stage.style.height = Math.floor(272 * s) + 'px';
  }
  addEventListener('resize', resize); resize();

  function msg(t) {
    osd.textContent = t; osd.classList.add('show');
    clearTimeout(msg.h); msg.h = setTimeout(() => osd.classList.remove('show'), 1500);
  }

  async function power() {
    if (state !== 'idle') return;
    state = 'loading';
    try { await audio.init(); }
    catch (e) { console.error(e); state = 'idle'; msg('ERROR AL INICIAR EL AUDIO'); return; }
    audio.load(SONG);
    wave = new Float32Array(audio.analyser.fftSize);
    Speech.init();
    // Pre-sintetiza todas las frases con SAM (unos milisegundos) y ajusta los subtítulos a su duración
    for (const part of PARTS) if (part.cues) for (const c of part.cues) { c.sam = SAM.render(c[1], part.voice); c[2] = c.sam.frames; }
    startEl.classList.add('hidden');
    const p = params.get('part');
    if (p !== null) startDemo(SONG.starts[Math.max(0, Math.min(PARTS.length - 1, +p || 0))]);
    else { state = 'boot'; bootT0 = performance.now(); }
  }

  function hush() { Speech.cancel(); audio.digiStop(); audio.duck(false); }
  function startDemo(frame) {
    hush();
    state = 'demo'; lastSec = -1;
    audio.play(frame);
  }
  function restart() {
    hush(); audio.stop();
    state = 'boot'; bootT0 = performance.now();
  }
  function skip() {
    if (state === 'boot') return startDemo(0);
    if (state !== 'demo') return;
    const F = Math.max(0, audio.frame()), m = SONG.map(F);
    if (m.sec >= PARTS.length - 1) return restart();
    startDemo(SONG.starts[m.sec + 1]);
  }

  function say(cue, part) {
    if (voice === 'sam' && cue.sam) return audio.digi(cue.sam.data, cue.sam.rate);
    const o = part.speech || {};
    Speech.say(cue[1], { rate: o.rate, pitch: o.pitch, onstart: () => audio.duck(true), onend: () => audio.duck(false) });
  }
  function lastBefore(arr, f) {
    let lo = 0, hi = arr.length - 1, r = -1e9;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= f) { r = arr[mid]; lo = mid + 1; } else hi = mid - 1; }
    return r;
  }

  addEventListener('keydown', e => {
    if (state === 'idle') { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); power(); } return; }
    if (state === 'loading') return;
    switch (e.key.toLowerCase()) {
      case ' ': e.preventDefault(); skip(); break;
      case 'r': msg(audio.toggleReverb() ? 'REVERB: VANGELIS HALL' : 'REVERB: OFF - SID PURO'); break;
      case 'c': msg(document.body.classList.toggle('crt') ? 'CRT: ON' : 'CRT: OFF'); break;
      case 'm': msg(audio.toggleMute() ? 'MUTE' : 'SONIDO'); break;
      case 'v': hush(); voice = voice === 'sam' ? 'browser' : 'sam'; msg(voice === 'sam' ? 'VOZ: SAM (SID 4 BITS)' : 'VOZ: NAVEGADOR'); break;
      case 'f':
        if (document.fullscreenElement) document.exitFullscreen();
        else (document.documentElement.requestFullscreen || (() => {})).call(document.documentElement);
        break;
    }
  });
  document.getElementById('power').addEventListener('click', power);

  function loop() {
    requestAnimationFrame(loop);
    if (state === 'boot') {
      const f = Math.floor((performance.now() - bootT0) / 20);
      if (f >= Parts.Boot.END) startDemo(0);
      else { Parts.Boot.draw(f); GFX.present(null); }
      return;
    }
    if (state !== 'demo') return;
    const F = audio.frame();
    if (F < 0) { GFX.clipFull(); GFX.fill(0); GFX.present(null); return; }
    const m = SONG.map(F), part = PARTS[m.sec];
    if (m.sec !== lastSec) { lastSec = m.sec; lastLocal = m.local - 1; }
    if (part.cues) for (const c of part.cues) if (lastLocal < c[0] && m.local >= c[0] && m.local - c[0] < 30) say(c, part);
    lastLocal = m.local;
    if (part.wantsWave) audio.analyser.getFloatTimeDomainData(wave);
    const info = {
      t: m.local, len: m.len, raw: m.raw - SONG.starts[m.sec], wave,
      beatAge: m.F - lastBefore(SONG.kicks, m.F), snareAge: m.F - lastBefore(SONG.snares, m.F),
    };
    part.draw(m.local, info);
    let lut = part.lut ? part.lut(m.local, info) : null;
    if (!lut) {
      const isLoop = m.sec === SONG.loop;
      const fi = m.local < 16 && !(isLoop && m.looped) ? m.local / 16 : 1;
      const fo = m.len - m.local < 16 && !isLoop ? (m.len - m.local) / 16 : 1;
      const lv = Math.min(fi, fo);
      if (lv < 1) lut = GFX.lutFade(lv);
    }
    GFX.present(lut);
  }

  // Acceso para depurar desde la consola (p. ej. __demo.jump(3))
  window.__demo = { audio, SONG, jump: n => startDemo(SONG.starts[n]) };

  // Pantalla inicial: C64 apagado
  GFX.clipFull(); GFX.fill(0); GFX.present(null);
  requestAnimationFrame(loop);
})();
