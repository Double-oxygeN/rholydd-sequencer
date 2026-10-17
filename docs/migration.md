# 移行表

フェーズごとの文書・`docs/design`・ロードマップの見出しごとに、移した先か、移さない理由（後のフェーズで置き換え済み・一度きりの作業）を決めた表です。削除の確認に使い、削除と一緒に消します。

移す内容は新しいフェーズの文書を正とし、古いフェーズからは後で上書きされていない部分だけを拾いました。リンクは `docs/` からの相対パスです。

## `design/beats.md`

| 見出し | 移した先・理由 |
| --- | --- |
| 設計コンセプト | [concept.md](./concept.md)（変化の作法） |
| 3種類の変化 | [concept.md](./concept.md)（3種類の変化） |
| 階層ごとの役割 | [concept.md](./concept.md)（階層ごとの役割） |
| 反復の作り方 | [concept.md](./concept.md)（反復の作り方）、[generation/form.md](./generation/form.md) |

## `design/random.md`

| 見出し | 移した先・理由 |
| --- | --- |
| 乱数設計 | [generation/random.md](./generation/random.md) |
| 要件 | [generation/random.md](./generation/random.md)（決めた理由） |
| 構成 | [generation/random.md](./generation/random.md)（生成器） |
| 　splitmix32（シード派生） | [generation/random.md](./generation/random.md)（生成器） |
| 　sfc32（本体） | [generation/random.md](./generation/random.md)（生成器） |
| 実装案 | [generation/random.md](./generation/random.md)（生成器） |
| 使い方の規約 | [generation/random.md](./generation/random.md)（使い方の規約） |
| テスト | [quality/testing.md](./quality/testing.md)（単体テスト）。テストベクタは `tests/generation/random.test.ts` |
| 採用しなかった候補 | [generation/random.md](./generation/random.md)（決めた理由） |

## `roadmap.md`

| 見出し | 移した先・理由 |
| --- | --- |
| ロードマップ | [concept.md](./concept.md)（目的） |
| 全体像 | [concept.md](./concept.md)（目的） |
| フェーズ詳細 | 一度きり（各フェーズの計画。実装した規則は各文書に移した） |
| 　フェーズ0: MVP（ドラムのみ） | 一度きり（計画）。MVP の規則は [generation/drums.md](./generation/drums.md) と [generation/form.md](./generation/form.md) |
| 　フェーズ1: 32bar 構造とベース | 一度きり（計画）。規則は [generation/form.md](./generation/form.md)・[generation/drums.md](./generation/drums.md)・[generation/pitched-parts.md](./generation/pitched-parts.md) |
| 　フェーズ2: ハーモニー、ウワモノとミックス | 一度きり（計画）。規則は [generation/harmony.md](./generation/harmony.md)・[generation/pitched-parts.md](./generation/pitched-parts.md)・[playback/sound.md](./playback/sound.md) |
| 　フェーズ3: FX とアレンジ | 一度きり（計画）。規則は [generation/arrangement.md](./generation/arrangement.md)・[generation/fx.md](./generation/fx.md)・[playback/sound.md](./playback/sound.md) |
| 　フェーズ4: 和声の拡充と UI の簡素化 | 一度きり（計画）。規則は [generation/harmony.md](./generation/harmony.md)・[playback/transport.md](./playback/transport.md)・[interface/screen.md](./interface/screen.md)・[interface/integration.md](./interface/integration.md) |
| 　フェーズ5: リリース準備と保守性の向上 | 一度きり（計画）。結果は [quality/testing.md](./quality/testing.md)・[interface/integration.md](./interface/integration.md)・この文書の構成 |
| リスクと対策 | 各文書の「決めた理由」（変化率の調整→[quality/testing.md](./quality/testing.md)（シミュレーション）、タイマーの間引き→[playback/transport.md](./playback/transport.md)（決めた理由）、CPU 負荷→[playback/sound.md](./playback/sound.md)（決めた理由）、サイドチェイン→[playback/sound.md](./playback/sound.md)（決めた理由）、まとまり→[architecture.md](./architecture.md)（決めた理由）、サンプルのライセンス→[interface/integration.md](./interface/integration.md)（決めた理由）、テンションの濁り→[generation/harmony.md](./generation/harmony.md)（決めた理由）、一時停止→[playback/transport.md](./playback/transport.md)（決めた理由）、スペクトラムの負荷→[interface/screen.md](./interface/screen.md)（決めた理由）、リファクタリング・E2E→[quality/testing.md](./quality/testing.md)、名称→一度きり、iOS→[quality/release-checklist.md](./quality/release-checklist.md)（ブラウザ）、base path→[interface/integration.md](./interface/integration.md)（決めた理由）、文書の削除→この移行表） |

