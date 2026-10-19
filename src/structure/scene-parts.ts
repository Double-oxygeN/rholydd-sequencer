import { changesScene, type IntroOrder, type LeadSections, type Scene, type SceneRole, type ScenePlace } from './arrangement.ts';

export type Voice = 'kick' | 'snare' | 'hat' | 'ghost' | 'crash' | 'ride' | 'sub' | 'reese' | 'stab' | 'pad';

// The ride is left to the drop's role, as only the second drop of a cycle plays it.
const PLAYS: Readonly<Record<Scene, ReadonlySet<Voice>>> = {
  intro: new Set(['kick', 'snare', 'hat', 'ghost', 'crash', 'sub', 'pad']),
  // The basses leave so that the drop's first sub lands on empty low end.
  build: new Set(['kick', 'snare', 'hat', 'ghost', 'crash', 'stab', 'pad']),
  drop: new Set(['kick', 'snare', 'hat', 'ghost', 'crash', 'sub', 'reese', 'stab', 'pad']),
  breakdown: new Set(['hat', 'stab', 'pad']),
};

/** The hats on the 8ths alone, or every hat the pattern has. */
export type HatDensity = 'eighths' | 'all';

export type IntroDrum = 'kick' | 'snare' | 'ghost' | { readonly hat: HatDensity };

/**
 * What one 8 bars of an intro before its last plays. The pad is left out as it always plays, closing the low-pass
 * over the change of key and sounds whatever the order; the drums can never all be left out.
 */
export interface IntroLineup {
  readonly drums: readonly [IntroDrum, ...IntroDrum[]];
  readonly sub: boolean;
}

/** One lineup per 8 bars before the last, so that no position can lie past the table. */
export type IntroOpenings = { readonly [S in LeadSections]: S extends 2 ? readonly [IntroLineup] : readonly [IntroLineup, IntroLineup] };

const ALL_HATS = { hat: 'all' } as const;
const EIGHTHS = { hat: 'eighths' } as const;

/** Every part the intro plays, as its last 8 bars always do. */
export const FULL_INTRO: IntroLineup = { drums: ['kick', 'snare', ALL_HATS, 'ghost'], sub: true };

/**
 * Ghosts never come in before the snare, nor the sub before the kick: an ornament with no snare to ornament, or a
 * sub with no kick it follows, would sound like stray notes. Each order differs in its first 8 bars, the only ones a
 * 16-bar intro has, so that a change of order is always heard.
 */
export const INTRO_OPENINGS: Readonly<Record<IntroOrder, IntroOpenings>> = {
  // Thinning by energy barely changed the hit count, so parts and positions are left out.
  beat: {
    2: [{ drums: ['kick', 'snare', EIGHTHS], sub: false }],
    3: [{ drums: ['kick', 'snare', EIGHTHS], sub: false }, FULL_INTRO],
  },
  // On the 8ths alone, 8 hits a bar would leave the beat too thin to hold on to.
  hats: {
    2: [{ drums: [ALL_HATS], sub: false }],
    3: [{ drums: [ALL_HATS], sub: false }, { drums: ['kick', 'snare', ALL_HATS, 'ghost'], sub: false }],
  },
  kick: {
    2: [{ drums: ['kick', EIGHTHS], sub: false }],
    3: [{ drums: ['kick', EIGHTHS], sub: false }, { drums: ['kick', 'snare', ALL_HATS], sub: false }],
  },
};

type IntroRole = Extract<SceneRole, { scene: 'intro' }>;

/** What the 8 bars of an intro play, from its order and position alone, so that a resume can work it out again. */
export function introLineup(role: IntroRole): IntroLineup {
  const openings: readonly IntroLineup[] = INTRO_OPENINGS[role.introOrder][role.sections];
  return openings[role.index] ?? FULL_INTRO;
}

function hatDensity(lineup: IntroLineup): HatDensity | null {
  for (const drum of lineup.drums) if (typeof drum === 'object') return drum.hat;
  return null;
}

function lineupPlays(lineup: IntroLineup, voice: Voice): boolean {
  switch (voice) {
    case 'pad':
    // Only ever placed in the last 8 bars, where everything plays.
    case 'crash':
      return true;
    case 'sub':
      return lineup.sub;
    case 'hat':
      return hatDensity(lineup) !== null;
    case 'kick':
    case 'snare':
    case 'ghost':
      return lineup.drums.includes(voice);
    case 'ride':
    case 'reese':
    case 'stab':
      return false;
  }
}

/** Whether a part sounds in the scene. Every part is still generated; this only decides what is heard. */
export function plays(role: SceneRole, voice: Voice): boolean {
  // Sets the second drop apart from the first, whose theme it brings back with a new groove.
  if (voice === 'ride') return role.scene === 'drop' && role.drop === 'second';
  if (role.scene === 'intro' && !lineupPlays(introLineup(role), voice)) return false;
  return PLAYS[role.scene].has(voice);
}

/** Whether a drum hit sounds: an intro may also keep the hat to the 8ths. */
export function playsHit(role: SceneRole, hit: { readonly part: Voice; readonly step: number }): boolean {
  if (role.scene === 'intro' && hit.part === 'hat' && hit.step % 2 === 1 && hatDensity(introLineup(role)) === 'eighths') {
    return false;
  }
  return plays(role, hit.part);
}

/**
 * Whether the fill ending the 8 bars brings the snare in early, announcing the drums of the next 8 bars: at the end
 * of a breakdown, and before the 8 bars of an intro where the snare comes in. The roll already means the drums are
 * coming back at the end of a breakdown.
 */
export function announcesSnare(place: ScenePlace): boolean {
  const role = place.sceneRole;
  if (role.scene === 'breakdown') return changesScene(place);
  if (role.scene !== 'intro' || !place.isSectionEnd || role.index === role.sections - 1) return false;
  const next = { ...role, index: role.index + 1 } as IntroRole;
  return !plays(role, 'snare') && plays(next, 'snare');
}
