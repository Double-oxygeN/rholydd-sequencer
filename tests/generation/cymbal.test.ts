import { describe, expect, it } from 'vitest';
import { heardDrums } from '../../src/generators/arrange.ts';
import { RIDE_STYLES, cymbalLine, type CrashPlace } from '../../src/generators/cymbal/index.ts';
import type { CymbalHit, NoteEvent } from '../../src/generators/types.ts';
import { GAP_START, dropLeadIn, hasGap } from '../../src/structure/arrangement.ts';
import { SECTIONS_PER_PHRASE } from '../../src/structure/form.ts';
import { PARAM_SETS, SEEDS, TUNING, run, type GeneratedPair } from '../support/helpers.ts';

const LONG_BARS = 2048;

const runs = SEEDS.flatMap((seed) => PARAM_SETS.map((params) => ({ params, pairs: run(seed, LONG_BARS, () => params) })));

const heardCymbals = (pair: GeneratedPair) =>
  pair.heard.filter((event: NoteEvent): event is CymbalHit => event.instrument === 'cymbal');

/** The places in the specs' table of crashes, written out again so that a mistake in the code shows. */
function expectedCrash({ ctx }: GeneratedPair): CrashPlace | null {
  const role = ctx.sceneRole;
  if (!ctx.isSectionStart) return null;
  if (role.scene === 'drop' && ctx.sectionRole.isPhraseStart) return role.phrase === 0 ? 'drop' : 'dropPhrase';
  if (role.scene === 'intro' && role.index === role.sections - 1) return 'intro';
  if (role.scene === 'build' && role.index === 0 && ctx.sectionInCycle >= SECTIONS_PER_PHRASE) return 'build';
  return null;
}

describe('cymbal: crashes', () => {
  it('lands a crash on the first step of each boundary in the table, at its velocity, and nowhere else', () => {
    const seen = new Set<CrashPlace>();
    for (const { pairs } of runs) {
      for (const pair of pairs) {
        const place = expectedCrash(pair);
        const crashes = heardCymbals(pair).filter((hit) => hit.part === 'crash');
        if (place === null) {
          expect(crashes).toEqual([]);
          continue;
        }
        seen.add(place);
        expect(crashes).toEqual([{ instrument: 'cymbal', step: 0, part: 'crash', velocity: TUNING.cymbal.crash[place] }]);
      }
    }
    expect([...seen].sort()).toEqual(['build', 'drop', 'dropPhrase', 'intro']);
  });

  it('crashes hardest where the drop lands', () => {
    const { crash } = TUNING.cymbal;
    for (const place of ['dropPhrase', 'intro', 'build'] as const) expect(crash.drop).toBeGreaterThan(crash[place]);
  });
});

describe('cymbal: ride', () => {
  it('rides in the second drop of every cycle only, every 32 bars of it when extended', () => {
    let secondDrops = 0;
    for (const { pairs } of runs) {
      for (const pair of pairs) {
        const role = pair.ctx.sceneRole;
        const rides = heardCymbals(pair).filter((hit) => hit.part === 'ride');
        const second = role.scene === 'drop' && role.drop === 'second';
        if (!second) expect(rides).toEqual([]);
        else if (pair.ctx.drums.fill?.from !== 0) {
          secondDrops++;
          expect(rides.length).toBeGreaterThan(0);
        }
      }
    }
    expect(secondDrops).toBeGreaterThan(1000);
  });

  it('keeps the ride off the fill and off the crash, in the style of the cycle', () => {
    for (const { pairs } of runs) {
      for (const pair of pairs) {
        const { hits, style } = pair.cymbal;
        const fillFrom = pair.ctx.drums.fill?.from ?? 32;
        const crashSteps: readonly number[] = hits.filter((hit) => hit.part === 'crash').map((hit) => hit.step);
        const rides = hits.filter((hit) => hit.part === 'ride');
        for (const ride of rides) {
          expect(ride.step).toBeLessThan(fillFrom);
          expect(crashSteps).not.toContain(ride.step);
        }
        const expectedSteps = Array.from({ length: 32 }, (_, step) => step).filter(
          (step) =>
            step < fillFrom &&
            !crashSteps.includes(step) &&
            (style === 'quarter' ? step % 4 === 0 : style === 'eighth' ? step % 2 === 0 : step % 4 === 2),
        );
        expect(rides.map((hit) => hit.step)).toEqual(expectedSteps);
        for (const ride of rides) {
          const soft = style === 'eighth' && ride.step % 4 !== 0;
          expect(ride.velocity).toBe(soft ? TUNING.cymbal.ride.soft : TUNING.cymbal.ride.accent);
        }
      }
    }
  });

  it('keeps one ride style through a cycle, and rides in every style over long runs', () => {
    const seen = new Set<string>();
    for (const { pairs } of runs) {
      let cycle = -1;
      let style: string | undefined;
      for (const pair of pairs) {
        if (pair.ctx.cycle !== cycle) {
          cycle = pair.ctx.cycle;
          style = pair.cymbal.style;
        }
        expect(pair.cymbal.style).toBe(style);
        seen.add(pair.cymbal.style);
      }
    }
    expect([...seen].sort()).toEqual([...RIDE_STYLES].sort());
  });
});

describe('cymbal: arrangement', () => {
  it('leaves no cymbal in the gap before a drop, whatever the lead-in', () => {
    for (const { pairs } of runs) {
      for (const pair of pairs) {
        const leadIn = dropLeadIn(pair.ctx);
        if (leadIn === null || !hasGap(leadIn)) continue;
        expect(heardCymbals(pair).filter((hit) => hit.step >= GAP_START)).toEqual([]);
      }
    }
  });

  it('never lets a cymbal into the drums that the ducking and the reverb throws read', () => {
    for (const { pairs } of runs) {
      for (const pair of pairs) expect(heardDrums(pair.heard).every((hit) => hit.instrument === 'drums')).toBe(true);
    }
  });

  it('generates the same cymbals for the same context, so that a resume can work them out again', () => {
    for (const pair of run(42, 512)) expect(cymbalLine(pair.ctx, TUNING.cymbal)).toEqual(pair.cymbal);
  });
});
