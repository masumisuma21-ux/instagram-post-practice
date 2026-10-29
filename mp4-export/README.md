# 商品紹介リール MP4保存（Windows優先・公開前検証用）

2026年10月29日（日本時間）。ブランチ `feature/mp4-audio-export`。
最新main `5308bcd537253189fb0884c07fc1c7a292a458c8` と `prototype/local-mp4-export` の差分を確認し、試作コミット `3cbc395` を引き継いだ。作業開始時のmainへの追加コミットはなし。mainマージ・Pages更新は承認待ち。

初回試作の画面・測定記録は元のprototype/local-mp4-exportブランチ（3cbc395）に保持する。このPRのmain差分には本番モジュール・必要なテスト・記録だけを含め、旧試作の別画面は含めない。

## 実装範囲

動画カット編集画面に「出力できるか確認」「MP4で保存」「キャンセル」、進捗、ダウンロードリンク、書き出したMP4の再生を追加。保存はブラウザ標準のダウンロード機能を使う（既定は通常ダウンロードフォルダ。ブラウザの「保存先を確認」設定は尊重する）。出力成功後に自動ダウンロードを開始し、ブロックされた場合も保存リンクを残す。

- H.264 / 1080×1920 / 30fps / 約8Mbps。元音声保持を選んだ場合はAAC / 48kHz / monoまたはstereo / 192kbpsへ再エンコードする。明示的な無音出力も可能。
- 出力上限60秒・100MiB。既存の動画編集上限10分や保存形式は変えない。60秒超過は元データを保持して理由を表示する。
- 元動画は変更せず、カット順・開始終了・cover/contain・ズーム・位置・テロップを出力へ反映。既存 `TsumuguVideo.crop`、`TsumuguVideoCaptions.render`、日本語レイアウトを再利用。セーフガイド/編集枠は出力しない。
- AACをパケット単位でコピーする旧試作と異なり、PCMへデコードし、サンプル位置を計算して切り出す。カット累積時刻を48kHzの整数サンプルへ変換し、隙間・重複を作らず1つのAACエンコーダーへ連続入力する。音声なしの区間は同じ長さのゼロPCM。
- mono/stereo、8〜96kHzに対応。各カットをOfflineAudioContextで48kHzへ変換し、monoをstereoへ合わせる必要がある場合はL/Rへ同じ値をコピーする。音量・正規化・フェード・BGM・チャンネルの入れ替えは追加していない。多チャンネルやデコード不能な音声は勝手に削除せず中止する。
- 30fpsの映像格子への丸めは最大約1フレーム。最後の映像フレームに必要な最小の無音を足す場合がある。AACの最後のパディングにより、コンテナの長さが映像より最大約1 AACパケット長くなる場合がある。途中のカットでAACエンコーダーはリセットしない。

## Windows対応と事前判定

対応APIの存在だけでは成功扱いにしない。VideoEncoder.isConfigSupported / AudioEncoder.isConfigSupportedを調べた後、実際に1080×1920 H.264を1フレーム、AACを短くエンコードし、できたMP4のトラックを再解析してから開始する。

Windows実機のChrome/Edgeは**未検証**。この環境はLinux Chromium 154。ネイティブH.264は実出力可能だが、ネイティブAACは非対応だった。その環境で元音声付き出力を選ぶと、画面に理由を表示して止める。無断で音声を落としたりWebMへ変えたりしない。最新版Windows Chrome/Edgeでの再診断、明示無音、元動画と既存CapCut素材での仕上げを案内する。今回の新動画プロジェクトを既存5シーンCapCut ZIPへ自動変換する機能は追加していない。

「出力できるか確認」はキャッシュを破棄して再診断する。無音出力もH.264実エンコード確認が必要。MP4の拡張子を付け替える処理はない。

### 音声経路のテスト方法と検証限界

Linuxではnative AACがないため、**テスト内だけ** `@mediabunny/aac-encoder 1.63.0` のローカルWASM AACを登録し、同じAudioSampleSource/MP4経路に実データを通して解析した。得られたMP4は本物のH.264/AACで、模擬データへの差し替えやFFmpegでの出力代替ではない。ただしエンコーダーのバックエンドが異なるため、これをWindowsネイティブAACの合格とはしない。測定結果にも `audioBackend: registered-local` を記録する。

