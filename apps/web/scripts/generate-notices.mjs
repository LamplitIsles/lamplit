import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(web, '../..');
const report = JSON.parse(execFileSync('pnpm', [
  '--filter', '@lamplitisles/lamplit-web', 'licenses', 'list', '--json'
], { cwd: root, encoding: 'utf8' }));
const packages = Object.values(report).flat().sort((a, b) => a.name.localeCompare(b.name));

let notices = readFileSync(resolve(root, 'LICENSE'), 'utf8');
notices += '\n\nLamplit website: bundled assets and build-tool dependency notices\n';
notices += 'This inventory includes build-only tools as well as bundled components.\n';
notices += 'Upstream components retain their own licenses.\n';
for (const dependency of packages) {
  for (const path of dependency.paths) {
    const metadata = JSON.parse(readFileSync(resolve(path, 'package.json'), 'utf8'));
    notices += `\n\n${dependency.name}@${metadata.version} — ${dependency.license}\n${'='.repeat(60)}\n`;
    if (dependency.homepage) notices += `${dependency.homepage}\n`;
    const licenseFiles = readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^(licen[cs]e|copying|notice)(\.|$)/i.test(entry.name))
      .map((entry) => entry.name).sort();
    for (const file of licenseFiles) notices += `\n${readFileSync(resolve(path, file), 'utf8')}\n`;
  }
}
writeFileSync(resolve(web, 'static/licenses.txt'), notices);