## `specs/mvp/requirements.md`

| 見出し | 移した先・理由 |
| --- | --- |
| MVP要件定義書 | （文書の題） |
| 目的とスコープ | [concept.md](./concept.md)（目的）、扱わないもの→[concept.md](./concept.md)（扱わないこと） |
| システム構成 | [architecture.md](./architecture.md) |
| 機能要件 | 表の各行を各領域の文書の「振る舞い」に移した |
| 生成ロジック仕様 | 下の見出しごと |
| 　データ構造 | 各文書の「実装」（型） |
| 　ステップ重み表 | [generation/drums.md](./generation/drums.md)（重み表） |
| 　変異（8bar 境界） | 置き換え済み（8bar の変異は基準からの変奏に改めた）。手順は [generation/drums.md](./generation/drums.md)（変異） |
| 　装飾（2bar ごと） | [generation/drums.md](./generation/drums.md)（装飾）、反復の一致→[generation/form.md](./generation/form.md)（決めた理由） |
| 　フィル（8bar の終わり） | [generation/drums.md](./generation/drums.md)（フィル） |
| 　シードの派生 | [generation/random.md](./generation/random.md)（シードの派生） |
| パラメーター仕様 | [generation/random.md](./generation/random.md)（パラメーターのラッチ）、範囲と既定値は `config.example.json` と [interface/screen.md](./interface/screen.md)（メニュー） |
| 非機能要件 | [quality/requirements.md](./quality/requirements.md) |
| 受け入れ基準 | 自動の基準はテスト（[quality/testing.md](./quality/testing.md)）、手動の基準は [quality/release-checklist.md](./quality/release-checklist.md) |
| 未決事項 | 一度きり（後の「確定した事項」で解決した） |

## `specs/mvp/design.md`

| 見出し | 移した先・理由 |
| --- | --- |
| MVP設計書 | （文書の題） |
| モジュール構成と依存方向 | [architecture.md](./architecture.md)（モジュールと依存の向き） |
| 型 | [architecture.md](./architecture.md)（主な型）と各文書の「実装」 |
| 生成の流れ | 下の見出しごと |
| 　乱数の引き方（N-05） | [generation/random.md](./generation/random.md)（使い方の規約） |
| 　パラメーターのラッチ | [generation/random.md](./generation/random.md)（パラメーターのラッチ） |
| 仕様の解釈 | 下の見出しごと |
| 　フィルのテンプレート | [generation/drums.md](./generation/drums.md)（フィル） |
| 　衝突の範囲 | [generation/drums.md](./generation/drums.md)（重み表） |
| 　変異 | [generation/drums.md](./generation/drums.md)（変異） |
| 　反復率（未決事項への暫定定義） | [quality/testing.md](./quality/testing.md)（シミュレーション） |
| 再生エンジン | [playback/transport.md](./playback/transport.md)（予約）、[playback/sound.md](./playback/sound.md) |
| ドラムサンプル | 置き換え済み（正式に採用した）→[interface/integration.md](./interface/integration.md)（ドラムサンプル） |

## `specs/phase1/requirements.md`

| 見出し | 移した先・理由 |
| --- | --- |
| フェーズ1要件定義書（32bar 構造とベース） | [generation/pitched-parts.md](./generation/pitched-parts.md)（サブベース）（音高はコードに従うよう改めた） |
| 目的とスコープ | [concept.md](./concept.md)（目的）、扱わないもの→[concept.md](./concept.md)（扱わないこと） |
| MVP要件からの変更点 | 一度きり（前のフェーズとの差分。変更後の規則を各文書に移した） |
| システム構成 | [architecture.md](./architecture.md) |
| 機能要件 | 表の各行を各領域の文書の「振る舞い」に移した |
| 生成ロジック仕様 | 下の見出しごと |
| 　32bar の区間の関係 | [generation/form.md](./generation/form.md)（32bar の中の8bar） |
| 　強い変異（32bar 境界） | [generation/drums.md](./generation/drums.md)（変異）（時期は [generation/arrangement.md](./generation/arrangement.md)（主題の共有）） |
| 　転換 | [generation/drums.md](./generation/drums.md)（転換） |
| 　大きなフィル（32bar の終わり） | [generation/drums.md](./generation/drums.md)（フィル） |
| 　エネルギーカーブ | [generation/form.md](./generation/form.md)（エネルギー）、間引き→[generation/drums.md](./generation/drums.md)（エネルギーによる間引き） |
| 　ベース | [generation/pitched-parts.md](./generation/pitched-parts.md)（サブベース）（音高はコードに従うよう改めた） |
| 　データ構造 | 各文書の「実装」（型） |
| 　シードの派生 | [generation/random.md](./generation/random.md)（シードの派生） |
| パラメーター仕様 | [generation/random.md](./generation/random.md)（パラメーターのラッチ）、範囲と既定値は `config.example.json` と [interface/screen.md](./interface/screen.md)（メニュー） |
| 非機能要件 | [quality/requirements.md](./quality/requirements.md) |
| 受け入れ基準 | 自動の基準はテスト（[quality/testing.md](./quality/testing.md)）、手動の基準は [quality/release-checklist.md](./quality/release-checklist.md) |
| 未決事項 | 一度きり（後の「確定した事項」で解決した） |

