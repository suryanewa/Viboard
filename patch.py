import sys

with open('src/components/BlockShell.tsx', 'r') as f:
    content = f.read()

# We need to insert:
# const dragStartGroupPos = useRef<{id: string, x: number, y: number}[]>([]);
# const hasPushedHistory = useRef(false);
# around line 151.

content = content.replace(
    'const dragStartPos = useRef({ x: 0, y: 0, pointerX: 0, pointerY: 0 });',
    'const dragStartPos = useRef({ x: 0, y: 0, pointerX: 0, pointerY: 0 });\n  const dragStartGroupPos = useRef<{id: string, x: number, y: number}[]>([]);\n  const hasPushedHistory = useRef(false);'
)

# In handlePointerDown, before `isDragging.current = true;`
old_pd = '''    if (e.shiftKey || e.metaKey) {
      if (isCurrentlySelected) setSelection(selection.filter(id => id !== block.id));
      else setSelection([...selection, block.id]);
    } else if (!isCurrentlySelected) {
      setSelection([block.id]);
    }

    if (e.button !== 0) return;

    if (useBoardStore.getState().selection.length > 1) {
      setIsDraggingGroup(true);
    }

    isDragging.current = true;'''

new_pd = '''    if (e.shiftKey || e.metaKey) {
      if (isCurrentlySelected) setSelection(selection.filter(id => id !== block.id));
      else setSelection([...selection, block.id]);
    } else if (!isCurrentlySelected) {
      setSelection([block.id]);
    }

    if (e.button !== 0) return;

    const storeState = useBoardStore.getState();
    if (storeState.selection.length > 1) {
      setIsDraggingGroup(true);
    }

    dragStartGroupPos.current = storeState.selection.map(id => ({ id, x: storeState.blocks[id]?.x || 0, y: storeState.blocks[id]?.y || 0 }));
    hasPushedHistory.current = false;

    isDragging.current = true;'''

content = content.replace(old_pd, new_pd)


# Now for handlePointerMove:
# Everything from `const GRID_SIZE = 24;` to `y.set(snapY);`
# But the string is huge. Let's just find the start and end of that block and replace it using regex.
import re

start_marker = "    const GRID_SIZE = 24;"
end_marker = "  const handlePointerUp = (e: React.PointerEvent) => {"

