// Hexagonal bin map: counts points (here, satellite fire detections) in a
// regular tessellation of equal hexagons covering all of Australia.
//
// 1. Project the states and the points with the same conic equal-area
//    projection and frame as the page's other pre-projected maps.
// 2. Lay a regular grid of pointy-top hexagons (radius R pixels) over the
//    whole frame and keep every hexagon whose centre falls on land, so the
//    tessellation covers all of Australia, including empty bins.
// 3. Count the points in each hexagon, overall and per group (e.g. month).
//    A hexagon holding points is always kept, even on a ragged coastline.
//
// Input points: JSON array of { lon, lat, group }.
// Usage: node hexbin.mjs <states.topojson> <points.json> <out.geojson> [R]
import fs from "fs";
import * as d3 from "d3-geo";
import { geoProject } from "d3-geo-projection";
import * as topojson from "topojson-client";

const W = 600, H = 470, R = Number(process.argv[5] || 6);
const topo = JSON.parse(fs.readFileSync(process.argv[2]));
const fc = topojson.feature(topo, topo.objects.STE_2026_AUST_GDA2020);
const projection = d3.geoConicEqualArea().parallels([-18, -36]).rotate([-132, 0])
  .fitExtent([[10, 10], [W - 10, H - 10]], fc);
const planar = geoProject(fc, projection);        // pixel coordinates, y down

const pts = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const groups = [...new Set(pts.map(p => p.group))].sort();

// ---- point-in-land test (even-odd rule over every ring of every state) ----
const rings = [];
for (const f of planar.features) {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) for (const ring of poly) rings.push({ ring, state: f.properties.STE_NAME26 });
}
function landState([x, y]) {
  const inside = {};
  for (const { ring, state } of rings) {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    if (c) inside[state] = !inside[state];
  }
  return Object.keys(inside).find(s => inside[s]) || null;
}

// ---- hexagon grid helpers (axial coordinates, pointy-top) ----
const centre = (q, r) => [R * Math.sqrt(3) * (q + r / 2), R * 1.5 * r];
function hexOf([x, y]) {
  const fq = (Math.sqrt(3) / 3 * x - y / 3) / R, fr = (2 / 3 * y) / R, fs_ = -fq - fr;
  let q = Math.round(fq), r = Math.round(fr), s = Math.round(fs_);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs_);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  return [q, r];
}

const bins = new Map();
const newBin = (q, r, state) => ({ q, r, state, counts: Object.fromEntries(groups.map(g => [g, 0])) });

// 2. full tessellation: every hexagon whose centre is on land
const rMax = Math.ceil(H / (1.5 * R)) + 1;
for (let r = -1; r <= rMax; r++) {
  const qMin = Math.floor(-r / 2) - 1, qMax = Math.ceil(W / (Math.sqrt(3) * R) - r / 2) + 1;
  for (let q = qMin; q <= qMax; q++) {
    const state = landState(centre(q, r));
    if (state) bins.set(q + "," + r, newBin(q, r, state));
  }
}
const landBins = bins.size;

// 3. count points, and record each point's state for summaries
let added = 0;
const byState = {};
for (const p of pts) {
  const xy = projection([+p.lon, +p.lat]);
  const [q, r] = hexOf(xy);
  const key = q + "," + r;
  if (!bins.has(key)) { bins.set(key, newBin(q, r, landState(xy) || "Offshore")); added++; }
  const b = bins.get(key);
  b.counts[p.group] += 1;
  const st = landState(xy) || b.state;
  byState[st] = (byState[st] || 0) + 1;
}

const round = v => Math.round(v * 10) / 10;
const features = [];
for (const b of bins.values()) {
  const [cx, cy] = centre(b.q, b.r);
  const ring = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    ring.push([round(cx + R * Math.cos(a)), round(cy + R * Math.sin(a))]);
  }
  ring.push(ring[0]);
  const props = { State: b.state, All: 0 };
  for (const g of groups) { props[g] = b.counts[g]; props.All += b.counts[g]; }
  features.push({ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [ring.reverse()] } });
}
// state outlines in the same pixel space (drawn as thin lines on top)
for (const f of planar.features) {
  const map = ring => ring.map(([x, y]) => [round(x), round(y)]);
  const g = f.geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: f.geometry.coordinates.map(map) }
    : { type: "MultiPolygon", coordinates: f.geometry.coordinates.map(p => p.map(map)) };
  features.push({ type: "Feature", properties: { outline: true, State: f.properties.STE_NAME26 }, geometry: g });
}
fs.writeFileSync(process.argv[4], JSON.stringify({ type: "FeatureCollection", features }));

const totals = [...bins.values()].map(b => groups.reduce((s, g) => s + b.counts[g], 0));
console.log(JSON.stringify({ points: pts.length, landHexagons: landBins, coastalAdded: added,
  occupied: totals.filter(n => n > 0).length, maxPerHexagon: Math.max(...totals), groups, byState }));
