# 形式（2bar・8bar・32bar）

2bar・8bar・32bar の階層と区間の関係、エネルギーのカーブ、コンダクターが作るコンテキストをまとめます。サイクルとシーンは [アレンジ](./arrangement.md) に書きます。

関係するコード: `src/structure/form.ts`、`src/structure/conductor.ts`、`src/structure/energy.ts`（`sectionEnergy`）
関係するテスト: `tests/generation/form.test.ts`

## 振る舞い

### 8bar の中の2bar

| `pairIn8` | 関係 | 8bar 頭 | 8bar 終わり |
| --- | --- | --- | --- |
| 0 | 反復 | ○（変異の位置） | |
| 1 | 反復 | | |
| 2 | 反復 | | |
| 3 | 変奏 | | ○（フィルの位置） |

同じ8bar の中の反復の2bar（0〜2番目）は、同じ形で鳴ります。ドラムのイベント列は完全に一致し、音程のあるパートは発音位置・長さと、ベースの構成音の番号が一致します。2bar ごとにコードが変わるので、音高そのものは一致しません。スタブとパッドは、テンションの有無で構成音が変わるので、発音位置と長さだけが一致します。

### 32bar の中の8bar

| `sectionIn32` | 役割 | 関係 | ドラムの基本パターン | 音程のあるパート |
| --- | --- | --- | --- | --- |
| 0 | A | 反復 | 基準パターンそのもの | 主進行。サイクルの A 系の型とフレーズ |
| 1 | A' | 変奏 | 基準に8bar の変異（`m8`）をかけたもの | 同上 |
| 2 | B | 転換 | 重み表から新しく作ったもの | 転換進行。32bar ごとの B の型とフレーズ |
| 3 | A'' | 変奏 | 基準に8bar の変異をかけたもの。A' とは別のシード | 同上 |

32bar の最後の2bar（31〜32小節目）には、大きなフィルが入ります（[ドラム](./drums.md)）。

### エネルギー

8bar ごとのエネルギー `E`（0〜1）を、8bar の頭で決めます。

```
E = 1 − energyDepth × (1 − カーブの値)
```

カーブの値はシーンとシーン内の位置で決まり（[アレンジ](./arrangement.md#エネルギー)）、ドロップでは32bar の中の位置で決まる次のカーブを使います。

| 8bar | A | A' | B | A'' |
| --- | --- | --- | --- | --- |
| カーブ | 高め | さらに高く | 下げる | 最大 |

値の既定は `generation.energy.phrase`（`src/structure/tuning.ts`、`config.example.json`）にあります。`energyDepth = 0` なら常に `E = 1` です。

エネルギーは、ドラムの間引き・装飾の確率、リースベースとスタブの発音しやすさに効きます。

## 実装

コンダクター（`createConductor`）は、2bar の通し番号から `Context` を作ります。

| 欄 | 中身 |
| --- | --- |
| `bar`・`pair`・`section`・`phrase` | 再生を始めてからの小節・2bar・8bar・32bar の通し番号 |
| `PairRole` | `pairIn8`・`isSectionStart`・`isSectionEnd`・`relation`。8bar の最後の2bar だけが `fillIntensity` を持つ |
| `sectionRole`（`SectionRole`） | `sectionIn32`・`relation`・`isPhraseStart`・`isPhraseEnd` |
| `progression`（`SectionHarmony`） | その8bar の進行。B は転換進行、A 系は主進行 |
| `energy` | その8bar のエネルギー |
| `cycle`・`layout`・`sectionInCycle`・`sceneRole`・`nextScene` | サイクルとシーン（[アレンジ](./arrangement.md)） |
| `key`・`timbre` | そのサイクルのキーと音色 |
| `seeds` | `cycle`・`phrase`・`section`・`ornament`・`fill`（[乱数とシード](./random.md)） |
| `params` | ラッチした `m2`・`m8`・`m32` |

その2bar のコードは `chordOf(ctx) = ctx.progression.chords[ctx.pairIn8]` で求め、`Context` には持たせません。

`PairRole` と `SectionRole` は、それぞれ `pairIn8`・`sectionIn32` を判別子とする判別共用体です。8bar の頭なのに変奏、のような食い違った組み合わせを作れません。

## 決定理由

- **8bar を反復・反復・反復・変奏にする**: 3回の反復で形を耳に覚えさせ、4回目の変奏と8小節目のフィルで区切りを知らせるため
- **32bar を A A' B A'' にする**: 変奏と転換を毎回基準から作り直し、累積させないのは、A に戻る感覚で32bar のまとまりを聴き取れるようにするため。基準そのものは強い変異でだけ変わる（サイクルの頭とドロップの32bar の頭）
- **エネルギーを8bar の頭で決め、8bar の間は変えない**: 同じ8bar の反復の2bar を完全に一致させる規則を守るため
- **ドロップのカーブを B で下げ、A'' で最大にする**: 転換で一度引き、最後の8bar から大きなフィルを経て次の32bar の頭へつなげるため
- **反復のための仕組み**: 基本パターンは8bar の頭でしか書き換わらない。装飾の乱数列は2bar ごとに作り直し、反復の2bar では同じシードを使う。装飾に効く `m2` は8bar の頭でだけ読み取る。この3つで、反復の2bar が完全に一致する
- **位置をコンダクターの通し番号から決める**: 壁時計ではなく生成を要求した2bar の位置で決めるので、先読みの揺れで結果が変わらない
