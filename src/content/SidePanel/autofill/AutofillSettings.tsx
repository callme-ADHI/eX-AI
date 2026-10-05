import React, { useState } from 'react';
import type { ExAISettings } from '../../../shared/aiTypes';
import { validateAllowEntry } from '../../../shared/autofillPolicy';
import styles from './autofill.module.css';

interface Props {
  settings: ExAISettings;
  onSave: (partial: Partial<ExAISettings>) => Promise<void>;
  onClose: () => void;
}

export default function AutofillSettings({ settings, onSave, onClose }: Props) {
  const [delayMs, setDelayMs] = useState(settings.autofillDelayMs ?? 80);
  const [overwrite, setOverwrite] = useState(settings.autofillOverwrite ?? false);
  const [think, setThink] = useState(settings.autofillThink ?? true);
  const [allowList, setAllowList] = useState<string[]>(settings.autofillAllow ?? []);
  const [newHost, setNewHost] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);

  const handleAddHost = () => {
    setEntryError(null);
    const v = validateAllowEntry(newHost);
    if (!v.ok || !v.host) {
      setEntryError(v.error ?? 'Invalid hostname');
      return;
    }
    if (allowList.includes(v.host)) {
      setEntryError('Host is already in the allowlist');
      return;
    }
    const updated = [...allowList, v.host];
    setAllowList(updated);
    setNewHost('');
    onSave({ autofillAllow: updated });
  };

  const handleRemoveHost = (host: string) => {
    const updated = allowList.filter(h => h !== host);
    setAllowList(updated);
    onSave({ autofillAllow: updated });
  };

  const handleSave = async () => {
    await onSave({
      autofillDelayMs: Math.max(40, Math.min(500, delayMs)),
      autofillOverwrite: overwrite,
      autofillThink: think,
      autofillAllow: allowList,
    });
    onClose();
  };

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Autofill Settings</h3>
          <button type="button" className={styles.secondaryBtn} onClick={onClose} style={{ padding: '2px 8px' }}>
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <div>
            <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span>Delay between fields:</span>
              <strong>{delayMs} ms</strong>
            </label>
            <input
              type="range"
              min={40}
              max={500}
              step={10}
              value={delayMs}
              onChange={e => setDelayMs(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#2452ff' }}
            />
            <div style={{ fontSize: '11px', color: 'rgba(232,232,240,0.5)', marginTop: '2px' }}>
              Allows page DOM handlers to settle. Fixed delay; not human mimicry.
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={overwrite}
              onChange={e => setOverwrite(e.target.checked)}
              style={{ accentColor: '#2452ff' }}
            />
            <span>Overwrite already answered fields</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={think}
              onChange={e => setThink(e.target.checked)}
              style={{ accentColor: '#2452ff' }}
            />
            <span>Enable extended thinking (reasoning) for proposals</span>
          </label>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 600 }}>Authorized Test Hosts</h4>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
              <input
                type="text"
                className={styles.inputField}
                placeholder="e.g. staging.tests.org"
                value={newHost}
                onChange={e => setNewHost(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddHost();
                }}
              />
              <button type="button" className={styles.secondaryBtn} onClick={handleAddHost}>
                Add
              </button>
            </div>
            {entryError && <div style={{ color: '#ff453a', fontSize: '11px', marginBottom: '6px' }}>{entryError}</div>}

            <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {allowList.length === 0 ? (
                <div style={{ fontSize: '11px', color: 'rgba(232,232,240,0.4)' }}>
                  No custom hosts. Local/test hosts (localhost, .test, .local) are allowed by default.
                </div>
              ) : (
                allowList.map(h => (
                  <div
                    key={h}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255,255,255,0.03)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                    }}
                  >
                    <span>{h}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveHost(h)}
                      style={{ background: 'transparent', border: 'none', color: '#ff453a', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.primaryBtn} onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
