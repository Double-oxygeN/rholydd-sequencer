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
| `src/structure/arrangement.ts` | サイクルのレイアウト、8bar ごとのシーン、シーンのエネルギー、シーンごとに鳴らすパート、シーンの境界の判定 | なし |
| `src/structure/key.ts` | 初期キーから五度圏を何歩進んだかを表す型と、1歩動かす関数、そこからキーを求める関数 | なし |
| `src/structure/harmony.ts` | 主進行の選択をサイクル単位に、転換進行の選択を32bar 単位に分ける。サイクルの頭での移調を決める | なし |
| `src/structure/conductor.ts` | サイクルを数え、`Context` にサイクル・シーン・次のシーンを加え、キーをサイクルごとに求める | なし |
| `src/generators/line.ts` | 型とモチーフのシードを A 系はサイクルから、B は32bar から派生させる | なし |
| `src/generators/drums/*` | 強い変異のタイミング、シーンの境界に応じたフィルの種類と有無 | なし |
| `src/generators/arrange.ts` | 生成したイベントから、シーンで鳴らすパートだけを残し、溜めを空ける | なし |
| `src/generators/fx/index.ts` | 2bar ごとの FX のイベント | なし |
| `src/generators/ensemble.ts` | 生成 → 選別 → FX の順に2bar を作る | なし |
| `src/engine/automation.ts` | FX のイベントから、パラメーターごとのオートメーションの点列を求める | なし |
| `src/engine/audio.ts` | FX の音源とチャンネル、スイープ用フィルター、スロー用センド、パッドのゲート | あり |
| `src/engine/transport.ts` | 鳴る側のイベントと FX を2bar ごとに予約する | あり |
| `src/ui/position.ts` | シーン名、サイクルのメーター、次のシーンまでの小節数、現在のキー | なし |
| `src/ui/panel.ts`、`src/params/store.ts` | キーのパラメーターを初期キー（`initialKey`）に改める | なし |

オートメーションの点列を Tone.js から切り離すのは、ダッキングと同じく、FX の値とタイミングを Node.js 上の単体テストで検証するためです。

## 型

| 型 | 中身 | 不変条件 |
| --- | --- | --- |
| `CycleIndex` | number | 再生開始からのサイクルの数（0 始まり） |
| `SectionInCycle` | number | サイクル内の8bar の番号（0 始まり）。サイクルの長さ未満 |
| `LeadSections` | `2 \| 3` | イントロ・ブレイクダウンの8bar の数 |
| `DropPhrases` | `1 \| 2` | ドロップの32bar の数 |
| `CycleLayout` | `{ intro, breakdown, firstDrop, secondDrop }` | サイクルの長さは `32 × (2 + firstDrop + secondDrop)` bar から求め、別に持たない |
| `Scene` | `'intro' \| 'build' \| 'drop' \| 'breakdown'` | |
| `SceneRole` | シーンごとの判別共用体（下記） | 長さを超える位置を表現できない |
| `FxEvent` | FX の判別共用体（下記） | |
| `FifthsFromInitial` | number | 初期キーから五度圏を属調の向きに何歩進んだか。0〜11 の整数で、12歩で 0 に戻る |
| `FifthStep` | `-1 \| 1` | 1回の移調の向き。下属調 −1、属調 1。2歩以上の移調を表現できない |

```ts
type LeadPosition  = { sections: 2; index: 0 | 1 } | { sections: 3; index: 0 | 1 | 2 };
type BuildPosition = { sections: 1; index: 0 } | { sections: 2; index: 0 | 1 };
type DropPosition  = { phrases: 1; phrase: 0 } | { phrases: 2; phrase: 0 | 1 };

type SceneRole =
  | ({ scene: 'intro' } & LeadPosition)
  | ({ scene: 'build' } & BuildPosition)
  | ({ scene: 'drop'; drop: 'first' | 'second' } & DropPosition)
  | ({ scene: 'breakdown' } & LeadPosition);
```

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

`cycleScenes(layout)` は、サイクルの8bar ごとの `SceneRole` を並べた配列を返します。コンダクターはサイクルの頭でこれを作って保持し、`sectionInCycle` 番目を `Context` に入れます。

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

溜めの開始位置 `GAP_START`（ステップ28）もここに置きます。

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
2. `leadsIntoDrop(ctx)` なら、ステップ28以降に始まるドラムの打音を取り除き、音程のあるパートのノートを `step + length ≤ 28` に切り詰める。切り詰めて長さが0になるノートは取り除く

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
  | { fx: 'gap'; from: Step };   // その2bar の終わりまで溜め