## `specs/phase1/design.md`

| 見出し | 移した先・理由 |
| --- | --- |
| フェーズ1設計書 | （文書の題） |
| モジュール構成と依存方向 | [architecture.md](./architecture.md)（モジュールと依存の向き） |
| 型 | [architecture.md](./architecture.md)（主な型）と各文書の「実装」 |
| シード | [generation/random.md](./generation/random.md)（シードの派生） |
| 　MVP のシード衝突の修正 | [generation/random.md](./generation/random.md)（シードの派生） |
| 　派生の一覧 | [generation/random.md](./generation/random.md)（シードの派生） |
| パラメーターのラッチ | [generation/random.md](./generation/random.md)（パラメーターのラッチ） |
| ドラム生成器 | [generation/drums.md](./generation/drums.md)（実装） |
| 　転換 | [generation/drums.md](./generation/drums.md)（転換） |
| 　間引き | [generation/drums.md](./generation/drums.md)（エネルギーによる間引き） |
| 　大きなフィル | [generation/drums.md](./generation/drums.md)（フィル） |
| ベース生成器 | [generation/pitched-parts.md](./generation/pitched-parts.md)（サブベース） |
| 　型の重み表 | [generation/pitched-parts.md](./generation/pitched-parts.md)（サブベース） |
| 　音高 | 置き換え済み（音階上の距離から構成音の番号に改めた）→[generation/pitched-parts.md](./generation/pitched-parts.md)（決めた理由） |
| 　ノートの長さ | [generation/pitched-parts.md](./generation/pitched-parts.md)（共通の規則） |
| 再生エンジン | [playback/sound.md](./playback/sound.md)（決めた理由） |
| UI | 置き換え済み（位置の文字の表示を削った）→[interface/screen.md](./interface/screen.md) |
| シミュレーション | [quality/testing.md](./quality/testing.md)（シミュレーション） |
| 受け入れ基準とテストの対応 | [quality/testing.md](./quality/testing.md)（テストの対応は各テストファイルに移した） |

## `specs/phase2/requirements.md`

| 見出し | 移した先・理由 |
| --- | --- |
| フェーズ2要件定義書（ハーモニー、ウワモノとミックス） | （文書の題） |
| 目的とスコープ | [concept.md](./concept.md)（目的）、扱わないもの→[concept.md](./concept.md)（扱わないこと） |
| フェーズ1要件からの変更点 | 一度きり（前のフェーズとの差分。変更後の規則を各文書に移した） |
| システム構成 | [architecture.md](./architecture.md) |
| 機能要件 | 表の各行を各領域の文書の「振る舞い」に移した |
| 生成ロジック仕様 | 下の見出しごと |
| 　コード | [generation/harmony.md](./generation/harmony.md)（コード） |
| 　進行 | [generation/harmony.md](./generation/harmony.md)（進行） |
| 　サブベース（F-23 の改訂） | [generation/pitched-parts.md](./generation/pitched-parts.md)（サブベース） |
| 　リースベース | [generation/pitched-parts.md](./generation/pitched-parts.md)（リースベース） |
| 　スタブ | [generation/pitched-parts.md](./generation/pitched-parts.md)（スタブ） |
| 　パッド | [generation/pitched-parts.md](./generation/pitched-parts.md)（パッド） |
| 　ダッキング（サイドチェイン） | [playback/sound.md](./playback/sound.md)（ダッキング） |
| 　ミキサーとダイナミクス | [playback/sound.md](./playback/sound.md)（ミキサー） |
| 　データ構造 | 各文書の「実装」（型） |
| 　シードの派生 | [generation/random.md](./generation/random.md)（シードの派生） |
| パラメーター仕様 | [generation/random.md](./generation/random.md)（パラメーターのラッチ）、範囲と既定値は `config.example.json` と [interface/screen.md](./interface/screen.md)（メニュー） |
| 非機能要件 | [quality/requirements.md](./quality/requirements.md) |
| 受け入れ基準 | 自動の基準はテスト（[quality/testing.md](./quality/testing.md)）、手動の基準は [quality/release-checklist.md](./quality/release-checklist.md) |
| 試聴を経て確定した事項 | 各文書の「決めた理由」に、値と一緒に移した |

