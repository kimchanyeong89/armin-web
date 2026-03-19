
const badTitle = `{{title|nl=De kruisiging met de Heilige Hieronymus en Dominicus; in de achtergrond andere scènes uit de passie|en=The Crucifixion with St Jerome and St Dominic and Scenes from the Passion}}`;
const badTitle2 = `{{title|The Physician}}`;
const badTitle3 = `{{title|es=El médico|de=Der Arzt|en=The Physician}}`;
const mixed = `{{Artwork
 |artist             = {{Creator:Francisco de Goya y Lucientes}}
 |title              = {{title|es=El médico|de=Der Arzt|en=The Physician}}
 }}`;

function cleanWikiMarkup(text) {
    if (!text) return '';
    let result = text;

    // Remove comments
    result = result.replace(/<!--[\s\S]*?-->/g, '');

    // ----------------------------------------
    // Special Handlers for Complex Templates
    // ----------------------------------------

    // Helper to parse {{Title|...}} or {{Label|...}}
    // Handles multi-lingual content like |en=... |de=...
    const parseMultiLangTemplate = (templateName) => {
        const regex = new RegExp(`{{${templateName}\\|([\\s\\S]*?)}}`, 'gi');
        result = result.replace(regex, (match, content) => {
            // content is "nl=A|en=B" or "Simple Title"

            // 1. Try English explicitly
            const enMatch = content.match(/\|en\s*=\s*([^|{}]+)/i);
            if (enMatch) return enMatch[1].trim();

            // 2. Try simple positional (no equals signs)
            if (!content.includes('=')) {
                // Return the whole thing (or split by pipe if multiple args?)
                // {{title|A}} -> A
                return content.replace(/^\|/, '').trim();
            }

            // 3. Fallback: Take the last specified language (often English is last) 
            // or the first one? Wikipedia order varies.
            // Let's look for ANY quoted string which is often the title in QS? No, this is template.

            // Let's just strip the keys: |xx=Value -> Value
            // "nl=Dutch|en=English"
            const parts = content.split('|');
            for (let part of parts) {
                if (part.includes('=')) {
                    // key=value
                    const [key, val] = part.split('=');
                    // Maybe check key is 'en' again (covered above) or just take it as candidate
                    if (val && val.length > 2) return val.trim();
                } else if (part.trim().length > 0) {
                    return part.trim();
                }
            }
            return ''; // Fail
        });
    };

    if (result.match(/{{title/i)) parseMultiLangTemplate('title');
    if (result.match(/{{label/i)) parseMultiLangTemplate('label');
    if (result.match(/{{object type/i)) parseMultiLangTemplate('object type');

    // ----------------------------------------
    // Standard Cleanup
    // ----------------------------------------

    // Remove remaining templates iteratively
    let prev;
    let loops = 0;
    do {
        prev = result;
        loops++;
        if (loops > 20) break;

        // {{en|Text}}
        result = result.replace(/{{[a-z]{2,3}\|(?:1=)?(.*?)}}/gi, '$1');

        // {{Creator:Name}}
        result = result.replace(/{{Creator:([^}|]+)(?:\|[^}]+)?}}/gi, '$1');

        // {{Technique|Oil|Canvas}}
        result = result.replace(/{{Technique\|([^}|]+)(?:\|([^}|]+))?.*}}/i, '$1 $2');

        // {{Size|cm|96|121}}
        if (result.match(/{{Size/i)) {
            result = result.replace(/{{Size\|(\w+)\|([^|]+)\|([^|]+)(?:\|.*)?}}/i, '$2 x $3 $1');
        }

        // Generic {{A|B}} -> B
        result = result.replace(/{{[^|{}]+\|([^|{}]+)}}/g, '$1');

        // {{A}} -> A
        result = result.replace(/{{([^|{}]+)}}/g, '$1');

        // Links
        result = result.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1');

    } while (result !== prev && (result.includes('{{') || result.includes('[[')));

    // Final scrub
    result = result.replace(/<[^>]+>/g, '');
    result = result.replace(/lang=[a-z]{2,3}\s*/gi, '');
    result = result.replace(/1=/g, '');
    result = result.replace(/''/g, '');
    result = result.replace(/{{/g, '').replace(/}}/g, ''); // Artifacts

    return result.replace(/\s+/g, ' ').trim();
}

console.log("Bad1:", cleanWikiMarkup(badTitle));
console.log("Bad2:", cleanWikiMarkup(badTitle2));
console.log("Bad3:", cleanWikiMarkup(badTitle3));
