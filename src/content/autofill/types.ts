// ─── Autofill Field Types ────────────────────────────────────────────────────

export type FieldKind = 'choice' | 'text' | 'longtext' | 'select' | 'code';
export type EditorType =
  | 'monaco'
  | 'codemirror5'
  | 'codemirror6'
  | 'ace'
  | 'textarea'
  | 'contenteditable';

export interface OptionInfo {
  id: string;
  label: string;
}

/** Serialisable — what the UI shows and what is sent (without DOM) to the model. */
export interface FieldInfo {
  id: string;                     // "f1", "f2"… valid for one scan only
  kind: FieldKind;
  multi: boolean;                 // choice: more than one answer allowed
  question: string;               // question/label text (<= 1500 chars; code: problem text <= 4000)
  options: OptionInfo[];          // "o1", "o2"… (choice/select)
  maxLength?: number;
  language?: string;              // code
  confidence: number;             // detector confidence 0..1
  source: 'native' | 'aria' | 'heuristic' | 'picked';
  currentlyFilled: boolean;
}

/** NOT serialisable — stays in the content script. */
export interface FieldHandle {
  info: FieldInfo;
  els: Element[];                 // controls
  optionEls: Element[];           // same order as info.options
  root: Element;                  // used for highlight and editor targeting
  editor?: EditorType;
  fingerprint: string;            // detects page changes between scan and fill
}

export interface Proposal {
  fieldId: string;
  optionIds?: string[];
  text?: string;
  code?: string;
  language?: string;
  confidence: number;             // 0..1
}

export interface PlanItem {
  fieldId: string;
  optionIds?: string[];
  text?: string;
  code?: string;
  language?: string;
  overwrite: boolean;             // allow replacing an existing answer
  setLanguageDropdown?: boolean;  // code: also try to switch a nearby language <select>
}

export type FillStatus = 'filled' | 'skipped' | 'failed';

export interface FillResult {
  fieldId: string;
  status: FillStatus;
  detail: string;
}
