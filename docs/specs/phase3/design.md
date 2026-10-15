# フェーズ3設計書

[フェーズ3要件定義書](./requirements.md) を実装するための設計です。[MVP設計書](../mvp/design.md)、[フェーズ1設計書](../phase1/design.md)、[フェーズ2設計書](../phase2/design.md) の方針（brand 型、判別共用体、乱数の引き方、ラッチ、アンサンブル）はそのまま引き継ぎ、変わる部分だけを書きます。

## モジュール構成と依存方向

```
ui ──▶ engine ──▶ generators/ensemble ──▶ structure ──▶ random
 │        │             │
 │        │             ├──▶ generators/drums, sub, reese, stab, pad
 │        │             ├──▶ generators/arrange   （鳴らすパートの選別と溜め）
 │        │             └──▶ generators/fx        （FX のイベント）
 │        └──▶ engine/ducking, engine/clip, engine/automation（Tone.js に依存しない）
 └──▶ params ──▶ params/mixer
tools/simulate ──▶ generators/ensemble          （Tone.js に依存しない）
```

| モジュール | 責務 | Tone.js 依存 |
| --- | --- | --- |
| `src/structure/arrangement.ts` | サイクルのレイアウトとドロップの入り方、8bar ごとのシーン、シーンのエネルギー、シーンごとに鳴らすパート、シーンの境界の判定 | なし |
| `src/structure/key.ts` | 初期キーから五度圏を何歩進んだかを表す型と、1歩動かす関数、そこからキーを求める関数 | なし |
| `src/structure/harmony.ts` | 主進行の選択をサイクル単位に、転換進行の選択を32bar 単位に分ける。サイクルの頭での移調を決める | なし |
| `src/structure/conductor.ts` | サイクルを数え、`Context` にサイクル・シーン・次のシーンを加え、キーと音色をサイクルごとに求める | なし |
| `src/structure/timbre.ts` | パートごとの音色の名前の表と、サイクルの頭での音色の選択 | なし |
| `src/generators/line.ts` | 型とモチーフのシードを A 系はサイクルから、B は32bar から派生させる | なし |
| `src/generators/drums/*` | 強い変異のタイミング、シーンの境界に応じたフィルの種類と有無 | なし |
| `src/generators/arrange.ts` | 生成したイベントから、シーンで鳴らすパートだけを残し、ドロップの入り方に従って溜めを空ける | なし |
| `src/generators/fx/index.ts` | 2bar ごとの FX のイベント | なし |
| `src/generators/ensemble.ts` | 生成 → 選別 → FX の順に2bar を作る | なし |
| `src/engine/automation.ts` | FX のイベントから、パラメーターごとのオートメーションの点列を求める | なし |
| `src/engine/patches.ts` | 音色の名前ごとのシンセの設定（波形、エンベロープ、フィルター、音量の補正）と、その制約の定数 | なし |
| `src/engine/audio.ts` | FX の音源とチャンネル、スイープ用フィルター、スロー用センド、パッドのゲート。リース・スタブ・パッドは音色ごとにシンセを1台ずつ持つ | あり |
| `src/engine/transport.ts` | 鳴る側のイベントと FX を2bar ごとに予約する。ノートを `ctx.timbre` の音色のシンセに送る | あり |
| `src/ui/position.ts` | シーン名、サイクルのメーター、次のシーンまでの小節数、現在のキー | なし |
| `src/ui/panel.ts`、`src/params/store.ts` | キーのパラメーターを初期キー（`initialKey`）に改める | なし |

オートメーションの点列を Tone.js から切り離すのは、ダッキングと同じく、FX の値とタイミングを Node.js 上の単体テストで検証するためです。音色の表（`engine/patches.ts`）を Tone.js から切り離すのも、同じく制約を Node.js 上で検証するためです。

## 型

| 型 | 中身 | 不変条件 |
| --- | --- | --- |
| `CycleIndex` | number | 再生開始からのサイクルの数（0 始まり） |
| `SectionInCycle` | number | サイクル内の8bar の番号（0 始まり）。サイクルの長さ未満 |
| `LeadSections` | `2 \| 3` | イントロ・ブレイクダウンの8bar の数 |
| `DropPhrases` | `1 \| 2` | ドロップの32bar の数 |
| `CycleLayout` | `{ intro, breakdown, firstDrop, secondDrop, leadIns }` | サイクルの長さは `32 × (2 + firstDrop + secondDrop)` bar から求め、別に持たない。`leadIns` の2つは異なる |
| `DropOrdinal` | `'first' \| 'second'` | サイクル内のドロップ1・ドロップ2 |
| `DropLeadIn` | `'silence' \| 'pickup' \| 'padHold' \| 'straight'` | ドロップの入り方。ビルドの `SceneRole` だけが持つ |
| `GapLeadIn` | `Exclude<DropLeadIn, 'straight'>` | 溜めのある入り方 |
| `Scene` | `'intro' \| 'build' \| 'drop' \| 'breakdown'` | |
| `SceneRole` | シーンごとの判別共用体（下記） | 長さを超える位置を表現できない |
| `FxEvent` | FX の判別共用体（下記） | |
| `FifthsFromInitial` | number | 初期キーから五度圏を属調の向きに何歩進んだか。0〜11 の整数で、12歩で 0 に戻る |
| `FifthStep` | `-1 \| 1` | 1回の移調の向き。下属調 −1、属調 1。2歩以上の移調を表現できない |
| `ReeseTimbre`・`StabTimbre`・`PadTimbre` | 音色の名前の共用体 | 表にない音色を表現できない |
| `CycleTimbre` | `{ reese, stab, pad }` | サイクルの途中では変わらない |
| `ReesePatch`・`ChordPatch` | シンセの設定（下記） | 重ねるオシレーターの数の上限を型で表す |

