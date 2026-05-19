import React, { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';
import type { Block, DrawingPath } from '../types';
import { useBoardStore } from '../store';
import clsx from 'clsx';
import { ArrowUpRight, BookOpen } from 'lucide-react';
import { getTextBlockHeight, getTextBlockLineHeight } from '../lib/textBlockMetrics';

interface BlockContentProps {
  block: Block;
}

type LinkMetadata = {
  title?: string;
  description?: string;
  image?: string;
  logo?: string;
  author?: string;
  publisher?: string;
  date?: string;
};

type WikipediaSummaryData = {
  title?: string;
  extract?: string;
  description?: string;
  image?: string;
  pageUrl?: string;
  language?: string;
};

const getInstagramEmbedUrl = (rawUrl?: string) => {
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, '');
    if (host !== 'instagram.com') return null;

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2 || !['p', 'reel', 'tv'].includes(parts[0])) return null;

    return `https://www.instagram.com/${parts[0]}/${parts[1]}/embed/captioned`;
  } catch {
    return null;
  }
};

const getSubstackEmbedUrl = (rawUrl?: string) => {
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    const embedUrl = new URL('/embed', url.origin);

    const postIndex = parts.indexOf('p');
    if (postIndex !== -1 && parts[postIndex + 1]) {
      embedUrl.pathname = `/embed/p/${parts[postIndex + 1]}`;
    } else {
      const commentId = parts.find((part) => part.startsWith('c-'));
      if (commentId) {
        embedUrl.pathname = `/embed/c/${commentId.slice(2)}`;
      }
    }

    if (typeof window !== 'undefined') {
      embedUrl.searchParams.set('origin', window.location.origin);
      embedUrl.searchParams.set('fullURL', window.location.href);
    }

    return embedUrl.toString();
  } catch {
    return null;
  }
};

const getRedditPermalink = (rawUrl?: string) => {
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, '').replace(/^old\./, '').replace(/^new\./, '');
    if (host !== 'reddit.com' || !url.pathname.includes('/comments/')) return null;

    const permalink = new URL(url.pathname, 'https://www.reddit.com');
    return permalink.toString();
  } catch {
    return null;
  }
};

const getWikipediaSummaryUrl = (rawUrl?: string) => {
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    const hostParts = url.hostname.split('.');
    const wikipediaIndex = hostParts.indexOf('wikipedia');
    if (wikipediaIndex <= 0 || url.pathname.split('/').filter(Boolean)[0] !== 'wiki') return null;

    const language = hostParts[wikipediaIndex - 1];
    const title = url.pathname.split('/wiki/')[1];
    if (!language || !title) return null;

    return {
      language,
      url: `https://${language}.wikipedia.org/api/rest_v1/page/summary/${title}`,
    };
  } catch {
    return null;
  }
};

const placeCaretAtEnd = (el: HTMLElement) => {
  el.focus();
  if (typeof window === 'undefined') return;
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
};

const ensureEditableLine = (el: HTMLElement) => {
  if (el.textContent === '' && el.childNodes.length === 0) {
    el.appendChild(document.createElement('br'));
  }
};

const getEditableText = (el: HTMLElement) => {
  const text = el.innerText;
  return text === '\n' ? '' : text;
};

const getCaretTextOffset = (root: HTMLElement) => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(root);
  preCaretRange.setEnd(range.startContainer, range.startOffset);
  return preCaretRange.toString().length;
};

const setCaretTextOffset = (root: HTMLElement, offset: number) => {
  const selection = window.getSelection();
  if (!selection) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();

  while (node) {
    const textLength = node.textContent?.length ?? 0;
    if (remaining <= textLength) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= textLength;
    node = walker.nextNode();
  }

  placeCaretAtEnd(root);
};

const getListPrefix = (line: string, fallbackStyle?: 'bullet' | 'number') => {
  const bulletMatch = line.match(/^(\s*•\s+)/);
  if (bulletMatch) {
    return { prefix: bulletMatch[1], style: 'bullet' as const, number: null };
  }

  const numberMatch = line.match(/^(\s*)(\d+)([.)]\s+)/);
  if (numberMatch) {
    return {
      prefix: numberMatch[0],
      style: 'number' as const,
      number: Number(numberMatch[2]),
      indent: numberMatch[1],
      separator: numberMatch[3],
    };
  }

  if (fallbackStyle === 'bullet') {
    return { prefix: '• ', style: 'bullet' as const, number: null };
  }
  if (fallbackStyle === 'number') {
    return { prefix: '1. ', style: 'number' as const, number: 1, indent: '', separator: '. ' };
  }

  return null;
};

const getNextListPrefix = (currentPrefix: NonNullable<ReturnType<typeof getListPrefix>>) => {
  if (currentPrefix.style === 'bullet') return currentPrefix.prefix;
  return `${currentPrefix.indent}${(currentPrefix.number ?? 0) + 1}${currentPrefix.separator}`;
};

