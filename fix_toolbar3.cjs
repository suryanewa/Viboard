const fs = require('fs');
let content = fs.readFileSync('src/components/Toolbar.tsx', 'utf8');

content = content.replace(
  "const handleClickOutside = () => setIsPlusMenuOpen(false);\n    window.addEventListener('click', handleClickOutside);\n    return () => window.removeEventListener('click', handleClickOutside);\n  }, [snapping, gridView, viewport, handleToolSelect, setSnapping, setGridView, setViewport]);",
  "const handleClickOutside = () => setIsPlusMenuOpen(false);\n    window.addEventListener('click', handleClickOutside);\n    return () => window.removeEventListener('click', handleClickOutside);\n  }, []);"
);

fs.writeFileSync('src/components/Toolbar.tsx', content);