match = re.search(re.escape(start_marker) + r"(.*?)" + re.escape(end_marker), content, re.DOTALL)
if match:
    old_block = match.group(1)
    
    new_block = '''

    if (!hasPushedHistory.current) {
      useBoardStore.getState().pushHistory();
      hasPushedHistory.current = true;
    }

    let rawX = dragStartPos.current.x + deltaX;
    let rawY = dragStartPos.current.y + deltaY;

    let snapX = rawX;
    let snapY = rawY;
    const activeSnapLines: { x?: number, y?: number }[] = [];

    if (snapping) {
      snapX = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
      snapY = Math.round(rawY / GRID_SIZE) * GRID_SIZE;
    } else {
      const SNAP_THRESHOLD = 5 / zoom;
      const currentW = width.get();
      const currentH = height.get();

      let bestDistX = SNAP_THRESHOLD;
      let bestDistY = SNAP_THRESHOLD;

      const myEdgesX = [rawX, rawX + currentW / 2, rawX + currentW];
      const myEdgesY = [rawY, rawY + currentH / 2, rawY + currentH];
      
      const draggedIds = altDupeIds.current.length > 0 ? altDupeIds.current : selection;
      const unselectedBlocks = Object.values(blocks).filter(b => !draggedIds.includes(b.id) && !selection.includes(b.id));

      unselectedBlocks.forEach(other => {
        const otherEdgesX = [other.x, other.x + other.width / 2, other.x + other.width];
        const otherEdgesY = [other.y, other.y + other.height / 2, other.y + other.height];
        
        myEdgesX.forEach((myEx, i) => {
          otherEdgesX.forEach(otherEx => {
            const dist = Math.abs(myEx - otherEx);
            if (dist < bestDistX) {
              bestDistX = dist;
              snapX = otherEx - (i === 0 ? 0 : i === 1 ? currentW / 2 : currentW);
            }
          });
        });
        
        myEdgesY.forEach((myEy, i) => {
          otherEdgesY.forEach(otherEy => {
            const dist = Math.abs(myEy - otherEy);
            if (dist < bestDistY) {
              bestDistY = dist;
              snapY = otherEy - (i === 0 ? 0 : i === 1 ? currentH / 2 : currentH);
            }
          });
        });
      });

      let bestSnapXLines: { x?: number, y?: number }[] = [];
      let bestSnapYLines: { x?: number, y?: number }[] = [];

      unselectedBlocks.forEach(B => {
        unselectedBlocks.forEach(C => {
          if (B.id === C.id) return;

          const overlapY_BC = B.y < C.y + C.height && B.y + B.height > C.y;
          if (overlapY_BC && C.x >= B.x + B.width) {
            const overlapY_A = rawY < B.y + B.height && rawY + currentH > B.y;
            if (overlapY_A) {
              const gapX = C.x - (B.x + B.width);
              
              const targetLeftX = B.x - gapX - currentW;
              const distLeft = Math.abs(rawX - targetLeftX);
              if (distLeft < bestDistX) {
                bestDistX = distLeft;
                snapX = targetLeftX;
                bestSnapXLines = [{ x: targetLeftX + currentW }, { x: B.x }, { x: C.x }];
              }
              
              const targetRightX = C.x + C.width + gapX;
              const distRight = Math.abs(rawX - targetRightX);
              if (distRight < bestDistX) {
                bestDistX = distRight;
                snapX = targetRightX;
                bestSnapXLines = [{ x: B.x + B.width }, { x: C.x }, { x: C.x + C.width }, { x: targetRightX }];
              }
              
              const spaceForA = C.x - (B.x + B.width);
              if (spaceForA >= currentW) {
                const midGap = (spaceForA - currentW) / 2;
                const targetMidX = B.x + B.width + midGap;
                const distMid = Math.abs(rawX - targetMidX);
                if (distMid < bestDistX) {
                  bestDistX = distMid;
                  snapX = targetMidX;
                  bestSnapXLines = [{ x: B.x + B.width }, { x: targetMidX }, { x: targetMidX + currentW }, { x: C.x }];
                }
              }
            }
          }

          const overlapX_BC = B.x < C.x + C.width && B.x + B.width > C.x;
          if (overlapX_BC && C.y >= B.y + B.height) {
            const overlapX_A = rawX < B.x + B.width && rawX + currentW > B.x;
            if (overlapX_A) {
              const gapY = C.y - (B.y + B.height);
              
              const targetTopY = B.y - gapY - currentH;
              const distTop = Math.abs(rawY - targetTopY);
              if (distTop < bestDistY) {
                bestDistY = distTop;
                snapY = targetTopY;
                bestSnapYLines = [{ y: targetTopY + currentH }, { y: B.y }, { y: B.y + B.height }, { y: C.y }];
              }
              
              const targetBotY = C.y + C.height + gapY;
              const distBot = Math.abs(rawY - targetBotY);
              if (distBot < bestDistY) {
                bestDistY = distBot;
                snapY = targetBotY;
                bestSnapYLines = [{ y: B.y + B.height }, { y: C.y }, { y: C.y + C.height }, { y: targetBotY }];
              }
              
              const spaceForA = C.y - (B.y + B.height);
              if (spaceForA >= currentH) {
                const midGap = (spaceForA - currentH) / 2;
                const targetMidY = B.y + B.height + midGap;
                const distMid = Math.abs(rawY - targetMidY);
                if (distMid < bestDistY) {
                  bestDistY = distMid;
                  snapY = targetMidY;
                  bestSnapYLines = [{ y: B.y + B.height }, { y: targetMidY }, { y: targetMidY + currentH }, { y: C.y }];
                }
              }
            }
          }
        });
      });

      if (bestSnapXLines.length > 0) {
        activeSnapLines.push(...bestSnapXLines);
      } else if (bestDistX < SNAP_THRESHOLD) {
        const snappedEdgesX = [snapX, snapX + currentW / 2, snapX + currentW];
        unselectedBlocks.forEach(other => {
          const otherEdgesX = [other.x, other.x + other.width / 2, other.x + other.width];
          snappedEdgesX.forEach(myEx => {
            otherEdgesX.forEach(otherEx => {
              if (Math.abs(myEx - otherEx) < 0.1) {
                if (!activeSnapLines.some(l => l.x !== undefined && Math.abs(l.x - otherEx) < 0.1)) {
                  activeSnapLines.push({ x: otherEx });
                }
              }
            });
          });
        });
      }

      if (bestSnapYLines.length > 0) {
        activeSnapLines.push(...bestSnapYLines);
      } else if (bestDistY < SNAP_THRESHOLD) {
        const snappedEdgesY = [snapY, snapY + currentH / 2, snapY + currentH];
        unselectedBlocks.forEach(other => {
          const otherEdgesY = [other.y, other.y + other.height / 2, other.y + other.height];
          snappedEdgesY.forEach(myEy => {
            otherEdgesY.forEach(otherEy => {
              if (Math.abs(myEy - otherEy) < 0.1) {
                if (!activeSnapLines.some(l => l.y !== undefined && Math.abs(l.y - otherEy) < 0.1)) {
                  activeSnapLines.push({ y: otherEy });
                }
              }
            });
          });
        });
      }
    }

    const snapOffsetX = snapX - dragStartPos.current.x;
    const snapOffsetY = snapY - dragStartPos.current.y;

    if (altDupeIds.current.length > 0) {
      const updates = altDupeIds.current.map((id, index) => {
        const startPos = dragStartGroupPos.current[index];
        if (!startPos) return null;
        return { id, updates: { x: startPos.x + snapOffsetX, y: startPos.y + snapOffsetY } };
      }).filter(Boolean) as { id: string, updates: any }[];
      
      updateBlocks(updates, true);
    } else if (selection.length > 1 && selection.includes(block.id)) {
      const updates = selection.map(id => {
        const startPos = dragStartGroupPos.current.find(s => s.id === id);
        if (!startPos) return null;
        return { id, updates: { x: startPos.x + snapOffsetX, y: startPos.y + snapOffsetY } };
      }).filter(Boolean) as { id: string, updates: any }[];
      
      updateBlocks(updates, true);
      x.set(snapX);
      y.set(snapY);
    } else if (selection.includes(block.id)) {
      x.set(snapX);
      y.set(snapY);
    }

    setSnapLines(activeSnapLines);
'''
    content = content.replace(start_marker + old_block, start_marker + new_block)

# Finally, handlePointerUp
old_pu = '''    if (!(selection.length > 1 && selection.includes(block.id))) {
      updateBlock(block.id, { x: x.get(), y: y.get() });
    }'''

new_pu = '''    if (!(selection.length > 1 && selection.includes(block.id)) && altDupeIds.current.length === 0) {
      updateBlock(block.id, { x: x.get(), y: y.get(), width: width.get(), height: height.get() }, true);
    }'''

content = content.replace(old_pu, new_pu)

with open('src/components/BlockShell.tsx', 'w') as f:
    f.write(content)

print("Patch applied")
