import { describe, it, expect } from 'vitest';
import { worksByArtist, buildIndex } from './collection-index';

describe('collection index', () => {
  it('builds without error', async () => {
    const idx = await buildIndex();
    expect(idx.artistCount).toBeGreaterThan(100);
    expect(idx.workCount).toBeGreaterThan(1000);
  }, 30000);

  it('finds works by an artist that exists in many collections', async () => {
    const works = await worksByArtist('Claude Monet');
    expect(works.length).toBeGreaterThan(0);
    expect(works[0].artist.toLowerCase()).toContain('monet');
    expect(works[0].source_collection).toBeTruthy();
    expect(works[0].image_url).toBeTruthy();
  }, 30000);
});
