// Pulls automatic data into data/current.json:
//   • NPSG 7-Day Significant Fire Potential
//   • ERC / BI from a file uploaded to the uploads/ folder (newest file wins)
//   • SWA / OOA Type 1 IHC crews and Incident Management Teams from the SWCC SharePoint workbooks
//   • Fire Activity: active T3+ and T2+/complex incidents in the SW PSAs (WFIGS) → rating
//   • New wildfire starts (WFIGS) for the last 7 days, by cause and PSA
//   • Previous-day RAWS summaries per PSA (FEMS weather observations, every RAWS inside the SW PSAs)
//   • Previous-day fuel model Y ERC and BI per PSA from FEMS for the SWCC station list (archive only)
// then archives the run (data/archive/…).
// Run: node scripts/update-data.mjs                 (everything)
//      node scripts/update-data.mjs --outlook --upload --resources --starts --raws   (any subset)
//      add --no-archive to skip writing the archive
// Used by .github/workflows/update-data.yml. Needs Node 18+ (built-in fetch).
import { createRequire } from "module";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const C = require(join(root, "js/config.js"));
const S = require(join(root, "js/sources.js"))(C, globalThis.fetch);
const calc = require(join(root, "js/calc.js"))(C);
const R = require(join(root, "scripts/lib/resources.cjs"));
const I = require(join(root, "js/erc-import.js"))(C, require(join(root, "js/xlsx-read.js")));
const FS = require(join(root, "scripts/lib/firestarts.cjs")).makeFireStarts(C);
const RW = require(join(root, "scripts/lib/raws.cjs")).makeRaws(C);
const ARCHIVE = require(join(root, "scripts/lib/archive.cjs"));

const args = new Set(process.argv.slice(2));
const parts = ["outlook", "upload", "resources", "activity", "starts", "raws"];
const want = (k) => !parts.some((p) => args.has(`--${p}`)) || args.has(`--${k}`);
const dataFile = join(root, "data/current.json");
// data/current.json is the live data; if it's missing (new or reset repository) start from data/seed.json.
const seedFile = join(root, "data/seed.json");
if (!existsSync(dataFile)) console.log("· data/current.json not found; starting from data/seed.json");
const state = JSON.parse(readFileSync(existsSync(dataFile) ? dataFile : seedFile, "utf8"));
const stamp = () => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: C.autoData.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const g = (t) => f.find((x) => x.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
};
let changed = 0, failed = 0;
// Model v2 (Nov 2026): one year-round weighting replaces the shoulder/fire-season presets.
if ((state.modelVersion || 1) < 2) {
  if (state.preset !== "custom") state.preset = C.defaultPreset;
  state.modelVersion = 2; changed++;
  console.log(`· Switched to the ${C.weightPresets[C.defaultPreset].label} weighting (model v2).`);
}
const step = async (label, fn) => {
  try { await fn(); changed++; }
  catch (e) { failed++; console.error(`✗ ${label} not updated: ${e.message}`); }
};

if (want("outlook")) await step("7-Day outlook", async () => {
  const o = await S.fetchOutlook();
  state.outlook = o;
  console.log(`✓ 7-Day outlook: Day 1 ${o.startDate}${o.missing.length ? ` (${o.missing.length} PSA-days missing, set to 1)` : ""}`);
});

// ERC / BI: newest .xlsx / .csv in uploads/ (by last commit time, else file time). Applied once per file version.
if (want("upload")) {
  const dir = join(root, "uploads");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(xlsx|xlsm|csv|txt)$/i.test(f)) : [];
  const when = (f) => {
    try { return parseInt(execFileSync("git", ["log", "-1", "--format=%ct", "--", join("uploads", f)], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(), 10) * 1000 || statSync(join(dir, f)).mtimeMs; }
    catch (e) { return statSync(join(dir, f)).mtimeMs; }
  };
  const newest = files.map((f) => ({ f, t: when(f) })).sort((a, b) => b.t - a.t)[0];
  if (!newest) console.log("· No ERC/BI file in uploads/; ERC/BI left as they are.");
  else if (state.danger && state.danger.fileVersion === `${newest.f}@${newest.t}`) console.log(`· ERC/BI: ${newest.f} already applied.`);
  else await step(`ERC/BI file ${newest.f}`, async () => {
    const res = await I.importFile(readFileSync(join(dir, newest.f)), newest.f);
    const rows = {};
    for (const p of C.psas) rows[p.ercId] = res.rows[p.ercId] || { ercVal: "", biVal: "", ercPct: "", biPct: "" };
    state.danger = { date: res.date || stamp().slice(0, 10), rows, source: `Uploaded file ${newest.f}`, fetchedAt: stamp(), fileVersion: `${newest.f}@${newest.t}` };
    console.log(`✓ ERC/BI from ${newest.f}${res.sheet ? ` (sheet "${res.sheet}")` : ""}: ${Object.keys(res.rows).length} PSAs, ${res.rowsRead} rows, date ${res.date || "not given"}${res.missing.length ? `; missing ${res.missing.join(", ")}` : ""}`);
  });
}

