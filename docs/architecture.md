# アーキテクチャ

生成と再生の分け方、モジュールと依存の向き、2bar ごとの生成の流れ、主な型をまとめます。

関係するコード: `src/` の全体。とくに `src/generators/ensemble.ts`、`src/structure/conductor.ts`、`src/engine/transport.ts`、`src/main.ts`

## 生成と再生の分離

| 領域 | 役割 | ブラウザの音声への依存 |
| --- | --- | --- |
| 生成（`structure`・`generators`・`random`） | 次の2bar に何を鳴らすかを、イベントの列として返す | なし |
| 再生（`engine`） | イベントを Web Audio の時刻に予約して鳴らす | あり（Tone.js） |
| パラメーター（`params`） | 画面の値、ミキサー、設定ファイル | なし |
| 画面（`ui`、`main.ts`） | 操作と表示 | なし（エンジンが渡す値を描くだけ） |

トランスポートが2bar ごとに生成を要求し、返ったイベントを予約します。生成は Tone.js を読まないので、シミュレーション（`tools/simulate.ts`）と単体テストから同じ生成をそのまま呼べます。再生側でも、時刻の計算（ダッキング、オートメーション、再開位置）とクリップの計数は Tone.js から切り離し、Node.js 上で単体テストします。

## モジュールと依存の向き

```
ui ──▶ engine ──▶ generators/ensemble ──▶ structure ──▶ random
 │        │             │
 │        │             ├──▶ generators/drums, sub, reese, stab, pad ──▶ generators/line, generators/pitch
 │        │             ├──▶ generators/arrange   （鳴らすパートの選別と溜め）
 │        │             └──▶ generators/fx        （FX のイベント）
 │        ├──▶ engine/playhead, resume, automation, ducking, clip   （Tone.js に依存しない）
 │        └──▶ engine/strips, voices, effects, patches              （音の経路の部品）
 └──▶ params ──▶ params/mixer, params/decode
tools/simulate ──▶ tools/simulation ──▶ generators/ensemble
```

生成は再生に依存しません。`engine` は `generators` の型とイベントを読みますが、逆はありません。