```ts
type LeadPosition  = { sections: 2; index: 0 | 1 } | { sections: 3; index: 0 | 1 | 2 };
type BuildPosition = { sections: 1; index: 0 } | { sections: 2; index: 0 | 1 };
type DropPosition  = { phrases: 1; phrase: 0 } | { phrases: 2; phrase: 0 | 1 };

type SceneRole =
  | ({ scene: 'intro' } & LeadPosition)
  | ({ scene: 'build'; leadIn: DropLeadIn } & BuildPosition)
  | ({ scene: 'drop'; drop: DropOrdinal } & DropPosition)
  | ({ scene: 'breakdown' } & LeadPosition);
```

入り方をビルドの `SceneRole` に持たせるのは、ビルドの全2bar がそれを読む（ライザーとハイパスの進み具合の分母が入り方で変わる）一方、ほかのシーンには意味がないためです。`Context` に入り方の欄を足すと、ビルド以外でも値を持ててしまいます。

### `Context` に加えるもの

```ts
type Context = PairRole & SectionHarmony & {
  // フェーズ2までのもの …
  readonly cycle: CycleIndex;
  readonly layout: CycleLayout;
  readonly sectionInCycle: SectionInCycle;
  readonly sceneRole: SceneRole;
  /** 次の8bar のシーン。サイクルの最後の8bar では次のサイクルのイントロ */
  readonly nextScene: Scene;
  readonly seeds: Seeds & { readonly cycle: Seed };
  /** そのサイクルのキー。フェーズ2までのセッション固定のキーを置き換える */
  readonly key: Key;
  /** そのサイクルの音色 */
  readonly timbre: CycleTimbre;
};
```

`key` は名前も型もフェーズ2のままにし、意味だけを「そのサイクルのキー」に改めます。音程のある生成器と位置表示はもともと `ctx.key` だけを読んでいるので、変えずに移調に追従します。

`sceneRole` と `sectionRole` は、どちらもコンダクターだけが同じレイアウトから作ります。`nextScene` を持たせるのは、シーンの境界のフィル・溜め・リバーブスローが「この8bar の次が何か」で決まるのに、`Context` は2bar ごとに独立して作られ、次の `Context` を参照できないためです。

## アレンジ（`structure/arrangement.ts`）

### レイアウトとシーンの列

`drawLayout(cycleSeed)` が `hash(cycleSeed, TAG.layout)` から3つの float を引きます。

| 乱数 | 使い方 |
| --- | --- |
| 1つ目 | 0.5 未満ならイントロ 3（24bar）、それ以外は 2（16bar） |
| 2つ目 | 0.5 未満ならブレイクダウン 3、それ以外は 2 |
| 3つ目 | ドロップの延長。`[1/3, 1/6, 1/6, 1/3]` の重みで、なし・ドロップ1・ドロップ2・両方 |

続けて `drawLayout` は、`hash(cycleSeed, TAG.dropLeadIn)`（`TAG.dropLeadIn = 23`）から2つの整数を引き、`leadIns` を決めます。レイアウトの乱数とシードを分けるのは、レイアウトの3つの値の引き方を変えないためです。

```ts
const DROP_LEAD_INS = ['silence', 'pickup', 'padHold', 'straight'] as const;
```

| 乱数 | 使い方 |
| --- | --- |
| 1つ目 | `int(4)` で、ドロップ1の入り方を `DROP_LEAD_INS` から選ぶ |
| 2つ目 | `int(3)` で、ドロップ2の入り方を、ドロップ1の入り方を除いた残りから選ぶ |

入り方をレイアウトに含めるのは、どちらもサイクルの頭で決まってサイクルの途中で変わらず、`cycleScenes` が両方からシーンの列を作るためです。

`cycleScenes(layout)` は、サイクルの8bar ごとの `SceneRole` を並べた配列を返します。イントロの後のビルドには `leadIns.first`、ブレイクダウンの後のビルドには `leadIns.second` を入れます。コンダクターはサイクルの頭でこれを作って保持し、`sectionInCycle` 番目を `Context` に入れます。

### エネルギー

`sceneEnergy(role, sectionIn32, depth)` は `1 − depth × (1 − カーブの値)` を返します。カーブの値は要件の表どおりです。

| シーン | カーブの値 |
| --- | --- |
| イントロ | 0.5 |
| ビルド | 最後の8bar は 0.75、16bar のビルドの1つ目は 0.6 |
| ドロップ | フェーズ1の `ENERGY_CURVE[sectionIn32]` |
| ブレイクダウン | 0.4 |

フェーズ1の `sectionEnergy` は、ドロップのカーブとして `sceneEnergy` の中から呼びます。

### 鳴らすパート

`Voice = Part | 'sub' | 'reese' | 'stab' | 'pad'` として、`plays(role, voice)` が要件の表を返します。イントロの `index: 0` では、サブベースとゴーストを鳴らしません。

ドラムの打音は `playsHit(role, hit)` で判定します。`plays` に加えて、イントロの `index: 0` では奇数ステップ（16分の裏）のハイハットを鳴らしません。

### 境界の判定

いずれも `Context` だけから決まる関数です。

| 関数 | 真になる2bar |
| --- | --- |
| `leadsIntoDrop(ctx)` | ビルドの最後の2bar（`nextScene` がドロップで、8bar の終わり） |
| `leadsIntoBreakdown(ctx)` | ドロップの最後の2bar（`nextScene` がブレイクダウンで、8bar の終わり） |
| `changesScene(ctx)` | 8bar の終わりで、`nextScene` が今のシーンと異なる |
| `opensDrop(ctx)` | ビルドの後のドロップの最初の2bar（ドロップの `phrase` が 0 で、32bar の頭） |
| `refreshesReference(role)` | イントロ、または「ドロップ1の最初の32bar」以外のドロップ。32bar の頭でだけ使う |

