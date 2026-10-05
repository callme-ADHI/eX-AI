import React, { useState, useEffect } from 'react';
import { parseAnswerLine, extractCodeBlocks, mapTokenToOptionId } from '../../autofill/fromChat';
import { scanPage } from '../../autofill/detect';
import { applyPlan, type ApplyOutcome } from '../../autofill/fill';
import { isAutofillAllowed } from '../../../shared/autofillPolicy';
import type { ExAISettings } from '../../../shared/aiTypes';
import type { FieldHandle, PlanItem } from '../../autofill/types';
import ConfirmFillDialog from '../autofill/ConfirmFillDialog';
import styles from './chat.module.css';

interface Props {
  content: string;
}

export default function ChatFillButtons({ content }: Props) {
  const [settings, setSettings] = useState<ExAISettings | null>(null);
  const [activePlan, setActivePlan] = useState<PlanItem[] | null>(null);
  const [handles, setHandles] = useState<Map<string, FieldHandle>>(new Map());
  const [isFilling, setIsFilling] = useState(false);
  const [fillOutcome, setFillOutcome] = useState<ApplyOutcome | null>(null);
  const [pickerChoices, setPickerChoices] = useState<FieldHandle[] | null>(null);
  const [pendingChoiceTokens, setPendingChoiceTokens] = useState<string[] | null>(null);
  const [pendingCodeItem, setPendingCodeItem] = useState<{ code: string; lang: string } | null>(null);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'AI_SETTINGS_GET' }, res => {
      if (res?.data?.settings) {
        setSettings(res.data.settings);
      }
    });
  }, []);

  const hostname = window.location.hostname;
  const isAllowed =
    settings?.autofillEnabled &&
    isAutofillAllowed(hostname, settings?.autofillAllow || []).allowed;

  if (!isAllowed) return null;

  const answerParsed = parseAnswerLine(content);
  const codeBlocks = extractCodeBlocks(content);

  if (!answerParsed && codeBlocks.length === 0) return null;

  const getPageHandles = (): FieldHandle[] => {
    const res = scanPage({
      ownHost: null,
      isVisible: el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      },
    });
    const map = new Map(res.fields.map(f => [f.info.id, f]));
    setHandles(map);
    return res.fields;
  };

  const handleSelectOptionClick = () => {
    if (!answerParsed) return;
    const pageFields = getPageHandles();
    const choiceFields = pageFields.filter(f => f.info.kind === 'choice');
    if (!choiceFields.length) return;

    if (choiceFields.length === 1) {
      applyOptionToField(choiceFields[0], answerParsed.tokens);
    } else {
      setPendingChoiceTokens(answerParsed.tokens);
      setPickerChoices(choiceFields);
    }
  };

  const applyOptionToField = (field: FieldHandle, tokens: string[]) => {
    const optionIds: string[] = [];
    for (const t of tokens) {
      const oid = mapTokenToOptionId(field, t);
      if (oid) optionIds.push(oid);
    }
    if (!optionIds.length) return;

    setActivePlan([
      {
        fieldId: field.info.id,
        optionIds,
        overwrite: true,
      },
    ]);
    setPickerChoices(null);
    setPendingChoiceTokens(null);
  };

  const handleFillEditorClick = () => {
    if (!codeBlocks.length) return;
    const pageFields = getPageHandles();
    const codeFields = pageFields.filter(f => f.info.kind === 'code');
    if (!codeFields.length) return;

    const block = codeBlocks[0];
    if (codeFields.length === 1) {
      applyCodeToField(codeFields[0], block.code, block.lang);
    } else {
      setPendingCodeItem(block);
      setPickerChoices(codeFields);
    }
  };

  const applyCodeToField = (field: FieldHandle, code: string, lang: string) => {
    setActivePlan([
      {
        fieldId: field.info.id,
        code,
        language: lang || field.info.language,
        overwrite: true,
        setLanguageDropdown: true,
      },
    ]);
    setPickerChoices(null);
    setPendingCodeItem(null);
  };

  const handleConfirmFill = async () => {
    if (!activePlan) return;
    setIsFilling(true);
    try {
      const outcome = await applyPlan(activePlan, {
        delayMs: settings?.autofillDelayMs ?? 80,
        handles,
        setLanguageDropdown: true,
      });
      setFillOutcome(outcome);
    } finally {
      setIsFilling(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
        {answerParsed && (
          <button
            type="button"
            className={styles.actionBtnSmall}
            onClick={handleSelectOptionClick}
            title="Select proposed option on page"
            style={{ color: '#00ffd2', borderColor: 'rgba(0, 255, 210, 0.3)' }}
          >
            ✓ Select option ({answerParsed.tokens.join(', ')})
          </button>
        )}

        {codeBlocks.length > 0 && (
          <button
            type="button"
            className={styles.actionBtnSmall}
            onClick={handleFillEditorClick}
            title="Fill code block into page editor"
            style={{ color: '#00ffd2', borderColor: 'rgba(0, 255, 210, 0.3)' }}
          >
            ⚡ Fill editor
          </button>
        )}
      </div>

      {/* Target Question Picker Modal when multiple fields exist */}
      {pickerChoices && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#151824',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px',
              padding: '16px',
              maxWidth: '360px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <h4 style={{ margin: 0, fontSize: '13px', color: '#ffffff' }}>
              Select target question
            </h4>
            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {pickerChoices.map(f => (
                <button
                  key={f.info.id}
                  type="button"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    textAlign: 'left',
                    color: '#e8e8f0',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    if (pendingChoiceTokens) applyOptionToField(f, pendingChoiceTokens);
                    else if (pendingCodeItem) applyCodeToField(f, pendingCodeItem.code, pendingCodeItem.lang);
                  }}
                >
                  {f.info.question.slice(0, 80) || `Field ${f.info.id}`}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.actionBtnSmall}
              onClick={() => {
                setPickerChoices(null);
                setPendingChoiceTokens(null);
                setPendingCodeItem(null);
              }}
              style={{ alignSelf: 'flex-end' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Confirm Fill Dialog */}
      {activePlan && (
        <ConfirmFillDialog
          host={hostname}
          plan={activePlan}
          handles={handles}
          isFilling={isFilling}
          fillOutcome={fillOutcome}
          onConfirm={handleConfirmFill}
          onCancel={() => {
            setActivePlan(null);
            setFillOutcome(null);
          }}
          onUndo={() => {
            fillOutcome?.undo();
          }}
          onRescan={() => {
            setActivePlan(null);
            setFillOutcome(null);
          }}
        />
      )}
    </>
  );
}
