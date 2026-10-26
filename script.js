// Each entry links a container on the page (by its id) to a chart specification.
// Files ending in .vl.json are Vega-Lite; files ending in .vg.json are Vega.
var charts = [
  { id: "#forest-area-map",            spec: "charts/forest_area_choropleth.vl.json" },
  { id: "#forest-area-by-state",       spec: "charts/forest_area_by_state.vl.json" },
  { id: "#chart-04",                   spec: "charts/forest_type_treemap.vg.json" },
  { id: "#chart-13",                   spec: "charts/tree_species_distribution.vl.json" },
  { id: "#plantation-over-time",       spec: "charts/plantation_area_over_time.vl.json" },
  { id: "#plantation_establishment",   spec: "charts/plantation_establishment_by_jurisdiction.vl.json" },
  { id: "#forest-fire-area",           spec: "charts/forest_fire_area_over_time.vl.json" },
  { id: "#forest-fire-heatmap",        spec: "charts/forest_fire_by_state_heatmap.vl.json" },
  { id: "#forest-protection-alluvial", spec: "charts/forest_protection_alluvial.vg.json" },
  { id: "#forest-protection-waffle",   spec: "charts/forest_protection_waffle.vl.json" },
  { id: "#forest-protection-by-state", spec: "charts/forest_protection_by_state.vl.json" }
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
var legendSelections = ["species_pick", "coverage_pick", "measure_pick", "fire_type_highlight"];

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

// Wait for the web fonts, so Vega measures label widths with the
// right typeface, then render each chart (actions: false hides the "..." menu).
function renderCharts() {
  charts.forEach(function (chart) {
    vegaEmbed(chart.id, chart.spec, { actions: false })
      .then(function (result) {
        if (linkedIds.indexOf(chart.id) >= 0) linkView(result.view);
        else addLegendReset(result.view);
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

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(renderCharts);
} else {
  renderCharts();
}