const handleListEnter = (
  event: React.KeyboardEvent<HTMLElement>,
  block: Block,
  updateText: (text: string) => void,
) => {
  if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;

  const el = event.currentTarget;
  const caretOffset = getCaretTextOffset(el);
  if (caretOffset === null) return false;

  const text = getEditableText(el);
  const lineStart = text.lastIndexOf('\n', Math.max(0, caretOffset - 1)) + 1;
  const nextLineBreak = text.indexOf('\n', caretOffset);
  const lineEnd = nextLineBreak === -1 ? text.length : nextLineBreak;

  const currentLine = text.slice(lineStart, lineEnd);
  const currentPrefix = getListPrefix(currentLine, block.data.listStyle);
  if (!currentPrefix || !currentLine.startsWith(currentPrefix.prefix)) return false;
  if (caretOffset < lineStart + currentPrefix.prefix.length) return false;

  event.preventDefault();

  const content = currentLine.slice(currentPrefix.prefix.length);
  const beforeLine = text.slice(0, lineStart);
  const afterLine = text.slice(lineEnd);

  if (!content.trim()) {
    const nextText = `${beforeLine}${afterLine.startsWith('\n') ? afterLine.slice(1) : afterLine}`;
    el.textContent = nextText;
    ensureEditableLine(el);
    const nextCaretOffset = lineStart;
    setCaretTextOffset(el, nextCaretOffset);
    updateText(getEditableText(el));
    return true;
  }

  const nextPrefix = getNextListPrefix(currentPrefix);
  const insertion = `\n${nextPrefix}`;
  const nextText = `${text.slice(0, caretOffset)}${insertion}${text.slice(caretOffset)}`;
  el.textContent = nextText;
  setCaretTextOffset(el, caretOffset + insertion.length);
  updateText(getEditableText(el));
  return true;
};

export const StickyBlock: React.FC<BlockContentProps> = ({ block }) => {
  const textRef = useRef<HTMLParagraphElement>(null);
  const updateBlock = useBoardStore((state) => state.updateBlock);
  const commitBlockEdit = useBoardStore((state) => state.commitBlockEdit);
  const hasFocused = useRef(false);
  const editStartBlock = useRef<Block | null>(null);
  const stickyVerticalPadding = 48;

  const syncStickyHeight = useCallback((growOnly = false) => {
    const el = textRef.current;
    if (!el) return block.height;

    el.style.height = 'auto';

    const contentHeight = Math.ceil(el.scrollHeight + stickyVerticalPadding);
    const nextHeight = growOnly ? Math.max(block.height, contentHeight) : contentHeight;
    if (Math.abs(nextHeight - block.height) >= 0.5) {
      updateBlock(block.id, { height: nextHeight }, true);
    }
    return nextHeight;
  }, [block.height, block.id, updateBlock]);

  const setRef = (el: HTMLParagraphElement | null) => {
    textRef.current = el;
    if (el) ensureEditableLine(el);
    if (el && block.data.autoFocus && !hasFocused.current) {
      hasFocused.current = true;
      const data = { ...block.data };
      delete data.autoFocus;
      updateBlock(block.id, { data }, true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (textRef.current) placeCaretAtEnd(textRef.current);
        });
      });
    }
  };

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    if (document.activeElement !== el) {
      const text = block.data.text ?? '';
      if (el.innerText !== text) {
        el.textContent = text;
        ensureEditableLine(el);
      }
    }
    syncStickyHeight(true);
  }, [block.data.text, block.id, block.width, syncStickyHeight]);

  const handleInput = (e: React.FormEvent<HTMLParagraphElement>) => {
    const el = e.currentTarget;
    syncStickyHeight(true);
    updateBlock(block.id, { data: { ...block.data, text: getEditableText(el) } }, true);
  };

  const handleFocus = () => {
    editStartBlock.current = structuredClone(block);
  };

  const handleBlur = () => {
    if (textRef.current) {
      const nextText = getEditableText(textRef.current);
      const nextHeight = syncStickyHeight(true);
      updateBlock(block.id, {
        height: nextHeight,
        data: { ...block.data, text: nextText },
      }, true);
      if (editStartBlock.current) {
        commitBlockEdit(editStartBlock.current);
      }
      ensureEditableLine(textRef.current);
    }
    editStartBlock.current = null;
    window.getSelection()?.removeAllRanges();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLParagraphElement>) => {
    handleListEnter(e, block, (text) => {
      syncStickyHeight(true);
      updateBlock(block.id, { data: { ...block.data, text } }, true);
    });
  };

  const hue = block.data.hue !== undefined ? block.data.hue : (block.data.color === 'yellow' ? 55 : 55);
  const bgColor = `hsl(${hue}, 90%, 85%)`;

  return (
    <div 
      className="w-full min-h-full p-6 flex flex-col justify-center shadow-none"
      style={{ backgroundColor: bgColor }}
    >
      <p
        ref={setRef}
        className="w-full text-zinc-800 font-medium text-lg leading-relaxed outline-none whitespace-pre-wrap break-words"
        contentEditable
        data-viboard-block-id={block.id}
        suppressContentEditableWarning
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        onBlur={handleBlur}
        style={{
          minHeight: '1.5em',
          fontWeight: block.data.bold ? 700 : undefined,
          fontStyle: block.data.italic ? 'italic' : undefined,
          textDecoration: [block.data.underline ? 'underline' : '', block.data.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
          textAlign: block.data.textAlign ?? 'center',
        }}
      />
    </div>
  );
};

