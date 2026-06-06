import { describe, it, expect } from 'vitest';
import {
  normalizeArtworkIdForFirestore,
  buildLikedIdSet,
  toggleIdInSet,
  isIdInSet,
} from './useLikedArtworkSet';

// Minimal stand-in for a Firestore QueryDocumentSnapshot.
const doc = (id: string, data: Record<string, unknown> = {}) => ({ id, data: () => data });

describe('normalizeArtworkIdForFirestore', () => {
  it('replaces every "/" with "__" (Firestore forbids "/" in doc ids)', () => {
    expect(normalizeArtworkIdForFirestore('met/2024/123')).toBe('met__2024__123');
  });
  it('trims surrounding whitespace', () => {
    expect(normalizeArtworkIdForFirestore('  abc  ')).toBe('abc');
  });
  it('coerces non-string / nullish input to a string', () => {
    expect(normalizeArtworkIdForFirestore(undefined)).toBe('');
    expect(normalizeArtworkIdForFirestore(null)).toBe('');
    expect(normalizeArtworkIdForFirestore(123)).toBe('123');
  });
});

describe('buildLikedIdSet', () => {
  it('adds the doc id and the raw artworkId field', () => {
    const set = buildLikedIdSet([doc('met__1', { artworkId: 'met/1' })]);
    expect(set.has('met__1')).toBe(true); // doc id (== normalized variant)
    expect(set.has('met/1')).toBe(true);  // raw artworkId field
  });
  it('falls back to semanticId when artworkId is absent', () => {
    const set = buildLikedIdSet([doc('abc', { semanticId: 'sem/9' })]);
    expect(set.has('abc')).toBe(true);
    expect(set.has('sem/9')).toBe(true);
    expect(set.has('sem__9')).toBe(true);
  });
  it('ignores docs with no usable id', () => {
    expect(buildLikedIdSet([doc('', {})]).size).toBe(0);
  });
  it('collects ids across multiple docs', () => {
    const set = buildLikedIdSet([
      doc('a', { artworkId: 'a' }),
      doc('b', { artworkId: 'b' }),
    ]);
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(true);
  });
});

describe('toggleIdInSet', () => {
  it('adds the raw + Firestore-safe ids when liked=true', () => {
    const next = toggleIdInSet(new Set(), 'a/b', true);
    expect(next.has('a/b')).toBe(true);
    expect(next.has('a__b')).toBe(true);
  });
  it('removes the raw + Firestore-safe ids when liked=false', () => {
    const next = toggleIdInSet(new Set(['a/b', 'a__b']), 'a/b', false);
    expect(next.has('a/b')).toBe(false);
    expect(next.has('a__b')).toBe(false);
  });
  it('does not mutate the input set', () => {
    const original = new Set<string>();
    toggleIdInSet(original, 'x/y', true);
    expect(original.size).toBe(0);
  });
  it('round-trips: like then unlike returns to the original', () => {
    const liked = toggleIdInSet(new Set(), 'x/y', true);
    const unliked = toggleIdInSet(liked, 'x/y', false);
    expect(unliked.size).toBe(0);
  });
});

describe('isIdInSet', () => {
  it('matches the raw id', () => {
    expect(isIdInSet(new Set(['met/1']), 'met/1')).toBe(true);
  });
  it('matches when only the normalized variant is stored', () => {
    expect(isIdInSet(new Set(['a__b']), 'a/b')).toBe(true);
  });
  it('returns false for an id that is not liked', () => {
    expect(isIdInSet(new Set(['met__1']), 'other/99')).toBe(false);
  });
  it('returns false for empty / nullish ids', () => {
    const set = new Set(['met__1']);
    expect(isIdInSet(set, '')).toBe(false);
    expect(isIdInSet(set, null)).toBe(false);
    expect(isIdInSet(set, undefined)).toBe(false);
  });
});