このテスト拡張はwork/にのみ取得し、公開コード・コミット・Pages allowlistには含めない。本番コードで拡張を自動登録したりCDNから取得することもない。テスト用パッケージはMPL-2.0 wrapperとFFmpeg AACのWASMを利用する開発用ツール。もし将来ブラウザAACの代替として配布する場合は、ライセンス/ソース提供/worker/CSP/端末対応を別途評価してから導入する。

## 色・映像とプレビュー

明示SDR/BT.709ではWebCodecs/CanvasSinkを使用。色空間不明・別SDRの素材は通常プレビューと同じHTMLVideoElementを使う低速経路へ切り替え、推測したBT.709で色を変えない。この経路は色空間情報のない実H.264素材でMP4出力を確認した。HDR（BT.2020/PQ/HLG）は明示的に停止する。回転・画素比の保存寸法が異なる素材も停止する。

初回試作で見つかった通常プレビューの特定のフレーム境界における1フレーム差は、既存プレイヤーを全面改修せず残している。WebCodecs出力は指定30fpsの格子、ネイティブの一時停止表示はブラウザの提示フレームに依存する。今回の評価は焼き込み位置・表示時間・カット順・開始終了と独立デコードを含み、「既存プレビューと全フレーム厳密一致」とは主張しない。実機確認項目に残す。

## データ保護

- 書き出し開始時にアカウントIDとproject/Blob参照を含む読取snapshotを作成する。exporterはDB/APIを扱わず、projectをcloneして処理する。
- 書き出しは既存保存を削除・初期化・書き換えない。既存の未保存編集の通常オートセーブは、処理終了後に再開する。
- busy登録でアカウント切替・カット/テロップ操作・モード切替を防ぎ、二重実行を抑止する。アカウント/プロジェクト切替や編集時は、古い出力URLを破棄して他アカウントの結果を表示しない。
- キャンセル/例外では部分MP4をダウンロードせず、デコーダー/エンコーダー/一時URLを解放。編集画面を復帰させる。モジュール読み込み失敗時もフィード/5シーン台本は使用できる。
- 元動画のfetch/アップロード、外部API、マイクアクセス、有料サービスは追加しない。新規モジュールは保存ボタン押下時に同じサイトから遅延読み込みする。
- DB/JSON/カット/テロップの保存フィールド変更なし。7枚フィード・写真/見出し/本文・5シーン台本・既存CapCut ZIPのコードは変更しない。

## ライブラリとPages

初回試作の未改変Mediabunny 1.63.0 bundle（713,966 bytes、gzip約184KB）を共通 `vendor/mp4` へ移動した。ライセンス全文・ソース案内・整合性記録を維持。新しい本番ランタイム依存は追加していない。

Pagesワークフローはmp4-exportの3モジュールとvendor/mp4のbundle/ライセンス/NOTICEだけを追加配布するよう変更。prototypes・tests・work・測定MP4/バックアップは公開用サイトへ含めない。main push時のみのデプロイ条件・既存公開URLは維持。今回はmainマージ/公開しない。

## 確認済み項目

- 本番相当Linuxの非対応診断：AAC非対応を表示、音声付きダウンロードなし、元データ不変。
- テスト専用AAC：16秒/36秒、mono44.1kHz→stereo48kHz→無音混在、サンプル/左右/音量/時間/テロップを独立のFFmpeg/ffprobeで解析。
- 実UI：診断、キャンセル、再試行、ダブルクリック防止、自動ダウンロード、出力再生、busy中のアカウント切替拒否、切替後の結果隔離、元Blob SHA-256不変。
- 単体：累積サンプル境界、隙間/重複なし、ブロック時刻、mono複製でゲインを変えない、無音、キャンセル。
- 61秒は明確に拒否。60秒は上限として実出力し負荷測定。色空間不明SDRはネイティブ経路で実出力。モジュール失敗後もフィード/台本を操作可能。
- 既存回帰：PNG42条件の全RGBA一致（ページ番号ずれなし）、テロップ/タイムラインのマウス・タッチ、本文/写真/見出し編集、保存/再読み込み/JSON/アカウント分離、5シーン台本/フック/CapCut ZIP/SRT。

