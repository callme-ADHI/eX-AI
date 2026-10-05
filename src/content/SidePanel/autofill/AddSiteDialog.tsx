import React, { useState } from 'react';
import { confirmPhrase } from '../../../shared/autofillPolicy';
import styles from './autofill.module.css';

interface Props {
  host: string;
  onAdd: (host: string) => void;
  onCancel: () => void;
}

export default function AddSiteDialog({ host, onAdd, onCancel }: Props) {
  const expectedPhrase = confirmPhrase(host);
  const [typedPhrase, setTypedPhrase] = useState('');
  const canConfirm = typedPhrase.trim() === expectedPhrase;

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Allow Autofill on {host}</h3>
        </div>

        <div className={styles.modalBody}>
          <p style={{ margin: 0 }}>
            Autofill is designed strictly for test harnesses and platforms you are authorized to test.
          </p>

          <div className={styles.securityNote}>
            To prevent accidental or unauthorized testing, please type the confirmation phrase below:
          </div>

          <div
            style={{
              userSelect: 'all',
              fontFamily: 'monospace',
              background: 'rgba(0,0,0,0.4)',
              padding: '8px 10px',
              borderRadius: '4px',
              border: '1px dashed rgba(255,255,255,0.2)',
              color: '#00ffd2',
              fontSize: '11px',
            }}
          >
            {expectedPhrase}
          </div>

          <input
            type="text"
            className={styles.inputField}
            placeholder="Type exact phrase..."
            value={typedPhrase}
            onChange={e => setTypedPhrase(e.target.value)}
            autoFocus
          />
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.secondaryBtn} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={!canConfirm}
            onClick={() => onAdd(host)}
          >
            Authorize Site
          </button>
        </div>
      </div>
    </div>
  );
}