`dropLeadIn(ctx)` は、`leadsIntoDrop(ctx)` が真の2bar でそのビルドの入り方を、それ以外で `null` を返します。

溜めの開始位置 `GAP_START`（ステップ28）もここに置きます。入り方ごとの扱いは次の関数で引きます。

| 関数 | 中身 |
| --- | --- |
| `hasGap(leadIn): leadIn is GapLeadIn` | `straight` 以外で真 |
| `silencesGap(leadIn: GapLeadIn)` | 溜めでパッドとライザーも止めるか。`silence` と `pickup` で真、`padHold` で偽 |

## 主題の共有

### 進行（`structure/harmony.ts`）

`phraseProgressions` を2つに分けます。

- `cycleMainProgression(previousMain, cycleSeed, m32)`: `hash(cycleSeed, TAG.progression)` から「変化の判定」「主進行」の2つを引く。選び方はフェーズ2と同じ
- `phraseTransitionProgression(phraseSeed)`: `hash(phraseSeed, TAG.progression)` から3つ引き、3つ目で転換進行を選ぶ。最初の2つは引くだけで使わない

コンダクターは主進行をサイクルの頭（`m32` をラッチした後）でだけ更新し、転換進行は32bar の頭で選びます。

### 移調（`structure/key.ts`、`structure/harmony.ts`）

- `keyAt(initialKey, fifths)`: 初期キーの主音を `7 × fifths` 半音（mod 12）動かしたキーを返す。1歩進むごとに属調になる
- `stepFifths(fifths, step)`: `fifths + step` を 0〜11 に折り返して返す
- `cycleModulation(previous, cycleSeed, m32)`: `hash(cycleSeed, TAG.modulation)` から「移調の判定」「移調の向き」の2つを引く。判定が `m32 × MODULATION_SHARE`（0.5）未満なら、向きが 0.5 未満で `stepFifths(previous, 1)`、それ以外で `stepFifths(previous, -1)` を返す。判定が外れたら `previous` を返す

| 乱数 | 使い方 |
| --- | --- |
| 1つ目 | `m32 × 0.5` 未満なら移調する |
| 2つ目 | 移調の向き。0.5 未満なら属調、それ以外は下属調。移調しないときは引いて捨てる |

コンダクターは `CycleState` に `fifths: FifthsFromInitial` を持ち、`nextCycle` で、最初のサイクルは 0、以降は `cycleModulation(previous.fifths, seed, m32)` とします。`Context` の `key` は `keyAt(initialKey, cycle.fifths)` です。

`fifths` は初期キーを知らずに乱数と `m32` だけから決まるので、同じシードなら初期キーを変えてもすべてのサイクルで同じ幅だけ移調します（F-30 の維持）。初期キーは `keyAt` でだけ使い、どのシードにも混ぜません。

### 型とモチーフ（`generators/line.ts`）

`stylePlan(cycleSeed, phraseSeed, tag, styles)` に改めます。

- A 用: `createRng(hash(cycleSeed, tag))` から `int(styles.length)` を1回引く
- B 用: `createRng(hash(phraseSeed, tag))` から、A 用を除いた残りで `int(残りの数)` を1回引く

`motifSeed(ctx, tag)` は、A 系では `hash(seeds.cycle, tag, REL[relation])`、B では `hash(seeds.section, tag, REL[relation])` を返します。

### ドラムの基準パターン

`nextReference` で強い変異をかける条件を、「32bar の頭」から「32bar の頭で `refreshesReference(ctx.sceneRole)` が真」に改めます。最初のサイクルのイントロの頭は、これまでどおり初期生成です。

## 音色

### 選択（`structure/timbre.ts`）

```ts
const REESE_TIMBRES = ['classic', 'wide', 'hollow', 'growl'] as const;
const STAB_TIMBRES = ['square', 'pluck', 'bell'] as const;
const PAD_TIMBRES = ['saw', 'warm', 'glass'] as const;
type ReeseTimbre = (typeof REESE_TIMBRES)[number];
type StabTimbre = (typeof STAB_TIMBRES)[number];
type PadTimbre = (typeof PAD_TIMBRES)[number];
interface CycleTimbre { readonly reese: ReeseTimbre; readonly stab: StabTimbre; readonly pad: PadTimbre }

function cycleTimbre(previous: CycleTimbre | undefined, cycleSeed: Seed, m32: UnitInterval): CycleTimbre;
```

`cycleTimbre` は `hash(cycleSeed, TAG.timbre)`（`TAG.timbre = 22`）から、リース・スタブ・パッドの順に、パートごとに2つの float を引きます。

| 乱数 | 使い方 |
| --- | --- |
| 1つ目 | 替えるかの判定。`previous` があり、`m32` 未満なら替える。最初のサイクルでは引いて捨てる |
| 2つ目 | 音色。最初のサイクルは表全体から、替えるときは `previous` の音色を除いた残りから `floor(x × 候補の数)` 番目を選ぶ。替えないときは引いて捨てる |

コンダクターは `CycleState` に `timbre: CycleTimbre` を持ち、`nextCycle` で `cycleTimbre(previous?.timbre, seed, m32)` とします（`m32` は主進行・移調と同じく、32bar の頭でラッチした値）。音色の名前の表を `structure` に置き、シンセの中身を `engine` に置くのは、生成側が Tone.js の設定を知らずに済むようにするためです。

### 音色の表（`engine/patches.ts`）

各表の先頭の音色（`classic`・`square`・`saw`）は、フェーズ2の音色をそのまま移したものです。`createVoices` に直書きしていた設定はなくし、シンセはすべてこの表から作ります。表と生成コードを二重に持つと、制約のテストが実際に鳴る音を検証しなくなるためです。

