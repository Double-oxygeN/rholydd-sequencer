import type { ChannelId, Decibels, Milliseconds, Pan } from '../params/mixer.ts';
import type { ResetScope } from '../params/reset.ts';
import type { Seed } from '../random/rng.ts';
import type { LiveParams } from '../structure/conductor.ts';
import type { UnitInterval } from '../units.ts';
import type { MenuTab } from './menu.ts';
import type { MixerMode } from './mixer.ts';
import type { View } from './views.ts';

/** The words either side of a counter's number, which stands out on its own. */
export interface CounterText {
  readonly before: string;
  readonly after: string;
}

/**
 * Every word the screen shows or gives screen readers. Words around a number or a name are functions, since languages
 * put them in different orders, and names kept per ID are records, so that a language missing one does not compile.
 */
export interface Messages {
  readonly play: string;
  readonly pause: string;
  readonly resume: string;
  readonly stop: string;
  readonly volume: string;

  readonly share: string;
  readonly openMenu: string;
  readonly closeMenu: string;
  readonly menu: string;
  readonly menuTabs: string;
  readonly menuTab: Readonly<Record<MenuTab, string>>;

  readonly views: string;
  readonly view: Readonly<Record<View, string>>;
  readonly sequencer: string;
  readonly spectrumAnalyser: string;

  readonly cyclePosition: string;
  readonly sectionPosition: string;
  readonly barCount: (bar: number) => CounterText;
  readonly cycleCount: (cycle: number) => CounterText;

  readonly initialKey: string;
  /** A natural minor key named after its tonic, such as C♯. */
  readonly minorKey: (tonic: string) => string;
  readonly liveParam: Readonly<Record<keyof LiveParams, string>>;
  readonly seed: string;
  readonly rollSeed: string;
  readonly invalidSeed: string;

  /** The buttons putting back the parameters' and the mixer's values, and the word once they have. */
  readonly reset: Readonly<Record<ResetScope, string>>;
  readonly resetDone: string;

  readonly mixerModes: string;
  readonly mixerMode: Readonly<Record<MixerMode, string>>;
  readonly channel: Readonly<Record<ChannelId, string>>;
  readonly mute: string;
  readonly solo: string;
  /** Names a channel's slider or button, so that screen readers hear which channel it belongs to. */
  readonly channelControl: (channel: string, control: string) => string;
  readonly duckingDepth: string;
  readonly duckingRelease: string;
  readonly masterPeak: string;
  /** The highest peak since playback started, −Infinity before any sound. */
  readonly heldPeak: (dbfs: number) => string;
  readonly clipCount: (clips: number) => string;

  readonly percent: (value: UnitInterval) => string;
  readonly decibels: (level: Decibels) => string;
  readonly pan: (pan: Pan) => string;
  readonly milliseconds: (time: Milliseconds) => string;

  readonly loadingSamples: string;
  readonly configIgnored: string;
  readonly bootFailed: (error: string) => string;

  readonly close: string;
  readonly shareUrl: string;
  readonly copy: string;
  readonly copied: string;
  readonly copyBySelecting: string;
  readonly includeSeed: string;

  /** What the OS media controls show under the title. */
  readonly mediaArtist: (seed: Seed) => string;
}

const percent = (value: UnitInterval) => `${Math.round(value * 100)}%`;
const decibels = (level: Decibels) => `${level > 0 ? '+' : ''}${level} dB`;
const dbfs = (db: number) => (Number.isFinite(db) ? `${db.toFixed(1).replace('-', '−')} dBFS` : '−∞ dBFS');

function pan(pan: Pan): string {
  const amount = Math.round(Math.abs(pan) * 100);
  return amount === 0 ? 'C' : `${pan < 0 ? 'L' : 'R'}${amount}`;
}

