# SWA Preparedness Level (PL) Tool — new model

This is the **new-model** version (year-round weighting, Fire Activity as resource need, PL2 hold, Season
Review), kept in its own repository, **sw-pl-tool-new** (site: https://swccfirewx.github.io/sw-pl-tool-new/),
so it can run next to the original **sw-pl-tool** site. Both live on the same github.io address, so this
version saves browser edits under its own name (`swa-pl-new-state-v1`) and the two sites never overwrite
each other. Each repository has its own scheduled job and its own archive.

A web version of the Southwest Area PL spreadsheet
(`2026_SWA_PL_Dashboard_V3_SHOULDER_SEASON_MASTER.xlsx`). Enter the five PL elements by hand and the
site calculates the Preparedness Level live. It is a plain static site (HTML, CSS, JavaScript, no build
step, no external libraries), so it runs on GitHub Pages or any web server, and can be opened offline.

## What's on the site

| Tab | Replaces sheet(s) | What you enter |
|---|---|---|
| PL Outcome | `PL_Outcome`, `PL_Outcome (2)` | Briefing date, preparer, notes. Shows the PL, score, and each element's contribution. |
| Fire Activity | `PL_worksheet` (Fire Activity) | Complex / T3 incident counts and the Fire Activity rating. A rating is suggested from the counts. |
| IMTs | `Teams_raw`, `IMT's` | Read from the SWCC SharePoint "Incident Management Teams" tab twice a day; can be edited. |
| Crews | `Crews_raw`, `OOA Crews_raw`, `Crews` | Read from the SWCC SharePoint "SWA Type 1 IHC" and "OOA Type 1 IHC" tabs twice a day; can be edited. |
| 7-Day Outlook | `SW_7-Day_ingest`, `7-Day_Dryness`, PL_worksheet chart | Pulled from NPSG automatically; cells can be overridden, or paste the 7-Day rows. |
| PSA ERCy | `NFDRSy_Ingest`, `PSA_ERCy_Values` | Upload the day's ERC/BI file (.xlsx or .csv), paste rows, or type ERCy/BIy values and percentiles. |
| Model & Data | `MISC` | Weight preset (shoulder season / fire season / custom), save and load data files. |

## Put it on GitHub Pages

1. Create the repository (`sw-pl-tool-new`) and upload every file in this folder, keeping the folder structure.
2. In the repository, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, branch `main`, folder `/ (root)`, and save.
3. Go to **Settings → Actions → General → Workflow permissions**, choose *Read and write permissions*, and save
   (the scheduled job saves its data back to the repository).
4. After a minute the site is live at `https://swccfirewx.github.io/sw-pl-tool-new/`. Run the job once from
   **Actions → Update PL data → Run workflow**; the first run fills in this year's fire starts.

To try it locally: run `python3 -m http.server` in this folder and open http://localhost:8000.
(Opening `index.html` directly also works, but then it can't read `data/current.json` and starts blank.)

## How data is saved and shared

- **Your edits** save automatically in your own browser. Nobody else sees them. Each newer scheduled run
  still replaces the automatic parts (7-Day, crews, IMTs, ERC/BI upload, fire starts, RAWS) and the "As of"
  time, so a browser never gets stuck on old data; a page left open checks for a new run every 30 minutes.
- **Published data** is `data/current.json`. Everyone who opens the site (and hasn't made their own edits)
  starts from this file.
- To publish a PL for everyone: **Model & Data → Download data file**, then replace `data/current.json`
  in the repository with it and commit. **Discard my edits, reload published data** brings a browser back
  in line with the published file.

## How the PL is calculated

Each element gets an adjective rating, which maps to a multiplier:

- Fire Activity, 7-Day trend, ERCy: Minimum 0 · Low 0.25 · Moderate 0.5 · High 0.75 · Maximum/Extreme 1
- IMT and crew **availability** (inverted): Maximum 0 · High 0.25 · Moderate 0.5 · Low 0.75 · Minimum 1

Contribution = element weight × multiplier. PL score = sum of contributions.
PL1 < 0.151 ≤ PL2 < 0.386 ≤ PL3 < 0.62 ≤ PL4 < 0.851 ≤ PL5.

| Element | Rule |
|---|---|
| Fire Activity (resource need) | Calculated, see below. Can be overridden by picking a rating on the Fire Activity page. |
| IMT Availability | CIMTs available: 0 → Minimum, 1–2 → Low, 3 → Moderate, 4+ → High, or Maximum if 4+ Type 3 teams also available. |
| Crew Availability | (available crews + crews prepositioned at SWCC) ÷ number of SWA crews: ≥100% Maximum, >60% High, >39% Moderate, >11% Low, else Minimum. |
| 7-Day trend | Daily score = sum of PSA levels (15–60). Average of 7 days: <25 Minimum, <37 Low, <46 Moderate, <52 High, else Maximum. |
| PSA ERCy | 8+ PSAs ≥97th → Extreme; any ≥97th → High; any 90–96th → Moderate; any 50–89th → Low; else Minimum. |

### One year-round weighting

| Weighting | Fire Activity | IMT | Crews | 7-Day | ERCy |
|---|---|---|---|---|---|
| **Year-round (default)** | 0.40 | 0 | 0 | 0.35 | 0.25 |
| Old: shoulder season (`PL_Outcome`), for comparison | 0.3 | 0 | 0 | 0.4 | 0.3 |
| Old: fire season (`PL_Outcome (2)`), for comparison | 0.2 | 0.2 | 0.1 | 0.3 | 0.2 |

IMT and crew availability have no weight of their own any more: they are counted **inside** Fire Activity,
so they only raise the PL when there is fire for those teams and crews to work on. That's what lets one
weighting work all year (in the off season crews are unavailable, but nothing needs them).

### Fire Activity: how many resources we need and how hard they're working

1. **Large fires**: active T3+ incidents in the SW PSAs (WFIGS), rated with the spreadsheet guidance
   (Low ≤3 with ≤1 T2/complex, Moderate ≤7 with ≤2, High ≤14 with ≤4, else Maximum).
2. **Initial attack**: the higher of
   - new starts per day, averaged over the last 3 days (Low 2+, Moderate 8+, High 20+, Maximum 40+), and
   - escapes: fires found in the last 3 days that are still uncontained and 100+ acres or T3+
     (Low 1, Moderate 2, High 4, Maximum 8+).
3. **Demand** = the higher of 1 and 2.
4. **+1 step** if resources are strained: 1 or fewer CIMTs available, or 39% or fewer crews available.
5. **+1 step** if the 7-Day outlook is already High/Maximum, or rising (days 4–7 average score 2+ above
   days 1–3, with at least 3 high-risk PSA-days in the week).
6. Steps 4–5 only apply when demand is above Minimum, and the result is capped at Maximum.

These thresholds are starting values in `fireActivityModel` in `js/config.js`. Tune them against the archive.

The **Calculations** tab (last tab on the site) walks through all of this with the current numbers:
each element's multiplier × weight, the PL bands and the PL2 hold, every Fire Activity step with the
row that applies highlighted, the 7-Day and ERCy rules, today's PL by the old method, and the weather
data checks.

### PL3 and above need fire on the ground

If Fire Activity is Minimum, the PL is held at **PL2** however high the 7-Day outlook and ERCy are
(`plGate.maxPlWithoutFire`). The Outcome page and briefing say when the PL is being held.

### Comparing with the old method

Every scheduled run archives, next to the new PL, the PL the old spreadsheet method would have given
(`old_shoulder_pl`, `old_season_pl` in `data/archive/history.csv`), plus each Fire Activity component
(`fire_large_rating`, `fire_starts_avg3`, `fire_escapes`, `fire_demand`, `fire_capacity_step`,
`fire_outlook_step`, `pl_held_no_fire`). The Model & Data page shows today's comparison.

All weights, thresholds, PSAs, rosters and status codes live in **`js/config.js`**. Edit that file to
change the model; the calculation code (`js/calc.js`) has no numbers of its own.

### Differences from the spreadsheet

The workbook had a few broken references and hard-coded values. The site does the following instead:

- IMT available counts are calculated from team status. In the workbook several were typed in
  (`IMT's!C31`, `C33`, `C35`, `PL_worksheet!H8`, `J9`) and some ranges were `#REF!`.
- Crew counts use the actual number of crews instead of a fixed 20, and ERCy percentages use the number
  of PSAs (15) instead of 16.
- Out-of-area crews with an available status (A, AG, AD) count toward total crew availability. The
  workbook only counted OOA crews prepositioned at SWCC. To match the workbook exactly, set
  `crewAvailability.includeOOAAvailable` to `false` in `js/config.js`.
- IMT commitment (`IMT's!D26`) uses "5 or more" committed CIMTs for Maximum (the workbook tested for exactly 5).
  It is shown for reference and is not part of the PL score, as in the workbook.

## Checking the math

`node tests/calc.test.js` runs the calculation engine against results from the workbook
(shoulder season seed → PL1 / 0.000; fire-season weights → PL2 / 0.250) and against each rating rule's boundaries.

## Exporting for email

The **Briefing & Export** tab shows a printable one-page-style PL briefing (PL and score, element table,
fire/IMT/crew summary, 7-Day count table and chart, PSA ERCy table and Fire Danger Metric, notes).

- **Save briefing as PDF** opens the browser's print window; choose *Save as PDF*. The print layout is Letter portrait.
- **Download Excel workbook** saves `SWA_PL_<date>_<time>.xlsx` with PL_Outcome, 7-Day, PSA_ERC, IMTs, Crews
  and Fire_Activity sheets, colored like the original spreadsheet.
- **Open email draft** starts an email with the PL summary in the body; attach the PDF or Excel file.
- **Latest scheduled report**: each scheduled run also saves `reports/SWA_PL_latest.pdf` and `.xlsx`, so there is
  always a ready-made file at `https://<your-org>.github.io/<repo>/reports/SWA_PL_latest.pdf`. It reflects the
  published data, not edits made in someone's browser.

## Automatic data

The 7-Day outlook, crews and IMTs fill themselves in at **8:00 AM and 9:00 PM Mountain Time (New Mexico)**.
ERC/BI come from a file you upload. Everything can still be edited by hand, and each tab shows where its
numbers came from and when.

**7-Day Significant Fire Potential**: the NPSG 7-Day product's map service
(`fsapps.nwcg.gov/psp/arcgis/rest/services/npsg/outlooks_forecast/MapServer`, layers 0–6 = Day 1–7).
Each Southwest PSA gets a level: `drynesscode` 1 (little/no risk), 2 (low), 3 (moderate), or 4 (high risk)
when the PSA carries a CRITICAL burn environment or IGNITION trigger.

**ERC / BI upload**: two ways, same file.

- **On the site** (PSA ERCy tab → *Upload ERC/BI file*, or drag the file onto it): fills the table right away,
  in your browser only.
- **For everyone**: upload the file to the repository's `uploads/` folder (**Add file → Upload files**).
  That starts the workflow, which applies the newest file in `uploads/` to `data/current.json` and rebuilds
  the PDF/Excel briefing; the site shows it a couple of minutes later.

The file can be `.xlsx` or `.csv` (old `.xls` must be re-saved). It needs a PSA column (SW01 … SW14N,
SW-01, "SW 6N" all work) and ERC and/or BI columns. Columns are found by their headers, so
`PSA Avg | ERCy Avg | BI Avg | ERCy Percentile | BI Percentile | ObsDate` (the NFDRSy_Ingest layout) works,
as does a station-level export with a PSA column: several rows per PSA are averaged, using each PSA's latest
date. Without a header row the order PSA, ERCy, BI, ERCy %, BI %, date is assumed. The import says how many
PSAs it found and which are missing; the PL needs the ERCy percentile column to rate fire danger.

**Fire Activity**: set automatically each run from the incidents in WFIGS's current incident layer that
are inside a Southwest PSA, are wildfires, aren't declared out and aren't contained (set
`autoData.fireActivity.countContained` to `true` to count contained fires that aren't out). Each incident's
type comes from its IRWIN complexity level (Type 1–5), or from its management organization when the
complexity is blank (a Complex IMT counts as T2+). Fires inside a complex are counted once, as the complex.
Complex / T1 / T2 incidents and T3 incidents are counted, and the rating follows the spreadsheet's guidance:
0 → Minimum; ≤3 T3+ with ≤1 T2+ → Low; ≤7 with ≤2 → Moderate; ≤14 with ≤4 → High; more → Maximum.
The Fire Activity tab lists the incidents counted. Picking a different rating on the tab overrides it in that
browser until the next run; set `autoData.fireActivity.auto` to `false` to go back to choosing it by hand.

**Crews and IMTs**: the SWCC FireNet SharePoint workbooks, which are shared with "anyone with the link":

- Crews: "SWA CREWS and MODULES", tabs **SWA Type 1 IHC** and **OOA Type 1 IHC**.
- IMTs: tab **Incident Management Teams**.

The job downloads each workbook (the sharing link with `?download=1`), finds the header row by its column
names (SWA CREW, CURRENT TYPE*, HOME STATE, …, STATUS, …, INCIDENTDISP_GACC, INCIDENT NAME, REMARKS for
crews; MOB LOCATION, TYPE, NBR_ZONE, INCIDENT COMMANDER, HOME DISPATCH, STATUS, … for IMTs), skips the
`------` separator rows, and reads the sheet's "Last Update:" text, which the tabs display. A crew with
status P counts as available when its INCIDENTDISP_GACC is SWCC, as in the spreadsheet. Links, tab names
and the header names it recognizes are in `js/config.js` and `scripts/lib/resources.cjs`.
If a sharing link stops being public, the job log says SharePoint returned a sign-in page.

**Where the pulls run**

- **Scheduled job.** `.github/workflows/update-data.yml` runs at 8:00 AM and 9:00 PM Mountain Time year-round,
  adjusting for MDT/MST automatically. GitHub sometimes starts scheduled runs late (over an hour at busy times),
  so each slot has two backup start times an hour apart; whichever starts first between 8–10 AM or 9–11 PM does
  the update, and the rest see it's done and stop. It runs
  `node scripts/update-data.mjs`, which updates `data/current.json`, then builds `reports/SWA_PL_latest.pdf`
  and `.xlsx`, and commits. GitHub Pages republishes, and everyone's page picks up the newer data on their
  next visit. If one source fails, the others still update and the failed one keeps its last good data.
  To run it right away: **Actions → Update PL data → Run workflow**. (In **Settings → Actions → General**,
  workflow permissions must allow *Read and write*.)
- **In the browser.** The 7-Day tab has a "Pull latest from NPSG" button, and the page tries it when it
  opens with old data. This only works if NPSG allows requests from your site (CORS); if not, the page says
  so and uses the copy the scheduled job saved. SharePoint can only be read by the scheduled job.

Run it yourself with Node 18+: `node scripts/update-data.mjs` (add `--outlook`, `--upload`, `--resources`, `--starts` or `--raws` for one part, `--no-archive` to skip archiving).
`node tests/sources.test.js` checks the readers against saved samples in `tests/fixtures/`.

Fire Activity is still entered by hand.

## Archive and database

Every run (8 AM, 9 PM, manual, or an ERC/BI upload) is archived in `data/archive/`, building a record to
check the PL calculation against what actually happened:

| File | One row per | Contents |
|---|---|---|
| `history.csv` | run | PL, score, weights, each element's rating, inputs and contribution, the sheets' Last Update, previous-day starts and RAWS summary, link to the snapshot |
| `fire_starts_daily.csv` | day | New wildfire starts by cause (lightning, human, unknown), acres, and starts per PSA |
| `fire_starts.csv` | fire | WFIGS id, discovery date/time, name, cause (as reported and grouped), acres, state, dispatch, PSA, lat/lon |
| `fems_erc_bi_daily.csv` | day and PSA | FEMS fuel model Y ERC and BI from the SWCC station list: stations reporting, 13:00 values and daily max, averaged per PSA |
| `fems_erc_bi_stations.csv` | day and station | The same for each listed station |
| `raws_checks.csv` | removed or flagged reading | date, PSA, station, reading, hour, value, reason, action |
| `raws_daily.csv` | day and PSA | RAWS and ASOS/AWOS stations reporting, average max temperature, average and lowest min RH, max gust, average precipitation, stations with wetting rain (≥ 0.10 in) |
| `snapshots/YYYY/YYYY-MM-DD_HHMM.json` | run | The full data behind that run's PL |

The CSVs open in Excel and can be downloaded from the **History & Data** tab, which also shows yesterday's
starts and RAWS, a chart of the morning PL score against daily starts, and a table of average starts per day
for each PL (or each element's rating), with the correlation between score and starts. Over a season this
shows whether higher PLs actually line up with more fire activity, and which element is pulling its weight.

**Fire starts** come from the NIFC WFIGS incident locations layer (year to date), wildfires only (type WF),
in AZ, NM, TX and OK, then kept only if the point of origin falls inside a Southwest PSA (outlines from the
NPSG map service), so West Texas and the Oklahoma panhandle count only where they're in SWA PSAs. Causes:
Natural → lightning, Human → human, everything else (Undetermined, Unknown, blank) → unknown. Each run
re-counts the last 7 days because incidents are often entered late.

**RAWS weather** comes from FEMS public weather observations (`weatherObs` on fems.fs2c.usda.gov, no key
needed) for as many stations as are available: every RAWS FEMS lists in AZ, NM, TX and OK (`stationMetaData`),
kept if its latitude/longitude falls inside a Southwest PSA. For the previous local day the job takes each
station's hourly observations (forecast rows and readings FEMS flags as suspicious are dropped) and keeps
max temperature, min RH, max peak gust (max sustained wind if no gust is reported) and the 24-hour
precipitation total, then summarizes by PSA.

Every reading goes through quality checks first (`scripts/lib/wxcheck.cjs`); anything removed is left out
of the PSA numbers and listed, with the reason, on the History & Data tab and in `raws_checks.csv`:

| Check | Removes |
|---|---|
| FEMS QC flag | readings FEMS marks as suspicious |
| Physical limits | temperature outside −40–125 °F, RH 0 % or over 100 %, wind over 80 mph, gust over 130 mph, over 2 in. rain in an hour |
| Spike | one hour that jumps away from both neighbouring hours (temperature 20 °F, RH 40 %, wind 30 mph) while they agree |
| Stuck sensor | temperature or RH identical for 12 or more hours |
| Neighbours | a station's max temp or min RH more than 30 from the median of the other stations in its PSA (needs 3+ stations) |
| Gauge reset | a 24-hour rain total over 6 in. |
| Gust lower than wind | a gust reading below the sustained wind at the same hour |
| Isolated heavy rain | 1 in. or more at one station while the rest of the PSA was dry: **kept**, but listed to look at |

**Wind: real events stay in, sensor faults come out.** A gust looks odd when it is over 75 mph, more than
3 × the sustained wind + 30 mph, a 40 mph jump for one hour, or 40+ mph above every other station in the PSA.
An odd gust is kept ("kept – wind event", with the reason) only when something backs it up **at a similar
strength**, so a 125 mph gust can't be backed up by a 43 mph gust next door:

| Gust | Backed up by (any one) |
|---|---|
| up to 75 mph | the station's own sustained wind is 25+ mph and at least 40 % of the gust · the hour before or after gusted 40+ mph and at least 70 % of it · an outflow signature (temperature fell 10 °F, RH jumped 15 points, or rain) · another RAWS or ASOS/AWOS in the PSA gusted at least 60 % of it (and 40+) within 2 hours |
| 75–90 mph | the same, but an outflow signature alone isn't enough |
| over 90 mph | only another station in the PSA gusting at least half of it (and 45+ mph) within 2 hours |
| over 130 mph | always removed |

A PSA counts as having a **wind event** only when 2 or more stations (or a quarter of them) still have gusts
of 40+ mph after these checks, so one bad sensor can't create one. A day you know had a wind event can be
listed in `autoData.raws.windEvents` in `js/config.js`, e.g. `{ date: "2026-04-12", psa: "SW-11" }` or
`psa: "all"`; gusts that day are kept up to 130 mph.

Example: on Nov 15, 2026 The Bowl (SW-12) reported a 125 mph gust with an RH jump of 17 points; the strongest
gust nearby was 43 mph at Pinery (63 needed), so it's removed and SW-12 has no wind event. The thresholds are
at the top of `scripts/lib/wxcheck.cjs`.

**ASOS/AWOS** airport stations are added to the same summaries from the Iowa Environmental Mesonet (public,
no key; `autoData.asos` in `js/config.js`). The job lists the AZ, NM, TX and OK ASOS networks (which hold
the ASOS and AWOS sites), keeps open stations inside a Southwest PSA, and turns their METARs into one record
per hour: temperature and RH from the hourly report, sustained wind from that report, gust = the highest gust
or peak wind (PK WND) of any report that hour, and the hour's precipitation (knots converted to mph). They go
through exactly the same checks as the RAWS and count as neighbours when backing up a gust. If IEM is down,
the RAWS summaries still run and the log says ASOS/AWOS weren't added.
`raws_daily.csv` gives RAWS and ASOS/AWOS station counts per PSA; `raws_stations_daily.csv` has every station's
daily values after the checks.

**Re-checking past days.** After the checks change, earlier days can be pulled and checked again: on GitHub,
**Actions → Update PL data → Run workflow**, enter a start date in *redo_weather_from* (e.g. `2026-11-01`).
It rewrites `raws_daily.csv`, `raws_stations_daily.csv` and `raws_checks.csv` for those days (any number of days).
From a computer: `node scripts/update-data.mjs --redo-weather-from=2026-11-01`.

**FEMS ERC and BI (archive only)** come only from the SWCC ERC station list, set in
`autoData.raws.nfdrStationsByPsa` in `js/config.js` (Eight Mile Draw counts in both SW13 and SW14N, as SWCC
lists it; the four "Other" stations are archived individually but not averaged into a PSA). Previous-day
NFDRS fuel model Y observations (`nfdrsObs`): per station the reading closest to 13:00 local time and the
day's highest ERC and BI, averaged per PSA into `fems_erc_bi_daily.csv`, station by station into
`fems_erc_bi_stations.csv`, and into the history (`fems_erc_avg`, `fems_bi_avg`, `fems_erc_highest_psa`,
`fems_bi_highest_psa`). These are kept for comparison; the PL's Fire Danger element still uses the ERC/BI
file you upload, with its percentiles.

## Season Review: is the criteria working?

The **Season Review** tab checks the criteria against everything ever archived. Pick a range (everything,
the last 30 or 90 days, a whole year, a fire season, or any dates); the fire-season months offered are set in
`review.fireSeason` in `js/config.js` (April 1 – July 31 to start).

- **At a glance**: days, new starts (lightning/human), acres, highest PL, how often the PL changed and how many
  times it went up and straight back down, and the correlation between the PL score and the next 7 days' starts.
- **PL score and new fire starts** over the whole range: the current criteria, the old fire-season weighting,
  and the trial criteria if one is applied.
- **Does a higher PL mean more fire?** Days at each PL for every method: the PL *published at the time*, the
  *current criteria* (every run re-scored with today's `js/config.js`), the old shoulder-season and
  fire-season weightings, and the trial. Then for the method chosen in "Judge which PL": what followed each PL
  (starts that day, starts and acres over the next 7 days, active T3+ fires, days with an escape), with a
  plain-language verdict on whether each higher PL was followed by more fire.
- **Does each element line up with fire?** The same for each Fire Activity, 7-Day, ERCy, IMT and crew rating,
  with a warning when one rating covers 85%+ of the days (the element hardly moves, so it adds little).
- **Fire Activity criteria against this range**: how new starts per day and escapes were spread out, how many
  days fell in each band, and lines set at the 50th/75th/90th/97th percentile of the days with fire as a
  starting point; how often each +1 step fired; how many days the PL2 hold applied and what followed them.
- **PSA by PSA**: did 7-Day Day 1 levels and ERCy percentiles point at the PSAs that got starts (that day and
  the next 2)? And weather (lowest RH, wind events, wetting rain from RAWS + ASOS/AWOS) vs starts the next 2 days,
  to see whether weather would add something the current elements miss.
- **Days to look at**: the days the PL looked low (PL1–2 before one of the busiest 10% of weeks) and looked high
  (PL3+ before one of the quietest quarter), to pull up in a season review.
- **Try different criteria**: change weights, PL lines, the PL2 hold, the Fire Activity thresholds and steps,
  the 7-Day bands or the ERCy Extreme count, and apply them to the whole archive. Every table adds a "Trial
  criteria" result next to the current one. "Copy as js/config.js settings" gives the numbers to put in the
  config when you're happy with them; nothing on the live site changes until then.
- **Download this review (Excel)**: all of the above for the range, plus every day's PLs, ratings and starts.

**PLs from before the archive started** go in `data/archive/published_pl.csv` (columns `date,pl`, one row per
day; `2026-01-01` to `2026-11-16` is there now). Season Review counts them as "Published at the time" on days
with no archived run, and shows them in the strip under the chart. They have no inputs, so they can't be
re-scored with other criteria; the new-starts part of Fire Activity is still shown for those days because it
comes from the WFIGS fire starts.

Nothing is ever deleted from the archive: every run's snapshot is kept, and the CSVs only add or replace rows.
Each update also re-scores every archived run with the current criteria (`model_pl`, `model_score`,
`model_held`, `model_fire_rating` in `history.csv`) and fills in columns added after a run was made, so after
the criteria change, the whole record is judged by the new criteria next to what was published at the time.
`outlook_psa_daily.csv` and `ercy_psa_daily.csv` keep the 7-Day levels and uploaded ERCy per PSA for the PSA checks.

## Files

```
index.html            page
css/styles.css        styles (light and dark)
js/config.js          model settings, PSAs, rosters, status codes
js/calc.js            PL calculation engine (browser + Node)
js/app.js             user interface
js/review.js          Season Review: re-scores archived runs and checks the criteria (browser + Node)
data/current.json     published data (seeded from the 11/3–11/4/2026 workbook)
assets/psa-map.png    PSA reference map (from the workbook)
tests/calc.test.js    calculation checks
js/sources.js         NPSG 7-Day reader (browser + Node)
js/erc-import.js, js/xlsx-read.js   ERC/BI file import and .xlsx reader (browser + Node, no libraries)
scripts/lib/          SharePoint workbook download and crew/IMT reader
uploads/              put the day's ERC/BI file here to update the site for everyone
scripts/lib/firestarts.cjs, raws.cjs, asos.cjs, wxcheck.cjs, archive.cjs   fire starts, RAWS + ASOS/AWOS, weather checks, the archive
data/archive/         the archive and CSV database (written by the scheduled job)
tests/archive.test.js checks for fire starts, RAWS and the archive
tests/review.test.js  checks that the Season Review re-scores archived runs exactly like the live calculation
scripts/update-data.mjs, .github/workflows/update-data.yml   scheduled pull
tests/fixtures/       sample SharePoint workbooks and ERC/BI files used by the tests
js/export.js, js/xlsx-lite.js   briefing text and Excel export (no external libraries)
scripts/make-report.mjs        builds reports/SWA_PL_latest.pdf and .xlsx (uses Playwright)
reports/                       latest scheduled PDF and Excel briefing
tests/sources.test.js parsing checks for the automatic data
```

### After changing code

`index.html` loads the scripts and styles with a version tag (`js/app.js?v=20261116`). When you upload
changed `js/` or `css/` files, change that date in `index.html` too, so browsers fetch the new files right
away instead of using a cached copy.
