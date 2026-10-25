import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(walk(full));
    } else if (file.endsWith('.jsx')) {
      results.push(full);
    }
  }
  return results;
}

const files = walk('src');
const hooks = ['useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'useContext', 'useReducer'];
let errors = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const hook of hooks) {
    const hasUsage = new RegExp('\\b' + hook + '\\b').test(content);
    if (hasUsage) {
      const hasImport = new RegExp('import\\s+[^;]*\\b' + hook + '\\b[^;]*from\\s+[\'\"]react[\'\"]').test(content);
      const isReactImport = new RegExp('import\\s+React\\b').test(content);
      if (!hasImport && !isReactImport) {
        console.error(`MISSING IMPORT in ${file}: ${hook}`);
        errors++;
      }
    }
  }
}

if (errors > 0) {
  console.error(`Found ${errors} missing hook import(s).`);
  process.exit(1);
} else {
  console.log('All React hook imports are valid across all JSX files!');
}