```ts
// Seconds は engine/ducking.ts のものを使う
interface Envelope { attack: Seconds; decay: Seconds; sustain: UnitInterval; release: Seconds }

// fat 系と FM 系を判別共用体にし、重ねる数と FM の比を同時に持てないようにする
type FatOscillator<C extends number> = { type: 'fatsawtooth' | 'fatsquare' | 'fattriangle'; count: C; spread: number };
type FmOscillator = { type: 'fmsine' | 'fmsawtooth'; harmonicity: number; modulationIndex: number };

// リースは1音ずつなので5つまで、和音を鳴らすスタブとパッドは1音あたり3つまで重ねる（N-12）
interface ReesePatch {
  oscillator: FatOscillator<2 | 3 | 4 | 5> | FmOscillator;
  envelope: Envelope;
  filterQ: number;
  filterEnvelope: Envelope & { baseFrequency: number; octaves: number };
  gainDb: number;
}
interface ChordPatch {
  oscillator: FatOscillator<2 | 3> | FmOscillator;
  envelope: Envelope;
  gainDb: number;
}

const REESE_PATCHES: Readonly<Record<ReeseTimbre, ReesePatch>>;
const STAB_PATCHES: Readonly<Record<StabTimbre, ChordPatch>>;
const PAD_PATCHES: Readonly<Record<PadTimbre, ChordPatch>>;
```

`Record<名前, 設定>` にするので、名前の表に音色を足して設定を書き忘れると型エラーになります。

**リースベース**（`Tone.MonoSynth`、ローパスはシンセ内。後段のハイパス 120 Hz は共通）

| 名前 | オシレーター | フィルター Q | フィルターのエンベロープ（A / D / S / R、基準、オクターブ） | アンプ（A / D / S / R） | 補正 | ねらい |
| --- | --- | --- | --- | --- | --- | --- |
| `classic` | fatsawtooth、3本、25 セント | 2 | 0.01 / 0.25 / 0.3 / 0.1、200 Hz、3 | 0.005 / 0.2 / 0.8 / 0.05 | 0 dB | フェーズ2の音。うなりのある標準的なリース |
| `wide` | fatsawtooth、5本、40 セント | 1 | 0.02 / 0.4 / 0.5 / 0.1、300 Hz、2.5 | 0.005 / 0.3 / 0.9 / 0.05 | −2 dB | 本数とデチューンを増やした、広く滑らかなリース |
| `hollow` | fatsquare、3本、20 セント | 4 | 0.01 / 0.2 / 0.2 / 0.1、250 Hz、2 | 0.005 / 0.15 / 0.8 / 0.05 | −5 dB | 矩形波の奇数倍音とレゾナンスで、鼻にかかったニューロ寄りの音 |
| `growl` | fmsawtooth、比 1、変調指数 2 | 6 | 0.005 / 0.35 / 0.1 / 0.1、150 Hz、4 | 0.005 / 0.25 / 0.8 / 0.05 | −3.5 dB | FM の歪んだ倍音と、深いフィルターのエンベロープで唸る音 |

**スタブ**（`Tone.PolySynth` の `Tone.Synth`、後段のローパス 3 kHz は共通）

| 名前 | オシレーター | アンプ（A / D / S / R） | 補正 | ねらい |
| --- | --- | --- | --- | --- |
| `square` | fatsquare、2本、15 セント | 0.003 / 0.12 / 0.15 / 0.15 | 0 dB | フェーズ2の音 |
| `pluck` | fatsawtooth、2本、10 セント | 0.002 / 0.2 / 0 / 0.1 | 0 dB | サステインのない、弾いたような短い音 |
| `bell` | fmsine、比 3、変調指数 4 | 0.002 / 0.25 / 0.05 / 0.15 | −11.5 dB | FM の高い倍音で、鐘のように明るく抜ける音 |

**パッド**（`Tone.PolySynth` の `Tone.Synth`、後段のローパス 1.5 kHz は共通）

| 名前 | オシレーター | アンプ（A / D / S / R） | 補正 | ねらい |
| --- | --- | --- | --- | --- |
| `saw` | fatsawtooth、3本、30 セント | 0.4 / 0.6 / 0.7 / 1.2 | 0 dB | フェーズ2の音 |
| `warm` | fattriangle、3本、20 セント | 0.5 / 0.8 / 0.8 / 1.2 | −2 dB | 倍音の少ない三角波で、丸く柔らかい音 |
| `glass` | fmsine、比 2、変調指数 1.5 | 0.6 / 1.0 / 0.6 / 1.0 | −3.5 dB | FM の澄んだ倍音で、ガラスのように薄く光る音 |

- **FM の変調波**: FM 系の変調波は正弦波にします。Tone.js の既定は矩形波で、どの FM の音色も荒く濁るためです
- **FM の比**: リースとパッドの比は1以上の整数にします。1未満や非整数にすると、側波帯が基音の下や倍音列の外に出て、音高が1オクターブ下に聞こえたり、和音が濁ったりするためです。リースの音高がサブベースの帯域に聞こえると、ハイパスで分けた意味がなくなります。スタブの `bell` も、和音の音程感を保つため整数の比にします
- **音量の補正**: 補正は 0 dB 以下だけにし、パートの中で最も大きく聞こえる音色を 0 dB の基準とします。今のトリム（`SOURCE_TRIM_DB`）とリミッターの余裕は、フェーズ2の音色で測ったものです。補正をプラスにすると、クリップしない保証（N-10・N-13）が崩れるためです。フェーズ2の音色より小さく聞こえる音色は 0 dB に留めます。表の補正は、パートの共通のフィルター（リースのハイパス 120 Hz、スタブのローパス 3 kHz、パッドのローパス 1.5 kHz）を通してオフラインで鳴らした実効値を、先頭の音色に揃えたもので、試聴で確定します。Tone.js は fat 系のオシレーターを重ねる数で割って小さくし、FM 系はそのままの振幅で鳴らすので、FM の音色ほど大きく下げています。`pluck` は補正ではなくディケイを長くして、`square` との差を 1 dB 以内に縮めています補正はシンセ自身の `volume` にかけ、ミキサーのトリムとフェーダーには触れません
- 音色の数（4・3・3）と中身は初期案です。数を変えても `Record` の型と選択の関数はそのまま使えます

