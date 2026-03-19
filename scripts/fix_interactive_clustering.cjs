const fs = require('fs');
const filepath = 'src/components/InteractiveGlobeMap/InteractiveGlobeMap.tsx';
let code = fs.readFileSync(filepath, 'utf8');

const target = `      } else {
        cityMap.get(key)!.venues.push(venue);
      }
    }

    return Array.from(cityMap.values());
  }, [exhibitions, artworkCounts]);`;

const rep = `      } else {
        cityMap.get(key)!.venues.push(venue);
      }
    }

    const rawCities = Array.from(cityMap.values());
    
    // --- GEOGRAPHIC CLUSTERING ---
    // Merge only truly adjacent cities within ~1.5 degrees (~150km).
    const GEO_MERGE_DIST = 1.3;
    
    // Sort by count descending so larger cities consume smaller surrounding towns
    rawCities.sort((a, b) => b.venues.length - a.venues.length);
    
    const clusteredCities: CityMarker[] = [];
    const mergedIndices = new Set<number>();
    
    for (let i = 0; i < rawCities.length; i++) {
        if (mergedIndices.has(i)) continue;
        const mainCity = rawCities[i];
        
        let mergedVenues = [...mainCity.venues];

        for (let j = i + 1; j < rawCities.length; j++) {
            if (mergedIndices.has(j)) continue;
            const otherCity = rawCities[j];
            
            const dx = mainCity.coordinates[0] - otherCity.coordinates[0];
            const dy = mainCity.coordinates[1] - otherCity.coordinates[1];
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < GEO_MERGE_DIST) {
                // IMPORTANT: only merge cities within the SAME country
                if (mainCity.country !== otherCity.country) continue;
                
                mergedVenues = mergedVenues.concat(otherCity.venues);
                mergedIndices.add(j);
            }
        }
        
        clusteredCities.push({
            ...mainCity,
            venues: mergedVenues
        });
    }

    return clusteredCities;
  }, [exhibitions, artworkCounts]);`;

if(code.indexOf(target) !== -1){
    fs.writeFileSync(filepath, code.replace(target, rep));
    console.log('Clustering updated');
} else {
    console.log('Target not found!!');
}
