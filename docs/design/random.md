# 乱数設計

生成のランダム性はすべて自前実装の擬似乱数生成器から得ます。シードの派生には splitmix32、乱数列の生成には sfc32 を使い、役割を「混ぜる」と「列を出す」に分けます。

## 要件

| 要件 | 理由 |
| --- | --- |
| 高速であること | 2bar の生成を 5ms 以内に終える（N-03） |
| 環境間で完全に同じ列を出すこと | 32bit 整数演算（`Math.imul`、`>>>`）だけで書き、ブラウザと Node で一致させる（N-05、シミュレーション） |
| 近いシードから似た列が出ないこと | 8bar の通し番号 n と n+1 のような近い入力から、互いに無相関な列を得る |
| 初期化が安く状態が小さいこと | 2bar ごとに生成器を作り直し、使い捨てにする |
| 偏りが耳に出ない品質であること | 暗号強度は不要。PractRand 等で実績のあるものを使う |
| 短く、自前で固定できること | ライブラリ更新で列が変わらないよう、テストベクタで出力を固定する |

## 構成

1. マスターシードと用途タグ、通し番号から `hash` で 32bit のシードを得る
2. そのシードを splitmix32 で 32bit × 4 語に展開し、sfc32 の初期状態にする
3. sfc32 の最初の 15 個の出力を捨ててから使う

### splitmix32（シード派生）

入力に定数 `0x9E3779B9` を足し、xorshift と乗算で混ぜるだけの関数です。1bit 違う入力でも出力が大きく変わる（雪崩性）ため、近い入力から無相関なシードが得られます。単体では周期が 2^32 で本体には向かないため、ハッシュと初期状態の展開にだけ使います。

### sfc32（本体）

PractRand の作者による Small Fast Chaotic 生成器です。状態は a, b, c とカウンタ d の 128bit で、1ステップは加算・XOR・シフト・回転だけです。カウンタにより最短周期 2^32 が保証され、平均ではほぼ 2^127 です。似た初期状態だと最初の数出力が似る弱点があるため、splitmix32 で状態を作り、空回ししてから使います。

## 実装案

```ts
// random/rng.ts
const GOLDEN = 0x9e3779b9;

function mix32(x: number): number {
  let t = (x + GOLDEN) | 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  return (t ^ (t >>> 15)) >>> 0;
}

// 用途タグは文字列ではなく固定の整数定数にする
export const TAG = { section: 1, fill: 2 } as const;
export const REL = { repeat: 1, variant: 2 } as const;

export function hash(...xs: number[]): number {
  let h = 0;
  for (const x of xs) h = mix32(h ^ x);
  return h;
}

export function createRng(seed: number) {
  let s = seed | 0;
  const next32 = () => (s = (s + GOLDEN) | 0, mix32(s - GOLDEN));
  let a = next32(), b = next32(), c = next32(), d = next32();
  const u32 = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 15; i++) u32();
  const float = () => u32() / 4294967296; // [0, 1)
  return {
    u32,
    float,
    int: (n: number) => Math.floor(float() * n),
    chance: (p: number) => float() < p,
  };
}
```

シードの派生は MVP要件定義書のとおりです。

- `section = hash(master, TAG.section, 8bar の通し番号)`
- `ornament = hash(section, REL[relation])`
- `fill = hash(section, TAG.fill)`

## 使い方の規約

- 生成器は用途ごとに別々に作り、用途をまたいで共有しない（装飾の引き方が変わってもフィルの列がずれないようにする）
- 装飾用の生成器は2bar ごとに `seeds.ornament` から新しく作り、前の2bar の状態を引き継がない
- 引く回数がパラメーターや再生タイミングで変わらないようにする。条件によって引く・引かないが分かれる場合も、先に引いてから判定する
- `Math.random()` は使わない

## テスト

- テストベクタ: 既知のシードに対する `hash` と `createRng` の先頭数個の出力を、実装時に記録して固定する
- 環境間一致: 同じテストベクタをブラウザと Node の両方で検証する
- 分布: シミュレーションツールで `float()` の分布と `int(n)` の偏りを集計し、目立つ偏りがないことを確認する

## 採用しなかった候補

| 候補 | 見送った理由 |
| --- | --- |
| `Math.random()` | シードを指定できず、再現性がない |
| mulberry32 | 最速・最短だが状態が 32bit で、品質面の余裕が小さい |
| xoshiro128\*\* | 品質は十分だが、sfc32 と比べて利点が少ない |
| PCG32 | 64bit 乗算が必要で、JS では BigInt を使うことになり遅い |
