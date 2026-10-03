'use strict';
/* ==========================================================================
   GFX: framebuffer "VIC-II" de 384x272 (pantalla PAL visible con borde),
   paleta de 16 colores (Pepto), fuente 8x8, sprites, dithering y fundidos.
   Todas las coordenadas de dibujo son relativas a la pantalla 320x200;
   el borde son coordenadas negativas o mayores (x -32..351, y -36..235).
   ========================================================================== */
(function () {
  const W = 384, H = 272, SX = 32, SY = 36, SW = 320, SH = 200;
  const PALETTE = [0x000000, 0xffffff, 0x68372b, 0x70a4b2, 0x6f3d86, 0x588d43, 0x352879, 0xb8c76f,
                   0x6f4f25, 0x433900, 0x9a6759, 0x444444, 0x6c6c6c, 0x9ad284, 0x6c5eb5, 0x959595];
  // Colores ordenados por luminancia (para fundidos "de toda la vida")
  const LUMA = [0, 6, 9, 11, 2, 4, 8, 12, 14, 5, 10, 15, 3, 7, 13, 1];
  const RANK = []; LUMA.forEach((c, i) => { RANK[c] = i; });
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const fb = new Uint8Array(W * H);
  let cx0 = SX, cy0 = SY, cx1 = SX + SW, cy1 = SY + SH;

  // Fuente 8x8 propia, al estilo de las de 8 bits
  const FONT = {
    'A': '183C667E66666600', 'B': '7C66667C66667C00', 'C': '3C66606060663C00', 'D': '786C6666666C7800',
    'E': '7E60607860607E00', 'F': '7E60607860606000', 'G': '3C66606E66663C00', 'H': '6666667E66666600',
    'I': '3C18181818183C00', 'J': '1E0C0C0C0C6C3800', 'K': '666C7870786C6600', 'L': '6060606060607E00',
    'M': '63777F6B63636300', 'N': '66767E7E6E666600', 'O': '3C66666666663C00', 'P': '7C66667C60606000',
    'Q': '3C666666663C0E00', 'R': '7C66667C786C6600', 'S': '3C66603C06663C00', 'T': '7E18181818181800',
    'U': '6666666666663C00', 'V': '66666666663C1800', 'W': '6363636B7F776300', 'X': '66663C183C666600',
    'Y': '6666663C18181800', 'Z': '7E060C1830607E00',
    '0': '3C666E7666663C00', '1': '1818381818187E00', '2': '3C66060C30607E00', '3': '3C66061C06663C00',
    '4': '060E1E667F060600', '5': '7E607C0606663C00', '6': '3C66607C66663C00', '7': '7E660C1818181800',
    '8': '3C66663C66663C00', '9': '3C66663E06663C00',
    ' ': '0000000000000000', '!': '1818181800001800', '"': '6666660000000000', '#': '6666FF66FF666600',
    '$': '183E603C067C1800', '%': '62660C1830664600', '&': '3C663C3867663F00', "'": '060C180000000000',
    '(': '0C18303030180C00', ')': '30180C0C0C183000', '*': '00663CFF3C660000', '+': '0018187E18180000',
    ',': '0000000000181830', '-': '0000007E00000000', '.': '0000000000181800', '/': '0003060C18306000',
    ':': '0000180000180000', ';': '0000180000181830', '<': '0E18306030180E00', '=': '00007E007E000000',
    '>': '70180C060C187000', '?': '3C66060C18001800', '@': '3C666E6E60623C00', '_': '00000000000000FF',
    '[': '3C30303030303C00', ']': '3C0C0C0C0C0C3C00',
    'Ñ': '7600667E7E6E6600', '¿': '1800183060663C00', '¡': '1800181818181800',
  };
  const glyphs = {};
  for (const k in FONT) { const g = []; for (let i = 0; i < 8; i++) g.push(parseInt(FONT[k].substr(i * 2, 2), 16)); glyphs[k] = g; }
  const ACCENTS = { 'Á': 'A', 'À': 'A', 'Ä': 'A', 'É': 'E', 'È': 'E', 'Ë': 'E', 'Í': 'I', 'Ï': 'I', 'Ó': 'O', 'Ö': 'O',
                    'Ú': 'U', 'Ü': 'U', 'Ç': 'C', '·': '-', '—': '-', '–': '-' };

  const G = { W, H, SX, SY, SW, SH, fb, PALETTE, LUMA, RANK };

  G.clipScreen = () => { cx0 = SX; cy0 = SY; cx1 = SX + SW; cy1 = SY + SH; };
  G.clipFull = () => { cx0 = 0; cy0 = 0; cx1 = W; cy1 = H; };
  G.fill = c => fb.fill(c);
  G.idx = (x, y) => (y + SY) * W + x + SX;

  G.pset = (x, y, c) => {
    x = Math.floor(x) + SX; y = Math.floor(y) + SY;
    if (x < cx0 || x >= cx1 || y < cy0 || y >= cy1) return;
    fb[y * W + x] = c;
  };
  // x1 exclusivo
  G.hline = (x0, x1, y, c) => {
    y = Math.floor(y) + SY; if (y < cy0 || y >= cy1) return;
    const a = Math.max(cx0, Math.floor(x0) + SX), b = Math.min(cx1, Math.floor(x1) + SX);
    if (b > a) fb.fill(c, y * W + a, y * W + b);
  };
  G.rect = (x, y, w, h, c) => {
    x = Math.floor(x); y = Math.floor(y);
    for (let j = 0; j < h; j++) G.hline(x, x + w, y + j, c);
  };
  // Línea raster completa (incluye el borde, ignora el recorte)
  G.raster = (y, c) => {
    y = Math.floor(y) + SY; if (y < 0 || y >= H) return;
    fb.fill(c, y * W, y * W + W);
  };
  G.screen = c => { for (let y = 0; y < SH; y++) { const i = (y + SY) * W + SX; fb.fill(c, i, i + SW); } };

  G.line = (x0, y0, x1, y1, c) => {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, n = 0;
    for (;;) {
      G.pset(x0, y0, c);
      if ((x0 === x1 && y0 === y1) || ++n > 2000) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  G.disc = (cx, cy, r, c) => {
    for (let dy = -r; dy <= r; dy++) { const hw = Math.sqrt(r * r - dy * dy); G.hline(cx - hw, cx + hw + 1, cy + dy, c); }
  };

  // Dithering ordenado (Bayer 4x4) entre los colores de una rampa
  G.dither = (ramp, v, x, y) => {
    if (v <= 0) return ramp[0];
    const n = ramp.length - 1; if (v >= 1) return ramp[n];
    const s = v * n, i = Math.floor(s);
    return ramp[(s - i) > BAYER[((y & 3) << 2) | (x & 3)] ? i + 1 : i];
  };

  // ---------- Texto ----------
  G.glyph = ch => {
    ch = ch.toUpperCase();
    if (ACCENTS[ch]) ch = ACCENTS[ch];
    return glyphs[ch] || glyphs[' '];
  };
  // color: número o función (filaGlifo, columnaGlifo) -> color
  G.char = (ch, x, y, color, sx = 1, sy = 1) => {
    const g = G.glyph(ch), fn = typeof color === 'function';
    for (let r = 0; r < 8; r++) {
      const bits = g[r]; if (!bits) continue;
      for (let b = 0; b < 8; b++) if (bits & (0x80 >> b)) G.rect(x + b * sx, y + r * sy, sx, sy, fn ? color(r, b) : color);
    }
  };
  // color: número o función (índiceCarácter, filaGlifo) -> color
  G.text = (str, x, y, color, sx = 1, sy = 1) => {
    const fn = typeof color === 'function';
    for (let i = 0; i < str.length; i++) G.char(str[i], x + i * 8 * sx, y, fn ? (r => color(i, r)) : color, sx, sy);
  };
  G.textC = (str, y, color, sx = 1, sy = 1) => G.text(str, Math.round((SW - str.length * 8 * sx) / 2), y, color, sx, sy);
  G.wrap = (text, n) => {
    const lines = []; let cur = '';
    for (const w of text.split(' ')) {
      const t = cur ? cur + ' ' + w : w;
      if (t.length > n && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  // ---------- Sprites ----------
  // rows: array de strings; '.' transparente; otro carácter -> colors[ch]
  // pw/ph: tamaño de cada píxel (multicolor = 2x1, expandido = 4x2...)
  G.sprite = (rows, x, y, colors, pw = 2, ph = 1, flip = false) => {
    x = Math.round(x); y = Math.round(y);
    for (let r = 0; r < rows.length; r++) {
      const s = rows[r], n = s.length;
      for (let i = 0; i < n; i++) {
        const ch = s[flip ? n - 1 - i : i]; if (ch === '.') continue;
        const c = colors[ch]; if (c === undefined || c < 0) continue;
        G.rect(x + i * pw, y + r * ph, pw, ph, c);
      }
    }
  };

  // ---------- Triángulo relleno con sombreado "multicolor" (píxeles 2x1) ----------
  G.tri = (x0, y0, x1, y1, x2, y2, ramp, v) => {
    let t;
    if (y1 < y0) { t = x0; x0 = x1; x1 = t; t = y0; y0 = y1; y1 = t; }
    if (y2 < y0) { t = x0; x0 = x2; x2 = t; t = y0; y0 = y2; y2 = t; }
    if (y2 < y1) { t = x1; x1 = x2; x2 = t; t = y1; y1 = y2; y2 = t; }
    const ys = Math.max(Math.ceil(y0), cy0 - SY), ye = Math.min(Math.ceil(y2), cy1 - SY);
    for (let y = ys; y < ye; y++) {
      const xa = x0 + (x2 - x0) * (y - y0) / ((y2 - y0) || 1);
      const xb = y < y1 ? x0 + (x1 - x0) * (y - y0) / ((y1 - y0) || 1) : x1 + (x2 - x1) * (y - y1) / ((y2 - y1) || 1);
      let l = Math.round(Math.min(xa, xb) / 2) * 2, r = Math.round(Math.max(xa, xb) / 2) * 2;
      l = Math.max(l, cx0 - SX); r = Math.min(r, cx1 - SX);
      const row = (y + SY) * W + SX;
      for (let x = l; x < r; x += 2) {
        const c = G.dither(ramp, v, x >> 1, y);
        fb[row + x] = c; fb[row + x + 1] = c;
      }
    }
  };

  // ---------- Fundidos por tabla (como en el C64: cambiar colores, no mezclar) ----------
  const ID = [...Array(16).keys()];
  G.lutFade = level => { const s = Math.round((1 - Math.max(0, Math.min(1, level))) * 15); return ID.map(c => LUMA[Math.max(0, RANK[c] - s)]); };
  G.lutWhite = level => { const s = Math.round(Math.max(0, Math.min(1, level)) * 15); return ID.map(c => LUMA[Math.min(15, RANK[c] + s)]); };

  // ---------- Aleatoriedad determinista (para que todo sea reproducible al saltar) ----------
  G.rng = seed => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  G.hash = (a, b = 0) => {
    let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
    h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // ---------- Volcado al canvas ----------
  let ctx, img, u32, pal32;
  G.init = canvas => {
    ctx = canvas.getContext('2d');
    img = ctx.createImageData(W, H);
    u32 = new Uint32Array(img.data.buffer);
    pal32 = PALETTE.map(rgb => (0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff)) >>> 0);
  };
  const p = new Uint32Array(16);
  G.present = lut => {
    for (let i = 0; i < 16; i++) p[i] = pal32[lut ? lut[i] : i];
    for (let i = 0; i < fb.length; i++) u32[i] = p[fb[i]];
    ctx.putImageData(img, 0, 0);
  };

  // ---------- Sprites de la demo ----------
  G.SPR = {
    sheep: [ // multicolor 14x9: 1 lana, 2 cabeza/patas, 3 ojo
      '....1111......',
      '..11111111.22.',
      '.1111111111232',
      '11111111111222',
      '.111111111122.',
      '..11111111....',
      '..2.2..2.2....',
      '..2.2..2.2....',
      '..2.2..2.2....',
    ],
    spinner: [ // multicolor 12x6, morro a la derecha
      '....3333....',
      '...333333...',
      '.1111111111.',
      '111111111112',
      '.1111111111.',
      '..1......1..',
    ],
    dove1: [
      '#..............#',
      '##............##',
      '.###........###.',
      '..####.##.####..',
      '...##########...',
      '.......##.......',
      '......####......',
      '.......##.......',
    ],
    dove2: [
      '................',
      '................',
      '.......##.......',
      '...##########...',
      '..####.##.####..',
      '.###...##...###.',
      '##....####....##',
      '#......##......#',
    ],
    figure: [
      '...##.....',
      '..####....',
      '..####....',
      '...##.....',
      '..####....',
      '.######...',
      '########..',
      '##.####...',
      '#..####...',
      '...######.',
      '...#######',
      '...##...##',
      '...##...##',
    ],
  };

  window.GFX = G;
})();
