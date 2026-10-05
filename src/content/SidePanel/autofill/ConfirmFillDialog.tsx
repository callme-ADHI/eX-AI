import React from 'react';
import type { FieldHandle, PlanItem } from '../../autofill/types';
import type { ApplyOutcome } from '../../autofill/fill';
import styles from './autofill.module.css';

interface Props {
  host: string;
  plan: PlanItem[];
  handles: Map<string, FieldHandle>;
  onConfirm: () => void;
  onCancel: () => void;
  isFilling: boolean;
  fillOutcome: ApplyOutcome | null;
  onUndo: () => void;
  onRescan: () => void;
}

export default function ConfirmFillDialog({
  host,
  plan,
  handles,
  onConfirm,
  onCancel,
  isFilling,
  fillOutcome,
  onUndo,
  onRescan,
}: Props) {
  if (fillOutcome) {
    const filledCount = fillOutcome.results.filter(r => r.status === 'filled').length;
    const skippedCount = fillOutcome.results.filter(r => r.status === 'skipped').length;
    const failedCount = fillOutcome.results.filter(r => r.status === 'failed').length;

    return (
      <div className={styles.modalBackdrop}>
        <div className={styles.modalContent}>
          <div className={styles.modalHeader}>
            <h3 className={styles.modalTitle}>Autofill Complete</h3>
          </div>

          <div className={styles.modalBody}>
            <div className={styles.securityNote} style={{ fontWeight: 600 }}>
              🛡️ Not submitted. Review and submit yourself.
            </div>

            <p style={{ margin: '4px 0', fontSize: '13px' }}>
              Summary: <strong style={{ color: '#34c759' }}>{filledCount} filled</strong>,{' '}
              <span style={{ color: '#8e8e93' }}>{skippedCount} skipped</span>,{' '}
              <span style={{ color: '#ff453a' }}>{failedCount} failed</span>.
            </p>

            {fillOutcome.blocked.length > 0 && (
              <div style={{ color: '#ff9f0a', fontSize: '11px' }}>
                ⚠️ Intercepted {fillOutcome.blocked.length} form submit event(s).
              </div>
            )}

            <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {fillOutcome.results.map((r, i) => {
                const h = handles.get(r.fieldId);
                const q = h?.info.question ? h.info.question.slice(0, 60) : r.fieldId;
                return (
                  <div
                    key={i}
                    style={{
                      fontSize: '11px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      padding: '4px 0',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                      {q}
                    </span>
                    <span
                      style={{
                        color:
                          r.status === 'filled'
                            ? '#34c759'
                            : r.status === 'skipped'
                            ? '#8e8e93'
                            : '#ff453a',
                      }}
                    >
                      {r.status}: {r.detail}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: '11px', color: 'rgba(232, 232, 240, 0.5)', marginTop: '4px' }}>
              Note on Undo: Restores native text/select/checkbox and textarea code. Radios and custom options cannot be reverted by browser semantics.
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button type="button" className={styles.secondaryBtn} onClick={onUndo}>
              Undo
            </button>
            <button type="button" className={styles.primaryBtn} onClick={onRescan}>
              Rescan Page
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={onCancel}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Confirm Autofill</h3>
        </div>

        <div className={styles.modalBody}>
          <p style={{ margin: 0 }}>
            Fill <strong>{plan.length}</strong> fields on <strong>{host}</strong>?
          </p>

          <div className={styles.securityNote}>
            Autofill never submits the page. You retain full control to inspect, adjust, and submit when ready.
          </div>

          <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {plan.map(item => {
              const h = handles.get(item.fieldId);
              const q = h?.info.question ? h.info.question.slice(0, 80) : item.fieldId;
              let val = item.text || item.code || '';
              if (item.optionIds && h) {
                const labels = item.optionIds.map(oid => h.info.options.find(o => o.id === oid)?.label || oid);
                val = labels.join(', ');
              }
              return (
                <div
                  key={item.fieldId}
                  style={{
                    fontSize: '11px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    padding: '4px 0',
                  }}
                >
                  <div style={{ fontWeight: 500, color: '#f0f0f8' }}>{q}</div>
                  <div style={{ color: '#2452ff', marginTop: '2px', wordBreak: 'break-word' }}>
                    → {val.slice(0, 100) || '(empty)'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.secondaryBtn} onClick={onCancel} disabled={isFilling}>
            Cancel
          </button>
          <button type="button" className={styles.primaryBtn} onClick={onConfirm} disabled={isFilling}>
            {isFilling ? 'Filling...' : `Autofill (${plan.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
