const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/data/masp-collection.json');
let data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

const translations = {
    'Frasco': 'Vessel',
    'Cesto': 'Basket',
    'Vestido': 'Dress',
    'Traje': 'Costume',
    'Trage': 'Costume',
    'Vídeo': 'Video',
    'Camisa': 'Shirt',
    'Macacão': 'Jumpsuit',
    'Afresco': 'Fresco',
    'Cartaz': 'Poster',
    'Tapeçaria': 'Tapestry',
    'Instalação': 'Installation',
    'instalação': 'Installation',
    'Cabana': 'Installation',
    'Capa': 'Cape',
    'Biquini': 'Bikini',
    'Maiô': 'Swimsuit',
    'Fotoinstalação': 'Installation',
    'Colagem': 'Collage',
    'Túnica': 'Tunic',
    'Blazer': 'Blazer',
    'Saia': 'Skirt',
    'Casaco': 'Coat',
    'Assemblage': 'Sculpture',
    'Instalação| performance': 'Installation',
    'Blusa': 'Blouse',
    'Adesivo auto-colante': 'Sticker',
    'Adesivo': 'Sticker',
    'Cartão postal': 'Postcard',
    'Díptico (cartaz)': 'Poster',
    'Sacola': 'Bag',
    'Recorte de jornal': 'Drawing',
    'Díptico (fotografia)': 'Photography',
    'Múltiplo (fotografia)': 'Photography',
    'Tríptico (fotografia)': 'Photography',
    'Luminária': 'Lamp',
    'Bandeira': 'Flag',
    'Tecido': 'Textile',
    'Fotografia\\Díptico': 'Photography',
    'Pintura\\Díptico': 'Painting',
    'Fotografia\\Díptico (fotografia)': 'Photography',
    'Fotografia\\Tríptico (fotografia)': 'Photography',
    'Radiografia': 'Photography',
    'Fotografia\\Múltiplo (fotografia)': 'Photography',
    'Garrafa': 'Bottle',
    'Díptico (pintura)': 'Painting',
    'Álbum': 'Album',
    'Narigueira/Brinco': 'Jewelry',
    'Narigueira': 'Jewelry',
    'Vaso': 'Vase',
    'Calça': 'Pants',
    'Shorts': 'Shorts',
    'Caderno de desenhos': 'Drawing',
    'Prato': 'Plate',
    'Jarro': 'Jar',
    'Pintura tumular': 'Painting',
    'Estatueta': 'Sculpture',
    'Relicário': 'Sculpture',
    'Fragmento': 'Fragment',
    'Fivela de arreio': 'Metalwork',
    'Porta-perfume': 'Vessel',
    'Sarcófago': 'Sculpture',
    'Concha': 'Shell',
    'Cálice': 'Chalice',
    'Copo': 'Cup',
    'Capa de livro': 'Book Cover',
    'Máscara': 'Mask',
    'Cantil': 'Vessel',
    'Boneco': 'Doll',
    'Tríptico (pintura)': 'Painting',
    'Assemblage\\Relógio de pulso': 'Watch',
    'Álbum de gravuras': 'Print',
    'Pintura': 'Painting',
    'Desenho': 'Drawing',
    'Escultura': 'Sculpture',
    'Fotografia': 'Photography',
    'Gravura': 'Print'
};

data = data.map(item => {
    let cat = item.category.trim();
    if (translations[cat]) {
        item.category = translations[cat];
    } else if (cat.startsWith('Fotografia')) {
        item.category = 'Photography';
    } else if (cat.startsWith('Pintura')) {
        item.category = 'Painting';
    } else if (cat.startsWith('Díptico') || cat.startsWith('Tríptico')) {
        item.category = 'Painting';
    }
    return item;
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
console.log('MASP categories updated with English translations.');
