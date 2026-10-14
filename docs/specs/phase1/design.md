# フェーズ1設計書

[フェーズ1要件定義書](./requirements.md) を実装するための設計です。[MVP設計書](../mvp/design.md) の方針（brand 型、判別共用体、乱数の引き方、ラッチ）はそのまま引き継ぎ、変わる部分だけを書きます。

## モジュール構成と依存方向

```
ui ──▶ engine ──▶ generators/ensemble ──▶ structure ──▶ random
                        │
                        ├──▶ generators/drums ──▶ random
                        └──▶ generators/bass  ──▶ random
tools/simulate ──▶ generators/ensemble          （Tone.js に依存しない）
```

| モジュール | 責務 | Tone.js 依存 |
| --- | --- | --- |
| `src/structure/form.ts` | 2bar・8bar の役割（MVP）に、32bar 内の8bar の役割 `SectionRole` を追加 | なし |
| `src/structure/energy.ts` | エネルギーカーブと `energyDepth` から8bar ごとのエネルギーを求める | なし |
| `src/structure/key.ts` | キー（主音の音名）と、ナチュラルマイナーの音階 | なし |
| `src/structure/conductor.ts` | 2bar 通し番号 → `Context`。32bar の役割、エネルギー、キー、パラメーターのラッチ | なし |
| `src/generators/types.ts` | `DrumHit` / `BassNote` / `NoteEvent`、`DrumOutcome`、`ContextWithDrums` | なし |
| `src/generators/drums/*` | MVP に、基準パターンの保持、強い変異、転換、間引き、大きなフィルを追加 | なし |
| `src/generators/bass/*` | リズムの型、音高、ベース生成器 | なし |
| `src/generators/ensemble.ts` | コンダクター → ドラム → `ContextWithDrums` → ベースの順に2bar を生成する | なし |
| `src/engine/audio.ts` | ドラムのサンプラーにサブベースのシンセを追加 | あり |
| `src/engine/transport.ts` | アンサンブルの結果を発音予約する | あり |

再生エンジンとシミュレーションは、どちらもアンサンブルだけを呼びます。生成の順序を1か所に閉じ込め、両者で食い違わないようにするためです。

## 型

| 型 | 中身 | 不変条件 |
| --- | --- | --- |
| `PhraseIndex` | number | 0 以上の整数（32bar の通し番号） |
| `PitchClass` | number | 0〜11 の整数（C = 0） |
| `Key` | `PitchClass` | 主音。旋法はナチュラルマイナー固定なので主音だけで決まる |
| `Pitch` | number | MIDI ノート番号 29〜52 |
| `StepLength` | number | 1〜32 の整数 |
| `ScaleDegree` | number | 0〜6 の整数（音階の何番目の音か） |

`SectionRole` は要件定義書のとおり `sectionIn32` を判別子とする判別共用体です。`Context` では MVP の `PairRole` と名前がぶつからないよう、`sectionRole` フィールドに入れます。

```ts
type Context = PairRole & {
  bar; pair; section; phrase: PhraseIndex;
  sectionRole: SectionRole;
  energy: UnitInterval;
  key: Key;
  seeds: { phrase: Seed; section: Seed; ornament: Seed; fill: Seed };
  params: { m2: UnitInterval; m8: UnitInterval; m32: UnitInterval };
};
```

`ContextWithDrums` を作れるのはアンサンブルだけです。ベース生成器の引数をこの型にすることで、ドラムより先にベースを生成するコードは型検査で落ちます。

## シード

### MVP のシード衝突の修正

MVP では `REL.variant` と `TAG.fill` がどちらも 2 だったため、変奏の2bar で `hash(section, REL.variant)`（装飾）と `hash(section, TAG.fill)`（フィル）が同じシードになっていました。フェーズ1は MVP との互換を保たないので、装飾にも専用のタグを付けて `ornament = hash(section, TAG.ornament, REL[pairRelation])` に改めます。1つのコンテキストから派生する全シードが互いに異なることをテストで確認します。

