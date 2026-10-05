import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { ExAISettings } from '../../../shared/aiTypes';
import { isAutofillAllowed, isHardDenied } from '../../../shared/autofillPolicy';
import { scanPage } from '../../autofill/detect';
import { applyPlan, type ApplyOutcome } from '../../autofill/fill';
import { buildQaPlan, type QaMode } from '../../autofill/qaData';
import { requestProposals } from '../../autofill/propose';
import { addAudit } from '../../autofill/audit';
import type { FieldHandle, Proposal, PlanItem } from '../../autofill/types';
import ProposalRow from './ProposalRow';
import HighlightLayer, { type HighlightItem } from './HighlightLayer';
import ElementPicker from './ElementPicker';
import ConfirmFillDialog from './ConfirmFillDialog';
import AddSiteDialog from './AddSiteDialog';
import AutofillSettings from './AutofillSettings';
import AuditViewer from './AuditViewer';
import styles from './autofill.module.css';

interface Props {
  ownHost: HTMLElement | null;
}

export default function AutofillTab({ ownHost }: Props) {
  const [settings, setSettings] = useState<ExAISettings | null>(null);
  const [fields, setFields] = useState<FieldHandle[]>([]);
  const [proposals, setProposals] = useState<Map<string, Proposal>>(new Map());
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [hoveredFieldId, setHoveredFieldId] = useState<string | null>(null);

  // Flow & Modal states
  const [isScanning, setIsScanning] = useState(false);
  const [isProposing, setIsProposing] = useState(false);
  const [proposeProgress, setProposeProgress] = useState<{ done: number; total: number } | null>(null);
  const [isFilling, setIsFilling] = useState(false);
  const [fillOutcome, setFillOutcome] = useState<ApplyOutcome | null>(null);
  const [undoFn, setUndoFn] = useState<(() => void) | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showAddSiteDialog, setShowAddSiteDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showAuditViewer, setShowAuditViewer] = useState(false);
  const [isPickerActive, setIsPickerActive] = useState(false);
  const [qaMenuOpen, setQaMenuOpen] = useState(false);
  const [statusText, setStatusText] = useState<string>('');

  const hostname = window.location.hostname;

  // Load Settings
  const refreshSettings = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'AI_SETTINGS_GET' }, (res) => {
      if (res?.data?.settings) {
        setSettings(res.data.settings);
      }
    });
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  const saveSettings = async (partial: Partial<ExAISettings>) => {
    await new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({ type: 'AI_SETTINGS_SET', settings: partial }, () => {
        resolve();
      });
    });
    refreshSettings();
  };

  const policy = useMemo(() => {
    if (!settings) return { allowed: false, reason: 'Loading policy...' };
    return isAutofillAllowed(hostname, settings.autofillAllow || []);
  }, [hostname, settings]);

  const handlesMap = useMemo(() => {
    return new Map(fields.map(f => [f.info.id, f]));
  }, [fields]);

  // Scan action
  const handleScan = useCallback(() => {
    setIsScanning(true);
    setStatusText('Scanning page for questions...');
    try {
      const res = scanPage({
        ownHost,
        isVisible: (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        },
      });

      setFields(res.fields);
      // Auto-check fields with confidence >= 0.5 that are not already filled
      const initialChecked = new Set<string>();
      res.fields.forEach(f => {
        if (f.info.confidence >= 0.5 && !f.info.currentlyFilled) {
          initialChecked.add(f.info.id);
        }
      });
      setCheckedIds(initialChecked);
      setStatusText(
        `Found ${res.fields.length} field(s).${res.warnings.length ? ` (${res.warnings.length} warning(s))` : ''}`,
      );
    } catch (err: any) {
      setStatusText(`Scan failed: ${err?.message || err}`);
    } finally {
      setIsScanning(false);
    }
  }, [ownHost]);

  // Run initial scan once policy allows
  useEffect(() => {
    if (settings?.autofillEnabled && policy.allowed && fields.length === 0) {
      handleScan();
    }
  }, [settings?.autofillEnabled, policy.allowed, fields.length, handleScan]);

  // Get AI proposals
  const handleGetProposals = async () => {
    if (!fields.length) return;
    setIsProposing(true);
    setProposeProgress({ done: 0, total: 1 });
    setStatusText('Requesting proposals from AI model...');

    try {
      const res = await requestProposals(
        fields,
        settings?.autofillThink ?? true,
        (done, total) => setProposeProgress({ done, total }),
      );

      const nextProposals = new Map(proposals);
      const nextChecked = new Set(checkedIds);

      res.proposals.forEach(p => {
        nextProposals.set(p.fieldId, p);
        if (p.confidence >= 0.5) {
          nextChecked.add(p.fieldId);
        }
      });

      setProposals(nextProposals);
      setCheckedIds(nextChecked);

      if (res.errors.length) {
        setStatusText(`Generated ${res.proposals.length} answer(s). Warnings: ${res.errors[0]}`);
      } else {
        setStatusText(`Generated ${res.proposals.length} proposal(s).`);
      }
    } catch (err: any) {
      setStatusText(`Proposals failed: ${err?.message || err}`);
    } finally {
      setIsProposing(false);
      setProposeProgress(null);
    }
  };

  // Deterministic QA fill
  const handleQaFill = (mode: QaMode) => {
    setQaMenuOpen(false);
    const plan = buildQaPlan(fields, mode, 1234, settings?.autofillOverwrite ?? false);
    const nextProposals = new Map(proposals);
    const nextChecked = new Set(checkedIds);

    plan.forEach(item => {
      nextProposals.set(item.fieldId, {
        fieldId: item.fieldId,
        optionIds: item.optionIds,
        text: item.text,
        code: item.code,
        language: item.language,
        confidence: 1.0,
      });
      nextChecked.add(item.fieldId);
    });

    setProposals(nextProposals);
    setCheckedIds(nextChecked);
    setStatusText(`Generated QA data in "${mode}" mode.`);
  };

  // Build the active plan for checked fields
  const currentPlan = useMemo((): PlanItem[] => {
    const plan: PlanItem[] = [];
    for (const id of checkedIds) {
      const prop = proposals.get(id);
      const h = handlesMap.get(id);
      if (!h) continue;

      plan.push({
        fieldId: id,
        optionIds: prop?.optionIds,
        text: prop?.text,
        code: prop?.code,
        language: prop?.language ?? h.info.language,
        overwrite: settings?.autofillOverwrite ?? false,
      });
    }
    return plan;
  }, [checkedIds, proposals, handlesMap, settings?.autofillOverwrite]);

  // Execute fill
  const handleExecuteFill = async () => {
    if (!currentPlan.length) return;
    setIsFilling(true);
    setStatusText('Filling fields safely without submission...');

    try {
      const outcome = await applyPlan(currentPlan, {
        delayMs: settings?.autofillDelayMs ?? 80,
        handles: handlesMap,
        setLanguageDropdown: true,
      });

      setFillOutcome(outcome);
      setUndoFn(() => outcome.undo);

      const filled = outcome.results.filter(r => r.status === 'filled').length;
      const skipped = outcome.results.filter(r => r.status === 'skipped').length;
      const failed = outcome.results.filter(r => r.status === 'failed').length;

      // Add to audit log
      await addAudit({
        t: Date.now(),
        host: hostname,
        mode: 'ai',
        fields: currentPlan.length,
        filled,
        skipped,
        failed,
      });

      setStatusText(`Fill complete: ${filled} filled, ${skipped} skipped, ${failed} failed.`);
    } catch (err: any) {
      setStatusText(`Fill error: ${err?.message || err}`);
    } finally {
      setIsFilling(false);
    }
  };

  // Element picker callback
  const handleFieldPicked = (handle: FieldHandle) => {
    setIsPickerActive(false);
    // Add or replace in field list
    setFields(prev => {
      const exists = prev.findIndex(f => f.info.id === handle.info.id);
      if (exists >= 0) {
        const copy = [...prev];
        copy[exists] = handle;
        return copy;
      }
      return [handle, ...prev];
    });
    setCheckedIds(prev => new Set([...prev, handle.info.id]));
    setStatusText(`Added custom field: ${handle.info.question.slice(0, 40) || 'Field'}`);
  };

  // Highlights
  const highlightItems = useMemo((): HighlightItem[] => {
    const items: HighlightItem[] = [];
    if (hoveredFieldId) {
      const h = handlesMap.get(hoveredFieldId);
      if (h) items.push({ element: h.root, status: 'hover' });
    }
    return items;
  }, [hoveredFieldId, handlesMap]);

  // State 1: Disabled feature
  if (!settings?.autofillEnabled) {
    return (
      <div className={styles.container}>
        <div className={styles.stateBanner}>
          <span className={styles.stateIcon}>🧪</span>
          <h2 className={styles.stateTitle}>Autofill for Test Sites</h2>
          <p className={styles.stateDesc}>
            A dedicated QA test-harness tool for developers authorized to test assessment sites. Automatically detects questions, proposes answers, and fills fields safely.
          </p>
          <div className={styles.securityNote}>
            🛡️ <strong>Safety Guarantee:</strong> Autofill strictly fills form fields. It never clicks submit buttons, never ends test sessions, and never simulates human delays.
          </div>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => saveSettings({ autofillEnabled: true })}
          >
            Enable Autofill
          </button>
        </div>
      </div>
    );
  }

  // State 2: Host Denied
  if (!policy.allowed) {
    const isHard = isHardDenied(hostname);
    return (
      <div className={styles.container}>
        <div className={styles.stateBanner}>
          <span className={styles.stateIcon}>🚫</span>
          <h2 className={styles.stateTitle}>Host Not Authorized</h2>
          <p className={styles.stateDesc}>{policy.reason}</p>
          {isHard ? (
            <div className={styles.securityNote}>
              This platform is on the built-in assessment/proctoring safety deny list and cannot be enabled under any circumstances.
            </div>
          ) : (
            <>
              <div className={styles.securityNote}>
                You must explicitly authorize this domain before Autofill can operate.
              </div>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setShowAddSiteDialog(true)}
              >
                Add This Site…
              </button>
            </>
          )}
        </div>

        {showAddSiteDialog && (
          <AddSiteDialog
            host={hostname}
            onAdd={async (h) => {
              const updated = [...(settings?.autofillAllow || []), h];
              await saveSettings({ autofillAllow: updated });
              setShowAddSiteDialog(false);
            }}
            onCancel={() => setShowAddSiteDialog(false)}
          />
        )}
      </div>
    );
  }

  // State 3: Ready
  return (
    <div className={styles.container}>
      <HighlightLayer items={highlightItems} />

      {isPickerActive && (
        <ElementPicker
          ownHost={ownHost}
          onPick={handleFieldPicked}
          onCancel={() => setIsPickerActive(false)}
        />
      )}

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarRow}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleScan}
            disabled={isScanning}
          >
            {isScanning ? 'Scanning...' : 'Scan'}
          </button>

          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => setIsPickerActive(true)}
          >
            🎯 Pick Field
          </button>

          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleGetProposals}
            disabled={!fields.length || isProposing}
          >
            {isProposing
              ? `AI ${proposeProgress ? `(${proposeProgress.done}/${proposeProgress.total})` : '...'}`
              : '⚡ Get Answers'}
          </button>

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => setQaMenuOpen(!qaMenuOpen)}
              disabled={!fields.length}
            >
              QA Fill ▾
            </button>
            {qaMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: '#151824',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '6px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: '120px',
                  overflow: 'hidden',
                }}
              >
                {(['first', 'last', 'random', 'placeholder', 'long'] as QaMode[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#e8e8f0',
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontSize: '11px',
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => handleQaFill(m)}
                  >
                    {m} answer
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => setShowConfirmDialog(true)}
            disabled={!currentPlan.length || isFilling}
            style={{ background: '#34c759' }}
          >
            Autofill ({currentPlan.length})
          </button>

          {undoFn && (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                undoFn();
                setUndoFn(null);
                setStatusText('Undid last fill for supported fields.');
              }}
            >
              Undo
            </button>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => setShowAuditViewer(true)}
              title="Audit Log"
              style={{ padding: '6px 8px' }}
            >
              📋
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => setShowSettingsDialog(true)}
              title="Autofill Settings"
              style={{ padding: '6px 8px' }}
            >
              ⚙️
            </button>
          </div>
        </div>

        <div className={styles.toolbarStats} aria-live="polite">
          <span>{fields.length} detected</span> · <span>{checkedIds.size} ready to fill</span>
          {statusText && <span style={{ color: '#00ffd2', marginLeft: 'auto' }}>{statusText}</span>}
        </div>
      </div>

      {/* Field List */}
      <div className={styles.fieldList}>
        {fields.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'rgba(232, 232, 240, 0.4)' }}>
            No answerable fields found on this page. Click <strong>Scan</strong> or <strong>Pick Field</strong> to detect questions.
          </div>
        ) : (
          fields.map(h => (
            <ProposalRow
              key={h.info.id}
              handle={h}
              proposal={proposals.get(h.info.id)}
              checked={checkedIds.has(h.info.id)}
              onToggleChecked={(isChecked) => {
                const updated = new Set(checkedIds);
                if (isChecked) updated.add(h.info.id);
                else updated.delete(h.info.id);
                setCheckedIds(updated);
              }}
              onChangeProposal={(prop) => {
                const updated = new Map(proposals);
                updated.set(prop.fieldId, prop);
                setProposals(updated);
              }}
              onHover={(isHovering) => {
                setHoveredFieldId(isHovering ? h.info.id : null);
              }}
            />
          ))
        )}
      </div>

      {/* Confirm Fill Dialog */}
      {showConfirmDialog && (
        <ConfirmFillDialog
          host={hostname}
          plan={currentPlan}
          handles={handlesMap}
          isFilling={isFilling}
          fillOutcome={fillOutcome}
          onConfirm={handleExecuteFill}
          onCancel={() => {
            setShowConfirmDialog(false);
            setFillOutcome(null);
          }}
          onUndo={() => {
            if (undoFn) {
              undoFn();
              setUndoFn(null);
            }
          }}
          onRescan={() => {
            setShowConfirmDialog(false);
            setFillOutcome(null);
            handleScan();
          }}
        />
      )}

      {/* Settings Dialog */}
      {showSettingsDialog && settings && (
        <AutofillSettings
          settings={settings}
          onSave={saveSettings}
          onClose={() => setShowSettingsDialog(false)}
        />
      )}

      {/* Audit Viewer Dialog */}
      {showAuditViewer && (
        <AuditViewer onClose={() => setShowAuditViewer(false)} />
      )}
    </div>
  );
}
