// Each entry links a container on the page (by its id) to a chart specification.
// Files ending in .vl.json are Vega-Lite; files ending in .vg.json are Vega.
var charts = [
  { id: "#forest-area-map",            spec: "charts/forest_area_choropleth.vl.json" },
  { id: "#forest-area-by-state",       spec: "charts/forest_area_by_state.vl.json" },
  { id: "#chart-04",                   spec: "charts/forest_type_treemap.vg.json" },
  { id: "#chart-13",                   spec: "charts/tree_species_distribution.vl.json" },
  { id: "#plantation_establishment",   spec: "charts/plantation_establishment_by_jurisdiction.vl.json" },
  { id: "#forest-fire-area",           spec: "charts/forest_fire_area_over_time.vl.json" },
  { id: "#forest-fire-heatmap",        spec: "charts/forest_fire_by_state_heatmap.vl.json" },
  { id: "#forest-protection-alluvial", spec: "charts/forest_protection_alluvial.vg.json" },
  { id: "#forest-protection-waffle",   spec: "charts/forest_protection_waffle.vl.json" },
  { id: "#forest-protection-by-state", spec: "charts/forest_protection_by_state.vl.json" }
];

// Wait for the web fonts, so Vega measures label widths with the
// right typeface, then render each chart (actions: false hides the "..." menu).
function renderCharts() {
  charts.forEach(function (chart) {
    vegaEmbed(chart.id, chart.spec, { actions: false }).catch(function (error) {
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
