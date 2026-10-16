# フェーズ4設計書

[フェーズ4要件定義書](./requirements.md) を実装するための設計です。[MVP設計書](../mvp/design.md) から [フェーズ3設計書](../phase3/design.md) までの方針はそのまま引き継ぎ、変わる部分だけを書きます。引き継ぐ方針は、brand 型、判別共用体、乱数の引き方、ラッチ、アンサンブル、Tone.js に依存しない点列の計算です。

## モジュール構成と依存方向

```
ui ──▶ engine ──▶ generators/ensemble ──▶ structure ──▶ random
 │        │
 │        ├──▶ engine/playhead, engine/resume   （一時停止の位置と再開の切り出し。Tone.js に依存しない）
 │        └──▶ engine/automation                （再開位置の値を加える）
 └──▶ params ──▶ params/mixer                   （ソロと、鳴らすチャンネルの判定）
tools/simulate ──▶ generators/ensemble
```

| モジュール | 責務 | Tone.js 依存 |
| --- | --- | --- |
| `src/structure/harmony.ts` | コードの表（ダイアトニックと借用和音）、テンションの表、色付けした進行の型と、色付けの抽選。主進行の表を8つにする | なし |
| `src/structure/conductor.ts` | 主進行の色付けをサイクルの頭で、転換進行の色付けを32bar の頭で決める | なし |
| `src/generators/line.ts` | コードトーンを音階上の距離ではなく、構成音の番号で選ぶ | なし |
| `src/generators/sub`, `reese` | 音高を構成音の番号から求める | なし |
| `src/generators/stab`, `pad` | テンションのあるコードのボイシング | なし |
| `src/engine/playhead.ts` | 予約済みの2bar の列と、一時停止した時刻から、再開する2bar とステップを求める | なし |
| `src/engine/resume.ts` | 2bar のイベントから、再開位置以降に鳴らすものを切り出す | なし |
| `src/engine/automation.ts` | 再開位置での各パラメーターの値と、再開位置以降の点列 | なし |
| `src/engine/transport.ts` | 再生・一時停止・再開・停止。開始は「ステップ0からの再開」として同じ経路で扱う | あり |
| `src/engine/audio.ts` | 一時停止、再開位置の値からの開始、ソロ、リバーブスローの消音、スペクトラムアナライザーの取り出し | あり |
| `src/params/mixer.ts` | ソロの欄と、鳴らすチャンネルの判定 `audibleChannels` | なし |
| `src/params/query.ts` | クエリ文字列から初期シードを読む。共有する URL を作る | なし |
| `src/structure/tuning.ts` | 生成の調整用の数値の型と既定値（`GenerationTuning`） | なし |
| `src/engine/tuning.ts` | 音の調整用の数値の型と既定値（`SoundTuning`） | なし |
| `src/params/config.ts` | 設定ファイルの型、既定値、JSON の検証と既定値との合成 | なし |
| `src/params/load-config.ts` | ブラウザで `config.json` を取りに行く | なし（`fetch` だけ） |
| `src/ui/controls.ts` | 再生・一時停止・再開のボタン、停止のボタン、音量 | なし |
| `src/ui/playback.ts` | 再生の状態と操作（ボタンかメディア操作か）から、実行する命令を決める | なし |
| `src/ui/media-session.ts` | Media Session API への状態の受け渡しと、無音の `audio` 要素 | なし |
| `src/ui/share.ts` | 共有のボタンとダイアログ | なし |
| `src/ui/icons.ts` | Lucide（`lucide` 1.49.0 に固定）のアイコンと、アイコンだけのボタン | なし |
| `src/ui/menu.ts` | 右上のボタンで開閉するオフキャンバスのメニューと、パラメーター・ミキサーのタブ | なし |
| `src/ui/position.ts` | 累計の数値と2行のメーター | なし |
| `src/ui/grid.ts` | スネアとゴーストを1つのレーンにまとめる。狭い画面で今の1小節だけを表示する | なし |
| `src/ui/spectrum.ts` | セグメントメーター型のスペクトラムアナライザーの描画 | なし |
| `src/ui/views.ts` | シーケンサーとスペクトラムアナライザーの切り替え | なし |
| `src/ui/panel.ts`、`src/ui/mixer.ts` | 折りたたみのメニューにする。ミキサーにソロ | なし |

`ui` は Tone.js を直接読まず、エンジンが渡す値（スペクトラムの配列など）だけを描画します。一時停止の位置と再開の切り出しを Tone.js から切り離すのは、ダッキングやオートメーションと同じく、Node.js 上の単体テストで検証するためです。

## 型

| 型 | 中身 | 不変条件 |
| --- | --- | --- |
| `DiatonicSymbol` | `'i' \| 'III' \| 'iv' \| 'v' \| 'VI' \| 'VII'` | 進行の表の骨組みに使うコード |
| `BorrowedSymbol` | `'IV7' \| 'bIImaj7' \| 'V7'` | 借用和音 |
| `ChordSymbol` | `DiatonicSymbol \| BorrowedSymbol` | |
| `Tension` | `'ninth' \| 'flatNinth' \| 'eleventh' \| 'sharpEleventh' \| 'thirteenth'` | |
| `TensionOf<S>` | コードの表から引いたテンションの共用体 | 表にない組（アボイドノート）を表現できない |
| `ColoredChord` | `{ symbol, tension }` の判別共用体 | `tension` は `TensionOf<symbol> \| null` |
| `ChordTone` | `'root' \| 'third' \| 'fifth' \| 'seventh'` | ベースが選ぶ構成音 |
| `MainProgression`・`TransitionProgression` | 骨組みと色付けしたコードの組（下記） | 色付けしたコードは、骨組みの同じ位置のコードか、その借用和音 |
| `PlaybackSession` | 再生中と一時停止中の判別共用体（下記） | 停止中のセッションは存在しない |
| `ResumePoint` | `{ pending, step }` | `pending` が空なら `step` は 0。`step` は 0〜31 |
| `SoloableId` | `Exclude<ChannelId, 'reverbReturn'>` | リバーブのリターンにソロを持たせない |

## 和声（`structure/harmony.ts`）

### コードの表

フェーズ3の `Chord { root: ChordRoot }`（ナチュラルマイナーの音度）では、音階の外の音を持つ借用和音を表せません。そこで、コードをルートの半音の位置と種類で表す表に改めます。

```ts
type Quality = 'minor7' | 'major7' | 'dominant7';

const QUALITY_INTERVALS: Readonly<Record<Quality, readonly [0, number, 7, number]>> = {
  minor7: [0, 3, 7, 10],
  major7: [0, 4, 7, 11],
  dominant7: [0, 4, 7, 10],
};

const TENSION_INTERVAL: Readonly<Record<Tension, number>> = {
  flatNinth: 1, ninth: 2, eleventh: 5, sharpEleventh: 6, thirteenth: 9,
};

const CHORDS = {
  i:       { root: 0,  quality: 'minor7',    tensions: ['ninth', 'eleventh'] },
  III:     { root: 3,  quality: 'major7',    tensions: ['ninth'] },
  iv:      { root: 5,  quality: 'minor7',    tensions: ['ninth', 'eleventh'] },
  v:       { root: 7,  quality: 'minor7',    tensions: ['eleventh'] },
  VI:      { root: 8,  quality: 'major7',    tensions: ['ninth', 'sharpEleventh'] },
  VII:     { root: 10, quality: 'dominant7', tensions: ['ninth', 'thirteenth'] },
  IV7:     { root: 5,  quality: 'dominant7', tensions: ['ninth'] },
  bIImaj7: { root: 1,  quality: 'major7',    tensions: ['ninth'] },
  V7:      { root: 7,  quality: 'dominant7', tensions: ['flatNinth'] },
} as const satisfies Readonly<Record<ChordSymbol, ChordSpec>>;

type TensionOf<S extends ChordSymbol> = (typeof CHORDS)[S]['tensions'][number];
type Colored<S extends ChordSymbol> = { readonly symbol: S; readonly tension: TensionOf<S> | null };
type ColoredChord = { [S in ChordSymbol]: Colored<S> }[ChordSymbol];
```

