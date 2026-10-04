import React, { useState, useMemo } from 'react';
import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import plaintext from 'highlight.js/lib/languages/plaintext';

import styles from './chat.module.css';

// Register only requested core languages
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c++', cpp);
hljs.registerLanguage('c', c);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('text', plaintext);

interface CodeBlockProps {
  language?: string;
  code: string;
}

/**
 * Convert HTML string from hljs safely to React nodes without dangerouslySetInnerHTML.
 */
function safeNodesFromHljs(html: string): React.ReactNode[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const container = doc.body.firstElementChild;
  if (!container) return [html];

  function convert(node: Node, idx: number): React.ReactNode {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const children = Array.from(el.childNodes).map((child, i) => convert(child, i));
      if (el.tagName.toLowerCase() === 'span') {
        return (
          <span key={idx} className={el.className}>
            {children}
          </span>
        );
      }
      return <React.Fragment key={idx}>{children}</React.Fragment>;
    }
    return null;
  }

  return Array.from(container.childNodes).map((child, idx) => convert(child, idx));
}

export default function CodeBlock({ language = 'plaintext', code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const cleanLang = (language || 'plaintext').toLowerCase();
  const validLang = hljs.getLanguage(cleanLang) ? cleanLang : 'plaintext';

  const nodes = useMemo(() => {
    try {
      const rawHtml = hljs.highlight(code, { language: validLang }).value;
      return safeNodesFromHljs(rawHtml);
    } catch {
      return [code];
    }
  }, [code, validLang]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <div className={styles.codeBlockWrapper}>
      <div className={styles.codeBlockHeader}>
        <span>{validLang}</span>
        <button
          className={styles.copyCodeBtn}
          onClick={handleCopy}
          aria-label="Copy code"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className={styles.codeBlockPre}>
        <code>{nodes}</code>
      </pre>
    </div>
  );
}
