// Kontrolný náhľad: ortofoto + hranice KN + pôdorys modelu osadený podľa data/georef.json
// Použitie: node overlay_check.mjs  (výstup data/preview/kontrola_osadenie.html)
import fs from "node:fs";
import occtimportjs from "occt-import-js";

const root = new URL("../", import.meta.url);
const rd = (p) => fs.readFileSync(new URL(p, root));
const georef = JSON.parse(rd("data/georef.json"));
const site = JSON.parse(rd("data/site.local.json"));
const { x0: X0, y1: Y1, x1: X1, y0: Y0, pxPerM: PXM } = site.overlayBbox;
const STEP = site.stepFile;
const img = "data/raw/ortofoto_osadenie_5cm.jpg";
if (!fs.existsSync(new URL(img, root))) {
  const url = `https://zbgis.skgeodesy.sk/zbgis/rest/services/Ortofoto/MapServer/export?bbox=${X0},${Y0},${X1},${Y1}` +
    `&bboxSR=5514&imageSR=5514&size=${(X1 - X0) * PXM},${(Y1 - Y0) * PXM}&format=jpg&f=image`;
  fs.writeFileSync(new URL(img, root), Buffer.from(await (await fetch(url)).arrayBuffer()));
}
const W = (X1 - X0) * PXM, H = (Y1 - Y0) * PXM;
const sx = (x) => ((x - X0) * PXM).toFixed(1), sy = (y) => ((Y1 - y) * PXM).toFixed(1);

const th = georef.rotationDeg * Math.PI / 180, [ox, oy] = georef.originSJTSK;
const m2s = (x, y) => [ox + (x * Math.cos(th) - y * Math.sin(th)) / 1000, oy + (x * Math.sin(th) + y * Math.cos(th)) / 1000];

const text = rd(STEP).toString("latin1");
const decode = (s) => s.replace(/\\X2\\([0-9A-F]+)\\X0\\/g, (_, h) => String.fromCharCode(...h.match(/.{4}/g).map((x) => parseInt(x, 16))));
const names = [...text.matchAll(/MANIFOLD_SOLID_BREP\('([^']*)'/g)].map((m) => decode(m[1]));
const occt = await occtimportjs();
const res = occt.ReadStepFile(new Uint8Array(rd(STEP)), null);
const nSurf = res.meshes.length - names.length;
const show = { "novy dom": "#ff1744", pristavby: "#ff9100", "letna_kuchyňa": "#00e5ff", "šopa": "#2979ff", terasa: "#76ff03" };
let svg = "";
res.meshes.forEach((m, i) => {
  if (i < nSurf) return;
  const base = names[i - nSurf].replace(/\.\d+$/, "");
  if (!show[base]) return;
  const p = m.attributes.position.array, idx = m.index.array;
  let d = "";
  for (let t = 0; t < idx.length; t += 3) {
    const pts = [idx[t], idx[t + 1], idx[t + 2]].map((k) => m2s(p[k * 3], p[k * 3 + 1]));
    d += "M" + pts.map(([x, y]) => `${sx(x)},${sy(y)}`).join("L") + "Z";
  }
  svg += `<path d="${d}" fill="${show[base]}" fill-opacity="0.12" stroke="${show[base]}" stroke-width="0.8"/>`;
});
const kn = JSON.parse(rd("data/raw/parcely_kn.geojson"));
for (const f of kn.features)
  svg += `<polygon points="${f.geometry.coordinates[0].map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ")}" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="12 6"/>`;
const legend = Object.entries(show).map(([n, c]) => `<span style="color:${c}">■ ${n}</span>`).join(" ") + ` <span>– – hranica KN</span>`;
const b64 = fs.readFileSync(new URL(img, root)).toString("base64");
fs.writeFileSync(new URL("data/preview/kontrola_osadenie.html", root),
  `<!doctype html><meta charset="utf-8"><title>Kontrola osadenia domu</title><body style="margin:0;background:#111;color:#eee;font:14px sans-serif"><p style="margin:6px">${legend} · ortofoto ÚGKK SR 2023, CC BY 4.0</p>` +
  `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto"><image href="data:image/jpeg;base64,${b64}" width="${W}" height="${H}"/>${svg}</svg>`);

// Odstup SZ steny domu (model y = 9860) od SZ hranice KN parcely 11/1
const wallA = m2s(0, 9860), wallB = m2s(19094, 9860);
const p111 = kn.features.find((f) => f.properties.label === "11/1").geometry.coordinates[0];
const n = [-(wallB[1] - wallA[1]), wallB[0] - wallA[0]], L = Math.hypot(...n);
const dist = (q) => ((q[0] - wallA[0]) * n[0] + (q[1] - wallA[1]) * n[1]) / L; // + = na SZ od steny
const near = p111.map((q) => ({ q, along: ((q[0] - wallA[0]) * (wallB[0] - wallA[0]) + (q[1] - wallA[1]) * (wallB[1] - wallA[1])) / L, d: dist(q) }))
  .filter((v) => v.along > -5 && v.along < 45);
console.log("vrcholy KN 11/1 pri dome (vzdialenosť od SZ steny, + = smerom k SZ susedovi):");
near.forEach((v) => console.log(`  pozdĺž ${v.along.toFixed(1)} m  odstup ${v.d.toFixed(2)} m`));
