// Vypíše telesá zo STEP súboru s ich rozmermi (mm) – použitie: node step_info.mjs <subor.stp>
import fs from "node:fs";
import occtimportjs from "occt-import-js";

const occt = await occtimportjs();
const buf = new Uint8Array(fs.readFileSync(process.argv[2]));
const res = occt.ReadStepFile(buf, null);
if (!res.success) { console.error("STEP sa nepodarilo načítať"); process.exit(1); }

const decode = (s) => s.replace(/\\X2\\([0-9A-F]+)\\X0\\/g, (_, h) =>
  String.fromCharCode(...h.match(/.{4}/g).map((x) => parseInt(x, 16))));

const rows = res.meshes.map((m, i) => {
  const p = m.attributes.position.array;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < p.length; k += 3) for (let a = 0; a < 3; a++) {
    mn[a] = Math.min(mn[a], p[k + a]); mx[a] = Math.max(mx[a], p[k + a]);
  }
  return { i, name: decode(m.name || ""), tris: m.index.array.length / 3,
    min: mn.map(Math.round), max: mx.map(Math.round),
    size: mx.map((v, a) => Math.round(v - mn[a])) };
});
console.log(JSON.stringify(rows.map((r) => `${r.i}\t${r.name}\tmin ${r.min}\tmax ${r.max}\tsize ${r.size}\ttris ${r.tris}`), null, 0)
  .replace(/","/g, "\n").replace(/^\["|"\]$/g, "").replace(/\\t/g, "\t"));
