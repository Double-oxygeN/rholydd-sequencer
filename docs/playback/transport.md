# トランスポート（再生・一時停止・再開・停止）

2bar ごとの生成の要求と予約、再生の状態、一時停止と再開の仕組みをまとめます。音の経路とオートメーションは [音](./sound.md) に書きます。

関係するコード: `src/engine/transport.ts`、`src/engine/playhead.ts`、`src/engine/resume.ts`、`src/engine/automation.ts`（`fxStateAt`）、`src/engine/audio.ts`（`open`・`silence`）
関係するテスト: `tests/playback/transport.test.ts`

## 振る舞い

### 状態

| 状態 | 再生ボタン | 停止ボタン | BPM・初期キー | 位置の表示 |
| --- | --- | --- | --- | --- |
| 停止 | 再生 | 押せない | 変えられる | 表示しない |
| 再生中 | 一時停止 | 押せる | 変えられない | 進む |
| 一時停止中 | 再開 | 押せる | 変えられない | 止めた位置を保つ |

- 再生は止めるまで続く。停止の後の再生は、同じシードなら最初から同じ展開を再現する
- 停止すると、全パート・リバーブの残響・FX・予約済みのダッキングとオートメーションがすぐに止まり、フィルターは開いた状態に戻る。次の再生に、前の再生の音やオートメーションが残らない
- 一時停止すると、停止と同じく音を短いフェードですぐに止める。再開すると、一時停止した時点でまだ鳴っていなかった最初のステップ（16分音符）から鳴らす
- iOS で画面をロックしたときなど、システムが音を止めたときも一時停止になる（[連携](../interface/integration.md#システムによる中断)）
- 変化率・フィル強度・エネルギーの起伏・ミキサーは、どの状態でも変えられる。一時停止中に変えた値は、再開した後にまだ生成していない2bar から効く

### 再開したときに鳴るもの

| 対象 | 扱い |
| --- | --- |
| ドラム | 再開位置以降の打音だけ |
| 音程のあるパート | 再開位置以降に始まるノートと、再開位置をまたいで鳴っていたノート。またいでいたノートは、再開位置から残りの長さで鳴らし直す |
| ライザー、スイープ | 再開位置での値から続ける。値は、一時停止しなかった場合のその位置の値と同じ |
| パッドのゲート | 溜め（`cut`）の中で再開したら閉じた状態から始め、2bar の終わりで開く |
| インパクト、リバーブスロー | 再開位置以降にあるものだけ |
| ダッキング | 再開位置以降のキックから予約し直す |
| リバーブの残響 | 一時停止の前の残響は鳴らさない（一時停止で切る） |

再開した後に生成・再生されるイベント列・FX・オートメーションの値は、一時停止しなかった場合と同じです。一時停止の長さとタイミングで展開は変わりません。

## 実装

### 予約

- `Tone.getTransport().scheduleRepeat(cb, '2m', …)` のコールバックで、アンサンブルから次の2bar を取り、渡された時刻を基準に `時刻 + step × 16分の秒数` で発音を予約する
- ノートを送るシンセは `ctx.timbre` の音色で選ぶ。ダッキングは実音側のキックから、FX は `fxAutomation` の点列で予約する
- 位置とグリッドの表示は `Tone.getDraw()` で発音の時刻に同期させ、2bar の頭（`pairStarted`）と各ステップ（`stepStarted`）で呼ぶ
- AudioContext は `latencyHint: 'playback'` と、Tone.js の既定（0.1 秒）より長い先読み（0.25 秒）で作り、Tone.js の Worker のクロックで刻む

### セッションの型

```ts
interface Sequencer { start(settings: PlaybackSettings): PlayingSession }
interface PlayingSession { readonly state: 'playing'; pause(): PausedSession; stop(): void }
interface PausedSession  { readonly state: 'paused';  resume(): PlayingSession; stop(): void }
type PlaybackSession = PlayingSession | PausedSession;
```

`main.ts` は `PlaybackSession | null` を持ちます（`null` が停止中）。ボタンの表示と押せるかどうかは、この値の `state` だけから決めます。BPM・シード・初期キー・調整用の数値は `start` の引数として渡し、再生中は変えられない API にしています。

### 開始と再開

開始と再開を同じ関数 `play(settings, generate, from: ResumePoint)` で扱います。開始は「保留の2bar がなく、ステップ0から」の再開です。

1. `time = Tone.now()` を再開の時刻とする
2. `instruments.open(time, …)` で、新しいシンセ・サンプラー・リバーブを用意し、再開位置の値からオートメーションを始める
3. 最初の2bar を、仮想の開始時刻 `time − step × 16分の秒数` で予約する。イベントは `eventsFrom(events, step)`、FX は `fxAutomation(fx, 仮想の開始時刻, 16分の秒数, …, step)`、ダッキングは `eventsFrom` の後のキック、描画の呼び出しはステップ `step` 以降
4. Transport を `time` から始め、`(32 − step) × 16分の秒数` 後から2bar ごとに繰り返す。繰り返しのたびに `pairSource(pending, generate)` から次の2bar を取る

### 一時停止

1. `cutTime = Tone.immediate()`（先読みを含まない今の時刻）とし、`locate` で `ResumePoint` を求める
2. Transport を止めて予約を取り消し、描画の予約も取り消す
3. `instruments.silence(cutTime)` で音を切る

予約した2bar は `ScheduledPair`（開始時刻と2bar）の列に足し、鳴り終わってから1秒より古いものは捨てます。

```ts
type ResumePoint =
  | { readonly pending: readonly []; readonly step: Step & 0 }
  | { readonly pending: readonly [EnsemblePair, ...EnsemblePair[]]; readonly step: Step };
function locate(scheduled: readonly ScheduledPair[], cutTime: Seconds, stepSeconds: number): ResumePoint;
function pairSource(pending: readonly EnsemblePair[], generate: () => EnsemblePair): () => EnsemblePair;
function eventsFrom(events: readonly NoteEvent[], from: Step): readonly NoteEvent[];
```

| 関数 | 内容 |
| --- | --- |
| `locate` | `cutTime` を含む2bar で `step = ceil((cutTime − 開始) / 16分の秒数)` を求める。32 なら次の2bar のステップ0。`cutTime` が最初の2bar より前ならステップ0。返す `pending` は、その2bar と列でそれより後ろにある生成済みの2bar。すべて鳴り終わっていれば空 |
| `pairSource` | 保留の2bar を先に、使い切ったら `generate` で生成した2bar を返す |
| `eventsFrom` | ドラムは `step ≥ from` だけ。音程のあるノートは、`step ≥ from` ならそのまま、またいでいれば `step = from` で残りの長さ、`step + length ≤ from` なら除く。`from = 0` ではそのまま返す |

再開するセッションの `generate` には、一時停止したセッションの取り出し元をそのまま渡します。前の一時停止で保留したまま予約していない2bar が残っていることがあるためです。

再開位置の値（`fxStateAt`）と、`from > 0` の `fxAutomation` は [音](./sound.md#再開位置の値) に書きます。

### 停止

Transport を止めて予約と描画の予約を取り消し、`instruments.silence(Tone.now())` を呼びます。次の再生ではアンサンブルを作り直します。

## 決定理由

- **2bar ごとにまとめて予約する**: 生成の単位に合わせ、トランスポートのコールバックの数を抑えるため。予約した時刻で発音するので、聴感上のズレや揺れが出ない
- **先読みを長めにする**: タブを切り替えたりメインスレッドが一時的に重くなったりしても、音が途切れないようにするため。タブが隠れたときにタイマーが間引かれても、Worker のクロックと先読みで予約が間に合う
- **再生のたびにアンサンブルを作り直す**: 同じシードを最初から再現するため
- **一時停止を、Transport を止めるだけにしない**: 2bar ごとの生成結果は頭で Web Audio に一括して予約しているので、Transport を止めるだけでは予約済みの残りの音が鳴り続けるため。そこで停止と同じく音を切り、生成済みの2bar を手元に残す
- **16分音符の単位で再開する**: 聴いた部分を聴き直さず、聴いていない部分も飛ばさないため。2bar や小節の頭まで戻すと、聴いた部分を聴き直すことになる。止めた時点で鳴っていたステップは鳴らし直さず、同じ打音が2度聞こえないようにする
- **生成済みの2bar を捨てない**: 生成し直すとアンサンブルの状態（ラッチ、基準パターン、サイクル）が進みすぎ、一時停止しなかった場合と展開が変わってしまうため。2度生成しないので、取り出す2bar の列が一致する
- **一時停止で残響まで切る**: 一時停止中に音が残ると止まったように聞こえず、再開のときに古い残響が新しい音に重なるため
- **`cutTime` に出力の遅延を足さない**: 出力の遅延（数十 ms）は1ステップ（174 BPM で約 86 ms）より短く、ずれても高々1ステップのため
- **Transport の位置を使わない**: 再開のたびに Transport を0から始め直すので、位置は再生を始めてからの時間と一致しないため。小節とサイクルの累計は `Context` の `bar` と `cycle` から求める
- **状態を型で表す**: 一時停止中に一時停止する、停止中に再開する、といった不正な操作を型で書けないようにするため
