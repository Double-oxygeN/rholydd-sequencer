# 連携（設定ファイル・URL・共有・メディア操作・配布）

ページの外とのつながりをまとめます。設定ファイル、クエリ文字列のシード、共有のダイアログ、OS のメディア操作、ドラムサンプル、アイコンと画像、配布と CI/CD です。

関係するコード: `src/params/config.ts`、`src/params/decode.ts`、`src/params/load-config.ts`、`src/params/query.ts`、`src/ui/share.ts`、`src/ui/media-session.ts`、`src/ui/playback.ts`、`src/app-name.ts`、`config.example.json`、`tools/make-samples.ts`、`tools/make-icons.ts`、`public/icons/*`、`index.html`、`tools/base-path.ts`、`vite.config.ts`、`.github/workflows/ci.yml`
関係するテスト: `tests/interface/integration.test.ts`、`tests/interface/screen.test.ts`（再生の命令）、`e2e/startup.spec.ts`、`e2e/share.spec.ts`、`e2e/media-session.spec.ts`

## 振る舞い

### 設定ファイル

`index.html` と同じ場所の `config.json`（開発中は `public/config.json`）を置くと、ページを開いたときに一度だけ読み、パラメーターとミキサーの初期値、生成と音の調整用の数値を上書きします。値を変えたら、ページを開き直します。

- 書かれているキーだけを上書きし、書かれていないキーはコードの既定値を使う。入れ子のグループの中でも、キーごとに上書きする
- ファイルがないときは、何も警告せずにコードの既定値で動く
- JSON として読めないときは、警告を出してコードの既定値で動く
- 型が違う値と範囲外の値は、そのキーだけ既定値に戻す
- 値どうしの関係が崩れるときは、その関係にあるキーをまとめて既定値に戻す
- 知らないキーは無視する
- 無視した値は1つずつブラウザのコンソールに警告し、1つでもあれば画面の状態表示に一言出す
- 設定ファイルの値が原因で起動に失敗することはない
- 同じシード・パラメーター・設定ファイルなら同じ展開になる。生成の数値を変えると、同じシードでも展開が変わる
- シミュレーションは `--config <パス>` で、同じ形式のファイルを同じ規則で読む

すべてのキーと既定値は `config.example.json` にあります。配布するページには設定ファイルを置きません（コードの既定値で動きます）。

| グループ | 内容 |
| --- | --- |
| `params` | パラメーターの初期値。BPM、音量、変化率3つ、フィル強度、エネルギーの起伏、初期キー（`F`・`F#`・`B♭` などの名前）、シード |
| `mixer` | 各チャンネルの音量・パン・センド・ミュート・ソロ |
| `ducking` | ダッキングの量と戻り時間 |
| `generation` | 和声の確率（テンション・借用・移調の割合）、32bar とシーンのエネルギー、レイアウトの確率、フィルの長さの重み、サブベースの跳躍の確率、ベースの構成音の重み、各パートとピックアップのベロシティ |
| `sound` | 音源のトリム、ダッキングのパートの比、リバーブ、コンプレッサーとリミッター、FX の周波数の範囲・ライザーの最大音量・スローの送り量・インパクトの音量 |

**関係の検証**

| 組 | 関係 | 根拠 |
| --- | --- | --- |
| `energy.scene.buildFirst`・`buildLast` と `energy.phrase.A` | `buildFirst ≤ buildLast ≤ A` | ビルドでエネルギーが単調に増え、ドロップの A を超えない |
| 重みの組（`dropExtension`・`fill.*`・`*ToneWeights`） | 合計が正 | すべて0では選べない |
| `fx.riser` | `lowHz < highHz` | 上がっていくライザーにする |
| `fx.highpass` | `openHz < closedHz` | |
| `fx.lowpass` | `closedHz < openHz` | |

パンとセンドのないチャンネル（キック・サブベース）にそのキーを書いたとき、`reverbReturn` に `soloed` を書いたときは、知らないキーとして無視します。`level` と `release` は整数に、パンは 0.01 刻みに丸めます（範囲内の値だけ）。

**上書きできないもの**

