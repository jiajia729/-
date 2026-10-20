/* 魔女語翻譯引擎（規則模式）
 * 純函式，不依賴瀏覽器，可以在 Node 測試。
 * 來源標記：official 官方詞表、lyrics 從歌詞推測、rule 規則補上、coined 自創、unknown 查不到、punct 標點
 */
(function (root) {
  "use strict";

  // 中文功能詞 → 魔女語（優先於一般詞庫）
  const FUNCTION_WORDS = [
    ["我們", "WAirTell", "代名詞"], ["我", "WAirTell", "代名詞"],
    ["你們", "rAwTell", "代名詞"], ["妳", "rAwTell", "代名詞"], ["你", "rAwTell", "代名詞"],
    ["他們", "ObTell", "代名詞"], ["她們", "ObTell", "代名詞"],
    ["他", "ObTell", "代名詞"], ["她", "ObTell", "代名詞"], ["它", "ObTell", "代名詞"],
    ["這個", "Ado", "指示代名詞"], ["這", "Ado", "指示代名詞"],
    ["那個", "Ada", "指示代名詞"], ["那", "Ada", "指示代名詞"],
    ["這裡", "Edo", "指示代名詞"], ["那裡", "Eda", "指示代名詞"],
    ["的", "N'o", "助詞"],
    ["不能", "Ca-nay", "助動詞"], ["不可以", "Ca-nay", "助動詞"], ["不會", "Ca-nay", "助動詞"],
    ["可以", "Ca-nan", "助動詞"], ["能夠", "Ca-nan", "助動詞"], ["能", "Ca-nan", "助動詞"], ["會", "Ca-nan", "助動詞"],
    ["應該", "ShouBeK", "助動詞"], ["也許", "meKaMo", "助動詞"], ["可能", "meKaMo", "助動詞"], ["大概", "DiGhT", "助動詞"],
    ["沒有", "Nii", "否定"], ["不要", "Nii", "否定"], ["不是", "Nii", "否定"], ["不", "Nii", "否定"], ["沒", "Nii", "否定"], ["別", "Nii", "否定"],
    ["像", "Lai Nei", "前置詞"],
    ["因為", "KaRause", "連接詞"], ["如果", "Mof", "連接詞"], ["或者", "Owk", "連接詞"], ["或是", "Owk", "連接詞"],
    ["謝謝", "San-kAtoH", "感嘆詞"], ["對不起", "So-meRRy", "感嘆詞"],
    ["很", "Kanather", "副詞"], ["非常", "Kanather", "副詞"],
  ];
  // 中文裡沒有對應、直接略過的字
  const DROP = new Set(["是", "個", "隻", "位", "了", "著", "過", "嗎", "呢", "啊", "呀", "吧", "請", "把", "被"]);
  const AUX_POS = new Set(["助動詞", "否定"]);
  const VERB_POS = new Set(["動詞"]);
  const NOUNISH = new Set(["名詞", "代名詞", "指示代名詞", "數詞", "unknown"]);
  const ADJ_POS = new Set(["形容詞", "形容動詞"]);
  const PUNCT_RE = /^[，。！？、；：,.!?;:「」『』（）()“”"'…\s]+$/;

  const DIGITS = { "零": 0, "〇": 0, "一": 1, "二": 2, "兩": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
  const UNITS = { "十": 10, "百": 100, "千": 1000 };
  const WITCH_DIGIT = ["", "wachi", "tuni", "san", "foshi", "fago", "sik", "naven", "echi", "nakyu"];

  function normalizeWitch(s) {
    return String(s).replace(/[・•‧･]/g, "·").replace(/[’‘`´]/g, "'").replace(/\s+/g, " ").trim();
  }

  function parseTSV(text) {
    const lines = String(text).replace(/\r/g, "").split("\n").filter(l => l.trim());
    const head = lines.shift().split("\t");
    return lines.map(l => {
      const cells = l.split("\t");
      const o = {};
      head.forEach((h, i) => (o[h] = (cells[i] || "").trim()));
      o.witch = normalizeWitch(o.witch);
      return o;
    });
  }

  // 把詞庫中文欄拆成可比對的關鍵字
  function zhKeys(zh) {
    if (!zh || zh.startsWith("（")) return [];
    return zh
      .replace(/（[^）]*）/g, "")
      .split(/[、，,／\/]/)
      .map(s => s.trim())
      .filter(s => s && !s.includes("…"));
  }

  function build(rows, coined) {
    const all = rows.concat((coined || []).map(c => Object.assign({ source: "coined" }, c, { witch: normalizeWitch(c.witch) })));
    const zhMap = new Map(); // 中文 → 詞條
    const witchMap = new Map(); // 魔女語（原樣）→ 詞條
    const witchLower = new Map();
    const rank = { official: 0, lyrics: 1, coined: 2 };
    for (const r of all) {
      for (const k of zhKeys(r.zh)) {
        const cur = zhMap.get(k);
        if (!cur || (rank[r.source] ?? 9) < (rank[cur.source] ?? 9) || (r.pos === "動詞" && cur.pos !== "動詞" && rank[r.source] === rank[cur.source])) zhMap.set(k, r);
      }
      if (!witchMap.has(r.witch)) witchMap.set(r.witch, r);
      const lw = r.witch.toLowerCase();
      if (!witchLower.has(lw)) witchLower.set(lw, r);
    }
    const fw = new Map();
    for (const [zh, w, pos] of FUNCTION_WORDS) {
      const entry = witchMap.get(w);
      fw.set(zh, { witch: w, pos, zh, ja: entry ? entry.ja : "", source: entry ? entry.source : "rule", fromFunction: true });
    }
    let maxLen = 1;
    for (const k of zhMap.keys()) maxLen = Math.max(maxLen, k.length);
    for (const k of fw.keys()) maxLen = Math.max(maxLen, k.length);
    return { rows: all, zhMap, fw, witchMap, witchLower, maxLen };
  }

  /* ---------- 數字 ---------- */
  function parseZhNumber(s) {
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    let total = 0, cur = 0;
    for (const ch of s) {
      if (ch in DIGITS) cur = DIGITS[ch];
      else if (ch in UNITS) { total += (cur || 1) * UNITS[ch]; cur = 0; }
      else return null;
    }
    return total + cur;
  }
  function numberToWitch(n) {
    if (n === 13) return { witch: "tone thn", source: "official" };
    if (n >= 1 && n <= 9) return { witch: WITCH_DIGIT[n], source: "official" };
    if (n === 10) return { witch: "tone", source: "official" };
    if (n === 11 || n === 12) return { witch: "tone " + WITCH_DIGIT[n - 10], source: "official" };
    if (n === 100) return { witch: "haku", source: "official" };
    if (n === 1000) return { witch: "son'", source: "official" };
    if (n <= 0 || n > 9999) return null;
    const parts = [];
    const th = Math.floor(n / 1000), h = Math.floor((n % 1000) / 100), t = Math.floor((n % 100) / 10), o = n % 10;
    if (th) parts.push((th > 1 ? WITCH_DIGIT[th] + " " : "") + "son'");
    if (h) parts.push((h > 1 ? WITCH_DIGIT[h] + " " : "") + "haku");
    if (t) parts.push((t > 1 ? WITCH_DIGIT[t] + " " : "") + "tone");
    if (o) parts.push(WITCH_DIGIT[o]);
    return { witch: parts.join(" "), source: "rule" };
  }

  /* ---------- 中文 → 魔女語 ---------- */
  function segmentZh(text, idx) {
    const out = [];
    let i = 0, unknown = "";
    const flush = () => { if (unknown) { out.push({ zh: unknown, witch: unknown, pos: "unknown", source: "unknown" }); unknown = ""; } };
    while (i < text.length) {
      const ch = text[i];
      if (PUNCT_RE.test(ch)) {
        flush();
        let j = i; while (j < text.length && PUNCT_RE.test(text[j])) j++;
        out.push({ zh: text.slice(i, j), witch: text.slice(i, j).trim() ? text.slice(i, j) : " ", pos: "punct", source: "punct" });
        i = j; continue;
      }
      const numM = text.slice(i).match(/^(\d+|[零〇一二兩三四五六七八九十百千]+)/);
      if (numM) {
        const n = parseZhNumber(numM[1]);
        const w = n != null ? numberToWitch(n) : null;
        if (w && !(numM[1].length === 1 && "一".includes(numM[1]) && /[個些點下樣起]/.test(text[i + 1] || ""))) {
          flush();
          out.push({ zh: numM[1], witch: w.witch, pos: "數詞", source: w.source });
          i += numM[1].length; continue;
        }
      }
      let hit = null;
      for (let L = Math.min(idx.maxLen, text.length - i); L >= 1; L--) {
        const sub = text.slice(i, i + L);
        const f = idx.fw.get(sub);
        const d = idx.zhMap.get(sub);
        // 功能詞與詞庫同長時，功能詞優先；較長的詞庫詞優先於較短的功能詞
        if (f) { hit = { zh: sub, witch: f.witch, pos: f.pos, source: f.source, ja: f.ja }; break; }
        if (d) { hit = { zh: sub, witch: d.witch, pos: d.pos, source: d.source, ja: d.ja }; break; }
      }
      if (hit) { flush(); out.push(hit); i += hit.zh.length; continue; }
      if (DROP.has(ch)) { flush(); out.push({ zh: ch, witch: "", pos: "drop", source: "drop", imperative: ch === "吧" || ch === "請" }); i++; continue; }
      unknown += ch; i++;
    }
    flush();
    return out;
  }

  function reorderClause(tokens) {
    const imperative = tokens.some(t => t.imperative);
    const rule = (witch, zh, note) => ({ zh, witch, pos: "助詞", source: "rule", note });
    // 「是」：名詞 是 名詞 → 名詞 Iz'u 名詞
    const hasVerb = tokens.some(t => VERB_POS.has(t.pos));
    tokens = tokens.map((t, k) => (t.zh === "是" && t.source === "drop" && !hasVerb && k > 0 ? rule("Iz'u", "（は）", "主題助詞（是）") : t));
    // 形容詞＋的＋名詞 → 去掉 N'o（gDie GoMi）
    tokens = tokens.filter((t, k) => !(t.witch === "N'o" && k > 0 && ADJ_POS.has(tokens[k - 1].pos)));
    const toks = tokens.filter(t => t.source !== "drop");
    if (!toks.length) return toks;
    if (toks.some(t => t.note === "主題助詞（是）")) return toks;
    // 句首連接詞保持在前
    const lead = [];
    while (toks.length && toks[0].pos === "連接詞") lead.push(toks.shift());
    let v = toks.findIndex(t => VERB_POS.has(t.pos));
    if (v < 0) {
      // 沒有動詞：名詞＋形容詞 → 名詞 Iz'u 形容詞
      const a = toks.findIndex((t, k) => k > 0 && (ADJ_POS.has(t.pos) || t.pos === "副詞"));
      if (a > 0 && NOUNISH.has(toks[a - 1].pos)) toks.splice(a, 0, rule("Iz'u", "（は）", "主題助詞"));
      return lead.concat(toks);
    }
    // 動詞前面的助動詞、否定、副詞移到動詞後面（日語順序）
    const pre = toks.slice(0, v);
    const verb = toks[v];
    const post = toks.slice(v + 1);
    const moved = [];
    while (pre.length && (AUX_POS.has(pre[pre.length - 1].pos))) moved.unshift(pre.pop());
    const subject = pre;
    // 動詞後面若緊接助動詞（少見）也留在動詞後
    const tailAux = [];
    while (post.length && AUX_POS.has(post[post.length - 1].pos)) tailAux.unshift(post.pop());
    // 受詞裡還有動詞（例：喜歡「吃蘋果」）→ 受詞本身也照日語語序排
    let object = post;
    const nested = object.some(t => VERB_POS.has(t.pos));
    if (nested) object = reorderClause(object.map(t => Object.assign({}, t, { imperative: false })));
    const out = lead.slice();
    out.push(...subject);
    if (subject.length && NOUNISH.has(subject[subject.length - 1].pos)) out.push(rule("Iz'u", "（は）", "主題助詞"));
    out.push(...object);
    if (object.length && !nested && object[object.length - 1].pos !== "punct") out.push(rule("Iz'u", "（を）", "受詞助詞"));
    out.push(verb);
    // 否定放在助動詞前：動詞 Nii Ca-nan 不自然，改為 動詞 Ca-nay 的情況已由功能詞處理
    out.push(...moved, ...tailAux);
    if (imperative) out.push(rule("oRei", "（命令）", "命令形"));
    return out;
  }

  function zhToWitch(text, idx) {
    const segs = segmentZh(String(text).trim(), idx);
    // 依標點切成子句分別調整語序
    const out = [];
    let clause = [];
    const flush = () => { if (clause.length) out.push(...reorderClause(clause)); clause = []; };
    for (const t of segs) {
      if (t.source === "punct") { flush(); out.push(t); } else clause.push(t);
    }
    flush();
    return { tokens: out, text: renderWitch(out) };
  }

  function renderWitch(tokens) {
    let s = "";
    for (const t of tokens) {
      if (!t.witch) continue;
      if (t.source === "punct") {
        const p = t.witch.trim().replace(/，/g, ", ").replace(/。/g, ". ").replace(/！/g, "! ").replace(/？/g, "? ").replace(/、/g, ", ");
        s = s.replace(/\s+$/, "") + p;
        continue;
      }
      s += (s && !/\s$/.test(s) ? " " : "") + t.witch;
    }
    return s.replace(/\s+/g, " ").trim();
  }

  /* ---------- 魔女語 → 中文 ---------- */
  function tokenizeWitch(text) {
    const norm = normalizeWitch(text);
    const parts = [];
    const re = /([,.!?;:，。！？、；：]+)|(\S+)/g;
    let m;
    while ((m = re.exec(norm))) {
      if (m[1]) parts.push({ punct: m[1] });
      else {
        // 單字尾端的標點分開
        const w = m[2].match(/^(.*?)([,.!?;:，。！？、；：]*)$/);
        if (w[1]) parts.push({ word: w[1] });
        if (w[2]) parts.push({ punct: w[2] });
      }
    }
    return parts;
  }

  function firstGloss(entry) {
    const keys = zhKeys(entry.zh);
    if (keys.length) return keys[0];
    return entry.zh || entry.ja || entry.witch;
  }

  const WITCH_FUNCTION_ZH = {
    "Iz'u": "", "N'o": "的", "oRei": "", "oRe": "", "Bah": "", "Lai Nei": "像", "Ca-nan": "能", "Ca-nay": "不能",
    "ShouBeK": "應該", "meKaMo": "也許", "DiGhT": "大概", "Nii": "不", "WAirTell": "我", "rAwTell": "你", "ObTell": "他／她",
  };

  function lookupWitch(seq, idx) {
    const key = seq.join(" ");
    return idx.witchMap.get(key) || idx.witchLower.get(key.toLowerCase()) || null;
  }

  function witchToZh(text, idx) {
    const parts = tokenizeWitch(text);
    const tokens = [];
    let i = 0;
    while (i < parts.length) {
      const p = parts[i];
      if (p.punct) { tokens.push({ witch: p.punct, zh: p.punct.replace(/,/g, "，").replace(/\./g, "。").replace(/!/g, "！").replace(/\?/g, "？"), pos: "punct", source: "punct" }); i++; continue; }
      let hit = null, used = 1;
      for (let L = 4; L >= 1; L--) {
        if (i + L > parts.length) continue;
        const seq = parts.slice(i, i + L);
        if (seq.some(x => x.punct)) continue;
        const e = lookupWitch(seq.map(x => x.word), idx);
        if (e) { hit = e; used = L; break; }
      }
      if (hit) {
        const zh = hit.witch in WITCH_FUNCTION_ZH ? WITCH_FUNCTION_ZH[hit.witch] : firstGloss(hit);
        tokens.push({ witch: parts.slice(i, i + used).map(x => x.word).join(" "), zh, ja: hit.ja, pos: hit.pos, source: hit.source, entry: hit.witch });
      } else {
        // 數字組合（例：tuni tone san）
        tokens.push({ witch: p.word, zh: p.word, pos: "unknown", source: "unknown" });
      }
      i += used;
    }
    joinNumbers(tokens);
    return { tokens, text: renderZh(reorderToZh(tokens)) };
  }

  function joinNumbers(tokens) {
    const val = { wachi: 1, tuni: 2, san: 3, foshi: 4, fago: 5, sik: 6, naven: 7, echi: 8, nakyu: 9 };
    const unit = { tone: 10, haku: 100, "son'": 1000 };
    for (let i = 0; i < tokens.length; i++) {
      const w = tokens[i].witch;
      if (!(w in val || w in unit || /^tone /.test(w))) continue;
      let j = i, words = [];
      while (j < tokens.length && tokens[j].witch.split(" ").every(x => x in val || x in unit || x === "thn")) { words.push(...tokens[j].witch.split(" ")); j++; }
      if (j - i < 2 && words.length < 2) continue;
      let total = 0, cur = 0;
      for (const x of words) {
        if (x === "thn") cur = 3;
        else if (x in val) cur = val[x];
        else { total += (cur || 1) * unit[x]; cur = 0; }
      }
      total += cur;
      tokens.splice(i, j - i, { witch: words.join(" "), zh: toZhNumber(total), pos: "數詞", source: "rule" });
    }
  }
  function toZhNumber(n) {
    const d = "零一二三四五六七八九";
    if (n < 10) return d[n];
    let s = "";
    const th = Math.floor(n / 1000), h = Math.floor((n % 1000) / 100), t = Math.floor((n % 100) / 10), o = n % 10;
    if (th) s += d[th] + "千";
    if (h) s += d[h] + "百"; else if (th && (t || o)) s += "零";
    if (t) s += (t === 1 && !th && !h ? "" : d[t]) + "十"; else if ((th || h) && o) s += s.endsWith("零") ? "" : "零";
    if (o) s += d[o];
    return s;
  }

  // 日語語序 → 中文語序（子句內）：S Iz'u O Iz'u V AUX → S AUX V O
  function reorderToZh(tokens) {
    const out = [];
    let clause = [];
    const flush = () => {
      if (!clause.length) return;
      const v = (() => { for (let k = clause.length - 1; k >= 0; k--) if (VERB_POS.has(clause[k].pos)) return k; return -1; })();
      if (v < 0) {
        clause.forEach((t, k) => {
          if (t.witch === "Iz'u") { const nx = clause[k + 1]; if (nx && NOUNISH.has(nx.pos)) out.push({ witch: "", zh: "是", pos: "助詞", source: "rule" }); }
          else if (t.zh !== "") out.push(t);
        });
        clause = []; return;
      }
      const before = clause.slice(0, v);
      const after = clause.slice(v + 1);
      const aux = after.filter(t => AUX_POS.has(t.pos) || t.witch === "Nii");
      const imperative = after.some(t => t.witch === "oRei" || t.witch === "oRe");
      const rest = after.filter(t => !aux.includes(t) && t.witch !== "oRei" && t.witch !== "oRe");
      const izu = before.map((t, k) => (t.witch === "Iz'u" ? k : -1)).filter(k => k >= 0);
      let subject = [], object = [];
      if (izu.length >= 2) { subject = before.slice(0, izu[0]); object = before.slice(izu[0] + 1); }
      else if (izu.length === 1) {
        const left = before.slice(0, izu[0]), right = before.slice(izu[0] + 1);
        if (right.length) { subject = left; object = right; } else { subject = []; object = left; }
        if (!right.length && left.length && ["代名詞"].includes(left[left.length - 1].pos)) { subject = left; object = []; }
      } else { subject = before; }
      if (object.some(t => VERB_POS.has(t.pos))) object = reorderToZh(object);
      out.push(...subject, ...aux, clause[v], ...object, ...rest);
      if (imperative) out.push({ witch: "oRei", zh: "吧", pos: "助詞", source: "rule" });
      clause = [];
    };
    for (const t of tokens) { if (t.source === "punct") { flush(); out.push(t); } else clause.push(t); }
    flush();
    return out.filter(t => t.witch !== "Iz'u");
  }

  function renderZh(tokens) {
    let s = "";
    tokens.forEach((t, k) => {
      let z = t.zh || "";
      const nx = tokens[k + 1];
      if (ADJ_POS.has(t.pos) && nx && (nx.pos === "名詞") && !z.endsWith("的")) z += "的";
      if (t.source === "unknown") z = " " + z + " ";
      s += z;
    });
    return s.replace(/\s+/g, " ").replace(/ ([，。！？])/g, "$1").trim();
  }

  const api = { parseTSV, build, zhToWitch, witchToZh, normalizeWitch, renderWitch, zhKeys };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MajoEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
