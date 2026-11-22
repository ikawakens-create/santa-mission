# サンタからの きんきゅうミッション

クリスマス会用の謎解きPWA（Android Chrome向け）。ビルド不要の HTML / CSS / JS です。

## あとで入れるもの

| 内容 | 場所 |
|---|---|
| パスコード・隠し場所ヒント・追加ヒント | `config.js` の `key1` |
| 大きい箱の場所ヒント | `config.js` の `key2.boxHint` |
| 曲名・ゲージ秒数 | `config.js` の `key3` |
| 最終プレゼントのヒント | `config.js` の `ending` |
| 子ども5人の名前 | 管理画面「1. なまえ設定」（スマホの中だけに保存） |
| まねまねポーズの譜面・サンタのせりふ・速さ | `config.js` の `poseGame` |
| つみきの完成図 | 管理画面「5. 完成図エディタ」 |

完成図がまだなくても動きます（`config.js` の見本の形が表示されます）。

## 隠し操作（パパ用）

- **管理画面**：左上の 🎄 を3秒長押し → 暗証番号（`config.js` の `adminPin`、初期値は `4071`）
- **早送り／強制クリア**：左上の 🎄 と右下の角を、2本指で同時に2秒長押し
- **まねまねポーズ中の早送り**：ゲームを飛ばして「ベストポーズ写真館」へ進みます

## 公開（GitHub Pages）

1. このフォルダの中身を、リポジトリの一番上に置いてpushする
2. リポジトリの Settings → Pages → Branch を `main` / `(root)` にする
3. Android Chromeで開き、メニューから「ホーム画面に追加」（または「アプリをインストール」）を選ぶ

## 変更したとき（重要）

`config.js` やコードを変えたら、**`sw.js` の `CACHE_VERSION` を1つ上げて**（`"v1"` → `"v2"`）pushしてください。
スマホでアプリを2回開き直すと、新しい版に入れかわります。

## アイコン

- `icons/icon-192.png` と `icons/icon-512.png` は作成済みです
- 箱に入れる紙の印刷用には `icons/icon-print-1024.png` を使います
- デザインを変えたいときは `icons/icon.svg` を編集し、`icon-generator.html` でPNGを作り直します

## まねまねポーズの譜面の書き方

`config.js` の `poseGame.sets` に、前半・後半の2セットがあります。1行が1フレーズ（サンタのお手本 → みんなの番）です。

```js
{ who: "solo", hits: [[2, "robot"], [4, "banzai"]] }
```

- `who`：`all`（みんな）／`solo`（1人）／`pair`（2人）／`trio`（3人）／`relay`（1拍ごとに次の子）／`fake`（ハックション＝まねしない）
- `hits`：`[拍, ポーズ]`。拍は1〜4（`bars: 2` なら1〜8）。`2.5` のような裏拍も書けます
- ポーズ：`banzai` `pachi` `disco` `flamingo` `hohoho` `kenken` `robot` `yukidaruma` `hoshi` `tonakai`
- 名前を呼ぶ順番は自動で回るので、5人とも同じくらいソロが回ってきます