if (want("resources")) {
  const sp = C.autoData.sharepoint;
  await step("Crews (SharePoint)", async () => {
    const c = await R.parseCrewWorkbook(await R.fetchWorkbook(sp.crewsUrl), sp.crewSheets);
    if (!c.crews.length) throw new Error(`no crews found on "${sp.crewSheets.swa}"`);
    state.crews = c.crews;
    state.ooaCrews = c.ooaCrews;
    state.crewsUpdated = stamp();
    state.crewsSource = { source: "SWCC SharePoint (auto)", fetchedAt: stamp(), lastUpdate: c.lastUpdate, ooaLastUpdate: c.ooaLastUpdate };
    console.log(`✓ Crews: ${c.crews.length} SWA, ${c.ooaCrews.length} OOA (sheet last update: ${c.lastUpdate || "not shown"})`);
  });
  await step("IMTs (SharePoint)", async () => {
    const t = await R.parseImtWorkbook(await R.fetchWorkbook(sp.imtUrl), sp.imtSheet);
    if (!t.imts.length) throw new Error(`no teams found on "${sp.imtSheet}"`);
    state.imts = t.imts;
    state.imtsUpdated = stamp();
    state.imtsSource = { source: "SWCC SharePoint (auto)", fetchedAt: stamp(), lastUpdate: t.lastUpdate };
    console.log(`✓ IMTs: ${t.imts.length} teams (sheet last update: ${t.lastUpdate || "not shown"})`);
  });
}

if (want("activity") && (C.autoData.fireActivity || {}).auto) await step("Fire Activity (WFIGS active incidents)", async () => {
  const a = await FS.fetchActiveIncidents();
  const suggested = calc.largeFireRating(a.complex, a.t3);
  const { override, ...prev } = state.fire || {}; // a hand-picked rating lasts until the next automatic pull
  state.fire = { ...prev, rating: suggested, complex: a.complex, t3: a.t3, escapes: a.escapes, escapeList: a.escapeList, updated: stamp(), fetchedAt: stamp(),
    source: "WFIGS active incidents (auto)", incidents: a.incidents, activeTotal: a.activeTotal, unknownType: a.unknownType };
  console.log(`✓ Fire Activity inputs: ${a.complex} complex/T2+, ${a.t3} T3 active in SW PSAs (large-fire rating ${suggested}); ${a.escapes} escape(s)` +
    `${a.incidents.length ? ` (${a.incidents.slice(0, 8).map((i) => `${i.name} T${i.type}`).join(", ")})` : ""}; ${a.activeTotal} active incidents in all${a.unknownType ? `, ${a.unknownType} with no type` : ""}`);
});

if (want("starts")) await step("Fire starts (WFIGS)", async () => {
  // First run (no fire-start archive yet): fill in the whole year so the history chart has context.
  const firstRun = !existsSync(join(root, "data/archive/fire_starts_daily.csv"));
  const yesterday = FS.yesterday();
  const f = await FS.fetchStarts(firstRun || args.has("--backfill") ? { from: `${yesterday.slice(0, 4)}-01-01`, to: yesterday } : {});
  if (firstRun) console.log(`· First run: filled in fire starts from ${f.from}`);
  state.fireStarts = { ...f, fetchedAt: stamp(), source: "WFIGS incident locations (auto)" };
  const y = f.daily[f.to];
  console.log(`✓ Fire starts ${f.from}…${f.to}: ${f.fires.length} in SW PSAs${f.placedByPsa ? "" : " (PSA outlines unavailable: AZ/NM by state)"}; ${f.to}: ${y.total} (lightning ${y.lightning}, human ${y.human}, unknown ${y.unknown})`);
});

let rawsStations = null;
const getStations = async () => (rawsStations = rawsStations || await RW.fetchStations());
if (want("raws")) await step("RAWS + ASOS/AWOS weather obs", async () => {
  const w = await RW.fetchRaws({ stations: await getStations() });
  state.raws = { ...w, fetchedAt: stamp() };
  const dropped = w.checks.filter((c) => c.action === "dropped");
  const nA = w.stations.filter((x) => x.network === "ASOS/AWOS").length;
  console.log(`✓ Weather ${w.date}: ${w.stations.length - nA} RAWS + ${nA} ASOS/AWOS stations in ${Object.values(w.byPsa).filter((x) => x.stations).length} PSAs; quality checks removed ${dropped.length} reading(s)${w.checks.length > dropped.length ? `, flagged ${w.checks.length - dropped.length} to check` : ""}`);
  if (w.asosError) console.log(`  ! ASOS/AWOS not added: ${w.asosError}`);
  for (const c of w.checks.slice(0, 20)) console.log(`    ${c.psa} ${c.name || c.id}: ${c.field} ${c.value}${c.hour ? ` at ${c.hour}` : ""}, ${c.reason} (${c.action})`);
});

