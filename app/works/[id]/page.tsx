'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Work, WorkLanguage, ManuscriptRequest, SlackMessage, SeriesRow, RowMap, LANG_MAP, LANG_STATUS_FILTERS } from '@/lib/types';
import { engToKorean, looksLikeEngInput } from '@/lib/koreanInput';

const LANG_TABS = ['PT', 'EN', 'ES', 'IT', 'DE', 'FR', 'TC', 'JP', 'TH'];

// 정규식 특수문자 이스케이프 (검색어/작품명에 들어갈 수 있음)
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type HighlightTerm = { term: string; className: string };

// 메시지 텍스트에서 지정한 단어들을 <mark>로 강조해 React 노드 배열로 반환
function highlightText(text: string, terms: HighlightTerm[]): React.ReactNode {
  const valid = terms.filter(t => t.term && t.term.trim());
  if (valid.length === 0 || !text) return text;
  // 긴 단어 우선 매칭 (작품명이 검색어보다 먼저 잡히도록)
  const ordered = [...valid].sort((a, b) => b.term.length - a.term.length);
  const re = new RegExp(`(${ordered.map(t => escapeRegExp(t.term)).join('|')})`, 'gi');
  const parts = text.split(re);
  return parts.map((part, i) => {
    if (!part) return null;
    const hit = ordered.find(t => t.term.toLowerCase() === part.toLowerCase());
    return hit
      ? <mark key={i} className={`rounded px-0.5 ${hit.className}`}>{part}</mark>
      : <span key={i}>{part}</span>;
  });
}

