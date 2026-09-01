import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const DEFINED_CUSTOM_PROPERTY_MAP = Object.freeze({
  '--insets-bottom': '--n0',
  '--insets-top': '--n1',
  '--md-sys-color-background': '--n2',
  '--md-sys-color-error': '--n3',
  '--md-sys-color-error-container': '--n4',
  '--md-sys-color-on-error': '--n5',
  '--md-sys-color-on-error-container': '--n6',
  '--md-sys-color-on-primary': '--n7',
  '--md-sys-color-on-primary-container': '--n8',
  '--md-sys-color-on-secondary-container': '--n9',
  '--md-sys-color-on-surface': '--na',
  '--md-sys-color-on-surface-variant': '--nb',
  '--md-sys-color-outline': '--nc',
  '--md-sys-color-primary': '--nd',
  '--md-sys-color-primary-container': '--ne',
  '--md-sys-color-scrim': '--nf',
  '--md-sys-color-secondary-container': '--ng',
  '--md-sys-color-shadow': '--nh',
  '--md-sys-color-surface': '--ni',
  '--md-sys-color-surface-container': '--nj',
  '--md-sys-color-surface-container-high': '--nk',
  '--md-sys-color-surface-container-highest': '--nl',
  '--nav-height': '--nm',
  '--nm-elevation-2': '--nn',
  '--nm-font-family': '--no',
  '--nm-gap-relaxed': '--np',
  '--nm-nav-background': '--nq',
  '--nm-page-bottom-gap': '--nr',
  '--nm-page-padding-inline': '--ns',
  '--nm-page-padding-top': '--nt',
  '--nm-scrim': '--nu',
  '--nm-segment-gap': '--nv',
  '--nm-segment-inner-corner': '--nw',
  '--nm-segment-outer-corner': '--nx',
  '--top-app-bar-opacity': '--ny',
  '--top-app-title-opacity': '--nz',
});

const RUNTIME_CUSTOM_PROPERTY_MAP = Object.freeze({
  '--app-selector-height': '--n10',
  '--app-selector-top': '--n11',
});

const CUSTOM_PROPERTY_MAP = Object.freeze({
  ...DEFINED_CUSTOM_PROPERTY_MAP,
  ...RUNTIME_CUSTOM_PROPERTY_MAP,
});

// These are supplied at runtime by KernelSU's internal stylesheets.
const EXTERNAL_CUSTOM_PROPERTIES = Object.freeze([
  '--background',
  '--error',
  '--errorContainer',
  '--onError',
  '--onErrorContainer',
  '--onPrimary',
  '--onPrimaryContainer',
  '--onSecondaryContainer',
  '--onSurface',
  '--onSurfaceVariant',
  '--outline',
  '--primary',
  '--primaryContainer',
  '--secondaryContainer',
  '--shadow',
  '--surface',
  '--surfaceContainer',
  '--surfaceContainerHigh',
  '--surfaceContainerHighest',
  '--window-inset-bottom',
  '--window-inset-top',
]);

const REQUIRED_IMPORTS = Object.freeze([
  '/internal/insets.css',
  '/internal/colors.css',
]);

const webroot = process.argv[2];
if (!webroot) {
  throw new Error('Usage: node optimize-webui.mjs <release-webroot>');
}

const paths = Object.fromEntries(
  ['index.html', 'index.js', 'styles.css'].map((name) => [name, join(resolve(webroot), name)]),
);
const files = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([name, path]) => [name, await readFile(path, 'utf8')])),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function extractCustomProperties(text) {
  return [...text.matchAll(/--[A-Za-z_][A-Za-z0-9_-]*/g)].map((match) => match[0]);
}

function extractDefinitions(css) {
  return [...css.matchAll(/(--[A-Za-z_][A-Za-z0-9_-]*)\s*:/g)].map((match) => match[1]);
}

