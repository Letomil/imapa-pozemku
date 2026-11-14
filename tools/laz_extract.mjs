// Vyberie body z LAZ súborov (LLS ÚGKK) v okolí pozemku.
// Použitie: node laz_extract.mjs <priecinok_s_laz> [buffer_m=3]  → data/lls_plot_points.json
// Výstup: pole [x, y, z, trieda, číslo odrazu] v S-JTSK + Bpv.
import fs from "node:fs";
import path from "node:path";
import { createLazPerf } from "laz-perf";

const [, , dir, bufArg] = process.argv;
const BUF = Number(bufArg || 3);
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
const all = rings.flat(), xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
const bb = [Math.min(...xs) - BUF, Math.min(...ys) - BUF, Math.max(...xs) + BUF, Math.max(...ys) + BUF];
const near = (x, y) => x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3] &&
  rings.some((r) => inside(x, y, r) || r.some((p, i) => i > 0 && segDist(x, y, r[i - 1], p) <= BUF));

const Laz = await createLazPerf();
const out = [], classes = {};
let total = 0;
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".laz"))) {
  const file = new Uint8Array(fs.readFileSync(path.join(dir, f)));
  const dv = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const sc = [dv.getFloat64(131, true), dv.getFloat64(139, true), dv.getFloat64(147, true)];
  const of = [dv.getFloat64(155, true), dv.getFloat64(163, true), dv.getFloat64(171, true)];
  const filePtr = Laz._malloc(file.byteLength);
  Laz.HEAPU8.set(file, filePtr);
  const laszip = new Laz.LASZip();
  laszip.open(filePtr, file.byteLength);
  const fmt = laszip.getPointFormat(), len = laszip.getPointLength(), n = laszip.getCount();
  const ptPtr = Laz._malloc(len);
  for (let i = 0; i < n; i++) {
    laszip.getPoint(ptPtr);
    const p = new DataView(Laz.HEAPU8.buffer, ptPtr, len);
    const x = p.getInt32(0, true) * sc[0] + of[0], y = p.getInt32(4, true) * sc[1] + of[1];
    if (!near(x, y)) continue;
    const z = p.getInt32(8, true) * sc[2] + of[2];
    const cls = fmt >= 6 ? p.getUint8(16) : p.getUint8(15) & 31;
    const ret = fmt >= 6 ? p.getUint8(14) & 15 : p.getUint8(14) & 7;
    out.push([+x.toFixed(2), +y.toFixed(2), +z.toFixed(2), cls, ret]);
    classes[cls] = (classes[cls] || 0) + 1;
  }
  total += n;
  Laz._free(ptPtr); laszip.delete(); Laz._free(filePtr);
  console.log(`${f}: formát ${fmt}, bodov ${n}`);
}
fs.writeFileSync(new URL("data/lls_plot_points.json", root), JSON.stringify({
  source: "Klasifikované mračno bodov 2. cyklus LLS, ÚGKK SR (CC BY 4.0), sken 12. 3. 2023, S-JTSK (JTSK03) + Bpv",
  fields: ["x", "y", "z", "class", "return"], points: out,
}));
console.log(`spolu ${total}, nad pozemkom ${out.length}; triedy:`, classes);
