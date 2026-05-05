with open('src/components/BlockShell.tsx', 'r') as f:
    content = f.read()
content = content.replace("              exit={{ opacity: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1], delay: 0.1 } }}", "              exit={{ opacity: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: 0.2 } }}")
with open('src/components/BlockShell.tsx', 'w') as f:
    f.write(content)
print("Updated exit delay")
