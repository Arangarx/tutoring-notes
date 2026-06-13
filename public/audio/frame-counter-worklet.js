/**
 * Frame-counting AudioWorklet processor for the tutoring-notes recording clock.
 *
 * Served as a same-origin static file under public/audio/ so it loads under
 * script-src 'self' with no blob: CSP allowance required.
 *
 * Must be plain browser JS — no TypeScript, no bundler imports — because
 * public/ is NOT processed by Next.js/webpack.
 *
 * Processor name: 'frame-counter-processor'
 * (fixed constant; each AudioContext has its own isolated worklet scope, so
 *  the same name is safe across concurrent graph instances.)
 *
 * Message protocol (port):
 *   IN  { type: 'setActive', active: boolean }
 *       Gate frame counting. Only frames counted while active contribute to the
 *       recording clock — matches the MediaRecorder's recording/paused state.
 *   OUT { frames: number }
 *       Emitted approximately every 1024 frames (not every block) to throttle
 *       message volume. The consumer accumulates the latest value.
 */
class FrameCounterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._active = false;
    this._frames = 0;
    this.port.onmessage = (e) => {
      if (e.data?.type === 'setActive') this._active = e.data.active;
    };
  }

  process(inputs, outputs) {
    const ch = inputs[0]?.[0];
    if (this._active && ch?.length) {
      this._frames += ch.length;
      if (this._frames % 1024 < ch.length) {
        this.port.postMessage({ frames: this._frames });
      }
    }
    const out = outputs[0]?.[0];
    if (out && ch) out.set(ch);
    return true;
  }
}

registerProcessor('frame-counter-processor', FrameCounterProcessor);