| 種類 | 例 | 理由 |
| --- | --- | --- |
| 表 | 進行、コードとテンション、音色、ドラムとパートの型の重み、シーンのパート構成、フィルの型 | 型で守っている不変条件（表にない音色やアボイドノートを作れないこと）が崩れ、実行時の検証で置き換えるには大きな改修が要るため |
| 構造 | 2bar・8bar・32bar の長さ、溜めの開始位置 | 生成の前提で、変えるとテストの多くが意味を失うため |
| クリック防止の時間 | ゲートやランプの長さ、レガートの隙間、先読みの時間 | 好みではなく、ノイズを出さないための値のため |
| 値の範囲と制約 | BPM の範囲、音量の範囲、各パートの音域、同時発音数とリリースの上限 | 設定ファイルの検証そのものの基準になるため |
| 乱数のタグ | `TAG` | 変えると同じシードで別の乱数列になり、再現性の意味が変わるため |

### クエリ文字列のシード

`?seed=12345` のように、ページの URL で初期シードを指定できます。

- 値はシードの欄と同じ規則（0〜4294967295 の10進の整数）で読む
- 初期シードは、クエリ文字列、設定ファイルのシード、乱数の順に、最初に有効な値を使う
- ページを開いたときに一度だけ読む。シードを変えても URL は書き換えない

### 共有

右上のメニューのボタンの左にある共有のボタンで、ダイアログを開きます。

| 要素 | 内容 |
| --- | --- |
| URL | 読み取り専用の欄。フォーカスすると全体を選択する |
| コピー | URL をクリップボードにコピーし、成否を一言出す（「コピーしました」）。クリップボードの API が使えないか失敗したときは、欄を選択した状態にして「選択した URL をコピーしてください」と出す |
| シードを含める | 初期値はオン。オフにすると、`seed` のない URL（開くたびに乱数のシード）になる |
| 閉じる | 閉じるボタン、ダイアログの外のクリック、Esc キーで閉じる |

