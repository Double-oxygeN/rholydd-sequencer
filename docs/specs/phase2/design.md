# フェーズ2設計書

[フェーズ2要件定義書](./requirements.md) を実装するための設計です。[MVP設計書](../mvp/design.md) と [フェーズ1設計書](../phase1/design.md) の方針（brand 型、判別共用体、乱数の引き方、ラッチ、アンサンブル）はそのまま引き継ぎ、変わる部分だけを書きます。

## モジュール構成と依存方向

```
ui ──▶ engine ──▶ generators/ensemble ──▶ structure ──▶ random
 │        │             │
 │        │             ├──▶ generators/drums
 │        │             ├──▶ generators/sub, reese, stab, pad ──▶ generators/line, generators/pitch
 │        └──▶ engine/ducking, engine/clip（Tone.js に依存しない）
 └──▶ params ──▶ params/mixer
tools/simulate ──▶ generators/ensemble          （Tone.js に依存しない）
```

| モジュール | 責務 | Tone.js 依存 |
| --- | --- | --- |
| `src/structure/harmony.ts` | コード、進行の表、32bar ごとの進行の選択、コード名 | なし |
| `src/structure/conductor.ts` | `Context` に進行を加え、主進行を32bar をまたいで保持する | なし |
| `src/generators/pitch.ts` | 音名を音域の下端から1オクターブに折り返す | なし |
| `src/generators/line.ts` | 音程のあるパートに共通の規則（型の選択、モチーフのシード、大きなフィルでの打ち切り、コードトーンの選択） | なし |
| `src/generators/sub/*` | フェーズ1の `generators/bass` を改名し、音高をコードに合わせる | なし |
| `src/generators/reese/*` | リースベースのリズムの型と生成器 | なし |
| `src/generators/stab/*` | スタブのリズムの型と生成器 | なし |
| `src/generators/pad/*` | パッドのボイシングと生成器 | なし |
| `src/generators/ensemble.ts` | コンダクター → ドラム → `ContextWithDrums` → 音程のある4パート | なし |
| `src/params/mixer.ts` | ミキサーとダッキングの設定の型、既定値、範囲 | なし |
| `src/engine/ducking.ts` | キックの時刻からダッキングのエンベロープの点列を求める | なし |
| `src/engine/clip.ts` | サンプル列からピークとクリップの数を数える | なし |
| `src/engine/clip-worklet.ts` | `clip.ts` を音声スレッドで動かす AudioWorklet | なし（AudioWorklet のみ） |
| `src/engine/audio.ts` | 音源、ミキサー、バス、リバーブ、ダイナミクス、ダッキングとクリップ検出の配線 | あり |
| `src/engine/transport.ts` | アンサンブルの結果とダッキングを2bar ごとに予約する | あり |
| `src/ui/mixer.ts` | ミキサー、ダッキング、ピークメーターの操作盤 | あり（Draw のみ） |

ダッキングの点列とクリップの計数を Tone.js から切り離すのは、要件の受け入れ基準を Node.js 上の単体テストで検証するためです。

## 型

| 型 | 中身 | 不変条件 |
| --- | --- | --- |
| `ChordRoot` | `0 \| 2 \| 3 \| 4 \| 5 \| 6` | ii（1）を除く音階上の位置 |
| `Chord` | `{ root: ChordRoot }` | 構成音はルートから音階上で 0, 2, 4, 6 番目 |
| `MainProgression` | `readonly [Chord & { root: 0 }, Chord, Chord, Chord]` | i で始まる |
| `TransitionProgression` | `readonly [Chord & { root: Exclude<ChordRoot, 0> }, Chord, Chord, Chord]` | i で始まらない |
| `Pitch` | number | MIDI ノート番号の整数。音域はパートごとに `PitchRange` で決める |
| `Voicing` | `readonly Pitch[]` | 低い順。空でない |
| `Decibels` | number | −40〜+6 の整数（ミキサーの音量） |
| `Pan` | number | −1〜1 |
| `Milliseconds` | number | 30〜300 の整数（ダッキングの戻り時間） |

### 進行と 8bar の役割

進行の種類は8bar の役割から一意に決まるので、`sectionRole` と `progression` を組にした判別共用体にします。B に主進行を、A に転換進行を持たせた `Context` は作れません。

