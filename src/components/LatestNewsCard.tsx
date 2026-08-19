import React, { useEffect, useRef, useState } from 'react';
import { Newspaper, ExternalLink, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import {
  getPublishedNews,
  type NewsItem,
} from '../services/newsService';
import { normalizeDigits } from '../utils/numberUtils';

const CACHE_KEY = 'edara_news_cache_v1';

function readCache(): NewsItem[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as NewsItem[]) : [];
  } catch {
    return [];
  }
}

function writeCache(items: NewsItem[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota / unavailable storage */
  }
}

function formatDate(d?: string | null): string {
  if (!d) return '';
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return normalizeDigits(d);
    return normalizeDigits(date.toLocaleDateString('ar-EG-u-nu-latn'));
  } catch {
    return '';
  }
}

export const LatestNewsCard: React.FC = () => {
  const cached = React.useMemo(readCache, []);
  const [items, setItems] = useState<NewsItem[]>(cached);
  const [loading, setLoading] = useState<boolean>(cached.length === 0);
  const [error, setError] = useState<boolean>(false);
  const inFlightRef = useRef(false);

  const load = React.useCallback(async () => {
    try {
      const data = await getPublishedNews();
      setItems(data);
      setError(false);
      writeCache(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load (does not block the rest of the Dashboard).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const data = await getPublishedNews();
        if (cancelled) return;
        setItems(data);
        setError(false);
        writeCache(data);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Single Realtime subscription: refresh the published list on any news change.
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('public:news')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'news' },
        () => {
          getPublishedNews()
            .then((data) => {
              setItems(data);
              setError(false);
              writeCache(data);
            })
            .catch(() => {
              /* keep previous data on transient error */
            });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Background fallback refresh every 2s (silent; only updates when data changed).
  // Realtime above delivers instant updates; this polling is a reliable fallback.
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const refresh = () => {
      // Prevent overlapping requests if a previous refresh is still running.
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      getPublishedNews()
        .then((data) => {
          if (cancelled) return;
          setItems((prev) => {
            const unchanged =
              prev.length === data.length &&
              prev.every(
                (p, i) =>
                  p.id === data[i].id &&
                  p.title === data[i].title &&
                  p.content === data[i].content &&
                  p.category === data[i].category &&
                  p.image_url === data[i].image_url &&
                  p.source_url === data[i].source_url &&
                  p.published === data[i].published &&
                  p.published_at === data[i].published_at &&
                  p.updated_at === data[i].updated_at
              );
            if (unchanged) return prev;
            writeCache(data);
            return data;
          });
          setError(false);
        })
        .catch(() => {
          /* keep previous data on transient error */
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    const start = () => {
      if (intervalId != null) return;
      refresh(); // immediate refresh when becoming active
      intervalId = setInterval(refresh, 2000);
    };

    const stop = () => {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // When the window is hidden (minimized), pause the polling to save network.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') start();
    else stop();

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const showLoading = loading && items.length === 0;
  const showError = error && items.length === 0;
  const showEmpty = !loading && !error && items.length === 0;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 lg:col-span-2 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-800">آخر الأخبار</h2>
        </div>
        {!showLoading && (
          <button
            onClick={load}
            title="تحديث الأخبار"
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {showLoading && (
          <div className="h-full flex flex-col items-center justify-center text-center py-8 gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="text-sm font-semibold">جاري تحميل الأخبار...</span>
          </div>
        )}

        {showError && (
          <div className="h-full flex flex-col items-center justify-center text-center py-8 gap-3">
            <div className="p-4 bg-red-50 text-red-600 rounded-full border border-red-200">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <h3 className="text-base font-black text-slate-900">تعذر تحميل الأخبار حالياً</h3>
            <p className="text-slate-500 text-xs max-w-xs">
              يرجى التحقق من الاتصال بالشبكة والمحاولة مرة أخرى.
            </p>
            <button
              onClick={load}
              className="mt-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        )}

        {showEmpty && (
          <div className="h-full flex flex-col items-center justify-center text-center py-8 gap-3">
            <div className="p-4 bg-slate-100 text-slate-400 rounded-full">
              <Newspaper className="w-10 h-10" />
            </div>
            <h3 className="text-base font-black text-slate-800">لا توجد أخبار حالياً</h3>
            <p className="text-slate-500 text-xs max-w-xs leading-relaxed">
              ستظهر أحدث الأخبار هنا عند توفرها.
            </p>
          </div>
        )}

        {items.length > 0 && (
          <ul className="space-y-2.5">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/40 transition-colors"
              >
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                    className="w-16 h-16 rounded-lg object-cover shrink-0 bg-slate-100"
                  />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.category && (
                      <span className="text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full">
                        {item.category}
                      </span>
                    )}
                    <h3 className="text-sm font-bold text-slate-900 leading-snug">{item.title}</h3>
                  </div>
                  {item.content && (
                    <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed line-clamp-2">
                      {item.content}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 font-medium mt-1">{formatDate(item.published_at)}</p>
                  {item.source_url && (
                    <button
                      onClick={() => api.openExternalUrl(item.source_url as string)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>فتح المصدر</span>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
