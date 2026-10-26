// Builds a non-contiguous cartogram: every state keeps its real shape and
// position, but is scaled about its own centroid so that its area is
// proportional to cumulative forest carbon credits in the selected year.
import fs from "fs";
import * as d3 from "d3-geo";
import { geoProject } from "d3-geo-projection";
import * as topojson from "topojson-client";

const W = 600, H = 470;
const topo = JSON.parse(fs.readFileSync(process.argv[2]));
const fc = topojson.feature(topo, topo.objects.STE_2026_AUST_GDA2020);

// Same equal-area projection as the other maps on the page.
const projection = d3.geoConicEqualArea().parallels([-18, -36]).rotate([-132, 0])
  .fitExtent([[10, 10], [W - 10, H - 10]], fc);
const planar = geoProject(fc, projection);          // pixel coordinates, y down
const path = d3.geoPath();                          // planar measures

const rows = fs.readFileSync(process.argv[3], "utf8").trim().split("\n");
const head = rows.shift().split(",");
const data = rows.map(r => Object.fromEntries(r.split(",").map((v, i) => [head[i], v])));

const base = {};
for (const f of planar.features) {
  const name = f.properties.STE_NAME26;
  base[name] = { f, area: path.area(f), c: path.centroid(f) };
}
// k = highest credits-per-pixel of any state in any year; that state is
// drawn at full size, every other state is scaled relative to it.
let k = 0;
for (const r of data) k = Math.max(k, +r.Credits_m / base[r.State].area);

const round = v => Math.round(v * 10) / 10;
const scaleGeom = (g, c, s) => {
  const map = ring => ring.map(([x, y]) => [round(c[0] + s * (x - c[0])), round(c[1] + s * (y - c[1]))]);
  if (g.type === "Polygon") return { type: "Polygon", coordinates: g.coordinates.map(map) };
  return { type: "MultiPolygon", coordinates: g.coordinates.map(p => p.map(map)) };
};

const features = [];
for (const [name, b] of Object.entries(base)) {
  features.push({ type: "Feature", properties: { kind: "outline", State: name,
    cx: round(b.c[0]), cy: round(b.c[1]) }, geometry: scaleGeom(b.f.geometry, b.c, 1) });
}
for (const r of data) {
  const b = base[r.State];
  const credits = +r.Credits_m;
  if (credits <= 0) continue;
  const s = Math.sqrt(credits / b.area / k);
  features.push({ type: "Feature", properties: {
      kind: "scaled", State: r.State, Year: +r.Year, Financial_year: r.Financial_year,
      Credits_m: credits, Regeneration_m: +r.Regeneration_m, Avoided_m: +r.Avoided_m,
      Plantings_m: +r.Plantings_m, Plantations_m: +r.Plantations_m, Main_type: r.Main_type,
      Scale: Math.round(s * 1000) / 1000 },
    geometry: scaleGeom(b.f.geometry, b.c, s) });
}
fs.writeFileSync(process.argv[4], JSON.stringify({ type: "FeatureCollection", features }));
console.log("features", features.length, "k", k.toExponential(3),
  Object.entries(base).map(([n, b]) => n + ":" + Math.round(b.c[0]) + "," + Math.round(b.c[1])).join(" | "));