## `specs/phase2/design.md`

| 見出し | 移した先・理由 |
| --- | --- |
| フェーズ2設計書 | （文書の題） |
| モジュール構成と依存方向 | [architecture.md](./architecture.md)（モジュールと依存の向き） |
| 型 | [architecture.md](./architecture.md)（主な型）と各文書の「実装」 |
| 　進行と 8bar の役割 | [generation/form.md](./generation/form.md)（実装） |
| 　イベント | [architecture.md](./architecture.md)（主な型） |
| 進行の選択 | [generation/harmony.md](./generation/harmony.md)（関数） |
| 音程のあるパートの共通規則（`generators/line.ts`） | [generation/pitched-parts.md](./generation/pitched-parts.md)（実装） |
| リースベース | [generation/pitched-parts.md](./generation/pitched-parts.md)（リースベース） |
| スタブ | [generation/pitched-parts.md](./generation/pitched-parts.md)（スタブ） |
| パッド | [generation/pitched-parts.md](./generation/pitched-parts.md)（パッド） |
| ダッキング（`engine/ducking.ts`） | [playback/sound.md](./playback/sound.md)（ダッキング） |
| クリップ検出（`engine/clip.ts`、`engine/clip-worklet.ts`） | [playback/sound.md](./playback/sound.md)（クリップの検出） |
| 再生エンジン | [playback/sound.md](./playback/sound.md)（音の経路） |
| 　信号の経路 | [playback/sound.md](./playback/sound.md)（音の経路） |
| 　セッションごとに作り直すもの | [playback/sound.md](./playback/sound.md)（決めた理由） |
| 　音色 | [playback/sound.md](./playback/sound.md)（音色） |
| 　定数の既定値 | 既定値は `config.example.json`。理由は [playback/sound.md](./playback/sound.md)（決めた理由） |
| 　ミキサーの既定値 | 既定値は `config.example.json`。理由は [playback/sound.md](./playback/sound.md)（決めた理由） |
| パラメーター | [playback/sound.md](./playback/sound.md)（ミキサー）、[architecture.md](./architecture.md)（決めた理由） |
| UI | 置き換え済み（ミキサーをメニューに移した）→[interface/screen.md](./interface/screen.md)（メニュー） |
| シミュレーション | [quality/testing.md](./quality/testing.md)（シミュレーション） |
| 受け入れ基準とテストの対応 | [quality/testing.md](./quality/testing.md)（テストの対応は各テストファイルに移した） |

## `specs/phase3/requirements.md`

| 見出し | 移した先・理由 |
| --- | --- |
| フェーズ3要件定義書（FX とアレンジ） | （文書の題） |
| 目的とスコープ | [concept.md](./concept.md)（目的）、扱わないもの→[concept.md](./concept.md)（扱わないこと） |
| 聴かせどころと緩急の考え方 | [concept.md](./concept.md)（聴かせどころと緩急） |
| フェーズ2要件からの変更点 | 一度きり（前のフェーズとの差分。変更後の規則を各文書に移した） |
| システム構成 | [architecture.md](./architecture.md) |
| 機能要件 | 表の各行を各領域の文書の「振る舞い」に移した |
| 生成ロジック仕様 | 下の見出しごと |
| 　サイクルとシーン | [generation/arrangement.md](./generation/arrangement.md)（サイクル） |
| 　イントロ | [generation/arrangement.md](./generation/arrangement.md)（イントロ） |
| 　シーンごとのパート | [generation/arrangement.md](./generation/arrangement.md)（シーンごとのパート） |
| 　エネルギー | [generation/arrangement.md](./generation/arrangement.md)（エネルギー） |
| 　主題の共有 | [generation/arrangement.md](./generation/arrangement.md)（主題の共有） |
| 　移調 | [generation/harmony.md](./generation/harmony.md)（移調） |
| 　音色 | [generation/arrangement.md](./generation/arrangement.md)（音色）、制約→[playback/sound.md](./playback/sound.md)（音色） |
| 　シーンの境界のフィル | [generation/drums.md](./generation/drums.md)（フィル） |
| 　ドロップの入り方 | [generation/arrangement.md](./generation/arrangement.md)（ドロップの入り方） |
| 　FX | [generation/fx.md](./generation/fx.md)（FX） |
| 　データ構造 | 各文書の「実装」（型） |
| 　シードの派生 | [generation/random.md](./generation/random.md)（シードの派生） |
| パラメーター仕様 | [generation/random.md](./generation/random.md)（パラメーターのラッチ）、範囲と既定値は `config.example.json` と [interface/screen.md](./interface/screen.md)（メニュー） |
| 非機能要件 | [quality/requirements.md](./quality/requirements.md) |
| 受け入れ基準 | 自動の基準はテスト（[quality/testing.md](./quality/testing.md)）、手動の基準は [quality/release-checklist.md](./quality/release-checklist.md) |
| 確定した事項 | 各文書の「決めた理由」に、値と一緒に移した |
| 試聴を経て確定した事項 | 各文書の「決めた理由」に、値と一緒に移した |

