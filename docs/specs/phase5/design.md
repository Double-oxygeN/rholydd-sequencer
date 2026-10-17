# フェーズ5設計書

[フェーズ5要件定義書](./requirements.md) を実装するための設計です。[MVP設計書](../mvp/design.md) から [フェーズ4設計書](../phase4/design.md) までの方針はそのまま引き継ぎ、変わる部分だけを書きます。フェーズ5では音楽の生成と画面の機能を変えないので、この設計書の大半は、コード・テスト・文書の置き場所と、アクセシビリティ・E2E テスト・CI/CD の仕組みについてです。

本書も要件定義書と同じく、リリースの前に削除します。ここで決めたことのうち残すべきものは、領域ごとの仕様の文書に移します（「仕様の文書への移行」の節）。

## 名称の扱い

新しい名称は未定なので、本書では〈新名称〉、リポジトリ名を〈リポジトリ名〉と書きます。名称が決まるまでは、名称に依存しない作業（基準の記録、リファクタリング、テストの並べ替え、アクセシビリティ）を先に進めます。

名称が出てくる場所は、名称を決めたときに一度で直せるよう、次の3か所に絞ります。

| 場所 | 中身 | 理由 |
| --- | --- | --- |
| `package.json` の `name` | リポジトリ名と同じ kebab-case の名前 | base path をここから作る（「base path」の節） |
| `src/app-name.ts` の `APP_NAME` | 画面の見出しとメディア操作の曲名 | `main.ts` と `ui/media-session.ts` が別々に文字列を持つと、片方だけ直し漏れる |
| `index.html` の `<title>` | `APP_NAME` と同じ文字列 | HTML はスクリプトより先に読まれ、スクリプトの定数を使えない |

`index.html` と `APP_NAME` の一致は、E2E テストの初期画面で `document.title` と見出しを比べて確かめます。

## 基準の記録（実施済み）

リファクタリングの前に、v0.5.0 と同じコードで基準を記録しました（`tests/fixtures/generation-baseline.json`）。

- **記録した run**: 既定の設定で5通り（フェーズ4の基準と同じシードとパラメーター）、2bar ごとにスライダーの値を変え続ける1通り、`tests/fixtures/tuned-config.json` を読んだ2通り。どれも 2048bar
- **パートごとのハッシュ**: 構成（レイアウト・シーン・次のシーン・エネルギー・コード）、キー、音色、ドラム、sub、reese、stab、pad、聞こえるイベント、FX の10個。1本のハッシュでは、不一致になったときにどのパートが変わったか分からないため
- **ハッシュの対象**: 音を決める値だけにし、`Context` を丸ごとは入れない。リファクタリングで `Context` の内部の形を変えても、音が同じなら一致させるため
- **直列化**: オブジェクトのキーを並べ替えてから `JSON.stringify` する。`JSON.stringify` はプロパティを作った順に出力するので、オブジェクトの組み立て方を変えただけで不一致になるため
- **設定ファイル**: ページと同じ `parseConfigText` で読む。警告が出ないことと、生成の数値の全グループと初期値が既定値と違うことをテストで確かめる。値が黙って無視されると、既定値の基準を2回取っただけになるため
- 基準は記録し直さない。フェーズ5では生成を変えないので、不一致はすべてリファクタリングの誤りとして扱う

フェーズ4の基準（`phase3-unpitched.json`）は、新しい基準が全パートを含むので削除しました。記録した時点の 2bar の生成の平均は約 0.02〜0.04ms です（N-22 と比べるため）。

## リファクタリング

### 大きなファイルの分割

役割の数を目安に、次のファイルを分けます。依存の方向（`ui → engine → generators → structure → random`、生成は再生に依存しない）は変えません。