```

| FX | 2bar | 内容 |
| --- | --- | --- |
| ライザー | ビルドの各2bar | ビルドの頭から溜めの頭（最後の2bar のステップ28）までの進み具合。最後の2bar は `to = 28` |
| ハイパスのスイープ | ビルドの各2bar | ライザーと同じ区間と進み具合 |
| ローパスのスイープ | イントロの最後の8bar より前の各2bar | イントロの頭から、イントロの最後の8bar の頭までの進み具合 |
| インパクト・フィルターのリセット | `opensDrop` の2bar | ステップ0 |
| 溜め | `leadsIntoDrop` の2bar | ステップ28 から |
| リバーブスロー | `leadsIntoDrop` か `leadsIntoBreakdown` の2bar | 鳴る側のドラムのうち、最後のスネアの位置（溜めがあればステップ28より前） |

進み具合は `(シーン内の通しステップ) / (区間全体のステップ数)` です。シーン内の位置は `sceneRole` の `index`、`pairIn8`、ステップから求めます。

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
| 溜め | 開始で1に `set`、30 ms でパッドのゲートを0へ `linear`。2bar の終わりで0に `set` し、0.4 秒（パッドのアタック）で1へ `linear`。すぐに1に戻すと、溜めで切ったパッドのリリースがドロップの頭で聞こえ直すため |

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
reese ─▶ HPF(120) ─▶ [イントロ LPF] ─▶ [ダッキング] ─▶ ch
stab  ─▶ LPF(3k) ─▶ [イントロ LPF] ─▶ ch
pad   ─▶ LPF(1.5k) ─▶ [イントロ LPF] ─▶ [パッドのゲート] ─▶ [ダッキング] ─▶ ch
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

### 定数の既定値（ミキサー）

| チャンネル | パン | センド | トリム |
| --- | --- | --- | --- |
| FX | 0 | 30% | −12 dB |

音量は 0 dB、ミュートはオフです。

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

音度やコードトーンの判定（サブベースの音度の分布、コード外の音の数、反復率）は、セッションのキーではなく `ctx.key` で数えます。

32bar の役割ごとの密度（`densityBySection`）は、生成側の打音で数える従来の統計として残します。

## 受け入れ基準とテストの対応

| 受け入れ基準 | テスト |
| --- | --- |
| MVP〜フェーズ2の基準 | 既存のテストを維持する。フェーズ1の「B が最も疎で A'' が最も密」はシーンのエネルギーに置き換わるので、ドロップのエネルギーのテストに差し替える。MVP の「ドラムの層の後に音程のあるパート」は、選別の後のイベントとの比較に書き換える |
| シーンの並び | 8bar ごとの `sceneRole` を、`layout` から期待される並びと比べる。サイクルの長さ、ドロップの開始が32bar の頭、ビルドの次がドロップ |
| レイアウトの網羅 | 8192bar・複数シードで、イントロとブレイクダウンの長さ4通り、延長4通りが現れる |
| 鳴らさないパート | 鳴る側のイベントを `plays` の表と照合する。ブレイクダウンの最後のフィルのスネアだけを除く |
| イントロの最初の8bar | すべてのイントロの `index: 0` で、サブベース・ゴースト・奇数ステップのハイハットが鳴る側にない。`index` が1以上ではサブベースが鳴る |
| エネルギー | ビルドで単調増加かつドロップの A 以下、ドロップはフェーズ1のカーブ、2周目以降のイントロは単調減少、`energyDepth = 0` で全て1 |
| 主進行 | サイクルの頭以外で主進行が替わらない。`m32 = 0` で替わらない |
| 移調 | `ctx.key` が変わるのはサイクルの頭だけ。最初のサイクルは初期キー。変わるときは前のキーとの差（半音、mod 12）が 5 か 7。`m32 = 0` で変わらない。8192bar・複数シードで、差 5 と 7 の移調がどちらも現れ、初期キーとの差が 0・5・7 以外のキーが現れる |
| 音階 | 音程のある全パートの音が `ctx.key` のナチュラルマイナーに含まれる（フェーズ1・2の音階のテストを `ctx.key` で数えるように改める） |
| 初期キーと移調 | 同じシードで初期キーだけを変えた2回の生成で、全サイクルの `ctx.key − initialKey` が一致する（フェーズ1・2の移調のテストがそのまま通る） |
| ドロップ間の主題 | 同じサイクルのドロップの32bar の A 系で、進行と、大きなフィル区間より前のリース・スタブ・パッドのイベント列が一致 |
| B の型 | 転換の8bar の型がサイクルの A の型と異なる |
| 基準パターン | 基準が変わる2bar が、サイクルの頭か、ドロップ1の最初を除くドロップの32bar の頭 |
| 溜め | `leadsIntoDrop` の2bar で、大きなフィルがロール系か null（強度0）で、鳴る側の全イベントが28より前に終わる |
| 必須フィル | `changesScene` の2bar で、`fillIntensity > 0` ならフィルがある |
| FX の位置 | インパクト、ライザー、スイープ、スローの位置と進み具合を、上の表の条件と照合する |
| 再現性 | 同じシードで2回生成した `events` と `fx` が一致する |
| オートメーション | `fxAutomation` の点列で、ライザーの音量が単調に増えて溜めで0になる、スイープが区間の端で期待値になる、溜めでパッドのゲートが閉じて2bar の終わりで開く |
| 5ms 以内 | アンサンブルの `next` の平均時間（選別と FX を含む） |