// Re-pull and re-check earlier days (e.g. after the quality checks change): --redo-weather-from=YYYY-MM-DD
const redoFrom = ([...args].find((a) => a.startsWith("--redo-weather-from=")) || "").split("=")[1];
if (redoFrom) await step(`Re-checking weather from ${redoFrom}`, async () => {
  const { addDays } = require(join(root, "scripts/lib/firestarts.cjs"));
  const last = addDays(new Intl.DateTimeFormat("en-CA", { timeZone: C.autoData.timeZone }).format(new Date()), -2);
  let asosStations = null;
  try { asosStations = await RW.fetchAsosStations(); } catch (e) { console.log(`  ! ASOS/AWOS station list: ${e.message}`); }
  for (let d = redoFrom; d <= last; d = addDays(d, 1)) {
    try {
      const w = await RW.fetchRaws({ date: d, stations: await getStations(), asosStations: asosStations || undefined });
      ARCHIVE.writeRaws(join(root, "data/archive"), w, stamp());
      const g = Object.entries(w.byPsa).filter(([, x]) => x.maxGust !== "").map(([k, x]) => `${k} ${x.maxGust}`).join(", ");
      console.log(`  ✓ ${d}: ${w.stations.length} stations, ${w.checks.filter((c) => c.action === "dropped").length} readings removed; max gusts ${g}`);
    } catch (e) { console.log(`  ✗ ${d}: ${e.message}`); }
  }
});

if (want("raws")) await step("FEMS ERC/BI (fuel model Y)", async () => {
  const n = await RW.fetchNfdr();
  state.femsNfdr = { ...n, fetchedAt: stamp() };
  const vals = Object.entries(n.byPsa).filter(([, x]) => x.stations).map(([k, x]) => `${k} ${x.erc}/${x.bi}`);
  console.log(`✓ FEMS ERC/BI ${n.date}: ${n.stations.length} stations; ERC/BI by PSA ${vals.join(", ")}`);
});

if (changed || !existsSync(dataFile)) {
  // Store the full Fire Activity rating (large fires + IA load + capacity + 7-day trend) with the inputs.
  if (state.fire && state.fire.fetchedAt) {
    const f = calc.compute(state).fire;
    state.fire.startsAvg3 = f.startsAvg;
    state.fire.rating = f.rating;
    console.log(`✓ Fire Activity ${f.rating}: demand ${f.demand} (large fires ${f.large}, IA ${f.ia}: ${f.startsAvg ?? "–"} starts/day, ${f.escapes ?? "–"} escapes)${f.steps.map((x) => `; +1 ${x.why}`).join("")}`);
  }
  state.meta = { ...(state.meta || {}), asOf: stamp(), source: `automated pull ${stamp()}` };
  writeFileSync(dataFile, JSON.stringify(state, null, 1));
  const r = calc.compute(state);
  console.log(`PL${r.pl}${r.held ? ` (held at PL${r.pl}: no fire on the ground; score alone gives PL${r.scorePl})` : ""} (score ${r.score.toFixed(3)}) with ${state.preset} weights: ${r.elements.map((e) => `${e.name} ${e.rating}`).join("; ")}`);
}
if (args.has("--refresh-archive") && args.has("--no-archive")) {
  const f = ARCHIVE.refreshFromSnapshots({ root, calc, C });
  console.log(`✓ Archive: ${f.runs} runs re-scored with the current criteria`);
}
if (!args.has("--no-archive")) {
  try {
    const runTime = stamp();
    const a = ARCHIVE.archiveRun({ root, state, result: { ...calc.compute(state), compare: { shoulder: calc.oldMethod(state, "shoulder"), season: calc.oldMethod(state, "season") } }, runTime, C });
    console.log(`✓ Archived run ${runTime}: ${a.snapshot}; history ${a.runs} runs, ${a.days} days of fire starts, ${a.fires} fires, ${a.raws} RAWS rows, ${a.nfdr} FEMS ERC/BI rows`);
  } catch (e) { failed++; console.error(`✗ Archive not written: ${e.message}`); }
  // Every run: re-score all archived runs with the current criteria (model_* columns) and fill gaps.
  try {
    const f = ARCHIVE.refreshFromSnapshots({ root, calc, C });
    console.log(`✓ Archive check: ${f.runs} runs re-scored with the current criteria (${f.updated} values filled or changed${f.missing ? `; ${f.missing} runs without a snapshot` : ""})`);
  } catch (e) { console.error(`✗ Archive refresh: ${e.message}`); }
}
if (failed) console.error(`${failed} step(s) failed; the site keeps the last good data for those.`);
process.exit(failed && !changed ? 1 : 0);
