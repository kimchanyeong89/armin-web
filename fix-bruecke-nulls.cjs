const fs = require('fs');
const d = require('./public/data/bruecke-museum-collection.json');

// We know the newly mapped ones have new UUIDs. All old UUIDs have different format, or maybe we just check if they contain our known old ones.
// Wait, we know exactly which ones were patched: the ones that we wrote in `patch-bruecke-images`.
