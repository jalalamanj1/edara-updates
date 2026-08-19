import React, { useState } from 'react';
import { EdaraLogo } from './EdaraLogo';
import { Mail, Lock, AlertCircle, Loader2, LogIn } from 'lucide-react';
import type { AuthResult } from '../services/auth';

interface LoginViewProps {
  onLogin: (email: string, password: string) => Promise<AuthResult>;
  initialError?: string;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin, initialError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState(initialError || '');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim()) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني.');
      return;
    }
    if (!password) {
      setErrorMsg('يرجى إدخال كلمة المرور.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await onLogin(email.trim(), password);
      if (!res.ok) {
        setErrorMsg(res.error || 'تعذر تسجيل الدخول.');
      }
    } catch (err: any) {
      console.error('[login] unexpected error:', err);
      setErrorMsg('حدث خطأ غير متوقع أثناء تسجيل الدخول.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-100 flex items-center justify-center p-6 select-none dir-rtl">
      <div className="bg-white rounded-3xl shadow-xl max-w-lg w-full border border-slate-200 p-8 md:p-10">
        <div className="flex flex-col items-center text-center mb-8">
          <EdaraLogo size="lg" className="mb-4" showSubtitle={false} />
          <div className="h-0.5 w-16 bg-blue-600 rounded-full my-3" />
          <h2 className="text-2xl font-black text-slate-900 mt-1">تسجيل الدخول</h2>
          <p className="text-slate-600 text-sm mt-2 leading-relaxed">
            أدخل بيانات حساب المؤسسة للوصول إلى النظام.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-2">
              البريد الإلكتروني <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="example@school.edu"
                dir="ltr"
                className={`w-full px-4 py-3.5 pr-11 rounded-xl border bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                  errorMsg
                    ? 'border-red-400 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-blue-600 focus:border-blue-600'
                }`}
                autoFocus
              />
              <Mail className="w-5 h-5 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-800 mb-2">
              كلمة المرور <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="••••••••"
                className={`w-full px-4 py-3.5 pr-11 rounded-xl border bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                  errorMsg
                    ? 'border-red-400 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-blue-600 focus:border-blue-600'
                }`}
              />
              <Lock className="w-5 h-5 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 text-red-600 text-xs font-bold mt-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-base shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>جاري تسجيل الدخول...</span>
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                <span>تسجيل الدخول</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
