// 餵食零韻・萬聖節 Trick or Treat — 資料表
//
// 月月填：name / lore / verdict / text，以及 price、baseScore 等數值（目前全是暫定值）
// 程式讀：id / zone / tags / rule / params / anim / requires / effect（固定代號，改了要同步改程式）
//
// 用 window.GAME_DATA 而不是 JSON，直接開 index.html（file://）也讀得到，不用 fetch。
//
// ── 代號表 ──────────────────────────────────────────
// zone        normal 正常食材 / mine 地雷 / setA 葛萊普尼爾 / setB 竹取五難題
//             setC 飛行軟膏 / loose 散裝魔幻 / special 特殊罐
// tags        liquid 液體（河童皿、骷髏杯看這個）/ sound 聲音系 / witch 魔女系（大釜加成）
//             toxic 毒物 / yokai 妖怪履歷 / longevity 長生系判詞 / lunar 月見系
//             highvalue 高價材料 / dog_tongue 含犬之舌（曼德拉草安全處理）
// 材料 rule   null 無特效（只算標價）
//             flip            落盤即掀盤 0 分（鳳梨）
//             discount        嫌棄傳染：相鄰格估價 ×(1 − params.rate)，不觸發 trick
//             authenticity    真贗盲盒，抽到時依 config.fakeChance 決定真假
//             toxic_risk      單放有毒性風險，params.chance = 觸發即死機率
//             instadeath      未處理即死（由 combos 的 cancel_instadeath 解除）
//             neutralize_once 中和一次即死或地雷（角粉）；只救相鄰格
//             immune_once     整盤免疫一次失敗（鱗片）
//             fake_label      標示與實際相反（附子罐）：顯示 params.label，實際照 price 計分
//             pending         規則待月月裁定
// 容器 rule   none / pineapple_legal / vanish_one / keep_one_on_fail / need_liquid
//             duplicate_one / liquid_only / witch_bonus / flip_half
// combo effect cancel_instadeath / ending / float / collection；bonus = 成立時加的分數
//             材料要在盤上相鄰（上下左右）連成一塊才成立
// event rule  nibble 零韻偷吃一格 / swap 兩格換位 / price_mult 一格估價 ×params.mult
// ────────────────────────────────────────────────

