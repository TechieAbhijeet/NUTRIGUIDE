import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck,
  Upload,
  Database,
  AlertTriangle,
  Check,
  RefreshCw,
  FileText,
  Download,
  Search,
  Pencil,
  Trash2,
  Plus,
  X,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import { collection, deleteDoc, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { ConditionType, FoodItem, FoodType, RatingRule } from '../types';
import {
  DEFAULT_DRAFT_RATING_RULES,
  SAMPLE_FOODS_CSV,
  SAMPLE_INDIAN_FOODS,
  normalizeFoodType,
} from '../lib/sampleFoods';
import { evaluateFood, formatConditionName } from '../lib/ratingEngine';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { getTodayLocalDate } from '../lib/dateUtils';

interface AdminViewProps {
  currentFoods: FoodItem[];
  currentRules: RatingRule[];
  onRefreshData: () => Promise<void>;
}

const VALID_CONDITIONS: ConditionType[] = ['diabetes', 'hypertension', 'ckd'];

const STANDARD_NUMERIC_ORDER = [
  'carbs',
  'sugars',
  'sodium',
  'potassium',
  'phosphorus',
  'fiber',
  'protein',
  'kcal',
  'servingGrams',
];

interface EditableRuleForm {
  condition: ConditionType;
  nutrient: string;
  moderateAbove: string;
  limitAbove: string;
  unit: string;
  notes: string;
  approved: boolean;
  approvedBy: string;
  approvedDate: string;
}

interface RuleFieldErrors {
  condition?: string;
  nutrient?: string;
  moderateAbove?: string;
  limitAbove?: string;
}

interface RuleImpactSummary {
  suitable: number;
  moderate: number;
  limit: number;
  total: number;
  conditions: ConditionType[];
}

function createEmptyRuleForm(defaultNutrient: string): EditableRuleForm {
  return {
    condition: 'diabetes',
    nutrient: defaultNutrient,
    moderateAbove: '',
    limitAbove: '',
    unit: '',
    notes: '',
    approved: false,
    approvedBy: '',
    approvedDate: '',
  };
}

function ruleToForm(rule: RatingRule): EditableRuleForm {
  return {
    condition: rule.condition,
    nutrient: rule.nutrient,
    moderateAbove: String(rule.moderateAbove),
    limitAbove: String(rule.limitAbove),
    unit: rule.unit || '',
    notes: rule.notes ?? rule.disclaimer ?? '',
    approved: Boolean(rule.approved),
    approvedBy: rule.approvedBy || '',
    approvedDate: rule.approvedDate || '',
  };
}

type AdminFoodDoc = FoodItem & Record<string, unknown>;

const VALID_FOOD_TYPES: FoodType[] = [
  'meal',
  'fruit',
  'vegetable',
  'grain',
  'pulse',
  'dairy',
  'snack',
  'drink',
];

const STANDARD_CSV_COLUMNS = [
  'name',
  'category',
  'type',
  'icon',
  'servingLabel',
  'servingGrams',
  'kcal',
  'carbs',
  'sugars',
  'fiber',
  'protein',
  'sodium',
  'potassium',
  'phosphorus',
  'isVeg',
  'source',
  'reviewedBy',
  'reviewedDate',
] as const;

const REQUIRED_NUMERIC_FOOD_FIELDS = [
  'servingGrams',
  'kcal',
  'carbs',
  'protein',
  'sodium',
  'potassium',
  'phosphorus',
] as const;

const OPTIONAL_NULLABLE_NUMERIC_FIELDS = ['sugars', 'fiber'] as const;

const NUMERIC_FOOD_FIELDS = [
  'servingGrams',
  'kcal',
  'carbs',
  'sugars',
  'fiber',
  'protein',
  'sodium',
  'potassium',
  'phosphorus',
] as const;

const STANDARD_COLUMN_SET = new Set<string>(
  STANDARD_CSV_COLUMNS.map(col => col.toLowerCase())
);

const FORBIDDEN_EXTRA_KEYS = new Set(['id', '__proto__', 'constructor', 'prototype']);

function toFoodSlugId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      if (currentRow.some(cell => cell !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else if (ch === '\n') {
      currentRow.push(currentField.trim());
      if (currentRow.some(cell => cell !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  currentRow.push(currentField.trim());
  if (currentRow.some(cell => cell !== '')) {
    rows.push(currentRow);
  }

  return rows;
}

function parseStrictNumber(raw: string): { ok: true; value: number } | { ok: false } {
  const trimmed = raw.trim();
  if (!trimmed || !/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { ok: false };
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) {
    return { ok: false };
  }
  return { ok: true, value: num };
}

function parseNullableFoodNumber(
  raw: string
): { ok: true; value: number | null; isMissing: boolean } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.toLowerCase() === '(empty)') {
    return { ok: true, value: null, isMissing: true };
  }
  const strict = parseStrictNumber(trimmed);
  if (!strict.ok) {
    return { ok: false };
  }
  return { ok: true, value: strict.value, isMissing: false };
}

function parseUnknownFieldValue(raw: string): string | number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num;
  }
  return trimmed;
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

interface ParsedValidRow {
  rowNumber: number;
  docId: string;
  action: 'new' | 'update';
  payload: Record<string, unknown>;
}

interface ParsedErrorRow {
  rowNumber: number;
  name: string;
  reasons: string[];
}

interface ImportPreview {
  newCount: number;
  updatedCount: number;
  missingSugarsOrFiberCount: number;
  validRows: ParsedValidRow[];
  errorRows: ParsedErrorRow[];
  extraColumns: string[];
}

interface EditableFoodForm {
  name: string;
  category: string;
  type: FoodType;
  icon: string;
  servingLabel: string;
  servingGrams: string;
  kcal: string;
  carbs: string;
  sugars: string;
  fiber: string;
  protein: string;
  sodium: string;
  potassium: string;
  phosphorus: string;
  isVeg: boolean;
  source: string;
  reviewedBy: string;
  reviewedDate: string;
  extras: Record<string, string>;
}

function createEmptyFoodForm(extraColumns: string[]): EditableFoodForm {
  const extras: Record<string, string> = {};
  for (const col of extraColumns) {
    extras[col] = '';
  }
  return {
    name: '',
    category: '',
    type: 'snack',
    icon: '',
    servingLabel: '',
    servingGrams: '100',
    kcal: '0',
    carbs: '0',
    sugars: '',
    fiber: '',
    protein: '0',
    sodium: '0',
    potassium: '0',
    phosphorus: '0',
    isVeg: true,
    source: '',
    reviewedBy: '',
    reviewedDate: '',
    extras,
  };
}

function foodToForm(food: AdminFoodDoc, extraColumns: string[]): EditableFoodForm {
  const extras: Record<string, string> = {};
  for (const col of extraColumns) {
    const val = food[col];
    extras[col] = val !== undefined && val !== null ? String(val) : '';
  }
  return {
    name: String(food.name || ''),
    category: String(food.category || ''),
    type: VALID_FOOD_TYPES.includes(food.type as FoodType)
      ? (food.type as FoodType)
      : normalizeFoodType(undefined, food.category),
    icon: String(food.icon || ''),
    servingLabel: String(food.servingLabel || ''),
    servingGrams: String(food.servingGrams ?? 100),
    kcal: String(food.kcal ?? 0),
    carbs: String(food.carbs ?? 0),
    sugars: food.sugars !== null && food.sugars !== undefined ? String(food.sugars) : '',
    fiber: food.fiber !== null && food.fiber !== undefined ? String(food.fiber) : '',
    protein: String(food.protein ?? 0),
    sodium: String(food.sodium ?? 0),
    potassium: String(food.potassium ?? 0),
    phosphorus: String(food.phosphorus ?? 0),
    isVeg: Boolean(food.isVeg),
    source: String(food.source || ''),
    reviewedBy: String(food.reviewedBy || ''),
    reviewedDate: String(food.reviewedDate || ''),
    extras,
  };
}

function validateFormToPayload(
  form: EditableFoodForm
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  const name = form.name.trim();
  if (!name) return { ok: false, error: 'Food name is required.' };
  if (!toFoodSlugId(name)) return { ok: false, error: 'Food name must contain letters or numbers.' };
  if (!VALID_FOOD_TYPES.includes(form.type)) {
    return { ok: false, error: `Invalid type "${form.type}".` };
  }

  const parsedNums: Record<string, number> = {};
  for (const field of REQUIRED_NUMERIC_FOOD_FIELDS) {
    const res = parseStrictNumber(form[field]);
    if (!res.ok) {
      return { ok: false, error: `${field} must be a valid non-negative number.` };
    }
    parsedNums[field] = res.value;
  }

  const parsedNullableNums: Record<'sugars' | 'fiber', number | null> = {
    sugars: null,
    fiber: null,
  };
  for (const field of OPTIONAL_NULLABLE_NUMERIC_FIELDS) {
    const res = parseNullableFoodNumber(form[field]);
    if (!res.ok) {
      return { ok: false, error: `${field} must be a valid non-negative number or blank.` };
    }
    parsedNullableNums[field] = res.value;
  }

  const payload: Record<string, unknown> = {
    name,
    category: form.category.trim(),
    type: form.type,
    icon: form.icon.trim(),
    servingLabel: form.servingLabel.trim(),
    servingGrams: parsedNums.servingGrams,
    kcal: parsedNums.kcal,
    carbs: parsedNums.carbs,
    sugars: parsedNullableNums.sugars,
    fiber: parsedNullableNums.fiber,
    protein: parsedNums.protein,
    sodium: parsedNums.sodium,
    potassium: parsedNums.potassium,
    phosphorus: parsedNums.phosphorus,
    isVeg: Boolean(form.isVeg),
    source: form.source.trim(),
    reviewedBy: form.reviewedBy.trim(),
    reviewedDate: form.reviewedDate.trim(),
  };

  for (const [k, rawVal] of Object.entries(form.extras)) {
    if (FORBIDDEN_EXTRA_KEYS.has(k) || STANDARD_COLUMN_SET.has(k.toLowerCase())) continue;
    const parsedExtra = parseUnknownFieldValue(rawVal);
    if (parsedExtra !== undefined) {
      payload[k] = parsedExtra;
    }
  }

  return { ok: true, payload };
}

export const AdminView: React.FC<AdminViewProps> = ({
  currentFoods,
  onRefreshData,
}) => {
  const { user, profile, isAdmin } = useAuth();

  const [dbFoods, setDbFoods] = useState<AdminFoodDoc[]>([]);
  const [loadingDbFoods, setLoadingDbFoods] = useState(false);

  const [dbRules, setDbRules] = useState<RatingRule[]>([]);
  const [loadingDbRules, setLoadingDbRules] = useState(false);

  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importingFoods, setImportingFoods] = useState(false);
  const [seedingRules, setSeedingRules] = useState(false);
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [tableSearch, setTableSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditableFoodForm | null>(null);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);

  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deleteAllInput, setDeleteAllInput] = useState('');
  const [deletingAll, setDeletingAll] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFirestoreFoods = async (): Promise<AdminFoodDoc[]> => {
    if (!isAdmin || !user) return [];
    setLoadingDbFoods(true);
    try {
      const snap = await getDocs(collection(db, 'foods'));
      const list: AdminFoodDoc[] = [];
      snap.forEach(docSnap => {
        list.push({
          ...(docSnap.data() as Omit<FoodItem, 'id'> & Record<string, unknown>),
          id: docSnap.id,
        } as AdminFoodDoc);
      });
      list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      setDbFoods(list);
      return list;
    } catch (err: any) {
      handleFirestoreError(err, OperationType.GET, 'foods');
      setErrorMsg(err?.message || 'Failed to load foods from Firestore.');
      return [];
    } finally {
      setLoadingDbFoods(false);
    }
  };

  const loadFirestoreRules = async (): Promise<RatingRule[]> => {
    if (!isAdmin || !user) return [];
    setLoadingDbRules(true);
    try {
      const snap = await getDocs(collection(db, 'ratingRules'));
      const list: RatingRule[] = [];
      snap.forEach(docSnap => {
        list.push({
          ...(docSnap.data() as Omit<RatingRule, 'id'>),
          id: docSnap.id,
        });
      });
      list.sort((a, b) =>
        `${a.condition}-${a.nutrient}`.localeCompare(`${b.condition}-${b.nutrient}`)
      );
      setDbRules(list);
      return list;
    } catch (err: any) {
      handleFirestoreError(err, OperationType.GET, 'ratingRules');
      setErrorMsg(err?.message || 'Failed to load rating rules from Firestore.');
      return [];
    } finally {
      setLoadingDbRules(false);
    }
  };

  useEffect(() => {
    if (isAdmin && user) {
      loadFirestoreFoods();
      loadFirestoreRules();
    }
  }, [isAdmin, user]);

  const extraColumns = useMemo(() => {
    const keys = new Set<string>();
    for (const food of dbFoods) {
      for (const k of Object.keys(food)) {
        if (FORBIDDEN_EXTRA_KEYS.has(k)) continue;
        if (!STANDARD_COLUMN_SET.has(k.toLowerCase())) {
          keys.add(k);
        }
      }
    }
    return Array.from(keys).sort();
  }, [dbFoods]);

  const availableFoodNumericFields = useMemo(() => {
    const sourceFoods: Record<string, unknown>[] =
      dbFoods.length > 0
        ? dbFoods
        : currentFoods.length > 0
        ? (currentFoods as unknown as Record<string, unknown>[])
        : (SAMPLE_INDIAN_FOODS as unknown as Record<string, unknown>[]);

    const numericKeys = new Set<string>();
    for (const food of sourceFoods) {
      for (const [key, val] of Object.entries(food)) {
        if (FORBIDDEN_EXTRA_KEYS.has(key)) continue;
        if (typeof val === 'number' && Number.isFinite(val)) {
          numericKeys.add(key);
        }
      }
    }

    return Array.from(numericKeys).sort((a, b) => {
      const ia = STANDARD_NUMERIC_ORDER.indexOf(a);
      const ib = STANDARD_NUMERIC_ORDER.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [dbFoods, currentFoods]);

  const [addForm, setAddForm] = useState<EditableFoodForm>(() => createEmptyFoodForm([]));
  const [addingFood, setAddingFood] = useState(false);

  const [addRuleForm, setAddRuleForm] = useState<EditableRuleForm>(() =>
    createEmptyRuleForm('carbs')
  );
  const [addRuleErrors, setAddRuleErrors] = useState<RuleFieldErrors>({});
  const [addingRule, setAddingRule] = useState(false);

  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingRuleWasApproved, setEditingRuleWasApproved] = useState(false);
  const [editRuleForm, setEditRuleForm] = useState<EditableRuleForm | null>(null);
  const [editRuleErrors, setEditRuleErrors] = useState<RuleFieldErrors>({});
  const [savingRuleId, setSavingRuleId] = useState<string | null>(null);
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);
  const [confirmDeleteRuleId, setConfirmDeleteRuleId] = useState<string | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [ruleImpactSummary, setRuleImpactSummary] = useState<RuleImpactSummary | null>(null);

  useEffect(() => {
    setAddForm(prev => {
      const nextExtras: Record<string, string> = {};
      for (const col of extraColumns) {
        nextExtras[col] = prev.extras[col] ?? '';
      }
      return { ...prev, extras: nextExtras };
    });
  }, [extraColumns]);

  useEffect(() => {
    if (
      availableFoodNumericFields.length > 0 &&
      !availableFoodNumericFields.includes(addRuleForm.nutrient)
    ) {
      setAddRuleForm(prev => ({ ...prev, nutrient: availableFoodNumericFields[0] }));
    }
  }, [availableFoodNumericFields, addRuleForm.nutrient]);

  const filteredFoods = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return dbFoods;
    return dbFoods.filter(food => {
      const fields = [
        food.id,
        food.name,
        food.category,
        food.type,
        food.servingLabel,
        food.source,
        food.reviewedBy,
        food.reviewedDate,
        ...extraColumns.map(c => food[c]),
      ];
      return fields.some(v => String(v ?? '').toLowerCase().includes(q));
    });
  }, [dbFoods, tableSearch, extraColumns]);

  if (!isAdmin || !user) {
    return (
      <div className="pb-24 max-w-lg mx-auto px-4 pt-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-950 text-red-600 mx-auto flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
          Admin Access Required
        </h2>
        <p className="text-xs text-stone-500 mt-1 max-w-xs mx-auto">
          This portal is restricted strictly to verified administrators (admins/{user?.uid || 'uid'} document exists with verified email).
        </p>
      </div>
    );
  }

  const buildImportPreview = (rawCsv: string): ImportPreview => {
    const rows = parseCsvRows(rawCsv);
    if (rows.length < 2) {
      throw new Error('CSV must contain a header row and at least one data row.');
    }

    const rawHeaders = rows[0].map(h => h.trim());

    const headerIndex = new Map<string, number>();
    const unknownHeaderCols: { name: string; index: number }[] = [];

    rawHeaders.forEach((origName, idx) => {
      const lower = origName.toLowerCase();
      if (!origName) return;
      if (STANDARD_COLUMN_SET.has(lower)) {
        if (!headerIndex.has(lower)) {
          headerIndex.set(lower, idx);
        }
      } else if (!FORBIDDEN_EXTRA_KEYS.has(lower) && !FORBIDDEN_EXTRA_KEYS.has(origName)) {
        unknownHeaderCols.push({ name: origName, index: idx });
      }
    });

    if (!headerIndex.has('name')) {
      throw new Error('CSV header row must include a "name" column.');
    }

    const existingIds = new Set(dbFoods.map(f => f.id));
    const seenValidIds = new Set<string>();
    const validRows: ParsedValidRow[] = [];
    const errorRows: ParsedErrorRow[] = [];
    let newCount = 0;
    let updatedCount = 0;
    let missingSugarsOrFiberCount = 0;

    const getCell = (cols: string[], colKey: string): string => {
      const idx = headerIndex.get(colKey.toLowerCase());
      return idx !== undefined && idx < cols.length ? cols[idx] : '';
    };

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      const rowNumber = i + 1;
      const reasons: string[] = [];

      const rawName = getCell(cols, 'name').trim();
      const docId = toFoodSlugId(rawName);
      if (!rawName) {
        reasons.push('Missing food name');
      } else if (!docId) {
        reasons.push('Name cannot form a valid ID');
      }

      const category = getCell(cols, 'category').trim();

      let foodType: FoodType = 'snack';
      if (headerIndex.has('type')) {
        const rawType = getCell(cols, 'type').trim().toLowerCase();
        if (!VALID_FOOD_TYPES.includes(rawType as FoodType)) {
          reasons.push(
            `Unknown type "${getCell(cols, 'type').trim() || '(empty)'}" (expected: ${VALID_FOOD_TYPES.join(', ')})`
          );
        } else {
          foodType = rawType as FoodType;
        }
      } else {
        foodType = normalizeFoodType(undefined, category);
      }

      const numericValues: Record<string, number> = {};
      for (const numCol of REQUIRED_NUMERIC_FOOD_FIELDS) {
        const lowerKey = numCol.toLowerCase();
        if (headerIndex.has(lowerKey)) {
          const rawVal = getCell(cols, lowerKey);
          const parsed = parseStrictNumber(rawVal);
          if (!parsed.ok) {
            reasons.push(
              `Non-numeric nutrient value for ${numCol}: "${rawVal.trim() || '(empty)'}"`
            );
          } else {
            numericValues[numCol] = parsed.value;
          }
        } else {
          numericValues[numCol] = numCol === 'servingGrams' ? 100 : 0;
        }
      }

      const nullableValues: Record<'sugars' | 'fiber', number | null> = {
        sugars: null,
        fiber: null,
      };
      let hasMissingSugarsOrFiber = false;
      for (const optCol of OPTIONAL_NULLABLE_NUMERIC_FIELDS) {
        const lowerKey = optCol.toLowerCase();
        if (!headerIndex.has(lowerKey)) {
          nullableValues[optCol] = null;
          hasMissingSugarsOrFiber = true;
        } else {
          const rawVal = getCell(cols, lowerKey);
          const parsed = parseNullableFoodNumber(rawVal);
          if (!parsed.ok) {
            reasons.push(
              `Non-numeric nutrient value for ${optCol}: "${rawVal.trim() || '(empty)'}"`
            );
          } else {
            nullableValues[optCol] = parsed.value;
            if (parsed.isMissing) {
              hasMissingSugarsOrFiber = true;
            }
          }
        }
      }

      if (reasons.length > 0) {
        errorRows.push({
          rowNumber,
          name: rawName || '(blank)',
          reasons,
        });
        continue;
      }

      if (hasMissingSugarsOrFiber) {
        missingSugarsOrFiberCount++;
      }

      const rawIsVeg = getCell(cols, 'isveg').trim().toLowerCase();
      const isVeg = headerIndex.has('isveg') ? rawIsVeg === 'true' || rawIsVeg === '1' || rawIsVeg === 'yes' : true;

      const payload: Record<string, unknown> = {
        name: rawName,
        category,
        type: foodType,
        icon: getCell(cols, 'icon').trim(),
        servingLabel: getCell(cols, 'servinglabel').trim(),
        servingGrams: numericValues.servingGrams,
        kcal: numericValues.kcal,
        carbs: numericValues.carbs,
        sugars: nullableValues.sugars,
        fiber: nullableValues.fiber,
        protein: numericValues.protein,
        sodium: numericValues.sodium,
        potassium: numericValues.potassium,
        phosphorus: numericValues.phosphorus,
        isVeg,
        source: getCell(cols, 'source').trim(),
        reviewedBy: getCell(cols, 'reviewedby').trim(),
        reviewedDate: getCell(cols, 'revieweddate').trim(),
      };

      for (const extraCol of unknownHeaderCols) {
        if (extraCol.index < cols.length) {
          const val = parseUnknownFieldValue(cols[extraCol.index]);
          if (val !== undefined) {
            payload[extraCol.name] = val;
          }
        }
      }

      const isUpdate = existingIds.has(docId) || seenValidIds.has(docId);
      if (isUpdate) {
        updatedCount++;
      } else {
        newCount++;
      }
      seenValidIds.add(docId);

      validRows.push({
        rowNumber,
        docId,
        action: isUpdate ? 'update' : 'new',
        payload,
      });
    }

    return {
      newCount,
      updatedCount,
      missingSugarsOrFiberCount,
      validRows,
      errorRows,
      extraColumns: unknownHeaderCols.map(c => c.name),
    };
  };

  const handlePreviewCsv = (overrideText?: string) => {
    if (!isAdmin || !user) return;
    const text = overrideText !== undefined ? overrideText : csvText;
    setStatusMsg('');
    setErrorMsg('');

    if (!text.trim()) {
      setPreview(null);
      setErrorMsg('Please paste CSV data or upload a .csv file.');
      return;
    }

    try {
      const nextPreview = buildImportPreview(text);
      setPreview(nextPreview);
    } catch (err: any) {
      setPreview(null);
      setErrorMsg(err?.message || 'Unable to parse CSV.');
    }
  };

  const handleUploadCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin || !user) return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      setCsvText(text);
      handlePreviewCsv(text);
    } catch {
      setErrorMsg('Could not read the selected CSV file.');
    }
  };

  const handleFillSampleCsv = () => {
    if (!isAdmin || !user) return;
    setCsvText(SAMPLE_FOODS_CSV);
    setPreview(null);
    setErrorMsg('');
    setStatusMsg(
      `Sample CSV (${SAMPLE_INDIAN_FOODS.length} Indian foods & meals) loaded. Click "Preview import" to review.`
    );
  };

  const handleConfirmImport = async () => {
    if (!isAdmin || !user || !preview || preview.validRows.length === 0) return;

    setImportingFoods(true);
    setStatusMsg('');
    setErrorMsg('');

    try {
      // Deduplicate by docId keeping the latest row in CSV order so batches stay clean
      const deduped = new Map<string, Record<string, unknown>>();
      for (const row of preview.validRows) {
        deduped.set(row.docId, row.payload);
      }

      const entries = Array.from(deduped.entries());
      for (let i = 0; i < entries.length; i += 400) {
        const chunk = entries.slice(i, i + 400);
        const batch = writeBatch(db);
        for (const [docId, payload] of chunk) {
          batch.set(doc(db, 'foods', docId), payload);
        }
        await batch.commit();
      }

      await loadFirestoreFoods();
      await onRefreshData();

      setStatusMsg(
        `Imported ${entries.length} valid food(s) (${preview.newCount} new, ${preview.updatedCount} updated${
          preview.errorRows.length > 0 ? `, ${preview.errorRows.length} error row(s) skipped` : ''
        }).`
      );
      setPreview(null);
      setCsvText('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error importing CSV into Firestore.');
      handleFirestoreError(err, OperationType.WRITE, 'foods');
    } finally {
      setImportingFoods(false);
    }
  };

  const handleExportCsv = () => {
    if (!isAdmin || !user) return;
    if (dbFoods.length === 0) {
      setErrorMsg('No foods in Firestore to export.');
      return;
    }

    const headers = [...STANDARD_CSV_COLUMNS, ...extraColumns];
    const lines = [headers.map(escapeCsvCell).join(',')];

    for (const food of dbFoods) {
      const row = headers.map(col => escapeCsvCell(food[col]));
      lines.push(row.join(','));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `foods-export-${getTodayLocalDate()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatusMsg(`Exported ${dbFoods.length} food(s) as CSV.`);
  };

  const handleStartEdit = (food: AdminFoodDoc) => {
    if (!isAdmin || !user) return;
    setEditingId(food.id);
    setEditForm(foodToForm(food, extraColumns));
    setConfirmDeleteId(null);
    setErrorMsg('');
  };

  const handleSaveEdit = async () => {
    if (!isAdmin || !user || !editingId || !editForm) return;
    const validated = validateFormToPayload(editForm);
    if (!validated.ok) {
      setErrorMsg(validated.error);
      return;
    }

    setSavingRowId(editingId);
    setStatusMsg('');
    setErrorMsg('');

    try {
      await setDoc(doc(db, 'foods', editingId), validated.payload);
      await loadFirestoreFoods();
      await onRefreshData();
      setEditingId(null);
      setEditForm(null);
      setStatusMsg(`Updated "${validated.payload.name}" (${editingId}).`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update food.');
      handleFirestoreError(err, OperationType.WRITE, `foods/${editingId}`);
    } finally {
      setSavingRowId(null);
    }
  };

  const handleAddFood = async () => {
    if (!isAdmin || !user) return;
    const validated = validateFormToPayload(addForm);
    if (!validated.ok) {
      setErrorMsg(validated.error);
      return;
    }

    const newId = toFoodSlugId(String(validated.payload.name));
    if (dbFoods.some(f => f.id === newId)) {
      setErrorMsg(`Food with ID "${newId}" already exists. Edit the existing row instead.`);
      return;
    }

    setAddingFood(true);
    setStatusMsg('');
    setErrorMsg('');

    try {
      await setDoc(doc(db, 'foods', newId), validated.payload);
      await loadFirestoreFoods();
      await onRefreshData();
      setAddForm(createEmptyFoodForm(extraColumns));
      setStatusMsg(`Added "${validated.payload.name}" (${newId}).`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to add food.');
      handleFirestoreError(err, OperationType.WRITE, `foods/${newId}`);
    } finally {
      setAddingFood(false);
    }
  };

  const handleConfirmDeleteFood = async (foodId: string, foodName: string) => {
    if (!isAdmin || !user) return;
    setDeletingRowId(foodId);
    setStatusMsg('');
    setErrorMsg('');

    try {
      await deleteDoc(doc(db, 'foods', foodId));
      await loadFirestoreFoods();
      await onRefreshData();
      setConfirmDeleteId(null);
      if (editingId === foodId) {
        setEditingId(null);
        setEditForm(null);
      }
      setStatusMsg(`Deleted "${foodName}" (${foodId}).`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete food.');
      handleFirestoreError(err, OperationType.DELETE, `foods/${foodId}`);
    } finally {
      setDeletingRowId(null);
    }
  };

  const handleConfirmDeleteAll = async () => {
    if (!isAdmin || !user || deleteAllInput.trim() !== 'DELETE ALL') return;
    setDeletingAll(true);
    setStatusMsg('');
    setErrorMsg('');

    try {
      const snap = await getDocs(collection(db, 'foods'));
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const chunk = docs.slice(i, i + 400);
        const batch = writeBatch(db);
        for (const d of chunk) {
          batch.delete(d.ref);
        }
        await batch.commit();
      }
      await loadFirestoreFoods();
      await onRefreshData();
      setShowDeleteAllConfirm(false);
      setDeleteAllInput('');
      setEditingId(null);
      setEditForm(null);
      setStatusMsg(`Deleted all ${docs.length} food(s) from Firestore.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete all foods.');
      handleFirestoreError(err, OperationType.DELETE, 'foods');
    } finally {
      setDeletingAll(false);
    }
  };

  const computeAndSetRuleImpact = (nextRules: RatingRule[]) => {
    const foodsToEval = dbFoods.length > 0 ? dbFoods : currentFoods;
    const userConds = profile?.conditions || [];
    let suitable = 0;
    let moderate = 0;
    let limit = 0;

    for (const food of foodsToEval) {
      const ev = evaluateFood(food, userConds, nextRules);
      if (ev.overallLevel === 'favorable') suitable++;
      else if (ev.overallLevel === 'moderate') moderate++;
      else limit++;
    }

    setRuleImpactSummary({
      suitable,
      moderate,
      limit,
      total: foodsToEval.length,
      conditions: userConds,
    });
  };

  const validateRuleForm = (
    form: EditableRuleForm
  ): { ok: true; moderateAbove: number; limitAbove: number } | { ok: false; errors: RuleFieldErrors } => {
    const errors: RuleFieldErrors = {};

    if (!VALID_CONDITIONS.includes(form.condition)) {
      errors.condition = 'Invalid condition';
    }

    if (!form.nutrient.trim() || !availableFoodNumericFields.includes(form.nutrient.trim())) {
      errors.nutrient = 'Nutrient must exist on foods';
    }

    const modParsed = parseStrictNumber(form.moderateAbove);
    if (!modParsed.ok) {
      errors.moderateAbove = 'Numbers only';
    }

    const limParsed = parseStrictNumber(form.limitAbove);
    if (!limParsed.ok) {
      errors.limitAbove = 'Numbers only';
    }

    if (modParsed.ok && limParsed.ok && modParsed.value >= limParsed.value) {
      errors.moderateAbove = 'Must be lower than limitAbove';
      errors.limitAbove = 'Must be greater than moderateAbove';
    }

    if (Object.keys(errors).length > 0 || !modParsed.ok || !limParsed.ok) {
      return { ok: false, errors };
    }

    return { ok: true, moderateAbove: modParsed.value, limitAbove: limParsed.value };
  };

  const handleAddRule = async () => {
    if (!isAdmin || !user) return;
    setStatusMsg('');
    setErrorMsg('');

    const validated = validateRuleForm(addRuleForm);
    if (!validated.ok) {
      setAddRuleErrors(validated.errors);
      return;
    }

    const slugNutrient = addRuleForm.nutrient
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const ruleId = `${addRuleForm.condition}-${slugNutrient}`;
    if (dbRules.some(r => r.id === ruleId)) {
      setAddRuleErrors({
        nutrient: `Rule "${ruleId}" already exists. Edit the existing row instead.`,
      });
      return;
    }

    setAddRuleErrors({});
    setAddingRule(true);

    try {
      const notes = addRuleForm.notes.trim();
      const payload: Omit<RatingRule, 'id'> = {
        condition: addRuleForm.condition,
        nutrient: addRuleForm.nutrient.trim(),
        moderateAbove: validated.moderateAbove,
        limitAbove: validated.limitAbove,
        unit: addRuleForm.unit.trim(),
        notes,
        disclaimer: notes || 'DRAFT dietary heuristic: not a substitute for your care team.',
        approved: addRuleForm.approved,
        approvedBy: addRuleForm.approved ? addRuleForm.approvedBy.trim() || user.email || '' : '',
        approvedDate: addRuleForm.approved
          ? addRuleForm.approvedDate.trim() || getTodayLocalDate()
          : '',
      };

      await setDoc(doc(db, 'ratingRules', ruleId), payload);
      const updated = await loadFirestoreRules();
      await onRefreshData();
      computeAndSetRuleImpact(updated);
      setAddRuleForm(createEmptyRuleForm(availableFoodNumericFields[0] || 'carbs'));
      setStatusMsg(`Added rule ${addRuleForm.condition} · ${addRuleForm.nutrient}.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to add rating rule.');
      handleFirestoreError(err, OperationType.WRITE, `ratingRules/${ruleId}`);
    } finally {
      setAddingRule(false);
    }
  };

  const handleStartEditRule = (rule: RatingRule) => {
    if (!isAdmin || !user) return;
    setEditingRuleId(rule.id);
    setEditingRuleWasApproved(Boolean(rule.approved));
    const form = ruleToForm(rule);
    if (rule.approved) {
      form.approved = false;
    }
    setEditRuleForm(form);
    setEditRuleErrors({});
    setConfirmDeleteRuleId(null);
    setErrorMsg('');
  };

  const handleSaveRuleEdit = async () => {
    if (!isAdmin || !user || !editingRuleId || !editRuleForm) return;
    setStatusMsg('');
    setErrorMsg('');

    const validated = validateRuleForm(editRuleForm);
    if (!validated.ok) {
      setEditRuleErrors(validated.errors);
      return;
    }

    setEditRuleErrors({});
    setSavingRuleId(editingRuleId);

    try {
      const notes = editRuleForm.notes.trim();
      const nextApproved = editingRuleWasApproved ? false : Boolean(editRuleForm.approved);
      const payload: Omit<RatingRule, 'id'> = {
        condition: editRuleForm.condition,
        nutrient: editRuleForm.nutrient.trim(),
        moderateAbove: validated.moderateAbove,
        limitAbove: validated.limitAbove,
        unit: editRuleForm.unit.trim(),
        notes,
        disclaimer: notes || 'DRAFT dietary heuristic: not a substitute for your care team.',
        approved: nextApproved,
        approvedBy: nextApproved ? editRuleForm.approvedBy.trim() || user.email || '' : '',
        approvedDate: nextApproved
          ? editRuleForm.approvedDate.trim() || getTodayLocalDate()
          : '',
      };

      await setDoc(doc(db, 'ratingRules', editingRuleId), payload);
      const updated = await loadFirestoreRules();
      await onRefreshData();
      computeAndSetRuleImpact(updated);
      setEditingRuleId(null);
      setEditingRuleWasApproved(false);
      setEditRuleForm(null);
      setStatusMsg(
        editingRuleWasApproved
          ? `Updated rule "${editingRuleId}" and reset approved to false until approved again.`
          : `Updated rule "${editingRuleId}".`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save rating rule.');
      handleFirestoreError(err, OperationType.WRITE, `ratingRules/${editingRuleId}`);
    } finally {
      setSavingRuleId(null);
    }
  };

  const handleToggleRuleApproval = async (rule: RatingRule) => {
    if (!isAdmin || !user) return;
    setTogglingRuleId(rule.id);
    setStatusMsg('');
    setErrorMsg('');

    try {
      const nextApproved = !rule.approved;
      const payload: Omit<RatingRule, 'id'> = {
        condition: rule.condition,
        nutrient: rule.nutrient,
        moderateAbove: rule.moderateAbove,
        limitAbove: rule.limitAbove,
        unit: rule.unit || '',
        notes: rule.notes ?? rule.disclaimer ?? '',
        disclaimer: rule.disclaimer ?? rule.notes ?? '',
        approved: nextApproved,
        approvedBy: nextApproved ? rule.approvedBy?.trim() || user.email || '' : '',
        approvedDate: nextApproved ? rule.approvedDate?.trim() || getTodayLocalDate() : '',
      };

      await setDoc(doc(db, 'ratingRules', rule.id), payload);
      const updated = await loadFirestoreRules();
      await onRefreshData();
      computeAndSetRuleImpact(updated);
      setStatusMsg(
        nextApproved
          ? `Approved rule "${rule.condition} · ${rule.nutrient}".`
          : `Marked rule "${rule.condition} · ${rule.nutrient}" as Draft.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update rule approval.');
      handleFirestoreError(err, OperationType.WRITE, `ratingRules/${rule.id}`);
    } finally {
      setTogglingRuleId(null);
    }
  };

  const handleConfirmDeleteRule = async (rule: RatingRule) => {
    if (!isAdmin || !user) return;
    setDeletingRuleId(rule.id);
    setStatusMsg('');
    setErrorMsg('');

    try {
      await deleteDoc(doc(db, 'ratingRules', rule.id));
      const updated = await loadFirestoreRules();
      await onRefreshData();
      computeAndSetRuleImpact(updated);
      setConfirmDeleteRuleId(null);
      if (editingRuleId === rule.id) {
        setEditingRuleId(null);
        setEditRuleForm(null);
      }
      setStatusMsg(`Deleted rule "${rule.condition} · ${rule.nutrient}".`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete rating rule.');
      handleFirestoreError(err, OperationType.DELETE, `ratingRules/${rule.id}`);
    } finally {
      setDeletingRuleId(null);
    }
  };

  const handleConfirmSeedDraftRules = async () => {
    if (!isAdmin || !user || dbRules.length > 0) return;
    setSeedingRules(true);
    setStatusMsg('');
    setErrorMsg('');

    try {
      const existingSnap = await getDocs(collection(db, 'ratingRules'));
      const batch = writeBatch(db);
      existingSnap.forEach(d => batch.delete(d.ref));

      for (const rule of DEFAULT_DRAFT_RATING_RULES) {
        const docId = `${rule.condition}-${rule.nutrient}`;
        const ref = doc(db, 'ratingRules', docId);
        const notes = rule.disclaimer || 'DRAFT dietary heuristic: not a substitute for your care team.';
        batch.set(ref, {
          ...rule,
          notes,
          disclaimer: notes,
          approved: false,
          approvedBy: '',
          approvedDate: '',
        });
      }

      await batch.commit();
      const updated = await loadFirestoreRules();
      await onRefreshData();
      computeAndSetRuleImpact(updated);
      setShowSeedConfirm(false);
      setStatusMsg(
        `Seeded ${DEFAULT_DRAFT_RATING_RULES.length} draft rating rules (approved: false).`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error seeding rating rules');
      handleFirestoreError(err, OperationType.WRITE, 'ratingRules');
    } finally {
      setSeedingRules(false);
    }
  };

  const cellInputCls =
    'w-full min-w-[90px] px-2 py-1.5 text-xs rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 text-stone-950 dark:text-stone-100 focus:outline-none focus:border-emerald-700';
  const numInputCls =
    'w-20 px-2 py-1.5 text-xs font-mono rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 text-stone-950 dark:text-stone-100 focus:outline-none focus:border-emerald-700';

  return (
    <div className="pb-28 max-w-6xl mx-auto px-4 pt-4 space-y-6">
      {/* Admin Banner */}
      <div className="p-4 rounded-3xl bg-emerald-950 text-white border border-emerald-800 shadow-md flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold">Admin Management Console</h2>
          </div>
          <p className="text-xs text-emerald-200">
            Logged in as: <strong className="font-mono">{user.email}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={dbFoods.length === 0}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export all foods as CSV</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              await Promise.all([loadFirestoreFoods(), loadFirestoreRules()]);
              await onRefreshData();
            }}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-emerald-100 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            title="Refresh database records"
          >
            <RefreshCw
              className={`w-4 h-4 ${loadingDbFoods || loadingDbRules ? 'animate-spin' : ''}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-900 dark:text-red-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* SECTION 1: CSV Importer with File Upload, Preview, Extra Columns, reviewedBy & reviewedDate */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs space-y-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Import Foods (CSV)
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5">
              Upserts by ID (<code className="text-emerald-700 dark:text-emerald-300">lowercase-name-with-hyphens</code>). Supports <code className="text-emerald-700 dark:text-emerald-300">reviewedBy</code>, <code className="text-emerald-700 dark:text-emerald-300">reviewedDate</code>, and extra columns.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleUploadCsvFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 border border-emerald-700 text-emerald-900 dark:text-emerald-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Upload .csv file</span>
          </button>

          <button
            type="button"
            onClick={handleFillSampleCsv}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <FileText className="w-4 h-4 text-emerald-700" />
            <span>Load {SAMPLE_INDIAN_FOODS.length} Sample Foods &amp; Meals</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCsvText('');
              setPreview(null);
              setErrorMsg('');
            }}
            className="min-h-[44px] px-3 py-2 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
          >
            Clear
          </button>
        </div>

        <textarea
          rows={7}
          value={csvText}
          onChange={e => {
            setCsvText(e.target.value);
            if (preview) setPreview(null);
          }}
          placeholder={`name,category,type,icon,servingLabel,servingGrams,kcal,carbs,sugars,fiber,protein,sodium,potassium,phosphorus,isVeg,source,reviewedBy,reviewedDate
Chapati,Breads & Rotis,grain,🫓,1 medium roti (35g),35,85,16.5,0.5,2.8,3.1,5,95,65,true,ICMR-NIN,Dr. Rao,2026-11-01
Papaya,Fruits,fruit,🍈,1 small bowl (120g),120,50,12.0,8.5,2.2,0.6,5,215,12,true,ICMR-NIN,Dr. Rao,2026-11-01`}
          className="w-full p-3 text-xs font-mono rounded-xl bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:text-stone-100"
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handlePreviewCsv()}
            disabled={importingFoods}
            className="min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            <span>Preview import</span>
          </button>
        </div>

        {/* Import Preview Panel */}
        {preview && (
          <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-950 border-2 border-stone-300 dark:border-stone-700 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-stone-950 dark:text-white">
                Import Preview
              </h4>
              {preview.extraColumns.length > 0 && (
                <span className="text-xs text-stone-600 dark:text-stone-400">
                  Extra columns: <span className="font-mono">{preview.extraColumns.join(', ')}</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-700 dark:text-emerald-300 shrink-0" />
                <div className="text-xs">
                  <div className="font-bold text-emerald-950 dark:text-emerald-100">
                    {preview.newCount} New foods
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-sky-700 dark:text-sky-300 shrink-0" />
                <div className="text-xs">
                  <div className="font-bold text-sky-950 dark:text-sky-100">
                    {preview.updatedCount} Updated foods
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-700 dark:text-red-300 shrink-0" />
                <div className="text-xs">
                  <div className="font-bold text-red-950 dark:text-red-100">
                    {preview.errorRows.length} Rows with errors
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0" />
              <span className="font-semibold text-amber-950 dark:text-amber-100">
                {preview.missingSugarsOrFiberCount} rows have missing sugars or fiber (saved as unknown)
              </span>
            </div>

            {preview.errorRows.length > 0 && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 space-y-1.5 max-h-48 overflow-y-auto">
                <p className="text-xs font-bold text-red-900 dark:text-red-200">
                  Rows with errors (will be skipped on import):
                </p>
                <ul className="space-y-1 text-xs text-red-900 dark:text-red-200">
                  {preview.errorRows.map(errRow => (
                    <li key={`${errRow.rowNumber}-${errRow.name}`} className="font-mono text-[11px]">
                      <strong>Row {errRow.rowNumber}</strong> ({errRow.name}):{' '}
                      {errRow.reasons.join('; ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importingFoods || preview.validRows.length === 0}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                {importingFoods ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>Confirm &amp; import {preview.validRows.length} valid food(s)</span>
              </button>

              <button
                type="button"
                onClick={() => setPreview(null)}
                disabled={importingFoods}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: Foods Table (searchable, inline edit every field, Add food row, Delete with confirm, Delete all) */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Foods table ({dbFoods.length})
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400">
              Search, add, edit any field inline (including admin-only reviewer fields &amp; extra columns), or delete foods.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
                placeholder="Search foods..."
                aria-label="Search foods table"
                className="min-h-[44px] pl-9 pr-3 py-2 text-xs rounded-xl bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 focus:outline-none focus:border-emerald-700 dark:text-stone-100"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setShowDeleteAllConfirm(prev => !prev);
                setDeleteAllInput('');
              }}
              disabled={dbFoods.length === 0}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/70 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-200 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete all foods</span>
            </button>
          </div>
        </div>

        {/* Delete All Confirmation Box */}
        {showDeleteAllConfirm && (
          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border-2 border-red-400 dark:border-red-800 space-y-3">
            <div className="flex items-start gap-2 text-red-900 dark:text-red-100">
              <AlertTriangle className="w-5 h-5 text-red-700 dark:text-red-300 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold">
                  Permanently delete all {dbFoods.length} food(s) from Firestore?
                </p>
                <p>
                  Type <strong className="font-mono">DELETE ALL</strong> below to confirm.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={deleteAllInput}
                onChange={e => setDeleteAllInput(e.target.value)}
                placeholder="Type DELETE ALL"
                aria-label="Typed confirmation word"
                className="min-h-[44px] px-3 py-2 text-xs font-mono rounded-xl bg-white dark:bg-stone-900 border border-red-300 dark:border-red-700 text-stone-950 dark:text-white focus:outline-none focus:border-red-600"
              />
              <button
                type="button"
                onClick={handleConfirmDeleteAll}
                disabled={deletingAll || deleteAllInput.trim() !== 'DELETE ALL'}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors"
              >
                {deletingAll ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>Confirm delete all</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteAllConfirm(false);
                  setDeleteAllInput('');
                }}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Table */}
        <div className="overflow-x-auto rounded-2xl border border-stone-200 dark:border-stone-800">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 border-b border-stone-200 dark:border-stone-700">
                <th className="p-2.5 font-bold whitespace-nowrap">Actions</th>
                <th className="p-2.5 font-bold whitespace-nowrap">id</th>
                <th className="p-2.5 font-bold whitespace-nowrap">icon</th>
                <th className="p-2.5 font-bold whitespace-nowrap">name</th>
                <th className="p-2.5 font-bold whitespace-nowrap">category</th>
                <th className="p-2.5 font-bold whitespace-nowrap">type</th>
                <th className="p-2.5 font-bold whitespace-nowrap">servingLabel</th>
                <th className="p-2.5 font-bold whitespace-nowrap">servingGrams</th>
                <th className="p-2.5 font-bold whitespace-nowrap">kcal</th>
                <th className="p-2.5 font-bold whitespace-nowrap">carbs</th>
                <th className="p-2.5 font-bold whitespace-nowrap">sugars</th>
                <th className="p-2.5 font-bold whitespace-nowrap">fiber</th>
                <th className="p-2.5 font-bold whitespace-nowrap">protein</th>
                <th className="p-2.5 font-bold whitespace-nowrap">sodium</th>
                <th className="p-2.5 font-bold whitespace-nowrap">potassium</th>
                <th className="p-2.5 font-bold whitespace-nowrap">phosphorus</th>
                <th className="p-2.5 font-bold whitespace-nowrap">isVeg</th>
                <th className="p-2.5 font-bold whitespace-nowrap">source</th>
                <th className="p-2.5 font-bold whitespace-nowrap">reviewedBy</th>
                <th className="p-2.5 font-bold whitespace-nowrap">reviewedDate</th>
                {extraColumns.map(col => (
                  <th key={col} className="p-2.5 font-bold whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
              {/* Add food row */}
              <tr className="bg-emerald-50/60 dark:bg-emerald-950/20">
                <td className="p-2 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={handleAddFood}
                    disabled={addingFood}
                    className="min-h-[44px] px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add food</span>
                  </button>
                </td>
                <td className="p-2 font-mono text-[11px] text-stone-500 whitespace-nowrap">
                  {addForm.name.trim() ? toFoodSlugId(addForm.name) : '(auto-id)'}
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    value={addForm.icon}
                    onChange={e => setAddForm(p => ({ ...p, icon: e.target.value }))}
                    placeholder="🍽️"
                    aria-label="New food icon"
                    className="w-14 px-2 py-1.5 text-xs rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    value={addForm.name}
                    onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Food name"
                    aria-label="New food name"
                    className={`${cellInputCls} min-w-[130px]`}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    value={addForm.category}
                    onChange={e => setAddForm(p => ({ ...p, category: e.target.value }))}
                    placeholder="Category"
                    aria-label="New food category"
                    className={`${cellInputCls} min-w-[120px]`}
                  />
                </td>
                <td className="p-2">
                  <select
                    value={addForm.type}
                    onChange={e => setAddForm(p => ({ ...p, type: e.target.value as FoodType }))}
                    aria-label="New food type"
                    className={cellInputCls}
                  >
                    {VALID_FOOD_TYPES.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    value={addForm.servingLabel}
                    onChange={e => setAddForm(p => ({ ...p, servingLabel: e.target.value }))}
                    placeholder="1 bowl (120g)"
                    aria-label="New food serving label"
                    className={`${cellInputCls} min-w-[140px]`}
                  />
                </td>
                {NUMERIC_FOOD_FIELDS.map(field => (
                  <td key={field} className="p-2">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={addForm[field]}
                      onChange={e => setAddForm(p => ({ ...p, [field]: e.target.value }))}
                      aria-label={`New food ${field}`}
                      className={numInputCls}
                    />
                  </td>
                ))}
                <td className="p-2">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addForm.isVeg}
                      onChange={e => setAddForm(p => ({ ...p, isVeg: e.target.checked }))}
                      aria-label="New food isVeg"
                      className="w-4 h-4 accent-emerald-700"
                    />
                    <span>{addForm.isVeg ? 'Veg' : 'Non-veg'}</span>
                  </label>
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    value={addForm.source}
                    onChange={e => setAddForm(p => ({ ...p, source: e.target.value }))}
                    placeholder="Source"
                    aria-label="New food source"
                    className={`${cellInputCls} min-w-[150px]`}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    value={addForm.reviewedBy}
                    onChange={e => setAddForm(p => ({ ...p, reviewedBy: e.target.value }))}
                    placeholder="Reviewer"
                    aria-label="New food reviewedBy"
                    className={cellInputCls}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    value={addForm.reviewedDate}
                    onChange={e => setAddForm(p => ({ ...p, reviewedDate: e.target.value }))}
                    placeholder="YYYY-MM-DD"
                    aria-label="New food reviewedDate"
                    className={cellInputCls}
                  />
                </td>
                {extraColumns.map(col => (
                  <td key={col} className="p-2">
                    <input
                      type="text"
                      value={addForm.extras[col] ?? ''}
                      onChange={e =>
                        setAddForm(p => ({
                          ...p,
                          extras: { ...p.extras, [col]: e.target.value },
                        }))
                      }
                      aria-label={`New food ${col}`}
                      className={cellInputCls}
                    />
                  </td>
                ))}
              </tr>

              {/* Existing foods rows */}
              {filteredFoods.length === 0 ? (
                <tr>
                  <td
                    colSpan={20 + extraColumns.length}
                    className="p-6 text-center text-xs text-stone-500"
                  >
                    {dbFoods.length === 0
                      ? 'No foods stored in Firestore yet. Import a CSV or add a food above.'
                      : 'No foods match your search.'}
                  </td>
                </tr>
              ) : (
                filteredFoods.map(food => {
                  const isEditing = editingId === food.id && editForm !== null;
                  const isConfirmingDelete = confirmDeleteId === food.id;

                  return (
                    <tr
                      key={food.id}
                      className="hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
                    >
                      <td className="p-2 whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              disabled={savingRowId === food.id}
                              className="min-h-[44px] px-2.5 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Save</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(null);
                                setEditForm(null);
                              }}
                              className="min-h-[44px] px-2.5 py-1 rounded-lg bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-100 text-xs font-semibold inline-flex items-center gap-1"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Cancel</span>
                            </button>
                          </div>
                        ) : isConfirmingDelete ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleConfirmDeleteFood(food.id, food.name)}
                              disabled={deletingRowId === food.id}
                              className="min-h-[44px] px-2.5 py-1 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold disabled:opacity-50"
                            >
                              Confirm delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="min-h-[44px] px-2.5 py-1 rounded-lg bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-100 text-xs font-semibold"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(food)}
                              className="min-h-[44px] px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-semibold inline-flex items-center gap-1"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteId(food.id);
                                setEditingId(null);
                                setEditForm(null);
                              }}
                              className="min-h-[44px] px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 text-xs font-semibold inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="p-2 font-mono text-[11px] text-stone-600 dark:text-stone-400 whitespace-nowrap">
                        {food.id}
                      </td>

                      {isEditing && editForm ? (
                        <>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editForm.icon}
                              onChange={e => setEditForm(p => (p ? { ...p, icon: e.target.value } : p))}
                              className="w-14 px-2 py-1.5 text-xs rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={e => setEditForm(p => (p ? { ...p, name: e.target.value } : p))}
                              className={`${cellInputCls} min-w-[130px]`}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editForm.category}
                              onChange={e =>
                                setEditForm(p => (p ? { ...p, category: e.target.value } : p))
                              }
                              className={`${cellInputCls} min-w-[120px]`}
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={editForm.type}
                              onChange={e =>
                                setEditForm(p =>
                                  p ? { ...p, type: e.target.value as FoodType } : p
                                )
                              }
                              className={cellInputCls}
                            >
                              {VALID_FOOD_TYPES.map(t => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editForm.servingLabel}
                              onChange={e =>
                                setEditForm(p => (p ? { ...p, servingLabel: e.target.value } : p))
                              }
                              className={`${cellInputCls} min-w-[140px]`}
                            />
                          </td>
                          {NUMERIC_FOOD_FIELDS.map(field => (
                            <td key={field} className="p-2">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={editForm[field]}
                                onChange={e =>
                                  setEditForm(p => (p ? { ...p, [field]: e.target.value } : p))
                                }
                                className={numInputCls}
                              />
                            </td>
                          ))}
                          <td className="p-2">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editForm.isVeg}
                                onChange={e =>
                                  setEditForm(p => (p ? { ...p, isVeg: e.target.checked } : p))
                                }
                                className="w-4 h-4 accent-emerald-700"
                              />
                              <span>{editForm.isVeg ? 'Veg' : 'Non-veg'}</span>
                            </label>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editForm.source}
                              onChange={e =>
                                setEditForm(p => (p ? { ...p, source: e.target.value } : p))
                              }
                              className={`${cellInputCls} min-w-[150px]`}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editForm.reviewedBy}
                              onChange={e =>
                                setEditForm(p => (p ? { ...p, reviewedBy: e.target.value } : p))
                              }
                              className={cellInputCls}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editForm.reviewedDate}
                              onChange={e =>
                                setEditForm(p => (p ? { ...p, reviewedDate: e.target.value } : p))
                              }
                              className={cellInputCls}
                            />
                          </td>
                          {extraColumns.map(col => (
                            <td key={col} className="p-2">
                              <input
                                type="text"
                                value={editForm.extras[col] ?? ''}
                                onChange={e =>
                                  setEditForm(p =>
                                    p
                                      ? {
                                          ...p,
                                          extras: { ...p.extras, [col]: e.target.value },
                                        }
                                      : p
                                  )
                                }
                                className={cellInputCls}
                              />
                            </td>
                          ))}
                        </>
                      ) : (
                        <>
                          <td className="p-2.5 text-base whitespace-nowrap">{food.icon || '—'}</td>
                          <td className="p-2.5 font-bold text-stone-950 dark:text-white whitespace-nowrap">
                            {food.name}
                          </td>
                          <td className="p-2.5 whitespace-nowrap">{food.category}</td>
                          <td className="p-2.5 font-mono whitespace-nowrap">{food.type || '—'}</td>
                          <td className="p-2.5 whitespace-nowrap">{food.servingLabel}</td>
                          <td className="p-2.5 font-mono tabular-nums">{food.servingGrams}</td>
                          <td className="p-2.5 font-mono tabular-nums">{food.kcal}</td>
                          <td className="p-2.5 font-mono tabular-nums">{food.carbs}</td>
                          <td className="p-2.5 font-mono tabular-nums">
                            {food.sugars !== null && food.sugars !== undefined ? (
                              food.sugars
                            ) : (
                              <span className="font-sans text-stone-400">Unknown</span>
                            )}
                          </td>
                          <td className="p-2.5 font-mono tabular-nums">
                            {food.fiber !== null && food.fiber !== undefined ? (
                              food.fiber
                            ) : (
                              <span className="font-sans text-stone-400">Unknown</span>
                            )}
                          </td>
                          <td className="p-2.5 font-mono tabular-nums">{food.protein}</td>
                          <td className="p-2.5 font-mono tabular-nums">{food.sodium}</td>
                          <td className="p-2.5 font-mono tabular-nums">{food.potassium}</td>
                          <td className="p-2.5 font-mono tabular-nums">{food.phosphorus}</td>
                          <td className="p-2.5 whitespace-nowrap">
                            {food.isVeg ? 'Veg' : 'Non-veg'}
                          </td>
                          <td className="p-2.5 max-w-[200px] truncate" title={food.source}>
                            {food.source}
                          </td>
                          <td className="p-2.5 whitespace-nowrap">{food.reviewedBy || '—'}</td>
                          <td className="p-2.5 font-mono whitespace-nowrap">
                            {food.reviewedDate || '—'}
                          </td>
                          {extraColumns.map(col => (
                            <td key={col} className="p-2.5 whitespace-nowrap">
                              {food[col] !== undefined && food[col] !== null
                                ? String(food[col])
                                : '—'}
                            </td>
                          ))}
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3: Rating Rules Management */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Rating Rules Management ({dbRules.length})
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400">
              Manage thresholds per condition and numeric food field. Editing an approved rule resets it to Draft until approved again.
            </p>
          </div>

          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => setShowSeedConfirm(prev => !prev)}
              disabled={seedingRules || dbRules.length > 0}
              className="min-h-[44px] py-2 px-4 rounded-xl border border-emerald-800 text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300 dark:border-emerald-700 dark:hover:bg-emerald-950/40 font-bold text-xs transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {seedingRules ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin" />
                  <span>Seeding draft rules...</span>
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  <span>Seed / Reset Draft Rating Rules</span>
                </>
              )}
            </button>
            {dbRules.length > 0 && (
              <span className="text-[11px] text-stone-500">
                Disabled once rules exist
              </span>
            )}
          </div>
        </div>

        {/* Seed Confirmation Box */}
        {showSeedConfirm && dbRules.length === 0 && (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-800 space-y-3">
            <div className="flex items-start gap-2 text-amber-950 dark:text-amber-100">
              <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold">Overwrite all current rules with default draft rules?</p>
                <p>
                  This will overwrite all current rules with {DEFAULT_DRAFT_RATING_RULES.length} default draft rules (approved: false).
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleConfirmSeedDraftRules}
                disabled={seedingRules}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50"
              >
                {seedingRules ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Seeding draft rules...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    <span>Confirm overwrite &amp; seed draft rules</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowSeedConfirm(false)}
                disabled={seedingRules}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Rule Change Impact Summary */}
        {ruleImpactSummary && (
          <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-stone-950 dark:text-white">
                Updated food ratings summary ({ruleImpactSummary.total} foods)
              </span>
              <span className="text-xs text-stone-600 dark:text-stone-400">
                Conditions:{' '}
                {ruleImpactSummary.conditions.length > 0
                  ? ruleImpactSummary.conditions.map(formatConditionName).join(', ')
                  : 'None selected'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-950 dark:bg-emerald-950/70 dark:text-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Suitable: {ruleImpactSummary.suitable}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-950 dark:bg-amber-950/70 dark:text-amber-200">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Moderate: {ruleImpactSummary.moderate}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-900 dark:bg-red-950/70 dark:text-red-200">
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Limit: {ruleImpactSummary.limit}</span>
              </span>
            </div>
          </div>
        )}

        {/* Rules Table */}
        <div className="overflow-x-auto rounded-2xl border border-stone-200 dark:border-stone-800">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 border-b border-stone-200 dark:border-stone-700">
                <th className="p-2.5 font-bold whitespace-nowrap">Actions</th>
                <th className="p-2.5 font-bold whitespace-nowrap">condition</th>
                <th className="p-2.5 font-bold whitespace-nowrap">nutrient</th>
                <th className="p-2.5 font-bold whitespace-nowrap">moderateAbove</th>
                <th className="p-2.5 font-bold whitespace-nowrap">limitAbove</th>
                <th className="p-2.5 font-bold whitespace-nowrap">unit</th>
                <th className="p-2.5 font-bold whitespace-nowrap">notes / source</th>
                <th className="p-2.5 font-bold whitespace-nowrap">approved</th>
                <th className="p-2.5 font-bold whitespace-nowrap">approvedBy</th>
                <th className="p-2.5 font-bold whitespace-nowrap">approvedDate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
              {/* Add rule row */}
              <tr className="bg-emerald-50/60 dark:bg-emerald-950/20 align-top">
                <td className="p-2 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={handleAddRule}
                    disabled={addingRule}
                    className="min-h-[44px] px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add rule</span>
                  </button>
                </td>
                <td className="p-2">
                  <select
                    value={addRuleForm.condition}
                    onChange={e => {
                      setAddRuleForm(p => ({ ...p, condition: e.target.value as ConditionType }));
                      setAddRuleErrors(p => ({ ...p, condition: undefined }));
                    }}
                    aria-label="New rule condition"
                    className={cellInputCls}
                  >
                    {VALID_CONDITIONS.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {addRuleErrors.condition && (
                    <p role="alert" className="text-[11px] font-semibold text-red-700 dark:text-red-300 mt-1">
                      {addRuleErrors.condition}
                    </p>
                  )}
                </td>
                <td className="p-2">
                  <select
                    value={addRuleForm.nutrient}
                    onChange={e => {
                      setAddRuleForm(p => ({ ...p, nutrient: e.target.value }));
                      setAddRuleErrors(p => ({ ...p, nutrient: undefined }));
                    }}
                    aria-label="New rule nutrient"
                    className={`${cellInputCls} min-w-[130px]`}
                  >
                    {availableFoodNumericFields.map(n => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  {addRuleErrors.nutrient && (
                    <p role="alert" className="text-[11px] font-semibold text-red-700 dark:text-red-300 mt-1 max-w-[180px]">
                      {addRuleErrors.nutrient}
                    </p>
                  )}
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={addRuleForm.moderateAbove}
                    onChange={e => {
                      setAddRuleForm(p => ({ ...p, moderateAbove: e.target.value }));
                      setAddRuleErrors(p => ({ ...p, moderateAbove: undefined, limitAbove: undefined }));
                    }}
                    placeholder="e.g. 25"
                    aria-label="New rule moderateAbove"
                    className={numInputCls}
                  />
                  {addRuleErrors.moderateAbove && (
                    <p role="alert" className="text-[11px] font-semibold text-red-700 dark:text-red-300 mt-1 max-w-[140px]">
                      {addRuleErrors.moderateAbove}
                    </p>
                  )}
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={addRuleForm.limitAbove}
                    onChange={e => {
                      setAddRuleForm(p => ({ ...p, limitAbove: e.target.value }));
                      setAddRuleErrors(p => ({ ...p, moderateAbove: undefined, limitAbove: undefined }));
                    }}
                    placeholder="e.g. 45"
                    aria-label="New rule limitAbove"
                    className={numInputCls}
                  />
                  {addRuleErrors.limitAbove && (
                    <p role="alert" className="text-[11px] font-semibold text-red-700 dark:text-red-300 mt-1 max-w-[140px]">
                      {addRuleErrors.limitAbove}
                    </p>
                  )}
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    value={addRuleForm.unit}
                    onChange={e => setAddRuleForm(p => ({ ...p, unit: e.target.value }))}
                    placeholder="g / mg / GI"
                    aria-label="New rule unit"
                    className="w-20 px-2 py-1.5 text-xs rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    value={addRuleForm.notes}
                    onChange={e => setAddRuleForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Notes or clinical source"
                    aria-label="New rule notes or source"
                    className={`${cellInputCls} min-w-[180px]`}
                  />
                </td>
                <td className="p-2 whitespace-nowrap">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={addRuleForm.approved}
                    onClick={() =>
                      setAddRuleForm(p => ({
                        ...p,
                        approved: !p.approved,
                        approvedBy: !p.approved ? p.approvedBy || user.email || '' : '',
                        approvedDate: !p.approved ? p.approvedDate || getTodayLocalDate() : '',
                      }))
                    }
                    className={`min-h-[44px] px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 border transition-colors ${
                      addRuleForm.approved
                        ? 'bg-emerald-100 text-emerald-950 border-emerald-400 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-700'
                        : 'bg-amber-100 text-amber-950 border-amber-400 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700'
                    }`}
                  >
                    {addRuleForm.approved ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Approved</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Draft</span>
                      </>
                    )}
                  </button>
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    value={addRuleForm.approvedBy}
                    onChange={e => setAddRuleForm(p => ({ ...p, approvedBy: e.target.value }))}
                    placeholder="Approver"
                    aria-label="New rule approvedBy"
                    className={cellInputCls}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    value={addRuleForm.approvedDate}
                    onChange={e => setAddRuleForm(p => ({ ...p, approvedDate: e.target.value }))}
                    placeholder="YYYY-MM-DD"
                    aria-label="New rule approvedDate"
                    className={cellInputCls}
                  />
                </td>
              </tr>

              {/* Existing Rules Rows */}
              {dbRules.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-xs text-stone-500">
                    No rating rules stored in Firestore yet. Add a rule above or click Seed / Reset Draft Rating Rules.
                  </td>
                </tr>
              ) : (
                dbRules.map(rule => {
                  const isEditing = editingRuleId === rule.id && editRuleForm !== null;
                  const isConfirmingDelete = confirmDeleteRuleId === rule.id;

                  return (
                    <tr
                      key={rule.id}
                      className="hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors align-top"
                    >
                      <td className="p-2 whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={handleSaveRuleEdit}
                              disabled={savingRuleId === rule.id}
                              className="min-h-[44px] px-2.5 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Save</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRuleId(null);
                                setEditingRuleWasApproved(false);
                                setEditRuleForm(null);
                                setEditRuleErrors({});
                              }}
                              className="min-h-[44px] px-2.5 py-1 rounded-lg bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-100 text-xs font-semibold inline-flex items-center gap-1"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Cancel</span>
                            </button>
                          </div>
                        ) : isConfirmingDelete ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleConfirmDeleteRule(rule)}
                              disabled={deletingRuleId === rule.id}
                              className="min-h-[44px] px-2.5 py-1 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold disabled:opacity-50"
                            >
                              Confirm delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteRuleId(null)}
                              className="min-h-[44px] px-2.5 py-1 rounded-lg bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-100 text-xs font-semibold"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartEditRule(rule)}
                              className="min-h-[44px] px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-semibold inline-flex items-center gap-1"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteRuleId(rule.id);
                                setEditingRuleId(null);
                                setEditRuleForm(null);
                              }}
                              className="min-h-[44px] px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 text-xs font-semibold inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </td>

                      {isEditing && editRuleForm ? (
                        <>
                          <td className="p-2">
                            <select
                              value={editRuleForm.condition}
                              onChange={e => {
                                setEditRuleForm(p =>
                                  p ? { ...p, condition: e.target.value as ConditionType } : p
                                );
                                setEditRuleErrors(p => ({ ...p, condition: undefined }));
                              }}
                              className={cellInputCls}
                            >
                              {VALID_CONDITIONS.map(c => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                            {editRuleErrors.condition && (
                              <p role="alert" className="text-[11px] font-semibold text-red-700 dark:text-red-300 mt-1">
                                {editRuleErrors.condition}
                              </p>
                            )}
                          </td>
                          <td className="p-2">
                            <select
                              value={editRuleForm.nutrient}
                              onChange={e => {
                                setEditRuleForm(p =>
                                  p ? { ...p, nutrient: e.target.value } : p
                                );
                                setEditRuleErrors(p => ({ ...p, nutrient: undefined }));
                              }}
                              className={`${cellInputCls} min-w-[130px]`}
                            >
                              {!availableFoodNumericFields.includes(editRuleForm.nutrient) && (
                                <option value={editRuleForm.nutrient}>
                                  {editRuleForm.nutrient} (not on foods)
                                </option>
                              )}
                              {availableFoodNumericFields.map(n => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                            {editRuleErrors.nutrient && (
                              <p role="alert" className="text-[11px] font-semibold text-red-700 dark:text-red-300 mt-1 max-w-[180px]">
                                {editRuleErrors.nutrient}
                              </p>
                            )}
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editRuleForm.moderateAbove}
                              onChange={e => {
                                setEditRuleForm(p =>
                                  p ? { ...p, moderateAbove: e.target.value } : p
                                );
                                setEditRuleErrors(p => ({
                                  ...p,
                                  moderateAbove: undefined,
                                  limitAbove: undefined,
                                }));
                              }}
                              className={numInputCls}
                            />
                            {editRuleErrors.moderateAbove && (
                              <p role="alert" className="text-[11px] font-semibold text-red-700 dark:text-red-300 mt-1 max-w-[140px]">
                                {editRuleErrors.moderateAbove}
                              </p>
                            )}
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editRuleForm.limitAbove}
                              onChange={e => {
                                setEditRuleForm(p =>
                                  p ? { ...p, limitAbove: e.target.value } : p
                                );
                                setEditRuleErrors(p => ({
                                  ...p,
                                  moderateAbove: undefined,
                                  limitAbove: undefined,
                                }));
                              }}
                              className={numInputCls}
                            />
                            {editRuleErrors.limitAbove && (
                              <p role="alert" className="text-[11px] font-semibold text-red-700 dark:text-red-300 mt-1 max-w-[140px]">
                                {editRuleErrors.limitAbove}
                              </p>
                            )}
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editRuleForm.unit}
                              onChange={e =>
                                setEditRuleForm(p => (p ? { ...p, unit: e.target.value } : p))
                              }
                              className="w-20 px-2 py-1.5 text-xs rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editRuleForm.notes}
                              onChange={e =>
                                setEditRuleForm(p => (p ? { ...p, notes: e.target.value } : p))
                              }
                              className={`${cellInputCls} min-w-[180px]`}
                            />
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            {editingRuleWasApproved ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-200 border border-amber-400 dark:border-amber-700">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>Draft (reset on edit)</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                role="switch"
                                aria-checked={editRuleForm.approved}
                                onClick={() =>
                                  setEditRuleForm(p =>
                                    p
                                      ? {
                                          ...p,
                                          approved: !p.approved,
                                          approvedBy: !p.approved
                                            ? p.approvedBy || user.email || ''
                                            : '',
                                          approvedDate: !p.approved
                                            ? p.approvedDate || getTodayLocalDate()
                                            : '',
                                        }
                                      : p
                                  )
                                }
                                className={`min-h-[44px] px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 border transition-colors ${
                                  editRuleForm.approved
                                    ? 'bg-emerald-100 text-emerald-950 border-emerald-400 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-700'
                                    : 'bg-amber-100 text-amber-950 border-amber-400 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700'
                                }`}
                              >
                                {editRuleForm.approved ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    <span>Approved</span>
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>Draft</span>
                                  </>
                                )}
                              </button>
                            )}
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editRuleForm.approvedBy}
                              onChange={e =>
                                setEditRuleForm(p =>
                                  p ? { ...p, approvedBy: e.target.value } : p
                                )
                              }
                              className={cellInputCls}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editRuleForm.approvedDate}
                              onChange={e =>
                                setEditRuleForm(p =>
                                  p ? { ...p, approvedDate: e.target.value } : p
                                )
                              }
                              className={cellInputCls}
                            />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-2.5 font-bold whitespace-nowrap uppercase text-stone-900 dark:text-white">
                            {rule.condition}
                          </td>
                          <td className="p-2.5 font-mono font-semibold whitespace-nowrap">
                            {rule.nutrient}
                          </td>
                          <td className="p-2.5 font-mono tabular-nums">{rule.moderateAbove}</td>
                          <td className="p-2.5 font-mono tabular-nums">{rule.limitAbove}</td>
                          <td className="p-2.5 whitespace-nowrap">{rule.unit || '—'}</td>
                          <td
                            className="p-2.5 max-w-[220px] truncate"
                            title={rule.notes ?? rule.disclaimer ?? ''}
                          >
                            {rule.notes ?? rule.disclaimer ?? '—'}
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={Boolean(rule.approved)}
                              disabled={togglingRuleId === rule.id}
                              onClick={() => handleToggleRuleApproval(rule)}
                              className={`min-h-[44px] px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 border transition-colors disabled:opacity-50 ${
                                rule.approved
                                  ? 'bg-emerald-100 text-emerald-950 border-emerald-400 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-700'
                                  : 'bg-amber-100 text-amber-950 border-amber-400 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700'
                              }`}
                            >
                              {rule.approved ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>Approved</span>
                                </>
                              ) : (
                                <>
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>Draft</span>
                                </>
                              )}
                            </button>
                          </td>
                          <td className="p-2.5 whitespace-nowrap">{rule.approvedBy || '—'}</td>
                          <td className="p-2.5 font-mono whitespace-nowrap">
                            {rule.approvedDate || '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
