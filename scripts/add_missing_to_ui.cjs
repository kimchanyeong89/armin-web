const missingMuseums = [
  {
    id: "hamburger-kunsthalle-extra",
    slug: "hamburger-kunsthalle",
    name: "Hamburger Kunsthalle",
    location: "Hamburg, Germany",
    description: "One of the largest art museums in Germany, featuring European art from the Middle Ages to the present day.",
    latitude: 53.555,
    longitude: 10.002,
    country: "Germany",
    region: "Hamburg",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/4/4e/Hamburger_Kunsthalle_-_Neubau.jpg",
    permanentExhibitions: [
      { id: "hk-drawings", name: "Drawings", title: "Drawings Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "hamburger-kunsthalle-drawings.json" },
      { id: "hk-video", name: "Video Art", title: "Video Art Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "hamburger-kunsthalle-video.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "mfab",
    slug: "mfab",
    name: "Museum of Fine Arts, Boston",
    location: "Boston, USA",
    description: "The Museum of Fine Arts in Boston, Massachusetts, is the 20th-largest art museum in the world.",
    latitude: 42.3394,
    longitude: -71.0940,
    country: "USA",
    region: "Massachusetts",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/9/91/Museum_of_Fine_Arts_Boston.jpg",
    permanentExhibitions: [
      { id: "mfab-full", name: "Full Collection", title: "MFAB Full Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "mfab-collection-full.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "agnsw-fixed",
    slug: "agnsw-fixed",
    name: "Art Gallery of New South Wales (Complete)",
    location: "Sydney, Australia",
    description: "Complete uncompressed collection mapping for AGNSW",
    latitude: -33.8688,
    longitude: 151.2173,
    country: "Australia",
    region: "New South Wales",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/8/87/Art_Gallery_of_NSW.jpg",
    permanentExhibitions: [
      { id: "agnsw-fixed-exh", name: "Complete Collection", title: "Complete AGNSW Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "agnsw-collection-fixed.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "mamcs-extra",
    slug: "mamcs-extra",
    name: "MAMCS Strasbourg",
    location: "Strasbourg, France",
    description: "Musée d'Art Moderne et Contemporain de Strasbourg",
    latitude: 48.5794,
    longitude: 7.7364,
    country: "France",
    region: "Grand Est",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/3/3d/MAMCS_Strasbourg.jpg",
    permanentExhibitions: [
      { id: "mamcs-full", name: "Full Collection", title: "Full MAMCS Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "mamcs-strasbourg-collection.json" },
      { id: "mamcs-drawings", name: "Drawings", title: "MAMCS Drawings", startDate: "Permanent", endDate: "Permanent", collectionFile: "mamcs-strasbourg-drawings-collection.json" },
      { id: "mamcs-photo", name: "Photography", title: "MAMCS Photography", startDate: "Permanent", endDate: "Permanent", collectionFile: "mamcs-strasbourg-photography-collection.json" },
      { id: "mamcs-paintings", name: "Paintings", title: "MAMCS Paintings", startDate: "Permanent", endDate: "Permanent", collectionFile: "mamcs-strasbourg-paintings-collection.json" },
      { id: "mamcs-graphic", name: "Graphic Design", title: "MAMCS Graphic Design", startDate: "Permanent", endDate: "Permanent", collectionFile: "mamcs-strasbourg-graphic-design-collection.json" },
      { id: "mamcs-small", name: "Selection", title: "MAMCS Selection", startDate: "Permanent", endDate: "Permanent", collectionFile: "mamcs-strasbourg.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "musee-rodin",
    slug: "musee-rodin",
    name: "Musée Rodin",
    location: "Paris, France",
    description: "A museum that was opened in 1919, primarily dedicated to the works of the French sculptor Auguste Rodin.",
    latitude: 48.8553,
    longitude: 2.3158,
    country: "France",
    region: "Ile-de-France",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/2/23/Musee-Rodin-Paris-F1.jpg",
    permanentExhibitions: [
      { id: "rodin-main", name: "Main Collection", title: "Rodin Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "rodin-collection.json" },
      { id: "rodin-sculptures", name: "Sculptures", title: "Rodin Sculptures", startDate: "Permanent", endDate: "Permanent", collectionFile: "rodin-sculptures.json" },
      { id: "rodin-gravures", name: "Engravings", title: "Rodin Gravures", startDate: "Permanent", endDate: "Permanent", collectionFile: "rodin-gravures.json" },
      { id: "rodin-peintures", name: "Paintings", title: "Rodin Peintures", startDate: "Permanent", endDate: "Permanent", collectionFile: "rodin-peintures.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "pompidou-extra",
    slug: "pompidou-extra",
    name: "Centre Pompidou",
    location: "Paris, France",
    description: "The largest museum for modern art in Europe.",
    latitude: 48.8606,
    longitude: 2.3522,
    country: "France",
    region: "Ile-de-France",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/f/fb/Centre_Pompidou_-_Paris.jpg",
    permanentExhibitions: [
      { id: "pompidou-draw", name: "Drawings", title: "Drawing Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "pompidou-drawing-collection.json" },
      { id: "pompidou-media", name: "New Media", title: "New Media Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "pompidou-newmedia-collection.json" },
      { id: "pompidou-design", name: "Design", title: "Design Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "pompidou-design-collection.json" },
      { id: "pompidou-cinema", name: "Cinema", title: "Cinema Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "pompidou-cinema-collection.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "belvedere-museum",
    slug: "belvedere",
    name: "Belvedere Museum",
    location: "Vienna, Austria",
    description: "Austrian gallery featuring Gustav Klimt and national treasures.",
    latitude: 48.1915,
    longitude: 16.3809,
    country: "Austria",
    region: "Vienna",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/1/1a/Wien_-_Schloss_Belvedere.jpg",
    permanentExhibitions: [
      { id: "belvedere-paintings", name: "Paintings Collection", title: "Belvedere Malerei", startDate: "Permanent", endDate: "Permanent", collectionFile: "belvedere-malerei-collection.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "musba-bordeaux",
    slug: "bordeaux",
    name: "Musée des Beaux-Arts de Bordeaux",
    location: "Bordeaux, France",
    description: "The fine arts museum of the city of Bordeaux.",
    latitude: 44.8383,
    longitude: -0.5815,
    country: "France",
    region: "Nouvelle-Aquitaine",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/6/6b/Musee_des_beaux-arts_Bordeaux_1.jpg",
    permanentExhibitions: [
      { id: "bx-main", name: "Main Collection", title: "Bordeaux Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "bordeaux-collection.json" },
      { id: "bx-draw", name: "Drawings", title: "Drawings Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "musba-bordeaux-drawings-collection.json" },
      { id: "bx-paint", name: "Paintings", title: "Paintings Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "musba-bordeaux-paintings-collection.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "vam-extra",
    slug: "vam-extra",
    name: "Victoria and Albert Museum",
    location: "London, UK",
    description: "The world's largest museum of applied arts, decorative arts, and design.",
    latitude: 51.4966,
    longitude: -0.1764,
    country: "UK",
    region: "London",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/c/c5/Victoria_and_Albert_Museum_London.jpg",
    permanentExhibitions: [
      { id: "vam-posters", name: "Posters", title: "VAM Posters", startDate: "Permanent", endDate: "Permanent", collectionFile: "vam-posters.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "musee-conde",
    slug: "musee-conde",
    name: "Musée Condé",
    location: "Chantilly, France",
    description: "A French museum located inside the Château de Chantilly.",
    latitude: 49.1939,
    longitude: 2.4853,
    country: "France",
    region: "Hauts-de-France",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/2/23/Chateau_de_Chantilly_02.jpg",
    permanentExhibitions: [
      { id: "conde-main", name: "Condé Masterpieces", title: "Musee Conde Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "musee-conde-collection.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "picasso-paris",
    slug: "picasso-paris",
    name: "Musée Picasso Paris",
    location: "Paris, France",
    description: "An art gallery located in the Hôtel Salé in rue de Thorigny, Paris.",
    latitude: 48.8596,
    longitude: 2.3627,
    country: "France",
    region: "Ile-de-France",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/2/21/Museum_Picasso.jpg",
    permanentExhibitions: [
      { id: "picasso-main", name: "Picasso Collection", title: "Musée Picasso", startDate: "Permanent", endDate: "Permanent", collectionFile: "picasso-paris-collection.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "lacma-extra",
    slug: "lacma-extra",
    name: "Los Angeles County Museum of Art",
    location: "Los Angeles, USA",
    description: "The largest art museum in the western United States.",
    latitude: 34.0639,
    longitude: -118.3592,
    country: "USA",
    region: "California",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/0/07/Los_Angeles_County_Museum_of_Art_-_Urban_Light.jpg",
    permanentExhibitions: [
      { id: "lacma-jap", name: "Japanese Prints", title: "Japanese Prints", startDate: "Permanent", endDate: "Permanent", collectionFile: "lacma-list-japanese-prints.json" },
      { id: "lacma-drawings51", name: "Drawings 51", title: "Drawings", startDate: "Permanent", endDate: "Permanent", collectionFile: "lacma-list-drawings-51.json" },
      { id: "lacma-onview", name: "On View Highlights", title: "On View", startDate: "Permanent", endDate: "Permanent", collectionFile: "lacma-combined-onview.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "ngl-permanent",
    slug: "ngl-permanent",
    name: "National Gallery London",
    location: "London, UK",
    description: "An art museum in Trafalgar Square.",
    latitude: 51.5089,
    longitude: -0.1283,
    country: "UK",
    region: "London",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/National_Gallery_London_from_Trafalgar_Square.jpg/640px-National_Gallery_London_from_Trafalgar_Square.jpg",
    permanentExhibitions: [
      { id: "ngl-perm", name: "Permanent Collection", title: "Permanent Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "national-gallery-permanent.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "met-extra",
    slug: "met",
    name: "The Metropolitan Museum of Art",
    location: "New York, USA",
    description: "The largest art museum in the Americas.",
    latitude: 40.7794,
    longitude: -73.9632,
    country: "USA",
    region: "New York",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/3/30/Metropolitan_Museum_of_Art_%28The_Met%29_-_Central_Park%2C_NYC.jpg",
    permanentExhibitions: [
      { id: "met-enriched", name: "Enriched On View Paintings", title: "Enriched Selection", startDate: "Permanent", endDate: "Permanent", collectionFile: "met-ny-on-view-paintings-enriched.json" },
      { id: "met-onview", name: "On View", title: "On View Paintings", startDate: "Permanent", endDate: "Permanent", collectionFile: "met-ny-on-view-paintings.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "musee-grenoble",
    slug: "musee-grenoble",
    name: "Musée de Grenoble",
    location: "Grenoble, France",
    description: "A municipal museum of Fine Arts.",
    latitude: 45.1944,
    longitude: 5.7331,
    country: "France",
    region: "Auvergne-Rhône-Alpes",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/b/bd/Musee_de_Grenoble.JPG",
    permanentExhibitions: [
      { id: "gr-main", name: "Main Collection", title: "Grenoble Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "grenoble-collection.json" },
      { id: "gr-pt", name: "Paintings", title: "Paintings", startDate: "Permanent", endDate: "Permanent", collectionFile: "musee-grenoble-paintings-collection.json" },
      { id: "gr-dw", name: "Drawings", title: "Drawings", startDate: "Permanent", endDate: "Permanent", collectionFile: "musee-grenoble-drawings-collection.json" },
      { id: "gr-ph", name: "Photography", title: "Photography", startDate: "Permanent", endDate: "Permanent", collectionFile: "musee-grenoble-photography-collection.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "carnavalet",
    slug: "carnavalet",
    name: "Musée Carnavalet",
    location: "Paris, France",
    description: "The history of Paris museum.",
    latitude: 48.8570,
    longitude: 2.3621,
    country: "France",
    region: "Ile-de-France",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/5/52/Musee_Carnavalet.jpg",
    permanentExhibitions: [
      { id: "car-coll", name: "The Collection", title: "The Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "carnavalet-the-collection.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "musee-armee",
    slug: "musee-armee",
    name: "Musée de l'Armée",
    location: "Paris, France",
    description: "The national military museum of France at Les Invalides.",
    latitude: 48.8569,
    longitude: 2.3128,
    country: "France",
    region: "Ile-de-France",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/3/30/Invalides_Paris.jpg",
    permanentExhibitions: [
      { id: "ar-main", name: "Main Collection", title: "Main Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "musee-armee-collection.json" },
      { id: "ar-draw", name: "Dessins", title: "Drawings", startDate: "Permanent", endDate: "Permanent", collectionFile: "musee-armee-dessin.json" },
      { id: "ar-photo", name: "Photographie", title: "Photography", startDate: "Permanent", endDate: "Permanent", collectionFile: "musee-armee-photographie.json" },
      { id: "ar-paint", name: "Peinture", title: "Paintings", startDate: "Permanent", endDate: "Permanent", collectionFile: "musee-armee-peinture.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "wawel",
    slug: "wawel",
    name: "Wawel Royal Castle",
    location: "Kraków, Poland",
    description: "State art collection of Poland.",
    latitude: 50.0541,
    longitude: 19.9352,
    country: "Poland",
    region: "Lesser Poland",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/6/6b/Wawel_widziany_z_mostu_Debnickiego.jpg",
    permanentExhibitions: [
      { id: "wawel-coll", name: "Royal Collection", title: "Wawel Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "wawel-collection.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "flv",
    slug: "flv",
    name: "Fondation Louis Vuitton",
    location: "Paris, France",
    description: "A French art museum and cultural center.",
    latitude: 48.8767,
    longitude: 2.2633,
    country: "France",
    region: "Ile-de-France",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/c/c9/Fondation_Louis_Vuitton_-_2014-10-23.jpg",
    permanentExhibitions: [
      { id: "flv-coll", name: "FLV Collection", title: "FLV Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "flv-collection.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "mba-lyon",
    slug: "mba-lyon",
    name: "Musée des Beaux-Arts de Lyon",
    location: "Lyon, France",
    description: "One of the largest art museums in France outside Paris.",
    latitude: 45.7675,
    longitude: 4.8335,
    country: "France",
    region: "Auvergne-Rhône-Alpes",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/a/aa/Musee_des_beaux-arts_de_Lyon.jpg",
    permanentExhibitions: [
      { id: "mba-lyon-coll", name: "MBA Lyon Collection", title: "Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "mba-lyon-collection.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "toulouse-lautrec",
    slug: "toulouse-lautrec",
    name: "Musée Toulouse-Lautrec",
    location: "Albi, France",
    description: "An art museum in Albi dedicated to the works of Toulouse-Lautrec.",
    latitude: 43.9288,
    longitude: 2.1436,
    country: "France",
    region: "Occitanie",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/f/fb/Palais_de_la_Berbie.jpg",
    permanentExhibitions: [
      { id: "tl-coll", name: "Toulouse-Lautrec Works", title: "Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "toulouse-lautrec-collection.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "musee-ludwig",
    slug: "musee-ludwig",
    name: "Museum Ludwig",
    location: "Cologne, Germany",
    description: "Museum covering modern art including Pop Art, abstract and surrealism.",
    latitude: 50.9405,
    longitude: 6.9602,
    country: "Germany",
    region: "North Rhine-Westphalia",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/d/de/Museum_Ludwig.jpg",
    permanentExhibitions: [
      { id: "lud-paintings", name: "Paintings Selection", title: "Paintings", startDate: "Permanent", endDate: "Permanent", collectionFile: "museum-ludwig-paintings.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "reina-sofia-clean",
    slug: "reina-sofia-clean",
    name: "Museo Nacional Centro de Arte Reina Sofía",
    location: "Madrid, Spain",
    description: "Spain's national museum of 20th-century art.",
    latitude: 40.4080,
    longitude: -3.6946,
    country: "Spain",
    region: "Madrid",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/2/23/Museo_Nacional_Centro_de_Arte_Reina_Sof%C3%ADa.jpg",
    permanentExhibitions: [
      { id: "rs-clean", name: "Full Cleaned Database", title: "Clean Dataset", startDate: "Permanent", endDate: "Permanent", collectionFile: "reina-sofia-collection-clean.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "rouen-mba",
    slug: "rouen-mba",
    name: "Musée des Beaux-Arts de Rouen",
    location: "Rouen, France",
    description: "Fine arts museum of Rouen.",
    latitude: 49.4447,
    longitude: 1.0945,
    country: "France",
    region: "Normandy",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/e/ec/Musee_Beaux_Arts_Rouen.jpg",
    permanentExhibitions: [
      { id: "rouen-coll", name: "Rouen Collection", title: "Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "rouen-mba-collection.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "lille-pba",
    slug: "lille-pba",
    name: "Palais des Beaux-Arts de Lille",
    location: "Lille, France",
    description: "One of the largest fine arts museums in France.",
    latitude: 50.6300,
    longitude: 3.0631,
    country: "France",
    region: "Hauts-de-France",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/6/69/PBA_Lille_2016.jpg",
    permanentExhibitions: [
      { id: "lille1", name: "Lille Collection", title: "Collection 1", startDate: "Permanent", endDate: "Permanent", collectionFile: "lille-pba-collection.json" },
      { id: "lille2", name: "Palais Collection", title: "Collection 2", startDate: "Permanent", endDate: "Permanent", collectionFile: "palais-beaux-arts-lille-collection.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  },
  {
    id: "kroller-muller-extra",
    slug: "kroller-muller-extra",
    name: "Kröller-Müller Museum",
    location: "Otterlo, Netherlands",
    description: "National art museum and sculpture garden.",
    latitude: 52.0955,
    longitude: 5.8166,
    country: "Netherlands",
    region: "Gelderland",
    representativeImage: "https://upload.wikimedia.org/wikipedia/commons/7/7b/Kroller_Muller_Museum.jpg",
    permanentExhibitions: [
      { id: "km-photo", name: "Photography", title: "Photography", startDate: "Permanent", endDate: "Permanent", collectionFile: "kroller-muller-photography.json" },
      { id: "km-video", name: "Film and Video", title: "Video", startDate: "Permanent", endDate: "Permanent", collectionFile: "kroller-muller-film-video.json" }
    ],
    temporaryExhibitions: [], pastExhibitions: []
  }
];

const fs = require('fs');

let fileContent = fs.readFileSync('src/data/exhibitions.js', 'utf8');
const searchPos = fileContent.lastIndexOf('];');

if (searchPos !== -1) {
  let museumsBlock = missingMuseums.map(mus => JSON.stringify(mus, null, 2).replace(/"([^"]+)":/g, '$1:')).join(',\n  ');
  
  let newContent = fileContent.slice(0, searchPos) + ',\n  ' + museumsBlock + '\n];\n';
  fs.writeFileSync('src/data/exhibitions.js', newContent);
  console.log('Successfully injected ALL missing museums from the Search Index into the UI routing!');
} else {
  console.log('Could not find the end of the exhibitions array (];).');
}
