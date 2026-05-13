import React, { useEffect } from 'react';
import { useBoardStore } from '../store';
import {
  alignSelection,
  applyTextCommand,
  copySelectionAsPng,
  deleteSelection,
  distributeSelection,
  exportBoard,
  flipSelection,
  groupSelection,
  selectInverse,
  setZoomCentered,
  tidySelection,
  ungroupSelection,
  zoomToFit,
} from '../lib/boardCommands';

const isEditableTarget = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable);

export const KeyboardShortcuts: React.FC = () => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const isCmd = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();
      const state = useBoardStore.getState();
      const {
        selection,
        blocks,
        drawings,
        setSelection,
        setDrawingSelection,
        updateBlocks,
        copy,
        paste,
        duplicate,
        undo,
        redo,
        bringToFront,
        bringForward,
        sendBackward,
        sendToBack,
        setIsSearchOpen,
        viewport,
      } = state;

      if ((e.key === 'Backspace' || e.key === 'Delete') && isCmd) {
        e.preventDefault();
        ungroupSelection();
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        deleteSelection();
        return;
      }

      if (e.key === 'Escape') {
        setSelection([]);
        setDrawingSelection([]);
        return;
      }

      if (isCmd && e.shiftKey && key === 'e') {
        e.preventDefault();
        void exportBoard('png');
        return;
      }

      if (isCmd && e.shiftKey && key === 'c') {
        e.preventDefault();
        void copySelectionAsPng();
        return;
      }

      if (isCmd && e.shiftKey && key === 'a') {
        e.preventDefault();
        selectInverse();
        return;
      }

      if (isCmd && key === 'a') {
        e.preventDefault();
        setSelection(Object.keys(blocks));
        setDrawingSelection(drawings.map((drawing) => drawing.id));
        return;
      }

      if (isCmd && key === 'c') {
        e.preventDefault();
        copy();
        return;
      }

      if (isCmd && key === 'v') {
        e.preventDefault();
        paste();
        return;
      }

      if (isCmd && key === 'd') {
        e.preventDefault();
        duplicate(selection);
        return;
      }

      if (isCmd && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      if (isCmd && key === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (isCmd && (key === 'f' || key === 'k')) {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      if (isCmd && key === 'g') {
        e.preventDefault();
        groupSelection();
        return;
      }

      if (isCmd && key === 'b') {
        e.preventDefault();
        applyTextCommand('bold');
        return;
      }

      if (isCmd && key === 'i') {
        e.preventDefault();
        applyTextCommand('italic');
        return;
      }

      if (isCmd && e.shiftKey && key === 'u') {
        e.preventDefault();
        applyTextCommand('link');
        return;
      }

      if (isCmd && key === 'u') {
        e.preventDefault();
        applyTextCommand('underline');
        return;
      }

      if (isCmd && e.shiftKey && key === 'x') {
        e.preventDefault();
        applyTextCommand('strikethrough');
        return;
      }

      if (isCmd && e.shiftKey && e.key === '8') {
        e.preventDefault();
        applyTextCommand('bulletedList');
        return;
      }

      if (isCmd && e.shiftKey && e.key === '7') {
        e.preventDefault();
        applyTextCommand('numberedList');
        return;
      }

      if (isCmd && e.altKey && key === 'l') {
        e.preventDefault();
        applyTextCommand('alignLeft');
        return;
      }

      if (isCmd && e.altKey && key === 't') {
        e.preventDefault();
        applyTextCommand('alignCenter');
        return;
      }

      if (isCmd && e.altKey && key === 'r') {
        e.preventDefault();
        applyTextCommand('alignRight');
        return;
      }

      if (isCmd && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setZoomCentered(viewport.zoom + 0.1);
        return;
      }

      if (isCmd && e.key === '-') {
        e.preventDefault();
        setZoomCentered(viewport.zoom - 0.1);
        return;
      }

      if (isCmd && e.key === '0') {
        e.preventDefault();
        setZoomCentered(1);
        return;
      }

      if (e.shiftKey && e.key === '1') {
        e.preventDefault();
        zoomToFit();
        return;
      }

      if (e.shiftKey && e.key === '2') {
        e.preventDefault();
        zoomToFit(selection);
        return;
      }

      if (e.altKey && !isCmd && !e.ctrlKey) {
        const arrangeMap: Record<string, () => void> = {
          a: () => alignSelection('left'),
          h: () => alignSelection('centerH'),
          d: () => alignSelection('right'),
          w: () => alignSelection('top'),
          v: () => alignSelection('centerV'),
          s: () => alignSelection('bottom'),
        };
        if (arrangeMap[key]) {
          e.preventDefault();
          arrangeMap[key]();
          return;
        }
      }

      if (e.ctrlKey && e.altKey && key === 't') {
        e.preventDefault();
        tidySelection();
        return;
      }

      if (e.ctrlKey && e.altKey && key === 'h') {
        e.preventDefault();
        distributeSelection('horizontal');
        return;
      }

      if (e.ctrlKey && e.altKey && key === 'v') {
        e.preventDefault();
        distributeSelection('vertical');
        return;
      }

      if (e.shiftKey && !isCmd && key === 'h') {
        e.preventDefault();
        flipSelection('horizontal');
        return;
      }

      if (e.shiftKey && !isCmd && key === 'v') {
        e.preventDefault();
        flipSelection('vertical');
        return;
      }

      if (!isCmd && e.key === ']') {
        e.preventDefault();
        selection.forEach((id) => bringToFront(id));
        return;
      }

      if (isCmd && e.key === ']') {
        e.preventDefault();
        selection.forEach((id) => bringForward(id));
        return;
      }

      if (isCmd && e.key === '[') {
        e.preventDefault();
        selection.forEach((id) => sendBackward(id));
        return;
      }

      if (!isCmd && e.key === '[') {
        e.preventDefault();
        selection.forEach((id) => sendToBack(id));
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (selection.length > 0) {
          e.preventDefault();
          const amount = e.shiftKey ? 12 : 1;
          const updates = selection.map((id) => {
            const block = blocks[id];
            return {
              id,
              updates: {
                x: block.x + (e.key === 'ArrowRight' ? amount : e.key === 'ArrowLeft' ? -amount : 0),
                y: block.y + (e.key === 'ArrowDown' ? amount : e.key === 'ArrowUp' ? -amount : 0),
              },
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
