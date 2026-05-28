// One-shot maintenance:
//  1. Rename Apply/applications folders whose names end with "." or " "
//     (Windows Explorer can't open such folders, but the \\?\ extended-path
//     prefix lets us rename them).
//  2. Repair stale path references inside each metadata.json — any path that
//     points at a folder name with trailing dots/spaces gets normalised so
//     Edit/Regenerate continue to work.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'Apply', 'applications');

if (!fs.existsSync(ROOT)) {
  console.log('No applications folder at', ROOT);
  process.exit(0);
}

let renamed = 0;
let patched = 0;

// Pass 1: rename problematic folders
for (const name of fs.readdirSync(ROOT)) {
  const clean = name.replace(/[.\s]+$/g, '');
  if (clean === name) continue;
  if (!clean) {
    console.log('SKIP (empty after clean):', name);
    continue;
  }
  const target = path.join(ROOT, clean);
  if (fs.existsSync(target)) {
    console.log('SKIP (target exists):', name, '->', clean);
    continue;
  }
  const oldP = '\\\\?\\' + path.join(ROOT, name);
  const newP = '\\\\?\\' + target;
  try {
    fs.renameSync(oldP, newP);
    console.log('Renamed:', name, '->', clean);
    renamed++;
  } catch (e) {
    console.log('FAILED rename:', name, '|', e.message);
  }
}

// Pass 2: normalise metadata.json paths so they point at the current folder
function fixPath(p, folderName) {
  if (typeof p !== 'string' || !p) return p;
  // Replace any path segment matching <folderName> + trailing dots/spaces
  return p.replace(
    new RegExp(folderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[.\\s]+', 'g'),
    folderName
  );
}

for (const name of fs.readdirSync(ROOT)) {
  const metaPath = path.join(ROOT, name, 'metadata.json');
  if (!fs.existsSync(metaPath)) continue;
  try {
    const raw = fs.readFileSync(metaPath, 'utf8');
    const meta = JSON.parse(raw);
    const before = JSON.stringify(meta);
    const pathKeys = ['folder', 'resumePdfPath', 'coverPdfPath', 'jobDescPdfPath', 'resumeEditPath', 'coverEditPath'];
    for (const k of pathKeys) {
      if (meta[k]) meta[k] = fixPath(meta[k], name);
    }
    const after = JSON.stringify(meta);
    if (before !== after) {
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
      console.log('Patched metadata for:', name);
      patched++;
    }
  } catch (e) {
    console.log('FAILED metadata patch:', name, '|', e.message);
  }
}

console.log(`Total renamed: ${renamed}, metadata patched: ${patched}`);
