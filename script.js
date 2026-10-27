// Bump this whenever a chart or data file changes, so browsers fetch
// the new version instead of an old cached copy.
var VERSION = "20261027y";

// Each entry links a container on the page (by its id) to a chart specification.
// Files ending in .vl.json are Vega-Lite; files ending in .vg.json are Vega.
var charts = [
  { id: "#forest-area-map",            spec: "charts/forest_area_choropleth.vl.json" },
  { id: "#forest-area-by-state",       spec: "charts/forest_area_by_state.vl.json" },
  { id: "#chart-04",                   spec: "charts/forest_type_donut.vl.json" },
  { id: "#chart-13",                   spec: "charts/tree_species_distribution.vl.json" },
  { id: "#forest-clearing-regrowth",   spec: "charts/forest_clearing_regrowth.vl.json",
    narrow: { below: 640, apply: function (s) { eachLegend(s, function (l) { l.columns = 2; }); } } },
  { id: "#plantation-over-time",       spec: "charts/plantation_area_over_time.vl.json",
    fit: function (spec, w) {               // both views fill the column (minus the y-axis)
      var plot = Math.max(320, w - 90);
      spec.vconcat.forEach(function (v) { v.width = plot; });
    } },
  { id: "#plantation_establishment",   spec: "charts/plantation_establishment_by_jurisdiction.vl.json" },
  { id: "#forest-credits-cartogram",   spec: "charts/forest_credits_cartogram.vl.json" },
  { id: "#forest-credits-slope",       spec: "charts/forest_credits_slope.vl.json" },
  { id: "#forest-fire-area",           spec: "charts/forest_fire_area_over_time.vl.json",
    narrow: { below: 640, apply: function (s) { s.encoding.x.axis.labelExpr = "replace(slice(datum.label, 2), '-', '–')"; } } },
  { id: "#forest-fire-heatmap",        spec: "charts/forest_fire_by_state_heatmap.vl.json" },
  { id: "#fire-detections-hexbin",     spec: "charts/fire_detections_hexbin.vl.json",
    fit: function (spec, w) {               // scale the pre-projected map to fill the column
      var k = Math.max(0.6, Math.min(1.25, w / 600));
      spec.width = Math.round(590 * k); spec.height = Math.round(470 * k);
      spec.projection = { type: "identity", scale: k, translate: [0, 0] };
      spec.layer.forEach(function (L) {     // labels and leader line are in pixels too
        if (!L.data || !L.data.values) return;
        L.data.values.forEach(function (d) {
          ["x", "y", "x2", "y2"].forEach(function (f) { if (typeof d[f] === "number") d[f] *= k; });
        });
      });
    },
    passThrough: ["layer_1_marks", "layer_2_marks", "layer_3_marks", "layer_4_marks", "layer_5_marks", "layer_6_marks"] },   // outlines and labels drawn over the hexagons
  { id: "#forest-protection-alluvial", spec: "charts/forest_protection_alluvial.vg.json" },
  { id: "#forest-protection-waffle",   spec: "charts/forest_protection_waffle.vl.json",
    narrow: { below: 600, apply: function (s) { eachLegend(s, function (l) { l.orient = "bottom"; }); } } },
  { id: "#forest-protection-by-state", spec: "charts/forest_protection_by_state.vl.json",
    narrow: { below: 700, apply: function (s) { eachLegend(s, function (l) { l.direction = "vertical"; l.columns = 1; }); } } }
];

// ---------------------------------------------------------------
// Linked highlight for the two plantation charts.
// Clicking a plantation type, in a legend or on a bar, area band or
// direct label, copies that type into a shared "hl" signal in both
// charts. That type stays at full strength and every other type dims.
// Clicking the same bar again, or empty space, clears it. Legend clicks
// arrive through a Vega-Lite selection bound to each legend
// ("legend_pick"); mark clicks arrive through the click listener.
// ---------------------------------------------------------------
var linkedIds = ["#plantation-over-time", "#plantation_establishment"];
var linkedViews = [];
var highlighted = null;
var syncing = false;   // stops the charts from re-triggering each other

function setHighlight(type, sourceView) {
  highlighted = type;
  syncing = true;
  linkedViews.forEach(function (view) {
    view.signal("hl", type);
    // Reset the other chart's own selection, so that clicking the same
    // type there later still registers as a change.
    if (view !== sourceView) view.data("legend_pick_store", []);
    view.runAsync();
  });
  syncing = false;
}

function linkView(view) {
  linkedViews.push(view);

  view.addSignalListener("legend_pick", function (name, value) {
    if (syncing) return;
    var picked = value && value.Plantation_type ? value.Plantation_type[0] : null;
    setHighlight(picked, view);
  });

  view.addEventListener("click", function (event, item) {
    var onBackground = !item || (item.mark && item.mark.marktype === "group");
    var datum = item && item.datum;

    // A click on empty space (nothing, or only the chart background,
    // which Vega reports as a "group" item) clears it.
    if (onBackground) {
      setHighlight(null, null);
      return;
    }

    // A click on a bar, an area band or a direct label ("Hardwood")
    // highlights that type; clicking the same type again clears it.
    // Legend clicks are handled by the "legend_pick" listener above.
    var type = datum && (datum.Plantation_type || datum.t);
    if (["Hardwood", "Softwood", "Other or mixed"].indexOf(type) >= 0) {
      setHighlight(type === highlighted ? null : type, null);
    }
  });
}

// Every chart with a clickable legend: clicking empty space resets its
// highlight, so all legends on the page behave the same way.
var legendSelections = ["species_pick", "coverage_pick", "measure_pick", "fire_type_highlight", "clearing_pick", "credit_pick"];

function addLegendReset(view) {
  view.addEventListener("click", function (event, item) {
    var onBackground = !item || (item.mark && item.mark.marktype === "group");
    if (!onBackground) return;
    legendSelections.forEach(function (name) {
      try { view.data(name + "_store", []); } catch (e) { /* not in this chart */ }
    });
    view.runAsync();
  });
}

