/**
 * Museum Configuration
 * 
 * This file contains the configuration for all museums that can be synced.
 * Each museum has:
 * - id: matches the exhibition ID in exhibitions.js
 * - name: display name
 * - urls: object containing different page URLs (current, past, upcoming)
 * - outputFile: path to the JSON file that will be updated
 * - selectors: CSS selectors for scraping (may need adjustment per site)
 */

export interface MuseumConfig {
    id: string;
    name: string;
    urls: {
        current?: string;
        past?: string;
        upcoming?: string;
    };
    outputFile: string;
    enabled: boolean;
    // Site-specific scraping hints
    scraperType: 'generic' | 'tate' | 'national-gallery' | 'british-museum' | 'vam' | 'npg';
}

export const museums: MuseumConfig[] = [
    // UK Museums
    {
        id: 'national-gallery',
        name: 'National Gallery',
        urls: {
            current: 'https://www.nationalgallery.org.uk/exhibitions',
            past: 'https://www.nationalgallery.org.uk/exhibitions/past',
        },
        outputFile: 'public/data/national-gallery-exhibitions.json',
        enabled: true,
        scraperType: 'national-gallery',
    },
    {
        id: 'tate-modern',
        name: 'Tate Modern',
        urls: {
            current: 'https://www.tate.org.uk/whats-on?gallery=tate-modern',
        },
        outputFile: 'public/data/tate-modern.json',
        enabled: true,
        scraperType: 'tate',
    },
    {
        id: 'tate-britain',
        name: 'Tate Britain',
        urls: {
            current: 'https://www.tate.org.uk/whats-on?gallery=tate-britain',
        },
        outputFile: 'public/data/tate-britain.json',
        enabled: true,
        scraperType: 'tate',
    },
    {
        id: 'british-museum',
        name: 'British Museum',
        urls: {
            current: 'https://www.britishmuseum.org/exhibitions-events',
            past: 'https://www.britishmuseum.org/exhibitions-events/past-exhibitions',
        },
        outputFile: 'public/data/british-museum.json',
        enabled: true,
        scraperType: 'british-museum',
    },
    {
        id: 'vam',
        name: 'Victoria and Albert Museum',
        urls: {
            current: 'https://www.vam.ac.uk/exhibitions',
        },
        outputFile: 'public/data/vam.json',
        enabled: true,
        scraperType: 'vam',
    },
    {
        id: 'national-portrait-gallery',
        name: 'National Portrait Gallery',
        urls: {
            current: 'https://www.npg.org.uk/whatson/exhibitions/',
        },
        outputFile: 'public/data/npg.json',
        enabled: true,
        scraperType: 'npg',
    },
    {
        id: 'science-museum',
        name: 'Science Museum',
        urls: {
            current: 'https://www.sciencemuseum.org.uk/see-and-do',
        },
        outputFile: 'public/data/science-museum.json',
        enabled: false, // Disable for now, needs custom scraper
        scraperType: 'generic',
    },
    // Seoul Museums - currently disabled, need Korean site scrapers
    {
        id: 'seoul-1',
        name: 'MMCA Seoul',
        urls: {
            current: 'https://www.mmca.go.kr/eng/exhibitions/now.do',
        },
        outputFile: 'public/data/mmca-seoul.json',
        enabled: false,
        scraperType: 'generic',
    },
    {
        id: 'seoul-2',
        name: 'Leeum Museum',
        urls: {
            current: 'https://www.lframemuseum.org/exhibitions',
        },
        outputFile: 'public/data/leeum.json',
        enabled: false,
        scraperType: 'generic',
    },
];

// Get only enabled museums
export const enabledMuseums = museums.filter(m => m.enabled);
