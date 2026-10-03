'use strict';
/* ==========================================================================
   BANDA SONORA "ELECTRIC SHEEP" — música original para 2 SID (6 voces),
   inspirada en el estilo de Vangelis (brass CS-80, pads, campanas, timbales)
   y en los grandes del C64 (arpegios a 50 Hz, bajos con filtro, baterías de ruido).

   Mini-lenguaje de pistas (1 fila = semicorchea, 16 filas = 1 compás):
     d5/8    nota Re5 durante 8 filas      bb3, c#4   bemoles y sostenidos
     ^e5/4   legato (sin redisparar; con portamento si el instrumento tiene glide)
     d4{0,3,7,12}/4   acorde arpegiado a 50 Hz (offsets en semitonos)
     r/4     silencio (gate off)          -/4  mantener
     @lead   cambia de instrumento        >12  transponer lo que sigue
     |       comprobación de compás (avisa en consola si no cuadra)
   Voces: 0-2 = SID 1, 3-5 = SID 2.
   ========================================================================== */
(function () {
  // ----------------------------- INSTRUMENTOS -----------------------------
  const BRASS_FILTER = { mode: 0x10, res: 11, cut: [0x2c0, 0x6a0, 22, 0x580, 70], lfo: [0.06, 0x30] };
  const INS = {
    bass:     { ad: 0x08, sr: 0xa8, wave: [[0x41, 0], [0x21, 0]], pw: [0x600, 0, 0, 0], hr: 1,
                filter: { mode: 0x10, res: 10, cut: [0x5c0, 0x5c0, 0, 0x2a0, 12] } },
    bassDark: { ad: 0x0a, sr: 0x8a, wave: [[0x21, 0]], hr: 1,
                filter: { mode: 0x10, res: 13, cut: [0x300, 0x480, 3, 0x220, 30], lfo: [0.05, 0x60] } },
    drone:    { ad: 0x90, sr: 0xfb, wave: [[0x21, 0]],
                filter: { mode: 0x10, res: 7, cut: [0x200, 0x500, 150, 0x400, 250], lfo: [0.021, 0xa0] } },
    kick:     { ad: 0x08, sr: 0x00, pw: [0x800, 0, 0, 0],
                wave: [[0x81, 96, 1], [0x41, 55, 1], [0x41, 48, 1], [0x41, 43, 1], [0x11, 40, 1], [0x11, 38, 1], [0x11, 36, 1], [0x11, 35, 1]] },
    snare:    { ad: 0x07, sr: 0x00, pw: [0x800, 0, 0, 0],
                wave: [[0x81, 100, 1], [0x41, 55, 1], [0x41, 50, 1], [0x81, 92, 1], [0x81, 88, 1], [0x81, 86, 1]] },
    hat:      { ad: 0x02, sr: 0x00, wave: [[0x81, 104, 1]] },
    ohat:     { ad: 0x06, sr: 0x00, wave: [[0x81, 104, 1]] },
    crash:    { ad: 0x0b, sr: 0x00, wave: [[0x81, 100, 1], [0x81, 96, 1]] },
    tom:      { ad: 0x08, sr: 0x00, pw: [0x800, 0, 0, 0], wave: [[0x81, 24], [0x41, 3], [0x41, 1], [0x11, 0]] },
    timp:     { ad: 0x0a, sr: 0x00, pw: [0x800, 0, 0, 0], wave: [[0x81, 30], [0x41, 2], [0x11, 1], [0x11, 0]] },
    heart:    { ad: 0x09, sr: 0x00, pw: [0x800, 0, 0, 0], wave: [[0x41, 45, 1], [0x11, 40, 1], [0x11, 36, 1], [0x11, 33, 1], [0x11, 31, 1]] },
    // Brass tipo Yamaha CS-80: pulso con PWM, filtro que "sopla" y vibrato tardío
    brass:    { ad: 0x89, sr: 0xfa, wave: [[0x41, 0]], pw: [0x300, 20, 0x300, 0x900], vib: [35, 0.24, 0.13], glide: 0.22, hr: 1, filter: BRASS_FILTER },
    brass2:   { ad: 0x89, sr: 0xfa, wave: [[0x21, 0]], vib: [38, 0.21, 0.13], glide: 0.22, hr: 1, detune: 0.11, filter: BRASS_FILTER },
    pad:      { ad: 0xb0, sr: 0xcb, wave: [[0x21, 0]], vib: [60, 0.12, 0.07],
                filter: { mode: 0x10, res: 8, cut: [0x280, 0x520, 120, 0x480, 160], lfo: [0.017, 0xc0] } },
    padP:     { ad: 0xa0, sr: 0xcb, wave: [[0x41, 0]], pw: [0x200, 6, 0x200, 0x700],
                filter: { mode: 0x10, res: 12, cut: [0x200, 0x420, 200, 0x380, 200], lfo: [0.03, 0x90] } },
    chime:    { ad: 0x0a, sr: 0x0a, wave: [[0x41, 12], [0x11, 0]], pw: [0x200, 0, 0, 0], vib: [8, 0.3, 0.05], hr: 1 },
    lead:     { ad: 0x29, sr: 0xa9, wave: [[0x41, 0]], pw: [0x400, 36, 0x200, 0xd00], vib: [14, 0.36, 0.17], glide: 0.6, hr: 1 },
    leadEcho: { ad: 0x29, sr: 0x59, wave: [[0x41, 0]], pw: [0x900, 30, 0x200, 0xd00], vib: [14, 0.36, 0.17], glide: 0.6, hr: 1 },
    sax:      { ad: 0x5a, sr: 0xba, wave: [[0x41, 0]], pw: [0x180, 5, 0x160, 0x480], vib: [16, 0.22, 0.24], glide: 0.32, hr: 1 },
    ghost:    { ad: 0x8a, sr: 0xab, wave: [[0x11, 0]], vib: [10, 0.15, 0.2], glide: 0.15, hr: 1 },
    arp:      { ad: 0x09, sr: 0x89, wave: [[0x41, 0]], pw: [0x800, 18, 0x300, 0xc00], arp: 1, hr: 1 },
    blip:     { ad: 0x03, sr: 0x00, wave: [[0x11, 0]] },
    rain:     { ad: 0xd0, sr: 0x3c, wave: [[0x81, 0]] },
  };
  const INS_NAMES = Object.keys(INS);

  // ----------------------------- AYUDANTES -----------------------------
  const rep = (s, n) => Array(n).fill(s).join(' ');
  const up = (name, o = 1) => name.replace(/(-?\d)$/, d => String(+d + o));
  const DRUM = { k: 'kick', s: 'snare', h: 'hat', o: 'ohat', c: 'crash', K: 'heart', x: 'timp' };
  const DRUM_NOTE = { T: ['tom', 'a3'], t: ['tom', 'e3'] };
  // Patrón de batería: 1 carácter = 1 fila, '.' = dejar sonar
  function drums(pat) {
    const s = pat.replace(/\s+/g, ''), out = [];
    for (let i = 0; i < s.length;) {
      let n = 1; while (s[i + n] === '.') n++;
      const ch = s[i];
      if (ch === '.') out.push(`-/${n}`);
      else if (DRUM_NOTE[ch]) out.push(`@${DRUM_NOTE[ch][0]} ${DRUM_NOTE[ch][1]}/${n}`);
      else out.push(`@${DRUM[ch]} c4/${n}`);
      i += n;
    }
    return out.join(' ');
  }
  const octBass = (roots, rowsPerRoot) => '@bass ' + roots.map(r => rep(`${r}/2 ${up(r)}/2`, rowsPerRoot / 4)).join(' ');
  const arps = (list, len, n) => '@arp ' + list.map(([nt, iv]) => rep(`${nt}{${iv}}/${len}`, n)).join(' ');
  const MIN = '0,3,7,12', MAJ = '0,4,7,12';

  // ----------------------------- COMPOSICIÓN -----------------------------
  // Tema principal (sección "title" y reprise final): Dm Bb F C Dm Bb Gm A
  const THEME = '@lead d5/6 ^e5/2 f5/8 | e5/4 d5/4 a4/8 | bb4/6 ^c5/2 d5/8 | f5/8 e5/4 d5/4 | ' +
    'c5/6 ^d5/2 e5/4 f5/4 | a5/12 g5/4 | e5/16 | g5/4 f5/4 e5/4 c5/4 | ' +
    'd5/6 ^e5/2 f5/8 | a5/8 g5/4 f5/4 | f5/6 ^g5/2 a5/8 | bb5/8 a5/4 g5/4 | ' +
    'g5/6 ^a5/2 bb5/4 d6/4 | c6/8 bb5/4 a5/4 | a5/16 | c#5/4 e5/4 a5/4 g5/4 |';
  const THEME_BASS = octBass(['d2', 'bb1', 'f2', 'c2', 'd2', 'bb1', 'g1', 'a1'], 32);
  const THEME_ARP = arps([['d4', MIN], ['bb3', MAJ], ['f3', MAJ], ['c4', MAJ], ['d4', MIN], ['bb3', MAJ], ['g3', MIN], ['a3', MAJ]], 4, 8);
  const THEME_BRASS = '@brass a3/32 bb3/32 a3/32 g3/32 a3/32 bb3/32 bb3/32 a3/32';
  const A = 'k.h.s.h.k.h.s.hh', B = 'k.h.s.h.k.hks.hs', FILL = 'k.s.ssT.T.t.t.ss';

  // Riff de la sección de efectos: Dm C Bb A
  const P = 'd5/2 f5/2 a5/4 g5/2 f5/2 e5/2 f5/2 | d5/8 r/4 a4/2 d5/2 | e5/2 g5/2 c6/4 bb5/2 a5/2 g5/2 e5/2 | c5/8 r/4 g4/2 c5/2 | ' +
    'd5/2 f5/2 bb5/4 a5/2 g5/2 f5/2 d5/2 | f5/8 g5/4 a5/4 | a5/4 g5/2 f5/2 e5/4 c#5/4 | e5/12 r/4 |';
  const Q = 'g5/6 ^a5/2 bb5/8 | d6/8 c6/4 bb5/4 | bb5/6 ^c6/2 d6/8 | f6/8 e6/4 d6/4 | ' +
    'e6/12 d6/2 c6/2 | c6/8 bb5/4 g5/4 | a5/16 | c#6/4 e6/4 a6/8 |';
  const FX_ROOTS = ['d2', 'c2', 'bb1', 'a1', 'd2', 'c2', 'bb1', 'a1', 'g1', 'bb1', 'c2', 'a1'];
  const funk = R => `${R}/2 r/1 ${R}/1 ${up(R)}/2 ${R}/2 r/2 ${R}/2 ${up(R)}/2 ${R}/2`;
  const VK_ROOTS = ['d2', 'd2', 'd2', 'd2', 'eb2', 'eb2', 'd2', 'd2', 'bb1', 'bb1', 'a1', 'a1', 'd2', 'd2', 'eb2', 'a1'];
  const dark = R => `${R}/2 ${R}/2 ${up(R)}/2 ${R}/2 ${R}/2 ${up(R)}/2 ${R}/2 ${up(R)}/2`;

  const SECTIONS = [
    { // 1. LOS ANGELES 2019 — ambiente: drone, timbales, campanas, pads y entrada del brass
      name: 'city', speed: 7, bars: 12, tracks: [
        '@drone d2/64 | bb1/32 | c2/32 | d2/64',
        '@timp d2/16 -/48 | bb1/8 -/24 | c2/8 -/24 | d2/16 -/16 a1/4 a1/4 d2/8 -/8 a1/2 a1/2 a1/2 a1/2',
        '-/32 | @chime d5/8 a5/8 e5/8 f5/8 | a4/8 c5/8 d5/16 | f5/8 e5/8 d5/8 c5/8 | d5/8 a5/8 e6/8 d6/8 | a5/32',
        '@pad f3/64 | f3/32 | g3/32 | f3/64',
        '@pad a3/64 | a3/32 | c4/32 | @brass d4/16 ^e4/8 ^f4/8 | ^e4/24 ^d4/8',
        '@pad e4/64 | d4/32 | d4/32 | @brass2 d4/16 ^e4/8 ^f4/8 | ^e4/24 ^d4/8',
      ] },
    { // 2. TÍTULO — el tema épico
      name: 'title', speed: 6, bars: 16, tracks: [
        THEME_BASS,
        drums('c.h.s.h.k.h.s.hh' + A + A + B + A + A + A + B + A + A + A + B + A + A + B + FILL),
        THEME,
        THEME_ARP,
        THEME_BRASS,
        { copy: 4, ins: 'brass2' },
      ] },
    { // 3. VOIGHT-KAMPFF — tensión frigia, latidos y pitidos de máquina
      name: 'vk', speed: 7, bars: 16, tracks: [
        '@bassDark ' + VK_ROOTS.map(dark).join(' '),
        rep(drums('K..K....K..K....'), 12) + ' ' + rep(drums('K.hK.h.hK.hK.hhh'), 4),
        '@ghost -/32 | a5/16 ^bb5/8 ^a5/8 | g5/16 ^bb5/16 | a5/24 f5/8 | d5/16 f5/8 ^g5/8 | e5/16 c#5/16 | d5/8 f5/8 a5/16 | bb5/16 | a5/8 ^c#6/8',
        '@blip ' + rep('d6/2 -/4 a6/1 -/3 f6/2 -/2 c7/1 -/1', 16),
        '@padP a3/64 | bb3/32 | a3/32 | bb3/32 | a3/32 | a3/32 | bb3/16 | a3/16',
        '@padP d4/64 | eb4/32 | d4/32 | d4/32 | c#4/32 | d4/32 | eb4/16 | c#4/16',
      ] },
    { // 4. EFECTOS "AMIGA" — groove rápido, arpegios y eco clásico de C64
      name: 'fx', speed: 6, bars: 24, tracks: [
        '@bass ' + FX_ROOTS.map(R => funk(R) + ' ' + funk(R)).join(' '),
        drums('c.hhs.hkk.hhs.hh' + rep('k.hhs.hkk.hhs.hh', 2) + 'k.hhs.hkk.hhs.sT' +
          rep(rep('k.hhs.hkk.hhs.hh', 3) + 'k.hhs.hkk.hhs.sT', 4) +
          rep('k.hhs.hkk.hhs.hh', 2) + 'k.hhs.hkk.hhs.sT' + 'k.s.s.sss.TTtttt'),
        '@lead ' + P + ' >12 ' + P + ' >0 ' + Q,
        arps([['d4', MIN], ['c4', MAJ], ['bb3', MAJ], ['a3', MAJ], ['d4', MIN], ['c4', MAJ], ['bb3', MAJ], ['a3', MAJ],
              ['g3', MIN], ['bb3', MAJ], ['c4', MAJ], ['a3', MAJ]], 2, 16),
        '@brass f4/32 e4/32 d4/32 c#4/32 f4/32 e4/32 d4/32 c#4/32 d4/32 d4/32 e4/32 e4/32',
        { copy: 2, delay: 3, ins: 'leadEcho' },
      ] },
    { // 5. LÁGRIMAS EN LA LLUVIA — "saxo" de pulso estrecho, pads y lluvia de ruido
      name: 'tears', speed: 8, bars: 12, tracks: [
        '@drone bb1/32 | a1/32 | g1/32 | f1/32 | g1/32 | a1/32',
        '@rain c7/176 r/16',
        '@sax f5/8 ^g5/4 ^a5/4 | -/16 | g5/6 e5/2 c5/8 | -/16 | d5/8 ^f5/8 | bb5/12 a5/4 | ' +
          'a5/8 g5/4 e5/4 | -/16 | d5/6 f5/2 g5/8 | bb5/8 ^a5/4 ^g5/4 | e5/8 ^d5/8 | ^c#5/16 |',
        '@pad d4/32 c4/32 bb3/32 a3/32 bb3/32 a3/32',
        '@pad f4/32 e4/32 d4/32 c4/32 d4/32 d4/16 c#4/16',
        '@pad a4/32 g4/32 f4/32 e4/32 f4/32 e4/32',
      ] },
    { // 6. FINAL — reprise del tema con eco (esta sección se repite en bucle)
      name: 'end', speed: 6, bars: 16, tracks: [
        THEME_BASS,
        drums('c.hhs.hkk.hhs.hh' + 'k.hhs.hkk.hhs.sT' + rep('k.hhs.hkk.hhs.hh' + 'k.hhs.hkk.hhs.sT', 6) + 'k.hhs.hkk.hhs.hh' + FILL),
        THEME,
        THEME_ARP,
        THEME_BRASS,
        { copy: 2, delay: 3, ins: 'leadEcho' },
      ] },
  ];
  const LOOP = 5;

  // ----------------------------- COMPILADOR -----------------------------
  const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  function parse(str, where) {
    const ev = []; let row = 0, len = 4, ins = null, tr = 0;
    for (const tk of str.trim().split(/\s+/)) {
      if (!tk) continue;
      if (tk === '|') { if (row % 16) console.warn(`[song] ${where}: compás descuadrado en fila ${row}`); continue; }
      if (tk[0] === '@') { ins = tk.slice(1); if (!(ins in INS)) console.warn(`[song] ${where}: instrumento desconocido ${ins}`); continue; }
      if (tk[0] === '>') { tr = parseInt(tk.slice(1), 10) || 0; continue; }
      let m;
      if ((m = /^r(?:\/(\d+))?$/.exec(tk))) { if (m[1]) len = +m[1]; ev.push({ row, off: true }); row += len; continue; }
      if ((m = /^-(?:\/(\d+))?$/.exec(tk))) { if (m[1]) len = +m[1]; row += len; continue; }
      m = /^(\^?)([a-g])(#|b)?(-?\d)(\{[-\d,]+\})?(?:\/(\d+))?$/.exec(tk);
      if (!m) { console.warn(`[song] ${where}: token inválido "${tk}"`); continue; }
      if (m[6]) len = +m[6];
      if (!ins) console.warn(`[song] ${where}: nota sin instrumento`);
      const n = 12 * (+m[4] + 1) + NOTE[m[2]] + (m[3] === '#' ? 1 : m[3] === 'b' ? -1 : 0) + tr;
      ev.push({ row, n, ins, l: !!m[1], c: m[5] ? m[5].slice(1, -1).split(',').map(Number) : null });
      row += len;
    }
    return { ev, len: row };
  }
  function toRows(p, rows) {
    const out = new Array(rows).fill(null);
    if (!p.len) return out;
    for (let base = 0; base < rows; base += p.len) for (const e of p.ev) { const r = base + e.row; if (r < rows) out[r] = e; }
    return out;
  }

  function compile() {
    const sections = [], starts = [], kicks = [], snares = [];
    let frame = 0;
    for (const s of SECTIONS) {
      const rows = s.bars * 16, tracks = [];
      s.tracks.forEach((t, v) => {
        if (typeof t !== 'string') return;
        const p = parse(t, `${s.name}/v${v}`);
        if (p.len !== rows) console.warn(`[song] ${s.name}/v${v}: ${p.len} filas (se esperaban ${rows})`);
        tracks[v] = toRows(p, rows);
      });
      s.tracks.forEach((t, v) => {
        if (typeof t === 'string') return;
        const out = new Array(rows).fill(null);
        tracks[t.copy].forEach((e, r) => {
          if (!e) return;
          const rr = r + (t.delay || 0); if (rr >= rows) return;
          out[rr] = e.off ? e : Object.assign({}, e, { ins: t.ins || e.ins, n: e.n + (t.tr || 0) });
        });
        tracks[v] = out;
      });
      tracks[1].forEach((e, r) => {
        if (!e || e.off) return;
        const f = frame + r * s.speed;
        if (e.ins === 'kick' || e.ins === 'heart' || e.ins === 'timp' || e.ins === 'crash') kicks.push(f);
        if (e.ins === 'snare') snares.push(f);
      });
      const fin = tracks.map(tr => tr.map(e => e ? (e.off ? { off: 1 } : { n: e.n, i: INS_NAMES.indexOf(e.ins), l: e.l ? 1 : 0, c: e.c }) : null));
      sections.push({ name: s.name, speed: s.speed, rows, tracks: fin });
      starts.push(frame);
      frame += rows * s.speed;
    }
    const total = frame, loopStart = starts[LOOP];
    const lens = sections.map(s => s.rows * s.speed);
    return {
      sections, starts, total, kicks, snares, loop: LOOP,
      ins: INS_NAMES.map(n => INS[n]),
      // Convierte un frame absoluto en {sección, frame local}, teniendo en cuenta el bucle final
      map(F) {
        const raw = F;
        let looped = false;
        if (F >= total) { F = loopStart + (F - loopStart) % (total - loopStart); looped = true; }
        let sec = 0; while (sec + 1 < starts.length && F >= starts[sec + 1]) sec++;
        return { sec, local: F - starts[sec], len: lens[sec], F, raw, looped };
      },
    };
  }

  window.Song = { compile };
})();
