import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FileText, X, AlertCircle, Loader2, Sparkles, Printer, Plus, Trash2, Calendar, Hash, Save, Download } from 'lucide-react';
import { api } from '../services/api';
import { DocumentTemplate, TemplateGrid } from '../types';
import {
  BIRTH_CITIES,
  ROUND_OPTIONS,
  RESULT_OPTIONS,
  getSubjects,
  isSubjectGridColumn,
} from '../utils/subjects';
import { getGradesForSchoolType, isPreparatoryGrade } from '../services/schoolConfig';

interface CreateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialTemplate?: DocumentTemplate | null;
  schoolProfile?: { principalName?: string; principalTitle?: string; academicYear?: string; schoolType?: string } | null;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

// Fields auto-filled from school info and hidden from the form (MENTIS LoadFields parity).
const AUTO_FILLED_FIELDS = ['school_name', 'name_school', 'school', 'city', 'province'];
// Principal name/title are auto-filled from the school profile and hidden from the form.
const HIDDEN_PRINCIPAL_FIELDS = ['principal_name', 'title'];

const toDateInput = (d: Date) =>
  `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;

export const CreateDocumentModal: React.FC<CreateDocumentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialTemplate,
  schoolProfile,
  showToast,
}) => {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(initialTemplate || null);
  const [documentName, setDocumentName] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [gridCells, setGridCells] = useState<Record<string, Record<string, string>>>({});
  const [gridRows, setGridRows] = useState<Record<string, number>>({});
  const [employees, setEmployees] = useState<Array<Record<string, string>>>([]);
  const [currentEmp, setCurrentEmp] = useState<Record<string, string>>({});
  const [format, setFormat] = useState('docx');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState<'generate' | 'print' | 'manual' | null>(null);
  const [errorFields, setErrorFields] = useState<Record<string, string>>({});

  // Guards against double submission / duplicate document numbers
  const creatingRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setErrorMsg('');
    setErrorFields({});
    (async () => {
      try {
        const res = await api.getTemplates();
        if (res.success) {
          const list = res.templates || [];
          setTemplates(list);
          const initial = initialTemplate || list[0] || null;
          if (initial) {
            setSelectedTemplate(initial);
            initForm(initial);
          }
        }
      } catch (err) {
        console.error('Failed to load templates:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  const grades = useMemo(
    () => getGradesForSchoolType(schoolProfile?.schoolType),
    [schoolProfile]
  );

  const initGrid = useCallback(
    (tpl: DocumentTemplate, grade?: string, branch?: string) => {
      const cells: Record<string, Record<string, string>> = {};
      const rows: Record<string, number> = {};
      (tpl.grids || []).forEach((g) => {
        if (g.fixedRows && g.fixedRows.length > 0) {
          rows[g.id] = g.fixedRows.length;
          g.fixedRows.forEach((fr) => {
            fr.placeholders.forEach((ph) => {
              cells[g.id] = cells[g.id] || {};
              if (cells[g.id][ph] === undefined) cells[g.id][ph] = '';
            });
          });
          return;
        }
        const sep = g.rowNumberSeparator || '';
        const hasSubjectCol = g.columns.length > 0 && isSubjectGridColumn(g.columns[0].key);
        const subjects = hasSubjectCol && grade ? getSubjects(grade, branch) : [];
        const count =
          subjects.length > 0
            ? subjects.length
            : 1 + (g.defaultRows ?? 0);
        rows[g.id] = count;
        cells[g.id] = {};
        for (let r = 0; r < count; r++) {
          g.columns.forEach((col, c) => {
            const key = `${col.key}${sep}${r + 1}`;
            cells[g.id][key] = subjects.length > 0 && c === 0 ? subjects[r] : '';
          });
        }
      });
      setGridCells(cells);
      setGridRows(rows);
    },
    []
  );

  const initForm = useCallback(
    async (tpl: DocumentTemplate) => {
      setDocumentName(tpl.name);
      setErrorMsg('');
      setErrorFields({});
      setEmployees([]);
      setCurrentEmp({});
      setFormat(tpl.fileType === 'xlsx' ? 'xlsx' : 'docx');

      const initial: Record<string, string> = {};
      (tpl.placeholders || []).forEach((ph) => {
        if (AUTO_FILLED_FIELDS.includes(ph)) return;
        if (ph.includes('principal')) initial[ph] = schoolProfile?.principalName || '';
        else if (ph === 'title') initial[ph] = schoolProfile?.principalTitle || 'مدير المدرسة';
        else if (ph === 'academic_year') initial[ph] = schoolProfile?.academicYear || '';
        else initial[ph] = '';
      });

      try {
        const nr = await api.getLastNumber();
        if (nr.success && initial['no'] !== undefined) initial['no'] = String(nr.next);
      } catch (e) {
        /* ignore */
      }

      const defaultGrade = grades[0] || 'الأول الابتدائي';
      if (initial['grade'] === undefined && (tpl.placeholders || []).includes('grade')) {
        initial['grade'] = defaultGrade;
      }

      setValues(initial);
      initGrid(tpl, defaultGrade, '');
    },
    [grades, schoolProfile, initGrid]
  );

  const handleSelectTemplate = (tplId: string) => {
    const found = templates.find((t) => t.id === tplId);
    if (found) {
      setSelectedTemplate(found);
      initForm(found);
    }
  };

  const setCell = (gridId: string, key: string, value: string) => {
    setGridCells((prev) => ({ ...prev, [gridId]: { ...(prev[gridId] || {}), [key]: value } }));
  };

  const gradeOptions = grades;

  const handleGradeChange = (grade: string) => {
    const newBranch = isPreparatoryGrade(grade) ? values.branch : '';
    setValues((prev) => ({ ...prev, grade, branch: newBranch }));
    if (selectedTemplate) initGrid(selectedTemplate, grade, newBranch);
  };

  const handleBranchChange = (branch: string) => {
    setValues((prev) => ({ ...prev, branch }));
    if (selectedTemplate) initGrid(selectedTemplate, values.grade, branch);
  };

  // -------- grid collection (MENTIS CollectGridValues parity) --------
  const collectGridValues = useCallback(
    (tpl: DocumentTemplate): Record<string, string> => {
      const out: Record<string, string> = {};
      const sep = (tpl.grids && tpl.grids[0]?.rowNumberSeparator) || '';

      if (tpl.employeeMode) {
        if (employees.length === 0) {
          for (const [k, v] of Object.entries(currentEmp)) out[k + sep + '1'] = String(v ?? '');
        } else {
          employees.forEach((rec, i) => {
            for (const [k, v] of Object.entries(rec)) out[k + sep + (i + 1)] = String(v ?? '');
          });
        }
        return out;
      }

      (tpl.grids || []).forEach((g: TemplateGrid) => {
        const gSep = g.rowNumberSeparator || '';
        if (g.fixedRows && g.fixedRows.length > 0) {
          g.fixedRows.forEach((fr) => {
            fr.placeholders.forEach((ph) => {
              out[ph] = gridCells[g.id]?.[ph] ?? '';
            });
          });
          return;
        }
        const count = gridRows[g.id] || 0;
        const maxRows = tpl.defaultRows || g.defaultRows || count;
        for (let r = 0; r < Math.max(count, g.fillEmpty ? maxRows : 0); r++) {
          g.columns.forEach((col) => {
            const key = `${col.key}${gSep}${r + 1}`;
            out[key] = gridCells[g.id]?.[key] ?? '';
          });
        }
      });

      return out;
    },
    [employees, currentEmp, gridCells, gridRows]
  );

  const collectAll = useCallback(
    (tpl: DocumentTemplate): Record<string, string> => {
      const out: Record<string, string> = {};
      (tpl.placeholders || []).forEach((ph) => {
        if (AUTO_FILLED_FIELDS.includes(ph)) return;
        if (values[ph] !== undefined && values[ph] !== '') out[ph] = values[ph] ?? '';
      });

      if (out['copyto'] !== undefined) {
        const lines = String(out['copyto'] || '')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        out['copyto'] = lines.map((l) => `• ${l}`).join('\n');
      }

      Object.assign(out, collectGridValues(tpl));
      return out;
    },
    [values, collectGridValues]
  );

  // Template-aware validation: only the well-known required fields (to / date / no)
  // are enforced, and only when the active template actually contains them.
  const REQUIRED_FIELDS: Record<string, string> = {
    to: 'إلى',
    date: 'التاريخ',
    no: 'العدد',
  };

  const validateForm = useCallback(
    (tpl: DocumentTemplate, collected: Record<string, string>): { ok: boolean; message: string; errors: Record<string, string> } => {
      const placeholders = tpl.placeholders || [];
      const errors: Record<string, string> = {};

      for (const [key, label] of Object.entries(REQUIRED_FIELDS)) {
        if (!placeholders.includes(key)) continue; // template doesn't use this field
        const raw = collected[key] ?? '';
        const val = typeof raw === 'string' ? raw.trim() : '';
        if (!val) {
          errors[key] = label;
          continue;
        }
        if (key === 'no' && (!/^\d+$/.test(val) || parseInt(val, 10) <= 0)) {
          errors[key] = label;
        }
      }

      const ok = Object.keys(errors).length === 0;
      let message = '';
      if (!ok) {
        const list = Object.values(errors)
          .map((label) => `• ${label}`)
          .join('\n');
        message = `يرجى إكمال الحقول المطلوبة قبل إنشاء المستند:\n${list}`;
      }
      return { ok, message, errors };
    },
    []
  );

  const focusFirstInvalid = useCallback(() => {
    requestAnimationFrame(() => {
      const root = contentRef.current;
      if (!root) return;
      const el = root.querySelector('[data-invalid="true"]') as HTMLElement | null;
      if (el) el.focus();
    });
  }, []);

  const doGenerate = async (action: 'generate' | 'print') => {
    if (!selectedTemplate) return;

    // Prevent duplicate submissions / duplicate document numbers
    if (creatingRef.current) return;
    creatingRef.current = true;
    setBusy(action);
    setErrorMsg('');
    setErrorFields({});

    try {
      const collected = collectAll(selectedTemplate);

      // Step 1: validate (template-aware). On failure, keep the form open and
      // preserve all entered data — never generate or close.
      const { ok, message, errors } = validateForm(selectedTemplate, collected);
      if (!ok) {
        setErrorFields(errors);
        setErrorMsg(message);
        focusFirstInvalid();
        return;
      }

      // Step 2: generate the document
      const res = await api.generateDocument(selectedTemplate.id, {
        documentName: documentName.trim() || selectedTemplate.name,
        values: collected,
        format: (format as 'docx' | 'xlsx' | 'pdf'),
      });

      // Step 3: verify generation actually succeeded
      if (!res.success || !res.document) {
        setErrorMsg(res.message || 'تعذر إنشاء المستند. تم الاحتفاظ بالبيانات المدخلة، ويمكنك المحاولة مرة أخرى.');
        return;
      }

      // Step 4: persistence is performed server-side (document + export_log +
      // document number). We only reach here after a confirmed successful creation.
      const filePath = res.document.filePath;

      // Step 5: optional side effects (open / print) — kept for parity
      if (action === 'print') {
        api.printFile(filePath);
      } else if (res.exportPath) {
        api.openFile(res.exportPath);
      }

      // Step 6: success — refresh parent state, notify, and ONLY NOW close.
      if (onSuccess) onSuccess();
      showToast?.('تم إنشاء المستند بنجاح.', 'success');
      onClose();
    } catch (err: any) {
      // Step 7: failure — keep form open, preserve data, surface the real error.
      console.error('[EDARA] Document creation failed:', err);
      setErrorMsg(
        (err && err.message ? err.message + '\n' : '') +
          'تعذر إنشاء المستند. تم الاحتفاظ بالبيانات المدخلة، ويمكنك المحاولة مرة أخرى.'
      );
    } finally {
      // The form must NEVER be closed here. We only reset the busy/guard state.
      setBusy(null);
      creatingRef.current = false;
    }
  };

  const handleManualCopy = async () => {
    if (!selectedTemplate) return;
    if (creatingRef.current) return;
    creatingRef.current = true;
    setBusy('manual');
    setErrorMsg('');
    try {
      const res = await api.createManualCopy(selectedTemplate.id);
      if (res.success) {
        if (res.document?.filePath) api.openFile(res.document.filePath);
        if (onSuccess) onSuccess();
        showToast?.('تم إنشاء النسخة اليدوية بنجاح.', 'success');
        onClose();
      } else {
        setErrorMsg(res.message || 'فشل إنشاء النسخة اليدوية.');
      }
    } catch (err: any) {
      console.error('[EDARA] Manual copy failed:', err);
      setErrorMsg(err.message || 'فشلت عملية إنشاء النسخة اليدوية.');
    } finally {
      setBusy(null);
      creatingRef.current = false;
    }
  };

  // -------- employee mode --------
  const saveEmployeeRecord = () => {
    const record: Record<string, string> = {};
    let hasData = false;
    (selectedTemplate?.grids || []).forEach((g) => {
      g.columns.forEach((col) => {
        const v = currentEmp[col.key] ?? '';
        record[col.key] = v;
        if (v.trim()) hasData = true;
      });
    });
    if (!hasData) return;
    setEmployees((prev) => [...prev, record]);
    setCurrentEmp({});
    setErrorMsg('');
  };

  const addRow = (g: TemplateGrid) => {
    setGridRows((prev) => ({ ...prev, [g.id]: (prev[g.id] || 0) + 1 }));
  };

  const removeRow = (g: TemplateGrid) => {
    const count = gridRows[g.id] || 0;
    if (count <= 1) return;
    const sep = g.rowNumberSeparator || '';
    const lastKey = count;
    setGridCells((prev) => {
      const next = { ...(prev[g.id] || {}) };
      g.columns.forEach((col) => delete next[`${col.key}${sep}${lastKey}`]);
      return { ...prev, [g.id]: next };
    });
    setGridRows((prev) => ({ ...prev, [g.id]: count - 1 }));
  };

  const renderField = (ph: string, label: string, required: boolean) => {
    const value = values[ph] || '';
    const setV = (v: string) => {
      setValues((prev) => ({ ...prev, [ph]: v }));
      if (errorFields[ph]) {
        setErrorFields((prev) => {
          if (!prev[ph]) return prev;
          const next = { ...prev };
          delete next[ph];
          return next;
        });
      }
    };
    const invalid = !!errorFields[ph];
    const invalidAttr = invalid ? 'true' : 'false';
    const errCls = invalid ? ' border-red-400 ring-1 ring-red-300' : '';
    const labelNode = (
      <label className="block text-xs font-bold text-slate-700 mb-1.5">
        {required && <span className="text-red-500 ml-1">*</span>}
        {label}
      </label>
    );

    if (ph === 'copyto') {
      return (
        <div key={ph} className="sm:col-span-2">
          {labelNode}
          <textarea
            value={value}
            onChange={(e) => setV(e.target.value)}
            rows={3}
            placeholder="أدخل الأسماء أو الجهات، كل سطر بجهة"
            data-invalid={invalidAttr}
            className={`w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none resize-y${errCls}`}
          />
        </div>
      );
    }

    if (ph === 'no') {
      return (
        <div key={ph}>
          {labelNode}
          <div className="flex gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => setV(e.target.value)}
              data-invalid={invalidAttr}
              className={`flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none${errCls}`}
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  const nr = await api.getLastNumber();
                  if (nr.success) {
                    // Only preview the next number locally. It is committed to
                    // storage only when the document is actually created.
                    setV(String(nr.next));
                  }
                } catch (e) {
                  /* ignore */
                }
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
              title="عدد جديد"
            >
              <Hash className="w-3.5 h-3.5" />
              عدد جديد
            </button>
          </div>
        </div>
      );
    }

    if (ph === 'date' || ph === 'date3') {
      return (
        <div key={ph}>
          {labelNode}
          <div className="flex gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => setV(e.target.value)}
              placeholder="yyyy/MM/dd"
              data-invalid={invalidAttr}
              className={`flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none${errCls}`}
            />
            <button
              type="button"
              onClick={() => setV(toDateInput(new Date()))}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              اليوم
            </button>
          </div>
        </div>
      );
    }

    if (ph === 'grade') {
      return (
        <div key={ph}>
          {labelNode}
          <select
            value={value}
            onChange={(e) => handleGradeChange(e.target.value)}
            data-invalid={invalidAttr}
            className={`w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer${errCls}`}
          >
            {gradeOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (ph === 'birthcity') {
      return (
        <div key={ph}>
          {labelNode}
          <select
            value={value}
            onChange={(e) => setV(e.target.value)}
            data-invalid={invalidAttr}
            className={`w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer${errCls}`}
          >
            {BIRTH_CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (ph === 'academic_year') {
      const currentYear = new Date().getFullYear();
      const years = Array.from({ length: 16 }, (_, i) => `${currentYear - 5 + i}–${currentYear - 4 + i}`);
      if (value && !years.includes(value)) years.push(value);
      return (
        <div key={ph}>
          {labelNode}
          <select
            value={value}
            onChange={(e) => setV(e.target.value)}
            data-invalid={invalidAttr}
            className={`w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer${errCls}`}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (ph === 'result') {
      return (
        <div key={ph}>
          {labelNode}
          <select
            value={value}
            onChange={(e) => setV(e.target.value)}
            data-invalid={invalidAttr}
            className={`w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer${errCls}`}
          >
            {RESULT_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (ph === 'round') {
      return (
        <div key={ph}>
          {labelNode}
          <select
            value={value}
            onChange={(e) => setV(e.target.value)}
            data-invalid={invalidAttr}
            className={`w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer${errCls}`}
          >
            {ROUND_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      );
    }

    return (
      <div key={ph}>
        {labelNode}
        <input
          type="text"
          value={value}
          onChange={(e) => setV(e.target.value)}
          placeholder={`أدخل ${label}`}
          data-invalid={invalidAttr}
          className={`w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none${errCls}`}
        />
      </div>
    );
  };

  const renderGrid = (g: TemplateGrid, tpl: DocumentTemplate) => {
    const sep = g.rowNumberSeparator || '';
    const gridId = g.id;

    if (g.fixedRows && g.fixedRows.length > 0) {
      // MENTIS parity: fixedRows.placeholders map to the DATA columns only;
      // columns[0] is the label column rendered from fr.label (see
      // DynamicTemplateForm.cs: c + 1 < grid.Columns.Count).
      const dataCols = g.columns.filter((c, idx) => idx > 0 && !c.hidden);
      const totalCol = g.autoCalculateTotal && g.totalColumnIndex >= 0 ? g.totalColumnIndex : -1;
      const malePhIdx = totalCol >= 2 ? totalCol - 2 - 1 : -1;
      const femalePhIdx = totalCol >= 1 ? totalCol - 1 - 1 : -1;
      const totalPhIdx = totalCol >= 1 ? totalCol - 1 : -1;
      const summaryIdx = g.fixedRows.findIndex((fr) => fr.hidden);

      const visibleFixed = g.fixedRows.filter((fr) => !fr.hidden);
      const cellView = (pending?: { ph: string; val: string }) => {
        const base = { ...(gridCells[gridId] || {}) };
        if (pending) base[pending.ph] = pending.val;
        return base;
      };
      const totalForRow = (rowIdx: number, base: Record<string, string>) => {
        const pm = g.fixedRows[rowIdx].placeholders[malePhIdx] || '';
        const pf = g.fixedRows[rowIdx].placeholders[femalePhIdx] || '';
        const m = parseInt(base[pm] || '', 10) || 0;
        const f = parseInt(base[pf] || '', 10) || 0;
        return m + f;
      };
      const updateRowTotal = (rowIdx: number, pending?: { ph: string; val: string }) => {
        if (summaryIdx < 0) return;
        const base = cellView(pending);
        const totalPh = g.fixedRows[rowIdx].placeholders[totalPhIdx] || '';
        const t = totalForRow(rowIdx, base);
        setCell(gridId, totalPh, t > 0 ? String(t) : '');
        let sumM = 0,
          sumF = 0,
          sumT = 0;
        for (let r = 0; r < g.fixedRows.length; r++) {
          if (r === summaryIdx) continue;
          const pm = g.fixedRows[r].placeholders[malePhIdx] || '';
          const pf = g.fixedRows[r].placeholders[femalePhIdx] || '';
          const pt = g.fixedRows[r].placeholders[totalPhIdx] || '';
          sumM += parseInt(base[pm] || '', 10) || 0;
          sumF += parseInt(base[pf] || '', 10) || 0;
          sumT += parseInt(base[pt] || '', 10) || 0;
        }
        const sRow = g.fixedRows[summaryIdx];
        setCell(gridId, sRow.placeholders[malePhIdx] || '', sumM > 0 ? String(sumM) : '');
        setCell(gridId, sRow.placeholders[femalePhIdx] || '', sumF > 0 ? String(sumF) : '');
        setCell(gridId, sRow.placeholders[totalPhIdx] || '', sumT > 0 ? String(sumT) : '');
      };

      return (
        <div key={gridId} className="space-y-2">
          {g.title && <h5 className="text-xs font-black text-slate-700">{g.title}</h5>}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold">
                  <th className="py-2 px-3 border-b border-slate-200">{g.columns[0]?.header || ''}</th>
                  {dataCols.map((c) => (
                    <th key={c.key} className="py-2 px-3 border-b border-slate-200">
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleFixed.map((fr) => {
                  const rowIdx = g.fixedRows.indexOf(fr);
                  return (
                    <tr key={rowIdx} className="hover:bg-slate-50/70">
                      <td className="py-1.5 px-3 font-bold text-slate-800 bg-slate-50/60">{fr.label}</td>
                      {dataCols.map((c) => {
                        const colIdx = g.columns.indexOf(c);
                        const isTotal = colIdx === totalCol;
                        const ph = fr.placeholders[colIdx - 1];
                        const isReadOnly = isTotal || c.readOnly;
                        return (
                          <td key={c.key} className="py-1.5 px-3">
                            {isReadOnly ? (
                              <div className="text-center text-slate-700 font-bold">
                                {isTotal ? totalForRow(rowIdx, cellView()) || '' : (gridCells[gridId]?.[ph] || '')}
                              </div>
                            ) : (
                              <input
                                type="text"
                                value={gridCells[gridId]?.[ph] || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCell(gridId, ph, val);
                                  if (autoTotalGrid) updateRowTotal(rowIdx, { ph, val });
                                }}
                                className="w-full min-w-16 px-2 py-1 rounded-md border border-slate-200 bg-white focus:ring-1 focus:ring-blue-600 focus:outline-none text-xs"
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // Dynamic-column grid
    const rowCount = gridRows[gridId] || 1;
    return (
      <div key={gridId} className="space-y-2">
        {g.title && <h5 className="text-xs font-black text-slate-700">{g.title}</h5>}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                {g.columns.map((c) => (
                  <th key={c.key} className="py-2 px-3 border-b border-slate-200">
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Array.from({ length: rowCount }).map((_, r) => (
                <tr key={r} className="hover:bg-slate-50/70">
                  {g.columns.map((c) => {
                    const key = `${c.key}${sep}${r + 1}`;
                    return (
                      <td key={c.key} className="py-1.5 px-3">
                        {c.readOnly ? (
                          <div className="text-center text-slate-700 font-bold min-h-5">
                            {gridCells[gridId]?.[key] || ''}
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={gridCells[gridId]?.[key] || ''}
                            onChange={(e) => setCell(gridId, key, e.target.value)}
                            className="w-full min-w-16 px-2 py-1 rounded-md border border-slate-200 bg-white focus:ring-1 focus:ring-blue-600 focus:outline-none text-xs"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {tpl.allowAddRows && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => addRow(g)}
              className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {g.addButtonLabel || '+ إضافة صف'}
            </button>
            <button
              type="button"
              onClick={() => removeRow(g)}
              className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {g.deleteButtonLabel || '- حذف صف'}
            </button>
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  const tpl = selectedTemplate;
  const fieldLabels = tpl?.fieldLabels || {};
  const fieldsToRender = (tpl?.placeholders || []).filter(
    (ph) => !AUTO_FILLED_FIELDS.includes(ph) && !HIDDEN_PRINCIPAL_FIELDS.includes(ph)
  );
  const autoTotalGrid = tpl?.grids?.find((g) => g.autoCalculateTotal)?.id || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden border border-slate-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/30 rounded-lg text-blue-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg">إنشاء مستند من نموذج</h3>
              <p className="text-xs text-slate-300">تعبئة بيانات النموذج وإنشاء مستند جديد جاهز للطباعة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div ref={contentRef} className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-12 text-center text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-3" />
              <p className="text-sm font-medium">جاري فحص مجلد النماذج...</p>
            </div>
          ) : !tpl ? (
            <div className="py-10 px-4 text-center">
              <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-200">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">لا توجد نماذج مستندات متاحة حالياً.</h4>
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl text-sm transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {errorMsg && (
                <div className="p-3 bg-red-50 text-red-700 text-sm font-medium rounded-xl border border-red-200 flex items-center gap-2 whitespace-pre-line">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Template Selector (only when not locked to a template) */}
              {!initialTemplate && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    اختر نموذج المستند <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={tpl.id}
                    onChange={(e) => handleSelectTemplate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition-all cursor-pointer"
                  >
                    {templates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.category ? ` — ${item.category}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Regular Fields */}
              {fieldsToRender.length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                    بيانات حقول النموذج ({fieldsToRender.length})
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {fieldsToRender.map((ph) =>
                      renderField(ph, fieldLabels[ph] || ph.replace(/_/g, ' '), ['to', 'date', 'no'].includes(ph))
                    )}
                  </div>
                </div>
              )}

              {/* Branch selector — only for Preparatory (المرحلة الإعدادية) */}
              {isPreparatoryGrade(values.grade) && (
                <div className="pt-3 border-t border-slate-100">
                  <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                    الفرع الدراسي
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        الفرع <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={values.branch || ''}
                        onChange={(e) => handleBranchChange(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer"
                      >
                        <option value="SCIENTIFIC">الفرع العلمي</option>
                        <option value="LITERARY">الفرع الأدبي</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Employee Mode */}
              {tpl.employeeMode && (
                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      سجلات الموظفين
                    </h5>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-bold">
                      <Save className="w-3.5 h-3.5" />
                      عدد الموظفين: {employees.length}
                    </span>
                  </div>
                  <div className="space-y-4">
                    {tpl.grids?.map((g) => renderGrid(g, tpl))}
                  </div>
                  <button
                    type="button"
                    onClick={saveEmployeeRecord}
                    className="mt-3 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    حفظ سجل الموظف
                  </button>
                </div>
              )}

              {/* Grids (non-employee) */}
              {!tpl.employeeMode && tpl.grids && tpl.grids.length > 0 && (
                <div className="pt-3 border-t border-slate-100 space-y-4">
                  <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    جداول النموذج
                  </h5>
                  {tpl.grids.map((g) => renderGrid(g, tpl))}
                </div>
              )}

              {/* Format + Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-600">صيغة الملف:</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 text-xs font-bold focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer"
                  >
                    <option value={tpl.fileType === 'xlsx' ? 'xlsx' : 'docx'}>
                      {tpl.fileType === 'xlsx' ? 'XLSX' : 'DOCX'}
                    </option>
                    <option value="pdf">PDF</option>
                  </select>
                  {tpl.manualEditOption && (
                    <button
                      type="button"
                      onClick={handleManualCopy}
                      disabled={busy !== null}
                      className="px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold border border-purple-200 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {busy === 'manual' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                      نسخة للتعبئة اليدوية
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={busy !== null}
                    className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={() => doGenerate('print')}
                    disabled={busy !== null}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl text-sm flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    title="إنشاء وإرسال مباشرة إلى الطابعة"
                  >
                    {busy === 'print' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Printer className="w-4 h-4" />
                    )}
                    طباعة
                  </button>
                  <button
                    type="button"
                    onClick={() => doGenerate('generate')}
                    disabled={busy !== null}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl text-sm shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {busy === 'generate' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>جاري إنشاء المستند...</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        <span>إنشاء المستند</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
