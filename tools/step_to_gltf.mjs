// Prevod modelu domu STEP -> GLB (3D) a GeoJSON pôdorys v S-JTSK (2D).
// Vstupy: data/site.local.json (stepFile, ignoreBodies, zFloorBpv), data/georef.json
// Výstupy: data/house.glb, data/house_footprint.geojson
// GLB je v lokálnych súradniciach modelu v metroch (glTF: Y hore, -Z = +Y modelu); osadenie robí appka podľa georef.json.
import fs from "node:fs";
import occtimportjs from "occt-import-js";
import polygonClipping from "polygon-clipping";

const root = new URL("../", import.meta.url);
const site = JSON.parse(fs.readFileSync(new URL("data/site.local.json", root)));
const georef = JSON.parse(fs.readFileSync(new URL("data/georef.json", root)));
const stepPath = new URL(site.stepFile, root);

const decode = (s) => s.replace(/\\X2\\([0-9A-F]+)\\X0\\/g, (_, h) => String.fromCharCode(...h.match(/.{4}/g).map((x) => parseInt(x, 16))));
const names = [...fs.readFileSync(stepPath, "latin1").matchAll(/MANIFOLD_SOLID_BREP\('([^']*)'/g)].map((m) => decode(m[1]));
const occt = await occtimportjs();
const res = occt.ReadStepFile(new Uint8Array(fs.readFileSync(stepPath)), { linearUnit: "millimeter", linearDeflectionType: "absolute_value", linearDeflection: 5 });
const nSurf = res.meshes.length - names.length; // pomocné plochy (ignorujú sa)

// Kategórie: farba v 3D a typ objektu v 2D
const CATS = {
  "novy dom": ["dom", [0.85, 0.80, 0.72]], pristavby: ["dom", [0.85, 0.80, 0.72]], pivnice: ["pivnica", [0.6, 0.6, 0.6]],
  "letna_kuchyňa": ["letná kuchyňa", [0.80, 0.72, 0.60]], "strecha kuchyne": ["letná kuchyňa", [0.55, 0.30, 0.25]],
  "šopa": ["šopa", [0.55, 0.45, 0.35]], terasa: ["terasa", [0.75, 0.75, 0.72]], "Terasa-drevo": ["pergola", [0.55, 0.40, 0.25]],
  prijazdovka: ["spevnená plocha", [0.65, 0.65, 0.65]], "schody vonku": ["schody", [0.7, 0.7, 0.7]],
  "schody do pivnice": ["schody", [0.7, 0.7, 0.7]], "žumpa": ["žumpa", [0.5, 0.5, 0.5]], "vaňa": ["vaňa", [0.9, 0.9, 0.95]],
};
const bodies = res.meshes.map((m, i) => ({ m, name: i < nSurf ? null : names[i - nSurf] }))
  .filter((b) => b.name && !(site.ignoreBodies || []).includes(b.name))
  .map((b) => {
    const base = b.name.replace(/\.\d+$/, "");
    const [cat, color] = CATS[base] || ["iné", [0.7, 0.7, 0.7]];
    return { ...b, base, cat, color };
  });

// ---------- GLB ----------
const bin = [], accessors = [], bufferViews = [], meshes = [], nodes = [], materials = [], matIdx = {};
let offset = 0;
const pushView = (buf, target) => {
  const pad = (4 - (buf.length % 4)) % 4;
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
  bin.push(buf, Buffer.alloc(pad)); offset += buf.length + pad;
  return bufferViews.length - 1;
};
for (const b of bodies) {
  const p = b.m.attributes.position.array, idx = b.m.index.array;
  const pos = new Float32Array(p.length);
  for (let k = 0; k < p.length; k += 3) { pos[k] = p[k] / 1000; pos[k + 1] = p[k + 2] / 1000; pos[k + 2] = -p[k + 1] / 1000; }
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < pos.length; k += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pos[k + a]); mx[a] = Math.max(mx[a], pos[k + a]); }
  const posView = pushView(Buffer.from(pos.buffer), 34962);
  accessors.push({ bufferView: posView, componentType: 5126, count: pos.length / 3, type: "VEC3", min: mn, max: mx });
  const posAcc = accessors.length - 1;
  const ind = new Uint32Array(idx);
  accessors.push({ bufferView: pushView(Buffer.from(ind.buffer), 34963), componentType: 5125, count: ind.length, type: "SCALAR" });
  const key = b.color.join(",");
  if (matIdx[key] === undefined) {
    materials.push({ pbrMetallicRoughness: { baseColorFactor: [...b.color, 1], metallicFactor: 0, roughnessFactor: 0.9 }, doubleSided: true });
    matIdx[key] = materials.length - 1;
  }
  meshes.push({ name: b.name, primitives: [{ attributes: { POSITION: posAcc }, indices: accessors.length - 1, material: matIdx[key] }] });
  nodes.push({ name: b.name, mesh: meshes.length - 1, extras: { category: b.cat } });
}
const binBuf = Buffer.concat(bin);
const gltf = {
  asset: { version: "2.0", generator: "iMapa pozemku step_to_gltf.mjs" },
  scene: 0, scenes: [{ name: "dom", nodes: nodes.map((_, i) => i) }],
  nodes, meshes, materials, accessors, bufferViews, buffers: [{ byteLength: binBuf.length }],
  extras: { units: "m", up: "Y", modelAxes: "glTF X = model X (od ulice dozadu), glTF -Z = model Y (k SZ susedovi)", zFloorBpv: site.zFloorBpv },
};
let json = Buffer.from(JSON.stringify(gltf));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + binBuf.length, 8);
const chunk = (buf, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(buf.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, buf]); };
fs.writeFileSync(new URL("data/house.glb", root), Buffer.concat([header, chunk(json, 0x4e4f534a), chunk(binBuf, 0x004e4942)]));

