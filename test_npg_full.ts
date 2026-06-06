import { getUnifiedArtworkName } from './src/utils/metadata';
import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('./public/data/national-portrait-gallery-london-collection.json', 'utf8'));

let untitledCount = 0;
const objects = data.objects || [];
objects.forEach(item => {
  if (getUnifiedArtworkName(item) === 'Untitled') {
    untitledCount++;
  }
});

console.log(`Total: ${objects.length}, Untitled: ${untitledCount}`);
if (untitledCount > 0) {
    console.log("First 3 untitled:", objects.filter(item => getUnifiedArtworkName(item) === 'Untitled').slice(0,3));
}
