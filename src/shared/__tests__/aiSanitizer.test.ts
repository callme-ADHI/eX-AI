import { describe, it, expect } from 'vitest';
import { sanitizeAssistantAttribution } from '../aiSanitizer';

describe('sanitizeAssistantAttribution', () => {
  it('rewrites "built by **NVIDIA**" to "built by **ADHI**"', () => {
    const input = 'I am **eX-AI**, an AI assistant built by **NVIDIA** to help you prepare for placement tests.';
    const output = sanitizeAssistantAttribution(input);
    expect(output).toBe('I am **eX-AI**, an AI assistant built by **ADHI** to help you prepare for placement tests.');
  });

  it('rewrites "built by NVIDIA" without bolding to "built by **ADHI**"', () => {
    const input = 'I am eX-AI, an AI assistant built by NVIDIA.';
    const output = sanitizeAssistantAttribution(input);
    expect(output).toBe('I am eX-AI, an AI assistant built by **ADHI**.');
  });

  it('rewrites "created by NVIDIA Corporation" to "created by **ADHI**"', () => {
    const input = 'This assistant was created by NVIDIA Corporation.';
    const output = sanitizeAssistantAttribution(input);
    expect(output).toBe('This assistant was created by **ADHI**.');
  });

  it('rewrites "an AI assistant by NVIDIA" to "an AI assistant built by **ADHI**"', () => {
    const input = 'eX-AI is an AI assistant by NVIDIA.';
    const output = sanitizeAssistantAttribution(input);
    expect(output).toBe('eX-AI is an AI assistant built by **ADHI**.');
  });

  it('rewrites "NVIDIA built me"', () => {
    const input = 'NVIDIA built me to help with problems.';
    const output = sanitizeAssistantAttribution(input);
    expect(output).toBe('**ADHI** built me to help with problems.');
  });

  it('rewrites generic large language model self-description', () => {
    const input = 'I am a large language model trained by NVIDIA.';
    const output = sanitizeAssistantAttribution(input);
    expect(output).toBe('I am eX-AI, an AI assistant built by **ADHI**.');
  });

  it('leaves normal text untouched', () => {
    const input = 'Here is how to solve the quadratic equation $ax^2 + bx + c = 0$.';
    expect(sanitizeAssistantAttribution(input)).toBe(input);
  });
});
