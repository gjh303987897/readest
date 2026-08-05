export interface DBBook {
  user_id: string;
  book_hash: string;
  meta_hash?: string;
  format: string;
  title: string;
  source_title?: string;
  author: string;
  progress?: [number, number];
  cover_hash?: string | null;
  cover_updated_at?: string | null;

  metadata?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  uploaded_at?: string | null;
}

export interface DBBookConfig {
  user_id: string;
  book_hash: string;
  meta_hash?: string;
  location?: string;
  progress?: string;

  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface DBBookNote {
  user_id: string;
  book_hash: string;
  meta_hash?: string;
  id: string;
  type?: string;
  cfi?: string;
  xpointer0?: string;
  xpointer1?: string;
  text?: string;
  style?: string;
  color?: string;
  note?: string;
  page?: number;
  global?: boolean;

  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}
