import { createHash } from 'node:crypto';
import type { Choice } from '../../../../packages/shared/src/contracts.js';
export function parseVote(text: string): Choice | null {
  return (/^!rift\s+([abc])$/i.exec(text.trim())?.[1].toLowerCase() as Choice) || null;
}
export function winner(tally: Record<Choice, number>, seed: string): Choice | null {
  const max = Math.max(...Object.values(tally));
  if (!max) return null;
  const tied = (Object.keys(tally) as Choice[]).filter((k) => tally[k] === max);
  return tied[createHash('sha256').update(seed).digest().readUInt32BE(0) % tied.length];
}
