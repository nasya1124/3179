// Each entry links a container on the page (by its id) to a chart specification.
// Files ending in .vl.json are Vega-Lite; files ending in .vg.json are Vega.
var charts = [
  { id: "#forest-area-map",            spec: "charts/forest_area_choropleth.vl.json" },
  { id: "#forest-area-by-state",       spec: "charts/forest_area_by_state.vl.json" },
  { id: "#chart-04",                   spec: "charts/forest_type_treemap.vg.json" },
  { id: "#chart-13",                   spec: "charts/tree_species_distribution.vl.json" },
  { id: "#forest-protection-alluvial", spec: "charts/forest_protection_alluvial.vg.json" },
  { id: "#forest-protection-waffle",   spec: "charts/forest_protection_waffle.vl.json" },
  { id: "#forest-protection-by-state", spec: "charts/forest_protection_by_state.vl.json" },
  { id: "#forest-fire-area",           spec: "charts/forest_fire_area_over_time.vl.json" },
  { id: "#forest-fire-heatmap",        spec: "charts/forest_fire_by_state_heatmap.vl.json" },
  { id: "#plantation_establishment",   spec: "charts/plantation_establishment_by_jurisdiction.vl.json" }
];

// vegaEmbed reads the spec, renders the chart into the container,
// and hides the "..." export menu (actions: false).
charts.forEach(function (chart) {
  vegaEmbed(chart.id, chart.spec, { actions: false }).catch(function (error) {
    console.error("Could not load " + chart.spec + ":", error);
  });
});