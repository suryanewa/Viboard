const fs = require('fs');
let content = fs.readFileSync('src/components/Toolbar.tsx', 'utf8');

// Remove duplicate Link, and remove unused TypeIcon
content = content.replace("MoreVertical, Plus, Link, Type as TypeIcon } from 'lucide-react';", "MoreVertical, Plus } from 'lucide-react';");

// Check if isPlusMenuOpen is defined, the replace might have failed earlier.
fs.writeFileSync('src/components/Toolbar.tsx', content);

