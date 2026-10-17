import type { Scene, SceneRole } from './arrangement.ts';

export type Voice = 'kick' | 'snare' | 'hat' | 'ghost' | 'sub' | 'reese' | 'stab' | 'pad';

const PLAYS: Readonly<Record<Scene, ReadonlySet<Voice>>> = {
  intro: new Set(['kick', 'snare', 'hat', 'ghost', 'sub', 'pad']),
  // The basses leave so that the drop's first sub lands on empty low end.
  build: new Set(['kick', 'snare', 'hat', 'ghost', 'stab', 'pad']),
  drop: new Set(['kick', 'snare', 'hat', 'ghost', 'sub', 'reese', 'stab', 'pad']),
  breakdown: new Set(['hat', 'stab', 'pad']),
};

/**
 * The first 8 bars of every intro, after a drop as much as at the start of playback, so that each cycle starts
 * over like a new track. Thinning by energy barely changed the hit count, so parts and positions are left out.
 */
function opensIntro(role: SceneRole): boolean {
  return role.scene === 'intro' && role.index === 0;
}

const LEFT_OUT_OF_INTRO_OPENING: ReadonlySet<Voice> = new Set(['ghost', 'sub']);

/** Whether a part sounds in the scene. Every part is still generated; this only decides what is heard. */
export function plays(role: SceneRole, voice: Voice): boolean {
  if (opensIntro(role) && LEFT_OUT_OF_INTRO_OPENING.has(voice)) return false;
  return PLAYS[role.scene].has(voice);
}

/** Whether a drum hit sounds: the opening of the intro also keeps the hat to the 8ths. */
export function playsHit(role: SceneRole, hit: { readonly part: Voice; readonly step: number }): boolean {
  if (opensIntro(role) && hit.part === 'hat' && hit.step % 2 === 1) return false;
  return plays(role, hit.part);
}
