// Tiny WebAudio synth so we ship no audio assets.
let ctx: AudioContext | null = null
let muted = (() => { try { return localStorage.getItem('mwc_muted') === '1' } catch { return false } })()
export const isMuted = () => muted
export function setMuted(m: boolean) { muted = m; try { localStorage.setItem('mwc_muted', m ? '1' : '0') } catch { /* ignore */ } }

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.08, delay = 0, slide = 0) {
  if (muted) return
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
    const t = ctx.currentTime + delay
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = type; o.frequency.setValueAtTime(freq, t)
    if (slide) o.frequency.exponentialRampToValueAtTime(freq + slide, t + dur)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02)
  } catch { /* audio unavailable */ }
}
export const sfx = {
  deal: () => tone(520, .06, 'triangle', .05, 0, 120),
  select: () => tone(780, .09, 'sine', .06),
  move: () => { tone(180, .09, 'triangle', .12, 0, -60); tone(320, .05, 'square', .02) },
  capture: () => { tone(130, .16, 'sawtooth', .09, 0, -70); tone(260, .08, 'square', .04) },
  check: () => { tone(660, .12, 'square', .05); tone(880, .16, 'square', .05, .1) },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, .25, 'triangle', .08, i * .12)),
  lose: () => [330, 262, 196].forEach((f, i) => tone(f, .3, 'triangle', .07, i * .15)),
}
