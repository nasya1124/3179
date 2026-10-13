// Connect the page's chart container to its Vega-Lite JSON specification.
var forestTypeSpec = "charts/forest_type_australia.vl.json";

vegaEmbed("#forest-type-chart", forestTypeSpec, { actions: false })
  .catch(function (error) {
    document.getElementById("forest-type-chart").innerHTML =
      '<p class="error">The chart could not load. Check the CSV path and open the page through Live Server or GitHub Pages.</p>';
    console.error("Could not load the forest type chart:", error);
  });