`as const satisfies` にするのは、表のテンションをそのまま型に引くためです。表と型を二重に持たないので、表にテンションを足せば型も広がり、表から消せば、そのテンションを作るコードは型エラーになります。

構成音の音高は、次の関数だけで求めます。生成器は `ScaleDegree` を経由せず、コードから直接ピッチクラスを得ます。

```ts
function chordToneClass(key: Key, chord: ColoredChord, tone: ChordTone): PitchClass;
function tensionClass(key: Key, chord: ColoredChord): PitchClass | null;
```

`rootDegree`・`chordDegrees`・`isChordTone`（音度で判定するもの）はなくします。シミュレーションとテストは、ピッチクラスがコードの構成音かテンションかで判定します。

### 進行の型

進行は、表から選ぶ骨組みと、色付けしたコードの組で持ちます。骨組みを残すのは、次の2つのためです。

- サイクルの頭で主進行を替えるとき、「今と異なる主進行」を骨組みで比べる
- シミュレーションで、骨組みごとの出現数をフェーズ3と同じ形で数える

```ts
// 借用できる位置と借用和音
const BORROWINGS = { iv: ['IV7', 'bIImaj7'], v: ['V7'] } as const;
type SubstituteOf<D extends DiatonicSymbol> =
  | D
  | (D extends keyof typeof BORROWINGS ? (typeof BORROWINGS)[D][number] : never);
type ColoredAt<D extends DiatonicSymbol> = { [S in SubstituteOf<D>]: Colored<S> }[SubstituteOf<D>];

type MainSkeleton = readonly ['i', DiatonicSymbol, DiatonicSymbol, DiatonicSymbol];
type TransitionSkeleton = readonly [OffTonic, DiatonicSymbol, DiatonicSymbol, OffTonic];
type OffTonic = Exclude<DiatonicSymbol, 'i'>;

interface MainProgression {
  readonly skeleton: MainSkeleton;
  readonly chords: readonly [Colored<'i'>, ColoredChord, ColoredChord, ColoredChord];
}
interface TransitionProgression {
  readonly skeleton: TransitionSkeleton;
  readonly chords: readonly [ColoredAt<OffTonic>, ColoredChord, ColoredChord, ColoredAt<OffTonic>];
}
```

主進行の先頭は `Colored<'i'>` で、借用和音にもならないことを型で表します。転換進行の両端は i 以外のコードとその借用和音に限るので、色付けしても「i で始めず i で終えない」（F-33）が崩れません。

`chordOf(ctx)` は `ctx.progression.chords[ctx.pairIn8]` を返します。`Context` のほかの欄は変えません。

### 進行の表

```ts
const MAIN_SKELETONS: readonly MainSkeleton[] = [
  ['i', 'VI', 'III', 'VII'],
  ['i', 'VII', 'VI', 'VII'],
  ['i', 'iv', 'VI', 'VII'],
  ['i', 'VI', 'iv', 'v'],
  ['i', 'i', 'VI', 'VII'],
  ['i', 'III', 'VII', 'VI'],
  ['i', 'iv', 'VII', 'III'],   // フェーズ4で追加
  ['i', 'VI', 'VII', 'v'],     // フェーズ4で追加
];
```

転換進行の表（5つ）は変えません。`pick` は乱数に表の長さを掛けて選ぶので、表が8つになると、同じ乱数で選ばれる主進行はフェーズ3と変わります。

### 色付けの抽選

```ts
// 確率は GenerationTuning の harmony から受け取る。既定値は tensionChance 0.4、borrowChance 0.2（設定ファイルで上書きできる）
function colorMain(skeleton: MainSkeleton, seed: Seed, harmony: HarmonyTuning): MainProgression;
function colorTransition(skeleton: TransitionSkeleton, seed: Seed, harmony: HarmonyTuning): TransitionProgression;
```

以下、要件の `TENSION_CHANCE` は `harmony.tensionChance`、`BORROW_CHANCE` は `harmony.borrowChance` のことです。

どちらも `createRng(hash(seed, TAG.harmonyColor))`（`TAG.harmonyColor = 24`）から、4つのコードの順に、コードごとに4つの float を引きます。

| 乱数 | 使い方 |
| --- | --- |
| 1つ目 | 借用の判定。骨組みのコードが `BORROWINGS` にあり、`BORROW_CHANCE` 未満なら置き換える |
| 2つ目 | 借用和音。`floor(x × 候補の数)` 番目を選ぶ |
| 3つ目 | テンションの判定。`TENSION_CHANCE` 未満ならテンションを加える |
| 4つ目 | テンション。置き換えた後のコードの表から `floor(x × 候補の数)` 番目を選ぶ |

判定が外れても、候補がなくても、4つとも引きます。主進行の先頭（i）の借用の判定も引いて捨てます。

**値の根拠**: 初めは `BORROW_CHANCE = 0.4`、`TENSION_CHANCE = 0.5` としましたが、設定ファイルで値を変えながら試聴し、`BORROW_CHANCE = 0.2`、`TENSION_CHANCE = 0.4` に確定しました。`BORROW_CHANCE = 0.2` では、iv か v を含む主進行（8つのうち4つ）のサイクルの約4分の1で、少なくとも1つの借用和音が鳴ります。転換進行は32bar ごとに選び直すので、借用和音は B でより多く鳴ります。音階の外に出る借用和音は、多すぎると調性の土台が揺らぐので、主題（A 系）ではまれな「顔」に留め、B で色合いの変化を担わせる配分です。`TENSION_CHANCE = 0.4` は、テンションのないコードをやや多くして地とし、テンションのあるコードを色として浮かせる値です。

### コンダクター

`cycleMainProgression(previous, cycleSeed, m32)` は、フェーズ3と同じ乱数（`TAG.progression` の2つ）で骨組みを選びます。次のように進みます。

1. 最初のサイクルでは、骨組みを表全体から選ぶ
2. 2つ目以降では、変化の判定が `m32` 未満なら `previous.skeleton` と異なる骨組みを選び、外れたら `previous` をそのまま返す（色付けも引き継ぐ）
3. 新しい骨組みを選んだときだけ、`colorMain(skeleton, cycleSeed)` で色付けする

`phraseTransitionProgression(phraseSeed)` は、フェーズ3と同じ乱数で骨組みを選び、`colorTransition(skeleton, phraseSeed)` で色付けします。

色付けのシードはサイクルと32bar のシードから派生させ、初期キーを混ぜません。そのため、初期キーを変えても色付けは変わりません（F-30 の維持）。

## 音程のあるパート

### ベース（`generators/line.ts`、`sub`、`reese`）

`ChordToneWeights` の4つの重みを、音階上の距離（0, 2, 4, 6）から構成音の番号（`root`, `third`, `fifth`, `seventh`）の順に読み替えます。重みの値は変えません。

```ts
function chordTone(ctx: ContextWithDrums, roll: number, weights: ChordToneWeights): ChordTone;
function chordRoot(): ChordTone;   // 'root'
```

