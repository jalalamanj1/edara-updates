import { supabase } from './supabase';

export interface NewsItem {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  source_url: string | null;
  category: string | null;
  published: boolean;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface NewsInput {
  title: string;
  content?: string | null;
  image_url?: string | null;
  source_url?: string | null;
  category?: string | null;
  published?: boolean;
  published_at?: string | null;
}

const NEWS_TABLE = 'news';
const DASHBOARD_LIMIT = 10;

function assertClient(): NonNullable<typeof supabase> {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
}

/** Latest published news, newest first. Used by the public Dashboard card. */
export async function getPublishedNews(limit = DASHBOARD_LIMIT): Promise<NewsItem[]> {
  const client = assertClient();
  const { data, error } = await client
    .from(NEWS_TABLE)
    .select('*')
    .eq('published', true)
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as NewsItem[]) || [];
}

export async function getNewsItem(id: string): Promise<NewsItem | null> {
  const client = assertClient();
  const { data, error } = await client.from(NEWS_TABLE).select('*').eq('id', id).single();
  if (error) throw error;
  return data as NewsItem;
}

export async function createNews(input: NewsInput): Promise<NewsItem> {
  const client = assertClient();
  const { data, error } = await client.from(NEWS_TABLE).insert(input).select().single();
  if (error) throw error;
  return data as NewsItem;
}

export async function updateNews(id: string, input: Partial<NewsInput>): Promise<NewsItem> {
  const client = assertClient();
  const { data, error } = await client.from(NEWS_TABLE).update(input).eq('id', id).select().single();
  if (error) throw error;
  return data as NewsItem;
}

export async function deleteNews(id: string): Promise<void> {
  const client = assertClient();
  const { error } = await client.from(NEWS_TABLE).delete().eq('id', id);
  if (error) throw error;
}

/** Convenience helper to publish / unpublish a single item. */
export async function setNewsPublished(id: string, published: boolean): Promise<NewsItem> {
  const published_at = published ? new Date().toISOString() : null;
  return updateNews(id, { published, published_at });
}

/** All news (published + drafts), newest first. Used by the CMS admin panel. */
export async function getAllNews(): Promise<NewsItem[]> {
  const client = assertClient();
  const { data, error } = await client
    .from(NEWS_TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as NewsItem[]) || [];
}

const NEWS_IMAGES_BUCKET = 'news-images';

/**
 * Uploads an image to Supabase Storage and returns its public URL.
 * Only the URL is stored on the news row (the bucket must allow authenticated writes).
 */
export async function uploadNewsImage(file: File): Promise<string> {
  const client = assertClient();
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const safeExt = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? ext : 'png';
  const path = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${safeExt}`;

  const { error: uploadError } = await client.storage
    .from(NEWS_IMAGES_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || `image/${safeExt}` });
  if (uploadError) throw uploadError;

  const { data } = client.storage.from(NEWS_IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
