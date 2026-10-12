// Cupcak8 Swap Permission Checker — verifies collection health by probing list()
import { gitlawb } from '../gitlawb';

export type CollectionHealth = {
  name: string;
  requiredVisibility: string;
  reason: string;
  accessible: boolean;
  recordCount: number;
  error?: string;
};

// Collections to verify
const COLLECTIONS = [
  { name: 'ref_profiles', visibility: 'inbox', reason: 'Private referral profiles — wallet addresses protected' },
  { name: 'ref_usernames', visibility: 'authenticated', reason: 'Public username lookup — no wallet addresses' },
  { name: 'ref_rewards', visibility: 'authenticated', reason: 'Reward records — client-side filtered by username' },
  { name: 'ref_volume', visibility: 'authenticated', reason: 'Volume records — client-side filtered by username' },
  { name: 'fee_ledger', visibility: 'owner', reason: 'Internal accounting — builder-only access' },
];

/** Probe each collection to check accessibility from the current client. */
export async function checkAllCollections(): Promise<CollectionHealth[]> {
  const results: CollectionHealth[] = [];

  for (const col of COLLECTIONS) {
    try {
      const collection = gitlawb.db.collection(col.name, { visibility: col.visibility as any });
      const { records } = await collection.list({ limit: 1 });
      results.push({
        name: col.name,
        requiredVisibility: col.visibility,
        reason: col.reason,
        accessible: true,
        recordCount: records.length,
      });
    } catch (err: any) {
      results.push({
        name: col.name,
        requiredVisibility: col.visibility,
        reason: col.reason,
        accessible: false,
        recordCount: 0,
        error: err.message || 'Unknown error',
      });
    }
  }

  return results;
}

/** Get the approval instructions for a collection. */
export function getApprovalInstructions(collectionName: string): string[] {
  const instructions: Record<string, string[]> = {
    ref_usernames: [
      'Open the Gitlawb Data tab in the playground editor.',
      'Find the "ref_usernames" collection in the list.',
      'Click on the collection to open its settings.',
      'Change the visibility from "owner" to "authenticated".',
      'Confirm the change when prompted.',
      'This allows signed-in users to read usernames for referral lookups.',
    ],
    ref_rewards: [
      'Open the Gitlawb Data tab in the playground editor.',
      'Find the "ref_rewards" collection in the list.',
      'Click on the collection to open its settings.',
      'Change the visibility from "owner" to "authenticated".',
      'Confirm the change when prompted.',
      'This allows signed-in users to read their own reward records.',
    ],
    ref_volume: [
      'Open the Gitlawb Data tab in the playground editor.',
      'Find the "ref_volume" collection in the list.',
      'Click on the collection to open its settings.',
      'Change the visibility from "owner" to "authenticated".',
      'Confirm the change when prompted.',
      'This allows signed-in users to read their own volume records.',
    ],
  };
  return instructions[collectionName] || ['No instructions available for this collection.'];
}