音高は `foldPitch(LOWEST, chordToneClass(ctx.key, chordOf(ctx), tone))` で求めます。`subPitch` は `ScaleDegree` ではなく `PitchClass` を受け取ります。ダイアトニックのコードでは、構成音の番号と音階上の距離が一対一に対応します。そのため、同じ乱数なら、フェーズ3と同じコードの上では同じ音が選ばれます。

### スタブ（`generators/stab`）

| テンション | 並び | 置き方 |
| --- | --- | --- |
| なし | 3度・5度・7度 | それぞれを C4〜B4 に折り返して並べ替える（フェーズ3のまま） |
| 9度・♭9度・11度・♯11度 | 3度・7度・テンション | 3度を C4〜B4 に折り返し、続く音をそれぞれ直前の音より上で最も近い位置に積む |
| 13度 | 7度・3度・13度 | 同上（7度を C4〜B4 に折り返して積む） |

13度だけ並びを変えるのは、3度・7度・13度の順に積むと、7度と13度が長7度離れて全体が2オクターブ近くに広がるためです。7度・3度・13度なら1オクターブに収まります。

この並びでは、隣り合う音の間隔は最小でも短3度です。そのため、短2度は生じません。スタブの音域の定数を「最低音が C4〜B4、全体の幅が14半音以内」に改めます。最高音は B4 から14半音上の C♯6 で、スタブのローパス（3 kHz）の範囲に収まります。

### パッド（`generators/pad`）

構成音のピッチクラスを、テンションがなければ ルート・3度・5度・7度、あれば ルート・3度・7度・テンション にして、フェーズ3の `closeVoicings` と声部連結の選び方にそのまま渡します。

テンションのあるコードは、基本形で最大17半音に広がるので、音域（F3〜E5）に基本形が収まらないことがあります（全キー・全コード・全テンションの264組のうち45組）。セクションの最初のコードは基本形を優先し、収まらないときだけほかの転回形から選びます。どの組でも少なくとも1つの転回形は収まります。テンションのないコードは常に基本形が収まるので、フェーズ3のボイシングは変わりません。

転回形はこの4音の巡回で作ります。そのため、隣り合う声部は (ルート, 3度)・(3度, 7度)・(7度, テンション)・(テンション, ルート) のいずれかです。表のどのコードとテンションの組でも、これらの上行の間隔は短2度になりません（最小は短3度、最大は長7度）。単体テストで全組を確かめます。

`closeVoicings` に「短2度を含む候補を除く」条件は加えません。テンションのない maj7 の転回形では、7度とルートが短2度で隣り合います。条件を加えると、フェーズ3のパッドのボイシングまで変わってしまうためです。

### 反復の一致（F-40）のテスト

サブベースとリースベースは、発音位置・長さ・構成音の番号を比べます。スタブとパッドは発音位置と長さだけを比べます。

## 一時停止と再開

### セッションの型（`engine/transport.ts`）

```ts
interface Sequencer {
  start(settings: PlaybackSettings): PlayingSession;
}
interface PlayingSession {
  readonly state: 'playing';
  pause(): PausedSession;
  stop(): void;
}
interface PausedSession {
  readonly state: 'paused';
  resume(): PlayingSession;
  stop(): void;
}
type PlaybackSession = PlayingSession | PausedSession;
```

`main.ts` は `PlaybackSession | null` を持ちます（`null` が停止中）。一時停止中に `pause` を呼ぶ、停止中に `resume` を呼ぶ、という不正な操作は型で書けません。ボタンの表示と押せるかどうかは、この値の `state` だけから決めます。

### 予約済みの2bar（`engine/playhead.ts`）

```ts
interface ScheduledPair {
  readonly start: Seconds;
  readonly pair: EnsemblePair;
}
// 再開する2bar と、その後に生成済みの2bar。先頭から順に鳴らす。空なら次に生成する2bar の頭から
type ResumePoint =
  | { readonly pending: readonly []; readonly step: Step & 0 }
  | { readonly pending: readonly [EnsemblePair, ...EnsemblePair[]]; readonly step: Step };
function locate(scheduled: readonly ScheduledPair[], cutTime: Seconds, stepSeconds: number): ResumePoint;
// 保留の2bar を先に、使い切ったら generate で生成した2bar を返す
function pairSource(pending: readonly EnsemblePair[], generate: () => EnsemblePair): () => EnsemblePair;
```

トランスポートは、予約した2bar を `ScheduledPair` の列に足します。鳴り終わってから1つ分の2bar より古いものは捨てます。列が際限なく伸びないようにするためです（N-04）。

`locate` は、`cutTime` 以降に始まる最初のステップを求めます。

- `cutTime` を含む2bar で、`step = ceil((cutTime − start) / stepSeconds)` を求める
- `step` が32なら、次の2bar のステップ0にする
- `cutTime` が最初の2bar の開始より前なら（再生してすぐに一時停止したとき）、最初の2bar のステップ0にする
- 返す `pending` は、その2bar と、列でそれより後ろにある生成済みの2bar
- 予約済みの2bar がすべて鳴り終わっていれば、`pending` は空（次に生成する2bar の頭から）

`cutTime` には `Tone.immediate()`（先読みを含まない今の時刻）を使います。出力の遅延（数十 ms）は考えません。1ステップ（174 BPM で約 86 ms）より短く、ずれても高々1ステップのためです。

### 再開の流れ（`engine/transport.ts`）

開始と再開を同じ関数 `play(settings, generate, from: ResumePoint)` で扱います。開始は「生成済みの2bar がなく、ステップ0から」の再開です。

1. `time = Tone.now()` を再開の時刻とする
2. `instruments.open(time, { events: first.fx, step, stepSeconds })` で、新しいシンセ・サンプラー・リバーブを用意し、再開位置の値からオートメーションを始める
3. 最初の2bar を、仮想の開始時刻 `time − step × stepSeconds` で予約する。イベントは `eventsFrom(first.events, step)`、FX は `fxAutomation(first.fx, 仮想の開始時刻, stepSeconds, step)`、ダッキングは `eventsFrom` の後のキック、描画の呼び出しはステップ `step` 以降
4. Transport を `time` から始め、`(32 − step) × stepSeconds` 後から2bar ごとに繰り返す。繰り返しのたびに `pairSource(from.pending, generate)` から次の2bar を取る

再開するセッションの `generate` には、一時停止したセッションの取り出し元（`pairSource`）をそのまま渡します。前の一時停止で保留したまま、まだ予約していない2bar が残っていることがあるためです。

一時停止は次のように行います。

1. `cutTime = Tone.immediate()` とし、`locate` で `ResumePoint` を求める
2. Transport を止めて予約を取り消し、描画の予約も取り消す
3. `instruments.silence(cutTime)` で音を切る

アンサンブルは一時停止しても捨てず、`PausedSession` が `ResumePoint` と一緒に持ちます。生成済みの2bar を再開の後にそのまま使い、2度生成しないので、取り出す2bar の列は一時停止しなかった場合と一致します（N-15）。

Transport の位置（`transport.seconds`）は使いません。再開のたびに Transport を0から始め直すので、位置は再生を始めてからの時間と一致しなくなるためです。小節とサイクルの累計は `Context` の `bar` と `cycle` から求めます。

### 再開位置以降のイベント（`engine/resume.ts`）

```ts
function eventsFrom(events: readonly NoteEvent[], from: Step): readonly NoteEvent[];
```