## `specs/phase3/design.md`

| 見出し | 移した先・理由 |
| --- | --- |
| フェーズ3設計書 | （文書の題） |
| モジュール構成と依存方向 | [architecture.md](./architecture.md)（モジュールと依存の向き） |
| 型 | [architecture.md](./architecture.md)（主な型）と各文書の「実装」 |
| 　`Context` に加えるもの | [architecture.md](./architecture.md)（主な型）と各文書の「実装」 |
| アレンジ（`structure/arrangement.ts`） | [generation/arrangement.md](./generation/arrangement.md)（実装） |
| 　レイアウトとシーンの列 | [generation/arrangement.md](./generation/arrangement.md)（関数） |
| 　エネルギー | [generation/arrangement.md](./generation/arrangement.md)（エネルギー） |
| 　鳴らすパート | [generation/arrangement.md](./generation/arrangement.md)（関数） |
| 　境界の判定 | [generation/arrangement.md](./generation/arrangement.md)（関数） |
| 主題の共有 | [generation/arrangement.md](./generation/arrangement.md)（主題の共有） |
| 　進行（`structure/harmony.ts`） | 置き換え済み（色付けを加えた）→[generation/harmony.md](./generation/harmony.md)（関数） |
| 　移調（`structure/key.ts`、`structure/harmony.ts`） | [generation/harmony.md](./generation/harmony.md)（関数） |
| 　型とモチーフ（`generators/line.ts`） | [generation/pitched-parts.md](./generation/pitched-parts.md)（実装） |
| 　ドラムの基準パターン | [generation/drums.md](./generation/drums.md)（基準パターンと基本パターン） |
| 音色 | [generation/arrangement.md](./generation/arrangement.md)（音色） |
| 　選択（`structure/timbre.ts`） | [generation/arrangement.md](./generation/arrangement.md)（音色） |
| 　音色の表（`engine/patches.ts`） | [playback/sound.md](./playback/sound.md)（音色） |
| 　切り替え（`engine/audio.ts`、`engine/transport.ts`） | [playback/sound.md](./playback/sound.md)（決めた理由） |
| シーンの境界のフィル（`generators/drums/fill.ts`） | [generation/drums.md](./generation/drums.md)（実装） |
| 選別と溜め（`generators/arrange.ts`） | [generation/fx.md](./generation/fx.md)（選別と溜め） |
| FX のイベント（`generators/fx/index.ts`） | [generation/fx.md](./generation/fx.md)（実装） |
| アンサンブル | [architecture.md](./architecture.md)（2bar ごとの生成の流れ） |
| オートメーション（`engine/automation.ts`） | [playback/sound.md](./playback/sound.md)（オートメーション） |
| 再生エンジン | [playback/sound.md](./playback/sound.md)（音の経路） |
| 　信号の経路 | [playback/sound.md](./playback/sound.md)（音の経路） |
| 　インパクトの音色 | [playback/sound.md](./playback/sound.md)（FX の鳴り方） |
| 　停止と再開 | [playback/sound.md](./playback/sound.md)（Instruments） |
| 　定数の既定値（ミキサー） | 既定値は `config.example.json`。理由は [playback/sound.md](./playback/sound.md)（決めた理由） |
| UI | 置き換え済み（シーン名などの表示を削った）→[interface/screen.md](./interface/screen.md)（位置の表示） |
| シミュレーション | [quality/testing.md](./quality/testing.md)（シミュレーション） |
| 受け入れ基準とテストの対応 | [quality/testing.md](./quality/testing.md)（テストの対応は各テストファイルに移した） |

## `specs/phase4/requirements.md`

