'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Work } from '@/lib/types';

/* ── 상태 배지 ── */
function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-300 text-xs">—</span>;
  const s = status.toLowerCase();
  let dot = 'bg-gray-400', bg = 'bg-gray-50', text = 'text-gray-500';
  if (s.includes('연재')) { dot = 'bg-emerald-500'; bg = 'bg-emerald-50'; text = 'text-emerald-700'; }
  else if (s.includes('완결')) { dot = 'bg-blue-500'; bg = 'bg-blue-50'; text = 'text-blue-700'; }
  else if (s.includes('휴재') || s.includes('중단')) { dot = 'bg-orange-400'; bg = 'bg-orange-50'; text = 'text-orange-600'; }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${bg} ${text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

/* ── 플랫폼 배지 ── */
const PLATFORM_COLORS: Record<string, string> = {
  '투믹스': 'bg-purple-50 text-purple-700',
  '네이버': 'bg-green-50 text-green-700',
  '카카오': 'bg-yellow-50 text-yellow-700',
  '레진': 'bg-red-50 text-red-700',
  '리디': 'bg-blue-50 text-blue-700',
};
function PlatformBadge({ name }: { name: string | null }) {
  if (!name) return <span className="text-gray-300 text-xs">—</span>;
  const cls = PLATFORM_COLORS[name] ?? 'bg-gray-100 text-gray-600';
  return <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${cls}`}>{name}</span>;
}

/* ── 정렬 아이콘 ── */
function SortIcon({ col, sort, dir }: { col: string; sort: string; dir: 'asc' | 'desc' }) {
  if (sort !== col) return <span className="text-gray-300 ml-0.5 text-[10px]">↕</span>;
  return <span className="text-indigo-500 ml-0.5 text-[10px]">{dir === 'asc' ? '↑' : '↓'}</span>;
}

const PAGE_SIZES = [20, 50, 100];

type SortKey = 'title_ko' | 'platform_name' | 'kr_status' | 'total_episodes';

export default function HomePage() {
  const router = useRouter();
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('title_ko');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    async function fetchAll() {
      const size = 1000;
      let all: Work[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('works')
          .select('work_id, title_ko, title_en, platform_name, genre, kr_status, total_episodes, is_adult, writer_ko, artist_ko')
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
    let list = works.filter(w => {
      if (q && !w.title_ko?.toLowerCase().includes(q) && !w.title_en?.toLowerCase().includes(q) && !w.work_id?.toLowerCase().includes(q) && !w.writer_ko?.toLowerCase().includes(q)) return false;
      if (statusFilter && !w.kr_status?.includes(statusFilter)) return false;
      if (platformFilter && w.platform_name !== platformFilter) return false;
      if (genreFilter && w.genre !== genreFilter) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      const av = (a[sortKey] ?? '') as string | number;
      const bv = (b[sortKey] ?? '') as string | number;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [works, search, statusFilter, platformFilter, genreFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
  const hasFilter = search || statusFilter || platformFilter || genreFilter;

  useEffect(() => { setPage(1); }, [search, statusFilter, platformFilter, genreFilter, pageSize]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function toggleAll() {
    if (selected.size === paginated.length) setSelected(new Set());
    else setSelected(new Set(paginated.map(w => w.work_id)));
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, filtered.length);

  return (
    <div className="min-h-screen bg-[#f8f8f9] flex flex-col">
      {/* Header */}
      <header className="bg-[#1a1a2e] px-5 h-11 flex items-center shrink-0">
        <span className="text-white/40 text-xs font-medium tracking-widest uppercase">작품 대시보드</span>
      </header>

      {/* Toolbar */}
      <div className="bg-white border-b border-gray-100 px-5 py-2 sticky top-0 z-20">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="작품명, 영문명, 작가 검색"
              className="pl-8 pr-10 py-1.5 w-60 rounded-md border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-400"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-300 font-mono border border-gray-200 rounded px-1">⌘K</span>
          </div>

          <div className="h-4 w-px bg-gray-200" />

          {/* Status */}
          <div className="relative">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className={`appearance-none pl-14 pr-6 py-1.5 rounded-md text-[13px] border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors ${statusFilter ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'}`}>
              <option value="">All</option>
              <option value="연재">연재</option>
              <option value="완결">완결</option>
              <option value="휴재">휴재</option>
            </select>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 font-medium">Status</span>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▾</span>
          </div>

          {/* Platform */}
          <div className="relative">
            <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}
              className={`appearance-none pl-16 pr-6 py-1.5 rounded-md text-[13px] border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors ${platformFilter ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'}`}>
              <option value="">All</option>
              {platforms.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 font-medium">Platform</span>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▾</span>
          </div>

          {/* Genre */}
          <div className="relative">
            <select value={genreFilter} onChange={e => setGenreFilter(e.target.value)}
              className={`appearance-none pl-12 pr-6 py-1.5 rounded-md text-[13px] border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors ${genreFilter ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'}`}>
              <option value="">All</option>
              {genres.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 font-medium">Genre</span>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▾</span>
          </div>

          {hasFilter && (
            <button onClick={() => { setSearch(''); setStatusFilter(''); setPlatformFilter(''); setGenreFilter(''); }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] text-gray-400 hover:text-gray-600 border border-gray-200 rounded-md transition-colors">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              필터 초기화
            </button>
          )}

          <div className="ml-auto flex items-center gap-3">
            {/* 페이지당 개수 */}
            <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
              {PAGE_SIZES.map(n => (
                <button key={n} onClick={() => setPageSize(n)}
                  className={`px-2.5 py-1 text-[12px] transition-colors ${pageSize === n ? 'bg-indigo-600 text-white font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <main className="flex-1 px-5 py-4">
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="w-9 pl-4 py-2.5">
                  <input type="checkbox" checked={selected.size === paginated.length && paginated.length > 0}
                    onChange={toggleAll}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 cursor-pointer accent-indigo-600" />
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide cursor-pointer select-none" onClick={() => toggleSort('title_ko')}>
                  Title <SortIcon col="title_ko" sort={sortKey} dir={sortDir} />
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden xl:table-cell">Genre</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden lg:table-cell">Author</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide cursor-pointer select-none hidden sm:table-cell" onClick={() => toggleSort('platform_name')}>
                  Platform <SortIcon col="platform_name" sort={sortKey} dir={sortDir} />
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide cursor-pointer select-none" onClick={() => toggleSort('kr_status')}>
                  Status <SortIcon col="kr_status" sort={sortKey} dir={sortDir} />
                </th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide cursor-pointer select-none hidden md:table-cell pr-5" onClick={() => toggleSort('total_episodes')}>
                  Episodes <SortIcon col="total_episodes" sort={sortKey} dir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="text-center py-20 text-gray-400">
                  <span className="inline-block w-4 h-4 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin mr-2 align-middle" />불러오는 중…
                </td></tr>
              )}
              {!loading && paginated.length === 0 && (
                <tr><td colSpan={7} className="text-center py-20 text-gray-400">
                  {hasFilter ? '조건에 맞는 작품이 없습니다.' : '등록된 작품이 없습니다.'}
                </td></tr>
              )}
              {!loading && paginated.map((work, i) => (
                <tr key={work.work_id}
                  className={`group border-b border-gray-50 last:border-0 hover:bg-indigo-50/40 transition-colors ${selected.has(work.work_id) ? 'bg-indigo-50/60' : ''}`}>
                  <td className="w-9 pl-4 py-2.5" onClick={e => { e.stopPropagation(); toggleSelect(work.work_id); }}>
                    <input type="checkbox" checked={selected.has(work.work_id)} onChange={() => toggleSelect(work.work_id)}
                      className="w-3.5 h-3.5 rounded border-gray-300 cursor-pointer accent-indigo-600" />
                  </td>
                  <td className="px-3 py-2.5 cursor-pointer" onClick={() => router.push(`/works/${work.work_id}`)}>
                    <div className="font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors leading-tight">{work.title_ko}</div>
                    {work.title_en && <div className="text-[11px] text-gray-400 mt-0.5 leading-tight truncate max-w-[280px]">{work.title_en}</div>}
                  </td>
                  <td className="px-3 py-2.5 hidden xl:table-cell">
                    <span className="text-[12px] text-gray-500 line-clamp-1">{work.genre ?? '—'}</span>
                  </td>
                  <td className="px-3 py-2.5 hidden lg:table-cell cursor-pointer" onClick={() => router.push(`/works/${work.work_id}`)}>
                    <span className="text-[12px] text-gray-600">{work.writer_ko ?? work.artist_ko ?? '—'}</span>
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell cursor-pointer" onClick={() => router.push(`/works/${work.work_id}`)}>
                    <PlatformBadge name={work.platform_name} />
                  </td>
                  <td className="px-3 py-2.5 cursor-pointer" onClick={() => router.push(`/works/${work.work_id}`)}>
                    <StatusBadge status={work.kr_status} />
                  </td>
                  <td className="px-3 py-2.5 text-right hidden md:table-cell pr-5 cursor-pointer" onClick={() => router.push(`/works/${work.work_id}`)}>
                    <span className="text-[12px] text-gray-500 tabular-nums">{work.total_episodes ?? '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-[12px] text-gray-400">
            {loading ? '' : filtered.length === 0 ? '결과 없음' : `Showing ${from} to ${to} of ${filtered.length} results`}
          </span>

          {!loading && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1}
                className="px-2 py-1 text-[12px] rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">«</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-2.5 py-1 text-[12px] rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">‹</button>

              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) p = i + 1;
                else if (page <= 4) p = i + 1;
                else if (page >= totalPages - 3) p = totalPages - 6 + i;
                else p = page - 3 + i;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-7 py-1 text-[12px] rounded border transition-colors ${page === p ? 'bg-indigo-600 border-indigo-600 text-white font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    {p}
                  </button>
                );
              })}

              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-2.5 py-1 text-[12px] rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">›</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="px-2 py-1 text-[12px] rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">»</button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
