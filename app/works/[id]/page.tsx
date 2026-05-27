'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Work, WorkLanguage, ManuscriptRequest, SlackMessage } from '@/lib/types';

const LANG_TABS = ['PT', 'EN', 'ES', 'IT', 'DE', 'FR', 'TC', 'JP', 'TH'];

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

const revisionStatusColor = (status: string | null) => {
  if (!status) return 'bg-gray-100 text-gray-600';
  if (status.includes('작업') || status.includes('진행')) return 'bg-yellow-100 text-yellow-700';
  if (status.includes('완료') || status.includes('done')) return 'bg-green-100 text-green-700';
  if (status.includes('접수')) return 'bg-blue-100 text-blue-700';
  return 'bg-gray-100 text-gray-600';
};

type MemoRow = { id: string; language: string | null; memo_content: string; created_at: string };
type Section = 'favorites' | 'revisions' | 'slack' | 'memos';

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

export default function WorkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('PT');
  const [activeSection, setActiveSection] = useState<Section>('revisions');
  const [slackOrder, setSlackOrder] = useState<'category' | 'time'>('category');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [expandedImages, setExpandedImages] = useState<Set<string>>(new Set());  // 클릭해서 펼친 이미지 (egress 절약)
  const [modalImage, setModalImage] = useState<string | null>(null);              // 확대 보기 모달

  const [work, setWork] = useState<Work | null>(null);
  const [languages, setLanguages] = useState<WorkLanguage[]>([]);
  const [revisions, setRevisions] = useState<ManuscriptRequest[]>([]);
  const [slackMessages, setSlackMessages] = useState<SlackMessage[]>([]);
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
    const [workRes, langRes, revRes] = await Promise.all([
      supabase.from('works').select('*').eq('work_id', id).single(),
      supabase.from('work_languages').select('*').eq('work_id', id),
      supabase.from('manuscript_requests').select('*').eq('work_number', id).order('created_at', { ascending: false }).limit(50),
    ]);
    setWork(workRes.data as Work);
    setLanguages((langRes.data as WorkLanguage[]) ?? []);
    setRevisions((revRes.data as ManuscriptRequest[]) ?? []);

    if (workRes.data?.work_id) {
      const { data: slack } = await supabase
        .from('slack_messages').select('*')
        .eq('title_number', workRes.data.work_id)
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

  // 즐겨찾기 탭용 필터
  const favRevisions = revisions.filter(r => isFav('revisions', String(r.id)));
  const favSlack = slackMessages.filter(m => isFav('slack', String(m.id)));
  const favMemos = memos.filter(m => isFav('memos', m.id));

  const sections = [
    { key: 'favorites', label: `⭐ 즐겨찾기 (${favCount})` },
    { key: 'revisions', label: `📋 원고 수정사항 (${revisions.length})` },
    { key: 'slack', label: `💬 Slack 메시지 (${slackMessages.length})` },
    { key: 'memos', label: `📝 언어권별 메모 (${memos.length})` },
  ];

  return (
    <div className="min-h-screen bg-[#f4f5f7]">
      <div className="bg-[#1a1a2e] text-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-white opacity-60 hover:opacity-100 text-sm">← 뒤로</button>
        <h1 className="text-sm font-medium opacity-70">작품 상세</h1>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* 작품 제목 */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{work.title_ko}</h2>
            {work.title_en && <p className="text-sm text-gray-400 mt-1">{work.title_en}</p>}
          </div>
          <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${statusColor(work.kr_status)}`}>
            {work.kr_status ?? '-'}
          </span>
        </div>

        {/* 기본 정보 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: '작품번호', value: work.work_id },
            { label: '플랫폼', value: work.platform_name },
            { label: '장르', value: work.genre },
            { label: '총회차수', value: work.total_episodes ? `${work.total_episodes}화` : '-' },
            { label: '출판사', value: work.publisher },
            { label: '성인여부', value: work.is_adult ? '성인' : '비성인' },
            { label: '무료회차', value: work.free_episodes ? `${work.free_episodes}화` : '-' },
            { label: '오픈회차', value: work.open_episodes ? `${work.open_episodes}화` : '-' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-xl px-4 py-3 shadow-sm">
              <div className="text-xs text-gray-400 mb-1">{item.label}</div>
              <div className="text-sm font-medium text-gray-800">{item.value ?? '-'}</div>
            </div>
          ))}
        </div>

        {/* 언어권 탭 */}
        <div className="bg-white rounded-xl shadow-sm mb-6 overflow-hidden">
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {LANG_TABS.map(lang => {
              const hasData = languages.some(l => l.language === lang);
              return (
                <button key={lang} onClick={() => setActiveTab(lang)}
                  className={`px-4 py-3 text-sm font-medium shrink-0 border-b-2 transition-colors ${activeTab === lang ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'} ${!hasData ? 'opacity-40' : ''}`}>
                  {lang}
                </button>
              );
            })}
          </div>
          {activeLang ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4">
              {[
                { label: '연재상태', value: activeLang.serial_status },
                { label: '연재일정', value: activeLang.schedule },
                { label: '계약구분', value: activeLang.contract_type },
                { label: '일반코인', value: activeLang.coin_regular ? `${activeLang.coin_regular}코인` : '-' },
                { label: '할인코인', value: activeLang.coin_discount ? `${activeLang.coin_discount}코인` : '-' },
              ].map(item => (
                <div key={item.label}>
                  <div className="text-xs text-gray-400 mb-1">{item.label}</div>
                  <div className="text-sm font-semibold text-gray-800">{item.value ?? '-'}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-gray-400">해당 언어권 데이터 없음</div>
          )}
        </div>

        {/* 섹션 탭 */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {sections.map(s => (
            <button key={s.key} onClick={() => setActiveSection(s.key as Section)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeSection === s.key ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 shadow-sm'}`}>
              {s.label}
            </button>
          ))}
        </div>

        {/* ⭐ 즐겨찾기 */}
        {activeSection === 'favorites' && (
          <div className="space-y-4">
            {favCount === 0 && (
              <div className="text-center text-sm text-gray-400 py-10 bg-white rounded-xl">
                ★ 아이템에 별표를 눌러 즐겨찾기에 추가하세요
              </div>
            )}
            {favRevisions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">📋 원고 수정사항</p>
                <div className="space-y-2">
                  {favRevisions.map(r => (
                    <div key={r.id} className="bg-white rounded-xl px-5 py-4 shadow-sm flex items-start gap-3">
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
                            <img src={r.image_url} alt="원고 이미지" className="mt-2 max-h-48 rounded-lg border border-gray-100 object-contain bg-gray-50 hover:opacity-90 transition-opacity cursor-zoom-in" />
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
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">💬 Slack 메시지</p>
                <div className="space-y-2">
                  {favSlack.map(m => (
                    <div key={m.id} className="bg-white rounded-xl px-5 py-4 shadow-sm flex items-start gap-3">
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
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">📝 메모</p>
                <div className="space-y-2">
                  {favMemos.map(m => (
                    <div key={m.id} className="bg-white rounded-xl px-5 py-4 shadow-sm flex items-start gap-3">
                      <StarButton active={true} onClick={() => toggleFav('memos', m.id)} />
                      {m.language && (
                        <span className="shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center">{m.language}</span>
                      )}
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

        {/* 📋 원고 수정사항 */}
        {activeSection === 'revisions' && (
          <div className="space-y-2">
            {revisions.length === 0 && <div className="text-center text-sm text-gray-400 py-8 bg-white rounded-xl">수정사항 없음</div>}
            {revisions.map(r => (
              <div key={r.id} className="bg-white rounded-xl px-5 py-4 shadow-sm flex items-start gap-3">
                <StarButton active={isFav('revisions', String(r.id))} onClick={() => toggleFav('revisions', String(r.id))} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${revisionStatusColor(r.status)}`}>{r.status ?? '-'}</span>
                    {r.language && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{r.language}</span>}
                    {r.episode && <span className="text-xs text-gray-500">{r.episode}화</span>}
                    {r.urgency && <span className="text-xs text-red-400 font-medium">{r.urgency}</span>}
                    {r.manager && <span className="text-xs text-gray-400">담당: {r.manager}</span>}
                  </div>
                  {r.image_url && (
                    <a href={r.image_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={r.image_url}
                        alt="원고 이미지"
                        className="mt-2 max-h-64 rounded-lg border border-gray-100 object-contain bg-gray-50 hover:opacity-90 transition-opacity cursor-zoom-in"
                      />
                    </a>
                  )}
                  <p className="text-xs text-gray-400 mt-2">{r.created_at?.slice(0, 10)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 💬 Slack 메시지 */}
        {activeSection === 'slack' && (() => {
          // 스레드 그룹: 부모 메시지 + 그 답글들
          const parents = slackMessages.filter(m => !m.is_reply);
          const repliesByParent = new Map<string, SlackMessage[]>();
          for (const m of slackMessages) {
            if (m.is_reply && m.parent_link) {
              if (!repliesByParent.has(m.parent_link)) repliesByParent.set(m.parent_link, []);
              repliesByParent.get(m.parent_link)!.push(m);
            }
          }
          // 부모 없이 답글만 있는 경우도 표시
          const orphanReplies = slackMessages.filter(m =>
            m.is_reply && (!m.parent_link || !parents.some(p => msgPermalink(p) === m.parent_link))
          );

          // 카테고리별 그룹핑
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
              <div key={m.id} className={`${isReply ? 'pl-6 mt-3 border-l-2 border-gray-100 ml-5' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold ${senderColor(sender)}`}>
                    {senderInitial(sender)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{sender}</span>
                      <span className="text-xs text-gray-400">{msgDate(m)} {msgTime(m)}</span>
                      {!isReply && (
                        <StarButton active={isFav('slack', String(m.id))} onClick={() => toggleFav('slack', String(m.id))} />
                      )}
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{msgContent(m)}</p>
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
                              <img
                                src={url}
                                alt=""
                                loading="lazy"
                                className="h-20 rounded-lg border border-gray-100 object-cover hover:opacity-90 cursor-zoom-in"
                              />
                            </button>
                          ))}
                          <button
                            onClick={() => setExpandedImages(prev => { const next = new Set(prev); next.delete(key); return next; })}
                            className="text-xs text-gray-400 hover:text-gray-600 ml-1"
                          >
                            접기
                          </button>
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
            return <div className="text-center text-sm text-gray-400 py-8 bg-white rounded-xl">Slack 메시지 없음</div>;
          }

          return (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {/* 헤더: Slack 로고 + 정렬 토글 */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-gray-900">💬 Slack Messages</span>
                  <span className="text-xs text-gray-400">({slackMessages.length})</span>
                </div>
                <div className="flex bg-gray-50 rounded-lg p-0.5">
                  <button onClick={() => setSlackOrder('category')}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${slackOrder === 'category' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                    Category
                  </button>
                  <button onClick={() => setSlackOrder('time')}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${slackOrder === 'time' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                    Time
                  </button>
                </div>
              </div>

              {/* 카테고리별 그룹 보기 */}
              {slackOrder === 'category' && (
                <div className="divide-y divide-gray-100">
                  {sortedCategories.map(cat => {
                    const list = byCategory.get(cat)!;
                    const color = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS['분류 없음'];
                    const isOpen = expandedCategories.has(cat);
                    const latestDate = list[0] ? msgDate(list[0]) : '';
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
                          className={`w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`text-gray-400 text-sm transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                            <span className={`w-2 h-2 rounded-full ${color.dot}`} />
                            <span className={`text-sm font-semibold ${color.text}`}>{cat}</span>
                            <span className="text-xs text-gray-400">({list.length})</span>
                          </div>
                          <span className="text-xs text-gray-400">{latestDate}</span>
                        </button>
                        {isOpen && (
                          <div className={`${color.bg} px-5 py-4 space-y-5`}>
                            {list.map(m => renderMessage(m))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 시간순 보기 */}
              {slackOrder === 'time' && (
                <div className="px-5 py-4 space-y-5">
                  {[...parents, ...orphanReplies]
                    .sort((a, b) => (msgDate(b) + msgTime(b)).localeCompare(msgDate(a) + msgTime(a)))
                    .map(m => renderMessage(m))}
                </div>
              )}

              {/* 하단 Slack 링크 */}
              <div className="px-5 py-3 border-t border-gray-100 text-center">
                <a href="https://slack.com" target="_blank" rel="noopener noreferrer"
                  className="text-xs text-gray-500 hover:text-indigo-600 inline-flex items-center gap-1">
                  📋 View on Slack ↗
                </a>
              </div>
            </div>
          );
        })()}

        {/* 📝 언어권별 메모 */}
        {activeSection === 'memos' && (
          <div className="space-y-3">
            {/* 추가 폼 */}
            <div className="bg-white rounded-xl px-5 py-4 shadow-sm">
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
              {memoError && <p className="text-xs text-red-500 mt-2">오류: {memoError}</p>}
            </div>

            {memos.length === 0 && <div className="text-center text-sm text-gray-400 py-8 bg-white rounded-xl">메모 없음</div>}

            {memos.map(m => (
              <div key={m.id} className="bg-white rounded-xl px-5 py-4 shadow-sm flex items-start gap-3">
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
                        <button onClick={() => saveMemo(m.id)}
                          className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700">저장</button>
                        <button onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200">취소</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-gray-800">{m.memo_content}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs text-gray-400">{m.created_at?.slice(0, 10)}</span>
                        <button onClick={() => { setEditingId(m.id); setEditingText(m.memo_content); }}
                          className="text-xs text-gray-400 hover:text-indigo-600 transition-colors">수정</button>
                        <button onClick={() => deleteMemo(m.id)}
                          className="text-xs text-gray-400 hover:text-red-500 transition-colors">삭제</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 이미지 확대 모달 */}
      {modalImage && (
        <div
          onClick={() => setModalImage(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img src={modalImage} alt="" className="max-w-full max-h-full rounded-lg" />
          <button
            onClick={() => setModalImage(null)}
            className="absolute top-4 right-4 text-white text-3xl hover:opacity-75"
            aria-label="닫기"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
