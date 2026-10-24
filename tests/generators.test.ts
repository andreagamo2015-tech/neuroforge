import { describe, expect, it } from 'vitest';
import { TASKS, generateValidItem, generateValidTrial, generateItemBlock } from '../src/core/registry';
import { createRng } from '../src/core/rng';
import { checkItemAnswer } from '../src/core/tasks/common';
import type { ItemTask, SequenceTask, SpeededTask, Variant } from '../src/core/types';

const itemTasks = TASKS.filter((t): t is ItemTask => t.kind === 'item');
const seqTasks = TASKS.filter((t): t is SequenceTask => t.kind === 'sequence');
const speedTasks = TASKS.filter((t): t is SpeededTask => t.kind === 'speeded');

describe('Generadores de ítems: validez en todos los niveles', () => {
  for (const task of itemTasks) {
    const variants: Variant[] = task.hasNovel ? ['train', 'novel'] : ['train'];
    for (const variant of variants) {
      it(`${task.id} (${variant})`, () => {
        for (let level = task.minLevel; level <= task.maxLevel; level++) {
          const seen = new Set<string>();
          for (let k = 0; k < 12; k++) {
            const item = generateValidItem(task, level, variant, seen);
            expect(task.validate(item)).toEqual([]);
            seen.add(item.signature);
            // la respuesta correcta se reconoce como correcta
            const r = item.response;
            const correct = r.type === 'choice' ? r.correctIndex : r.type === 'numeric' ? r.answer : r.accept[0];
            expect(checkItemAnswer(item, correct)).toBe(true);
            if (r.type === 'choice') {
              r.options.forEach((_, i) => expect(checkItemAnswer(item, i)).toBe(i === r.correctIndex));
            }
          }
        }
      });
    }
  }

  it('la tasa de ítems generados que fallan la validación es baja y nunca se presentan', () => {
    for (const task of itemTasks) {
      let fails = 0;
      let total = 0;
      for (let s = 1; s <= 40; s++) {
        try {
          const item = task.generate(createRng(s * 7919), 1 + (s % task.maxLevel), 'train');
          total++;
          if (task.validate(item).length) fails++;
        } catch {
          total++;
          fails++;
        }
      }
      expect(fails / total, `${task.id}: ${fails}/${total}`).toBeLessThan(0.6);
    }
  });

  it('los bloques ordenados (jarras) incluyen problemas críticos y de extinción', () => {
    const jugs = itemTasks.find((t) => t.id === 'D-jugs')!;
    const block = generateItemBlock(jugs, 3, 'train', 7, new Set());
    const kinds = block.map((b) => (b.meta as { kind: string }).kind);
    expect(kinds.slice(0, 4).every((k) => k === 'set')).toBe(true);
    expect(kinds).toContain('critical');
    expect(kinds).toContain('extinction');
  });

  it('misma semilla → mismo ítem (reproducibilidad)', () => {
    for (const task of itemTasks) {
      const a = task.generate(createRng(12345), 3, 'train');
      const b = task.generate(createRng(12345), 3, 'train');
      expect(a.signature).toBe(b.signature);
    }
  });
});

describe('Ensayos de memoria', () => {
  for (const task of seqTasks) {
    it(task.id, () => {
      for (let level = task.minLevel; level <= task.maxLevel; level++) {
        const tr = generateValidTrial(task, level, 'train');
        expect(task.validate(tr)).toEqual([]);
        if (tr.recall.type === 'ordered') {
          expect(task.score(tr, tr.recall.answer).correct).toBe(true);
          expect(task.score(tr, tr.recall.answer.slice(1)).correct).toBe(false);
        } else {
          expect(task.score(tr, tr.recall.correctIndex).correct).toBe(true);
        }
      }
    });
  }
  it('el span inverso aumenta de longitud con el nivel', () => {
    const t = seqTasks.find((x) => x.id === 'B-backward')!;
    expect(generateValidTrial(t, 2, 'train').stimuli.length).toBe(3);
    expect(generateValidTrial(t, 6, 'train').stimuli.length).toBe(7);
  });
  it('detecta la respuesta en orden directo como error específico', () => {
    const t = seqTasks.find((x) => x.id === 'B-backward')!;
    const tr = generateValidTrial(t, 4, 'train');
    const s = t.score(tr, tr.stimuli.map((x) => x.text));
    expect(s.correct).toBe(false);
    expect(s.errorTag).toBe('orden-directo');
  });
});

describe('Bloques cronometrados', () => {
  for (const task of speedTasks) {
    it(task.id, () => {
      for (let level = task.minLevel; level <= task.maxLevel; level++) {
        const trials = task.generateBlock(createRng(level * 31), level, 'train');
        expect(trials.length).toBe(task.trialsPerBlock(level));
        const judge = task.createJudge!();
        trials.forEach((tr) => {
          const j = judge(tr, tr.correct || '0');
          expect(typeof j.correct).toBe('boolean');
        });
      }
    });
  }
  it('n-back: los objetivos coinciden exactamente con N posiciones atrás', () => {
    const t = speedTasks.find((x) => x.id === 'B-nback')!;
    for (let level = 1; level <= 8; level++) {
      const trials = t.generateBlock(createRng(level), level, 'train');
      const n = 1 + Math.floor((level - 1) / 2);
      const letters = trials.map((x) => (x.stimulus.type === 'text' ? x.stimulus.text : ''));
      trials.forEach((tr, i) => {
        const isMatch = i >= n && letters[i] === letters[i - n];
        expect(tr.correct === 'si').toBe(isMatch);
      });
    }
  });
});