| 見出し | 移した先・理由 |
| --- | --- |
| フェーズ4要件定義書（和声の拡充と UI の簡素化） | （文書の題） |
| 目的とスコープ | [concept.md](./concept.md)（目的）、扱わないもの→[concept.md](./concept.md)（扱わないこと） |
| フェーズ3要件からの変更点 | 一度きり（前のフェーズとの差分。変更後の規則を各文書に移した） |
| システム構成 | [architecture.md](./architecture.md) |
| 機能要件 | 表の各行を各領域の文書の「振る舞い」に移した |
| 生成ロジック仕様 | 下の見出しごと |
| 　コードの色付け | [generation/harmony.md](./generation/harmony.md) |
| 　テンション | [generation/harmony.md](./generation/harmony.md) |
| 　借用和音 | [generation/harmony.md](./generation/harmony.md) |
| 　主進行の表 | [generation/harmony.md](./generation/harmony.md) |
| 　色付けを決めるタイミング | [generation/harmony.md](./generation/harmony.md) |
| 　データ構造 | 各文書の「実装」（型） |
| 　シードの派生 | [generation/random.md](./generation/random.md)（シードの派生） |
| 一時停止と再開 | [playback/transport.md](./playback/transport.md) |
| 　状態 | [playback/transport.md](./playback/transport.md) |
| 　再開する位置 | [playback/transport.md](./playback/transport.md) |
| 　再開したときに鳴るもの | [playback/transport.md](./playback/transport.md) |
| UI 仕様 | 下の見出しごと |
| 　位置の表示 | [interface/screen.md](./interface/screen.md)（位置の表示） |
| 　シーケンサーとスペクトラムアナライザー | [interface/screen.md](./interface/screen.md)（シーケンサー） |
| 　メニュー | [interface/screen.md](./interface/screen.md)（メニュー） |
| 　ソロ | [playback/sound.md](./playback/sound.md)（ミキサー） |
| 　クエリ文字列 | [interface/integration.md](./interface/integration.md)（クエリ文字列のシード） |
| 　共有 | [interface/integration.md](./interface/integration.md)（共有） |
| 　メディア操作 | [interface/integration.md](./interface/integration.md)（メディア操作） |
| 　小さな画面 | [interface/screen.md](./interface/screen.md)（狭い画面） |
| 設定ファイル | [interface/integration.md](./interface/integration.md)（設定ファイル） |
| 　読み込み | [interface/integration.md](./interface/integration.md)（設定ファイル） |
| 　上書きできるもの | [interface/integration.md](./interface/integration.md)（設定ファイル） |
| 　上書きできないもの | [interface/integration.md](./interface/integration.md)（設定ファイル） |
| パラメーター仕様 | [generation/random.md](./generation/random.md)（パラメーターのラッチ）、範囲と既定値は `config.example.json` と [interface/screen.md](./interface/screen.md)（メニュー） |
| 非機能要件 | [quality/requirements.md](./quality/requirements.md) |
| 受け入れ基準 | 自動の基準はテスト（[quality/testing.md](./quality/testing.md)）、手動の基準は [quality/release-checklist.md](./quality/release-checklist.md) |
| 確定した事項 | 各文書の「決めた理由」に、値と一緒に移した |
| 試聴を経て確定した事項 | 各文書の「決めた理由」に、値と一緒に移した |

## `specs/phase4/design.md`