export const JA: Messages = {
  play: '再生',
  pause: '一時停止',
  resume: '再開',
  stop: '停止',
  volume: '音量',

  share: '共有',
  openMenu: 'メニューを開く',
  closeMenu: 'メニューを閉じる',
  menu: 'メニュー',
  menuTabs: 'メニューの表示',
  menuTab: { parameters: 'パラメーター', mixer: 'ミキサー' },

  views: '表示',
  view: { sequencer: 'シーケンサー', spectrum: 'スペクトラム' },
  sequencer: 'シーケンサー',
  spectrumAnalyser: 'スペクトラムアナライザー',

  cyclePosition: 'サイクルの位置',
  sectionPosition: '8小節の位置',
  barCount: () => ({ before: '', after: '小節' }),
  cycleCount: () => ({ before: '', after: 'サイクル' }),

  initialKey: '初期キー',
  minorKey: (tonic) => `${tonic} マイナー`,
  liveParam: {
    m2: '2bar 変化率',
    m8: '8bar 変化率',
    m32: '32bar 変化率',
    fillIntensity: 'フィル強度',
    energyDepth: 'エネルギーの起伏',
  },
  seed: 'シード',
  rollSeed: 'シードを振り直す',
  invalidSeed: '0〜4294967295 の整数を入力してください',

  reset: { live: 'パラメーターを既定値に戻す', mix: 'ミキサーを既定値に戻す' },
  resetDone: '既定値に戻しました',

  mixerModes: 'ミキサーの調整の対象',
  mixerMode: { level: '音量', pan: 'パン', send: 'センド' },
  channel: {
    kick: 'キック',
    snare: 'スネア',
    hat: 'ハイハット',
    ghost: 'ゴースト',
    cymbal: 'シンバル',
    sub: 'サブベース',
    reese: 'リースベース',
    stab: 'スタブ',
    pad: 'パッド',
    fx: 'FX',
    reverbReturn: 'リバーブ',
  },
  mute: 'ミュート',
  solo: 'ソロ',
  channelControl: (channel, control) => `${channel} ${control}`,
  duckingDepth: 'ダッキング量',
  duckingRelease: 'ダッキングの戻り時間',
  masterPeak: 'マスターのピーク',
  heldPeak: (db) => `最大 ${dbfs(db)}`,
  clipCount: (clips) => `クリップ ${clips} サンプル`,

  percent,
  decibels,
  pan,
  milliseconds: (time) => `${time} ms`,

  loadingSamples: 'サンプルを読み込み中…',
  configIgnored: '設定ファイルの一部の値を無視しました（詳細はコンソール）',
  bootFailed: (error) => `起動に失敗しました: ${error}`,

  close: '閉じる',
  shareUrl: '共有する URL',
  copy: 'コピー',
  copied: 'コピーしました',
  copyBySelecting: '選択した URL をコピーしてください',
  includeSeed: 'シードを含める',

  mediaArtist: (seed) => `シード ${seed}`,
};

export const EN: Messages = {
  play: 'Play',
  pause: 'Pause',
  resume: 'Resume',
  stop: 'Stop',
  volume: 'Volume',

  share: 'Share',
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
  menu: 'Menu',
  menuTabs: 'Menu sections',
  menuTab: { parameters: 'Parameters', mixer: 'Mixer' },

  views: 'View',
  view: { sequencer: 'Sequencer', spectrum: 'Spectrum' },
  sequencer: 'Sequencer',
  spectrumAnalyser: 'Spectrum analyser',

  cyclePosition: 'Position in the cycle',
  sectionPosition: 'Position in 8 bars',
  barCount: () => ({ before: 'Bar ', after: '' }),
  cycleCount: () => ({ before: 'Cycle ', after: '' }),

  initialKey: 'Starting key',
  minorKey: (tonic) => `${tonic} minor`,
  liveParam: {
    m2: '2-bar variation',
    m8: '8-bar variation',
    m32: '32-bar variation',
    fillIntensity: 'Fill intensity',
    energyDepth: 'Energy contour',
  },
  seed: 'Seed',
  rollSeed: 'Roll a new seed',
  invalidSeed: 'Enter a whole number from 0 to 4294967295',

  reset: { live: 'Reset parameters', mix: 'Reset mixer' },
  resetDone: 'Back to the defaults',

  mixerModes: 'What the sliders adjust',
  mixerMode: { level: 'Level', pan: 'Pan', send: 'Send' },
  channel: {
    kick: 'Kick',
    snare: 'Snare',
    hat: 'Hat',
    ghost: 'Ghost',
    cymbal: 'Cymbal',
    sub: 'Sub bass',
    reese: 'Reese bass',
    stab: 'Stab',
    pad: 'Pad',
    fx: 'FX',
    reverbReturn: 'Reverb',
  },
  mute: 'Mute',
  solo: 'Solo',
  channelControl: (channel, control) => `${channel} ${control.toLowerCase()}`,
  duckingDepth: 'Ducking depth',
  duckingRelease: 'Ducking release',
  masterPeak: 'Master peak',
  heldPeak: (db) => `Max ${dbfs(db)}`,
  clipCount: (clips) => `${clips} ${clips === 1 ? 'sample' : 'samples'} clipped`,

  percent,
  decibels,
  pan,
  milliseconds: (time) => `${time} ms`,

  loadingSamples: 'Loading samples…',
  configIgnored: 'Some values in the config file were ignored (see the console)',
  bootFailed: (error) => `Failed to start: ${error}`,

  close: 'Close',
  shareUrl: 'URL to share',
  copy: 'Copy',
  copied: 'Copied',
  copyBySelecting: 'Copy the selected URL',
  includeSeed: 'Include the seed',

  mediaArtist: (seed) => `Seed ${seed}`,
};

export const LANGUAGES = ['ja', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const MESSAGES: Readonly<Record<Language, Messages>> = { ja: JA, en: EN };

/**
 * The first of the browser's languages the page speaks, decided once as it opens. English stands in for any other,
 * since more of those who cannot read Japanese read English than any other language.
 */
export function pickLanguage(languages: readonly string[]): Language {
  for (const tag of languages) {
    const primary = tag.split('-')[0]!.toLowerCase();
    const language = LANGUAGES.find((known) => known === primary);
    if (language !== undefined) return language;
  }
  return 'en';
}
