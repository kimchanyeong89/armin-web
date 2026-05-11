import { describe, it, expectTypeOf } from 'vitest';
import type {
  WeeklyProposalFile,
  WeeklyCard,
  WeeklyWork,
  PersonaId,
  LensId,
  TriggerType,
} from './weekly';

describe('weekly types', () => {
  it('PersonaId is the three known personas', () => {
    expectTypeOf<PersonaId>().toEqualTypeOf<'yuna-choi' | 'marco-rinaldi' | 'anika-voss'>();
  });

  it('LensId is the three lenses', () => {
    expectTypeOf<LensId>().toEqualTypeOf<'biographical' | 'thematic' | 'dialogue'>();
  });

  it('a valid card compiles', () => {
    const card: WeeklyCard = {
      id: 'yuna-choi__biographical__test',
      persona_id: 'yuna-choi',
      lens: 'biographical',
      trigger: { type: 'anniversary', value: 'Test Artist · birth 2026-05-11', source: 'artists-dates.json' },
      score: 0.8,
      title_en: 'Title',
      title_ko: '제목',
      intro_en: 'Intro.',
      intro_ko: '인트로.',
      subtitle_chip: '',
      works: [],
      alternates: [],
    };
    expectTypeOf(card).toMatchTypeOf<WeeklyCard>();
  });
});
