import type {
  Campaign,
  Choice,
  EncounterOutcome,
  GameState,
} from '../../../../packages/shared/src/contracts.js';

export const newCampaign = (): Campaign => ({
  experience: 0,
  gold: 0,
  potions: 1,
  armor: 0,
  encounters: 0,
  rescues: 0,
});

// Pure, deterministic previews: approval never rerolls the promised consequences.
export function outcome(s: GameState, choice: Choice, cost: number): EncounterOutcome {
  const c = s.campaign ?? newCampaign();
  const result: EncounterOutcome = {
    damage: 0,
    healing: 0,
    gold: 0,
    experience: 0,
    armor: 0,
    potions: 0,
    rescued: false,
    summary: '',
  };
  if (cost === 0) {
    result.healing = Math.min(12, s.maxPartyHealth - s.partyHealth);
    result.summary = `Respite restores ${result.healing} health. No loot or experience; cooldowns are not extended.`;
    return result;
  }
  const raw = choice === 'a' ? Math.ceil(cost / 2) : choice === 'b' ? Math.ceil(cost / 3) : 0;
  result.damage = Math.min(
    s.partyHealth,
    Math.max(0, raw - (choice === 'b' ? Math.floor(c.armor / 2) : c.armor)),
  );
  result.experience = choice === 'c' ? 10 : cost;
  result.gold =
    choice === 'a' ? Math.ceil(cost / 2) : choice === 'b' ? Math.ceil(cost / 3) : cost * 2;
  if (choice === 'c') {
    result.healing = Math.min(15, s.maxPartyHealth - s.partyHealth);
    result.armor = Math.min(2, 10 - c.armor);
    result.potions = c.potions < 3 ? 1 : 0;
  }
  if (s.partyHealth - result.damage <= 0) {
    result.rescued = true;
    result.healing = Math.min(25, s.maxPartyHealth);
    result.potions = c.potions > 0 ? -1 : 0;
    result.gold = c.potions > 0 ? 0 : -Math.min(c.gold, 15);
    result.experience = 0;
  }
  result.summary = `${result.damage} damage; ${result.healing} healing; ${result.gold >= 0 ? '+' : ''}${result.gold} gold; +${result.experience} XP; ${result.armor >= 0 ? '+' : ''}${result.armor} armor; ${result.potions >= 0 ? '+' : ''}${result.potions} potions.${result.rescued ? ' Emergency retreat: no victory rewards.' : ''}`;
  return result;
}

export function resolveOutcome(s: GameState, o: EncounterOutcome, cost: number): GameState {
  const c = { ...(s.campaign ?? newCampaign()) };
  c.gold += o.gold;
  c.potions += o.potions;
  c.armor += o.armor;
  c.experience += o.experience;
  if (cost > 0) c.encounters++;
  if (o.rescued) c.rescues++;
  let level = s.partyLevel;
  while (level < 20 && c.experience >= level * 40) {
    c.experience -= level * 40;
    level++;
  }
  return {
    ...s,
    campaign: c,
    partyLevel: level,
    partyHealth: Math.max(0, Math.min(s.maxPartyHealth, s.partyHealth - o.damage + o.healing)),
  };
}