// ---------- 2D pôdorys v S-JTSK ----------
const th = georef.rotationDeg * Math.PI / 180, [ox, oy] = georef.originSJTSK;
const m2s = (x, y) => [+(ox + (x * Math.cos(th) - y * Math.sin(th)) / 1000).toFixed(3), +(oy + (x * Math.sin(th) + y * Math.cos(th)) / 1000).toFixed(3)];
const PLAN = ["dom", "letná kuchyňa", "šopa", "terasa", "pergola", "spevnená plocha", "schody", "žumpa"];
const byCat = {};
for (const b of bodies) {
  if (!PLAN.includes(b.cat)) continue;
  const p = b.m.attributes.position.array, idx = b.m.index.array, tris = [];
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]].map((k) => [p[k * 3], p[k * 3 + 1]]);
    const area = (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[2][0] - v[0][0]) * (v[1][1] - v[0][1]);
    if (Math.abs(area) < 1000) continue; // zvislé steny a drobnosti (< 0,0005 m²)
    const ring = (area > 0 ? v : v.reverse()).map(([x, y]) => [Math.round(x), Math.round(y)]);
    tris.push([[...ring, ring[0]]]);
  }
  if (!tris.length) continue;
  (byCat[b.cat] = byCat[b.cat] || []).push(...tris);
}
const features = Object.entries(byCat).map(([cat, polys]) => {
  const u = polygonClipping.union(...polys);
  return {
    type: "Feature", properties: { category: cat, source: "DOM_2.stp, osadené podľa ortofota (±0,5 m)" },
    geometry: { type: "MultiPolygon", coordinates: u.map((poly) => poly.map((ring) => ring.map(([x, y]) => m2s(x, y)))) },
  };
});
fs.writeFileSync(new URL("data/house_footprint.geojson", root), JSON.stringify({ type: "FeatureCollection", crs: { type: "name", properties: { name: "EPSG:5514" } }, features }));

console.log(`GLB: ${bodies.length} telies, ${(fs.statSync(new URL("data/house.glb", root)).size / 1e6).toFixed(2)} MB`);
features.forEach((f) => console.log(`2D ${f.properties.category}: ${f.geometry.coordinates.length} plôch`));
