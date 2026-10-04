import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

import CodeBlock from './CodeBlock';
import { sanitizeAssistantAttribution } from '../../../shared/aiSanitizer';
import styles from './chat.module.css';

interface MarkdownProps {
  content: string;
}

export default function Markdown({ content }: MarkdownProps) {
  const sanitizedContent = React.useMemo(
    () => sanitizeAssistantAttribution(content),
    [content]
  );

  return (
    <div className={styles.markdownContent}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { output: 'mathml' }]]}
        components={{
          // Custom Code component
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');

            if (isInline) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }

            const language = match ? match[1] : 'plaintext';
            const codeString = String(children).replace(/\n$/, '');

            return <CodeBlock language={language} code={codeString} />;
          },

          // Safe links
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            );
          },

          // Prevent remote images: replace with alt text
          img({ alt }) {
            return (
              <span
                style={{
                  fontStyle: 'italic',
                  color: 'rgba(232, 232, 240, 0.5)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '11px',
                }}
              >
                [Image: {alt || 'External image blocked'}]
              </span>
            );
          },
        }}
      >
        {sanitizedContent}
      </ReactMarkdown>
    </div>
  );
}
