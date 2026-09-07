#!/usr/bin/env node
const tag = process.argv[2] ?? "";
if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
  console.error("release tags must be stable vX.Y.Z (pre-releases are not publishable)");
  process.exit(2);
}
console.log(`validated stable release tag ${tag}`);