| 今のファイル | 役割 | 分けた後 |
| --- | --- | --- |
| `src/engine/audio.ts`（534行） | 音の経路の組み立て、チャンネルストリップとフェーダーの動かし方、パートごとのシンセとサンプラー、FX のノードとオートメーションの適用、ダッキングの予約、スペクトラムとレベルの取り出し | `engine/audio.ts`（経路の組み立てと `Instruments`、ダッキングの予約、スペクトラムとレベル）、`engine/strips.ts`（`createStrips`・`glide`）、`engine/voices.ts`（`Voices`・`createVoices`・ドラムのサンプラー・`frequencyOf`・`legatoSeconds`）、`engine/effects.ts`（ライザー・スイープ・スロー・パッドのゲートのノード、`automated` の対応表、`rest`・`apply`） |
| `src/params/config.ts`（271行） | 設定ファイルの型と既定値、汎用の検証の部品、設定ファイルのスキーマ | `params/decode.ts`（`decode`・`numberIn`・`related`・`weights`・`bool` など、設定ファイルに依存しない部品）、`params/config.ts`（`Config`・`DEFAULT_CONFIG`・`CONFIG_SCHEMA`・`parseConfigText`） |
| `src/structure/harmony.ts`（283行） | コードの表と構成音・テンションの音高、コード名、進行の表と色付けの抽選 | `structure/chords.ts`（コードとテンションの表、`chordToneClass`・`tensionClass`・`chordClasses`、コード名）、`structure/harmony.ts`（骨組みの表、進行の型、色付け、サイクルと32bar の進行） |
| `src/structure/arrangement.ts`（238行） | サイクルのレイアウトとシーン、シーンのエネルギー、シーンごとに鳴らすパート、ドロップの入り方の判定 | `sceneEnergy` を `structure/energy.ts` に、`Voice`・`plays`・`playsHit` を `structure/scene-parts.ts` に移す。レイアウト・シーン・入り方の判定は `arrangement.ts` に残す |
| `src/ui/mixer.ts`（293行） | ミキサーの表と切り替え、レベルメーター、ダッキングの操作、DOM の小さな部品 | `ui/mixer.ts`（表と行）、`ui/level-meter.ts`、`ui/ducking.ts`。`field`・`row`・`range`・`cell` は `ui/panel.ts` と重複しているので `ui/dom.ts` にまとめる |
| タブの並び（`ui/views.ts`・`ui/menu.ts`・`ui/mixer.ts` に3つ） | 同じ `role="tablist"` の作りを3か所で持つ | `ui/tabs.ts` の `createTabs` にまとめる（「タブの並び」の節）。矢印キーの操作を3か所に書かないため |
| `src/ui/style.css`（676行） | 配色、全体の配置、部品ごとの見た目、狭い画面 | `src/ui/styles/` に、`tokens.css`（配色）、`base.css`、部品ごとのファイル（`controls`・`position`・`grid`・`spectrum`・`menu`・`mixer`・`share`）に分け、`main.ts` から今の記述順で読む。狭い画面の指定は部品ごとのファイルに置く。記述順を変えると詳細度の同じ規則の勝ち負けが変わるため、順番は保つ |
| `tools/simulate.ts`（674行） | 集計、表示用の整形、コマンドラインの読み取り | `tools/simulation/report.ts`（`simulate`・`SimulationReport`）、`tools/simulation/format.ts`（`formatReport` など）、`tools/simulate.ts`（引数と `--config` の読み取り、出力） |

- `engine/patches.ts`・`engine/automation.ts`・`engine/ducking.ts` など、すでに1つの役割のファイルは変えない
- 分けるたびに、基準のテストと既存の単体テストを通してからコミットする。再生側は単体テストで確かめられない部分（ノードのつなぎ方）があるので、`engine/` を分けた後に v0.5.0 と同じシードで聴き比べる

### テストの並べ替え

テストを、仕様の文書と同じ領域の構成に並べ替えます。

```
tests/
├── support/          # helpers.ts、baseline.ts（テスト自体は持たない）
├── fixtures/         # generation-baseline.json、tuned-config.json
├── generation/       # random・form・arrangement・harmony・drums・pitched-parts・fx・baseline
├── playback/         # transport・sound
├── interface/        # screen・integration・contrast
└── quality/          # performance・simulation・conventions
e2e/                  # Playwright のテスト（*.spec.ts）。Vitest の対象（tests/**/*.test.ts）から外す
```

