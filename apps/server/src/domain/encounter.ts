import type { Choice, GameState, Proposal } from '../../../../packages/shared/src/contracts.js';
import { choices } from '../../../../packages/shared/src/contracts.js';
import { newCampaign, outcome, resolveOutcome } from './campaign.js';
export const initialState = (): GameState => ({
  campaign: newCampaign(),
  revision: 0,
  partyLevel: 3,
  partyHealth: 70,
  maxPartyHealth: 100,
  threat: 0,
  maxThreat: 60,
  round: 0,
  activeEffects: [],
  cooldowns: {},
});
export function budget(s: GameState) {
  const health = (s.partyHealth / s.maxPartyHealth) * 100;
  const reservations = s.activeEffects.reduce((n, e) => n + e.reservation, 0);
  return {
    health,
    reservations,
    available: Math.max(
      10,
      Math.min(100, Math.round(60 * (0.5 + health / 200) + 5 * (s.partyLevel - 3) - reservations)),
    ),
  };
}
const tiers: Record<Choice, { name: string; cost: number }[]> = {
  a: [
    { name: 'Ancient guardian', cost: 52 },
    { name: 'Fractured guardian · stagger on impact', cost: 35 },
    { name: 'Dormant sentinel · one strike', cost: 10 },
  ],
  b: [
    { name: 'Choking veil', cost: 30 },
    { name: 'Drifting mist', cost: 18 },
    { name: 'Fading wisp', cost: 10 },
  ],
  c: [
    { name: 'Sealed treasure chamber', cost: 15 },
    { name: 'Weathered cache', cost: 10 },
  ],
};
export function propose(s: GameState, choice: Choice, id: string): Proposal {
  const b = budget(s);
  const option = choices.find((x) => x.id === choice)!;
  const blocked =
    (s.cooldowns[choice] ?? 0) > s.round ||
    s.activeEffects.some((e) => e.id === choice) ||
    (choice === 'b' && s.activeEffects.some((e) => e.id === 'a')) ||
    (choice === 'a' && s.activeEffects.some((e) => e.id === 'b'));
  const tier = blocked ? undefined : tiers[choice].find((t) => t.cost <= b.available);
  const consequences = outcome(s, choice, tier?.cost ?? 0);
  return {
    outcome: consequences,
    id,
    choice,
    name: tier ? option.short : 'A moment of respite',
    variant: tier?.name ?? 'Safe alternative · no added threat',
    cost: tier?.cost ?? 0,
    budget: b.available,
    baseCost: option.cost,
    expectedRevision: s.revision,
    status: 'pending',
    effect: tier
      ? {
          id: choice,
          name: option.short,
          reservation: Math.ceil(tier.cost / 4),
          expires: s.round + 2,
        }
      : null,
    explanation: [
      consequences.summary,
      `Health ${Math.round(b.health)}% · party level ${s.partyLevel} · reserved threat ${b.reservations}.`,
      `B = clamp(round(60 × (0.5 + ${b.health}/200) + 5 × (${s.partyLevel} − 3) − ${b.reservations}), 10, 100) = ${b.available}.`,
      blocked
        ? 'Cooldown or incompatible active effect: use safe respite.'
        : tier
          ? `Strongest legal variant: ${tier.cost} ≤ ${b.available} available threat.`
          : 'No legal variant fits; no threat is added.',
    ],
  };
}
export function applyProposal(s: GameState, p: Proposal): GameState {
  if (p.expectedRevision !== s.revision) throw new Error('Stale state revision');
  if (p.cost > budget(s).available || p.cost < 0) throw new Error('Invalid threat cost');
  const legal = propose(s, p.choice, p.id);
  if (legal.cost !== p.cost || JSON.stringify(legal.effect) !== JSON.stringify(p.effect))
    throw new Error('Encounter rules changed; reset voting to create a fresh proposal');
  const resolved = resolveOutcome(s, outcome(s, p.choice, p.cost), p.cost);
  return {
    ...resolved,
    revision: s.revision + 1,
    threat: p.cost,
    maxThreat: p.budget,
    activeEffects: p.effect ? [...s.activeEffects, p.effect] : s.activeEffects,
    cooldowns: p.effect ? { ...s.cooldowns, [p.choice]: s.round + 2 } : { ...s.cooldowns },
  };
}
