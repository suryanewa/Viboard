const fs = require('fs');
let content = fs.readFileSync('src/components/Toolbar.tsx', 'utf8');

// Replace the active-tool-bg part
content = content.replace(
  `{isSelected && (
                          <motion.div
                            layoutId="active-tool-bg"`,
  `{isSelected && t.id !== 'plus' && (
                          <motion.div
                            layoutId="active-tool-bg"`
);

// Add static background for plus when open
content = content.replace(
  `t.color === 'yellow' ? 'bg-yellow-100' : 'bg-red-100'
                            )}
                          />
                        )}`,
  `t.color === 'yellow' ? 'bg-yellow-100' : 'bg-red-100'
                            )}
                          />
                        )}
                        
                        {t.id === 'plus' && isPlusMenuOpen && (
                          <motion.div
                            className="absolute inset-0 rounded-lg -z-10 bg-zinc-100"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                          />
                        )}`
);

fs.writeFileSync('src/components/Toolbar.tsx', content);
