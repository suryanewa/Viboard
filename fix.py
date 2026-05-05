with open('src/components/BlockShell.tsx', 'r') as f:
    c = f.read()
c = c.replace('setSnapLines(activeSnapLines);\n  const handlePointerUp = (e: React.PointerEvent) => {', 'setSnapLines(activeSnapLines);\n  };\n\n  const handlePointerUp = (e: React.PointerEvent) => {')
with open('src/components/BlockShell.tsx', 'w') as f:
    f.write(c)
print("Fixed")
