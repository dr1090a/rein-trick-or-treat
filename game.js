// 餵食零韻・萬聖節 Trick or Treat — 遊戲本體
// 狀態機：title → container（隨機要求＋容器三選一）→ play（抽一樣 → 轉向、選格子放下 → 隨機事件，迴圈）→ result → card
// 分數 = 色香味星數 × 占格數 × 各種倍率（主位、五行生剋、容器、嫌棄、行情）；不能吃的東西扣味。
// 所有文字與數值讀 data.js；這裡只寫規則代號的行為。
(() => {
  "use strict";

  const D = window.GAME_DATA;
  const C = D.config;
  const N = C.gridSize || 3;
  const CELLS = N * N;
  const CENTER = Math.floor(CELLS / 2);
  const CONTAINERS = D.containers.filter(c => c.enabled !== false);
  const COMBOS = D.combos.filter(c => c.enabled !== false);
  const ENDING = Object.fromEntries(D.endings.map(e => [e.id, e]));
  const FATAL = ["flip", "instadeath_toxic", "instadeath_mandrake", "fire_rat_ignite"];
  const RARITIES = C.rarities || [{ id: "R", weight: 1, size: 1, starUp: 0, prefix: "" }];
  const RAR_ORDER = RARITIES.map(r => r.id);
  const AXES = ["色", "香", "味"];
  const ZONES = { normal: "正常食材", mine: "地雷", setA: "套裝・葛萊普尼爾", setB: "套裝・竹取五難題", setC: "套裝・飛行軟膏", loose: "散裝魔幻", special: "特殊罐" };

  // 五行：GEN[a] = a 所生；KE[a] = a 所剋
  const GEN = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
  const KE = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };
  const inverse = m => Object.fromEntries(Object.entries(m).map(([a, b]) => [b, a]));
  const GEN_BY = inverse(GEN), KE_BY = inverse(KE);

  // 各尺寸的形狀（列, 欄）與可旋轉的方向
  const SHAPES = {
    1: [[[0, 0]]],
    2: [[[0, 0], [0, 1]], [[0, 0], [1, 0]]],
    3: [[[0, 0], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0]], [[0, 0], [0, 1], [1, 1]], [[0, 1], [1, 0], [1, 1]]],
    4: [[[0, 0], [0, 1], [1, 0], [1, 1]]]
  };

  // 材料效果說明（詳情視窗用，由規則代號生成）
  function effectText(ing) {
    const p = ing.params || {};
    const parts = [];
    switch (ing.rule) {
      case "flip": parts.push("落盤即掀盤。只有披薩上合法。"); break;
      case "discount": parts.push(`嫌棄傳染：相鄰材料分數 −${Math.round(p.rate * 100)}%。`); break;
      case "authenticity": parts.push("真贗未明，送餐時揭曉。贗品色香味全無" + (p.fakeEffect === "self_ignite" ? "，而且一放上盤就會燒起來。" : "。")); break;
      case "toxic_risk": parts.push(`放下時有 ${Math.round(p.chance * 100)}% 機率毒發即死。`); break;
      case "instadeath": parts.push("送餐時旁邊沒有犬之舌，就會尖叫致死。"); break;
      case "neutralize_once": parts.push("相鄰格的毒或地雷，可以中和一次。"); break;
      case "immune_once": parts.push("整盤免疫一次失敗。"); break;
      case "fake_label": parts.push(`標籤寫著「${p.label || "劇毒"}」。抽到時可以選擇丟掉。`); break;
    }
    if (ing.tags.includes("dog_tongue")) parts.push("裡面好像有犬之舌。");
    if (ing.tags.includes("inedible")) parts.push(`不能吃：每格味 −${C.inediblePenalty}。`);
    return parts.join("");
  }

  // data.js 的 verdict / text 還沒填時的備用台詞；月月填了就會蓋過去
  const FALLBACK = {
    treat: "好吃。這盤我收下了。",
    great: "⋯⋯！超好吃。可以再一盤嗎？",
    legend: "這是⋯⋯傳說級的料理。今晚的事，零韻會記一輩子。",
    trick: "⋯⋯不夠。所以，要惡作劇囉。",
    flip: "鑑定：0 分。備註：你知道你做了什麼。",
    double_flip: "聚寶盆把鳳梨也複製了。雙倍火葬。",
    rampage: "血條歸零。圖書館今天不營業——你給我站住。",
    instadeath_mandrake: "曼德拉草在盤子上尖叫。零韻聽見了。",
    instadeath_toxic: "瞳孔放大，世界很美。然後就沒有然後了。",
    fire_rat_ignite: "火鼠裘是假的。一燒就著，整盤一起。",
    hawaiian: "⋯⋯今天心情特別好。鳳梨，准了。",
    pizza: "（死魚眼咀嚼）分數給你。心不給。",
    busu_reveal: "標籤寫劇毒，舔起來是砂糖。主人騙人。",
    eternal_oblivion: "永生了。可是⋯⋯我剛剛吃了什麼？",
    inedible: name => `${name}⋯⋯咬不動。這不是食物吧。`,
    discount: name => `${name}⋯⋯為什麼要放${name}。`,
    affectionFull: "⋯⋯謝謝你一直餵我。好感度，滿了。",
    nibble: n => `（零韻趁你不注意，偷吃了「${n}」。）`,
    swap: (a, b) => `盤子晃了一下，「${a}」和「${b}」換了位置。`,
    slide: (a, i) => `盤子晃了一下，「${a}」滑到第 ${i} 格。`,
    fresh: (n, m) => `「${n}」今天特別新鮮，分數 ×${m}。`,
    stale: (n, m) => `「${n}」放久了，分數 ×${m}。`,
    drop: (n, p) => `「${n}」盤子放不下，掉到地上了。扣 ${p} 分。`,
    request: t => `今晚想吃的是⋯⋯${t}。`
  };

  const FACES = ["idle", "happy", "angry", "deadpan", "dizzy", "cry", "scared", "meh", "pout", "plain"];

  // ── 小工具 ──
  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pts = n => `${Math.round(n)} 分`;
  const fmtMult = m => "×" + (Math.round(m * 100) / 100);
  function weighted(list, w) {
    let r = Math.random() * list.reduce((a, x, i) => a + w(x, i), 0);
    for (let i = 0; i < list.length; i++) if ((r -= w(list[i], i)) <= 0) return i;
    return list.length - 1;
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 無痕模式 */ } }
  };
  function starsEl(n, max = 3) {
    const full = Math.max(0, Math.min(max, Math.round(n)));
    return h("span", { class: "stars" }, "★".repeat(full), h("span", { class: "dim" }, "☆".repeat(max - full)));
  }

  // ── 狀態 ──
  const S = {
    hp: C.maxHp, aff: 0,
    container: null, contName: "", req: null,
    grid: [], hand: null, rot: 0, eaten: [], dropped: [], deck: [],
    penalty: 0, turn: 0, busy: false, last: null, uid: 0,
    flags: {}
  };

  // ── 盤面查詢 ──
  const live = x => !!x && !x.vanished;
  const liveItems = () => [...new Set(S.grid.filter(live))];
  const allItems = () => [...new Set(S.grid.filter(Boolean))];
  const full = () => S.grid.every(Boolean);
  const onPlate = id => liveItems().find(x => x.ing.id === id);
  const rc = i => [Math.floor(i / N), i % N];
  function neighbors(i) {
    const [r, c] = rc(i), out = [];
    if (r > 0) out.push(i - N);
    if (r < N - 1) out.push(i + N);
    if (c > 0) out.push(i - 1);
    if (c < N - 1) out.push(i + 1);
    return out;
  }
  // 與某材料相鄰的其他材料（多格材料取所有格的鄰格）
  function around(x) {
    const out = new Set();
    for (const i of x.cells) for (const n of neighbors(i)) { const y = S.grid[n]; if (live(y) && y !== x) out.add(y); }
    return [...out];
  }
  // 組合技：所需材料在盤上相鄰（上下左右）連成一塊才成立
  function comboDone(c) {
    const need = new Set(c.requires);
    const cells = [];
    S.grid.forEach((x, i) => { if (live(x) && need.has(x.ing.id) && !(c.requireGenuine && x.fake && x.revealed)) cells.push(i); });
    const seen = new Set();
    for (const start of cells) {
      if (seen.has(start)) continue;
      const comp = [start], ids = new Set();
      seen.add(start);
      for (let k = 0; k < comp.length; k++) {
        ids.add(S.grid[comp[k]].ing.id);
        for (const n of neighbors(comp[k])) if (cells.includes(n) && !seen.has(n)) { seen.add(n); comp.push(n); }
      }
      if (c.requires.every(id => ids.has(id))) return true;
    }
    return false;
  }
  const mandrakeSafe = x => around(x).some(y => y.ing.tags.includes("dog_tongue"));
  const isLiquid = x => x.ing.tags.includes("liquid") || x.juiced;
  const elementOf = x => x.juiced ? "水" : x.ing.element;
  // 標題畫面開圖鑑時還沒選容器
  const cont = () => S.container || { rule: "none", params: {} };

  // 形狀放置：讓指定格落在形狀內、全部在盤內且是空格；找不到回傳 null
  function placementFor(cell, shape) {
    const [r, c] = rc(cell);
    for (const [dr, dc] of shape) {
      const cells = [];
      for (const [a, b] of shape) {
        const rr = r - dr + a, cc = c - dc + b;
        if (rr < 0 || rr >= N || cc < 0 || cc >= N || S.grid[rr * N + cc]) { cells.length = 0; break; }
        cells.push(rr * N + cc);
      }
      if (cells.length === shape.length) return cells.sort((p, q) => p - q);
    }
    return null;
  }
  const fitsAnywhere = shape => [...Array(CELLS).keys()].some(i => placementFor(i, shape));
  function allPlacements(shapes) {
    const out = [], seen = new Set();
    for (const sh of shapes) for (let i = 0; i < CELLS; i++) {
      const p = placementFor(i, sh);
      if (p && !seen.has(p.join())) { seen.add(p.join()); out.push(p); }
    }
    return out;
  }
  const handShape = () => S.hand.shapes[S.rot % S.hand.shapes.length];

  // ── 零韻的要求 ──
  function rollRequest() {
    const r = C.request;
    const req = { total: randInt(r.totalMin, r.totalMax), focus: null };
    if (Math.random() < r.focusChance) req.focus = { axis: randInt(0, 2), min: randInt(r.focusMin, r.focusMax) };
    return req;
  }
  const reqText = req => `總分 ${req.total} 以上` + (req.focus ? `，${AXES[req.focus.axis]}要 ${req.focus.min} 以上` : "");
  const meets = sc => sc.total >= S.req.total && (!S.req.focus || sc.axes[S.req.focus.axis] >= S.req.focus.min);
  function gradeOf(sc) {
    if (!meets(sc)) return null;
    const r = sc.total / S.req.total;
    return r >= C.grades.legend ? "legend" : r >= C.grades.great ? "great" : "good";
  }

  // ── 容器規則說明（由代號＋params 生成） ──
  function ruleText(c) {
    const p = c.params || {};
    switch (c.rule) {
      case "none": return "無特效，新手基本款。";
      case "pineapple_legal": return "全場唯一讓鳳梨合法的容器。零韻會吃，但不給心。";
      case "vanish_one": return `盤子自帶 ${c.baseScore} 分；送餐時隨機少一件。`;
      case "keep_one_on_fail": return "掀盤或即死時，甕底留下一樣材料。";
      case "need_liquid": return `盤上沒有液體時，每回合扣 ${p.penaltyPerTurn} 分。`;
      case "duplicate_one": return "送餐時隨機複製一樣材料到空位。複製到什麼，看運氣。";
      case "liquid_only": return `液體 ×${p.liquidMultiplier}；其他材料打成果汁（水屬性），分數 ×${C.juiceRate}。`;
      case "witch_bonus": return `魔女系材料 ×${p.witchMultiplier}。`;
      case "flip_half": return "掀盤時損失減半。";
      default: return "";
    }
  }

  // ── 計分 ──
  // 生剋關係：哪些鄰居在生我、剋我
  function relations(x) {
    const me = elementOf(x), out = [];
    for (const y of around(x)) {
      if (y.neutralized) continue;
      const e = elementOf(y);
      if (GEN[e] === me) out.push({ y, kind: "生" });
      else if (KE[e] === me) out.push({ y, kind: "剋" });
    }
    return out;
  }
  // 這樣材料身上所有倍率，[說明, 倍率]
  function factors(x) {
    const c = cont(), p = c.params || {}, f = [];
    if (c.rule === "liquid_only") f.push(x.juiced ? ["果汁", C.juiceRate] : ["液體", p.liquidMultiplier || 1]);
    if (c.rule === "witch_bonus" && x.ing.tags.includes("witch")) f.push(["魔女大釜", p.witchMultiplier || 1]);
    if (x.priceMult !== 1) f.push([x.priceMult > 1 ? "新鮮" : "放久了", x.priceMult]);
    if (x.cells.includes(CENTER)) f.push(["主位", C.centerMultiplier]);
    for (const y of around(x)) if (!y.neutralized && y.ing.rule === "discount") f.push([`被${y.ing.name}嫌棄`, 1 - y.ing.params.rate]);
    for (const r of relations(x)) f.push([`${elementOf(r.y)}${r.kind}${elementOf(x)}（${r.y.ing.name}）`, r.kind === "生" ? 1 + C.wuxing.generate : 1 - C.wuxing.overcome]);
    return f;
  }
  const hiddenStars = x => x.ing.rule === "fake_label" && !x.revealed;
  // 這樣材料貢獻的 [色, 香, 味] 分數；assumeFake：未揭曉的真贗盲盒先當贗品算
  function itemAxes(x, assumeFake) {
    if (!live(x) || x.neutralized) return [0, 0, 0];
    if (x.ing.rule === "flip" && cont().rule !== "pineapple_legal") return [0, 0, 0];
    const n = x.cells.length || x.rar.size;
    const m = factors(x).reduce((a, [, v]) => a * v, 1);
    const fake = x.fake || (assumeFake && x.ing.rule === "authenticity" && !x.revealed);
    const out = (fake ? [0, 0, 0] : x.stars).map(s => s * n * m);
    if (x.ing.tags.includes("inedible")) out[2] -= C.inediblePenalty * n;
    return out;
  }
  const itemPoints = (x, assumeFake) => Math.round(itemAxes(x, assumeFake).reduce((a, b) => a + b, 0));
  function score({ hideUnknown = false } = {}) {
    const axes = [0, 0, 0];
    let unknown = 0;
    for (const x of liveItems()) {
      if (hideUnknown && hiddenStars(x)) { unknown++; continue; }
      if (hideUnknown && x.ing.rule === "authenticity" && !x.revealed) unknown++;
      itemAxes(x, hideUnknown).forEach((v, k) => { axes[k] += v; });
    }
    const ax = axes.map(v => Math.round(v));
    const combos = COMBOS.filter(c => c.effect !== "cancel_instadeath" && comboDone(c));
    const bonus = combos.reduce((a, c) => a + (c.bonus || 0), 0);
    const discounts = liveItems().filter(x => !x.neutralized && x.ing.rule === "discount");
    const inedible = liveItems().filter(x => !x.neutralized && x.ing.tags.includes("inedible"));
    const total = Math.max(0, ax[0] + ax[1] + ax[2] + (S.container.baseScore || 0) + bonus - S.penalty);
    return { total, axes: ax, bonus, combos, discounts, inedible, unknown };
  }
  const estimate = () => score({ hideUnknown: true });

  // ── 渲染 ──
  function renderMeters() {
    const hp = $("#hp"); hp.textContent = "";
    for (let i = 0; i < C.maxHp; i++) hp.append(h("span", { class: "pip" + (i < S.hp ? (S.hp === 1 ? " on low" : " on") : "") }));
    $("#aff").textContent = `♥ ${S.aff}/${C.maxAffection}`;
  }
  function show(id) { for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== id; }

  let bubbleTimer = 0;
  function say(text, face) {
    if (face) setFace(face);
    if (!text) return;
    const b = $("#bubble");
    b.textContent = text;
    b.classList.add("show");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => b.classList.remove("show"), 4200);
  }
  function setFace(f) { $("#rein").src = `assets/rein/${FACES.includes(f) ? f : "idle"}.webp`; }
  function log(t) { $("#log").textContent = t; }

  function jarSvg(ing) {
    const empty = ing.tags.includes("sound");
    const liquid = ing.tags.includes("liquid");
    const skull = ing.rule === "fake_label";
    return `<svg viewBox="0 0 40 46" width="36" height="42" fill="none" stroke="currentColor" stroke-width="1.6">
      <rect x="13" y="2.5" width="14" height="6" rx="1"/>
      <path d="M12 9h16c3.3 0 6 2.7 6 6v23c0 3.3-2.7 6-6 6H12c-3.3 0-6-2.7-6-6V15c0-3.3 2.7-6 6-6z"/>
      ${liquid ? '<path d="M7 27c5-2 9 2 13 0s9-2 13 0v11c0 2.8-2.2 5-5 5H12c-2.8 0-5-2.2-5-5z" fill="currentColor" opacity=".35" stroke="none"/>' : ""}
      ${!empty && !liquid && !skull ? '<circle cx="15" cy="32" r="3" fill="currentColor" opacity=".45" stroke="none"/><circle cx="23" cy="35" r="4" fill="currentColor" opacity=".35" stroke="none"/><circle cx="26" cy="27" r="2.5" fill="currentColor" opacity=".45" stroke="none"/>' : ""}
      ${skull ? '<circle cx="20" cy="24" r="6"/><path d="M17 31h6M18 23.5h.01M22 23.5h.01" stroke-linecap="round" stroke-width="2.4"/>' : '<rect x="11" y="16" width="18" height="7" opacity=".6"/>'}
    </svg>`;
  }

  const displayName = x => (x.rar.prefix || "") + x.ing.name;

  function tokMeta(x, inHand) {
    const ing = x.ing;
    if (x.vanished) return { t: "第十枚・消失", cls: "off" };
    if (x.neutralized) return { t: "已中和", cls: "off" };
    if (ing.rule === "fake_label" && !x.revealed) return { t: (ing.params && ing.params.label) || "劇毒", cls: "bad" };
    if (ing.rule === "authenticity" && !x.revealed) return { t: "真贗未明", cls: "warn" };
    if (x.fake) return { t: `贗品 ${pts(itemPoints(x))}`, cls: "bad" };
    if (ing.rule === "flip") return { t: S.container.rule === "pineapple_legal" ? pts(itemPoints(x)) + "・合法" : "地雷", cls: "bad" };
    if (ing.rule === "instadeath") {
      const safe = !inHand && mandrakeSafe(x);
      return { t: safe ? "已處理" : "尖叫中", cls: safe ? "" : "bad" };
    }
    if (ing.rule === "discount") return { t: `隔壁 −${Math.round(ing.params.rate * 100)}%`, cls: "bad" };
    if (ing.rule === "toxic_risk") return { t: `毒性 ${Math.round(ing.params.chance * 100)}%`, cls: "warn" };
    const p = itemPoints(x);
    return { t: (inHand ? "約 " : "") + pts(p), cls: p < 0 ? "bad" : x.used ? "used" : "" };
  }
  function token(x, inHand) {
    const meta = tokMeta(x, inHand);
    const icon = h("div", { class: "tok-icon" });
    if (x.ing.zone === "normal" || x.ing.zone === "mine") icon.append(h("div", { class: "seal" }, x.ing.name[0]));
    else icon.innerHTML = jarSvg(x.ing);
    const big = inHand || x.cells.length >= 2;
    const rel = inHand ? [] : relations(x);
    const g = rel.filter(r => r.kind === "生").length, k = rel.filter(r => r.kind === "剋").length;
    return h("div", { class: `tok ${meta.cls}`, onclick: e => { e.stopPropagation(); openInfo(x, inHand); } },
      h("span", { class: "el" }, elementOf(x)),
      g || k ? h("span", { class: "rel" }, g ? h("span", { class: "g" }, "生" + (g > 1 ? g : "")) : null, k ? h("span", { class: "k" }, "剋" + (k > 1 ? k : "")) : null) : null,
      icon,
      h("div", { class: "tok-name" }, h("span", { class: "rar " + x.rar.id }, x.rar.id), " ", displayName(x) + (x.juiced ? "汁" : "") + (x.dup ? "（複製）" : "")),
      big ? h("div", { class: "tok-stars" }, hiddenStars(x) ? "色香味 ？" : x.stars.map((s, i) => AXES[i] + s).join(" ")) : null,
      h("div", { class: "tok-meta" }, meta.t));
  }
  function shapeMini(shape) {
    const on = new Set(shape.map(([a, b]) => a * 2 + b));
    const w = Math.max(...shape.map(s => s[1])) + 1, hgt = Math.max(...shape.map(s => s[0])) + 1;
    const el = h("span", { class: "shape-mini", style: `grid-template-columns:repeat(${w},7px);grid-template-rows:repeat(${hgt},7px)` });
    for (let a = 0; a < hgt; a++) for (let b = 0; b < w; b++) el.append(h("i", { class: on.has(a * 2 + b) ? "on" : "" }));
    return el;
  }

  function renderPlate(newUid, flash = []) {
    const plate = $("#plate");
    plate.textContent = "";
    const shape = S.hand ? handShape() : null;
    for (let i = 0; i < CELLS; i++) {
      const open = !!shape && !S.grid[i] && !S.busy && !!placementFor(i, shape);
      plate.append(h("button", {
        class: `cell${i === CENTER ? " center" : ""}${open ? " open" : ""}${shape && !S.grid[i] && !open && !S.busy ? " nofit" : ""}`,
        "data-i": i, "aria-label": `第 ${i + 1} 格`, onclick: () => onPlace(i)
      }, S.grid[i] ? null : h("span", { class: "num" }, String(i + 1), i === CENTER ? h("small", {}, `主位 ×${C.centerMultiplier}`) : null)));
    }
    const layer = h("div", { class: "pieces" });
    for (const x of allItems()) {
      const rs = x.cells.map(i => rc(i)[0]), cs = x.cells.map(i => rc(i)[1]);
      const r0 = Math.min(...rs), c0 = Math.min(...cs), hh = Math.max(...rs) - r0 + 1, ww = Math.max(...cs) - c0 + 1;
      const meta = tokMeta(x, false);
      let style = `grid-row:${r0 + 1}/span ${hh};grid-column:${c0 + 1}/span ${ww};`;
      const tok = token(x, false);
      const isL = x.cells.length === 3;
      if (isL) {
        // L 形：2×2 外框挖掉一角，內容放在轉角那格
        const miss = [[0, 0], [0, 1], [1, 0], [1, 1]].find(([a, b]) => !x.cells.includes((r0 + a) * N + c0 + b));
        const clip = {
          "0,0": "polygon(50% 0,100% 0,100% 100%,0 100%,0 50%,50% 50%)",
          "0,1": "polygon(0 0,50% 0,50% 50%,100% 50%,100% 100%,0 100%)",
          "1,0": "polygon(0 0,100% 0,100% 100%,50% 100%,50% 50%,0 50%)",
          "1,1": "polygon(0 0,100% 0,100% 50%,50% 50%,50% 100%,0 100%)"
        }[miss.join()];
        style += `clip-path:${clip};grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;`;
        tok.style.gridRow = String(2 - miss[0]);
        tok.style.gridColumn = String(2 - miss[1]);
      }
      const el = h("div", { class: `piece rar-${x.rar.id} ${meta.cls}${x.uid === newUid ? " enter" : ""}${x.cells.some(i => flash.includes(i)) ? " flash" : ""}${isL ? " L" : ""}`, style, "data-uid": x.uid });
      el.append(tok);
      layer.append(el);
    }
    plate.append(layer);

    // 手上的材料
    const slot = $("#traySlot"); slot.textContent = "";
    if (S.hand) slot.append(token(S.hand, true));
    else slot.append(h("span", { class: "tray-empty" }, full() ? "盤子滿了" : "先抽一樣"));
    $("#tray").classList.toggle("active", !!S.hand);
    const busu = S.hand && S.hand.ing.rule === "fake_label";
    $("#btnDiscard").hidden = !busu;
    $("#btnRotate").hidden = !S.hand || S.hand.shapes.length < 2;
    const hint = $("#trayHint"); hint.textContent = "";
    if (S.hand) {
      const fitsNow = fitsAnywhere(shape);
      hint.append(`占 ${shape.length} 格`, shapeMini(shape), "　",
        !fitsNow ? "這個方向放不下，旋轉看看。" : busu ? `標籤寫著「${(S.hand.ing.params && S.hand.ing.params.label) || "劇毒"}」⋯⋯放哪？還是丟掉？` : "放到哪裡？（點格子或按 1–9）");
    }

    // 分數、要求與色香味
    const est = estimate();
    $("#estimate").textContent = est.total + (est.unknown ? "＋？" : "");
    const rl = $("#reqLine"); rl.textContent = "";
    if (S.req) rl.append(h("span", { class: "req" }, "要求 ", h("b", { class: est.total >= S.req.total ? "ok" : "" }, S.req.total), " 分"));
    const dish = $("#dish"); dish.textContent = "";
    est.axes.forEach((v, i) => {
      const need = S.req && S.req.focus && S.req.focus.axis === i;
      dish.append(h("span", { class: "ax" + (need ? " need" : "") }, AXES[i] + (need ? `（要 ${S.req.focus.min}）` : "")), h("span", {}),
        h("span", { class: "avg" + (need && v >= S.req.focus.min ? " met" : "") }, pts(v)));
    });
    const extra = (S.container.baseScore || 0) + est.bonus - S.penalty;
    dish.append(h("div", { class: "mult" }, h("span", {}, extra ? `其他 ${extra > 0 ? "+" : ""}${extra}　總分` : "總分"), h("b", {}, est.total + (est.unknown ? "＋？" : ""))));
    const line = $("#comboLine"); line.textContent = "";
    for (const c of est.combos) line.append(h("span", { class: "chip" }, c.result));
    for (const x of liveItems()) if (x.ing.rule === "instadeath" && !x.neutralized && mandrakeSafe(x)) line.append(h("span", { class: "chip" }, "曼德拉草已處理"));
    // 飛行軟膏一成立就開始飄
    const ointment = COMBOS.find(c => c.effect === "float");
    $("#reinWrap").classList.toggle("float", !!(ointment && comboDone(ointment)));
  }

  function setButtons() {
    $("#btnDraw").disabled = S.busy || !!S.hand || full() || !S.deck.length;
    $("#btnServe").disabled = S.busy || !!S.hand || !liveItems().length;
  }

  // 放置預覽：滑鼠移到格子上，顯示會占哪幾格
  function preview(i) {
    document.querySelectorAll(".cell.preview").forEach(c => c.classList.remove("preview"));
    if (i == null || !S.hand || S.busy) return;
    const p = placementFor(i, handShape());
    if (p) p.forEach(j => { const c = document.querySelector(`.cell[data-i="${j}"]`); if (c) c.classList.add("preview"); });
  }

  // ── 材料詳情 ──
  const wuxingLine = e => GEN[e] ? `${e}生${GEN[e]}、${e}剋${KE[e]}；怕${KE_BY[e]}剋，喜${GEN_BY[e]}生。` : "";
  function openInfo(x, inHand) {
    const box = $("#infoBox"); box.textContent = "";
    const n = x.cells.length || x.rar.size;
    const axes = itemAxes(x);
    const taste = h("div", { class: "info-taste" });
    x.stars.forEach((s, i) => taste.append(h("span", {}, AXES[i]),
      hiddenStars(x) ? h("span", { class: "stars" }, "？？？") : h("span", {}, starsEl(s), !inHand && !(x.ing.rule === "authenticity" && !x.revealed) ? `　${pts(axes[i])}` : "")));
    const f = inHand ? factors(x).filter(([k]) => k === "果汁" || k === "液體" || k === "魔女大釜") : factors(x);
    const eff = effectText(x.ing);
    box.append(...[
      h("button", { class: "info-close", "aria-label": "關閉", onclick: closeInfo }, "×"),
      h("h3", {}, h("span", { class: "rar " + x.rar.id }, x.rar.id), displayName(x) + (x.juiced ? "（果汁）" : "")),
      taste,
      h("div", { class: "info-meta" },
        h("span", {}, "五行 ", h("b", {}, elementOf(x))),
        h("span", {}, "占 ", h("b", {}, n), " 格"),
        h("span", {}, inHand ? "預估 " : "小計 ", h("b", {}, hiddenStars(x) || (x.ing.rule === "authenticity" && !x.revealed) ? "？" : pts(itemPoints(x))))),
      f.length ? h("div", { class: "info-meta" }, f.map(([k, v]) => h("span", {}, k + " ", h("b", {}, fmtMult(v))))) : null,
      eff ? h("p", { class: "info-effect" }, h("b", {}, "效果　"), eff) : null,
      h("p", { class: "info-effect" }, h("b", {}, "五行　"), wuxingLine(elementOf(x))),
      x.ing.lore ? h("p", { class: "info-lore" }, x.ing.lore) : null].filter(Boolean));
    $("#infoModal").hidden = false;
  }
  function closeInfo() { $("#infoModal").hidden = true; }

  // ── 食材圖鑑（存在 localStorage） ──
  const DEX_KEY = "rein-halloween-dex";
  function recordDex(x) {
    const d = store.get(DEX_KEY, {});
    const e = d[x.ing.id] || { n: 0, best: null };
    e.n++;
    if (!e.best || RAR_ORDER.indexOf(x.rar.id) > RAR_ORDER.indexOf(e.best)) e.best = x.rar.id;
    d[x.ing.id] = e;
    store.set(DEX_KEY, d);
  }
  function openDex() {
    const d = store.get(DEX_KEY, {});
    const list = $("#dexList"); list.textContent = "";
    $("#dexTitle").textContent = `食材圖鑑　${D.ingredients.filter(i => d[i.id]).length} / ${D.ingredients.length}`;
    for (const [zone, label] of Object.entries(ZONES)) {
      const ings = D.ingredients.filter(i => i.zone === zone);
      if (!ings.length) continue;
      list.append(h("div", { class: "dex-zone" }, `${label}　${ings.filter(i => d[i.id]).length}/${ings.length}`));
      list.append(h("div", { class: "dex-grid" }, ings.map(ing => {
        const e = d[ing.id];
        if (!e) return h("div", { class: "dex-item unknown" }, h("span", { class: "dn" }, "？？？"), h("span", { class: "dm" }, "還沒遇過"));
        return h("button", { class: "dex-item", onclick: () => openDexInfo(ing, e) },
          h("span", { class: "dn" }, h("span", { class: "rar " + e.best }, e.best), " ", ing.name),
          h("span", { class: "dm" }, `${ing.element}・色${ing.taste[0]} 香${ing.taste[1]} 味${ing.taste[2]}・抽過 ${e.n} 次`));
      })));
    }
    $("#dexModal").hidden = false;
  }
  function openDexInfo(ing, e) {
    const rar = RARITIES.find(r => r.id === e.best) || RARITIES[0];
    const fake = { uid: 0, ing, rar: RARITIES[0], stars: ing.taste.slice(), shapes: SHAPES[1], cells: [], fake: false, juiced: false, vanished: false, neutralized: false, used: false, dup: false, revealed: true, priceMult: 1 };
    openInfo(fake, true);
    $("#infoBox").append(h("p", { class: "info-lore" }, `基本星數（R 品質）。抽過 ${e.n} 次，最高品質 ${rar.id}${rar.prefix ? `（${rar.prefix}${ing.name}）` : ""}。`));
  }

  // ── 抽卡 ──
  function drawFromDeck() {
    if (!S.deck.length) return null;
    const setsOn = new Set(liveItems().map(x => x.ing.zone).filter(z => z.startsWith("set")));
    const count = {};
    for (const i of S.deck) count[i.zone] = (count[i.zone] || 0) + 1;
    const idx = weighted(S.deck, i => (C.zoneWeights[i.zone] || 1) / count[i.zone] * (setsOn.has(i.zone) ? C.setBoost : 1));
    return S.deck.splice(idx, 1)[0];
  }
  function rollStars(ing, rar) {
    const s = (ing.taste || [1, 1, 1]).slice();
    if (rar.starUp === "one") s[Math.floor(Math.random() * 3)]++;
    else if (rar.starUp === "all") s.forEach((v, i) => { s[i] = v + 1; });
    else if (rar.starUp === "max") s.fill(3);
    // 不能吃的東西：品質只會讓它更好看，香和味維持原樣
    if (ing.tags.includes("inedible")) { s[1] = ing.taste[1]; s[2] = ing.taste[2]; if (rar.starUp === "one") s[0]++; }
    return s.map(v => Math.max(0, Math.min(3, v)));
  }
  function newItem(ing) {
    const rar = RARITIES[weighted(RARITIES, r => r.weight)];
    return {
      uid: ++S.uid, ing, rar, stars: rollStars(ing, rar), shapes: SHAPES[rar.size] || SHAPES[1], cells: [],
      fake: false, juiced: false, vanished: false, neutralized: false, used: false, dup: false, revealed: false, priceMult: 1
    };
  }

  // 護盾：角粉只救相鄰材料（地雷、即死）；鱗片整盤免疫一次（任何失敗）；先用角粉
  function useShield(kind, x) {
    if (kind !== "fire") {
      const horn = around(x).find(y => y.ing.rule === "neutralize_once" && !y.used);
      if (horn) { horn.used = true; return horn; }
    }
    const scale = liveItems().find(y => y.ing.rule === "immune_once" && !y.used && y !== x);
    if (scale) { scale.used = true; return scale; }
    return null;
  }

  function onDraw() {
    if (S.busy || S.hand || full() || !S.deck.length) return;
    S.turn++;
    const x = newItem(drawFromDeck());
    if (x.ing.rule === "authenticity") x.fake = Math.random() < C.fakeChance;
    if (S.container.rule === "liquid_only" && !x.ing.tags.includes("liquid")) x.juiced = true;
    recordDex(x);
    const rot = x.shapes.findIndex(sh => fitsAnywhere(sh));
    const label = `${x.rar.id} ${displayName(x)}${x.juiced ? "（打成果汁）" : ""}`;
    if (rot < 0) return dropItem(x, label);
    S.hand = x;
    S.rot = rot;
    log(`抽到「${label}」。`);
    if (x.ing.rule === "fake_label") say("那、那個罐子寫著劇毒⋯⋯", "scared");
    else if (x.ing.rule === "flip") say(x.rar.id === "UR" ? "⋯⋯神級鳳梨。不要。" : "⋯⋯鳳梨。", "angry");
    else if (x.ing.rule === "instadeath" || x.ing.rule === "toxic_risk") say(`${x.ing.name}⋯⋯小心放。`, "scared");
    else if (x.ing.tags.includes("inedible")) say(`${x.ing.name}⋯⋯這個能吃嗎？`, "meh");
    else if (x.rar.id === "UR") say(`${displayName(x)}！`, "happy");
    else setFace("idle");
    renderPlate(); setButtons();
  }

  // 盤子放不下 → 掉到地上，扣分（不能吃的東西掉了不扣）
  function dropItem(x, label) {
    const base = Math.max(0, itemPoints(x));
    const pen = Math.round(base * (C.dropPenaltyRate || 0));
    S.penalty += pen;
    S.dropped.push(x);
    x.penalty = pen;
    log(FALLBACK.drop(label, pen));
    say("⋯⋯掉了。不能吃了。", "pout");
    afterPlace([]);
  }

  function onRotate() {
    if (S.busy || !S.hand || S.hand.shapes.length < 2) return;
    S.rot = (S.rot + 1) % S.hand.shapes.length;
    renderPlate();
  }

  function onDiscard() {
    if (S.busy || !S.hand || S.hand.ing.rule !== "fake_label") return;
    log(`把「${S.hand.ing.name}」丟掉了。`);
    say("丟掉了⋯⋯真的是毒嗎？", "meh");
    S.hand = null;
    afterPlace([]);
  }

  async function onPlace(i) {
    if (S.busy || !S.hand || S.grid[i]) return;
    const cells = placementFor(i, handShape());
    if (!cells) return;
    S.busy = true;
    const x = S.hand;
    S.hand = null;
    x.cells = cells;
    cells.forEach(j => { S.grid[j] = x; });
    if (x.ing.rule === "fake_label") S.flags.busuKept = true;
    renderPlate(x.uid); setButtons();
    await sleep(320);
    const fatal = resolvePlacement(x);
    if (fatal) return endRound(fatal);
    await afterPlace(cells);
  }

  async function afterPlace(flash) {
    S.busy = true;
    if (S.container.rule === "need_liquid" && !liveItems().some(isLiquid)) {
      S.penalty += S.container.params.penaltyPerTurn;
      log($("#log").textContent + ` 頭皿乾了，扣 ${S.container.params.penaltyPerTurn} 分。`);
    }
    renderPlate(null, flash);
    await randomEvent();
    S.busy = false;
    renderPlate(); setButtons();
    if (full()) { log($("#log").textContent + " 盤子滿了，直接送餐。"); await sleep(700); return onServe(); }
    if (!S.deck.length) log("食材櫃空了。只能送餐了。");
  }

  // 材料放下當下的效果；回傳致命結果或 null
  function resolvePlacement(x) {
    const ing = x.ing, rule = ing.rule;
    if (rule === "flip") {
      if (S.container.rule === "pineapple_legal") { say("⋯⋯披薩上的鳳梨。合法。", "deadpan"); return null; }
      if (Math.random() < C.hawaiianChance) return { type: "hawaiian", cause: x };
      const sh = useShield("mine", x);
      if (sh) { x.neutralized = true; renderPlate(); say(`${sh.ing.name}生效，鳳梨被中和了。好險。`, "meh"); return null; }
      return { type: "flip", cause: x };
    }
    if (rule === "toxic_risk") {
      const ointment = COMBOS.find(c => c.effect === "float");
      if (ointment && comboDone(ointment)) { say(ointment.verdict || "飛行軟膏完成。", "dizzy"); return null; }
      if (Math.random() < ing.params.chance) {
        const sh = useShield("death", x);
        if (sh) { x.neutralized = true; renderPlate(); say(`${ing.name}的毒發作了——${sh.ing.name}擋下來了。`, "scared"); return null; }
        return { type: "instadeath_toxic", cause: x };
      }
      say(`${ing.name}⋯⋯還好，沒事。`, "scared");
      return null;
    }
    if (rule === "authenticity" && x.fake && ing.params && ing.params.fakeEffect === "self_ignite") {
      x.revealed = true;
      const sh = useShield("fire", x);
      if (sh) { x.neutralized = true; renderPlate(); say(`火鼠裘是贗品，燒起來了！${sh.ing.name}護住了整盤。`, "scared"); return null; }
      return { type: "fire_rat_ignite", cause: x };
    }
    if (rule === "authenticity") { say(`${ing.name}⋯⋯是真的嗎？反正不能吃。`, "pout"); return null; }
    if (rule === "instadeath") {
      say(mandrakeSafe(x) ? "旁邊有犬之舌——曼德拉草可以安全處理。" : "曼德拉草在尖叫⋯⋯送餐前得讓它旁邊有犬之舌。", mandrakeSafe(x) ? "happy" : "scared");
      return null;
    }
    if (ing.tags.includes("dog_tongue") && around(x).some(y => y.ing.rule === "instadeath")) { say("犬之舌！隔壁的曼德拉草安全了。", "happy"); return null; }
    if (rule === "discount") { say(`⋯⋯${ing.name}。隔壁的也被嫌棄了。`, "meh"); return null; }
    if (rule === "fake_label") { say("真的放了⋯⋯", "scared"); return null; }
    if (rule === "neutralize_once") { say(`${ing.name}。隔壁的毒和地雷，它能擋一次。`, "idle"); return null; }
    if (rule === "immune_once") { say(`${ing.name}。整盤可以免疫一次。`, "idle"); return null; }
    const done = COMBOS.find(c => c.requires.includes(ing.id) && c.effect !== "cancel_instadeath" && comboDone(c));
    if (done) { say(`⋯⋯！${done.result}！`, "happy"); return null; }
    if (ing.tags.includes("inedible")) { say(`${displayName(x)}⋯⋯這個真的不能吃。`, "meh"); return null; }
    const rel = relations(x);
    const g = rel.filter(r => r.kind === "生"), k = rel.filter(r => r.kind === "剋");
    if (g.length && !k.length) { say(`${g[0].y.ing.name}的${elementOf(g[0].y)}生${elementOf(x)}，${displayName(x)}更好吃了。`, "happy"); return null; }
    if (k.length && !g.length) { say(`${k[0].y.ing.name}的${elementOf(k[0].y)}剋${elementOf(x)}⋯⋯味道被壓下去了。`, "meh"); return null; }
    if (x.cells.includes(CENTER)) say(`${displayName(x)}放在主位。`, "idle");
    else if (ing.zone !== "normal" || x.rar.id !== "R") say(`${displayName(x)}⋯⋯`, "idle");
    else setFace("idle");
    return null;
  }

  // ── 隨機事件 ──
  async function randomEvent() {
    const items = liveItems();
    if (!items.length || !D.events || !D.events.length || Math.random() >= C.eventChance) return;
    const ev = D.events[weighted(D.events, e => e.weight || 1)];
    let text = "", face = "idle", flash = [];
    if (ev.rule === "nibble") {
      const pool = items.filter(x => !["flip", "instadeath", "fake_label", "toxic_risk"].includes(x.ing.rule) && !x.ing.tags.includes("inedible"));
      if (!pool.length) return;
      const x = pick(pool);
      x.cells.forEach(j => { S.grid[j] = null; });
      S.eaten.push(x);
      text = ev.text || FALLBACK.nibble(displayName(x)); face = "happy"; flash = x.cells;
    } else if (ev.rule === "swap") {
      // 只有單格材料會被晃動：跟另一個單格材料換位，或滑到空格
      const singles = items.filter(x => x.cells.length === 1);
      if (!singles.length) return;
      const a = pick(singles), from = a.cells[0];
      const targets = [...Array(CELLS).keys()].filter(i => i !== from && (!S.grid[i] || (live(S.grid[i]) && S.grid[i].cells.length === 1)));
      if (!targets.length) return;
      const to = pick(targets), b = S.grid[to];
      S.grid[to] = a; a.cells = [to];
      S.grid[from] = b || null; if (b) b.cells = [from];
      text = ev.text || (b ? FALLBACK.swap(displayName(a), displayName(b)) : FALLBACK.slide(displayName(a), to + 1));
      face = "scared"; flash = [from, to];
    } else if (ev.rule === "price_mult") {
      const pool = items.filter(x => !x.neutralized && x.ing.rule !== "flip" && !x.ing.tags.includes("inedible"));
      if (!pool.length) return;
      const x = pick(pool), m = ev.params.mult;
      x.priceMult *= m;
      text = ev.text || (m >= 1 ? FALLBACK.fresh(displayName(x), m) : FALLBACK.stale(displayName(x), m));
      face = m >= 1 ? "happy" : "meh"; flash = x.cells;
    } else return;
    await sleep(450);
    log("✦ " + text);
    say(text, face);
    renderPlate(null, flash);
    await sleep(900);
  }

  // ── 送餐 ──
  async function onServe() {
    if (S.busy || S.hand || !liveItems().length) return;
    S.busy = true; setButtons(); renderPlate();
    say("送餐！", "idle");
    await sleep(500);

    for (const m of liveItems().filter(x => x.ing.rule === "instadeath" && !x.neutralized && !mandrakeSafe(x))) {
      const sh = useShield("death", m);
      if (sh) { m.neutralized = true; renderPlate(); say(`曼德拉草尖叫了——${sh.ing.name}擋下來了。`, "scared"); await sleep(1100); }
      else return endRound({ type: "instadeath_mandrake", cause: m });
    }

    if (S.container.rule === "duplicate_one") {
      const src = pick(liveItems());
      const spots = allPlacements(src.shapes);
      if (!spots.length) { log(`聚寶盆想複製「${displayName(src)}」，可是盤子放不下。`); await sleep(900); }
      else {
        const copy = { ...src, uid: ++S.uid, dup: true, used: false, cells: pick(spots) };
        copy.cells.forEach(j => { S.grid[j] = copy; });
        renderPlate(copy.uid);
        log(`聚寶盆複製了「${displayName(src)}」。`);
        await sleep(900);
        if (src.ing.rule === "flip" && S.container.rule !== "pineapple_legal") {
          const sh = useShield("mine", copy);
          if (sh) { copy.neutralized = true; renderPlate(); say(`又一顆鳳梨⋯⋯${sh.ing.name}擋下來了。`, "meh"); await sleep(900); }
          else return endRound({ type: "flip", cause: copy, double: true });
        }
      }
    }

    if (S.container.rule === "vanish_one") {
      const v = pick(liveItems());
      if (v) { v.vanished = true; renderPlate(); log(`一枚、兩枚⋯⋯第十枚。「${displayName(v)}」不見了。`); await sleep(1000); }
    }

    allItems().forEach(x => { x.revealed = true; });
    renderPlate();
    await sleep(500);
    await eatAnimation();

    const sc = score();
    let type;
    if (sc.combos.some(c => c.effect === "ending")) type = "eternal_oblivion";
    else type = meets(sc) ? "treat" : "trick";
    endRound({ type, sc });
  }

  // ── 結算 ──
  async function endRound(res) {
    S.busy = true; setButtons();
    closeInfo();
    const c = S.container;
    const fatal = FATAL.includes(res.type);
    const sc = res.sc || score();
    let total = sc.total, kept = null;
    let grade = res.type === "treat" ? gradeOf(sc) : null;

    if (fatal) {
      await fatalAnimation(res);
      if (c.rule === "keep_one_on_fail") {
        kept = liveItems().filter(x => x !== res.cause && itemPoints(x) > 0).sort((a, b) => itemPoints(b) - itemPoints(a))[0] || null;
      }
      total = kept ? itemPoints(kept) : 0;
      if (c.rule === "flip_half" && res.type === "flip") total = Math.round(score().total * (1 - (c.params.flipLossRate || 0.5)));
      S.hp = Math.max(0, S.hp - 1);
    } else if (res.type === "hawaiian") {
      total = Math.ceil(S.req.total * C.grades.legend);
      grade = "legend";
      await sleep(300);
    } else if (res.type === "eternal_oblivion") {
      grade = gradeOf(sc) || "good";
    }

    const rampage = fatal && S.hp <= 0;
    const lines = [];
    const add = t => { if (t && !lines.includes(t)) lines.push(t); };
    const endText = id => (ENDING[id] && ENDING[id].verdict) || FALLBACK[id];

    let face = "idle", stamp = "", stampCls = "", stampZh = false;
    if (rampage) {
      add(endText("rampage")); add(res.double ? FALLBACK.double_flip : endText(res.type));
      face = "angry"; stamp = "暴走"; stampCls = "fail"; stampZh = true;
    } else if (fatal) {
      add(res.double ? FALLBACK.double_flip : endText(res.type));
      face = res.type === "flip" ? "angry" : res.type === "fire_rat_ignite" ? "scared" : "dizzy";
      stamp = res.type === "flip" ? "掀盤" : res.type === "fire_rat_ignite" ? "炎上" : "即死";
      stampCls = "fail"; stampZh = true;
    } else if (res.type === "hawaiian") {
      add(endText("hawaiian")); face = "happy"; stamp = "傳說"; stampZh = true;
    } else if (res.type === "eternal_oblivion") {
      const combo = sc.combos.find(x => x.effect === "ending");
      add(combo.verdict || FALLBACK.eternal_oblivion); face = "plain"; stamp = "永生"; stampZh = true;
    } else {
      for (const combo of sc.combos) add(combo.verdict);
      if (grade === "legend" || grade === "great") add(endText(grade));
      const top = liveItems().filter(x => x.ing.verdict).sort((a, b) => itemPoints(b) - itemPoints(a))[0];
      if (top) add(top.ing.verdict);
      add(endText(res.type));
      if (grade) {
        face = sc.combos.some(x => x.id === "kaguya_set") ? "cry" : sc.combos.some(x => x.effect === "float") ? "dizzy" : "happy";
        stamp = grade === "legend" ? "傳說" : grade === "great" ? "大滿足" : "TREAT";
        stampZh = grade !== "good";
      } else { face = "pout"; stamp = "TRICK"; stampCls = "fail"; }
    }
    if (!fatal) {
      for (const d of sc.discounts) add(d.ing.verdict || FALLBACK.discount(d.ing.name));
      const ined = sc.inedible.filter(x => !x.fake || !x.revealed)[0] || sc.inedible[0];
      if (ined && !sc.combos.some(cb => cb.requires.includes(ined.ing.id))) add(FALLBACK.inedible(ined.ing.name));
      if (S.flags.busuKept && onPlate("busu_jar")) add(endText("busu_reveal"));
    }
    const pizza = c.rule === "pineapple_legal" && !fatal;
    if (pizza) { add(FALLBACK.pizza); face = "deadpan"; }

    // 成就
    const chips = [];
    if (!fatal) for (const combo of sc.combos) chips.push(combo.result);
    if (grade === "great") chips.push("大滿足");
    if (grade === "legend") chips.push("傳說級料理");
    if (res.type === "hawaiian") chips.push("夏威夷結局");
    if (S.contName !== c.name) chips.push(S.contName);
    if (!fatal && S.flags.busuKept && onPlate("busu_jar")) chips.push("附子罐反轉");
    if (allItems().some(x => x.rar.id === "UR" && !x.dup)) chips.push("神級食材");
    if (kept) chips.push(`甕底留下：${displayName(kept)}`);
    if (rampage) chips.push("零韻暴走");
    recordAlbum(chips);

    // Treat / Trick 演出
    const treat = !fatal && !!grade;
    let trick = null;
    setFace(face);
    if (treat && !pizza) {
      const gain = (C.grades.affection || {})[grade] || 1;
      hearts(grade === "legend" ? 70 : grade === "great" ? 45 : 26);
      S.aff = Math.min(C.maxAffection, S.aff + gain);
      if (S.aff === C.maxAffection && !S.flags.affNoted) { S.flags.affNoted = true; add(FALLBACK.affectionFull); chips.push("好感度滿值"); }
    } else if (!treat && !fatal) {
      const n = 1 + Math.floor(Math.random() * D.tricks.length);
      trick = D.tricks.find(t => t.id === n) || { id: n, text: "", anim: "" };
      playTrick(trick);
    }
    if (rampage) await rampageAnimation();
    renderMeters();

    S.last = { type: res.type, fatal, rampage, treat, grade, pizza, total, sc, kept, lines, chips, stamp, stampCls, stampZh, face, trick, double: !!res.double, cause: res.cause, req: S.req };

    // 結算畫面
    const st = $("#resStamp");
    st.textContent = stamp; st.className = "stamp-big" + (stampCls ? " " + stampCls : "") + (stampZh ? " zh" : "");
    const rs = $("#resScore"); rs.textContent = "";
    rs.append("鑑定 ", h("b", {}, total), ` 分　／　要求：${reqText(S.req)}`);
    if (!fatal && res.type !== "hawaiian") rs.append(h("br"), sc.axes.map((v, i) => `${AXES[i]} ${v}`).join("・") + (grade && grade !== "good" ? `　（要求的 ${Math.round(sc.total / S.req.total * 100)}%）` : ""));
    const v = $("#resVerdict"); v.textContent = "";
    lines.slice(0, 3).forEach(t => v.append(h("p", {}, t)));
    const tb = $("#trickBox");
    tb.hidden = !trick;
    if (trick) { tb.textContent = ""; tb.append(h("b", {}, `TRICK #${trick.id}`), "　", trick.text || "零韻的惡作劇發動了。"); }
    const ch = $("#resChips"); ch.textContent = "";
    chips.forEach(t => ch.append(h("span", { class: "chip" }, t)));
    $("#btnAgain").textContent = rampage ? "重新開店" : "再來一盤";
    say(lines[0] || "", face);
    show("screen-result");
    S.busy = false;
  }

  // ── 演出 ──
  function stagePoint() {
    const r = $("#rein").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.32 };
  }
  async function eatAnimation() {
    const target = stagePoint();
    const pieces = [...document.querySelectorAll("#plate .piece:not(.off)")];
    pieces.forEach((t, i) => {
      const r = t.getBoundingClientRect();
      t.style.transitionDelay = `${i * 60}ms`;
      t.style.transform = `translate(${target.x - (r.left + r.width / 2)}px, ${target.y - (r.top + r.height / 2)}px) scale(.15)`;
      t.style.opacity = "0";
    });
    await sleep(500 + pieces.length * 60);
    const wrap = $("#reinWrap");
    wrap.classList.add("chew");
    crumbs();
    await sleep(1000);
    wrap.classList.remove("chew");
  }
  function crumbs() {
    const fx = $("#fx"), sr = $("#stage").getBoundingClientRect(), p = stagePoint();
    for (let i = 0; i < 18; i++) {
      fx.append(h("span", { class: "crumb", style: `left:${p.x - sr.left}px;top:${p.y - sr.top + 40}px;--dx:${(Math.random() - .5) * 160}px;--dy:${60 + Math.random() * 120}px;--d:${Math.random() * .5}s` }));
    }
    setTimeout(() => fx.textContent = "", 1400);
  }
  function hearts(count = 26) {
    const fx = $("#fx"), sr = $("#stage").getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      fx.append(h("span", {
        class: "heart",
        style: `left:${sr.width * (.3 + Math.random() * .4)}px;top:${sr.height * (.45 + Math.random() * .2)}px;--dx:${(Math.random() - .5) * sr.width * .8}px;--dy:${-sr.height * (.3 + Math.random() * .4)}px;--d:${Math.random() * (count > 30 ? 1.4 : .7)}s;--s:${16 + Math.random() * 18}px`
      }, "♥"));
    }
    setTimeout(() => fx.textContent = "", 3400);
  }
  async function fatalAnimation(res) {
    const plate = $("#plate");
    const label = res.type === "flip" ? (res.double ? "雙倍火葬" : "掀盤！") : res.type === "fire_rat_ignite" ? "炎上！" : "即死！";
    setFace(res.type === "flip" ? "angry" : res.type === "fire_rat_ignite" ? "scared" : "dizzy");
    if (res.cause) say(`「${displayName(res.cause)}」——`);
    await sleep(300);
    plate.classList.add("flipped");
    document.querySelectorAll("#plate .piece").forEach(t => {
      t.style.transform = `translate(${(Math.random() - .5) * 500}px, ${-200 - Math.random() * 300}px) rotate(${(Math.random() - .5) * 720}deg)`;
      t.style.opacity = "0";
    });
    $("#app").classList.add("shake");
    $("#overlay").append(h("div", { class: "slam-text" }, label));
    await sleep(1500);
    $("#app").classList.remove("shake");
    $("#overlay").textContent = "";
    plate.classList.remove("flipped");
  }
  async function rampageAnimation() {
    const ov = $("#overlay");
    ov.append(h("div", { class: "chase" }, h("div", { class: "victim" }, "你"), h("img", { src: "assets/rein/angry.webp", alt: "" })));
    await sleep(3300);
    ov.textContent = "";
  }
  // trick 演出：anim 代號 trick_01..10 對到畫面效果
  const TRICK_FX = ["fx-shake", "fx-invert", "fx-ghost", "fx-ink", "fx-upside", "fx-blur", "fx-tilt", "fx-ghost", "fx-ink", "fx-invert"];
  function playTrick(t) {
    const n = parseInt(String(t.anim).replace(/\D/g, ""), 10) || t.id;
    const fx = TRICK_FX[(n - 1) % TRICK_FX.length];
    const body = document.body, ov = $("#overlay");
    setTimeout(() => {
      if (fx === "fx-shake") { $("#app").classList.add("shake"); setTimeout(() => $("#app").classList.remove("shake"), 500); }
      else if (fx === "fx-ghost") { for (let i = 0; i < 4; i++) ov.append(h("div", { class: "ghost", style: `top:${15 + i * 18}vh;animation-delay:${i * .25}s` }, "👻")); }
      else if (fx === "fx-ink") { for (let i = 0; i < 9; i++) { const s = 60 + Math.random() * 140; ov.append(h("div", { class: "ink", style: `left:${Math.random() * 90}vw;top:${Math.random() * 80}vh;width:${s}px;height:${s}px;animation-delay:${i * .06}s` })); } }
      else body.classList.add(fx);
      setTimeout(() => { body.classList.remove(fx); ov.textContent = ""; }, 2200);
    }, 400);
  }

  // ── 收集冊 ──
  const ALBUM = [
    ...COMBOS.filter(c => c.effect !== "cancel_instadeath").map(c => c.result),
    "大滿足", "傳說級料理", "夏威夷結局", "附子罐反轉", "神級食材",
    ...CONTAINERS.filter(c => c.params && c.params.skinName).map(c => c.params.skinName),
    "零韻暴走"
  ];
  function recordAlbum(chips) {
    const got = new Set(store.get("rein-halloween-album", []));
    chips.forEach(c => { if (ALBUM.includes(c)) got.add(c); });
    store.set("rein-halloween-album", [...got]);
  }
  function renderAlbum() {
    const got = new Set(store.get("rein-halloween-album", []));
    const el = $("#album"); el.textContent = "";
    el.append(h("h3", {}, `收集冊　${ALBUM.filter(a => got.has(a)).length} / ${ALBUM.length}`),
      h("ul", {}, ALBUM.map(a => h("li", { class: got.has(a) ? "got" : "" }, got.has(a) ? a : "？？？"))));
  }

  // ── 流程 ──
  function toContainers() {
    if (S.hp <= 0) { S.hp = C.maxHp; S.aff = 0; S.flags.affNoted = false; }
    renderMeters();
    setFace("idle"); $("#reinWrap").classList.remove("float");
    S.req = rollRequest();
    $("#screen-container").append($("#album"));
    renderAlbum();
    const offer = shuffle(CONTAINERS.slice()).slice(0, Math.max(1, C.containerChoices || CONTAINERS.length));
    const box = $("#containers"); box.textContent = "";
    const reqEl = $("#reqBanner") || h("p", { class: "lead", id: "reqBanner" });
    reqEl.textContent = "";
    reqEl.append("今晚零韻的要求：", h("b", {}, reqText(S.req)));
    box.before(reqEl);
    for (const c of offer) {
      box.append(h("button", { class: "cont", onclick: () => startRound(c) },
        h("span", { class: "cont-name" }, c.name),
        h("span", { class: "cont-rule" }, ruleText(c)),
        c.lore ? h("span", { class: "cont-lore" }, c.lore) : null));
    }
    say(FALLBACK.request(reqText(S.req)), "idle");
    show("screen-container");
  }
  function startRound(c) {
    S.container = c;
    S.contName = c.params && c.params.skinChance && Math.random() < c.params.skinChance ? c.params.skinName : c.name;
    S.grid = Array(CELLS).fill(null); S.hand = null; S.rot = 0; S.eaten = []; S.dropped = [];
    S.deck = D.ingredients.slice(); S.penalty = 0; S.turn = 0; S.busy = false;
    S.flags = { affNoted: S.flags.affNoted };
    $("#contName").textContent = S.contName;
    $("#contRule").textContent = ruleText(c);
    log(S.contName !== c.name ? `⋯⋯咦？南瓜盅變成了${S.contName}。好復古。` : `要求：${reqText(S.req)}。盤子不用放滿。`);
    renderPlate(); setButtons();
    say(c.rule === "pineapple_legal" ? "⋯⋯披薩啊。" : "開始吧。我等著。", c.rule === "pineapple_legal" ? "deadpan" : "idle");
    show("screen-play");
  }

  // ── 證書 ──
  function dishName(L) {
    const coll = L.sc.combos.find(c => c.effect === "collection" || c.effect === "ending");
    if (coll && !L.fatal) return coll.result;
    const items = liveItems().filter(x => !x.dup).sort((a, b) => itemPoints(b) - itemPoints(a));
    const a = items[0], b = items[1];
    let n = a ? (b ? `${displayName(a)}佐${displayName(b)}` : displayName(a)) : "空氣";
    n += `・${S.contName}仕立`;
    if (L.type === "flip") n = `被掀翻的${n}`;
    else if (L.fatal) n = `來不及上桌的${n}`;
    else if (L.grade === "legend") n = `傳說的${n}`;
    return n;
  }
  function buildCert() {
    const L = S.last, el = $("#cert");
    el.textContent = "";
    const now = new Date();
    const serial = "No. " + String(Math.floor(1000 + Math.random() * 9000)) + "-" + (now.getMonth() + 1) + now.getDate();
    const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;

    const notes = [];
    const row = (x, p, off, tag) => {
      let sup = null;
      if (x.ing.lore && notes.length < 4 && !notes.some(n => n.id === x.ing.id)) { notes.push({ id: x.ing.id, name: x.ing.name, lore: x.ing.lore }); sup = notes.length; }
      const name = displayName(x) + (x.juiced ? "汁" : "") + (x.fake ? "（贗品）" : "") + (x.dup ? "（複製）" : "") + (tag || "");
      return h("div", { class: "c-row" + (off ? " off" : "") }, h("span", { class: "n" }, h("span", { class: "rk" }, x.rar.id), name, sup ? h("sup", {}, sup) : null), h("span", { class: "p" }, p));
    };
    const rows = [];
    allItems().sort((a, b) => a.cells[0] - b.cells[0]).forEach(x => {
      let p, off = false;
      if (x.vanished) { p = "消失"; off = true; }
      else if (x.neutralized) { p = "中和"; off = true; }
      else if (L.fatal && x !== L.kept) { p = "—"; off = true; }
      else if (x.ing.rule === "flip" && S.container.rule !== "pineapple_legal") p = L.type === "hawaiian" ? "傳說" : "地雷";
      else p = pts(itemPoints(x));
      rows.push(row(x, p, off, (x.cells.includes(CENTER) ? "（主位）" : "") + (x === L.kept ? "（甕底）" : "")));
    });
    S.eaten.forEach(x => rows.push(row(x, "偷吃", true)));
    S.dropped.forEach(x => rows.push(row(x, "掉落", true)));
    if (!L.fatal) {
      for (const combo of L.sc.combos) if (combo.bonus) rows.push(h("div", { class: "c-row extra" }, h("span", { class: "n" }, `組合：${combo.result}`), h("span", { class: "p" }, "+" + pts(combo.bonus))));
      if (S.penalty) rows.push(h("div", { class: "c-row extra" }, h("span", { class: "n" }, S.dropped.length ? "掉落與扣分" : "頭皿乾涸"), h("span", { class: "p" }, "−" + pts(S.penalty))));
      if (S.container.baseScore) rows.push(h("div", { class: "c-row extra" }, h("span", { class: "n" }, `${S.contName}基礎分`), h("span", { class: "p" }, "+" + pts(S.container.baseScore))));
    }
    const listCls = "c-list" + (rows.length > 9 ? " two" : "");
    const shown = rows.length > 24 ? rows.slice(0, 23).concat(h("div", { class: "c-row extra" }, h("span", { class: "n" }, `⋯⋯另有 ${rows.length - 23} 項`))) : rows;

    if (S.container.lore && notes.length < 4) notes.push({ name: S.contName, lore: S.container.lore });

    const taste = L.fatal ? null : h("div", { class: "c-taste" },
      L.sc.axes.map((v, i) => h("span", {}, AXES[i] + " ", h("span", { class: "mx" }, v))),
      h("span", {}, `要求：${reqText(L.req)}`));

    el.append(
      h("div", { class: "c-head" },
        h("div", { class: "c-en" }, "Certificate of Halloween Culinary Appraisal"),
        h("div", { class: "c-title" }, "萬聖節料理鑑定證書"),
        h("div", { class: "c-no" }, h("span", {}, serial), h("span", {}, "月上零韻圖書館餐廳"), h("span", {}, date))),
      h("div", { class: "c-dish" }, dishName(L)),
      h("div", { class: "c-cont" }, `器：${S.contName}　｜　上盤 ${S.grid.filter(Boolean).length} / ${CELLS} 格`),
      h("div", { class: listCls }, shown),
      h("div", { class: "c-total" },
        h("span", { class: "l" }, "鑑定分數"),
        h("span", { class: "pl" }, `要求 ${L.req.total} 分`),
        h("span", { class: "v" }, pts(L.total))),
      taste,
      h("div", { class: "c-bottom" },
        h("div", { class: "c-left" },
          h("div", { class: "c-verdict-l" }, "鑑定師判詞"),
          h("div", { class: "c-verdict" }, "「" + (L.lines[0] || "") + "」", L.lines[1] ? h("span", { class: "sub" }, L.lines[1]) : null),
          L.trick ? h("div", { class: "c-trick" }, h("b", {}, `TRICK #${L.trick.id}`), "　" + (L.trick.text || "")) : null,
          L.chips.length ? h("div", { class: "c-chips" }, L.chips.map(c => h("span", { class: "c-chip" }, c))) : null,
          notes.length ? h("div", { class: "c-notes" }, notes.map((n, i) => h("p", {}, `${n.id ? i + 1 + "　" : "※ "}${n.name}：${n.lore}`))) : null),
        h("div", { class: "c-right" },
          h("div", { class: "c-stamp" + (L.stampCls ? " " + L.stampCls : "") + (L.stampZh ? " zh" : "") }, L.stamp),
          h("img", { class: "c-portrait", src: `assets/rein/${FACES.includes(L.face) ? L.face : "idle"}.webp`, alt: "" }))),
      h("div", { class: "c-sign" }, "鑑定師　月上零韻")
    );
  }
  async function openCard() {
    buildCert();
    const modal = $("#cardModal"), wrap = $("#cardImgWrap"), save = $("#btnSave");
    wrap.innerHTML = '<p class="loading">證書製作中⋯⋯</p>';
    save.removeAttribute("href");
    modal.hidden = false;
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const img = $("#cert .c-portrait");
      if (img && !img.complete) await new Promise(r => { img.onload = img.onerror = r; });
      if (typeof html2canvas !== "function") throw new Error("html2canvas 沒載入");
      const canvas = await html2canvas($("#cert"), { scale: 2, backgroundColor: null, logging: false });
      const url = canvas.toDataURL("image/png");
      wrap.textContent = "";
      wrap.append(h("img", { src: url, alt: "萬聖節料理鑑定證書" }));
      save.href = url;
      save.download = `零韻鑑定證書-${Date.now()}.png`;
    } catch (e) {
      wrap.textContent = "";
      wrap.append(h("p", { class: "loading" }, "證書存圖失敗：" + e.message));
    }
  }

  // ── 綁定 ──
  $("#btnStart").onclick = toContainers;
  $("#btnDraw").onclick = onDraw;
  $("#btnServe").onclick = onServe;
  $("#btnRotate").onclick = onRotate;
  $("#btnDiscard").onclick = onDiscard;
  $("#btnAgain").onclick = toContainers;
  $("#btnCard").onclick = openCard;
  $("#btnDex").onclick = openDex;
  $("#dexClose").onclick = () => { $("#dexModal").hidden = true; };
  $("#dexModal").onclick = e => { if (e.target.id === "dexModal") $("#dexModal").hidden = true; };
  $("#btnClose").onclick = () => { $("#cardModal").hidden = true; };
  $("#cardModal").onclick = e => { if (e.target.id === "cardModal") $("#cardModal").hidden = true; };
  $("#infoModal").onclick = e => { if (e.target.id === "infoModal") closeInfo(); };
  $("#plate").addEventListener("mouseover", e => { const c = e.target.closest(".cell"); preview(c ? +c.dataset.i : null); });
  $("#plate").addEventListener("mouseleave", () => preview(null));
  const toggleObs = () => document.body.classList.toggle("obs");
  $("#btnObs").onclick = toggleObs;
  if (new URLSearchParams(location.search).has("obs")) document.body.classList.add("obs");
  document.addEventListener("keydown", e => {
    if (e.target.closest("input, textarea")) return;
    if (e.key === "Escape") { $("#cardModal").hidden = true; $("#dexModal").hidden = true; closeInfo(); return; }
    const playing = !$("#screen-play").hidden && $("#infoModal").hidden && $("#dexModal").hidden;
    if (playing && e.code === "Space") { e.preventDefault(); onDraw(); }
    else if (playing && e.code === "Enter") { e.preventDefault(); onServe(); }
    else if (playing && (e.key === "r" || e.key === "R")) onRotate();
    else if (playing && /^[1-9]$/.test(e.key) && +e.key <= CELLS) onPlace(+e.key - 1);
    else if (e.key === "t" || e.key === "T") toggleObs();
  });

  // 預載立繪，換表情不閃
  FACES.forEach(f => { const i = new Image(); i.src = `assets/rein/${f}.webp`; });
  renderMeters();
  renderAlbum();
  say("歡迎光臨。今晚想讓我吃什麼？", "idle");
  show("screen-title");
})();
