// ─────────────────────────────────────────────────────────────
// 뷰모델 (UI가 소비하는 정규화된 형태) — 새 테이블을 normalize 해서 채움
// ─────────────────────────────────────────────────────────────

// 작품 마스터 뷰모델 (series_data 정규화)
export interface Work {
  work_id: string;          // series_data.id
  title_ko: string;         // series_data.title_ko
  title_en: string | null;  // series_data.title_en
  platform_name: string | null;  // series_data.platform (현재는 코드 "TG" 등)
  genre: string | null;          // series_data.genre
  kr_status: string | null;      // series_data.kr_status
  total_episodes: string | null; // series_data.total_episodes ("66화" 원문)
  free_episodes: string | null;  // series_data.free_episodes
  open_episodes: string | null;  // series_data.open_episodes
  is_adult: boolean | null;      // series_data.maturity === '성인'
  maturity: string | null;       // series_data.maturity 원문 ('성인' 등)
  scope: string | null;          // series_data.scope (글로벌 / 인터널)
  publisher: string | null;      // series_data.publisher
  writer_ko: string | null;      // series_data.writer
  artist_ko: string | null;      // series_data.artist
}

// 목록 언어권 배지: 라벨 ↔ language_status 컬럼 (SC 제외 9개)
export const LIST_LANGS: { label: string; statusCol: string }[] = [
  { label: 'EN', statusCol: 'en_status' },
  { label: 'ESP', statusCol: 'es_status' },
  { label: 'IT', statusCol: 'it_status' },
  { label: 'BR', statusCol: 'pt_status' },
  { label: 'DE', statusCol: 'de_status' },
  { label: 'FR', statusCol: 'fr_status' },
  { label: 'TC', statusCol: 'tw_status' },
  { label: 'JP', statusCol: 'jp_status' },
  { label: 'TH', statusCol: 'th_status' },
];

// 언어권 상태 필터/범례용 (표시 라벨 ↔ 실제 데이터 값)
export const LANG_STATUS_FILTERS: { label: string; value: string }[] = [
  { label: '연재 중', value: '연재중' },
  { label: '연재 가능 (번역 필요)', value: '연재 가능(번역 필요)' },
  { label: '연재 가능 (번역 불필요)', value: '연재 가능(번역 불필요)' },
  { label: '휴재', value: '휴재' },
  { label: '완결', value: '완결' },
  { label: '연재 불가', value: '연재 불가' },
  { label: '계약 종료', value: '계약종료' },
];

// 작품의 언어별 정보 뷰모델 (language_data + language_status 정규화)
export interface WorkLanguage {
  language: string;               // 앱 탭 코드 (PT, EN, ...)
  serial_status: string | null;   // language_status.{status}_status
  contract_type: string | null;   // language_data.{data}_contract
  store: string | null;           // language_data.{data}_store (신규)
  coin_regular: string | null;    // language_data.{data}_coin
  coin_discount: string | null;   // language_data.{data}_coin_sale
}

// ─────────────────────────────────────────────────────────────
// Supabase 원본 행 타입 (가로형 테이블 — 동적 컬럼 접근용 인덱스 시그니처)
// ─────────────────────────────────────────────────────────────
export interface SeriesRow {
  id: string;
  title_ko: string;
  title_en: string | null;
  maturity: string | null;
  platform: string | null;
  publisher: string | null;
  genre: string | null;
  scope: string | null;
  manuscript_path: string | null;
  writer: string | null;
  artist: string | null;
  copyright: string | null;
  kr_status: string | null;
  total_episodes: string | null;
  free_episodes: string | null;
  open_episodes: string | null;
  notes: string | null;
  synopsis: string | null;
  [key: string]: string | null;
}

// series_memo / language_data / language_memo / language_status 는
// 컬럼이 가로형이라 동적 키 접근(`row[`${data}_contract`]`)이 많으므로 인덱스 시그니처로 다룬다.
export type RowMap = Record<string, string | null>;

// ─────────────────────────────────────────────────────────────
// 언어 코드 매핑: 앱 탭 ↔ language_data prefix ↔ language_status prefix
// (PT→br/pt, TC→tc/tw 처럼 불일치가 있어 별도 매핑 필요)
// ─────────────────────────────────────────────────────────────
export const LANG_MAP: { tab: string; data: string; status: string }[] = [
  { tab: 'PT', data: 'br', status: 'pt' },
  { tab: 'EN', data: 'en', status: 'en' },
  { tab: 'ES', data: 'es', status: 'es' },
  { tab: 'IT', data: 'it', status: 'it' },
  { tab: 'DE', data: 'de', status: 'de' },
  { tab: 'FR', data: 'fr', status: 'fr' },
  { tab: 'TC', data: 'tc', status: 'tw' },
  { tab: 'JP', data: 'jp', status: 'jp' },
  { tab: 'TH', data: 'th', status: 'th' },
];

// ─────────────────────────────────────────────────────────────
// 변경 없는 기존 테이블
// ─────────────────────────────────────────────────────────────
export interface ManuscriptRequest {
  id: number;
  work_number: string | null;
  language: string | null;
  status: string | null;
  urgency: string | null;
  episode: string | null;
  manager: string | null;
  image_url: string | null;
  created_at: string;
}

export interface SlackMessage {
  id: number;
  artwork_name?: string;
  title_number?: string | null;
  title_name?: string | null;
  channel_name?: string | null;
  channel?: string | null;
  sender: string | null;
  date?: string | null;
  time?: string | null;
  created_at?: string | null;
  content?: string | null;
  message?: string | null;
  permalink?: string;
  slack_permalink?: string;
  is_reply?: boolean | null;
  parent_message?: string | null;
  parent_link?: string | null;
  category?: string | null;
  sub_category?: string | null;
  image_urls?: string[] | null;
  synced_at?: string;
}

// 기존 편집 가능한 메모 (그대로 유지)
export interface Memo {
  id: string;
  work_id: string;
  language: string | null;
  memo_content: string;
  created_at: string;
  updated_at: string;
}