**制約の定数**: 次の定数を `patches.ts` に置き、全音色がこれを満たすことを単体テストで確かめます。

| 制約 | 値 | 根拠 |
| --- | --- | --- |
| パッドのアタック | `GATE_REOPEN_SECONDS`（0.4 秒）以上 | 溜めの後、パッドのゲートは 0.4 秒かけて開く。アタックがそれより短いと、ドロップの頭の和音の立ち上がりがゲートのランプで鈍る。`engine/automation.ts` の `GATE_REOPEN_SECONDS` を export して参照する |
| パッドのリリース | 1.2 秒以下 | 2bar ごとに鳴らし直す4音の和音が、前の和音のリリースと2つ重なる見積もりで、シンセ1台の `maxPolyphony`（12）を決めている |
| スタブのリリース | 0.15 秒以下 | 2ステップ間隔のスタブが3〜4つ重なる見積もりで、シンセ1台の `maxPolyphony`（12）を決めている |
| 重ねるオシレーターの数 | リース5本、スタブ・パッド3本まで | 型（`FatOscillator<C>`）で表す。FM 系は1音あたりオシレーター2つ |

発音数の見積もりはシンセ1台ごとのものです。音色ごとにシンセを分けるので、サイクルをまたいで鳴る前の音色の余韻が、新しい音色のシンセの発音数を使うことはありません。

### 切り替え（`engine/audio.ts`、`engine/transport.ts`）

リース・スタブ・パッドは、音色ごとにシンセを1台ずつ持ちます（リース4台、スタブ3台、パッド3台）。同じパートのシンセは、どれもそのパートの入力（リースのハイパス、スタブとパッドのローパス）に並べてつなぎます。

```ts
interface Voices {
  readonly sub: Tone.Synth;
  readonly reese: Readonly<Record<ReeseTimbre, Tone.MonoSynth>>;
  readonly stab: Readonly<Record<StabTimbre, Tone.PolySynth>>;
  readonly pad: Readonly<Record<PadTimbre, Tone.PolySynth>>;
  // インパクトはフェーズ3のまま
}

interface Instruments {
  reese(timbre: ReeseTimbre, pitch: Pitch, time: number, seconds: number, velocity: Velocity): void;
  chord<P extends 'stab' | 'pad'>(part: P, timbre: CycleTimbre[P], voicing: Voicing, time: number, seconds: number, velocity: Velocity): void;
  // ほかはフェーズ3のまま
}
```

トランスポートは、2bar のノートを予約するときに `ctx.timbre` の音色を渡します。切り替えは「次のノートをどのシンセに送るか」が変わるだけなので、音色を切り替えるための予約はありません。サイクルの最初の2bar のノートから新しい音色のシンセで鳴り、前のサイクルのノートは前の音色のシンセでリリースまで鳴りきります（F-72）。イントロのローパス・ダッキング・パッドのゲート・チャンネルはパートの入力より後ろにあるので、どの音色のシンセにも同じようにかかります（F-73）。

**採らなかった方式**

- **鳴っているシンセの設定を書き換える**（`set()`）: `Tone.PolySynth` の `set()` はリリース中の声にもかかるので、前のサイクルの余韻の音色が途中で変わる。オシレーターの種類を替えるとオシレーターが作り直され、クリックも出る
- **シンセを2台持って交互に使う**: 切り替えのたびに、使っていない側を再生中に作り直すことになり、どちらを捨てるかの管理も要る。全音色を持っても合計10台なので、再生中にノードを作らず、送り先を選ぶだけで済む方を採る

鳴っていないシンセはオシレーターを止めているので、処理の負荷はほとんど増えません。増えるのはノードの数とメモリだけです。

## シーンの境界のフィル（`generators/drums/fill.ts`）

フィルの関数に、境界からの指示（キュー）を渡します。乱数はキューにかかわらず同じ数だけ同じ順に引きます。

```ts
type SectionFillCue = 'chance' | 'certain' | 'drumsReturn';
type PhraseFillCue  = 'free' | 'intoDrop';
function fill(seed, intensity, cue: SectionFillCue): Fill | null;
function phraseFill(seed, intensity, cue: PhraseFillCue): Fill | null;
```

| キュー | 鳴るかどうか | 種類 |
| --- | --- | --- |
| `chance` | 乱数が `intensity` 未満のとき | 従来どおり6種類から |
| `certain` | `intensity > 0` のとき | 従来どおり6種類から |
| `drumsReturn` | `intensity > 0` のとき | スネアロール（種類の乱数は引いて捨てる） |
| `free` | `intensity > 0` のとき | 従来どおり5種類から |
| `intoDrop` | `intensity > 0` のとき | スネアロール・加速ロール・後半ロールから。種類の乱数1つを `int(3)` に使う |

ドラム生成器は、8bar の終わりで `changesScene` が偽なら `chance`、真で今のシーンがブレイクダウンなら `drumsReturn`、それ以外は `certain` を渡します。32bar の終わりでは `leadsIntoDrop` なら `intoDrop`、それ以外は `free` を渡します。

