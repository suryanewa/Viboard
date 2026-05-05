const fs = require('fs');
let content = fs.readFileSync('src/components/Toolbar.tsx', 'utf8');

content = content.replace(
  "{isSelected && (",
  "{isSelected && t.id !== 'plus' && ("
);

// Just in case it didn't match the first time
if (!content.includes("{isSelected && t.id !== 'plus' && (")) {
  console.log("Failed to replace isSelected condition");
}

fs.writeFileSync('src/components/Toolbar.tsx', content);
