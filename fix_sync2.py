with open('src/components/BlockShell.tsx', 'r') as f:
    content = f.read()

# Replace with a simpler useEffect approach
old_effect = """  // Keep motion values in sync with store, especially during group drag
  useEffect(() => {
    const unsubscribe = useBoardStore.subscribe(
      (state) => state.blocks[block.id],
      (blockData) => {
        if (blockData) {
          if (!isDragging.current && !isResizing.current) {
            x.set(blockData.x);
            y.set(blockData.y);
          }
        }
      }
    );
    return unsubscribe;
  }, [block.id, x, y]);"""

new_effect = """  // Sync motion values from store on block position changes (handles group drag updates)
  useLayoutEffect(() => {
    if (!isDragging.current && !isResizing.current) {
      const storeBlock = useBoardStore.getState().blocks[block.id];
      if (storeBlock) {
        x.set(storeBlock.x);
        y.set(storeBlock.y);
      }
    }
  }, [block.x, block.y, block.id]);"""

content = content.replace(old_effect, new_effect)

with open('src/components/BlockShell.tsx', 'w') as f:
    f.write(content)

print("Sync effect updated")