| 見出し | 移した先・理由 |
| --- | --- |
| フェーズ4設計書 | （文書の題） |
| モジュール構成と依存方向 | [architecture.md](./architecture.md)（モジュールと依存の向き） |
| 型 | [architecture.md](./architecture.md)（主な型）と各文書の「実装」 |
| 和声（`structure/harmony.ts`） | [generation/harmony.md](./generation/harmony.md) |
| 　コードの表 | [generation/harmony.md](./generation/harmony.md) |
| 　進行の型 | [generation/harmony.md](./generation/harmony.md) |
| 　進行の表 | [generation/harmony.md](./generation/harmony.md) |
| 　色付けの抽選 | [generation/harmony.md](./generation/harmony.md) |
| 　コンダクター | [generation/harmony.md](./generation/harmony.md)（関数） |
| 音程のあるパート | [generation/pitched-parts.md](./generation/pitched-parts.md) |
| 　ベース（`generators/line.ts`、`sub`、`reese`） | [generation/pitched-parts.md](./generation/pitched-parts.md) |
| 　スタブ（`generators/stab`） | [generation/pitched-parts.md](./generation/pitched-parts.md) |
| 　パッド（`generators/pad`） | [generation/pitched-parts.md](./generation/pitched-parts.md) |
| 　反復の一致（F-40）のテスト | [generation/form.md](./generation/form.md)（8bar の中の2bar） |
| 一時停止と再開 | [playback/transport.md](./playback/transport.md) |
| 　セッションの型（`engine/transport.ts`） | [playback/transport.md](./playback/transport.md) |
| 　予約済みの2bar（`engine/playhead.ts`） | [playback/transport.md](./playback/transport.md) |
| 　再開の流れ（`engine/transport.ts`） | [playback/transport.md](./playback/transport.md) |
| 　再開位置以降のイベント（`engine/resume.ts`） | [playback/transport.md](./playback/transport.md) |
| 　再開位置の値（`engine/automation.ts`） | [playback/sound.md](./playback/sound.md)（再開位置の値） |
| 　エンジン（`engine/audio.ts`） | [playback/sound.md](./playback/sound.md)（決めた理由） |
| ミキサーのソロ（`params/mixer.ts`、`engine/audio.ts`） | [playback/sound.md](./playback/sound.md)（チャンネルとフェーダー） |
| スペクトラムアナライザー | [playback/sound.md](./playback/sound.md)（スペクトラムアナライザーの取り出し） |
| 　取り出し（`engine/audio.ts`） | [playback/sound.md](./playback/sound.md)（スペクトラムアナライザーの取り出し） |
| 　表示（`ui/spectrum.ts`） | [interface/screen.md](./interface/screen.md)（スペクトラムアナライザー） |
| UI | [interface/screen.md](./interface/screen.md) |
| 　画面の組み立て（`main.ts`） | [interface/screen.md](./interface/screen.md) |
| 　再生の操作（`ui/controls.ts`） | [interface/screen.md](./interface/screen.md) |
| 　再生の命令（`ui/playback.ts`） | [interface/integration.md](./interface/integration.md)（メディア操作） |
| 　メディア操作（`ui/media-session.ts`） | [interface/integration.md](./interface/integration.md)（メディア操作） |
| 　共有（`ui/share.ts`、`params/query.ts`） | [interface/integration.md](./interface/integration.md)（共有とシード） |
| 　狭い画面（`ui/style.css`、`ui/grid.ts`） | [interface/screen.md](./interface/screen.md) |
| 　メニューの中身 | [interface/screen.md](./interface/screen.md) |
| 　位置の表示（`ui/position.ts`） | [interface/screen.md](./interface/screen.md)（スペクトラムアナライザー） |
| 　ステップグリッド（`ui/grid.ts`） | [interface/screen.md](./interface/screen.md) |
| 　シードのクエリ文字列（`params/query.ts`） | [interface/integration.md](./interface/integration.md)（共有とシード） |
| 設定ファイル | [interface/integration.md](./interface/integration.md)（設定ファイル）、置き場所の理由→[architecture.md](./architecture.md)（決めた理由） |
| 　型と既定値の置き場所 | [interface/integration.md](./interface/integration.md)（設定ファイル）、置き場所の理由→[architecture.md](./architecture.md)（決めた理由） |
| 　値の渡し方 | [interface/integration.md](./interface/integration.md)（設定ファイル）、置き場所の理由→[architecture.md](./architecture.md)（決めた理由） |
| 　キーと検証 | [interface/integration.md](./interface/integration.md)（設定ファイル）、置き場所の理由→[architecture.md](./architecture.md)（決めた理由） |
| 　検証の仕組み | [interface/integration.md](./interface/integration.md)（設定ファイル）、置き場所の理由→[architecture.md](./architecture.md)（決めた理由） |
| 　読み込み（`params/load-config.ts`） | [interface/integration.md](./interface/integration.md)（設定ファイル）、置き場所の理由→[architecture.md](./architecture.md)（決めた理由） |
| 　シミュレーション | [quality/testing.md](./quality/testing.md)（シミュレーション） |
| シミュレーション | [quality/testing.md](./quality/testing.md)（シミュレーション） |
| 受け入れ基準とテストの対応 | [quality/testing.md](./quality/testing.md)（テストの対応は各テストファイルに移した） |

## `specs/phase5/requirements.md`

