// Výšky terénu DMR 6.0 (Bpv, m) v mriežke nad pozemkom cez identify služby ZBGIS LLS_DMR6.
// Použitie: node sample_dmr.mjs [krok_m=2] [buffer_m=2]  → data/terrain_dmr6.json
import fs from "node:fs";

const STEP = Number(process.argv[2] || 2), BUF = Number(process.argv[3] || 2);
const root = new URL("../", import.meta.url);
const kn = JSON.parse(fs.readFileSync(new URL("data/raw/parcely_kn.geojson", root)));
const rings = kn.features.map((f) => f.geometry.coordinates[0]);

const inside = (x, y, r) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  return c;
};
const segDist = (x, y, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
};
const near = (x, y) => rings.some((r) => inside(x, y, r) || r.some((p, i) => i > 0 && segDist(x, y, r[i - 1], p) <= BUF));

const all = rings.flat();
const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
const x0 = Math.floor((Math.min(...xs) - BUF) / STEP) * STEP, x1 = Math.max(...xs) + BUF;
const y0 = Math.floor((Math.min(...ys) - BUF) / STEP) * STEP, y1 = Math.max(...ys) + BUF;
const pts = [];
for (let x = x0; x <= x1; x += STEP) for (let y = y0; y <= y1; y += STEP) if (near(x, y)) pts.push([x, y]);
console.log(`bodov: ${pts.length}`);

const URL_ID = "https://zbgis.skgeodesy.sk/zbgis/rest/services/LLS_DMR6/MapServer/identify";
async function height([x, y]) {
  const q = new URLSearchParams({
    geometry: JSON.stringify({ x, y, spatialReference: { wkid: 5514 } }), geometryType: "esriGeometryPoint",
    sr: "5514", layers: "all:3", tolerance: "0", returnGeometry: "false", f: "json",
    mapExtent: `${x - 50},${y - 50},${x + 50},${y + 50}`, imageDisplay: "100,100,96",
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const j = await (await fetch(`${URL_ID}?${q}`)).json();
      const v = j.results?.[0]?.attributes?.["Stretch.Pixel Value"];
      return v === undefined ? null : Number(v);
    } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  return null;
}

const out = new Array(pts.length);
let next = 0, done = 0;
await Promise.all(Array.from({ length: 4 }, async () => { // max 4 súbežné dotazy – šetríme verejnú službu
  while (next < pts.length) {
    const i = next++;
    out[i] = [...pts[i], await height(pts[i])];
    if (++done % 100 === 0) console.log(`${done}/${pts.length}`);
  }
}));
const ok = out.filter((p) => p[2] !== null);
fs.writeFileSync(new URL("data/terrain_dmr6.json", root), JSON.stringify({
  source: "DMR 6.0, ÚGKK SR (CC BY 4.0), skenovanie 03/2023, S-JTSK (JTSK03) + Bpv",
  step_m: STEP, points: ok.map((p) => p.map((v) => +v.toFixed(2))),
}));
const z = ok.map((p) => p[2]);
console.log(`hotovo ${ok.length}/${pts.length}, výška ${Math.min(...z).toFixed(2)}–${Math.max(...z).toFixed(2)} m`);
