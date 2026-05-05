import re

with open('src/components/Toolbar.tsx', 'r') as f:
    content = f.read()

# Update handleToolSelect
old_handle = """  const handleToolSelect = React.useCallback((nextTool: ToolbarVisualTool, options?: { deferPlusMenuClose?: boolean }) => {
    const currentState = useBoardStore.getState();
    const currentVisualTool = activeToolbarTool;
    
    if (currentVisualTool === nextTool) {
      if (nextTool === 'plus' ? currentState.isPlusMenuOpen : !currentState.isPlusMenuOpen) {
        return;
      }
    }
    
    const currentIndex = TOOLS.findIndex(t => t.id === currentVisualTool);
    const nextIndex = TOOLS.findIndex(t => t.id === nextTool);
    if (currentIndex !== -1 && nextIndex !== -1 && currentIndex !== nextIndex) {
      setHopDirection(nextIndex > currentIndex ? 1 : -1);
    }
    
    const nextToolHasSecondary = TOOLS.find(t => t.id === nextTool)?.hasSecondary;
    setActiveToolbarTool(nextTool);
    if (plusMenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(plusMenuCloseTimeoutRef.current);
      plusMenuCloseTimeoutRef.current = null;
    }
    
    if (nextTool !== 'plus') {
      setTool(nextTool);
      if (nextTool === 'sticky' || nextTool === 'text' || nextTool === 'shape' || nextTool === 'marker' || nextTool === 'link') {
        currentState.setSelection([]);
        currentState.setDrawingSelection([]);
      }
      if (currentState.isPlusMenuOpen && options?.deferPlusMenuClose) {
        plusMenuCloseTimeoutRef.current = window.setTimeout(() => {
          setIsPlusMenuOpen(false);
          plusMenuCloseTimeoutRef.current = null;
        }, 520);
      } else {
        setIsPlusMenuOpen(false);
      }
    } else {
      const isOpening = !currentState.isPlusMenuOpen;
      setIsPlusMenuOpen(isOpening);
    }
    
    setAnimationState('hopping');
    if (animationTimeoutRef.current !== null) {
      window.clearTimeout(animationTimeoutRef.current);
    }
    
    animationTimeoutRef.current = window.setTimeout(() => {
      setAnimationState(nextToolHasSecondary && nextTool !== 'plus' ? 'animating-in' : 'idle');
      animationTimeoutRef.current = null;
    }, 450);
  }, [activeToolbarTool, setAnimationState, setTool, TOOLS, setIsPlusMenuOpen]);"""

new_handle = """  const handleToolSelect = React.useCallback((nextTool: ToolbarVisualTool, options?: { deferPlusMenuClose?: boolean, isSubTool?: boolean }) => {
    const currentState = useBoardStore.getState();
    const currentVisualTool = options?.isSubTool ? 'plus' : activeToolbarTool;
    
    if (currentVisualTool === nextTool && !options?.isSubTool) {
      if (nextTool === 'plus' ? currentState.isPlusMenuOpen : !currentState.isPlusMenuOpen) {
        return;
      }
    }
    
    const currentIndex = TOOLS.findIndex(t => t.id === currentVisualTool);
    const nextIndex = TOOLS.findIndex(t => t.id === nextTool);
    if (currentIndex !== -1 && nextIndex !== -1 && currentIndex !== nextIndex) {
      setHopDirection(nextIndex > currentIndex ? 1 : -1);
    }
    
    const nextToolHasSecondary = TOOLS.find(t => t.id === (options?.isSubTool ? 'plus' : nextTool))?.hasSecondary;
    
    if (options?.isSubTool) {
      setActivePlusTool(nextTool);
      setActiveToolbarTool('plus');
    } else {
      setActiveToolbarTool(nextTool);
    }

    if (plusMenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(plusMenuCloseTimeoutRef.current);
      plusMenuCloseTimeoutRef.current = null;
    }
    
    if (nextTool !== 'plus' && !options?.isSubTool) {
      setTool(nextTool === 'palette' || nextTool === 'font' ? 'text' : nextTool as any);
      if (nextTool === 'sticky' || nextTool === 'text' || nextTool === 'shape' || nextTool === 'marker' || nextTool === 'link' || nextTool === 'palette' || nextTool === 'font') {
        currentState.setSelection([]);
        currentState.setDrawingSelection([]);
      }
      if (currentState.isPlusMenuOpen && options?.deferPlusMenuClose) {
        plusMenuCloseTimeoutRef.current = window.setTimeout(() => {
          setIsPlusMenuOpen(false);
          plusMenuCloseTimeoutRef.current = null;
        }, 520);
      } else {
        setIsPlusMenuOpen(false);
      }
    } else if (nextTool === 'plus') {
      const isOpening = !currentState.isPlusMenuOpen;
      setIsPlusMenuOpen(isOpening);
    } else if (options?.isSubTool) {
      setTool(nextTool === 'palette' || nextTool === 'font' ? 'text' : nextTool as any);
      if (nextTool === 'sticky' || nextTool === 'text' || nextTool === 'shape' || nextTool === 'marker' || nextTool === 'link' || nextTool === 'palette' || nextTool === 'font') {
        currentState.setSelection([]);
        currentState.setDrawingSelection([]);
      }
      if (currentState.isPlusMenuOpen) {
        plusMenuCloseTimeoutRef.current = window.setTimeout(() => {
          setIsPlusMenuOpen(false);
          plusMenuCloseTimeoutRef.current = null;
        }, 520);
      }
    }
    
    setAnimationState('hopping');
    if (animationTimeoutRef.current !== null) {
      window.clearTimeout(animationTimeoutRef.current);
    }
    
    animationTimeoutRef.current = window.setTimeout(() => {
      setAnimationState(nextToolHasSecondary && (nextTool !== 'plus' || options?.isSubTool) ? 'animating-in' : 'idle');
      animationTimeoutRef.current = null;
    }, 450);
  }, [activeToolbarTool, setAnimationState, setTool, TOOLS, setIsPlusMenuOpen]);"""

