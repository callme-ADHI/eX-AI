// ─── Autofill Schema & JSON Extraction ─────────────────────────────────────────

export interface RawField {
  id: string;
  kind: string;
  multi: boolean;
  maxLength?: number;
  options: { id: string }[];
}

/** Remove <think>…</think> and fences, then return the first balanced JSON object text (string-aware). */
export function extractJson(text: string): string | null {
  const s = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

export interface ProposalOut {
  fieldId: string;
  optionIds?: string[];
  text?: string;
  code?: string;
  language?: string;
  confidence: number;
}

export function validateProposal(
  rawText: string,
  fields: RawField[],
): { answers: ProposalOut[]; errors: string[] } {
  const errors: string[] = [];
  const j = extractJson(rawText);
  if (!j) return { answers: [], errors: ['No JSON object found in the model output.'] };
  let data: any;
  try {
    data = JSON.parse(j);
  } catch {
    return { answers: [], errors: ['JSON could not be parsed.'] };
  }
  if (!data || !Array.isArray(data.answers))
    return { answers: [], errors: ['Missing "answers" array.'] };

  const byId = new Map(fields.map(f => [f.id, f]));
  const seen = new Set<string>();
  const answers: ProposalOut[] = [];
  for (const a of data.answers) {
    const f = byId.get(String(a?.field_id));
    if (!f) {
      errors.push(`Unknown field_id: ${String(a?.field_id)}`);
      continue;
    }
    if (seen.has(f.id)) {
      errors.push(`Duplicate answer for ${f.id} ignored.`);
      continue;
    }
    seen.add(f.id);
    const conf =
      typeof a.confidence === 'number' && a.confidence >= 0 && a.confidence <= 1
        ? a.confidence
        : 0.5;
    if (f.kind === 'choice') {
      const known = new Set(f.options.map(o => o.id));
      const ids: string[] = Array.isArray(a.option_ids)
        ? (Array.from(new Set(a.option_ids.map(String))) as string[])
        : [];
      const bad = ids.filter(i => !known.has(i));
      if (bad.length) {
        errors.push(`${f.id}: unknown option ids ${bad.join(',')}`);
        continue;
      }
      if (!f.multi && ids.length > 1) {
        errors.push(`${f.id}: multiple options for a single-answer question`);
        continue;
      }
      answers.push({ fieldId: f.id, optionIds: ids, confidence: conf });
    } else if (f.kind === 'code') {
      const code = typeof a.code === 'string' ? a.code : '';
      if (code.length > 20000) {
        errors.push(`${f.id}: code too long`);
        continue;
      }
      answers.push({
        fieldId: f.id,
        code,
        language: typeof a.language === 'string' ? a.language.slice(0, 30) : undefined,
        confidence: conf,
      });
    } else {
      // text | longtext | select
      let text = typeof a.text === 'string' ? a.text : '';
      const max = f.maxLength ?? 2000;
      if (text.length > max) text = text.slice(0, max);
      answers.push({ fieldId: f.id, text, confidence: conf });
    }
  }
  return { answers, errors };
}
