import React, { useState, useEffect, useCallback } from 'react';
import { Share, X, Mail, Send, MessageSquare, Loader2, FolderOpen, Copy, Check, AlertCircle, FileText } from 'lucide-react';
import { api } from '../services/api';

interface ShareEntry {
  id: string;
  title: string;
  filePath?: string;
}

interface ShareModalProps {
  entry: ShareEntry | null;
  onClose: () => void;
}

type Step = 'select' | 'email' | 'done';

const SHARE_METHOD = {
  email: 'email',
  telegram: 'telegram',
  whatsapp: 'whatsapp',
} as const;

type ShareMethod = (typeof SHARE_METHOD)[keyof typeof SHARE_METHOD];

export const ShareModal: React.FC<ShareModalProps> = ({ entry, onClose }) => {
  const [step, setStep] = useState<Step>('select');
  const [method, setMethod] = useState<ShareMethod | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Email form state
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [emailError, setEmailError] = useState('');

  const isDesktop = typeof window !== 'undefined' && !!(window as any).edaraDesktop?.isDesktop;

  // Reset internal state whenever a new document is opened for sharing
  useEffect(() => {
    if (entry) {
      setStep('select');
      setMethod(null);
      setIsBusy(false);
      setCopied(false);
      setRecipient('');
      setSubject(entry.title || '');
      setMessage('');
      setEmailError('');
    }
  }, [entry]);

  const handleClose = useCallback(() => {
    if (isBusy) return;
    onClose();
  }, [isBusy, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!entry) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entry, handleClose]);

  const copyPath = async () => {
    if (!entry?.filePath) return;
    try {
      await navigator.clipboard.writeText(entry.filePath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      /* ignore clipboard errors */
    }
  };

  const openFolder = () => {
    if (entry?.filePath) api.showItemInFolder(entry.filePath);
  };

  const finish = (m: ShareMethod) => {
    setMethod(m);
    setStep('done');
    setIsBusy(false);
  };

  const handleEmailSubmit = () => {
    if (!entry) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (recipient.trim() && !emailRegex.test(recipient.trim())) {
      setEmailError('يرجى إدخال بريد إلكتروني صحيح للمستلم.');
      return;
    }
    setEmailError('');
    setIsBusy(true);
    const to = recipient.trim() ? encodeURIComponent(recipient.trim()) : '';
    const subj = encodeURIComponent(subject.trim() || entry.title || 'مستند من Edara');
    const bodyText =
      (message.trim() ? message.trim() + '\n\n' : '') +
      `المستند: ${entry.title}\nالمسار: ${entry.filePath || ''}`;
    const body = encodeURIComponent(bodyText);
    const mailto = `mailto:${to}?subject=${subj}&body=${body}`;
    // Open the default mail client. We do not claim the email was sent.
    api.openMailTo(mailto);
    // Brief delay to prevent double clicks and reflect the action
    setTimeout(() => finish(SHARE_METHOD.email), 400);
  };

  const handleTelegram = () => {
    if (!entry) return;
    setIsBusy(true);
    const text = encodeURIComponent(`مستند: ${entry.title}`);
    const url = `https://t.me/share/url?url=${encodeURIComponent(entry.filePath || '')}&text=${text}`;
    api.openExternalUrl(url);
    setTimeout(() => finish(SHARE_METHOD.telegram), 400);
  };

  const handleWhatsApp = () => {
    if (!entry) return;
    setIsBusy(true);
    const text = encodeURIComponent(`مستند: ${entry.title}`);
    const url = `https://wa.me/?text=${text}`;
    api.openExternalUrl(url);
    setTimeout(() => finish(SHARE_METHOD.whatsapp), 400);
  };

  if (!entry) return null;

  const methods: Array<{
    key: ShareMethod;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    onClick: () => void;
  }> = [
    { key: SHARE_METHOD.email, label: 'البريد الإلكتروني', icon: Mail, color: 'text-blue-600 bg-blue-50 group-hover:bg-blue-100', onClick: () => { setStep('email'); } },
    { key: SHARE_METHOD.telegram, label: 'Telegram', icon: Send, color: 'text-sky-600 bg-sky-50 group-hover:bg-sky-100', onClick: handleTelegram },
    { key: SHARE_METHOD.whatsapp, label: 'WhatsApp', icon: MessageSquare, color: 'text-emerald-600 bg-emerald-50 group-hover:bg-emerald-100', onClick: handleWhatsApp },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs select-none"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Share className="w-5 h-5 text-blue-600" />
            <span>مشاركة المستند</span>
          </h3>
          <button
            onClick={handleClose}
            disabled={isBusy}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Document name */}
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-slate-400 mb-0.5">المستند المحدد</p>
              <p className="text-sm font-bold text-slate-900 truncate dir-ltr text-left" title={entry.title}>
                {entry.title}
              </p>
            </div>
          </div>

          {step === 'select' && (
            <>
              <p className="text-sm font-bold text-slate-600">اختر طريقة المشاركة:</p>
              <div className="grid grid-cols-1 gap-2.5">
                {methods.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={m.onClick}
                      disabled={isBusy}
                      className="group flex items-center gap-3 w-full text-right px-4 py-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <span className={`p-2.5 rounded-lg transition-colors ${m.color}`}>
                        <Icon className="w-5 h-5" />
                      </span>
                      <span className="text-sm font-bold text-slate-800">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 'email' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  البريد الإلكتروني للمستلم <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={recipient}
                  onChange={(e) => {
                    setRecipient(e.target.value);
                    if (emailError) setEmailError('');
                  }}
                  placeholder="example@domain.com"
                  dir="ltr"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
                {emailError && (
                  <p className="mt-1.5 text-xs font-bold text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{emailError}</span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">الموضوع</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="موضوع الرسالة"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">رسالة (اختيارية)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="أضف رسالة توضيحية..."
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none resize-y"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStep('select')}
                  disabled={isBusy}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  رجوع
                </button>
                <button
                  type="button"
                  onClick={handleEmailSubmit}
                  disabled={isBusy}
                  className="px-5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
                >
                  {isBusy ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Mail className="w-4 h-4" />}
                  <span>{isBusy ? 'جاري الفتح...' : 'مشاركة عبر البريد'}</span>
                </button>
              </div>
            </div>
          )}

          {step === 'done' && method && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="text-xs font-medium leading-relaxed">
                  {method === SHARE_METHOD.email
                    ? 'تم فتح برنامج البريد الإلكتروني الافتراضي. لم يتم إرفاق المستند تلقائياً، يرجى إرفاقه يدوياً قبل الإرسال.'
                    : method === SHARE_METHOD.telegram
                    ? 'تم فتح Telegram. لإرسال المستند، اذهب إلى مجلده وأرفقه يدوياً.'
                    : 'تم فتح WhatsApp. لإرسال المستند، اذهب إلى مجلده وأرفقه يدوياً.'}
                </span>
              </div>

              {entry.filePath && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={copyPath}
                    className="px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'تم نسخ المسار' : 'نسخ مسار الملف'}</span>
                  </button>
                  {isDesktop && (
                    <button
                      type="button"
                      onClick={openFolder}
                      className="px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>فتح مجلد الملف</span>
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStep('select')}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  رجوع
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-xs cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