| イベント | 扱い |
| --- | --- |
| ドラム | `step ≥ from` のものだけ |
| 音程のあるノート（`step ≥ from`） | そのまま |
| 音程のあるノート（`step < from < step + length`） | `step = from`、`length = step + length − from` にする |
| 音程のあるノート（`step + length ≤ from`） | 除く |

`from = 0` では `events` をそのまま返します。開始を再開と同じ経路で扱っても、フェーズ3の予約と変わりません。

### 再開位置の値（`engine/automation.ts`）

```ts
type AutomationValues = Readonly<Record<AutomationTarget, number>>;
function fxStateAt(events: readonly FxEvent[], step: Step, stepSeconds: number, fx: FxTuning): AutomationValues;
function fxAutomation(events, pairStart, stepSeconds, fx: FxTuning, from: Step = 0): readonly AutomationPoint[];
```

`fxStateAt` は、その2bar の FX のイベントだけから、一時停止しなかった場合にステップ `step` の時刻で各パラメーターが取る値を返します。前の2bar の点列を参照しなくても済むのは、続いている効果（ライザー、スイープ）が、どの2bar にも開始と終了の進み具合を持つ区間のイベントとして出ているためです（フェーズ3の F-65）。

| パラメーター | 値 |
| --- | --- |
| ライザーの音量 | 区間内（`step < to`）なら、区間の両端の値 `riserGain(startProgress)` と `riserGain(endProgress)` を `step / to` で直線補間する。Web Audio の直線のランプと同じ形にするため、進み具合から `riserGain` を直接は求めない。区間の後で `endProgress = 1` なら 0 |
| ライザーの周波数、ハイパス、ローパス | 区間内なら、両端の周波数を `step / to` で対数補間する（指数のランプと同じ形）。区間の後は終わりの値 |
| ハイパス側の割合 | ハイパスのスイープの区間がある2bar では 1、ない2bar では 0 |
| リバーブスローの送り量 | スローの打音の 5 ms 前から 120 ms 後までにステップ `step` の頭があれば送り量、なければ 0。開いている時間が1ステップより長いので、1ステップの秒数を受け取る |
| パッドのゲート | `cut` の溜めで `step > from` なら 0、それ以外は 1（`step = from` では、閉じ始める前の 1） |
| ほか | `restingValue(sound.fx)`（フェーズ3の `RESTING_VALUE`。設定ファイルの周波数の範囲から求める） |

`fxAutomation` に `from` を加えます。`from > 0` のときは、効果の始まりの点を作らず、時刻が `at(from)` より前の点を除きます。残るランプは、`open` が再開の時刻に `set` した値から、一時停止しなかった場合と同じ終点に向かうので、曲線も一致します。

**溜めの直後のパッドのゲート**: 止めずに鳴らすと、溜めの後のドロップの頭では、ゲートが 0.4 秒かけて開きます。この0.4秒の間で再開した場合は、ゲートを開いた状態から始めます。ゆっくり開くのは、溜めで切ったパッドの余韻がドロップの頭で聞こえ直さないようにするためで、再開した時点ではその余韻がないためです。

**ハイパスの受け渡し**: ビルドの途中で再開するときは、ハイパス側の割合を 5 ms のランプを使わずに再開の時刻で 1 に `set` します。ゲートが開く前でまだ何も鳴っていないので、受け渡しのランプ（フェーズ3）が防いでいた低域の衝撃は起きないためです。

### エンジン（`engine/audio.ts`）

| メソッド | 変更 |
| --- | --- |
| `silence(time: Seconds)` | 時刻を引数で受け取る。停止はこれまでどおり `Tone.now()`、一時停止は `Tone.immediate()` を渡す。ゲートを 10 ms で閉じる（N-17）のはフェーズ3のまま |
| `open(time, resumed?: { events, step, stepSeconds })` | `rest(time)` の後に、`resumed` があれば `fxStateAt` の値を同じ時刻に `set` する。同時刻の値は後に予約したものが効く。ゲートは一気に開けず、10 ms のランプで開く。ビルドの途中で再開すると、ライザーのノイズが途中の音量で鳴っていて、無音から一気に立ち上がるとクリックになるため（N-17） |
| `open` で作り直すもの | フェーズ3のシンセ・インパクト・リバーブに加えて、ドラムのサンプラーも、読み込み済みのバッファから作り直す（読み込み直さない） |

**サンプラーを作り直す理由**: 一時停止→再開は、停止→再生と違い、同じ2bar の残り（174 BPM で最大約 2.7 秒）のうちに押されるのが普通です。`Tone.Sampler.releaseAll` は、まだ始まっていない予約済みの打音を、Tone.js の内部のタイマー（`context.setTimeout`）から止めます。そのため、止まるかどうかはタイマーが予約の時刻より前に動くかどうかに左右されます。止まらないと、一時停止の前に予約した打音がゲートを開いた後に鳴り、再開後の打音と二重になります。シンセと同じく、作り直して古い予約ごと捨てれば、タイマーの都合によらず確実に消せます。

ダッキングの持ち越し（`carried`）は `silence` で消すので、再開後は再開位置以降のキックから予約し直します。

## ミキサーのソロ（`params/mixer.ts`、`engine/audio.ts`）

```ts
interface Channel { readonly level: Decibels; readonly muted: boolean; readonly soloed: boolean }
interface ReturnChannel { readonly level: Decibels; readonly muted: boolean }
// PannedChannel・SendingChannel は Channel を広げる（フェーズ3のまま）
interface MixerSettings { /* … */ readonly reverbReturn: ReturnChannel }

type SoloableId = Exclude<ChannelId, 'reverbReturn'>;

function audibleChannels(mixer: MixerSettings): Readonly<Record<ChannelId, boolean>>;
```

`audibleChannels` は、要件のソロの表を実装します。

| チャンネル | 鳴る条件 |
| --- | --- |
| リバーブのリターン | ミュートでない |
| それ以外 | ミュートでなく、どのチャンネルもソロでないか、自身がソロ |

エンジンは、`setMixer` のたびに `audibleChannels` を求め、各 `Tone.Channel` の `mute` に `!audible[id]` を設定します。センドはチャンネルの後から取っているので、鳴らないチャンネルのセンドも止まります。

リバーブスローの経路（スネアのトリムの後からのセンド）には、`Gain` を1つ挟みます。その `Gain` を `audible.snare` に合わせて 0 か 1 へ 50 ms でランプさせます。スローの送り量（オートメーション）とは別の `Gain` にするのは、ミキサーとオートメーションが同じパラメーターを取り合わないようにするためです（N-11、フェーズ3）。

Tone.js の `Channel.solo` は使いません。`Tone.Solo` は同時に1つしかソロにできず、ソロでない `Solo` をすべて消音するので、リバーブのリターンの `Channel` まで消えるためです。

ソロの値は `MixerSettings` の中にあり、アンサンブルには届きません（N-11）。

## スペクトラムアナライザー

### 取り出し（`engine/audio.ts`）

```
… ─▶ Limiter ─▶ クリップ検出 ─▶ gate ─┬▶ 音量 ─▶ 出力
                                       └▶ Analyser（FFT）
```

`gate` の出力から `Tone.Analyser({ type: 'fft', size: 4096, smoothing: 0.6 })` に分けます。リミッターの後なので、クリップの検出と同じ音を見ます。音量の前なので、音量つまみで表示は変わりません。`gate` の後なので、停止中と一時停止中は何も映りません。

`Instruments` に `spectrum(): Spectrum` を加えます。`Spectrum` は、FFT の各ビンの dB 値（`Float32Array`）とサンプリング周波数の組です。UI は Tone.js を読まず、この値だけから描画します。

