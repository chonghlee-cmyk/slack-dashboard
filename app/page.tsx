'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Work, LIST_LANGS, LANG_STATUS_FILTERS } from '@/lib/types';
import { engToKorean, decomposeKorean, looksLikeEngInput } from '@/lib/koreanInput';

const PAGE_SIZES = [20, 50, 100];

/* ── 언어권 상태 → 색상 ── */
function langStatusStyle(s: string | null | undefined): string {
  if (!s || s === '-' || s === '') return 'bg-gray-50 text-gray-300 border-gray-200';
  if (s === '연재중')              return 'bg-green-50 text-green-800 border-green-300';
  if (s.includes('번역 필요'))     return 'bg-amber-50 text-amber-800 border-amber-300';
  if (s.includes('번역 불필요'))   return 'bg-blue-50 text-blue-800 border-blue-300';
  if (s === '연재준비중')          return 'bg-teal-50 text-teal-800 border-teal-300';
  if (s === '업커밍')              return 'bg-violet-50 text-violet-800 border-violet-300';
  if (s === '휴재')                return 'bg-orange-50 text-orange-800 border-orange-300';
  if (s === '완결')                return 'bg-gray-200 text-gray-700 border-gray-400';
  if (s === '연재 불가')           return 'bg-red-50 text-red-700 border-red-300';
  if (s === '연재안함')            return 'bg-pink-50 text-pink-700 border-pink-300';
  if (s === '비활성화')            return 'bg-gray-100 text-gray-400 border-gray-300';
  if (s === '확인필요')            return 'bg-yellow-100 text-yellow-800 border-yellow-400';
  if (s === '계약종료')            return 'bg-gray-700 text-gray-50 border-gray-600';
  return 'bg-gray-50 text-gray-400 border-gray-200';
}

/* ── 국내 상태 배지 ── */
function KrStatusBadge({ status }: { status: string | null }) {
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

/* ── 필터 토글 버튼 (pill) ── */
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${active ? 'bg-[#1a1a2e] border-[#1a1a2e] text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
      {children}
    </button>
  );
}

type StatusMap = Record<string, Record<string, string | null>>;
type MemoMap = Record<string, Record<string, string | null>>; // workId → series_memo 전체 row

