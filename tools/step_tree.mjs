// Vypíše strom zostavy STEP s názvami a indexmi telies – použitie: node step_tree.mjs <subor.stp>
import fs from "node:fs";
import occtimportjs from "occt-import-js";

const occt = await occtimportjs();
const res = occt.ReadStepFile(new Uint8Array(fs.readFileSync(process.argv[2])), null);
const decode = (s) => (s || "").replace(/\\X2\\([0-9A-F]+)\\X0\\/g, (_, h) =>
  String.fromCharCode(...h.match(/.{4}/g).map((x) => parseInt(x, 16))));
const walk = (n, ind) => {
  console.log(`${ind}${decode(n.name)} meshes:${JSON.stringify(n.meshes)}`);
  (n.children || []).forEach((c) => walk(c, ind + "  "));
};
walk(res.root, "");
console.log(res.meshes.map((m, i) => `${i}:${decode(m.name)}${m.color ? "(" + m.color.map((c) => c.toFixed(2)) + ")" : ""}`).join(" | "));
