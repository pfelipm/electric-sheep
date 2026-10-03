'use strict';
/* ==========================================================================
   SID virtual (MOS 6581/8580 aproximado) + player tipo tracker a 50 Hz.
   Todo el código de audio corre en un AudioWorklet. La función se serializa
   a un Blob para poder abrir el demo incluso desde file:// sin servidor.
   ========================================================================== */
function sidWorkletMain() {
  'use strict';
  const CLOCK = 985248;             // reloj PAL del C64 (Hz)
  const TWO24 = 16777216, HALF = 8388608;
  // Tiempos de ataque del SID (ms). Decay/release usan la misma base y la
  // curva exponencial del contador del chip los hace ~3 veces más largos.
  const RATE_MS = [2, 8, 16, 24, 38, 56, 68, 80, 100, 250, 500, 800, 1000, 3000, 5000, 8000];

  function blep(t, dt) {
    if (t < dt) { t /= dt; return t + t - t * t - 1; }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
    return 0;
  }

  class Voice {
    constructor() {
      this.acc = 0; this.freq = 0; this.pw = 2048; this.ctrl = 0; this.ad = 0; this.sr = 0;
      this.env = 0; this.state = 2; this.gate = 0; this.retrig = false;
      this.lfsr = 0x7ffff8; this.nacc = 0; this.noise = 0; this.wrap = false;
    }
  }

  class Chip {
    constructor(sr) {
      this.sr = sr; this.cps = CLOCK / sr;
      this.inc = RATE_MS.map(ms => 1 / (ms * 0.001 * sr));
      this.v = [new Voice(), new Voice(), new Voice()];
      this.route = 0; this.mode = 0x10; this.vol = 15;
      this.low = 0; this.band = 0; this.f = 0.1; this.q = 1.4;
      this.setFilter(1024, 0, 0x10);
    }
    // cut: registro de 11 bits; res: 0..15; mode: 0x10 LP, 0x20 BP, 0x40 HP
    setFilter(cut, res, mode) {
      const fc = 30 * Math.pow(2, (cut / 2047) * 8.6);
      this.f = 2 * Math.sin(Math.PI * Math.min(fc, 14000) / (2 * this.sr));
      this.q = 1 / (0.707 + (res / 15) * 2.3);
      this.mode = mode;
    }
    sample() {
      const v = this.v, cps = this.cps;
      // 1) osciladores
      for (let i = 0; i < 3; i++) {
        const o = v[i]; o.wrap = false;
        if (o.ctrl & 8) { o.acc = 0; o.lfsr = 0x7ffff8; continue; }
        const d = o.freq * cps;
        o.acc += d;
        if (o.acc >= TWO24) { o.acc -= TWO24; o.wrap = true; }
        if (o.ctrl & 0x80) {
          o.nacc += d * 16 / TWO24;
          let n = 0;
          while (o.nacc >= 1 && n < 16) {
            o.nacc -= 1; n++;
            const b = ((o.lfsr >> 22) ^ (o.lfsr >> 17)) & 1;
            o.lfsr = ((o.lfsr << 1) | b) & 0x7fffff;
          }
          if (n) {
            const r = o.lfsr;
            o.noise = ((r >> 15) & 0x80) | ((r >> 14) & 0x40) | ((r >> 11) & 0x20) | ((r >> 9) & 0x10) |
                      ((r >> 8) & 0x08) | ((r >> 5) & 0x04) | ((r >> 3) & 0x02) | ((r >> 2) & 0x01);
          }
        }
      }
      // 2) hard sync (voz1<-voz3, voz2<-voz1, voz3<-voz2)
      for (let i = 0; i < 3; i++) if ((v[i].ctrl & 2) && v[(i + 2) % 3].wrap) v[i].acc = 0;
      // 3) envolventes + formas de onda
      let direct = 0, filt = 0;
      for (let i = 0; i < 3; i++) {
        const o = v[i];
        const g = o.ctrl & 1;
        if (o.retrig) { o.state = 0; o.retrig = false; }
        else if (g && !o.gate) o.state = 0;
        else if (!g && o.gate) o.state = 2;
        o.gate = g;
        let e = o.env;
        if (o.state === 0) {
          e += this.inc[o.ad >> 4];
          if (e >= 1) { e = 1; o.state = 1; }
        } else {
          const tgt = o.state === 1 ? (o.sr >> 4) / 15 : 0;
          if (e > tgt) {
            const lv = e * 255;
            const m = lv > 93 ? 1 : lv > 54 ? 0.5 : lv > 26 ? 0.25 : lv > 14 ? 0.125 : lv > 6 ? 0.0625 : 0.033;
            e -= this.inc[o.state === 1 ? o.ad & 15 : o.sr & 15] * m;
            if (e < tgt) e = tgt;
          }
        }
        o.env = e;
        if (e <= 0.0001) continue;
        const wf = o.ctrl & 0xf0; if (!wf) continue;
        let out;
        if (wf === 0x20 || (wf === 0x40 && !(o.ctrl & 8))) {
          // sierra y pulso "puros": con polyBLEP para evitar aliasing a 48 kHz
          const p = o.acc / TWO24, dt = Math.min(0.5, o.freq * cps / TWO24);
          if (wf === 0x20) out = 2 * p - 1 - blep(p, dt);
          else if (o.pw === 0) out = 1;
          else {
            const w = o.pw / 4096;
            out = p < w ? -1 : 1;
            out -= blep(p, dt);
            let q = p - w; if (q < 0) q += 1;
            out += blep(q, dt);
          }
        } else {
          // camino "digital" de 12 bits: triángulo, ring mod, ruido y ondas combinadas (AND)
          const a = Math.floor(o.acc); let val = 0xfff;
          if (wf & 0x10) {
            let msb = a & HALF;
            if (o.ctrl & 4) msb ^= v[(i + 2) % 3].acc >= HALF ? HALF : 0;
            val &= ((msb ? ~a : a) >> 11) & 0xfff;
          }
          if (wf & 0x20) val &= a >> 12;
          if (wf & 0x40) val &= ((a >> 12) >= o.pw || (o.ctrl & 8)) ? 0xfff : 0;
          if (wf & 0x80) val &= o.noise << 4;
          out = val / 2047.5 - 1;
        }
        const s = out * e;
        if (this.route & (1 << i)) filt += s; else direct += s;
      }
      // 4) filtro de estado variable 12 dB/oct (2x sobremuestreo) con saturación suave
      let fo = 0;
      if (this.route) {
        const f = this.f, q = this.q;
        let low = this.low, band = this.band, high = 0;
        for (let k = 0; k < 2; k++) { low += f * band; high = filt - low - q * band; band += f * high; }
        this.low = low; this.band = band;
        const m = this.mode;
        if (m & 0x10) fo += low;
        if (m & 0x20) fo += band;
        if (m & 0x40) fo += high;
        fo = Math.tanh(fo * 1.15);
      }
      return (direct + fo) * this.vol / 15 * 0.27;
    }
  }

  /* ---------------- Player (estilo GoatTracker simplificado) ----------------
     Cada instrumento: { ad, sr, wave:[[ctrl, nota, abs?],...], loop, pw:[ini, vel, min, max],
     vib:[retardo, velocidad, profundidad], glide, arp, detune, hr, filter:{mode, res, cut:[...], lfo:[...]}} */
  class Player {
    constructor(chips) { this.chips = chips; this.song = null; this.sec = 0; this.row = 0; this.fir = 0; this.reset(); }
    load(song) { this.song = song; this.reset(); }
    cv(v) { return this.chips[(v / 3) | 0].v[v % 3]; }
    reset() {
      this.vs = [];
      for (let v = 0; v < 6; v++) {
        this.vs.push({ ins: null, cur: 60, target: 60, chord: null, wpos: 0, age: 0, gate: false, hr: false, pw: 2048, pwd: 1 });
        const c = this.cv(v); c.ctrl = 0; c.env = 0; c.state = 2; c.gate = 0; c.freq = 0;
      }
      for (const c of this.chips) { c.route = 0; c.low = 0; c.band = 0; }
      this.fprog = [null, null];
    }
    seek(frame) {
      const S = this.song; if (!S) return;
      let f = Math.max(0, frame), s = 0;
      for (;;) {
        const len = S.sections[s].rows * S.sections[s].speed;
        if (f < len) break;
        f -= len; s++;
        if (s >= S.sections.length) s = S.loop;
      }
      const sp = S.sections[s].speed;
      this.sec = s; this.row = Math.floor(f / sp); this.fir = f % sp;
      this.reset();
    }
    peekNext() {
      const S = this.song, sec = S.sections[this.sec];
      if (this.row + 1 < sec.rows) return [sec, this.row + 1];
      return [S.sections[this.sec + 1 < S.sections.length ? this.sec + 1 : S.loop], 0];
    }
    event(v, e) {
      const vs = this.vs[v], cv = this.cv(v);
      if (e.off) { vs.gate = false; return; }
      const ins = this.song.ins[e.i];
      if (e.l && vs.ins) {             // legato: cambia la nota sin redisparar (portamento si hay glide)
        vs.target = e.n;
        if (!vs.ins.glide) vs.cur = e.n;
        if (e.c) vs.chord = e.c;
        return;
      }
      vs.ins = ins; vs.cur = vs.target = e.n; vs.chord = e.c; vs.wpos = 0; vs.age = 0;
      vs.gate = true; vs.hr = false;
      vs.pw = ins.pw ? ins.pw[0] : 2048; vs.pwd = 1;
      cv.ad = ins.ad; cv.sr = ins.sr; cv.retrig = true;
      const ci = (v / 3) | 0, chip = this.chips[ci], bit = 1 << (v % 3);
      if (ins.filter) { chip.route |= bit; this.fprog[ci] = { f: ins.filter, age: 0 }; }
      else chip.route &= ~bit;
    }
    update(v) {
      const vs = this.vs[v], ins = vs.ins; if (!ins) return;
      const cv = this.cv(v);
      const w = ins.wave[vs.wpos];
      vs.wpos++;
      if (vs.wpos >= ins.wave.length) vs.wpos = ins.loop !== undefined ? ins.loop : ins.wave.length - 1;
      let pitch;
      if (w[2]) pitch = w[1];          // nota absoluta (baterías)
      else {
        if (vs.cur !== vs.target) {
          const g = ins.glide || 99;
          vs.cur = vs.cur < vs.target ? Math.min(vs.target, vs.cur + g) : Math.max(vs.target, vs.cur - g);
        }
        pitch = vs.cur + w[1];
        if (vs.chord) pitch += vs.chord[Math.floor(vs.age / (ins.arp || 1)) % vs.chord.length];
        if (ins.vib && vs.age > ins.vib[0]) {
          const k = vs.age - ins.vib[0];
          pitch += Math.sin(k * ins.vib[1]) * ins.vib[2] * Math.min(1, k / 25);
        }
        pitch += ins.detune || 0;
      }
      const hz = 440 * Math.pow(2, (pitch - 69) / 12);
      cv.freq = Math.min(65535, Math.max(0, Math.round(hz * TWO24 / CLOCK)));
      if (ins.pw && ins.pw[1]) {
        vs.pw += ins.pw[1] * vs.pwd;
        if (vs.pw >= ins.pw[3]) { vs.pw = ins.pw[3]; vs.pwd = -1; }
        else if (vs.pw <= ins.pw[2]) { vs.pw = ins.pw[2]; vs.pwd = 1; }
      }
      cv.pw = vs.pw & 0xfff;
      const gate = vs.gate && !vs.hr && (w[0] & 1);
      cv.ctrl = (w[0] & 0xfe) | (gate ? 1 : 0);
      vs.age++;
    }
    tick() {
      const S = this.song; if (!S) return;
      const sec = S.sections[this.sec];
      if (this.fir === 0) for (let v = 0; v < 6; v++) { const e = sec.tracks[v][this.row]; if (e) this.event(v, e); }
      // hard restart: 2 frames antes de la siguiente nota, ADSR a 0 y gate off
      if (this.fir === sec.speed - 2) {
        const [ns, nr] = this.peekNext();
        for (let v = 0; v < 6; v++) {
          const e = ns.tracks[v][nr];
          if (e && !e.off && !e.l && S.ins[e.i].hr) { const cv = this.cv(v); cv.ad = 0; cv.sr = 0; this.vs[v].hr = true; }
        }
      }
      for (let v = 0; v < 6; v++) this.update(v);
      // programas de filtro (uno por chip, como en el hardware)
      for (let c = 0; c < 2; c++) {
        const fp = this.fprog[c]; if (!fp) continue;
        const f = fp.f, a = fp.age++, [s, p, at, su, de] = f.cut;
        let cut;
        if (a < at) cut = s + (p - s) * a / at;
        else if (a - at < de) cut = p + (su - p) * (a - at) / de;
        else cut = su;
        if (f.lfo) cut += Math.sin(a * f.lfo[0]) * f.lfo[1];
        this.chips[c].setFilter(Math.max(0, Math.min(2047, cut)), f.res, f.mode);
      }
      if (++this.fir >= sec.speed) {
        this.fir = 0;
        if (++this.row >= sec.rows) {
          this.row = 0;
          this.sec = this.sec + 1 < S.sections.length ? this.sec + 1 : S.loop;
        }
      }
    }
  }

  class SIDProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.chips = [new Chip(sampleRate), new Chip(sampleRate)];
      this.player = new Player(this.chips);
      this.spf = sampleRate / 50;       // muestras por frame PAL
      this.cnt = 0; this.playing = false; this.pending = null;
      // Canal "digi": muestras de 4 bits escritas en el registro de volumen ($D418), como hacía SAM
      this.digi = null; this.dpos = 0; this.dstep = 0; this.dout = 0; this.duck = 1;
      this.port.onmessage = e => {
        const m = e.data;
        if (m.cmd === 'load') this.player.load(m.song);
        else if (m.cmd === 'seek') this.pending = m;
        else if (m.cmd === 'stop') { this.pending = null; this.playing = false; this.digi = null; this.player.reset(); }
        else if (m.cmd === 'digi') { this.digi = m.data; this.dpos = 0; this.dstep = m.rate / sampleRate; }
        else if (m.cmd === 'digiStop') this.digi = null;
      };
    }
    process(_, outputs) {
      const out = outputs[0], L = out[0], R = out[1] || out[0], n = L.length, t0 = currentTime;
      for (let i = 0; i < n; i++) {
        if (this.pending && t0 + i / sampleRate >= this.pending.at) {
          this.digi = null;
          this.player.seek(this.pending.frame);
          this.pending = null; this.playing = true; this.cnt = 0;
          this.player.tick();
        }
        if (this.playing && ++this.cnt >= this.spf) { this.cnt -= this.spf; this.player.tick(); }
        const a = this.chips[0].sample(), b = this.chips[1].sample();
        // Digi: retención de orden cero (el "escalón" de 4 bits) + el leve paso bajo de la salida analógica
        let d = 0;
        if (this.digi) {
          const k = this.dpos | 0;
          if (k >= this.digi.length) this.digi = null;
          else { d = this.digi[k]; this.dpos += this.dstep; }
        }
        this.dout += (d - this.dout) * 0.6;
        // Mientras suena la voz, la música baja (en el C64 real, el volumen general era ese mismo registro)
        this.duck += ((this.digi ? 0.25 : 1) - this.duck) * 0.0004;
        const v = this.dout * 0.8;
        // SID 1 algo a la izquierda, SID 2 algo a la derecha (estéreo "2SID"); la voz, al centro
        L[i] = Math.tanh((a * 0.66 + b * 0.34) * 1.2 * this.duck + v);
        R[i] = Math.tanh((a * 0.34 + b * 0.66) * 1.2 * this.duck + v);
      }
      return true;
    }
  }
  registerProcessor('sid-engine', SIDProcessor);
}

