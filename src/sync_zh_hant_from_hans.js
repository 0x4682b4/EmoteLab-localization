/**
 * Regenerates zh-Hant strings from zh-Hans using OpenCC-style conversion:
 * STPhrases + STCharacters (Simplified → Traditional), then TWPhrases (→ Taiwan wording).
 *
 * Usage (from repo root): node src/sync_zh_hant_from_hans.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DICT_DIR = path.join(__dirname, "opencc-data");

function parseDictFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const pairs = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const tab = line.indexOf("\t");
    if (tab === -1) continue;
    const key = line.slice(0, tab).trim();
    const rest = line.slice(tab + 1).trim();
    if (!key) continue;
    const value = rest.split(/\s+/)[0] || rest;
    if (!value) continue;
    pairs.push({ key, value });
  }
  return pairs;
}

function buildCharMap(pairs) {
  const m = new Map();
  for (const { key, value } of pairs) {
    if (key.length === 1 && !m.has(key)) m.set(key, value);
  }
  return m;
}

function phraseConvert(text, phrasesByLen) {
  let i = 0;
  const out = [];
  while (i < text.length) {
    let matched = false;
    for (const { key, value } of phrasesByLen) {
      if (text.startsWith(key, i)) {
        out.push(value);
        i += key.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.push(text[i]);
      i += 1;
    }
  }
  return out.join("");
}

function charMapConvert(text, charMap) {
  const out = [];
  for (const ch of text) {
    out.push(charMap.has(ch) ? charMap.get(ch) : ch);
  }
  return out.join("");
}

function s2tw(text, stPhrases, stCharMap, twPhrases) {
  const stSorted = [...stPhrases].sort((a, b) => b.key.length - a.key.length);
  let t = phraseConvert(text, stSorted);
  t = charMapConvert(t, stCharMap);
  const twSorted = [...twPhrases].sort((a, b) => b.key.length - a.key.length);
  t = phraseConvert(t, twSorted);
  return t;
}

/** Minimal CSV line parser (RFC-style quoted fields). */
function parseCsvLine(line) {
  const fields = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i++;
      let field = "";
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        field += line[i++];
      }
      fields.push(field);
      if (line[i] === ",") i++;
    } else {
      let end = line.indexOf(",", i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.map(parseCsvLine);
}

function toCsvRow(fields) {
  return fields
    .map((f) => {
      const s = String(f ?? "");
      if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    })
    .join(",");
}

function loadHansMap(csvPath, hansCol) {
  const content = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(content);
  if (rows.length < 2) return new Map();
  const header = rows[0];
  const keyIdx = header.indexOf("Key");
  const enIdx = header.indexOf("en");
  const colIdx = header.indexOf(hansCol);
  if (keyIdx === -1 || enIdx === -1 || colIdx === -1) {
    throw new Error(`Missing Key, en, or ${hansCol} in ${csvPath}`);
  }
  const map = new Map();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length <= keyIdx) continue;
    map.set(row[keyIdx], {
      en: row[enIdx] ?? "",
      hans: row[colIdx] ?? "",
    });
  }
  return map;
}

function applyConversion(hantPath, hansMap, hantCol, convert) {
  const content = fs.readFileSync(hantPath, "utf8");
  const rows = parseCsv(content);
  if (rows.length < 2) return;
  const header = rows[0];
  const keyIdx = header.indexOf("Key");
  const enIdx = header.indexOf("en");
  const colIdx = header.indexOf(hantCol);
  const reviewedIdx = header.indexOf("reviewed");
  if (keyIdx === -1 || colIdx === -1) {
    throw new Error(`Missing Key or ${hantCol} in ${hantPath}`);
  }
  let nFilled = 0;
  let nAdded = 0;
  const existingKeys = new Set();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length <= keyIdx) continue;
    const key = row[keyIdx];
    existingKeys.add(key);
    const current = (row[colIdx] ?? "").trim();
    // Only fill missing zh-Hant values; keep existing translations untouched.
    if (!current && hansMap.has(key)) {
      const src = hansMap.get(key).hans;
      row[colIdx] = convert(src);
      nFilled++;
    }
  }

  // Add keys that exist in zh-Hans but are missing from zh-Hant.
  for (const [key, srcData] of hansMap.entries()) {
    if (existingKeys.has(key)) continue;
    const newRow = new Array(header.length).fill("");
    newRow[keyIdx] = key;
    if (enIdx !== -1) newRow[enIdx] = srcData.en;
    newRow[colIdx] = convert(srcData.hans);
    if (reviewedIdx !== -1) newRow[reviewedIdx] = "False";
    rows.push(newRow);
    nAdded++;
  }

  const out = rows.map(toCsvRow).join("\n") + "\n";
  fs.writeFileSync(hantPath, out, "utf8");
  return { filled: nFilled, added: nAdded };
}

const PAIRS = [
  ["Main Menu String Table_zh-Hans.csv", "Main Menu String Table_zh-Hant.csv"],
  ["CoffeeBean/CoffeeBean.Animations_zh-Hans.csv", "CoffeeBean/CoffeeBean.Animations_zh-Hant.csv"],
  ["CoffeeBean/CoffeeBean.SkinGroups_zh-Hans.csv", "CoffeeBean/CoffeeBean.SkinGroups_zh-Hant.csv"],
  ["CoffeeBean/CoffeeBean.Sliders_zh-Hans.csv", "CoffeeBean/CoffeeBean.Sliders_zh-Hant.csv"],
  ["CoffeeBean/CoffeeBean.SlotGroups_zh-Hans.csv", "CoffeeBean/CoffeeBean.SlotGroups_zh-Hant.csv"],
];

function main() {
  const stPhrases = parseDictFile(path.join(DICT_DIR, "STPhrases.txt"));
  const stCharPairs = parseDictFile(path.join(DICT_DIR, "STCharacters.txt"));
  const stCharMap = buildCharMap(stCharPairs);
  const twPhrases = parseDictFile(path.join(DICT_DIR, "TWPhrases.txt"));

  const convert = (s) => s2tw(s, stPhrases, stCharMap, twPhrases);

  for (const [relHans, relHant] of PAIRS) {
    const pHans = path.join(ROOT, "zh-Hans", relHans);
    const pHant = path.join(ROOT, "zh-Hant", relHant);
    if (!fs.existsSync(pHans) || !fs.existsSync(pHant)) {
      console.warn("Skip (missing):", relHans, relHant);
      continue;
    }
    const hansMap = loadHansMap(pHans, "zh-Hans");
    const result = applyConversion(pHant, hansMap, "zh-Hant", convert);
    console.log(
      `${relHant}: filled ${result.filled} empty rows, added ${result.added} missing keys from zh-Hans`
    );
  }
}

main();
