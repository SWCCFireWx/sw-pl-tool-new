// Run with: node tests/calc.test.js
// Checks the calculation engine against results produced by the Excel workbook.
const assert = require("assert");
const C = require("../js/config.js");
const calc = require("../js/calc.js")(C);
const seed = require("./fixtures/state.json"); // the spreadsheet seed (11/3–11/4/2026)
const clone = (o) => JSON.parse(JSON.stringify(o));
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("ok -", name); };

t("seed data, shoulder season = PL1 score 0 (PL_Outcome sheet)", () => {
  const r = calc.compute(seed);
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.pl, 1);
  assert.deepStrictEqual(r.elements.map((e) => e.rating), ["Minimum", "Low", "Minimum", "Minimum", "Minimum"]);
});

t("seed data, fire season weights = PL2 score 0.25 (PL_Outcome (2) sheet)", () => {
  const r = calc.compute({ ...seed, preset: "season" });
  assert.strictEqual(r.score, 0.25);
  assert.strictEqual(r.pl, 2);
});

t("PL score boundaries follow MISC!E2:G6", () => {
  assert.strictEqual(calc.plLevel(0.15), 1);
  assert.strictEqual(calc.plLevel(0.151), 2);
  assert.strictEqual(calc.plLevel(0.385), 2);
  assert.strictEqual(calc.plLevel(0.386), 3);
  assert.strictEqual(calc.plLevel(0.62), 4);
  assert.strictEqual(calc.plLevel(0.85), 4);
  assert.strictEqual(calc.plLevel(0.851), 5);
});

t("7-Day risk score bands (7-Day_Dryness!D35)", () => {
  assert.strictEqual(calc.outlookRating(15), "Minimum");
  assert.strictEqual(calc.outlookRating(24), "Minimum");
  assert.strictEqual(calc.outlookRating(25), "Low");
  assert.strictEqual(calc.outlookRating(37), "Moderate");
  assert.strictEqual(calc.outlookRating(46), "High");
  assert.strictEqual(calc.outlookRating(52), "Maximum");
  const s = clone(seed);
  for (const k in s.outlook.values) s.outlook.values[k] = [3, 3, 3, 3, 3, 3, 3];
  const o = calc.outlookSummary(s.outlook);
  assert.strictEqual(o.daily[0].score, 45);
  assert.strictEqual(o.rating, "Moderate");
});

t("ERCy metric (PSA_ERCy_Values!D28)", () => {
  const s = clone(seed);
  const set = (vals) => Object.keys(s.danger.rows).forEach((k, i) => (s.danger.rows[k].ercPct = vals[i] ?? 45));
  set([60]); assert.strictEqual(calc.dangerSummary(s.danger).rating, "Low");
  set([92]); assert.strictEqual(calc.dangerSummary(s.danger).rating, "Moderate");
  set([97]); assert.strictEqual(calc.dangerSummary(s.danger).rating, "High");
  set([97, 97, 97, 97, 97, 97, 97, 98]); assert.strictEqual(calc.dangerSummary(s.danger).rating, "Extreme");
});

t("IMT availability (IMT's!D43)", () => {
  const teams = (cimtAvail, t3Avail) => [
    ...Array.from({ length: 4 }, (_, i) => ({ type: "CIMT", status: i < cimtAvail ? "AN" : "O-R" })),
    ...Array.from({ length: 8 }, (_, i) => ({ type: "3", status: i < t3Avail ? "AL" : "UE" })),
  ];
  assert.strictEqual(calc.imtSummary(teams(0, 8)).rating, "Minimum");
  assert.strictEqual(calc.imtSummary(teams(2, 0)).rating, "Low");
  assert.strictEqual(calc.imtSummary(teams(3, 0)).rating, "Moderate");
  assert.strictEqual(calc.imtSummary(teams(4, 3)).rating, "High");
  assert.strictEqual(calc.imtSummary(teams(4, 4)).rating, "Maximum");
});

t("Crew availability ratio bands (Crews!N44)", () => {
  const crews = (n) => Array.from({ length: 20 }, (_, i) => ({ status: i < n ? "A" : "UE" }));
  assert.strictEqual(calc.crewSummary(crews(2), []).rating, "Minimum");   // 10%
  assert.strictEqual(calc.crewSummary(crews(3), []).rating, "Low");       // 15%
  assert.strictEqual(calc.crewSummary(crews(8), []).rating, "Moderate");  // 40%
  assert.strictEqual(calc.crewSummary(crews(13), []).rating, "High");     // 65%
  assert.strictEqual(calc.crewSummary(crews(20), []).rating, "Maximum");
  const prepo = crews(0); prepo[0] = { status: "P", location: "SWCC" }; prepo[1] = { status: "P", location: "PHC" };
  assert.strictEqual(calc.crewSummary(prepo, []).totalAvail, 1);
});