### 派生の一覧

| 用途 | 派生 |
| --- | --- |
| フレーズ | `hash(master, TAG.phrase, phrase)` |
| 8bar | `hash(phrase, TAG.section, sectionIn32)` |
| 装飾 | `hash(section, TAG.ornament, REL[pairRelation])` |
| フィル | `hash(section, TAG.fill)` |
| 最初の基準パターン | `hash(phrase, TAG.base)` |
| 強い変異 | `hash(phrase, TAG.mutate32, パート番号)` |
| 変奏の変異 | `hash(section, TAG.mutate, パート番号)` |
| 転換 | `hash(phrase, TAG.transition, 試行番号)` |
| 間引き | `hash(section, TAG.thin, パート番号)` |
| ベースの型 | `hash(phrase, TAG.bassStyle)` |
| ベースのリズム | A・A'・A'' は `hash(phrase, TAG.bassRhythm, REL[pairRelation])`、B は `hash(section, TAG.bassRhythm, REL[pairRelation])` |
| ベースの音高 | A・A'・A'' は `hash(phrase, TAG.bassPitch, REL[pairRelation])`、B は `hash(section, TAG.bassPitch, REL[pairRelation])` |

キーはどのシードにも混ぜません。キーを変えても乱数の列が変わらず、移調だけになるようにするためです（F-30）。

ベースの型の乱数列からは、A 用の型、B 用の型、B の中心音の3つをこの順に引きます。

## パラメーターのラッチ

| パラメーター | ラッチするタイミング |
| --- | --- |
| `m2`, `m8`, `energyDepth` | 8bar の頭の生成時 |
| `m32` | 32bar の頭の生成時 |
| `fillIntensity` | 8小節目を含む2bar の生成時（MVP のまま） |
| `bpm`, `seed`, `key` | 再生開始時 |

## ドラム生成器

生成器は基準パターンと、その8bar の基本パターン（間引き前・間引き後）を状態として持ちます。8bar の頭で次のように更新します。

| 役割 | 間引き前の基本パターン |
| --- | --- |
| A | 32bar の頭なら基準を更新（最初は重み表から生成、以降は強い変異）し、基準をそのまま使う |
| A' / A'' | `mutate(基準, section, m8, 変奏)` |
| B | 転換パターン |

変異は MVP の `mutate` を、変異の種類（タグと変異しやすさの組）を受け取る形に一般化して、変奏と強い変異で共有します。

`generateLayers(ctx)` は、受け入れ基準を外から検証できるよう次の層を返します。

- `reference`: 基準パターン
- `sectionBase`: 間引き前のその8bar の基本パターン
- `base`: 間引き後の基本パターン。実際に鳴るのはこちら
- `ornaments`, `fill`: MVP と同じ

### 転換

試行番号 0〜10 のシードで重み表から生成し、キックのモチーフが基準と異なる最初のものを使います。11回とも一致した場合は、基準に `m32 = 1` の強い変異をかけたものを使います。

### 間引き

キック・ハイハット・ゴーストのモチーフの全位置で乱数を1回ずつ引き、アンカー以外の発音を確率 `(1 − E) × (1 − 重み)` で消します。最小発音数を下回ったら、消した位置を重みの高い順（同じ重みならモチーフの前の位置から）に戻します。音を消すだけなので、アンカー・禁止位置・衝突の制約は崩れません。

### 大きなフィル

`ctx.sectionRole.isPhraseEnd` かつ `ctx.isSectionEnd` のとき、通常のフィルの代わりに使います。乱数は種類と長さの2つを、発動の有無にかかわらず先に引きます。テンプレートの `hits` には、フィル内の位置（何番目か、全体の長さ）を渡します。加速ロールで前半の8分を決めるのに必要だからです。

## ベース生成器

ベース生成器は状態を持たず、`ContextWithDrums` だけから決まります。

### 型の重み表

