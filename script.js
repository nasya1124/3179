// Connect the page's chart container to its Vega-Lite JSON specification.
var forestTypeSpec = "charts/forest_type_australia.vl.json";

vegaEmbed("#forest-area-map", "charts/forest_area_choropleth.vl.json", {
  actions: false
}).catch(function (error) {
  console.error("Could not load the forest area map:", error);
});

vegaEmbed("#forest-area-by-state", "charts/forest_area_by_state.vl.json", {
  actions: false
}).catch(function (error) {
  console.error("Could not load the forest area bar chart:", error);
});

vegaEmbed("#chart-04", "charts/forest_type_treemap.vg.json", {
  actions: false
}).catch(function (error) {
  console.error("Could not load the forest type treemap:", error);
});

vegaEmbed("#chart-13", "charts/tree_species_distribution.vl.json", {
  actions: false
}).catch(function (error) {
  console.error("Could not load the native tree species map:", error);
});

vegaEmbed(
  "#forest-protection-alluvial",
  "charts/forest_protection_alluvial.vg.json",
  { actions: false }
).catch(function (error) {
  console.error("Could not load the forest protection alluvial:", error);
});

vegaEmbed(
  "#forest-protection-waffle",
  "charts/forest_protection_waffle.vl.json",
  { actions: false }
).catch(function (error) {
  console.error("Could not load the forest protection waffle chart:", error);
});

vegaEmbed(
  "#forest-protection-by-state",
  "charts/forest_protection_by_state.vl.json",
  { actions: false }
).catch(function (error) {
  console.error("Could not load the forest protection dot plot:", error);
});