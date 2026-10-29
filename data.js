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
// element     五行：金 木 水 火 土。相鄰時 生 → 被生的一方 ×(1+wuxing.generate)；剋 → 被一件剋到會被撞得轉向，被兩件夾剋就散掉（合體塊不受影響）
//             木生火、火生土、土生金、金生水、水生木；木剋土、土剋水、水剋火、火剋金、金剋木
// taste       色香味星數 [色, 香, 味]，0–3；稀有度會往上加（見 config.rarities）
//             分數 = 星數 × 占格數 × 各種倍率，三項加總就是總分
// tags        liquid 液體（河童皿、骷髏杯看這個）/ sound 聲音系 / witch 魔女系（大釜加成）
//             toxic 毒物 / yokai 妖怪履歷 / longevity 長生系判詞 / lunar 月見系
//             highvalue 高價材料 / dog_tongue 含犬之舌（曼德拉草安全處理）
//             inedible 不能吃：當擺盤裝飾，色 +config.decorBonus 星
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
//             套裝（setA/B/C）：同系列相碰就合體成一塊，合體塊湊齊全部成員＝完成；5 件以上的大套裝湊齊同盤時，散落的會飛過去
//             其他組合（曼德拉草、永生）：材料要在盤上相鄰（上下左右）連成一塊
// event rule  nibble 零韻偷吃一樣 / shake 一樣材料被晃起來重新落下 / price_mult 一樣材料分數 ×params.mult
// trick anim  blackout 停電 / parade 百鬼夜行 / bandage 繃帶 / cursor 滑鼠綁架 / table 掀桌
//             pumpkin 南瓜罩頭 / bats 蝙蝠群 / ink 墨汁 / runes 鬼語 / upside 倒立圖書館
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
    { id: "cat_footsteps", name: "貓咪的腳步聲", zone: "setA", element: "金", taste: [0, 0, 0], tags: ["sound"], rule: null, lore: "《散文埃達》：矮人以六樣東西鍛成縛住魔狼芬里爾的緞帶，材料從此在世上用罄——所以今天的貓走路沒有聲音。罐子是空的，請不要搖。", verdict: "", sprite: "jar_empty.png" },
    { id: "beard",         name: "女人的鬍鬚",   zone: "setA", element: "金", taste: [0, 0, 0], tags: ["inedible"], rule: null, lore: "葛萊普尼爾第二件。據說也是因為被拿去鍛了緞帶，女人才不長鬍子。北歐神話的因果關係，請勿深究。", verdict: "", sprite: "jar.png" },
    { id: "mountain_root", name: "山的根",       zone: "setA", element: "土", taste: [0, 0, 0], tags: ["inedible"], rule: null, lore: "第三件。山的根全被挖去打緞帶了，所以山沒有根。重量不明，硬度極高，牙齒請自重。", verdict: "", sprite: "jar.png" },
    { id: "bear_sinew",    name: "熊的腳筋",     zone: "setA", element: "木", taste: [1, 1, 2], tags: [], rule: null, lore: "第四件，六樣裡少數聽起來能吃的。魔狼被緞帶綁住後咬斷了戰神提爾的右手，算是本套裝最大的售後糾紛。", verdict: "", sprite: "jar.png" },
    { id: "fish_breath",   name: "魚的呼吸",     zone: "setA", element: "金", taste: [0, 0, 0], tags: [], rule: null, lore: "第五件。魚沒有呼吸，據說就是因為這個。罐裡只有一點水氣和一個泡泡，打開的瞬間就沒了。", verdict: "", sprite: "jar.png" },
    { id: "bird_spittle",  name: "鳥的唾液",     zone: "setA", element: "水", taste: [2, 1, 2], tags: [], rule: null, lore: "第六件，也是最後一件。湊齊六件的人，可以做出全場最難的甜點；湊不齊的人，手上會有一罐鳥的口水。", verdict: "", sprite: "jar.png" },

    // ── 套裝B 竹取五難題 ──
    // 竹取五件都不能吃（inedible）；贗品色香味全 0；verdictFake = 吃到贗品時的判詞
    { id: "buddha_bowl",    name: "佛的石缽",   zone: "setB", element: "土", taste: [1, 0, 0], tags: ["inedible"], rule: "authenticity", lore: "輝夜姬五難題之一：天竺佛陀用過的石缽，據說會自己發光。原作的石作皇子拿山寺裡一只燻黑的舊缽充數，不會發光，當場穿幫。這一只呢？", verdict: "", verdictFake: "", sprite: "jar.png" },
    { id: "hourai_branch",  name: "蓬萊玉枝",   zone: "setB", element: "金", taste: [3, 0, 0], tags: ["inedible"], rule: "authenticity", lore: "東海蓬萊山上的樹枝：銀根、金莖、白玉果實。原作的車持皇子請工匠打造了一枝，完美無缺——直到工匠們上門討工錢。", verdict: "", verdictFake: "", sprite: "jar.png" },
    // 火鼠裘贗品上盤自燃連累整盤 → 走 endings 的 fire_rat_ignite
    { id: "fire_rat_robe",  name: "火鼠裘",     zone: "setB", element: "火", taste: [2, 0, 0],  tags: ["inedible"], rule: "authenticity", params: { fakeEffect: "self_ignite" }, lore: "火鼠之毛織成，入火不燃，髒了丟進火裡就會變乾淨。原作的阿倍右大臣重金向唐商買來，一燒就著。驗貨的方法，只有一個。", verdict: "", verdictFake: "", sprite: "jar.png" },
    { id: "dragon_pearl",   name: "龍頸之珠",   zone: "setB", element: "金", taste: [3, 0, 0], tags: ["inedible"], rule: "authenticity", lore: "龍頸上的五色寶珠。原作的大伴大納言親自出海取珠，遇上暴風雨，從此改口說龍是神、不可冒犯。本館不保證這顆摘自龍的脖子。", verdict: "", verdictFake: "", sprite: "jar.png" },
    { id: "swallow_shell",  name: "燕之子安貝", zone: "setB", element: "金", taste: [2, 0, 0], tags: ["inedible"], rule: "authenticity", lore: "燕子產子時銜著的安產寶貝。原作的石上中納言爬上屋樑掏燕巢，摔下來時手裡緊握的是一團燕子糞，不久便過世。五難題裡唯一出人命的一題。", verdict: "", verdictFake: "", sprite: "jar.png" },

    // ── 套裝C 飛行軟膏 ──
    { id: "belladonna", name: "顛茄",   zone: "setC", element: "木", taste: [3, 1, 1], tags: ["witch", "toxic"], rule: "toxic_risk", params: { chance: 0.3 }, lore: "Bella donna，義大利文「美麗的女士」：文藝復興貴婦把它滴進眼睛放大瞳孔，看起來水汪汪，同時也看不清楚。屬名 Atropa 取自剪斷生命之線的命運女神。", verdict: "", sprite: "jar.png" },
    { id: "henbane",    name: "天仙子", zone: "setC", element: "木", taste: [1, 2, 1], tags: ["witch", "toxic"], rule: "toxic_risk", params: { chance: 0.3 }, lore: "中藥名莨菪，飛行軟膏主成分之一。《神農本草經》：「多食令人狂走。久服輕身，走及奔馬。」古人吃了以為自己在飛，大概就是這個意思。", verdict: "", sprite: "jar.png" },
    { id: "aconite",    name: "烏頭",   zone: "setC", element: "木", taste: [2, 1, 0], tags: ["witch", "toxic"], rule: "toxic_risk", params: { chance: 0.3 }, lore: "與附子同一株：主根叫烏頭，旁生的子根叫附子。《三國演義》關羽刮骨療毒，箭上淬的就是烏頭。《本草綱目》：「烏頭，辛，溫，有大毒。」", verdict: "", sprite: "jar.png" },

    // ── 散裝魔幻 ──
    { id: "mandrake",            name: "曼德拉草",         zone: "loose", element: "木", taste: [1, 1, 2], tags: ["witch"], rule: "instadeath", lore: "根長得像人，拔出土時會尖叫，聽見的人當場斃命——所以古法是把狗綁在根上，讓狗去拔。《本草綱目》引周密記「押不蘆」，少許磨酒飲，「即通身麻痺而死」，據考就是它。", verdict: "", sprite: "jar.png" },
    { id: "macbeth_pack",        name: "馬克白香料包",     zone: "loose", element: "火", taste: [1, 2, 1], tags: ["witch", "dog_tongue"], rule: null, lore: "《馬克白》三女巫的燉鍋配方：蠑螈之眼、青蛙之趾、蝙蝠之毛、犬之舌。一說這些全是草藥的俗名代號，犬之舌就是琉璃草。本包兩種解讀皆有附上。", verdict: "", sprite: "jar.png" },
    { id: "unicorn_horn_powder", name: "獨角兔的角粉",     zone: "loose", element: "金", taste: [2, 1, 1], tags: [], rule: "neutralize_once", lore: "Al-mi'raj，中世紀伊斯蘭奇書裡的一角兔，黃毛黑角，猛獸見之皆逃。角粉則沿用歐洲王室的老把戲：拿獨角鯨的牙冒充獨角獸角，用來試毒。", verdict: "", sprite: "jar.png" },
    { id: "amabie_scale",        name: "阿瑪比埃的鱗片",   zone: "loose", element: "水", taste: [2, 1, 1], tags: ["yokai"], rule: "immune_once", lore: "1846 年出現在肥後國（今熊本）海上的半人半魚妖怪，只留下一句話：「若有疫病流行，把我的樣子畫給人看。」2020 年再度爆紅，連日本厚生勞動省都請它代言。", verdict: "", sprite: "jar.png" },
    { id: "mermaid_flesh",       name: "人魚肉",           zone: "loose", element: "水", taste: [2, 1, 3], tags: ["longevity"], rule: null, lore: "若狹國的少女誤食人魚肉，從此容顏不老，活了八百年，人稱八百比丘尼。《山海經》也說人魚「食之無癡疾」——只是沒說會不會長生。", verdict: "", sprite: "jar.png" },
    { id: "lethe_water",         name: "忘川水",           zone: "loose", element: "水", taste: [0, 0, 1], tags: ["liquid"], rule: null, lore: "希臘冥府的忘川。柏拉圖《理想國》說亡魂投胎前都要喝它，忘記前世。東方版本叫孟婆湯，差別在要排隊。無色無味，喝完不記得喝過。", verdict: "", sprite: "jar.png" },
    { id: "jade_rabbit_elixir",  name: "玉兔搗的藥",       zone: "loose", element: "水", taste: [2, 2, 2], tags: ["lunar", "longevity"], rule: null, lore: "月宮玉兔搗的不死藥，嫦娥偷吃的就是這款。李白〈把酒問月〉：「白兔搗藥秋復春，嫦娥孤棲與誰鄰。」搗了一千多年，產量依然成謎。", verdict: "", sprite: "jar.png" },
    { id: "flat_peach",          name: "蟠桃",             zone: "loose", element: "木", taste: [3, 3, 3], tags: ["lunar", "longevity"], rule: null, lore: "王母娘娘蟠桃園出品。《西遊記》土地公介紹：「三千年一熟，人吃了成仙了道，體健身輕。」六千年、九千年那幾批，被一隻猴子吃掉了。", verdict: "", sprite: "jar.png" },
    { id: "dragon_blood",        name: "龍血",             zone: "loose", element: "火", taste: [3, 1, 2], tags: ["liquid", "highvalue"], rule: null, lore: "其實是樹脂：索科特拉島的龍血樹割開會流出暗紅色的汁，《本草綱目》收作「騏驎竭」，散瘀止痛。另一派則是齊格飛沐浴龍血，成了刀槍不入之身。", verdict: "", sprite: "jar.png" },
    { id: "taisui",              name: "太歲",             zone: "loose", element: "土", taste: [1, 1, 2], tags: ["highvalue", "longevity"], rule: null, lore: "《山海經》稱「視肉」，晉人郭璞注：「形如牛肝，有兩目，食之無盡，尋復更生如故。」吃完會長回來的肉，現代人看了多半說是黏菌。在它頭上動土，後果自負。", verdict: "", sprite: "jar.png" },
    // 吉凶待月月裁定 → 定案後把 rule 換成 null（吉）或 discount / instadeath（凶）
    { id: "kesaran_pasaran",     name: "幸運毛球",         zone: "loose", element: "金", taste: [2, 0, 0], tags: ["yokai"], rule: "pending", lore: "日本東北流傳的白色毛球，會自己飄。據說養在桐木盒裡、餵它白粉，就會帶來幸福；但一年打開看超過一次，它就會消失。吃下去是吉是凶，目前沒有人知道。", verdict: "", sprite: "jar.png" },
    { id: "nue_cry",             name: "鵺的叫聲",         zone: "loose", element: "金", taste: [0, 0, 0], tags: ["sound", "yokai"], rule: null, lore: "《平家物語》：每夜黑雲籠罩清涼殿，天皇因此病倒，源賴政一箭射下——猴頭、狸身、虎足、蛇尾。至於那駭人的叫聲，其實是夜裡鳴叫的虎鶇。罐子是空的，只有聲音。", verdict: "", sprite: "jar_empty.png" },
    { id: "fox_wedding_rain",    name: "狐狸娶親的雨水",   zone: "loose", element: "水", taste: [2, 2, 1], tags: ["liquid", "yokai"], rule: null, lore: "晴天裡落下的雨。東亞許多地方都說，這是狐狸趁著天晴出嫁，拿雨幕遮住迎親隊伍。同時是晴天也是雨天的水，喝起來有一點喜酒味。", verdict: "", sprite: "jar.png" },
    // 有妖怪履歷的正常食材：zone 放 loose 進魔幻池
    { id: "azukiarai_bean",      name: "小豆洗的紅豆",     zone: "loose", element: "土", taste: [2, 1, 2], tags: ["yokai"], rule: null, lore: "河邊唰唰洗豆的妖怪洗過的紅豆：履歷乾淨，來歷不明。紅豆本人則是台灣萬丹的驕傲。《本草綱目》：「赤小豆，甘酸，平。下水腫，排癰腫。」", verdict: "", sprite: "food_redbean.png" },

    // ── 特殊罐 ──
    { id: "busu_jar", name: "附子罐", zone: "special", element: "土", taste: [0, 0, 3], tags: [], rule: "fake_label", params: { label: "劇毒" }, lore: "狂言《附子》：主人出門前交代，桶裡裝的是附子，光是從桶口吹過來的風都會要人命，千萬別靠近。太郎冠者與次郎冠者看著那個桶，看了很久。", verdict: "", sprite: "jar_skull.png" }
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
    { id: "spill",             result: "打翻",       verdict: "" },
    { id: "busu_reveal",       result: "附子罐其實是砂糖", verdict: "" }
  ],

  // 隨機事件：text 留空時用程式內建的備用句；weight = 抽中權重
  events: [
    { id: "nibble",     rule: "nibble",     weight: 3, text: "" },
    { id: "shake",      rule: "shake",      weight: 3, text: "" },
    { id: "fresh",      rule: "price_mult", weight: 2, params: { mult: 1.5 }, text: "" },
    { id: "stale",      rule: "price_mult", weight: 2, params: { mult: 0.5 }, text: "" }
  ],

  tricks: [
    { id: 1,  anim: "blackout", text: "圖書館停電了。⋯⋯別動，我在你後面。" },
    { id: 2,  anim: "parade",   text: "今晚的客人不只你一個。大家都說——不夠吃。" },
    { id: 3,  anim: "bandage",  text: "打包。這盤連同你一起，退回廚房重做。" },
    { id: 4,  anim: "cursor",   text: "你的滑鼠，我收下了。想要回去？拿好吃的來換。" },
    { id: 5,  anim: "table",    text: "這不是掀盤。這是掀桌。" },
    { id: 6,  anim: "pumpkin",  text: "不好吃的人，要戴南瓜頭反省三分鐘。" },
    { id: 7,  anim: "bats",     text: "蝙蝠們都試吃過了。牠們也說不行。" },
    { id: 8,  anim: "ink",      text: "鑑定書的墨水打翻了。不小心的。真的。" },
    { id: 9,  anim: "runes",    text: "ᚾᛟ ᛏᚱᛖᚨᛏ——看不懂嗎？就是不給糖的意思。" },
    { id: 10, anim: "upside",   text: "把圖書館倒過來搖一搖，看會不會掉出比較好吃的東西。" }
  ],

  config: {
    // 零韻每局的隨機要求：總分落在 totalMin–totalMax；focusChance 的機率再加一項「某軸 ≥ focusMin–focusMax」
    request: { totalMin: 18, totalMax: 36, focusChance: 0.5, focusMin: 6, focusMax: 11 },
    // 過線後依「總分 ÷ 要求」分級：≥ great 大滿足、≥ legend 傳說級；affection = 各級加的好感度
    grades: { great: 1.6, legend: 2.3, affection: { good: 1, great: 2, legend: 3 } },
    wuxing: { generate: 0.5 },
    decorBonus: 2,         // 不能吃的東西當擺盤裝飾：色 +2 星
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
    cols: 4, rows: 4,       // 盤子 4 欄 × 4 層；堆過盤緣＝打翻，頂層全滿自動送餐
    swingMs: 1300,          // 零韻的手從一端擺到另一端的時間（毫秒）
    swingJitter: 0.15,      // 每次抽卡擺速隨機 ±15%
    swingAccel: 0.06,       // 越撒越快：每撒一次擺盪時間 −6%
    swingMin: 0.5,          // 最快到原本的一半時間
    // 放手判定：f＝偏離欄位正中的程度（0 正中、0.5 卡在兩欄中間）
    // window 以內 Perfect（×(1+base)，連擊每多一下 +combo，最多 +max）；good 以內 Good；再偏就 Miss，missSlip 的機率滑到偏的那邊
    perfect: { window: 0.12, good: 0.3, base: 0.2, combo: 0.1, max: 0.6, missSlip: 0.5 },
    bounceChance: 0.02,     // 撒下時手滑、彈到隔壁欄的機率
    rabbitChance: 0.3,      // 旋轉時被兔子撞歪的機率（撞歪＝轉成隨機方向，可能沒轉成）
    fuseRate: 0.25,         // 合體塊每多一件，整塊分數 +25%
    containerChoices: 3,    // 每局隨機給幾個容器挑；設 1 = 完全隨機
    eventChance: 0.18       // 每撒一次後觸發隨機事件的機率
  }
};