### 表示（`ui/spectrum.ts`）

| 項目 | 値 | 理由 |
| --- | --- | --- |
| 帯域 | 1/2 オクターブ間隔の19帯域（中心 31.5 Hz〜16 kHz） | キック・サブベースの低域と、ハイハットの高域を別の帯域として見分けられ、1帯域の幅がグリッドの列と同じくらいになる数 |
| 帯域のレベル | 帯域の端（中心の 2^(±1/4) 倍）の間にあるビンの電力の合計。ビンが1つもない帯域は中心に最も近いビン | ハイハットのノイズは数百のビンに薄く広がり、最大値ではどのビンも下限に届かず高域が点かなかった |
| セグメント | 1帯域48個、1個 1 dB（−48〜0 dBFS）。−6 dB より上は赤、−12 dB より上は黄 | クリップ検出のピークメーターの下限（−48 dBFS）と揃える |
| 補正 | 11.2 dB を足す | ブラックマン窓で、フルスケールの正弦波は最大のビンで約 −13.6 dB（実測 −13.6〜−14.1 dB）になり、主ローブの電力の合計で約 2.4 dB 戻るため。最上段まで点くようにする |
| 色 | 上から2つ（−6 dB 以上）は赤、次の2つは黄、残りはアクセント色 | |
| ピークホールド | 帯域ごとに最も高く点いたセグメントを 1 秒保ち、その後 1 秒あたり 24 dB で下げる | 一瞬のピークを目で追えるようにする |
| 描画 | `canvas` に `requestAnimationFrame` で描く | 19×48 のセグメントを要素で持つと、毎フレームのクラスの付け替えが重い |

描画のループは、スペクトラムアナライザーを表示していて、かつ再生中のときだけ回します（N-16）。表示を切り替えたとき、一時停止したとき、停止したときは、ループを止めて全セグメントを消した状態を1度だけ描きます。タブが隠れている間は、ブラウザが `requestAnimationFrame` を止めます。

具体的な色と寸法は CSS の変数で持ち、ステップグリッドと揃えます。

## UI

### 画面の組み立て（`main.ts`）

```
h1
controls（再生/一時停止/再開・停止・音量）  position の累計
position のメーター2行
views（切り替えボタン、grid か spectrum）
aside.offcanvas （タブ: パラメーター | ミキサー）
button.menu-toggle（右上に固定。メニューより上に重ね、開いている間は閉じるボタンになる）
button.share-toggle（menu-toggle の左に固定。メニューより下に置く）
dialog.share
status
```

再生の操作は、画面のボタンとメディア操作の両方から、`main.ts` の1つの関数 `run(command)` を通します。どちらから操作しても `render()` が画面とメディア操作の表示を同じ状態で描き直すためです。

メニューは、背景を暗くしない固定のオフキャンバス（`aside`）です。閉じている間は `inert` にし、隠れた操作部品にフォーカスが移らないようにします。開閉のボタンは1つで、開くとアイコンと名前を「閉じる」に替えます。メニューは本体の上に重ね、開いている間も `#app` の幅と余白を変えません。幅は `min(640px, 100vw)` で、幅 640px 以下の画面では本体を覆います。

### 再生の操作（`ui/controls.ts`）

| `PlaybackSession` | 再生ボタン | 停止ボタン |
| --- | --- | --- |
| `null` | 「再生」 | 無効 |
| `state: 'playing'` | 「一時停止」 | 有効 |
| `state: 'paused'` | 「再開」 | 有効 |

パネルの `setPlaying(boolean)` は `setSession(state)` に改めます。BPM と初期キーは `null` のときだけ有効にします。

マスターのピークとクリップの回数（`resetLevel`）は、停止から再生したときだけ消し、再開では消しません。ミキサーのメニューで「再生を始めてからの値」を確かめられるようにするためです。

音量スライダーは `output` を重ね、`:hover` の間と、`pointerdown` から `pointerup` までの間（`adjusting` クラス）、キー操作の後1秒の間だけ、つまみの上に百分率を出します。

### 再生の命令（`ui/playback.ts`）

```ts
type PlaybackCommand = 'start' | 'pause' | 'resume' | 'stop';
type MediaAction = 'play' | 'pause' | 'stop';                       // Media Session API の操作のうち受けるもの
function toggleCommand(state: PlaybackState): Exclude<PlaybackCommand, 'stop'>;      // 再生ボタン
function mediaCommand(action: MediaAction, state: PlaybackState): PlaybackCommand | null;
```

| 操作 | 停止 | 再生中 | 一時停止中 |
| --- | --- | --- | --- |
| 再生ボタン | `start` | `pause` | `resume` |
| 停止ボタン | （押せない） | `stop` | `stop` |
| メディアの `play` | `start` | なし | `resume` |
| メディアの `pause` | なし | `pause` | なし |
| メディアの `stop` | なし | `stop` | `stop` |

メディアの `play` と `pause` を再生ボタンのような切り替えにしないのは、OS が「再生」と「一時停止」を別の操作として送ってくるためです。再生中に `play` が来ても一時停止しません。

`start` は `Tone.start()` を待った後で、セッションがまだないことを確かめてから始めます。ユーザーの操作を待っている間に2度目の `start`（メディア操作と画面のクリックなど）が来ると、同じ操作で両方の待ちが解け、セッションが2つできてしまうためです。

### メディア操作（`ui/media-session.ts`）

```ts
interface MediaSessionLink { show(state: PlaybackState, seed: Seed): void }
function linkMediaSession(onAction: (action: MediaAction) => void): MediaSessionLink;
const SILENCE = { seconds: 10, sampleRate: 8000 };
function silentWav(): Uint8Array;   // SILENCE の長さの、8bit モノラルの無音の WAV
```

- `navigator.mediaSession` がないブラウザでは、何もしない `MediaSessionLink` を返す
- `show(state, seed)` は `playbackState` を `'none'`・`'playing'`・`'paused'` にし、`metadata` を `{ title: 'GenDnB', artist: 'シード {seed}' }` にする。停止中は `metadata` を消す。`setPositionState` は呼ばない（曲に終わりがないため）
- 無音の `audio` 要素は、`silentWav()` の Blob の URL を `loop` で鳴らす。10秒にするのは、Chrome が5秒以下のメディアに通知を出さないためです。要素の `muted` と音量は変えない。消音した要素を、ブラウザがメディア操作の手がかりにしないためです
- 要素は `hidden` にして文書に置く。メディアセッションをデスクトップにつなぐブラウザ拡張（KDE の Plasma Integration など）が、文書の外の要素を一度止めて鳴らし直し、それがブラウザによる一時停止に見えるためです
- 再生中は `audio.play()`、一時停止中と停止では、鳴っているときだけ `audio.pause()` を呼ぶ。読み込む前の要素の `pause()` は読み込みを始め、直後の `play()` を `pause` イベントつきで中断させるためです。`play()` が拒否されても（自動再生の制限）、音は Web Audio API から出ているので無視する
- 要素の `pause` イベントが、こちらから止めたのではないときに来たら（ヘッドホンが抜けたときなど）、メディアの `pause` として扱う。`play()` が拒否されたときは、この扱いをしない
- ブラウザが知らない操作の `setActionHandler` は例外になるので、操作ごとに捕まえ、ほかの操作は登録する
- 音を `MediaStreamAudioDestinationNode` から `audio` 要素に流す方法は採らない。音の経路と遅延が変わり、リミッターの後のクリップの検出（N-10）やクリック防止（N-17）を確かめ直すことになるためです