| 今の describe | 移す先 |
| --- | --- |
| `rng.test.ts` の全体 | `generation/random.test.ts` |
| `conductor.test.ts` の全体、`phase1` の 32-bar form と energy curve、MVP の「8bar の3つの反復単位」 | `generation/form.test.ts` |
| `arrangement.test.ts` の全体、`phase3` の parts per scene・cycles and scenes・lead-ins・energy by scene・a theme per cycle、MVP の「シーンが許す範囲で鳴らす」 | `generation/arrangement.test.ts` |
| `phase2` の harmony と chord progression、`phase3` の modulation、`phase4` の harmony のうち表と色付け、`sub.test.ts` の key | `generation/harmony.test.ts` |
| `drums.test.ts` の全体、MVP のドラムの基準（バックビート・ハイハット・キックとスネア・オーナメント・8bar の境界）、`phase3` の fills at scene boundaries、`phase4` の the sequencer（スネアとゴースト） | `generation/drums.test.ts` |
| `phase1` の bass、`phase2` の parts on the chords と pad voicing、`phase4` の harmony のうちパートの音とボイシング、`sub.test.ts` の subPitch と sub styles | `generation/pitched-parts.test.ts` |
| `phase3` の effects | `generation/fx.test.ts` |
| `phase3` の sounds per cycle のうち音色の選び方 | `generation/arrangement.test.ts` |
| `baseline.test.ts`、MVP の「同じシードで同じイベント」 | `generation/baseline.test.ts` |
| `resume.test.ts` の全体 | `playback/transport.test.ts` |
| `automation`・`ducking`・`clip` の全体、`phase4` の solo、`phase3` の sounds per cycle のうちエンベロープと FM の比 | `playback/sound.test.ts` |
| `phase4` の spectrum analyser と media controls のうち再生の命令 | `interface/screen.test.ts` |
| `phase4` の initial seed・sharing・config file、media controls のうち無音の WAV | `interface/integration.test.ts` |
| MVP と `phase3` の 5ms のテスト（2つを1つにまとめる） | `quality/performance.test.ts` |
| `simulate.test.ts` の全体 | `quality/simulation.test.ts` |

- `describe` の名前は、領域と対象の名前にする（`'drums: fills'` のように）。フェーズの名前と「acceptance」を使わない
- テストの中身は変えずに移す。2つの 5ms のテストのように同じことを確かめるものだけをまとめる
- 移した後、テストの件数が減っていないことを、まとめた分を除いて確かめる

### コメントの書き換え

要件の番号（F-xx・N-xx）とフェーズの名前（MVP を含む）は、`src`・`tools`・`tests` に 55か所あります。テストの describe 以外は、それぞれの理由を、番号を使わない文に書き換えます。たとえば「（N-02）」は、それが守る性質（「メインスレッドが止まっても再生が途切れないように」）に置き換えます。

再発を防ぐため、`quality/conventions.test.ts` で次を確かめます。

- `src`・`tools`・`tests`・`e2e` のファイルに、要件の番号とフェーズの名前の綴りが出てこない。検査するパターン自体が引っかからないよう、パターンは文字クラスで組み立てる
- `tests` と `e2e` のファイル名に、フェーズの名前が出てこない

## base path とビルド

配布先の URL は `https://gh.double-oxygen.net/〈リポジトリ名〉/` です。base path を1か所で決めるため、`vite.config.ts` が `package.json` の `name` から `/〈name〉/` を作り、`build` と `preview` の `base` にします。

- 開発サーバー（`npm run dev`）は今のまま `/` で開く。開発中に毎回 base path を打たなくて済むようにするため。base path の誤りは E2E テストで見つける
- リポジトリ名を変えたときは、`package.json` の `name` を直せばビルドも E2E テストも追従する
- 自分で別の場所に配布する利用者は、`npm run build -- --base /path/` で上書きできる
- サンプル・設定ファイル・共有する URL は、すでに `import.meta.env.BASE_URL` を基準にしているので変えない

## E2E テスト

### 道具と構成