## 選別と溜め（`generators/arrange.ts`）

生成した2bar から、実際に鳴るイベントを作ります。生成側の結果（`ctx.drums`、各パートのライン）は書き換えません。シミュレーションで「生成されたもの」と「鳴ったもの」を両方数えられるようにし、フェーズ2までのテストが見ている生成側の性質をそのまま保つためです。

1. ドラムは `playsHit(sceneRole, hit)`、音程のあるパートは `plays(sceneRole, voice)` が偽のイベントを取り除く。ただしブレイクダウンの最後の2bar（`changesScene` が真）では、フィルの層のスネアを残す
2. `dropLeadIn(ctx)` が溜めのある入り方なら、ステップ28以降に始まるドラムの打音を取り除き、音程のあるパートのノートを `step + length ≤ 28` に切り詰める。切り詰めて長さが0になるノートは取り除く。ただし `padHold` ではパッドを切り詰めない
3. `pickup` なら、ステップ30 にスネアの打音（ベロシティ 0.9、層は `fill`）を1つ加える

| 入り方 | ドラム | パッド | ほかの音程のあるパート | 加える打音 |
| --- | --- | --- | --- | --- |
| `silence` | 28 未満だけ | 28 で切る | 28 で切る | なし |
| `pickup` | 28 未満だけ | 28 で切る | 28 で切る | ステップ30 のスネア |
| `padHold` | 28 未満だけ | そのまま | 28 で切る | なし |
| `straight` | そのまま | そのまま | そのまま | なし |

ビルドで鳴る音程のあるパートはスタブとパッドだけなので、`padHold` で切るのは実質的にスタブです。ピックアップのスネアをドラム生成器のフィルに入れず、ここで加えるのは、フィル強度が0（フィルなし）でもピックアップを残すためです。層を `fill` にするのは、グリッドとシミュレーションで、基準パターンや装飾の打音と区別できるようにするためです。

溜めをフィルに含めないのは、フィル強度が0でも溜めを残す（要件のパラメーター仕様）ためです。溜めを「4ステップのドロップアウト」として作ると、強度0で「大きなフィルが入らない」ことと食い違います。

## FX のイベント（`generators/fx/index.ts`）

`fxEvents(ctx)` は乱数を使わず、`Context` とドラムの確定結果だけから決めます。

```ts
interface FxSpan { from: Step; to: StepEnd; startProgress: UnitInterval; endProgress: UnitInterval }
type StepEnd = Brand<number, 'StepEnd'>;   // 1〜32。区間の終わり（その位置は含まない）

type FxEvent =
  | { fx: 'riser'; span: FxSpan }
  | { fx: 'sweep'; filter: 'lowpass' | 'highpass'; span: FxSpan }
  | { fx: 'impact'; step: Step }
  | { fx: 'throw'; step: Step }
  | { fx: 'filterReset'; step: Step }
  | { fx: 'gap'; from: Step; pad: 'cut' | 'held' };   // その2bar の終わりまで溜め
```

| FX | 2bar | 内容 |
| --- | --- | --- |
| ライザー | ビルドの各2bar | ビルドの頭から止まる位置までの進み具合。止まる位置は、`silencesGap` が真の入り方では溜めの頭（最後の2bar のステップ28。最後の2bar は `to = 28`）、それ以外ではドロップの頭（最後の2bar は `to = 32`） |
| ハイパスのスイープ | ビルドの各2bar | ライザーと同じ区間と進み具合 |
| ローパスのスイープ | イントロの最後の8bar より前の各2bar | イントロの頭から、イントロの最後の8bar の頭までの進み具合 |
| インパクト・フィルターのリセット | `opensDrop` の2bar | ステップ0 |
| 溜め | `dropLeadIn` が溜めのある入り方の2bar | ステップ28 から。`pad` は `silencesGap` が真なら `cut`、`padHold` なら `held` |
| リバーブスロー | `leadsIntoDrop` か `leadsIntoBreakdown` の2bar | 鳴る側のドラムのうち最後のスネアの位置。`leadsIntoDrop` の2bar では、入り方によらずステップ28より前に限る（ピックアップや溜めなしのロールの終わりの残響を、ドロップの頭に被せないため） |

進み具合は `(シーン内の通しステップ) / (区間全体のステップ数)` です。シーン内の位置は `sceneRole` の `index`、`pairIn8`、ステップから求めます。ライザーとハイパスの区間全体は、ビルドの頭からビルドの `leadIn` で決まる止まる位置までです。

## アンサンブル

```ts
interface EnsemblePair {
  readonly ctx: ContextWithDrums;    // 生成側（選別の前）
  readonly drumLayers: PairLayers;
  readonly sub: SubLine; readonly reese: ReeseLine; readonly stab: StabLine; readonly pad: PadChord;
  /** 実際に鳴るイベント（選別と溜めの後） */
  readonly events: readonly NoteEvent[];
  readonly fx: readonly FxEvent[];
}
```

`events` の意味を「生成したすべて」から「鳴るもの」に改めます。トランスポートはこれまでどおり `events` を予約し、ダッキングのキックも `events` から取ります（`ctx.drums.hits` から取ると、ブレイクダウンでもダッキングしてしまうため）。

## オートメーション（`engine/automation.ts`）

FX のイベントと2bar の開始時刻から、パラメーターごとの点列を求めます。

```ts
type AutomationTarget = 'riserGain' | 'riserFrequency' | 'highpass' | 'lowpass' | 'throwSend' | 'padGate';
interface AutomationPoint { target: AutomationTarget; time: Seconds; value: number; ramp: 'set' | 'linear' | 'exponential' }
function fxAutomation(events: readonly FxEvent[], pairStart: Seconds, stepSeconds: Seconds): readonly AutomationPoint[];
```

