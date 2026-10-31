// 餵食零韻・萬聖節 Trick or Treat — 遊戲本體
// 狀態機：title → container（隨機要求＋容器三選一）→ play（抽一樣 → 零韻的手左右擺盪，看準時機撒下 → 重力堆疊、同系列相碰合體 → 隨機事件，迴圈）→ result → card
// 分數 = 色香味星數 × 占格數 × 各種倍率（五行生剋、容器、嫌棄、行情、合體）；不能吃的東西算擺盤裝飾，色加星。
// 所有文字與數值讀 data.js；這裡只寫規則代號的行為。
(() => {
  "use strict";

  const D = window.GAME_DATA;
  const C = D.config;
  const COLS = C.cols || 4, ROWS = C.rows || 4, CELLS = COLS * ROWS;
  const GAP = 6; // 要跟 style.css 的 .plate / .pieces gap 一致
  const CONTAINERS = D.containers.filter(c => c.enabled !== false);
  const COMBOS = D.combos.filter(c => c.enabled !== false);
  const ENDING = Object.fromEntries(D.endings.map(e => [e.id, e]));
  const FATAL = ["flip", "spill", "instadeath_toxic", "instadeath_mandrake", "fire_rat_ignite"];
  const RARITIES = C.rarities || [{ id: "R", weight: 1, size: 1, starUp: 0, prefix: "" }];
  const RAR_ORDER = RARITIES.map(r => r.id);
  const AXES = ["色", "香", "味"];
  const ZONES = { normal: "正常食材", mine: "地雷", setA: "套裝・葛萊普尼爾", setB: "套裝・竹取五難題", setC: "套裝・飛行軟膏", loose: "散裝魔幻", special: "特殊罐" };
  const ING_BY_ID = Object.fromEntries(D.ingredients.map(i => [i.id, i]));
  const SET_ZONES = ["setA", "setB", "setC"];
  const SET_NAME = Object.fromEntries(SET_ZONES.map(z => [z, ZONES[z].replace("套裝・", "")]));
  // 每個套裝對應的組合技（成員全屬同一區的那個）
  const SET_COMBO = Object.fromEntries(SET_ZONES.map(z => [z, COMBOS.find(c => c.requires.every(id => ING_BY_ID[id] && ING_BY_ID[id].zone === z))]));
  const isSetCombo = c => Object.values(SET_COMBO).includes(c);

  // 五行：GEN[a] = a 所生；KE[a] = a 所剋
  const GEN = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
  const KE = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };
  const inverse = m => Object.fromEntries(Object.entries(m).map(([a, b]) => [b, a]));
  const GEN_BY = inverse(GEN), KE_BY = inverse(KE);

  // 各尺寸的形狀（列, 欄）；抽到時隨機定一個方向，不能轉
  const SHAPES = {
    1: [[[0, 0]]],
    2: [[[0, 0], [0, 1]], [[0, 0], [1, 0]]],
    3: [[[0, 0], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0]], [[0, 0], [0, 1], [1, 1]], [[0, 1], [1, 0], [1, 1]]],
    4: [[[0, 0], [0, 1], [1, 0], [1, 1]]]
  };
  const shapeW = sh => Math.max(...sh.map(s => s[1])) + 1;

  // 材料效果說明（詳情視窗用，由規則代號生成）
  function effectText(ing) {
    const p = ing.params || {};
    const parts = [];
    switch (ing.rule) {
      case "flip": parts.push("落盤即掀盤。只有披薩上合法。"); break;
      case "discount": parts.push(`嫌棄傳染：相鄰材料分數 −${Math.round(p.rate * 100)}%。`); break;
      case "authenticity": parts.push("真贗未明，送餐時揭曉。贗品色香味全無" + (p.fakeEffect === "self_ignite" ? "，而且一落盤就會燒起來。" : "。")); break;
      case "toxic_risk": parts.push(`落盤時有 ${Math.round(p.chance * 100)}% 機率毒發即死。`); break;
      case "instadeath": parts.push("送餐時旁邊沒有犬之舌，就會尖叫致死。"); break;
      case "neutralize_once": parts.push("相鄰格的毒或地雷，可以中和一次。"); break;
      case "immune_once": parts.push("整盤免疫一次失敗（打翻也擋得住）。"); break;
      case "fake_label": parts.push(`標籤寫著「${p.label || "劇毒"}」。抽到時可以選擇丟掉。`); break;
    }
    if (ing.tags.includes("dog_tongue")) parts.push("裡面好像有犬之舌。");
    if (ing.tags.includes("inedible")) parts.push(`不能吃，但很好看：擺盤裝飾，色 +${C.decorBonus} 星。`);
    return parts.join("");
  }

  // 組合條件說明（詳情視窗用）：這樣材料參與的每個組合技一行
  function comboLines(ing) {
    return COMBOS.filter(c => c.requires.includes(ing.id)).map(c => {
      const others = c.requires.filter(id => id !== ing.id).map(id => (ING_BY_ID[id] || { name: id }).name);
      const extra = [c.requireGenuine ? "全須真品" : "", c.bonus ? `+${c.bonus} 分` : ""].filter(Boolean).join("，");
      const tail = ` → ${c.result}${extra ? `（${extra}）` : ""}`;
      if (!isSetCombo(c)) return `與「${others.join("」「")}」相鄰連成一塊${tail}`;
      if (c.requires.length >= 5) return `同系列相碰就合體；湊齊「${others.join("」「")}」同盤，散落的會自己飛過來${tail}`;
      return `同系列相碰就合體；跟「${others.join("」「")}」合成一塊${tail}`;
    });
  }

  // data.js 的 verdict / text 還沒填時的備用台詞；月月填了就會蓋過去
  const FALLBACK = {
    treat: "好吃。這盤我收下了。",
    great: "⋯⋯！超好吃。可以再一盤嗎？",
    legend: "這是⋯⋯傳說級的料理。今晚的事，零韻會記一輩子。",
    trick: "⋯⋯不夠。所以，要惡作劇囉。",
    flip: "鑑定：0 分。備註：你知道你做了什麼。",
    spill: "堆太高了。整盤打翻，地板吃得比我還飽。",
    double_flip: "聚寶盆把鳳梨也複製了。雙倍火葬。",
    rampage: "血條歸零。圖書館今天不營業——你給我站住。",
    instadeath_mandrake: "曼德拉草在盤子上尖叫。零韻聽見了。",
    instadeath_toxic: "瞳孔放大，世界很美。然後就沒有然後了。",
    fire_rat_ignite: "火鼠裘是假的。一燒就著，整盤一起。",
    hawaiian: "⋯⋯今天心情特別好。鳳梨，准了。",
    pizza: "（死魚眼咀嚼）分數給你。心不給。",
    busu_reveal: "標籤寫劇毒，舔起來是砂糖。主人騙人。",
    eternal_oblivion: "永生了。可是⋯⋯我剛剛吃了什麼？",
    decor: name => `${name}⋯⋯不能吃。但擺在盤上，滿好看的。`,
    discount: name => `${name}⋯⋯為什麼要放${name}。`,
    affectionFull: "⋯⋯謝謝你一直餵我。好感度，滿了。",
    nibble: n => `（零韻趁你不注意，偷吃了「${n}」。）`,
    shake: n => `盤子晃了一下，「${n}」滾到別的地方去了。`,
    fresh: (n, m) => `「${n}」今天特別新鮮，分數 ×${m}。`,
    stale: (n, m) => `「${n}」放久了，分數 ×${m}。`,
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
  const prod = f => f.reduce((a, [, v]) => a * v, 1);
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // 觸控為主的裝置（手機、平板）：不能點盤子撒，靠機台按鈕；支援的話按下去會震一下（iPhone 瀏覽器不支援）
  const COARSE = matchMedia("(pointer: coarse)").matches;
  const buzz = p => { try { if (!S.sim && navigator.vibrate) navigator.vibrate(p); } catch (e) { /* 不支援就算了 */ } };
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
      else if (k === "html") el.innerHTML = v;
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

  // ── 音效：全部用 Web Audio 現場合成，不載音檔（沒有授權問題，檔案也不會變大） ──
  // 音高走小調五聲音階，連擊越高 Perfect 的鈴聲越高
  const SOUND_KEY = "rein-halloween-sound";
  const SFX = (() => {
    let ctx = null, master = null, noiseBuf = null, on = store.get(SOUND_KEY, true);
    function ac() {
      if (!ctx) {
        const A = window.AudioContext || window.webkitAudioContext;
        if (!A) return null;
        ctx = new A();
        master = ctx.createGain(); master.gain.value = .55; master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }
    // 一個音：波形、起訖頻率、起音與衰減
    function tone({ type = "sine", f, f2, t = 0, dur = .2, vol = .3, attack = .005 }) {
      const c = ac(); if (!c) return;
      const t0 = c.currentTime + t, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
      g.gain.setValueAtTime(.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
      g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
      o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + .05);
    }
    // 一段濾過的雜訊：碰撞、碎裂、風切
    function noise({ t = 0, dur = .15, vol = .3, type = "lowpass", f = 800, f2, q = 1 }) {
      const c = ac(); if (!c) return;
      const t0 = c.currentTime + t, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
      s.buffer = noiseBuf; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t0);
      if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
      g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
      s.connect(fl).connect(g).connect(master); s.start(t0, Math.random() * .5); s.stop(t0 + dur + .05);
    }
    const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27];
    const note = n => 440 * Math.pow(2, PENTA[Math.max(0, Math.min(n, PENTA.length - 1))] / 12);
    const SOUNDS = {
      press: () => tone({ type: "square", f: 1500, f2: 800, dur: .035, vol: .045 }),
      hang: () => { tone({ type: "triangle", f: 2400, dur: .06, vol: .05 }); tone({ type: "triangle", f: 3100, t: .05, dur: .05, vol: .035 }); },
      land: n => { const k = Math.min(n, 4); tone({ f: 160 - k * 20, f2: 42, dur: .16 + k * .05, vol: .55 }); noise({ dur: .07 + k * .03, vol: .16 + k * .05, f: 1000 - k * 150 }); },
      perfect: combo => { const f = note(combo + 2); tone({ type: "triangle", f, dur: .55, vol: .2 }); tone({ f: f * 2, dur: .35, vol: .07 }); tone({ type: "triangle", f, t: .14, dur: .45, vol: .06 }); },
      good: () => tone({ type: "triangle", f: note(0), dur: .22, vol: .12 }),
      miss: () => { tone({ type: "triangle", f: 300, f2: 110, dur: .32, vol: .14 }); noise({ dur: .12, vol: .08, f: 500 }); },
      fuse: () => [0, 2, 4].forEach((n, i) => tone({ type: "triangle", f: note(n + 3), t: i * .07, dur: .32, vol: .13 })),
      complete: () => { [0, 2, 4, 5, 7].forEach((n, i) => tone({ type: "triangle", f: note(n + 2), t: i * .08, dur: .55, vol: .14 })); tone({ f: note(0) / 2, t: .4, dur: 1.1, vol: .16 }); },
      scatter: () => { noise({ dur: .32, vol: .32, type: "highpass", f: 1500 }); noise({ t: .04, dur: .3, vol: .2, type: "bandpass", f: 3200, f2: 500, q: 3 }); tone({ type: "square", f: 150, f2: 55, dur: .22, vol: .05 }); },
      spin: () => noise({ dur: .32, vol: .2, type: "bandpass", f: 350, f2: 2600, q: 4 }),
      boing: () => { tone({ f: 160, f2: 480, dur: .14, vol: .2 }); tone({ f: 480, f2: 220, t: .13, dur: .2, vol: .14 }); },
      lever: () => { [0, .05, .1].forEach(t => noise({ t, dur: .03, vol: .22, type: "bandpass", f: 2200, q: 6 })); tone({ f: 120, f2: 55, t: .14, dur: .2, vol: .45 }); },
      treat: () => [0, 4, 7, 12].forEach((s, i) => tone({ type: "triangle", f: 523.25 * Math.pow(2, s / 12), t: i * .1, dur: .7, vol: .13 })),
      trick: () => { [0, -1, -6].forEach((s, i) => tone({ type: "triangle", f: 392 * Math.pow(2, s / 12), t: i * .28, dur: .5, vol: .15 })); tone({ f: 98, t: .56, dur: 1.2, vol: .2 }); },
      fatal: () => { noise({ dur: .7, vol: .5, f: 700, f2: 70 }); tone({ f: 85, f2: 30, dur: .9, vol: .5 }); }
    };
    return {
      play(k, ...a) { if (!on || S.sim) return; try { SOUNDS[k](...a); } catch (e) { /* 舊瀏覽器沒有 Web Audio */ } },
      unlock() { if (on) ac(); },
      get on() { return on; },
      toggle() { on = !on; store.set(SOUND_KEY, on); if (on) { ac(); SOUNDS.press(); } return on; }
    };
  })();

  // ── 打擊感：震盤、碎屑、連擊牌 ──
  function shake(el, px) {
    if (S.sim || REDUCED || !el) return;
    const k = [1, -.75, .5, -.28, .12, 0];
    el.animate(k.map((m, i) => ({ transform: `translate(${m * px * (i % 2 ? .35 : -.35)}px, ${m * px}px)` })), { duration: 220 + px * 10, easing: "linear" });
  }
  // 從某個矩形噴出小碎屑；up＝往上噴的力道
  function burst(r, { n = 8, color = "#d8cdb8", spread = 50, up = 22, size = 5, dur = 520, from = "bottom" } = {}) {
    if (S.sim || REDUCED || !r) return;
    const ov = $("#overlay");
    for (let i = 0; i < n; i++) {
      const x = r.left + Math.random() * r.width, y = from === "bottom" ? r.bottom - 3 : r.top + Math.random() * r.height;
      const p = h("div", { class: "spark", style: `left:${x}px;top:${y}px;width:${size}px;height:${size}px;background:${color};` });
      ov.append(p);
      const dx = (Math.random() - .5) * spread * 2, dy = -up * (.4 + Math.random());
      p.animate([{ transform: "translate(-50%, -50%) scale(1)", opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.2)`, opacity: 0 }],
        { duration: dur * (.7 + Math.random() * .6), easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" }).finished.then(() => p.remove(), () => p.remove());
    }
  }
  // 落地那一下：按大小震盤、噴灰；Perfect 再閃光加一圈光環
  function impact(x, q) {
    if (S.sim) return;
    const parts = pieceEls(x.uid), el = anchorEl(x.uid);
    const r = el && el.getBoundingClientRect();
    shake($("#plate"), 3 + x.cells.length * 1.6 + (q === "perfect" ? 3 : 0));
    burst(r, { n: 6 + x.cells.length * 3, spread: 30 + x.cells.length * 12 });
    if (q !== "perfect" || !r || REDUCED) return;
    parts.forEach(p => p.animate([{ filter: "brightness(2.2)", transform: "scale(1.1)" }, { filter: "none", transform: "none" }], { duration: 300, easing: "ease-out" }));
    burst(r, { n: 10, color: "#e8862f", spread: 70, up: 40, size: 6, dur: 650 });
    const d = Math.max(r.width, r.height);
    const ring = h("div", { class: "ring", style: `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;width:${d}px;height:${d}px;` });
    $("#overlay").append(ring);
    ring.animate([{ transform: "translate(-50%, -50%) scale(.6)", opacity: .9 }, { transform: "translate(-50%, -50%) scale(1.7)", opacity: 0 }], { duration: 480, easing: "ease-out", fill: "forwards" }).finished.then(() => ring.remove(), () => ring.remove());
  }
  // 連擊牌：連擊 2 以上掛在盤子右上角，越高越大越亮；斷掉時掉下去
  function comboBadge(prev) {
    if (S.sim) return;
    const b = $("#comboBadge");
    b.getAnimations().forEach(a => a.cancel());
    if (S.combo > 1) {
      b.hidden = false; b.textContent = "";
      b.className = "combo-badge lv" + Math.min(S.combo, 5);
      b.append(h("small", {}, "COMBO"), h("b", {}, "×" + S.combo));
      b.animate([{ transform: "scale(1.7) rotate(-8deg)", opacity: .3 }, { transform: "scale(.92)", offset: .6 }, { transform: "none", opacity: 1 }], { duration: 340, easing: "ease-out" });
    } else if (prev > 1) {
      b.hidden = false; b.textContent = "連擊中斷"; b.className = "combo-badge broken";
      b.animate([{ opacity: 1, transform: "none" }, { opacity: 1, transform: "none", offset: .4 }, { opacity: 0, transform: "translateY(18px) rotate(10deg)" }], { duration: 1100, fill: "forwards" })
        .finished.then(() => { if (S.combo <= 1) b.hidden = true; }, () => {});
    } else b.hidden = true;
  }
  // 分數滾動：變多跳一下，變少閃紅
  let shownScore = 0;
  function showScore(est) {
    const el = $("#estimate"), to = est.total, suf = est.unknown ? "＋？" : "";
    if (to === shownScore || REDUCED) { shownScore = to; el.textContent = to + suf; return; }
    const from = shownScore, t0 = performance.now();
    shownScore = to;
    el.getAnimations().forEach(a => a.cancel());
    el.animate(to > from
      ? [{ transform: "scale(1.45)", color: "#ffe2a0" }, { transform: "none" }]
      : [{ transform: "translateX(-4px)", color: "#ec8f8f" }, { transform: "translateX(3px)", offset: .3 }, { transform: "none" }], { duration: 420, easing: "ease-out" });
    const step = now => {
      if (shownScore !== to) return;
      const k = Math.min(1, (now - t0) / 450);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))) + suf;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function starsEl(n, max = 3) {
    const full = Math.max(0, Math.min(max, Math.round(n)));
    return h("span", { class: "stars" }, "★".repeat(full), h("span", { class: "dim" }, "☆".repeat(max - full)));
  }
  const MOUSE = { x: innerWidth / 2, y: innerHeight / 2 };
  addEventListener("mousemove", e => { MOUSE.x = e.clientX; MOUSE.y = e.clientY; }, { passive: true });

  // ── 狀態 ──
  const S = {
    hp: C.maxHp, aff: 0,
    container: null, contName: "", req: null,
    grid: [], hand: null, eaten: [], dropped: [], scattered: [], deck: [], spilled: null,
    penalty: 0, turn: 0, combo: 0, busy: false, last: null, uid: 0,
    flags: {}, sim: false
  };

  // ── 盤面查詢 ──
  const live = x => !!x && !x.vanished;
  const liveItems = () => [...new Set(S.grid.filter(live))];
  const allItems = () => [...new Set(S.grid.filter(Boolean))];
  const isGroup = x => !!x.members;
  const members = x => x.members || [x];
  const allMembers = () => liveItems().flatMap(members);
  const zoneOf = x => isGroup(x) ? x.members[0].ing.zone : x.ing.zone;
  const holderOf = m => liveItems().find(y => members(y).includes(m)) || m;
  const onPlate = id => allMembers().find(m => m.ing.id === id && !m.neutralized);
  const rc = i => [Math.floor(i / COLS), i % COLS];
  const topFull = () => [...Array(COLS).keys()].every(c => S.grid[c]);
  // 最高那欄堆到第幾層（0 = 空盤，ROWS = 頂到盤緣）
  function stackHeight() {
    let top = ROWS;
    S.grid.forEach((x, i) => { if (x) top = Math.min(top, rc(i)[0]); });
    return ROWS - top;
  }
  function neighbors(i) {
    const [r, c] = rc(i), out = [];
    if (r > 0) out.push(i - COLS);
    if (r < ROWS - 1) out.push(i + COLS);
    if (c > 0) out.push(i - 1);
    if (c < COLS - 1) out.push(i + 1);
    return out;
  }
  // 與某材料相鄰的其他材料（多格材料取所有格的鄰格）
  function around(x) {
    const out = new Set();
    for (const i of x.cells) for (const n of neighbors(i)) { const y = S.grid[n]; if (live(y) && y !== x) out.add(y); }
    return [...out];
  }
  // 組合技：套裝看合體後的那一塊；其他小組合要相鄰連成一塊
  function comboDone(c) {
    const ok = m => !m.neutralized && !(c.requireGenuine && m.fake && m.revealed);
    if (isSetCombo(c)) return liveItems().some(x => isGroup(x) && c.requires.every(id => x.members.some(m => m.ing.id === id && ok(m))));
    const need = new Set(c.requires);
    const cells = [];
    S.grid.forEach((x, i) => { if (live(x) && !isGroup(x) && need.has(x.ing.id) && ok(x)) cells.push(i); });
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
  const ointmentDone = () => { const o = COMBOS.find(c => c.effect === "float"); return !!(o && comboDone(o)); };
  const mandrakeSafe = x => around(x).some(y => members(y).some(m => m.ing.tags.includes("dog_tongue")));
  const isLiquid = x => members(x).some(m => m.ing.tags.includes("liquid") || m.juiced);
  const elementOf = x => x.juiced ? "水" : x.ing.element;
  // 標題畫面開圖鑑時還沒選容器
  const cont = () => S.container || { rule: "none", params: {} };

  // ── 落盤與重力 ──
  // 形狀從盤子上方掉進第 col 欄，回傳停住時的列（可能是負的＝凸出盤緣）
  function landingRow(shape, col) {
    const fits = r => shape.every(([a, b]) => {
      const R = r + a, Cc = col + b;
      if (Cc < 0 || Cc >= COLS || R >= ROWS) return false;
      return R < 0 || !S.grid[R * COLS + Cc];
    });
    let r = -(Math.max(...shape.map(s => s[0])) + 1);
    while (fits(r + 1)) r++;
    return r;
  }
  function placeAt(x, col) {
    const r = landingRow(x.shape, col);
    const cells = x.shape.map(([a, b]) => [r + a, col + b]);
    x.cells = cells.filter(([R]) => R >= 0).map(([R, Cc]) => R * COLS + Cc).sort((a, b) => a - b);
    x.cells.forEach(i => { S.grid[i] = x; });
    return x.cells.length < cells.length;
  }
  // 懸空的材料整塊往下掉，直到全部站穩；回傳有移動的
  function settle() {
    const moved = new Set();
    for (let any = true; any;) {
      any = false;
      for (const x of liveItems().sort((a, b) => Math.max(...b.cells) - Math.max(...a.cells))) {
        const own = new Set(x.cells);
        if (!x.cells.every(i => rc(i)[0] + 1 < ROWS && (!S.grid[i + COLS] || own.has(i + COLS)))) continue;
        x.cells.forEach(i => { S.grid[i] = null; });
        x.cells = x.cells.map(i => i + COLS);
        x.cells.forEach(i => { S.grid[i] = x; });
        moved.add(x); any = true;
      }
    }
    return [...moved];
  }
  const bounce = (col, w) => Math.random() < C.bounceChance ? Math.max(0, Math.min(COLS - w, col + pick([-1, 1]))) : col;

  // ── 五行相剋 ──
  // 被兩件以上相鄰材料剋到的散掉；只被一件剋到的被撞得轉個方向（合體塊不受影響）
  // 同一對剋只發作一次；散掉、轉向之後重力讓上面的掉下來，可能接著連鎖
  function wuxingStep() {
    const gone = [], turned = [];
    for (const y of liveItems()) {
      if (isGroup(y)) continue;
      const src = relations(y).filter(r => r.kind === "剋").map(r => r.y);
      const seen = y.keSeen || (y.keSeen = new Set());
      const fresh = src.filter(s => !seen.has(s.uid));
      if (!fresh.length) continue;
      fresh.forEach(s => seen.add(s.uid));
      if (src.length >= 2) gone.push({ y, src });
      else turned.push({ y, by: src[0] });
    }
    for (const { y } of gone) { y.cells.forEach(i => { S.grid[i] = null; }); y.cells = []; S.scattered.push(y); }
    for (const t of turned) t.spun = spin(t.y);
    return { gone, turned, moved: settle() };
  }
  // 原地轉成別的方向：底部對齊、優先留在原欄，卡住就轉不動
  function spin(y) {
    const others = shuffle(y.shapes.filter(s => s !== y.shape));
    const rs = y.cells.map(i => rc(i)[0]), cs = y.cells.map(i => rc(i)[1]);
    const bottom = Math.max(...rs), c0 = Math.min(...cs), own = new Set(y.cells);
    for (const s of others) {
      const top = bottom - Math.max(...s.map(p => p[0])), ws = shapeW(s);
      for (const col of [c0, ...shuffle([c0 - 1, c0 + 1])]) {
        if (col < 0 || col + ws > COLS || top < 0) continue;
        const cells = s.map(([a, b]) => (top + a) * COLS + col + b);
        if (cells.some(i => S.grid[i] && !own.has(i))) continue;
        y.cells.forEach(i => { S.grid[i] = null; });
        y.shape = s; y.cells = cells.sort((a, b) => a - b);
        y.cells.forEach(i => { S.grid[i] = y; });
        return true;
      }
    }
    return false;
  }

  // ── 合體 ──
  function refreshGroup(g) {
    const ms = g.members, zone = ms[0].ing.zone, combo = SET_COMBO[zone];
    const ids = new Set(ms.map(m => m.ing.id));
    const need = combo ? combo.requires.length : ms.length;
    const els = {};
    for (const m of ms) els[elementOf(m)] = (els[elementOf(m)] || 0) + 1;
    const element = Object.entries(els).sort((a, b) => b[1] - a[1])[0][0];
    g.combo = combo;
    g.complete = !!combo && combo.requires.every(id => ids.has(id));
    g.ing = {
      id: "group_" + zone, zone, element, rule: null, lore: "", verdict: "",
      name: g.complete ? combo.result : `${SET_NAME[zone]}（${ids.size}/${need}）`,
      tags: [...new Set(ms.flatMap(m => m.ing.tags))].filter(t => t !== "inedible" && t !== "toxic")
    };
    const best = ms.reduce((a, m) => RAR_ORDER.indexOf(m.rar.id) > RAR_ORDER.indexOf(a.rar.id) ? m : a);
    g.rar = { id: best.rar.id, size: g.cells.length, prefix: "" };
    g.stars = [0, 1, 2].map(k => ms.reduce((a, m) => a + (m.fake && m.revealed ? 0 : m.stars[k]), 0));
    g.revealed = ms.every(m => m.revealed || m.ing.rule !== "authenticity");
  }
  // parts 合成一個合體塊；有現成的合體塊就沿用它（uid 不變，動畫才接得上）
  function groupOf(parts) {
    const base = parts.find(isGroup);
    const g = base || { uid: ++S.uid, members: [], cells: [], priceMult: 1, used: false, vanished: false, neutralized: false, dup: false, juiced: false, fake: false, revealed: false };
    g.members = [...new Set(parts.flatMap(members))];
    g.cells = [...new Set(parts.flatMap(p => p.cells))].sort((a, b) => a - b);
    g.cells.forEach(i => { S.grid[i] = g; });
    refreshGroup(g);
    return g;
  }
  function fuseOnce() {
    for (const x of liveItems()) {
      if (x.neutralized || !SET_ZONES.includes(zoneOf(x))) continue;
      const y = around(x).find(y => !y.neutralized && zoneOf(y) === zoneOf(x));
      if (y) return groupOf([x, y]);
    }
    return null;
  }
  // 大套裝成員全在盤上時，散落的飛到最大那塊合體
  function absorbBigSets() {
    const out = [];
    for (const [zone, combo] of Object.entries(SET_COMBO)) {
      if (!combo || combo.requires.length < 5) continue;
      const holders = liveItems().filter(x => !x.neutralized && zoneOf(x) === zone);
      const ids = new Set(holders.flatMap(members).filter(m => !m.neutralized).map(m => m.ing.id));
      if (holders.length < 2 || !combo.requires.every(id => ids.has(id))) continue;
      const main = holders.sort((a, b) => b.cells.length - a.cells.length)[0];
      const g = isGroup(main) ? main : groupOf([main]);
      for (const y of holders) {
        if (y === main) continue;
        y.cells.forEach(i => { S.grid[i] = null; });
        g.members.push(...members(y));
        out.push({ from: y, to: g });
      }
      g.members = [...new Set(g.members)];
      refreshGroup(g);
    }
    return out;
  }
  // 合體 → 吸收 → 重力，重複到盤面穩定
  function fuseStep() {
    const before = new Set(liveItems().filter(x => x.complete).map(x => x.uid));
    const out = { fused: new Set(), absorbed: [], moved: new Set() };
    for (let guard = 0; guard < 30; guard++) {
      let changed = false, g;
      while ((g = fuseOnce())) { out.fused.add(g); changed = true; }
      const ab = absorbBigSets();
      if (ab.length) { out.absorbed.push(...ab); ab.forEach(a => out.fused.add(a.to)); changed = true; }
      const mv = settle();
      if (mv.length) { mv.forEach(m => out.moved.add(m)); changed = true; }
      if (!changed) break;
    }
    const alive = new Set(liveItems());
    out.fused = [...out.fused].filter(g => alive.has(g));
    out.completed = out.fused.filter(g => g.complete && !before.has(g.uid));
    return out;
  }

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
      case "keep_one_on_fail": return "掀盤、打翻或即死時，甕底留下一樣材料。";
      case "need_liquid": return `盤上沒有液體時，每撒一次扣 ${p.penaltyPerTurn} 分。`;
      case "duplicate_one": return "送餐前隨機複製一樣材料，從上面再撒一次。複製到什麼，看運氣。";
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
  // 材料本身帶的倍率（容器、魔女、行情）；合體塊裡每件各自算
  function ownFactors(m) {
    const c = cont(), p = c.params || {}, f = [];
    if (c.rule === "liquid_only") f.push(m.juiced ? ["果汁", C.juiceRate] : ["液體", p.liquidMultiplier || 1]);
    if (c.rule === "witch_bonus" && m.ing.tags.includes("witch")) f.push(["魔女大釜", p.witchMultiplier || 1]);
    if (m.priceMult !== 1) f.push([m.priceMult > 1 ? "新鮮" : "放久了", m.priceMult]);
    if (m.dropMult > 1) f.push([m.combo > 1 ? `Perfect 連擊 ${m.combo}` : "Perfect", m.dropMult]);
    return f;
  }
  // 位置帶來的倍率（嫌棄、五行、合體）；合體塊整塊算一次
  function placeFactors(x) {
    const f = [];
    if (isGroup(x)) {
      f.push([`合體 ${x.members.length} 件`, 1 + C.fuseRate * (x.members.length - 1)]);
      if (x.priceMult !== 1) f.push([x.priceMult > 1 ? "新鮮" : "放久了", x.priceMult]);
    }
    for (const y of around(x)) if (!y.neutralized && y.ing.rule === "discount") f.push([`被${y.ing.name}嫌棄`, 1 - y.ing.params.rate]);
    for (const r of relations(x)) if (r.kind === "生") f.push([`${elementOf(r.y)}生${elementOf(x)}（${r.y.ing.name}）`, 1 + C.wuxing.generate]);
    return f;
  }
  const factors = x => (isGroup(x) ? [] : ownFactors(x)).concat(placeFactors(x));
  const hiddenStars = x => x.ing.rule === "fake_label" && !x.revealed;
  const unknownTruth = m => m.ing.rule === "authenticity" && !m.revealed;
  // 單件材料的 [色, 香, 味]（不含位置倍率）；n＝占幾格
  function baseAxes(m, assumeFake, n) {
    if (m.neutralized) return [0, 0, 0];
    if (m.ing.rule === "flip" && cont().rule !== "pineapple_legal") return [0, 0, 0];
    if (m.fake && (m.revealed || assumeFake)) return [0, 0, 0];
    if (assumeFake && unknownTruth(m)) return [0, 0, 0];
    const s = m.stars.slice();
    if (m.ing.tags.includes("inedible")) s[0] += C.decorBonus;
    const f = prod(ownFactors(m));
    return s.map(v => v * n * f);
  }
  // 這樣材料（或合體塊）貢獻的 [色, 香, 味]；assumeFake：未揭曉的真贗盲盒先當贗品算
  function itemAxes(x, assumeFake) {
    if (!live(x) || x.neutralized) return [0, 0, 0];
    const out = [0, 0, 0];
    for (const m of members(x)) baseAxes(m, assumeFake, isGroup(x) ? m.rar.size : (x.cells.length || x.rar.size)).forEach((v, k) => { out[k] += v; });
    const pm = prod(placeFactors(x));
    return out.map(v => v * pm);
  }
  const itemPoints = (x, assumeFake) => Math.round(itemAxes(x, assumeFake).reduce((a, b) => a + b, 0));
  function score({ hideUnknown = false } = {}) {
    const axes = [0, 0, 0];
    let unknown = 0;
    for (const x of liveItems()) {
      if (hideUnknown && hiddenStars(x)) { unknown++; continue; }
      if (hideUnknown && members(x).some(unknownTruth)) unknown++;
      itemAxes(x, hideUnknown).forEach((v, k) => { axes[k] += v; });
    }
    const ax = axes.map(v => Math.round(v));
    const combos = COMBOS.filter(c => c.effect !== "cancel_instadeath" && comboDone(c));
    const bonus = combos.reduce((a, c) => a + (c.bonus || 0), 0);
    const discounts = liveItems().filter(x => !x.neutralized && x.ing.rule === "discount");
    const decor = liveItems().filter(x => !isGroup(x) && !x.neutralized && x.ing.tags.includes("inedible"));
    const total = Math.max(0, ax[0] + ax[1] + ax[2] + (cont().baseScore || 0) + bonus - S.penalty);
    return { total, axes: ax, bonus, combos, discounts, decor, unknown };
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
    if (S.sim) return;
    if (face) setFace(face);
    if (!text) return;
    const b = $("#bubble");
    b.textContent = text;
    b.classList.add("show");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => b.classList.remove("show"), 4200);
  }
  function setFace(f) { if (!S.sim) $("#rein").src = `assets/rein/${FACES.includes(f) ? f : "idle"}.webp`; }
  function log(t) { if (!S.sim) $("#log").textContent = t; }

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
  function iconEl(x) {
    const icon = h("div", { class: "tok-icon" });
    if (isGroup(x)) icon.append(h("div", { class: "seal" + (x.complete ? " done" : "") }, x.complete ? "★" : "合"));
    else if (x.ing.zone === "normal" || x.ing.zone === "mine") icon.append(h("div", { class: "seal" }, x.ing.name[0]));
    else icon.innerHTML = jarSvg(x.ing);
    return icon;
  }

  function tokMeta(x, inHand) {
    const ing = x.ing;
    if (x.vanished) return { t: "第十枚・消失", cls: "off" };
    if (x.neutralized) return { t: "已中和", cls: "off" };
    if (isGroup(x)) {
      const unk = x.members.some(unknownTruth);
      return { t: (x.complete ? "完成 " : "合體 ") + (unk ? "？" : pts(itemPoints(x))), cls: x.complete ? "done" : "" };
    }
    if (ing.rule === "fake_label" && !x.revealed) return { t: (ing.params && ing.params.label) || "劇毒", cls: "bad" };
    if (ing.rule === "authenticity" && !x.revealed) return { t: "真贗未明", cls: "warn" };
    if (x.fake) return { t: `贗品 ${pts(itemPoints(x))}`, cls: "bad" };
    if (ing.rule === "flip") return { t: cont().rule === "pineapple_legal" ? pts(itemPoints(x)) + "・合法" : "地雷", cls: "bad" };
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
    const big = inHand || new Set(x.cells.map(i => rc(i)[0])).size >= 2;
    const rel = inHand ? [] : relations(x);
    const g = rel.filter(r => r.kind === "生").length, k = rel.filter(r => r.kind === "剋").length;
    return h("div", { class: `tok ${meta.cls}`, onclick: e => { e.stopPropagation(); openInfo(x, inHand); } },
      h("span", { class: "el" }, elementOf(x)),
      g || k ? h("span", { class: "rel" }, g ? h("span", { class: "g" }, "生" + (g > 1 ? g : "")) : null, k ? h("span", { class: "k" }, "剋" + (k > 1 ? k : "")) : null) : null,
      iconEl(x),
      h("div", { class: "tok-name" }, h("span", { class: "rar " + x.rar.id }, x.rar.id), " ", displayName(x) + (x.juiced ? "汁" : "") + (x.dup ? "（複製）" : "")),
      big && !isGroup(x) ? h("div", { class: "tok-stars" }, hiddenStars(x) ? "色香味 ？" : x.stars.map((s, i) => AXES[i] + s).join(" ")) : null,
      h("div", { class: "tok-meta" }, meta.t));
  }
  function shapeMini(shape) {
    const on = new Set(shape.map(([a, b]) => a * 2 + b));
    const w = Math.max(...shape.map(s => s[1])) + 1, hgt = Math.max(...shape.map(s => s[0])) + 1;
    const el = h("span", { class: "shape-mini", style: `grid-template-columns:repeat(${w},7px);grid-template-rows:repeat(${hgt},7px)` });
    for (let a = 0; a < hgt; a++) for (let b = 0; b < w; b++) el.append(h("i", { class: on.has(a * 2 + b) ? "on" : "" }));
    return el;
  }
  const pieceEls = uid => [...document.querySelectorAll(`#plate .piece[data-uid="${uid}"]`)];
  const anchorEl = uid => document.querySelector(`#plate .piece[data-uid="${uid}"][data-anchor="1"]`);

  // 盤面重畫；opts.drop＝剛撒下的材料（從手的位置掉下來）、opts.pulse＝要閃一下的 uid
  // 位置有變的材料用 FLIP 從舊位置滑到新位置（重力）
  function renderPlate(opts = {}) {
    if (S.sim) return;
    const before = new Map();
    document.querySelectorAll("#plate .piece[data-anchor='1']").forEach(el => before.set(el.dataset.uid, el.getBoundingClientRect()));
    const plate = $("#plate");
    plate.textContent = "";
    const height = stackHeight();
    for (let i = 0; i < CELLS; i++) {
      const [r] = rc(i);
      const danger = r === 0 && !S.grid[i] && S.grid[i + COLS];
      plate.append(h("div", { class: `cell${r === 0 ? " rim" : ""}${danger ? " danger" : ""}`, "data-i": i }));
    }
    plateVersion++;
    const layer = h("div", { class: "pieces", style: `grid-template-columns:repeat(${COLS},minmax(0,1fr));grid-template-rows:repeat(${ROWS},minmax(0,1fr));` });
    for (const x of allItems()) {
      const meta = tokMeta(x, false);
      const cls = `piece rar-${x.rar.id} ${meta.cls}${isGroup(x) ? " fused" + (x.complete ? " done" : "") : ""}`;
      if (isGroup(x)) {
        // 合體塊形狀不規則：一格一片，相鄰的邊拉齊，名字放在最底下最左邊那格
        const own = new Set(x.cells);
        const anchor = x.cells.slice().sort((a, b) => rc(b)[0] - rc(a)[0] || rc(a)[1] - rc(b)[1])[0];
        for (const i of x.cells) {
          const [r, c] = rc(i);
          const t = r > 0 && own.has(i - COLS), b = r < ROWS - 1 && own.has(i + COLS), l = c > 0 && own.has(i - 1), rr = c < COLS - 1 && own.has(i + 1);
          const half = GAP / 2;
          const style = `grid-row:${r + 1};grid-column:${c + 1};margin:${t ? -half : 0}px ${rr ? -half : 0}px ${b ? -half : 0}px ${l ? -half : 0}px;` +
            `border-top-width:${t ? 0 : 1}px;border-right-width:${rr ? 0 : 1}px;border-bottom-width:${b ? 0 : 1}px;border-left-width:${l ? 0 : 1}px;border-radius:0;`;
          const el = h("div", { class: cls + " part", style, "data-uid": x.uid, "data-anchor": i === anchor ? "1" : "0", onclick: () => openInfo(x) });
          if (i === anchor) el.append(token(x, false));
          layer.append(el);
        }
        continue;
      }
      layer.append(buildPiece(x, x.cells.map(rc), false, cls));
    }
    plate.append(layer);
    // 吊車區的高度跟著格子大小走：要塞得下縮小後兩層高的方塊
    const cellH = plate.querySelector(".cell").getBoundingClientRect().height;
    $("#dropper").style.height = Math.round(HAND_TOP + (2 * cellH + GAP) * HAND_SCALE + 18) + "px";

    // 動畫：剛撒下的從吊車上的位置一邊掉一邊放大；其他有移動的從舊位置滑過去
    const cellW = (plate.clientWidth - 28 - GAP * (COLS - 1)) / COLS;
    const wellTop = $("#dropper").getBoundingClientRect().top;
    const drop = opts.drop;
    for (const el of layer.querySelectorAll(".piece[data-anchor='1']")) {
      const uid = el.dataset.uid, now = el.getBoundingClientRect(), parts = pieceEls(uid);
      if (drop && String(drop.x.uid) === uid) {
        const ms = dropMs(now.top - wellTop);
        const dx = (drop.from - drop.col) * (cellW + GAP);
        let frames;
        if (drop.fromRect) {
          const f = drop.fromRect, k = f.width / now.width, sx = f.left - now.left, sy = f.top - now.top;
          const start = { transform: `translate(${sx}px, ${sy}px) scale(${k})`, easing: "cubic-bezier(.55,0,1,.6)" };
          frames = drop.from === drop.col
            ? [start, { transform: "none", offset: .8 }, { transform: "translateY(-6px) scaleY(.94)", offset: .9 }, { transform: "none" }]
            : [start, { transform: `translate(${dx}px, 0)`, offset: .66, easing: "ease-out" }, { transform: `translate(${dx * .45}px, -22px)`, offset: .82, easing: "ease-in" }, { transform: "none", offset: .94 }, { transform: "none" }];
        } else {
          const dy = now.top - wellTop + 10;
          frames = [{ transform: `translateY(${-dy}px)`, easing: "cubic-bezier(.55,0,1,.6)" }, { transform: "translateY(0)", offset: .8 }, { transform: "translateY(-6px) scaleY(.94)", offset: .9 }, { transform: "none" }];
        }
        parts.forEach(p => { p.style.transformOrigin = "0 0"; p.animate(frames, { duration: ms }); });
        continue;
      }
      const old = before.get(uid);
      if (old && (Math.abs(old.top - now.top) > 2 || Math.abs(old.left - now.left) > 2)) {
        const f = [{ transform: `translate(${old.left - now.left}px, ${old.top - now.top}px)` }, { transform: "none" }];
        parts.forEach(p => p.animate(f, { duration: 280, easing: "cubic-bezier(.55,0,1,.6)" }));
      }
      if (opts.pulse && opts.pulse.includes(+uid)) {
        parts.forEach(p => p.animate([{ boxShadow: "0 0 0 0 rgba(232,134,47,.95)", filter: "brightness(1.6)" }, { boxShadow: "0 0 0 12px rgba(232,134,47,0)", filter: "none" }], { duration: 700, easing: "ease-out" }));
      }
    }

    renderHand();
    renderSide(height);
  }
  const dropMs = px => Math.round(320 + Math.sqrt(Math.max(0, px)) * 18);
  const HAND_SCALE = 0.6, HAND_TOP = 22;

  // 一塊材料（非合體塊）：rcs＝它占的 [列, 欄]，畫在一張 grid 上；盤上和吊車上共用
  function buildPiece(x, rcs, inHand, cls) {
    const rs = rcs.map(p => p[0]), cs = rcs.map(p => p[1]);
    const r0 = Math.min(...rs), c0 = Math.min(...cs), hh = Math.max(...rs) - r0 + 1, ww = Math.max(...cs) - c0 + 1;
    let style = `grid-row:${r0 + 1}/span ${hh};grid-column:${c0 + 1}/span ${ww};`;
    const tok = token(x, inHand);
    const isL = rcs.length === 3;
    if (isL) {
      // L 形：2×2 外框挖掉一角，內容放在轉角那格
      const has = new Set(rcs.map(p => p.join()));
      const miss = [[0, 0], [0, 1], [1, 0], [1, 1]].find(([a, b]) => !has.has(`${r0 + a},${c0 + b}`));
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
    return h("div", { class: (cls || `piece rar-${x.rar.id} ${tokMeta(x, inHand).cls}`) + (isL ? " L" : ""), style, "data-uid": x.uid, "data-anchor": "1" }, tok);
  }

  // 盤子上方的吊車：吊著跟落盤時一模一樣的方塊（縮小），左右擺盪
  function renderHand() {
    const hand = $("#hand");
    hand.textContent = "";
    hand.className = "hand";
    const x = S.hand;
    const w = x ? shapeW(x.shape) : 1;
    const width = `calc(${w} * (100% - ${(COLS - 1) * GAP}px) / ${COLS} + ${(w - 1) * GAP}px)`;
    hand.style.setProperty("--w", width);
    if (!x) { hand.classList.add("idle"); hand.append(h("span", { class: "hand-item empty" }, S.busy ? "" : "抽一樣")); return; }
    if (x.swing) hand.style.setProperty("--swing", x.swing + "ms");
    const hgt = Math.max(...x.shape.map(s => s[0])) + 1;
    const grid = h("div", { class: "hand-piece", style: `grid-template-columns:repeat(${w},minmax(0,1fr));grid-template-rows:repeat(${hgt},minmax(0,1fr));aspect-ratio:${w}/${hgt};top:${HAND_TOP}px;transform:scale(${HAND_SCALE});` });
    grid.append(buildPiece(x, x.shape, true));
    hand.append(grid);
  }
  // 手現在對準哪一欄：拿手的左緣跟第一列每一格的左緣比
  // f＝偏離那一欄的程度（0 正中、0.5 剛好卡在兩欄中間），lean＝往哪邊偏
  function handAim(w) {
    const left = $("#hand").getBoundingClientRect().left;
    const ls = [...document.querySelectorAll("#plate .cell")].slice(0, COLS).map(c => c.getBoundingClientRect().left);
    let col = 0, d = Infinity;
    for (let c = 0; c <= COLS - w; c++) if (Math.abs(left - ls[c]) < Math.abs(d)) { d = left - ls[c]; col = c; }
    return { col, f: Math.min(.5, Math.abs(d) / (ls[1] - ls[0])), lean: Math.sign(d) };
  }
  const handColumn = w => handAim(w).col;
  const judge = f => f <= C.perfect.window ? "perfect" : f <= C.perfect.good ? "good" : "miss";
  // 放手的判定 → 實際落欄、連擊、Perfect 加成（遊戲和模擬共用）
  function release(x, aim) {
    const w = shapeW(x.shape), q = judge(aim.f);
    let col = aim.col;
    if (q === "miss" && aim.lean && Math.random() < C.perfect.missSlip) col = Math.max(0, Math.min(COLS - w, col + aim.lean));
    col = bounce(col, w);
    S.combo = q === "perfect" ? S.combo + 1 : 0;
    if (q === "perfect") { x.combo = S.combo; x.dropMult = Math.min(1 + C.perfect.max, 1 + C.perfect.base + C.perfect.combo * (S.combo - 1)); }
    return { q, col };
  }

  // 落點影子：手擺到哪，盤上就亮出會落在哪；Perfect 的時機亮金光，會凸出盤緣就變紅
  let ghostKey = "", plateVersion = 0;
  function ghostTick() {
    requestAnimationFrame(ghostTick);
    const x = S.hand;
    if (!x || S.busy || $("#screen-play").hidden) { if (ghostKey) { paintGhost([], false, false); $("#btnDraw").classList.remove("hot"); ghostKey = ""; } return; }
    const aim = handAim(shapeW(x.shape)), col = aim.col, r = landingRow(x.shape, col), perfect = judge(aim.f) === "perfect";
    const key = `${plateVersion}|${col}|${r}|${x.shape.join(";")}|${perfect}`;
    if (key === ghostKey) return;
    ghostKey = key;
    const cells = x.shape.map(([a, b]) => [r + a, col + b]);
    paintGhost(cells.filter(([R]) => R >= 0).map(([R, Cc]) => R * COLS + Cc), cells.some(([R]) => R < 0), perfect);
    $("#btnDraw").classList.toggle("hot", perfect);
  }
  function paintGhost(idx, bad, perfect) {
    document.querySelectorAll("#plate .cell.ghost").forEach(c => c.classList.remove("ghost", "bad", "perfect"));
    for (const i of idx) { const c = document.querySelector(`#plate .cell[data-i="${i}"]`); if (c) c.classList.add("ghost", ...(bad ? ["bad"] : perfect ? ["perfect"] : [])); }
  }

  // 旋轉：有機率被兔子撞歪，轉成隨機方向（也可能根本沒轉成）
  const RABBIT = '<svg viewBox="0 0 64 44"><path d="M10 40q-6-1-4-7 4-12 20-14l12-1q-3-7-1-14 2-4 5 0 2 5 1 11 4-7 8-8 4 0 2 4-3 6-7 9 6 3 7 9 0 6-6 8l-6 1-4 3h-5l1-3h-9l-4 4h-5l2-4z" fill="#f5f0e6" stroke="#16111f" stroke-width="1.6" stroke-linejoin="round"/><circle cx="51" cy="25" r="1.8" fill="#16111f"/><path d="M60 29l2 1" stroke="#16111f" stroke-width="1.4" stroke-linecap="round"/><circle cx="7" cy="31" r="3.4" fill="#f5f0e6" stroke="#16111f" stroke-width="1.4"/></svg>';
  async function rabbitBump() {
    const track = $(".track"), hand = $("#hand");
    hand.classList.add("held");
    const tr = track.getBoundingClientRect(), hr = hand.getBoundingClientRect();
    const fromRight = Math.random() < .5, face = fromRight ? " scaleX(-1)" : "";
    const hit = hr.left - tr.left + hr.width / 2 - 24, start = fromRight ? tr.width + 40 : -80, end = fromRight ? -100 : tr.width + 60;
    const rb = h("div", { class: "rabbit", html: RABBIT });
    track.append(rb);
    await rb.animate([{ transform: `translateX(${start}px)${face}` }, { transform: `translateX(${hit}px)${face}` }], { duration: 420, easing: "cubic-bezier(.4,0,.9,.7)", fill: "forwards" }).finished.catch(() => {});
    const tilt = fromRight ? -1 : 1;
    SFX.play("boing");
    hand.animate([{ transform: "none" }, { transform: `rotate(${22 * tilt}deg)`, offset: .2 }, { transform: `rotate(${-12 * tilt}deg)`, offset: .5 }, { transform: `rotate(${5 * tilt}deg)`, offset: .75 }, { transform: "none" }], { duration: 620, easing: "ease-out" });
    await rb.animate([{ transform: `translateX(${hit}px)${face}` }, { transform: `translate(${hit - 18 * tilt}px, -16px)${face} rotate(-14deg)`, offset: .25 }, { transform: `translate(${hit - 30 * tilt}px, 0)${face}`, offset: .45 }, { transform: `translateX(${end}px)${face}` }], { duration: 700, easing: "ease-in", fill: "forwards" }).finished.catch(() => {});
    rb.remove();
    hand.classList.remove("held");
  }
  async function onRotate() {
    const x = S.hand;
    if (S.busy || !x || x.shapes.length < 2) return;
    const from = x.shapes.indexOf(x.shape), want = x.shapes[(from + 1) % x.shapes.length];
    if (Math.random() >= C.rabbitChance) { x.shape = want; renderPlate(); setButtons(); return; }
    S.busy = true; setButtons();
    say("⋯⋯啊，兔子。", "scared");
    await rabbitBump();
    x.shape = pick(x.shapes.filter(s => s !== want));
    S.busy = false;
    renderPlate(); setButtons();
    say(x.shape === x.shapes[from] ? "兔子撞了一下⋯⋯沒轉成。" : "兔子撞了一下，轉歪了。", "meh");
  }

  function renderSide(height) {
    // 手上的材料
    const slot = $("#traySlot"); slot.textContent = "";
    if (S.hand) slot.append(token(S.hand, true));
    else slot.append(h("span", { class: "tray-empty" }, topFull() ? "盤子滿了" : "先抽一樣"));
    $("#tray").classList.toggle("active", !!S.hand);
    const busu = S.hand && S.hand.ing.rule === "fake_label";
    $("#btnDiscard").hidden = !busu;
    const hint = $("#trayHint"); hint.textContent = "";
    const room = ROWS - height;
    if (S.hand) {
      hint.append(`占 ${S.hand.shape.length} 格`, shapeMini(S.hand.shape), "　",
        busu ? `標籤寫著「${(S.hand.ing.params && S.hand.ing.params.label) || "劇毒"}」⋯⋯撒下去？還是丟掉？` : `落點亮金光時放手＝Perfect${S.combo > 1 ? `（現在連擊 ${S.combo}）` : ""}。${COARSE ? "按大圓鈕「撒！」。" : "按「撒！」、空白鍵或點盤子。"}`);
    } else if (S.grid.some(Boolean)) {
      hint.append(room === 0 ? "最高那欄已經頂到盤緣了，再撒小心打翻。" : room === 1 ? "最高那欄只剩一層就到盤緣。" : `最高那欄離盤緣還有 ${room} 層。`);
    }
    const lore = $("#trayLore");
    lore.textContent = S.hand ? S.hand.ing.lore : "";
    lore.hidden = !lore.textContent;

    // 分數、要求與色香味
    const est = estimate();
    showScore(est);
    const rl = $("#reqLine"); rl.textContent = "";
    if (S.req) rl.append(h("span", { class: "req" }, "要求 ", h("b", { class: est.total >= S.req.total ? "ok" : "" }, S.req.total), " 分"));
    const dish = $("#dish"); dish.textContent = "";
    est.axes.forEach((v, i) => {
      const need = S.req && S.req.focus && S.req.focus.axis === i;
      dish.append(h("span", { class: "ax" + (need ? " need" : "") }, AXES[i] + (need ? `（要 ${S.req.focus.min}）` : "")), h("span", {}),
        h("span", { class: "avg" + (need && v >= S.req.focus.min ? " met" : "") }, pts(v)));
    });
    const extra = (cont().baseScore || 0) + est.bonus - S.penalty;
    dish.append(h("div", { class: "mult" }, h("span", {}, extra ? `其他 ${extra > 0 ? "+" : ""}${extra}　總分` : "總分"), h("b", {}, est.total + (est.unknown ? "＋？" : ""))));
    const line = $("#comboLine"); line.textContent = "";
    for (const c of est.combos) line.append(h("span", { class: "chip" }, c.result));
    for (const g of liveItems().filter(x => isGroup(x) && !x.complete)) line.append(h("span", { class: "chip dim" }, g.ing.name));
    for (const x of liveItems()) if (x.ing.rule === "instadeath" && !x.neutralized && mandrakeSafe(x)) line.append(h("span", { class: "chip" }, "曼德拉草已處理"));
    // 飛行軟膏一成立就開始飄
    $("#reinWrap").classList.toggle("float", ointmentDone());
  }

  // 送餐拉桿：長按拉到底才送（手機防誤觸）；鍵盤 Enter／聚焦後按鍵直接送
  const LEVER_MS = 550;
  function bindLever() {
    const lv = $("#btnServe");
    let raf = 0, done = false;
    const set = p => lv.style.setProperty("--p", p);
    const stop = () => { cancelAnimationFrame(raf); raf = 0; set(0); lv.classList.remove("pull"); };
    lv.addEventListener("pointerdown", e => {
      if (e.button || lv.disabled) return;
      e.preventDefault();
      try { lv.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件沒有真的指標 */ }
      const t0 = performance.now();
      done = false;
      lv.classList.add("pull");
      const step = now => {
        const p = Math.min(1, (now - t0) / LEVER_MS);
        set(p);
        if (p < 1) { raf = requestAnimationFrame(step); return; }
        done = true; stop(); buzz(40); SFX.play("lever"); onServe();
      };
      raf = requestAnimationFrame(step);
    });
    const release = () => { if (!raf) return; stop(); if (!done) log("送餐拉桿要長按，拉到底才會送。"); };
    for (const ev of ["pointerup", "pointercancel"]) lv.addEventListener(ev, release);
    lv.addEventListener("click", e => { if (e.detail === 0) onServe(); });
    lv.addEventListener("contextmenu", e => e.preventDefault());
  }

  function setButtons() {
    if (S.sim) return;
    const b = $("#btnDraw");
    $("#domeCap").textContent = S.hand ? "撒！" : "抽";
    b.disabled = S.busy || (!S.hand && (topFull() || !S.deck.length));
    const rot = $("#btnRotate");
    rot.classList.toggle("off", !S.hand || S.hand.shapes.length < 2);
    rot.disabled = S.busy;
    $("#btnServe").disabled = S.busy || !liveItems().length;
  }

  // 盤面上方飄一行字（合體、組合完成）
  async function popText(text, big) {
    if (S.sim) return;
    const el = h("div", { class: "pop" + (big ? " big" : "") }, text);
    $("#well").append(el);
    await el.animate(big
      ? [{ opacity: 0, transform: "translate(-50%,-50%) scale(2.2)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: .18 }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: .8 }, { opacity: 0, transform: "translate(-50%,-70%) scale(1)" }]
      : [{ opacity: 0, transform: "translate(-50%,-30%)" }, { opacity: 1, transform: "translate(-50%,-50%)", offset: .2 }, { opacity: 1, transform: "translate(-50%,-50%)", offset: .7 }, { opacity: 0, transform: "translate(-50%,-80%)" }],
      { duration: big ? 1600 : 900, easing: "ease-out" }).finished.catch(() => {});
    el.remove();
  }

  // ── 材料詳情 ──
  const wuxingLine = e => GEN[e] ? `${e}生${GEN[e]}、${e}剋${KE[e]}；喜${GEN_BY[e]}生（×${1 + C.wuxing.generate}），怕${KE_BY[e]}剋：被一件剋到會被撞得轉向，被兩件夾剋就散掉。` : "";
  function openInfo(x, inHand) {
    if (isGroup(x)) return openGroupInfo(x);
    const box = $("#infoBox"); box.textContent = "";
    const n = x.cells.length || x.rar.size;
    const axes = itemAxes(x);
    const taste = h("div", { class: "info-taste" });
    x.stars.forEach((s, i) => taste.append(h("span", {}, AXES[i]),
      hiddenStars(x) ? h("span", { class: "stars" }, "？？？") : h("span", {}, starsEl(s), !inHand && !unknownTruth(x) ? `　${pts(axes[i])}` : "")));
    const f = inHand ? ownFactors(x).filter(([k]) => k === "果汁" || k === "液體" || k === "魔女大釜") : factors(x);
    const eff = effectText(x.ing);
    box.append(...[
      h("button", { class: "info-close", "aria-label": "關閉", onclick: closeInfo }, "×"),
      h("h3", {}, h("span", { class: "rar " + x.rar.id }, x.rar.id), displayName(x) + (x.juiced ? "（果汁）" : "")),
      taste,
      h("div", { class: "info-meta" },
        h("span", {}, "五行 ", h("b", {}, elementOf(x))),
        h("span", {}, "占 ", h("b", {}, n), " 格"),
        h("span", {}, inHand ? "預估 " : "小計 ", h("b", {}, hiddenStars(x) || unknownTruth(x) ? "？" : pts(itemPoints(x))))),
      f.length ? h("div", { class: "info-meta" }, f.map(([k, v]) => h("span", {}, k + " ", h("b", {}, fmtMult(v))))) : null,
      eff ? h("p", { class: "info-effect" }, h("b", {}, "效果　"), eff) : null,
      h("p", { class: "info-effect" }, h("b", {}, "分區　"), ZONES[x.ing.zone] || x.ing.zone),
      ...comboLines(x.ing).map(t => h("p", { class: "info-effect" }, h("b", {}, "組合　"), t)),
      h("p", { class: "info-effect" }, h("b", {}, "五行　"), wuxingLine(elementOf(x))),
      x.ing.lore ? h("p", { class: "info-lore" }, x.ing.lore) : null].filter(Boolean));
    $("#infoModal").hidden = false;
  }
  function openGroupInfo(g) {
    const box = $("#infoBox"); box.textContent = "";
    const combo = g.combo, have = new Set(g.members.map(m => m.ing.id));
    const missing = combo ? combo.requires.filter(id => !have.has(id)).map(id => ING_BY_ID[id].name) : [];
    const unk = g.members.some(unknownTruth);
    const pm = prod(placeFactors(g));
    const status = g.complete
      ? `套裝完成：+${combo.bonus} 分。` + (combo.requireGenuine ? "送餐時要全部是真品才算數。" : "")
      : `同系列相碰就合體，每多一件 +${Math.round(C.fuseRate * 100)}%。還差：${missing.join("、")}。`;
    box.append(
      h("button", { class: "info-close", "aria-label": "關閉", onclick: closeInfo }, "×"),
      h("h3", {}, h("span", { class: "rar " + g.rar.id }, g.rar.id), displayName(g)),
      h("div", { class: "info-meta" },
        h("span", {}, "五行 ", h("b", {}, elementOf(g))),
        h("span", {}, "占 ", h("b", {}, g.cells.length), " 格"),
        h("span", {}, "小計 ", h("b", {}, unk ? "？" : pts(itemPoints(g))))),
      h("div", { class: "info-meta" }, placeFactors(g).map(([k, v]) => h("span", {}, k + " ", h("b", {}, fmtMult(v))))),
      h("p", { class: "info-effect" }, h("b", {}, g.complete ? "完成　" : "合體　"), status),
      h("ul", { class: "info-members" }, g.members.map(m => h("li", {},
        h("span", { class: "rar " + m.rar.id }, m.rar.id), " ", displayName(m) + (m.fake && m.revealed ? "（贗品）" : ""),
        h("b", {}, unknownTruth(m) ? "真贗未明" : pts(baseAxes(m, false, m.rar.size).reduce((a, b) => a + b, 0) * pm))))),
      g.complete && combo.verdict ? h("p", { class: "info-lore" }, combo.verdict) : null);
    $("#infoModal").hidden = false;
  }
  function closeInfo() { $("#infoModal").hidden = true; }

  // ── 食材圖鑑（存在 localStorage） ──
  const DEX_KEY = "rein-halloween-dex";
  function recordDex(x) {
    if (S.sim) return;
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
    const fake = { uid: 0, ing, rar: RARITIES[0], stars: ing.taste.slice(), shapes: SHAPES[1], shape: SHAPES[1][0], cells: [], fake: false, juiced: false, vanished: false, neutralized: false, used: false, dup: false, revealed: true, priceMult: 1 };
    openInfo(fake, true);
    $("#infoBox").append(h("p", { class: "info-lore" }, `基本星數（R 品質）。抽過 ${e.n} 次，最高品質 ${rar.id}${rar.prefix ? `（${rar.prefix}${ing.name}）` : ""}。`));
  }

  // ── 抽卡 ──
  function drawFromDeck() {
    if (!S.deck.length) return null;
    const setsOn = new Set(allMembers().map(m => m.ing.zone).filter(z => z.startsWith("set")));
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
    const shapes = SHAPES[rar.size] || SHAPES[1];
    return {
      uid: ++S.uid, ing, rar, stars: rollStars(ing, rar), shapes, shape: pick(shapes), cells: [],
      fake: false, juiced: false, vanished: false, neutralized: false, used: false, dup: false, revealed: false, priceMult: 1
    };
  }
  function drawItem() {
    const x = newItem(drawFromDeck());
    if (x.ing.rule === "authenticity") x.fake = Math.random() < C.fakeChance;
    if (cont().rule === "liquid_only" && !x.ing.tags.includes("liquid")) x.juiced = true;
    // 越撒越快：每撒一次擺速加快 swingAccel，最快到 swingMin 倍的時間
    const speed = Math.max(C.swingMin, 1 - C.swingAccel * (S.turn - 1));
    x.swing = Math.round(C.swingMs * speed * (1 - C.swingJitter + Math.random() * C.swingJitter * 2));
    recordDex(x);
    return x;
  }

  // 護盾：角粉只救相鄰材料（地雷、即死）；鱗片整盤免疫一次（任何失敗，含打翻）；先用角粉
  function useShield(kind, x) {
    if (kind === "mine" || kind === "death") {
      const horn = around(x).find(y => y.ing.rule === "neutralize_once" && !y.used);
      if (horn) { horn.used = true; return horn; }
    }
    const scale = liveItems().find(y => y.ing.rule === "immune_once" && !y.used && y !== x);
    if (scale) { scale.used = true; return scale; }
    return null;
  }

  // ── 撒下去之後的每一步（遊戲和模擬共用；模擬時 say／render 都不做事） ──
  // 衝擊：打翻、鳳梨、火鼠裘
  function impactStep(x, overflow) {
    if (overflow) {
      const sh = useShield("spill", x);
      if (sh) {
        x.cells.forEach(i => { S.grid[i] = null; });
        x.cells = [];
        S.dropped.push(x);
        say(`盤子差點打翻——${sh.ing.name}護住了，只掉了「${displayName(x)}」。`, "scared");
        return { saved: true };
      }
      return { fatal: { type: "spill", cause: x } };
    }
    const ing = x.ing, rule = ing.rule;
    if (rule === "flip") {
      if (cont().rule === "pineapple_legal") { say("⋯⋯披薩上的鳳梨。合法。", "deadpan"); return {}; }
      if (Math.random() < C.hawaiianChance) return { fatal: { type: "hawaiian", cause: x } };
      const sh = useShield("mine", x);
      if (sh) { x.neutralized = true; say(`${sh.ing.name}生效，鳳梨被中和了。好險。`, "meh"); return { said: true }; }
      return { fatal: { type: "flip", cause: x } };
    }
    if (rule === "authenticity" && x.fake && ing.params && ing.params.fakeEffect === "self_ignite") {
      x.revealed = true;
      const sh = useShield("fire", x);
      if (sh) { x.neutralized = true; say(`火鼠裘是贗品，燒起來了！${sh.ing.name}護住了整盤。`, "scared"); return { said: true }; }
      return { fatal: { type: "fire_rat_ignite", cause: x } };
    }
    return {};
  }
  // 毒性：飛行軟膏完成就免疫
  function toxicStep(x) {
    if (x.ing.rule !== "toxic_risk" || x.neutralized) return {};
    if (ointmentDone()) return { immune: true };
    if (Math.random() < x.ing.params.chance) {
      const sh = useShield("death", holderOf(x));
      if (sh) { x.neutralized = true; if (isGroup(holderOf(x))) refreshGroup(holderOf(x)); say(`${x.ing.name}的毒發作了——${sh.ing.name}擋下來了。`, "scared"); return { said: true }; }
      return { fatal: { type: "instadeath_toxic", cause: x } };
    }
    return { survived: true };
  }
  // 一般落盤台詞
  function placeLine(x) {
    const ing = x.ing, rule = ing.rule;
    if (rule === "authenticity") return say(`${ing.name}⋯⋯是真的嗎？反正不能吃。`, "pout");
    if (rule === "instadeath") return say(mandrakeSafe(x) ? "旁邊有犬之舌——曼德拉草可以安全處理。" : "曼德拉草在尖叫⋯⋯送餐前得讓它旁邊有犬之舌。", mandrakeSafe(x) ? "happy" : "scared");
    if (ing.tags.includes("dog_tongue") && around(x).some(y => y.ing.rule === "instadeath")) return say("犬之舌！隔壁的曼德拉草安全了。", "happy");
    if (rule === "discount") return say(`⋯⋯${ing.name}。隔壁的也被嫌棄了。`, "meh");
    if (rule === "fake_label") return say("真的撒下去了⋯⋯", "scared");
    if (rule === "neutralize_once") return say(`${ing.name}。隔壁的毒和地雷，它能擋一次。`, "idle");
    if (rule === "immune_once") return say(`${ing.name}。整盤可以免疫一次。`, "idle");
    const done = COMBOS.find(c => c.requires.includes(ing.id) && c.effect !== "cancel_instadeath" && comboDone(c));
    if (done) return say(`⋯⋯！${done.result}！`, "happy");
    if (ing.tags.includes("inedible")) return say(`${displayName(x)}⋯⋯不能吃，當裝飾吧。`, "meh");
    const rel = relations(x);
    const g = rel.filter(r => r.kind === "生");
    if (g.length) return say(`${g[0].y.ing.name}的${elementOf(g[0].y)}生${elementOf(x)}，${displayName(x)}更好吃了。`, "happy");
    if (ing.zone !== "normal" || x.rar.id !== "R") return say(`${displayName(x)}⋯⋯`, "idle");
    setFace("idle");
  }

  function onDraw() {
    if (S.busy || S.hand || topFull() || !S.deck.length) return;
    S.turn++;
    const x = drawItem();
    SFX.play("hang");
    S.hand = x;
    log(`抽到「${x.rar.id} ${displayName(x)}${x.juiced ? "（打成果汁）" : ""}」。零韻的手開始晃了。`);
    if (x.ing.rule === "fake_label") say("那、那個罐子寫著劇毒⋯⋯", "scared");
    else if (x.ing.rule === "flip") say(x.rar.id === "UR" ? "⋯⋯神級鳳梨。不要。" : "⋯⋯鳳梨。", "angry");
    else if (x.ing.rule === "instadeath" || x.ing.rule === "toxic_risk") say(`${x.ing.name}⋯⋯小心撒。`, "scared");
    else if (x.ing.tags.includes("inedible")) say(`${x.ing.name}⋯⋯這個能吃嗎？`, "meh");
    else if (x.rar.id === "UR") say(`${displayName(x)}！`, "happy");
    else setFace("idle");
    renderPlate(); setButtons();
  }

  function onDiscard() {
    if (S.busy || !S.hand || S.hand.ing.rule !== "fake_label") return;
    log(`把「${S.hand.ing.name}」丟掉了。`);
    say("丟掉了⋯⋯真的是毒嗎？", "meh");
    S.hand = null;
    afterPlace();
  }

  async function onDrop() {
    if (S.busy || !S.hand) return;
    S.busy = true;
    const x = S.hand, w = shapeW(x.shape);
    const prevCombo = S.combo;
    const aim = handAim(w), { q, col } = release(x, aim);
    $("#hand").classList.add("held");
    const held = $("#hand .hand-piece .piece");
    const fromRect = held ? held.getBoundingClientRect() : null;
    const before = estimate().total;
    S.hand = null;
    setButtons();
    if (x.ing.rule === "fake_label") S.flags.busuKept = true;
    const overflow = placeAt(x, col);
    renderPlate({ drop: { x, from: aim.col, col, fromRect } });
    const landed = x.cells.length ? anchorEl(x.uid) : null;
    await sleep(landed ? dropMs(landed.getBoundingClientRect().top - $("#dropper").getBoundingClientRect().top) + 40 : 420);
    // 落地當下就跳判定
    buzz(q === "perfect" ? [18, 40, 28] : x.cells.length >= 3 ? 34 : 20);
    SFX.play("land", x.cells.length || 1);
    if (q === "perfect") SFX.play("perfect", S.combo); else if (q === "good") SFX.play("good"); else SFX.play("miss");
    if (x.cells.length) impact(x, q);
    comboBadge(prevCombo);
    const spot = landed ? anchorEl(x.uid) : null;
    if (q === "perfect") floatAt(spot, S.combo > 1 ? `Perfect ×${S.combo}` : "Perfect!", "perfect");
    else if (q === "good") floatAt(spot, "Good", "good");
    else floatAt(spot, aim.col !== col ? "偏了⋯⋯滑到隔壁" : "偏了", "miss");
    if (aim.col !== col) log(`放手偏了，「${displayName(x)}」滑到隔壁那欄。`);
    else log(q === "perfect" ? `Perfect！「${displayName(x)}」正中落點${S.combo > 1 ? `，連擊 ${S.combo}` : ""}。` : `撒下「${displayName(x)}」。`);

    const imp = impactStep(x, overflow);
    if (imp.fatal) return endRound(imp.fatal);
    if (imp.saved) { renderPlate(); await sleep(700); return afterPlace(); }

    const fu = fuseStep();
    if (fu.fused.length || fu.absorbed.length || fu.moved.size) await animateFusion(fu);
    const wxLine = await wuxingChain();

    const tox = toxicStep(x);
    if (tox.fatal) return endRound(tox.fatal);

    // 這一下讓總分變多少
    const delta = estimate().total - before;
    const holder = holderOf(x);
    if (delta) floatAt(anchorEl(holder.uid), (delta > 0 ? "+" : "") + delta + " 分", delta > 0 ? "pts" : "pts neg", 260);

    const ointment = COMBOS.find(c => c.effect === "float");
    if (fu.completed.length) {
      const g = fu.completed[0];
      say(g.combo === ointment ? (ointment.verdict || "飛行軟膏完成。") : `⋯⋯！${g.combo.result}！`, g.combo === ointment ? "dizzy" : "happy");
    } else if (tox.immune) say(ointment.verdict || "飛行軟膏完成。", "dizzy");
    else if (fu.fused.length) say(`合體！${fu.fused[0].ing.name}。`, "happy");
    else if (wxLine) say(wxLine[0], wxLine[1]);
    else if (tox.survived) say(`${x.ing.name}⋯⋯還好，沒事。`, "scared");
    else if (!imp.said) placeLine(x);
    await afterPlace();
  }

  // 在某塊材料（或某個位置）上方飄一行字（判定、得分），不擋流程
  function floatAt(el, text, cls, delay = 0) {
    if (S.sim) return;
    const well = $("#well"), wr = well.getBoundingClientRect();
    const r = !el ? $("#plate").getBoundingClientRect() : el.getBoundingClientRect ? el.getBoundingClientRect() : el;
    const f = h("div", { class: "float-txt " + cls, style: `left:${r.left - wr.left + r.width / 2}px;top:${r.top - wr.top + 4}px` }, text);
    well.append(f);
    f.animate([{ opacity: 0, transform: "translate(-50%, 6px) scale(.7)" }, { opacity: 1, transform: "translate(-50%, -8px) scale(1.12)", offset: .18 }, { opacity: 1, transform: "translate(-50%, -14px) scale(1)", offset: .7 }, { opacity: 0, transform: "translate(-50%, -34px) scale(1)" }],
      { duration: 1100, delay, easing: "ease-out", fill: "both" }).finished.then(() => f.remove(), () => f.remove());
  }

  // 合體演出：散落的成員飛向本體、合體塊閃光、完成時大字
  async function animateFusion(fu) {
    const ghosts = [];
    for (const a of fu.absorbed) for (const el of pieceEls(a.from.uid)) ghosts.push({ el: el.cloneNode(true), rect: el.getBoundingClientRect(), to: a.to });
    renderPlate({ pulse: fu.fused.map(g => g.uid) });
    const ov = $("#overlay");
    await Promise.all(ghosts.map(({ el, rect, to }) => {
      const target = anchorEl(to.uid);
      if (!target) return null;
      const t = target.getBoundingClientRect();
      el.style.cssText += `;position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;margin:0;z-index:55;`;
      ov.append(el);
      return el.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${t.left - rect.left}px, ${t.top - rect.top}px) scale(.3)`, opacity: .2 }],
        { duration: 650, easing: "cubic-bezier(.5,0,.3,1)", fill: "forwards" }).finished.then(() => el.remove(), () => el.remove());
    }));
    SFX.play(fu.completed.length ? "complete" : "fuse");
    if (fu.completed.length) await popText(fu.completed[0].combo.result + "！", true);
    else if (fu.fused.length) await popText("合體！");
    else await sleep(300);
  }

  // 五行連鎖演出：散掉的碎開飛走、轉向的轉一圈；回傳零韻要說的話
  async function wuxingChain() {
    let line = null;
    for (let k = 0; k < 6; k++) {
      const ghosts = [];
      for (const el of document.querySelectorAll("#plate .piece")) ghosts.push({ uid: +el.dataset.uid, el, rect: el.getBoundingClientRect(), anchor: el.dataset.anchor === "1" });
      const wx = wuxingStep();
      if (!wx.gone.length && !wx.turned.length) break;
      const ov = $("#overlay"), anims = [];
      if (wx.gone.length) { SFX.play("scatter"); shake($("#plate"), 9); }
      else if (wx.turned.some(t => t.spun)) SFX.play("spin");
      for (const { y } of wx.gone) for (const gh of ghosts.filter(g => g.uid === y.uid)) {
        burst(gh.rect, { n: 9, color: "#ec8f8f", spread: 70, up: 34, size: 6, from: "center" });
        const el = gh.el.cloneNode(true), r = gh.rect, dir = Math.random() < .5 ? -1 : 1;
        el.style.cssText += `;position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;z-index:55;`;
        ov.append(el);
        anims.push(el.animate([{ transform: "none", opacity: 1, filter: "none" },
          { transform: `translate(${dir * 6}px, -4px) rotate(${dir * 4}deg)`, opacity: 1, filter: "brightness(1.8)", offset: .25 },
          { transform: `translate(${dir * 60}px, 40px) rotate(${dir * 50}deg) scale(.4)`, opacity: 0, filter: "brightness(1.8)" }],
          { duration: 700, easing: "cubic-bezier(.5,0,.8,.6)", fill: "forwards" }).finished.then(() => el.remove(), () => el.remove()));
      }
      renderPlate();
      for (const t of wx.turned) {
        const parts = pieceEls(t.y.uid);
        if (t.spun) parts.forEach(p => p.animate([{ transform: "rotate(-90deg) scale(.7)" }, { transform: "rotate(12deg) scale(1.05)", offset: .7 }, { transform: "none" }], { duration: 520, easing: "ease-out" }));
        else parts.forEach(p => p.animate([{ transform: "none" }, { transform: "rotate(-8deg)", offset: .25 }, { transform: "rotate(6deg)", offset: .6 }, { transform: "none" }], { duration: 420 }));
        t.how = t.spun ? "轉向" : t.y.shapes.length < 2 ? "晃了一下" : "卡住";
        floatAt(anchorEl(t.y.uid), `${elementOf(t.by)}剋${elementOf(t.y)}・${t.how}`, "miss");
      }
      for (const { y, src } of wx.gone) {
        const gh = ghosts.find(g => g.uid === y.uid && g.anchor);
        floatAt(gh && gh.rect, `${src.map(elementOf).join("")}夾剋・${y.ing.name}散了`, "pts neg");
      }
      if (wx.gone.length) {
        buzz([30, 50, 30, 50, 60]);
        const { y, src } = wx.gone[0];
        line = [`${src.map(s => s.ing.name).join("和")}兩面夾剋⋯⋯${displayName(y)}散掉了。`, "scared"];
        log(`五行夾剋：「${displayName(y)}」被${src.map(s => `${s.ing.name}（${elementOf(s)}）`).join("、")}剋散了。`);
      } else if (!line) {
        const t = wx.turned[0];
        const what = { 轉向: "被撞得轉了方向", 晃了一下: "被撞得晃了一下", 卡住: "被撞到，可是卡住了轉不動" }[t.how];
        line = [`${t.by.ing.name}的${elementOf(t.by)}剋${elementOf(t.y)}，${displayName(t.y)}${what}。旁邊再多一個剋它的就會散掉。`, "meh"];
      }
      await Promise.all(anims);
      await sleep(wx.moved.length ? 520 : 380);
      const fu = fuseStep();
      if (fu.fused.length || fu.absorbed.length || fu.moved.size) await animateFusion(fu);
    }
    return line;
  }

  async function afterPlace() {
    S.busy = true;
    if (cont().rule === "need_liquid" && !liveItems().some(isLiquid)) {
      S.penalty += S.container.params.penaltyPerTurn;
      log($("#log").textContent + ` 頭皿乾了，扣 ${S.container.params.penaltyPerTurn} 分。`);
    }
    renderPlate();
    await randomEvent();
    S.busy = false;
    renderPlate(); setButtons();
    if (topFull()) { log($("#log").textContent + " 盤子滿到盤緣了，直接送餐。"); await sleep(700); return onServe(); }
    if (!S.deck.length) log("食材櫃空了。只能送餐了。");
    // 一鍵連撒：撒完自動吊上下一件，想停就收手送餐
    else if (!$("#screen-play").hidden) onDraw();
  }

  // ── 隨機事件 ──
  async function randomEvent() {
    const items = liveItems();
    if (!items.length || !D.events || !D.events.length || Math.random() >= C.eventChance) return;
    const ev = D.events[weighted(D.events, e => e.weight || 1)];
    let text = "", face = "idle", pulse = [];
    if (ev.rule === "nibble") {
      const pool = items.filter(x => !isGroup(x) && !["flip", "instadeath", "fake_label", "toxic_risk"].includes(x.ing.rule) && !x.ing.tags.includes("inedible"));
      if (!pool.length) return;
      const x = pick(pool);
      x.cells.forEach(j => { S.grid[j] = null; });
      S.eaten.push(x);
      settle();
      text = ev.text || FALLBACK.nibble(displayName(x)); face = "happy";
    } else if (ev.rule === "shake" || ev.rule === "swap") {
      // 一樣材料被晃起來，從上面隨機一欄重新落下
      const pool = items.filter(x => !isGroup(x));
      if (!pool.length) return;
      const x = pick(pool), old = x.cells;
      old.forEach(j => { S.grid[j] = null; });
      const cols = [...Array(COLS - shapeW(x.shape) + 1).keys()].filter(c => landingRow(x.shape, c) >= 0);
      if (!cols.length) { old.forEach(j => { S.grid[j] = x; }); return; }
      placeAt(x, pick(cols));
      settle();
      text = ev.text || FALLBACK.shake(displayName(x)); face = "scared"; pulse = [x.uid];
    } else if (ev.rule === "price_mult") {
      const pool = items.filter(x => !x.neutralized && x.ing.rule !== "flip" && !(x.ing.tags.includes("inedible")));
      if (!pool.length) return;
      const x = pick(pool), m = ev.params.mult;
      x.priceMult *= m;
      text = ev.text || (m >= 1 ? FALLBACK.fresh(displayName(x), m) : FALLBACK.stale(displayName(x), m));
      face = m >= 1 ? "happy" : "meh"; pulse = [x.uid];
    } else return;
    await sleep(450);
    log("✦ " + text);
    say(text, face);
    renderPlate({ pulse });
    await sleep(700);
    const fu = fuseStep();
    if (fu.fused.length || fu.absorbed.length || fu.moved.size) await animateFusion(fu);
    const wxLine = await wuxingChain();
    if (wxLine) say(wxLine[0], wxLine[1]);
  }

  // ── 送餐 ──
  async function onServe() {
    if (S.busy || !liveItems().length) return;
    // 手上還吊著的那件放回去，不上盤
    S.hand = null;
    S.busy = true; setButtons(); renderPlate();
    say("送餐！", "idle");
    await sleep(500);

    for (const m of liveItems().filter(x => x.ing.rule === "instadeath" && !x.neutralized && !mandrakeSafe(x))) {
      const sh = useShield("death", m);
      if (sh) { m.neutralized = true; renderPlate(); say(`曼德拉草尖叫了——${sh.ing.name}擋下來了。`, "scared"); await sleep(1100); }
      else return endRound({ type: "instadeath_mandrake", cause: m });
    }

    if (S.container.rule === "duplicate_one") {
      const pool = liveItems().filter(x => !isGroup(x));
      const src = pool.length ? pick(pool) : null;
      const cols = src ? [...Array(COLS - shapeW(src.shape) + 1).keys()].filter(c => landingRow(src.shape, c) >= 0) : [];
      if (!src) log("聚寶盆找不到能複製的東西。");
      else if (!cols.length) { log(`聚寶盆想複製「${displayName(src)}」，可是盤子放不下。`); await sleep(900); }
      else {
        const copy = { ...src, uid: ++S.uid, dup: true, used: false, cells: [], keSeen: null };
        const col = pick(cols);
        placeAt(copy, col);
        renderPlate({ drop: { x: copy, from: col, col } });
        log(`聚寶盆複製了「${displayName(src)}」，又撒了一次。`);
        await sleep(900);
        if (src.ing.rule === "flip" && S.container.rule !== "pineapple_legal") {
          const sh = useShield("mine", copy);
          if (sh) { copy.neutralized = true; renderPlate(); say(`又一顆鳳梨⋯⋯${sh.ing.name}擋下來了。`, "meh"); await sleep(900); }
          else return endRound({ type: "flip", cause: copy, double: true });
        }
        const fu = fuseStep();
        if (fu.fused.length || fu.absorbed.length || fu.moved.size) await animateFusion(fu);
        const wxLine = await wuxingChain();
        if (wxLine) { say(wxLine[0], wxLine[1]); await sleep(700); }
      }
    }

    if (S.container.rule === "vanish_one") {
      const v = pick(liveItems());
      if (v) { v.vanished = true; renderPlate(); log(`一枚、兩枚⋯⋯第十枚。「${displayName(v)}」不見了。`); await sleep(1000); }
    }

    allItems().flatMap(members).forEach(m => { m.revealed = true; });
    allItems().filter(isGroup).forEach(refreshGroup);
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
    if (res.type === "spill") S.spilled = res.cause;
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
    const STAMP = { flip: "掀盤", spill: "打翻", fire_rat_ignite: "炎上" };

    let face = "idle", stamp = "", stampCls = "", stampZh = false;
    if (rampage) {
      add(endText("rampage")); add(res.double ? FALLBACK.double_flip : endText(res.type));
      face = "angry"; stamp = "暴走"; stampCls = "fail"; stampZh = true;
    } else if (fatal) {
      add(res.double ? FALLBACK.double_flip : endText(res.type));
      face = res.type === "flip" ? "angry" : res.type === "fire_rat_ignite" ? "scared" : res.type === "spill" ? "cry" : "dizzy";
      stamp = STAMP[res.type] || "即死";
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
      const dec = sc.decor.filter(x => !x.fake)[0];
      if (dec && !sc.combos.some(cb => cb.requires.includes(dec.ing.id))) add(FALLBACK.decor(dec.ing.name));
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
    if (allItems().flatMap(members).some(m => m.rar.id === "UR" && !m.dup)) chips.push("神級食材");
    if (kept) chips.push(`甕底留下：${displayName(kept)}`);
    if (rampage) chips.push("零韻暴走");
    recordAlbum(chips);

    // Treat／Trick 演出：Trick 霸屏演完才進結算畫面
    const treat = !fatal && !!grade;
    let trick = null;
    setFace(face);
    if (treat && !pizza) {
      const gain = (C.grades.affection || {})[grade] || 1;
      hearts(grade === "legend" ? 70 : grade === "great" ? 45 : 26);
      SFX.play("treat");
      S.aff = Math.min(C.maxAffection, S.aff + gain);
      if (S.aff === C.maxAffection && !S.flags.affNoted) { S.flags.affNoted = true; add(FALLBACK.affectionFull); chips.push("好感度滿值"); }
    } else if (!treat && !fatal) {
      const n = 1 + Math.floor(Math.random() * D.tricks.length);
      trick = D.tricks.find(t => t.id === n) || { id: n, text: "", anim: "" };
      say(lines[0] || "", face);
      SFX.play("trick");
      await sleep(700);
      await playTrick(trick);
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
      t.style.transitionDelay = `${i * 50}ms`;
      t.style.transform = `translate(${target.x - (r.left + r.width / 2)}px, ${target.y - (r.top + r.height / 2)}px) scale(.15)`;
      t.style.opacity = "0";
    });
    await sleep(500 + pieces.length * 50);
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
    const label = res.type === "flip" ? (res.double ? "雙倍火葬" : "掀盤！") : res.type === "spill" ? "打翻！" : res.type === "fire_rat_ignite" ? "炎上！" : "即死！";
    setFace(res.type === "flip" ? "angry" : res.type === "fire_rat_ignite" || res.type === "spill" ? "scared" : "dizzy");
    if (res.cause) say(`「${displayName(res.cause)}」——`);
    await sleep(300);
    SFX.play("fatal");
    plate.classList.add(res.type === "spill" ? "spilled" : "flipped");
    document.querySelectorAll("#plate .piece").forEach(t => {
      t.style.transform = `translate(${(Math.random() - .5) * 500}px, ${-200 - Math.random() * 300}px) rotate(${(Math.random() - .5) * 720}deg)`;
      t.style.opacity = "0";
    });
    $("#app").classList.add("shake");
    $("#overlay").append(h("div", { class: "slam-text" }, label));
    await sleep(1500);
    $("#app").classList.remove("shake");
    $("#overlay").textContent = "";
    plate.classList.remove("flipped", "spilled");
  }
  async function rampageAnimation() {
    const ov = $("#overlay");
    ov.append(h("div", { class: "chase" }, h("div", { class: "victim" }, "你"), h("img", { src: "assets/rein/angry.webp", alt: "" })));
    await sleep(3300);
    ov.textContent = "";
  }

  // ── Trick：十種霸屏惡作劇，每種 3.5–4.5 秒，keyframe＋停格編排 ──
  const play = (el, frames, opts) => el.animate(frames, typeof opts === "number" ? { duration: opts, fill: "forwards" } : { fill: "forwards", ...opts }).finished.catch(() => {});
  function trickCaption(stage, t, at) {
    return sleep(at).then(() => {
      const cap = h("div", { class: "trick-cap" }, h("b", {}, `TRICK #${t.id}`), h("span", {}, t.text || "零韻的惡作劇發動了。"));
      stage.append(cap);
      play(cap, [{ opacity: 0, transform: "translate(-50%, 30px) scale(.9)" }, { opacity: 1, transform: "translate(-50%, 0) scale(1.05)", offset: .6 }, { opacity: 1, transform: "translate(-50%, 0) scale(1)" }], { duration: 420, easing: "cubic-bezier(.2,1.4,.4,1)" });
      return cap;
    });
  }
  const YOKAI = [
    // 提燈妖怪
    '<svg viewBox="0 0 40 64"><path d="M20 2v6"/><path d="M10 8h20"/><rect x="7" y="10" width="26" height="40" rx="12"/><path d="M8 22h24M7 32h26M8 42h24"/><circle cx="15" cy="25" r="2.6" fill="currentColor"/><path d="M19 37q4 6 8 0" /><path d="M23 39q1 8 -3 12"/><path d="M14 50h12v6H14z"/></svg>',
    // 唐傘
    '<svg viewBox="0 0 48 70"><path d="M24 4 4 34h40z"/><path d="M24 4v30M14 34l10-30M34 34 24 4"/><circle cx="24" cy="22" r="3.2" fill="currentColor"/><path d="M24 34v24"/><path d="M24 58q-6 8 0 10"/><path d="M18 28q6 4 12 0"/></svg>',
    // 鬼火
    '<svg viewBox="0 0 40 60"><path d="M20 4q14 20 12 34a12 12 0 0 1-24 0Q6 24 20 4z"/><path d="M20 24q6 10 4 16a5 5 0 0 1-10 0q0-6 6-16z" fill="currentColor" opacity=".5"/></svg>',
    // 狐面
    '<svg viewBox="0 0 48 52"><path d="M6 4l10 14h16L42 4l2 22q-4 18-20 24Q8 44 4 26z"/><path d="M14 26q4-3 8 0M26 26q4-3 8 0"/><path d="M24 36l-3 4h6z" fill="currentColor"/><path d="M12 14l4 6M36 14l-4 6"/></svg>',
    // 白布幽靈
    '<svg viewBox="0 0 44 60"><path d="M6 56V24a16 16 0 0 1 32 0v32l-6-5-5 5-5-5-5 5-5-5z"/><circle cx="16" cy="26" r="2.6" fill="currentColor"/><circle cx="28" cy="26" r="2.6" fill="currentColor"/><path d="M18 36q4 3 8 0"/></svg>'
  ];
  const BAT = '<svg viewBox="0 0 64 30"><path d="M32 10q-4-8-8-2-6-6-14-2 2 8-8 10 10 2 12 10 4-6 10-4 3-6 8-6 5 0 8 6 6-2 10 4 2-8 12-10-10-2-8-10-8-4-14 2-4-6-8 2z" fill="#0d0912" stroke="rgba(232,134,47,.55)" stroke-width="1"/><circle cx="29.5" cy="12" r="1" fill="#e8862f"/><circle cx="34.5" cy="12" r="1" fill="#e8862f"/></svg>';
  const PUMPKIN = '<svg viewBox="0 0 220 200"><path d="M104 30q-2-18 10-26l8 4q-10 8-8 22z" fill="#3e2f1f" stroke="#e8862f" stroke-width="2"/>' +
    '<ellipse cx="110" cy="112" rx="104" ry="84" fill="#b8672a"/><ellipse cx="110" cy="112" rx="62" ry="84" fill="#d07428"/><ellipse cx="110" cy="112" rx="22" ry="84" fill="#e8862f"/>' +
    '<path d="M8 112q0 72 102 84q102-12 102-84" fill="none" stroke="#7a3c12" stroke-width="2"/>' +
    '<g class="glow" fill="#ffe2a0"><path d="M52 92l30-6-14 30z"/><path d="M168 92l-30-6 14 30z"/><path d="M110 112l9 18h-18z"/><path d="M48 140q62 44 124 0l-12 6-8-10-10 12-12-10-12 12-12-12-12 10-8-10-10 12-8-8z"/></g></svg>';
  const CURSOR = '<svg viewBox="0 0 24 34" width="28" height="40"><path d="M2 2v26l7-6 5 11 5-2-5-11h9z" fill="#f5f0e6" stroke="#16111f" stroke-width="2" stroke-linejoin="round"/></svg>';
  const SPLAT = '<svg viewBox="0 0 200 200"><path d="M100 18c14 0 12 26 26 28s28-22 38-10-12 30-2 42 36 0 36 16-30 10-30 26 26 26 14 38-30-8-40 4 2 36-14 38-14-28-28-28-24 26-36 16 6-30-6-40-34 6-36-10 26-18 22-32-26-22-14-34 30 6 36-8-6-36 10-40 18 20 26 20 6-26 20-26z" fill="#110c18" stroke="rgba(232,134,47,.4)" stroke-width="2"/></svg>';

  const TRICKS = {
    // 停電：全黑，只剩跟著滑鼠走的手電筒；兩秒後零韻從光圈裡冒出來
    async blackout(st, t) {
      const dark = h("div", { class: "tk-dark" });
      const setPos = () => { dark.style.setProperty("--mx", MOUSE.x + "px"); dark.style.setProperty("--my", MOUSE.y + "px"); };
      setPos();
      const move = () => setPos();
      addEventListener("mousemove", move);
      st.append(dark);
      play(dark, [{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: .15, offset: .3 }, { opacity: 1, offset: .42 }, { opacity: .3, offset: .5 }, { opacity: 1 }], 800);
      trickCaption(st, t, 1000);
      await sleep(2300);
      const peek = h("img", { class: "tk-peek", src: "assets/rein/happy.webp", alt: "", style: `left:${MOUSE.x}px;top:${MOUSE.y}px` });
      st.append(peek);
      play(peek, [{ transform: "translate(-50%,-30%) scale(0)" }, { transform: "translate(-50%,-50%) scale(1.15)", offset: .6 }, { transform: "translate(-50%,-50%) scale(1)" }], { duration: 360, easing: "cubic-bezier(.2,1.6,.4,1)" });
      await sleep(1700);
      removeEventListener("mousemove", move);
    },
    // 百鬼夜行：妖怪隊伍從右邊走到左邊，一跳一跳
    async parade(st, t) {
      const veil = h("div", { class: "tk-veil" });
      st.append(veil);
      play(veil, [{ opacity: 0 }, { opacity: 1 }], 400);
      const row = h("div", { class: "tk-parade" });
      for (let i = 0; i < 11; i++) row.append(h("span", { class: "tk-yokai", style: `height:${70 + (i % 3) * 22}px`, html: YOKAI[i % YOKAI.length] }));
      st.append(row);
      trickCaption(st, t, 700);
      [...row.children].forEach((y, i) => play(y, [{ transform: "translateY(0)" }, { transform: "translateY(-16px)", offset: .3 }, { transform: "translateY(0)", offset: .6 }, { transform: "translateY(0)" }], { duration: 560, iterations: 7, delay: i * 70, fill: "none" }));
      await play(row, [{ transform: "translateX(100vw)" }, { transform: "translateX(-105%)" }], { duration: 4200, easing: "linear" });
    },
    // 繃帶：一條條從兩側纏進來蓋滿畫面，停一下再整片掉下去
    async bandage(st, t) {
      const strips = [];
      for (let i = 0; i < 8; i++) {
        const r = (i % 2 ? -7 : 7) + (Math.random() * 4 - 2);
        const s = h("div", { class: "tk-band", style: `top:${i * 13 - 6}vh` });
        st.append(s); strips.push([s, r]);
        play(s, [{ transform: `translateX(${i % 2 ? 120 : -120}vw) rotate(${r}deg)` }, { transform: `translateX(${i % 2 ? -3 : 3}vw) rotate(${r}deg)`, offset: .75 }, { transform: `translateX(0) rotate(${r}deg)` }], { duration: 360, delay: i * 140, easing: "ease-out" });
      }
      trickCaption(st, t, 1400);
      await sleep(3100);
      await Promise.all(strips.map(([s, r], i) => play(s, [{ transform: `rotate(${r}deg)` }, { transform: `translateY(120vh) rotate(${r * 3}deg)` }], { duration: 650, delay: i * 50, easing: "cubic-bezier(.55,0,1,.6)" })));
    },
    // 滑鼠綁架：游標被小零韻抓走
    async cursor(st, t) {
      document.body.classList.add("tk-nocursor");
      const x0 = MOUSE.x, y0 = MOUSE.y;
      const cur = h("div", { class: "tk-cursor", style: `left:${x0}px;top:${y0}px`, html: CURSOR });
      const thief = h("img", { class: "tk-thief", src: "assets/rein/happy.webp", alt: "", style: `left:0;top:${Math.max(0, y0 - innerHeight * .2)}px` });
      st.append(cur, thief);
      trickCaption(st, t, 1300);
      await play(thief, [{ transform: `translateX(${innerWidth + 50}px)` }, { transform: `translateX(${x0 + 10}px)` }], { duration: 900, easing: "cubic-bezier(.2,.8,.3,1)" });
      await play(cur, [{ transform: "none" }, { transform: "translateY(-30px) rotate(-25deg)" }], { duration: 220, easing: "ease-out" });
      await sleep(500);
      play(thief, [{ transform: `translateX(${x0 + 10}px) scaleX(-1)` }, { transform: `translateX(-40vw) scaleX(-1)` }], { duration: 1300, easing: "cubic-bezier(.6,0,.9,.6)" });
      await play(cur, [{ transform: "translateY(-30px) rotate(-25deg)" }, { transform: `translate(${-x0 - innerWidth * .3}px, -30px) rotate(-25deg)` }], { duration: 1300, easing: "cubic-bezier(.6,0,.9,.6)" });
      await sleep(600);
      document.body.classList.remove("tk-nocursor");
    },
    // 掀桌：整個畫面往上翻過去，停在背面，再翻回來
    async table(st, t) {
      const slam = h("div", { class: "slam-text" }, "掀桌！");
      st.append(slam);
      trickCaption(st, t, 1500);
      await play($("#app"), [
        { transform: "none" },
        { transform: "translateY(-24px) rotate(-4deg)", offset: .1 },
        { transform: "translateY(-24px) rotate(-4deg)", offset: .18 },
        { transform: "perspective(1400px) translateY(20px) rotateX(180deg)", offset: .38 },
        { transform: "perspective(1400px) translateY(20px) rotateX(180deg)", offset: .75 },
        { transform: "translateY(-12px)", offset: .9 },
        { transform: "none" }], { duration: 4000, easing: "ease-in-out", fill: "none" });
    },
    // 南瓜罩頭：巨大南瓜從天而降，眼睛亮起來，最後被拉回去
    async pumpkin(st, t) {
      const pk = h("div", { class: "tk-pumpkin", html: PUMPKIN });
      st.append(pk);
      await play(pk, [{ transform: "translate(-50%,-160vh)", easing: "cubic-bezier(.55,0,1,.6)" }, { transform: "translate(-50%,-50%)", offset: .62 }, { transform: "translate(-50%,-46%) scale(1.04,.92)", offset: .74 }, { transform: "translate(-50%,-50%)" }], 900);
      const glow = pk.querySelector(".glow");
      play(glow, [{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: .3, offset: .3 }, { opacity: 1, offset: .45 }, { opacity: 1 }], 900);
      trickCaption(st, t, 300);
      await sleep(2400);
      await play(pk, [{ transform: "translate(-50%,-50%)" }, { transform: "translate(-50%,-44%)", offset: .2 }, { transform: "translate(-50%,-170vh)" }], { duration: 700, easing: "ease-in" });
    },
    // 蝙蝠群：三波蝙蝠掃過畫面
    async bats(st, t) {
      const veil = h("div", { class: "tk-veil" });
      st.append(veil);
      play(veil, [{ opacity: 0 }, { opacity: 1 }], 500);
      trickCaption(st, t, 1500);
      const flights = [];
      for (let i = 0; i < 42; i++) {
        const size = 34 + Math.random() * 56, wave = i % 3;
        const b = h("span", { class: "tk-bat", style: `top:${Math.random() * 88}vh;width:${size}px`, html: BAT });
        st.append(b);
        const dur = 1300 + Math.random() * 700, delay = wave * 900 + Math.random() * 500;
        play(b.firstChild, [{ transform: "scaleY(1)" }, { transform: "scaleY(.35)", offset: .5 }, { transform: "scaleY(1)" }], { duration: 220, iterations: Infinity });
        flights.push(play(b, [{ transform: `translate(110vw, 0)` }, { transform: `translate(-20vw, ${(Math.random() - .5) * 30}vh)` }], { duration: dur, delay, easing: "linear" }));
      }
      await Promise.all(flights);
      await sleep(300);
    },
    // 墨汁：六團墨一團一團砸上來，然後往下滴
    async ink(st, t) {
      const spots = [[8, 10], [52, 4], [70, 40], [22, 46], [46, 62], [80, 74], [4, 72]];
      spots.forEach(([x, y], i) => {
        const size = 34 + Math.random() * 16;
        const s = h("div", { class: "tk-splat", style: `left:${x}vw;top:${y}vh;width:${size}vmax;height:${size}vmax`, html: SPLAT });
        st.append(s);
        play(s, [{ transform: "scale(2.6) rotate(0deg)", opacity: 0 }, { transform: `scale(.9) rotate(${i * 40}deg)`, opacity: 1, offset: .6 }, { transform: `scale(1) rotate(${i * 40}deg)`, opacity: 1 }], { duration: 260, delay: i * 220, easing: "ease-out" });
        const drip = h("div", { class: "tk-drip", style: `left:calc(${x}vw + ${size * .45}vmax);top:calc(${y}vh + ${size * .8}vmax)` });
        st.append(drip);
        play(drip, [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 1600, delay: 1500 + i * 120, easing: "ease-in" });
      });
      trickCaption(st, t, 1700);
      await sleep(4100);
    },
    // 鬼語：畫面上所有字慢慢變成盧恩符文，停一下再變回來
    async runes(st, t) {
      const RUNE = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";
      const nodes = [];
      const walker = document.createTreeWalker($("#app"), NodeFilter.SHOW_TEXT, { acceptNode: n => n.nodeValue.trim() ? 1 : 2 });
      while (walker.nextNode()) nodes.push([walker.currentNode, walker.currentNode.nodeValue]);
      const scramble = frac => nodes.forEach(([n, s]) => { n.nodeValue = [...s].map(ch => ch.trim() && Math.random() < frac ? RUNE[Math.floor(Math.random() * RUNE.length)] : ch).join(""); });
      try {
        for (let k = 1; k <= 6; k++) { scramble(k / 6); await sleep(160); }
        const cap = await trickCaption(st, t, 100);
        const span = cap.querySelector("span"), text = span.textContent;
        span.textContent = [...text].map(ch => ch.trim() ? RUNE[Math.floor(Math.random() * RUNE.length)] : ch).join("");
        await sleep(900);
        for (let k = 0; k <= text.length; k += 2) { span.textContent = text.slice(0, k) + [...text.slice(k)].map(ch => ch.trim() ? RUNE[Math.floor(Math.random() * RUNE.length)] : ch).join(""); await sleep(45); }
        span.textContent = text;
        await sleep(1300);
      } finally {
        nodes.forEach(([n, s]) => { n.nodeValue = s; });
      }
      await sleep(300);
    },
    // 倒立圖書館：整個畫面倒過來，書從書架上掉下來堆在底下
    async upside(st, t) {
      const app = $("#app");
      play(app, [{ transform: "none" }, { transform: "rotate(186deg)", offset: .7 }, { transform: "rotate(180deg)" }], { duration: 700, easing: "ease-in-out" });
      trickCaption(st, t, 1200);
      const COLORS = ["#2b211b", "#33271f", "#3d2f24", "#241b16", "#4a3a2a", "#2a2040"];
      for (let i = 0; i < 26; i++) {
        const w = 18 + Math.random() * 18, hgt = 80 + Math.random() * 70, x = Math.random() * 96;
        const book = h("div", { class: "tk-book", style: `left:${x}vw;width:${w}px;height:${hgt}px;background:${pick(COLORS)}` });
        st.append(book);
        const rot = (Math.random() - .5) * 60, floor = innerHeight - hgt * .6 - Math.random() * 60;
        play(book, [{ transform: `translateY(-30vh) rotate(0deg)`, easing: "cubic-bezier(.55,0,1,.6)" }, { transform: `translateY(${floor}px) rotate(${rot}deg)`, offset: .82 }, { transform: `translateY(${floor - 14}px) rotate(${rot}deg)`, offset: .9 }, { transform: `translateY(${floor}px) rotate(${rot}deg)` }], { duration: 900 + Math.random() * 300, delay: 500 + Math.random() * 1600 });
      }
      await sleep(3400);
      await play(app, [{ transform: "rotate(180deg)" }, { transform: "rotate(-6deg)", offset: .75 }, { transform: "none" }], { duration: 600, easing: "ease-in-out", fill: "none" });
      app.getAnimations().forEach(a => a.cancel());
    }
  };
  const TRICK_ORDER = ["blackout", "parade", "bandage", "cursor", "table", "pumpkin", "bats", "ink", "runes", "upside"];
  async function playTrick(t) {
    const name = TRICKS[t.anim] ? t.anim : TRICK_ORDER[(t.id - 1) % TRICK_ORDER.length];
    const st = h("div", { class: "trick" });
    document.body.append(st);
    try {
      if (REDUCED) { await trickCaption(st, t, 0); await sleep(2600); }
      else await TRICKS[name](st, t);
      await play(st, [{ opacity: 1 }, { opacity: 0 }], 350);
    } finally {
      st.remove();
      document.body.classList.remove("tk-nocursor");
      $("#app").getAnimations().forEach(a => a.cancel());
    }
  }

  // ── 收集冊 ──
  const ALBUM = [
    ...COMBOS.filter(c => c.effect !== "cancel_instadeath").map(c => c.result),
    "大滿足", "傳說級料理", "夏威夷結局", "附子罐反轉", "神級食材",
    ...CONTAINERS.filter(c => c.params && c.params.skinName).map(c => c.params.skinName),
    "零韻暴走"
  ];
  function recordAlbum(chips) {
    if (S.sim) return;
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
  function resetRound(c) {
    S.container = c;
    S.contName = c.params && c.params.skinChance && Math.random() < c.params.skinChance ? c.params.skinName : c.name;
    S.grid = Array(CELLS).fill(null); S.hand = null; S.eaten = []; S.dropped = []; S.scattered = []; S.spilled = null;
    S.deck = D.ingredients.slice(); S.penalty = 0; S.turn = 0; S.busy = false;
    S.flags = { affNoted: S.flags.affNoted };
    S.combo = 0;
    shownScore = 0;
    if (!S.sim) $("#comboBadge").hidden = true;
  }
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
    resetRound(c);
    $("#contName").textContent = S.contName;
    $("#contRule").textContent = ruleText(c);
    log(S.contName !== c.name ? `⋯⋯咦？南瓜盅變成了${S.contName}。好復古。` : `要求：${reqText(S.req)}。堆過盤緣會打翻，覺得夠了就收手。`);
    show("screen-play");
    renderPlate(); setButtons();
    onDraw();
    say(c.rule === "pineapple_legal" ? "⋯⋯披薩啊。" : "開始吧。對準了再放手。", c.rule === "pineapple_legal" ? "deadpan" : "idle");
  }

  // ── 證書 ──
  function dishName(L) {
    const coll = L.sc.combos.find(c => c.effect === "collection" || c.effect === "ending");
    if (coll && !L.fatal) return coll.result;
    const items = liveItems().filter(x => !x.dup).sort((a, b) => itemPoints(b) - itemPoints(a));
    const a = items[0], b = items[1];
    let n = a ? (b ? `${displayName(a)}佐${displayName(b)}` : displayName(a)) : "空氣";
    n += `・${S.contName}盛裝`;
    if (L.type === "flip") n = `被掀翻的${n}`;
    else if (L.type === "spill") n = `打翻在地的${n}`;
    else if (L.fatal) n = `來不及上桌的${n}`;
    else if (L.grade === "legend") n = `傳說的${n}`;
    return n;
  }
  // ── 證書上的像素料理圖：程式自己畫的 16×16 點陣，不用外部素材 ──
  // 每列會自動置中；字母對應下面的色票（同一套紫黑＋南瓜橘）
  const PIX_PAL = { l: "#f8ddb4", k: "#16111f", o: "#e8862f", d: "#b8672a", y: "#f4b46a", b: "#6b3f22", c: "#fffaf0", p: "#3b2d55", g: "#a89cb0" };
  const PIX_DISHES = {
    pumpkin: ["kk", "bk", "..kkkbbkkk..", ".kyodoodook.", "kyoodoodoook", "kokkoddokkok", "kookoddokook",
      "kooooddooook", "kokkkkkkkkok", "kookkookkook", ".koooddoook.", "..kkkkkkkk..", ".gggggggggg."],
    soup: ["...g...g......", "....g...g.....", "...g...g......", "..............",
      "kkkkkkkkkkkkkk", "kyoodooooyoodk", "kpcppppppppppk", ".kpcppppppppk.", "..kppppppppk..",
      "...kkkkkkkk...", "....kppppk....", "...kkkkkkkk..."],
    pie: ["kk............", "kokk..........", "kooookk.......", "koocooookk....", "kooooooooookk.",
      "kyyyyyyyyyyddk", "kyyyyyyyyyyddk", "kbbbbbbbbbbbbk", "kkkkkkkkkkkkkk", ".gggggggggggg."],
    drumstick: [".......kkkk...", ".....kkyoodk..", "....kyooooddk.", "....koooooddk.", "....kooooddk..",
      "....koodddk...", "...kkdddkk....", "..kcckk.......", ".kcck.........", "kccck.........", ".kkk.........."],
    cake: [".....yo.....", ".....oo.....", "....kkkk....", "....kcck....", "....kcck....",
      ".kkkkkkkkkk.", "kooooooooook", "kooodooodook", "kpoppopppopk", "kppppppppppk",
      "kppppppppppk", "kkkkkkkkkkkk", "gggggggggggg"],
    tea: ["....g..g......", ".....g..g.....", "....g..g......", "kkkkkkkkkk....", "kooodoooyk....",
      "kppppppppkkk..", "kpcppppppk.k..", "kpcppppppkkk..", ".kppppppk.....", "..kkkkkk......", "gggggggggggg.."],
    cauldron: ["....yy...y....", "...y..yy......", "kkkkkkkkkkkkkk", "kooyoodoooyook", ".kkkkkkkkkkkk.",
      "kpcppppppppppk", "kpcppppppppppk", "kppppppppppppk", ".kppppppppppk.", "..kkkkkkkkkk..",
      "..k.k....k.k..", "...oyo..oyo..."],
    ghost: ["....kkkk....", "..kkcccckk..", ".kcccccccck.", "kcccccccccck", "kcckcccckcck", "kcckcccckcck",
      "kcccccccccck", "kcccckkcccck", "kcccccccccck", "kcccccccccck", "kcckkcckkcck", ".kk..kk..kk."],
    spilled: ["o.............o.", "..o.........o...", ".....kkkkkk.....", "....kpppcppk....", "...kppppppcpk...",
      "...kpppppppppk..", "..kkkkkkkkkkkkk.", ".oyooooooooodoo.", "o..oodooodoo..o."]
  };
  // 證書料理圖分等級：差很多＝燒焦冒黑煙、差一點＝有點焦、過關＝原樣、大滿足＝閃光、傳說＝金盤加光環
  // 同一等級也會隨機左右翻、換深淺、閃光換位置，所以每張都不太一樣
  function pixTier(L) {
    if (L.fatal) return "fatal";
    if (L.grade === "legend" || L.grade === "great") return L.grade;
    if (L.treat) return "good";
    return L.total / Math.max(1, L.req.total) < .5 ? "burnt" : "singed";
  }
  function pixRng(seed) {
    return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // 20×20 格畫成 160px 的 PNG：證書顯示 80px、html2canvas 兩倍截圖時剛好一比一，不會糊
  function pixelDish(name, tier, seed) {
    const N = 20, U = 8, rnd = pixRng(seed), rows = PIX_DISHES[name];
    const m = Array.from({ length: N }, () => Array(N).fill("."));
    const w = Math.max(...rows.map(r => r.length)), top = Math.floor((N - rows.length + 1) / 2) + 1;
    rows.forEach((r, y) => {
      const left = Math.floor((N - w) / 2) + Math.floor((w - r.length) / 2);
      [...r].forEach((ch, x) => { m[top + y][left + x] = ch; });
    });
    if (rnd() < .5) m.forEach(r => r.reverse());
    const each = f => m.forEach((r, y) => r.forEach((ch, x) => { const v = f(ch, x, y); if (v) r[x] = v; }));
    const free = (x, y) => x >= 0 && y >= 0 && x < N && y < N && m[y][x] === ".";
    const put = (x, y, ch) => { if (free(x, y)) m[y][x] = ch; };
    const sparkle = (x, y, big) => { put(x, y, "c"); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => put(x + dx, y + dy, "y")); if (big) [[2, 0], [-2, 0], [0, 2], [0, -2]].forEach(([dx, dy]) => put(x + dx, y + dy, "o")); };
    const spots = [[2, 2], [17, 2], [2, 16], [17, 16], [17, 9], [2, 9], [10, 1]].sort(() => rnd() - .5);
    // 料理最上面那一列，煙和光環從這裡往上畫
    const crown = m.findIndex(r => r.some(ch => ch !== "."));
    const xs = m[crown].map((ch, x) => ch !== "." ? x : -1).filter(x => x >= 0);
    const smoke = (n, col) => {
      for (let i = 0; i < n; i++) {
        let x = xs[Math.floor(rnd() * xs.length)] + Math.round(rnd() * 2 - 1);
        for (let y = crown - 1; y >= Math.max(0, crown - 4); y--) { put(x, y, col); x += rnd() < .5 ? -1 : 1; }
      }
    };
    if (tier === "fatal") {
      for (let i = 0; i < 4; i++) put(Math.floor(rnd() * N), 12 + Math.floor(rnd() * 6), rnd() < .5 ? "o" : "d");
    } else if (tier === "burnt") {
      each(ch => ({ o: "b", y: "d", d: "b", c: "g", p: "k" })[ch]);
      each(ch => ch === "b" && rnd() < .3 ? "k" : null);
      smoke(3, "p");
    } else if (tier === "singed") {
      each(ch => (ch === "o" || ch === "y") && rnd() < .4 ? (rnd() < .5 ? "d" : "b") : null);
      smoke(1, "g");
    } else {
      // 過關以上：三成機率整盤換深或淺一號
      const tone = rnd();
      if (tone < .15) each(ch => ({ o: "y", d: "o" })[ch]);
      else if (tone < .3) each(ch => ({ o: "d", y: "o" })[ch]);
      if (tier === "good" && rnd() < .35) sparkle(...spots[0], false);
      if (tier === "great") { sparkle(...spots[0], true); sparkle(...spots[1], false); if (rnd() < .5) sparkle(...spots[2], false); }
      if (tier === "legend") {
        // 傳說：金盤＋背後一圈金色圓光，四角大閃光
        each(ch => ch === "g" ? "y" : null);
        [[2, 2], [17, 2], [2, 17], [17, 17]].forEach(([x, y], i) => sparkle(x, y, i % 2 === (rnd() < .5 ? 0 : 1)));
        each((ch, x, y) => { if (ch !== ".") return null; const d = Math.hypot(x - 9.5, y - 9.5); return d < 8.4 ? "l" : d < 9.4 ? "y" : null; });
      }
    }
    const cv = document.createElement("canvas");
    cv.width = cv.height = N * U;
    const g = cv.getContext("2d");
    m.forEach((r, y) => r.forEach((ch, x) => { if (PIX_PAL[ch]) { g.fillStyle = PIX_PAL[ch]; g.fillRect(x * U, y * U, U, U); } }));
    return cv.toDataURL("image/png");
  }
  // 每局抽一張料理、一個隨機種子；掀盤、打翻這類失敗固定是打翻的碗
  function certPixel(L) {
    if (!L.pixel) {
      const pool = Object.keys(PIX_DISHES).filter(k => k !== "spilled");
      L.pixel = { name: L.fatal ? "spilled" : pool[Math.floor(Math.random() * pool.length)], seed: Math.floor(Math.random() * 1e9) };
    }
    return pixelDish(L.pixel.name, pixTier(L), L.pixel.seed);
  }
  function buildCert() {
    const L = S.last, el = $("#cert");
    el.textContent = "";
    const now = new Date();
    const serial = "No. " + String(Math.floor(1000 + Math.random() * 9000)) + "-" + (now.getMonth() + 1) + now.getDate();
    const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;

    const row = (x, p, off, tag) => {
      const name = displayName(x) + (x.juiced ? "汁" : "") + (x.fake ? "（贗品）" : "") + (x.dup ? "（複製）" : "") + (tag || "");
      return h("div", { class: "c-row" + (off ? " off" : "") }, h("span", { class: "n" }, h("span", { class: "rk" }, x.rar.id), name), h("span", { class: "p" }, p));
    };
    const rows = [];
    allItems().sort((a, b) => a.cells[0] - b.cells[0]).forEach(x => {
      let p, off = false;
      if (x.vanished) { p = "消失"; off = true; }
      else if (x.neutralized) { p = "中和"; off = true; }
      else if (L.fatal && x !== L.kept) { p = "—"; off = true; }
      else if (x.ing.rule === "flip" && S.container.rule !== "pineapple_legal") p = L.type === "hawaiian" ? "傳說" : "地雷";
      else p = pts(itemPoints(x));
      rows.push(row(x, p, off, (isGroup(x) ? `（${x.members.length} 件合體）` : "") + (x === L.kept ? "（甕底）" : "")));
    });
    S.eaten.forEach(x => rows.push(row(x, "偷吃", true)));
    S.dropped.forEach(x => rows.push(row(x, "掉落", true)));
    S.scattered.forEach(x => rows.push(row(x, "被剋散", true)));
    if (S.spilled && !S.spilled.cells.length) rows.push(row(S.spilled, "打翻", true));
    if (!L.fatal) {
      for (const combo of L.sc.combos) if (combo.bonus) rows.push(h("div", { class: "c-row extra" }, h("span", { class: "n" }, `組合：${combo.result}`), h("span", { class: "p" }, "+" + pts(combo.bonus))));
      if (S.penalty) rows.push(h("div", { class: "c-row extra" }, h("span", { class: "n" }, "頭皿乾涸"), h("span", { class: "p" }, "−" + pts(S.penalty))));
      if (S.container.baseScore) rows.push(h("div", { class: "c-row extra" }, h("span", { class: "n" }, `${S.contName}基礎分`), h("span", { class: "p" }, "+" + pts(S.container.baseScore))));
    }
    const listCls = "c-list" + (rows.length > 9 ? " two" : "");
    const shown = rows.length > 24 ? rows.slice(0, 23).concat(h("div", { class: "c-row extra" }, h("span", { class: "n" }, `⋯⋯另有 ${rows.length - 23} 項`))) : rows;

    const taste = L.fatal ? null : h("div", { class: "c-taste" },
      L.sc.axes.map((v, i) => h("span", {}, AXES[i] + " ", h("span", { class: "mx" }, v))),
      h("span", {}, `要求：${reqText(L.req)}`));

    el.append(
      h("div", { class: "c-head" },
        h("div", { class: "c-en" }, "Certificate of Halloween Culinary Appraisal"),
        h("div", { class: "c-title" }, "萬聖節料理鑑定證書"),
        h("div", { class: "c-no" }, h("span", {}, serial), h("span", {}, "月上零韻圖書館餐廳"), h("span", {}, date))),
      h("div", { class: "c-dish" }, h("img", { class: "c-pixel", src: certPixel(L), alt: "" }), h("span", {}, dishName(L))),
      h("div", { class: "c-cont" }, `器：${S.contName}　｜　上盤 ${S.grid.filter(Boolean).length} / ${CELLS} 格`),
      h("div", { class: listCls }, shown),
      h("div", { class: "c-total" },
        h("span", { class: "l" }, "鑑定分數"),
        h("span", { class: "pl" }, `要求 ${L.req.total} 分`),
        h("span", { class: "v" }, pts(L.total))),
      taste || "",
      h("div", { class: "c-bottom" },
        h("div", { class: "c-left" },
          h("div", { class: "c-verdict-l" }, "鑑定師判詞"),
          h("div", { class: "c-verdict" }, "「" + (L.lines[0] || "") + "」", L.lines[1] ? h("span", { class: "sub" }, L.lines[1]) : null),
          L.trick ? h("div", { class: "c-trick" }, h("b", {}, `TRICK #${L.trick.id}`), "　" + (L.trick.text || "")) : null,
          L.chips.length ? h("div", { class: "c-chips" }, L.chips.map(c => h("span", { class: "c-chip" }, c))) : null),
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
      for (const img of $("#cert").querySelectorAll("img")) if (!img.complete) await new Promise(r => { img.onload = img.onerror = r; });
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

  // ── 數值校準用模擬（網址加 ?debug 才開）：隨機落點、堆到 stop 層就收手 ──
  function simulate(n = 500, stop = 3, aimSkill = 0.15) {
    const keep = { ...S };
    S.sim = true;
    const totals = [], out = { n, stop, treat: 0, trick: 0, fatal: {}, other: 0, ratio: [] };
    for (let k = 0; k < n; k++) {
      resetRound(pick(CONTAINERS));
      S.req = rollRequest();
      let res = null;
      while (!res && S.deck.length && !topFull() && stackHeight() < stop) {
        const x = drawItem();
        if (x.ing.rule === "fake_label" && Math.random() < .5) continue;
        if (x.ing.rule === "fake_label") S.flags.busuKept = true;
        // 模擬玩家的放手誤差：偏離中心的程度 ~ |常態| × aimSkill
        const w = shapeW(x.shape), g = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
        const { col } = release(x, { col: randInt(0, COLS - w), f: Math.min(.5, Math.abs(g) * aimSkill), lean: pick([-1, 1]) });
        const imp = impactStep(x, placeAt(x, col));
        if (imp.fatal) { res = imp.fatal.type; break; }
        fuseStep();
        for (let k = 0; k < 6; k++) { const wx = wuxingStep(); if (!wx.gone.length && !wx.turned.length) break; fuseStep(); }
        const tox = toxicStep(x);
        if (tox.fatal) { res = tox.fatal.type; break; }
        if (cont().rule === "need_liquid" && !liveItems().some(isLiquid)) S.penalty += S.container.params.penaltyPerTurn;
      }
      if (!res) {
        if (liveItems().some(x => x.ing.rule === "instadeath" && !mandrakeSafe(x))) res = "instadeath_mandrake";
        else {
          allItems().flatMap(members).forEach(m => { m.revealed = true; });
          allItems().filter(isGroup).forEach(refreshGroup);
          const sc = score();
          totals.push(sc.total);
          out.ratio.push(sc.total / S.req.total);
          res = meets(sc) ? "treat" : "trick";
        }
      }
      if (res === "treat") out.treat++;
      else if (res === "trick") out.trick++;
      else out.fatal[res] = (out.fatal[res] || 0) + 1;
    }
    Object.assign(S, keep);
    totals.sort((a, b) => a - b);
    const q = p => totals[Math.floor((totals.length - 1) * p)];
    out.totals = { p10: q(.1), p25: q(.25), p50: q(.5), p75: q(.75), p90: q(.9) };
    out.ratio.sort((a, b) => a - b);
    out.great = out.ratio.filter(r => r >= C.grades.great).length;
    out.legend = out.ratio.filter(r => r >= C.grades.legend).length;
    delete out.ratio;
    return out;
  }
  if (new URLSearchParams(location.search).has("debug")) window.__rein = { simulate, state: S, playTrick, renderPlate, pixelDish };

  // ── 綁定 ──
  $("#plate").style.cssText = `grid-template-columns:repeat(${COLS},minmax(0,1fr));grid-template-rows:repeat(${ROWS},minmax(0,1fr));aspect-ratio:${COLS}/${ROWS};`;
  $("#btnStart").onclick = toContainers;
  // 大圓鈕：按下去的瞬間就放手（抓時機的遊戲，不等手指抬起）；不搶焦點，免得空白鍵又按到它
  const domePress = () => (S.hand ? onDrop() : onDraw());
  $("#btnDraw").addEventListener("pointerdown", e => {
    if (e.button || $("#btnDraw").disabled) return;
    e.preventDefault();
    $("#btnDraw").classList.add("press");
    buzz(10);
    SFX.play("press");
    domePress();
  });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) $("#btnDraw").addEventListener(ev, () => $("#btnDraw").classList.remove("press"));
  $("#btnDraw").addEventListener("click", e => { if (e.detail === 0) domePress(); });
  bindLever();
  $("#btnDiscard").onclick = onDiscard;
  $("#btnRotate").onclick = onRotate;
  $("#btnAgain").onclick = toContainers;
  $("#btnCard").onclick = openCard;
  $("#btnDex").onclick = openDex;
  $("#dexClose").onclick = () => { $("#dexModal").hidden = true; };
  $("#dexModal").onclick = e => { if (e.target.id === "dexModal") $("#dexModal").hidden = true; };
  $("#btnClose").onclick = () => { $("#cardModal").hidden = true; };
  $("#cardModal").onclick = e => { if (e.target.id === "cardModal") $("#cardModal").hidden = true; };
  $("#infoModal").onclick = e => { if (e.target.id === "infoModal") closeInfo(); };
  // 滑鼠可以直接點盤子撒；手機只靠機台按鈕，點盤子只看詳情
  $("#well").addEventListener("click", e => { if (!COARSE && S.hand && !e.target.closest(".piece")) onDrop(); });
  const toggleObs = () => document.body.classList.toggle("obs");
  $("#btnObs").onclick = toggleObs;
  const soundLabel = () => { $("#btnSound").textContent = SFX.on ? "音效：開" : "音效：關"; };
  $("#btnSound").onclick = () => { SFX.toggle(); soundLabel(); };
  soundLabel();
  // 手機瀏覽器要等第一次點擊才能出聲
  document.addEventListener("pointerdown", () => SFX.unlock(), { once: true });
  if (new URLSearchParams(location.search).has("obs")) document.body.classList.add("obs");
  document.addEventListener("keydown", e => {
    if (e.target.closest("input, textarea")) return;
    if (e.key === "Escape") { $("#cardModal").hidden = true; $("#dexModal").hidden = true; closeInfo(); return; }
    const playing = !$("#screen-play").hidden && $("#infoModal").hidden && $("#dexModal").hidden;
    if (playing && e.code === "Space") { e.preventDefault(); if (!e.repeat) (S.hand ? onDrop() : onDraw()); }
    else if (playing && e.code === "Enter") { e.preventDefault(); onServe(); }
    else if (playing && (e.key === "r" || e.key === "R" || e.key === "ArrowUp")) { e.preventDefault(); onRotate(); }
    else if (e.key === "t" || e.key === "T") toggleObs();
    else if (e.key === "m" || e.key === "M") { SFX.toggle(); soundLabel(); }
  });

  // 預載立繪，換表情不閃
  FACES.forEach(f => { const i = new Image(); i.src = `assets/rein/${f}.webp`; });
  requestAnimationFrame(ghostTick);
  renderMeters();
  renderAlbum();
  say("歡迎光臨。今晚想讓我吃什麼？", "idle");
  show("screen-title");
})();