| 項目 | 内容 | 理由 |
| --- | --- | --- |
| ツール | Playwright（`@playwright/test`） | 1つの API で Chromium・Firefox・WebKit を動かせる |
| アクセシビリティの自動検査 | `@axe-core/playwright` | WCAG のタグ（`wcag2a`・`wcag2aa`・`wcag21a`・`wcag21aa`・`wcag22aa`）で絞って検査できる |
| 対象のサーバー | `vite preview` で `dist` を配る | 配布と同じ base path のビルドそのものを確かめるため |
| 置き場所 | `e2e/*.spec.ts`、`playwright.config.ts` | Vitest の対象と混ざらないようにする |
| プロジェクト | `chromium`・`firefox`・`webkit` の3つ | |
| 再試行 | 0回 | 再試行は不安定なテストを隠すため（N-20） |
| コマンド | `npm run e2e`（`npm run build` の後に `playwright test`） | CI ではビルドを1回にするため、`playwright test` だけを呼ぶ |

`playwright.config.ts` の `baseURL` は、`vite.config.ts` と同じく `package.json` の `name` から作ります。

### 音を鳴らす環境

E2E テストは音の中身を確かめませんが、再生を始めるには AudioContext が動く必要があります。

- 再生のボタンは Playwright のクリックで押す。Playwright のクリックはユーザーの操作として扱われるので、`Tone.start()` が通る
- Chromium は `--autoplay-policy=no-user-gesture-required` で起動する。音の出力先のない環境でも AudioContext を止めないため
- 再生していることは、画面の状態（再生のボタンの名前が「一時停止」、累計の表示が出る）で確かめ、何小節進んだかは確かめない。進み方は音声のクロックとマシンの負荷で変わるため（N-20）。待つときは Playwright の自動の待ち（`expect(...).toHaveText` など）を使い、固定の時間は待たない

### 差し替え

| 対象 | 方法 | 理由 |
| --- | --- | --- |
| 設定ファイル | `page.route('**/config.json', …)` で中身を返す | ページから見ると、ビルドに `config.json` を置いたときと同じ取得になる。ビルドを分けると CI の時間が延びるため |
| メディア操作 | `page.addInitScript` で `navigator.mediaSession.setActionHandler` を包み、登録された処理を `window` に控える。`mediaSession` がないブラウザでは、同じ形の代わりを置く | OS の操作を起こせないので、ページが登録した処理を直接呼ぶ |
| クリップボード | Chromium だけ `clipboard-read`・`clipboard-write` の権限を与え、コピーした文字を読み返す。Firefox と WebKit では、状態表示が「コピーしました」か「選択した URL をコピーしてください」のどちらかになることだけを確かめる | Firefox と WebKit では、テストから読み取りの権限を与えられない |

### テストの分担

| ファイル | 要件の表の対象 |
| --- | --- |
| `e2e/initial.spec.ts` | 初期画面（`document.title` と見出しの一致を含む） |
| `e2e/playback.spec.ts` | 再生の状態、表示の切り替え |
| `e2e/menu.spec.ts` | メニュー |
| `e2e/startup.spec.ts` | クエリ文字列、設定ファイル |
| `e2e/share.spec.ts` | 共有 |
| `e2e/media-session.spec.ts` | メディア操作 |
| `e2e/narrow.spec.ts` | 狭い画面（`viewport` を 320px と 375px にする） |
| `e2e/keyboard.spec.ts` | キーボード |
| `e2e/accessibility.spec.ts` | アクセシビリティの自動検査（4つの状態） |

- 「横にはみ出さない」は、`document.documentElement.scrollWidth` が `clientWidth` 以下であることで確かめる
- 「メニューが右から出る」は、開いた後のメニューの右端が画面の右端に一致することと、閉じている間は画面の外にあることで確かめる
- 「再生中は鳴っている展開のシード」は、再生を始めた後にシードの欄を書き換え、共有の URL が始めたときのシードのままであることで確かめる

## アクセシビリティ

### 画面の並びとフォーカスの順

Tab キーの順を画面の並びに合わせるため、要素を文書に置く順を変えます。今は、右上に固定した共有とメニューのボタンが文書の最後にあり、Tab キーで最後に回ります。

