import React, { useRef, useEffect, useCallback, useState } from 'react';
import { motion, useMotionValue, useTransform, useMotionTemplate, AnimatePresence } from 'framer-motion';
import { useBoardStore, VIBOARD_CLIPBOARD_MIME, VIBOARD_CLIPBOARD_TEXT } from '../store';
import { v4 as uuidv4 } from 'uuid';
import { getTextBlockHeight } from '../lib/textBlockMetrics';
import { createUrlBlock } from '../lib/urlBlocks';
import type { Viewport } from '../types';

export const Canvas: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const containerRef = useRef<HTMLButtonElement>(null);
  const viewport = useBoardStore((state) => state.viewport);
  const gridView = useBoardStore((state) => state.gridView);
  const blocks = useBoardStore((state) => state.blocks);
  const setMousePos = useBoardStore((state) => state.setMousePos);
  const tool = useBoardStore((state) => state.tool);
  const currentPath = useBoardStore((state) => state.currentPath);
  const activeShape = useBoardStore((state) => state.activeShape);
  const drawings = useBoardStore((state) => state.drawings);
  const drawingSelection = useBoardStore((state) => state.drawingSelection);
  const historyAnimationKey = useBoardStore((state) => state.historyAnimationKey);
  const snapLines = useBoardStore((state) => state.snapLines);
  const setCurrentPath = useBoardStore((state) => state.setCurrentPath);
  const setActiveShape = useBoardStore((state) => state.setActiveShape);
  const setSelection = useBoardStore((state) => state.setSelection);
  const setDrawingSelection = useBoardStore((state) => state.setDrawingSelection);
  const addDrawing = useBoardStore((state) => state.addDrawing);
  const updateDrawings = useBoardStore((state) => state.updateDrawings);
  const addBlock = useBoardStore((state) => state.addBlock);

  const isPanning = useRef(false);
  const [isGrabbing, setIsGrabbing] = useState(false);
  const [marquee, setMarquee] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
  const isMarquee = useRef(false);
  const initialSelection = useRef<string[]>([]);
  const initialDrawingSelection = useRef<string[]>([]);
  const isDrawing = useRef(false);
  const isCreatingShape = useRef(false);
  const isCreatingFrame = useRef(false);
  const [activeFrame, setActiveFrame] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
  const isDraggingDrawing = useRef(false);
  const isErasing = useRef(false);
  const hasPushedEraserHistory = useRef(false);
  const liveCommittedDrawingIds = useRef(new Set<string>());

  const markerType = useBoardStore((state) => state.markerType);
  const markerColor = useBoardStore((state) => state.markerColor);
  const markerThickness = useBoardStore((state) => state.markerThickness);
  const shapeHue = useBoardStore((state) => state.shapeHue);
  const removeDrawings = useBoardStore((state) => state.removeDrawings);

  const markerCursor = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23333' d='M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'/%3E%3C/svg%3E") 0 24, auto`;
  const eraserCursor = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23333' d='M20 20H7L3 16a1 1 0 0 1 0-1.41l9.59-9.59a2 2 0 0 1 2.82 0l5.17 5.17a2 2 0 0 1 0 2.83L14 19.83'/%3E%3Cpath fill='none' stroke='%23333' stroke-width='2' d='M6.5 13.5L12 8'/%3E%3C/svg%3E") 0 24, auto`;

  const stickyCursor = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' fill='white' stroke='%23333' stroke-width='2'/%3E%3C/svg%3E") 12 12, auto`;

  const cursorStyle = tool === 'marker' 
    ? (markerType === 'eraser' ? eraserCursor : markerCursor)
    : tool === 'pan' 
      ? (isGrabbing ? 'grabbing' : 'grab')
      : tool === 'sticky'
        ? stickyCursor
        : tool === 'select' ? 'default'
        : tool === 'text' ? 'text'
        : 'crosshair';
  const lastDragPos = useRef({ x: 0, y: 0 });
  const shiftHeldRef = useRef(false);
  const viewportRef = useRef<Viewport>(viewport);
  const viewportStoreFrame = useRef<number | null>(null);

  const captureCanvasPointer = (e: React.PointerEvent) => {
    const target = e.currentTarget;
    if (!target.hasPointerCapture(e.pointerId)) {
      target.setPointerCapture(e.pointerId);
    }
  };

  const releaseCanvasPointer = (e: React.PointerEvent) => {
    const target = e.currentTarget;
    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeldRef.current = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeldRef.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const mxRaw = useMotionValue(viewport.x);
  const myRaw = useMotionValue(viewport.y);
  const mZoomRaw = useMotionValue(viewport.zoom);

  const publishViewport = useCallback((nextViewport: Viewport) => {
    viewportRef.current = nextViewport;
    mxRaw.set(nextViewport.x);
    myRaw.set(nextViewport.y);
    mZoomRaw.set(nextViewport.zoom);

    if (viewportStoreFrame.current !== null) return;

    viewportStoreFrame.current = window.requestAnimationFrame(() => {
      viewportStoreFrame.current = null;

      const latestViewport = viewportRef.current;
      const storeViewport = useBoardStore.getState().viewport;
      if (
        storeViewport.x !== latestViewport.x ||
        storeViewport.y !== latestViewport.y ||
        storeViewport.zoom !== latestViewport.zoom
      ) {
        useBoardStore.getState().setViewport(latestViewport);
      }
    });
  }, [mZoomRaw, mxRaw, myRaw]);

  const flushViewport = useCallback(() => {
    if (viewportStoreFrame.current !== null) {
      window.cancelAnimationFrame(viewportStoreFrame.current);
      viewportStoreFrame.current = null;
    }

    const latestViewport = viewportRef.current;
    const storeViewport = useBoardStore.getState().viewport;
    if (
      storeViewport.x !== latestViewport.x ||
      storeViewport.y !== latestViewport.y ||
      storeViewport.zoom !== latestViewport.zoom
    ) {
      useBoardStore.getState().setViewport(latestViewport);
    }
  }, []);

  useEffect(() => {
    if (
      viewportRef.current.x === viewport.x &&
      viewportRef.current.y === viewport.y &&
      viewportRef.current.zoom === viewport.zoom
    ) {
      return;
    }

    viewportRef.current = viewport;
    mxRaw.set(viewport.x);
    myRaw.set(viewport.y);
    mZoomRaw.set(viewport.zoom);
  }, [viewport, viewport.x, viewport.y, viewport.zoom, mxRaw, myRaw, mZoomRaw]);

  useEffect(() => {
    return () => {
      if (viewportStoreFrame.current !== null) {
        window.cancelAnimationFrame(viewportStoreFrame.current);
      }
    };
  }, []);

  const bgSize = useTransform(mZoomRaw, (z) => `${24 * z}px ${24 * z}px`);
  const dotSize = useTransform(mZoomRaw, (z) => `${24 * z}px ${24 * z}px`);
  const bgPos = useMotionTemplate`${mxRaw}px ${myRaw}px`;
  const transform = useMotionTemplate`translate(${mxRaw}px, ${myRaw}px) scale(${mZoomRaw})`;

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const isInput = document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        (document.activeElement as HTMLElement)?.isContentEditable;
      if (isInput) return;

      e.preventDefault();
      const { viewport, mousePos, blocks, addBlock, setSelection, paste } = useBoardStore.getState();

      const targetX = mousePos.x !== 0 || mousePos.y !== 0
        ? mousePos.x
        : -viewport.x / viewport.zoom + window.innerWidth / 2 / viewport.zoom;
      const targetY = mousePos.x !== 0 || mousePos.y !== 0
        ? mousePos.y
        : -viewport.y / viewport.zoom + window.innerHeight / 2 / viewport.zoom;

      const highestZ = Math.max(0, ...Object.values(blocks).map((b) => b.zIndex));
      const clipboardTypes = Array.from(e.clipboardData?.types ?? []);
      const text = e.clipboardData?.getData('text/plain');

      if (clipboardTypes.includes(VIBOARD_CLIPBOARD_MIME) || text === VIBOARD_CLIPBOARD_TEXT) {
        paste(targetX, targetY);
        return;
      }

      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        const videoFiles = Array.from(files).filter(f => f.type.startsWith('video/'));
        const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
        
        if (imageFiles.length > 0) {
          const newSelection: string[] = [];
          imageFiles.forEach((file, i) => {
            const reader = new FileReader();
            reader.onload = () => {
              const id = uuidv4();
              addBlock({
                id,
                type: 'image',
                x: targetX - 120 + i * 20,
                y: targetY - 120 + i * 20,
                width: 240,
                height: 240,
                zIndex: highestZ + 1 + i,
                data: { url: reader.result as string, autoSizeOnLoad: true }
              });
              newSelection.push(id);
              if (newSelection.length === imageFiles.length) {
                setSelection(newSelection);
              }
            };
            reader.readAsDataURL(file);
          });
          return;
        }

        if (videoFiles.length > 0) {
          const newSelection: string[] = [];
          videoFiles.forEach((file, i) => {
            const url = URL.createObjectURL(file);
            const id = uuidv4();
            addBlock({
              id,
              type: 'video',
              x: targetX - 240 + i * 20,
              y: targetY - 135 + i * 20,
              width: 480,
              height: 270,
              zIndex: highestZ + 1 + i,
              data: { url }
            });
            newSelection.push(id);
            if (newSelection.length === videoFiles.length) {
              setSelection(newSelection);
            }
          });
          return;
        }

        if (pdfFiles.length > 0) {
          const newSelection: string[] = [];
          pdfFiles.forEach((file, i) => {
            const url = URL.createObjectURL(file);
            const id = uuidv4();
            addBlock({
              id,
              type: 'pdf',
              x: targetX - 300 + i * 20,
              y: targetY - 400 + i * 20,
              width: 600,
              height: 800,
              zIndex: highestZ + 1 + i,
              data: { url }
            });
            newSelection.push(id);
            if (newSelection.length === pdfFiles.length) {
              setSelection(newSelection);
            }
          });
          return;
        }

        return;
      }

      if (text?.trim()) {
        const lines = text.split('\n').filter(line => line.trim() !== '');
        const newSelection: string[] = [];

        lines.forEach((line, i) => {
          const id = uuidv4();
          const block = createUrlBlock({
            id,
            url: line,
            centerX: targetX,
            centerY: targetY,
            zIndex: highestZ + 1 + i,
            offsetIndex: i,
          });
          if (!block) return;

          addBlock(block);
          newSelection.push(id);
        });

        if (newSelection.length > 0) {
          setSelection(newSelection);
          return;
        }

        return;
      }

      paste(targetX, targetY);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const currentViewport = viewportRef.current;

      if (e.ctrlKey || e.metaKey) {
        const rect = container.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 20;
        else if (e.deltaMode === 2) delta *= 50;

        const zoomFactor = Math.exp(-delta * 0.012);
        const newZoom = Math.max(0.1, Math.min(20, currentViewport.zoom * zoomFactor));

        const scaleRatio = newZoom / currentViewport.zoom;
        const newX = cursorX - (cursorX - currentViewport.x) * scaleRatio;
        const newY = cursorY - (cursorY - currentViewport.y) * scaleRatio;

        publishViewport({ x: newX, y: newY, zoom: newZoom });
      } else {
        publishViewport({
          x: currentViewport.x - e.deltaX,
          y: currentViewport.y - e.deltaY,
          zoom: currentViewport.zoom,
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [publishViewport]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 1 || e.button === 2 || tool === 'pan') {
      e.preventDefault();
      captureCanvasPointer(e);
      isPanning.current = true;
      setIsGrabbing(true);
      return;
    }

    if (tool === 'sticky') {
      const { viewport, blocks, addBlock, setSelection } = useBoardStore.getState();
      const rect = containerRef.current!.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left - viewport.x) / viewport.zoom;
      const canvasY = (e.clientY - rect.top - viewport.y) / viewport.zoom;
      const highestZ = Math.max(0, ...Object.values(blocks).map((b) => b.zIndex));
      const id = uuidv4();
      addBlock({
        id,
        type: 'sticky',
        x: canvasX - 120,
        y: canvasY - 120,
        width: 240,
        height: 240,
        zIndex: highestZ + 1,
        data: { text: '', hue: useBoardStore.getState().stickyHue, textAlign: 'center', autoFocus: true }
      });
      setSelection([id]);
      return;
    }

    const { viewport } = useBoardStore.getState();
    const rect = containerRef.current!.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left - viewport.x) / viewport.zoom;
    const canvasY = (e.clientY - rect.top - viewport.y) / viewport.zoom;

    if (tool === 'marker') {
      if (markerType === 'eraser') {
        captureCanvasPointer(e);
        isErasing.current = true;
        const drawingsToRemove = drawings
          .filter(d => d.points.some(p => 
            Math.sqrt(Math.pow(p.x - canvasX, 2) + Math.pow(p.y - canvasY, 2)) < markerThickness * 3
          ))
          .map(d => d.id);
        if (drawingsToRemove.length > 0) {
          useBoardStore.getState().pushHistory();
          hasPushedEraserHistory.current = true;
          removeDrawings(drawingsToRemove, true);
        }
        return;
      }
      
      captureCanvasPointer(e);
      isDrawing.current = true;
      const startPoint = { x: canvasX, y: canvasY };
      setCurrentPath({
        id: uuidv4(),
        points: [startPoint, { x: canvasX + 0.1, y: canvasY + 0.1 }],
        color: markerColor,
        strokeWidth: markerThickness / 2,
        toolType: markerType
      });
      return;
    }

    if (tool === 'frame') {
      captureCanvasPointer(e);
      isCreatingFrame.current = true;
      setActiveFrame({
        x1: canvasX,
        y1: canvasY,
        x2: canvasX,
        y2: canvasY
      });
      return;
    }

    if (tool === 'shape') {
      const { shapeType } = useBoardStore.getState();
      captureCanvasPointer(e);
      isCreatingShape.current = true;
      setActiveShape({
        type: shapeType,
        x1: canvasX,
        y1: canvasY,
        x2: canvasX,
        y2: canvasY
      });
      return;
    }

    if (tool === 'text') {
      const { blocks, textFontSize, textHue } = useBoardStore.getState();
      const highestZ = Math.max(0, ...Object.values(blocks).map((b) => b.zIndex));
      const color = `hsl(${textHue}, 75%, 28%)`;

      const textId = uuidv4();
      addBlock({
        id: textId,
        type: 'text',
        x: canvasX,
        y: canvasY,
        width: 240,
        height: getTextBlockHeight(textFontSize),
        zIndex: highestZ + 1,
        data: { text: '', fontSize: textFontSize, hue: textHue, color, autoFocus: true }
      });
      useBoardStore.getState().setSelection([textId]);
      return;
    }

    const clickedDrawing = drawings.find(d => 
      d.points.some(p => Math.abs(p.x - canvasX) < 15 && Math.abs(p.y - canvasY) < 15)
    );

    if (clickedDrawing) {
      if (e.shiftKey || e.metaKey) {
        if (drawingSelection.includes(clickedDrawing.id)) {
          setDrawingSelection(drawingSelection.filter(id => id !== clickedDrawing.id));
        } else {
          setDrawingSelection([...drawingSelection, clickedDrawing.id]);
        }
      } else {
        if (!drawingSelection.includes(clickedDrawing.id)) {
          setDrawingSelection([clickedDrawing.id]);
          setSelection([]);
        }
        useBoardStore.getState().pushHistory();
        captureCanvasPointer(e);
        isDraggingDrawing.current = true;
        lastDragPos.current = { x: canvasX, y: canvasY };
      }
      return;
    }

    if (e.target !== containerRef.current) return;

    isMarquee.current = true;
    captureCanvasPointer(e);
    setMarquee({ x1: canvasX, y1: canvasY, x2: canvasX, y2: canvasY });
    
    if (e.shiftKey || shiftHeldRef.current) {
      initialSelection.current = useBoardStore.getState().selection;
      initialDrawingSelection.current = useBoardStore.getState().drawingSelection;
    } else {
      initialSelection.current = [];
      initialDrawingSelection.current = [];
      useBoardStore.getState().setSelection([]);
      useBoardStore.getState().setDrawingSelection([]);
    }
  }, [tool, markerType, markerColor, markerThickness, removeDrawings, setCurrentPath, setActiveShape, drawings, drawingSelection, setDrawingSelection, setSelection, addBlock]);

  const PAN_SENSITIVITY = 2;

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const currentViewport = viewportRef.current;

    if (isPanning.current) {
      publishViewport({
        x: currentViewport.x + e.movementX * PAN_SENSITIVITY,
        y: currentViewport.y + e.movementY * PAN_SENSITIVITY,
        zoom: currentViewport.zoom,
      });
      return;
    }

    const rect = containerRef.current!.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left - currentViewport.x) / currentViewport.zoom;
    const canvasY = (e.clientY - rect.top - currentViewport.y) / currentViewport.zoom;
    
    setMousePos(canvasX, canvasY);

    if (isCreatingFrame.current && activeFrame) {
      setActiveFrame({
        ...activeFrame,
        x2: canvasX,
        y2: canvasY
      });
    } else if (isCreatingShape.current && activeShape) {
      let newX2 = canvasX;
      let newY2 = canvasY;
      
      if (shiftHeldRef.current) {
        const deltaX = Math.abs(canvasX - activeShape.x1);
        const deltaY = Math.abs(canvasY - activeShape.y1);
        const size = Math.min(deltaX, deltaY);
        newX2 = activeShape.x1 + (canvasX > activeShape.x1 ? size : -size);
        newY2 = activeShape.y1 + (canvasY > activeShape.y1 ? size : -size);
      }
      
      setActiveShape({
        ...activeShape,
        x2: newX2,
        y2: newY2
      });
    } else if (isDraggingDrawing.current && drawingSelection.length > 0) {
      const deltaX = canvasX - lastDragPos.current.x;
      const deltaY = canvasY - lastDragPos.current.y;
      
      updateDrawings(drawingSelection.map(id => ({ id, deltaX, deltaY })), true);
      lastDragPos.current = { x: canvasX, y: canvasY };
    } else if (isDrawing.current && currentPath) {
      setCurrentPath({
        ...currentPath,
        points: [...currentPath.points, { x: canvasX, y: canvasY }]
      });
    } else if (isErasing.current) {
      const { drawings: currentDrawings, removeDrawings: removeDraws } = useBoardStore.getState();
      const drawingsToRemove = currentDrawings
        .filter(d => d.points.some(p => 
          Math.sqrt(Math.pow(p.x - canvasX, 2) + Math.pow(p.y - canvasY, 2)) < markerThickness * 3
        ))
        .map(d => d.id);
      if (drawingsToRemove.length > 0) {
        if (!hasPushedEraserHistory.current) {
          useBoardStore.getState().pushHistory();
          hasPushedEraserHistory.current = true;
        }
        removeDraws(drawingsToRemove, true);
      }
    } else if (isMarquee.current && marquee) {
      setMarquee(prev => prev ? { ...prev, x2: canvasX, y2: canvasY } : null);
      
      const x1 = Math.min(marquee.x1, canvasX);
      const y1 = Math.min(marquee.y1, canvasY);
      const x2 = Math.max(marquee.x1, canvasX);
      const y2 = Math.max(marquee.y1, canvasY);
      
      const selectedIds = Object.values(blocks)
        .filter(b => b.x < x2 && b.x + b.width > x1 && b.y < y2 && b.y + b.height > y1)
        .map(b => b.id);
      
      const selectedDrawingIds = drawings
        .filter(d => d.points.some(p => p.x > x1 && p.x < x2 && p.y > y1 && p.y < y2))
        .map(d => d.id);
      
      if (e.shiftKey || shiftHeldRef.current) {
        useBoardStore.getState().setSelection([...new Set([...initialSelection.current, ...selectedIds])]);
        useBoardStore.getState().setDrawingSelection([...new Set([...initialDrawingSelection.current, ...selectedDrawingIds])]);
      } else {
        useBoardStore.getState().setSelection(selectedIds);
        useBoardStore.getState().setDrawingSelection(selectedDrawingIds);
      }
    }
  }, [marquee, blocks, drawings, setMousePos, currentPath, setCurrentPath, drawingSelection, updateDrawings, activeShape, setActiveShape, markerThickness, activeFrame, publishViewport]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    releaseCanvasPointer(e);

    if (isPanning.current) {
      isPanning.current = false;
      flushViewport();
      setIsGrabbing(false);
    }
    if (isDraggingDrawing.current) {
      isDraggingDrawing.current = false;
    }
    if (isMarquee.current) {
      isMarquee.current = false;
      setMarquee(null);
    }
    if (isErasing.current) {
      isErasing.current = false;
      hasPushedEraserHistory.current = false;
    }
    if (isDrawing.current && currentPath) {
      isDrawing.current = false;
      liveCommittedDrawingIds.current.add(currentPath.id);
      addDrawing(currentPath);
      requestAnimationFrame(() => {
        setCurrentPath(null);
      });
    }
    if (isCreatingFrame.current && activeFrame) {
      isCreatingFrame.current = false;
      
      const x = Math.min(activeFrame.x1, activeFrame.x2);
      const y = Math.min(activeFrame.y1, activeFrame.y2);
      const width = Math.max(100, Math.abs(activeFrame.x2 - activeFrame.x1));
      const height = Math.max(100, Math.abs(activeFrame.y2 - activeFrame.y1));

      addBlock({
        id: uuidv4(),
        type: 'frame',
        x,
        y,
        width,
        height,
        zIndex: 0, // Frames should be at the bottom
        data: { title: 'Frame' }
      });

      setActiveFrame(null);
    }
    if (isCreatingShape.current && activeShape) {
      isCreatingShape.current = false;
      const { shapeHue } = useBoardStore.getState();
      
      const x = Math.min(activeShape.x1, activeShape.x2);
      const y = Math.min(activeShape.y1, activeShape.y2);
      const width = Math.max(10, Math.abs(activeShape.x2 - activeShape.x1));
      const height = Math.max(10, Math.abs(activeShape.y2 - activeShape.y1));

      addBlock({
        id: uuidv4(),
        type: 'shape',
        x,
        y,
        width,
        height,
        zIndex: Math.max(0, ...Object.values(blocks).map(b => b.zIndex)) + 1,
        data: {
          shape: activeShape.type,
          hue: shapeHue,
          color: `hsl(${shapeHue}, 90%, 65%)`,
        }
      });

      setActiveShape(null);
    }
  }, [currentPath, activeShape, activeFrame, addDrawing, addBlock, blocks, setCurrentPath, setActiveShape, flushViewport]);

  return (
    <main className="absolute inset-0 w-full h-full overflow-hidden touch-none pointer-events-none">
      <button 
        ref={containerRef}
        type="button"
        className={`absolute inset-0 w-full h-full focus:outline-none block appearance-none bg-transparent border-none text-left p-0 m-0 pointer-events-auto`}
        style={{ cursor: cursorStyle }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <AnimatePresence>
          {gridView === 'box' && (
            <motion.div
              key="box-grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `linear-gradient(to right, var(--grid-color) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-color) 1px, transparent 1px)`,
                backgroundSize: bgSize,
                backgroundPosition: bgPos,
              }}
            />
          )}
          {gridView === 'dot' && (
            <motion.div
              key="dot-grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `radial-gradient(circle, var(--grid-color) 2px, transparent 2px)`,
                backgroundSize: dotSize,
                backgroundPosition: bgPos,
              }}
            />
          )}
        </AnimatePresence>

        <motion.div
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width: 0,
            height: 0,
            transform,
          }}
        >
          {children}

          <div id="viboard-overlay-layer" className="absolute top-0 left-0 w-0 h-0 pointer-events-none z-[9999]" />
          
          <AnimatePresence>
            {marquee && (
              <motion.div
                initial={{ 
                  opacity: 0,
                  left: Math.min(marquee.x1, marquee.x2),
                  top: Math.min(marquee.y1, marquee.y2),
                  width: Math.max(1, Math.abs(marquee.x2 - marquee.x1)),
                  height: Math.max(1, Math.abs(marquee.y2 - marquee.y1)),
                }}
                animate={{ 
                  opacity: 1,
                  left: Math.min(marquee.x1, marquee.x2),
                  top: Math.min(marquee.y1, marquee.y2),
                  width: Math.max(1, Math.abs(marquee.x2 - marquee.x1)),
                  height: Math.max(1, Math.abs(marquee.y2 - marquee.y1)),
                }}
                exit={{ 
                  opacity: 0, 
                  scale: 0.98,
                  transition: { duration: 0.1 } 
                }}
                transition={{ 
                  type: "spring",
                  damping: 25,
                  stiffness: 400,
                  mass: 0.5
                }}
                className="absolute pointer-events-none z-[1000] rounded-md border-[1.5px] border-[#6c5cff]/50 bg-[#6c5cff]/10 shadow-none backdrop-blur-[0.5px]"
              />
            )}
          </AnimatePresence>

          {activeShape && (
            <div
              className="absolute border-2 pointer-events-none z-[1002]"
              style={{
                left: Math.min(activeShape.x1, activeShape.x2),
                top: Math.min(activeShape.y1, activeShape.y2),
                width: Math.abs(activeShape.x2 - activeShape.x1),
                height: Math.abs(activeShape.y2 - activeShape.y1),
                borderColor: `hsl(${shapeHue}, 90%, 65%)`,
                backgroundColor: `hsla(${shapeHue}, 90%, 65%, 0.1)`,
                borderRadius: activeShape.type === 'circle' ? '9999px' : '0px'
              }}
            />
          )}

          {activeFrame && (
            <div
              className="absolute border-2 border-[#6c5cff] bg-transparent pointer-events-none z-[1002]"
              style={{
                left: Math.min(activeFrame.x1, activeFrame.x2),
                top: Math.min(activeFrame.y1, activeFrame.y2),
                width: Math.abs(activeFrame.x2 - activeFrame.x1),
                height: Math.abs(activeFrame.y2 - activeFrame.y1),
              }}
            />
          )}

          <svg 
            className="absolute top-0 left-0 overflow-visible pointer-events-none z-[1001]"
            aria-label="Drawing layer"
            style={{ width: 1, height: 1 }}
          >
            <title>Drawing layer</title>
            <AnimatePresence initial={false}>
              {drawings.map((path) => (
                <motion.path
                  key={path.id}
                  initial={historyAnimationKey > 0 && !liveCommittedDrawingIds.current.has(path.id) ? { opacity: 0 } : false}
                  animate={{
                    opacity: path.toolType === 'highlighter' ? 0.4 : 1,
                    d: `M ${path.points[0].x} ${path.points[0].y} ` +
                      path.points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' '),
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: historyAnimationKey > 0 && !liveCommittedDrawingIds.current.has(path.id) ? 0.16 : 0, ease: 'easeOut' }}
                  fill="none"
                  stroke={drawingSelection.includes(path.id) ? '#6c5cff' : path.color}
                  strokeWidth={path.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </AnimatePresence>
            {currentPath && (
              <path
                d={`M ${currentPath.points[0].x} ${currentPath.points[0].y} ` + 
                   currentPath.points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')}
                fill="none"
                stroke={currentPath.color}
                strokeWidth={currentPath.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: currentPath.toolType === 'highlighter' ? 0.4 : 1 }}
              />
            )}
          </svg>

          {snapLines.length > 0 && (
            <svg 
              aria-hidden="true"
              className="absolute pointer-events-none z-[2000]"
              style={{ left: 0, top: 0, width: 0, height: 0, overflow: 'visible' }}
            >
              {snapLines.map((line) => {
                if (line.x !== undefined) {
                  return (
                    <line
                      key={`snap-x-${line.x}-${crypto.randomUUID()}`}
                      x1={line.x} y1={-10000} x2={line.x} y2={10000}
                      stroke="#3b82f6"
                      strokeWidth={1.5 / viewport.zoom}
                      strokeDasharray={`${6 / viewport.zoom} ${6 / viewport.zoom}`}
                      className="animate-snap-march"
                    />
                  );
                }
                if (line.y !== undefined) {
                  return (
                    <line
                      key={`snap-y-${line.y}-${crypto.randomUUID()}`}
                      x1={-10000} y1={line.y} x2={10000} y2={line.y}
                      stroke="#3b82f6"
                      strokeWidth={1.5 / viewport.zoom}
                      strokeDasharray={`${6 / viewport.zoom} ${6 / viewport.zoom}`}
                      className="animate-snap-march"
                    />
                  );
                }
                return null;
              })}
            </svg>
          )}
        </motion.div>
      </button>
    </main>
  );
};
