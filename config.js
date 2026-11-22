// =============================================================
//  サンタからの きんきゅうミッション  設定ファイル
//  ここを書きかえたら、sw.js の CACHE_VERSION も 1つ上げてね
// =============================================================
export const CONFIG = {
  // 管理画面の暗証番号（4桁）※クリスマスの日付など推測しやすい数字はさける
  adminPin: "4071",

  opening: {
    title: "サンタさんから きんきゅうメールが とどきました！",
    message:
      "みんな、メリークリスマス！ サンタじゃよ。\n" +
      "ことしは おおいそがしで いけなくなってしまったんじゃ！\n" +
      "プレゼントは おうちの どこかに かくして、3つの まほうのカギを かけたよ。\n" +
      "5にんで ちからを あわせて あけておくれ！"
  },

  key1: {
    passcode: "12345", // 5桁の数字（hints の並び順に対応）
    // {name} は管理画面の「なまえ設定」で入れた名前に置きかわる
    hints: [
      { defaultName: "1ばんめ", text: "{name}の すうじは、リビングの クッションの した！" },
      { defaultName: "2ばんめ", text: "{name}の すうじは、れいぞうこの とびら！" },
      { defaultName: "3ばんめ", text: "{name}の すうじは、テレビの よこ！" },
      { defaultName: "4ばんめ", text: "{name}の すうじは、ほんだなの なか！" },
      { defaultName: "5ばんめ", text: "{name}の すうじは、げんかんの くつばこ！" }
    ],
    extraHintAfter3Misses:
      "みつけにくい すうじは、ものの うらがわや すきまも よーく さがしてみてね！"
  },

  key2: {
    title: "とっても おおきな つみきを つくろう！",
    boxHint: "おうちの 〇〇に とっても おおきな はこが かくしてあるよ！ さがしてみてね！",
    scanDurationMs: 5000,
    // 管理画面で完成図を保存していないときに表示する見本（1=ぬる / 0=からっぽ）
    sampleSilhouette: [
      "00000000",
      "01111100",
      "01111110",
      "00111110",
      "00111100",
      "00000000"
    ]
  },

  // まねまねポーズ クリスマスケーキ（サンタからの ビデオでんわ）
  poseGame: {
    // でんわに でた あとの サンタの せりふ
    talk: [
      "おお！ みんな！\nつみき、かんぺきじゃったな！",
      "サンタは いま ケーキづくりで おおいそがし！\nサンタの ポーズを まねして、てつだっておくれ！"
    ],
    // ぜんはんが おわったときの せりふ
    halfTalk: [
      "いいぞ〜！ スポンジが やけた！\nつぎは かざりつけ。もっと はやく なるぞ〜！"
    ],
    // ケーキが かんせいしたあとの せりふ（{song} は きょくめいに おきかわる）
    clearTalk: [
      "すばらしい！ さいこうの ケーキが できたぞ！\nさいごの カギを あける まほうは… みんなの うたごえじゃ！",
      "「{song}」を\n5にんで おおきな こえで うたっておくれ！"
    ],

    // ---- ふめん ----
    // 1ぎょう＝1フレーズ（サンタの おてほん → みんなの ばん）
    // who: "all"=みんな / "fake"=ハックション（まねしない）
    // hits: [はく, ポーズ]  はくは 1〜4（bars:2 なら 1〜8）。2.5 のような うらはくも OK
    // ポーズ: banzai hoshi flamingo disco robot hohoho yukidaruma tonakai
    sets: [
      {
        title: "ぜんはん", subtitle: "スポンジを やくぞ！", bpm: 96,
        phrases: [
          { who: "all", hits: [[3, "banzai"]] },
          { who: "all", hits: [[2, "flamingo"], [4, "banzai"]] },
          { who: "all", hits: [[3, "disco"]] },
          { who: "all", hits: [[2, "robot"], [4, "hoshi"]] },
          { who: "all", hits: [[2, "tonakai"], [3, "tonakai"], [4, "hohoho"]] },
          { who: "all", bars: 2, tame: true, hits: [[3, "yukidaruma"], [5, "hoshi"]] }
        ]
      },
      {
        title: "こうはん", subtitle: "かざりつけじゃ！", bpm: 116,
        phrases: [
          { who: "all",  hits: [[2, "disco"], [3, "disco"], [4, "banzai"]] },
          { who: "all",  hits: [[1, "robot"], [2.5, "robot"], [4, "flamingo"]] },
          { who: "fake", hits: [[2, "haa"], [3, "haa"], [4, "sneeze"]] },
          { who: "all",  hits: [[2, "tonakai"], [3, "hohoho"], [4, "hoshi"]] },
          { who: "all",  bars: 2, hits: [[2, "banzai"], [3, "disco"], [4, "robot"], [5, "flamingo"], [6, "hoshi"]] },
          { who: "all",  bars: 2, tame: true, hits: [[3, "yukidaruma"], [5, "hoshi"]] }
        ]
      }
    ]
  },

  key3: {
    songTitle: "あわてんぼうの サンタクロース",
    gaugeDurationSec: 90 // うたごえパワーが満タンになるまでの秒数
  },

  ending: {
    message: "5にんとも ありがとう！ みごと 3つの カギが あいたぞ！\nメリークリスマス！",
    finalHint: "さいごの プレゼントは、〇〇の なかに かくしてあるよ！",
    finalImage: "" // 任意：写真を使うときは "./assets/hint.jpg" のように書く
  }
};
