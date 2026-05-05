with open('src/components/BlockShell.tsx', 'r') as f:
    content = f.read()

# Replace the existing sync useEffect with a store subscription
old_effect = """  useEffect(() => {
    if (!isDragging.current && !isResizing.current) {
      x.set(block.x);
      y.set(block.y);
      width.set(block.width);
      height.set(block.height);
    }
  }, [block.x, block.y, block.width, block.height, x, y, width, height]);"""

new_effect = """  // Keep motion values in sync with store, especially during group drag
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

content = content.replace(old_effect, new_effect)

with open('src/components/BlockShell.tsx', 'w') as f:
    f.write(content)

print("Sync effect updated")
