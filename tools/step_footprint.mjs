// Pôdorys telies zo STEP ako SVG (pohľad zhora) – použitie: node step_footprint.mjs <subor.stp> <vystup.svg>
// Mená telies sa v occt-import-js strácajú, preto sa berú z MANIFOLD_SOLID_BREP v poradí súboru.
import fs from "node:fs";
import occtimportjs from "occt-import-js";

const [, , inFile, outFile] = process.argv;
const text = fs.readFileSync(inFile, "latin1");
const decode = (s) => s.replace(/\\X2\\([0-9A-F]+)\\X0\\/g, (_, h) =>
  String.fromCharCode(...h.match(/.{4}/g).map((x) => parseInt(x, 16))));
const solidNames = [...text.matchAll(/MANIFOLD_SOLID_BREP\('([^']*)'/g)].map((m) => decode(m[1]));

const occt = await occtimportjs();
const res = occt.ReadStepFile(new Uint8Array(fs.readFileSync(inFile)), null);
const nSurf = res.meshes.length - solidNames.length; // pomocné plochy sú na začiatku
const bodies = res.meshes.map((m, i) => ({ m, name: i < nSurf ? `plocha${i}` : solidNames[i - nSurf] }));

const S = 0.02; // px na mm (20 px/m)
const all = bodies.flatMap((b) => [...b.m.attributes.position.array]);
let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
for (let k = 0; k < all.length; k += 3) {
  mnx = Math.min(mnx, all[k]); mxx = Math.max(mxx, all[k]);
  mny = Math.min(mny, all[k + 1]); mxy = Math.max(mxy, all[k + 1]);
}
const pad = 40, W = (mxx - mnx) * S + 2 * pad, H = (mxy - mny) * S + 2 * pad;
const px = (x) => ((x - mnx) * S + pad).toFixed(1), py = (y) => ((mxy - y) * S + pad).toFixed(1);
const colors = { "novy dom": "#e53935", pristavby: "#fb8c00", letna_kuchyňa: "#1e88e5", šopa: "#3949ab",
  pivnice: "#8e24aa", prijazdovka: "#9e9e9e", terasa: "#43a047", žumpa: "#6d4c41" };
let svg = "";
for (const { m, name } of bodies) {
  if (name.startsWith("plocha")) continue;
  const base = name.replace(/\.\d+$/, "");
  const c = colors[base] || "#607d8b";
  const p = m.attributes.position.array, idx = m.index.array;
  let tri = "";
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, d] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
    tri += `M${px(p[a])},${py(p[a + 1])}L${px(p[b])},${py(p[b + 1])}L${px(p[d])},${py(p[d + 1])}Z`;
  }
  svg += `<path d="${tri}" fill="${c}" fill-opacity="0.35" stroke="${c}" stroke-width="0.6" stroke-opacity="0.8"><title>${name}</title></path>`;
}
// osi a mierka
svg += `<line x1="${px(0)}" y1="${py(0)}" x2="${px(5000)}" y2="${py(0)}" stroke="#000" stroke-width="3"/>` +
  `<text x="${px(5200)}" y="${py(0)}" font-size="16">+X 5 m</text>` +
  `<line x1="${px(0)}" y1="${py(0)}" x2="${px(0)}" y2="${py(5000)}" stroke="#000" stroke-width="3"/>` +
  `<text x="${px(0)}" y="${py(5300)}" font-size="16">+Y</text>`;
const legend = Object.entries(colors).map(([n, c], i) =>
  `<rect x="10" y="${10 + i * 20}" width="14" height="14" fill="${c}"/><text x="30" y="${22 + i * 20}" font-size="14">${n}</text>`).join("");
fs.writeFileSync(outFile, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="background:#fff">${svg}${legend}</svg>`);
console.log(`ok ${W.toFixed(0)}x${H.toFixed(0)}, telies ${bodies.length}, pomocných plôch ${nSurf}`);
