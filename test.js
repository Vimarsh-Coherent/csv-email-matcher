// Local sanity check of the matcher against the real CSVs.
const fs = require("fs");
const Papa = require("papaparse");
const M = require("./matcher");

function load(path) {
  const text = fs.readFileSync(path, "utf-8");
  return Papa.parse(text, { header: true, skipEmptyLines: true });
}

const verifiedPath = "C:\\Users\\vimarsh.CMI\\Desktop\\verification-verified-job-119new.csv";
const peoplePath = "C:\\Users\\vimarsh.CMI\\Desktop\\2026-06-22T06-07_exportmain.csv";

const v = load(verifiedPath);
const p = load(peoplePath);

const res = M.matchEmails(v.data, p.data, { minScore: 60, includeGeneric: false });
console.log("STATS:", res.stats);

const out = M.buildOutput(p.data, p.meta.fields, res.assignments, { explode: false });

console.log("\nPEOPLE WITH 2+ EMAILS:");
let multi = 0;
for (let i = 0; i < p.data.length; i++) {
  const list = res.assignments.get(i);
  if (list && list.length > 1) {
    multi++;
    if (multi <= 15) console.log(`  ${(p.data[i].name || "").padEnd(22)} -> ${list.map((x) => x.email).join(", ")}`);
  }
}
console.log(`  (total people with multiple emails: ${multi})`);

// Show a sample of matches
console.log("\nSAMPLE MATCHES:");
let n = 0;
for (let i = 0; i < p.data.length && n < 25; i++) {
  const e = res.assignments.get(i);
  if (!e) continue;
  const person = p.data[i];
  console.log(
    `  ${(person.name || "").padEnd(22)} | ${M.personDomain(person).padEnd(26)} -> ${e.email}  [${e.status} ${e.score}]`
  );
  n++;
}

console.log("\nSAMPLE UNMATCHED (people with a domain that had emails but no name match):");
n = 0;
for (let i = 0; i < p.data.length && n < 15; i++) {
  if (res.assignments.has(i)) continue;
  const person = p.data[i];
  const dom = M.personDomain(person);
  if (!dom) continue;
  console.log(`  ${(person.name || "").padEnd(22)} | ${dom}`);
  n++;
}

fs.writeFileSync(
  "C:\\Users\\vimarsh.CMI\\Desktop\\matched-output.csv",
  Papa.unparse({ fields: p.meta.fields, data: out }),
  "utf-8"
);
console.log("\nWrote", out.length, "rows -> Desktop\\matched-output.csv");
