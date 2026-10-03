'use strict';
/* ==========================================================================
   VOZ "SAM" (Software Automatic Mouth, 1982) hecha a mano:
   texto -> fonemas (diccionario + reglas tipo "Reciter") -> prosodia ->
   síntesis de formantes (pulsos glotales + 3 resonadores, ruido filtrado) ->
   muestras de 4 bits a ~11 kHz, que el SID reproduce por su registro de
   volumen ($D418), exactamente el truco que usaba SAM en el C64.
   ========================================================================== */
(function () {
  const RATE = 11025;
  // Mezcla: fricción, aspiración, fuerza de las explosiones, percentil de normalización y compresión
  const MIX = { fric: 0.5, asp: 0.3, burst: 0.5, pct: 0.98, comp: 1.0, f4: false };

  // ---------- Fonemas (estilo ARPAbet). f = formantes F1,F2,F3 (Hz); d = duración (ms) ----------
  // t: v vocal, d diptongo, l líquida/semivocal, n nasal, f fricativa, h aspiración, p explosiva, a africada
  const PH = {
    IY: { t: 'v', f: [270, 2290, 3010], d: 110 }, IH: { t: 'v', f: [390, 1990, 2550], d: 80 },
    EH: { t: 'v', f: [530, 1840, 2480], d: 90 }, AE: { t: 'v', f: [660, 1720, 2410], d: 120 },
    AA: { t: 'v', f: [730, 1090, 2440], d: 120 }, AH: { t: 'v', f: [620, 1220, 2550], d: 80 },
    AO: { t: 'v', f: [570, 840, 2410], d: 120 }, UH: { t: 'v', f: [440, 1020, 2240], d: 80 },
    UW: { t: 'v', f: [300, 870, 2240], d: 110 }, ER: { t: 'v', f: [490, 1350, 1690], d: 110 },
    AY: { t: 'd', f: [730, 1090, 2440], f2: [400, 1950, 2600], d: 180 },
    EY: { t: 'd', f: [530, 1840, 2480], f2: [330, 2200, 2800], d: 160 },
    OY: { t: 'd', f: [570, 840, 2410], f2: [400, 1950, 2600], d: 200 },
    OW: { t: 'd', f: [570, 900, 2410], f2: [330, 800, 2250], d: 160 },
    AW: { t: 'd', f: [730, 1090, 2440], f2: [350, 850, 2300], d: 180 },
    W: { t: 'l', f: [290, 610, 2150], d: 60 }, Y: { t: 'l', f: [260, 2070, 3020], d: 60 },
    R: { t: 'l', f: [310, 1060, 1380], d: 70 }, L: { t: 'l', f: [330, 1050, 2880], d: 70 },
    M: { t: 'n', f: [250, 1270, 2130], d: 70 }, N: { t: 'n', f: [250, 1650, 2470], d: 65 },
    NG: { t: 'n', f: [250, 2000, 2900], d: 70 },
    S: { t: 'f', loc: [250, 1700, 2600], fn: 4300, bw: 1400, af: 0.55, d: 110 }, SH: { t: 'f', loc: [250, 2000, 2700], fn: 2600, bw: 1200, af: 0.6, d: 120 },
    F: { t: 'f', loc: [250, 900, 2300], fn: 3200, bw: 3000, af: 0.2, d: 100 }, TH: { t: 'f', loc: [250, 1500, 2600], fn: 3600, bw: 3000, af: 0.15, d: 90 },
    Z: { t: 'f', loc: [250, 1700, 2600], fn: 4300, bw: 1400, af: 0.3, v: 0.5, d: 90 }, ZH: { t: 'f', loc: [250, 2000, 2700], fn: 2600, bw: 1200, af: 0.35, v: 0.5, d: 90 },
    V: { t: 'f', loc: [250, 900, 2300], fn: 3200, bw: 3000, af: 0.1, v: 0.6, d: 70 }, DH: { t: 'f', loc: [250, 1500, 2600], fn: 3600, bw: 3000, af: 0.08, v: 0.6, d: 50 },
    HH: { t: 'h', d: 60 },
    P: { t: 'p', loc: [250, 900, 2300], fn: 1100, bw: 2000, d: 70 }, T: { t: 'p', loc: [250, 1700, 2600], fn: 3800, bw: 2000, d: 65 }, K: { t: 'p', loc: [250, 2100, 2700], fn: 2200, bw: 1500, d: 75 },
    B: { t: 'p', loc: [250, 900, 2300], fn: 1100, bw: 2000, v: 1, d: 60 }, D: { t: 'p', loc: [250, 1700, 2600], fn: 3500, bw: 2000, v: 1, d: 55 }, G: { t: 'p', loc: [250, 2100, 2700], fn: 2200, bw: 1500, v: 1, d: 60 },
    CH: { t: 'a', loc: [250, 2000, 2700], fn: 2600, bw: 1200, d: 130 }, JH: { t: 'a', loc: [250, 2000, 2700], fn: 2600, bw: 1200, v: 1, d: 110 },
  };

  // ---------- Diccionario (1 = sílaba tónica, 0 = átona) ----------
  const DICT = {
    voight: 'V OY1 T', kampff: 'K AE1 M P F', empathy: 'EH1 M P AH0 TH IY0', test: 'T EH1 S T',
    subject: 'S AH1 B JH EH0 K T', nexus: 'N EH1 K S AH0 S', six: 'S IH1 K S', begin: 'B IH0 G IH1 N',
    you: 'Y UW1', find: 'F AY1 N D', a: 'AH0', sheep: 'SH IY1 P', in: 'IH0 N', the: 'DH AH0', rain: 'R EY1 N',
    it: 'IH0 T', is: 'IH0 Z', electric: 'IH0 L EH1 K T R IH0 K', shivering: 'SH IH1 V ER0 IH0 NG',
    what: 'W AH1 T', do: 'D UW1', your: 'Y AO1 R', first: 'F ER1 S T', memory: 'M EH1 M ER0 IY0',
    warm: 'W AO1 R M', kitchen: 'K IH1 CH AH0 N', voice: 'V OY1 S', love: 'L AH1 V', who: 'HH UW1',
    gave: 'G EY1 V', to: 'T UW0', index: 'IH1 N D EH0 K S', inconclusive: 'IH0 N K AH0 N K L UW1 S IH0 V',
    dreams: 'D R IY1 M Z', dream: 'D R IY1 M', i: 'AY1', was: 'W AA0 Z', built: 'B IH1 L T',
    forget: 'F ER0 G EH1 T', but: 'B AH0 T', kept: 'K EH1 P T', every: 'EH1 V R IY0', moment: 'M OW1 M AH0 N T',
    neon: 'N IY1 AA0 N', bleeding: 'B L IY1 D IH0 NG', on: 'AA0 N', wet: 'W EH1 T', streets: 'S T R IY1 T S',
    spinners: 'S P IH1 N ER0 Z', humming: 'HH AH1 M IH0 NG', above: 'AH0 B AH1 V', fire: 'F AY1 ER0',
    that: 'DH AE0 T', not: 'N AA1 T', real: 'R IY1 L', and: 'AE0 N D', loved: 'L AH1 V D', me: 'M IY1',
    anyway: 'EH1 N IY0 W EY0', all: 'AO1 L', of: 'AH0 V', will: 'W IH0 L', fade: 'F EY1 D', like: 'L AY1 K',
    signal: 'S IH1 G N AH0 L', into: 'IH1 N T UW0', static: 'S T AE1 T IH0 K', time: 'T AY1 M',
    androids: 'AE1 N D R OY0 D Z', commodore: 'K AA1 M AH0 D AO0 R', hello: 'HH AH0 L OW1',
    my: 'M AY1', name: 'N EY1 M', sam: 'S AE1 M', human: 'HH Y UW1 M AH0 N', than: 'DH AE0 N', more: 'M AO1 R',
  };

  // ---------- Reglas de lectura para palabras que no están en el diccionario ----------
  const RULES = [
    ['tion', 'SH AH N'], ['ough', 'AO'], ['igh', 'AY'], ['tch', 'CH'], ['th', 'TH'], ['sh', 'SH'], ['ch', 'CH'],
    ['ph', 'F'], ['ck', 'K'], ['ng', 'NG'], ['qu', 'K W'], ['wh', 'W'], ['ee', 'IY'], ['ea', 'IY'], ['oo', 'UW'],
    ['ai', 'EY'], ['ay', 'EY'], ['oa', 'OW'], ['ou', 'AW'], ['ow', 'OW'], ['oi', 'OY'], ['oy', 'OY'], ['er', 'ER'],
    ['ar', 'AA R'], ['or', 'AO R'], ['ir', 'ER'], ['ur', 'ER'],
    ['a', 'AE'], ['b', 'B'], ['d', 'D'], ['e', 'EH'], ['f', 'F'], ['g', 'G'], ['h', 'HH'], ['i', 'IH'], ['j', 'JH'],
    ['k', 'K'], ['l', 'L'], ['m', 'M'], ['n', 'N'], ['o', 'AA'], ['p', 'P'], ['q', 'K'], ['r', 'R'], ['s', 'S'],
    ['t', 'T'], ['u', 'AH'], ['v', 'V'], ['w', 'W'], ['x', 'K S'], ['z', 'Z'],
  ];
  function rules(w) {
    if (w.length > 2 && w.endsWith('e') && !/[aeiou]e$/.test(w)) w = w.slice(0, -1);   // "e" final muda
    const out = [];
    for (let i = 0; i < w.length;) {
      if (w[i] === 'c') { out.push(/[eiy]/.test(w[i + 1] || '') ? 'S' : 'K'); i++; continue; }
      if (w[i] === 'y') { out.push(i === 0 ? 'Y' : i === w.length - 1 ? 'IY' : 'IH'); i++; continue; }
      if (i > 0 && w[i] === w[i - 1] && !/[aeiou]/.test(w[i])) { i++; continue; }       // consonantes dobles
      const r = RULES.find(([k]) => w.startsWith(k, i));
      if (!r) { i++; continue; }
      out.push(r[1]); i += r[0].length;
    }
    let stressed = false;   // primera vocal, tónica
    return out.join(' ').split(' ').map(p => (!stressed && PH[p] && 'vd'.includes(PH[p].t) ? (stressed = true, p + '1') : p)).join(' ');
  }

  function textToItems(text) {
    const items = [];
    const toks = text.toLowerCase().replace(/\.\.\./g, ' … ').match(/[a-z']+|[.,!?:;…]/g) || [];
    for (const tk of toks) {
      if (/^[.,!?:;…]$/.test(tk)) { items.push({ pause: tk }); continue; }
      const w = tk.replace(/'/g, '');
      for (const p of (DICT[w] || rules(w)).split(' ')) {
        const m = /^([A-Z]+)([012])?$/.exec(p);
        if (!m || !PH[m[1]]) continue;
        items.push({ ph: m[1], stress: m[2] !== undefined ? +m[2] : ('vd'.includes(PH[m[1]].t) ? 1 : 0) });
      }
    }
    return items;
  }

  // ---------- Prosodia + segmentos ----------
  function build(items, o) {
    const ms = x => Math.max(1, Math.round(x / 1000 * RATE / o.speed));
    const pitchOf = [];
    let s0 = 0;
    for (let i = 0; i <= items.length; i++) {
      const it = items[i];
      if (it && !(it.pause && '.?!…'.includes(it.pause))) continue;
      const vow = [];
      for (let k = s0; k < i; k++) if (items[k].ph && 'vd'.includes(PH[items[k].ph].t)) vow.push(k);
      const q = it && it.pause === '?', n = vow.length;
      vow.forEach((k, j) => {
        let p = o.pitch * (1 + o.expr * (0.08 - 0.16 * j / Math.max(1, n - 1)));    // declinación
        if (items[k].stress === 1) p *= 1 + 0.1 * o.expr;                            // acento
        let pe = p;
        if (j === n - 1) pe = q ? p * (1 + 0.35 * o.expr) : p * (1 - 0.15 * o.expr);  // final: pregunta sube, afirmación cae
        pitchOf[k] = [p, pe];
      });
      s0 = i + 1;
    }
    const segs = [];
    items.forEach((it, i) => {
      if (it.pause) { segs.push({ dur: ms(it.pause === '…' ? 520 : '.?!'.includes(it.pause) ? 340 : 170), av: 0, af: 0, ah: 0, f: null, fn: 3000, bw: 2000 }); return; }
      const P = PH[it.ph], pp = pitchOf[i];
      const base = { f: P.f || P.loc || null, f2: P.f2 || P.f || P.loc || null, p: pp ? pp[0] : null, pe: pp ? pp[1] : null,
                     av: 0, af: 0, ah: 0, fn: P.fn || 3000, bw: P.bw || 2000, nasal: P.t === 'n' };
      const seg = (extra, d) => segs.push(Object.assign({}, base, extra, { dur: ms(d) }));
      switch (P.t) {
        case 'v': case 'd': seg({ av: 1 }, P.d * (it.stress === 1 ? 1.3 : it.stress === 0 ? 0.75 : 1)); break;
        case 'l': seg({ av: 0.7 }, P.d); break;
        case 'n': seg({ av: 0.45 }, P.d); break;
        case 'f': seg({ av: (P.v || 0) * 0.6, af: P.af }, P.d); break;
        case 'h': seg({ ah: 0.35, f: null, f2: null }, P.d); break;
        case 'p':
          seg({ av: P.v ? 0.12 : 0 }, P.d * 0.75);                      // oclusión
          seg({ af: P.v ? 0.5 : 0.9, burst: true }, 14);               // explosión
          if (!P.v) seg({ f: null, f2: null, ah: 0.3 }, 35);                                // aspiración
          break;
        case 'a':
          seg({ av: P.v ? 0.12 : 0 }, 45);
          seg({ af: 0.6, av: P.v ? 0.4 : 0 }, P.d - 45);
          break;
      }
    });
    // Las consonantes sin formantes propios toman los de la vocal siguiente (o anterior)
    for (let i = 0; i < segs.length; i++) if (!segs[i].f) {
      let j = i + 1; while (j < segs.length && !segs[j].f) j++;
      let src = segs[j];
      if (!src) { j = i - 1; while (j >= 0 && !segs[j].f) j--; src = segs[j]; }
      const f = src ? (j > i ? src.f : src.f2) : [500, 1500, 2500];
      segs[i].f = f; segs[i].f2 = f;
    }
    let lastP = o.pitch;
    for (let i = segs.length - 1; i >= 0; i--) { if (segs[i].p) lastP = segs[i].p; else { segs[i].p = segs[i].pe = lastP; } }
    return segs;
  }

  // ---------- Síntesis de formantes ----------
  function reson(F, BW) {  // resonador digital de Klatt (ganancia unidad en DC)
    const T = 1 / RATE, C = -Math.exp(-2 * Math.PI * BW * T), B = 2 * Math.exp(-Math.PI * BW * T) * Math.cos(2 * Math.PI * F * T);
    return [1 - B - C, B, C];
  }
  function synth(segs, P) {
    const total = segs.reduce((a, s) => a + s.dur, 0) + Math.round(RATE * 0.06);
    const out = new Float32Array(total);
    let F = segs[0].f.slice(), av = 0, af = 0, ah = 0, pitch = segs[0].p, tp = pitch, phase = 0;
    const st = [[0, 0], [0, 0], [0, 0], [0, 0]]; let co = [];
    const gl = [0, 0], GL = reson(0, 120); let glPrev = 0;
    let bp = [0, 0, 0, 0, 0, 0], fx1 = 0, fx2 = 0, fy1 = 0, fy2 = 0;
    let seed = 12345;
    const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
    let n = 0;
    for (const s of segs) {
      const T = Math.min(Math.round(RATE * 0.045), s.dur >> 1), F0 = F.slice();
      for (let k = 0; k < s.dur; k++, n++) {
        if ((k & 31) === 0) {
          for (let i = 0; i < 3; i++) F[i] = k < T ? F0[i] + (s.f[i] - F0[i]) * k / T : s.f[i] + (s.f2[i] - s.f[i]) * (k - T) / Math.max(1, s.dur - T);
          co = [reson(F[0], s.nasal ? 300 : 90), reson(F[1], 110), reson(F[2], 170)];
          if (P.f4) co.push(reson(3500, 250));
          const w0 = 2 * Math.PI * Math.min(s.fn, RATE * 0.45) / RATE, al = Math.sin(w0) / (2 * (s.fn / s.bw)), a0 = 1 + al;
          bp = [al / a0, 0, -al / a0, -2 * Math.cos(w0) / a0, (1 - al) / a0];
          tp = s.p + (s.pe - s.p) * k / s.dur;
        }
        av += (s.av - av) * 0.004;
        af += ((s.burst ? s.af * P.burst : s.af) - af) * (s.burst ? 0.3 : 0.006);
        ah += (s.ah - ah) * 0.01;
        pitch += (tp - pitch) * 0.003;
        // fuente glotal: tren de impulsos -> paso bajo -> derivada (radiación)
        phase += pitch / RATE;
        let imp = 0; if (phase >= 1) { phase -= 1; imp = 1; }
        const g = GL[0] * imp + GL[1] * gl[0] + GL[2] * gl[1]; gl[1] = gl[0]; gl[0] = g;
        let x = (g - glPrev) * av * 60 + noise() * ah * P.asp; glPrev = g;
        for (let i = 0; i < co.length; i++) { const c = co[i], y = c[0] * x + c[1] * st[i][0] + c[2] * st[i][1]; st[i][1] = st[i][0]; st[i][0] = y; x = y; }
        // fricción por un paso banda paralelo
        const nz = noise() * af;
        const fy = bp[0] * nz + bp[2] * fx2 - bp[3] * fy1 - bp[4] * fy2;
        fx2 = fx1; fx1 = nz; fy2 = fy1; fy1 = fy;
        out[n] = x + fy * P.fric;
      }
    }
    return out;
  }

  // ---------- 4 bits, como el DAC improvisado del registro de volumen ----------
  // Normaliza por percentil (no por el pico: las explosiones dejarían las vocales en 1-2 niveles)
  function to4bit(x, P) {
    let dc = 0;
    for (let i = 0; i < x.length; i++) { dc += (x[i] - dc) * 0.01; x[i] -= dc; }
    const mags = Array.from(x, Math.abs).sort((a, b) => a - b);
    const ref = mags[Math.floor(mags.length * P.pct)] || 1e-6;
    for (let i = 0; i < x.length; i++) {
      const v = Math.tanh(x[i] / ref * P.comp);
      if (!P.raw) x[i] = Math.round((v + 1) * 7.5) / 7.5 - 1;   // 16 niveles
      else x[i] = v;
    }
    return x;
  }

  // opts: pitch (Hz), speed (1 = normal), expr (0 = monótono robótico, 1 = expresivo)
  function render(text, opts = {}) {
    const o = Object.assign({ pitch: 100, speed: 1, expr: 0.6 }, opts);
    const P = Object.assign({}, MIX, opts.mix || {}, { raw: !!opts.raw });
    const segs = build(textToItems(text), o);
    if (!segs.length) return { data: new Float32Array(0), rate: RATE, frames: 0 };
    const data = to4bit(synth(segs, P), P);
    return { data, rate: RATE, frames: Math.round(data.length / RATE * 50) };
  }

  window.SAM = { render, RATE, phonemes: t => textToItems(t).map(i => i.pause || i.ph + (i.stress ? i.stress : '')).join(' ') };
})();
