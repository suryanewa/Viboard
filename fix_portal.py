import re

with open('src/components/BlockShell.tsx', 'r') as f:
    content = f.read()

old_block = """      {isSelected && overlayElement && createPortal(
        <motion.div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            x,
            y,
            width,
            height,
            scale,
            pointerEvents: 'none',
            zIndex: 9999
          }}
        >
          <AnimatePresence>
            {[
              <motion.svg"""

new_block = """      {overlayElement && createPortal(
        <AnimatePresence>
          {isSelected && (
            <motion.div
              key="selection-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1], delay: 0.1 } }}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                x,
                y,
                width,
                height,
                scale,
                pointerEvents: 'none',
                zIndex: 9999
              }}
            >
              {[
                <motion.svg"""

content = content.replace(old_block, new_block)

old_block2 = """            ]}
          </AnimatePresence>
        </motion.div>,
        overlayElement
      )}"""

new_block2 = """              ]}
            </motion.div>
          )}
        </AnimatePresence>,
        overlayElement
      )}"""

content = content.replace(old_block2, new_block2)

with open('src/components/BlockShell.tsx', 'w') as f:
    f.write(content)

print("Portal fixed")
