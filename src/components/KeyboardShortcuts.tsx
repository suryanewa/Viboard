import React, { useEffect } from 'react';
import { useBoardStore } from '../store';

export const KeyboardShortcuts: React.FC = () => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;

      console.log('[KeyboardShortcuts] key:', e.key, 'activeElement:', document.activeElement?.tagName, 'contentEditable:', (document.activeElement as HTMLElement)?.isContentEditable);

      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        console.log('[KeyboardShortcuts] Returning early due to activeElement');
        return;
      }

      const { selection, drawingSelection, blocks, removeBlocks, removeDrawings, setSelection, setDrawingSelection, updateBlocks, copy, cut, paste, duplicate, undo, redo } = useBoardStore.getState();
      console.log('[KeyboardShortcuts] selection:', selection, 'drawingSelection:', drawingSelection);

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selection.length > 0) {
          removeBlocks(selection);
        }
        if (drawingSelection.length > 0) {
          removeDrawings(drawingSelection);
        }
      } else if (e.key === 'Escape') {
        setSelection([]);
        setDrawingSelection([]);
      } else if (e.key === 'a' && isCmd) {
        e.preventDefault();
        setSelection(Object.keys(blocks));
        setDrawingSelection(useBoardStore.getState().drawings.map(d => d.id));
      } else if (e.key === 'c' && isCmd) {
        copy();
      } else if (e.key === 'x' && isCmd) {
        cut();
      } else if (e.key === 'v' && isCmd) {
        paste();
      } else if (e.key === 'd' && isCmd) {
        e.preventDefault();
        duplicate(selection);
      } else if (e.key === 'z' && isCmd) {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (e.key === 'y' && isCmd) {
        redo();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (selection.length > 0) {
          e.preventDefault();
          const amount = e.shiftKey ? 12 : 1;
          const updates = selection.map(id => {
            const block = blocks[id];
            return {
              id,
              updates: {
                x: block.x + (e.key === 'ArrowRight' ? amount : e.key === 'ArrowLeft' ? -amount : 0),
                y: block.y + (e.key === 'ArrowDown' ? amount : e.key === 'ArrowUp' ? -amount : 0),
              }
            };
          });
          updateBlocks(updates);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return null;
};
