// 執行：node tests/engine.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const E = require("../src/engine.js");

const rows = E.parseTSV(fs.readFileSync(path.join(__dirname, "..", "dictionary.tsv"), "utf8"));
const idx = E.build(rows, []);

const zh = [
  ["偉大的神", "gDie GoMi"],
  ["因為殺人是禁忌", "KaRause muRm Iz'u kiNbOO"],
  ["我不能原諒你", "WAirTell Iz'u rAwTell Iz'u forYulvu Ca-nay"],
  ["十三", "tone thn"],
  ["你應該逃跑吧", "rAwTell Iz'u RuGle ShouBeK oRei"],
  ["我們的世界", "WAirTell N'o WiD"],
];
for (const [input, want] of zh) assert.strictEqual(E.zhToWitch(input, idx).text, want, input);

const witch = [
  ["gDie GoMi Iz'u weRel Ca-nan", "能迎接偉大的神"],
  ["KaRause muRm Iz'u kiNbOO", "因為殺人是禁忌"],
  ["rAwTell Iz'u RuGle oRei!", "你逃跑吧！"],
  ["tuni tone san", "二十三"],
];
for (const [input, want] of witch) assert.strictEqual(E.witchToZh(input, idx).text, want, input);

// 自創詞會被查到，並保留 coined 標記
const idx2 = E.build(rows, [{ witch: "ApRinGo", zh: "蘋果", ja: "りんご", pos: "名詞" }]);
const r = E.zhToWitch("蘋果", idx2);
assert.strictEqual(r.text, "ApRinGo");
assert.strictEqual(r.tokens[0].source, "coined");

console.log("all engine tests passed (" + (zh.length + witch.length + 1) + ")");

// 受詞子句也要照日語語序
const idx3 = E.build(rows, [{ witch: "ApRinGo", zh: "蘋果", pos: "名詞" }, { witch: "EaTabe", zh: "吃", pos: "動詞" }]);
assert.strictEqual(E.zhToWitch("我喜歡吃蘋果", idx3).text, "WAirTell Iz'u ApRinGo Iz'u EaTabe Sike");
console.log("nested clause test passed");
assert.strictEqual(E.witchToZh("WAirTell Iz'u ApRinGo Iz'u EaTabe Sike", idx3).text, "我喜歡吃蘋果");
console.log("nested reverse test passed");
