import { describe, it, expect } from 'vitest';
import { scoreWorkForPersona } from './persona-scorer';
import { loadPersonas } from '../personas';

describe('persona scorer', () => {
  it('scores a Vermeer interior higher for Yuna than for Anika', async () => {
    const personas = await loadPersonas();
    const vermeer = {
      artwork_ref: 'aic-collection#9',
      source_collection: 'aic-collection',
      artist: 'Johannes Vermeer',
      title: 'Woman Reading a Letter',
      year: '1663',
      image_url: 'x',
      source_url: 'x',
      medium: 'Oil on canvas',
      category: 'Painting',
    };
    const yuna = scoreWorkForPersona(vermeer, personas['yuna-choi']);
    const anika = scoreWorkForPersona(vermeer, personas['anika-voss']);
    expect(yuna).toBeGreaterThan(anika);
  });
});