// ---------------------------------------------------------------
// Custom tooltips.
// Vega passes each tooltip's fields (keyed by their titles) to
// formatTooltip, which returns HTML. Charts listed in "tooltipCards"
// get a card with extra context worked out from the page's own data
// files; every other chart gets the same card style as a simple list.
// ---------------------------------------------------------------
var tipData = {};   // CSV files the tooltip cards read, loaded once

function loadCSV(url) {
  return fetch(url + "?v=" + VERSION).then(function (r) { return r.text(); }).then(function (text) {
    var lines = text.trim().split(/\r?\n/);
    var keys = lines[0].split(",");
    return lines.slice(1).map(function (line) {
      var cells = line.split(","), row = {};
      keys.forEach(function (k, i) { row[k] = cells[i]; });
      return row;
    });
  });
}

function loadTipData() {
  var files = {
    fire: "data/forest_fire_by_state_year.csv",
    area: "data/forest_area_by_state.csv",
    credits: "data/forest_credits_labels.csv",
    protection: "data/forest_protection_by_state.csv",
    species: "data/tree_species_by_grid.csv",
    clearing: "data/forest_clearing_regrowth.csv",
    net: "data/forest_net_change.csv",
    plantArea: "data/plantation_area_by_type_1974_2022.csv",
    plantEst: "data/plantation_establishment_by_jurisdiction.csv",
    fireYear: "data/forest_fire_by_year.csv",
    creditsType: "data/forest_credits_by_type_year.csv",
    alluvial: "data/forest_protection_alluvial.csv",
    waffle: "data/forest_protection_waffle.csv"
  };
  var cartogram = fetch("data/forest_credits_cartogram.geojson?v=" + VERSION)
    .then(function (r) { return r.json(); })
    .then(function (g) {
      tipData.cartogram = g.features
        .filter(function (f) { return f.properties.kind === "scaled"; })
        .map(function (f) { return f.properties; });
    });
  return Promise.all(Object.keys(files).map(function (name) {
    return loadCSV(files[name]).then(function (rows) { tipData[name] = rows; });
  }).concat(cartogram)).catch(function (e) { console.error("Tooltip data not loaded:", e); });
}

