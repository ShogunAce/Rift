export type Choice = 'a' | 'b' | 'c';
export interface Effect {
  id: string;
  name: string;
  reservation: number;
  expires: number;
}
export interface GameState {
  campaign?: Campaign;
  revision: number;
  partyLevel: number;
  partyHealth: number;
  maxPartyHealth: number;
  threat: number;
  maxThreat: number;
  round: number;
  activeEffects: Effect[];
  cooldowns: Record<string, number>;
}
export interface Campaign {
  experience: number;
  gold: number;
  potions: number;
  armor: number;
  encounters: number;
  rescues: number;
}
export interface EncounterOutcome {
  damage: number;
  healing: number;
  gold: number;
  experience: number;
  armor: number;
  potions: number;
  rescued: boolean;
  summary: string;
}
export interface Proposal {
  outcome?: EncounterOutcome;
  id: string;
  choice: Choice;
  name: string;
  variant: string;
  cost: number;
  budget: number;
  baseCost: number;
  expectedRevision: number;
  explanation: string[];
  effect: Effect | null;
  status: 'pending' | 'approved' | 'rejected';
}
export interface Round {
  pausedAt?: number;
  pausedWindows?: { start: number; end: number }[];
  id: string;
  openedAt: number;
  number: number;
  deadline: number;
  status: 'voting' | 'proposed' | 'approved' | 'rejected' | 'cancelled';
  seed: string;
  tally: Record<Choice, number>;
  proposal: Proposal | null;
  mode: 'live' | 'rehearsal';
}
export interface LedgerEvent {
  id: number;
  at: string;
  type: string;
  detail: Record<string, unknown>;
}
export interface Snapshot {
  sequence: number;
  state: GameState;
  round: Round | null;
  events: LedgerEvent[];
  connection: { status: string; detail: string };
  mode: 'live' | 'rehearsal';
  canRollback: boolean;
}
export const choices = [
  {
    id: 'a' as Choice,
    name: 'Awaken the Stone Golem',
    short: 'Stone Golem',
    cost: 52,
    description: 'Something ancient stirs beneath the temple.',
  },
  {
    id: 'b' as Choice,
    name: 'Release the Cursed Fog',
    short: 'Cursed Fog',
    cost: 30,
    description: 'Let the forgotten corridors breathe again.',
  },
  {
    id: 'c' as Choice,
    name: 'Open the Ancient Vault',
    short: 'Ancient Vault',
    cost: 15,
    description: 'Every treasure has a price. Turn the key.',
  },
];
