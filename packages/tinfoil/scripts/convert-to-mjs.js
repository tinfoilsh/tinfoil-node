#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const esmDir = path.resolve(__dirname, '..', 'dist', 'esm');

function convertToMjs(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const resolvedPath = path.resolve(filePath);

    if (!resolvedPath.startsWith(esmDir)) {
      throw new Error(`Path traversal detected: ${resolvedPath} is outside ${esmDir}`);
    }

    const stat = fs.lstatSync(filePath);

    if (stat.isDirectory()) {
      convertToMjs(filePath);
    } else if (file.endsWith('.js') && !file.endsWith('.mjs')) {
      let content = fs.readFileSync(filePath, 'utf8');

      // Replace .js extensions with .mjs in import/export statements
      // Match: from "./path/to/file.js" -> from "./path/to/file.mjs"
      content = content.replace(/(from\s+["'])(\.[^"']+?)(\.js)(["'])/g, '$1$2.mjs$4');

      // Add .mjs to relative imports without any extension
      // Match: from "./path/to/file" -> from "./path/to/file.mjs"
      content = content.replace(/(from\s+["'])(\.[^"']+?)(["'])/g, (match, prefix, path, suffix) => {
        // Skip if already has .mjs extension
        if (path.endsWith('.mjs')) {
          return match;
        }
        // Skip if it has any other extension (like .json, .css, etc)
        if (path.match(/\.\w+$/)) {
          return match;
        }
        // Add .mjs extension
        return `${prefix}${path}.mjs${suffix}`;
      });

      // Handle dynamic imports with .js extension
      // Match: import("./path/to/file.js") -> import("./path/to/file.mjs")
      content = content.replace(/(import\s*\(\s*["'])(\.[^"']+?)(\.js)(["']\s*\))/g, '$1$2.mjs$4');

      // Add .mjs to dynamic imports without extension
      content = content.replace(/(import\s*\(\s*["'])(\.[^"']+?)(["']\s*\))/g, (match, prefix, path, suffix) => {
        // Skip if already has .mjs extension
        if (path.endsWith('.mjs')) {
          return match;
        }
        // Skip if it has any other extension
        if (path.match(/\.\w+$/)) {
          return match;
        }
        // Add .mjs extension
        return `${prefix}${path}.mjs${suffix}`;
      });

      const mjsPath = filePath.replace(/\.js$/, '.mjs');
      fs.writeFileSync(mjsPath, content);
      fs.unlinkSync(filePath);
    }
  }
}

convertToMjs(esmDir);
console.log('Converted all .js files to .mjs in dist/esm');
