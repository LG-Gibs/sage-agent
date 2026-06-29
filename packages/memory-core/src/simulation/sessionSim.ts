import type { MemoryManager } from '../lifecycle';

export interface SimTask {
  query: string;
  /** Intrinsically needs the cloud (novel/web research), regardless of memory. */
  needsCloud: boolean;
}

export interface SessionSimResult {
  sessions: number;
  totalTasks: number;
  localCompletions: number;
  cloudEscalations: number;
  localRate: number;
}

/**
 * Simulate full-session task runs against the on-device memory. A task is
 * completed locally when it isn't intrinsically cloud-bound AND local recall
 * returns a sufficiently relevant memory (top score ≥ threshold). Models the
 * Phase 5 criterion: with a memory-rich device, ≥80% of tasks complete without
 * cloud escalation.
 */
export async function simulateSessions(
  manager: MemoryManager,
  sessions: SimTask[][],
  opts: { hitThreshold?: number } = {},
): Promise<SessionSimResult> {
  const threshold = opts.hitThreshold ?? 0.2;
  let total = 0;
  let local = 0;
  let cloud = 0;

  for (const session of sessions) {
    for (const task of session) {
      total += 1;
      if (task.needsCloud) {
        cloud += 1;
        continue;
      }
      const hits = await manager.recall(task.query, 3);
      const top = hits[0]?.score ?? 0;
      if (top >= threshold) local += 1;
      else cloud += 1;
    }
  }

  return {
    sessions: sessions.length,
    totalTasks: total,
    localCompletions: local,
    cloudEscalations: cloud,
    localRate: total ? local / total : 0,
  };
}

/**
 * A deterministic demo scenario: a personal-knowledge corpus plus sessions of
 * tasks. ~17% are intrinsically cloud-bound (web research); the rest paraphrase
 * seeded topics and are answerable from local memory.
 */
export function generateDemoScenario(): { corpus: string[]; sessions: SimTask[][] } {
  const corpus = [
    'The daily standup meeting is scheduled for 9am every weekday.',
    'My manager is Maya Chen and she prefers concise email updates.',
    'The Q3 product launch deadline is the fifteenth of September.',
    'My usual coffee order is a flat white with oat milk.',
    'The office wifi password is stored in the shared vault under network.',
    'I go to the gym on Monday Wednesday and Friday mornings.',
    'The staging server deploys automatically from the main branch.',
    'My passport number and travel documents are in the secure folder.',
    'The team retro happens on the last Friday of every sprint.',
    'Our primary database is Postgres hosted on the production cluster.',
  ];

  const local = (query: string): SimTask => ({ query, needsCloud: false });
  const cloud = (query: string): SimTask => ({ query, needsCloud: true });

  const sessions: SimTask[][] = [
    [
      local('what time is the daily standup meeting'),
      local('who is my manager and how does she like updates'),
      local('when is the gym this week'),
      cloud('latest competitor pricing news this morning'),
      local('what is my usual coffee order'),
    ],
    [
      local('when is the Q3 product launch deadline'),
      local('how does the staging server deploy'),
      local('what database do we use in production'),
      local('when is the team retro this sprint'),
    ],
    [
      local('where are my travel documents stored'),
      local('what is the office wifi password location'),
      cloud('summarize the newest research papers on on-device LLMs'),
      local('what days do I go to the gym'),
    ],
    [
      local('remind me about the standup time'),
      local('manager email preference'),
      local('production database details'),
      local('Q3 launch deadline date'),
    ],
  ];

  return { corpus, sessions };
}
