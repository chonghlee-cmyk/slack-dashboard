'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Work } from '@/lib/types';

const STATUS_CONFIG: Record<string, { dot: string }> = {
  연재: { dot: 'bg-blue-500' },
  완결: { dot: 'bg-emerald-500' },
};

function StatusDot({ status }: { status: string | null }) {
  const key = status ? Object.keys(STATUS_CONFIG).find(k => status.includes(k)) : null;
  const cfg = key ? STATUS_CONFIG[key] : null;
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg ? cfg.dot : 'bg-gray-300'}`} />
      <span className={`text-[13px] ${cfg ? 'text-gray-700' : 'text-gray-400'}`}>{status ?? '—'}</span>
    </span>
  );
}

function FilterChip({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  const active = !!value;
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`appearance-none pl-3 pr-6 py-1.5 rounded-md text-[13px] border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors ${
          active ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
        }`}
      >
        <option value="">{label}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▾</span>
    </div>
  );
}

const PAGE_SIZES = [20, 50, 100];

export default function HomePage() {
  const router = useRouter();
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function fetchAll() {
      const size = 1000;
      let all: Work[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('works')
          .select('work_id, title_ko, title_en, platform_name, genre, kr_status, total_episodes, is_adult')
          .order('title_ko')
          .range(from, from + size - 1);
        if (error || !data || data.length === 0) break;
        all = all.concat(data as Work[]);
        if (data.length < size) break;
        from += size;
      }
      setWorks(all);
      setLoading(false);
    }
    fetchAll();
  }, []);

  const platforms = useMemo(() => [...new Set(works.map(w => w.platform_name).filter(Boolean))].sort() as string[], [works]);
  const genres = useMemo(() => [...new Set(works.map(w => w.genre).filter(Boolean))].sort() as string[], [works]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return works.filter(w => {
      if (q && !w.title_ko?.toLowerCase().includes(q) && !w.title_en?.toLowerCase().includes(q) && !w.work_id?.toLowerCase().includes(q)) return false;
      if (statusFilter && !w.kr_status?.includes(statusFilter)) return false;
      if (platformFilter && w.platform_name !== platformFilter) return false;
      if (genreFilter && w.genre !== genreFilter) return false;
      return true;
    });
  }, [works, search, statusFilter, platformFilter, genreFilter]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
  const hasFilter = search || statusFilter || platformFilter || genreFilter;

  // 필터 바뀌면 1페이지로
  useEffect(() => { setPage(1); }, [search, statusFilter, platformFilter, genreFilter, pageSize]);

  return (
    <div className="min-h-screen bg-[#f7f7f8] flex flex-col">
      {/* Header */}
      <header className="bg-[#1a1a2e] px-4 h-11 flex items-center shrink-0">
        <span className="text-white/40 text-xs font-medium tracking-wide uppercase">작품 대시보드</span>
      </header>

      {/* Toolbar */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="작품명 또는 번호"
              className="pl-8 pr-3 py-1.5 w-52 rounded-md border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-400"
            />
          </div>

          <div className="h-4 w-px bg-gray-200" />

          <FilterChip label="상태" value={statusFilter} options={['연재', '완결']} onChange={setStatusFilter} />
          <FilterChip label="플랫폼" value={platformFilter} options={platforms} onChange={setPlatformFilter} />
          <FilterChip label="장르" value={genreFilter} options={genres} onChange={setGenreFilter} />

          {hasFilter && (
            <button
              onClick={() => { setSearch(''); setStatusFilter(''); setPlatformFilter(''); setGenreFilter(''); }}
              className="text-[12px] text-gray-400 hover:text-gray-600 px-1.5 py-1 rounded transition-colors"
            >
              초기화
            </button>
          )}

          <div className="ml-auto flex items-center gap-3">
            <span className="text-[12px] text-gray-400 tabular-nums">
              {loading ? '로딩 중…' : hasFilter ? `${filtered.length} / ${works.length}개` : `총 ${works.length}개`}
            </span>
            {/* 페이지당 개수 */}
            <div className="flex items-center gap-1 border border-gray-200 rounded-md overflow-hidden">
              {PAGE_SIZES.map(n => (
                <button
                  key={n}
                  onClick={() => setPageSize(n)}
                  className={`px-2.5 py-1 text-[12px] transition-colors ${pageSize === n ? 'bg-indigo-600 text-white font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table — full width */}
      <main className="flex-1 px-4 py-3">
        <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left pl-3 pr-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-[80px]">번호</th>
                <th className="text-left px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">작품명</th>
                <th className="text-left px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden lg:table-cell">영문명</th>
                <th className="text-left px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell w-[110px]">플랫폼</th>
                <th className="text-left px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell w-[80px]">장르</th>
                <th className="text-left px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-[80px]">상태</th>
                <th className="text-right px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell w-[50px]">화수</th>
                <th className="text-center px-2 pr-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell w-[44px]">성인</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="text-center py-20 text-[13px] text-gray-400">
                    <span className="inline-block w-4 h-4 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin mr-2 align-middle" />
                    불러오는 중…
                  </td>
                </tr>
              )}
              {!loading && paginated.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-20 text-[13px] text-gray-400">
                    {hasFilter ? '조건에 맞는 작품이 없습니다.' : '등록된 작품이 없습니다.'}
                  </td>
                </tr>
              )}
              {!loading && paginated.map((work, i) => (
                <tr
                  key={work.work_id}
                  onClick={() => router.push(`/works/${work.work_id}`)}
                  className={`group cursor-pointer hover:bg-indigo-50/50 transition-colors ${i !== paginated.length - 1 ? 'border-b border-gray-50' : ''}`}
                >
                  <td className="pl-3 pr-2 py-2"><span className="text-[12px] text-gray-400 font-mono">{work.work_id}</span></td>
                  <td className="px-2 py-2">
                    <span className="text-[13px] font-medium text-gray-900 group-hover:text-indigo-700 transition-colors">{work.title_ko}</span>
                  </td>
                  <td className="px-2 py-2 hidden lg:table-cell max-w-[220px]">
                    <span className="text-[12px] text-gray-400 truncate block">{work.title_en ?? '—'}</span>
                  </td>
                  <td className="px-2 py-2 hidden sm:table-cell"><span className="text-[12px] text-gray-500">{work.platform_name ?? '—'}</span></td>
                  <td className="px-2 py-2 hidden sm:table-cell"><span className="text-[12px] text-gray-500">{work.genre ?? '—'}</span></td>
                  <td className="px-2 py-2"><StatusDot status={work.kr_status} /></td>
                  <td className="px-2 py-2 text-right hidden md:table-cell"><span className="text-[12px] text-gray-500 tabular-nums">{work.total_episodes ?? '—'}</span></td>
                  <td className="px-2 pr-3 py-2 text-center hidden md:table-cell">
                    {work.is_adult && <span className="inline-block px-1.5 py-0.5 bg-rose-50 text-rose-500 text-[10px] font-semibold rounded">19</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 px-1">
            <span className="text-[12px] text-gray-400">
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} / {filtered.length}개
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="px-2 py-1 text-[12px] rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >«</button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2.5 py-1 text-[12px] rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >‹</button>

              {/* 페이지 번호 */}
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) p = i + 1;
                else if (page <= 4) p = i + 1;
                else if (page >= totalPages - 3) p = totalPages - 6 + i;
                else p = page - 3 + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-7 py-1 text-[12px] rounded border transition-colors ${
                      page === p ? 'bg-indigo-600 border-indigo-600 text-white font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >{p}</button>
                );
              })}

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2.5 py-1 text-[12px] rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >›</button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="px-2 py-1 text-[12px] rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >»</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
