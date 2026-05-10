const fs = require("fs");
const path = require("path");

const routePath = path.join(__dirname, "..", "src", "app", "api", "analyze", "route.ts");
const buf = fs.readFileSync(routePath);
let text;

if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
  text = buf.subarray(2).toString("utf16le");
} else if (buf.includes(0) && buf.length >= 4 && buf[1] === 0) {
  text = buf.toString("utf16le");
} else {
  text = buf.toString("utf8");
}

fs.writeFileSync(routePath, text.replace(/^\uFEFF/, ""), "utf8");
console.log("OK:", routePath);
