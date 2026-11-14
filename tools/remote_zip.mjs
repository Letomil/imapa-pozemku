// Čítanie veľkého ZIP na serveri po častiach (HTTP Range) – bez sťahovania celého archívu.
// node remote_zip.mjs list <url> [filter]        – vypíše súbory v archíve
// node remote_zip.mjs get  <url> <nazov> <ciel>  – stiahne a rozbalí jeden súbor
import fs from "node:fs";
import zlib from "node:zlib";

async function range(url, start, end) {
  const r = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (r.status !== 206) throw new Error(`Server nevrátil časť súboru (HTTP ${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

async function centralDirectory(url) {
  const head = await fetch(url, { method: "HEAD" });
  const size = Number(head.headers.get("content-length"));
  const tail = await range(url, Math.max(0, size - 65558), size - 1);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("Koniec ZIP archívu sa nenašiel");
  let cdSize = tail.readUInt32LE(eocd + 12), cdOff = tail.readUInt32LE(eocd + 16), count = tail.readUInt16LE(eocd + 10);
  const loc64 = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]));
  if (loc64 >= 0) { // ZIP64
    const e64off = Number(tail.readBigUInt64LE(loc64 + 8));
    const e64 = await range(url, e64off, e64off + 55);
    count = Number(e64.readBigUInt64LE(32)); cdSize = Number(e64.readBigUInt64LE(40)); cdOff = Number(e64.readBigUInt64LE(48));
  }
  const cd = await range(url, cdOff, cdOff + cdSize - 1);
  const entries = [];
  for (let p = 0, i = 0; i < count; i++) {
    const method = cd.readUInt16LE(p + 10), nameLen = cd.readUInt16LE(p + 28), extraLen = cd.readUInt16LE(p + 30), commLen = cd.readUInt16LE(p + 32);
    let csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24), off = cd.readUInt32LE(p + 42);
    const name = cd.toString("utf8", p + 46, p + 46 + nameLen);
    let e = p + 46 + nameLen; const eEnd = e + extraLen;
    while (e < eEnd) { // ZIP64 extra pole
      const id = cd.readUInt16LE(e), len = cd.readUInt16LE(e + 2); let q = e + 4;
      if (id === 1) {
        if (usize === 0xffffffff) { usize = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (csize === 0xffffffff) { csize = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (off === 0xffffffff) { off = Number(cd.readBigUInt64LE(q)); q += 8; }
      }
      e += 4 + len;
    }
    entries.push({ name, method, csize, usize, off });
    p = eEnd + commLen;
  }
  return entries;
}

async function extract(url, entry, dest) {
  const lh = await range(url, entry.off, entry.off + 29);
  const dataStart = entry.off + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  const data = await range(url, dataStart, dataStart + entry.csize - 1);
  fs.writeFileSync(dest, entry.method === 8 ? zlib.inflateRawSync(data) : data);
}

const [, , cmd, url, a, b] = process.argv;
const entries = await centralDirectory(url);
if (cmd === "list") {
  const f = entries.filter((x) => !a || x.name.includes(a));
  console.log(`${entries.length} súborov, vybraných ${f.length}`);
  f.slice(0, 50).forEach((x) => console.log(`${x.name}\t${(x.usize / 1e6).toFixed(1)} MB`));
} else if (cmd === "get") {
  const e = entries.find((x) => x.name === a);
  if (!e) throw new Error("Súbor v archíve nie je: " + a);
  await extract(url, e, b);
  console.log(`uložené ${b} (${(e.usize / 1e6).toFixed(1)} MB)`);
}
