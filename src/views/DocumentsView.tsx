import React, { useState, useEffect, useMemo } from 'react';
import { DocumentTemplate } from '../types';
import { api } from '../services/api';
import {
  FileText,
  Search,
  Loader2,
  Sparkles,
  Layers,
  Sheet,
  FolderOpen,
  FileType2,
  BookOpen,
  Mail,
  ChevronLeft,
  ArrowRight,
} from 'lucide-react';
import { CreateDocumentModal } from '../components/CreateDocumentModal';

interface DocumentsViewProps {
  onRefreshStats: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  onRefreshStats,
  showToast,
}) => {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Create document modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [modalTemplate, setModalTemplate] = useState<DocumentTemplate | null>(null);

  // Active template category section (null = show section cards)
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const openCreateModal = (tpl?: DocumentTemplate | null) => {
    setModalTemplate(tpl || null);
    setIsCreateModalOpen(true);
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const tplRes = await api.getTemplates(searchQuery);
      if (tplRes.success) {
        setTemplates(tplRes.templates || []);
      }
    } catch (err) {
      showToast('فشل تحميل قائمة النماذج.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const templateGroups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, DocumentTemplate[]>();
    templates.forEach((tpl) => {
      const cat = tpl.category || 'نماذج';
      if (!map.has(cat)) {
        map.set(cat, []);
        order.push(cat);
      }
      map.get(cat)!.push(tpl);
    });
    return order.map((category) => ({ category, items: map.get(category) || [] }));
  }, [templates]);

  const sortedGroups = useMemo(() => {
    const preferred = ['سجلات', 'مخاطبات'];
    return [...templateGroups].sort((a, b) => {
      const ia = preferred.indexOf(a.category);
      const ib = preferred.indexOf(b.category);
      const na = ia === -1 ? 99 : ia;
      const nb = ib === -1 ? 99 : ib;
      if (na !== nb) return na - nb;
      return a.category.localeCompare(b.category, 'ar');
    });
  }, [templateGroups]);

  useEffect(() => {
    if (activeCategory && !templateGroups.some((g) => g.category === activeCategory)) {
      setActiveCategory(null);
    }
  }, [templateGroups, activeCategory]);

  const activeGroup = activeCategory ? sortedGroups.find((g) => g.category === activeCategory) : null;

  const categoryIcon = (category: string) => {
    if (category === 'سجلات') return <BookOpen className="w-6 h-6" />;
    if (category === 'مخاطبات') return <Mail className="w-6 h-6" />;
    return <FolderOpen className="w-6 h-6" />;
  };

  const fileTypeIcon = (tpl: DocumentTemplate) => {
    const ext = (tpl.fileType || (tpl.fileName || '').split('.').pop() || '').toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      return <Sheet className="w-5 h-5 shrink-0 text-[#107c42]" />;
    }
    if (ext === 'pdf') {
      return <FileType2 className="w-5 h-5 shrink-0 text-red-600" />;
    }
    return <FileText className="w-5 h-5 shrink-0 text-blue-600" />;
  };

  const fileTypeBadge = (tpl: DocumentTemplate) => {
    const ext = (tpl.fileType || (tpl.fileName || '').split('.').pop() || 'docx').toLowerCase();
    const map: Record<string, { label: string; cls: string }> = {
      docx: { label: 'Word', cls: 'bg-blue-100/80 text-blue-800' },
      xlsx: { label: 'Excel', cls: 'bg-[#107c42]/10 text-[#107c42]' },
      pdf: { label: 'PDF', cls: 'bg-red-100/80 text-red-800' },
    };
    const info = map[ext] || { label: ext.toUpperCase(), cls: 'bg-slate-100 text-slate-700' };
    return (
      <span className={`px-2 py-0.5 text-[10px] font-black rounded-md ${info.cls}`}>{info.label}</span>
    );
  };

  return (
    <div className="space-y-6 pb-8 select-none">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
              <FileText className="w-7 h-7 text-blue-600" />
              <span>مكتبة نماذج المستندات</span>
            </h2>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            عرض النماذج المعيارية المتاحة وإنشاء المستندات المدرسية مباشرةً
          </p>
        </div>
      </div>

      {/* Search Input */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="البحث باسم النموذج أو الوصف..."
            className="w-full pl-4 pr-11 py-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
          />
          <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
        </div>
      </div>

      {/* Section 1: Available Templates Library */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <Layers className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-bold text-slate-900">نماذج المستندات المتاحة ({templates.length})</h3>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-slate-500 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-xs font-semibold">جاري البحث في مجلد النماذج...</span>
          </div>
        ) : templates.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <p className="text-slate-700 font-bold text-sm">لا توجد نماذج مستندات متاحة حالياً.</p>
            <p className="text-slate-500 text-xs mt-1">
              أضف نماذج المستندات إلى مجلد النماذج في التطبيق لاستخدام هذه الوظيفة.
            </p>
          </div>
        ) : activeGroup ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-700">
                  {categoryIcon(activeGroup.category)}
                </div>
                <h4 className="text-base font-black text-slate-800">{activeGroup.category}</h4>
                <span className="text-xs font-bold text-slate-400">({activeGroup.items.length} نموذج)</span>
              </div>
              <button
                onClick={() => setActiveCategory(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>عودة إلى الأقسام</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeGroup.items.map((tpl) => {
                const ext = (tpl.fileType || (tpl.fileName || '').split('.').pop() || '').toLowerCase();
                const isExcel = ext === 'xlsx' || ext === 'xls';
                return (
                <div
                  key={tpl.id}
                  className={`p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all flex flex-col justify-between gap-3 ${isExcel ? 'border-[#107c42]/40' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm min-w-0">
                      {fileTypeIcon(tpl)}
                      <span className="truncate" title={tpl.name}>{tpl.name}</span>
                    </div>
                    {fileTypeBadge(tpl)}
                  </div>
                  <button
                    onClick={() => openCreateModal(tpl)}
                    className={`w-full py-2 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${isExcel ? 'bg-[#107c42] hover:bg-[#107c42]/90 active:bg-[#107c42]/80' : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'}`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>استخدام</span>
                  </button>
                </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sortedGroups.map((group) => (
              <button
                key={group.category}
                onClick={() => setActiveCategory(group.category)}
                className="group p-6 bg-slate-50 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-md hover:bg-white transition-all text-right flex flex-col items-center justify-center gap-4 min-h-[170px] cursor-pointer"
              >
                <div className="p-4 rounded-2xl bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  {categoryIcon(group.category)}
                </div>
                <div className="text-center">
                  <div className="font-black text-lg text-slate-900">{group.category}</div>
                  <div className="text-xs text-slate-500 font-bold mt-1">
                    {group.items.length} {group.items.length === 1 ? 'نموذج' : group.items.length === 2 ? 'نموذجان' : 'نماذج'}
                  </div>
                </div>
                <div className="text-xs font-bold text-blue-600 group-hover:underline flex items-center gap-1">
                  <span>دخول لعرض النماذج</span>
                  <ChevronLeft className="w-4 h-4" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Modal for Creating Document */}
      <CreateDocumentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        initialTemplate={modalTemplate}
        showToast={showToast}
        onSuccess={() => {
          setModalTemplate(null);
          fetchData();
          onRefreshStats();
        }}
      />
    </div>
  );
};
