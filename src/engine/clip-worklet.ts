import { CLIP_METER_NAME, createTally, scanBlock, type LevelReport } from './clip.ts';

// The AudioWorklet global scope is not part of TypeScript's DOM library.
interface ProcessorBase {
  readonly port: MessagePort;
}
declare const AudioWorkletProcessor: { new (): ProcessorBase };
declare function registerProcessor(name: string, processor: new () => ProcessorBase): void;
declare const sampleRate: number;

// Often enough for a meter to look live, rarely enough to keep the message traffic negligible.
const REPORT_SECONDS = 0.1;

/** Passes audio through untouched while counting peaks and clipped samples on the way. */
class ClipMeter extends AudioWorkletProcessor {
  private tally = createTally();
  private frames = 0;

  process(inputs: readonly (readonly Float32Array[])[], outputs: readonly (readonly Float32Array[])[]): boolean {
    const input = inputs[0] ?? [];
    const output = outputs[0] ?? [];
    for (let channel = 0; channel < output.length; channel++) {
      const samples = input[channel] ?? input[0];
      if (samples === undefined) continue;
      output[channel]!.set(samples);
      scanBlock(samples, this.tally);
    }
    this.frames += output[0]?.length ?? 0;
    if (this.frames >= sampleRate * REPORT_SECONDS) {
      const report: LevelReport = { peak: this.tally.peak, clips: this.tally.clips };
      this.port.postMessage(report);
      this.tally.peak = 0;
      this.tally.clips = 0;
      this.frames = 0;
    }
    // Keeps the processor alive even through silent stretches with no input.
    return true;
  }
}

registerProcessor(CLIP_METER_NAME, ClipMeter);