export default function HomePage() {
  const router = useRouter();
  const [works, setWorks] = useState<Work[]>([]);
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [memoMap, setMemoMap] = useState<MemoMap>({});
  const [loading, setLoading] = useState(true);

  // 필터
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');        // 글로벌 / 인터널
  const [platformFilter, setPlatformFilter] = useState('');  // TG(투믹스) / LA(라라툰)
  const [maturityFilter, setMaturityFilter] = useState('');  // 성인 / 비성인
  const [krStatusFilter, setKrStatusFilter] = useState('');  // 연재/완결/휴재/종료
  const [publisherFilter, setPublisherFilter] = useState('');
  const [langFilter, setLangFilter] = useState('');          // EN/ESP/... (언어권)
  const [langStatusFilter, setLangStatusFilter] = useState(''); // 언어권 상태값
  const [filtersOpen, setFiltersOpen] = useState(true);

  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function fetchAll() {
      // 1) 작품 마스터
      const all: Work[] = [];
      let from = 0;
      const size = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('series_data')
          .select('id, title_ko, title_en, platform, genre, kr_status, total_episodes, maturity, scope, publisher, writer, artist, copyright')
          .order('id', { ascending: false })
          .range(from, from + size - 1);
        if (error || !data || data.length === 0) break;
        for (const r of data as Record<string, string | null>[]) {
          all.push({
            work_id: r.id ?? '',
            title_ko: r.title_ko ?? '',
            title_en: r.title_en ?? null,
            platform_name: r.platform ?? null,
            genre: r.genre ?? null,
            kr_status: r.kr_status ?? null,
            total_episodes: r.total_episodes ?? null,
            free_episodes: null,
            open_episodes: null,
            is_adult: r.maturity === '성인',
            maturity: r.maturity ?? null,
            scope: r.scope ?? null,
            publisher: r.publisher ?? null,
            writer_ko: r.writer ?? null,
            artist_ko: r.artist ?? null,
            copyright: r.copyright ?? null,
          });
        }
        if (data.length < size) break;
        from += size;
      }
      setWorks(all);
      setLoading(false);

      // 2) 언어권 상태 (배지용) — 작품번호 → 상태행
      const map: StatusMap = {};
      let sFrom = 0;
      const statusCols = LIST_LANGS.map(l => l.statusCol).join(',');
      while (true) {
        const { data, error } = await supabase
          .from('language_status')
          .select(`작품번호,${statusCols}`)
          .range(sFrom, sFrom + size - 1);
        if (error || !data || data.length === 0) break;
        for (const r of data as unknown as Record<string, string | null>[]) {
          const wid = r['작품번호'];
          if (wid) map[wid] = r;
        }
        if (data.length < size) break;
        sFrom += size;
      }
      setStatusMap(map);

      // 3) series_memo — 셀별 메모 (workId → 전체 row)
      const memoResult: MemoMap = {};
      let mFrom = 0;
      while (true) {
        const { data, error } = await supabase
          .from('series_memo')
          .select('id,work_no_memo,title_ko_memo,scope_memo,publisher_memo,maturity_memo,platform_memo,writer_memo,artist_memo,copyright_memo')
          .range(mFrom, mFrom + size - 1);
        if (error || !data || data.length === 0) break;
        for (const r of data as unknown as Record<string, string | null>[]) {
          const wid = r.id;
          if (wid) memoResult[wid] = r;
        }
        if (data.length < size) break;
        mFrom += size;
      }
      setMemoMap(memoResult);
    }
    fetchAll();
  }, []);

  const PINNED_PUBLISHERS = ['투믹스', '테라핀', '키다리스튜디오', '레진코믹스'];
  const publishers = useMemo(() => {
    const all = [...new Set(works.map(w => w.publisher).filter(Boolean))] as string[];
    const pinned = PINNED_PUBLISHERS.filter(p => all.includes(p));
    const rest = all.filter(p => !PINNED_PUBLISHERS.includes(p)).sort();
    return [...pinned, ...rest];
  }, [works]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const qKr = search && looksLikeEngInput(search) ? engToKorean(search).toLowerCase() : '';
    const matchText = (target: string | null) => {
      if (!target) return false;
      const t = target.toLowerCase();
      const tD = decomposeKorean(t);
      if (t.includes(q) || tD.includes(q)) return true;
      if (qKr && (t.includes(qKr) || tD.includes(qKr))) return true;
      return false;
    };
    return works.filter(w => {
      if (q && !matchText(w.title_ko) && !matchText(w.title_en) && !matchText(w.work_id) && !matchText(w.writer_ko) && !matchText(w.publisher)) return false;
      if (scopeFilter && w.scope !== scopeFilter) return false;
      if (platformFilter && !(w.platform_name ?? '').includes(platformFilter)) return false;
      if (maturityFilter === '성인' && w.maturity !== '성인') return false;
      if (maturityFilter === '비성인' && w.maturity === '성인') return false;
      if (krStatusFilter && !w.kr_status?.includes(krStatusFilter)) return false;
      if (publisherFilter && w.publisher !== publisherFilter) return false;
      // 언어권 상태 필터
      if (langStatusFilter) {
        const row = statusMap[w.work_id];
        if (langFilter) {
          const col = LIST_LANGS.find(l => l.label === langFilter)?.statusCol;
          if (!col || row?.[col] !== langStatusFilter) return false;
        } else {
          const anyMatch = LIST_LANGS.some(l => row?.[l.statusCol] === langStatusFilter);
          if (!anyMatch) return false;
        }
      }
      return true;
    });
  }, [works, statusMap, search, scopeFilter, platformFilter, maturityFilter, krStatusFilter, publisherFilter, langFilter, langStatusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [search, scopeFilter, platformFilter, maturityFilter, krStatusFilter, publisherFilter, langFilter, langStatusFilter, pageSize]);

  const hasFilter = search || scopeFilter || platformFilter || maturityFilter || krStatusFilter || publisherFilter || langFilter || langStatusFilter;
  function resetFilters() {
    setSearch(''); setScopeFilter(''); setPlatformFilter(''); setMaturityFilter('');
    setKrStatusFilter(''); setPublisherFilter(''); setLangFilter(''); setLangStatusFilter('');
  }

  return (
    <div className="min-h-screen bg-[#f4f5f7] flex flex-col">
      {/* 필터 카드 */}
      <div className="px-5 pt-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="작품명, 번호, 출판사, 작가..."
                className="pl-9 pr-3 py-2 w-full rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-400"
              />
            </div>
            <button onClick={() => setFiltersOpen(o => !o)}
              className="shrink-0 px-3 py-2 rounded-lg border border-gray-200 text-[12px] text-gray-500 hover:bg-gray-50 flex items-center gap-1">
              {filtersOpen ? '▲ 필터 접기' : '▼ 필터 펼치기'}
            </button>
          </div>

          {filtersOpen && (
            <div className="mt-4 space-y-2.5 text-[13px]">
              <FilterRow label="구분">
                <Pill active={!scopeFilter} onClick={() => setScopeFilter('')}>전체</Pill>
                <Pill active={scopeFilter === '글로벌'} onClick={() => setScopeFilter('글로벌')}>글로벌</Pill>
                <Pill active={scopeFilter === '인터널'} onClick={() => setScopeFilter('인터널')}>인터널</Pill>
                <Divider />
                <span className="text-gray-400 text-[12px] mr-1">플랫폼</span>
                <Pill active={!platformFilter} onClick={() => setPlatformFilter('')}>전체</Pill>
                <Pill active={platformFilter === 'TG'} onClick={() => setPlatformFilter('TG')}>투믹스</Pill>
                <Pill active={platformFilter === 'LA'} onClick={() => setPlatformFilter('LA')}>라라툰</Pill>
                <Divider />
                <span className="text-gray-400 text-[12px] mr-1">분류</span>
                <Pill active={!maturityFilter} onClick={() => setMaturityFilter('')}>전체</Pill>
                <Pill active={maturityFilter === '성인'} onClick={() => setMaturityFilter('성인')}>성인</Pill>
                <Pill active={maturityFilter === '비성인'} onClick={() => setMaturityFilter('비성인')}>비성인</Pill>
                <Divider />
                <span className="text-gray-400 text-[12px] mr-1">국내 상태</span>
                <Pill active={!krStatusFilter} onClick={() => setKrStatusFilter('')}>전체</Pill>
                <Pill active={krStatusFilter === '연재'} onClick={() => setKrStatusFilter('연재')}>연재 중</Pill>
                <Pill active={krStatusFilter === '완결'} onClick={() => setKrStatusFilter('완결')}>완결</Pill>
                <Pill active={krStatusFilter === '휴재'} onClick={() => setKrStatusFilter('휴재')}>휴재</Pill>
                <Pill active={krStatusFilter === '종료'} onClick={() => setKrStatusFilter('종료')}>종료</Pill>
                <Divider />
                <span className="text-gray-400 text-[12px] mr-1">출판사</span>
                <select value={publisherFilter} onChange={e => setPublisherFilter(e.target.value)}
                  className="px-2 py-1 rounded-md border border-gray-200 text-[12px] text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">전체</option>
                  {publishers.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </FilterRow>

              <FilterRow label="언어권">
                <Pill active={!langFilter} onClick={() => setLangFilter('')}>전체</Pill>
                {LIST_LANGS.map(l => (
                  <Pill key={l.label} active={langFilter === l.label} onClick={() => setLangFilter(langFilter === l.label ? '' : l.label)}>{l.label}</Pill>
                ))}
                <Divider />
                <span className="text-gray-400 text-[12px] mr-1">언어권 상태</span>
                <Pill active={!langStatusFilter} onClick={() => setLangStatusFilter('')}>전체</Pill>
                {LANG_STATUS_FILTERS.map(s => (
                  <Pill key={s.value} active={langStatusFilter === s.value} onClick={() => setLangStatusFilter(langStatusFilter === s.value ? '' : s.value)}>{s.label}</Pill>
                ))}
              </FilterRow>
            </div>
          )}
        </div>
      </div>

      {/* 카운트 + 범례 + 페이지당 */}
      <div className="px-5 py-3 flex items-center gap-4 flex-wrap">
        <span className="text-[13px] text-gray-500">
          총 <span className="font-semibold text-gray-800">{loading ? '…' : filtered.length.toLocaleString()}</span>개 작품 표시 중
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] text-gray-400">언어권:</span>
          {[
            { label: '연재 중', v: '연재중' },
            { label: '번역 필요', v: '연재 가능(번역 필요)' },
            { label: '번역 불필요', v: '연재 가능(번역 불필요)' },
            { label: '연재준비중', v: '연재준비중' },
            { label: '업커밍', v: '업커밍' },
            { label: '휴재', v: '휴재' },
            { label: '완결', v: '완결' },
            { label: '연재 불가', v: '연재 불가' },
            { label: '연재안함', v: '연재안함' },
            { label: '비활성화', v: '비활성화' },
            { label: '확인필요', v: '확인필요' },
            { label: '계약종료', v: '계약종료' },
          ].map(x => (
            <span key={x.v} className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${langStatusStyle(x.v)}`}>{x.label}</span>
          ))}
        </div>
        {hasFilter && (
          <button onClick={resetFilters} className="text-[12px] text-gray-400 hover:text-gray-600 underline">필터 초기화</button>
        )}
        <div className="ml-auto flex items-center border border-gray-200 rounded-md overflow-hidden bg-white">
          {PAGE_SIZES.map(n => (
            <button key={n} onClick={() => setPageSize(n)}
              className={`px-2.5 py-1 text-[12px] transition-colors ${pageSize === n ? 'bg-indigo-600 text-white font-medium' : 'text-gray-500 hover:bg-gray-50'}`}>{n}</button>
          ))}
        </div>
      </div>

      {/* 테이블 */}
      <main className="flex-1 px-5 pb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full border-collapse text-[13px] table-fixed min-w-[1350px]">
            <colgroup>
              <col className="w-[80px]" />
              <col className="w-[80px]" />
              <col className="w-[110px]" />
              <col className="w-[220px]" />
              <col className="w-[68px]" />
              <col className="w-[68px]" />
              <col className="w-[110px]" />
              <col className="w-[110px]" />
              <col className="w-[154px]" />
              <col className="w-[300px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                <th className="text-left px-4 py-3">작품번호</th>
                <th className="text-left px-3 py-3">구분</th>
                <th className="text-left px-3 py-3">출판사</th>
                <th className="text-left px-3 py-3">작품명</th>
                <th className="text-left px-3 py-3">분류</th>
                <th className="text-left px-3 py-3">플랫폼</th>
                <th className="text-left px-3 py-3">글작가</th>
                <th className="text-left px-3 py-3">그림작가</th>
                <th className="text-left px-3 py-3">Copyright</th>
                <th className="text-left px-3 py-3">언어권</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} className="text-center py-20 text-gray-400">
                  <span className="inline-block w-4 h-4 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin mr-2 align-middle" />불러오는 중…
                </td></tr>
              )}
              {!loading && paginated.length === 0 && (
                <tr><td colSpan={10} className="text-center py-20 text-gray-400">
                  {hasFilter ? '조건에 맞는 작품이 없습니다.' : '등록된 작품이 없습니다.'}
                </td></tr>
              )}
              {!loading && paginated.map(work => {
                const srow = statusMap[work.work_id];
                const mr = memoMap[work.work_id];
                return (
                  <tr key={work.work_id}
                    onClick={() => router.push(`/works/${work.work_id}`)}
                    className="group border-b border-gray-50 last:border-0 hover:bg-indigo-50/40 transition-colors cursor-pointer">
                    <td className="px-4 py-3 text-gray-500 tabular-nums align-top">
                      <span className="inline-flex items-center gap-1">{work.work_id}<MemoTip memo={mr?.work_no_memo} /></span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      {work.scope
                        ? <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${work.scope === '글로벌' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'}`}>{work.scope}<MemoTip memo={mr?.scope_memo} /></span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-gray-500 align-top">
                      <span className="inline-flex items-center gap-1 truncate">{work.publisher ?? '—'}<MemoTip memo={mr?.publisher_memo} /></span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-start gap-1">
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors leading-tight break-keep">{work.title_ko}</div>
                          {work.title_en && <div className="text-[11px] text-gray-400 italic mt-0.5 leading-tight truncate">{work.title_en}</div>}
                        </div>
                        <MemoTip memo={mr?.title_ko_memo} />
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      {work.maturity
                        ? <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${work.maturity === '성인' ? 'bg-rose-50 text-rose-600' : 'bg-gray-100 text-gray-500'}`}>{work.maturity}<MemoTip memo={mr?.maturity_memo} /></span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-gray-600 align-top">
                      <span className="inline-flex items-center gap-1">{work.platform_name ?? '—'}<MemoTip memo={mr?.platform_memo} /></span>
                    </td>
                    <td className="px-3 py-3 text-gray-600 align-top text-[12px]">
                      <span className="inline-flex items-center gap-1 truncate">{work.writer_ko ?? '—'}<MemoTip memo={mr?.writer_memo} /></span>
                    </td>
                    <td className="px-3 py-3 text-gray-600 align-top text-[12px]">
                      <span className="inline-flex items-center gap-1 truncate">{work.artist_ko ?? '—'}<MemoTip memo={mr?.artist_memo} /></span>
                    </td>
                    <td className="px-3 py-3 text-gray-500 align-top text-[11px] leading-snug">
                      <span className="inline-flex items-center gap-1 truncate">{work.copyright ?? '—'}<MemoTip memo={mr?.copyright_memo} /></span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-nowrap gap-1">
                        {LIST_LANGS.map(l => (
                          <span key={l.label}
                            title={srow?.[l.statusCol] ?? undefined}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${langStatusStyle(srow?.[l.statusCol])}`}>
                            {l.label}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-end gap-1 mt-3">
            <button onClick={() => setPage(1)} disabled={page === 1}
              className="px-2 py-1 text-[12px] rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30">«</button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-2.5 py-1 text-[12px] rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30">‹</button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 7) p = i + 1;
              else if (page <= 4) p = i + 1;
              else if (page >= totalPages - 3) p = totalPages - 6 + i;
              else p = page - 3 + i;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-7 py-1 text-[12px] rounded border transition-colors ${page === p ? 'bg-indigo-600 border-indigo-600 text-white font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{p}</button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-2.5 py-1 text-[12px] rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30">›</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
              className="px-2 py-1 text-[12px] rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30">»</button>
          </div>
        )}
      </main>
    </div>
  );
}

/* ── 필터 한 줄 (라벨 + 컨트롤들) ── */
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-gray-400 text-[12px] w-14 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function Divider() {
  return <span className="h-4 w-px bg-gray-200 mx-1.5" />;
}

/* ── 셀 메모 dot + 클릭 팝오버 ── */
function MemoTip({ memo }: { memo: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!memo?.trim()) return null;
  return (
    <span className="relative shrink-0 inline-flex items-center" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-1.5 h-1.5 rounded-full bg-amber-400 hover:bg-amber-500 cursor-pointer"
        aria-label="메모 보기"
      />
      {open && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-white border border-amber-200 text-gray-700 text-[11px] rounded-lg px-2.5 py-2 shadow-xl whitespace-pre-wrap leading-relaxed">
            {memo}
          </span>
        </>
      )}
    </span>
  );
}
