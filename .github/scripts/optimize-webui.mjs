import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const DEFINED_CUSTOM_PROPERTY_MAP = Object.freeze({
  '--insets-bottom': '--a',
  '--insets-top': '--b',
  '--md-sys-color-background': '--c',
  '--md-sys-color-error': '--d',
  '--md-sys-color-error-container': '--e',
  '--md-sys-color-on-error': '--f',
  '--md-sys-color-on-error-container': '--g',
  '--md-sys-color-on-primary': '--h',
  '--md-sys-color-on-primary-container': '--i',
  '--md-sys-color-on-secondary-container': '--j',
  '--md-sys-color-on-surface': '--k',
  '--md-sys-color-on-surface-variant': '--l',
  '--md-sys-color-outline': '--m',
  '--md-sys-color-primary': '--n',
  '--md-sys-color-primary-container': '--o',
  '--md-sys-color-scrim': '--p',
  '--md-sys-color-secondary-container': '--q',
  '--md-sys-color-shadow': '--r',
  '--md-sys-color-surface': '--s',
  '--md-sys-color-surface-container': '--t',
  '--md-sys-color-surface-container-high': '--u',
  '--md-sys-color-surface-container-highest': '--v',
  '--nav-height': '--w',
  '--nm-elevation-2': '--x',
  '--nm-font-family': '--y',
  '--nm-gap-relaxed': '--z',
  '--nm-nav-background': '--A',
  '--nm-page-bottom-gap': '--B',
  '--nm-page-padding-inline': '--C',
  '--nm-page-padding-top': '--D',
  '--nm-scrim': '--E',
  '--nm-segment-gap': '--F',
  '--nm-segment-inner-corner': '--G',
  '--nm-segment-outer-corner': '--H',
  '--top-app-bar-opacity': '--I',
  '--top-app-title-opacity': '--J',
});

const RUNTIME_CUSTOM_PROPERTY_MAP = Object.freeze({
  '--app-selector-height': '--K',
  '--app-selector-top': '--L',
});

const CUSTOM_PROPERTY_MAP = Object.freeze({
  ...DEFINED_CUSTOM_PROPERTY_MAP,
  ...RUNTIME_CUSTOM_PROPERTY_MAP,
});

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

const DOM_NAMES = Object.freeze([
  'app-details', 'app-icon-img', 'app-item', 'app-list', 'app-list-wrapper', 'app-meta', 'app-name', 'app-pkg',
  'app-selector-modal', 'bottom-nav', 'btn-filter-toggle', 'btn-hot-action', 'btn-skip-action', 'btn-text', 'content-enter',
  'custom-fab', 'custom-switch', 'custom-tonal-btn', 'empty-face', 'empty-list-placeholder', 'empty-state',
  'empty-text', 'error-message', 'exclusion-app', 'exclusions-list', 'fab-container', 'file-count',
  'header-title', 'home-segment-group', 'home-segment-row', 'home-status-card', 'info-data', 'info-label',
  'info-value', 'loading-spinner', 'md-dialog', 'md-dialog-actions', 'md-dialog-title', 'md-text-field',
  'modal-content', 'modal-fab', 'modal-header', 'modal-overlay', 'mode-badge', 'module-card', 'module-divider',
  'module-extension', 'module-header', 'module-info', 'nav-icon', 'nav-item', 'page-container',
  'pull-to-refresh-indicator', 'search-box', 'segment-card', 'segment-icon', 'segment-section-label',
  'setting-item', 'setting-text', 'settings-segment-group', 'show-title', 'status-icon', 'status-label',
  'status-text-col', 'status-title-row', 'switch-busy', 'switch-input', 'switch-thumb', 'switch-track',
  'system-chip', 'top-app-bar', 'top-app-bar-title', 'uid-input-modal', 'uid-label', 'view-content',
  'view-exclusions', 'view-modules', 'view-options', 'viewport-locked',
]);
const NAME_PATTERN = /(?<![A-Za-z0-9_-])(?:--)?[A-Za-z_][A-Za-z0-9_-]*/g;

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

const definedOldNames = Object.keys(DEFINED_CUSTOM_PROPERTY_MAP);
const definedNewNames = Object.values(DEFINED_CUSTOM_PROPERTY_MAP);
const oldNames = Object.keys(CUSTOM_PROPERTY_MAP);
const newNames = Object.values(CUSTOM_PROPERTY_MAP);
assert(new Set(newNames).size === newNames.length, 'Short custom-property names must be unique');
assert(newNames.every((name) => /^--[A-Za-z]$/.test(name)), 'Short custom-property names must use one letter');
assertSameSet(extractDefinitions(files['styles.css']), definedOldNames, 'Locally defined custom properties');

const originalNames = new Set(Object.values(files).flatMap((text) => [...text.matchAll(NAME_PATTERN)].map((match) => match[0])));
for (const name of newNames) {
  assert(!originalNames.has(name), `Short custom-property name collides with existing token: ${name}`);
}

assertSameSet(extractCustomProperties(files['styles.css']), [...oldNames, ...EXTERNAL_CUSTOM_PROPERTIES], 'Original CSS custom-property tokens');
for (const name of EXTERNAL_CUSTOM_PROPERTIES) {
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

const replacements = new Map(Object.entries(CUSTOM_PROPERTY_MAP));
let nextDomName = 0;
for (const name of DOM_NAMES) {
  assert(originalNames.has(name), `Private DOM name is missing: ${name}`);
  let shortName;
  do { shortName = `_${(nextDomName++).toString(36)}`; } while (originalNames.has(shortName));
  replacements.set(name, shortName);
}
const optimized = Object.fromEntries(Object.entries(files).map(([name, text]) => [
  name, text.replace(NAME_PATTERN, (token) => replacements.get(token) ?? token),
]));

for (const [name, content] of Object.entries(optimized)) {
  const remaining = [...content.matchAll(NAME_PATTERN)].map((match) => match[0]).filter((token) => replacements.has(token));
  assert(remaining.length === 0, `Unrenamed private names in ${name}: ${sortedUnique(remaining).join(', ')}`);
}
assertSameSet(extractDefinitions(optimized['styles.css']), definedNewNames, 'Optimized custom-property definitions');

assertSameSet(extractCustomProperties(optimized['styles.css']), [...newNames, ...EXTERNAL_CUSTOM_PROPERTIES], 'Optimized CSS custom-property tokens');

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
console.log(`Renamed ${DOM_NAMES.length} private DOM names`);
