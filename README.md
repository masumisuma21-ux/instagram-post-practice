# つむぐ — Instagramカルーセルメーカー

ビルド不要のHTML / CSS / JavaScriptツールです。dist/index.htmlが入口です。

1. 投稿テーマ、アカウント名、7枚分の見出し・本文を編集
2. デザインタブで背景色・文字色・アクセント・フォント・本文サイズを変更
3. サムネイルか左右ボタンで確認
4. PNGを1枚ずつ、または7枚入りZIPで保存
5. ZIPを展開し、Canvaの1080×1350pxデザインへアップロード

入力はブラウザのlocalStorageに保存されます。画像内の文字はCanvaでは画像として扱われます。
日本語フォントはNoto CJK（SIL Open Font License）を同梱。
ローカル利用: python -m http.server 8000 --directory dist を実行し、http://localhost:8000 を開きます。