```
header（h1、share-toggle、menu-toggle）   ← 右上のボタンを見出しと同じ行として先に置く
aside.offcanvas                           ← 開くボタンのすぐ後。閉じている間は inert なので飛ばされる
controls（再生/一時停止/再開・停止・音量）  position の累計
position のメーター2行
views（タブ、grid か spectrum）
status
dialog.share
```

見た目の配置（`position: fixed` の右上）は変えません。メニューを開くと、開くボタン（閉じるボタンになる）からメニューの中へ、メニューの最後からページの本体へと Tab キーで進みます。メニューはモーダルにしないので、メニューの外にも移れます（要件のとおり）。

### タブの並び（`ui/tabs.ts`）

```ts
interface TabsOptions<T extends string> {
  readonly ids: readonly T[];
  readonly label: string;                             // tablist の aria-label
  readonly button: (id: T) => HTMLButtonElement;      // 文字かアイコンのボタン
  readonly panels: (id: T) => HTMLElement | null;     // ミキサーの切り替えは、全体で1つのパネル
  readonly initial: T;
  readonly onSelect: (id: T) => void;
}
interface Tabs<T extends string> { readonly element: HTMLElement; readonly current: () => T; focus(): void }
function createTabs<T extends string>(options: TabsOptions<T>): Tabs<T>;
```

- 選ばれたタブだけを `tabindex="0"`、ほかを `tabindex="-1"` にする（roving tabindex）。Tab キーではタブの並びに1回だけ止まり、次の Tab キーで並びから出る
- 左右の矢印キーで隣のタブにフォーカスを移し、同時に選ぶ（自動の切り替え）。端では反対の端に回り、Home と End で最初と最後に移る。切り替えが軽い（表示を替えるだけ）ので、Enter を待たずに切り替える
- 各タブに `aria-selected` と `aria-controls`、パネルに `role="tabpanel"` と `aria-labelledby` を付ける。ミキサーの切り替えでは、表全体を3つのタブに共通のパネルにする
- 使う場所は、表示の切り替え（「表示」）、メニューのタブ（「メニューの表示」）、ミキサーの役割の切り替え（「ミキサーの調整の対象」）の3つ

### 名前と状態

| 部品 | 今 | 変更 |
| --- | --- | --- |
| ミキサーのスライダー | 名前なし | `aria-label` を「キック 音量」「スネア パン」のように、チャンネル名と役割で付ける |
| ミュート・ソロ | 名前が表示の「M」「S」になる | `aria-label` を「キック ミュート」「キック ソロ」にする。`aria-pressed` は今のまま |
| パネルのスライダー | 名前が `label` 全体になり、横の百分率の表示まで含む | `aria-labelledby` を項目名の `span` に向け、値は `aria-valuetext`（「30%」）で伝える |
| パン・音量・センド | 値が数値で読まれる | `aria-valuetext` を表示と同じ「L20」「+3 dB」「15%」にする |
| メニューを開くボタン | 名前と `aria-expanded` あり | 変えない |
| 再生のボタン | `setIcon` で名前が変わる | 変えない |
| 停止のボタン | `disabled` | 変えない |

### フォーカスの移し方

- **メニュー**: 開くと、選ばれているメニューのタブにフォーカスを移す。閉じるのは開くボタンと同じボタンなので、閉じた後のフォーカスはそのボタンに残る。メニューの中にフォーカスがある状態で閉じる経路はない（閉じるボタンを押すとフォーカスがそのボタンに移る）
- **共有のダイアログ**: `close` イベントで共有のボタンにフォーカスを戻す。今のブラウザの多くは `showModal()` の前の要素に戻すが、版によって違うので明示する。開いたときは今のまま URL の欄（`autofocus`）にフォーカスを置く
- **フォーカスの表示**: `:focus-visible` に `outline: 2px solid var(--focus)` と `outline-offset: 2px` を付ける。`--focus` は、明るい配色と暗い配色のどちらでも、隣り合うすべての背景に対して 3:1 以上の色にする

### 読み上げ