| FX | 点 |
| --- | --- |
| ライザー | 区間の頭で開始時の値に `set`、終わりで終了時の値へ。音量は `linear`（0 に向けた指数ランプは使えないため）、周波数は `exponential`。`endProgress` が1なら、10 ms 後に音量を0へ `linear` |
| スイープ | 区間の頭で開始時の周波数に `set`、終わりへ `exponential` |
| フィルターのリセット | ハイパスとローパスを開いた周波数に `set` |
| リバーブスロー | 打音の 5 ms 前に送り量を `set`、120 ms 後に0へ `set` |
| 溜め | `pad` が `cut` のとき、開始で1に `set`、30 ms でパッドのゲートを0へ `linear`。2bar の終わりで0に `set` し、0.4 秒（パッドのアタック）で1へ `linear`。すぐに1に戻すと、溜めで切ったパッドのリリースがドロップの頭で聞こえ直すため。`held` のときは点を作らない |

インパクトは点ではなく発音なので、エンジンが直接鳴らします。

| 定数 | 値 |
| --- | --- |
| ライザーの音量 | 進み具合 `p` に対して `0.5 × p²` |
| ライザーの中心周波数 | 300 Hz → 8 kHz（対数で補間） |
| ハイパス | 開: 20 Hz、閉: 600 Hz |
| ローパス | 閉: 400 Hz、開: 18 kHz |
| リバーブスローの送り量 | 1.0（スネアのトリムの後から） |

周波数を対数で補間するのは、耳には周波数の比が一定の速さで変わるほうが一定の速さに聞こえるためです。`exponentialRampToValueAtTime` は2点の間を対数で補間するので、そのまま使えます。

## 再生エンジン

### 信号の経路

```
sub   ─▶ Distortion ─▶ LPF(100) ─▶ [イントロ LPF] ─▶ [ダッキング] ─▶ ch
reese（音色ごとに1台。classic, wide, hollow, growl）─▶ HPF(120) ─▶ [イントロ LPF] ─▶ [ダッキング] ─▶ ch
stab（音色ごとに1台。square, pluck, bell）─▶ LPF(3k) ─▶ [イントロ LPF] ─▶ ch
pad（音色ごとに1台。saw, warm, glass）─▶ LPF(1.5k) ─▶ [イントロ LPF] ─▶ [パッドのゲート] ─▶ [ダッキング] ─▶ ch
riser: Noise(white) ─▶ BPF ─▶ Gain ─▶ fx ch
impact: MembraneSynth + NoiseSynth ─▶ HPF(80) ─▶ fx ch
snare のトリム ─▶ [スロー用 Gain] ─▶ リバーブ
ミックスバス ─▶ [スイープ HPF] ─▶ マスターの Comp ─▶ Limiter ─▶ …
```

- イントロ用のローパスは音程のある4パートに1つずつ置き、同じ点列で動かします。チャンネルより前に置き、リバーブへの送りにもかけるためです。サブベースは自身のローパス（100 Hz）がイントロ用のローパスの範囲より下にあるので実質的には変わりませんが、要件どおり4パートに揃えます
- パッドのゲートはダッキングとは別の Gain にします。ダッキングの予約と同じパラメーターを取り合わないようにするためです
- ライザーのノイズは起動時に一度だけ鳴らし始め、音量0で待たせます。ビルドのたびに起動と停止を予約するより、予約の取り消しが音量のパラメーターだけで済むためです
- インパクトのシンセはボイスとして、再生のたびに作り直します

### インパクトの音色

| 要素 | 構成 |
| --- | --- |
| ブーム | `Tone.MembraneSynth`（`pitchDecay` 0.4 s、`octaves` 3）で G2 を鳴らし、約 98 Hz から下がる |
| バースト | `Tone.NoiseSynth`（ホワイト、ディケイ 1.2 s） |
| 共通 | 80 Hz のハイパスを通し、FX チャンネルのセンドでリバーブに送る |

ハイパスで 80 Hz 以下を切るのは、ドロップの頭でキックとサブベースに低域を重ねず、リミッターの手前で振幅が積み上がらないようにするためです（N-13）。

### 停止と再開

`silence()` と `open()` の両方で、次を行います。

- オートメーションの全ターゲットで予約を取り消し、初期値（ライザー 0、ハイパス 20 Hz、ローパス 18 kHz、スロー 0、パッドのゲート 1）に戻す
- インパクトのシンセは `open()` でボイスと一緒に作り直す
- `silence()` はリース・スタブ・パッドの全音色のシンセを解放し、`open()` は全音色のシンセを作り直す。前の再生で鳴っていた音色のシンセにも、予約済みのノードが残っているため

### 定数の既定値（ミキサー）

| チャンネル | パン | センド | トリム |
| --- | --- | --- | --- |
| FX | 0 | 30% | −12 dB |

FX の音量は 0 dB、ミュートはオフです。

音源のトリムは、サブベースだけ 0 dB から −6 dB に下げます。試聴でサブベースのフェーダーを −6 dB にしたときに、キックとリースベースとちょうど釣り合ったためです。トリムとフェーダーはどちらもマスターのコンプレッサーより前にあるので、フェーダー −6 dB と同じ音のまま、フェーダーを 0 dB から始められます。

## UI

- 小節位置の表示に、シーン名（イントロ・ビルド・ドロップ1・ドロップ2・ブレイクダウン）と「次のシーンまで N 小節」を加える
- 小節位置の表示のコード名の前に、現在のキー（「F マイナー」など）を出す。コード名だけでは移調に気づきにくいため
- パネルの「キー」を「初期キー」に改める。停止中にだけ変えられるのは変えない
- 8bar・32bar のメーターの下に、サイクルのメーターを置く。1マスを8bar とし、マスの数はサイクルの長さ（16・20・24）に合わせて作り直す。マスにシーンの色を付ける
- ミキサーに FX のチャンネルを加える
- ステップグリッドは鳴る側のイベントを表示する（選別で抜いたパートの行は空になる）

