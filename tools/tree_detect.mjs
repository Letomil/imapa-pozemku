// Kandidáti na stromy z mračna bodov: model výšky porastu (CHM) + lokálne maximá + koruny.
// Použitie: node tree_detect.mjs [min_vyska_m=2.5] [okno_m=2.5]
// Vstup: data/lls_plot_points.json, data/raw/parcely_kn.geojson
// Výstup: data/tree_candidates.geojson (body v S-JTSK), data/chm.json (mriežka pre náhľad)
import fs from "node:fs";

const MINH = Number(process.argv[2] || 2.5), WIN = Number(process.argv[3] || 2.5), CELL = 0.5;
const root = new URL("../", import.meta.url);
const { points } = JSON.parse(fs.readFileSync(new URL("data/lls_plot_points.json", root)));
const kn = JSON.parse(fs.readFileSync(new URL("data/raw/parcely_kn.geojson", root)));
const parcels = kn.features.map((f) => ({ label: f.properties.label, ring: f.geometry.coordinates[0] }));
const inside = (x, y, r) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  return c;
};

let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const [x, y] of points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
const W = Math.ceil((x1 - x0) / CELL) + 1, H = Math.ceil((y1 - y0) / CELL) + 1;
const id = (i, j) => j * W + i;
const ground = new Float32Array(W * H).fill(NaN), top = new Float32Array(W * H).fill(NaN);
const gpts = [];
for (const [x, y, z, c] of points) {
  const k = id(Math.floor((x - x0) / CELL), Math.floor((y - y0) / CELL));
  if (c === 2) { if (!(ground[k] <= z)) ground[k] = z; gpts.push([x, y, z]); }
  if (c === 4 || c === 5) { if (!(top[k] >= z)) top[k] = z; }
}
// terén do prázdnych buniek: IDW z bodov terénu v okolí (mriežka 4 m na rýchle hľadanie)
const G = 4, gIdx = new Map();
for (const p of gpts) { const key = `${Math.floor(p[0] / G)},${Math.floor(p[1] / G)}`; (gIdx.get(key) || gIdx.set(key, []).get(key)).push(p); }
const groundAt = (x, y) => {
  let s = 0, w = 0;
  for (let r = 1; r <= 3 && w === 0; r++)
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++)
      for (const p of gIdx.get(`${Math.floor(x / G) + a},${Math.floor(y / G) + b}`) || []) {
        const d = Math.hypot(p[0] - x, p[1] - y); const k = 1 / (d * d + 0.25); s += k * p[2]; w += k;
      }
  return w ? s / w : NaN;
};
const chm = new Float32Array(W * H).fill(0);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const k = id(i, j); if (isNaN(top[k])) continue;
  const g = isNaN(ground[k]) ? groundAt(x0 + (i + 0.5) * CELL, y0 + (j + 0.5) * CELL) : ground[k];
  chm[k] = Math.max(0, top[k] - g);
}
// vyhladenie 3×3 (maximum zo susedov pre medzery v riedkom bezlistom mračne, potom priemer)
const filled = chm.slice();
for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) if (chm[id(i, j)] === 0) {
  const nb = [chm[id(i - 1, j)], chm[id(i + 1, j)], chm[id(i, j - 1)], chm[id(i, j + 1)]].filter((v) => v > 0);
  if (nb.length >= 3) filled[id(i, j)] = nb.reduce((a, b) => a + b) / nb.length;
}
const smooth = new Float32Array(W * H);
for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
  let s = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) s += filled[id(i + a, j + b)];
  smooth[id(i, j)] = s / 9;
}
// lokálne maximá: okno sa zväčšuje s výškou stromu
const tops = [];
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const h = smooth[id(i, j)]; if (h < MINH) continue;
  const r = Math.round(Math.max(WIN, Math.min(5, h * 0.25)) / CELL);
  let isMax = true;
  for (let b = -r; b <= r && isMax; b++) for (let a = -r; a <= r; a++) {
    if ((a || b) && a * a + b * b <= r * r) {
      const ii = i + a, jj = j + b;
      if (ii >= 0 && jj >= 0 && ii < W && jj < H && smooth[id(ii, jj)] > h) { isMax = false; break; }
    }
  }
  if (isMax) tops.push({ i, j, h: chm[id(i, j)] || h });
}
// koruny: rast oblasti od vrcholu, kým výška > 40 % vrcholu, každá bunka k najbližšiemu vrcholu
const owner = new Int32Array(W * H).fill(-1);
const queue = tops.map((t, n) => { owner[id(t.i, t.j)] = n; return [t.i, t.j, n]; });
for (let q = 0; q < queue.length; q++) {
  const [i, j, n] = queue[q];
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
    const k = id(ii, jj);
    if (owner[k] >= 0 || smooth[k] < Math.max(1.5, 0.4 * tops[n].h)) continue;
    if (Math.hypot(ii - tops[n].i, jj - tops[n].j) * CELL > 7) continue;
    owner[k] = n; queue.push([ii, jj, n]);
  }
}
const area = new Array(tops.length).fill(0);
for (const o of owner) if (o >= 0) area[o]++;

const features = [];
tops.forEach((t, n) => {
  const x = x0 + (t.i + 0.5) * CELL, y = y0 + (t.j + 0.5) * CELL;
  const parcel = parcels.find((p) => inside(x, y, p.ring));
  const diam = 2 * Math.sqrt((area[n] * CELL * CELL) / Math.PI);
  features.push({
    type: "Feature", geometry: { type: "Point", coordinates: [+x.toFixed(2), +y.toFixed(2)] },
    properties: { parcel: parcel ? parcel.label : null, height_m: +t.h.toFixed(1), crown_m: +diam.toFixed(1),
      ground_bpv: +groundAt(x, y).toFixed(2), source: "LLS 2. cyklus, 12. 3. 2023" },
  });
});
const onPlot = features.filter((f) => f.properties.parcel);
fs.writeFileSync(new URL("data/tree_candidates.geojson", root), JSON.stringify({ type: "FeatureCollection",
  crs: { type: "name", properties: { name: "EPSG:5514" } }, features }));
fs.writeFileSync(new URL("data/chm.json", root), JSON.stringify({ x0, y0, cell: CELL, w: W, h: H,
  data: Array.from(smooth, (v) => Math.round(v * 10)) }));
const by = {}; onPlot.forEach((f) => (by[f.properties.parcel] = (by[f.properties.parcel] || 0) + 1));
const hs = onPlot.map((f) => f.properties.height_m).sort((a, b) => a - b);
console.log(`kandidátov spolu ${features.length}, na pozemku ${onPlot.length}`, by);
console.log(`výška na pozemku: min ${hs[0]}, medián ${hs[hs.length >> 1]}, max ${hs.at(-1)} m`);
