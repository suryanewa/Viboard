const fs = require('fs');

let content = fs.readFileSync('src/components/Toolbar.tsx', 'utf8');

// 1. Add Plus to imports
content = content.replace("MoreVertical } from 'lucide-react';", "MoreVertical, Plus, Link, Type as TypeIcon } from 'lucide-react';");

// 2. Add SVGs
const svgs = `
const VennDiagramIcon = ({ className }: { className?: string }) => (
  <svg className={className || ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="9" r="4.5" />
    <circle cx="8" cy="15" r="4.5" />
    <circle cx="16" cy="15" r="4.5" />
  </svg>
);

const SerifAIcon = ({ className }: { className?: string }) => (
  <svg className={className || ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4 L4 20 M12 4 L20 20 M8 14 L16 14" />
    <path d="M3 20 L5 20 M19 20 L21 20 M10 4 L14 4" />
  </svg>
);
`;

if (!content.includes('VennDiagramIcon')) {
  content = content.replace("export const Toolbar: React.FC = () => {", svgs + "\nexport const Toolbar: React.FC = () => {");
}

// 3. Add state
if (!content.includes('isPlusMenuOpen')) {
  content = content.replace(
    "const [hoveredTopLeft, setHoveredTopLeft] = useState<string | null>(null);",
    "const [hoveredTopLeft, setHoveredTopLeft] = useState<string | null>(null);\n  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);"
  );
}

// 4. Change TOOLS link -> plus
content = content.replace(
  "{ id: 'link', icon: Link, shortcut: 'L', color: 'red', hasSecondary: true, hoverAnim: { scale: 1.1, rotate: 15 } as any },",
  "{ id: 'plus', icon: Plus, shortcut: 'L', color: 'red', hasSecondary: false, hoverAnim: { scale: 1.1, rotate: 45 } as any },"
);

// 5. In handleToolSelect, we don't pass 'plus'. But wait, mapping t.id as 'select' | ... will fail.
content = content.replace(
  "handleToolSelect(t.id as 'select' | 'marker' | 'shape' | 'text' | 'pan' | 'sticky' | 'link');",
  `if (t.id === 'plus') { setIsPlusMenuOpen(!isPlusMenuOpen); } else { handleToolSelect(t.id as 'select' | 'marker' | 'shape' | 'text' | 'pan' | 'sticky' | 'link'); setIsPlusMenuOpen(false); }`
);

// 6. If t.id is 'plus', keep the isSelected state dependent on isPlusMenuOpen
content = content.replace(
  "const isSelected = tool === t.id;",
  "const isSelected = t.id === 'plus' ? isPlusMenuOpen : tool === t.id;"
);

// 7. Add Fan-Out Menu JSX right after the Plus button logic
// The Plus button is in the mapping loop. It's better to wrap the return (...) with a relative div and put the menu there.

const menuJSX = `
                        {t.id === 'plus' && (
                          <AnimatePresence>
                            {isPlusMenuOpen && (
                              <motion.div
                                initial="hidden"
                                animate="visible"
                                exit="hidden"
                                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 flex flex-col gap-2 z-50 pointer-events-none"
                                variants={{
                                  hidden: { opacity: 0, y: 10, scale: 0.8 },
                                  visible: { 
                                    opacity: 1, 
                                    y: 0, 
                                    scale: 1,
                                    transition: { type: "spring", bounce: 0.4, staggerChildren: 0.05, delayChildren: 0.05 } 
                                  }
                                }}
                              >
                                {[
                                  { id: 'link', icon: Link, title: 'Link' },
                                  { id: 'font', icon: SerifAIcon, title: 'Font' },
                                  { id: 'palette', icon: VennDiagramIcon, title: 'Palette' }
                                ].map((sub, i) => (
                                  <motion.button
                                    key={sub.id}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setIsPlusMenuOpen(false);
                                      if (sub.id === 'link') handleToolSelect('link');
                                      else if (sub.id === 'font') handleToolSelect('text');
                                      // palette logic can just open color picker or something, currently no-op
                                    }}
                                    variants={{
                                      hidden: { opacity: 0, y: 10, scale: 0.8 },
                                      visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0.4 } }
                                    }}
                                    whileHover={{ scale: 1.15, rotate: i % 2 === 0 ? 5 : -5 }}
                                    className="p-3 bg-white rounded-full shadow-[0_8px_16px_-4px_rgba(0,0,0,0.1),0_4px_8px_-2px_rgba(0,0,0,0.05)] border border-zinc-200 text-zinc-700 hover:text-zinc-900 pointer-events-auto transition-colors"
                                  >
                                    <sub.icon className="w-5 h-5" />
                                  </motion.button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        )}
`;

content = content.replace(
  "{isSelected && animationState === 'animating-out' && (",
  menuJSX + "\n                        {isSelected && animationState === 'animating-out' && ("
);

// We should also modify the document click handler to close the menu if clicking outside
content = content.replace(
  "return () => window.removeEventListener('keydown', handleKeyDown);",
  "return () => window.removeEventListener('keydown', handleKeyDown);\n  }, [snapping, gridView, viewport, handleToolSelect, setSnapping, setGridView, setViewport]);\n\n  useEffect(() => {\n    const handleClickOutside = () => setIsPlusMenuOpen(false);\n    window.addEventListener('click', handleClickOutside);\n    return () => window.removeEventListener('click', handleClickOutside);"
);

fs.writeFileSync('src/components/Toolbar.tsx', content);

