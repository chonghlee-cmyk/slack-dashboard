export interface Work {
  work_id: string;
  title_ko: string;
  title_en: string | null;
  platform_code: string | null;
  platform_name: string | null;
  genre: string | null;
  kr_status: string | null;
  total_episodes: number | null;
  free_episodes: number | null;
  open_episodes: number | null;
  is_adult: boolean | null;
  publisher: string | null;
  writer_ko: string | null;
  artist_ko: string | null;
}

export interface WorkLanguage {
  id: string;
  work_id: string;
  language: string;
  serial_status: string | null;
  schedule: string | null;
  contract_type: string | null;
  coin_regular: number | null;
  coin_discount: number | null;
}

export interface EpisodeRevision {
  id: string;
  work_id: string;
  title_ko: string | null;
  episode_number: string | null;
  language: string | null;
  revision_note: string | null;
  status: string | null;
  urgency: string | null;
  requester: string | null;
  created_at: string;
  updated_at: string;
}

export interface SlackMessage {
  id: number;
  artwork_name: string;
  channel_name: string | null;
  sender: string | null;
  date: string | null;
  time: string | null;
  content: string | null;
  permalink: string;
  synced_at: string;
}

export interface Memo {
  id: string;
  work_id: string;
  language: string | null;
  memo_content: string;
  created_at: string;
  updated_at: string;
}
