# 仕様の文書

Rholydd Sequencer の現行の仕様です。各文書は、振る舞い（聞こえ方・見え方としての規則と表）、実装（型・関数の分担・データの流れ）、決めた理由（試聴で確定した値の根拠、採らなかった案）の順に書きます。冒頭に、関係するコードとテストのパスがあります。

## 読む順番

初めて読むときは、次の順に読むと全体がつかめます。

1. [考え方](./concept.md): 目的、聴かせ方の考え方、扱わないこと
2. [用語集](./glossary.md): 文書とコードで使う言葉
3. [アーキテクチャ](./architecture.md): 生成と再生の分離、モジュールと依存の向き、生成の流れ、主な型
4. 知りたい領域の文書（下の表）

## 領域ごとの文書

| 領域 | 文書 | 内容 |
| --- | --- | --- |
| 生成 | [乱数とシード](./generation/random.md) | 乱数の生成器、シードの派生、パラメーターのラッチ |
| | [形式](./generation/form.md) | 2bar・8bar・32bar の関係、エネルギーのカーブ、コンテキスト |
| | [アレンジ](./generation/arrangement.md) | サイクルとシーン、シーンごとのパート、主題の共有、ドロップの入り方、音色の選び方 |
| | [和声](./generation/harmony.md) | キー、コードとテンション、借用和音、進行と色付け、移調 |
| | [ドラム](./generation/drums.md) | 重み表、基準パターンと変異、転換、間引き、装飾、フィル |
| | [音程のあるパート](./generation/pitched-parts.md) | サブベース・リースベース・スタブ・パッドの型、音高、ボイシング |
| | [選別・溜め・FX](./generation/fx.md) | 鳴る側のイベントの選別、溜め、FX のイベント |
| 再生 | [トランスポート](./playback/transport.md) | 予約、再生の状態、一時停止と再開 |
| | [音](./playback/sound.md) | 音の経路、音色、ミキサーとソロ、ダッキング、ダイナミクス、FX のオートメーション |
| 画面と連携 | [画面](./interface/screen.md) | 画面の組み立て、操作、位置の表示、シーケンサーとスペクトラム、メニュー、狭い画面、アクセシビリティ |
| | [連携](./interface/integration.md) | 設定ファイル、クエリ文字列、共有、メディア操作、ドラムサンプル、配布と CI/CD |
| 品質 | [品質の要件](./quality/requirements.md) | 満たし続けるべき性質と確かめ方 |
| | [テスト](./quality/testing.md) | 単体テスト、生成の基準、シミュレーション、E2E テスト |
| | [リリースの確認](./quality/release-checklist.md) | 試聴・UI・ブラウザ・アクセシビリティの手動の確認と、リリースの手順 |

## 目的別の入口

| 知りたいこと | 入口 |
| --- | --- |
| 同じシードで同じ展開になる仕組み | [乱数とシード](./generation/random.md)、[テスト](./quality/testing.md#生成の基準) |
| ある音がなぜ鳴る（鳴らない）のか | [アレンジ](./generation/arrangement.md#シーンごとのパート)、[選別・溜め・FX](./generation/fx.md) |
| パラメーターがどこに効くか | [乱数とシード](./generation/random.md#パラメーターのラッチ)、[用語集](./glossary.md) |
| 調整用の数値を変えたい | [連携](./interface/integration.md#設定ファイル)、`config.example.json` |
| 新しいパートや音色を足したい | [アーキテクチャ](./architecture.md#決めた理由)、[音程のあるパート](./generation/pitched-parts.md)、[音](./playback/sound.md#音色) |
| 画面の部品を変えたい | [画面](./interface/screen.md) |
| リリースしたい | [リリースの確認](./quality/release-checklist.md) |

## 文書の決まり

- 調整用の数値の既定値は、コード（`src/structure/tuning.ts`・`src/generators/tuning.ts`・`src/engine/tuning.ts`）と `config.example.json` を正本にし、文書には意味・範囲・理由だけを書く。進行の表・ステップの重み表・音色の表のように、何を鳴らすかを決める表は文書に載せる
- 文書どうしは、ファイルと見出しへのリンクで参照する。番号は振らない
- 自動で確かめられる性質はテストに任せ、文書には受け入れ基準を残さない。手動の確認は [リリースの確認](./quality/release-checklist.md) にまとめる
- リリースの後の予定と変更の履歴は、GitHub の Issues と Releases で管理する
- ファイル名は英語の kebab-case にし、本文は日本語で書く
