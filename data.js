// 餵食零韻・萬聖節 Trick or Treat — 資料表
//
// 月月填：name / lore / verdict / text，以及 taste、bonus 等數值（目前全是暫定值）
// 程式讀：id / zone / tags / rule / params / anim / requires / effect（固定代號，改了要同步改程式）
//
// 用 window.GAME_DATA 而不是 JSON，直接開 index.html（file://）也讀得到，不用 fetch。
//
// ── 代號表 ──────────────────────────────────────────
// zone        normal 正常食材 / mine 地雷 / setA 葛萊普尼爾 / setB 竹取五難題
//             setC 飛行軟膏 / loose 散裝魔幻 / special 特殊罐
// element     五行：金 木 水 火 土。相鄰時 生 → 被生的一方 ×(1+wuxing.generate)，剋 → 被剋的一方 ×(1−wuxing.overcome)
//             木生火、火生土、土生金、金生水、水生木；木剋土、土剋水、水剋火、火剋金、金剋木
// taste       色香味星數 [色, 香, 味]，0–3；稀有度會往上加（見 config.rarities）
//             分數 = 星數 × 占格數 × 各種倍率，三項加總就是總分
// tags        liquid 液體（河童皿、骷髏杯看這個）/ sound 聲音系 / witch 魔女系（大釜加成）
//             toxic 毒物 / yokai 妖怪履歷 / longevity 長生系判詞 / lunar 月見系
//             highvalue 高價材料 / dog_tongue 含犬之舌（曼德拉草安全處理）
//             inedible 不能吃：每格 味 −config.inediblePenalty
// 材料 rule   null 無特效（只算色香味）
//             flip            落盤即掀盤 0 分（鳳梨）
//             discount        嫌棄傳染：相鄰材料分數 ×(1 − params.rate)，不觸發 trick
//             authenticity    真贗盲盒，抽到時依 config.fakeChance 決定真假；贗品色香味全 0
//             toxic_risk      單放有毒性風險，params.chance = 觸發即死機率
//             instadeath      未處理即死（由 combos 的 cancel_instadeath 解除）
//             neutralize_once 中和一次即死或地雷（角粉）；只救相鄰格
//             immune_once     整盤免疫一次失敗（鱗片）
//             fake_label      標示與實際相反（附子罐）：顯示 params.label，揭曉前看不到星數
//             pending         規則待月月裁定
// 容器 rule   none / pineapple_legal / vanish_one / keep_one_on_fail / need_liquid
//             duplicate_one / liquid_only / witch_bonus / flip_half
// combo effect cancel_instadeath / ending / float / collection；bonus = 成立時加的分數
//             2–3 件組合：材料要在盤上相鄰（上下左右）連成一塊；5 件以上套裝：同盤即可
// event rule  nibble 零韻偷吃一格 / swap 兩格換位 / price_mult 一樣材料分數 ×params.mult
// ────────────────────────────────────────────────

