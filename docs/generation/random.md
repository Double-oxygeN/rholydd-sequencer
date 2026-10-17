# 乱数とシード

生成のランダムさはすべて自前の擬似乱数から得ます。シードから用途ごとの乱数列を派生させ、同じシード・パラメーター・設定ファイルなら同じ展開になるようにします。

関係するコード: `src/random/rng.ts`、`src/structure/conductor.ts`（シードの派生とラッチ）
関係するテスト: `tests/generation/random.test.ts`、`tests/generation/form.test.ts`（シードの派生）、`tests/generation/baseline.test.ts`

## 振る舞い

- 同じシード・パラメーターの操作・設定ファイルなら、生成されるイベント列・FX・オートメーションの値は完全に一致する
- ミキサー・ダッキング・音量・初期キーは、どのシードにも混ぜない。初期キーを変えても同じ展開を移調したものになり、ミキサーを操作しても展開は変わらない
- 一時停止と再開を何度繰り返しても、展開は一時停止しなかった場合と一致する（[トランスポート](../playback/transport.md)）

### 初期シード

ページを開いたときのシードは、クエリ文字列 `?seed=`、設定ファイルの `params.seed`、乱数の順に、最初に有効な値を使います（[連携](../interface/integration.md)）。シードの欄は再生中にも書き換えられますが、効くのは次に停止から再生したときです。

### パラメーターのラッチ

パラメーターは、壁時計ではなく生成を要求した2bar の位置で読み取ります。先読みの揺れで結果が変わらないようにするためです。

| パラメーター | 読み取るとき |
| --- | --- |
| `m2`・`m8`・`energyDepth` | 8bar の頭の生成時 |
| `m32` | 32bar の頭の生成時（サイクルの頭もここ） |
| `fillIntensity` | 8小節目を含む2bar の生成時 |
| `bpm`・`seed`・`initialKey` | 再生を始めるとき。再生中と一時停止中は変えられない |
| `volume`・ミキサー・ダッキング | 生成には関わらない。音量とミキサーは即時、ダッキングは次の2bar の予約から |

一時停止中に変えた値は、再開した後にまだ生成していない2bar から効きます。

## 実装

### 生成器

| 段 | 方式 | 役割 |
| --- | --- | --- |
| `hash(...xs)` | splitmix32 の混ぜ関数を畳み込む | シードとタグと番号から、32bit のシードを派生させる |
| `createRng(seed)` | sfc32 | 派生したシードから乱数列を出す |

1. マスターシードと用途のタグ、通し番号から `hash` で 32bit のシードを得る
2. そのシードを splitmix32 で 32bit × 4 語に展開し、sfc32 の初期状態にする
3. sfc32 の最初の 15 個の出力を捨ててから使う

**splitmix32**: 入力に定数 `0x9E3779B9` を足し、xorshift と乗算で混ぜる関数です。1bit 違う入力でも出力が大きく変わる（雪崩性）ため、近い入力（8bar の番号 n と n+1 など）から無相関なシードが得られます。単体では周期が 2^32 で本体には向かないので、ハッシュと初期状態の展開にだけ使います。

**sfc32**: PractRand の作者による Small Fast Chaotic 生成器です。状態は a, b, c とカウンタ d の 128bit で、1ステップは加算・XOR・シフト・回転だけです。カウンタにより最短周期 2^32 が保証され、平均ではほぼ 2^127 です。似た初期状態だと最初の数出力が似る弱点があるので、splitmix32 で状態を作り、空回ししてから使います。

`Rng` は `u32()`（32bit 整数）、`float()`（[0, 1)）、`int(n)`（[0, n) の整数）、`chance(p)` を持ちます。重み付きの選択は `pickWeighted`・`weightedIndex` です。

### タグ

タグは文字列ではなく、互いに異なる整数の定数（`TAG`）です。ハッシュを 32bit の整数演算だけで計算するためです。2つの用途が同じタグを使うと、同じ乱数列を共有してしまうので、値はすべて異なります。

| タグ | 値 | タグ | 値 |
| --- | --- | --- | --- |
| `section` | 1 | `subPitch` | 12 |
| `fill` | 2 | `progression` | 13 |
| `base` | 3 | `reeseStyle` | 14 |
| `mutate` | 4 | `reeseRhythm` | 15 |
| `phrase` | 5 | `reesePitch` | 16 |
| `mutate32` | 6 | `stabStyle` | 17 |
| `transition` | 7 | `stabRhythm` | 18 |
| `ornament` | 8 | `cycle` | 19 |
| `thin` | 9 | `layout` | 20 |
| `subStyle` | 10 | `modulation` | 21 |
| `subRhythm` | 11 | `timbre` | 22 |
| | | `dropLeadIn` | 23 |
| | | `harmonyColor` | 24 |