| モジュール | 役割 |
| --- | --- |
| `src/units.ts` | 別名型（brand）の基盤と、0〜1 の値 `UnitInterval` |
| `src/app-name.ts` | アプリの名前。画面の見出しとメディア操作の曲名 |
| `src/random/rng.ts` | シードの派生（splitmix32）と乱数列（sfc32） |
| `src/structure/form.ts` | 8bar の中の2bar の役割と、32bar の中の8bar の役割 |
| `src/structure/conductor.ts` | 2bar の通し番号から `Context` を作る。パラメーターのラッチ、サイクル・進行・キー・音色の保持 |
| `src/structure/arrangement.ts` | サイクルのレイアウト、シーンの列、シーンの境界の判定 |
| `src/structure/scene-parts.ts` | シーンごとに鳴らすパート |
| `src/structure/energy.ts` | 32bar とシーンのエネルギー |
| `src/structure/chords.ts` | コードとテンションの表、構成音の音高、コード名 |
| `src/structure/harmony.ts` | 進行の表、色付けの抽選、サイクルと32bar の進行、移調 |
| `src/structure/key.ts` | キー、ナチュラルマイナーの音階、五度圏の移調 |
| `src/structure/timbre.ts` | 音色の名前の表と、サイクルの頭での選択 |
| `src/structure/tuning.ts` | 構造の調整用の数値の型と既定値（和声・エネルギー・レイアウト） |
| `src/generators/types.ts` | イベント・ステップ・ベロシティなどの型と `Generator` |
| `src/generators/tuning.ts` | パートの調整用の数値の型と既定値（フィル・ライン）と、生成全体の `GenerationTuning` |
| `src/generators/ensemble.ts` | コンダクターと全生成器を決まった順に呼ぶ |
| `src/generators/drums/*` | 重み表、基本パターン、変異、転換、間引き、装飾、フィル、合成 |
| `src/generators/line.ts`・`pitch.ts` | 音程のあるパートに共通の規則と、音域への折り返し |
| `src/generators/sub`・`reese`・`stab`・`pad` | 音程のある4パート |
| `src/generators/arrange.ts` | シーンで鳴らすパートの選別と、ドロップの入り方に従った溜め |
| `src/generators/fx/index.ts` | FX のイベント |
| `src/engine/transport.ts` | 2bar ごとの生成の要求と予約、再生・一時停止・再開・停止 |
| `src/engine/playhead.ts`・`resume.ts` | 一時停止した位置と、再開位置以降のイベント |
| `src/engine/automation.ts` | FX のイベントからオートメーションの点列と、再開位置の値を求める |
| `src/engine/ducking.ts` | キックの時刻からダッキングのエンベロープを求める |
| `src/engine/clip.ts`・`clip-worklet.ts` | リミッターの後のピークとクリップの計数 |
| `src/engine/audio.ts` | 音の経路の組み立てと、トランスポートが使う `Instruments` |
| `src/engine/strips.ts` | ミキサーのチャンネルと、フェーダーの動かし方 |
| `src/engine/voices.ts` | パートごとのシンセとドラムのサンプラー |
| `src/engine/effects.ts` | ライザー・スイープのノードと、オートメーションの適用 |
| `src/engine/patches.ts` | 音色ごとのシンセの設定と、その制約 |
| `src/engine/tuning.ts` | 音の調整用の数値の型と既定値 |
| `src/params/store.ts`・`mixer.ts` | パラメーター、ミキサー、ダッキングの設定 |
| `src/params/reset.ts` | メニューの既定値に戻すボタンが戻す値と、既定値との一致 |
| `src/params/config.ts`・`decode.ts`・`load-config.ts` | 設定ファイルのスキーマ、検証の部品、読み込み |
| `src/params/query.ts` | クエリ文字列のシードと共有する URL |
| `src/ui/messages.ts` | 画面の文言の表（日本語と英語）と、ブラウザの言語から画面の言語を選ぶ `pickLanguage` |
| `src/ui/*` | 画面の部品（[画面](./interface/screen.md)） |
| `tools/simulate.ts`・`tools/simulation/*` | 音声なしの長時間の生成と統計 |
| `tools/make-samples.ts` | ドラムサンプルの合成 |
| `tools/make-icons.ts` | アイコンと共有用の画像の PNG を描く |
| `tools/page-meta.ts` | 共有したリンクのプレビューのメタデータを `index.html` に書き込む Vite のプラグイン |
| `tools/base-path.ts` | 配布する base path |

## 2bar ごとの生成の流れ

アンサンブル（`createEnsemble`）が、2bar ごとに次の順で進めます。

1. コンダクターが、位置・役割・シーン・エネルギー・進行・キー・音色を持つ `Context` を作る
2. ドラム生成器が、`Context` からドラムの確定結果（打音、フィル区間、フィルを適用する前のキック）を作る
3. `Context` にドラムの確定結果を加えた `ContextWithDrums` を作る
4. サブベース・リースベース・スタブ・パッドが、`ContextWithDrums` からノートを作る
5. アレンジが、シーンで鳴らさないパートを取り除き、ドロップの入り方に従って溜めを空ける（実音側のイベント）
6. FX 生成器が、`Context` と実音側のイベントから FX のイベントを作る

手順2〜4はシーンにかかわらず全パートぶん実行します。トランスポートは実音側のイベントと FX を予約し、ダッキングも実音側のキックから求めます。

## 主な型

不正な状態を表現できないよう、プリミティブ型は brand 型で包み、作る関数を通してだけ作ります。互いに決まり合う値は、判別共用体にして食い違った組を作れないようにします。

