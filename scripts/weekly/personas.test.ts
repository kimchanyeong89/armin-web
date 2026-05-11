import { describe, it, expect } from 'vitest';
import { loadPersonas, PERSONA_IDS } from './personas';

describe('personas', () => {
  it('loads all three personas', async () => {
    const personas = await loadPersonas();
    expect(Object.keys(personas).sort()).toEqual([...PERSONA_IDS].sort());
  });

  it('each persona has taste + tone + lensAffinity', async () => {
    const personas = await loadPersonas();
    for (const id of PERSONA_IDS) {
      const p = personas[id];
      expect(p.taste.eras.length).toBeGreaterThan(0);
      expect(Object.keys(p.taste.regions).length).toBeGreaterThan(0);
      expect(p.taste.themes.length).toBeGreaterThan(0);
      expect(p.lensAffinity.biographical).toBeGreaterThanOrEqual(0);
      expect(p.tone.sample.length).toBeGreaterThan(20);
    }
  });
});
