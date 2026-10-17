# 和声

キーと音階、コードとテンションの表、借用和音、進行の表と色付け、サイクルごとの主進行と移調をまとめます。各パートがコードをどう鳴らすかは [音程のあるパート](./pitched-parts.md) に書きます。

関係するコード: `src/structure/key.ts`、`src/structure/chords.ts`、`src/structure/harmony.ts`、`src/structure/conductor.ts`
関係するテスト: `tests/generation/harmony.test.ts`

## 振る舞い

### キーと音階

キーは主音の12音のどれかで、旋法はナチュラルマイナーに固定します。既定の初期キーは F（F, G, A♭, B♭, C, D♭, E♭）です。初期キーは最初のサイクルのキーで、2つ目以降のサイクルのキーは移調で決まります。

### コード

コードは、ナチュラルマイナーのダイアトニック4和音6つ（ii を除く）と、借用和音3つです。

| コード | 種類 | ルート（主音から） | テンション | F マイナーでの例 |
| --- | --- | --- | --- | --- |
| i | m7 | 0 | 9度、11度 | Fm7、Fm9（G）、Fm11（B♭） |
| III | maj7 | 3 | 9度 | A♭maj7、A♭maj9（B♭） |
| iv | m7 | 5 | 9度、11度 | B♭m7、B♭m9（C）、B♭m11（E♭） |
| v | m7 | 7 | 11度 | Cm7、Cm11（F） |
| VI | maj7 | 8 | 9度、♯11度 | D♭maj7、D♭maj9（E♭）、D♭maj7♯11（G） |
| VII | 7 | 10 | 9度、13度 | E♭7、E♭9（F）、E♭13（C） |
| IV7（ドリアから借用） | 7 | 5 | 9度 | B♭7、B♭9（C） |
| ♭IImaj7（フリギアから借用） | maj7 | 1 | 9度 | G♭maj7、G♭maj9（A♭） |
| V7（和声的短音階から借用） | 7 | 7 | ♭9度 | C7、C7♭9（D♭） |

| 種類 | 構成音（ルートからの半音） |
| --- | --- |
| m7 | 0, 3, 7, 10 |
| maj7 | 0, 4, 7, 11 |
| 7 | 0, 4, 7, 10 |

| テンション | ルートからの半音 |
| --- | --- |
| ♭9度 | 1 |
| 9度 | 2 |
| 11度 | 5 |
| ♯11度 | 6 |
| 13度 | 9 |

- 表のテンションは、どれもキーのナチュラルマイナーの音。音階の外に出るのは借用和音の構成音（IV7 の6度を半音上げた音、♭IImaj7 の2度を半音下げた音、V7 の導音）だけ
- 除いたテンション: v の9度（D は音階外で、音階内の D♭ は短9度になる）、III と VII の11度（3度と短9度でぶつかる）

### 借用和音

| 元のコード | 借用和音 | 借用元 | 音階外の音 | ねらい |
| --- | --- | --- | --- | --- |
| iv | IV7 | ドリア | 6度を半音上げた音 | 長3度で明るく浮く。リキッド系でよく使う色 |
| iv | ♭IImaj7 | フリギア | 2度を半音下げた音 | 半音上のルートで暗く沈む。ニューロ系でよく使う色 |
| v | V7 | 和声的短音階 | 7度を半音上げた音（導音） | i への引力を強める |

### 進行

8bar の進行は、8bar の中の2bar に1つずつ割り当てる4コードです。骨組みを表から選び、それを色付けします。

**主進行**（A 系。i で始める）

| # | 骨組み |
| --- | --- |
| 1 | i – VI – III – VII |
| 2 | i – VII – VI – VII |
| 3 | i – iv – VI – VII |
| 4 | i – VI – iv – v |
| 5 | i – i – VI – VII |
| 6 | i – III – VII – VI |
| 7 | i – iv – VII – III（平行長調の ii–V–I を通る） |
| 8 | i – VI – VII – v（v で終わり、次の8bar の頭の i に解決する） |

**転換進行**（B。i 以外で始め、i 以外で終える）

| # | 骨組み |
| --- | --- |
| 1 | VI – VII – i – VII |
| 2 | iv – v – VI – VII |
| 3 | VI – III – VII – VII |
| 4 | iv – VI – VII – VII |
| 5 | VI – VII – iv – v |

どの8bar の境界をまたいでも、同じコードが4bar（2bar×2）を超えて続きません。

**色付け**: 各コードに、確率で借用和音への置き換えとテンションを加えます。確率の既定値は `generation.harmony.borrowChance` と `tensionChance`（`config.example.json`）にあります。

- iv と v の位置のコードを、確率 `borrowChance` で借用和音に置き換える。iv は IV7 か ♭IImaj7 を均等に、v は V7
- 各コード（置き換えた後）に、確率 `tensionChance` で、そのコードの表からテンションを1つ均等に選んで加える

