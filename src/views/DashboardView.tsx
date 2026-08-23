import React, { useState, useEffect, useMemo } from 'react';
import { SchoolProfile, NavigationTab } from '../types';
import { normalizeDigits } from '../utils/numberUtils';
import { mailSync, type MailSyncState } from '../services/mailSync';
import { subscribeDrivePoller, type DrivePollState } from '../services/drivePoller';
import { subscribeNewsPoller, type NewsPollState } from '../services/newsPoller';
import {
  Users,
  BriefcaseBusiness,
  FileText,
  Mail,
  Clock,
  Building,
} from 'lucide-react';
import { LatestNewsCard } from '../components/LatestNewsCard';

interface DashboardViewProps {
  schoolProfile: SchoolProfile | null;
  stats: {
    studentsCount: number;
    staffCount: number;
    documentsCount: number;
  };
  onNavigate: (tab: NavigationTab, params?: Record<string, string>) => void;
  onRefreshStats?: () => void;
}

function formatTimeShort(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `${diffMin} د`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} س`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD} ي`;
}

// Extracted mail section — only re-renders when mailSync state changes,
// NOT when stats/schoolProfile change.
const MailSection = React.memo(({ onNavigate }: { onNavigate: (tab: NavigationTab, params?: Record<string, string>) => void }) => {
  const [mailState, setMailState] = useState<MailSyncState>({
    messages: [],
    contacts: [],
    totalUnread: 0,
    loading: false,
    lastSyncAt: null,
  });

  useEffect(() => {
    const unsub = mailSync.subscribe(setMailState);
    return unsub;
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 lg:col-span-1 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-800">الرسائل الواردة</h2>
        </div>
        {mailState.totalUnread > 0 && (
          <span className="min-w-6 h-6 px-2 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center">
            {mailState.totalUnread > 99 ? '99+' : normalizeDigits(mailState.totalUnread)}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {mailState.contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm">
            <Mail className="w-10 h-10 mb-2 opacity-40" />
            <span>لا توجد رسائل واردة</span>
          </div>
        ) : (
          mailState.contacts.map((contact) => (
            <div
              key={contact.senderAccountId}
              role="button"
              tabIndex={0}
              onClick={() => onNavigate('mail', { contactId: contact.senderAccountId })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onNavigate('mail', { contactId: contact.senderAccountId });
                }
              }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
                contact.unreadCount > 0
                  ? 'bg-blue-50 border-blue-200 hover:border-blue-400 hover:shadow-md'
                  : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                contact.unreadCount > 0
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-500'
              }`}>
                {(contact.senderDisplayName || '').charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-bold truncate ${
                    contact.unreadCount > 0 ? 'text-blue-900' : 'text-slate-800'
                  }`}>
                    {contact.senderDisplayName || 'غير معروف'}
                  </span>
                  <span className="text-[11px] text-slate-400 shrink-0 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTimeShort(contact.latestMessageAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-xs text-slate-500 truncate">
                    {contact.latestSubject || '(بدون موضوع)'}
                  </span>
                  {contact.unreadCount > 0 && (
                    <span className="text-[11px] font-bold text-blue-600 shrink-0">
                      {normalizeDigits(contact.unreadCount)} جديد
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {mailState.contacts.length > 0 && (
        <button
          onClick={() => onNavigate('mail')}
          className="mt-3 w-full py-2 text-sm font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
        >
          عرض جميع الرسائل
        </button>
      )}
    </div>
  );
});

export const DashboardView: React.FC<DashboardViewProps> = ({
  schoolProfile,
  stats,
  onNavigate,
  onRefreshStats,
}) => {
  const [driveState, setDriveState] = useState<DrivePollState>({
    fileCount: 0,
    hasNewFiles: false,
    knownFileIds: new Set(),
    lastCheckedAt: null,
  });
  const [newsState, setNewsState] = useState<NewsPollState>({
    hasNewNews: false,
    knownNewsIds: new Set(),
    lastCheckedAt: null,
  });

  useEffect(() => {
    const unsubDrive = subscribeDrivePoller(setDriveState);
    const unsubNews = subscribeNewsPoller(setNewsState);
    return () => {
      unsubDrive();
      unsubNews();
    };
  }, []);

  const displayCount = driveState.fileCount > 0 ? driveState.fileCount : stats.documentsCount;

  return (
    <div className="pb-8 select-none flex flex-col gap-6 lg:h-full">
      {/* Two-column layout: LEFT = messages, RIGHT = stats + news */}
      <div className="flex flex-col lg:flex-row gap-5 flex-1 min-h-0">

        {/* LEFT COLUMN: Messages (34% width, spans full height) */}
        <div className="lg:w-[34%] min-w-0 flex flex-col min-h-0">
          <MailSection onNavigate={onNavigate} />
        </div>

        {/* RIGHT COLUMN: Stats + News (66% width) */}
        <div className="lg:w-[66%] min-w-0 flex flex-col gap-5 min-h-0">
          {/* Top: 3 compact statistic cards */}
          <div className="grid grid-cols-3 gap-4">
            {/* Card 1: Students Count */}
            <div
              onClick={() => onNavigate('students')}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-slate-500">الطلاب</span>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Users className="w-6 h-6" />
                </div>
              </div>
              <div className="text-3xl font-black text-slate-900">
                {normalizeDigits(stats.studentsCount)}
              </div>
              <p className="text-xs text-slate-400 font-medium mt-1">طالب مسجل في النظام</p>
            </div>

            {/* Card 2: Staff Count */}
            <div
              onClick={() => onNavigate('staff')}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-slate-500">الموظفون والكادر</span>
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <BriefcaseBusiness className="w-6 h-6" />
                </div>
              </div>
              <div className="text-3xl font-black text-slate-900">
                {normalizeDigits(stats.staffCount)}
              </div>
              <p className="text-xs text-slate-400 font-medium mt-1">موظف وأستاذ في السجل</p>
            </div>

            {/* Card 3: Official Documents (كتب رسمية) — with live file count and new-file outline */}
            <div
              onClick={() => onNavigate('governorate_drive')}
              className={`bg-white p-6 rounded-2xl shadow-xs hover:shadow-md transition-all cursor-pointer group ${
                driveState.hasNewFiles
                  ? 'border-2 border-amber-400 ring-2 ring-amber-400/30'
                  : 'border-2 border-blue-500'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-slate-500">كتب رسمية</span>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Building className="w-6 h-6" />
                </div>
              </div>
              <div className="text-3xl font-black text-slate-900">
                {normalizeDigits(displayCount)}
              </div>
              <p className="text-xs text-slate-400 font-medium mt-1">ملف في مجلد المحافظة</p>
              {driveState.hasNewFiles && (
                <p className="text-xs text-amber-600 font-bold mt-1.5 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  مستند جديد
                </p>
              )}
            </div>
          </div>

          {/* Bottom: Latest News (full width of right column) — with new-news indicator */}
          <div className="flex-1 min-h-0 relative">
            {newsState.hasNewNews && (
              <div className="absolute top-2 left-2 z-10">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold border border-amber-300 shadow-xs">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  خبر جديد
                </span>
              </div>
            )}
            <LatestNewsCard />
          </div>
        </div>

      </div>
    </div>
  );
};
