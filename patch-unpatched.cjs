const fs = require('fs');

const d = require('./public/data/bruecke-museum-collection.json');

// Find all that still have old IDs. We can guess by checking if it matches the new ones.
// The patched ones have New IDs that we just got. Wait, all we know is that the ID didn't change...
// Actually, I can just check if those DDB pages resolve!
