/*
 * SWA Preparedness Level — calculation engine.
 * Pure functions: state in, numbers and ratings out. No DOM access, so the same
 * code runs in the browser, in Node tests, and in any future automated pipeline.
 */
(function (root) {
  "use strict";

  function makeCalc(C) {
    const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
    const num = (v) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };

    /* ---------- Fire Activity ---------- */
    const R = ["Minimum", "Low", "Moderate", "High", "Maximum"];
    const idx = (r) => Math.max(0, R.indexOf(r));
    const maxR = (...rs) => R[Math.max(...rs.map(idx))];
    const band = (v, bands) => { let r = "Minimum"; for (const b of bands) if (v !== null && v >= b.atLeast) r = b.rating; return r; };
    /* Large-fire rule from the spreadsheet guidance: active T3+ incidents, of which T2+/complex. */
    function largeFireRating(complex, t3) {
      const total = complex + t3;
      for (const lvl of C.fireActivity) if (total <= lvl.maxIncidents && complex <= lvl.maxComplex) return lvl.rating;
      return "Maximum";
    }
    /* Average new starts per day over the last 3 complete days in the fire-start pull. */
    function startsAverage(fireStarts) {
      const d = (fireStarts && fireStarts.daily) || {};
      const days = Object.keys(d).sort().filter((k) => !fireStarts.to || k <= fireStarts.to).slice(-3);
      return days.length ? round(days.reduce((a, k) => a + (num(d[k].total) || 0), 0) / days.length, 1) : null;
    }
    /*
     * Fire Activity = how much work is on the ground and how hard it is to meet it.
     *  demand   = the higher of the large-fire rating and the initial-attack rating
     *             (IA = the higher of the 3-day new-start average and escapes);
     *  +1 step  if IMT or crew capacity is strained;
     *  +1 step  if the 7-day outlook is rising or already High/Maximum.
     * The steps only apply when demand is above Minimum: no fire on the ground stays Minimum.
     * ctx = { imt, crews, outlook, fireStarts } summaries; fire.override wins when a person picked a rating.
     */
    function fireActivity(fire, ctx = {}) {
      const M = C.fireActivityModel;
      const complex = num(fire.complex) || 0;
      const t3 = num(fire.t3) || 0;
      const total = complex + t3;
      const large = largeFireRating(complex, t3);
      const startsAvg = num(fire.startsAvg3) ?? startsAverage(ctx.fireStarts);
      const escapes = num(fire.escapes);
      const startsRating = band(startsAvg, M.startsPerDay);
      const escapeRating = band(escapes, M.escapes);
      const ia = maxR(startsRating, escapeRating);
      const demand = maxR(large, ia);
      const steps = [];
      if (demand !== "Minimum") {
        const im = ctx.imt, cr = ctx.crews;
        const cap = [];
        if (im && im.availCimt <= M.capacity.maxCimtAvailable) cap.push(`${im.availCimt} CIMT${im.availCimt === 1 ? "" : "s"} available`);
        if (cr && cr.swaTotal && cr.ratio <= M.capacity.maxCrewShare) cap.push(`${Math.round(cr.ratio * 100)}% of crews available`);
        if (cap.length) steps.push({ kind: "capacity", why: `resources strained: ${cap.join(", ")}` });
        const o = ctx.outlook;
        if (o && o.daily && o.daily.length === 7) {
          const front = (o.daily[0].score + o.daily[1].score + o.daily[2].score) / 3;
          const back = (o.daily[3].score + o.daily[4].score + o.daily[5].score + o.daily[6].score) / 4;
          const highDays = o.daily.reduce((a, d) => a + d.counts[4], 0);
          if (M.outlook.alreadyHigh.includes(o.rating)) steps.push({ kind: "outlook", why: `7-day outlook already ${o.rating}` });
          else if (back - front >= M.outlook.risingBy && highDays >= M.outlook.minHighRiskPsaDays)
            steps.push({ kind: "outlook", why: `7-day outlook rising (${round(front, 1)} → ${round(back, 1)}) with ${highDays} high-risk PSA-days` });
        }
      }
      const computed = R[Math.min(4, idx(demand) + steps.length)];
      const mode = fire.override ? "override" : M.enabled ? (fire.fetchedAt ? "auto" : "calculated") : "manual";
      const rating = mode === "override" ? fire.override : mode === "manual" ? fire.rating || "Minimum" : computed;
      return { rating, mode, computed, complex, t3, total, suggested: large, large, startsAvg, startsRating, escapes, escapeRating, ia, demand, steps };
    }

    /* ---------- IMT Availability ---------- */
    function imtSummary(imts) {
      const group = (code) => (C.imtStatuses.find((s) => s.code === code) || {}).group;
      const isCimt = (t) => t === "CIMT" || t === "OOA CIMT";
      const rows = { total: imts.length, cimt: 0, t3: 0, other: 0,
        availCimt: 0, availT3: 0, availAll: 0, commCimt: 0, commT3: 0 };
      for (const t of imts) {
        const g = group(t.status);
        if (isCimt(t.type)) rows.cimt++; else if (String(t.type) === "3") rows.t3++; else rows.other++;
        if (g === "available") {
          rows.availAll++;
          if (isCimt(t.type)) rows.availCimt++;
          if (String(t.type) === "3") rows.availT3++;
        }
        if (g === "committed") {
          if (isCimt(t.type)) rows.commCimt++;
          if (String(t.type) === "3") rows.commT3++;
        }
      }
      // IMT's!D43
      let rating;
      if (rows.availCimt === 0) rating = "Minimum";
      else if (rows.availCimt <= 2) rating = "Low";
      else if (rows.availCimt <= 3) rating = "Moderate";
      else if (rows.availT3 >= 4) rating = "Maximum";
      else rating = "High";
      // IMT's!D26 (commitment, shown for reference)
      let commitment;
      if (rows.commCimt >= 5) commitment = "Maximum";
      else if (rows.commCimt >= 3) commitment = "High";
      else if (rows.commCimt > 0) commitment = "Moderate";
      else if (rows.commT3 > 0) commitment = "Low";
      else commitment = "Minimum";
      return { ...rows, rating, commitment };
    }

    /* ---------- Crew Availability ---------- */
    function crewRatio(ratio) {
      for (const b of C.crewAvailability.bands) {
        if (b.atLeast !== undefined ? ratio >= b.atLeast : ratio > b.above) return b.rating;
      }
      return "Minimum";
    }
    function crewCounts(crews) {
      const out = {};
      for (const s of C.crewStatuses) out[s.code] = 0;
      let prepoSWCC = 0, prepoUnit = 0;
      for (const c of crews) {
        if (out[c.status] === undefined) continue;
        out[c.status]++;
        if (c.status === "P") {
          if ((c.location || "").toUpperCase() === C.prepoAvailableLocation) prepoSWCC++; else prepoUnit++;
        }
      }
      const groupOf = (code) => (C.crewStatuses.find((s) => s.code === code) || {}).group;
      const g = {};
      for (const code in out) { const k = groupOf(code); g[k] = (g[k] || 0) + out[code]; }
      return { byStatus: out, byGroup: g, prepoSWCC, prepoUnit,
        available: (g.available || 0), committed: out.C || 0 };
    }
    function crewSummary(crews, ooaCrews) {
      const swa = crewCounts(crews);
      const ooa = crewCounts(ooaCrews || []);
      const denom = crews.length || 1;
      const swaAvail = swa.available + swa.prepoSWCC;
      const ooaAvail = (C.crewAvailability.includeOOAAvailable ? ooa.available : 0) + ooa.prepoSWCC;
      const totalAvail = swaAvail + ooaAvail;
      const ratio = totalAvail / denom;
      return {
        swa, ooa, swaTotal: crews.length, ooaTotal: (ooaCrews || []).length,
        swaAvail, ooaAvail, totalAvail, ratio,
        swaRating: crewRatio(swaAvail / denom),
        rating: crewRatio(ratio),
        commitRatio: swa.committed / denom,
        commitment: crewRatio(swa.committed / denom),
      };
    }

    /* ---------- 7-Day Significant Fire Potential ---------- */
    function outlookRating(score) {
      for (const b of C.outlook.bands) if (score < b.below) return b.rating;
      return "Maximum";
    }
    function outlookSummary(outlook) {
      const days = 7;
      const daily = [];
      for (let d = 0; d < days; d++) {
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
        let score = 0, n = 0;
        for (const p of C.psas) {
          const v = num((outlook.values[p.id] || [])[d]);
          if (v === null) continue;
          const lvl = Math.max(1, Math.min(4, Math.round(v)));
          counts[lvl]++; score += lvl; n++;
        }
        daily.push({ counts, score, n, rating: outlookRating(score) });
      }
      const avg = daily.reduce((a, d) => a + d.score, 0) / days;
      return { daily, avg: round(avg, 2), rating: outlookRating(avg) };
    }

    /* ---------- PSA ERCy ---------- */
    function dangerSummary(danger) {
      const bins = { below50: 0, p50to89: 0, p90to96: 0, p97plus: 0, missing: 0 };
      const biBins = { below50: 0, p50to89: 0, p90to96: 0, p97plus: 0 };
      const binOf = (v, b) => {
        if (v < 50) b.below50++; else if (v < 90) b.p50to89++; else if (v < 97) b.p90to96++; else b.p97plus++;
      };
      for (const p of C.psas) {
        const r = danger.rows[p.ercId] || {};
        const e = num(r.ercPct);
        if (e === null) bins.missing++; else binOf(e, bins);
        const b = num(r.biPct);
        if (b !== null) binOf(b, biBins);
      }
      let rating;
      if (bins.p97plus >= C.danger.extremeCount) rating = "Extreme";
      else if (bins.p97plus > 0) rating = "High";
      else if (bins.p90to96 > 0) rating = "Moderate";
      else if (bins.p50to89 > 0) rating = "Low";
      else rating = "Minimum";
      return { bins, biBins, above50: bins.p50to89 + bins.p90to96 + bins.p97plus, count: C.psas.length, rating };
    }

    /* ---------- PL ---------- */
    function plLevel(score) {
      let pl = 1;
      for (const l of C.plLevels) if (score >= l.min) pl = l.pl;
      return pl;
    }
    function weightsFor(state) {
      if (state.preset && state.preset !== "custom" && C.weightPresets[state.preset]) {
        return { ...C.weightPresets[state.preset].weights };
      }
      return { ...C.weightPresets[C.defaultPreset].weights, ...(state.weights || {}) };
    }
    /* opts: { weights, fireRating, gate } — used to recompute with the old method for comparison. */
    function compute(state, opts = {}) {
      const imt = imtSummary(state.imts || []);
      const crews = crewSummary(state.crews || [], state.ooaCrews || []);
      const outlook = outlookSummary(state.outlook || { values: {} });
      const danger = dangerSummary(state.danger || { rows: {} });
      const fire = fireActivity(state.fire || {}, { imt, crews, outlook, fireStarts: state.fireStarts });
      if (opts.fireRating) fire.rating = opts.fireRating;
      const weights = opts.weights ? { ...opts.weights } : weightsFor(state);
      const ratings = { fire: fire.rating, imt: imt.rating, crews: crews.rating,
        outlook: outlook.rating, danger: danger.rating };
      const elements = C.elements.map((e) => {
        const table = e.inverted ? C.invertedMultipliers : C.multipliers;
        const mult = table[ratings[e.key]] ?? 0;
        const weight = num(weights[e.key]) || 0;
        return { ...e, rating: ratings[e.key], weight, multiplier: mult, contribution: round(weight * mult) };
      });
      const score = round(elements.reduce((a, e) => a + e.contribution, 0));
      const weightTotal = round(elements.reduce((a, e) => a + e.weight, 0));
      // PL3 and above need fire on the ground: without it the PL is held at C.plGate.maxPlWithoutFire.
      let pl = plLevel(score), held = false;
      const gate = opts.gate ?? true;
      if (gate && C.plGate && fire.rating === "Minimum" && pl > C.plGate.maxPlWithoutFire) { pl = C.plGate.maxPlWithoutFire; held = true; }
      return { fire, imt, crews, outlook, danger, weights, weightTotal, elements, score, pl, scorePl: plLevel(score), held };
    }
    /* The PL the old spreadsheet method would give (seasonal weights, large-fire rule only, no gate). */
    function oldMethod(state, preset) {
      const r0 = compute(state, { gate: false });
      return compute(state, { weights: C.weightPresets[preset].weights, fireRating: r0.fire.large, gate: false });
    }

    return { compute, oldMethod, fireActivity, largeFireRating, startsAverage, imtSummary, crewSummary, outlookSummary, dangerSummary,
      outlookRating, crewRatio, plLevel, weightsFor };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = makeCalc;
  else root.PL_CALC = makeCalc(root.PL_CONFIG);
})(typeof window !== "undefined" ? window : globalThis);