2bar の関係には `REL = { repeat: 1, variant: 2 }` を、ドラムのパートには `PART_TAG = { kick: 1, snare: 2, hat: 3, ghost: 4 }` を使います。

### シードの派生

| 用途 | 派生 |
| --- | --- |
| サイクル | `cycle = hash(master, TAG.cycle, サイクルの番号)` |
| 32bar | `phrase = hash(master, TAG.phrase, 32bar の通し番号)` |
| 8bar | `section = hash(phrase, TAG.section, sectionIn32)` |
| 装飾 | `hash(section, TAG.ornament, REL[2bar の関係])` |
| 8bar の終わりのフィル・大きなフィル | `hash(section, TAG.fill)` |
| 最初の基準パターン | `hash(phrase, TAG.base)` |
| 強い変異 | `hash(phrase, TAG.mutate32, PART_TAG[パート])` |
| 変奏の変異 | `hash(section, TAG.mutate, PART_TAG[パート])` |
| 転換のパターン | `hash(phrase, TAG.transition, 試行番号)`。11回とも外れたときの強い変異は `hash(phrase, TAG.transition)` から |
| 間引き | `hash(section, TAG.thin, PART_TAG[パート])` |
| レイアウト | `hash(cycle, TAG.layout)` |
| ドロップの入り方 | `hash(cycle, TAG.dropLeadIn)` |
| 主進行の選択 | `hash(cycle, TAG.progression)` |
| 転換進行の選択 | `hash(phrase, TAG.progression)` |
| 色付け | 主進行は `hash(cycle, TAG.harmonyColor)`、転換進行は `hash(phrase, TAG.harmonyColor)` |
| 移調 | `hash(cycle, TAG.modulation)` |
| 音色 | `hash(cycle, TAG.timbre)` |
| 音程のあるパートの型 | A 系は `hash(cycle, TAG.xxxStyle)`、B は `hash(phrase, TAG.xxxStyle)` |
| 音程のあるパートのフレーズ（リズムと音高） | A 系は `hash(cycle, TAG.xxxRhythm / xxxPitch, REL[2bar の関係])`、B は `hash(section, …)` |

パッドと FX は乱数を使いません。

### 使い方の規約

- 乱数列は用途ごとに別々に作り、用途をまたいで共有しない。装飾の引き方が変わってもフィルの列がずれないようにするため。ドラムの変異はパートごとに別の列にする
- 装飾の乱数列は2bar ごとに作り直し、前の2bar の状態を引き継がない。同じ8bar の反復の2bar で同じ装飾を再現するため
- 引く回数がパラメーターや状態で変わらないようにする。条件によって使う・使わないが分かれる場合も、先に引いてから判定する。判定が外れても、候補がなくても引く
- 新しい用途は新しいタグから派生させ、既存の乱数列の引き方を変えない
- `Math.random()` は使わない

## 決めた理由

| 要件 | 理由 |
| --- | --- |
| 高速であること | 2bar の生成を 5ms 以内に終えるため（[品質の要件](../quality/requirements.md)） |
| 環境間で完全に同じ列を出すこと | 32bit の整数演算（`Math.imul`、`>>>`）だけで書き、ブラウザと Node.js（シミュレーション）で一致させる |
| 近いシードから似た列が出ないこと | 8bar の通し番号 n と n+1 のような近い入力から、互いに無相関な列を得る |
| 初期化が安く、状態が小さいこと | 2bar ごとに乱数列を作り直して使い捨てにする |
| 偏りが耳に出ない品質であること | 暗号強度は要らない。PractRand などで実績のあるものを使う |
| 短く、自前で固定できること | ライブラリの更新で列が変わらないよう、テストベクタで出力を固定する |

**採らなかった候補**

| 候補 | 見送った理由 |
| --- | --- |
| `Math.random()` | シードを指定できず、再現性がない |
| mulberry32 | 最速で最短だが、状態が 32bit で品質の余裕が小さい |
| xoshiro128\*\* | 品質は十分だが、sfc32 と比べて利点が少ない |
| PCG32 | 64bit の乗算が要り、JS では BigInt を使うことになって遅い |

**キーをシードに混ぜない理由**: 初期キーは音高の移調だけに効かせ、同じシードならキーが違っても同じ展開を移調したものになるようにするため。サイクルごとの移調も、初期キーではなく乱数と `m32` だけから決めます（[和声](./harmony.md)）。
