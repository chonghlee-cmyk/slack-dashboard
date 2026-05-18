'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Work, WorkLanguage, EpisodeRevision, SlackMessage } from '@/lib/types';

const LANG_TABS = ['PT', 'EN', 'ES', 'IT', 'DE', 'FR', 'TC', 'JP', 'TH'];

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

  const [work, setWork] = useState<Work | null>(null);
  const [languages, setLanguages] = useState<WorkLanguage[]>([]);
  const [revisions, setRevisions] = useState<EpisodeRevision[]>([]);
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
      supabase.from('episode_revisions').select('*').eq('work_id', id).order('created_at', { ascending: false }).limit(50),
    ]);
    setWork(workRes.data as Work);
    setLanguages((langRes.data as WorkLanguage[]) ?? []);
    setRevisions((revRes.data as EpisodeRevision[]) ?? []);

    if (workRes.data?.work_id) {
      const { data: slack } = await supabase
        .from('slack_messages').select('*')
        .eq('artwork_name', workRes.data.work_id)
        .order('date', { ascending: false }).order('time', { ascending: false }).limit(100);
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
  const favRevisions = revisions.filter(r => isFav('revisions', r.id));
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
                      <StarButton active={true} onClick={() => toggleFav('revisions', r.id)} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${revisionStatusColor(r.status)}`}>{r.status ?? '-'}</span>
                          {r.language && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{r.language}</span>}
                          {r.episode_number && <span className="text-xs text-gray-400">{r.episode_number}화</span>}
                        </div>
                        <p className="text-sm text-gray-800">{r.revision_note ?? '-'}</p>
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
                <StarButton active={isFav('revisions', r.id)} onClick={() => toggleFav('revisions', r.id)} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${revisionStatusColor(r.status)}`}>{r.status ?? '-'}</span>
                    {r.language && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{r.language}</span>}
                    {r.episode_number && <span className="text-xs text-gray-400">{r.episode_number}화</span>}
                    {r.urgency && <span className="text-xs text-red-400 font-medium">{r.urgency}</span>}
                  </div>
                  <p className="text-sm text-gray-800">{r.revision_note ?? '-'}</p>
                  <p className="text-xs text-gray-400 mt-2">{r.created_at?.slice(0, 10)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 💬 Slack 메시지 */}
        {activeSection === 'slack' && (
          <div className="space-y-2">
            {slackMessages.length === 0 && <div className="text-center text-sm text-gray-400 py-8 bg-white rounded-xl">Slack 메시지 없음</div>}
            {slackMessages.map(m => (
              <div key={m.id} className="bg-white rounded-xl px-5 py-4 shadow-sm flex items-start gap-3">
                <StarButton active={isFav('slack', String(m.id))} onClick={() => toggleFav('slack', String(m.id))} />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-indigo-600">{m.sender ?? '-'}</span>
                      <span className="text-xs text-gray-400">{m.channel_name}</span>
                    </div>
                    <span className="text-xs text-gray-400">{m.date} {m.time}</span>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{m.content}</p>
                  {m.permalink && <a href={m.permalink} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:underline mt-2 inline-block">Slack에서 보기 →</a>}
                </div>
              </div>
            ))}
          </div>
        )}

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
    </div>
  );
}