- **状態表示**: `p.status` に `role="status"` を付ける。要素は起動の最初から文書に置いてあるので、後から書き換えた文が読み上げられる
- **共有のダイアログの結果**: 今の `aria-live="polite"` を `role="status"` に替える（同じ働きで、意味がはっきりする）
- **シーケンサー**: グリッド全体に `role="img"` と `aria-label="シーケンサー"` を付ける。`role="img"` の子は支援技術に読まれないので、マスや行の名前は読み上げられない
- **スペクトラムアナライザー**: `canvas` に `role="img"` と `aria-label="スペクトラムアナライザー"` を付ける
- **位置のメーター**: 2行のメーターに `role="img"` と、「サイクルの位置」「8小節の位置」の `aria-label` を付ける。位置そのものは、累計の文字（「12 小節　1 サイクル」）で伝わる。累計の文字は `aria-live` にしない。ステップごとに変わり、読み上げると音を聴く邪魔になるため

### コントラスト

今の配色を計算すると、暗い配色はすべて満たし、明るい配色で次が足りません。

| 色 | 用途 | 背景との比（今） | 必要 |
| --- | --- | --- | --- |
| `--line` | 操作部品の境界（ボタン・欄） | 1.3〜1.4 | 3:1 |
| `--accent` | 選んだタブ、スライダー、文字 | 3.4〜4.0 | 図形 3:1、文字 4.5:1 |
| `--ornament`・`--fill` | サイクルのメーターのブレイクダウンとビルド、レベルメーター、ミュートのボタンの点いた状態 | 2.3〜3.4 | 3:1。ミュートの「M」の白い文字は `--fill` に対して 4.5:1 |
| `--solo` | ソロのボタンの点いた状態 | 1.5〜1.7 | 3:1 |
| ドラムの打音 | `color-mix` で、ベロシティの割合だけ `--base` を混ぜる | 弱いゴーストで 3:1 を下回る | 3:1 |

- `--line` は区切りの線（意味を持たない）に残し、操作部品の境界には新しい `--control-border` を使う。区切りの線まで濃くすると、画面が重くなるため
- 明るい配色の `--accent`・`--ornament`・`--fill`・`--solo` は、色相を保って明るさを下げる
- ドラムの打音は、ベロシティ 0〜1 を混ぜる割合「下限〜100%」に写す。下限は、`--cell` に対して 3:1 になる割合にする。ベロシティの濃淡は残る
- 値は `tests/interface/contrast.test.ts` で確かめる。CSS の `tokens.css` から2つの配色の値を読み、「文字と背景」「境界と背景」「図形と背景」の組の表について比を計算する。`color-mix` の色は、テストの中で同じ式で混ぜて計算する。配色を変えたときに、手の計算に頼らないため

## ブラウザの確認

### 調べてから手当てすること

| 対象 | 分かっている違い | 手当ての候補 | 手当てできないとき |
| --- | --- | --- | --- |
| iOS の消音のスイッチ | Web Audio API の音は、`audio` 要素が鳴っていないと消音のスイッチで止まる | 再生中は、メディア操作のための無音の `audio` 要素がすでに鳴っている。これで止まらないかを実機で確かめる。止まるなら、`navigator.audioSession` があるブラウザでは `type = 'playback'` にする | README に書く |
| iOS の画面のロックとアプリの切り替え | AudioContext が `interrupted` か `suspended` になり、音とトランスポートが止まる | 戻ったときに `AudioContext.resume()` を試み、戻せないときは、セッションを一時停止の状態にして画面とメディア操作の表示を合わせる | README に書く |
| Safari の `dialog` のフォーカス | 閉じた後に元の要素へ戻らない版がある | 「フォーカスの移し方」のとおり明示する | |
| Firefox のメディア操作 | 無音の `audio` 要素からメディア操作の通知が出るまでの条件が Chrome と違う | 実機で確かめる | README に書く |

- 一時停止の状態にする手当ては、利用者から見ると「止まった音が、一時停止として画面に出る」振る舞いになる。音楽の生成と画面の機能の変更ではなく、ブラウザの違いの手当てとして扱う
- 手当ての有無に関わらず、確かめたブラウザの版と結果は `docs/quality/release-checklist.md` に記録する