## シミュレーション

次の統計を追加します。CLI のオプション `--key` は `--initial-key` に改めます。

- サイクルの長さ（128・160・192bar）ごとの出現数、イントロとブレイクダウンの長さの組の出現数、ドロップの延長の出現数
- シーンごとの小節数、鳴る側のドラムの1小節あたりの打音数、音程のあるパートの2bar あたりのノート数
- FX の種類ごとの出現数
- シーンで鳴らさないパートの鳴る側のイベント数（0になるはず）
- 移調の回数と、初期キーから五度圏で何歩離れたキーか（−5〜+6。負は下属調の向き）ごとの小節数
- パートごとの、音色ごとのサイクル数と、音色が替わった回数
- ドロップ1・ドロップ2ごとの、入り方ごとの出現数

音度やコードトーンの判定（サブベースの音度の分布、コード外の音の数、反復率）は、セッションのキーではなく `ctx.key` で数えます。

32bar の役割ごとの密度（`densityBySection`）は、生成側の打音で数える従来の統計として残します。

## 受け入れ基準とテストの対応

| 受け入れ基準 | テスト |
| --- | --- |
| MVP〜フェーズ2の基準 | 既存のテストを維持する。フェーズ1の「B が最も疎で A'' が最も密」はシーンのエネルギーに置き換わるので、ドロップのエネルギーのテストに差し替える。MVP の「ドラムの層の後に音程のあるパート」は、選別の後のイベントとの比較に書き換える |
| シーンの並び | 8bar ごとの `sceneRole` を、`layout` から期待される並びと比べる。サイクルの長さ、ドロップの開始が32bar の頭、ビルドの次がドロップ |
| レイアウトの網羅 | 8192bar・複数シードで、イントロとブレイクダウンの長さ4通り、延長4通りが現れる |
| 入り方の網羅 | 8192bar・複数シードで、ドロップ1・ドロップ2のそれぞれに4つの入り方が現れ、どのサイクルでも `leadIns.first` と `leadIns.second` が異なる |
| 鳴らさないパート | 鳴る側のイベントを `plays` の表と照合する。ブレイクダウンの最後のフィルのスネアだけを除く |
| イントロの最初の8bar | すべてのイントロの `index: 0` で、サブベース・ゴースト・奇数ステップのハイハットが鳴る側にない。`index` が1以上ではサブベースが鳴る |
| エネルギー | ビルドで単調増加かつドロップの A 以下、ドロップはフェーズ1のカーブ、2周目以降のイントロは単調減少、`energyDepth = 0` で全て1 |
| 主進行 | サイクルの頭以外で主進行が替わらない。`m32 = 0` で替わらない |
| 移調 | `ctx.key` が変わるのはサイクルの頭だけ。最初のサイクルは初期キー。変わるときは前のキーとの差（半音、mod 12）が 5 か 7。`m32 = 0` で変わらない。8192bar・複数シードで、差 5 と 7 の移調がどちらも現れ、初期キーとの差が 0・5・7 以外のキーが現れる |
| 音階 | 音程のある全パートの音が `ctx.key` のナチュラルマイナーに含まれる（フェーズ1・2の音階のテストを `ctx.key` で数えるように改める） |
| 初期キーと移調 | 同じシードで初期キーだけを変えた2回の生成で、全サイクルの `ctx.key − initialKey` が一致する（フェーズ1・2の移調のテストがそのまま通る） |
| 音色の選択 | `ctx.timbre` の各パートが変わるのはサイクルの頭だけで、変わるときは前と異なる。`m32 = 0` で変わらない。8192bar・複数シードで各表の全音色が現れる。初期キーだけを変えた2回の生成で `ctx.timbre` が一致する |
| 音色の制約 | `PAD_PATCHES` の全音色のアタックが `GATE_REOPEN_SECONDS` 以上でリリースが 1.2 秒以下、`STAB_PATCHES` の全音色のリリースが 0.15 秒以下、全音色の補正が 0 dB 以下、リースとパッドの FM の比が1以上の整数 |
| ドロップ間の主題 | 同じサイクルのドロップの32bar の A 系で、進行と、大きなフィル区間より前のリース・スタブ・パッドのイベント列が一致 |
| B の型 | 転換の8bar の型がサイクルの A の型と異なる |
| 基準パターン | 基準が変わる2bar が、サイクルの頭か、ドロップ1の最初を除くドロップの32bar の頭 |
| 溜め | `leadsIntoDrop` の2bar で、大きなフィルがロール系か null（強度0）。`silence` では鳴る側の全イベントが28より前に終わり、`pickup` ではそれに加えてステップ30 のスネア1打だけがあり、`padHold` ではパッド以外が28より前に終わってパッドがある。`straight` では選別の前後でイベントが変わらない（シーンで鳴らさないパートを除く） |
| 必須フィル | `changesScene` の2bar で、`fillIntensity > 0` ならフィルがある |
| FX の位置 | インパクト、ライザー、スイープ、スロー、溜めの位置と進み具合を、上の表の条件と入り方に照らして照合する |
| 再現性 | 同じシードで2回生成した `events` と `fx` が一致する |
| オートメーション | `fxAutomation` の点列で、ライザーの音量が単調に増えて止まる位置で0になる、スイープが区間の端で期待値になる、`pad: 'cut'` の溜めでだけパッドのゲートが閉じて2bar の終わりで開く |
| 5ms 以内 | アンサンブルの `next` の平均時間（選別と FX を含む） |
