import React, { useEffect, useState } from 'react';
import { SchoolProfile } from '../types';
import { Building2, User, Calendar, Clock, LogOut } from 'lucide-react';
import { normalizeDigits } from '../utils/numberUtils';

interface HeaderProps {
  schoolProfile: SchoolProfile | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ schoolProfile, onLogout }) => {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Format date in Arabic locale with English numbers
  const rawDate = currentTime.toLocaleDateString('ar-EG-u-nu-latn', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedDate = normalizeDigits(rawDate);

  // Format time in 12-hour format with English numbers
  const rawTime = currentTime.toLocaleTimeString('ar-EG-u-nu-latn', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const formattedTime = normalizeDigits(rawTime);

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 select-none shrink-0 z-10 shadow-xs">
      {/* School Info */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-extrabold text-slate-900 text-base leading-tight">
              {schoolProfile?.schoolName || 'Edara'}
            </h1>
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 mt-0.5">
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>المدير: {schoolProfile?.principalName || 'غير محدد'}</span>
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>السنة الدراسية: {normalizeDigits(schoolProfile?.academicYear || '2026–2027')}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Date & Time */}
      <div className="flex items-center gap-4">
        {/* Live Date and Time */}
        <div className="bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-xl flex items-center gap-3 text-xs font-bold text-slate-700">
          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>{formattedDate}</span>
          </div>
          <div className="flex items-center gap-1.5 dir-ltr font-mono text-slate-900">
            <Clock className="w-3.5 h-3.5 text-blue-600 dir-rtl" />
            <span>{formattedTime}</span>
          </div>
        </div>

        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            title="تسجيل الخروج"
            className="flex items-center gap-1.5 bg-white border border-slate-200 hover:border-red-400 hover:text-red-600 text-slate-600 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
        )}
      </div>
    </header>
  );
};

