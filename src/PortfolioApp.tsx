import { memo, useEffect, useMemo, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Canvas } from './components/Canvas';
import { BlockShell } from './components/BlockShell';
import { BlockRenderer } from './components/Blocks';
import { Toolbar } from './components/Toolbar';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { ContextMenu } from './components/ContextMenu';
import { PropertyToolbar } from './components/PropertyToolbar';
import { BlockErrorBoundary } from './components/ErrorBoundaries';
import { useBoardStore } from './store';
import { syncAllBlocks } from './lib/blockSearch';
import { getVisibleBlocks } from './lib/visibleBlocks';
import type { Block, DrawingPath, Viewport } from './types';

type BoardSnapshot = {
  version: 1;
  title: string;
  blocks: Record<string, Block>;
  drawings?: DrawingPath[];
  viewport?: Partial<Viewport>;
  history?: unknown;
};

const ATLAS_BOARD_URL = '/atlas/Atlas.json';

const BoardBlock = memo(({ block }: { block: Block }) => (
  <BlockShell block={block}>
    <BlockErrorBoundary block={block}>
      <BlockRenderer block={block} />
    </BlockErrorBoundary>
  </BlockShell>
));
BoardBlock.displayName = 'BoardBlock';

const applySnapshot = (snapshot: BoardSnapshot) => {
  const viewport = snapshot.viewport ?? {};

  useBoardStore.setState({
    blocks: snapshot.blocks || {},
    drawings: Array.isArray(snapshot.drawings) ? snapshot.drawings : [],
    selection: [],
    drawingSelection: [],
    canvasTitle: snapshot.title || 'Atlas',
    viewport: {
      x: typeof viewport.x === 'number' ? viewport.x : 0,
      y: typeof viewport.y === 'number' ? viewport.y : 0,
      zoom: typeof viewport.zoom === 'number' ? viewport.zoom : 1,
    },
    history: { past: [], future: [] },
    mode: 'edit',
    tool: 'select',
  });

  void syncAllBlocks(snapshot.blocks || {});
};

function PortfolioBoard() {
  const blocks = useBoardStore((state) => state.blocks);
  const viewport = useBoardStore((state) => state.viewport);
  const selection = useBoardStore((state) => state.selection);
  const mode = useBoardStore((state) => state.mode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(ATLAS_BOARD_URL, { signal: controller.signal, cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load Atlas board (${response.status}).`);
        }
        return response.json() as Promise<BoardSnapshot>;
      })
      .then((snapshot) => {
        if (controller.signal.aborted) return;
        applySnapshot(snapshot);
        setIsLoading(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : 'Could not load Atlas board.');
        setIsLoading(false);
      });

    return () => controller.abort();
  }, []);

  const renderedBlocks = useMemo(
    () => getVisibleBlocks(blocks, viewport, selection),
    [blocks, viewport, selection],
  );

  return (
    <motion.div
      className="relative w-screen h-screen overflow-hidden bg-zinc-50"
      initial={{ opacity: 0, scale: 1.02 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <KeyboardShortcuts />
      <ContextMenu />
      <Canvas>
        <AnimatePresence initial={false}>
          {renderedBlocks.map((block) => (
            <BoardBlock key={block.id} block={block} />
          ))}
        </AnimatePresence>
      </Canvas>
      <Toolbar />
      {mode === 'edit' && <PropertyToolbar />}

      <AnimatePresence>
        {(isLoading || loadError) && (
          <motion.div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-zinc-50"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
              {loadError ?? 'Loading Atlas...'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function PortfolioApp() {
  return (
    <BrowserRouter>
      <PortfolioBoard />
    </BrowserRouter>
  );
}
