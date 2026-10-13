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