```ts
type SectionHarmony =
  | { sectionRole: ReferenceSection | VariantSection | ClosingSection; progression: MainProgression }
  | { sectionRole: TransitionSection; progression: TransitionProgression };

type Context = PairRole & SectionHarmony & { bar; pair; section; phrase; energy; key; seeds; params };
```

その2bar のコードは `chordOf(ctx) = ctx.progression[ctx.pairIn8]` で求め、`Context` には持たせません。

### イベント

```ts
interface SubNote   { instrument: 'sub';   step; length; pitch: Pitch; velocity }
interface ReeseNote { instrument: 'reese'; step; length; pitch: Pitch; velocity }
interface StabHit   { instrument: 'stab';  step; length; voicing: Voicing; velocity }
interface PadChord  { instrument: 'pad';   step; length; voicing: Voicing; velocity }
type NoteEvent = DrumHit | SubNote | ReeseNote | StabHit | PadChord;
```

サブベースの乱数のタグは、名前を `TAG.subStyle` などに改めますが、値（10〜12）は変えません。同じシードでサブベースのリズムがフェーズ1と一致するようにするためです。

## 進行の選択

`src/structure/harmony.ts` の `phraseProgressions(previousMain, phraseSeed, m32)` が、32bar の頭で主進行と転換進行を返します。乱数は `hash(phrase, TAG.progression)` から3つの float をこの順に引きます。

| 乱数 | 使い方 |
| --- | --- |
| 1つ目 | `previousMain` があり、値が `m32` 未満なら主進行を替える |
| 2つ目 | 最初の32bar なら主進行の表全体から、替えるなら現在以外の5つから選ぶ |
| 3つ目 | 転換進行の表から選ぶ |

コンダクターは主進行を保持し、32bar の頭（`m32` をラッチした後）でだけ更新します。

## 音程のあるパートの共通規則（`generators/line.ts`）

| 関数 | 内容 |
| --- | --- |
| `stylePlan(seed, styles)` | A・A'・A'' 用の型を均等に選び、B 用の型を残りから選ぶ。乱数はこの2つだけ |
| `motifSeed(ctx, tag)` | A・A'・A'' は `hash(phrase, tag, REL[relation])`、B は `hash(section, tag, REL[relation])` |
| `playableEnd(ctx)` | 32bar の終わりの大きなフィルがあればその開始ステップ、なければ32 |
| `chordDegree(root, roll, weights)` | ルートからの音階上の距離（0, 2, 4, 6）を重みで選び、音度にする |
| `legato(starts, end)` | 次の発音の直前まで伸ばした長さを付ける |

フェーズ1のサブベースの型の選択は `stylePlan` に置き換えます。B の中心音を引かなくなるだけで、A 用・B 用の型の乱数は同じです。

`pitch.ts` の `foldPitch(lowest, pitchClass)` は、`lowest` から1オクターブの範囲で `pitchClass` の音を返します。音域の下端はサブベース F1（29）、リースベース F2（41）、スタブ C4（60）です。

## リースベース

ステップ0 は重み1（アンカー）で、`重み[s] × E` で発音します。

| 型 | 重み（記載のない位置は0） |
| --- | --- |
| `sustain` | 16: 0.6 |
| `roll` | 偶数ステップ: 0.6 |
| `syncopated` | 3, 6, 10, 19, 22, 26: 0.7 |
| `response` | 24〜31: 0.5 |

リズムの乱数列からは全32ステップで1回ずつ、音高の乱数列からは全32ステップで1回ずつ引きます。ノートの長さはサブベースと同じく `legato` で決めます。

## スタブ

アンカーはなく、`重み[s] × E` で発音します。バックビート（4, 12, 20, 28）の重みはすべての型で0です。

| 型 | 重み（記載のない位置は0） |
| --- | --- |
| `offbeat` | 2, 6, 10, 14, 18, 22, 26, 30: 0.4 |
| `dotted` | 0, 6, 16, 22: 0.6 |
| `sparse` | 6, 22: 0.6 |
| `response` | 24, 26, 30: 0.6 |

全32ステップで乱数を1回ずつ引いてから、前から順に「発音しやすさを満たす」「直前の発音から2ステップ以上離れている」「`playableEnd` までに2ステップ収まる」の3つを満たす位置で発音します。ボイシングはコードの3度・5度・7度をそれぞれ C4〜B4 に折り返し、低い順に並べます。

## パッド

8bar の最初のコードから `pairIn8` 番目のコードまで、順にボイシングを決めます。2bar ごとに数個の候補を比べるだけなので、状態を持たずに毎回8bar の頭から計算します。

