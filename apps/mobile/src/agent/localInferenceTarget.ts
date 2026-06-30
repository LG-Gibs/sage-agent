import {
  createLocalTarget,
  type InferenceTarget,
  type LocalGenerate,
} from '@sage/core';
import { defaultToolRegistry } from '@sage/tool-registry';
import type { InstalledModel, Message, ToolName } from '@sage/shared-types';
import { createLlamaEngine } from '../inference/localEngine';

/**
 * Wraps the on-device llama.cpp engine as a ReActLoop InferenceTarget. The
 * engine is loaded lazily and kept warm across cycles. Tool calls are parsed
 * from the model's <tool_call>{…}</tool_call> convention by createLocalTarget.
 */
export function createLocalInferenceTarget(model: InstalledModel): InferenceTarget {
  const engine = createLlamaEngine();
  let loaded = false;

  const generate: LocalGenerate = async (req, onToken, signal) => {
    if (!loaded) {
      await engine.load(model);
      loaded = true;
    }
    await engine.complete(toGemmaPrompt(req.messages), (tok) => {
      if (!signal.aborted) onToken(tok);
    });
    return { stopReason: 'stop' };
  };

  return createLocalTarget(generate, {
    domainOf: (name) => {
      try {
        return defaultToolRegistry.domainOf(name as ToolName);
      } catch {
        return 'mobile';
      }
    },
  });
}

function toGemmaPrompt(messages: Message[]): string {
  let out = '';
  for (const m of messages) {
    if (m.role === 'system') out = `${m.content}\n\n${out}`;
    else if (m.role === 'user') out += `<start_of_turn>user\n${m.content}<end_of_turn>\n`;
    else if (m.role === 'assistant') out += `<start_of_turn>model\n${m.content}<end_of_turn>\n`;
    else if (m.role === 'tool')
      out += `<start_of_turn>user\n[tool:${m.name} result] ${m.content}<end_of_turn>\n`;
  }
  return `${out}<start_of_turn>model\n`;
}
