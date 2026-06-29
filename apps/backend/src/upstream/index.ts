import type { BackendConfig } from '../config';
import { createMockUpstream } from './mock';
import { createOpenAiCompatibleUpstream } from './openaiCompatible';
import type { InferenceUpstream } from './types';

export type { InferenceRequest, InferenceUpstream } from './types';

export function selectUpstream(config: BackendConfig): InferenceUpstream {
  switch (config.provider) {
    case 'mock':
      return createMockUpstream();
    case 'openrouter':
    case 'azure-foundry':
      return createOpenAiCompatibleUpstream(config);
  }
}
