import React, { useEffect, useState } from 'react';
import { EdaraLogo } from './EdaraLogo';
import { Loader2 } from 'lucide-react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [statusText, setStatusText] = useState('جاري تهيئة قاعدة البيانات المحلية...');

  useEffect(() => {
    const t1 = setTimeout(() => {
      setStatusText('جاري التحقق من الحساب...');
    }, 500);

    const t2 = setTimeout(() => {
      setStatusText('جاري فتح التطبيق...');
    }, 1000);

    const t3 = setTimeout(() => {
      onComplete();
    }, 1400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-slate-50 to-slate-200 text-slate-900 flex flex-col items-center justify-center p-6 select-none">
      <div className="bg-white/90 border border-slate-200/80 rounded-3xl p-10 max-w-md w-full text-center flex flex-col items-center shadow-xl backdrop-blur-md animate-in fade-in duration-300">
        <EdaraLogo size="xl" showSubtitle={true} className="mb-8 justify-center" />

        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden mb-6 relative">
          <div className="bg-blue-500 h-full w-full animate-pulse rounded-full" />
        </div>

        <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
          <span>{statusText}</span>
        </div>
      </div>

      <div className="absolute bottom-6 text-xs text-slate-400 font-medium">
        نظام إدارة المدارس - Edara © {new Date().getFullYear()}
      </div>
    </div>
  );
};