| 見出し | 移した先・理由 |
| --- | --- |
| フェーズ5要件定義書（リリース準備と保守性の向上） | （文書の題） |
| 目的とスコープ | [concept.md](./concept.md)（目的）、扱わないもの→[concept.md](./concept.md)（扱わないこと） |
| フェーズ4要件からの変更点 | 一度きり（前のフェーズとの差分。変更後の規則を各文書に移した） |
| 進め方 | 一度きり（作業の順序） |
| 機能要件 | 表の各行を各領域の文書の「振る舞い」に移した |
| E2E テスト | [quality/testing.md](./quality/testing.md)（E2E テスト） |
| リファクタリング | 一度きり（作業）。守る性質は [quality/testing.md](./quality/testing.md)（生成の基準） |
| アクセシビリティ | [interface/screen.md](./interface/screen.md)（アクセシビリティ） |
| ブラウザの確認 | [quality/release-checklist.md](./quality/release-checklist.md)（ブラウザ） |
| 仕様の文書 | [README.md](./README.md)（文書の決まり） |
| 配布と CI/CD | [interface/integration.md](./interface/integration.md)（配布） |
| パラメーター仕様 | [generation/random.md](./generation/random.md)（パラメーターのラッチ）、範囲と既定値は `config.example.json` と [interface/screen.md](./interface/screen.md)（メニュー） |
| 非機能要件 | [quality/requirements.md](./quality/requirements.md) |
| 受け入れ基準 | 自動の基準はテスト（[quality/testing.md](./quality/testing.md)）、手動の基準は [quality/release-checklist.md](./quality/release-checklist.md) |
| 決定事項 | 各文書の「決めた理由」に、値と一緒に移した |

## `specs/phase5/design.md`

| 見出し | 移した先・理由 |
| --- | --- |
| フェーズ5設計書 | （文書の題） |
| 名称の扱い | [architecture.md](./architecture.md)（モジュールと依存の向き）（`src/app-name.ts`）、base path→[interface/integration.md](./interface/integration.md)（base path とビルド） |
| 基準の記録（実施済み） | [quality/testing.md](./quality/testing.md)（生成の基準） |
| リファクタリング | 一度きり（作業）。分けた後の形は [architecture.md](./architecture.md)（モジュールと依存の向き） |
| 　大きなファイルの分割 | 一度きり（作業）。分けた後の形は [architecture.md](./architecture.md)（モジュールと依存の向き） |
| 　テストの並べ替え | [quality/testing.md](./quality/testing.md)（構成） |
| 　コメントの書き換え | [quality/testing.md](./quality/testing.md)（慣習の検査） |
| base path とビルド | [interface/integration.md](./interface/integration.md)（base path とビルド） |
| E2E テスト | [quality/testing.md](./quality/testing.md)（E2E テスト） |
| 　道具と構成 | [quality/testing.md](./quality/testing.md)（E2E テスト） |
| 　音を鳴らす環境 | [quality/testing.md](./quality/testing.md)（E2E テスト） |
| 　差し替え | [quality/testing.md](./quality/testing.md)（E2E テスト） |
| 　テストの分担 | [quality/testing.md](./quality/testing.md)（E2E テスト） |
| アクセシビリティ | [interface/screen.md](./interface/screen.md)（アクセシビリティ） |
| 　画面の並びとフォーカスの順 | [interface/screen.md](./interface/screen.md)（アクセシビリティ） |
| 　タブの並び（`ui/tabs.ts`） | [interface/screen.md](./interface/screen.md)（アクセシビリティ） |
| 　名前と状態 | [interface/screen.md](./interface/screen.md)（アクセシビリティ） |
| 　フォーカスの移し方 | [interface/screen.md](./interface/screen.md)（アクセシビリティ） |
| 　読み上げ | [interface/screen.md](./interface/screen.md)（アクセシビリティ） |
| 　コントラスト | [interface/screen.md](./interface/screen.md)（アクセシビリティ） |
| ブラウザの確認 | [quality/release-checklist.md](./quality/release-checklist.md)（ブラウザ） |
| 　調べてから手当てすること | [interface/integration.md](./interface/integration.md)（システムによる中断）（実機で確かめた結果と手当て。ロック画面から再生した後の音の遅れは、制約として README に書き、Issue に移した） |
| CI/CD（`.github/workflows/ci.yml`） | [interface/integration.md](./interface/integration.md)（CI/CD） |
| 素材とライセンス | [interface/integration.md](./interface/integration.md)（ドラムサンプル） |
| `package.json` と README | 一度きり（作業）。README と `package.json` に反映した |
| 仕様の文書への移行 | 一度きり（この移行表） |
| 受け入れ基準とテストの対応 | [quality/testing.md](./quality/testing.md)（テストの対応は各テストファイルに移した） |
| リスクと対策 | 各文書の「決めた理由」（E2E の安定→[quality/testing.md](./quality/testing.md)（E2E テスト）、分割での音の変化→[quality/release-checklist.md](./quality/release-checklist.md)（試聴（1時間））、文書の移行→この移行表） |