Linux Chromium 154・3論理CPU、合成180×320/320×180素材を拡大した参考測定（各条件1回、Windows/実写性能の保証ではない）。

| プロジェクト | 生成時間 | MP4サイズ | サンプル合算RSS最大 |
|---|---:|---:|---:|
| 16秒 | 6.84秒 | 14.67MiB | 約1,283MiB |
| 36秒 | 14.23秒 | 31.78MiB | 約1,572MiB |
| 60秒 | 42.54秒 | 53.11MiB | 約1,445MiB |

RSSはブラウザ全体・共有メモリの重複計上・テストのPNG等を含むプロセスツリーの参考値で、exporterだけの必要メモリ量ではない。60秒測定は別の回帰テストとも並行しており、速度の厳密比較には使わない。長時間はBufferTarget/Blobで出力分を保持し負荷が大きい。

16秒/36秒の音の目印と参照PCMのずれは1ms窓の測定で0ms。映像フラッシュとの最大差は約19.67ms（映像は1/30秒刻み）。意図した無音区間の内部は無音。左右/mono複製を保持し、RMSレベル差はAAC再圧縮後で最大約0.0103dB。サンプル単位のビット一致や聴感の完全一致を意味しない。

16秒のコンテナは16.000秒、36/60秒はAAC末尾パディングを含み36.010667/60.010667秒。映像はそれぞれ480/1080/1800フレームで正確な30fps。末尾のパディングは途中のカット間の隙間とは区別する。

実測値・結果と残課題は `RESULTS.json` を参照。

## 未検証・公開判断

**このPRだけで直ちに公開することは推奨しない。** 最優先対象のWindows Chrome/EdgeのネイティブH.264/AAC実機確認が未完了のため、Draft PRでレビューを依頼する。

公開前にWindows Chrome/Edgeで16/36秒の実写（mono/stereo/無音混在）を出力し、実音声の聴感、カット境界、AACの冒頭遅延/末尾パディング、保存先・キャンセル、60秒時のメモリを確認する。4K/HEVC/VFR/回転/低メモリPCは未検証。HDRと60秒超は非対応。現段階はBufferTarget/Blob方式で、長時間ファイルを逐次ディスク保存するWorker/FileSystemAccess最適化は今後の課題。

## 開発者向け再現

Node/Playwright/Chromium、Python numpy/Pillow、FFmpeg/FFprobeは検証用のみ。公開サイトの依存にはしない。

```
python3 tests/create-video-fixtures.py
python3 tests/create-mp4-sync-fixtures.py
python3 tests/create-mp4-audio-fixtures.py
# テスト専用AACは npm pack @mediabunny/aac-encoder@1.63.0 --ignore-scripts で取得・展開し、
# work/aac-library/package/dist/bundles/mediabunny-aac-encoder.min.mjs に配置する。
# AAC_TEST_BUNDLE_PATH で同じ固定バージョンのローカルファイルも指定可能。
node tests/mp4-boundaries.mjs
node tests/mp4-audio-export.browser.cjs
node tests/mp4-audio-export.browser.cjs --long
python3 tests/analyze-mp4-audio.py
node tests/mp4-editor-ui.browser.cjs
node tests/mp4-guardrails.browser.cjs
```

通常画面の開発プレビューはルートで `python3 -m http.server 4180 --bind 127.0.0.1`、Chrome/Edgeで `http://127.0.0.1:4180/` →「動画カット編集」→診断。localhostはsecure context。APIキー不要。ローカルoriginの保存データは既存公開サイトと別で、必要な場合はJSONバックアップを明示的に復元して使う。

テスト専用AAC npm archiveの照合済みintegrity：`sha512-sredLbD+AnlCKKMa0j4ymxYn+5JLwXe3PdOnI8ia97c788mfE0tRmzaFZNHx/GuS/tloEJiOiIVWcL229rBQ/g==`。配布物には含めない。
