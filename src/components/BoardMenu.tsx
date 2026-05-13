import React from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalSpaceAround,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalSpaceAround,
  Bold,
  ChevronRight,
  Clipboard,
  Copy,
  CopyPlus,
  Download,
  Eye,
  FileDown,
  FileImage,
  FilePlus,
  FolderOpen,
  Grid2X2,
  Group,
  Highlighter,
  Italic,
  Layers,
  List,
  ListOrdered,
  MoreVertical,
  MousePointer2,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Search,
  SendToBack,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Ungroup,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import clsx from 'clsx';
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
  newBoard,
  openBoardFile,
  openRecentBoard,
  rotateSelection,
  saveBoard,
  saveLocalCopy,
  selectInverse,
  setZoomCentered,
  tidySelection,
  ungroupSelection,
  zoomToFit,
} from '../lib/boardCommands';

type MenuItem = {
  id: string;
  label: string;
  shortcut?: string;
  icon?: React.ElementType;
  action?: () => void | Promise<void>;
  children?: MenuItem[];
  danger?: boolean;
};

const menuVariants: Variants = {
  hidden: {
    opacity: 0,
    y: -8,
    scale: 0.98,
    filter: 'blur(6px)',
    transformOrigin: 'top left',
    transition: { duration: 0.14 },
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { type: 'spring', bounce: 0, duration: 0.28, staggerChildren: 0.018 },
  },
  exit: {
    opacity: 0,
    y: -6,
    scale: 0.98,
    filter: 'blur(6px)',
    transition: { duration: 0.12 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -6 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', bounce: 0.35, duration: 0.28 } },
};

const Shortcut = ({ value }: { value?: string }) => {
  if (!value) return null;
  return <span className="ml-4 text-[11px] leading-none font-mono text-zinc-400 tabular-nums">{value}</span>;
};

const MenuButton = ({
  item,
  active,
  onEnter,
  onClick,
}: {
  item: MenuItem;
  active?: boolean;
  onEnter?: () => void;
  onClick?: () => void;
}) => {
  const Icon = item.icon;
  return (
    <motion.button
      type="button"
      variants={itemVariants}
      onPointerEnter={onEnter}
      onClick={onClick}
      whileHover="hover"
      whileTap={{ scale: 0.98 }}
      className={clsx(
        'relative z-10 flex w-full min-w-[220px] items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm outline-none cursor-default',
        item.danger ? 'text-red-600' : 'text-zinc-700',
        active && 'text-zinc-950'
      )}
    >
      <motion.div
        className={clsx('absolute inset-0 -z-10 rounded-lg', item.danger ? 'bg-red-50' : 'bg-zinc-100')}
        initial={false}
        animate={{ opacity: active ? 1 : 0 }}
        variants={{ hover: { opacity: 1, scale: 1 } }}
        transition={{ type: 'spring', bounce: 0.25, duration: 0.32 }}
      />
      <span className="flex min-w-0 items-center gap-2.5">
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        <span className="truncate">{item.label}</span>
      </span>
      <span className="flex items-center">
        <Shortcut value={item.shortcut} />
        {item.children && <ChevronRight className="ml-2 h-4 w-4 text-zinc-400" />}
      </span>
    </motion.button>
  );
};

const DotGridIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="5" cy="5" r="1.8" fill="currentColor" />
    <circle cx="15" cy="5" r="1.8" fill="currentColor" />
    <circle cx="5" cy="15" r="1.8" fill="currentColor" />
    <circle cx="15" cy="15" r="1.8" fill="currentColor" />
  </svg>
);

export const BoardMenu: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [hoveredTop, setHoveredTop] = React.useState('file');
  const [hoveredNested, setHoveredNested] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const selection = useBoardStore((state) => state.selection);
  const blocks = useBoardStore((state) => state.blocks);
  const viewport = useBoardStore((state) => state.viewport);
  const gridView = useBoardStore((state) => state.gridView);
  const setGridView = useBoardStore((state) => state.setGridView);
  const setMode = useBoardStore((state) => state.setMode);
  const setIsSearchOpen = useBoardStore((state) => state.setIsSearchOpen);
  const {
    undo,
    redo,
    copy,
    paste,
    duplicate,
    bringToFront,
    bringForward,
    sendBackward,
    sendToBack,
    setSelection,
  } = useBoardStore.getState();

  React.useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', closeOnOutside);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutside);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const run = (action?: () => void | Promise<void>) => {
    if (!action) return;
    void action();
    setOpen(false);
  };

  const menus: MenuItem[] = [
    {
      id: 'file',
      label: 'File',
      icon: FileDown,
      children: [
        { id: 'new', label: 'New', icon: FilePlus, action: newBoard },
        { id: 'open', label: 'Open', icon: FolderOpen, action: openBoardFile },
        { id: 'openRecent', label: 'Open recent', icon: RotateCcw, action: openRecentBoard },
        { id: 'save', label: 'Save', icon: Save, action: saveBoard },
        { id: 'saveLocal', label: 'Save local copy', icon: Download, action: saveLocalCopy },
        {
          id: 'export',
          label: 'Export as...',
          shortcut: '⇧⌘E',
          icon: FileImage,
          children: [
            { id: 'exportPng', label: 'PNG', icon: FileImage, action: () => exportBoard('png') },
            { id: 'exportJpg', label: 'JPG', icon: FileImage, action: () => exportBoard('jpg') },
            { id: 'exportPdf', label: 'PDF', icon: FileDown, action: () => exportBoard('pdf') },
          ],
        },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      icon: MousePointer2,
      children: [
        { id: 'undo', label: 'Undo', shortcut: '⌘Z', icon: RotateCcw, action: undo },
        { id: 'redo', label: 'Redo', shortcut: '⇧⌘Z', icon: Redo2, action: redo },
        { id: 'copy', label: 'Copy', shortcut: '⌘C', icon: Copy, action: copy },
        { id: 'copyPng', label: 'Copy as PNG', shortcut: '⇧⌘C', icon: FileImage, action: copySelectionAsPng },
        { id: 'paste', label: 'Paste', shortcut: '⌘V', icon: Clipboard, action: () => paste() },
        { id: 'duplicate', label: 'Duplicate', shortcut: '⌘D', icon: CopyPlus, action: () => duplicate(selection) },
        { id: 'delete', label: 'Delete', shortcut: 'Delete', icon: Trash2, action: deleteSelection, danger: true },
        { id: 'find', label: 'Find', shortcut: '⌘F / ⌘K', icon: Search, action: () => setIsSearchOpen(true) },
        { id: 'selectAll', label: 'Select all', shortcut: '⌘A', icon: MousePointer2, action: () => setSelection(Object.keys(blocks)) },
        { id: 'selectInverse', label: 'Select inverse', shortcut: '⇧⌘A', icon: Highlighter, action: selectInverse },
      ],
    },
    {
      id: 'view',
      label: 'View',
      icon: Eye,
      children: [
        { id: 'boxGrid', label: 'Show box grid', icon: Grid2X2, action: () => setGridView(gridView === 'box' ? 'none' : 'box') },
        { id: 'dotGrid', label: 'Show dot grid', icon: DotGridIcon, action: () => setGridView(gridView === 'dot' ? 'none' : 'dot') },
        { id: 'viewMode', label: 'View mode', icon: Eye, action: () => setMode('view') },
        { id: 'editMode', label: 'Edit mode', icon: MousePointer2, action: () => setMode('edit') },
        { id: 'zoomIn', label: 'Zoom in', shortcut: '⌘+', icon: ZoomIn, action: () => setZoomCentered(viewport.zoom + 0.1) },
        { id: 'zoomOut', label: 'Zoom out', shortcut: '⌘-', icon: ZoomOut, action: () => setZoomCentered(viewport.zoom - 0.1) },
        { id: 'zoom100', label: 'Zoom to 100%', shortcut: '⌘0', icon: Type, action: () => setZoomCentered(1) },
        { id: 'zoomFit', label: 'Zoom to fit', shortcut: '⇧1', icon: AlignHorizontalJustifyCenter, action: () => zoomToFit() },
        { id: 'zoomSelection', label: 'Zoom to selection', shortcut: '⇧2', icon: MousePointer2, action: () => zoomToFit(selection) },
      ],
    },
    {
      id: 'object',
      label: 'Object',
      icon: Layers,
      children: [
        { id: 'group', label: 'Group selection', shortcut: '⌘G', icon: Group, action: groupSelection },
        { id: 'ungroup', label: 'Ungroup selection', shortcut: '⌘⌫', icon: Ungroup, action: ungroupSelection },
        { id: 'front', label: 'Bring to front', shortcut: ']', icon: Layers, action: () => selection.forEach((id) => bringToFront(id)) },
        { id: 'forward', label: 'Bring forward', shortcut: '⌘]', icon: Layers, action: () => selection.forEach((id) => bringForward(id)) },
        { id: 'backward', label: 'Send to backward', shortcut: '⌘[', icon: SendToBack, action: () => selection.forEach((id) => sendBackward(id)) },
        { id: 'back', label: 'Send to back', shortcut: '[', icon: SendToBack, action: () => selection.forEach((id) => sendToBack(id)) },
        { id: 'flipH', label: 'Flip horizontal', shortcut: '⇧H', icon: AlignHorizontalJustifyCenter, action: () => flipSelection('horizontal') },
        { id: 'flipV', label: 'Flip vertical', shortcut: '⇧V', icon: AlignVerticalJustifyCenter, action: () => flipSelection('vertical') },
        { id: 'rotate180', label: 'Rotate 180°', icon: RotateCw, action: () => rotateSelection(180) },
        { id: 'rotateLeft', label: 'Rotate 90° left', icon: RotateCcw, action: () => rotateSelection(-90) },
        { id: 'rotateRight', label: 'Rotate 90° right', icon: RotateCw, action: () => rotateSelection(90) },
      ],
    },
    {
      id: 'text',
      label: 'Text',
      icon: Type,
      children: [
        { id: 'bold', label: 'Bold', shortcut: '⌘B', icon: Bold, action: () => applyTextCommand('bold') },
        { id: 'italic', label: 'Italic', shortcut: '⌘I', icon: Italic, action: () => applyTextCommand('italic') },
        { id: 'underline', label: 'Underline', shortcut: '⌘U', icon: Underline, action: () => applyTextCommand('underline') },
        { id: 'strike', label: 'Strikethrough', shortcut: '⇧⌘X', icon: Strikethrough, action: () => applyTextCommand('strikethrough') },
        { id: 'link', label: 'Create link', shortcut: '⇧⌘U', icon: FilePlus, action: () => applyTextCommand('link') },
        { id: 'bullet', label: 'Bulleted list', shortcut: '⇧⌘8', icon: List, action: () => applyTextCommand('bulletedList') },
        { id: 'number', label: 'Numbered list', shortcut: '⇧⌘7', icon: ListOrdered, action: () => applyTextCommand('numberedList') },
        {
          id: 'alignment',
          label: 'Alignment',
          icon: AlignLeft,
          children: [
            { id: 'textLeft', label: 'Text align left', shortcut: '⌥⌘L', icon: AlignLeft, action: () => applyTextCommand('alignLeft') },
            { id: 'textCenter', label: 'Text align center', shortcut: '⌥⌘T', icon: AlignCenter, action: () => applyTextCommand('alignCenter') },
            { id: 'textRight', label: 'Text align right', shortcut: '⌥⌘R', icon: AlignRight, action: () => applyTextCommand('alignRight') },
          ],
        },
      ],
    },
    {
      id: 'arrange',
      label: 'Arrange',
      icon: AlignHorizontalSpaceAround,
      children: [
        { id: 'alignLeft', label: 'Align left', shortcut: '⌥A', icon: AlignLeft, action: () => alignSelection('left') },
        { id: 'alignH', label: 'Align horizontal centers', shortcut: '⌥H', icon: AlignHorizontalJustifyCenter, action: () => alignSelection('centerH') },
        { id: 'alignRight', label: 'Align right', shortcut: '⌥D', icon: AlignRight, action: () => alignSelection('right') },
        { id: 'alignTop', label: 'Align top', shortcut: '⌥W', icon: AlignVerticalJustifyCenter, action: () => alignSelection('top') },
        { id: 'alignV', label: 'Align vertical centers', shortcut: '⌥V', icon: AlignVerticalJustifyCenter, action: () => alignSelection('centerV') },
        { id: 'alignBottom', label: 'Align bottom', shortcut: '⌥S', icon: AlignVerticalJustifyCenter, action: () => alignSelection('bottom') },
        { id: 'tidy', label: 'Tidy up', shortcut: '⌃⌥T', icon: Grid2X2, action: tidySelection },
        { id: 'distributeH', label: 'Distribute horizontal spacing', shortcut: '⌃⌥H', icon: AlignHorizontalSpaceAround, action: () => distributeSelection('horizontal') },
        { id: 'distributeV', label: 'Distribute vertical spacing', shortcut: '⌃⌥V', icon: AlignVerticalSpaceAround, action: () => distributeSelection('vertical') },
      ],
    },
  ];

  const activeMenu = menus.find((menu) => menu.id === hoveredTop) || menus[0];
  const nestedMenu = activeMenu.children?.find((item) => item.id === hoveredNested && item.children);

  return (
    <div ref={rootRef} className="relative">
      <motion.button
        type="button"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        whileHover="hover"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg p-2 text-zinc-600 transition-colors hover:text-zinc-900"
      >
        <motion.div
          className="absolute inset-0 -z-10 rounded-lg bg-zinc-100"
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          variants={{ hover: { opacity: 1 } }}
          transition={{ duration: 0.18 }}
        />
        <motion.div variants={{ hover: { scale: 1.1, rotate: 90 } }} transition={{ type: 'spring', duration: 0.3 }}>
          <MoreVertical className="relative z-10 h-5 w-5" />
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            className="absolute left-0 top-[calc(100%+8px)] z-[10020] flex items-start gap-1 rounded-xl border border-zinc-200/80 bg-white/95 p-1.5 shadow-none backdrop-blur-md"
            variants={menuVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col">
              {menus.map((item) => (
                <MenuButton
                  key={item.id}
                  item={item}
                  active={activeMenu.id === item.id}
                  onEnter={() => {
                    setHoveredTop(item.id);
                    setHoveredNested(null);
                  }}
                />
              ))}
            </div>
            <div className="h-[calc(100%-8px)] w-px self-stretch bg-zinc-100" />
            <div className="flex flex-col">
              {activeMenu.children?.map((item) => (
                <MenuButton
                  key={item.id}
                  item={item}
                  active={hoveredNested === item.id}
                  onEnter={() => setHoveredNested(item.children ? item.id : null)}
                  onClick={() => run(item.action)}
                />
              ))}
            </div>
            <AnimatePresence>
              {nestedMenu?.children && (
                <>
                  <div className="h-[calc(100%-8px)] w-px self-stretch bg-zinc-100" />
                  <motion.div className="flex flex-col" variants={menuVariants} initial="hidden" animate="visible" exit="exit">
                    {nestedMenu.children.map((item) => (
                      <MenuButton key={item.id} item={item} onClick={() => run(item.action)} />
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
