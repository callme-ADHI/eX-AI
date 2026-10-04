import React, { useState, useEffect } from 'react';
import type { ExAISettings, ModelEntry } from '../../../shared/aiTypes';
import styles from './chat.module.css';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ExAISettings;
  onUpdateSettings: (updates: Partial<ExAISettings>) => Promise<void>;
  hasKey: boolean;
  keyHint: string;
  onSaveKey: (key: string) => Promise<{ ok: boolean; error?: string }>;
  onClearKey: () => Promise<void>;
  models: ModelEntry[];
}

export default function SettingsDrawer({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  hasKey,
  keyHint,
  onSaveKey,
  onClearKey,
  models,
}: SettingsDrawerProps) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keySuccess, setKeySuccess] = useState(false);
  const [isVerifyingKey, setIsVerifyingKey] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setApiKeyInput('');
      setKeyError(null);
      setKeySuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeySave = async () => {
    if (!apiKeyInput.trim()) return;
    setIsVerifyingKey(true);
    setKeyError(null);
    setKeySuccess(false);

    try {
      const res = await onSaveKey(apiKeyInput.trim());
      if (res.ok) {
        setKeySuccess(true);
        setApiKeyInput('');
      } else {
        setKeyError(res.error || 'Failed to verify API key');
      }
    } catch (e: any) {
      setKeyError(e.message || 'Error saving key');
    } finally {
      setIsVerifyingKey(false);
    }
  };

  const handleKeyRemove = async () => {
    if (confirm('Are you sure you want to remove your stored API key?')) {
      await onClearKey();
      setKeySuccess(false);
      setKeyError(null);
    }
  };

  return (
    <div className={styles.drawerOverlay}>
      <div className={styles.drawerHeader}>
        <span>⚙️ Settings</span>
        <button
          className={styles.iconBtn}
          onClick={onClose}
          aria-label="Close settings"
        >
          ✕
        </button>
      </div>

      <div className={styles.drawerBody}>
        {/* API Key Section */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>NVIDIA API Key</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="password"
              className={styles.fieldInput}
              style={{ flex: 1 }}
              placeholder={hasKey ? `Stored (${keyHint})` : 'nvapi-...'}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            <button
              className={styles.setupBtn}
              style={{ marginTop: 0, padding: '0 12px' }}
              onClick={handleKeySave}
              disabled={isVerifyingKey || !apiKeyInput.trim()}
            >
              {isVerifyingKey ? 'Verifying...' : 'Save & Verify'}
            </button>
          </div>

          {keyError && (
            <div style={{ color: '#f87171', fontSize: '11px', marginTop: '2px' }}>
              ✕ {keyError}
            </div>
          )}

          {keySuccess && (
            <div style={{ color: '#4ade80', fontSize: '11px', marginTop: '2px' }}>
              ✓ Key verified and saved successfully.
            </div>
          )}

          {hasKey && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
              <span style={{ fontSize: '11px', color: '#4ade80' }}>
                Active key: <code>{keyHint}</code>
              </span>
              <button
                className={styles.actionBtnSmall}
                onClick={handleKeyRemove}
                style={{ color: '#f87171' }}
              >
                Remove Key
              </button>
            </div>
          )}

          <div className={styles.fieldNote}>
            Need a key?{' '}
            <a
              href="https://build.nvidia.com/settings/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#7094ff', textDecoration: 'underline' }}
            >
              Get a free key at build.nvidia.com ↗
            </a>
          </div>
        </div>

        {/* Default Model */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Default Model</label>
          <select
            className={styles.fieldInput}
            value={settings.model}
            onChange={(e) => onUpdateSettings({ model: e.target.value })}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label || m.id}
              </option>
            ))}
          </select>
        </div>

        {/* Edge Trigger Mode */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Edge Trigger Style</label>
          <select
            className={styles.fieldInput}
            value={settings.edgeTrigger}
            onChange={(e) =>
              onUpdateSettings({ edgeTrigger: e.target.value as any })
            }
          >
            <option value="strip">Strip + Handle (hover right edge or handle)</option>
            <option value="handle">Handle only (hover or click pill handle)</option>
            <option value="off">Off (keyboard shortcut only)</option>
          </select>
        </div>

        {/* Auto Close On Leave */}
        <div className={styles.fieldGroup}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.autoCloseOnLeave}
              onChange={(e) =>
                onUpdateSettings({ autoCloseOnLeave: e.target.checked })
              }
            />
            <span style={{ fontSize: '12px' }}>Auto-close on mouse leave</span>
          </label>
          <div className={styles.fieldNote}>
            Only closes when chat input is empty, no stream is running, and panel is not focused.
          </div>
        </div>

        {/* OCR Default Mode */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Default OCR Mode</label>
          <select
            className={styles.fieldInput}
            value={settings.ocrDefaultMode}
            onChange={(e) =>
              onUpdateSettings({ ocrDefaultMode: e.target.value as any })
            }
          >
            <option value="text">Text mode (smart line wrap & clean formatting)</option>
            <option value="code">Code mode (preserves indentation & whitespace)</option>
          </select>
        </div>

        {/* Show all models toggle */}
        <div className={styles.fieldGroup}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.showAllModels}
              onChange={(e) =>
                onUpdateSettings({ showAllModels: e.target.checked })
              }
            />
            <span style={{ fontSize: '12px' }}>Show all catalog models (including non-chat)</span>
          </label>
        </div>

        {/* Security Engine toggle */}
        <div className={styles.fieldGroup}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.securityEngineEnabled}
              onChange={(e) =>
                onUpdateSettings({ securityEngineEnabled: e.target.checked })
              }
            />
            <span style={{ fontSize: '12px' }}>Enable automatic website security scans</span>
          </label>
          <div className={styles.fieldNote}>
            Disabled by default for privacy. Sends visited domain names to RDAP/Geo-IP services.
          </div>
        </div>

        {/* Usage note */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '6px',
            padding: '10px 12px',
            fontSize: '11px',
            color: 'rgba(232, 232, 240, 0.6)',
            lineHeight: 1.5,
          }}
        >
          ℹ️ <strong>NVIDIA NIM Free Tier:</strong> Designed for development & prototyping with ~40 requests/minute shared across all models. Requests in excess of rate limits will queue smoothly.
        </div>
      </div>
    </div>
  );
}
