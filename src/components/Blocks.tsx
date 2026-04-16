import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { Block, DrawingPath } from '../types';
import { useBoardStore } from '../store';
import clsx from 'clsx';

interface BlockContentProps {
  block: Block;
}

export const StickyBlock: React.FC<BlockContentProps> = ({ block }) => {
  const textRef = useRef<HTMLParagraphElement>(null);
  const updateBlock = useBoardStore((state) => state.updateBlock);
  const hasFocused = useRef(false);

  const setRef = (el: HTMLParagraphElement | null) => {
    textRef.current = el;
    if (el && !hasFocused.current) {
      hasFocused.current = true;
      requestAnimationFrame(() => {
        el.focus();
      });
    }
  };

  const handleInput = (e: React.FormEvent<HTMLParagraphElement>) => {
    const el = e.currentTarget;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const handleBlur = () => {
    if (textRef.current) {
      updateBlock(block.id, { data: { ...block.data, text: textRef.current.innerText } });
    }
    window.getSelection()?.removeAllRanges();
  };

  const hue = block.data.hue !== undefined ? block.data.hue : (block.data.color === 'yellow' ? 55 : 55);
  const bgColor = `hsl(${hue}, 90%, 85%)`;

  return (
    <div 
      className="w-full min-h-full p-6 flex flex-col shadow-none"
      style={{ backgroundColor: bgColor }}
    >
      <p
        ref={setRef}
        className="text-zinc-800 font-medium text-lg leading-relaxed outline-none"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleBlur}
        style={{ minHeight: '1.5em' }}
      >
        {block.data.text}
      </p>
    </div>
  );
};

export const TextBlock: React.FC<BlockContentProps> = ({ block }) => {
  const textRef = useRef<HTMLParagraphElement>(null);
  const updateBlock = useBoardStore((state) => state.updateBlock);

  const handleInput = () => {
    const el = textRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      updateBlock(block.id, { data: { ...block.data, text: el.innerText } });
    }
  };

  return (
    <div className="w-full min-h-full p-2 bg-transparent flex flex-col">
      <p
        ref={textRef}
        className="text-zinc-800 font-sans text-xl outline-none"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        style={{ minHeight: '1.5em' }}
      >
        {block.data.text}
      </p>
    </div>
  );
};

export const ShapeBlock: React.FC<BlockContentProps> = ({ block }) => {
  const isSelected = useBoardStore((state) => state.selection.includes(block.id));
  const shape = block.data.shape || 'square';
  return (
    <div 
      className={clsx(
        "w-full h-full border-2 transition-colors duration-200",
        shape === 'circle' ? "rounded-full" : "rounded-sm",
        isSelected ? "border-blue-500" : "border-[#ff6b6b]"
      )}
      style={{ 
        backgroundColor: `${block.data.color || '#ff6b6b'}33` 
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
  const [aspectRatio, setAspectRatio] = useState<{ width: number; height: number } | null>(null);

  const calculateAspectRatio = useCallback((naturalWidth: number, naturalHeight: number) => {
    const originalAspect = naturalWidth / naturalHeight;
    const ratios = [
      { name: '2:1', value: 2 },
      { name: '1:1', value: 1 },
      { name: '1:2', value: 0.5 }
    ];

    const closest = ratios.reduce((prev, curr) => 
      Math.abs(curr.value - originalAspect) < Math.abs(prev.value - originalAspect) ? curr : prev
    );

    const baseSize = 240;
    if (closest.name === '2:1') {
      return { width: baseSize * 2, height: baseSize };
    } else if (closest.name === '1:2') {
      return { width: baseSize, height: baseSize * 2 };
    }
    return { width: baseSize, height: baseSize };
  }, []);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (!img.naturalWidth || !img.naturalHeight) return;
    
    const newDims = calculateAspectRatio(img.naturalWidth, img.naturalHeight);
    setAspectRatio(newDims);
    
    if (block.width !== newDims.width || block.height !== newDims.height) {
      updateBlock(block.id, { width: newDims.width, height: newDims.height });
    }
  }, [block.id, block.width, block.height, updateBlock, calculateAspectRatio]);

  useEffect(() => {
    if (aspectRatio && (block.width !== aspectRatio.width || block.height !== aspectRatio.height)) {
      updateBlock(block.id, { width: aspectRatio.width, height: aspectRatio.height });
    }
  }, [aspectRatio, block.id, block.width, block.height, updateBlock]);

  return (
    <div className="w-full h-full bg-white flex items-center justify-center overflow-hidden">
      {block.data.url ? (
        <img
          src={block.data.url}
          alt={block.data.alt || "User content"}
          title="User content"
          className="w-full h-full object-cover"
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
  } catch (e) {
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
      } catch (err) {
        if (isMounted) setPreviewState('error');
      }
    };

    fetchPreview();
    return () => { isMounted = false; };
  }, [block.data.url]);

  return (
    <div className="w-full h-full flex flex-col bg-white border border-zinc-200 overflow-hidden pointer-events-none">
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

export const BlockRenderer: React.FC<BlockContentProps> = ({ block }) => {
  switch (block.type) {
    case 'sticky': return <StickyBlock block={block} />;
    case 'text': return <TextBlock block={block} />;
    case 'shape': return <ShapeBlock block={block} />;
    case 'drawing': return <DrawingBlock block={block} />;
    case 'image': return <ImageBlock block={block} />;
    case 'link': return <LinkBlock block={block} />;
    default: return <div className="p-4 bg-red-50 text-red-500">Unknown block type</div>;
  }
};
