import React from 'react';
import { SchoolProfile, NavigationTab } from '../types';
import { normalizeDigits } from '../utils/numberUtils';
import { api } from '../services/api';
import { useMinistryNotifications } from '../services/ministryNotifications';
import {
  Users,
  BriefcaseBusiness,
  FileText,
  Landmark,
  Instagram,
  Facebook,
  Send,
  Globe,
  X,
} from 'lucide-react';
import { LatestNewsCard } from '../components/LatestNewsCard';
import {
  OFFICIAL_MINISTRY_LINKS,
  MinistryOfficialPlatform,
} from '../config/ministryOfficialLinks';

interface DashboardViewProps {
  schoolProfile: SchoolProfile | null;
  stats: {
    studentsCount: number;
    staffCount: number;
    documentsCount: number;
    ministryDocsCount: number;
  };
  onNavigate: (tab: NavigationTab) => void;
  onRefreshStats?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  schoolProfile,
  stats,
  onNavigate,
  onRefreshStats,
}) => {
  const { unreadCount, totalCount } = useMinistryNotifications();

  const platformIcon: Record<MinistryOfficialPlatform, React.ComponentType<{ className?: string }>> = {
    instagram: Instagram,
    telegram: Send,
    facebook: Facebook,
    orPortal: Globe,
    x: X,
  };

  return (
    <div className="pb-8 select-none flex flex-col gap-6 lg:h-full">
      {/* Dynamic Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
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

        {/* Card 3: General Documents Count */}
        <div
          onClick={() => onNavigate('archive')}
          className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-slate-500">المستندات العامة</span>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <FileText className="w-6 h-6" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900">
            {normalizeDigits(stats.documentsCount)}
          </div>
          <p className="text-xs text-slate-400 font-medium mt-1">مستند إداري محفوظ</p>
        </div>

        {/* Card 4: Ministry Documents Count */}
        <div
          onClick={() => onNavigate('ministry')}
          className={`relative bg-white p-6 rounded-2xl border shadow-xs transition-all cursor-pointer group ${
            unreadCount > 0
              ? 'border-blue-400 ring-2 ring-blue-300 shadow-blue-200/70 hover:shadow-blue-300/80'
              : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
          }`}
        >
          {unreadCount > 0 && (
            <div
              title="يوجد مستندات جديدة من الوزارة لم يتم الاطلاع عليها بعد"
              className="absolute -top-3 -left-3 min-w-7 h-7 px-1.5 rounded-full bg-blue-500 text-white flex items-center justify-center font-black text-xs shadow-lg border-2 border-white"
            >
              {unreadCount > 99 ? '99+' : normalizeDigits(unreadCount)}
            </div>
          )}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-slate-500">مستندات الوزارة</span>
            <div className={`p-3 rounded-xl transition-colors ${unreadCount > 0 ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white'}`}>
              <Landmark className="w-6 h-6" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900">
            {normalizeDigits(totalCount > 0 ? totalCount : stats.ministryDocsCount)}
          </div>
          <p className="text-xs text-slate-400 font-medium mt-1">
            {unreadCount > 0 ? `يوجد ${normalizeDigits(unreadCount)} مستند جديد` : 'كتاب وقرار وزاري رسمي'}
          </p>
        </div>
      </div>

      {/* Row 2: latest news (right, wide) + official ministry accounts (left, narrow) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 flex-1 min-h-0">
        {/* Right: latest news (large card) */}
        <LatestNewsCard />

        {/* Left: official Ministry of Education accounts and portals (tall card) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 lg:col-span-1 h-full flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Landmark className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-800">
              الحسابات والمواقع الرسمية لوزارة التربية
            </h2>
          </div>
          <div className="flex flex-col gap-2">
            {OFFICIAL_MINISTRY_LINKS.map((link) => {
              const Icon = platformIcon[link.platform];
              return (
                <div
                  key={link.platform}
                  role="button"
                  tabIndex={0}
                  title={link.platformName}
                  onClick={() => api.openExternalUrl(link.url)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      api.openExternalUrl(link.url);
                    }
                  }}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white rounded-xl border border-slate-200 shadow-xs hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                >
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-bold text-slate-700">{link.platformName}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
};

