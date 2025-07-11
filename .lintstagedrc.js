module.exports = {
  'src/**/*.{ts,tsx}': (files) => {
    const nonTestFiles = files.filter(file => !file.includes('.test.'));
    const commands = [];
    
    if (nonTestFiles.length > 0) {
      commands.push(`eslint --fix ${nonTestFiles.join(' ')}`);
    }
    
    if (files.length > 0) {
      commands.push(`prettier --write ${files.join(' ')}`);
    }
    
    return commands;
  },
  '!(src)/**/*.{ts,tsx}': ['prettier --write'],
  '*.{json,md,yml,yaml}': ['prettier --write']
};