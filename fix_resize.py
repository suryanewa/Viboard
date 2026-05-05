import re

with open('src/components/BlockShell.tsx', 'r') as f:
    content = f.read()

# Add `hasPushedHistory.current = false;` to handleResizePointerDown
old_hrpd = '''  const handleResizePointerDown = (e: React.PointerEvent, handle: string) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    isResizing.current = true;
    resizeHandle.current = handle;'''

new_hrpd = '''  const handleResizePointerDown = (e: React.PointerEvent, handle: string) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    isResizing.current = true;
    resizeHandle.current = handle;
    hasPushedHistory.current = false;'''

content = content.replace(old_hrpd, new_hrpd)


# Add `pushHistory` to handleResizePointerMove
old_hrpm = '''  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!isResizing.current) return;
    e.stopPropagation();

    const { viewport, snapping, updateBlocks, setSnapLines, blocks } = useBoardStore.getState();'''

new_hrpm = '''  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!isResizing.current) return;
    e.stopPropagation();

    if (!hasPushedHistory.current) {
      useBoardStore.getState().pushHistory();
      hasPushedHistory.current = true;
    }

    const { viewport, snapping, updateBlocks, setSnapLines, blocks } = useBoardStore.getState();'''

content = content.replace(old_hrpm, new_hrpm)

# Make handleResizePointerUp use `true` for noHistory
old_hru = '''    useBoardStore.getState().updateBlocks(finalUpdates, false);'''
new_hru = '''    useBoardStore.getState().updateBlocks(finalUpdates, true);'''

content = content.replace(old_hru, new_hru)

with open('src/components/BlockShell.tsx', 'w') as f:
    f.write(content)

print("Resize history fixed")