| 進行 | 骨組みと色付けを決めるとき | 共有する範囲 |
| --- | --- | --- |
| 主進行 | サイクルの頭。最初のサイクルでは表全体から選ぶ。2つ目以降では確率 `m32` で今と異なる骨組みに替え、外れたら色付けごと引き継ぐ | サイクルの中の A 系 |
| 転換進行 | 32bar の頭で表から選ぶ | その32bar の B |

色付けした主進行は主題の一部で、ドロップ2で主題が戻るときも借用和音とテンションが同じ形で戻ります。

### 移調

2つ目以降のサイクルの頭で、確率 `m32 × modulationShare` で、前のサイクルのキーの属調（完全5度上）か下属調（完全4度上）に、0.5 ずつの確率で移調します。外れたら前のサイクルのキーのままです。`modulationShare` の既定値は `generation.harmony.modulationShare` にあります。

- 移調先は、初期キーとの関係によらず、前のサイクルのキーだけから決める
- 移調は主進行の交替とは独立に決める
- 各パートはどのキーでも決められた音域に折り返すので、移調しても音域は変わらない

## 実装

### 型

```ts
type DiatonicSymbol = 'i' | 'III' | 'iv' | 'v' | 'VI' | 'VII';
type BorrowedSymbol = 'IV7' | 'bIImaj7' | 'V7';
type ChordSymbol = DiatonicSymbol | BorrowedSymbol;
type OffTonic = Exclude<DiatonicSymbol, 'i'>;

const CHORDS = { i: { root: 0, quality: 'minor7', tensions: ['ninth', 'eleventh'] }, /* … */ }
  as const satisfies Readonly<Record<ChordSymbol, ChordSpec>>;
type TensionOf<S extends ChordSymbol> = (typeof CHORDS)[S]['tensions'][number];
type Colored<S extends ChordSymbol> = S extends ChordSymbol ? { symbol: S; tension: TensionOf<S> | null } : never;
type ColoredChord = Colored<ChordSymbol>;

const BORROWINGS = { iv: ['IV7', 'bIImaj7'], v: ['V7'] } as const;
type ColoredAt<D extends DiatonicSymbol> = Colored<D | 借用できるコード>;

type MainSkeleton = readonly ['i', DiatonicSymbol, DiatonicSymbol, DiatonicSymbol];
type TransitionSkeleton = readonly [OffTonic, DiatonicSymbol, DiatonicSymbol, OffTonic];
interface MainProgression {
  readonly skeleton: MainSkeleton;
  readonly chords: readonly [Colored<'i'>, ColoredChord, ColoredChord, ColoredChord];
}
interface TransitionProgression {
  readonly skeleton: TransitionSkeleton;
  readonly chords: readonly [ColoredAt<OffTonic>, ColoredChord, ColoredChord, ColoredAt<OffTonic>];
}
```

- コードの表を `as const satisfies` にして、表のテンションをそのまま型に引く。表にテンションを足せば型も広がり、表から消せばそのテンションを作るコードは型エラーになる
- 主進行の先頭は `Colored<'i'>` で、借用和音にもならない。転換進行の両端は i 以外のコードとその借用和音に限るので、色付けしても「i で始めず i で終えない」が崩れない
- 骨組みを残すのは、主進行を替えるときに「今と異なる」を骨組みで比べるためと、シミュレーションで骨組みごとの出現数を数えるため

### 関数

| 関数 | 役割 |
| --- | --- |
| `chordToneClass(key, chord, tone)` | 構成音（`root`・`third`・`fifth`・`seventh`）のピッチクラス |
| `tensionClass(key, chord)` | テンションのピッチクラス。なければ `null` |
| `chordClasses(key, chord)` | 上モノが鳴らせる音（構成音とテンション） |
| `chordName`・`romanName`・`skeletonName` | `D♭maj7`・`VI(♯11)`・`i–VI–III–VII` のような名前（シミュレーションの表示） |
| `colorMain`・`colorTransition` | `hash(seed, TAG.harmonyColor)` から、4つのコードの順に、コードごとに「借用の判定」「借用和音」「テンションの判定」「テンション」の4つの float を引く。判定が外れても、候補がなくても4つとも引く（主進行の先頭の借用の判定も引いて捨てる） |
| `cycleMainProgression(previous, cycleSeed, m32, tuning)` | `hash(cycleSeed, TAG.progression)` から「変化の判定」「骨組み」の2つを引く。新しい骨組みを選んだときだけ色付けする |
| `phraseTransitionProgression(phraseSeed, tuning)` | `hash(phraseSeed, TAG.progression)` から3つ引き、3つ目で骨組みを選ぶ。最初の2つは引いて捨てる |
| `cycleModulation(previous, cycleSeed, m32, share)` | `hash(cycleSeed, TAG.modulation)` から「移調の判定」「向き」の2つを引く。最初のサイクルでは呼ばない |
| `keyAt(initialKey, fifths)`・`stepFifths(fifths, step)` | 初期キーから五度圏を `fifths` 歩（1歩で属調）進んだキー。`fifths` は 0〜11 に折り返す |