| 型 | 中身 | 不変条件 |
| --- | --- | --- |
| `UnitInterval` | number | 0 ≦ x ≦ 1 |
| `Seed` | number | 32bit の符号なし整数 |
| `Step` | number | 0〜31 の整数 |
| `StepLength` | number | 1〜32 の整数 |
| `Velocity` | number | 0 < v ≦ 1。無音はイベントがないことで表し、ベロシティ 0 にしない |
| `Pitch` | number | MIDI ノート番号。パートごとの音域に収まる |
| `Voicing` | `readonly [Pitch, ...Pitch[]]` | 低い順で、空でない |
| `Key`・`PitchClass` | number | 0〜11（C = 0） |
| `PairRole` | `pairIn8` を判別子とする共用体 | `isSectionStart`・`isSectionEnd`・`relation` が `pairIn8` と食い違わない。`fillIntensity` は8bar の最後の2bar だけが持つ |
| `SectionRole` | `sectionIn32` を判別子とする共用体 | A・A'・B・A'' と関係・32bar の頭と終わりが食い違わない |
| `SectionHarmony` | 8bar の役割と進行の組 | B は転換進行、A 系は主進行だけを持つ |
| `SceneRole` | シーンを判別子とする共用体 | シーンの長さを超える位置を表現できない。入り方はビルドだけが持つ |
| `ColoredChord` | コードとテンションの組 | 表にないテンション（アボイドノート）を表現できない |
| `Context` | 位置・役割・シーン・進行・エネルギー・キー・音色・シード・ラッチしたパラメーター | コンダクターだけが作る |
| `ContextWithDrums` | `Context` とドラムの確定結果 | アンサンブルだけが作る。ドラムより前の段階では使えない |
| `NoteEvent` | `DrumHit \| SubNote \| ReeseNote \| StabHit \| PadChord` | `instrument` で判別する |
| `FxEvent` | ライザー・スイープ・インパクト・スロー・フィルターのリセット・溜め | `fx` で判別する |
| `PlaybackSession` | 再生中と一時停止中の共用体 | 停止中のセッションは存在しない。一時停止中に一時停止するような操作は型で書けない |
| `ResumePoint` | 保留の2bar と再開するステップ | 保留が空ならステップは 0 |
| `Config` | 初期値と調整用の数値 | 検証を通った値だけを持つ |

## 決定理由

- **生成の順序をアンサンブルの1か所に閉じ込める**: 再生とシミュレーションが同じ順序で生成し、両者が食い違わないようにするため
- **ドラムの確定結果をコンテキストに含める**: 全パートがコンテキストだけを参照する方針を保ったまま、サブベースのリズムをキックから派生させるため。ドラムの規則を複製してキックの位置を予測する方法は、ドラム側の変更でずれるので採らない
- **音程のあるパートは互いを参照しない**: 調性の一貫性は、全パートが同じコードの構成音を鳴らすことで保つ。パート同士を参照させると生成の順序に依存関係が生まれ、パートの追加や削除のたびに既存パートの結果が変わるため。同じ理由で、パートごとに別々の乱数列を使う
- **鳴らさないパートも生成を続ける**: 乱数列がシーンの並びに左右されず、パートが戻ってきたときにその時点の続きから鳴るようにするため。パートの出し入れを再生側のミュートにしないのは、「ブレイクダウンにキックがない」ことをシミュレーションと単体テストで確かめられるようにするため
- **ミキサーとダッキングはアンサンブルに渡さない**: ミキサーの操作で同じシードの展開が変わらないようにするため。ミュートしたパートも生成を続け、解除するとその時点の続きから鳴る
- **調整用の数値は作るときに渡す**: 生成の数値を `Context` に入れないのは、`Context` を定義する `structure` が、パートの数値の型（`Velocity` など）に依存せずに済むようにするため。構造の数値は `structure/tuning.ts`、パートの数値と全体の `GenerationTuning` は `generators/tuning.ts`、音の数値は `engine/tuning.ts` に置き、`params/config.ts` がまとめる。依存の向きを変えないため
- **既定値と定数を二重に持たない**: 調整用の数値はモジュールの定数として残さず、既定値だけに置く。どちらが効いているのかが分からなくなるため
