#!/usr/bin/env node
/**
 * Purpose:
 * - Auto-increment app patch version in appinfo.json for each CI build.
 *
 * Render usage:
 * - build-ipk.sh runs this script before packaging, so each deployment gets
 *   a unique semantic version (major.minor.patch).
 *
 * Version auto update:
 * - Reads appinfo.json version, validates x.y.z format, increments only patch,
 *   then writes the updated version back safely.
 */

const fs = require("fs");
const path = require("path");

const appInfoPath = path.join(process.cwd(), "appinfo.json");

function fail(message) {
  console.error(`[version-bump] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(appInfoPath)) {
  fail("appinfo.json not found in project root.");
}

let raw;
try {
  raw = fs.readFileSync(appInfoPath, "utf8");
} catch (err) {
  fail(`Unable to read appinfo.json: ${err.message}`);
}

let appInfo;
try {
  appInfo = JSON.parse(raw);
} catch (err) {
  fail(`appinfo.json is not valid JSON: ${err.message}`);
}

if (!appInfo.version) {
  fail("appinfo.json is missing required 'version' field.");
}

const version = String(appInfo.version).trim();
const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!match) {
  fail(`Invalid semantic version '${version}'. Expected format: major.minor.patch`);
}

const major = Number(match[1]);
const minor = Number(match[2]);
const patch = Number(match[3]);

const nextVersion = `${major}.${minor}.${patch + 1}`;
appInfo.version = nextVersion;

try {
  const nextJson = `${JSON.stringify(appInfo, null, 2)}\n`;
  fs.writeFileSync(appInfoPath, nextJson, "utf8");
} catch (err) {
  fail(`Unable to write updated appinfo.json: ${err.message}`);
}

console.log(`[version-bump] ${version} -> ${nextVersion}`);