コンダクターは、キーそのものではなく移調の幅（`FifthsFromInitial`）をサイクルごとに保持し、`keyAt(initialKey, fifths)` で `Context` の `key` を求めます。

## 決めた理由

- **ナチュラルマイナーに固定する**: 構成音を鳴らす限り音階外の音が出ず、調性が崩れないため。平行調と同主調への転調は、長調の旋法を導入しないと表せないので扱わない
- **ii を使わない**: ルートと5度が減5度になり、サブベースが5度を選ぶと低域で三全音が鳴るため。借用和音は、どれもルートと5度が完全5度なので当たらない。V7 の3度と7度の三全音は、上モノとベースで鳴る属和音の響きとして許容する
- **A 系で同じ主進行、B で i 以外から始まる転換進行**: A に戻る感覚を和声でも保つため。主進行と転換進行は表が別なので、B の進行は必ず A と異なる。転換進行の多くを VI か iv で始めるのも、B で中心を移すため
- **転換進行を i で終えない**: i で始まる A'' と i が続かないようにするため。i で終わる進行（VI – VII – i – i）では、主進行の i – i – VI – VII と続くと i が8bar 鳴り続け、間延びして聞こえた
- **主進行を `m32` で引き継ぐ**: ドラムの基準パターンと同じく、変化の量を1つのパラメーターでまとめて操作できるようにするため。引き継ぐときに色付けだけを選び直さないのも、同じ考え方を保つため
- **骨組みはそのままに色付けする**: どのコードも同じ音階の中で響くと、サイクルを重ねても和声の色合いが変わりにくい。進行の骨組みは保ったまま、テンションと借用和音で色を足す
- **テンションを5度と置き換える**: 5度はルートと完全5度で溶け合い、抜いてもコードの種類が変わらない音だから。足さずに置き換えるのは、スタブとパッドの同時発音数の見積もりを変えないため
- **テンションを上モノだけに置く**: 低域でテンションを鳴らすと、ルートとの濁りが目立ち、キックとサブベースの釣り合いも崩れるため
- **借用を iv と v に限る**: どちらも機能（下属音と属音）を保ったまま置き換えられ、前後のコードとのつながりが崩れないため。i・III・VI・VII は、ナチュラルマイナーの響きの土台なので置き換えない
- **主進行に iv か v を含む進行を2つ加えた**: 借用和音は iv と v の位置でしか出ないので、出る機会を増やすため。転換進行は5つのうち3つが iv か v を含むので変えない
- **確率の既定値（試聴で確定）**: `borrowChance` は、iv か v を含む主進行（8つのうち4つ）のサイクルの約4分の1で、少なくとも1つの借用和音が鳴る値。転換進行は32bar ごとに選び直すので、借用和音は B でより多く鳴る。音階の外に出る借用和音は、多すぎると調性の土台が揺らぐので、主題ではまれな「顔」に留め、B で色合いの変化を担わせる配分にした。`tensionChance` は、テンションのないコードをやや多くして地とし、テンションのあるコードを色として浮かせる値。初めは借用 0.4・テンション 0.5 としたが、設定ファイルで値を変えながら試聴して今の値にした
- **色付けを新しいシードから引く**: 既存の乱数列の引き方を変えないため
- **移調する理由**: 主題とグルーヴを入れ替えても、キーがずっと同じだと、どのサイクルも同じ響きの上で鳴り、続けて聴くと区別がつきにくくなるため
- **移調先を属調と下属調に限る**: 同じ旋法で表せる近親調はこの2つで、どちらも元のキーと音階の6音を共有するので、移っても響きが急に変わりすぎない。DJ がキーの合う曲をつなぐときに五度圏で隣のキーを選ぶ（ハーモニックミックス）のと同じ関係
- **移調先を前のサイクルのキーだけから決める**: DJ ミックスでは、つなぐ曲どうしのキーが合っていればよく、最初の曲のキーに戻る必要はない。移調を重ねるうちに五度圏を巡り、最短で3つ目のサイクルには初期キーとも、その属調・下属調とも異なるキーに着くので、1時間の中で出会う響きの種類が増える。五度圏は12歩で一巡するので際限なく遠ざかることはなく、向きは毎回 0.5 ずつなので初期キーの近くに戻ることも多い
- **移調の確率を `m32` の半分にする**: 移調は主進行の交替より目立つ変化で、続けて起きると落ち着かないため。既定の `m32 = 0.6` で 0.3 なので、1時間（約16サイクル）で4〜5回移調する
- **移調をサイクルの頭に置く**: イントロの最初の8bar はローパスを閉じたパッドと薄いドラムだけで始まるので、新しいキーの和声がこもった状態から現れ、唐突に聞こえない。主題とグルーヴも同時に入れ替わるので、「次の曲に移った」合図が強くなる
- **キーではなく移調の幅を持つ**: キーそのものを積み重ねて持つと、移調の幅が初期キーによらないこと（同じシードなら初期キーを変えても同じ幅だけ移調する）を保てなくなるため