### 共有（`ui/share.ts`、`params/query.ts`）

```ts
function shareUrl(page: string, seed: Seed | undefined): string;   // クエリ文字列とフラグメントを除き、seed があれば ?seed= を付ける
function createShareDialog(seedToShare: () => Seed): { readonly toggle: HTMLButtonElement; readonly element: HTMLDialogElement };
```

- ページの URL は `new URL(import.meta.env.BASE_URL, location.href)` とする。`location` を読むのは `main.ts` だけにし、`shareUrl` は Node.js 上でテストする
- `seedToShare` は、セッションがあればそのセッションを始めたシード、なければストアのシードを返す。`main.ts` が `start` のときにシードを控える
- ダイアログは `<dialog>` を `showModal()` で開く。開くたびに、その時点のシードで URL を作り直す。Esc キーでは、ブラウザの既定の動作で閉じる
- **外側のクリック**: `dialog` の余白を 0 にして中身を内側の要素に入れ、`pointerdown` と `click` の対象がどちらも `dialog` 自身のときだけ閉じる。モーダルの `dialog` では、背景のクリックの対象が `dialog` になるためです。`pointerdown` も確かめるのは、URL の欄で文字を選びながら外までドラッグしたときに閉じないようにするためです
- **コピー**: `navigator.clipboard.writeText` を使う。ない（HTTPS でない配布先や、開発サーバーに LAN の IP で接続したとき）か失敗したときは、URL の欄を選択して「選択した URL をコピーしてください」と出す。`document.execCommand('copy')` は非推奨なので使わない
- 結果の表示は `aria-live="polite"` の要素に出し、URL かチェックボックスが変わったら消す
- アイコンは Lucide の `Share2`（共有のボタン）、`Copy`（コピー）、`X`（閉じる）

### 狭い画面（`ui/style.css`、`ui/grid.ts`）

幅 320px までを対象にします。

- `#app` の列を `minmax(0, 1fr)` にする。暗黙の列（`auto`）のままでは、中身の最小幅（ステップグリッドのマスの `aspect-ratio` から決まる最小幅）でページが横に広がるためです。ステップグリッドの列も `minmax(0, 1fr)` にし、マスの `min-width` を 0 にする
- **シーケンサーの1小節表示**: 幅 560px 以下で、32ステップのうち今の1小節の16ステップだけを表示する。32ステップでは幅 320px でマスが約 3px になるためです。各マスに `data-bar`（0 か 1）を、グリッドに今の小節の `data-bar` を持たせ、メディアクエリでほかの小節のマスを `display: none` にする。隠したマスは自動配置から外れるので、列の指定は要らない。グリッドの `data-bar` は `highlight(step)` で `floor(step / 16)` にし、停止（`highlight(null)`）で 0 に戻す。一時停止では `highlight` を呼ばないので、最後に鳴った小節が残る。ノートは2bar のステップで描くので、小節をまたぐ音は2小節目の頭から続きとして見える。2小節目の頭の小節線（`.grid-cell.bar`）は幅 560px を超える画面でだけ描き、狭い画面では拍の線（`.beat`）にする
- **8bar のメーター**: 2bar で1マスの4マス（`.pair-meter`）と、1bar で1マスの8マス（`.bar-meter`）を両方作り、幅 560px を境にメディアクエリでどちらかを表示する。8マスの方は `pairIn8 × 2 + floor(step / 16)` まで点ける
- **パラメーター**: 幅 480px 以下で、`.field` のラベルの列を 9em から 7.5em に詰める。ミキサーの表とダッキングは、既存の 640px 以下の指定（数値の表示を消す）のまま、ダッキングの最小幅を外す
- **スペクトラムアナライザー**: 幅 560px 以下で、高さを 260px から 180px にする
- **共有のダイアログ**: 幅を `min(480px, 100vw − 32px)` にし、URL の欄は折り返さずに欄の中でスクロールさせる

### メニューの中身

- パラメーター: `.panel` を1列のグリッドにし、各 `.field` をラベル（9em）と操作部品の2列にする
- ミキサー: 表の上の切り替え（`MixerMode = 'level' | 'pan' | 'send'`）で、全行の `.mixer-slot` に入れるスライダーを差し替える。行は ラベル・スライダー・ミュート・ソロ の4列。切り替えの状態は保存しない

### 位置の表示（`ui/position.ts`）

- 文字の表示は `{bar + 1} 小節　{cycle + 1} サイクル` だけにする。`bar` は `ctx.bar + floor(step / 16)`
- メーターは、サイクルのメーター（フェーズ3の `sceneMeter` をラベルなしで）と、`pairIn8` を点ける4マスのメーターの2行にする。狭い画面では4マスのメーターを、小節を点ける8マスのメーターに替える
- `clear()` は停止のときだけ呼ぶ。一時停止では呼ばず、最後に描いた位置を残す
- キー、コード名、シーン名、次のシーンまでの小節数、32bar の役割の表示と、それらのための CSS を削る

### ステップグリッド（`ui/grid.ts`）

行を `['kick', 'snare', 'hat', 'sub', 'reese', 'stab']` にし、ゴーストの打音はスネアの行に描きます。ドラムの打音はすべて同じ `data-layer='hit'` で描き、ベロシティだけで濃淡を付けます（ゴーストは弱いので暗くなる）。同じステップにスネアがあるときは、スネアを優先して描きます。停止中のサイクルのメーターは、128bar のレイアウト（イントロ 16bar・ブレイクダウン 16bar・延長なし）を暗く描きます。

### シードのクエリ文字列（`params/query.ts`）

```ts
function seedFromQuery(search: string): Seed | undefined;   // new URLSearchParams(search).get('seed') を parseSeed で読む
```

初期シードは `seedFromQuery(location.search) ?? config.params.seed ?? randomSeed()` です（F-95）。`location` を読むのは `main.ts` だけにし、初期値を作る関数には引数で渡します。Node.js 上のテストで `location` なしに呼べるようにするためです。

## 設定ファイル

### 型と既定値の置き場所

```ts
// structure/tuning.ts（生成側）
interface GenerationTuning { readonly harmony: …; readonly energy: …; readonly layout: …; readonly fill: …; readonly lines: … }
const DEFAULT_GENERATION_TUNING: GenerationTuning;

// engine/tuning.ts（音側。Tone.js に依存しない）
interface SoundTuning { readonly trimDb: …; readonly duckRatio: …; readonly reverb: …; readonly dynamics: …; readonly fx: FxTuning }
const DEFAULT_SOUND_TUNING: SoundTuning;

// params/config.ts
interface Config {
  readonly params: InitialParams;          // seed だけは省略できる（Seed | undefined）
  readonly mixer: MixerSettings;
  readonly ducking: DuckingSettings;
  readonly generation: GenerationTuning;
  readonly sound: SoundTuning;
}
const DEFAULT_CONFIG: Config;
```

生成の数値の型と既定値を `structure` に、音の数値を `engine` に置くのは、依存の向き（`params` → `structure`、`engine` → `structure`）を変えないためです。`params/config.ts` は両方を読んで1つの `Config` にまとめるだけです。これまでモジュールの定数だった値（`MODULATION_SHARE`、`ENERGY_CURVE`、`DROP_EXTENSIONS`、`SOURCE_TRIM_DB`、`RISER` など）は、この既定値に移し、モジュールの定数としては残しません。既定値と定数を二重に持つと、どちらが効いているのかが分からなくなるためです。

### 値の渡し方