- 候補: 4つの転回形それぞれについて、構成音を下から密集して積んだ形を、F3〜E5（53〜76）に収まるすべてのオクターブに置いたもの
- 8bar の最初: 転回なしの候補のうち、平均音高が音域の中央（64.5）に最も近いもの
- 2つ目以降: 低い順に対応させた声部の移動量の合計が最小の候補。同じなら平均音高が中央に近いもの

## ダッキング（`engine/ducking.ts`）

キックの時刻は2bar 分前もって分かるので、キックの瞬間に下がりきるよう、アタック（3ms）だけ前から下げ始めます。キックの頭とベースの立ち上がりが重なるのを避けるためです。

```ts
interface Dip { kick: Seconds; floor: number; release: Seconds }
function duckPoints(kicks: readonly Seconds[], carry: Dip | null, shape: { floor: number; release: Seconds })
  : { points: readonly { time: Seconds; gain: number }[]; last: Dip | null };
```

- 1つのキックにつき、`(kick − attack, その時刻のゲイン)`、`(kick, floor)`、`(kick + release, 1)` の3点を作る
- 次のキックのほうが戻りきるより早ければ、3点目の代わりに `(次のキック − attack, その時刻のゲイン)` を置く。下げ始めの値は直前の戻りの途中の値を線形補間で求める
- 2bar をまたぐ戻りは、前の2bar の最後のキック（`carry`）から求める

エンジンは2bar ごとに、最初の点の時刻で `cancelScheduledValues` してから、点を `linearRampToValueAtTime` で並べます。前の2bar で予約した戻りのうち、新しいキックより後の部分だけが置き換わります。`floor` は `1 − duckDepth × パートの比` です。

## クリップ検出（`engine/clip.ts`、`engine/clip-worklet.ts`）

リミッターの後に AudioWorklet を挟み、入力をそのまま出力へ流しながら、全サンプルの絶対値の最大値と、絶対値が1以上のサンプルの数を数えます。約0.1秒ごとにメインスレッドへ送り、UI はピークを保持して表示します。出力を持たせて信号の経路に挟むのは、出力先のない AudioWorkletNode が処理されるかどうかがブラウザによって異なるためです。

サンプル列を数える処理は `scanBlock(samples, tally)` として切り出し、受け入れ基準のテストで直接呼びます。

## 再生エンジン

### 信号の経路

```
各音源 ─▶ [ダッキング用 Gain]（sub, reese, pad のみ）─▶ 音源のトリム ─▶ Tone.Channel ─▶ ドラムバス or ミックスバス
                                                                         └─▶ センド用 Gain ─▶ リバーブ ─▶ リターンの Tone.Channel ─▶ ミックスバス
ドラムバス: Tone.Compressor ─▶ ミックスバス
ミックスバス ─▶ Tone.Compressor ─▶ Tone.Limiter(−1 dB) ─▶ クリップ検出 ─▶ 聴取音量 ─▶ ゲート ─▶ 出力
```

- 音源のトリムは、音源ごとの音量差をそろえる定数です。ミキサーの音量を既定値 0 dB から始められるようにするためです
- ゲートは出力の直前に置き、停止時にリバーブの残響も止めます（F-47）
- キックとサブベースの `Tone.Channel` はパンを0に固定し、センドを作りません

### セッションごとに作り直すもの

サブベース・リースベース・スタブ・パッドのシンセとリバーブは、再生を始めるたびに作り直します。フェーズ1のサブベースと同じく、前の再生で先読み予約した音がシンセに残るためです。リバーブも作り直すのは、停止直後に再生したとき、前の再生の残響がリターンから聞こえないようにするためです。Tone.Reverb はインパルス応答を非同期に作りますが、待たずに再生を始めます。作り終わるまでの数十ミリ秒、残響が鳴らないだけだからです。ダッキング用の Gain は作り直さず、停止と開始のたびに予約を消してゲイン1に戻します。

### 音色

| パート | 構成 |
| --- | --- |
| リースベース | `Tone.MonoSynth`（`fatsawtooth`、3本、デチューン幅 25 cent）、ローパスのフィルターエンベロープ、その後に 120 Hz のハイパス |
| スタブ | `Tone.PolySynth(Tone.Synth)`（`fatsquare`、短いディケイ）、その後に 3 kHz のローパス。同時発音数 8 |
| パッド | `Tone.PolySynth(Tone.Synth)`（`fatsawtooth`、遅いアタックと長いリリース）、その後に 1.5 kHz のローパス。同時発音数 12 |

