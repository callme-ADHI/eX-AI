export interface AccumulatedToolCall {
  id: string;
  name: string;
  argumentsText: string;
  args: Record<string, unknown>;
}

export class ToolCallAccumulator {
  private callsByIndex = new Map<number, { id: string; name: string; argsText: string }>();

  pushDelta(toolCalls: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>) {
    for (const tc of toolCalls) {
      const idx = tc.index;
      let existing = this.callsByIndex.get(idx);
      if (!existing) {
        existing = { id: tc.id || `call_${Date.now()}_${idx}`, name: '', argsText: '' };
        this.callsByIndex.set(idx, existing);
      }
      if (tc.id && (!existing.id || existing.id.startsWith('call_'))) existing.id = tc.id;
      if (tc.function?.name) existing.name += tc.function.name;
      if (tc.function?.arguments) existing.argsText += tc.function.arguments;
    }
  }

  hasCalls(): boolean {
    return this.callsByIndex.size > 0;
  }

  finalize(): AccumulatedToolCall[] {
    const list: AccumulatedToolCall[] = [];
    const sortedIndices = Array.from(this.callsByIndex.keys()).sort((a, b) => a - b);
    for (const idx of sortedIndices) {
      const c = this.callsByIndex.get(idx)!;
      let parsedArgs: Record<string, unknown> = {};
      if (c.argsText.trim()) {
        try {
          parsedArgs = JSON.parse(c.argsText);
        } catch {
          // If JSON parse failed, try fuzzy fix or record raw
          try {
            parsedArgs = JSON.parse(c.argsText + '}');
          } catch {
            parsedArgs = { raw: c.argsText };
          }
        }
      }
      list.push({
        id: c.id,
        name: c.name.trim(),
        argumentsText: c.argsText,
        args: parsedArgs,
      });
    }
    return list;
  }

  reset() {
    this.callsByIndex.clear();
  }
}