## CI/CD（`.github/workflows/ci.yml`）

```
push（すべてのブランチ）・pull_request
  ├─ check: npm ci → typecheck → test → build → dist をアーティファクトに上げる
  ├─ e2e（matrix: chromium・firefox・webkit、check の後）
  │    npm ci → playwright install --with-deps <browser> → dist を受け取る → playwright test --project <browser>
  └─ deploy（main への push のとき、check と e2e のすべての後）
       dist を受け取る → actions/upload-pages-artifact → actions/deploy-pages
```

| 項目 | 内容 | 理由 |
| --- | --- | --- |
| Node.js | `actions/setup-node` で 24、npm のキャッシュを使う | `engines` が `>=24.2` |
| ビルド | `check` で1回だけ行い、E2E テストと配布で同じ `dist` を使う | E2E テストで確かめたものと配布するものを一致させるため |
| 設定ファイル | `public/config.json` を `.gitignore` に足し、`dist/config.json` がないことを `check` で確かめる | 配布しない（要件のとおり）。手元で試した設定ファイルがコミットされて配布されるのを、2重に防ぐため |
| E2E テストの並列 | ブラウザごとにジョブを分ける | 3つを順に回すより早く終わり、N-21（10分以内）に余裕を持たせるため |
| Playwright のブラウザ | `~/.cache/ms-playwright` を Playwright の版でキャッシュする | 毎回のダウンロードを省くため |
| 配布の権限 | `deploy` だけに `pages: write`・`id-token: write`、`environment: github-pages` | ほかのジョブに書き込みの権限を持たせないため |
| 同時実行 | `deploy` を `concurrency: pages`（実行中のものは止めない） | 配布が途中で切られて、古い版と新しい版が混ざらないようにするため |
| 失敗の報告 | テストの失敗時に、Playwright のレポートとトレースをアーティファクトに上げる | CI でだけ起きた失敗を手元で再現できるようにするため |

利用者が行うこと（リポジトリの作成、Pages の source を「GitHub Actions」にすること、push）は、`docs/quality/release-checklist.md` のリリースの手順に書きます。ユーザーのサイトに独自ドメインがあるので、プロジェクトのリポジトリに `CNAME` は要りません。

## 素材とライセンス

- `tools/make-samples.ts` の冒頭のコメントを、「自作の合成音で、リポジトリと同じ Apache License 2.0 で配布する。外部のサンプルを使わないので、ライセンスの条件が増えない」という理由に替える
- README の「仮素材」「仮の」を除き、ドラムサンプルの由来とライセンスを書く
- LICENSE はすでに全文を置いてある（`b6bd4cd`）。受け入れ基準では、`https://www.apache.org/licenses/LICENSE-2.0.txt` と差分がないことを確かめる

## `package.json` と README

| 項目 | 値 |
| --- | --- |
| `name` | 〈リポジトリ名〉 |
| `version` | `1.0.0`（タグは `v1.0.0`） |
| `description` | 〈新名称〉の一文の説明（README の概要と同じ） |
| `repository` | `github:Double-oxygeN/〈リポジトリ名〉` |
| `homepage` | `https://gh.double-oxygen.net/〈リポジトリ名〉/` |
| `private` | `true` のまま（npm に公開しないため） |
| `scripts` | `e2e` を足す |
| `devDependencies` | `@playwright/test`、`@axe-core/playwright` を足す |

README は、概要・特徴・開く URL・対応環境と制約・技術スタック・ディレクトリ構成・開発コマンド・設定ファイル・仕様の文書への案内・ライセンスの順に、リリースの時点の内容にします。ディレクトリ構成は、分割と並べ替えの後の形で書きます。

## 仕様の文書への移行

構成は要件の「仕様の文書」の節のとおりです。元の文書と移す先の対応の大枠を次に示します。見出しごとの移行表（`docs/migration.md`）は、移行の作業の最初に作り、フェーズごとの文書と一緒に削除します。

