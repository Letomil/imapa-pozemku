// Kontrolný obrázok: ortofoto pozemku (natočené pozdĺž osi) + hranice KN + kandidáti na stromy.
// Použitie: node render_trees.mjs [od_m=0] [do_m=205] → data/preview/stromy_<od>-<do>.png
// Os pozemku: začiatok pri dome (georef.json), smer +X modelu (od ulice dozadu).
import fs from "node:fs";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const rd = (p) => JSON.parse(fs.readFileSync(new URL(p, root)));
const A = Number(process.argv[2] || 0), B = Number(process.argv[3] || 205), PXM = 12;
const g = rd("data/georef.json"), th = g.rotationDeg * Math.PI / 180, [ox, oy] = g.originSJTSK;
const ux = [Math.cos(th), Math.sin(th)], uy = [-Math.sin(th), Math.cos(th)];
// lokálne (u pozdĺž, v naprieč) → S-JTSK
const l2s = (u, v) => [ox + u * ux[0] + v * uy[0], oy + u * ux[1] + v * uy[1]];
const s2l = (x, y) => [(x - ox) * ux[0] + (y - oy) * ux[1], (x - ox) * uy[0] + (y - oy) * uy[1]];
const V0 = -22, V1 = 14; // naprieč pozemkom (m), pozemok sa lomí, preto rezerva
const Wpx = Math.round((B - A) * PXM), Hpx = Math.round((V1 - V0) * PXM);

// ortofoto: výrez v S-JTSK pokrývajúci natočený obdĺžnik, potom natočenie cez SVG transform
const corners = [[A, V0], [B, V0], [A, V1], [B, V1]].map(([u, v]) => l2s(u, v));
const bx0 = Math.min(...corners.map((c) => c[0])), bx1 = Math.max(...corners.map((c) => c[0]));
const by0 = Math.min(...corners.map((c) => c[1])), by1 = Math.max(...corners.map((c) => c[1]));
const OPX = 8; // px/m výrezu ortofota
const ow = Math.round((bx1 - bx0) * OPX), oh = Math.round((by1 - by0) * OPX);
const url = `https://zbgis.skgeodesy.sk/zbgis/rest/services/Ortofoto/MapServer/export?bbox=${bx0},${by0},${bx1},${by1}` +
  `&bboxSR=5514&imageSR=5514&size=${ow},${oh}&format=jpg&f=image`;
const ortho = Buffer.from(await (await fetch(url)).arrayBuffer()).toString("base64");

// mapovanie S-JTSK → px obrázka: u → x (doprava), v → y (hore = SZ)
const P = (x, y) => { const [u, v] = s2l(x, y); return [((u - A) * PXM).toFixed(1), ((V1 - v) * PXM).toFixed(1)]; };
// transform ortofota: pixel (px,py) → S-JTSK (bx0+px/OPX, by1-py/OPX) → obrázok
const [ax, ay] = P(bx0, by1), [bxp, byp] = P(bx0 + 1, by1), [cxp, cyp] = P(bx0, by1 - 1);
const m = [(bxp - ax) / OPX, (byp - ay) / OPX, (cxp - ax) / OPX, (cyp - ay) / OPX, ax, ay];

const kn = rd("data/raw/parcely_kn.geojson"), trees = rd("data/tree_candidates.geojson");
let svg = `<image href="data:image/jpeg;base64,${ortho}" width="${ow}" height="${oh}" transform="matrix(${m.join(" ")})"/>`;
for (const f of kn.features) svg += `<polygon points="${f.geometry.coordinates[0].map(([x, y]) => P(x, y).join(",")).join(" ")}" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="8 5"/>`;
trees.features.forEach((f, n) => {
  const [x, y] = P(...f.geometry.coordinates), p = f.properties;
  const col = p.parcel ? "#ffeb3b" : "#ff7043";
  svg += `<circle cx="${x}" cy="${y}" r="${(p.crown_m / 2) * PXM}" fill="none" stroke="${col}" stroke-width="1.5"/>` +
    `<circle cx="${x}" cy="${y}" r="3" fill="${col}"/>` +
    `<text x="${+x + 5}" y="${+y - 5}" fill="${col}" font-size="13" font-family="sans-serif" font-weight="700" stroke="#000" stroke-width="0.6">${n + 1}·${p.height_m}</text>`;
});
for (let u = Math.ceil(A / 10) * 10; u <= B; u += 10)
  svg += `<text x="${(u - A) * PXM + 2}" y="${Hpx - 4}" fill="#fff" font-size="12" font-family="sans-serif" stroke="#000" stroke-width="0.5">${u} m</text>`;
const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wpx}" height="${Hpx}"><rect width="100%" height="100%" fill="#222"/>${svg}</svg>`;
const out = new URL(`data/preview/stromy_${A}-${B}.png`, root);
await sharp(Buffer.from(doc)).png().toFile(out.pathname.replace(/^\/([A-Z]:)/, "$1"));
console.log(`ok ${Wpx}x${Hpx} → data/preview/stromy_${A}-${B}.png`);