パッドは2bar ごとに弾き直し、リリースが次の和音と重なるので、同時発音数は4音×2より多めにします。

### 定数の既定値

| 項目 | 値 |
| --- | --- |
| ドラムバスのコンプレッサー | スレッショルド −12 dB、レシオ 3、アタック 10 ms、リリース 100 ms |
| マスターのコンプレッサー | スレッショルド −10 dB、レシオ 2、アタック 20 ms、リリース 200 ms |
| リミッター | スレッショルド −1 dB |
| リバーブ | 長さ 2.5 秒、プリディレイ 20 ms |
| ダッキングのパートの比 | サブベース 1.0、リースベース 0.7、パッド 0.5 |
| ダッキングのアタック | 3 ms |

### ミキサーの既定値

| チャンネル | パン | センド |
| --- | --- | --- |
| キック | — | — |
| スネア | 0 | 15% |
| ハイハット | R20 | 10% |
| ゴースト | L15 | 10% |
| サブベース | — | — |
| リースベース | 0 | 0% |
| スタブ | L20 | 35% |
| パッド | 0 | 40% |

音量はすべて 0 dB、ミュートはすべてオフ、リバーブのリターンは 0 dB です。

## パラメーター

`Params` にミキサー（`MixerSettings`）とダッキング（`DuckingSettings`）を加えます。どちらも `LiveParams` には入れず、アンサンブルに渡りません（N-11）。

| 設定 | 反映の仕方 |
| --- | --- |
| ミキサー | ストアの変更を購読し、各ノードのパラメーターを 50 ms で滑らかに変える |
| ダッキング | シーケンサーが2bar を予約するたびに読む |

## UI

- ミキサーを操作パネルとは別の枠にします。チャンネルごとに音量（dB）、パン、センド、ミュートを1行に並べ、パンとセンドを持たないチャンネルはその欄を空けます。
- ミキサーの枠に、ダッキング量・戻り時間のスライダーと、ピーク（dBFS）とクリップの回数を置きます。クリップの回数は再生を始めるたびに0に戻します。
- 小節位置の表示に現在のコード名（例: D♭maj7）を加えます。コード名は主音の音名に、i・iv・v は `m7`、III・VI は `maj7`、VII は `7` を付けます。
- ステップグリッドに Reese と Stab の行を加え、Bass の行を Sub に改めます。

## シミュレーション

次の統計を追加します。CLI のオプションは変えません。

- 主進行・転換進行ごとの出現数と、主進行が替わった32bar 境界の数
- サブベース・リースベース・スタブ・パッドの2bar あたりのノート数
- リースベースとスタブの型の出現数
- コードトーン外の音の数、音域外の音の数（どちらも0になるはず）

## 受け入れ基準とテストの対応

| 受け入れ基準 | テスト |
| --- | --- |
| MVP・フェーズ1の基準 | 既存のテストを維持し、反復の一致だけをフェーズ2の形に書き換える |
| 進行の表と A 系の一致 | 8bar ごとの `progression` を表と比較し、32bar 内の A・A'・A'' を比較 |
| 主進行が32bar 境界でだけ替わる | 連続する2bar の主進行を比較。`m32 = 0` で全32bar の主進行が一致 |
| コードトーンと音域 | 全パートのノートの音度をコードの構成音と比較 |
| キーの移調 | 2つのキーで、ドラムと進行の一致、各パートの音高差が12で割った余りで一定 |
| 反復の一致 | 8bar 内の2bar 0〜2 で、各パートの発音位置・長さ・ルートからの音度を比較 |
| 2bar 内・大きなフィル外、パッドは鳴る | ノート列の範囲を検査 |
| 8bar 末のフィルに依存しない | フィル強度 0 と 1 で、ドラム以外のノート列を比較 |
| スタブがバックビートにない | スタブの発音位置を検査 |
| B の型が A と異なる | 結果に含まれる型を比較 |
| ダッキング | 生成したキックの時刻から `duckPoints` を求め、各キックで `floor` になり、キックのない区間で1に戻っていることを確認 |
| クリップ検出 | `scanBlock` に 0 dBFS を1サンプルだけ超える列と、超えない列を渡す |
| 5ms 以内 | アンサンブルの `next` の平均時間 |
