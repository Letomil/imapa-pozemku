// Osadenie modelu domu do S-JTSK z rohov strechy odčítaných z ortofota (5 cm/px výrez).
// Výstup: data/georef.json (transformácia model mm -> S-JTSK m) a kontrolný náhľad.
// Súradnice pozemku sa čítajú z data/site.local.json (mimo verejného repozitára).
import fs from "node:fs";

const site = JSON.parse(fs.readFileSync(new URL("../data/site.local.json", import.meta.url)));
const F = site.fitOrtho;
const toSJTSK = ([px, py]) => [F.x0 + px / F.pxPerM, F.y1 - py / F.pxPerM];

// Rohy strechy prednej (uličnej) časti domu odčítané z ortofota (px)
const roofSouth = toSJTSK(F.roofSouth_px); // model (0, 0)  – roh pri ulici na JV strane
const roofWest = toSJTSK(F.roofWest_px);   // model (0, 9860) – roh pri ulici na SZ strane
const roofEast = toSJTSK(F.roofEast_px);   // model (~9700, 0) – zadný roh prednej časti na JV strane

const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const thX = ang(roofSouth, roofEast);               // smer +X modelu
const thY = ang(roofSouth, roofWest) - Math.PI / 2; // smer +Y modelu, otočený na +X
const theta = Math.atan2(Math.sin(thX) + Math.sin(thY), Math.cos(thX) + Math.cos(thY));
const ux = [Math.cos(theta), Math.sin(theta)], uy = [-Math.sin(theta), Math.cos(theta)];

// Strecha presahuje steny; odhad presahu 0,4 m v oboch smeroch
const EAVE = F.eave_m;
const origin = [roofSouth[0] + EAVE * (ux[0] + uy[0]), roofSouth[1] + EAVE * (ux[1] + uy[1])];

const georef = {
  description: "Model DOM_2.stp (mm, X od ulice dozadu, Y k SZ susedovi) -> S-JTSK EPSG:5514 (m)",
  method: "rohy strechy z ortofota UGKK 2023, odhad presahu strechy 0,4 m; presnost odhadom 0,5 m",
  originSJTSK: origin.map((v) => +v.toFixed(3)),
  rotationDeg: +(theta * 180 / Math.PI).toFixed(3),
  scale: 0.001,
  check: {
    frontWidthRoof_m: +Math.hypot(roofWest[0] - roofSouth[0], roofWest[1] - roofSouth[1]).toFixed(2),
    sideLengthRoof_m: +Math.hypot(roofEast[0] - roofSouth[0], roofEast[1] - roofSouth[1]).toFixed(2),
    axisNonOrthogonality_deg: +((thX - thY) * 180 / Math.PI).toFixed(2),
  },
};
const out = new URL("../data/georef.json", import.meta.url);
fs.writeFileSync(out, JSON.stringify(georef, null, 2));
console.log(JSON.stringify(georef, null, 2));
