const fs = require("fs");
const d = JSON.parse(fs.readFileSync("public/data/leopold-museum-collection.json"));
let noImg = 0;
for(let it of d) {
  let imgUrl = it.image || it.image_url || it.imageUrl || it.primaryImage || it.webImage || it.url;
  if (!imgUrl && it.images && it.images[0]) imgUrl = it.images[0].url || it.images[0].src;
  if (!imgUrl || !imgUrl.startsWith("http")) noImg++;
}
console.log("No image count for leopold:", noImg);
