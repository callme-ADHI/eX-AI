import React, { useState, useEffect } from 'react';
import type { ExAISettings, ModelEntry } from '../../../shared/aiTypes';
import { forgetAllOrigins, getAllowedOrigins } from '../../pageText/consent';
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
  const [allowedOrigins, setAllowedOrigins] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setApiKeyInput('');
      setKeyError(null);
      setKeySuccess(false);
    } else {
      getAllowedOrigins().then(setAllowedOrigins);
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

  const handleForgetAllOrigins = async () => {
    await forgetAllOrigins();
    setAllowedOrigins([]);
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
            style={{ colorScheme: 'dark', backgroundColor: '#14141c', color: '#e8e8f0' }}
            value={settings.model}
            onChange={(e) => onUpdateSettings({ model: e.target.value })}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id} style={{ backgroundColor: '#161622', color: '#e8e8f0' }}>
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
            style={{ colorScheme: 'dark', backgroundColor: '#14141c', color: '#e8e8f0' }}
            value={settings.edgeTrigger}
            onChange={(e) =>
              onUpdateSettings({ edgeTrigger: e.target.value as any })
            }
          >
            <option value="strip" style={{ backgroundColor: '#161622', color: '#e8e8f0' }}>Strip + Handle (hover right edge or handle)</option>
            <option value="handle" style={{ backgroundColor: '#161622', color: '#e8e8f0' }}>Handle only (hover or click pill handle)</option>
            <option value="off" style={{ backgroundColor: '#161622', color: '#e8e8f0' }}>Off (keyboard shortcut only)</option>
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
            style={{ colorScheme: 'dark', backgroundColor: '#14141c', color: '#e8e8f0' }}
            value={settings.ocrDefaultMode}
            onChange={(e) =>
              onUpdateSettings({ ocrDefaultMode: e.target.value as any })
            }
          >
            <option value="text" style={{ backgroundColor: '#161622', color: '#e8e8f0' }}>Text mode (smart line wrap & clean formatting)</option>
            <option value="code" style={{ backgroundColor: '#161622', color: '#e8e8f0' }}>Code mode (preserves indentation & whitespace)</option>
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

        {/* Website Awareness Section */}
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '14px', marginTop: '6px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#7094ff', marginBottom: '10px' }}>
            🌐 Website Awareness
          </div>

          {/* Default page context scope */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Default Page Context</label>
            <select
              className={styles.fieldInput}
              style={{ colorScheme: 'dark', backgroundColor: '#14141c', color: '#e8e8f0' }}
              value={settings.pageContext || 'off'}
              onChange={(e) =>
                onUpdateSettings({ pageContext: e.target.value as any })
              }
            >
              <option value="off">Off (manual activation)</option>
              <option value="main">Main content only</option>
              <option value="page">Full page</option>
              <option value="selection">Selection only</option>
            </select>
          </div>

          {/* Max Characters */}
          <div className={styles.fieldGroup}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className={styles.fieldLabel}>Max Page Characters</label>
              <span style={{ fontSize: '11px', color: '#7094ff' }}>
                {(settings.pageContextMaxChars || 60_000).toLocaleString()} chars
              </span>
            </div>
            <input
              type="range"
              min="10000"
              max="200000"
              step="5000"
              value={settings.pageContextMaxChars || 60_000}
              onChange={(e) =>
                onUpdateSettings({ pageContextMaxChars: Number(e.target.value) })
              }
              style={{ accentColor: '#2452ff' }}
            />
          </div>

          {/* Browse Mode */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Browse Capability</label>
            <select
              className={styles.fieldInput}
              style={{ colorScheme: 'dark', backgroundColor: '#14141c', color: '#e8e8f0' }}
              value={settings.browseMode || 'context'}
              onChange={(e) =>
                onUpdateSettings({ browseMode: e.target.value as any })
              }
            >
              <option value="context">Context only (read current page text & structure)</option>
              <option value="tools">Tool-calling browse (fetch linked pages on demand)</option>
            </select>
          </div>

          {/* Keep query in URL */}
          <div className={styles.fieldGroup}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.pageContextKeepQuery || false}
                onChange={(e) =>
                  onUpdateSettings({ pageContextKeepQuery: e.target.checked })
                }
              />
              <span style={{ fontSize: '12px' }}>Keep URL query parameters (default strips tracking & query)</span>
            </label>
          </div>

          {/* Allow in incognito */}
          <div className={styles.fieldGroup}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.pageContextAllowIncognito || false}
                onChange={(e) =>
                  onUpdateSettings({ pageContextAllowIncognito: e.target.checked })
                }
              />
              <span style={{ fontSize: '12px' }}>Allow page context in Incognito windows</span>
            </label>
            <div className={styles.fieldNote}>
              Disabled by default to prevent sending private incognito page text to external API.
            </div>
          </div>

          {/* Remembered Sites Consent */}
          <div className={styles.fieldGroup}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'rgba(232, 232, 240, 0.7)' }}>
                Remembered allowed sites: <strong>{allowedOrigins.length}</strong>
              </span>
              {allowedOrigins.length > 0 && (
                <button
                  className={styles.actionBtnSmall}
                  onClick={handleForgetAllOrigins}
                  style={{ color: '#f87171' }}
                >
                  Forget all
                </button>
              )}
            </div>
            {allowedOrigins.length > 0 && (
              <div
                style={{
                  maxHeight: '60px',
                  overflowY: 'auto',
                  fontSize: '10px',
                  color: 'rgba(232, 232, 240, 0.5)',
                  background: 'rgba(0, 0, 0, 0.2)',
                  padding: '4px 6px',
                  borderRadius: '4px',
                }}
              >
                {allowedOrigins.join(', ')}
              </div>
            )}
          </div>

          {/* Read-only blocked patterns notice */}
          <div className={styles.fieldNote} style={{ marginTop: '4px' }}>
            🛡️ <strong>Safety blocklist active:</strong> Action links (logout, delete, cart, admin, payment) and binary downloads are never fetched.
          </div>
        </div>

        {/* Autofill for Test Sites */}
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px', marginTop: '16px' }}>
          <div className={styles.sectionTitle} style={{ color: '#00ffd2' }}>
            🧪 Autofill for Test Sites
          </div>
          <div className={styles.fieldNote} style={{ marginBottom: '10px' }}>
            Developer tool for authorized QA test harnesses. Fills fields safely and never submits.
          </div>

          <div className={styles.fieldGroup}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.autofillEnabled}
                onChange={(e) => onUpdateSettings({ autofillEnabled: e.target.checked })}
              />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Enable Autofill</span>
            </label>
          </div>

          {settings.autofillEnabled && (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  Fill delay: {settings.autofillDelayMs ?? 80} ms
                </label>
                <input
                  type="range"
                  min={40}
                  max={500}
                  step={10}
                  value={settings.autofillDelayMs ?? 80}
                  onChange={(e) => onUpdateSettings({ autofillDelayMs: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: '#2452ff' }}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={settings.autofillOverwrite ?? false}
                    onChange={(e) => onUpdateSettings({ autofillOverwrite: e.target.checked })}
                  />
                  <span style={{ fontSize: '12px' }}>Overwrite already answered fields</span>
                </label>
              </div>

              <div className={styles.fieldGroup}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={settings.autofillThink ?? true}
                    onChange={(e) => onUpdateSettings({ autofillThink: e.target.checked })}
                  />
                  <span style={{ fontSize: '12px' }}>Enable model thinking (reasoning)</span>
                </label>
              </div>
            </>
          )}
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
            marginTop: '12px',
          }}
        >
          ℹ️ <strong>NVIDIA NIM Free Tier:</strong> Designed for development & prototyping with ~40 requests/minute shared across all models. Requests in excess of rate limits will queue smoothly.
        </div>

        {/* Credit: Built by ADHI */}
        <div
          style={{
            textAlign: 'center',
            fontSize: '11px',
            color: 'rgba(232, 232, 240, 0.45)',
            marginTop: '8px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            paddingTop: '12px',
          }}
        >
          eX-AI v2.0 · Built with ⚡ by <strong style={{ color: '#7094ff' }}>ADHI</strong>
        </div>
      </div>
    </div>
  );
}
