const fs = require("fs");
const files = [
  "C:/Users/lande/Projects/MusicAll/src/routes/jams.ts",
  "C:/Users/lande/Projects/MusicAll/src/sockets/jamRoomHandler.ts"
];
let any = false;
for (const p of files) {
  let c = fs.readFileSync(p, "utf8");
  const next = c.replace("count(*)::int", "count(*)");
  if (next !== c) { fs.writeFileSync(p, next.replace(/^\uFEFF/, ""), "utf8"); any = true; }
}
console.log(any ? "count(*)::int replaced" : "no matches");