content = content.replace(old_handle, new_handle)

# Update useEffect for tool change
old_effect = """  useEffect(() => {
    if (!isPlusMenuOpen) {
      setActiveToolbarTool(tool);
    }
  }, [isPlusMenuOpen, tool]);"""

new_effect = """  useEffect(() => {
    if (!isPlusMenuOpen) {
      if (tool === 'link' || tool === 'palette' || tool === 'font') {
        setActiveToolbarTool('plus');
        setActivePlusTool(tool);
      } else {
        setActiveToolbarTool(tool);
      }
    }
  }, [isPlusMenuOpen, tool]);"""

content = content.replace(old_effect, new_effect)

# Update TOOLS.map
old_map = "{TOOLS.map((t) => {"
new_map = "{TOOLS.filter(t => !['link', 'palette', 'font'].includes(t.id)).map((t) => {"
content = content.replace(old_map, new_map)

# Update Icon
old_icon = "const Icon = t.icon;"
new_icon = "const Icon = t.id === 'plus' && activePlusTool !== 'plus' ? TOOLS.find(tool => tool.id === activePlusTool)?.icon || t.icon : t.icon;"
content = content.replace(old_icon, new_icon)

# Update the plus menu buttons
old_plus_menu = """                              {[
                                { id: 'link', icon: Link, title: 'Link', x: 0, y: -56 },
                                { id: 'palette', icon: VennDiagramIcon, title: 'Palette', x: 56, y: -56 },
                                { id: 'font', icon: SerifAIcon, title: 'Font', x: 56, y: 0 }
                              ].map((sub, i) => (
                                <motion.button
                                  key={sub.id}
                                  type="button"
                                  onPointerEnter={(e) => {
                                    e.stopPropagation();
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (sub.id === 'link') handleToolSelect('link', { deferPlusMenuClose: true });
                                    else if (sub.id === 'font') handleToolSelect('text', { deferPlusMenuClose: true });
                                  }}
                                  variants={{
                                    hidden: { opacity: 0, x: 0, y: 0, scale: 0.5 },
                                    visible: { 
                                      opacity: 1, 
                                      x: sub.x, 
                                      y: sub.y, 
                                      scale: 1, 
                                      transition: { type: "spring", stiffness: 300, damping: 25 } 
                                    }
                                  }}
                                  whileHover={{ scale: 1.15, rotate: i % 2 === 0 ? 5 : -5 }}
                                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-3 bg-white rounded-full shadow-[0_8px_16px_-4px_rgba(0,0,0,0.1),0_4px_8px_-2px_rgba(0,0,0,0.05)] border border-zinc-200 text-zinc-700 hover:text-zinc-900 pointer-events-auto transition-colors"
                                >
                                  <sub.icon className="w-5 h-5" />
                                </motion.button>
                              ))}"""

new_plus_menu = """                              {[
                                { id: 'link', icon: Link, title: 'Link', x: 0, y: -56 },
                                { id: 'palette', icon: VennDiagramIcon, title: 'Palette', x: 56, y: -56 },
                                { id: 'font', icon: SerifAIcon, title: 'Font', x: 56, y: 0 }
                              ].map((sub, i) => {
                                const isSelected = activePlusTool === sub.id;
                                const isAnySelected = activePlusTool !== 'plus';
                                
                                return (
                                <motion.button
                                  key={sub.id}
                                  type="button"
                                  onPointerEnter={(e) => {
                                    e.stopPropagation();
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToolSelect(sub.id as ToolbarVisualTool, { deferPlusMenuClose: true, isSubTool: true });
                                  }}
                                  variants={{
                                    hidden: { 
                                      opacity: 0, 
                                      x: 0, 
                                      y: 0, 
                                      scale: 0.5,
                                      transition: { type: "spring", stiffness: 300, damping: 25 }
                                    },
                                    visible: { 
                                      opacity: isAnySelected && !isSelected ? 0 : 1, 
                                      x: isSelected ? 0 : sub.x, 
                                      y: isSelected ? 0 : sub.y, 
                                      scale: isSelected ? 0.5 : 1, 
                                      zIndex: isSelected ? 10 : 1,
                                      transition: { type: "spring", stiffness: 300, damping: 25 } 
                                    }
                                  }}
                                  whileHover={!isAnySelected ? { scale: 1.15, rotate: i % 2 === 0 ? 5 : -5 } : undefined}
                                  className={clsx(
                                    "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-3 bg-white rounded-full shadow-[0_8px_16px_-4px_rgba(0,0,0,0.1),0_4px_8px_-2px_rgba(0,0,0,0.05)] border border-zinc-200 pointer-events-auto transition-colors",
                                    isSelected ? "text-red-600 border-red-200" : "text-zinc-700 hover:text-zinc-900"
                                  )}
                                >
                                  <sub.icon className="w-5 h-5" />
                                </motion.button>
                              )})}"""

content = content.replace(old_plus_menu, new_plus_menu)

with open('src/components/Toolbar.tsx', 'w') as f:
    f.write(content)
