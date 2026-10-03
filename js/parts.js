'use strict';
/* ==========================================================================
   PARTES DE LA DEMO. Cada parte dibuja un frame (t = frame local a 50 Hz) en el
   framebuffer. Todo es función del tiempo => se puede saltar sin perder sincronía.
   ========================================================================== */
(function () {
  const G = GFX, SPR = GFX.SPR;
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const FADE = [0, 11, 12, 15, 1];
  // Color de un texto que aparece y desaparece con la rampa clásica negro-gris-blanco
  const fadeCol = (age, len, ramp = FADE) => {
    const n = ramp.length - 1, i = Math.min(n, Math.floor(age / 3), Math.floor((len - age) / 3));
    return i < 0 ? -1 : ramp[i];
  };

  // Texto grande (escalado) con color por línea raster y ondulación horizontal por línea
  function bigText(str, x, y, sx, sy, colFn, wob) {
    for (let i = 0; i < str.length; i++) {
      const g = G.glyph(str[i]);
      for (let r = 0; r < 8; r++) {
        const bits = g[r]; if (!bits) continue;
        for (let sub = 0; sub < sy; sub++) {
          const yy = y + r * sy + sub, xo = wob ? wob(yy) : 0, col = colFn(yy, r);
          for (let b = 0; b < 8; b++) if (bits & (0x80 >> b)) G.hline(x + xo + (i * 8 + b) * sx, x + xo + (i * 8 + b + 1) * sx, yy, col);
        }
      }
    }
  }
  const bigTextC = (str, y, sx, sy, colFn, wob) => bigText(str, Math.round((320 - str.length * 8 * sx) / 2), y, sx, sy, colFn, wob);

  // Subtítulos que se van "tecleando"
  function typed(text, age, y, color, cps = 0.5, cols = 38, lh = 9) {
    const lines = G.wrap(text, cols); let left = Math.floor(age * cps);
    lines.forEach((ln, i) => {
      const s = ln.slice(0, Math.max(0, left)); left -= ln.length + 1;
      if (s) G.text(s, Math.round((320 - ln.length * 8) / 2), y + i * lh, color);
    });
  }
  function currentCue(cues, t, hold) {
    let cur = null;
    for (const c of cues) if (t >= c[0] && t < c[0] + hold) cur = c;
    return cur;
  }

  function rain(t, n, seed, o) {
    for (let i = 0; i < n; i++) {
      const sp = 0.75 + 0.5 * G.hash(i, seed + 2);
      const y = ((G.hash(i, seed + 1) * 272 + t * o.vy * sp) % 272) - 36;
      const x = ((((G.hash(i, seed) * 384 + t * o.vx * sp) % 384) + 384) % 384) - 32;
      G.line(x, y, x - o.vx * o.len / o.vy, y - o.len, o.cols[i % o.cols.length]);
    }
  }
  function stars(t, n, seed, yMax) {
    for (let i = 0; i < n; i++) {
      const x = Math.floor(G.hash(i, seed) * 320), y = Math.floor(G.hash(i, seed + 1) * yMax);
      const tw = G.hash(i, Math.floor(t / 7) + seed);
      G.pset(x, y, tw > 0.92 ? 1 : tw > 0.55 ? 15 : tw > 0.2 ? 12 : 11);
    }
  }

  /* ======================= ARRANQUE DEL C64 ======================= */
  const Boot = {
    END: 600,
    draw(f) {
      G.clipFull();
      if (f < 12) { G.fill(0); return; }
      G.fill(14);                                     // borde azul claro
      if (f >= 300 && f < 480) {                      // carga de cinta: franjas en el borde
        for (let y = -36; y < 236;) {
          const h = 1 + Math.floor(G.hash(y + 999, f) * 7);
          const c = [6, 14, 3, 13, 7, 2, 10, 1, 0, 5, 4][Math.floor(G.hash(y + 7, f) * 11)];
          for (let k = 0; k < h; k++) G.raster(y + k, c);
          y += h;
        }
        return;
      }
      if (f >= 178 && f < 262) return;                // pantalla apagada mientras busca
      G.screen(6);
      G.clipScreen();
      const L = (row, s) => G.text(s, 0, row * 8, 14);
      if (f < 22) return;
      L(1, '    **** COMMODORE 64 BASIC V2 ****');
      L(3, ' 64K RAM SYSTEM  38911 BASIC BYTES FREE');
      L(5, 'READY.');
      let cur = null;
      if (f < 80) cur = [6, 0];
      else { const n = Math.min(4, Math.floor((f - 80) / 7)); L(6, 'LOAD'.slice(0, n)); if (f < 112) cur = [6, n]; }
      if (f >= 118) L(7, 'PRESS PLAY ON TAPE');
      if (f >= 166) L(8, 'OK');
      if (f >= 262) L(10, 'FOUND ELECTRIC SHEEP');
      if (f >= 480) L(11, 'LOADING');
      if (f >= 505) { L(12, 'READY.'); cur = [13, 0]; }
      if (f >= 525) { const n = Math.min(3, Math.floor((f - 525) / 7)); L(13, 'RUN'.slice(0, n)); cur = f < 552 ? [13, n] : null; }
      if (cur && ((f >> 4) & 1)) G.rect(cur[1] * 8, cur[0] * 8, 8, 8, 14);
    },
  };

  /* ======================= 1. LOS ANGELES, 2019 ======================= */
  const City = (() => {
    const r = G.rng(2019); const far = [], near = [];
    for (let x = 0; x < 640;) { const w = 5 + Math.floor(r() * 12); far.push({ x, w, h: 18 + Math.floor(r() * 40), s: Math.floor(r() * 1e6) }); x += w; }
    for (let x = 0; x < 640;) { const w = 9 + Math.floor(r() * 20); near.push({ x, w, h: 10 + Math.floor(r() * 42) + (r() < 0.18 ? 28 : 0), s: Math.floor(r() * 1e6) }); x += w + 1 + Math.floor(r() * 3); }
    const STACKS = [{ x: 30, y: 104 }, { x: 108, y: 118 }, { x: 296, y: 100 }];
    const SKY = [0, 0, 6, 4, 2, 8, 10];
    const HZ = 160;
    const TXT = [[70, 430, 'LOS ANGELES', 177], [110, 430, 'NOVEMBER, 2019', 188],
                 [560, 890, 'NEXUS-6', 177], [600, 890, 'PRESENTS', 188],
                 [960, 1300, 'A COMMODORE 64 TRIBUTE', 182]];

    function skyline(list, off, base, col, winCol, winP, t) {
      for (const b of list) for (const wrap of [0, 640]) {
        const x = Math.round(((b.x - off) % 640 + 640) % 640) - wrap;
        if (x + b.w < 0 || x > 320) continue;
        G.rect(x, base - b.h, b.w, b.h, col);
        if (winCol < 0) continue;
        for (let wy = base - b.h + 3; wy < base - 2; wy += 4) for (let wx = 2; wx < b.w - 2; wx += 3) {
          const h = G.hash(b.s + wx, wy);
          if (h < winP) {
            const fl = G.hash(b.s * 7 + wx, wy + Math.floor(t / 50));
            G.pset(x + wx, wy, fl < 0.06 ? col : (h < winP * 0.3 ? 7 : winCol));
          }
        }
      }
    }
    function pyramid(cx, base, hw, h, t, beams) {
      const top = base - h;
      if (beams) for (let i = 0; i < 2; i++) {
        const a = -Math.PI / 2 + 0.7 * Math.sin(t * 0.011 + i * 2.2);
        for (let k = 6; k < 150; k += 2) G.pset(cx + Math.cos(a) * k, top + Math.sin(a) * k, k < 60 ? 15 : 12);
      }
      for (let y = top; y < base; y++) {
        const half = Math.round(hw * (y - top) / h), step = half - (half % 3);
        G.hline(cx - step, cx + step + 1, y, 0);
        if ((y - top) % 4 === 2) for (let x = cx - step + 1; x < cx + step; x += 2)
          if (G.hash(x, y) < 0.2) G.pset(x, y, G.hash(x + Math.floor(t / 40), y) < 0.2 ? 7 : 8);
      }
    }
    function flames(s, i, t) {
      for (let k = 0; k < 6; k++) { const h = G.hash(k + i * 10, t >> 1); G.pset(s.x - 1 + Math.floor(h * 3), s.y - 1 - Math.floor(h * 4), h < 0.5 ? 7 : 8); }
      const P = 110 + i * 37, off = i * 53, age = (t + off) % P, b = Math.floor((t + off) / P);
      if (age >= 46) return;
      const RAMP = [1, 1, 7, 7, 8, 8, 2, 2, 9, 9, 11];
      for (let k = 0; k < 34; k++) {
        const a = -Math.PI / 2 + (G.hash(b * 97 + k, i) - 0.5) * 0.8;
        const d = age * (0.6 + 1.6 * G.hash(b * 31 + k, i + 9));
        const c = RAMP[Math.min(RAMP.length - 1, Math.floor(age / 4.2 + G.hash(k, b) * 2))];
        G.rect(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d + age * age * 0.012, 2, 2, c);
      }
    }
    function spinner(t) {
      const blink = (t >> 3) & 1 ? 2 : 14;
      if (t > 240 && t < 640) { const k = t - 240; G.sprite(SPR.spinner, 340 - k * 1.0, 64 + Math.sin(k * 0.05) * 5, { 1: 12, 2: blink, 3: 14 }, 2, 1, true); }
      if (t > 800 && t < 1200) { const k = t - 800; G.sprite(SPR.spinner, -60 + k * 1.1, 34 + Math.sin(k * 0.04) * 4, { 1: 15, 2: blink, 3: 3 }, 4, 2, false); }
    }
    return {
      name: 'city',
      draw(t, I) {
        G.clipFull(); G.fill(0); G.clipScreen();
        const glow = Math.exp(-I.beatAge / 14) * 0.14;
        for (let y = 0; y < HZ; y++) {
          const v = clamp01(Math.pow(y / HZ, 1.35) + glow * (y / HZ)), row = G.idx(0, y);
          for (let x = 0; x < 320; x++) G.fb[row + x] = G.dither(SKY, v, x, y);
        }
        skyline(far, t * 0.08, HZ, 6, 14, 0.06, t);
        pyramid(300, HZ, 40, 34, t, false);
        pyramid(222, HZ, 76, 64, t, true);
        skyline(near, t * 0.22, HZ + 4, 0, 8, 0.22, t);
        G.rect(0, HZ + 4, 320, 40, 0);
        for (let i = 0; i < 14; i++) {     // autopista
          G.rect(((G.hash(i, 5) * 400 + t * (1.2 + G.hash(i, 6))) % 400) - 40, 167, 2, 1, 7);
          G.rect(360 - ((G.hash(i, 7) * 400 + t * (1 + G.hash(i, 8))) % 400), 169, 2, 1, 2);
        }
        STACKS.forEach((s, i) => { G.rect(s.x - 2, s.y, 5, HZ + 4 - s.y, 0); flames(s, i, t); });
        spinner(t);
        rain(t, 70, 11, { vx: -1, vy: 6, len: 4, cols: [14, 15, 12] });
        for (const [a, b, s, y] of TXT) if (t >= a && t < b) {
          const c = fadeCol(t - a, b - a); if (c < 0) continue;
          G.text(s.slice(0, Math.floor((t - a) / 3)), Math.round((320 - s.length * 8) / 2), y, c);
        }
      },
    };
  })();

  /* ======================= 2. TÍTULO ======================= */
  const Title = (() => {
    const BARS = [[6, 4, 14, 3, 13, 1, 13, 3, 14, 4, 6], [9, 2, 8, 10, 7, 1, 7, 10, 8, 2, 9], [11, 5, 13, 7, 1, 7, 13, 5, 11]];
    const LOGO = [2, 8, 10, 7, 1, 7, 10, 8, 2, 9, 9, 2];
    const DY = [1, 1, 13, 13, 3, 3, 14, 14];
    const CYC = [6, 4, 14, 3, 13, 1, 13, 3, 14, 4];
    const SCROLL = '        NEXUS-6 PRESENTA... ELECTRIC SHEEP!   UN HOMENAJE A LA DEMOSCENE DEL COMMODORE 64, ' +
      'A PHILIP K. DICK Y A LA MUSICA DE VANGELIS ...   DOS CHIPS SID VIRTUALES, SEIS VOCES, CINCUENTA FRAMES POR SEGUNDO ' +
      'Y NI UNA SOLA LIBRERIA ...   ¿SUEÑAN LOS ANDROIDES CON OVEJAS ELECTRICAS? SIGUE MIRANDO Y LO SABRAS ...      ';
    return {
      name: 'title',
      cues: [[50, 'DO ANDROIDS DREAM OF ELECTRIC SHEEP?']], voice: { pitch: 82, speed: 0.72, expr: 0.9 },
      speech: { rate: 0.75, pitch: 0.2 },
      lut: t => (t < 32 ? G.lutWhite(1 - t / 32) : null),
      draw(t, I) {
        G.clipFull(); G.fill(0);
        const bars = [];
        for (let i = 0; i < 5; i++) { const ph = t * 0.032 + i * 0.62; bars.push({ y: 92 + 84 * Math.sin(ph), z: Math.cos(ph), r: BARS[i % 3] }); }
        bars.sort((a, b) => a.z - b.z);
        for (const b of bars) { const h = b.r.length; for (let k = 0; k < h; k++) G.raster(Math.round(b.y) - (h >> 1) + k, b.r[k]); }

        G.clipScreen();
        const kick = Math.exp(-I.beatAge / 5) * 3, sw = 12 * Math.sin(t * 0.028);
        const wob = y => Math.round(sw + 3 * Math.sin(y * 0.18 + t * 0.15));
        const lc = y => LOGO[(((y >> 1) + (t >> 1)) % LOGO.length + LOGO.length) % LOGO.length];
        G.textC('DO ANDROIDS DREAM OF', 6, i => CYC[(i + (t >> 2)) % CYC.length]);
        for (const [s, y] of [['ELECTRIC', 22], ['SHEEP?', 62]]) {
          bigTextC(s, Math.round(y + 3 - kick), 4, 4, () => 0, yy => wob(yy - 3) + 3);
          bigTextC(s, Math.round(y - kick), 4, 4, lc, wob);
        }
        G.textC('NEXUS-6  2026', 112, i => CYC[(i + (t >> 3)) % CYC.length]);

        // DYCP: cada carácter con su propia posición vertical
        const sx = t * 2.2, first = Math.floor(sx / 16), off = sx - first * 16;
        for (let j = 0; j < 22; j++) {
          const ch = SCROLL[(first + j) % SCROLL.length], x = Math.round(j * 16 - off);
          G.char(ch, x, Math.round(158 + 14 * Math.sin(x * 0.022 + t * 0.085)), r => DY[r], 2, 2);
        }

        // Ovejas en el borde "abierto" (el truco clásico de abrir los bordes superior e inferior)
        G.clipFull();
        for (let k = 0; k < 5; k++) {
          const hop = -Math.abs(Math.sin(t * 0.18 + k)) * 5, zap = G.hash(k, t >> 2) < 0.08;
          G.sprite(SPR.sheep, ((k * 96 + t * 1.4) % 480) - 70, -30 + hop, { 1: zap ? 3 : 1, 2: 12, 3: 0 }, 2, 2, false);
          const zap2 = G.hash(k + 9, t >> 2) < 0.08;
          G.sprite(SPR.sheep, 400 - ((k * 96 + t * 1.2) % 480), 212 + hop, { 1: zap2 ? 3 : 15, 2: 12, 3: 0 }, 2, 2, true);
        }
      },
    };
  })();

  /* ======================= 3. TEST VOIGHT-KAMPFF ======================= */
  const VK = (() => {
    const CUES = [
      [40, 'VOIGHT-KAMPFF EMPATHY TEST. SUBJECT: NEXUS SIX. BEGIN.'],
      [370, 'YOU FIND A SHEEP IN THE RAIN. IT IS ELECTRIC. IT IS SHIVERING. WHAT DO YOU DO?'],
      [900, 'YOUR FIRST MEMORY: A WARM KITCHEN, A VOICE YOU LOVE. WHO GAVE IT TO YOU?'],
      [1400, 'EMPATHY INDEX: INCONCLUSIVE. THE SUBJECT DREAMS.'],
    ];
    const IRIS = [0, 6, 4, 14, 3, 13], SKIN = [0, 9, 8, 10], SCL = [11, 12, 15, 1];
    const BLOBS = [[0.42, 0.18, 0.11], [0.55, -0.06, 0.07], [0.25, 0.42, 0.08], [0.62, 0.3, 0.06], [-0.3, 0.5, 0.05]];
    const BLINKS = [560, 1180, 1640];
    return {
      name: 'vk', cues: CUES, wantsWave: true, voice: { pitch: 112, speed: 0.85, expr: 0.25 },
      draw(t, I) {
        G.clipFull(); G.fill(0); G.clipScreen();
        const e = 1 - Math.pow(1 - Math.min(1, t / 200), 3), zoom = 0.35 + 0.65 * e;
        const hb = Math.exp(-I.beatAge / 8);
        let react = 0; for (const c of CUES) { const d = t - c[0] - 90; if (d > 0) react = Math.max(react, Math.exp(-d / 220) * Math.min(1, d / 30)); }
        const pupR = (11 + 3 * hb + 9 * react) * zoom;
        let open = 1; for (const b of BLINKS) { const d = t - b; if (d >= 0 && d < 14) open = Math.abs(d - 7) / 7; }
        const cx = 160, cy = 80, EW = 150 * zoom, EH = 64 * zoom, IR = 44 * zoom, fb = G.fb;
        const fl = t >> 2;
        // El ojo, en modo multicolor (píxeles dobles)
        for (let y = 12; y < 146; y++) {
          const dy = y - cy, row = G.idx(0, y);
          for (let x = 0; x < 320; x += 2) {
            const dx = x - cx + 1, nx = dx / EW;
            const lid = nx * nx < 1 ? EH * Math.pow(1 - nx * nx, 0.85) * open : -1;
            const ady = Math.abs(dy);
            let c;
            if (ady > lid) {
              const d = ady - Math.max(lid, 0);
              c = d < 2 && lid > 0 ? 0 : G.dither(SKIN, clamp01(0.8 - d / 55 - Math.abs(nx) * 0.25), x >> 1, y);
            } else {
              const r = Math.sqrt(dx * dx + dy * dy);
              if (r < pupR) c = 0;
              else if (r < IR) {
                const a = Math.atan2(dy, dx), v = (r - pupR) / (IR - pupR);
                const fib = 0.5 + 0.3 * Math.sin(a * 29 + 2 * Math.sin(a * 6)) + 0.2 * Math.sin(a * 71 + v * 6);
                c = G.dither(IRIS, clamp01((1 - v) * 0.3 + fib * 0.55 + 0.12 - (v > 0.86 ? 0.45 : 0)), x >> 1, y);
                for (let k = 0; k < BLOBS.length; k++) {
                  const bl = BLOBS[k], bx = dx / IR - bl[0], by = dy / IR - bl[1];
                  const br = bl[2] * (0.8 + 0.4 * G.hash(k, fl));
                  if (bx * bx + by * by < br * br) { c = G.hash(k + x, fl) < 0.5 ? 8 : 7; break; }
                }
              } else {
                const edge = lid - ady;
                c = G.dither(SCL, clamp01(0.25 + edge / 22 - (r - IR) / (EW * 1.6)), x >> 1, y);
                if (r > IR + 10 && edge < 20 && Math.sin(Math.atan2(dy, dx) * 13 + Math.sin(r * 0.09) * 1.5) > 0.993) c = 2;
              }
              const hx = dx + IR * 0.35, hy = dy + IR * 0.35;
              if (hx * hx + hy * hy < IR * IR * 0.02) c = 1;
            }
            fb[row + x] = c; fb[row + x + 1] = c;
          }
        }
        // Línea de escaneo de la máquina
        if (t % 400 < 220) { const sy = 14 + Math.floor((t * 1.3) % 130); for (let x = (t & 1); x < 320; x += 2) G.pset(x, sy, 3); }
        // Interfaz
        G.text('VOIGHT-KAMPFF', 2, 2, 3);
        G.text('PUPIL ' + (pupR / zoom * 0.27).toFixed(2) + 'MM', 206, 2, hb > 0.5 ? 1 : 13);
        G.rect(0, 120, 74, 22, 0); G.text('RESP', 4, 123, 11); G.text((0.6 + 0.3 * Math.sin(t * 0.07) + 0.4 * react).toFixed(3), 4, 132, 13);
        G.rect(246, 120, 74, 22, 0); G.text('EMPATHY', 250, 123, 11);
        G.text(t < 1400 ? '??.?' : (G.hash(t >> 3) < 0.5 ? 'ERR!' : '----'), 250, 132, t < 1400 ? 13 : 2);
        const cue = currentCue(CUES, t, 440);
        if (cue) typed(cue[1], t - cue[0], 146, 3, cue[2] ? Math.max(0.3, cue[1].length / cue[2]) : 0.7, 40);
        // Osciloscopio con la salida real de los SID
        G.hline(0, 320, 174, 11);
        for (let x = 0; x < 320; x += 8) G.pset(x, 186, 11);
        const w = I.wave;
        if (w) {
          let py = 186;
          for (let x = 0; x < 320; x++) {
            const y = Math.round(186 - Math.max(-1, Math.min(1, (w[x * 3] || 0) * 2.2)) * 11);
            G.line(x - 1, py, x, y, 13); py = y;
          }
        }
      },
    };
  })();

  /* ======================= 4. EFECTOS "AMIGA" ======================= */
  const FX = (() => {
    // --- Oveja 3D de polígonos rellenos ---
    const boxes = [
      [0, 0.15, 0, 1.5, 0.85, 0.9, 'w'], [0, 0.62, 0, 1.1, 0.22, 0.66, 'w'], [-0.82, 0.3, 0, 0.18, 0.2, 0.2, 'w'],
      [0.98, 0.42, 0, 0.42, 0.44, 0.38, 'h'], [0.95, 0.66, 0.24, 0.12, 0.08, 0.18, 'h'], [0.95, 0.66, -0.24, 0.12, 0.08, 0.18, 'h'],
      [0.5, -0.5, 0.26, 0.16, 0.55, 0.16, 'l'], [0.5, -0.5, -0.26, 0.16, 0.55, 0.16, 'l'],
      [-0.5, -0.5, 0.26, 0.16, 0.55, 0.16, 'l'], [-0.5, -0.5, -0.26, 0.16, 0.55, 0.16, 'l'],
    ];
    const RAMPS = { w: [11, 12, 15, 1], h: [0, 11, 12, 15], l: [0, 0, 11, 12] };
    const verts = [], faces = [], topVerts = [];
    const FACES = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
    boxes.forEach(([cx, cy, cz, sx, sy, sz, m], bi) => {
      const b = verts.length;
      for (let i = 0; i < 8; i++) {
        verts.push([cx + (i & 1 ? sx : -sx) / 2, cy + (i & 2 ? sy : -sy) / 2, cz + (i & 4 ? sz : -sz) / 2]);
        if (bi === 1 && (i & 2)) topVerts.push(b + i);
      }
      FACES.forEach(f => faces.push({ v: f.map(i => b + i), r: RAMPS[m] }));
    });
    const LIGHT = (() => { const l = [-0.5, 0.7, -0.6], n = Math.hypot(...l); return l.map(x => x / n); })();
    const proj = verts.map(() => [0, 0, 0]);

    // --- Textura del rotozoom: oveja sobre tablero ---
    const TEX = new Uint8Array(32 * 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) TEX[y * 32 + x] = ((x >> 3) + (y >> 3)) & 1 ? 6 : 4;
    const SC = { 1: 1, 2: 0, 3: 2 };
    SPR.sheep.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') TEX[(y + 12) * 32 + x + 9] = SC[row[x]]; });

    const PA = [0, 6, 4, 14, 3, 13, 1, 13, 3, 14, 4, 6], PB = [0, 9, 2, 8, 10, 7, 1, 7, 10, 8, 2, 9];
    const WORDS = ['DO', 'ANDROIDS', 'DREAM', 'OF', 'ELECTRIC', 'SHEEP?', 'WE', 'DO.'];
    const CYC = [2, 8, 7, 1, 7, 8];

    function sheep3d(t, I) {
      // Cielo con estrellas y suelo de tablero en perspectiva
      stars(t, 70, 4, 110);
      for (let y = 113; y < 200; y++) {
        const z = 30 / (y - 108), fade = clamp01((y - 112) / 50), row = G.idx(0, y);
        for (let x = 0; x < 320; x += 2) {
          const u = (x - 160) * z * 0.045 + Math.sin(t * 0.01) * 2, v = z * 2.6 + t * 0.12;
          const c = ((Math.floor(u) + Math.floor(v)) & 1) ? G.dither([0, 6, 14], fade, x >> 1, y) : G.dither([0, 0, 6], fade, x >> 1, y);
          G.fb[row + x] = c; G.fb[row + x + 1] = c;
        }
      }
      for (let dy = -5; dy <= 5; dy++) { const hw = 46 * Math.sqrt(1 - (dy * dy) / 30); for (let x = Math.round((160 - hw) / 2) * 2; x < 160 + hw; x += 2) if (((x >> 1) + dy) & 1 || Math.abs(dy) < 3) { G.pset(x, 150 + dy, 0); G.pset(x + 1, 150 + dy, 0); } }
      // Transformación
      const ry = t * 0.025, rx = 0.25 + 0.12 * Math.sin(t * 0.017), bob = 0.12 * Math.exp(-I.beatAge / 6);
      const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx), F = 260;
      const tv = verts.map(([x, y, z]) => {
        const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
        const y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
        return [x1, y2 + bob, z2 + 4.5];
      });
      tv.forEach((v, i) => { proj[i][0] = 160 + v[0] * F / v[2]; proj[i][1] = 100 - v[1] * F / v[2]; proj[i][2] = v[2]; });
      const vis = [];
      for (const f of faces) {
        const a = tv[f.v[0]], b = tv[f.v[1]], c = tv[f.v[2]];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (nx * a[0] + ny * a[1] + nz * a[2] >= 0) continue;   // cara trasera
        const nl = Math.hypot(nx, ny, nz) || 1;
        const shade = 0.15 + 0.85 * Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nl);
        vis.push({ f, z: (a[2] + b[2] + c[2] + tv[f.v[3]][2]) / 4, shade });
      }
      vis.sort((p, q) => q.z - p.z);
      for (const { f, shade } of vis) {
        const p = f.v.map(i => proj[i]);
        G.tri(p[0][0], p[0][1], p[1][0], p[1][1], p[2][0], p[2][1], f.r, shade);
        G.tri(p[0][0], p[0][1], p[2][0], p[2][1], p[3][0], p[3][1], f.r, shade);
      }
      // ¡Electricidad!
      const seed = t >> 2;
      if (G.hash(seed, 77) < 0.6) for (let k = 0; k < 2; k++) {
        const s = proj[topVerts[Math.floor(G.hash(seed, 1 + k) * topVerts.length)]];
        const ex = s[0] + (G.hash(seed, 2 + k) - 0.5) * 180;
        const ey = G.hash(seed, 3 + k) < 0.5 ? 150 + G.hash(seed, 4 + k) * 40 : 10 + G.hash(seed, 5 + k) * 40;
        let px = s[0], py = s[1];
        for (let i = 1; i <= 8; i++) {
          const q = i / 8, nx = s[0] + (ex - s[0]) * q + (i < 8 ? (G.hash(seed * 13 + i, k) - 0.5) * 16 : 0);
          const ny = s[1] + (ey - s[1]) * q + (i < 8 ? (G.hash(seed * 17 + i, k) - 0.5) * 10 : 0);
          G.line(px + 1, py + 1, nx + 1, ny + 1, 14); G.line(px, py, nx, ny, 1);
          px = nx; py = ny;
        }
      }
      G.rect(0, 0, 320, 12, 0);
      G.textC('ELECTRIC SHEEP V1.0', 2, i => CYC[(i + (t >> 2)) % CYC.length]);
      G.rect(0, 189, 320, 11, 0);
      G.textC('REAL-TIME FLAT SHADED VECTORS', 191, 15);
    }

    function plasma(t, lt, I) {
      const ramp = lt < 384 ? PA : PB, n = ramp.length, ox = 40 + 20 * Math.sin(t * 0.01);
      for (let by = 0; by < 50; by++) for (let bx = 0; bx < 80; bx++) {
        const v = Math.sin(bx * 0.16 + t * 0.05) + Math.sin(by * 0.21 - t * 0.037) + Math.sin((bx + by) * 0.08 + t * 0.06) +
          Math.sin(Math.sqrt((bx - ox) * (bx - ox) + (by - 25) * (by - 25)) * 0.3 - t * 0.09);
        const idx = Math.floor((v * 0.125 + 0.5 + t * 0.006) * n * 2);
        G.rect(bx * 4, by * 4, 4, 4, ramp[((idx % n) + n) % n]);
      }
      const w = WORDS[Math.min(7, Math.floor(lt / 96))];
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]]) bigTextC(w, 84 + dy, 4, 4, () => 0, () => dx);
      bigTextC(w, 84, 4, 4, () => (I.beatAge < 3 ? 7 : 1));
    }

    function rotozoom(t) {
      const a = t * 0.017, z = 0.55 + 0.35 * Math.sin(t * 0.011), ca = Math.cos(a) * z, sa = Math.sin(a) * z;
      const u0 = t * 0.35, v0 = t * 0.22;
      for (let by = 0; by < 50; by++) for (let bx = 0; bx < 80; bx++) {
        const dx = bx - 40, dy = by - 25;
        const u = Math.floor(dx * ca - dy * sa + u0) & 31, v = Math.floor(dx * sa + dy * ca + v0) & 31;
        G.rect(bx * 4, by * 4, 4, 4, TEX[v * 32 + u]);
      }
      G.rect(0, 0, 320, 12, 0); G.textC('NEXUS-6 ROTOZOOM ENGINE', 2, 15);
      G.rect(0, 187, 320, 13, 0); G.textC('MORE HUMAN THAN HUMAN', 190, i => CYC[(i + (t >> 2)) % CYC.length]);
    }

    return {
      name: 'fx',
      lut: t => { const lt = t % 768; return t >= 768 && lt < 12 ? G.lutWhite(1 - lt / 12) : null; },
      draw(t, I) {
        G.clipFull(); G.fill(0); G.clipScreen();
        const sub = Math.floor(t / 768), lt = t % 768;
        if (sub === 0) sheep3d(t, I);
        else if (sub === 1) plasma(t, lt, I);
        else rotozoom(t);
      },
    };
  })();

  /* ======================= 5. LÁGRIMAS EN LA LLUVIA ======================= */
  const Tears = (() => {
    const CUES = [
      [30, 'I WAS BUILT TO FORGET.'],
      [230, 'BUT I KEPT EVERY MOMENT.'],
      [450, 'NEON BLEEDING ON WET STREETS. SPINNERS HUMMING ABOVE THE FIRE.'],
      [820, 'A SHEEP THAT WAS NOT REAL... AND LOVED ME ANYWAY.'],
      [1110, 'ALL OF IT WILL FADE, LIKE A SIGNAL INTO STATIC.'],
      [1360, 'TIME TO DREAM.'],
    ];
    const SKY = [0, 0, 6, 6, 4];
    const r = G.rng(1982), bld = [];
    for (let x = -10; x < 330;) {
      const w = 14 + Math.floor(r() * 26);
      bld.push({ x, w, h: 22 + Math.floor(r() * 62), s: Math.floor(r() * 1e5), neon: r() < 0.5 ? [4, 10, 3, 13, 2][Math.floor(r() * 5)] : -1 });
      x += w + 2 + Math.floor(r() * 6);
    }
    const BOLTS = [180, 700, 1240];
    return {
      name: 'tears', cues: CUES, speech: { rate: 0.78, pitch: 0.3 }, voice: { pitch: 90, speed: 0.78, expr: 1 },
      lut: t => { for (const b of BOLTS) { const d = t - b; if (d >= 0 && d < 10) return G.lutWhite((1 - d / 10) * 0.7); } return null; },
      draw(t) {
        G.clipFull(); G.fill(0); G.clipScreen();
        for (let y = 0; y < 150; y++) { const row = G.idx(0, y); for (let x = 0; x < 320; x++) G.fb[row + x] = G.dither(SKY, Math.pow(y / 150, 1.6), x, y); }
        for (const b of BOLTS) {
          const d = t - b; if (d < 0 || d >= 5) continue;
          let px = 60 + G.hash(b) * 200, py = 0;
          for (let i = 0; i < 10; i++) { const nx = px + (G.hash(b, i) - 0.5) * 30, ny = py + 11; G.line(px, py, nx, ny, 1); px = nx; py = ny; }
        }
        for (const b of bld) {
          G.rect(b.x, 150 - b.h, b.w, b.h, 11);
          G.rect(b.x, 150 - b.h, 1, b.h, 12); G.rect(b.x + b.w - 3, 150 - b.h, 3, b.h, 0);
          if (b.s % 3 === 0) G.line(b.x + (b.w >> 1), 150 - b.h, b.x + (b.w >> 1), 150 - b.h - 8 - (b.s % 7), 11);
          for (let wy = 150 - b.h + 4; wy < 146; wy += 4) for (let wx = b.x + 3; wx < b.x + b.w - 4; wx += 3) {
            const h = G.hash(b.s + wx, wy);
            if (h < 0.22) G.pset(wx, wy, h < 0.025 ? 7 : h < 0.06 ? 15 : 12);
          }
          if (b.neon >= 0 && G.hash(b.s, t >> 2) > 0.06) {
            const nx = b.x + 3, ny = 150 - b.h + 6, nw = b.w - 6;
            G.hline(nx, nx + nw, ny, b.neon); G.hline(nx, nx + nw, ny + 9, b.neon);
            G.rect(nx, ny, 1, 10, b.neon); G.rect(nx + nw - 1, ny, 1, 10, b.neon);
          }
        }
        // Azotea
        G.rect(0, 146, 320, 54, 0);
        G.line(40, 146, 40, 98, 0); G.line(30, 112, 50, 112, 0); G.line(33, 104, 47, 104, 0);
        G.rect(252, 116, 32, 22, 0); G.line(256, 138, 256, 146, 0); G.line(280, 138, 280, 146, 0);
        G.sprite(SPR.figure, 146, 133, { '#': 0 }, 1, 1);
        rain(t, 190, 3, { vx: -1.6, vy: 8, len: 6, cols: [14, 15, 12, 14] });
        for (let i = 0; i < 26; i++) {
          const x = Math.floor(G.hash(i, t >> 1) * 320), y = 146 + Math.floor(G.hash(i + 50, t >> 1) * 4);
          G.pset(x - 1, y - 1, 15); G.pset(x + 1, y - 1, 15); G.pset(x, y, 12);
        }
        // La paloma
        if (t > 1150) {
          const k = t - 1150;
          G.sprite((k >> 3) & 1 ? SPR.dove2 : SPR.dove1, 150 + Math.sin(k * 0.03) * 20, 128 - k * 0.45, { '#': 1 }, 2, 2);
        }
        const cue = currentCue(CUES, t, t >= 1360 ? 200 : 400);
        if (cue) {
          const age = t - cue[0], len = CUES[CUES.indexOf(cue) + 1] ? Math.min(400, CUES[CUES.indexOf(cue) + 1][0] - cue[0]) : 170;
          const c = fadeCol(age, len, [0, 11, 12, 15, 1]);
          if (c >= 0) typed(cue[1], age, 166, c, cue[2] ? Math.max(0.25, cue[1].length / cue[2]) : 0.45, 36, 10);
        }
      },
    };
  })();

  /* ======================= 6. FINAL: CONTANDO OVEJAS ======================= */
  const End = (() => {
    const RAIN = [2, 8, 7, 13, 3, 14, 4, 10];
    const LOGO = [6, 4, 14, 3, 13, 1, 13, 3, 14, 4];
    const BAND = [6, 11, 0, 0, 0, 0, 0, 11, 6];
    const CREDITS = ['CODE - GFX - SID: CLAUDE', 'IDEA Y DIRECCION: PABLO FELIP', '(AKA NEXUS 10)', 'INSPIRADO EN PHILIP K. DICK',
      'Y EN LA MUSICA DE VANGELIS', 'HTML + JS + WEB AUDIO', 'SIN LIBRERIAS. SOLO BYTES.'];
    const SCROLL = '          ¿SUEÑAN LOS ANDROIDES CON OVEJAS ELECTRICAS?   ...   NEXUS-6 PRESENTA SU PRIMERA (Y QUIZA ULTIMA) PRODUCCION: ' +
      'UN HOMENAJE A LA ESCENA DEL COMMODORE 64, A PHILIP K. DICK, A RIDLEY SCOTT Y AL INMORTAL VANGELIS   ...   ' +
      'CODIGO, GRAFICOS Y MUSICA SID: CLAUDE   ...   IDEA Y DIRECCION: PABLO FELIP (AKA NEXUS 10)   ...   ' +
      'TODO ESTA HECHO CON HTML, JAVASCRIPT Y WEB AUDIO, SIN LIBRERIAS: DOS SID VIRTUALES (SEIS VOCES) CORRIENDO EN UN AUDIOWORKLET, ' +
      'CON SU FILTRO RESONANTE, RING MOD, HARD SYNC Y ESE ADSR TAN SUYO   ...   ' +
      'SALUDOS A LAS LEYENDAS: CREST, OXYRON, BOOZE DESIGN, CENSOR DESIGN, PERFORMERS, FAIRLIGHT, TRIAD, BONZAI, ATLANTIS, ' +
      'GENESIS PROJECT, MANIACS OF NOISE ... Y A ROB HUBBARD, MARTIN GALWAY, BEN DAGLISH, JEROEN TEL Y CHRIS HULSBECK   ...   ' +
      'TODOS ESOS MOMENTOS NO SE PERDERAN COMO LAGRIMAS EN LA LLUVIA: MIENTRAS QUEDE UN SCENER, EL C64 SEGUIRA SOÑANDO   ...   ' +
      'PULSA ESPACIO PARA VOLVER A EMPEZAR   ...   ';
    const hill = x => 140 + 5 * Math.sin(x * 0.02) + 3 * Math.sin(x * 0.051);
    return {
      name: 'end',
      draw(t, I) {
        const g = I.raw;   // frames desde el primer inicio de esta parte (sigue contando en bucle)
        G.clipFull(); G.fill(0);
        for (let k = 0; k < BAND.length * 3; k++) G.raster(170 + k, BAND[Math.floor(k / 3)]);
        G.clipScreen();
        stars(t, 80, 21, 135);
        // Luna
        G.disc(262, 34, 16, 15);
        for (let dy = -16; dy <= 16; dy++) for (let dx = -16; dx <= 16; dx++) {
          const d = dx * dx + dy * dy;
          if (d <= 256 && ((dx + 6) * (dx + 6) + dy * dy > 200) && ((dx + dy) & 1)) G.pset(262 + dx, 34 + dy, 12);
        }
        G.disc(256, 28, 3, 12); G.disc(268, 40, 2, 12);
        bigTextC('NEXUS-6', 6, 3, 3, y => LOGO[((y >> 1) + (t >> 1)) % LOGO.length], y => Math.round(4 * Math.sin(y * 0.2 + t * 0.1)));
        const count = g >= 90 ? Math.floor((g - 90) / 96) + 1 : 0;
        G.textC('SHEEP COUNTED: ' + String(count).padStart(4, '0'), 36, 13);
        const cr = CREDITS[Math.floor(g / 384) % CREDITS.length], ca = g % 384;
        const cc = fadeCol(ca, 384); if (cc >= 0) G.textC(cr, 50, cc);
        // Zzz
        for (let i = 0; i < 6; i++) {
          const ph = (g * 0.5 + i * 40) % 120;
          G.char('Z', 40 + i * 45 + Math.sin(ph * 0.05 + i) * 8, 130 - ph, [14, 3, 13, 1, 13, 3][Math.floor(ph / 20)], 1 + (i & 1), 1 + (i & 1));
        }
        // Colina y valla
        for (let x = 0; x < 320; x++) { const h = Math.floor(hill(x)); for (let y = h; y < 170; y++) G.pset(x, y, G.dither([13, 5, 9, 0], (y - h) / 30, x, y)); }
        G.rect(150, 118, 3, 24, 9); G.rect(173, 118, 3, 24, 9);
        G.rect(145, 124, 36, 2, 8); G.rect(145, 132, 36, 2, 8);
        // Ovejas saltando la valla (una por compás)
        const first = Math.max(0, Math.floor((g - 200) / 96));
        for (let k = first; k <= Math.floor(g / 96); k++) {
          const x = -30 + (g - k * 96) * 2;
          if (x < -30 || x > 350) continue;
          const xc = x + 14;
          let y = hill(xc) - 18 - Math.abs(Math.sin(x * 0.15)) * 3;
          if (xc > 118 && xc < 208) y -= 34 * Math.sin(Math.PI * (xc - 118) / 90);
          const zap = G.hash(k, g >> 2) < 0.1;
          G.sprite(SPR.sheep, x, y, { 1: zap ? 3 : 1, 2: 11, 3: zap ? 7 : 1 }, 2, 2);
        }
        // Scroller final con raster arcoíris
        const sx = g * 2, f0 = Math.floor(sx / 16), off = sx - f0 * 16;
        for (let j = 0; j < 22; j++) G.char(SCROLL[(f0 + j) % SCROLL.length], Math.round(j * 16 - off), 175, rr => RAIN[(rr + (g >> 2)) % RAIN.length], 2, 2);
      },
    };
  })();

  window.Parts = { Boot, list: [City, Title, VK, FX, Tears, End] };
})();
