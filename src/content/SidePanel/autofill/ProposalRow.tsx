import React, { useState } from 'react';
import type { FieldHandle, Proposal } from '../../autofill/types';
import styles from './autofill.module.css';

interface Props {
  handle: FieldHandle;
  proposal?: Proposal;
  checked: boolean;
  onToggleChecked: (checked: boolean) => void;
  onChangeProposal: (proposal: Proposal) => void;
  onHover: (hovering: boolean) => void;
}

export default function ProposalRow({
  handle,
  proposal,
  checked,
  onToggleChecked,
  onChangeProposal,
  onHover,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const info = handle.info;

  const question = info.question || '(Untitled question)';
  const snippet = question.length > 120 && !expanded ? `${question.slice(0, 120)}…` : question;

  const detectorClass =
    info.source === 'native'
      ? styles.badgeNative
      : info.source === 'aria'
      ? styles.badgeAria
      : info.source === 'picked'
      ? styles.badgePicked
      : styles.badgeHeuristic;

  const handleOptionClick = (optId: string) => {
    const current = proposal?.optionIds ?? [];
    let updated: string[];
    if (info.multi) {
      updated = current.includes(optId)
        ? current.filter(id => id !== optId)
        : [...current, optId];
    } else {
      updated = [optId];
    }
    onChangeProposal({
      fieldId: info.id,
      ...proposal,
      optionIds: updated,
      confidence: proposal?.confidence ?? 1.0,
    });
  };

  return (
    <div
      className={styles.row}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div className={styles.rowHeader}>
        <input
          type="checkbox"
          className={styles.rowCheckbox}
          checked={checked}
          onChange={e => onToggleChecked(e.target.checked)}
        />
        <div className={styles.rowQuestionArea}>
          <p className={styles.rowQuestion}>{snippet}</p>
          {question.length > 120 && (
            <button
              type="button"
              className={styles.expandBtn}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Show less' : 'Show full question'}
            </button>
          )}

          <div className={styles.badges}>
            <span className={`${styles.badge} ${detectorClass}`}>{info.source}</span>
            <span className={styles.badgeConfidence}>
              {Math.round((proposal?.confidence ?? info.confidence) * 100)}%
            </span>
            {info.currentlyFilled && (
              <span className={`${styles.badge} ${styles.badgeFilled}`} title="Already answered on the page">
                ⚠️ Answered
              </span>
            )}
            {info.kind === 'code' && info.language && (
              <span className={styles.badgeConfidence}>{info.language}</span>
            )}
          </div>
        </div>
      </div>

      {/* Choice Fields */}
      {info.kind === 'choice' && (
        <div className={styles.pills}>
          {info.options.map(opt => {
            const isSelected = proposal?.optionIds?.includes(opt.id) ?? false;
            return (
              <button
                key={opt.id}
                type="button"
                className={`${styles.pill} ${isSelected ? styles.pillSelected : ''}`}
                onClick={() => handleOptionClick(opt.id)}
              >
                {isSelected ? '✓ ' : ''}
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Text / Select Fields */}
      {(info.kind === 'text' || info.kind === 'longtext' || info.kind === 'select') && (
        <textarea
          className={styles.inputField}
          rows={info.kind === 'longtext' ? 3 : 1}
          placeholder="Proposed answer..."
          value={proposal?.text ?? ''}
          onChange={e =>
            onChangeProposal({
              fieldId: info.id,
              ...proposal,
              text: e.target.value,
              confidence: proposal?.confidence ?? 1.0,
            })
          }
        />
      )}

      {/* Code Fields */}
      {info.kind === 'code' && (
        <textarea
          className={`${styles.inputField} ${styles.codeInput}`}
          rows={5}
          placeholder="// Code proposal..."
          value={proposal?.code ?? ''}
          onChange={e =>
            onChangeProposal({
              fieldId: info.id,
              ...proposal,
              code: e.target.value,
              confidence: proposal?.confidence ?? 1.0,
            })
          }
        />
      )}
    </div>
  );
}
