/**
 * Update Tate Britain Display exhibition descriptions from official website
 * 
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./path/to/service-account.json node scripts/update-tate-descriptions.cjs
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!serviceAccountPath) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT to point at a service account JSON file.');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Updated descriptions from Tate website
const updatedDescriptions = {
  'jmw-turner': {
    name: 'JMW Turner',
    description: `Tate Britain is home to the largest collection of works by Joseph Mallord William Turner (1775–1851).

Described as the 'father of modern art,' Turner shocked with his unique brushwork and use of colour. His portrayals of the modern world were unlike any seen before. As one of the country's greatest painters, he fittingly lends his name to the contemporary Turner Prize.

The galleries showcase 8 rooms dedicated to Turner's art, including his rise to fame, critical reception, the Turner Bequest containing thousands of works on paper, and his boundary-pushing experiments on canvas that remained unknown in his lifetime.

See Turner's art free in these galleries at the Clore Gallery, Main Floor.`,
  },
  
  'historic-early-modern-british-art': {
    name: 'Historic and Early Modern British Art',
    description: `Trace the story of British art from the Tudors to WWII.

These rooms start with the oldest artworks in Tate's collection. From the Tudor courts, war and revolution to the fight for women's suffrage, discover how art reflects nation-defining moments in our history.

The 16 rooms include: Exiles and Dynasties featuring grand portraits from Henry VIII to Charles I; Court versus Parliament exploring civil war and political revolution; Metropolis showing London as Europe's largest city through artists like William Hogarth; and The Exhibition Age recreating the spectacle of early public displays.

Look out for works by Joan Carlile and Mary Beale, two of the first women artists working in Britain as early as 1650. See familiar favourites by William Blake, John Singer Sargent, Gwen John, Vanessa Bell and more.

Located on the Main Floor. Continue your journey with Modern and Contemporary British Art.`,
  },
  
  'modern-contemporary-british-art': {
    name: 'Modern and Contemporary British Art', 
    description: `Explore the best of British art from 1940 to today.

Explore works that changed art as we know it from the Second World War to now. These 14 rooms reflect an explosion of new ideas, styles and voices that transformed British art and society.

The galleries include: Fear and Freedom exploring Post-War experiences of loss, destruction and displacement; Construction showing artists using new materials in dialogue with modern architecture; Prunella Clough: Urbscapes; and In Full Colour where social changes and popular media inspire vibrant, colour-saturated imagery.

Look out for paintings, sculptures, installations and photography by modern icons like Barbara Hepworth and Francis Bacon as well as contemporary works by Tracey Emin, Zineb Sedira, Pauline Boty and many more.

Located on the Main Floor. Find out what came before with Historic and Early Modern British Art.`,
  },
  
  'art-around-the-building': {
    name: 'Art Around the Building',
    description: `Discover commissions and artworks around Tate Britain's building and garden.

Look out for installations and artworks dotted around the buildings and outside on the lawns. Some are part of the fabric of Tate Britain, while others will be on display for a limited time.

The 4 featured installations include: Martin Boyce's word installation outside Tate Britain; Richard Wright's handmade glass and leading for the eastern window in the Millbank foyer, created in collaboration with architects Caruso St John; France-Lise McGurn's Skypark mural; and Jacob Epstein, one of the most influential and controversial figures in 20th-century British sculpture, displayed in the Duveen Galleries.

Free admission, ongoing.`,
  },
  
  'artists-international': {
    name: 'Artists International: The First Decade',
    description: `This display tells the story of the Artists' International Association, from its foundation in 1933 to the mid-point of the Second World War.

In 1933, a group of young, underemployed artists and designers created a new organisation at a time of political and economic crisis. Two years later, after winning the support of Augustus John, Henry Moore, Paul Nash and Laura Knight, they organised Artists against Fascism and War in Soho Square, London.

With a membership nearing 900, the Artists International Association convened the First British Artists Congress in 1937, an event that foreshadowed many elements of official post-war arts policy.

The AIA mounted For Liberty in 1943 on the John Lewis bombsite in Oxford Street. This was an exhibition uniting artists of many aesthetic persuasions behind the call for an imaginative peace.

After the Second World War, the AIA focused on the role artists could play in reconstruction and many of its members subsequently contributed to the 1951 Festival of Britain.

Located in the Archive Gallery. On display until Spring 2026. Free admission.`,
  },
};

async function updateDescriptions() {
  console.log('Starting Tate Britain description updates...\n');
  
  const exhibitionsRef = db.collection('exhibitions');
  
  for (const [slug, data] of Object.entries(updatedDescriptions)) {
    // Try different ID patterns
    const possibleIds = [
      `tate-britain-display-${slug}`,
      `tate-britain-${slug}`,
      slug,
    ];
    
    let found = false;
    
    for (const docId of possibleIds) {
      const docRef = exhibitionsRef.doc(docId);
      const doc = await docRef.get();
      
      if (doc.exists) {
        console.log(`✓ Found: ${docId}`);
        console.log(`  Updating description (${data.description.length} chars)...`);
        
        await docRef.update({
          description: data.description,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        console.log(`  ✓ Updated successfully!\n`);
        found = true;
        break;
      }
    }
    
    if (!found) {
      console.log(`✗ Not found: ${slug}`);
      console.log(`  Tried IDs: ${possibleIds.join(', ')}\n`);
    }
  }
  
  console.log('Done!');
}

// Also try to find all tate-britain related exhibitions
async function listTateExhibitions() {
  console.log('\n--- All Tate Britain exhibitions in Firestore ---\n');
  
  const snapshot = await db.collection('exhibitions').get();
  
  const tateExhibitions = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (doc.id.includes('tate') || (data.name && data.name.toLowerCase().includes('tate'))) {
      tateExhibitions.push({
        id: doc.id,
        name: data.name,
        description: data.description?.substring(0, 80) + '...',
      });
    }
  });
  
  if (tateExhibitions.length === 0) {
    console.log('No Tate exhibitions found in Firestore.');
  } else {
    console.log(`Found ${tateExhibitions.length} Tate exhibitions:\n`);
    tateExhibitions.forEach(e => {
      console.log(`ID: ${e.id}`);
      console.log(`Name: ${e.name}`);
      console.log(`Desc: ${e.description}`);
      console.log('---');
    });
  }
}

async function main() {
  await listTateExhibitions();
  await updateDescriptions();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
