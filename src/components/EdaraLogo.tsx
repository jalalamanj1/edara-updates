import React from 'react';

interface EdaraLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
}

export const EdaraLogo: React.FC<EdaraLogoProps> = React.memo(({
  className = '',
  size = 'md',
  showSubtitle = true,
}) => {
  const imgSize = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
  }[size];

  const sizeClasses = {
    sm: { title: 'text-base', sub: 'text-xs' },
    md: { title: 'text-xl', sub: 'text-xs' },
    lg: { title: 'text-3xl', sub: 'text-sm' },
    xl: { title: 'text-4xl', sub: 'text-base' },
  }[size];

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      <img
        src="/logo.png"
        alt="Edara"
        className={`${imgSize} object-contain rounded-xl shrink-0`}
      />

      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className={`font-black tracking-tight text-slate-900 ${sizeClasses.title}`}>
            Edara
          </span>
          <span className={`font-bold text-blue-600 ${sizeClasses.title}`}>
            إدارة
          </span>
        </div>
        {showSubtitle && (
          <span className={`font-medium text-slate-500 ${sizeClasses.sub}`}>
            نظام إدارة المدارس
          </span>
        )}
      </div>
    </div>
  );
});
