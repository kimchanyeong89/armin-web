const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;
const ZERO_WIDTH_RE = /[\u200b-\u200d\u2060\ufeff]/gi;
const SOFT_HYPHEN_RE = /\u00ad/gi;

const MULTI_CHAR_REPLACEMENTS: Record<string, string> = {
  'Æ': 'ae',
  'æ': 'ae',
  'Œ': 'oe',
  'œ': 'oe',
  'ß': 'ss',
  'ẞ': 'ss',
  'Þ': 'th',
  'þ': 'th',
  'Ð': 'd',
  'ð': 'd',
  'Ł': 'l',
  'ł': 'l',
  'Ø': 'o',
  'ø': 'o',
};

const LOOKALIKE_ENTRIES: Array<[string, string[]]> = [
  ['a', ['Α', 'α', 'А', 'а', 'Ꭺ', 'ᗅ', 'ᴀ', 'ꓮ']],
  ['b', ['Β', 'β', 'В', 'в', 'Ᏼ', 'ᗷ', 'ꓐ']],
  ['c', ['Ϲ', 'С', 'с', 'Ꮯ', 'ᑕ', 'ꓚ']],
  ['d', ['Ꭰ', 'ᗞ', 'ԁ', 'Ԁ', 'ꓒ']],
  ['e', ['Ε', 'е', 'Е', 'Ꭼ', 'ꓰ', '℮']],
  ['f', ['Ϝ', 'Ғ', 'ᖴ', 'ꓝ']],
  ['g', ['ɢ', 'Ԍ', 'Ꮐ', 'ꓖ']],
  ['h', ['Η', 'н', 'һ', 'Ꮋ', 'ꓧ']],
  ['i', ['Ι', 'І', 'Ӏ', 'Ꭵ', 'ꓲ']],
  ['j', ['Ј', 'ј', 'Ꭻ', 'ꓙ']],
  ['k', ['Κ', 'κ', 'К', 'к', 'Ꮶ', 'ꓗ']],
  ['l', ['Ꮮ', 'ᒪ', 'ℒ', 'ꓡ', '∣']],
  ['m', ['Μ', 'м', 'Ꮇ', 'ᗰ', 'ꓟ']],
  ['n', ['Ν', 'п', 'Ꮑ', 'ꓠ']],
  ['o', ['Ο', 'ο', 'О', 'о', 'Օ', '၀', 'Ꮎ', 'ꓳ']],
  ['p', ['Ρ', 'ρ', 'Р', 'р', 'Ꮲ', 'ꓑ']],
  ['q', ['ԛ', 'զ', 'ꝗ']],
  ['r', ['ʀ', 'Ꭱ', 'Ꮢ', 'ꓣ']],
  ['s', ['Ѕ', 'ѕ', 'Ꮪ', 'ꓢ']],
  ['t', ['Τ', 'т', 'Ꭲ', 'ꓔ']],
  ['u', ['∪', 'Ս', 'ᑌ', 'ꓴ']],
  ['v', ['Ѵ', 'ν', '∨', 'Ꮙ', 'ꓦ']],
  ['w', ['Ԝ', 'Ꮃ', 'ꓪ']],
  ['x', ['Χ', 'χ', 'Х', 'х', 'ᕁ', 'ꓫ']],
  ['y', ['Υ', 'у', 'Ү', 'Ꭹ', 'ꓬ']],
  ['z', ['Ζ', 'Ꮓ', 'ꓜ']],
  ['0', ['０', '𝟘', '⓪']],
  ['1', ['１', '𝟙', '①']],
  ['2', ['２', '𝟚', '②']],
  ['3', ['３', '𝟛', '③']],
  ['4', ['４', '𝟜', '④']],
  ['5', ['５', '𝟝', '⑤']],
  ['6', ['６', '𝟞', '⑥']],
  ['7', ['７', '𝟟', '⑦']],
  ['8', ['８', '𝟠', '⑧']],
  ['9', ['９', '𝟡', '⑨']],
];

const LOOKALIKE_MAP: Record<string, string> = LOOKALIKE_ENTRIES.reduce((map, [ascii, chars]) => {
  chars.forEach(char => { map[char] = ascii; });
  return map;
}, {} as Record<string, string>);

const collapseWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const mapLookalikes = (value: string): string => {
  let result = '';
  for (const ch of value) {
    if (MULTI_CHAR_REPLACEMENTS[ch]) {
      result += MULTI_CHAR_REPLACEMENTS[ch];
      continue;
    }
    const mapped = LOOKALIKE_MAP[ch];
    if (mapped) {
      result += mapped;
      continue;
    }
    result += ch;
  }
  return result;
};

export const normalizeSearchText = (value?: string): string => {
  if (!value) return '';
  const base = value
    .normalize('NFKD')
    .replace(COMBINING_MARKS_RE, '')
    .replace(ZERO_WIDTH_RE, '')
    .replace(SOFT_HYPHEN_RE, '');

  // Keep letters/numbers across scripts (Korean, CJK, etc.) so non-Latin search works.
  // Convert lookalike Latin/Cyrillic/Greek characters to ASCII where possible.
  const normalized = mapLookalikes(base)
    .replace(/[\u2010-\u2015]/g, '-')
    .toLowerCase();

  const cleaned = normalized
    .replace(/[^\p{L}\p{N}]+/gu, ' ');

  return collapseWhitespace(cleaned);
};

export const normalizeSearchToken = (value?: string): string =>
  normalizeSearchText(value).replace(/[^\p{L}\p{N}]+/gu, '');
