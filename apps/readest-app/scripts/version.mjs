import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url));

// SemVer 2.0.0, including prerelease and build metadata identifiers.
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function isSemanticVersion(version) {
  return SEMVER_PATTERN.test(version);
}

export function coreVersion(version) {
  const match = SEMVER_PATTERN.exec(version);
  return match ? [match[1], match[2], match[3]].join('.') : null;
}

async function readPackageJson() {
  const source = await readFile(packageJsonPath, 'utf8');
  return { source, data: JSON.parse(source) };
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function main() {
  const [commandOrVersion, explicitVersion, ...extraArgs] = process.argv.slice(2);
  if (extraArgs.length > 0) {
    fail('Usage: pnpm version:set <version> | pnpm version:check [version]');
    return;
  }

  const { source, data } = await readPackageJson();
  const checkOnly = commandOrVersion === '--check';
  const version = checkOnly ? (explicitVersion ?? data.version) : commandOrVersion;

  if (!version) {
    fail('Missing version. Example: pnpm version:set 1.0.1-alpha');
    return;
  }

  if (!isSemanticVersion(version)) {
    fail(`Invalid semantic version: ${version}`);
    return;
  }

  if (checkOnly) {
    console.log(`Valid semantic version: ${version}`);
    return;
  }

  data.version = version;
  const newline = source.endsWith('\r\n') ? '\r\n' : '\n';
  await writeFile(packageJsonPath, `${JSON.stringify(data, null, 2)}${newline}`, 'utf8');
  console.log(`Application version set to ${version} (core version ${coreVersion(version)}).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