window.GAME_DATA = {
  ingredients: [
    // ── 正常食材 ──
    { id: "flour",     name: "麵粉",   zone: "normal", price: 100, tags: [], rule: null, lore: "", verdict: "", sprite: "food_flour.png" },
    { id: "egg",       name: "雞蛋",   zone: "normal", price: 100, tags: [], rule: null, lore: "", verdict: "", sprite: "food_egg.png" },
    { id: "raw_sugar", name: "二砂糖", zone: "normal", price: 100, tags: [], rule: null, lore: "", verdict: "", sprite: "food_sugar.png" },
    { id: "butter",    name: "奶油",   zone: "normal", price: 150, tags: [], rule: null, lore: "", verdict: "", sprite: "food_butter.png" },
    { id: "milk",      name: "牛奶",   zone: "normal", price: 100, tags: ["liquid"], rule: null, lore: "", verdict: "", sprite: "food_milk.png" },
    // 蜂蜜算不算液體待定；目前算，讓骷髏杯不至於只有四樣能放
    { id: "honey",     name: "蜂蜜",   zone: "normal", price: 150, tags: ["liquid"], rule: null, lore: "", verdict: "", sprite: "food_honey.png" },
    { id: "cinnamon",  name: "肉桂",   zone: "normal", price: 150, tags: [], rule: null, lore: "", verdict: "", sprite: "food_cinnamon.png" },
    { id: "pumpkin",   name: "南瓜",   zone: "normal", price: 200, tags: [], rule: null, lore: "", verdict: "", sprite: "food_pumpkin.png" },
    { id: "osmanthus", name: "桂花",   zone: "normal", price: 150, tags: ["lunar"], rule: null, lore: "", verdict: "", sprite: "food_osmanthus.png" },
    { id: "banana",    name: "香蕉",   zone: "normal", price: 100, tags: [], rule: null, lore: "", verdict: "", sprite: "food_banana.png" },
    { id: "cranberry", name: "蔓越莓", zone: "normal", price: 150, tags: [], rule: null, lore: "", verdict: "", sprite: "food_cranberry.png" },

    // ── 地雷 ──
    // 鳳梨的 price 只在披薩容器或夏威夷結局時有意義
    { id: "pineapple", name: "鳳梨",   zone: "mine", price: 150, tags: [], rule: "flip", lore: "", verdict: "", sprite: "food_pineapple.png" },
    { id: "raisin",    name: "葡萄乾", zone: "mine", price: 50,  tags: [], rule: "discount", params: { rate: 0.5 }, lore: "", verdict: "", sprite: "food_raisin.png" },
    // 蘋果折價比例 spec 未定，暫填同葡萄乾
    { id: "apple",     name: "蘋果",   zone: "mine", price: 100, tags: [], rule: "discount", params: { rate: 0.5 }, lore: "", verdict: "", sprite: "food_apple.png" },

    // ── 套裝A 葛萊普尼爾 ──
    { id: "cat_footsteps", name: "貓咪的腳步聲", zone: "setA", price: 300, tags: ["sound"], rule: null, lore: "", verdict: "", sprite: "jar_empty.png" },
    { id: "beard",         name: "女人的鬍鬚",   zone: "setA", price: 300, tags: [], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "mountain_root", name: "山的根",       zone: "setA", price: 300, tags: [], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "bear_sinew",    name: "熊的腳筋",     zone: "setA", price: 300, tags: [], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "fish_breath",   name: "魚的呼吸",     zone: "setA", price: 300, tags: [], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "bird_spittle",  name: "鳥的唾液",     zone: "setA", price: 300, tags: [], rule: null, lore: "", verdict: "", sprite: "jar.png" },

    // ── 套裝B 竹取五難題 ──
    // fakePrice = 贗品標價；verdictFake = 吃到贗品時的判詞
    { id: "buddha_bowl",    name: "佛的石缽",   zone: "setB", price: 400, fakePrice: 50, tags: [], rule: "authenticity", lore: "", verdict: "", verdictFake: "", sprite: "jar.png" },
    { id: "hourai_branch",  name: "蓬萊玉枝",   zone: "setB", price: 400, fakePrice: 50, tags: [], rule: "authenticity", lore: "", verdict: "", verdictFake: "", sprite: "jar.png" },
    // 火鼠裘贗品上盤自燃連累整盤 → 走 endings 的 fire_rat_ignite
    { id: "fire_rat_robe",  name: "火鼠裘",     zone: "setB", price: 400, fakePrice: 0,  tags: [], rule: "authenticity", params: { fakeEffect: "self_ignite" }, lore: "", verdict: "", verdictFake: "", sprite: "jar.png" },
    { id: "dragon_pearl",   name: "龍頸之珠",   zone: "setB", price: 400, fakePrice: 50, tags: [], rule: "authenticity", lore: "", verdict: "", verdictFake: "", sprite: "jar.png" },
    { id: "swallow_shell",  name: "燕之子安貝", zone: "setB", price: 400, fakePrice: 50, tags: [], rule: "authenticity", lore: "", verdict: "", verdictFake: "", sprite: "jar.png" },

    // ── 套裝C 飛行軟膏 ──
    { id: "belladonna", name: "顛茄",   zone: "setC", price: 250, tags: ["witch", "toxic"], rule: "toxic_risk", params: { chance: 0.3 }, lore: "", verdict: "", sprite: "jar.png" },
    { id: "henbane",    name: "天仙子", zone: "setC", price: 250, tags: ["witch", "toxic"], rule: "toxic_risk", params: { chance: 0.3 }, lore: "", verdict: "", sprite: "jar.png" },
    { id: "aconite",    name: "烏頭",   zone: "setC", price: 250, tags: ["witch", "toxic"], rule: "toxic_risk", params: { chance: 0.3 }, lore: "", verdict: "", sprite: "jar.png" },

    // ── 散裝魔幻 ──
    { id: "mandrake",            name: "曼德拉草",         zone: "loose", price: 500, tags: ["witch"], rule: "instadeath", lore: "", verdict: "", sprite: "jar.png" },
    { id: "macbeth_pack",        name: "馬克白香料包",     zone: "loose", price: 300, tags: ["witch", "dog_tongue"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "unicorn_horn_powder", name: "獨角兔的角粉",     zone: "loose", price: 300, tags: [], rule: "neutralize_once", lore: "", verdict: "", sprite: "jar.png" },
    { id: "amabie_scale",        name: "アマビエ的鱗片",   zone: "loose", price: 300, tags: ["yokai"], rule: "immune_once", lore: "", verdict: "", sprite: "jar.png" },
    { id: "mermaid_flesh",       name: "人魚肉",           zone: "loose", price: 500, tags: ["longevity"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "lethe_water",         name: "忘川水",           zone: "loose", price: 300, tags: ["liquid"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "jade_rabbit_elixir",  name: "玉兔搗的藥",       zone: "loose", price: 400, tags: ["lunar", "longevity"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "flat_peach",          name: "蟠桃",             zone: "loose", price: 400, tags: ["lunar", "longevity"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "dragon_blood",        name: "龍血",             zone: "loose", price: 800, tags: ["liquid", "highvalue"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    { id: "taisui",              name: "太歲",             zone: "loose", price: 800, tags: ["highvalue", "longevity"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    // 吉凶待月月裁定 → 定案後把 rule 換成 null（吉）或 discount / instadeath（凶）
    { id: "kesaran_pasaran",     name: "ケサランパサラン", zone: "loose", price: 300, tags: ["yokai"], rule: "pending", lore: "", verdict: "", sprite: "jar.png" },
    { id: "nue_cry",             name: "鵺的叫聲",         zone: "loose", price: 300, tags: ["sound", "yokai"], rule: null, lore: "", verdict: "", sprite: "jar_empty.png" },
    { id: "fox_wedding_rain",    name: "狐狸娶親的雨水",   zone: "loose", price: 400, tags: ["liquid", "yokai"], rule: null, lore: "", verdict: "", sprite: "jar.png" },
    // 有妖怪履歷的正常食材：zone 放 loose 進魔幻池，標價照正常食材
    { id: "azukiarai_bean",      name: "小豆洗的紅豆",     zone: "loose", price: 150, tags: ["yokai"], rule: null, lore: "", verdict: "", sprite: "food_redbean.png" },

    // ── 特殊罐 ──
    { id: "busu_jar", name: "附子罐", zone: "special", price: 1000, tags: [], rule: "fake_label", params: { label: "劇毒" }, lore: "", verdict: "", sprite: "jar_skull.png" }
  ],

  containers: [
    { id: "pumpkin_bowl",    name: "南瓜盅",         rule: "none", baseScore: 0, params: { skinChance: 0.01, skinName: "蕪菁盅" }, lore: "", verdict: "" },
    // heartless：給分不給心，零韻死魚眼進食
    { id: "pizza",           name: "披薩",           rule: "pineapple_legal", baseScore: 0, params: { heartless: true }, lore: "", verdict: "" },
    { id: "okiku_plate",     name: "お菊的盤子",     rule: "vanish_one", baseScore: 500, lore: "", verdict: "" },
    { id: "pandora_pithos",  name: "潘朵拉的甕",     rule: "keep_one_on_fail", baseScore: 0, lore: "", verdict: "" },
    { id: "kappa_plate",     name: "河童的頭皿",     rule: "need_liquid", baseScore: 0, params: { penaltyPerTurn: 100 }, lore: "", verdict: "" },
    { id: "treasure_bowl",   name: "聚寶盆",         rule: "duplicate_one", baseScore: 0, lore: "", verdict: "" },
    // 抽到的材料強制上盤 vs 只能放液體：非液體抽到時怎麼處理待定（灑出不計分？）
    { id: "byron_skull_cup", name: "拜倫的骷髏杯",   rule: "liquid_only", baseScore: 0, params: { liquidMultiplier: 1.5 }, lore: "", verdict: "" },
    { id: "witch_cauldron",  name: "魔女大釜",       rule: "witch_bonus", baseScore: 0, params: { witchMultiplier: 1.5 }, lore: "", verdict: "" },
    // 提案中，待月月裁定；enabled: false 時不出現在選單
    { id: "mummy_wrap",      name: "木乃伊繃帶盤",   rule: "flip_half", baseScore: 0, params: { flipLossRate: 0.5 }, enabled: false, lore: "", verdict: "" }
  ],

  combos: [
    { id: "mandrake_safe",    requires: ["mandrake", "macbeth_pack"], effect: "cancel_instadeath", bonus: 0, result: "曼德拉草安全處理", verdict: "" },
    { id: "eternal_oblivion", requires: ["mermaid_flesh", "lethe_water"], effect: "ending", bonus: 1000, result: "永生，但忘記一切", verdict: "" },
    { id: "flying_ointment",  requires: ["belladonna", "henbane", "aconite"], effect: "float", bonus: 800, result: "飛行軟膏完成", verdict: "我看見圖書館在轉" },
    { id: "gleipnir_cake",    requires: ["cat_footsteps", "beard", "mountain_root", "bear_sinew", "fish_breath", "bird_spittle"], effect: "collection", bonus: 3000, result: "縛神緞帶蛋糕捲", verdict: "" },
    // requireGenuine：五件都要是真品才成立
    { id: "kaguya_set",       requires: ["buddha_bowl", "hourai_branch", "fire_rat_robe", "dragon_pearl", "swallow_shell"], effect: "collection", bonus: 2500, requireGenuine: true, result: "輝夜姬套餐", verdict: "" },
    // 是否成案待月月裁定
    { id: "tsukimi_set",      requires: ["jade_rabbit_elixir", "flat_peach", "osmanthus"], effect: "collection", bonus: 1500, enabled: false, result: "月見套餐", verdict: "" }
  ],

  // 非組合觸發的結局與失敗卡判詞
  endings: [
    { id: "treat",             result: "Treat",      verdict: "" },
    { id: "trick",             result: "Trick",      verdict: "" },
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
    { id: "price_up",   rule: "price_mult", weight: 2, params: { mult: 1.5 }, text: "" },
    { id: "price_down", rule: "price_mult", weight: 2, params: { mult: 0.5 }, text: "" }
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
    passLine: 2000,        // 達標線，固定值先上，直播實測再調
    hawaiianChance: 0.01,  // 鳳梨反給最高分
    fakeChance: 0.5,       // 竹取盲盒抽到贗品的機率
    maxHp: 3,              // 掀盤扣血，歸零觸發 rampage
    maxAffection: 10,      // 好感度滿值解鎖獎勵（內容待定）
    hawaiianScore: 9999,   // 夏威夷結局給的分數
    // 抽卡時各區的權重（同區內平均）；套裝有一件上盤後，同套其他件權重 × setBoost
    zoneWeights: { normal: 46, mine: 12, setA: 8, setB: 8, setC: 6, loose: 18, special: 2 },
    setBoost: 4,
    gridSize: 3,            // 盤子 3×3 = 9 格，就是食材上限；放滿自動送餐
    centerMultiplier: 2,    // 中央主菜位的估價倍率
    containerChoices: 3,    // 每局隨機給幾個容器挑；設 1 = 完全隨機
    eventChance: 0.18       // 每放一格後觸發隨機事件的機率
  }
};
