import { useEffect, useState } from 'react';
import { Canvas } from '../components/Canvas';
import { BlockShell } from '../components/BlockShell';
import { BlockRenderer } from '../components/Blocks';
import { Toolbar } from '../components/Toolbar';
import { KeyboardShortcuts } from '../components/KeyboardShortcuts';
import { ContextMenu } from '../components/ContextMenu';
import { PropertyToolbar } from '../components/PropertyToolbar';
import { useBoardStore } from '../store';
import { initializeCollection, syncAllBlocks } from '../lib/typesense';
import { AnimatePresence, motion } from 'framer-motion';
import { UploadCloud } from 'lucide-react';

function Board() {
  const blocks = useBoardStore((state) => state.blocks);
  const mode = useBoardStore((state) => state.mode);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  useEffect(() => {
    const syncInitialBlocks = async () => {
      await initializeCollection();
      syncAllBlocks(blocks);
    };
    syncInitialBlocks();
  }, [blocks]);

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDraggingOver(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.clientX === 0 || e.clientY === 0) {
        setIsDraggingOver(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);

      const files = Array.from(e.dataTransfer?.files || []);
      files.forEach((file) => {
        if (!file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          const url = event.target?.result as string;
          if ((window as any).__handleAddBlock) {
            (window as any).__handleAddBlock('image', { url });
          }
        };
        reader.readAsDataURL(file);
      });
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-zinc-50">
      <AnimatePresence>
        {isDraggingOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-blue-500/10 backdrop-blur-sm pointer-events-none border-4 border-dashed border-blue-500/50 m-4 rounded-3xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              className="flex flex-col items-center gap-4 p-8 bg-white rounded-2xl shadow-xl border border-blue-100"
            >
              <div className="p-4 bg-blue-50 rounded-full text-blue-500">
                <UploadCloud className="w-10 h-10" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-zinc-900">Drop files to upload</h3>
                <p className="text-sm text-zinc-500 mt-1">Images will be added to your canvas</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <KeyboardShortcuts />
      <ContextMenu />
      <Canvas>
        {Object.values(blocks).map((block) => (
          <BlockShell key={block.id} block={block}>
            <BlockRenderer block={block} />
          </BlockShell>
        ))}
      </Canvas>
      <Toolbar />
      {mode === 'edit' && <PropertyToolbar />}
    </div>
  );
}

export default Board;