| 値 | 渡し先 | 渡し方 |
| --- | --- | --- |
| `params`・`mixer`・`ducking` | パラメーターのストアの初期値 | `initialParams(config, seed)` が `Params` を作る |
| `generation` | アンサンブル | `SessionSettings` に `tuning` を加える。コンダクターは構造の数値（`harmony`・`energy`・`layout`）を、各生成器はパートの数値（`fill`・`lines`）を、作るときに受け取る。`sceneEnergy`・`cycleModulation`・`colorMain`・`drawLayout`・`fill` などの関数は引数で受け取る |
| `sound` | エンジン | `loadInstruments(url, mixer, sound)`。`fxAutomation` と `fxStateAt` は `sound.fx` を引数で受け取り、`RESTING_VALUE` は `restingValue(sound.fx)` にする |

生成の数値を `Context` に入れず、作るときに渡すのは、`Context` を定義する `structure` が、パートの数値の型（`Velocity` など、`generators` の型）に依存せずに済むようにするためです。構造の数値の型は `structure/tuning.ts` に、パートの数値の型と両者をまとめた `GenerationTuning` は `generators/tuning.ts` に置きます。値はセッションの間は変わらないので、ラッチは要りません。`sound` はアンサンブルに渡しません。音の数値を変えても展開は変わりません（N-11 と同じ考え方）。

### キーと検証

キーの名前は、型の欄の名前をそのまま使います。JSON の例と既定値は `config.example.json` に置きます。

**`params`**

| キー | 型と範囲 | 既定値 |
| --- | --- | --- |
| `bpm` | 160〜180 の整数 | 174 |
| `volume`、`m2`、`m8`、`m32`、`fillIntensity`、`energyDepth` | 0〜1 | 0.5、0.3、0.35、0.6、0.3、0.5 |
| `initialKey` | キーの名前（`parseKey` が読める文字列。`F`、`F#`、`B♭` など） | `"F"` |
| `seed` | 0〜4294967295 の整数 | なし（乱数） |

**`mixer`**: チャンネルの名前（`kick` … `fx`、`reverbReturn`）ごとに `level`（−40〜6。整数に丸める）、`pan`（−1〜1。0.01 刻みに丸める）、`send`（0〜1）、`muted`、`soloed`（真偽値）。パンとセンドのないチャンネル（キック・サブベース）にそのキーを書いたとき、`reverbReturn` に `soloed` を書いたときは、知らないキーとして無視します。

**`ducking`**: `depth`（0〜1）と `release`（30〜300 の整数 ms）です。`Config` の形とそろえて、`mixer` の中ではなくトップレベルに置きます。

**`generation`**

| キー | 型と範囲 | 既定値 |
| --- | --- | --- |
| `harmony.tensionChance`、`harmony.borrowChance` | 0〜1 | 0.4、0.2 |
| `harmony.modulationShare` | 0〜1 | 0.5 |
| `energy.phrase`（`A`・`A'`・`B`・`A''`） | 0〜1 | 0.75、0.9、0.5、1.0 |
| `energy.scene`（`intro`・`buildFirst`・`buildLast`・`breakdown`） | 0〜1 | 0.5、0.6、0.75、0.4 |
| `layout.longIntroChance`、`layout.longBreakdownChance` | 0〜1（24bar になる確率） | 0.5、0.5 |
| `layout.dropExtension`（`none`・`first`・`second`・`both`） | 0 以上の重み | 1/3、1/6、1/6、1/3 |
| `fill.sectionLength`（`4`・`8`・`16`・`32`）、`fill.phraseLength`（`16`・`32`） | 0 以上の重み | 0.4、0.4、0.15、0.05 と 0.6、0.4 |
| `lines.subOctaveJumpChance` | 0〜1 | 0.2 |
| `lines.subToneWeights`、`lines.reeseToneWeights` | 0 以上の重み4つ（`root`・`third`・`fifth`・`seventh`） | 0.5、0.1、0.15、0.1 と 0.6、0.1、0.2、0.1 |
| `lines.velocity`（`sub`・`reese`・`stab`・`pad`・`pickup`） | 0 より大きく 1 以下 | 0.8、0.8、0.7、0.6、0.9 |

**`sound`**

| キー | 型と範囲 | 既定値 |
| --- | --- | --- |
| `trimDb`（`kick` … `fx`） | −60〜0 dB | −8、−10、−14、−8、−6、−10、−13、−16、−12 |
| `duckRatio`（`sub`・`reese`・`pad`） | 0〜1 | 1、0.7、0.5 |
| `reverb.decay`、`reverb.preDelay` | 0.1〜10 秒、0〜0.5 秒 | 2.5、0.02 |
| `dynamics.drumBus`、`dynamics.masterBus`（`threshold`・`ratio`・`attack`・`release`） | −40〜0 dB、1〜20、0 より大きく 1 秒以下 | −12・3・0.01・0.1 と −10・2・0.02・0.2 |
| `dynamics.limiterThresholdDb` | −12〜0 dB | −1 |
| `fx.riser`（`peakGain`・`lowHz`・`highHz`） | 0〜1、20〜20000 Hz | 0.5、300、8000 |
| `fx.highpass`（`openHz`・`closedHz`）、`fx.lowpass`（`closedHz`・`openHz`） | 20〜20000 Hz | 20・600 と 400・18000 |
| `fx.throwSend` | 0〜1 | 1 |
| `fx.impactVolumeDb` | −40〜0 dB | −3 |

トリムと補正を 0 dB 以下に限るのは、フェーズ3の「補正はマイナスだけ」と同じく、既定の釣り合いより大きくしてクリップしない保証（N-10・N-13）を崩しにくくするためです。とはいえ、N-10・N-13 と試聴の受け入れ基準を保証するのは既定値だけで、設定ファイルで変えた値の音は保証しません。

**関係の検証**: 次の組は、関係が崩れたら組ごと既定値に戻します。片方だけ戻すと、書いた人の意図とも既定値とも違う組み合わせになるためです。

| 組 | 関係 | 根拠 |
| --- | --- | --- |
| `energy.scene.buildFirst`・`buildLast` と `energy.phrase.A` | `buildFirst ≤ buildLast ≤ A` | ビルドでエネルギーが単調に増え、ドロップの A を超えない（フェーズ3の受け入れ基準） |
| 重みの組（`dropExtension`、`fill.*`、`*ToneWeights`） | 合計が正 | すべて0では選べない |
| `fx.riser` | `lowHz < highHz` | 上がっていくライザーにする |
| `fx.highpass` | `openHz < closedHz` | |
| `fx.lowpass` | `closedHz < openHz` | |

### 検証の仕組み

```ts
interface Decoded<T> { readonly value: T; readonly warnings: readonly string[] }
function parseConfigText(text: string): Decoded<Config>;   // JSON.parse に失敗したら既定値と警告1つ
function decodeConfig(raw: unknown): Decoded<Config>;
```

値ごとの小さな読み取り関数（`unit`、`integerIn(min, max)`、`weights`、`keyName` など）を組み合わせ、既定値の形をたどって読みます。各関数は「読んだ値か、既定値と警告」を返し、例外を投げません。警告には `generation.harmony.borrowChance` のような JSON 上の位置を含めます。既定値の形をたどるので、既定値にないキーはすべて「知らないキー」として警告できます。

既存の `clampLevel`・`clampBpm` などは使いません。範囲外の値を丸めて受け入れると、書き間違いに気づけないためです。整数への丸め（`level`、`release`）とパンの 0.01 刻みは、範囲内の値にだけ行います。

