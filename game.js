// 餵食零韻・萬聖節 Trick or Treat — 遊戲本體
// 狀態機：title → container（隨機三選一）→ play（抽一樣 → 選格子放下 → 隨機事件，迴圈）→ result → card
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

  // data.js 的 verdict / text 還沒填時的備用台詞；月月填了就會蓋過去
  const FALLBACK = {
    treat: "好吃。這盤我收下了。",
    trick: "⋯⋯不夠。所以，要惡作劇囉。",
    flip: "估價：NT$0。備註：你知道你做了什麼。",
    double_flip: "聚寶盆把鳳梨也複製了。雙倍火葬。",
    rampage: "血條歸零。圖書館今天不營業——你給我站住。",
    instadeath_mandrake: "曼德拉草在盤子上尖叫。零韻聽見了。",
    instadeath_toxic: "瞳孔放大，世界很美。然後就沒有然後了。",
    fire_rat_ignite: "火鼠裘是假的。一燒就著，整盤一起。",
    hawaiian: "⋯⋯今天心情特別好。鳳梨，准了。",
    pizza: "（死魚眼咀嚼）分數給你。心不給。",
    busu_reveal: "標籤寫劇毒，舔起來是砂糖。主人騙人。",
    eternal_oblivion: "永生了。可是⋯⋯我剛剛吃了什麼？",
    discount: name => `${name}⋯⋯為什麼要放${name}。`,
    affectionFull: "⋯⋯謝謝你一直餵我。好感度，滿了。",
    nibble: n => `（零韻趁你不注意，偷吃了「${n}」。）`,
    swap: (a, b) => `盤子晃了一下，「${a}」和「${b}」換了位置。`,
    slide: (a, i) => `盤子晃了一下，「${a}」滑到第 ${i} 格。`,
    priceUp: (n, m) => `「${n}」今天行情好，估價 ×${m}。`,
    priceDown: (n, m) => `「${n}」放久了，估價 ×${m}。`
  };

  const FACES = ["idle", "happy", "angry", "deadpan", "dizzy", "cry", "scared", "meh", "pout", "plain"];

  // ── 小工具 ──
  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const round10 = n => Math.round(n / 10) * 10;
  const money = n => "NT$" + Math.max(0, Math.round(n)).toLocaleString("en-US");
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

  // ── 狀態 ──
  const S = {
    hp: C.maxHp, aff: 0,
    container: null, contName: "",
    grid: [], hand: null, spilled: [], eaten: [], deck: [],
    penalty: 0, turn: 0, busy: false, last: null, uid: 0,
    flags: {}
  };

  // ── 盤面查詢 ──
  const live = x => !!x && !x.vanished;
  const liveItems = () => S.grid.filter(live);
  const full = () => S.grid.every(Boolean);
  const onPlate = id => liveItems().find(x => x.ing.id === id);
  function neighbors(i) {
    const r = Math.floor(i / N), c = i % N, out = [];
    if (r > 0) out.push(i - N);
    if (r < N - 1) out.push(i + N);
    if (c > 0) out.push(i - 1);
    if (c < N - 1) out.push(i + 1);
    return out;
  }
  const around = i => neighbors(i).map(n => S.grid[n]).filter(live);
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
  const mandrakeSafe = x => around(x.cell).some(y => y.ing.tags.includes("dog_tongue"));

  // ── 容器規則說明（由代號＋params 生成） ──
  function ruleText(c) {
    const p = c.params || {};
    switch (c.rule) {
      case "none": return "無特效，新手基本款。";
      case "pineapple_legal": return "全場唯一讓鳳梨合法的容器。零韻會吃，但不給心。";
      case "vanish_one": return `盤子自帶 ${money(c.baseScore)}；送餐時隨機少一件。`;
      case "keep_one_on_fail": return "掀盤或即死時，甕底留下一樣材料。";
      case "need_liquid": return `盤上沒有液體時，每回合扣 ${p.penaltyPerTurn}。`;
      case "duplicate_one": return "送餐時隨機複製一樣材料到空格。複製到什麼，看運氣。";
      case "liquid_only": return `只收液體，液體 ×${p.liquidMultiplier}；其他會灑出去。`;
      case "witch_bonus": return `魔女系材料 ×${p.witchMultiplier}。`;
      case "flip_half": return "掀盤時損失減半。";
      default: return "";
    }
  }

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

  function tokMeta(x, inHand) {
    const ing = x.ing;
    if (x.spilled) return { t: "灑出去了", cls: "off" };
    if (x.vanished) return { t: "第十枚・消失", cls: "off" };
    if (x.neutralized) return { t: "已中和", cls: "off" };
    if (ing.rule === "fake_label" && !x.revealed) return { t: (ing.params && ing.params.label) || "劇毒", cls: "bad" };
    if (ing.rule === "authenticity" && !x.revealed) return { t: "真贗未明", cls: "warn" };
    if (x.fake) return { t: `贗品 ${money(ing.fakePrice)}`, cls: "bad" };
    if (ing.rule === "flip") return { t: S.container.rule === "pineapple_legal" ? money(ing.price) + "・合法" : "地雷", cls: "bad" };
    if (ing.rule === "instadeath") {
      const safe = !inHand && mandrakeSafe(x);
      return { t: safe ? "已處理" : "尖叫中", cls: safe ? "" : "bad" };
    }
    if (ing.rule === "discount") return { t: `隔壁 −${Math.round(ing.params.rate * 100)}%`, cls: "bad" };
    if (ing.rule === "toxic_risk") return { t: `毒性 ${Math.round(ing.params.chance * 100)}%`, cls: "warn" };
    if (inHand) return { t: money(ing.price), cls: "" };
    return { t: money(itemValue(x)), cls: x.used ? "used" : "" };
  }
  function token(x, inHand, isNew) {
    const meta = tokMeta(x, inHand);
    const icon = h("div", { class: "tok-icon" });
    if (x.ing.zone === "normal" || x.ing.zone === "mine") icon.append(h("div", { class: "seal" }, x.ing.name[0]));
    else icon.innerHTML = jarSvg(x.ing);
    return h("div", { class: `tok ${meta.cls}${isNew ? " enter" : ""}`, title: x.ing.lore || x.ing.name },
      icon, h("div", { class: "tok-name" }, x.ing.name + (x.dup ? "（複製）" : "")), h("div", { class: "tok-meta" }, meta.t));
  }

  function renderPlate(newUid, flashCells = []) {
    const plate = $("#plate");
    plate.textContent = "";
    S.grid.forEach((x, i) => {
      const open = !!S.hand && !x && !S.busy;
      const cell = h("button", {
        class: `cell${i === CENTER ? " center" : ""}${open ? " open" : ""}${flashCells.includes(i) ? " flash" : ""}`,
        "data-i": i, "aria-label": `第 ${i + 1} 格`, onclick: () => onPlace(i)
      });
      if (x) cell.append(token(x, false, x.uid === newUid));
      else cell.append(h("span", { class: "num" }, String(i + 1), i === CENTER ? h("small", {}, `主位 ×${C.centerMultiplier}`) : null));
      plate.append(cell);
    });

    const slot = $("#traySlot"); slot.textContent = "";
    if (S.hand) slot.append(token(S.hand, true, true));
    else slot.append(h("span", { class: "tray-empty" }, full() ? "盤子滿了" : "先抽一樣"));
    $("#tray").classList.toggle("active", !!S.hand);
    const busu = S.hand && S.hand.ing.rule === "fake_label";
    $("#btnDiscard").hidden = !busu;
    $("#trayHint").textContent = !S.hand ? "" : busu
      ? `標籤寫著「${(S.hand.ing.params && S.hand.ing.params.label) || "劇毒"}」⋯⋯放哪一格？還是丟掉？`
      : "放到哪一格？（點格子或按 1–9）";

    const est = estimate();
    $("#estimate").textContent = money(est.total) + (est.unknown ? "＋？" : "");
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

  // ── 計分 ──
  function multiplier(x) {
    const c = S.container, p = c.params || {};
    let m = 1;
    if (c.rule === "liquid_only" && x.ing.tags.includes("liquid")) m *= p.liquidMultiplier || 1;
    if (c.rule === "witch_bonus" && x.ing.tags.includes("witch")) m *= p.witchMultiplier || 1;
    return m;
  }
  function itemValue(x) {
    if (!live(x) || x.neutralized) return 0;
    if (x.ing.rule === "flip" && S.container.rule !== "pineapple_legal") return 0;
    let v = x.fake ? (x.ing.fakePrice || 0) : x.ing.price;
    v *= multiplier(x) * (x.priceMult || 1);
    if (x.cell === CENTER) v *= C.centerMultiplier;
    for (const y of around(x.cell)) if (!y.neutralized && y.ing.rule === "discount") v *= 1 - y.ing.params.rate;
    return Math.round(v);
  }
  function score({ hideUnknown = false } = {}) {
    let sum = S.container.baseScore || 0, unknown = 0;
    for (const x of liveItems()) {
      if (hideUnknown && !x.revealed && (x.ing.rule === "authenticity" || x.ing.rule === "fake_label")) { unknown++; continue; }
      sum += itemValue(x);
    }
    const combos = COMBOS.filter(c => c.effect !== "cancel_instadeath" && comboDone(c));
    const bonus = combos.reduce((a, c) => a + (c.bonus || 0), 0);
    const discounts = liveItems().filter(x => !x.neutralized && x.ing.rule === "discount");
    const total = Math.max(0, round10(sum + bonus - S.penalty));
    return { total, sum, bonus, combos, discounts, unknown };
  }
  const estimate = () => score({ hideUnknown: true });

  // ── 抽卡 ──
  function drawFromDeck() {
    if (!S.deck.length) return null;
    const setsOn = new Set(liveItems().map(x => x.ing.zone).filter(z => z.startsWith("set")));
    const count = {};
    for (const i of S.deck) count[i.zone] = (count[i.zone] || 0) + 1;
    const idx = weighted(S.deck, i => (C.zoneWeights[i.zone] || 1) / count[i.zone] * (setsOn.has(i.zone) ? C.setBoost : 1));
    return S.deck.splice(idx, 1)[0];
  }
  const newItem = ing => ({ uid: ++S.uid, ing, cell: -1, fake: false, spilled: false, vanished: false, neutralized: false, used: false, dup: false, revealed: false, priceMult: 1 });

  // 護盾：角粉只救相鄰格（地雷、即死）；鱗片整盤免疫一次（任何失敗）；先用角粉
  function useShield(kind, cell) {
    if (kind !== "fire") {
      const horn = around(cell).find(y => y.ing.rule === "neutralize_once" && !y.used);
      if (horn) { horn.used = true; return horn; }
    }
    const scale = liveItems().find(y => y.ing.rule === "immune_once" && !y.used);
    if (scale) { scale.used = true; return scale; }
    return null;
  }

  function onDraw() {
    if (S.busy || S.hand || full() || !S.deck.length) return;
    S.turn++;
    const x = newItem(drawFromDeck());
    if (x.ing.rule === "authenticity") x.fake = Math.random() < C.fakeChance;
    if (S.container.rule === "liquid_only" && !x.ing.tags.includes("liquid")) {
      x.spilled = true;
      S.spilled.push(x);
      log(`抽到「${x.ing.name}」——不是液體，從骷髏杯邊緣灑出去了。`);
      say("⋯⋯灑了。", "meh");
      afterPlace([]);
      return;
    }
    S.hand = x;
    log(`抽到「${x.ing.name}」。`);
    if (x.ing.rule === "fake_label") say("那、那個罐子寫著劇毒⋯⋯", "scared");
    else if (x.ing.rule === "flip") say("⋯⋯鳳梨。", "angry");
    else if (x.ing.rule === "instadeath" || x.ing.rule === "toxic_risk") say(`${x.ing.name}⋯⋯小心放。`, "scared");
    else setFace("idle");
    renderPlate(); setButtons();
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
    S.busy = true;
    const x = S.hand;
    S.hand = null;
    x.cell = i;
    S.grid[i] = x;
    if (x.ing.rule === "fake_label") S.flags.busuKept = true;
    renderPlate(x.uid); setButtons();
    await sleep(320);
    const fatal = resolvePlacement(x);
    if (fatal) return endRound(fatal);
    await afterPlace([i]);
  }

  async function afterPlace(flash) {
    S.busy = true;
    if (S.container.rule === "need_liquid" && !liveItems().some(x => x.ing.tags.includes("liquid"))) {
      S.penalty += S.container.params.penaltyPerTurn;
      log($("#log").textContent + ` 頭皿乾了，扣 ${S.container.params.penaltyPerTurn}。`);
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
      const sh = useShield("mine", x.cell);
      if (sh) { x.neutralized = true; renderPlate(); say(`${sh.ing.name}生效，鳳梨被中和了。好險。`, "meh"); return null; }
      return { type: "flip", cause: x };
    }
    if (rule === "toxic_risk") {
      const ointment = COMBOS.find(c => c.effect === "float");
      if (ointment && comboDone(ointment)) { say(ointment.verdict || "飛行軟膏完成。", "dizzy"); return null; }
      if (Math.random() < ing.params.chance) {
        const sh = useShield("death", x.cell);
        if (sh) { x.neutralized = true; renderPlate(); say(`${ing.name}的毒發作了——${sh.ing.name}擋下來了。`, "scared"); return null; }
        return { type: "instadeath_toxic", cause: x };
      }
      say(`${ing.name}⋯⋯還好，沒事。`, "scared");
      return null;
    }
    if (rule === "authenticity" && x.fake && ing.params && ing.params.fakeEffect === "self_ignite") {
      x.revealed = true;
      const sh = useShield("fire", x.cell);
      if (sh) { x.neutralized = true; renderPlate(); say(`火鼠裘是贗品，燒起來了！${sh.ing.name}護住了整盤。`, "scared"); return null; }
      return { type: "fire_rat_ignite", cause: x };
    }
    if (rule === "authenticity") { say(`${ing.name}⋯⋯是真的嗎？`, "pout"); return null; }
    if (rule === "instadeath") {
      say(mandrakeSafe(x) ? "旁邊有犬之舌——曼德拉草可以安全處理。" : "曼德拉草在尖叫⋯⋯送餐前得讓它旁邊有犬之舌。", mandrakeSafe(x) ? "happy" : "scared");
      return null;
    }
    if (ing.tags.includes("dog_tongue") && around(x.cell).some(y => y.ing.rule === "instadeath")) { say("犬之舌！隔壁的曼德拉草安全了。", "happy"); return null; }
    if (rule === "discount") { say(`⋯⋯${ing.name}。隔壁的也被嫌棄了。`, "meh"); return null; }
    if (rule === "fake_label") { say("真的放了⋯⋯", "scared"); return null; }
    if (rule === "neutralize_once") { say(`${ing.name}。隔壁格的毒和地雷，它能擋一次。`, "idle"); return null; }
    if (rule === "immune_once") { say(`${ing.name}。整盤可以免疫一次。`, "idle"); return null; }
    const done = COMBOS.find(c => c.requires.includes(ing.id) && c.effect !== "cancel_instadeath" && comboDone(c));
    if (done) { say(`⋯⋯！${done.result}！`, "happy"); return null; }
    if (x.cell === CENTER) say(`${ing.name}放在主位。`, "idle");
    else if (ing.zone !== "normal") say(`${ing.name}⋯⋯`, "idle");
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
      const pool = items.filter(x => !["flip", "instadeath", "fake_label", "toxic_risk"].includes(x.ing.rule));
      if (!pool.length) return;
      const x = pick(pool);
      S.grid[x.cell] = null;
      S.eaten.push(x);
      text = ev.text || FALLBACK.nibble(x.ing.name); face = "happy"; flash = [x.cell];
    } else if (ev.rule === "swap") {
      const a = pick(items);
      const to = pick([...Array(CELLS).keys()].filter(i => i !== a.cell));
      const b = S.grid[to], from = a.cell;
      S.grid[to] = a; a.cell = to;
      S.grid[from] = b || null; if (b) b.cell = from;
      text = ev.text || (b ? FALLBACK.swap(a.ing.name, b.ing.name) : FALLBACK.slide(a.ing.name, to + 1));
      face = "scared"; flash = [from, to];
    } else if (ev.rule === "price_mult") {
      const pool = items.filter(x => !x.neutralized && x.ing.rule !== "flip");
      if (!pool.length) return;
      const x = pick(pool), m = ev.params.mult;
      x.priceMult *= m;
      text = ev.text || (m >= 1 ? FALLBACK.priceUp(x.ing.name, m) : FALLBACK.priceDown(x.ing.name, m));
      face = m >= 1 ? "happy" : "meh"; flash = [x.cell];
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
      const sh = useShield("death", m.cell);
      if (sh) { m.neutralized = true; renderPlate(); say(`曼德拉草尖叫了——${sh.ing.name}擋下來了。`, "scared"); await sleep(1100); }
      else return endRound({ type: "instadeath_mandrake", cause: m });
    }

    if (S.container.rule === "duplicate_one") {
      const empty = [...Array(CELLS).keys()].filter(i => !S.grid[i]);
      const src = pick(liveItems());
      if (!empty.length) { log("聚寶盆想複製，可是盤子滿了。"); await sleep(800); }
      else {
        const copy = { ...src, uid: ++S.uid, dup: true, used: false, cell: pick(empty) };
        S.grid[copy.cell] = copy;
        renderPlate(copy.uid);
        log(`聚寶盆複製了「${src.ing.name}」，放到第 ${copy.cell + 1} 格。`);
        await sleep(900);
        if (src.ing.rule === "flip" && S.container.rule !== "pineapple_legal") {
          const sh = useShield("mine", copy.cell);
          if (sh) { copy.neutralized = true; renderPlate(); say(`又一顆鳳梨⋯⋯${sh.ing.name}擋下來了。`, "meh"); await sleep(900); }
          else return endRound({ type: "flip", cause: copy, double: true });
        }
      }
    }

    if (S.container.rule === "vanish_one") {
      const v = pick(liveItems());
      if (v) { v.vanished = true; renderPlate(); log(`一枚、兩枚⋯⋯第十枚。「${v.ing.name}」不見了。`); await sleep(1000); }
    }

    S.grid.forEach(x => { if (x) x.revealed = true; });
    renderPlate();
    await sleep(500);
    await eatAnimation();

    const sc = score();
    let type;
    if (sc.combos.some(c => c.effect === "ending")) type = "eternal_oblivion";
    else type = sc.total >= C.passLine ? "treat" : "trick";
    endRound({ type, sc });
  }

  // ── 結算 ──
  async function endRound(res) {
    S.busy = true; setButtons();
    const c = S.container;
    const fatal = FATAL.includes(res.type);
    const sc = res.sc || score();
    let total = sc.total, kept = null;

    if (fatal) {
      await fatalAnimation(res);
      if (c.rule === "keep_one_on_fail") {
        kept = liveItems().filter(x => x !== res.cause && itemValue(x) > 0).sort((a, b) => itemValue(b) - itemValue(a))[0] || null;
      }
      total = kept ? itemValue(kept) : 0;
      if (c.rule === "flip_half" && res.type === "flip") total = round10(score().total * (1 - (c.params.flipLossRate || 0.5)));
      S.hp = Math.max(0, S.hp - 1);
    } else if (res.type === "hawaiian") {
      total = C.hawaiianScore;
      await sleep(300);
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
      add(endText("hawaiian")); face = "happy"; stamp = "TREAT";
    } else if (res.type === "eternal_oblivion") {
      const combo = sc.combos.find(x => x.effect === "ending");
      add(combo.verdict || FALLBACK.eternal_oblivion); face = "plain"; stamp = "永生"; stampZh = true;
    } else {
      for (const combo of sc.combos) add(combo.verdict);
      const top = liveItems().filter(x => x.ing.verdict).sort((a, b) => itemValue(b) - itemValue(a))[0];
      if (top) add(top.ing.verdict);
      add(endText(res.type));
      if (res.type === "treat") {
        face = sc.combos.some(x => x.id === "kaguya_set") ? "cry" : sc.combos.some(x => x.effect === "float") ? "dizzy" : "happy";
        stamp = "TREAT";
      } else { face = "pout"; stamp = "TRICK"; stampCls = "fail"; }
    }
    if (!fatal) {
      for (const d of sc.discounts) add(d.ing.verdict || FALLBACK.discount(d.ing.name));
      if (S.flags.busuKept && onPlate("busu_jar")) add(endText("busu_reveal"));
    }
    const pizza = c.rule === "pineapple_legal" && !fatal;
    if (pizza) { add(FALLBACK.pizza); face = "deadpan"; }

    // 成就
    const chips = [];
    if (!fatal) for (const combo of sc.combos) chips.push(combo.result);
    if (res.type === "hawaiian") chips.push("夏威夷結局");
    if (S.contName !== c.name) chips.push(S.contName);
    if (!fatal && S.flags.busuKept && onPlate("busu_jar")) chips.push("附子罐反轉");
    if (kept) chips.push(`甕底留下：${kept.ing.name}`);
    if (rampage) chips.push("零韻暴走");
    recordAlbum(chips);

    // Treat / Trick 演出
    const treat = !fatal && (res.type === "treat" || res.type === "hawaiian" || res.type === "eternal_oblivion");
    let trick = null;
    setFace(face);
    if (treat && !pizza) {
      hearts();
      S.aff = Math.min(C.maxAffection, S.aff + 1);
      if (S.aff === C.maxAffection && !S.flags.affNoted) { S.flags.affNoted = true; add(FALLBACK.affectionFull); chips.push("好感度滿值"); }
    } else if (!treat && !fatal) {
      const n = 1 + Math.floor(Math.random() * D.tricks.length);
      trick = D.tricks.find(t => t.id === n) || { id: n, text: "", anim: "" };
      playTrick(trick);
    }
    if (rampage) await rampageAnimation();
    renderMeters();

    S.last = { type: res.type, fatal, rampage, treat, pizza, total, sc, kept, lines, chips, stamp, stampCls, stampZh, face, trick, double: !!res.double, cause: res.cause };

    // 結算畫面
    const st = $("#resStamp");
    st.textContent = stamp; st.className = "stamp-big" + (stampCls ? " " + stampCls : "") + (stampZh ? " zh" : "");
    $("#resScore").textContent = "";
    $("#resScore").append("估價 ", h("b", {}, money(total)), `　／　達標 ${money(C.passLine)}`);
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
    const toks = [...document.querySelectorAll("#plate .tok:not(.off)")];
    toks.forEach((t, i) => {
      const r = t.getBoundingClientRect();
      t.style.transitionDelay = `${i * 60}ms`;
      t.style.transform = `translate(${target.x - (r.left + r.width / 2)}px, ${target.y - (r.top + r.height / 2)}px) scale(.15)`;
      t.style.opacity = "0";
    });
    await sleep(500 + toks.length * 60);
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
  function hearts() {
    const fx = $("#fx"), sr = $("#stage").getBoundingClientRect();
    for (let i = 0; i < 26; i++) {
      fx.append(h("span", {
        class: "heart",
        style: `left:${sr.width * (.3 + Math.random() * .4)}px;top:${sr.height * (.45 + Math.random() * .2)}px;--dx:${(Math.random() - .5) * sr.width * .8}px;--dy:${-sr.height * (.3 + Math.random() * .4)}px;--d:${Math.random() * .7}s;--s:${16 + Math.random() * 18}px`
      }, "♥"));
    }
    setTimeout(() => fx.textContent = "", 2600);
  }
  async function fatalAnimation(res) {
    const plate = $("#plate");
    const label = res.type === "flip" ? (res.double ? "雙倍火葬" : "掀盤！") : res.type === "fire_rat_ignite" ? "炎上！" : "即死！";
    setFace(res.type === "flip" ? "angry" : res.type === "fire_rat_ignite" ? "scared" : "dizzy");
    if (res.cause) say(`「${res.cause.ing.name}」——`);
    await sleep(300);
    plate.classList.add("flipped");
    document.querySelectorAll("#plate .tok").forEach(t => {
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
    "夏威夷結局", "附子罐反轉",
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
    $("#screen-container").append($("#album"));
    renderAlbum();
    const offer = shuffle(CONTAINERS.slice()).slice(0, Math.max(1, C.containerChoices || CONTAINERS.length));
    const box = $("#containers"); box.textContent = "";
    for (const c of offer) {
      box.append(h("button", { class: "cont", onclick: () => startRound(c) },
        h("span", { class: "cont-name" }, c.name),
        h("span", { class: "cont-rule" }, ruleText(c)),
        c.lore ? h("span", { class: "cont-lore" }, c.lore) : null));
    }
    say(offer.length > 1 ? "今晚端出來的是這幾個。挑一個吧。" : "今晚就用這個。", "idle");
    show("screen-container");
  }
  function startRound(c) {
    S.container = c;
    S.contName = c.params && c.params.skinChance && Math.random() < c.params.skinChance ? c.params.skinName : c.name;
    S.grid = Array(CELLS).fill(null); S.hand = null; S.spilled = []; S.eaten = [];
    S.deck = D.ingredients.slice(); S.penalty = 0; S.turn = 0; S.busy = false;
    S.flags = { affNoted: S.flags.affNoted };
    $("#contName").textContent = S.contName;
    $("#contRule").textContent = ruleText(c);
    log(S.contName !== c.name ? `⋯⋯咦？南瓜盅變成了${S.contName}。好復古。` : `盤子有 ${CELLS} 格。中央是主位。`);
    renderPlate(); setButtons();
    say(c.rule === "pineapple_legal" ? "⋯⋯披薩啊。" : "開始吧。我等著。", c.rule === "pineapple_legal" ? "deadpan" : "idle");
    show("screen-play");
  }

  // ── 證書 ──
  function dishName(L) {
    const coll = L.sc.combos.find(c => c.effect === "collection" || c.effect === "ending");
    if (coll && !L.fatal) return coll.result;
    const items = liveItems().filter(x => !x.dup).sort((a, b) => itemValue(b) - itemValue(a) || b.ing.price - a.ing.price);
    const a = items[0], b = items[1];
    let n = a ? (b ? `${a.ing.name}佐${b.ing.name}` : a.ing.name) : "空氣";
    n += `・${S.contName}仕立`;
    if (L.type === "flip") n = `被掀翻的${n}`;
    else if (L.fatal) n = `來不及上桌的${n}`;
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
      const name = x.ing.name + (x.fake ? "（贗品）" : "") + (x.dup ? "（複製）" : "") + (tag || "");
      return h("div", { class: "c-row" + (off ? " off" : "") }, h("span", { class: "n" }, name, sup ? h("sup", {}, sup) : null), h("span", { class: "p" }, p));
    };
    const rows = [];
    S.grid.forEach(x => {
      if (!x) return;
      let p, off = false;
      if (x.vanished) { p = "消失"; off = true; }
      else if (x.neutralized) { p = "中和"; off = true; }
      else if (L.fatal && x !== L.kept) { p = "—"; off = true; }
      else if (x.ing.rule === "flip" && S.container.rule !== "pineapple_legal") p = L.type === "hawaiian" ? "最高分" : "地雷";
      else p = money(itemValue(x));
      rows.push(row(x, p, off, (x.cell === CENTER ? "（主位）" : "") + (x === L.kept ? "（甕底）" : "")));
    });
    S.eaten.forEach(x => rows.push(row(x, "偷吃", true)));
    S.spilled.forEach(x => rows.push(row(x, "灑出", true)));
    if (!L.fatal) {
      for (const combo of L.sc.combos) if (combo.bonus) rows.push(h("div", { class: "c-row extra" }, h("span", { class: "n" }, `組合：${combo.result}`), h("span", { class: "p" }, "+" + money(combo.bonus))));
      if (S.penalty) rows.push(h("div", { class: "c-row extra" }, h("span", { class: "n" }, "頭皿乾涸"), h("span", { class: "p" }, "−" + money(S.penalty))));
      if (S.container.baseScore) rows.push(h("div", { class: "c-row extra" }, h("span", { class: "n" }, `${S.contName}基礎分`), h("span", { class: "p" }, "+" + money(S.container.baseScore))));
    }
    const listCls = "c-list" + (rows.length > 9 ? " two" : "");
    const shown = rows.length > 24 ? rows.slice(0, 23).concat(h("div", { class: "c-row extra" }, h("span", { class: "n" }, `⋯⋯另有 ${rows.length - 23} 項`))) : rows;

    if (S.container.lore && notes.length < 4) notes.push({ name: S.contName, lore: S.container.lore });

    el.append(
      h("div", { class: "c-head" },
        h("div", { class: "c-en" }, "Certificate of Halloween Culinary Appraisal"),
        h("div", { class: "c-title" }, "萬聖節料理鑑定證書"),
        h("div", { class: "c-no" }, h("span", {}, serial), h("span", {}, "月上零韻圖書館餐廳"), h("span", {}, date))),
      h("div", { class: "c-dish" }, dishName(L)),
      h("div", { class: "c-cont" }, `器：${S.contName}　｜　上盤 ${S.grid.filter(Boolean).length} / ${CELLS} 格`),
      h("div", { class: listCls }, shown),
      h("div", { class: "c-total" },
        h("span", { class: "l" }, "鑑定估值"),
        h("span", { class: "pl" }, `達標線 ${money(C.passLine)}`),
        h("span", { class: "v" }, money(L.total))),
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
  $("#btnDiscard").onclick = onDiscard;
  $("#btnAgain").onclick = toContainers;
  $("#btnCard").onclick = openCard;
  $("#btnClose").onclick = () => { $("#cardModal").hidden = true; };
  $("#cardModal").onclick = e => { if (e.target.id === "cardModal") $("#cardModal").hidden = true; };
  const toggleObs = () => document.body.classList.toggle("obs");
  $("#btnObs").onclick = toggleObs;
  if (new URLSearchParams(location.search).has("obs")) document.body.classList.add("obs");
  document.addEventListener("keydown", e => {
    if (e.target.closest("input, textarea")) return;
    const playing = !$("#screen-play").hidden;
    if (playing && e.code === "Space") { e.preventDefault(); onDraw(); }
    else if (playing && e.code === "Enter") { e.preventDefault(); onServe(); }
    else if (playing && /^[1-9]$/.test(e.key) && +e.key <= CELLS) onPlace(+e.key - 1);
    else if (e.key === "t" || e.key === "T") toggleObs();
    else if (e.key === "Escape") $("#cardModal").hidden = true;
  });
  document.querySelectorAll(".passline").forEach(el => el.textContent = money(C.passLine));

  // 預載立繪，換表情不閃
  FACES.forEach(f => { const i = new Image(); i.src = `assets/rein/${f}.webp`; });
  renderMeters();
  renderAlbum();
  say("歡迎光臨。今晚想讓我吃什麼？", "idle");
  show("screen-title");
})();
