import { LIMITS } from '../../shared/constants';
import type { PortMessageOut } from '../../shared/aiTypes';
import { streamOnce, type StreamOnceResult } from './nvidiaClient';

export interface ToolLoopOptions {
  model: string;
  apiMessages: any[];
  think: boolean;
  apiKey: string;
  abortSignal: AbortSignal;
  sendMsg: (msg: PortMessageOut) => void;
  waitForToolResult: (id: string) => Promise<{ ok: boolean; content: string }>;
}

export async function runToolLoop(options: ToolLoopOptions): Promise<void> {
  const { model, apiMessages, think, apiKey, abortSignal, sendMsg, waitForToolResult } = options;

  let totalToolCalls = 0;
  let totalToolResultChars = 0;
  let round = 0;

  while (round < LIMITS.maxToolRounds) {
    round++;
    if (abortSignal.aborted) return;

    let turnDelta = '';
    let turnReasoning = '';

    const result: StreamOnceResult = await streamOnce({
      model,
      apiMessages,
      think,
      apiKey,
      tools: true,
      abortSignal,
      onReasoning: (text) => {
        turnReasoning += text;
        sendMsg({ type: 'REASONING', text });
      },
      onDelta: (text) => {
        turnDelta += text;
        sendMsg({ type: 'DELTA', text });
      },
    });

    if (abortSignal.aborted) return;

    if (result.finishReason !== 'tool_calls' || !result.toolCalls || result.toolCalls.length === 0) {
      // Normal completion
      sendMsg({
        type: 'DONE',
        finishReason: result.finishReason || 'stop',
        usage: result.usage,
      });
      return;
    }

    // Model called tools
    const toolCallsToExecute = result.toolCalls.slice(0, LIMITS.maxToolCallsPerTurn - totalToolCalls);

    // Append the assistant message with tool_calls to the conversation history
    apiMessages.push({
      role: 'assistant',
      content: result.content || null,
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: tc.argumentsText,
        },
      })),
    });

    if (toolCallsToExecute.length === 0) {
      // Reached tool calls limit per turn
      apiMessages.push({
        role: 'user',
        content: 'Maximum tool calls per turn reached. Please answer with the information you have.',
      });
      continue;
    }

    for (const tc of toolCallsToExecute) {
      if (abortSignal.aborted) return;
      totalToolCalls++;

      // Dispatch TOOL_CALL to content script
      sendMsg({
        type: 'TOOL_CALL',
        id: tc.id,
        name: tc.name,
        args: tc.args,
      });

      // Await TOOL_RESULT from content script
      let toolRes: { ok: boolean; content: string };
      try {
        toolRes = await waitForToolResult(tc.id);
      } catch (err: any) {
        toolRes = {
          ok: false,
          content: `<tool_result name="${tc.name}" untrusted="true">Error: ${err.message || 'Tool call timed out'}</tool_result>`,
        };
      }

      // Check tool budget cap
      let content = toolRes.content;
      if (totalToolResultChars + content.length > LIMITS.toolBudgetPerTurnChars) {
        const remainingBudget = Math.max(0, LIMITS.toolBudgetPerTurnChars - totalToolResultChars);
        content = content.slice(0, remainingBudget) + '\n[Tool output truncated due to budget limit]';
      }
      totalToolResultChars += content.length;

      // Append tool message in OpenAI standard format
      apiMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content,
      });
    }
  }

  // If reached max rounds, ask for final answer
  if (!abortSignal.aborted) {
    const finalResult = await streamOnce({
      model,
      apiMessages,
      think,
      apiKey,
      tools: false,
      abortSignal,
      onReasoning: (text) => sendMsg({ type: 'REASONING', text }),
      onDelta: (text) => sendMsg({ type: 'DELTA', text }),
    });

    sendMsg({
      type: 'DONE',
      finishReason: finalResult.finishReason || 'stop',
      usage: finalResult.usage,
    });
  }
}
