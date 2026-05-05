with open('src/components/BlockShell.tsx', 'r') as f:
    content = f.read()

old_classes = """      className={clsx(
        'group absolute outline-none select-none touch-none',
        'transition-colors duration-200',
        block.type !== 'shape' && block.type !== 'drawing' && block.type !== 'text' && block.type !== 'link' && [
          'border shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),_0_2px_4px_-1px_rgba(0,0,0,0.06)]',
          isSelected ? 'border-transparent ring-2 ring-blue-500/20' : 'border-zinc-200 hover:border-zinc-300'
        ],
        block.type === 'shape' && isSelected && 'ring-2 ring-blue-500/20'
      )}"""

new_classes = """      className={clsx(
        'group absolute outline-none select-none touch-none',
        'transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        block.type !== 'shape' && block.type !== 'drawing' && block.type !== 'text' && block.type !== 'link' && [
          'border shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),_0_2px_4px_-1px_rgba(0,0,0,0.06)]',
          isSelected ? 'border-transparent ring-2 ring-blue-500/20' : 'border-zinc-200 ring-2 ring-transparent hover:border-zinc-300'
        ],
        block.type === 'shape' && (isSelected ? 'ring-2 ring-blue-500/20' : 'ring-2 ring-transparent')
      )}"""

content = content.replace(old_classes, new_classes)

with open('src/components/BlockShell.tsx', 'w') as f:
    f.write(content)

print("Classes updated")
