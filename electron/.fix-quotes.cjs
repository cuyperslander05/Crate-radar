const fs = require("fs");
const dir = "C:/Users/lande/Projects/MusicAll/src";
const QU = String.fromCharCode(39);
function walk(d){
  const out=[];
  for(const e of fs.readdirSync(d,{withFileTypes:true})){
    const p=d+"/"+e.name;
    if(e.isDirectory()) out.push(...walk(p));
    else if(e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}
let changed=[];
for(const p of walk(dir)){
  let c=fs.readFileSync(p,"utf8");
  const before=c;
  const rx=new RegExp(QU+QU+"([^"+QU+"\\n]+)"+QU+QU,"g");
  c=c.replace(rx, QU+"$1"+QU);
  if(c!==before){ fs.writeFileSync(p,c.replace(/^\uFEFF/,""),"utf8"); changed.push(p.replace(dir,".")); }
}
if(changed.length) console.log("quotes fixed in: "+changed.join(", "));
else console.log("no changes");