/* ---------------- Lado del hilo principal ---------------- */
class SIDAudio {
  constructor() { this.ctx = null; this.t0 = 0; this.playing = false; this.reverbOn = true; this.muted = false; }

  async init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'playback' });
    const url = URL.createObjectURL(new Blob([`(${sidWorkletMain.toString()})();`], { type: 'application/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    const ctx = this.ctx;
    this.node = new AudioWorkletNode(ctx, 'sid-engine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 2048;
    this.duckGain = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain(); this.wet.gain.value = 0.3;
    this.pre = ctx.createDelay(0.2); this.pre.delayTime.value = 0.035;
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 7000;
    this.conv = ctx.createConvolver(); this.conv.buffer = this.impulse(4.2);
    this.master = ctx.createGain(); this.master.gain.value = 0.85;
    this.node.connect(this.analyser);
    this.node.connect(this.duckGain);
    this.duckGain.connect(this.dry); this.dry.connect(this.master);
    this.duckGain.connect(this.pre); this.pre.connect(this.tone); this.tone.connect(this.conv);
    this.conv.connect(this.wet); this.wet.connect(this.master);
    this.master.connect(ctx.destination);
    if (ctx.state !== 'running') await ctx.resume();
  }

  // Reverb de sala enorme generada (ruido con caída exponencial, cada vez más oscuro)
  impulse(sec) {
    const sr = this.ctx.sampleRate, n = Math.floor(sr * sec), b = this.ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        lp += ((Math.random() * 2 - 1) - lp) * (0.6 - 0.5 * t);
        d[i] = lp * Math.exp(-6 * t) * Math.min(1, i / (sr * 0.012));
      }
    }
    return b;
  }

  load(song) { this.node.port.postMessage({ cmd: 'load', song: { sections: song.sections, ins: song.ins, loop: song.loop } }); }

  play(frame) {
    if (this.ctx.state !== 'running') this.ctx.resume();
    const at = this.ctx.currentTime + 0.08;
    this.node.port.postMessage({ cmd: 'seek', frame, at });
    this.t0 = at - frame / 50;
    this.playing = true;
  }

  stop() { this.node.port.postMessage({ cmd: 'stop' }); this.playing = false; }

  // Voz SAM: muestras de 4 bits reproducidas por el propio "SID" (registro de volumen)
  digi(data, rate) { this.node.port.postMessage({ cmd: 'digi', data, rate }); }
  digiStop() { this.node.port.postMessage({ cmd: 'digiStop' }); }

  // Frame musical (50 Hz) que se está oyendo ahora mismo
  frame() {
    if (!this.playing) return -1;
    const lat = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    return Math.floor((this.ctx.currentTime - lat - this.t0) * 50);
  }

  duck(on) {
    const g = this.duckGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setTargetAtTime(on ? 0.5 : 1, t, 0.15);
  }
  toggleReverb() {
    this.reverbOn = !this.reverbOn;
    this.wet.gain.setTargetAtTime(this.reverbOn ? 0.3 : 0, this.ctx.currentTime, 0.1);
    return this.reverbOn;
  }
  toggleMute() {
    this.muted = !this.muted;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.85, this.ctx.currentTime, 0.05);
    return this.muted;
  }
}
