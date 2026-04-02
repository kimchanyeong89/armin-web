const exhId = "bruecke-museum-collection";
let file = exhId + ".json";
if (exhId === "tm-perm-1") file = "tate-modern-collection.json";
if (exhId === "tate-britain-1") file = "tate-britain-artworks.json";
if (exhId === "tate-st-ives-1") file = "tate-st-ives-artworks.json";
if (exhId === "tate-liverpool-1") file = "tate-liverpool-artworks.json";
if (exhId === "bm-perm-1") file = "british-museum-galleries.json";
if (exhId === "lacma-permanent-1") file = "lacma-paintings.json";
if (exhId === "lacma-permanent-2") file = "lacma-classification-22.json";
if (exhId === "skagens-perm-1") file = "skagens-collection.json";
if (exhId === "ngs-perm-1") file = "ngs-all.json";

console.log(file);
