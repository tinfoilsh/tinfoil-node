#!/usr/bin/env node
/**
 * Version bumping script for tinfoil-node
 * Usage: node scripts/bump_version.js --version 1.2.3
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/**
 * Validate semantic version format
 * @param {string} version
 * @returns {boolean}
 */
function validateVersion(version) {
  const pattern = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9-]+)*(?:\+[a-zA-Z0-9-]+)*$/;
  return pattern.test(version);
}

/**
 * Update version in package.json and package-lock.json
 * @param {string} newVersion
 * @param {string} packageJsonPath
 */
function bumpVersion(newVersion, packageJsonPath = null) {
  if (!packageJsonPath) {
    packageJsonPath = path.join(process.cwd(), "package.json");
  }

  if (!fs.existsSync(packageJsonPath)) {
    console.error(`Error: ${packageJsonPath} not found`);
    process.exit(1);
  }

  if (!validateVersion(newVersion)) {
    console.error(`Error: Invalid version format: ${newVersion}`);
    console.error("Expected format: X.Y.Z or X.Y.Z-suffix");
    process.exit(1);
  }

  try {
    // Read current package.json
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const currentVersion = packageJson.version || "unknown";
    console.log(`Current version: ${currentVersion}`);

    // Update version
    packageJson.version = newVersion;

    // Write back to package.json with proper formatting
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2) + "\n"
    );

    // Update package-lock.json if it exists
    const packageLockPath = path.join(
      path.dirname(packageJsonPath),
      "package-lock.json"
    );
    if (fs.existsSync(packageLockPath)) {
      try {
        const packageLock = JSON.parse(
          fs.readFileSync(packageLockPath, "utf8")
        );
        packageLock.version = newVersion;

        // Update the root package version in lockfile
        if (packageLock.packages && packageLock.packages[""]) {
          packageLock.packages[""].version = newVersion;
        }

        fs.writeFileSync(
          packageLockPath,
          JSON.stringify(packageLock, null, 2) + "\n"
        );
        console.log("Updated package-lock.json");
      } catch (e) {
        console.warn("Warning: Could not update package-lock.json:", e.message);
      }
    }

    console.log(`Version updated: ${currentVersion} → ${newVersion}`);
  } catch (e) {
    console.error(`Error updating version: ${e.message}`);
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  let version = null;
  let file = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--version" && i + 1 < args.length) {
      version = args[i + 1];
      i++;
    } else if (args[i] === "--file" && i + 1 < args.length) {
      file = args[i + 1];
      i++;
    }
  }

  if (!version) {
    console.error("Error: --version is required");
    console.error("Usage: node scripts/bump_version.js --version 1.2.3");
    process.exit(1);
  }

  bumpVersion(version, file);
}

if (require.main === module) {
  main();
}

module.exports = { bumpVersion, validateVersion };
