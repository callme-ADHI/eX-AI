import React, { useEffect, useState } from 'react';
import { getAudit, clearAudit, type AuditEntry } from '../../autofill/audit';
import styles from './autofill.module.css';

interface Props {
  onClose: () => void;
}

export default function AuditViewer({ onClose }: Props) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);

  useEffect(() => {
    getAudit().then(setLogs);
  }, []);

  const handleClear = async () => {
    await clearAudit();
    setLogs([]);
  };

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Autofill Audit Log</h3>
          <button type="button" className={styles.secondaryBtn} onClick={onClose} style={{ padding: '2px 8px' }}>
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <div style={{ fontSize: '11px', color: 'rgba(232,232,240,0.5)' }}>
            Audit log records operational counts only. Never stores questions, answers, or code.
          </div>

          <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {logs.length === 0 ? (
              <div style={{ padding: '16px 0', textAlign: 'center', color: 'rgba(232,232,240,0.4)', fontSize: '12px' }}>
                No audit entries yet.
              </div>
            ) : (
              logs.slice().reverse().map((entry, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    fontSize: '11px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, color: '#ffffff' }}>{entry.host}</span>
                    <span style={{ color: 'rgba(232,232,240,0.4)' }}>
                      {new Date(entry.t).toLocaleTimeString()} · {entry.mode.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span>Total: {entry.fields}</span>
                    <span style={{ color: '#34c759' }}>Filled: {entry.filled}</span>
                    <span style={{ color: '#8e8e93' }}>Skipped: {entry.skipped}</span>
                    <span style={{ color: '#ff453a' }}>Failed: {entry.failed}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={styles.modalFooter}>
          {logs.length > 0 && (
            <button type="button" className={styles.dangerBtn} onClick={handleClear} style={{ marginRight: 'auto' }}>
              Clear Log
            </button>
          )}
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
