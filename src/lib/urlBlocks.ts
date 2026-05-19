import type { Block, BlockType } from '../types';

type UrlBlockInput = {
  url: string;
  id: string;
  centerX: number;
  centerY: number;
  zIndex: number;
  offsetIndex?: number;
};

const URL_PATTERN = /^https?:\/\/[^\s]+$/;

const offset = (value: number, offsetIndex = 0) => value + offsetIndex * 20;

export const isEmbeddableUrl = (value: string) => URL_PATTERN.test(value.trim());

export const createUrlBlock = ({
  url,
  id,
  centerX,
  centerY,
  zIndex,
  offsetIndex = 0,
}: UrlBlockInput): Block | null => {
  const trimmed = url.trim();
  if (!isEmbeddableUrl(trimmed)) return null;

  const lower = trimmed.toLowerCase();
  const isSpotify = lower.includes('spotify.com');
  const isSoundCloud = lower.includes('soundcloud.com');
  const isAppleMusic = lower.includes('music.apple.com');
  const isAudioFile = /\.(mp3|wav|ogg|m4a)$/i.test(trimmed);
  const isVideoFile = /\.(mp4|webm|ogg|mov)$/i.test(trimmed);
  const isPdfFile = /\.pdf$/i.test(trimmed);
  const isImageFile = /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(trimmed);
  const isInstagram = lower.includes('instagram.com');
  const isX = lower.includes('x.com') || lower.includes('twitter.com');
  const isSubstack = lower.includes('substack.com');
  const isMedium = lower.includes('medium.com');
  const isFigma = lower.includes('figma.com');
  const isCodepen = lower.includes('codepen.io');
  const isGithub = lower.includes('github.com');
  const isWikipedia = lower.includes('wikipedia.org');
  const isReddit = lower.includes('reddit.com');
  const isArena = lower.includes('are.na');
  const isTiktok = lower.includes('tiktok.com');
  const ytMatch = trimmed.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i);

  const block = (type: BlockType, width: number, height: number, data: Block['data']): Block => ({
    id,
    type,
    x: offset(centerX - width / 2, offsetIndex),
    y: offset(centerY - height / 2, offsetIndex),
    width,
    height,
    zIndex,
    data,
  });

  if (ytMatch) return block('youtube', 480, 270, { videoId: ytMatch[1] });
  if (isX) return block('x', 320, 480, { url: trimmed });
  if (isInstagram) return block('instagram', 328, 480, { url: trimmed });
  if (isSubstack) return block('substack', 400, 480, { url: trimmed });
  if (isMedium) return block('medium', 320, 360, { url: trimmed });
  if (isFigma) return block('figma', 640, 360, { url: trimmed });
  if (isCodepen) return block('codepen', 600, 400, { url: trimmed });
  if (isGithub) return block('github', 400, 200, { url: trimmed });
  if (isWikipedia) return block('wikipedia', 400, 240, { url: trimmed });
  if (isReddit) return block('reddit', 400, 300, { url: trimmed });
  if (isArena) return block('arena', 400, 400, { url: trimmed });
  if (isTiktok) return block('tiktok', 328, 560, { url: trimmed });
  if (isVideoFile) return block('video', 480, 270, { url: trimmed });
  if (isPdfFile) return block('pdf', 600, 800, { url: trimmed });
  if (isImageFile) return block('image', 240, 240, { url: trimmed });

  if (isSpotify || isSoundCloud || isAppleMusic || isAudioFile) {
    const platform = isSpotify
      ? 'Spotify'
      : isSoundCloud
        ? 'SoundCloud'
        : isAppleMusic
          ? 'Apple Music'
          : 'Audio File';
    return block('audio', 240, 240, { url: trimmed, platform });
  }

  return block('link', 480, 240, { url: trimmed, title: '', description: '' });
};
