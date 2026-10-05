// ─── AI Proposals Request Flow ────────────────────────────────────────────────
import { validateProposal, type RawField } from '../../shared/autofillSchema';
import type { FieldHandle, Proposal } from './types';

/** What is sent to the model: questions and option labels only. Never current values. */
export function buildFieldsPayload(fields: FieldHandle[]) {
  return fields.map(h => ({
    id: h.info.id,
    kind: h.info.kind,
    multi: h.info.multi,
    question: h.info.question,
    ...(h.info.options.length ? { options: h.info.options } : {}),
    ...(h.info.maxLength ? { maxLength: h.info.maxLength } : {}),
    ...(h.info.language ? { language: h.info.language } : {}),
  }));
}

/** Batches: up to 8 non-code fields per request; each code field alone. */
export function makeBatches(fields: FieldHandle[]): FieldHandle[][] {
  const code = fields.filter(f => f.info.kind === 'code').map(f => [f]);
  const rest = fields.filter(f => f.info.kind !== 'code');
  const batches: FieldHandle[][] = [];
  for (let i = 0; i < rest.length; i += 8) batches.push(rest.slice(i, i + 8));
  return [...batches, ...code];
}

export async function requestProposals(
  fields: FieldHandle[],
  think: boolean,
  onProgress: (done: number, total: number) => void,
): Promise<{ proposals: Proposal[]; errors: string[] }> {
  const proposals: Proposal[] = [];
  const errors: string[] = [];
  const batches = makeBatches(fields);
  let done = 0;

  for (const batch of batches) {
    const payload = buildFieldsPayload(batch);
    const raw: RawField[] = payload.map(p => ({
      id: p.id,
      kind: p.kind,
      multi: p.multi,
      maxLength: (p as any).maxLength,
      options: (p as any).options ?? [],
    }));
    let text = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await chrome.runtime.sendMessage({
        type: 'AI_JSON_REQUEST',
        purpose: 'autofill',
        user:
          attempt === 0
            ? `FIELDS_JSON:\n${JSON.stringify({ fields: payload })}`
            : `FIELDS_JSON:\n${JSON.stringify({ fields: payload })}\n\nYour previous output was invalid (${
                errors[errors.length - 1] ?? 'unknown'
              }). Return ONLY the JSON object.`,
        think,
        maxTokens: batch[0].info.kind === 'code' ? 8192 : 4096,
      });

      if (!res?.ok) {
        errors.push(res?.error ?? 'AI request failed.');
        break;
      }
      text = res.text;
      const v = validateProposal(text, raw);
      if (v.answers.length || !v.errors.length) {
        proposals.push(
          ...v.answers.map(a => ({
            fieldId: a.fieldId,
            optionIds: a.optionIds,
            text: a.text,
            code: a.code,
            language: a.language,
            confidence: a.confidence,
          })),
        );
        errors.push(...v.errors);
        break;
      }
      errors.push(v.errors[0]);
    }
    onProgress(++done, batches.length);
  }
  return { proposals, errors };
}
