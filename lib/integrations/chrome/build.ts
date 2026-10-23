// path: lib/integrations/chrome/build.ts
// Builds the browser extension from the files in `extension/` for one platform address. The manifest is made here (Manifest V3)
// so that the only address the extension may call is the address of the platform it was built for.
// Run: npx tsx lib/integrations/chrome/build.ts https://app.example.com ./dist/kd-extension
import fs from 'node:fs';
import path from 'node:path';

export interface Manifest {
  manifest_version: 3;
  name: string;
  version: string;
  description: string;
  action: { default_popup: string; default_title: string };
  permissions: string[];
  host_permissions: string[];
  content_security_policy: { extension_pages: string };
}

/** The origin ("https://host") of a platform address; throws for anything that is not https without credentials or a path. */
export function originOf(address: string): string {
  const url = new URL(address);
  if (url.protocol !== 'https:') throw new Error('The platform address must use https.');
  if (url.username !== '' || url.password !== '')
    throw new Error('The platform address must not contain a user name or password.');
  return url.origin;
}

export function manifestFor(origin: string, version: string): Manifest {
  if (!/^\d{1,4}(\.\d{1,4}){0,3}$/.test(version))
    throw new Error('The version must look like 1.0.0.');
  return {
    manifest_version: 3,
    name: 'KD SOLUTION IT',
    version,
    description:
      'Find clients, see your invoice summary and make a draft invoice from the browser.',
    action: { default_popup: 'popup.html', default_title: 'KD SOLUTION IT' },
    permissions: ['storage'],
    host_permissions: [`${origin}/api/public/v1/*`],
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
  };
}

export const configScript = (origin: string): string =>
  `globalThis.KD_API_ORIGIN = ${JSON.stringify(origin)};\n`;

const FILES = ['popup.html', 'popup.css', 'popup.js'] as const;

export function buildExtension(address: string, outDir: string, version = '1.0.0'): string[] {
  const origin = originOf(address);
  const source = path.join(__dirname, 'extension');
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of FILES) fs.copyFileSync(path.join(source, f), path.join(outDir, f));
  fs.writeFileSync(path.join(outDir, 'config.js'), configScript(origin));
  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(manifestFor(origin, version), null, 2)}\n`,
  );
  return [...FILES, 'config.js', 'manifest.json'];
}

if (require.main === module) {
  const [address, outDir] = process.argv.slice(2);
  if (!address || !outDir) {
    process.stderr.write(
      'Usage: npx tsx lib/integrations/chrome/build.ts <https address> <output folder>\n',
    );
    process.exit(2);
  }
  process.stdout.write(`${buildExtension(address, outDir).join('\n')}\n`);
}