| 型 | 重み（記載のない位置は0） | キックへの加点 | 弾き直さない位置 |
| --- | --- | --- | --- |
| キック追従 | 0: 1.0 | 1.0 | なし |
| ロングサステイン | 0: 1.0、16: 0.5 | 0 | なし |
| 先取り | 0: 1.0、14: 0.7 | 0.8 | 16 |
| 3-3-2 | 0: 1.0、6・12・16・22・28: 0.8 | 0 | なし |
| 問いと答え | 0: 1.0、24・26・28・30: 0.5 | 0.8 | なし |

全32ステップで乱数を1回ずつ引き、`乱数 < min(1, 重み + 加点 × キック)` のステップで発音します。弾き直さない位置とフィル区間内では発音しません。

### 音高

音階の何番目の音か（`ScaleDegree`）で計算し、最後に MIDI ノート番号へ変換します。要件定義書の音度の重みは、中心音からの音階上の距離（0, 2, 3, 4, 5, 6）に対する重みとして扱います。B で中心音を ♭6 などに移しても、音階の外の音が出ないようにするためです。

音高の乱数列からは、全32ステップで「音度用」「跳躍用」の2つを必ず引きます。

MIDI ノート番号への変換は、`(主音 + 音階の半音数[音度]) mod 12` の音名を F1〜E2（29〜40）の中で探し、跳躍する音には12を足します。

### ノートの長さ

次の発音の直前まで、最後の音は2bar の終わりかフィル開始の直前まで伸ばします。

## 再生エンジン

- サブベースは `Tone.MonoSynth` を使わず、サイン波の `Tone.Synth` に弱い `Tone.Distortion` をかけます。サイン波だけでは倍音がなく、小さいスピーカーでは音高が聴き取れないためです。
- ベースもドラムと同じゲートを通します。停止時に、先読みで予約済みの音もまとめて止めるためです（F-25）。
- ノートの長さは `length × 16分の秒数` から数ミリ秒短くして予約します。モノフォニックのシンセでは、リリースと次のアタックが同じ時刻に重なると、クリックが出たり次の音が落ちたりすることがあるためです。

## UI

- 操作パネルに `m32` と `energyDepth` のスライダー（百分率）と、キーの選択欄（停止中のみ変更可）を追加します。
- 小節位置の表示に、現在の8bar の役割（A / A' / B / A''）を追加します。
- ステップグリッドにベースの行を追加し、発音位置と伸ばしている区間を塗り分けます。音名はセルの `title` に入れます。

## シミュレーション

次の統計を追加し、CLI に `--m32`、`--energy`、`--key` を追加します。

- 8bar の役割ごとのパート別密度
- 基準パターンが変わった32bar 境界の数
- ベースの型の出現数、音度の分布、跳躍の割合、2bar あたりのノート数

## 受け入れ基準とテストの対応

| 受け入れ基準 | テスト |
| --- | --- |
| MVP の自動テスト | `tests/acceptance.test.ts` をアンサンブル経由に書き換えて維持 |
| 基準が32bar 境界でのみ変わる | `reference` を連続する2bar で比較 |
| 変奏が累積しない | `sectionBase` を `mutate(reference, section, m8, 変奏)` と比較 |
| 転換のキックが基準と異なる | 全転換の `sectionBase` と `reference` のキックを比較 |
| 32bar 末の大きなフィル | `isPhraseEnd` の最後の2bar の `fill.length` |
| エネルギーの一定性と `energyDepth = 0` | 8bar 内の `base` の一致、`base` と `sectionBase` の一致 |
| 役割ごとの密度の順序 | シミュレーションの役割ごとの密度 |
| ベースの音域・音階・2bar 内・フィル外 | ベースのノート列を検査 |
| ステップ0 の発音、キック追従 | 型が `kickFollow` の2bar でキックと比較 |
| B の型が A と異なる | 結果に含まれる型を比較 |
| 反復のベースの一致 | 8bar 内の2bar 0〜2 を比較 |
| キーの移調 | 2つのキーでドラムの一致と、ベースの音高差が12で割った余りで一定であること |
| 5ms 以内 | アンサンブルの `next` の平均時間 |