t("Fire activity suggestion from incident counts", () => {
  assert.strictEqual(calc.fireActivity({ complex: 0, t3: 0 }).suggested, "Minimum");
  assert.strictEqual(calc.fireActivity({ complex: 1, t3: 2 }).suggested, "Low");
  assert.strictEqual(calc.fireActivity({ complex: 2, t3: 1 }).suggested, "Moderate");
  assert.strictEqual(calc.fireActivity({ complex: 3, t3: 10 }).suggested, "High");
  assert.strictEqual(calc.fireActivity({ complex: 5, t3: 0 }).suggested, "Maximum");
});

/* ---------- year-round model (v2) ---------- */
const auto = (fire, extra = {}) => ({ ...clone(seed), preset: "standard", ...extra, fire: { fetchedAt: "2026-11-16T08:00", ...fire } });
const teams = (cimtAvail) => Array.from({ length: 4 }, (_, i) => ({ type: "CIMT", status: i < cimtAvail ? "AN" : "C" }));
const crewsAvail = (n) => Array.from({ length: 20 }, (_, i) => ({ status: i < n ? "A" : "C" }));

t("Fire Activity demand = higher of large fires and initial attack", () => {
  assert.strictEqual(calc.compute(auto({ complex: 0, t3: 0, startsAvg3: 0, escapes: 0 })).fire.rating, "Minimum");
  assert.strictEqual(calc.compute(auto({ complex: 0, t3: 0, startsAvg3: 9, escapes: 0 }, { imts: teams(4), crews: crewsAvail(20) })).fire.rating, "Moderate");
  assert.strictEqual(calc.compute(auto({ complex: 1, t3: 2, startsAvg3: 1, escapes: 4 }, { imts: teams(4), crews: crewsAvail(20) })).fire.rating, "High");
});

t("Fire Activity: +1 for strained IMTs/crews, +1 for a rising 7-day; never from Minimum", () => {
  const st = auto({ complex: 1, t3: 2, startsAvg3: 0, escapes: 0 }, { imts: teams(1), crews: crewsAvail(20) });
  let f = calc.compute(st).fire;
  assert.strictEqual(f.demand, "Low"); assert.strictEqual(f.rating, "Moderate"); assert.strictEqual(f.steps[0].kind, "capacity");
  for (const k in st.outlook.values) st.outlook.values[k] = [1, 1, 1, 2, 3, 3, 3];
  st.outlook.values[Object.keys(st.outlook.values)[0]] = [1, 1, 1, 4, 4, 4, 1];
  f = calc.compute(st).fire;
  assert.deepStrictEqual(f.steps.map((x) => x.kind), ["capacity", "outlook"]); assert.strictEqual(f.rating, "High");
  const quiet = auto({ complex: 0, t3: 0, startsAvg3: 0, escapes: 0 }, { imts: teams(0), crews: crewsAvail(0), outlook: st.outlook });
  assert.strictEqual(calc.compute(quiet).fire.rating, "Minimum");
});

t("A hand-picked override wins over the automatic rating", () => {
  assert.strictEqual(calc.compute(auto({ complex: 3, t3: 5, override: "Low" })).fire.rating, "Low");
});

t("PL2 gate: no fire on the ground holds the PL at 2", () => {
  const st = auto({ complex: 0, t3: 0, startsAvg3: 0, escapes: 0 });
  for (const k in st.outlook.values) st.outlook.values[k] = [4, 4, 4, 4, 4, 4, 4];
  Object.values(st.danger.rows).forEach((x) => (x.ercPct = 98));
  const r = calc.compute(st);
  assert.strictEqual(r.scorePl, 3); assert.strictEqual(r.pl, 2); assert.strictEqual(r.held, true);
  st.fire.startsAvg3 = 3; // a little fire on the ground lifts the hold
  const r2 = calc.compute(st);
  assert.strictEqual(r2.held, false); assert.ok(r2.pl >= 3);
});

t("Old spreadsheet method is still available for comparison", () => {
  assert.strictEqual(calc.oldMethod(seed, "shoulder").pl, 1);
  assert.strictEqual(calc.oldMethod(seed, "season").score, 0.25);
  assert.strictEqual(calc.compute({ ...seed, preset: "standard" }).pl, 1);
});

t("Weights in each preset total 1.0", () => {
  for (const p of Object.values(C.weightPresets)) {
    const sum = Object.values(p.weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, p.label);
  }
});

console.log(`\n${passed} checks passed`);
