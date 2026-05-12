'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Work } from '@/lib/types';

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Work[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('works')
      .select('work_id, title_ko, title_en, platform_name, genre, kr_status')
      .or(`title_ko.ilike.%${q}%,title_en.ilike.%${q}%,work_id.ilike.%${q}%`)
      .order('title_ko')
      .limit(20);
    setResults((data as Work[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const statusColor = (status: string | null) => {
    if (!status) return 'bg-gray-100 text-gray-500';
    if (status.includes('연재')) return 'bg-indigo-100 text-indigo-600';
    if (status.includes('완결')) return 'bg-green-100 text-green-600';
    return 'bg-gray-100 text-gray-500';
  };

  return (
    <div className="min-h-screen bg-[#f4f5f7]">
      <div className="bg-[#1a1a2e] text-white px-6 py-4">
        <h1 className="text-sm font-medium opacity-70">작품 대시보드</h1>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search(query)}
            placeholder="작품명 또는 작품번호 검색"
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            onClick={() => search(query)}
            className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            검색
          </button>
        </div>

        {loading && (
          <div className="text-center text-sm text-gray-400 py-8">검색 중...</div>
        )}

        {!loading && results.length === 0 && query.trim() && (
          <div className="text-center text-sm text-gray-400 py-8">검색 결과가 없습니다.</div>
        )}

        <div className="space-y-2">
          {results.map(work => (
            <button
              key={work.work_id}
              onClick={() => router.push(`/works/${work.work_id}`)}
              className="w-full flex items-center justify-between bg-white rounded-xl px-5 py-4 shadow-sm hover:shadow-md transition-shadow text-left"
            >
              <div>
                <div className="font-semibold text-gray-900">{work.title_ko}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {[work.work_id, work.platform_name, work.genre].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor(work.kr_status)}`}>
                  {work.kr_status ?? '-'}
                </span>
                <span className="text-gray-300 text-lg">›</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
