import type { Block } from '../types';

export const OPENABLE_EMBED_TYPES = new Set<Block['type']>([
  'link',
  'audio',
  'instagram',
  'x',
  'youtube',
  'video',
  'substack',
  'medium',
  'figma',
  'arena',
  'github',
  'wikipedia',
  'codepen',
  'reddit',
  'tiktok',
  'pdf',
]);

export const isOpenableEmbed = (block: Block) => OPENABLE_EMBED_TYPES.has(block.type);

export const getOpenableEmbedUrl = (block: Block) => {
  if (!isOpenableEmbed(block)) return null;

  const rawUrl = typeof block.data.url === 'string' ? block.data.url.trim() : '';
  if (rawUrl) return rawUrl;

  if (block.type === 'youtube' && typeof block.data.videoId === 'string') {
    return `https://www.youtube.com/watch?v=${block.data.videoId}`;
  }

  return null;
};

export const openUrlInNewTab = (url: string) => {
  if (typeof window.open === 'function') {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (opened) return;
  }

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.click();
};