export const TextBlock: React.FC<BlockContentProps> = ({ block }) => {
  const textRef = useRef<HTMLParagraphElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const updateBlock = useBoardStore((state) => state.updateBlock);
  const commitBlockEdit = useBoardStore((state) => state.commitBlockEdit);
  const zoom = useBoardStore((state) => state.viewport.zoom);
  const hasFocused = useRef(false);
  const editStartBlock = useRef<Block | null>(null);

  const fontSize = block.data.fontSize ?? 20;
  const lineHeight = getTextBlockLineHeight(fontSize);
  const minShellHeight = getTextBlockHeight(fontSize);
  const color =
    block.data.color ??
    (block.data.hue !== undefined
      ? `hsl(${block.data.hue}, 75%, 28%)`
      : '#27272a');

  const setRef = (el: HTMLParagraphElement | null) => {
    textRef.current = el;
    if (el && block.data.autoFocus && !hasFocused.current) {
      hasFocused.current = true;
      requestAnimationFrame(() => {
        placeCaretAtEnd(el);
        const data = { ...block.data };
        delete data.autoFocus;
        updateBlock(block.id, { data }, true);
      });
    }
  };

  const syncShellHeight = useCallback(() => {
    const el = textRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    const z = useBoardStore.getState().viewport.zoom;
    const measured = Math.ceil(wrap.getBoundingClientRect().height / z);
    const nextH = Math.max(minShellHeight, measured);
    if (Math.abs(nextH - block.height) < 0.5) return;
    updateBlock(block.id, { height: nextH }, true);
  }, [block.id, block.height, minShellHeight, updateBlock]);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    if (document.activeElement !== el) {
      const t = block.data.text ?? '';
      if (el.innerText !== t) {
        el.textContent = t;
      }
    }
  }, [block.data.text, block.id]);

  useLayoutEffect(() => {
    syncShellHeight();
  }, [syncShellHeight, block.width, fontSize, color, zoom, block.data.text]);

  const handleInput = () => {
    syncShellHeight();
    const el = textRef.current;
    if (el) {
      updateBlock(block.id, { data: { ...block.data, text: el.innerText } }, true);
    }
  };

  const handleFocus = () => {
    editStartBlock.current = structuredClone(block);
  };

  const handleBlur = () => {
    const el = textRef.current;
    const wrap = wrapRef.current;
    if (el && wrap) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      const z = useBoardStore.getState().viewport.zoom;
      const nextH = Math.max(minShellHeight, Math.ceil(wrap.getBoundingClientRect().height / z));
      const nextText = el.innerText;
      updateBlock(block.id, {
        height: nextH,
        data: { ...block.data, text: nextText },
      }, true);
      if (editStartBlock.current) {
        commitBlockEdit(editStartBlock.current);
      }
    }
    editStartBlock.current = null;
    window.getSelection()?.removeAllRanges();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLParagraphElement>) => {
    if (handleListEnter(e, block, (text) => {
      updateBlock(block.id, { data: { ...block.data, text } }, true);
    })) {
      syncShellHeight();
    }
  };

  return (
    <div
      ref={wrapRef}
      className="w-full p-2 bg-transparent flex flex-col box-border"
    >
      <p
        ref={setRef}
        className="font-sans outline-none whitespace-pre-wrap break-words"
        contentEditable
        data-viboard-block-id={block.id}
        suppressContentEditableWarning
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        onBlur={handleBlur}
        style={{
          minHeight: `${lineHeight}px`,
          lineHeight: `${lineHeight}px`,
          fontSize,
          color,
          fontWeight: block.data.bold ? 700 : undefined,
          fontStyle: block.data.italic ? 'italic' : undefined,
          textDecoration: [block.data.underline ? 'underline' : '', block.data.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
          textAlign: block.data.textAlign || undefined,
        }}
      />
    </div>
  );
};

export const ShapeBlock: React.FC<BlockContentProps> = ({ block }) => {
  const shape = block.data.shape || 'square';
  const fillColor = block.data.color || '#ff6b6b';

  if (shape === 'triangle') {
    return (
      <div
        className="w-full h-full transition-colors duration-200"
        style={{
          backgroundColor: fillColor,
          clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
        }}
      />
    );
  }

  return (
    <div 
      className={clsx(
        "w-full h-full transition-colors duration-200",
        shape === 'circle' ? "rounded-full" : "rounded-sm"
      )}
      style={{ 
        backgroundColor: fillColor
      }}
    />
  );
};

