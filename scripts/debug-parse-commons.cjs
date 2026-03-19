
const wikitext = `== {{int:filedesc}} ==
{{Artwork
 |artist             = {{Creator:Francisco de Goya y Lucientes}}
 |author             = 
 |title              = {{title|es=El m\u00e9dico|de=Der Arzt|en=The Physician}}
 |description        = 
 |object type        = 
 |date               = {{otherdate|c|1813}}
 |medium             = {{Technique|Oil|Canvas}}
 |dimensions         = {{Size|cm| 96 | 121 }}
 |institution        = {{Institution:National Gallery of Scotland}}
 |department         = 
 |accession number   = 
 |place of creation  = 
 |place of discovery = 
 |object history     = 
 |exhibition history = 
 |credit line        = 
 |inscriptions       = 
 |notes              = 
 |references         = 
 |source             = {{Yorck}}
 |permission         = [http://mail.wikipedia.org/pipermail/wikide-l/2005-April/012195.html]
 |other_versions     = 
 |wikidata           = Q5825884
 |other_fields       = 
}}`;

function extractTemplateParam(wikitext, paramName) {
    const artworkStart = wikitext.search(/{{Artwork/i);
    if (artworkStart === -1) return null;

    let braceCount = 0;
    let endIndex = -1;
    for (let i = artworkStart; i < wikitext.length; i++) {
        if (wikitext[i] === '{' && wikitext[i + 1] === '{') {
            braceCount++;
            i++;
        } else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
            braceCount--;
            i++;
            if (braceCount === 0) {
                endIndex = i;
                break;
            }
        }
    }

    if (endIndex === -1) return null;
    const artworkBlock = wikitext.substring(artworkStart + 9, endIndex);

    // Debug
    // console.log("BLOCK:", artworkBlock);

    // Regex check
    const regex = new RegExp(`\\|\\s*${paramName}\\s*=\\s*`, 'i');
    const match = artworkBlock.match(regex);
    if (!match) return null;

    const startPos = match.index + match[0].length;

    let depth = 0;
    let valEnd = -1;
    for (let i = startPos; i < artworkBlock.length; i++) {
        const char = artworkBlock[i];
        if (char === '{' || char === '[') depth++;
        if (char === '}' || char === ']') depth--;

        if (depth === 0 && char === '|') {
            valEnd = i;
            break;
        }
    }

    if (valEnd === -1) valEnd = artworkBlock.length;

    return artworkBlock.substring(startPos, valEnd).trim();
}

function cleanWikiMarkup(text) {
    if (!text) return '';
    let result = text;

    result = result.replace(/<!--[\s\S]*?-->/g, '');
    result = result.replace(/{{Creator:([^}|]+)(?:\|[^}]+)?}}/gi, '$1');
    result = result.replace(/{{Institution:([^}|]+)(?:\|[^}]+)?}}/gi, '$1');

    if (result.match(/{{title/i)) {
        const en = result.match(/\|en\s*=\s*([^|{}]+)/);
        if (en) {
            result = en[1];
        } else {
            result = result.replace(/{{title\|([^}|]+)(?:\|[^}]+)?}}/i, '$1');
        }
    }

    if (result.match(/{{Technique/i)) {
        result = result.replace(/{{Technique\|([^}|]+)(?:\|([^}|]+))?.*}}/i, '$1 $2');
    }

    if (result.match(/{{Size/i)) {
        // Debug
        console.log("Size match input:", result);
        const sizeMatch = result.match(/{{Size\|(\w+)\|([^|]+)\|([^|]+)(?:\|.*)?}}/i);
        console.log("Size regex match:", sizeMatch);
        if (sizeMatch) {
            result = `${sizeMatch[2].trim()} x ${sizeMatch[3].trim()} ${sizeMatch[1]}`;
        }
    }

    result = result.replace(/{{w\|([^}|]+)}}/gi, '$1');
    result = result.replace(/{{en\|([^}|]+)}}/gi, '$1');
    result = result.replace(/{{[^|}]+\|[^|}]+\|([^}]+)}}/g, '$1');

    // Date special
    if (result.match(/{{otherdate/i)) {
        // {{otherdate|c|1813}}
        // Just extract the year or last param
        const parts = result.split('|');
        if (parts.length > 2) {
            result = parts[2].replace('}}', '');
        }
    }

    result = result.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1');
    result = result.replace(/<[^>]+>/g, '');
    result = result.replace(/\s+/g, ' ').trim();

    return result;
}

const rawTitle = extractTemplateParam(wikitext, 'title');
const rawDims = extractTemplateParam(wikitext, 'dimensions');
const rawDate = extractTemplateParam(wikitext, 'date');
const rawMedium = extractTemplateParam(wikitext, 'medium');

console.log("Extracted Raw Title:", rawTitle);
console.log("Cleaned Title:", cleanWikiMarkup(rawTitle));

console.log("Extracted Raw Dims:", rawDims);
console.log("Cleaned Dims:", cleanWikiMarkup(rawDims));

console.log("Extracted Raw Date:", rawDate);
console.log("Cleaned Date:", cleanWikiMarkup(rawDate));

console.log("Extracted Raw Medium:", rawMedium);
console.log("Cleaned Medium:", cleanWikiMarkup(rawMedium));