- 共有する URL は、ページの URL からクエリ文字列とフラグメントを除き、チェックボックスがオンなら `seed` を加えたもの
- 共有するシードは、再生中と一時停止中は鳴っている展開のシード、停止中は次に再生するシードの欄の値
- 共有する URL に画面の言語を含めない。受け取った人は、自分のブラウザの言語で読む（[画面](./screen.md#言語)）
- ダイアログは開いている間、ページのほかの操作を受けない（モーダル）

### メディア操作

Media Session API で、再生の状態と曲名をブラウザと OS に伝え、メディアキー・ロック画面・通知の操作を受けます。

| 状態 | 伝える状態 | 受ける操作 |
| --- | --- | --- |
| 停止 | なし | 再生（最初から） |
| 再生中 | 再生中 | 一時停止、停止 |
| 一時停止中 | 一時停止中 | 再生（再開）、停止 |

| 操作 | 停止 | 再生中 | 一時停止中 |
| --- | --- | --- | --- |
| メディアの再生 | 再生を始める | なし | 再開 |
| メディアの一時停止 | なし | 一時停止 | なし |
| メディアの停止 | なし | 停止 | 停止 |

- 操作は画面のボタンと同じ動作にし、どちらから操作しても画面とメディア操作の表示がそろう
- 曲名はアプリの名前、アーティストの欄に鳴っている展開のシードを出す
- 再生中と一時停止中は、アートワークとしてアプリのアイコン（`icon-192.png`・`icon-512.png`）を渡す。停止中は曲名と一緒に消す
- ヘッドホンが抜けたときなど、ブラウザが無音の `audio` 要素を止めたときは一時停止する

### システムによる中断

iOS では、画面をロックしたときと、ほかのアプリやホーム画面に切り替えたときに、システムが音を止めます。

| 場面 | 振る舞い |
| --- | --- |
| 再生中に音が止められた | 一時停止の状態になり、画面とロック画面のメディア操作も「一時停止」を表示する。止まった位置を再開位置にする |
| 再開ボタン、ロック画面の再生 | 止まった位置の続きから鳴る（ロック中でも鳴る） |
| Safari に戻った | 一時停止のまま。再開ボタンで再開する |
| 消音のスイッチ | 影響しない（オンでもオフでも鳴る） |
| ロック画面から再生したあと Safari に戻った | 音は表示や操作と合ったまま鳴る |

### ドラムサンプル

`public/samples/drums/` の kick・snare・hat・ghost の WAV は、`tools/make-samples.ts`（`npm run samples`）で合成した自作の音です。リポジトリと同じ Apache License 2.0 で配布します。ノイズは自前の乱数から作るので、何度合成しても同じファイルになります。

### アイコンと画像

アイコンの絵柄は、名前の由来のニシブッポウソウ（roller）を、シーケンサーの 7×7 のマスで描いたものです。元の SVG（`public/icons/icon.svg`）を手で書き、ほかの画像は `tools/make-icons.ts`（`npm run icons`）が Playwright の Chromium で描いた PNG です。どれも自作で、リポジトリと同じ Apache License 2.0 で配布します。

| 画像 | 大きさ | 使い道 |
| --- | --- | --- |
| `icon.svg` | — | favicon（`<link rel="icon" type="image/svg+xml">`）と、ほかの画像の元 |
| `icon-192.png`・`icon-512.png` | 192・512 | マニフェスト、メディア操作のアートワーク |
| `icon-maskable-512.png` | 512 | マニフェストの `purpose: "maskable"`（Android のホーム画面）。絵柄を 76% に縮め、マスの四隅まで中央の円（直径の 80%）に収める |
| `apple-touch-icon.png` | 180 | iOS のホーム画面（`<link rel="apple-touch-icon">`）。角の丸めは iOS に任せ、四隅まで背景で塗る |
| `share.png` | 1200×630 | 共有したリンクのプレビュー。アイコン、アプリの名前、英語の短い説明 |

- 色は `tokens.css` の暗い配色から取る。アイコン自身が暗い背景を持つので、明るいタブバーでも暗いタブバーでも見分けられる
- PNG はコミットし、ビルドのたびには作らない。元の SVG を変えたら `npm run icons` で作り直す。同じ版の Chromium なら、何度描いても同じファイルになる（共有用の画像の文字は、描いた環境の `system-ui` のフォントで描く）

### 配布

| 項目 | 内容 |
| --- | --- |
| 配布先 | GitHub Pages。`https://gh.double-oxygen.net/rholydd-sequencer/` |
| base path | `/rholydd-sequencer/`。`package.json` の `name` から作る |
| CI | プルリクエストの作成と更新、main の更新で、型検査・単体テスト・ビルド・E2E テスト（3つのブラウザエンジン） |
| CD | main の更新で、CI が通ったら配布する |
| リリース | `v` で始まるタグを main に付け、GitHub Releases に利用者目線のリリースノートを手で書く（[リリースの確認](../quality/release-checklist.md)） |

## 実装

### 設定ファイル

```ts
interface Config {
  readonly params: InitialParams;          // seed だけは省略できる（Seed | undefined）
  readonly mixer: MixerSettings;
  readonly ducking: DuckingSettings;
  readonly generation: GenerationTuning;
  readonly sound: SoundTuning;
}
interface Decoded<T> { readonly value: T; readonly warnings: readonly string[] }
function parseConfigText(text: string): Decoded<Config>;   // JSON として読めなければ既定値と警告1つ
function decodeConfig(raw: unknown): Decoded<Config>;
function initialParams(config: Config, querySeed: Seed | undefined): Params;
async function loadConfig(url: string): Promise<Decoded<Config>>;
```

- `params/decode.ts` の小さな読み取り関数（`numberIn`・`bool`・`weights`・`related` など）を組み合わせたスキーマ（`CONFIG_SCHEMA`）で、既定値の形をたどって読む。各関数は「読んだ値か、既定値と警告」を返し、例外を投げない。警告には `generation.harmony.borrowChance` のような位置を含める。既定値の形をたどるので、既定値にないキーはすべて「知らないキー」として警告できる
- 渡し先: `params`・`mixer`・`ducking` はパラメーターのストアの初期値、`generation` はアンサンブル（作るときに渡す）、`sound` はエンジン（`loadInstruments`）

| 読み込みの状況 | 結果 |
| --- | --- |
| 404 などの失敗の応答 | 既定値。警告なし（ファイルがないのは正常） |
| 応答の Content-Type が JSON でない | 既定値。警告なし |
| 通信の失敗 | 既定値と警告 |
| JSON として読めない | 既定値と警告 |
| 読めた | `decodeConfig` の結果 |

`fetch` には `Accept: application/json` と `cache: 'no-store'` を付けます。

### 共有とシード

```ts
function seedFromQuery(search: string): Seed | undefined;
function shareUrl(page: string, seed: Seed | undefined): string;
```

ページの URL は `new URL(import.meta.env.BASE_URL, location.href)` とし、`location` を読むのは `main.ts` だけにします。`shareUrl` と `seedFromQuery` は Node.js 上でテストします。共有するシードは、`main.ts` が再生を始めるときに控えます。

ダイアログは `<dialog>` を `showModal()` で開き、開くたびにその時点のシードで URL を作り直します。外側のクリックは、`dialog` の余白を0にして中身を内側の要素に入れ、`pointerdown` と `click` の対象がどちらも `dialog` 自身のときだけ閉じます。結果の表示は `role="status"` の要素に出し、URL かチェックボックスが変わったら消します。

### メディア操作

```ts
type PlaybackCommand = 'start' | 'pause' | 'resume' | 'stop';
type MediaAction = 'play' | 'pause' | 'stop';
function toggleCommand(state: PlaybackState): Exclude<PlaybackCommand, 'stop'>;   // 再生のボタン
function mediaCommand(action: MediaAction, state: PlaybackState): PlaybackCommand | null;
function linkMediaSession(messages: Messages, artwork: readonly MediaImage[], onAction: (action: MediaAction) => void): MediaSessionLink;
```

- `navigator.mediaSession` がないブラウザでは、何もしない
- アートワークの URL は `main.ts` が `import.meta.env.BASE_URL` から作って渡す。ページの URL を読むのは `main.ts` だけにするため
- `show(state, seed)` は `playbackState` と `metadata` を更新する。停止中は `metadata` を消す。`setPositionState` は呼ばない（曲に終わりがないため）
- 無音の `audio` 要素は、10秒・8bit モノラルの無音の WAV（`silentWav()`）の Blob の URL を `loop` で鳴らし、`hidden` にして文書に置く。要素の `muted` と音量は変えない
- 再生中は `audio.play()`、一時停止中と停止では、鳴っているときだけ `audio.pause()` を呼ぶ。`play()` が拒否されても、音は Web Audio API から出ているので無視する
- 要素の `pause` イベントが、こちらから止めたのではないときに来たら、メディアの一時停止として扱う（`play()` が拒否されたときを除く）
- ブラウザが知らない操作の `setActionHandler` は例外になるので、操作ごとに捕まえる
- `start` は `Tone.start()` を待った後で、セッションがまだないことを確かめてから始める

### 中断（`main.ts`、`ui/playback.ts`）

```ts
type AudioState = AudioContextState | 'interrupted';   // Safari の iOS は標準にない 'interrupted' を返す
function interruptionCommand(audio: AudioState, state: PlaybackState): PlaybackCommand | null;
```

`main.ts` は AudioContext の状態の変化（Tone.js の `statechange`）を受け、`running` から外れたときに再生中なら、画面のボタンと同じ `run('pause')` を通して一時停止します。`resume` も `start` と同じく `Tone.start()` を待ってから再開し、システムに止められた AudioContext を起こします。

### base path とビルド

`tools/base-path.ts` が `package.json` の `name` から `/〈name〉/` を作り、`vite.config.ts` が `build` と `preview`（`isPreview`）の `base` にします。開発サーバー（`npm run dev`）はルートで開きます。サンプル・設定ファイル・共有する URL は `import.meta.env.BASE_URL` を基準にします。別の場所に配布するときは `npm run build -- --base /path/` で上書きできます。

### CI/CD（`.github/workflows/ci.yml`）

```
pull_request（作成・更新）・push（main だけ）
  ├─ check: npm ci → typecheck → test → build → dist/config.json がないことを確かめる → dist をアーティファクトに上げる
  ├─ e2e（matrix: chromium・firefox・webkit、check の後）
  │    npm ci → playwright install --with-deps → dist を受け取る → playwright test --project
  └─ deploy（main への push のとき、check と e2e のすべての後）
       dist を受け取る → actions/upload-pages-artifact → actions/deploy-pages
```

- ビルドは `check` で1回だけ行い、E2E テストと配布で同じ `dist` を使う
- E2E テストはブラウザごとにジョブを分け、失敗したら Playwright のレポートとトレースをアーティファクトに上げる
- `deploy` だけに `pages: write`・`id-token: write` を与え、`concurrency: pages`（実行中のものは止めない）にする
- プルリクエストでは、新しいプッシュが古い実行を止める。main では止めない

## 決定理由

- **設定ファイルを持つ**: 試聴で詰める数値を、ビルドし直さずに試せるようにするのと、配布先ごとに初期値を変えられるようにするため
- **範囲外の値を丸めて受け入れない**: 書き間違いに気づけるようにするため（パラメーターの `clampLevel` などは使わない）
- **関係の崩れた組をまとめて既定値に戻す**: 片方だけ戻すと、書いた人の意図とも既定値とも違う組み合わせになるため
- **トリムと補正を 0 dB 以下に限る**: 既定の釣り合いより大きくして、クリップしない保証を崩しにくくするため。とはいえ、クリップしないことと試聴の確認を保証するのは既定値だけで、設定ファイルで変えた値の音は保証しない
- **`Accept: application/json` を付ける**: Vite の開発サーバーは、`Accept` に `*/*` か `text/html` を含むリクエストで、ないファイルの代わりに `index.html` を返す（SPA のフォールバック）ため。Content-Type も確かめるのは、配布先のサーバーが同じことをしても「ファイルなし」と見なすため。`cache: 'no-store'` は、値を書き換えて開き直したときに古いファイルを使わないようにするため
- **設定ファイルを配布しない**: 手元で試した設定ファイルがコミットされて配布されないよう、`public/config.json` を `.gitignore` に入れ、CI でも `dist/config.json` がないことを確かめる
- **共有する URL に言語を含めない**: 共有するのはシードだけ、という決まりを保ち、受け取った人が自分の言語で読めるようにするため
- **共有するのはシードだけにする**: クエリ文字列で指定できるのはシードだけで、パラメーターや設定ファイルの値が違えば同じシードでも展開は変わる。再生中は欄ではなく鳴っている展開のシードを使うのは、欄は再生中にも書き換えられ、次に停止から再生したときに効くので、欄の値だと聴いている展開と違う URL になるため
- **ダイアログの外で閉じる**: メニューと違い、ダイアログは値を調整する場所ではなく、閉じても失うものがないため。`pointerdown` も確かめるのは、URL の欄で文字を選びながら外までドラッグしたときに閉じないようにするため
- **コピーに `execCommand('copy')` を使わない**: 非推奨のため。クリップボードの API は HTTPS でない配布先や、開発サーバーに LAN の IP で接続したときに使えないので、選択して手でコピーするよう促す
- **メディア操作のために無音の `audio` 要素を鳴らす**: ブラウザは Web Audio API の音だけではメディア操作を出さず、`audio` 要素の再生を手がかりにするため。10秒にするのは、Chrome が5秒以下のメディアに通知を出さないため。消音した要素は手がかりにされないので、`muted` と音量は変えない。文書に置くのは、メディアセッションをデスクトップにつなぐブラウザ拡張（KDE の Plasma Integration など）が、文書の外の要素を一度止めて鳴らし直し、それがブラウザによる一時停止に見えるため。読み込む前の要素の `pause()` は読み込みを始め、直後の `play()` を中断させるので、鳴っているときだけ止める
- **音を `MediaStreamAudioDestinationNode` から `audio` 要素に流さない**: 音の経路と遅延が変わり、リミッターの後のクリップの検出やクリック防止を確かめ直すことになるため
- **メディアの再生と一時停止を切り替えにしない**: OS が「再生」と「一時停止」を別の操作として送ってくるため。再生中に再生が来ても一時停止しない
- **`Tone.start()` の後にセッションを確かめる**: ユーザーの操作を待っている間に2度目の開始（メディア操作と画面のクリックなど）が来ると、同じ操作で両方の待ちが解け、セッションが2つできてしまうため
- **システムに止められたら一時停止にする**: そのままだと、音は止まっているのに、画面とロック画面は再生中を表示し続ける。一時停止にすると表示が実際の音と合い、止まった位置から聴き直せる。Safari に戻ったとき自動で鳴り直さず一時停止のまま待つのは、聴き手が操作していない間に音が鳴り出さないようにするため
- **再開でも `Tone.start()` を待つ**: システムに止められた AudioContext は、ユーザーの操作でしか起こせない。ロック画面の再生ボタンも操作として扱われるので、ロック中でも再開できる
- **ロック画面から再生した後に Safari に戻っても、AudioContext を作り直さない**: 1.0.0 では、戻った後に音が表示や操作より遅れて鳴り、Safari を閉じるまで続くことがあった（[Issue #1](https://github.com/Double-oxygeN/rholydd-sequencer/issues/1)）。遅れている間も `outputLatency`・`baseLatency`・`getOutputTimestamp` と `currentTime` の差は変わらず、ページから遅れを知る手段はなかった。描画の予約を溜めないようにし、鳴り終えたオシレーターと音源が溜まらないようにした後は、iOS の実機で再現しなくなった。原因は確かめていないが、音の経路をすべて組み直す大きな変更は要らなくなった
- **`navigator.audioSession` を使わない**: 消音のスイッチで音が止まらないことを実機で確かめたため。メディア操作のための無音の `audio` 要素が鳴っていることで、音の扱いがすでに再生用になっていると考えられる
- **アートワークに 192 と 512 の2つを渡す**: OS が、表示する大きさに近いものを選べるようにするため。ホーム画面のアイコンと同じファイルを使い、画像を増やさない
- **曲名に加えてシードを出す**: ロック画面からでも、気に入った展開のシードを控えられるようにするため
- **ドラムサンプルを自作の合成音にする**: 外部のサンプルを使わないので、ライセンスの条件が増えないため。アイコンと画像も同じ理由で自作にする
- **アイコンの絵柄をマスで描いたニシブッポウソウにする**: 名前の由来と、シーケンサーのマス目の両方を表すため。鳥を三角形や曲線で描いた案は、16px で細部がつぶれるか、鳥に見えなかった
- **PNG を Playwright で描き、コミットする**: 画像を変換する依存を増やさないため。SVG を描けるブラウザは E2E テストですでに使っている。ビルドと CI に Chromium の起動を加えないよう、作った PNG はコミットする
- **共有用の画像の説明を英語にする**: 画像の中の文字は、リンクを受け取った人の言語に合わせて変えられないので、読める人の多い英語にするため
- **base path を `package.json` の `name` から作る**: GitHub Pages はプロジェクトのリポジトリをその名前の下に配るので、リポジトリ名を変えるときに `package.json` だけを直せば済むようにするため
- **E2E テストを配布と同じビルドに対して回す**: base path の誤り（サンプルや設定ファイルが読めない、共有する URL がずれる）を配布の前に見つけるため。ビルドを1回にして、確かめたものと配布するものを一致させる
- **ブランチへのプッシュごとには回さない**: 作業中のプッシュのたびに3つのブラウザの E2E テストを回すと、Actions の時間を消費するわりに得るものが少ないため。レビューに出すプルリクエストと、配布する main で確かめる
- **E2E テストをブラウザごとに並べる**: 3つを順に回すより早く終わり、CI の1回を10分以内に収めるため
- **配布の権限を絞り、途中で止めない**: ほかのジョブに書き込みの権限を持たせないため。配布が途中で切られて、古い版と新しい版が混ざらないようにするため
