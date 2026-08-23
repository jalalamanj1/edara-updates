import React from 'react';
import { NavigationTab } from '../types';
import { EdaraLogo } from './EdaraLogo';
import {
  LayoutDashboard,
  Users,
  BriefcaseBusiness,
  FileText,
  DatabaseBackup,
  FolderOpen,
  Archive,
  Mail,
  Settings,
  Building,
} from 'lucide-react';

interface SidebarProps {
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
}

const NAV_ITEMS: { id: NavigationTab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { id: 'students', label: 'الطلاب', icon: Users },
  { id: 'staff', label: 'الموظفون', icon: BriefcaseBusiness },
  { id: 'documents', label: 'المستندات', icon: FileText },
  { id: 'archive', label: 'الأرشيف', icon: Archive },
  { id: 'admin', label: 'ملفات إدارية', icon: FolderOpen },
  { id: 'governorate_drive', label: 'كتب رسمية', icon: Building },
  { id: 'mail', label: 'البريد الإداري', icon: Mail },
  { id: 'backup', label: 'النسخ الاحتياطي', icon: DatabaseBackup },
  { id: 'settings', label: 'الإعدادات', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = React.memo(({ currentTab, onTabChange }) => {
  return (
    <aside className="w-64 bg-white border-l border-slate-200 flex flex-col h-full shrink-0 select-none z-20">
      {/* Sidebar Header Logo */}
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <EdaraLogo size="md" />
      </div>

      {/* Sidebar Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200'
              }`}
            >
              <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
});