function extractJsCustomProperties(js) {
  return [...js.matchAll(/\.(?:getPropertyValue|setProperty|removeProperty)\(\s*["'](--[A-Za-z_][A-Za-z0-9_-]*)["']/g)]
    .map((match) => match[1]);
}

function assertSameSet(actual, expected, label) {
  const actualSorted = sortedUnique(actual);
  const expectedSorted = sortedUnique(expected);
  const missing = expectedSorted.filter((value) => !actualSorted.includes(value));
  const unexpected = actualSorted.filter((value) => !expectedSorted.includes(value));
  assert(
    missing.length === 0 && unexpected.length === 0,
    `${label} mismatch; missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}`,
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function propertyPattern(name) {
  return new RegExp(`(?<![A-Za-z0-9_-])${escapeRegex(name)}(?![A-Za-z0-9_-])`, 'g');
}

const definedOldNames = Object.keys(DEFINED_CUSTOM_PROPERTY_MAP);
const definedNewNames = Object.values(DEFINED_CUSTOM_PROPERTY_MAP);
const oldNames = Object.keys(CUSTOM_PROPERTY_MAP);
const newNames = Object.values(CUSTOM_PROPERTY_MAP);
assert(new Set(newNames).size === newNames.length, 'Short custom-property names must be unique');
assert(newNames.every((name) => /^--n[0-9a-z]+$/.test(name)), 'Short custom-property names must use the --n<base36> prefix');
assertSameSet(extractDefinitions(files['styles.css']), definedOldNames, 'Locally defined custom properties');

const originalTokens = new Set(
  Object.values(files).flatMap((text) => extractCustomProperties(text)),
);
for (const name of newNames) {
  assert(!originalTokens.has(name), `Short custom-property name collides with existing token: ${name}`);
}

const originalDefinitions = new Set(extractDefinitions(files['styles.css']));
const originalStyleTokens = new Set(extractCustomProperties(files['styles.css']));
assertSameSet(originalStyleTokens, [...oldNames, ...EXTERNAL_CUSTOM_PROPERTIES], 'Original CSS custom-property tokens');
for (const name of EXTERNAL_CUSTOM_PROPERTIES) {
  assert(originalStyleTokens.has(name), `Required external custom property is missing: ${name}`);
  assert(!originalDefinitions.has(name), `External custom property must not be locally defined: ${name}`);
  assert(!(name in CUSTOM_PROPERTY_MAP), `External custom property must not be renamed: ${name}`);
}

const firstLocalRule = files['styles.css'].indexOf(':root');
assert(firstLocalRule >= 0, 'Bundled CSS is missing its :root rule');
for (const path of REQUIRED_IMPORTS) {
  const pattern = new RegExp(`@import\\s*(?:url\\(\\s*)?["']${escapeRegex(path)}["']\\s*\\)?\\s*;`, 'g');
  const matches = [...files['styles.css'].matchAll(pattern)];
  assert(matches.length === 1, `Expected exactly one ${path} import, found ${matches.length}`);
  assert(matches[0].index < firstLocalRule, `${path} import must precede local CSS rules`);
}

const optimized = { ...files };
for (const [oldName, newName] of Object.entries(CUSTOM_PROPERTY_MAP)) {
  for (const name of Object.keys(optimized)) {
    optimized[name] = optimized[name].replace(propertyPattern(oldName), newName);
  }
}

for (const oldName of oldNames) {
  for (const [name, content] of Object.entries(optimized)) {
    assert(!propertyPattern(oldName).test(content), `Old custom property remains in ${name}: ${oldName}`);
  }
}
assertSameSet(extractDefinitions(optimized['styles.css']), definedNewNames, 'Optimized custom-property definitions');

const optimizedStyleTokens = new Set(extractCustomProperties(optimized['styles.css']));
assertSameSet(optimizedStyleTokens, [...newNames, ...EXTERNAL_CUSTOM_PROPERTIES], 'Optimized CSS custom-property tokens');
for (const name of EXTERNAL_CUSTOM_PROPERTIES) {
  assert(optimizedStyleTokens.has(name), `External custom property was lost: ${name}`);
}

const jsPropertyNames = [
  '--md-sys-color-background',
  '--md-sys-color-surface',
  '--top-app-bar-opacity',
  '--top-app-title-opacity',
  '--app-selector-height',
  '--app-selector-top',
];
assertSameSet(extractJsCustomProperties(files['index.js']), jsPropertyNames, 'Original JS custom-property references');
assertSameSet(
  extractJsCustomProperties(optimized['index.js']),
  jsPropertyNames.map((name) => CUSTOM_PROPERTY_MAP[name]),
  'Optimized JS custom-property references',
);

await Promise.all(
  Object.entries(optimized).map(([name, content]) => writeFile(paths[name], content, 'utf8')),
);

const beforeBytes = Object.values(files).reduce((sum, content) => sum + Buffer.byteLength(content), 0);
const afterBytes = Object.values(optimized).reduce((sum, content) => sum + Buffer.byteLength(content), 0);
console.log(`Optimized WebUI: ${beforeBytes} -> ${afterBytes} bytes (${beforeBytes - afterBytes} saved)`);
console.log(`Renamed ${oldNames.length} local custom properties; preserved ${EXTERNAL_CUSTOM_PROPERTIES.length} external properties`);