### 読み込み（`params/load-config.ts`）

```ts
async function loadConfig(url: string): Promise<Decoded<Config>>;
```

| 状況 | 結果 |
| --- | --- |
| 404 などの失敗の応答 | 既定値。警告なし（ファイルがないのは正常） |
| 応答の Content-Type が JSON でない | 既定値。警告なし |
| 通信の失敗 | 既定値と警告 |
| JSON として読めない | 既定値と警告 |
| 読めた | `decodeConfig` の結果 |

`fetch` には `Accept: application/json` と `cache: 'no-store'` を付けます。Vite の開発サーバーは、`Accept` に `*/*` か `text/html` を含むリクエストで、ないファイルの代わりに `index.html` を返すためです（SPA のフォールバック）。Content-Type も確かめるのは、配布先のサーバーが同じことをしても「ファイルなし」と見なすためです。`cache: 'no-store'` は、値を書き換えて開き直したときに古いファイルを使わないようにするためです。

`main.ts` は、起動の最初に `loadConfig(`${BASE_URL}config.json`)` を待ってから、ストア・パネル・エンジンを作ります。警告は1つずつ `console.warn` に出し、1つでもあれば状態表示に「設定ファイルの一部の値を無視しました（詳細はコンソール）」と出します。

### シミュレーション

`--config <パス>` で、ファイルを読んで `parseConfigText` に渡します。警告は標準エラーに出します。`params` は CLI のオプションの既定値になり、CLI で明示したオプションが優先します。`generation` はアンサンブルに渡します。`sound` は使いません。

## シミュレーション

次の統計を追加・変更します。

- 色付けしたコードごと（例: `iv`、`IV7`、`VI(♯11)`）の2bar の数
- 借用和音ごとの出現数と、テンションごとの出現数
- 主進行と転換進行の出現数は、骨組みで数える（フェーズ3と同じ形）
- コード外の音の数（`outOfChord`）は、色付けしたコードの構成音とテンションで数える。0 になるはず
- 借用和音のない2bar で、ナチュラルマイナーの外の音の数（0 になるはず）
- サブベースの音度の分布に「音階外」を加える（借用和音の構成音）
- 2bar の反復率は、ベースを構成音の番号で、スタブとパッドを位置と長さだけで比べる（F-40 の改訂と同じ理由）

## 受け入れ基準とテストの対応

**フェーズ3との一致の基準値**: 和声に手を入れる前に、フェーズ3（`v0.4.0`）の生成器で基準値を記録し、テストの fixture として置きます。記録するのは、複数のシード × 2048ペアの、ドラムのイベント・レイアウト・各サイクルのキーと音色・FX のイベントのハッシュです。

| 受け入れ基準 | テスト |
| --- | --- |
| MVP〜フェーズ3の基準 | 既存のテストを維持する。音階のテストは「構成音かテンション」に、F-40 のテストは構成音の番号に、`rootDegree` を使うテストは `chordToneClass` に書き換える |
| フェーズ3との一致 | 記録した基準値と、同じシード・ペア数のハッシュを比べる |
| 構成音とテンション | 音程のある全パートの音が、`chordToneClass` か `tensionClass` のピッチクラス。借用和音のない2bar ではナチュラルマイナーに含まれる |
| ベースとテンション | サブベースとリースベースの全ノートが `chordToneClass` の4音のいずれか |
| ボイシング | テンションのある2bar で、スタブとパッドの構成音が要件どおり。隣り合う声部の間隔が2半音以上。スタブの最低音が C4〜B4 で、幅が14半音以内 |
| 表の健全性 | `CHORDS` の全テンションが、構成音の1半音上にない（V7 の ♭9 を除く）。全テンションがナチュラルマイナーに含まれる |
| 借用の位置 | 借用和音が骨組みの iv と v の位置にだけあり、`BORROWINGS` の候補に含まれる |
| 網羅 | 8192bar・複数シードで、借用和音3つと、`CHORDS` の全コード×テンション（なしを含む）の組が現れる |
| 色付けの共有 | 主進行の `chords` がサイクルの頭以外で変わらず、骨組みを引き継いだサイクルでは `chords` も一致する。同じサイクルのドロップの A 系で `chords` が一致する |
| 初期キーと色付け | 初期キーだけを変えた2回の生成で、全2bar の `progression.chords` が一致する |
| スネアとゴースト | 8192bar・複数シード・フィル強度 0〜1 で、鳴る側のイベントにスネアとゴーストが同じステップにない |
| 再開の切り出し | 全ステップ `from` で、`eventsFrom` の結果が要件の表に一致する |
| 再開位置の値 | 連続する2bar の点列を Web Audio と同じ規則（`set`、直線、指数のランプ）で評価する関数をテスト側に作る。全2bar・全ステップで、その評価値と `fxStateAt` が一致する（許容誤差つき）。`from > 0` の点列を `fxStateAt` から評価した値が、ステップ `from` 以降で元の評価値と一致する |
| 生成済みの2bar | `locate` が、`cutTime` の位置ごとに正しい2bar とステップを返し、`pairs` が予約済みの列の後ろをすべて含む。一時停止を挟んだアンサンブルの呼び出し回数と、取り出した2bar の列が、一時停止しない場合と一致する |
| ソロ | `audibleChannels` を、ソロとミュートの組み合わせで表と照合する |
| クエリ文字列 | `seedFromQuery` が、`?seed=0`、`?seed=4294967295`、`?seed=4294967296`、`?seed=-1`、`?seed=abc`、`?seed=`、指定なしで期待どおり。初期シードの順（クエリ、設定ファイル、乱数）を `initialParams` で確かめる |
| 設定ファイルなし | `decodeConfig({})` の値が `DEFAULT_CONFIG` と一致し、警告がない。既存のテストは `DEFAULT_GENERATION_TUNING` と `DEFAULT_SOUND_TUNING` で動かす |
| 一部のキー | キーを1つだけ書いた入力で、そのキーだけが変わる（全キーについて表駆動で確かめる） |
| 不正な値 | キーごとに、型違い・範囲外で既定値と警告。関係の組ごとに、崩れた入力で組ごと既定値と警告。知らないキーで警告。`parseConfigText` に壊れた JSON を渡して例外にならない |
| 例のファイル | `config.example.json` を `decodeConfig` に通した値が `DEFAULT_CONFIG` と一致し、警告がない。`DEFAULT_CONFIG` のどのキーも例のファイルにある |
| 設定ファイルと再現性 | 同じ `GenerationTuning` で2回生成した `events` が一致する。`borrowChance` を 0 と 1 にしたシミュレーションで、借用和音の数が 0 と、iv・v の位置すべてになる |
| 読み込み | `loadConfig` を、`fetch` を差し替えて、表の5つの状況で確かめる |
| 5ms 以内 | アンサンブルの `next` の平均時間（色付けを含む） |
| 共有する URL | `shareUrl` に、クエリ文字列・フラグメント・パスのある URL と、シードあり・なしを渡す。結果を `seedFromQuery` で読むと、渡したシードか `undefined` に戻る |
| メディア操作 | `toggleCommand` と `mediaCommand` を、操作と状態の表と照合する。`silentWav` の長さと、ヘッダーのサンプルレート、データがすべて無音（128）であること |

試聴・UI の確認・長時間動作の基準は、`npm run dev` で開いた画面で確かめます。狭い画面の確認は、ブラウザの開発者ツールで幅 320px と 375px にして行います。メディア操作は、ページのスクリーンショットでは確かめられないので、実機の OS の表示で確かめます。
