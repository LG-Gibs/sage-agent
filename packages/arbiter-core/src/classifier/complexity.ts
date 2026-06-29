import type { TaskComplexity } from '@sage/shared-types';

/**
 * On-device task-complexity classifier — Phase 0 STUB (Signal 3).
 *
 * A deterministic, network-free heuristic standing in for the eventual tiny
 * local model. It inspects length, code cues, multi-step cues and research
 * verbs to bucket a task as simple / moderate / complex. Pure function: same
 * input always yields the same label, which makes it trivially testable here.
 */
export interface ComplexityFeatures {
  wordCount: number;
  hasCode: boolean;
  multiStep: boolean;
  researchy: boolean;
  /** Number of distinct research-verb hits; >1 signals a heavier task. */
  researchVerbCount: number;
  deepQuestion: boolean;
}

const CODE_CUES = /```|=>|function\s|;\s*$|\bclass\b|\bimport\b|\bconst\b|\bdef\b/m;
const RESEARCH_VERBS =
  /\b(research|analyse|analyze|compare|investigate|synthesi[sz]e|evaluate|benchmark|cite|sources?)\b/gi;
const MULTISTEP_CUES =
  /\b(and then|after that|first.*then|step \d|steps?\b|finally|followed by)\b/i;
const DEEP_QUESTION = /\b(why|how|explain|derive|prove|trade-?offs?)\b/i;

export function extractFeatures(text: string): ComplexityFeatures {
  const trimmed = text.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const numberedList = (trimmed.match(/(^|\n)\s*\d+[.)]/g) ?? []).length >= 2;
  const researchVerbCount = (trimmed.match(RESEARCH_VERBS) ?? []).length;
  return {
    wordCount,
    hasCode: CODE_CUES.test(trimmed),
    multiStep: MULTISTEP_CUES.test(trimmed) || numberedList,
    researchy: researchVerbCount > 0,
    researchVerbCount,
    deepQuestion: DEEP_QUESTION.test(trimmed),
  };
}

export function scoreComplexity(f: ComplexityFeatures): number {
  let score = 0;
  if (f.wordCount > 60) score += 2;
  else if (f.wordCount > 25) score += 1;
  if (f.hasCode) score += 2;
  if (f.researchy) score += 2;
  // Stacking multiple research verbs (research + compare + synthesize ...) is
  // a strong signal of a genuinely complex, multi-stage task.
  if (f.researchVerbCount >= 2) score += 1;
  if (f.multiStep) score += 1;
  if (f.deepQuestion) score += 1;
  return score;
}

export function classifyComplexity(text: string): TaskComplexity {
  const score = scoreComplexity(extractFeatures(text));
  if (score >= 4) return 'complex';
  if (score >= 2) return 'moderate';
  return 'simple';
}