// error_type별 색상 매핑 (원고 수정사항 그룹 헤더용)
const ERROR_TYPE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  '오탈자':       { bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500' },
  '이미지 오류':  { bg: 'bg-orange-50',  text: 'text-orange-700',  dot: 'bg-orange-500' },
  '번역 오류':    { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  '레이아웃':     { bg: 'bg-purple-50',  text: 'text-purple-700',  dot: 'bg-purple-500' },
  '폰트':         { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  '기타':         { bg: 'bg-gray-50',    text: 'text-gray-700',    dot: 'bg-gray-400' },
  '분류 없음':    { bg: 'bg-gray-50',    text: 'text-gray-600',    dot: 'bg-gray-300' },
};

// 카테고리별 색상 매핑 (Slack 메시지 그룹 헤더용)
const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  '원고/PSD': { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  '일정/스케줄': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  '메타/작가': { bg: 'bg-pink-50', text: 'text-pink-700', dot: 'bg-pink-500' },
  '라이센스/계약': { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  '현지화/번역': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'BM/타입변경': { bg: 'bg-cyan-50', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  '런칭/오픈': { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
  '기타': { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' },
  '분류 없음': { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-300' },
};

// 발신자 이니셜 + 색상 (아바타 대용)
function senderColor(name: string): string {
  const colors = ['bg-rose-400','bg-orange-400','bg-amber-400','bg-emerald-400','bg-teal-400','bg-blue-400','bg-indigo-400','bg-purple-400','bg-pink-400'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % colors.length;
  return colors[Math.abs(hash)];
}
function senderInitial(name: string): string {
  return (name || '?').trim().charAt(0).toUpperCase();
}

// SlackMessage에서 필드를 안전하게 가져오기 (sync 스키마 차이 대응)
function msgPermalink(m: SlackMessage): string {
  return m.slack_permalink ?? m.permalink ?? '';
}
function msgContent(m: SlackMessage): string {
  return m.message ?? m.content ?? '';
}
function msgChannel(m: SlackMessage): string {
  return m.channel ?? m.channel_name ?? '';
}
function msgDate(m: SlackMessage): string {
  if (m.created_at) return m.created_at.slice(0, 10);
  return m.date ?? '';
}
function msgTime(m: SlackMessage): string {
  if (m.created_at) return m.created_at.slice(11, 16);
  return (m.time ?? '').slice(0, 5);
}
function msgImages(m: SlackMessage): string[] {
  if (!m.image_urls) return [];
  if (Array.isArray(m.image_urls)) return m.image_urls.filter(u => typeof u === 'string' && u.length > 0);
  try {
    const parsed = JSON.parse(m.image_urls as unknown as string);
    return Array.isArray(parsed) ? parsed.filter((u: any) => typeof u === 'string' && u.length > 0) : [];
  } catch { return []; }
}

const statusColor = (status: string | null) => {
  if (!status) return 'bg-gray-100 text-gray-500';
  if (status.includes('연재') || status.toLowerCase().includes('ongoing')) return 'bg-indigo-100 text-indigo-600';
  if (status.includes('완결') || status.toLowerCase().includes('complete')) return 'bg-green-100 text-green-600';
  return 'bg-gray-100 text-gray-500';
};

// 언어권 상태 DB 값 → 메인 페이지와 동일한 표시 라벨
function langStatusLabel(v: string | null | undefined): string {
  if (!v || v === '-' || v.trim() === '') return '-';
  const t = v.trim();
  // 오탈자 자동 교정
  const normalized = t.replace('비활성회', '비활성화');
  const found = LANG_STATUS_FILTERS.find(f => f.value === normalized);
  return found ? found.label : normalized;
}

// 언어권 상태 배지 색상 (메인 페이지 langStatusStyle과 동일)
function langStatusStyle(v: string | null | undefined): string {
  if (!v || v === '-' || v === '') return 'bg-gray-50 text-gray-300 border-gray-200';
  const s = v.trim().replace('비활성회', '비활성화');
  if (s === '연재중')            return 'bg-green-50 text-green-800 border-green-300';
  if (s.includes('번역 필요'))    return 'bg-amber-50 text-amber-800 border-amber-300';
  if (s.includes('번역 불필요'))  return 'bg-blue-50 text-blue-800 border-blue-300';
  if (s === '연재준비중')        return 'bg-teal-50 text-teal-800 border-teal-300';
  if (s === '업커밍')            return 'bg-violet-50 text-violet-800 border-violet-300';
  if (s === '휴재')              return 'bg-orange-50 text-orange-800 border-orange-300';
  if (s === '완결')              return 'bg-gray-200 text-gray-700 border-gray-400';
  if (s === '연재 불가')          return 'bg-red-50 text-red-700 border-red-300';
  if (s === '연재안함')          return 'bg-pink-50 text-pink-700 border-pink-300';
  if (s === '비활성화')          return 'bg-gray-100 text-gray-400 border-gray-300';
  if (s === '확인필요')          return 'bg-yellow-100 text-yellow-800 border-yellow-400';
  if (s === '계약종료')          return 'bg-gray-700 text-gray-50 border-gray-600';
  return 'bg-gray-50 text-gray-400 border-gray-200';
}

const revisionStatusColor = (status: string | null) => {
  if (!status) return 'bg-gray-100 text-gray-600';
  if (status.includes('작업') || status.includes('진행')) return 'bg-yellow-100 text-yellow-700';
  if (status.includes('완료') || status.includes('done')) return 'bg-green-100 text-green-700';
  if (status.includes('접수')) return 'bg-blue-100 text-blue-700';
  return 'bg-gray-100 text-gray-600';
};

type MemoRow = { id: string; language: string | null; memo_content: string; created_at: string };
type Section = 'favorites' | 'revisions' | 'slack' | 'uncensored' | 'memos';

type UncensoredRequest = {
  id: number;
  artwork_no: string | null;
  title_kr: string | null;
  episode: string | null;
  psd: string | null;
  image_url: string | null;
  description: string | null;
  status: string | null;
  request_date: string | null;
  path: string | null;
  note: string | null;
  created_at: string;
};

function StarButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 text-lg leading-none transition-colors ${active ? 'text-yellow-400' : 'text-gray-200 hover:text-yellow-300'}`}
      title={active ? '즐겨찾기 해제' : '즐겨찾기'}
    >
      ★
    </button>
  );
}

// 메모가 있으면 클릭 가능한 작은 점. 클릭하면 메모 내용 팝오버 표시.
function MemoButton({ memo, align = 'left' }: { memo: string | null | undefined; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  if (!memo || !memo.trim()) return null;
  return (
    <span className="relative inline-block leading-none">
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className={`ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full align-middle transition-colors ${open ? 'bg-amber-500 ring-2 ring-amber-200' : 'bg-amber-400 hover:bg-amber-500'}`}
        aria-label="메모 보기"
      >
        <span className="w-1 h-1 bg-white rounded-full" />
      </button>
      {open && (
        <>
          {/* 바깥 클릭 시 닫기 */}
          <span onClick={e => { e.stopPropagation(); setOpen(false); }} className="fixed inset-0 z-20" />
          <span className={`absolute z-30 top-full mt-1.5 block w-60 bg-white border border-amber-200 rounded-lg shadow-lg p-3 text-xs font-normal text-gray-700 whitespace-pre-wrap text-left ${align === 'right' ? 'right-0' : 'left-0'}`}>
            {memo}
          </span>
        </>
      )}
    </span>
  );
}

// 라벨/값 + (있으면) 클릭형 메모 버튼을 보여주는 정보 셀.
function InfoCell({ label, value, memo }: { label: string; value: React.ReactNode; memo?: string | null }) {
  return (
    <div className="relative">
      <div className="text-xs text-gray-400 mb-1 flex items-center">{label}<MemoButton memo={memo} /></div>
      <div className="text-sm font-semibold text-gray-800">{value}</div>
    </div>
  );
}

export default function WorkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('PT');
  const [activeSection, setActiveSection] = useState<Section>('revisions');
  const [slackOrder, setSlackOrder] = useState<'category' | 'time'>('category');
  const [slackQuery, setSlackQuery] = useState('');  // Slack 메시지 검색어
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedErrorTypes, setExpandedErrorTypes] = useState<Set<string>>(new Set());
  const [revisionQuery, setRevisionQuery] = useState('');
  const [revisionStatusFilter, setRevisionStatusFilter] = useState('');
  const [revisionLangFilter, setRevisionLangFilter] = useState('');
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [expandedImages, setExpandedImages] = useState<Set<string>>(new Set());  // 클릭해서 펼친 이미지 (egress 절약)
  const [modalImage, setModalImage] = useState<string | null>(null);              // 확대 보기 모달
  const [uncSort, setUncSort] = useState<'episode_asc' | 'episode_desc' | 'psd_asc' | 'psd_desc' | 'date_desc'>('episode_asc');

  const [work, setWork] = useState<Work | null>(null);
  const [languages, setLanguages] = useState<WorkLanguage[]>([]);
  const [seriesMemo, setSeriesMemo] = useState<RowMap | null>(null);   // 작품 마스터 셀 메모 (series_memo)
  const [langMemo, setLangMemo] = useState<RowMap | null>(null);       // 언어별 셀 메모 (language_memo)
  const [revisions, setRevisions] = useState<ManuscriptRequest[]>([]);
  const [slackMessages, setSlackMessages] = useState<SlackMessage[]>([]);
  const [uncensored, setUncensored] = useState<UncensoredRequest[]>([]);
  const [memos, setMemos] = useState<MemoRow[]>([]);
  const [loading, setLoading] = useState(true);

  // 메모 추가
  const [newMemo, setNewMemo] = useState('');
  const [memoLang, setMemoLang] = useState('');
  const [memoError, setMemoError] = useState('');
  const [memoSaving, setMemoSaving] = useState(false);

  // 메모 수정
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // 즐겨찾기 (localStorage)
  const favKey = `fav_${id}`;
  const loadFavs = useCallback(() => {
    try { return JSON.parse(localStorage.getItem(favKey) ?? '{}') as Record<string, string[]>; }
    catch { return {}; }
  }, [favKey]);
  const [favs, setFavs] = useState<Record<string, string[]>>({});
  useEffect(() => { setFavs(loadFavs()); }, [loadFavs]);

  function toggleFav(type: string, itemId: string) {
    setFavs(prev => {
      const list = prev[type] ?? [];
      const next = list.includes(itemId) ? list.filter(x => x !== itemId) : [...list, itemId];
      const updated = { ...prev, [type]: next };
      localStorage.setItem(favKey, JSON.stringify(updated));
      return updated;
    });
  }
  const isFav = (type: string, itemId: string) => (favs[type] ?? []).includes(itemId);

  const favCount = Object.values(favs).flat().length;

  useEffect(() => { if (id) loadAll(); }, [id]);

  async function loadAll() {
    setLoading(true);
    // 새 가로형 테이블들: 작품당 1행 (language_status 는 PK가 '작품번호')
    const [seriesRes, langDataRes, statusRes, sMemoRes, lMemoRes, revRes, uncRes] = await Promise.all([
      supabase.from('series_data').select('*').eq('id', id).maybeSingle(),
      supabase.from('language_data').select('*').eq('id', id).maybeSingle(),
      supabase.from('language_status').select('*').eq('작품번호', id).maybeSingle(),
      supabase.from('series_memo').select('*').eq('id', id).maybeSingle(),
      supabase.from('language_memo').select('*').eq('id', id).maybeSingle(),
      supabase.from('manuscript_requests').select('*').eq('work_number', id).order('created_at', { ascending: false }).limit(50),
      supabase.from('uncensored_requests').select('*').eq('artwork_no', id).order('created_at', { ascending: false }).limit(100),
    ]);

    // series_data → Work 뷰모델 정규화
    const s = seriesRes.data as SeriesRow | null;
    setWork(s ? {
      work_id: s.id,
      title_ko: s.title_ko,
      title_en: s.title_en,
      platform_name: s.platform,
      genre: s.genre,
      kr_status: s.kr_status,
      total_episodes: s.total_episodes,
      free_episodes: s.free_episodes,
      open_episodes: s.open_episodes,
      is_adult: s.maturity === '성인',
      maturity: s.maturity,
      scope: s.scope,
      publisher: s.publisher,
      writer_ko: s.writer,
      artist_ko: s.artist,
      copyright: s.copyright ?? null,
    } : null);

    // language_data + language_status → 언어별 뷰모델 (앱 탭 9개로 펼침)
    const ld = (langDataRes.data ?? {}) as RowMap;
    const stt = (statusRes.data ?? {}) as RowMap;
    setLanguages(LANG_MAP.map(({ tab, data, status }) => ({
      language: tab,
      serial_status: stt[`${status}_status`] ?? null,
      contract_type: ld[`${data}_contract`] ?? null,
      store: ld[`${data}_store`] ?? null,
      coin_regular: ld[`${data}_coin`] ?? null,
      coin_discount: ld[`${data}_coin_sale`] ?? null,
    })));

    setSeriesMemo((sMemoRes.data ?? null) as RowMap | null);
    setLangMemo((lMemoRes.data ?? null) as RowMap | null);
    setRevisions((revRes.data as ManuscriptRequest[]) ?? []);
    setUncensored((uncRes.data as UncensoredRequest[]) ?? []);

    if (s?.id) {
      const { data: slack } = await supabase
        .from('slack_messages').select('*')
        .eq('title_number', s.id)
        .order('created_at', { ascending: false })
        .limit(200);
      setSlackMessages((slack as SlackMessage[]) ?? []);
    }

    const { data: memoList } = await supabase
      .from('memos').select('*').eq('work_id', id).order('created_at', { ascending: false });
    setMemos((memoList as MemoRow[]) ?? []);
    setLoading(false);
  }

  async function addMemo() {
    if (!newMemo.trim()) return;
    setMemoSaving(true);
    setMemoError('');
    const { data, error } = await supabase.from('memos').insert({
      work_id: id, language: memoLang || null, memo_content: newMemo.trim(),
    }).select().single();
    setMemoSaving(false);
    if (error) { setMemoError(error.message); return; }
    if (data) { setMemos(prev => [data as MemoRow, ...prev]); setNewMemo(''); setMemoLang(''); }
  }

  async function saveMemo(memoId: string) {
    if (!editingText.trim()) return;
    const { error } = await supabase.from('memos').update({ memo_content: editingText.trim() }).eq('id', memoId);
    if (!error) {
      setMemos(prev => prev.map(m => m.id === memoId ? { ...m, memo_content: editingText.trim() } : m));
      setEditingId(null);
    }
  }

  async function deleteMemo(memoId: string) {
    if (!confirm('메모를 삭제할까요?')) return;
    const { error } = await supabase.from('memos').delete().eq('id', memoId);
    if (!error) {
      setMemos(prev => prev.filter(m => m.id !== memoId));
      // 즐겨찾기에서도 제거
      toggleFav('memos', memoId);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center">
      <div className="text-gray-400 text-sm">불러오는 중...</div>
    </div>
  );
  if (!work) return (
    <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center">
      <div className="text-gray-400 text-sm">작품을 찾을 수 없습니다.</div>
    </div>
  );

  const activeLang = languages.find(l => l.language === activeTab);
  const activeData = LANG_MAP.find(m => m.tab === activeTab)?.data ?? '';  // language_memo 컬럼 prefix

  // 즐겨찾기 탭용 필터
  const favRevisions = revisions.filter(r => isFav('revisions', String(r.id)));
  const favSlack = slackMessages.filter(m => isFav('slack', String(m.id)));
  const favMemos = memos.filter(m => isFav('memos', m.id));

  const sections = [
    { key: 'favorites', label: `⭐ 즐겨찾기 (${favCount})` },
    { key: 'revisions', label: `📋 원고 수정사항 (${revisions.length})` },
    { key: 'slack', label: `💬 Slack 메시지 (${slackMessages.length})` },
    { key: 'uncensored', label: `🔓 무검열 수정사항 (${uncensored.length})` },
    { key: 'memos', label: `📝 언어권별 메모 (${memos.length})` },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-800">← 뒤로</button>
      </div>

      <div className="px-5 py-5 space-y-4">

        {/* ── 상단 헤더 카드 (풀 너비) ── */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-6 py-5 mb-4">
          {/* 제목 행 */}
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              {work.title_ko}<MemoButton memo={seriesMemo?.title_ko_memo} />
            </h2>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor(work.kr_status)}`}>
              {work.kr_status ?? '-'}
            </span>
            {work.title_en && (
              <span className="text-sm text-gray-400 flex items-center">
                {work.title_en}<MemoButton memo={seriesMemo?.title_en_memo} />
              </span>
            )}
          </div>

          {/* 메타데이터 행 */}
          <div className="flex items-start flex-wrap gap-y-3 border-t border-gray-100 pt-4">
            {[
              { label: '작품번호', value: work.work_id, memo: seriesMemo?.work_no_memo },
              { label: '플랫폼', value: work.platform_name ?? '-', memo: seriesMemo?.platform_memo },
              { label: '장르', value: work.genre ?? '-', memo: seriesMemo?.genre_memo },
              { label: '총회차', value: work.total_episodes ?? '-', memo: seriesMemo?.total_episodes_memo },
              { label: '무료회차', value: work.free_episodes ?? '-', memo: seriesMemo?.free_episodes_memo },
              { label: '오픈회차', value: work.open_episodes ?? '-', memo: seriesMemo?.open_episodes_memo },
              { label: '성인여부', value: work.is_adult ? '성인' : '비성인', memo: seriesMemo?.maturity_memo },
              { label: '출판사', value: work.publisher ?? '-', memo: seriesMemo?.publisher_memo },
            ].map((item, i) => (
              <div key={item.label} className="flex items-stretch text-sm">
                {i > 0 && <span className="w-px bg-gray-200 mx-5 self-stretch my-0.5" />}
                <div>
                  <div className="text-xs text-gray-400 mb-0.5 flex items-center">
                    {item.label}<MemoButton memo={item.memo} />
                  </div>
                  <div className="font-semibold text-gray-800">{item.value ?? '-'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 언어권 카드 (풀 너비) ── */}
        {(() => {
          // '연재 가능' 상태: 실제 유통 가능한 상태만 카운트
          const AVAILABLE_STATUSES = new Set([
            '연재중',
            '연재 가능(번역 필요)',
            '연재 가능(번역 불필요)',
            '연재준비중',
            '업커밍',
          ]);
          const normalizeStatus = (s: string | null | undefined) =>
            (s ?? '').trim().replace('비활성회', '비활성화');
          const activeCount = languages.filter(l =>
            LANG_TABS.includes(l.language) && AVAILABLE_STATUSES.has(normalizeStatus(l.serial_status))
          ).length;
          const inactiveCount = LANG_TABS.length - activeCount;
          return (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-700">언어권 유통 현황</span>
                <span className="text-xs text-gray-400">{LANG_TABS.length}개 언어권{activeCount > 0 && ` · 연재 가능 ${activeCount}`}{inactiveCount > 0 && ` · 불가 ${inactiveCount}`}</span>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3 p-4">
                {LANG_TABS.map(lang => {
                  const lobj = languages.find(l => l.language === lang);
                  const hasData = !!lobj && [lobj.serial_status, lobj.contract_type, lobj.store, lobj.coin_regular, lobj.coin_discount].some(v => v && v !== '-');
                  return (
                    <div key={lang} className="border border-gray-200 rounded-lg p-4 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                        <span className="text-base font-bold text-gray-800">{lang}</span>
                        {hasData && lobj.serial_status && lobj.serial_status !== '-' && (
                          <span
                            title={lobj.serial_status ?? undefined}
                            className={`text-xs px-2 py-0.5 rounded-full font-medium border whitespace-nowrap ${langStatusStyle(lobj.serial_status)}`}
                          >
                            {langStatusLabel(lobj.serial_status)}
                          </span>
                        )}
                      </div>
                      {hasData ? (
                        <div className="space-y-1.5">
                          {[
                            { label: '계약 구분', value: lobj.contract_type },
                            { label: '스토어 여부', value: lobj.store },
                            { label: '일반 코인', value: lobj.coin_regular },
                            { label: '할인 코인', value: lobj.coin_discount },
                          ].map(({ label, value }) => {
                            const has = value && value !== '-';
                            return (
                              <div key={label} className="flex justify-between items-baseline gap-1">
                                <span className="text-xs text-gray-400 shrink-0">{label}</span>
                                <span className={`text-xs text-right ${has ? 'font-medium text-gray-700' : 'text-gray-300'}`}>{has ? value : '-'}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-300">유통 정보 없음</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── 섹션 패널 (풀 너비) ── */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-200 px-2">
            {sections.map(s => (
              <button key={s.key} onClick={() => setActiveSection(s.key as Section)}
                className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeSection === s.key
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {s.key === 'favorites' ? `즐겨찾기 (${favCount})` :
                 s.key === 'revisions' ? `원고 수정사항 (${revisions.length})` :
                 s.key === 'slack' ? `Slack 메시지 (${slackMessages.length})` :
                 s.key === 'uncensored' ? `무검열 수정사항 (${uncensored.length})` :
                 `메모 (${memos.length})`}
              </button>
            ))}
          </div>

          <div className="p-4">

            {/* 즐겨찾기 */}
            {activeSection === 'favorites' && (
              <div className="space-y-4">
                {favCount === 0 && (
                  <div className="text-center text-sm text-gray-400 py-10">
                    ★ 아이템에 별표를 눌러 즐겨찾기에 추가하세요
                  </div>
                )}
                {favRevisions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">원고 수정사항</p>
                    <div className="space-y-2">
                      {favRevisions.map(r => (
                        <div key={r.id} className="border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-3">
                          <StarButton active={true} onClick={() => toggleFav('revisions', String(r.id))} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${revisionStatusColor(r.status)}`}>{r.status ?? '-'}</span>
                              {r.language && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{r.language}</span>}
                              {r.episode && <span className="text-xs text-gray-500">{r.episode}화</span>}
                              {r.manager && <span className="text-xs text-gray-400">담당: {r.manager}</span>}
                            </div>
                            {r.image_url && (
                              <a href={r.image_url} target="_blank" rel="noopener noreferrer">
                                <img src={r.image_url} alt="원고 이미지" className="mt-2 max-h-48 rounded-lg border border-gray-100 object-contain bg-gray-50 hover:opacity-90 cursor-zoom-in" />
                              </a>
                            )}
                            <p className="text-xs text-gray-400 mt-1">{r.created_at?.slice(0, 10)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {favSlack.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Slack 메시지</p>
                    <div className="space-y-2">
                      {favSlack.map(m => (
                        <div key={m.id} className="border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-3">
                          <StarButton active={true} onClick={() => toggleFav('slack', String(m.id))} />
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-indigo-600">{m.sender ?? '-'}</span>
                                <span className="text-xs text-gray-400">{m.channel_name}</span>
                              </div>
                              <span className="text-xs text-gray-400">{m.date} {m.time}</span>
                            </div>
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{m.content}</p>
                            {m.permalink && <a href={m.permalink} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:underline mt-1 inline-block">Slack에서 보기 →</a>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {favMemos.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">메모</p>
                    <div className="space-y-2">
                      {favMemos.map(m => (
                        <div key={m.id} className="border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-3">
                          <StarButton active={true} onClick={() => toggleFav('memos', m.id)} />
                          {m.language && <span className="shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center">{m.language}</span>}
                          <div className="flex-1">
                            <p className="text-sm text-gray-800">{m.memo_content}</p>
                            <p className="text-xs text-gray-400 mt-1">{m.created_at?.slice(0, 10)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 원고 수정사항 */}
            {activeSection === 'revisions' && (() => {
              const rq = revisionQuery.trim().toLowerCase();
              const filtered = revisions.filter(r => {
                if (rq && ![r.detail_content, r.confirmation_content, r.file_name, r.author, r.manager, r.error_type].some(v => v?.toLowerCase().includes(rq))) return false;
                if (revisionStatusFilter && r.status !== revisionStatusFilter) return false;
                if (revisionLangFilter && r.language !== revisionLangFilter) return false;
                return true;
              });
              const statuses = [...new Set(revisions.map(r => r.status).filter(Boolean))] as string[];
              const langs = [...new Set(revisions.map(r => r.language).filter(Boolean))] as string[];
              const byErrorType = new Map<string, ManuscriptRequest[]>();
              for (const r of filtered) {
                const key = r.error_type || '분류 없음';
                if (!byErrorType.has(key)) byErrorType.set(key, []);
                byErrorType.get(key)!.push(r);
              }
              return (
                <div>
                  {/* 검색 + 필터 */}
                  <div className="mb-4 space-y-2">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
                      <input type="text" value={revisionQuery} onChange={e => setRevisionQuery(e.target.value)}
                        placeholder="내용·파일명·작성자 검색..."
                        className="w-full pl-9 pr-9 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      {rq && <button onClick={() => setRevisionQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>}
                    </div>
                    {(statuses.length > 0 || langs.length > 0) && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {statuses.map(s => (
                          <button key={s} onClick={() => setRevisionStatusFilter(revisionStatusFilter === s ? '' : s)}
                            className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${revisionStatusFilter === s ? 'bg-[#1a1a2e] border-[#1a1a2e] text-white' : `${revisionStatusColor(s)} border-current`}`}>
                            {s}
                          </button>
                        ))}
                        {statuses.length > 0 && langs.length > 0 && <span className="h-4 w-px bg-gray-200" />}
                        {langs.map(l => (
                          <button key={l} onClick={() => setRevisionLangFilter(revisionLangFilter === l ? '' : l)}
                            className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${revisionLangFilter === l ? 'bg-[#1a1a2e] border-[#1a1a2e] text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                            {l}
                          </button>
                        ))}
                        {(revisionStatusFilter || revisionLangFilter) && (
                          <button onClick={() => { setRevisionStatusFilter(''); setRevisionLangFilter(''); }} className="text-[12px] text-gray-400 hover:text-gray-600 underline">초기화</button>
                        )}
                      </div>
                    )}
                    {(rq || revisionStatusFilter || revisionLangFilter) && (
                      <p className="text-xs text-gray-400">{filtered.length > 0 ? `${filtered.length}건 일치` : '일치하는 항목 없음'}</p>
                    )}
                  </div>

                  {filtered.length === 0 && <div className="text-center text-sm text-gray-400 py-8">수정사항 없음</div>}

                  {/* error_type별 접이식 그룹 */}
                  {filtered.length > 0 && (
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                      {[...byErrorType.entries()].map(([errorType, items]) => {
                        const isOpen = rq.length > 0 || revisionStatusFilter !== '' || revisionLangFilter !== '' || expandedErrorTypes.has(errorType);
                        const latestDate = items[0]?.registration_date ?? items[0]?.created_at?.slice(0, 10) ?? '';
                        return (
                          <div key={errorType}>
                            <button
                              onClick={() => setExpandedErrorTypes(prev => { const n = new Set(prev); if (n.has(errorType)) n.delete(errorType); else n.add(errorType); return n; })}
                              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left">
                              <div className="flex items-center gap-3">
                                <span className={`text-gray-400 text-base transition-transform inline-block ${isOpen ? 'rotate-90' : ''}`}>›</span>
                                <span className="text-sm font-medium text-gray-800">{errorType}</span>
                                <span className="text-xs text-gray-400">({items.length})</span>
                              </div>
                              <span className="text-xs text-gray-400">{latestDate}</span>
                            </button>
                            {isOpen && (
                              <div className="divide-y divide-gray-50 border-t border-gray-100">
                                {items.map(r => (
                                  <div key={r.id} className="px-4 py-3 hover:bg-gray-50/60 transition-colors">
                                    <div className="flex items-center justify-between mb-0.5 gap-2 flex-wrap">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {r.status && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${revisionStatusColor(r.status)}`}>{r.status}</span>}
                                        {r.language && <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">{r.language}</span>}
                                        {r.episode && <span className="text-xs text-gray-500">{r.episode}화</span>}
                                        {r.file_name && <span className="text-xs text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{r.file_name}</span>}
                                        {r.author && <span className="text-xs font-semibold text-gray-700">{r.author}</span>}
                                        {r.manager && <span className="text-xs text-gray-400">담당: <span className="text-gray-600">{r.manager}</span></span>}
                                        {r.request_language_team && <span className="text-xs text-gray-400">요청팀: <span className="text-gray-600">{r.request_language_team}</span></span>}
                                      </div>
                                      <span className="text-xs text-gray-400 shrink-0">{r.registration_date ?? r.created_at?.slice(0, 10)}</span>
                                    </div>
                                    {r.detail_content && <p className="text-sm text-gray-800 whitespace-pre-wrap break-words mt-1">{r.detail_content}</p>}
                                    {r.image_url && (
                                      <div className="mt-2">
                                        {expandedImages.has(String(r.id)) ? (
                                          <div>
                                            <img src={r.image_url} alt="원고 이미지" loading="lazy"
                                              className="max-h-72 rounded-lg border border-gray-100 object-contain bg-gray-50 cursor-zoom-in"
                                              onClick={() => setExpandedImages(s => { const n = new Set(s); n.delete(String(r.id)); return n; })} />
                                            <button onClick={() => setExpandedImages(s => { const n = new Set(s); n.delete(String(r.id)); return n; })} className="text-xs text-gray-400 hover:text-gray-600 mt-1">접기</button>
                                          </div>
                                        ) : (
                                          <button onClick={() => setExpandedImages(s => new Set([...s, String(r.id)]))}
                                            className="mt-1 inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-gray-50 hover:bg-indigo-50 text-gray-600 hover:text-indigo-700 border border-gray-200 transition-colors">
                                            📷 이미지 보기
                                          </button>
                                        )}
                                      </div>
                                    )}
                                    {r.confirmation_content && (
                                      <div className="pl-4 mt-3 border-l-2 border-green-200 ml-1">
                                        <span className="text-xs font-semibold text-green-600 block mb-0.5">확인 내용</span>
                                        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{r.confirmation_content}</p>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Slack 메시지 */}
            {activeSection === 'slack' && (() => {
              const rawQuery = slackQuery.trim();
              const queryActive = rawQuery.length > 0;
              const queryVariants = queryActive
                ? Array.from(new Set([
                    rawQuery.toLowerCase(),
                    ...(looksLikeEngInput(rawQuery) ? [engToKorean(rawQuery).toLowerCase()] : []),
                  ]))
                : [];
              const matchesQuery = (m: SlackMessage) => {
                if (!queryActive) return true;
                const hay = `${msgContent(m)} ${m.sender ?? ''} ${m.category ?? ''}`.toLowerCase();
                return queryVariants.some(q => hay.includes(q));
              };
              let visibleSlack = queryActive ? slackMessages.filter(matchesQuery) : slackMessages;
              visibleSlack = visibleSlack.slice().sort((a, b) => {
                const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                return aTime - bTime;
              });

              const highlightTerms: HighlightTerm[] = [
                { term: work.title_ko ?? '', className: 'bg-indigo-100 text-indigo-800' },
                { term: work.work_id ?? '', className: 'bg-emerald-100 text-emerald-800' },
                ...queryVariants.map(q => ({ term: q, className: 'bg-yellow-200 text-yellow-900' })),
              ];

              const parents = visibleSlack.filter(m => !m.is_reply);
              const repliesByParent = new Map<string, SlackMessage[]>();
              for (const m of visibleSlack) {
                if (m.is_reply && m.parent_link) {
                  if (!repliesByParent.has(m.parent_link)) repliesByParent.set(m.parent_link, []);
                  repliesByParent.get(m.parent_link)!.push(m);
                }
              }
              const orphanReplies = visibleSlack.filter(m =>
                m.is_reply && (!m.parent_link || !parents.some(p => msgPermalink(p) === m.parent_link))
              );

              const byCategory = new Map<string, SlackMessage[]>();
              for (const p of [...parents, ...orphanReplies]) {
                const cat = p.category || '분류 없음';
                if (!byCategory.has(cat)) byCategory.set(cat, []);
                byCategory.get(cat)!.push(p);
              }
              const categoryOrder = ['원고/PSD', '일정/스케줄', '메타/작가', '라이센스/계약', '현지화/번역', 'BM/타입변경', '런칭/오픈', '기타', '분류 없음'];
              const sortedCategories = [...byCategory.keys()].sort((a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b));

              const renderMessage = (m: SlackMessage, isReply = false) => {
                const sender = m.sender ?? '?';
                const replies = repliesByParent.get(msgPermalink(m)) ?? [];
                const threadOpen = expandedThreads.has(String(m.id));
                return (
                  <div key={m.id} className={`${isReply ? 'pl-10 mt-4 border-l-2 border-gray-100 ml-5' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold ${senderColor(sender)}`}>
                        {senderInitial(sender)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5 gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{sender}</span>
                            <span className="text-xs text-gray-400">{msgTime(m)}</span>
                            {!isReply && (
                              <StarButton active={isFav('slack', String(m.id))} onClick={() => toggleFav('slack', String(m.id))} />
                            )}
                          </div>
                          <span className="text-xs text-gray-400">{msgDate(m)}</span>
                        </div>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{highlightText(msgContent(m), highlightTerms)}</p>
                        {msgChannel(m) && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Shared in the <span className="text-indigo-500 font-medium">#{msgChannel(m)}</span> channel.
                          </p>
                        )}
                        {(() => {
                          const images = msgImages(m);
                          if (images.length === 0) return null;
                          const key = String(m.id);
                          const isExpanded = expandedImages.has(key);
                          if (!isExpanded) {
                            return (
                              <button
                                onClick={() => setExpandedImages(prev => new Set(prev).add(key))}
                                className="mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-gray-50 hover:bg-indigo-50 text-gray-600 hover:text-indigo-700 border border-gray-200 transition-colors"
                              >
                                📷 이미지 {images.length}장 — 클릭하여 보기
                              </button>
                            );
                          }
                          return (
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {images.map((url, i) => (
                                <button key={i} onClick={() => setModalImage(url)} className="block">
                                  <img src={url} alt="" loading="lazy" className="h-20 rounded-lg border border-gray-100 object-cover hover:opacity-90 cursor-zoom-in" />
                                </button>
                              ))}
                              <button
                                onClick={() => setExpandedImages(prev => { const next = new Set(prev); next.delete(key); return next; })}
                                className="text-xs text-gray-400 hover:text-gray-600 ml-1"
                              >접기</button>
                            </div>
                          );
                        })()}
                        {!isReply && replies.length > 0 && (
                          <button
                            onClick={() => {
                              setExpandedThreads(prev => {
                                const next = new Set(prev);
                                if (next.has(String(m.id))) next.delete(String(m.id));
                                else next.add(String(m.id));
                                return next;
                              });
                            }}
                            className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                          >
                            <span>↳ {replies.length} replies</span>
                            <span className="text-gray-400">{threadOpen ? '· Hide thread' : '· View thread'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                    {!isReply && threadOpen && replies.map(r => renderMessage(r, true))}
                  </div>
                );
              };

              if (slackMessages.length === 0) {
                return <div className="text-center text-sm text-gray-400 py-8">Slack 메시지 없음</div>;
              }

              return (
                <div>
                  {/* Slack 헤더 */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg leading-none">
                          <svg width="18" height="18" viewBox="0 0 127 127" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block">
                            <path d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2H27.2V80z" fill="#E01E5A"/>
                            <path d="M33.7 80c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" fill="#E01E5A"/>
                            <path d="M46.9 27.2c-7.3 0-13.2-5.9-13.2-13.2C33.7 6.7 39.6.8 46.9.8c7.3 0 13.2 5.9 13.2 13.2V27.2H46.9z" fill="#36C5F0"/>
                            <path d="M46.9 33.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.1.7 54.2.7 46.9c0-7.3 5.9-13.2 13.2-13.2H46.9z" fill="#36C5F0"/>
                            <path d="M99.8 46.9c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.8V46.9z" fill="#2EB67D"/>
                            <path d="M93.3 46.9c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.9C66.9 6.6 72.8.7 80.1.7c7.3 0 13.2 5.9 13.2 13.2V46.9z" fill="#2EB67D"/>
                            <path d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8H80.1z" fill="#ECB22E"/>
                            <path d="M80.1 93.3c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2H113c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z" fill="#ECB22E"/>
                          </svg>
                        </span>
                        <span className="text-base font-semibold text-gray-900">Slack Message</span>
                        <span className="text-xs text-gray-400">
                          {queryActive ? `(${visibleSlack.length}/${slackMessages.length})` : `(${slackMessages.length})`}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">관련 Slack 채널의 메시지를 카테고리별로 그룹화합니다.</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-500">Order by:</span>
                      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                        <button onClick={() => setSlackOrder('category')}
                          className={`px-3 py-1.5 text-xs font-medium transition-colors ${slackOrder === 'category' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                          Category Order
                        </button>
                        <button onClick={() => setSlackOrder('time')}
                          className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 ${slackOrder === 'time' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                          Time Order
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 검색창 */}
                  <div className="mb-4">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
                      <input
                        type="text"
                        value={slackQuery}
                        onChange={e => setSlackQuery(e.target.value)}
                        placeholder="메시지 내용·발신자·카테고리 검색..."
                        className="w-full pl-9 pr-9 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                      {queryActive && (
                        <button onClick={() => setSlackQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>
                      )}
                    </div>
                    {queryActive && (
                      <p className="text-xs text-gray-400 mt-1.5">
                        {visibleSlack.length > 0 ? `"${rawQuery}" — ${visibleSlack.length}개 일치` : `"${rawQuery}" — 일치하는 메시지 없음`}
                      </p>
                    )}
                  </div>

                  {queryActive && visibleSlack.length === 0 && (
                    <div className="py-10 text-center text-sm text-gray-400">검색 결과가 없습니다.</div>
                  )}

                  {/* 카테고리별 */}
                  {slackOrder === 'category' && (
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                      {sortedCategories.map(cat => {
                        const list = byCategory.get(cat)!;
                        const isOpen = queryActive || expandedCategories.has(cat);
                        const latestDate = list.at(-1) ? msgDate(list.at(-1)!) : '';
                        return (
                          <div key={cat}>
                            <button
                              onClick={() => {
                                setExpandedCategories(prev => {
                                  const next = new Set(prev);
                                  if (next.has(cat)) next.delete(cat);
                                  else next.add(cat);
                                  return next;
                                });
                              }}
                              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                            >
                              <div className="flex items-center gap-3">
                                <span className={`text-gray-400 text-base transition-transform inline-block ${isOpen ? 'rotate-90' : ''}`}>›</span>
                                <span className="text-sm font-medium text-gray-800">{cat}</span>
                                <span className="text-xs text-gray-400">({list.length})</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">{latestDate}</span>
                                {isOpen && <span className="text-gray-400 text-base">‹</span>}
                              </div>
                            </button>
                            {isOpen && (
                              <div className="px-4 py-4 space-y-5 border-t border-gray-100">
                                {list.map(m => renderMessage(m))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 시간순 */}
                  {slackOrder === 'time' && (
                    <div className="space-y-5">
                      {[...parents, ...orphanReplies].map(m => renderMessage(m))}
                    </div>
                  )}

                  <div className="mt-4 text-center">
                    <a href="https://slack.com" target="_blank" rel="noopener noreferrer"
                      className="text-xs text-gray-400 hover:text-indigo-600 inline-flex items-center gap-1">
                      View on Slack ↗
                    </a>
                  </div>
                </div>
              );
            })()}

            {/* 🔓 무검열 수정사항 */}
            {activeSection === 'uncensored' && (() => {
              // 정렬
              const numOrNull = (s: string | null) => {
                if (!s) return null;
                const m = s.match(/-?\d+(\.\d+)?/);
                return m ? parseFloat(m[0]) : null;
              };
              const cmpNum = (a: number | null, b: number | null, asc: boolean) => {
                if (a === null && b === null) return 0;
                if (a === null) return 1;
                if (b === null) return -1;
                return asc ? a - b : b - a;
              };
              const sorted = [...uncensored].sort((a, b) => {
                if (uncSort === 'episode_asc') return cmpNum(numOrNull(a.episode), numOrNull(b.episode), true) || cmpNum(numOrNull(a.psd), numOrNull(b.psd), true);
                if (uncSort === 'episode_desc') return cmpNum(numOrNull(a.episode), numOrNull(b.episode), false) || cmpNum(numOrNull(a.psd), numOrNull(b.psd), false);
                if (uncSort === 'psd_asc') return cmpNum(numOrNull(a.psd), numOrNull(b.psd), true) || cmpNum(numOrNull(a.episode), numOrNull(b.episode), true);
                if (uncSort === 'psd_desc') return cmpNum(numOrNull(a.psd), numOrNull(b.psd), false) || cmpNum(numOrNull(a.episode), numOrNull(b.episode), false);
                return (b.created_at ?? '').localeCompare(a.created_at ?? '');
              });
              return (
              <div className="space-y-2">
                {uncensored.length > 0 && (
                  <div className="flex items-center justify-between bg-white rounded-xl px-4 py-2 shadow-sm">
                    <span className="text-xs text-gray-500">정렬</span>
                    <select
                      value={uncSort}
                      onChange={e => setUncSort(e.target.value as any)}
                      className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      <option value="episode_asc">회차 오름차순</option>
                      <option value="episode_desc">회차 내림차순</option>
                      <option value="psd_asc">PSD 오름차순</option>
                      <option value="psd_desc">PSD 내림차순</option>
                      <option value="date_desc">최신순</option>
                    </select>
                  </div>
                )}
                {uncensored.length === 0 && <div className="text-center text-sm text-gray-400 py-8 bg-white rounded-xl">무검열 수정사항 없음</div>}
                {uncensored.length > 0 && sorted.map(u => {
                  const imgKey = `unc_${u.id}`;
                  const isExpanded = expandedImages.has(imgKey);
                  return (
                    <div key={u.id} className="bg-white rounded-xl px-5 py-4 shadow-sm flex items-start gap-3">
                      <StarButton active={isFav('uncensored', String(u.id))} onClick={() => toggleFav('uncensored', String(u.id))} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${revisionStatusColor(u.status)}`}>{u.status ?? '-'}</span>
                          {u.episode && <span className="text-xs text-gray-500">{u.episode}화</span>}
                          {u.psd && <span className="text-xs text-gray-500">PSD {u.psd}</span>}
                          {u.request_date && <span className="text-xs text-gray-400">요청: {u.request_date}</span>}
                        </div>
                        {u.description && <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{u.description}</p>}
                        {u.note && <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap break-words">📝 {u.note}</p>}
                        {u.path && <p className="text-xs text-gray-400 mt-1 font-mono break-all">📁 {u.path}</p>}
                        {u.image_url && (
                          !isExpanded ? (
                            <button
                              onClick={() => setExpandedImages(prev => new Set(prev).add(imgKey))}
                              className="mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-gray-50 hover:bg-indigo-50 text-gray-600 hover:text-indigo-700 border border-gray-200 transition-colors"
                            >
                              📷 이미지 — 클릭하여 보기
                            </button>
                          ) : (
                            <div className="flex gap-2 mt-2 items-start">
                              <button onClick={() => setModalImage(u.image_url!)} className="block">
                                <img
                                  src={u.image_url}
                                  alt="무검열 원고"
                                  loading="lazy"
                                  className="max-h-64 rounded-lg border border-gray-100 object-contain bg-gray-50 hover:opacity-90 cursor-zoom-in"
                                />
                              </button>
                              <button
                                onClick={() => setExpandedImages(prev => { const next = new Set(prev); next.delete(imgKey); return next; })}
                                className="text-xs text-gray-400 hover:text-gray-600"
                              >
                                접기
                              </button>
                            </div>
                          )
                        )}
                        <p className="text-xs text-gray-400 mt-2">{u.created_at?.slice(0, 10)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              );
            })()}

            {/* 메모 */}
            {activeSection === 'memos' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <select value={memoLang} onChange={e => setMemoLang(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="">언어 선택</option>
                    {LANG_TABS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <input type="text" value={newMemo} onChange={e => setNewMemo(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addMemo()}
                    placeholder="메모 내용 입력..."
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <button onClick={addMemo} disabled={memoSaving}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
                    {memoSaving ? '저장 중…' : '+ 추가'}
                  </button>
                </div>
                {memoError && <p className="text-xs text-red-500">오류: {memoError}</p>}
                {memos.length === 0 && <div className="text-center text-sm text-gray-400 py-8">메모 없음</div>}
                {memos.map(m => (
                  <div key={m.id} className="border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-3">
                    <StarButton active={isFav('memos', m.id)} onClick={() => toggleFav('memos', m.id)} />
                    {m.language && (
                      <span className="shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center mt-0.5">{m.language}</span>
                    )}
                    <div className="flex-1">
                      {editingId === m.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingText}
                            onChange={e => setEditingText(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 rounded-lg border border-indigo-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => saveMemo(m.id)} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700">저장</button>
                            <button onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200">취소</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-gray-800">{m.memo_content}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-xs text-gray-400">{m.created_at?.slice(0, 10)}</span>
                            <button onClick={() => { setEditingId(m.id); setEditingText(m.memo_content); }} className="text-xs text-gray-400 hover:text-indigo-600 transition-colors">수정</button>
                            <button onClick={() => deleteMemo(m.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">삭제</button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* 이미지 확대 모달 */}
      {modalImage && (
        <div onClick={() => setModalImage(null)} className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out">
          <img src={modalImage} alt="" className="max-w-full max-h-full rounded-lg" />
          <button onClick={() => setModalImage(null)} className="absolute top-4 right-4 text-white text-3xl hover:opacity-75">×</button>
        </div>
      )}
    </div>
  );
}