window.GAME_DATA = {
  ingredients: [
    // ── 正常食材 ──
    { id: "flour",     name: "麵粉",   zone: "normal", element: "土", taste: [1, 0, 1], tags: [], rule: null, lore: "小麥磨成的粉。所謂筋度就是蛋白質含量：高筋做麵包、低筋做蛋糕、中筋做一切。《本草綱目》：「小麥，甘，微寒。除熱，止煩渴。」", verdict: "", sprite: "food_flour.png" },
    { id: "egg",       name: "雞蛋",   zone: "normal", element: "土", taste: [1, 1, 1], tags: [], rule: null, lore: "蛋黃的顏色來自飼料裡的葉黃素，跟營養無關。台灣人一年人均吃掉三百多顆。《本草綱目》：「雞子，甘，平。鎮心，安五臟。」", verdict: "", sprite: "food_egg.png" },
    { id: "raw_sugar", name: "二砂糖", zone: "normal", element: "土", taste: [1, 0, 2], tags: [], rule: null, lore: "第二道結晶的蔗糖，台糖出品的古早味；那股焦香是精煉前的甘蔗本色。《本草綱目》：「沙糖，甘，寒。潤心肺，解酒毒。」", verdict: "", sprite: "food_sugar.png" },
    { id: "butter",    name: "奶油",   zone: "normal", element: "土", taste: [1, 2, 2], tags: [], rule: null, lore: "牛乳攪打出的脂肪。古人把乳製品精煉分級，最上等的叫醍醐——醍醐灌頂澆下去的就是這個。《本草綱目》：「酥，甘，微寒。益虛勞，潤臟腑。」", verdict: "", sprite: "food_butter.png" },
    { id: "milk",      name: "牛奶",   zone: "normal", element: "水", taste: [1, 1, 1], tags: ["liquid"], rule: null, lore: "白色不是脂肪的顏色，是酪蛋白散射光的顏色。加熱浮起的那層奶皮是蛋白質帶著脂肪，撈掉等於撈掉精華。《本草綱目》：「牛乳，甘，微寒。補虛羸，止渴。」", verdict: "", sprite: "food_milk.png" },
    // 蜂蜜算不算液體待定；目前算，讓骷髏杯不至於只有四樣能放
    { id: "honey",     name: "蜂蜜",   zone: "normal", element: "水", taste: [2, 2, 2], tags: ["liquid"], rule: null, lore: "幾乎不會腐壞——水分太少，細菌活不下去；埃及古墓裡挖出的三千年蜂蜜據說還能吃。《本草綱目》：「蜂蜜，甘，平。安五臟，益氣補中。」", verdict: "", sprite: "food_honey.png" },
    { id: "cinnamon",  name: "肉桂",   zone: "normal", element: "火", taste: [1, 3, 1], tags: [], rule: null, lore: "拿樹皮當香料的少數派。台灣原生的土肉桂更怪：香氣集中在葉子，皮反而不行。《本草綱目》：「桂，辛，熱。利肝肺氣，宣導百藥。」", verdict: "", sprite: "food_cinnamon.png" },
    { id: "pumpkin",   name: "南瓜",   zone: "normal", element: "土", taste: [3, 1, 2], tags: [], rule: null, lore: "萬聖節本命。傑克燈原本刻的是蕪菁，南瓜是移民美國之後的在地化補丁。台灣市場主流是栗子南瓜跟東昇。《本草綱目》：「南瓜，甘，溫。補中益氣。」", verdict: "", sprite: "food_pumpkin.png" },
    { id: "osmanthus", name: "桂花",   zone: "normal", element: "木", taste: [2, 3, 1], tags: ["lunar"], rule: null, lore: "香氣極濃、花極小，所以多半用聞的；吃進嘴裡的桂花，通常是糖帶著它進來的。中秋與月亮的御用配角。《本草綱目》：「木樨，辛，溫。生津，辟臭。」", verdict: "", sprite: "food_osmanthus.png" },
    { id: "banana",    name: "香蕉",   zone: "normal", element: "木", taste: [2, 2, 2], tags: [], rule: null, lore: "草本水果——香蕉樹其實是一株巨大的草。果心的小黑點是來不及長大的種子。台灣特產北蕉與寶島蕉。好吃。《本草綱目》：「甘蕉，甘，大寒。除煩，解渴。」", verdict: "", sprite: "food_banana.png" },
    { id: "cranberry", name: "蔓越莓", zone: "normal", element: "火", taste: [3, 1, 1], tags: [], rule: null, lore: "長在北美酸沼，採收時整片田放水淹過，果子自己浮上來等人撈。台灣不產，全靠進口。《本草綱目》未載——李時珍沒見過。若有，當曰：「酸，平。利小便。」", verdict: "", sprite: "food_cranberry.png" },

    // ── 地雷 ──
    // 鳳梨的色香味只在披薩上才算分
    { id: "pineapple", name: "鳳梨",   zone: "mine", element: "火", taste: [3, 2, 3], tags: [], rule: "flip", lore: "台農17號金鑽甜到割舌，23號吃起來像芒果。這麼優秀，為什麼要放到披薩以外的料理上。《本草綱目》未載；若載，當曰：「鳳梨，酸甘。近餅則譁，君子慎之。」", verdict: "", sprite: "food_pineapple.png" },
    { id: "raisin",    name: "葡萄乾", zone: "mine", element: "木", taste: [0, 0, 1],  tags: [], rule: "discount", params: { rate: 0.5 }, lore: "葡萄曬乾，甜度濃縮，體積縮成失望的大小——萬聖節發這個的人家，隔年門口要小心。《本草綱目》：「葡萄，甘，平。益氣倍力。」曬乾之後，益的多半是別人的氣。", verdict: "", sprite: "food_raisin.png" },
    // 蘋果折價比例 spec 未定，暫填同葡萄乾
    { id: "apple",     name: "蘋果",   zone: "mine", element: "火", taste: [3, 1, 2], tags: [], rule: "discount", params: { rate: 0.5 }, lore: "七〇年代「蘋果藏剃刀」都市傳說讓它成為萬聖節拒絕往來戶——統計上幾乎沒有實例，恐慌倒是貨真價實。《本草綱目》：「柰，甘，寒。耐飢。」", verdict: "", sprite: "food_apple.png" },

    // ── 套裝A 葛萊普尼爾 ──
    { id: "cat_footsteps", name: "貓咪的腳步聲", zone: "setA", element: "金", taste: [0, 0, 0], tags: ["sound"], rule: null, lore: "", verdict: "", sprite: "jar_empty.png" },
    { id: "beard",         name: "女人的鬍鬚",   zone: "setA", element: "金", taste: [0, 0, 0], tags: ["inedible"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "mountain_root", name: "山的根",       zone: "setA", element: "土", taste: [0, 0, 0], tags: ["inedible"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "bear_sinew",    name: "熊的腳筋",     zone: "setA", element: "木", taste: [1, 1, 2], tags: [], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "fish_breath",   name: "魚的呼吸",     zone: "setA", element: "金", taste: [0, 0, 0], tags: [], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "bird_spittle",  name: "鳥的唾液",     zone: "setA", element: "水", taste: [2, 1, 2], tags: [], rule: null, lore: "", verdict: "", sprite: "jar.png" },

    // ── 套裝B 竹取五難題 ──
    // 竹取五件都不能吃（inedible）；贗品色香味全 0；verdictFake = 吃到贗品時的判詞
    { id: "buddha_bowl",    name: "佛的石缽",   zone: "setB", element: "土", taste: [1, 0, 0], tags: ["inedible"], rule: "authenticity", lore: "", verdict: "", verdictFake: "", sprite: "jar.png" },
    { id: "hourai_branch",  name: "蓬萊玉枝",   zone: "setB", element: "金", taste: [3, 0, 0], tags: ["inedible"], rule: "authenticity", lore: "", verdict: "", verdictFake: "", sprite: "jar.png" },
    // 火鼠裘贗品上盤自燃連累整盤 → 走 endings 的 fire_rat_ignite
    { id: "fire_rat_robe",  name: "火鼠裘",     zone: "setB", element: "火", taste: [2, 0, 0],  tags: ["inedible"], rule: "authenticity", params: { fakeEffect: "self_ignite" }, lore: "", verdict: "", verdictFake: "", sprite: "jar.png" },
    { id: "dragon_pearl",   name: "龍頸之珠",   zone: "setB", element: "金", taste: [3, 0, 0], tags: ["inedible"], rule: "authenticity", lore: "", verdict: "", verdictFake: "", sprite: "jar.png" },
    { id: "swallow_shell",  name: "燕之子安貝", zone: "setB", element: "金", taste: [2, 0, 0], tags: ["inedible"], rule: "authenticity", lore: "", verdict: "", verdictFake: "", sprite: "jar.png" },

    // ── 套裝C 飛行軟膏 ──
    { id: "belladonna", name: "顛茄",   zone: "setC", element: "木", taste: [3, 1, 1], tags: ["witch", "toxic"], rule: "toxic_risk", params: { chance: 0.3 }, lore: "", verdict: "", sprite: "jar.png" },
    { id: "henbane",    name: "天仙子", zone: "setC", element: "木", taste: [1, 2, 1], tags: ["witch", "toxic"], rule: "toxic_risk", params: { chance: 0.3 }, lore: "", verdict: "", sprite: "jar.png" },
    { id: "aconite",    name: "烏頭",   zone: "setC", element: "木", taste: [2, 1, 0], tags: ["witch", "toxic"], rule: "toxic_risk", params: { chance: 0.3 }, lore: "", verdict: "", sprite: "jar.png" },

    // ── 散裝魔幻 ──
    { id: "mandrake",            name: "曼德拉草",         zone: "loose", element: "木", taste: [1, 1, 2], tags: ["witch"], rule: "instadeath", lore: "", verdict: "", sprite: "jar.png" },
    { id: "macbeth_pack",        name: "馬克白香料包",     zone: "loose", element: "火", taste: [1, 2, 1], tags: ["witch", "dog_tongue"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "unicorn_horn_powder", name: "獨角兔的角粉",     zone: "loose", element: "金", taste: [2, 1, 1], tags: [], rule: "neutralize_once", lore: "", verdict: "", sprite: "jar.png" },
    { id: "amabie_scale",        name: "阿瑪比埃的鱗片",   zone: "loose", element: "水", taste: [2, 1, 1], tags: ["yokai"], rule: "immune_once", lore: "", verdict: "", sprite: "jar.png" },
    { id: "mermaid_flesh",       name: "人魚肉",           zone: "loose", element: "水", taste: [2, 1, 3], tags: ["longevity"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "lethe_water",         name: "忘川水",           zone: "loose", element: "水", taste: [0, 0, 1], tags: ["liquid"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "jade_rabbit_elixir",  name: "玉兔搗的藥",       zone: "loose", element: "水", taste: [2, 2, 2], tags: ["lunar", "longevity"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "flat_peach",          name: "蟠桃",             zone: "loose", element: "木", taste: [3, 3, 3], tags: ["lunar", "longevity"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "dragon_blood",        name: "龍血",             zone: "loose", element: "火", taste: [3, 1, 2], tags: ["liquid", "highvalue"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "taisui",              name: "太歲",             zone: "loose", element: "土", taste: [1, 1, 2], tags: ["highvalue", "longevity"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    // 吉凶待月月裁定 → 定案後把 rule 換成 null（吉）或 discount / instadeath（凶）
    { id: "kesaran_pasaran",     name: "幸運毛球",         zone: "loose", element: "金", taste: [2, 0, 0], tags: ["yokai"], rule: "pending", lore: "", verdict: "", sprite: "jar.png" },
    { id: "nue_cry",             name: "鵺的叫聲",         zone: "loose", element: "金", taste: [0, 0, 0], tags: ["sound", "yokai"], rule: null, lore: "", verdict: "", sprite: "jar_empty.png" },
    { id: "fox_wedding_rain",    name: "狐狸娶親的雨水",   zone: "loose", element: "水", taste: [2, 2, 1], tags: ["liquid", "yokai"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    // 有妖怪履歷的正常食材：zone 放 loose 進魔幻池
    { id: "azukiarai_bean",      name: "小豆洗的紅豆",     zone: "loose", element: "土", taste: [2, 1, 2], tags: ["yokai"], rule: null, lore: "河邊唰唰洗豆的妖怪洗過的紅豆：履歷乾淨，來歷不明。紅豆本人則是台灣萬丹的驕傲。《本草綱目》：「赤小豆，甘酸，平。下水腫，排癰腫。」", verdict: "", sprite: "food_redbean.png" },

    // ── 特殊罐 ──
    { id: "busu_jar", name: "附子罐", zone: "special", element: "土", taste: [0, 0, 3], tags: [], rule: "fake_label", params: { label: "劇毒" }, lore: "", verdict: "", sprite: "jar_skull.png" }
  ],

  containers: [
    { id: "pumpkin_bowl",    name: "南瓜盅",         rule: "none", baseScore: 0, params: { skinChance: 0.01, skinName: "蕪菁盅" }, lore: "", verdict: "" },
    // heartless：給分不給心，零韻死魚眼進食
    { id: "pizza",           name: "披薩",           rule: "pineapple_legal", baseScore: 0, params: { heartless: true }, lore: "", verdict: "" },
    { id: "okiku_plate",     name: "阿菊的盤子",     rule: "vanish_one", baseScore: 8, lore: "", verdict: "" },
    { id: "pandora_pithos",  name: "潘朵拉的甕",     rule: "keep_one_on_fail", baseScore: 0, lore: "", verdict: "" },
    { id: "kappa_plate",     name: "河童的頭皿",     rule: "need_liquid", baseScore: 0, params: { penaltyPerTurn: 2 }, lore: "", verdict: "" },
    { id: "treasure_bowl",   name: "聚寶盆",         rule: "duplicate_one", baseScore: 0, lore: "", verdict: "" },
    // 非液體一律打成果汁上盤（算水屬性），分數 ×config.juiceRate；鳳梨汁照樣掀盤
    { id: "byron_skull_cup", name: "拜倫的骷髏杯",   rule: "liquid_only", baseScore: 0, params: { liquidMultiplier: 1.5 }, lore: "", verdict: "" },
    { id: "witch_cauldron",  name: "魔女大釜",       rule: "witch_bonus", baseScore: 0, params: { witchMultiplier: 1.5 }, lore: "", verdict: "" },
    // 提案中，待月月裁定；enabled: false 時不出現在選單
    { id: "mummy_wrap",      name: "木乃伊繃帶盤",   rule: "flip_half", baseScore: 0, params: { flipLossRate: 0.5 }, enabled: false, lore: "", verdict: "" }
  ],

  combos: [
    { id: "mandrake_safe",    requires: ["mandrake", "macbeth_pack"], effect: "cancel_instadeath", bonus: 0, result: "曼德拉草安全處理", verdict: "" },
    { id: "eternal_oblivion", requires: ["mermaid_flesh", "lethe_water"], effect: "ending", bonus: 12, result: "永生，但忘記一切", verdict: "" },
    { id: "flying_ointment",  requires: ["belladonna", "henbane", "aconite"], effect: "float", bonus: 8, result: "飛行軟膏完成", verdict: "我看見圖書館在轉" },
    { id: "gleipnir_cake",    requires: ["cat_footsteps", "beard", "mountain_root", "bear_sinew", "fish_breath", "bird_spittle"], effect: "collection", bonus: 30, result: "縛神緞帶蛋糕捲", verdict: "" },
    // requireGenuine：五件都要是真品才成立
    { id: "kaguya_set",       requires: ["buddha_bowl", "hourai_branch", "fire_rat_robe", "dragon_pearl", "swallow_shell"], effect: "collection", bonus: 25, requireGenuine: true, result: "輝夜姬套餐", verdict: "" },
    // 是否成案待月月裁定
    { id: "tsukimi_set",      requires: ["jade_rabbit_elixir", "flat_peach", "osmanthus"], effect: "collection", bonus: 15, enabled: false, result: "月見套餐", verdict: "" }
  ],

  // 非組合觸發的結局與失敗卡判詞
  endings: [
    { id: "treat",             result: "Treat",      verdict: "" },
    { id: "trick",             result: "Trick",      verdict: "" },
    { id: "great",             result: "大滿足",     verdict: "" },
    { id: "legend",            result: "傳說級",     verdict: "" },
    { id: "hawaiian",          result: "夏威夷結局", verdict: "" },
    { id: "flip",              result: "掀盤",       verdict: "" },
    { id: "rampage",           result: "零韻暴走",   verdict: "" },
    { id: "instadeath_mandrake", result: "曼德拉草的尖叫", verdict: "" },
    { id: "instadeath_toxic",  result: "毒發",       verdict: "" },
    { id: "fire_rat_ignite",   result: "火鼠裘自燃", verdict: "" },
    { id: "busu_reveal",       result: "附子罐其實是砂糖", verdict: "" }
  ],

  // 隨機事件：text 留空時用程式內建的備用句；weight = 抽中權重
  events: [
    { id: "nibble",     rule: "nibble",     weight: 3, text: "" },
    { id: "swap",       rule: "swap",       weight: 3, text: "" },
    { id: "fresh",      rule: "price_mult", weight: 2, params: { mult: 1.5 }, text: "" },
    { id: "stale",      rule: "price_mult", weight: 2, params: { mult: 0.5 }, text: "" }
  ],

  tricks: [
    { id: 1,  text: "", anim: "trick_01" },
    { id: 2,  text: "", anim: "trick_02" },
    { id: 3,  text: "", anim: "trick_03" },
    { id: 4,  text: "", anim: "trick_04" },
    { id: 5,  text: "", anim: "trick_05" },
    { id: 6,  text: "", anim: "trick_06" },
    { id: 7,  text: "", anim: "trick_07" },
    { id: 8,  text: "", anim: "trick_08" },
    { id: 9,  text: "", anim: "trick_09" },
    { id: 10, text: "", anim: "trick_10" }
  ],

  config: {
    // 零韻每局的隨機要求：總分落在 totalMin–totalMax；focusChance 的機率再加一項「某軸 ≥ focusMin–focusMax」
    request: { totalMin: 24, totalMax: 42, focusChance: 0.5, focusMin: 9, focusMax: 15 },
    // 過線後依「總分 ÷ 要求」分級：≥ great 大滿足、≥ legend 傳說級；affection = 各級加的好感度
    grades: { great: 1.6, legend: 2.3, affection: { good: 1, great: 2, legend: 3 } },
    wuxing: { generate: 0.5, overcome: 0.5 },
    inediblePenalty: 3,    // 不能吃的東西：每格 味 −3
    hawaiianChance: 0.01,  // 鳳梨反給傳說級
    fakeChance: 0.5,       // 竹取盲盒抽到贗品的機率
    maxHp: 3,              // 掀盤扣血，歸零觸發 rampage
    maxAffection: 10,      // 好感度滿值解鎖獎勵（內容待定）
    // 抽卡時各區的權重（同區內平均）；套裝有一件上盤後，同套其他件權重 × setBoost
    zoneWeights: { normal: 46, mine: 12, setA: 8, setB: 8, setC: 6, loose: 18, special: 2 },
    setBoost: 4,
    // 隨機品質：weight 抽中權重、size 占幾格（1 單格 / 2 直條 / 3 L 形 / 4 田字）
    // starUp 色香味加成：0 不加 / "one" 隨機一項 +1 / "all" 三項 +1 / "max" 全滿；prefix 加在名字前
    rarities: [
      { id: "R",   weight: 60, size: 1, starUp: 0,         prefix: "" },
      { id: "SR",  weight: 26, size: 2, starUp: "one", prefix: "" },
      { id: "SSR", weight: 10, size: 3, starUp: "all", prefix: "" },
      { id: "UR",  weight: 4,  size: 4, starUp: "max", prefix: "神級" }
    ],
    juiceRate: 0.5,         // 骷髏杯把非液體打成果汁，分數 ×0.5
    dropPenaltyRate: 0.5,   // 盤子放不下掉到地上：扣該材料分數 ×0.5
    gridSize: 3,            // 盤子 3×3 = 9 格，就是食材上限；放滿自動送餐
    centerMultiplier: 2,    // 中央主菜位的分數倍率
    containerChoices: 3,    // 每局隨機給幾個容器挑；設 1 = 完全隨機
    eventChance: 0.18       // 每放一格後觸發隨機事件的機率
  }
};
