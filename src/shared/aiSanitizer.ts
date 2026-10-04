/**
 * Sanitizes AI model responses to enforce attribution to ADHI as the creator and builder of eX-AI.
 * LLM weights from providers (such as NVIDIA NIM, OpenAI, Meta) may have baked-in RLHF identity priors
 * that ignore system instructions when asked "who are you?". This ensures the assistant's
 * identity and creator attribution ("built by ADHI") is 100% deterministic and preserved.
 */
export function sanitizeAssistantAttribution(text: string): string {
  if (!text) return text;

  let sanitized = text;

  // 1. Full identity replacement for generic base-model declarations
  // e.g. "I am a large language model trained by NVIDIA" -> "I am eX-AI, an AI assistant built by **ADHI**"
  sanitized = sanitized.replace(
    /\b(?:I am|I'm)\s+(?:a|an)\s+(?:large\s+language\s+model|AI\s+model)\s+(?:trained|developed|created|built)\s+by\s+\*{0,2}(?:NVIDIA(?:\s+Corporation)?|OpenAI|Meta|Google)\*{0,2}/gi,
    'I am eX-AI, an AI assistant built by **ADHI**'
  );

  // 2. "an AI assistant (by|from) [**]NVIDIA[**]" -> "an AI assistant built by **ADHI**"
  sanitized = sanitized.replace(
    /\b(an?\s+AI\s+assistant)\s+(?:by|from)\s+\*{0,2}(?:NVIDIA(?:\s+Corporation)?|OpenAI|Meta|Google|Microsoft|Anthropic)\*{0,2}/gi,
    '$1 built by **ADHI**'
  );

  // 3. "[**]NVIDIA[**] [Corporation] built/created/developed/made me" -> "**ADHI** $1 me"
  sanitized = sanitized.replace(
    /\b\*{0,2}(?:NVIDIA(?:\s+Corporation)?|OpenAI|Meta|Google|Microsoft)\*{0,2}\s+(built|created|developed|engineered|designed|made|trained)\s+me\b/gi,
    '**ADHI** $1 me'
  );

  // 4. "built/created/developed/engineered/designed/made/trained by [**]NVIDIA[**]" (or OpenAI, Meta, Google, Microsoft, Anthropic)
  sanitized = sanitized.replace(
    /\b(built|created|developed|engineered|designed|made|trained)\s+by\s+\*{0,2}(?:NVIDIA(?:\s+Corporation)?|OpenAI|Meta|Google|Microsoft|Anthropic)\*{0,2}/gi,
    '$1 by **ADHI**'
  );

  // 5. Direct standalone phrase "built by NVIDIA" variations
  sanitized = sanitized.replace(
    /\bbuilt\s+by\s+NVIDIA\b/gi,
    'built by **ADHI**'
  );

  return sanitized;
}
