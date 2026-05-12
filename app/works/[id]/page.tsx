'use client';

import { useState, useEffect } from 'react';
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

export default function WorkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'PT' | string>('PT');
  const [activeSection, setActiveSection] = useState<'revisions' | 'slack' | 'memos'>('revisions');

  const [work, setWork] = useState<Work | null>(null);
  const [languages, setLanguages] = useState<WorkLanguage[]>([]);
  const [revisions, setRevisions] = useState<EpisodeRevision[]>([]);
  const [slackMessages, setSlackMessages] = useState<SlackMessage[]>([]);
  const [memos, setMemos] = useState<{ id: string; language: string | null; content: string; created_at: string }[]>([]);
  const [newMemo, setNewMemo] = useState('');
  const [memoLang, setMemoLang] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    loadAll();
  }, [id]);

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

    // slack messages — artwork_name에 work_id(숫자)가 저장됨
    if (workRes.data?.work_id) {
      const { data: slack } = await supabase
        .from('slack_messages')
        .select('*')
        .eq('artwork_name', workRes.data.work_id)
        .order('date', { ascending: false })
        .order('time', { ascending: false })
        .limit(100);
      setSlackMessages((slack as SlackMessage[]) ?? []);
    }

    // memos
    const { data: memoData } = await supabase
      .from('memos')
      .select('*')
      .eq('work_id', id)
      .order('created_at', { ascending: false });
    setMemos(memoData ?? []);

    setLoading(false);
  }

  async function addMemo() {
    if (!newMemo.trim()) return;
    const { data } = await supabase.from('memos').insert({
      work_id: id,
      language: memoLang || null,
      content: newMemo.trim(),
    }).select().single();
    if (data) {
      setMemos(prev => [data, ...prev]);
      setNewMemo('');
      setMemoLang('');
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

  return (
    <div className="min-h-screen bg-[#f4f5f7]">
      {/* 헤더 */}
      <div className="bg-[#1a1a2e] text-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-white opacity-60 hover:opacity-100 text-sm">← 뒤로</button>
        <h1 className="text-sm font-medium opacity-70">② 작품 상세 화면</h1>
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

        {/* 작품 기본 정보 */}
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
                <button
                  key={lang}
                  onClick={() => setActiveTab(lang)}
                  className={`px-4 py-3 text-sm font-medium shrink-0 border-b-2 transition-colors ${
                    activeTab === lang
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  } ${!hasData ? 'opacity-40' : ''}`}
                >
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
        <div className="flex gap-2 mb-4">
          {[
            { key: 'revisions', label: `📋 원고 수정사항 (${revisions.length})` },
            { key: 'slack', label: `💬 Slack 메시지 (${slackMessages.length})` },
            { key: 'memos', label: `📝 언어권별 메모 (${memos.length})` },
          ].map(s => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key as typeof activeSection)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeSection === s.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 shadow-sm'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* 원고 수정사항 */}
        {activeSection === 'revisions' && (
          <div className="space-y-2">
            {revisions.length === 0 && (
              <div className="text-center text-sm text-gray-400 py-8 bg-white rounded-xl">수정사항 없음</div>
            )}
            {revisions.map(r => (
              <div key={r.id} className="bg-white rounded-xl px-5 py-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${revisionStatusColor(r.status)}`}>
                    {r.status ?? '-'}
                  </span>
                  {r.language && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                      {r.language}
                    </span>
                  )}
                  {r.episode_number && (
                    <span className="text-xs text-gray-400">{r.episode_number}화</span>
                  )}
                  {r.urgency && (
                    <span className="text-xs text-red-400 font-medium">{r.urgency}</span>
                  )}
                </div>
                <p className="text-sm text-gray-800">{r.revision_note ?? '-'}</p>
                <p className="text-xs text-gray-400 mt-2">{r.created_at?.slice(0, 10)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Slack 메시지 */}
        {activeSection === 'slack' && (
          <div className="space-y-2">
            {slackMessages.length === 0 && (
              <div className="text-center text-sm text-gray-400 py-8 bg-white rounded-xl">Slack 메시지 없음</div>
            )}
            {slackMessages.map(m => (
              <div key={m.id} className="bg-white rounded-xl px-5 py-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-indigo-600">{m.sender ?? '-'}</span>
                    <span className="text-xs text-gray-400">{m.channel_name}</span>
                  </div>
                  <span className="text-xs text-gray-400">{m.date} {m.time}</span>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{m.content}</p>
                {m.permalink && (
                  <a
                    href={m.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-400 hover:underline mt-2 inline-block"
                  >
                    Slack에서 보기 →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 언어권별 메모 */}
        {activeSection === 'memos' && (
          <div className="space-y-3">
            {/* 메모 추가 */}
            <div className="bg-white rounded-xl px-5 py-4 shadow-sm">
              <div className="flex gap-2 mb-3">
                <select
                  value={memoLang}
                  onChange={e => setMemoLang(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">언어 선택</option>
                  {LANG_TABS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <input
                  type="text"
                  value={newMemo}
                  onChange={e => setNewMemo(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addMemo()}
                  placeholder="메모 내용 입력..."
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button
                  onClick={addMemo}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  + 추가
                </button>
              </div>
            </div>

            {memos.length === 0 && (
              <div className="text-center text-sm text-gray-400 py-8 bg-white rounded-xl">메모 없음</div>
            )}
            {memos.map(m => (
              <div key={m.id} className="bg-white rounded-xl px-5 py-4 shadow-sm flex items-start gap-3">
                {m.language && (
                  <span className="shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center">
                    {m.language}
                  </span>
                )}
                <div className="flex-1">
                  <p className="text-sm text-gray-800">{m.content}</p>
                  <p className="text-xs text-gray-400 mt-1">{m.created_at?.slice(0, 10)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