| 元の文書 | 主な移す先 |
| --- | --- |
| `docs/design/beats.md` | `concept.md`（3種類の変化の考え方）、`generation/form.md`（階層ごとの役割、反復の作り方） |
| `docs/design/random.md` | `generation/random.md` |
| 各フェーズの要件定義書の「目的とスコープ」「含まないもの」 | `concept.md` |
| 各フェーズの要件定義書の非機能要件 | `quality/requirements.md`（番号を付けない） |
| 各フェーズの設計書の「モジュール構成と依存方向」「型」 | `architecture.md`（分割した後の形で） |
| 32bar の形式、エネルギー、コンダクター | `generation/form.md` |
| サイクル・シーン・入り方・シーンごとのパート・音色の選び方 | `generation/arrangement.md` |
| コードの表・進行・色付け・転調 | `generation/harmony.md` |
| ドラムの重み表・変異・オーナメント・フィル | `generation/drums.md` |
| sub・reese・stab・pad | `generation/pitched-parts.md` |
| FX の生成 | `generation/fx.md` |
| トランスポート・一時停止と再開・予約済みの2bar | `playback/transport.md` |
| 音色・ミキサー・ダッキング・FX のオートメーション・クリップの検出 | `playback/sound.md` |
| 画面の組み立て・操作部品・メニュー・狭い画面・アクセシビリティ | `interface/screen.md` |
| 設定ファイル・クエリ文字列・共有・メディア操作・配布 | `interface/integration.md` |
| 受け入れ基準とテストの対応、シミュレーション、E2E テスト、基準の記録 | `quality/testing.md` |
| 試聴・UI・ブラウザ・アクセシビリティの手動の確認 | `quality/release-checklist.md` |
| ロードマップ | 移さない（Issues と Releases に移る）。未着手の案があれば Issue にする |

## 受け入れ基準とテストの対応

| 受け入れ基準 | 確かめ方 |
| --- | --- |
| MVP〜フェーズ4の自動テスト | 並べ替えた `tests/` がすべて通る |
| v0.5.0 との一致 | `generation/baseline.test.ts` |
| ファイル名と describe にフェーズの名前がない | `quality/conventions.test.ts` と、`describe` の名前の目視 |
| 要件の番号とフェーズの名前がない | `quality/conventions.test.ts` |
| 2bar 5ms 以内 | `quality/performance.test.ts` |
| E2E テストの表の対象 | `e2e/` を3つのプロジェクトで |
| アクセシビリティの自動検査 | `e2e/accessibility.spec.ts` |
| E2E テストを10回 | `playwright test --repeat-each 10` を手元で1回 |
| コントラスト比 | `interface/contrast.test.ts`（手動の確認は、テストの対象外の組だけ） |
| 手動の確認（ブラウザ・iOS・キーボード・スクリーンリーダー・聴き比べ） | `docs/quality/release-checklist.md` の項目 |
| `git grep -i gendnb` | 削除の後に実行 |
| LICENSE | 公式の全文との差分 |
| CI | テストを1つ失敗させたブランチでプルリクエストを作り、CI が失敗することを見る |
| 配布 | main の更新の後、配布先でサンプルが読み込まれて再生でき、共有の URL が配布先の URL になることを見る |

## リスクと対策

| リスク | 対策 |
| --- | --- |
| WebKit（Linux）のヘッドレスで AudioContext かサンプルの読み込みが動かない | 最初に WebKit で再生の状態のテストだけを通して確かめる。動かないときは、再生を伴うテストを WebKit で飛ばし、理由をテストに書いて、Safari の手動の確認に回す |
| E2E テストがマシンの負荷で不安定になる | 小節数やタイミングを確かめない。固定の時間を待たない。再試行を 0 にして、不安定さを隠さない |
| ファイルの分割で再生の振る舞いが変わる（ノードのつなぎ方の誤り） | `engine/` の分割は1ファイルずつコミットし、そのたびに聴き比べる |
| 文書の移行で、決めた理由やリスクへの対策が落ちる | 見出しごとの移行表で、元の文書の全見出しに行き先を決めてから削除する |
| 名称が決まらないまま進め方の3以降に入れない | 名称に依存する場所を3か所に絞り、名称に依存しない作業を先に終える |
