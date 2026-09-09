const fs = require("fs");
const p = "C:/Users/lande/Projects/MusicAll/src/routes/users.ts";
const BT = String.fromCharCode(96);
const QU = String.fromCharCode(39);
const BS = String.fromCharCode(92);
let c = fs.readFileSync(p, "utf8");
const old = BT + "($" + "{queueItems.title} ILIKE ${pattern} ESCAPE " + QU + BS + BS + QU + " OR ${queueItems.artist} ILIKE ${pattern} ESCAPE " + QU + BS + BS + QU + ")" + BT;
const rep = BT + "($" + "{queueItems.title} LIKE ${pattern} OR ${queueItems.artist} LIKE ${pattern})" + BT;
if (c.includes(old)) {
  c = c.replace(old, rep);
  fs.writeFileSync(p, c.replace(/^\uFEFF/, ""), "utf8");
  console.log("ILIKE replaced with LIKE");
} else {
  console.log("old ILIKE string not found; ILIKE still = " + /ILIKE/.test(c));
}