export const DrawingBlock: React.FC<BlockContentProps> = ({ block }) => {
  const path: DrawingPath = block.data.path;
  if (!path || !path.points || path.points.length === 0) return null;

  const points = path.points;
  const d = `M ${points[0].x} ${points[0].y} ` + 
            points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');

  return (
    <svg 
      className="w-full h-full overflow-visible pointer-events-none"
      style={{ position: 'absolute', left: 0, top: 0 }}
      aria-label="Drawing path"
    >
      <title>Drawing path</title>
      <path
        d={d}
        fill="none"
        stroke={path.color}
        strokeWidth={path.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const ImageBlock: React.FC<BlockContentProps> = ({ block }) => {
  const updateBlock = useBoardStore((state) => state.updateBlock);

  const calculateNativeRatioDimensions = useCallback((naturalWidth: number, naturalHeight: number) => {
    const aspectRatio = naturalWidth / naturalHeight;
    const baseSize = 240;
    const maxSize = 480;

    if (aspectRatio >= 1) {
      const width = Math.min(maxSize, Math.round(baseSize * aspectRatio));
      return { width, height: Math.round(width / aspectRatio) };
    }

    const height = Math.min(maxSize, Math.round(baseSize / aspectRatio));
    return { width: Math.round(height * aspectRatio), height };
  }, []);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (!img.naturalWidth || !img.naturalHeight) return;
    
    const newDims = calculateNativeRatioDimensions(img.naturalWidth, img.naturalHeight);
    
    if (block.width !== newDims.width || block.height !== newDims.height) {
      updateBlock(block.id, { width: newDims.width, height: newDims.height }, true);
    }
  }, [block.id, block.width, block.height, updateBlock, calculateNativeRatioDimensions]);

  return (
    <div className="w-full h-full flex items-center justify-center overflow-hidden">
      {block.data.loading ? (
        <div className="flex flex-col items-center justify-center gap-4 text-zinc-400">
          <div className="w-8 h-8 border-4 border-zinc-200 border-t-zinc-400 rounded-full animate-spin" />
          <span className="text-sm font-medium animate-pulse">{block.data.alt || 'Loading...'}</span>
        </div>
      ) : block.data.url ? (
        <img
          src={block.data.url}
          alt={block.data.alt || "User content"}
          title="User content"
          className="w-full h-full object-contain"
          draggable={false}
          onLoad={handleImageLoad}
        />
      ) : (
        <div className="text-zinc-400">No Image</div>
      )}
    </div>
  );
};

export const LinkBlock: React.FC<BlockContentProps> = ({ block }) => {
  const [previewState, setPreviewState] = useState<'loading' | 'preview' | 'error'>('loading');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  let domain = block.data.url;
  try {
    domain = new URL(block.data.url).hostname;
  } catch {
    // Keep the original text when URL parsing fails.
  }

  useEffect(() => {
    let isMounted = true;
    const fetchPreview = async () => {
      setPreviewState('loading');
      try {
        const apiUrl = `https://api.microlink.io?url=${encodeURIComponent(block.data.url)}&screenshot=true&embed=screenshot.url`;
        if (isMounted) {
          setPreviewUrl(apiUrl);
          setPreviewState('preview');
        }
      } catch {
        if (isMounted) setPreviewState('error');
      }
    };

    fetchPreview();
    return () => { isMounted = false; };
  }, [block.data.url]);

  return (
    <div className="w-full h-full flex flex-col border border-zinc-200 overflow-hidden pointer-events-none">
      <div className="h-10 bg-zinc-50 border-b border-zinc-200 flex items-center justify-center px-3 relative flex-shrink-0">
        <div className="absolute left-3 flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] border border-[#e0443e]/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] border border-[#dea123]/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f] border border-[#1aab29]/50" />
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-zinc-200 max-w-[60%] w-full justify-center">
          <span className="text-[13px] text-zinc-500 truncate">
            {domain}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full bg-zinc-50 relative overflow-hidden">
        {previewState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-400 rounded-full animate-spin" />
          </div>
        )}
        
        {previewState === 'preview' && previewUrl && (
          <img 
            src={previewUrl} 
            alt="Website preview"
            className="w-full h-full object-cover object-top"
            onLoad={() => setPreviewState('preview')}
            onError={() => setPreviewState('error')}
          />
        )}
        
        {previewState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-400">
            <div className="w-8 h-8 border border-zinc-200 flex items-center justify-center rounded">
              <span className="text-[10px] font-bold">!</span>
            </div>
            <span className="text-[11px] font-medium uppercase tracking-wider">Preview unavailable</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const AudioBlock: React.FC<BlockContentProps> = ({ block }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [metadata, setMetadata] = useState<{ title?: string; image?: string } | null>(null);
  const { url, platform, coverUrl } = block.data;

  useEffect(() => {
    let isMounted = true;
    if (coverUrl) return;

    const fetchMetadata = async () => {
      try {
        const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
        const json = await res.json();
        if (isMounted && json.status === 'success') {
          setMetadata({
            title: json.data?.title,
            image: json.data?.image?.url || json.data?.logo?.url
          });
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchMetadata();
    return () => { isMounted = false; };
  }, [url, coverUrl]);

  const displayImage = coverUrl || metadata?.image;
  const discCenterClass =
    platform === 'Spotify' ? 'bg-[#1DB954]' :
    platform === 'SoundCloud' ? 'bg-[#FF5500]' :
    platform === 'Apple Music' ? 'bg-[#FF2D55]' :
    'bg-red-500';

  return (
    <div className="relative w-full h-full flex items-center bg-transparent">
      {/* Spinning Vinyl Record */}
      <div 
        className={clsx(
          "absolute right-0 top-1/2 -translate-y-1/2 w-[95%] h-[95%] rounded-full bg-zinc-900 border-[6px] border-zinc-800 flex items-center justify-center shadow-xl transition-transform duration-700 ease-in-out",
          isPlaying ? "translate-x-[50%] animate-[spin_3s_linear_infinite]" : "translate-x-[50%]"
        )}
      >
        {/* Grooves */}
        <div className="absolute inset-2 rounded-full border border-zinc-700/30" />
        <div className="absolute inset-4 rounded-full border border-zinc-700/30" />
        <div className="absolute inset-6 rounded-full border border-zinc-700/30" />
        <div className="absolute inset-8 rounded-full border border-zinc-700/30" />
        <div className="absolute inset-10 rounded-full border border-zinc-700/30" />
        
        {/* Center Label */}
        <div className={clsx(
          "w-1/3 h-1/3 rounded-full flex items-center justify-center",
          discCenterClass
        )}>
          <div className="w-3 h-3 rounded-full bg-zinc-900 relative z-10" />
        </div>
      </div>

      {/* Album Cover (Square) */}
      <div 
        className="relative z-10 w-full h-full bg-zinc-800 rounded-md shadow-2xl overflow-hidden cursor-pointer group"
        onClick={() => setIsPlaying(!isPlaying)}
      >
        {displayImage ? (
          <img src={displayImage} alt="Album Cover" className="w-full h-full object-cover" />
        ) : (
          <div className={clsx(
            "w-full h-full flex flex-col items-center justify-center p-4",
            platform === 'Spotify' ? 'bg-gradient-to-br from-zinc-800 to-[#1DB954]/20' :
            platform === 'SoundCloud' ? 'bg-gradient-to-br from-zinc-800 to-[#FF5500]/20' :
            platform === 'Apple Music' ? 'bg-gradient-to-br from-zinc-800 to-[#FA243C]/20' :
            'bg-gradient-to-br from-purple-500 to-indigo-600'
          )}>
            <span className="text-white font-bold text-xl mb-2 text-center">{metadata?.title || platform || 'Audio'}</span>
            <span className="text-zinc-400 text-xs text-center truncate w-full">{url}</span>
          </div>
        )}
        
        {/* Play/Pause Overlay */}
        <div className={clsx(
          "absolute inset-0 bg-transparent opacity-0 transition-opacity flex items-center justify-center group-hover:opacity-100"
        )}>
           <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg border border-white/10 transition-transform group-hover:scale-110">
             {isPlaying ? (
               <div className="flex gap-1.5">
                 <div className="w-1.5 h-5 bg-white rounded-sm" />
                 <div className="w-1.5 h-5 bg-white rounded-sm" />
               </div>
             ) : (
               <div className="w-0 h-0 border-t-[10px] border-t-transparent border-l-[16px] border-l-white border-b-[10px] border-b-transparent ml-1" />
             )}
           </div>
        </div>
      </div>
    </div>
  );
};

import { Tweet } from 'react-tweet';

export const XBlock: React.FC<BlockContentProps> = ({ block }) => {
  const match = block.data.url?.match(/\/(?:status|statuses)\/(\d+)/);
  const tweetId = match ? match[1] : null;

  return (
    <div 
      className="w-full h-full bg-[#0a0a0a] rounded-[16px] overflow-hidden shadow-2xl"
      data-theme="dark"
    >
      {tweetId ? (
        <div className="w-full h-full overflow-y-auto pointer-events-auto flex justify-center items-start [&>div]:my-0 [&>div]:w-full [&>div]:max-w-full">
          <Tweet id={tweetId} />
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-500">
          Invalid Tweet URL
        </div>
      )}
    </div>
  );
};

export const InstagramBlock: React.FC<BlockContentProps> = ({ block }) => {
  const embedUrl = getInstagramEmbedUrl(block.data.url);

  return (
    <div className="w-full h-full bg-white rounded-md overflow-hidden shadow-sm pointer-events-auto border border-zinc-200">
      {embedUrl ? (
        <iframe
          src={embedUrl}
          title="Instagram embed"
          className="w-full h-full"
          frameBorder="0"
          scrolling="no"
          allowTransparency={true}
          allow="encrypted-media; picture-in-picture"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 text-center text-zinc-500">
          <span className="text-sm font-medium">Invalid Instagram URL</span>
          {block.data.url && (
            <a
              href={block.data.url}
              target="_blank"
              rel="noreferrer"
              className="max-w-full truncate text-xs text-pink-600 underline"
            >
              {block.data.url}
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export const YoutubeBlock: React.FC<BlockContentProps> = ({ block }) => {
  const videoId = block.data.videoId;

  return (
    <div className="w-full h-full bg-black rounded-md overflow-hidden shadow-sm pointer-events-auto border border-zinc-800">
      {videoId ? (
        <iframe
          width="100%"
          height="100%"
          src={`https://www.youtube.com/embed/${videoId}`}
          title="YouTube video player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-500">
          Invalid YouTube URL
        </div>
      )}
    </div>
  );
};

export const VideoBlock: React.FC<BlockContentProps> = ({ block }) => {
  return (
    <div className="w-full h-full bg-black rounded-md overflow-hidden shadow-sm pointer-events-auto border border-zinc-800 flex items-center justify-center">
      {block.data.url ? (
        <video
          src={block.data.url}
          controls
          className="w-full h-full object-contain"
          controlsList="nodownload"
        />
      ) : (
        <div className="text-zinc-500">No Video</div>
      )}
    </div>
  );
};

export const SubstackBlock: React.FC<BlockContentProps> = ({ block }) => {
  const embedUrl = React.useMemo(() => getSubstackEmbedUrl(block.data.url), [block.data.url]);

  return (
    <div className="w-full h-full bg-white rounded-md overflow-hidden shadow-sm pointer-events-auto border border-zinc-200">
      {embedUrl ? (
        <iframe
          src={embedUrl}
          width="100%"
          height="100%"
          title="Substack embed"
          frameBorder="0"
          scrolling="no"
          sandbox="allow-scripts allow-same-origin allow-top-navigation allow-popups"
          allow="clipboard-read; clipboard-write"
          style={{ background: 'white' }}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 text-center text-zinc-500">
          <span className="text-sm font-medium">Invalid Substack URL</span>
          {block.data.url && (
            <a
              href={block.data.url}
              target="_blank"
              rel="noreferrer"
              className="max-w-full truncate text-xs text-orange-600 underline"
            >
              {block.data.url}
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export const MediumBlock: React.FC<BlockContentProps> = ({ block }) => {
  const [metadata, setMetadata] = useState<LinkMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(!block.data.fetched);
  const updateBlock = useBoardStore((state) => state.updateBlock);

  useEffect(() => {
    if (block.data.fetched) {
      setMetadata(block.data.metadata);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const fetchMeta = async () => {
      try {
        const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(block.data.url)}`);
        const json = await res.json();
        if (isMounted && json.status === 'success') {
          const meta = {
            title: json.data.title,
            description: json.data.description,
            image: json.data.image?.url,
            author: json.data.author,
            publisher: json.data.publisher,
            date: json.data.date
          };
          setMetadata(meta);
          updateBlock(block.id, { data: { ...block.data, fetched: true, metadata: meta } }, true);
        }
      } catch {
        // Metadata is optional; render the fallback card on failure.
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchMeta();
    return () => { isMounted = false; };
  }, [block.data, block.id, updateBlock]);

  return (
    <div className="w-full h-full bg-white border border-zinc-200 rounded-[12px] overflow-hidden font-sans flex flex-col shadow-sm">
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center bg-zinc-50">
          <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {metadata?.image && (
            <div className="w-full h-40 bg-zinc-100 flex-shrink-0 border-b border-zinc-100">
              <img src={metadata.image} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-4 flex flex-col flex-1 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center overflow-hidden">
                <span className="text-[10px] font-serif font-bold text-white">M</span>
              </div>
              <span className="text-xs text-zinc-600 font-medium">{metadata?.author || 'Medium'}</span>
            </div>
            <h3 className="font-bold text-zinc-900 text-[17px] leading-tight mb-1.5 line-clamp-2">{metadata?.title || 'Medium Article'}</h3>
            <p className="text-[13px] leading-snug text-zinc-500 line-clamp-3 mb-3">{metadata?.description}</p>
            <div className="mt-auto flex items-center justify-between text-[11px] text-zinc-400 font-medium uppercase tracking-wider">
              <span>{metadata?.date ? new Date(metadata.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Read on Medium'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const FigmaBlock: React.FC<BlockContentProps> = ({ block }) => {
  return (
    <div className="w-full h-full bg-zinc-900 rounded-md overflow-hidden shadow-sm pointer-events-auto border border-zinc-800">
      <iframe
        width="100%"
        height="100%"
        src={`https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(block.data.url)}`}
        allowFullScreen
      />
    </div>
  );
};

export const CodepenBlock: React.FC<BlockContentProps> = ({ block }) => {
  const embedUrl = block.data.url.replace('/pen/', '/embed/');
  return (
    <div className="w-full h-full bg-zinc-900 rounded-md overflow-hidden shadow-sm pointer-events-auto border border-zinc-800">
      <iframe
        width="100%"
        height="100%"
        src={`${embedUrl}?default-tab=result&theme-id=dark`}
        frameBorder="no"
        allowTransparency={true}
        allowFullScreen
      />
    </div>
  );
};

export const RedditBlock: React.FC<BlockContentProps> = ({ block }) => {
  const embedRef = useRef<HTMLDivElement>(null);
  const permalink = React.useMemo(() => getRedditPermalink(block.data.url), [block.data.url]);

  useEffect(() => {
    const container = embedRef.current;
    if (!container || !permalink) return;

    container.replaceChildren();

    const blockquote = document.createElement('blockquote');
    blockquote.className = 'reddit-embed-bq';
    blockquote.style.height = '500px';
    blockquote.style.margin = '0';

    const link = document.createElement('a');
    link.href = permalink;
    link.textContent = permalink;
    blockquote.appendChild(link);
    container.appendChild(blockquote);

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://embed.reddit.com/widgets.js';
    script.charset = 'UTF-8';
    container.appendChild(script);

    return () => {
      container.replaceChildren();
    };
  }, [permalink]);

  return (
    <div className="w-full h-full bg-white rounded-[10px] overflow-hidden shadow-sm pointer-events-auto border border-[#ff4500]/25">
      {permalink ? (
        <div
          ref={embedRef}
          className="w-full h-full overflow-y-auto [&_.reddit-embed-bq]:!m-0 [&_.reddit-embed-bq]:!max-w-none [&_.reddit-embed-bq]:!w-full [&_iframe]:!max-w-none [&_iframe]:!w-full"
        />
      ) : (
        <div className="w-full h-full bg-[#fff7f0] p-5 flex flex-col justify-between text-[#24110a]">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#ff4500]">
              Reddit
            </div>
            <h3 className="mt-3 text-xl font-black leading-tight">Invalid Reddit URL</h3>
          </div>
          {block.data.url && (
            <a
              href={block.data.url}
              target="_blank"
              rel="noreferrer"
              className="truncate text-xs text-[#8a3212] underline"
            >
              {block.data.url}
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export const WikipediaBlock: React.FC<BlockContentProps> = ({ block }) => {
  const [summary, setSummary] = useState<WikipediaSummaryData | null>(block.data.wikipediaSummary || null);
  const [isLoading, setIsLoading] = useState(!block.data.wikipediaSummary);
  const [hasError, setHasError] = useState(false);
  const updateBlock = useBoardStore((state) => state.updateBlock);

  useEffect(() => {
    if (block.data.wikipediaSummary) {
      setSummary(block.data.wikipediaSummary);
      setIsLoading(false);
      return;
    }

    const summaryTarget = getWikipediaSummaryUrl(block.data.url);
    if (!summaryTarget) {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const fetchSummary = async () => {
      setIsLoading(true);
      setHasError(false);
      try {
        const res = await fetch(summaryTarget.url);
        if (!res.ok) throw new Error('Wikipedia request failed');
        const json = await res.json();
        const nextSummary: WikipediaSummaryData = {
          title: json.title,
          extract: json.extract,
          description: json.description,
          image: json.thumbnail?.source,
          pageUrl: json.content_urls?.desktop?.page || block.data.url,
          language: summaryTarget.language,
        };

        if (isMounted) {
          setSummary(nextSummary);
          updateBlock(block.id, { data: { ...block.data, wikipediaSummary: nextSummary } }, true);
        }
      } catch {
        if (isMounted) setHasError(true);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchSummary();
    return () => { isMounted = false; };
  }, [block.data, block.id, updateBlock]);

  const displayUrl = summary?.pageUrl || block.data.url;
  const hasImage = Boolean(summary?.image);

  return (
    <a
      href={displayUrl}
      target="_blank"
      rel="noreferrer"
      className="group relative w-full h-full bg-[#f8f7f2] border border-stone-300 rounded-[10px] overflow-hidden shadow-sm pointer-events-auto flex flex-col text-stone-950"
    >
      <div className="absolute inset-y-0 left-0 w-1.5 bg-stone-950" />
      {summary?.image && (
        <div className="absolute right-0 top-0 h-full w-[40%] border-l border-stone-200 opacity-45 group-hover:opacity-85 transition-opacity duration-200">
          <img
            src={summary.image}
            alt=""
            className="w-full h-full object-cover saturate-[0.55] contrast-90 brightness-110 group-hover:saturate-100 group-hover:contrast-100 group-hover:brightness-100 transition-[filter] duration-200"
          />
        </div>
      )}

      {isLoading ? (
        <div className="relative flex-1 p-5 pl-6 flex flex-col gap-4">
          <div className="h-4 w-32 bg-stone-300 rounded-full animate-pulse" />
          <div className="space-y-2">
            <div className="h-7 w-4/5 bg-stone-300 rounded animate-pulse" />
            <div className="h-7 w-2/3 bg-stone-300 rounded animate-pulse" />
          </div>
          <div className="space-y-2 mt-2">
            <div className="h-3 w-full bg-stone-200 rounded animate-pulse" />
            <div className="h-3 w-11/12 bg-stone-200 rounded animate-pulse" />
            <div className="h-3 w-3/4 bg-stone-200 rounded animate-pulse" />
          </div>
        </div>
      ) : hasError ? (
        <div className="relative flex-1 p-5 pl-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-stone-500">
              <BookOpen className="w-3.5 h-3.5" />
              Wikipedia
            </div>
            <h3 className="mt-4 text-2xl font-serif font-bold leading-none">Could not load this article</h3>
          </div>
          <span className="text-xs text-stone-500 truncate">{block.data.url}</span>
        </div>
      ) : (
        <div className={clsx(
          "relative flex-1 p-5 pl-6 flex flex-col min-h-0",
          hasImage ? "w-[60%]" : "w-full"
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-stone-500">
                <BookOpen className="w-3.5 h-3.5" />
                Wikipedia
              </div>
              {summary?.description && (
                <p className="mt-2 text-xs font-bold uppercase tracking-wide text-stone-500 line-clamp-1">
                  {summary.description}
                </p>
              )}
            </div>
            {summary?.language && (
              <span className="shrink-0 border border-stone-400 bg-[#f8f7f2] px-2 py-1 text-[10px] font-black uppercase">
                {summary.language}
              </span>
            )}
          </div>

          <h3 className="mt-4 max-h-[3.9em] overflow-hidden pb-2 text-[25px] font-serif font-bold leading-[1.3] tracking-normal">
            {summary?.title || 'Wikipedia article'}
          </h3>
          <p className="mt-3 text-[14px] leading-snug text-stone-700 line-clamp-6">
            {summary?.extract || 'Open the article to read the full encyclopedia entry.'}
          </p>

          <div className="mt-auto pt-4 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.18em] text-stone-500">
            <span>Read article</span>
            <ArrowUpRight className="w-4 h-4" />
          </div>
        </div>
      )}
    </a>
  );
};

export const SmartCardBlock: React.FC<BlockContentProps & { platform: string }> = ({ block, platform }) => {
  const [metadata, setMetadata] = useState<LinkMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(!block.data.fetched);
  const updateBlock = useBoardStore((state) => state.updateBlock);

  useEffect(() => {
    if (block.data.fetched) {
      setMetadata(block.data.metadata);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const fetchMeta = async () => {
      try {
        const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(block.data.url)}`);
        const json = await res.json();
        if (isMounted && json.status === 'success') {
          const meta = {
            title: json.data.title,
            description: json.data.description,
            image: json.data.image?.url,
            logo: json.data.logo?.url,
            publisher: json.data.publisher,
          };
          setMetadata(meta);
          updateBlock(block.id, { data: { ...block.data, fetched: true, metadata: meta } }, true);
        }
      } catch {
        // Metadata is optional; render the fallback card on failure.
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchMeta();
    return () => { isMounted = false; };
  }, [block.data, block.id, updateBlock]);

  const isDark = platform === 'github' || platform === 'codepen' || platform === 'reddit';
  
  return (
    <div className={clsx(
      "w-full h-full border rounded-[12px] overflow-hidden font-sans flex flex-col shadow-sm",
      isDark ? "bg-zinc-900 border-zinc-800 text-zinc-100" : "bg-white border-zinc-200 text-zinc-900"
    )}>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className={clsx("w-6 h-6 border-2 rounded-full animate-spin", isDark ? "border-zinc-800 border-t-zinc-400" : "border-zinc-200 border-t-zinc-800")} />
        </div>
      ) : (
        <>
          {metadata?.image && platform !== 'github' && (
            <div className={clsx("w-full h-32 flex-shrink-0 border-b", isDark ? "bg-zinc-800 border-zinc-800" : "bg-zinc-100 border-zinc-100")}>
              <img src={metadata.image} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-4 flex flex-col flex-1">
            <div className="flex items-center gap-2 mb-2">
              {metadata?.logo && (
                <img src={metadata.logo} alt="" className="w-4 h-4 rounded-sm" />
              )}
              <span className={clsx("text-xs font-medium", isDark ? "text-zinc-400" : "text-zinc-600")}>{metadata?.publisher || platform}</span>
            </div>
            <h3 className="font-bold text-[15px] leading-tight mb-1.5 line-clamp-2">{metadata?.title || 'Link'}</h3>
            <p className={clsx("text-[13px] leading-snug line-clamp-3 mb-3", isDark ? "text-zinc-400" : "text-zinc-500")}>{metadata?.description}</p>
            <div className={clsx("mt-auto flex items-center justify-between text-[11px] font-medium uppercase tracking-wider", isDark ? "text-zinc-500" : "text-zinc-400")}>
              <span className="truncate max-w-[80%]">{block.data.url.replace(/^https?:\/\//, '')}</span>
              <ArrowUpRight className="w-3.5 h-3.5 flex-shrink-0" />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const TiktokBlock: React.FC<BlockContentProps> = ({ block }) => {
  const match = block.data.url.match(/video\/(\d+)/);
  const videoId = match ? match[1] : null;

  return (
    <div className="w-full h-full bg-black rounded-md overflow-hidden shadow-sm pointer-events-auto border border-zinc-800">
      {videoId ? (
        <iframe
          src={`https://www.tiktok.com/embed/v2/${videoId}`}
          className="w-full h-full"
          frameBorder="0"
          allow="encrypted-media;"
          allowFullScreen
        ></iframe>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-500">
          Invalid TikTok URL
        </div>
      )}
    </div>
  );
};

export const PdfBlock: React.FC<BlockContentProps> = ({ block }) => {
  return (
    <div className="w-full h-full bg-zinc-100 rounded-md overflow-hidden shadow-sm pointer-events-auto border border-zinc-200 flex flex-col">
      <div className="h-8 bg-zinc-800 border-b border-zinc-900 flex items-center px-3 flex-shrink-0">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] border border-[#e0443e]/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] border border-[#dea123]/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f] border border-[#1aab29]/50" />
        </div>
        <div className="ml-3 text-xs font-medium text-zinc-400 truncate">
          PDF Document
        </div>
      </div>
      <iframe
        src={`${block.data.url}#toolbar=0&navpanes=0`}
        className="w-full flex-1"
        frameBorder="0"
      />
    </div>
  );
};

export const FrameBlock: React.FC<BlockContentProps> = ({ block }) => {
  const isSelected = useBoardStore((state) => state.selection.includes(block.id));
  const updateBlock = useBoardStore((state) => state.updateBlock);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(block.data.title || 'Frame');
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingTitle) {
      requestAnimationFrame(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      });
    }
  }, [isEditingTitle]);

  const commitTitle = useCallback(() => {
    const nextTitle = draftTitle.trim() || 'Frame';
    updateBlock(block.id, {
      data: {
        ...block.data,
        title: nextTitle,
      }
    });
    setIsEditingTitle(false);
  }, [block.id, block.data, draftTitle, updateBlock]);
  
  return (
    <div 
      className={clsx(
        "w-full h-full border-2 transition-colors duration-200 pointer-events-none",
        isSelected ? "border-[#6c5cff]" : "border-zinc-300"
      )}
      style={{ 
        backgroundColor: 'transparent'
      }}
    >
      <div
        className="absolute top-0 left-0 -translate-y-full px-2 py-1 bg-white border border-zinc-200 rounded-t-md text-xs font-medium text-zinc-600 pointer-events-auto"
        onDoubleClick={(e) => {
          e.stopPropagation();
          setDraftTitle(block.data.title || 'Frame');
          setIsEditingTitle(true);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitTitle}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                commitTitle();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setDraftTitle(block.data.title || 'Frame');
                setIsEditingTitle(false);
              }
            }}
            className="min-w-36 bg-transparent text-xs font-medium text-zinc-600 outline-none"
          />
        ) : (
          block.data.title || 'Frame'
        )}
      </div>
    </div>
  );
};

export const BlockRenderer: React.FC<BlockContentProps> = ({ block }) => {
  switch (block.type) {
    case 'frame': return <FrameBlock block={block} />;
    case 'sticky': return <StickyBlock block={block} />;
    case 'text': return <TextBlock block={block} />;
    case 'shape': return <ShapeBlock block={block} />;
    case 'drawing': return <DrawingBlock block={block} />;
    case 'image': return <ImageBlock block={block} />;
    case 'link': return <LinkBlock block={block} />;
    case 'audio': return <AudioBlock block={block} />;
    case 'instagram': return <InstagramBlock block={block} />;
    case 'x': return <XBlock block={block} />;
    case 'youtube': return <YoutubeBlock block={block} />;
    case 'video': return <VideoBlock block={block} />;
    case 'substack': return <SubstackBlock block={block} />;
    case 'medium': return <MediumBlock block={block} />;
    case 'figma': return <FigmaBlock block={block} />;
    case 'codepen': return <CodepenBlock block={block} />;
    case 'github': return <SmartCardBlock block={block} platform="github" />;
    case 'wikipedia': return <WikipediaBlock block={block} />;
    case 'reddit': return <RedditBlock block={block} />;
    case 'arena': return <SmartCardBlock block={block} platform="are.na" />;
    case 'tiktok': return <TiktokBlock block={block} />;
    case 'pdf': return <PdfBlock block={block} />;
    default: return <div className="p-4 bg-red-50 text-red-500">Unknown block type</div>;
  }
};