function fmt(n, digits) {
  return Number(n).toLocaleString("en-AU", { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
}
function dash(year) { return String(year).replace("-", "–"); }
function forestArea(state) {
  var row = (tipData.area || []).find(function (r) { return r.State === state; });
  return row ? Number(row.Forest_area_kha) : null;
}

// A row of small bars, one per value; the highlighted one is solid.
function miniBars(values, labels, highlight) {
  var w = 200, h = 46, gap = 6, bw = (w - gap * (values.length - 1)) / values.length;
  var max = Math.max.apply(null, values) || 1, out = "";
  values.forEach(function (v, i) {
    var bh = Math.max(1.5, (v / max) * (h - 14)), x = i * (bw + gap);
    out += '<rect x="' + x + '" y="' + (h - 14 - bh) + '" width="' + bw + '" height="' + bh +
           '" rx="1.5" class="' + (i === highlight ? "on" : "off") + '"/>' +
           '<text x="' + (x + bw / 2) + '" y="' + h + '" class="' + (i === highlight ? "on" : "") + '">' + labels[i] + '</text>';
  });
  return '<svg class="tt-spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' + out + "</svg>";
}

// A small line through all values, with a dot on the highlighted one.
function miniLine(values, highlight, firstLabel, lastLabel) {
  var w = 200, h = 46, top = 4, bottom = h - 14, max = Math.max.apply(null, values) || 1;
  var pts = values.map(function (v, i) {
    return [i * (w - 8) / (values.length - 1) + 4, bottom - (v / max) * (bottom - top)];
  });
  var path = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("");
  var dot = pts[highlight];
  return '<svg class="tt-spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
    '<path d="' + path + '" class="line"/>' +
    '<circle cx="' + dot[0] + '" cy="' + dot[1] + '" r="4" class="dot"/>' +
    '<text x="4" y="' + h + '" text-anchor="start">' + firstLabel + "</text>" +
    '<text x="' + (w - 4) + '" y="' + h + '" text-anchor="end">' + lastLabel + "</text></svg>";
}

function card(colour, parts, extraClass) {
  return '<div class="tt' + (extraClass ? " " + extraClass : "") + '" style="--tt:' + colour + '">' +
    parts.join("") + "</div>";
}

var tooltipCards = {

  // Heatmap: share burnt that year, the state's five years as bars,
  // and how this year compares with the other four.
  "#forest-fire-heatmap": function (v, esc) {
    var state = v["State or territory"], year = v["Financial year"], type = v["Fire type"];
    var area = forestArea(state);
    var rows = (tipData.fire || []).filter(function (r) { return r.State === state && r.Fire_type === type; })
      .sort(function (a, b) { return a.Financial_year < b.Financial_year ? -1 : 1; });
    var shares = rows.map(function (r) { return area ? Number(r.Area_thousand_ha) / area : 0; });
    var i = rows.findIndex(function (r) { return r.Financial_year === year; });
    var s = shares[i] || 0;
    var others = shares.filter(function (_, j) { return j !== i; });
    var avg = others.reduce(function (a, b) { return a + b; }, 0) / (others.length || 1);
    var note;
    if (s > 0 && s === Math.max.apply(null, shares) && avg > 0 && s / avg >= 1.5) {
      note = "Its worst year of the five, about " + fmt(s / avg) + "× its average in the other four.";
    } else if (s === Math.max.apply(null, shares)) {
      note = "Its highest year of the five.";
    } else if (s === Math.min.apply(null, shares)) {
      note = "Its lowest year of the five.";
    } else {
      note = "Its average in the other four years was " + fmt(avg * 100, 1) + "%.";
    }
    return card("var(--c-unplanned)", [
      '<p class="tt-kicker">' + esc(type) + " · " + dash(esc(year)) + "</p>",
      '<p class="tt-title">' + esc(state) + "</p>",
      '<p class="tt-big"><b>' + fmt(s * 100, 1) + '%</b> of its forest burnt</p>',
      '<p class="tt-sub">' + esc(v["Area burnt (thousand hectares)"]) + " thousand hectares</p>",
      miniBars(shares, rows.map(function (r) { return dash(r.Financial_year.slice(2)); }), i),
      '<p class="tt-note">' + note + "</p>"
    ]);
  },

  // Cartogram: credits so far, share of the national total, the mix of
  // project kinds, and the state's running total over time.
  "#forest-credits-cartogram": function (v, esc) {
    var state = v["State or territory"], upTo = v["Up to the end of"];
    var all = tipData.credits || [];
    var mine = all.filter(function (r) { return r.State === state; })
      .sort(function (a, b) { return a.Year - b.Year; });
    var i = mine.findIndex(function (r) { return r.Financial_year === upTo; });
    var year = i >= 0 ? mine[i].Year : null;
    var national = all.filter(function (r) { return r.Year === year; })
      .reduce(function (a, r) { return a + Number(r.Credits_m); }, 0);
    // Hovering a state's shape, its outline or its label all land here,
    // so the figures come from the cartogram file, not the hovered mark.
    var props = (tipData.cartogram || []).find(function (f) {
      return f.State === state && f.Financial_year === upTo;
    }) || {};
    var credits = Number(props.Credits_m) || 0;
    var share = national ? credits / national : 0;
    var kinds = [
      ["Regeneration", "Regeneration_m", "var(--c-regen)"],
      ["Avoided clearing", "Avoided_m", "var(--c-avoidedc)"],
      ["Plantings", "Plantings_m", "var(--c-plantings)"],
      ["Plantations", "Plantations_m", "#e3dcb0"]
    ];
    var mix = "", legend = "";
    kinds.forEach(function (k) {
      var n = Number(props[k[1]]) || 0;
      if (!credits || n / credits < 0.005) return;
      mix += '<span style="width:' + (n / credits * 100) + "%;background:" + k[2] + '"></span>';
      legend += '<span><i style="background:' + k[2] + '"></i>' + k[0] + " " + fmt(n / credits * 100) + "%</span>";
    });
    var parts = [
      '<p class="tt-kicker">Forest carbon credits · to ' + esc(upTo) + "</p>",
      '<p class="tt-title">' + esc(state) + "</p>",
      credits >= 1
        ? '<p class="tt-big"><b>' + fmt(credits, 1) + " million</b> credits</p>"
        : '<p class="tt-big"><b>' + fmt(credits * 1000) + " thousand</b> credits</p>",
      '<p class="tt-sub">' + fmt(share * 100, share < 0.01 ? 1 : 0) + "% of Australia's forest credits up to that year</p>"
    ];
    if (mix) parts.push('<div class="tt-mix">' + mix + '</div><div class="tt-mix-key">' + legend + "</div>");
    if (mine.length > 1 && i >= 0) {
      parts.push(miniLine(mine.map(function (r) { return Number(r.Credits_m); }), i,
        mine[0].Financial_year, mine[mine.length - 1].Financial_year));
    }
    return card("var(--c-carbon)", parts);
  },

  // Dumbbell: both measures, the gap, the protected area in hectares
  // and the state's rank.
  "#forest-protection-by-state": function (v, esc) {
    var state = v["State or territory"];
    var rows = tipData.protection || [];
    var row = rows.find(function (r) { return r.State === state; }) || {};
    var nrs = Number(row.National_Reserve_System_pct), all = Number(row.Combined_protection_pct);
    var area = forestArea(state);
    var ranked = rows.slice().sort(function (a, b) { return b.Combined_protection_pct - a.Combined_protection_pct; });
    var rank = ranked.findIndex(function (r) { return r.State === state; }) + 1;
    var protectedHa = area ? area * all / 100 : null;
    var haText = protectedHa === null ? "" :
      protectedHa >= 1000 ? fmt(protectedHa / 1000, 1) + " million hectares" : fmt(protectedHa) + " thousand hectares";
    var ordinal = ["", "highest", "2nd highest", "3rd highest", "4th highest", "5th highest", "6th highest", "7th highest", "lowest"][rank];
    return card("var(--c-nrs)", [
      '<p class="tt-kicker">Protected share of native forest</p>',
      '<p class="tt-title">' + esc(state) + "</p>",
      '<div class="tt-pair"><div><b>' + nrs + '%</b><span>in reserves</span></div>' +
        '<div><b>' + all + '%</b><span>with all measures</span></div></div>',
      '<p class="tt-sub">A ' + (all - nrs) + "-point gap" + (haText ? ". About " + haText + " protected in total." : ".") + "</p>",
      '<p class="tt-note">The ' + ordinal + " share with all measures, out of eight states and territories.</p>"
    ]);
  },

  // ---- 01 Where ----------------------------------------------------

  // Choropleth: forest cover, compared with the national 17% and ranked.
  "#forest-area-map": function (v, esc) {
    var state = v["State or territory"];
    var row = areaRow(state) || {};
    var cover = Number(row.Forest_cover_pct), area = Number(row.Forest_area_kha);
    var rank = rankOf(tipData.area, "Forest_cover_pct", state);
    var compare = cover >= NATIONAL_COVER * 1.15
      ? "about " + fmt(cover / NATIONAL_COVER, 1) + "× the national share of " + NATIONAL_COVER + "%."
      : cover <= NATIONAL_COVER * 0.85 ? "below the national share of " + NATIONAL_COVER + "%."
      : "close to the national share of " + NATIONAL_COVER + "%.";
    return card("var(--c-forest)", [
      '<p class="tt-kicker">Native forest cover · 2023</p>',
      '<p class="tt-title">' + esc(state) + "</p>",
      '<p class="tt-big"><b>' + fmt(cover, 1) + "%</b> of its land</p>",
      '<p class="tt-sub">' + kha(area) + " of native forest</p>",
      '<p class="tt-note">' + capital(rankWord(rank, 8)) + " of eight for forest cover, " + compare + "</p>"
    ]);
  },

  // Bars: total area, share of the nation, rank, and the state's cover.
  "#forest-area-by-state": function (v, esc) {
    var state = v["State or territory"];
    var row = areaRow(state) || {};
    var area = Number(row.Forest_area_kha);
    var total = sum(tipData.area, "Forest_area_kha");
    var rank = rankOf(tipData.area, "Forest_area_kha", state);
    return card("var(--c-forest)", [
      '<p class="tt-kicker">Native forest area · 2023</p>',
      '<p class="tt-title">' + esc(state) + "</p>",
      '<p class="tt-big">' + bigKha(area) + "</p>",
      '<p class="tt-sub">' + pct(area / total) + " of Australia's native forest</p>",
      '<p class="tt-note">' + capital(rankWord(rank, 8)) + " of eight by area. Forest covers " +
        fmt(Number(row.Forest_cover_pct)) + "% of its land.</p>"
    ]);
  },

  // ---- 02 What -----------------------------------------------------

  // Donut: share, area, an "about 1 in N hectares" comparison, and
  // the members of "Other types".
  "#chart-04": function (v, esc) {
    var type = v["Forest type"], share = num(v.Share) / 100;
    var parts = [
      '<p class="tt-kicker">Native forest by type · 2023</p>',
      '<p class="tt-title">' + esc(type) + "</p>",
      '<p class="tt-big"><b>' + pct(share) + "</b> of native forest</p>",
      '<p class="tt-sub">' + esc(v.Area) + "</p>"
    ];
    if (v.Includes) {
      parts.push('<ul class="tt-list">' + String(v.Includes).split(", ").map(function (item) {
        var m = item.match(/^(.*) ([\d.]+%)$/);
        return m ? "<li><span>" + esc(capital(m[1])) + "</span><b>" + esc(m[2]) + "</b></li>" : "<li>" + esc(item) + "</li>";
      }).join("") + "</ul>");
    }
    parts.push('<p class="tt-note">' + (share > 0.5
      ? "About three in every four hectares of native forest."
      : "About 1 in every " + fmt(1 / share) + " hectares of native forest.") + "</p>");
    return card("var(--c-forest)", parts);
  },

  // Species map: records in the cell, the cell's location, and its
  // share of all records for that species.
  "#chart-13": function (v, esc) {
    var sci = v.Species, info = SPECIES[sci] || { name: sci, colour: "var(--ink)" };
    var count = num(v["Herbarium records in cell"]);
    var mine = (tipData.species || []).filter(function (r) { return r.Species === sci; });
    var total = sum(mine, "Record_count");
    var most = Math.max.apply(null, mine.map(function (r) { return Number(r.Record_count); }));
    var lat = num(v.Latitude), lon = num(v.Longitude);
    return card(info.colour, [
      '<p class="tt-kicker">Herbarium records · 1° grid square</p>',
      '<p class="tt-title">' + esc(info.name) + ' <i class="tt-sci">' + esc(sci) + "</i></p>",
      '<p class="tt-big"><b>' + fmt(count) + "</b> record" + (count === 1 ? "" : "s") + " here</p>",
      '<p class="tt-sub">Around ' + fmt(Math.abs(lat), 1) + "°S, " + fmt(lon, 1) + "°E</p>",
      '<p class="tt-note">' + pct(count / total) + " of all " + fmt(total) + " " + esc(info.name.toLowerCase()) +
        " records" + (count === most ? ", the most of any square." : ".") + "</p>",
      info.why ? '<p class="tt-why"><b>Why here?</b> ' + info.why + "</p>" : ""
    ]);
  },

  // ---- 03 Change ---------------------------------------------------

  // Clearing and regrowth: the hovered value, then that year's full
  // balance sheet and whether it was a net gain or loss.
  "#forest-clearing-regrowth": function (v, esc) {
    var year = v["Financial year"], type = v.Type;
    var all = tipData.clearing || [];
    var series = function (t) {
      return all.filter(function (r) { return r.Type === t; })
        .sort(function (a, b) { return a.Year - b.Year; })
        .map(function (r) { return { fy: r.Financial_year, v: Math.abs(Number(r.Area_kha)) }; });
    };
    var at = function (list) { var r = list.find(function (x) { return x.fy === year; }); return r ? r.v : 0; };
    var REG = "Regrowth", CLR = "Clearing of previously uncleared forest", REC = "Re-clearing of regrowth";
    var reg = series(REG), clr = series(CLR), rec = series(REC);
    var nets = (tipData.net || []).slice().sort(function (a, b) { return a.Year - b.Year; })
      .map(function (r) { return { fy: r.Financial_year, v: Number(r.Net_kha) }; });
    var avg = function (list) { return list.reduce(function (a, r) { return a + r.v; }, 0) / list.length; };
    var trend = function (list) {
      var i = list.findIndex(function (r) { return r.fy === year; });
      return i < 0 ? "" : miniLine(list.map(function (r) { return Math.max(0, r.v); }), i, list[0].fy, list[list.length - 1].fy);
    };
    var parts = ['<p class="tt-kicker">Forest change · ' + esc(year) + "</p>"];

    if (type === REG) {
      var r = at(reg), mean = avg(reg);
      var peak = reg.reduce(function (p, x) { return x.v > p.v ? x : p; }, reg[0]);
      parts.push('<p class="tt-title">Regrowth</p>',
        '<p class="tt-big">' + bigKha(r) + "</p>",
        '<p class="tt-sub">grew back on land cleared in the past</p>', trend(reg),
        '<p class="tt-note">' + (peak.fy === year ? "The most regrowth of any year." :
          (r >= mean ? pct(r / mean - 1) + " above" : pct(1 - r / mean) + " below") + " the average year (" + fmt(mean) + " thousand hectares).") + "</p>");
      return card("var(--c-regrowth)", parts);
    }
    if (type === CLR) {
      var c = at(clr), first = clr[0];
      parts.push('<p class="tt-title">Clearing of previously uncleared forest</p>',
        '<p class="tt-big">' + bigKha(c) + "</p>",
        '<p class="tt-sub">cleared for the first time</p>', trend(clr),
        '<p class="tt-note">' + (year === first.fy ? "The first year on record, and the highest." :
          pct(1 - c / first.v) + " less than in " + first.fy + " (" + fmt(first.v) + " thousand hectares).") + "</p>");
      return card("var(--c-clear)", parts);
    }
    if (type === REC) {
      var rc = at(rec), cl = at(clr), rg = at(reg);
      var ratio = cl ? rc / cl : 0;
      parts.push('<p class="tt-title">Re-clearing of regrowth</p>',
        '<p class="tt-big">' + bigKha(rc) + "</p>",
        '<p class="tt-sub">of regrowth cleared again</p>', trend(rec),
        '<p class="tt-note">' + (ratio >= 1.15 ? "About " + fmt(ratio, ratio < 10 ? 1 : 0) + "× the first-time clearing that year."
          : ratio >= 0.85 ? "About the same as first-time clearing that year."
          : "Less than first-time clearing that year.") +
          (rg ? " Equal to " + pct(rc / rg) + " of that year's regrowth." : "") + "</p>");
      return card("#857f72", parts);
    }
    // Net change: the year's balance sheet
    var net = at(nets);
    var line = function (label, n, bold) {
      return "<tr" + (bold ? ' class="tt-total"' : "") + "><th>" + label + "</th><td>" +
        (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n)) + "</td></tr>";
    };
    parts.push('<p class="tt-title">Net change</p>',
      '<p class="tt-big">' + bigKha(Math.abs(net)) + "</p>",
      '<p class="tt-sub">' + (net >= 0 ? "net gain of forest" : "net loss of forest") + "</p>",
      '<table class="tt-table tt-ledger">' + line("Regrowth", at(reg)) + line("Clearing", -at(clr)) +
        line("Re-clearing", -at(rec)) + line("Net change", net, true) + "</table>",
      '<p class="tt-note">Thousand hectares. Regrowth minus both kinds of clearing.</p>');
    return card("#dcc592", parts, "tt-light");
  },

  // Plantation area: the type's area and share that year, its peak,
  // and its whole history as a small line.
  "#plantation-over-time": function (v, esc) {
    var year = v["Financial year"], type = v["Plantation type"];
    var all = tipData.plantArea || [];
    var mine = all.filter(function (r) { return r.Plantation_type === type; })
      .sort(function (a, b) { return a.Year - b.Year; });
    var i = mine.findIndex(function (r) { return r.Financial_year === year; });
    var area = i >= 0 ? Number(mine[i].Area_kha) : num(v["Area (thousand hectares)"]);
    var total = sum(all.filter(function (r) { return r.Financial_year === year; }), "Area_kha");
    var peak = mine.reduce(function (best, r) { return Number(r.Area_kha) > Number(best.Area_kha) ? r : best; }, mine[0] || {});
    var note = peak.Financial_year === year ? "Its peak year."
      : pct(1 - area / Number(peak.Area_kha)) + " below its peak of " + fmt(Number(peak.Area_kha)) + " thousand hectares" +
        " in " + dash(peak.Financial_year) + ".";
    var colour = type === "Hardwood" ? "var(--c-hardwood)" : type === "Softwood" ? "var(--c-softwood)" : "#9d968a";
    var parts = [
      '<p class="tt-kicker">Commercial plantations · ' + dash(esc(year)) + "</p>",
      '<p class="tt-title">' + esc(type) + "</p>",
      '<p class="tt-big">' + bigKha(area) + "</p>",
      '<p class="tt-sub">' + pct(total ? area / total : 0) + " of all plantation area that year</p>"
    ];
    if (mine.length > 1 && i >= 0) {
      parts.push(miniLine(mine.map(function (r) { return Number(r.Area_kha); }), i,
        dash(mine[0].Financial_year), dash(mine[mine.length - 1].Financial_year)));
    }
    parts.push('<p class="tt-note">' + note + "</p>");
    return card(colour, parts);
  },

  // Plantation mix: the state's hardwood/softwood split and its share
  // of all new planting in Australia.
  "#plantation_establishment": function (v, esc) {
    var place = v["State or territory"], type = v["Plantation type"];
    var rows = tipData.plantEst || [];
    var get = function (t) {
      var r = rows.find(function (x) { return x.Jurisdiction === place && x.Plantation_type === t; });
      return r ? Number(r.Annual_average_kha) : 0;
    };
    var hw = get("Hardwood"), sw = get("Softwood"), total = hw + sw;
    var national = sum(rows.filter(function (r) { return r.Jurisdiction === "Australia"; }), "Annual_average_kha");
    var mine = type === "Hardwood" ? hw : sw;
    return card(type === "Hardwood" ? "var(--c-hardwood)" : "var(--c-softwood)", [
      '<p class="tt-kicker">Planted each year · average 2016–17 to 2020–21</p>',
      '<p class="tt-title">' + esc(place) + "</p>",
      '<p class="tt-big"><b>' + pct(total ? mine / total : 0) + "</b> " + esc(type.toLowerCase()) + "</p>",
      '<p class="tt-sub">' + fmt(total * 1000) + " hectares planted a year in total</p>",
      '<div class="tt-mix"><span style="width:' + (hw / total * 100) + '%;background:var(--c-hardwood)"></span>' +
        '<span style="width:' + (sw / total * 100) + '%;background:var(--c-softwood)"></span></div>' +
        '<div class="tt-mix-key"><span><i style="background:var(--c-hardwood)"></i>Hardwood ' + pct(hw / total) +
        '</span><span><i style="background:var(--c-softwood)"></i>Softwood ' + pct(sw / total) + "</span></div>",
      '<p class="tt-note">' + pct(national ? total / national : 0) + " of all new plantation in Australia.</p>"
    ]);
  },

  // ---- 04 Fire -----------------------------------------------------

  // Fire line: area burnt, compared with that fire type's average,
  // and the ten years as small bars.
  "#forest-fire-area": function (v, esc) {
    var year = v["Financial year"], type = v["Fire type"];
    var rows = (tipData.fireYear || []).filter(function (r) { return r.Fire_type === type; })
      .sort(function (a, b) { return a.Financial_year < b.Financial_year ? -1 : 1; });
    var values = rows.map(function (r) { return Number(r.Area_thousand_ha); });
    var i = rows.findIndex(function (r) { return r.Financial_year === year; });
    var area = values[i];
    var avg = values.reduce(function (a, b) { return a + b; }, 0) / values.length;
    var diff = area / avg - 1;
    var note = Math.abs(diff) < 0.05 ? "About the same as its " + values.length + "-year average of " + kha(avg) + "."
      : pct(Math.abs(diff)) + (diff > 0 ? " above" : " below") + " its " + values.length + "-year average of " + kha(avg) + ".";
    return card(type === "Planned fire" ? "var(--c-planned)" : "var(--c-unplanned)", [
      '<p class="tt-kicker">Forest area burnt · ' + dash(esc(year)) + "</p>",
      '<p class="tt-title">' + esc(type === "Planned fire" ? "Planned burns" : "Unplanned fires (bushfires)") + "</p>",
      '<p class="tt-big">' + bigKha(area) + "</p>",
      miniBars(values, rows.map(function (r, j) {
        // label the hovered year, plus the first and last when they don't crowd it
        var edge = (j === 0 && i > 1) || (j === rows.length - 1 && i < rows.length - 2);
        return j === i || edge ? dash(r.Financial_year.slice(2)) : "";
      }), i),
      '<p class="tt-note">' + note + "</p>"
    ]);
  },

  // Bin map: detections in the hexagon, as a density, with its six
  // months as small bars.
  "#fire-detections-hexbin": function (v, esc) {
    var months = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
    var full = ["September 2019", "October 2019", "November 2019", "December 2019", "January 2020", "February 2020"];
    var codes = ["2019-09", "2019-10", "2019-11", "2019-12", "2020-01", "2020-02"];
    var counts = months.map(function (m) { return num(v[m]); });
    var shown = v.Showing, mi = codes.indexOf(shown);
    var n = num(v["Fire detections shown"]), season = num(v["Whole season"]);
    var busiest = counts.indexOf(Math.max.apply(null, counts));
    var state = v["State or territory"] === "Offshore" ? "the coast" : v["State or territory"];
    return card("var(--c-unplanned)", [
      '<p class="tt-kicker">Satellite fire detections · ' + (mi >= 0 ? full[mi] : "September 2019 to February 2020") + "</p>",
      '<p class="tt-title">A hexagon in ' + esc(state) + "</p>",
      '<p class="tt-big"><b>' + fmt(n) + "</b> detection" + (n === 1 ? "" : "s") + "</p>",
      '<p class="tt-sub">About ' + fmt(n / HEX_KM2 * 1000, n / HEX_KM2 * 1000 < 10 ? 1 : 0) + " per 1,000 km²</p>",
      miniBars(counts, months, mi >= 0 ? mi : -1),
      '<p class="tt-note">' + (season === 0 ? "No fires were detected here all season."
        : "Busiest month here: " + full[busiest] + ", with " + fmt(counts[busiest]) + " of its " + fmt(season) + " detections.") + "</p>"
    ]);
  },

  // ---- 05 Regrowth -------------------------------------------------

  // Slope graph: credits that year, share of the year's total, and the
  // change between the two years.
  "#forest-credits-slope": function (v, esc) {
    var type = v["Kind of project"], year = v.Year;
    var rows = tipData.creditsType || [];
    var at = function (fy, t) {
      return sum(rows.filter(function (r) { return r.Financial_year === fy && (!t || r.Type === t); }), "Credits_m");
    };
    var credits = at(year, type), total = at(year);
    var other = year === "2014–15" ? "2025–26" : "2014–15";
    var then = at(other, type);
    var change = year === "2014–15" ? (credits ? then / credits - 1 : 0) : (then ? credits / then - 1 : 0);
    var colours = { "Native forest regeneration": "var(--c-regen)", "Avoided clearing": "var(--c-avoidedc)", "Plantings and plantations": "#b0a760" };
    var changeText = (change >= 0 ? "up " : "down ") + (Math.abs(change) >= 2 ? fmt(change + 1, 0) + "×" : pct(Math.abs(change)));
    return card(colours[type] || "var(--c-carbon)", [
      '<p class="tt-kicker">Forest carbon credits · ' + esc(year) + "</p>",
      '<p class="tt-title">' + esc(type) + "</p>",
      '<p class="tt-big"><b>' + fmt(credits, 1) + " million</b> credits</p>",
      '<p class="tt-sub">' + pct(total ? credits / total : 0) + " of all forest credits that year</p>",
      '<p class="tt-note">' + (year === "2014–15"
        ? "By 2025–26: " + fmt(then, 1) + " million, " + changeText + "."
        : "In 2014–15: " + fmt(then, 1) + " million, so " + changeText + " since then.") + "</p>"
    ]);
  },

  // ---- 06 Protection -----------------------------------------------

  // Alluvial: a flow, a tenure or a reserve status, with its area and
  // what share of the whole it is.
  "#forest-protection-alluvial": function (v, esc) {
    var rows = tipData.alluvial || [];
    var total = sum(rows, "Forest_area_kha");
    var area = Number(v.Area_kha);
    var inside = "Within the National Reserve System";
    var parts, title;
    if (v.Tenure && v.Status) {
      var tenureTotal = sum(rows.filter(function (r) { return r.Tenure === v.Tenure; }), "Forest_area_kha");
      title = esc(v.Tenure);
      parts = [
        '<p class="tt-sub">' + (v.Status === inside ? "Inside" : "Outside") + " the National Reserve System</p>",
        '<p class="tt-big" style="margin-top:6px">' + bigKha(area) + "</p>",
        '<p class="tt-note">' + pct(area / tenureTotal) + " of " + esc(v.Tenure.toLowerCase()) + " forest, and " +
          pct(area / total) + " of all native forest.</p>"
      ];
    } else if (v.Tenure) {
      var inRes = sum(rows.filter(function (r) { return r.Tenure === v.Tenure && r.Status === inside; }), "Forest_area_kha");
      title = esc(v.Tenure);
      parts = [
        '<p class="tt-big">' + bigKha(area) + "</p>",
        '<p class="tt-sub">' + pct(area / total) + " of all native forest</p>",
        '<p class="tt-note">' + pct(inRes / area) + " of it is inside the National Reserve System.</p>"
      ];
    } else {
      var biggest = rows.filter(function (r) { return r.Status === v.Status; })
        .sort(function (a, b) { return b.Forest_area_kha - a.Forest_area_kha; })[0];
      title = esc(v.Status);
      parts = [
        '<p class="tt-big">' + bigKha(area) + "</p>",
        '<p class="tt-sub">' + pct(area / total) + " of all native forest</p>",
        '<p class="tt-note">The largest part comes from ' + esc(biggest.Tenure.toLowerCase()) + " land (" +
          pct(Number(biggest.Forest_area_kha) / area) + ").</p>"
      ];
    }
    return card("var(--c-nrs)", ['<p class="tt-kicker">Native forest by land tenure · 2020–21</p>',
      '<p class="tt-title">' + title + "</p>"].concat(parts));
  },

  // Waffle: the hovered group, as a share and in hectares.
  "#forest-protection-waffle": function (v, esc) {
    var included = /^Included/.test(v.Category);
    var tiles = (tipData.waffle || []).filter(function (r) { return r.Coverage === v.Category; }).length;
    return card(included ? "#3f8f8c" : "var(--muted)", [
      '<p class="tt-kicker">Native forest · 2020–21</p>',
      '<p class="tt-title">' + (included ? "Protected by at least one measure" : "Not counted as protected") + "</p>",
      '<p class="tt-big"><b>' + tiles + "%</b> of native forest</p>",
      '<p class="tt-sub">About ' + kha(NATIVE_FOREST_KHA * tiles / 100) + "</p>",
      '<p class="tt-note">Each square is 1% of native forest, about ' + kha(NATIVE_FOREST_KHA / 100) + ".</p>"
    ]);
  }
};

// Reference figures used by the cards (ABARES, Australia's forests 2023).
var NATIONAL_COVER = 17;          // % of Australia's land that is forest
var NATIVE_FOREST_KHA = 131500;   // native forest, thousand hectares
var HEX_KM2 = 6290;               // area of one bin-map hexagon

// "why" explains each species' range (sources: The Conversation, 2018,
// on mountain ash; Wikipedia articles on bunya pine and boab).
var SPECIES = {
  "Eucalyptus regnans": { name: "Mountain ash", colour: "var(--c-regnans)",
    why: "It needs cool, wet forest with a reliable water supply. After a bushfire, seeds fall from the canopy and a new forest grows." },
  "Araucaria bidwillii": { name: "Bunya pine", colour: "var(--c-bunya)",
    why: "A survivor of ancient rainforests. As Australia dried out, it was left in a few wet pockets, and its seeds spread poorly." },
  "Adansonia gregorii": { name: "Boab", colour: "var(--c-boab)",
    why: "It grows in the tropics, where winters are dry. It drops its leaves and stores water in its swollen trunk." }
};

// Small helpers for the cards.
function num(x) { return Number(String(x).replace(/[^0-9.\-]/g, "")); }
function sum(rows, field) {
  return (rows || []).reduce(function (a, r) { return a + (Number(r[field]) || 0); }, 0);
}
function pct(share) {
  var p = share * 100;
  return fmt(p, p > 0 && p < 1 ? 1 : 0) + "%";
}
function kha(n) {
  return Math.abs(n) >= 1000 ? fmt(n / 1000, 1) + " million hectares" : fmt(n) + " thousand hectares";
}
function bigKha(n) {
  return Math.abs(n) >= 1000 ? "<b>" + fmt(n / 1000, 1) + " million</b> hectares" : "<b>" + fmt(n) + " thousand</b> hectares";
}
function capital(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function areaRow(state) { return (tipData.area || []).find(function (r) { return r.State === state; }); }
function rankOf(rows, field, state) {
  var sorted = (rows || []).slice().sort(function (a, b) { return Number(b[field]) - Number(a[field]); });
  return sorted.findIndex(function (r) { return r.State === state; }) + 1;
}
function rankWord(rank, n) {
  if (rank === 1) return "highest";
  if (rank === n) return "lowest";
  var suffix = rank === 2 ? "nd" : rank === 3 ? "rd" : "th";
  return rank + suffix + " highest";
}

// Every other chart: the same card, listing the chart's own fields.
function plainCard(v, esc) {
  var rows = Object.keys(v).map(function (k) {
    return "<tr><th>" + esc(String(k).trim()) + "</th><td>" + esc(String(v[k])) + "</td></tr>";
  }).join("");
  return card("var(--ink)", ['<table class="tt-table">' + rows + "</table>"]);
}

function tooltipOptions(id) {
  return {
    theme: "forest",
    formatTooltip: function (value, sanitize) {
      if (value === null || typeof value !== "object") return sanitize(String(value));
      var build = tooltipCards[id];
      try {
        return build && tipData.area ? build(value, sanitize) : plainCard(value, sanitize);
      } catch (e) {
        console.error("Tooltip failed for " + id, e);
        return plainCard(value, sanitize);
      }
    }
  };
}

// Vega loads each chart's data files itself; this loader adds the same
// version string to those requests, so updated data is never stale.
var loader = vega.loader();
var baseSanitize = loader.sanitize.bind(loader);
loader.sanitize = function (uri, options) {
  return baseSanitize(uri, options).then(function (result) {
    if (!/^(https?:)?\/\//.test(result.href) && result.href.indexOf("?v=") < 0) {
      result.href += (result.href.indexOf("?") < 0 ? "?" : "&") + "v=" + VERSION;
    }
    return result;
  });
};

// Wait for the web fonts, so Vega measures label widths with the
// right typeface, then render each chart (actions: false hides the "..." menu).
// ---------------------------------------------------------------
// Bin map controls: a menu switches between the whole season and a
// month-by-month timeline. The timeline has a slider and a play button
// that steps through September 2019 to February 2020. Each change sets
// the chart's "month" signal.
// ---------------------------------------------------------------
var HEX_MONTHS = ["2019-09", "2019-10", "2019-11", "2019-12", "2020-01", "2020-02"];
var HEX_NAMES = ["September 2019", "October 2019", "November 2019", "December 2019", "January 2020", "February 2020"];

function wireHexbinControls(view) {
  var mode = document.getElementById("hexbin-mode");
  var timeline = document.getElementById("hexbin-timeline");
  var slider = document.getElementById("hexbin-month");
  var play = document.getElementById("hexbin-play");
  if (!mode || !slider) return;
  var timer = null;

  function show(month) { view.signal("month", month).runAsync(); }

  function showSlider() {
    var i = Number(slider.value);
    slider.setAttribute("aria-valuetext", HEX_NAMES[i]);
    show(HEX_MONTHS[i]);
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    play.textContent = "▶";
    play.setAttribute("aria-label", "Play through the months");
  }

  function start() {
    if (Number(slider.value) >= HEX_MONTHS.length - 1) slider.value = 0;   // replay from September
    showSlider();
    play.textContent = "❚❚";
    play.setAttribute("aria-label", "Pause");
    timer = setInterval(function () {
      var next = Number(slider.value) + 1;
      if (next >= HEX_MONTHS.length) { stop(); return; }
      slider.value = next;
      showSlider();
    }, 1300);
  }

  mode.addEventListener("change", function () {
    stop();
    var monthly = mode.value === "timeline";
    timeline.hidden = !monthly;
    if (monthly) showSlider(); else show("All");
  });
  slider.addEventListener("input", function () { stop(); showSlider(); });
  play.addEventListener("click", function () { if (timer) stop(); else start(); });
}

// Marks listed in a chart's "passThrough" are drawn but ignore the mouse,
// so a layer on top (like state outlines) cannot hide the tooltips below it.
function passThroughPatch(names) {
  return function (vgSpec) {
    (function walk(marks) {
      (marks || []).forEach(function (m) {
        if (names.indexOf(m.name) >= 0) m.interactive = false;
        walk(m.marks);
      });
    })(vgSpec.marks);
    return vgSpec;
  };
}

// Narrow screens: some charts swap to a layout that fits (legends in
// two rows or under the chart, shorter year labels), so no label is cut off.
function eachLegend(spec, fn) {
  (function walk(o) {
    if (!o || typeof o !== "object") return;
    if (o.legend && typeof o.legend === "object") fn(o.legend);
    Object.keys(o).forEach(function (k) { walk(o[k]); });
  })(spec);
}

function loadSpec(chart) {
  var el = document.querySelector(chart.id);
  var url = chart.spec + "?v=" + VERSION;
  return fetch(url).then(function (r) { return r.json(); }).then(function (spec) {
    // No left padding: chart titles start on the same sight-line as the text
    var pad = spec.padding;
    if (pad === undefined || typeof pad === "number") {
      var p = pad === undefined ? 5 : pad;
      spec.padding = { left: 0, right: p, top: p, bottom: p };
    } else if (typeof pad === "object" && !pad.signal) {
      pad.left = 0;
    }
    if (chart.narrow && el && el.clientWidth < chart.narrow.below) chart.narrow.apply(spec);
    if (chart.fit && el && el.clientWidth) chart.fit(spec, el.clientWidth);
    return spec;
  });
}

function renderCharts() {
  charts.forEach(function (chart) {
    loadSpec(chart).then(function (spec) { return vegaEmbed(chart.id, spec, {
      actions: false, loader: loader, tooltip: tooltipOptions(chart.id),
      patch: chart.passThrough ? passThroughPatch(chart.passThrough) : undefined
    }); })
      .then(function (result) {
        if (linkedIds.indexOf(chart.id) >= 0) linkView(result.view);
        else addLegendReset(result.view);
        if (chart.id === "#fire-detections-hexbin") wireHexbinControls(result.view);
      })
      .catch(function (error) {
        console.error("Could not load " + chart.spec + ":", error);
      });
  });
}

// Trunk navigation: light up the node for the chapter on screen,
// and grow the trunk line as the reader scrolls down the page.
var navLinks = document.querySelectorAll(".trunk a");
var trunkFill = document.querySelector(".trunk-fill");

if ("IntersectionObserver" in window) {
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      navLinks.forEach(function (link) {
        link.classList.toggle("active", link.getAttribute("href") === "#" + entry.target.id);
      });
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  document.querySelectorAll(".chapter[id]").forEach(function (s) { observer.observe(s); });
}

function updateTrunk() {
  var max = document.documentElement.scrollHeight - window.innerHeight;
  var pct = max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0;
  if (trunkFill) trunkFill.style.setProperty("--progress", pct + "%");
}
window.addEventListener("scroll", updateTrunk, { passive: true });
updateTrunk();

// Tooltip data loads alongside the fonts; charts render once both are ready.
var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
Promise.all([fontsReady, loadTipData()]).then(renderCharts);
