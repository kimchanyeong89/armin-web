// Inline SVG data-URI used in place of the dead `via.placeholder.com` service.
// Returns a neutral, dark-on-light (or light-on-dark) "No Image" tile that
// renders without any network round-trip and is safe inside <img src="...">.

const PLACEHOLDER_DARK = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 400'>
  <rect width='300' height='400' fill='#1a1a1a'/>
  <g fill='none' stroke='#3a3a3a' stroke-width='1.5'>
    <rect x='90' y='150' width='120' height='84' rx='6'/>
    <circle cx='120' cy='178' r='8'/>
    <path d='M96 224 L138 192 L168 214 L204 178 L204 234 L96 234 Z'/>
  </g>
  <text x='150' y='270' text-anchor='middle' fill='#5a5a5a' font-family='Helvetica, Arial, sans-serif' font-size='13' font-weight='600' letter-spacing='2'>NO IMAGE</text>
</svg>`;

const PLACEHOLDER_LIGHT = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 400'>
  <rect width='300' height='400' fill='#ececec'/>
  <g fill='none' stroke='#bbbbbb' stroke-width='1.5'>
    <rect x='90' y='150' width='120' height='84' rx='6'/>
    <circle cx='120' cy='178' r='8'/>
    <path d='M96 224 L138 192 L168 214 L204 178 L204 234 L96 234 Z'/>
  </g>
  <text x='150' y='270' text-anchor='middle' fill='#888888' font-family='Helvetica, Arial, sans-serif' font-size='13' font-weight='600' letter-spacing='2'>NO IMAGE</text>
</svg>`;

function toDataUri(svg: string): string {
  const minified = svg.replace(/\s+/g, ' ').trim();
  return `data:image/svg+xml;utf8,${encodeURIComponent(minified)}`;
}

export const NO_IMAGE_PLACEHOLDER_DARK = toDataUri(PLACEHOLDER_DARK);
export const NO_IMAGE_PLACEHOLDER_LIGHT = toDataUri(PLACEHOLDER_LIGHT);

export function getNoImagePlaceholder(theme: 'light' | 'dark' = 'dark'): string {
  return theme === 'light' ? NO_IMAGE_PLACEHOLDER_LIGHT : NO_IMAGE_PLACEHOLDER_DARK;
}
