// KernelSU exec wrapper
let _cbId = 0;
function exec(cmd) {
    return new Promise((resolve) => {
        const key = `_nm_cb_${Date.now()}_${_cbId++}`;
        const cleanup = () => { delete window[key]; };
        window[key] = (errno, stdout, stderr) => {
            cleanup();
            resolve({ errno, stdout: stdout || '', stderr: stderr || '' });
        };
        try {
            if (typeof ksu !== 'undefined' && ksu.exec) {
                ksu.exec(cmd, '{}', key);
            } else {
                cleanup();
                resolve({ errno: 1, stdout: '', stderr: 'ksu not defined' });
            }
        } catch (e) {
            cleanup();
            resolve({ errno: 1, stdout: '', stderr: e?.message || 'failed' });
        }
    });
}

function showToast(msg) {
    if (typeof ksu !== 'undefined' && ksu.toast) {
        try { ksu.toast(msg); } catch (e) {}
    }
}

// Constants & Helpers
const MOD_DIR = "/data/adb/modules";
const NM_DATA = "/data/adb/nomount";
const NM_BIN = "/data/adb/modules/nomount/bin/nm";
const FILES = { disable: `${NM_DATA}/disable`, exclusions: `${NM_DATA}/.exclusion_list.json`, isolated: `${NM_DATA}/.block_isolated_uids` };
const shellQuote = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
const APP_ICON_FALLBACK = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzgwODA4MCI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6bTAgMThjLTQuNDEgMC04LTMuNTktOC04czMuNTktOCA4LTggOCAzLjU5IDggOC0zLjU5IDgtOCA4eiIvPjwvc3ZnPg==";
const viewLoadState = { 'view-home': false, 'view-modules': false, 'view-exclusions': false, 'view-options': false };
const numberFormatter = new Intl.NumberFormat('zh-CN');
const formatNumber = value => numberFormatter.format(value);

const delay = ms => new Promise(r => setTimeout(r, ms));

function el(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else node.setAttribute(k, v);
    }
    for (const c of children) {
        if (c == null || c === false) continue;
        node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
}

const renderTextState = (container, cls, text) => container.replaceChildren(el('div', { class: cls }, text));
function renderEmptyState(container, face, text) {
    container.replaceChildren(
        el('div', { class: 'empty-state' }, el('div', { class: 'empty-face' }, face), el('div', { class: 'empty-text' }, text)
        )
    );
}

// Icons
customElements.define('md-icon', class extends HTMLElement {});
const ICON_PATHS = {
    account_tree: 'M600-200v-40h-80q-33 0-56.5-23.5T440-320v-320h-80v40q0 33-23.5 56.5T280-520H160q-33 0-56.5-23.5T80-600v-160q0-33 23.5-56.5T160-840h120q33 0 56.5 23.5T360-760v40h240v-40q0-33 23.5-56.5T680-840h120q33 0 56.5 23.5T880-760v160q0 33-23.5 56.5T800-520H680q-33 0-56.5-23.5T600-600v-40h-80v320h80v-40q0-33 23.5-56.5T680-440h120q33 0 56.5 23.5T880-360v160q0 33-23.5 56.5T800-120H680q-33 0-56.5-23.5T600-200ZM160-760v160-160Zm520 400v160-160Zm0-400v160-160Zm0 160h120v-160H680v160Zm0 400h120v-160H680v160ZM160-600h120v-160H160v160Z',
    add: 'M440-440H240q-17 0-28.5-11.5T200-480q0-17 11.5-28.5T240-520h200v-200q0-17 11.5-28.5T480-760q17 0 28.5 11.5T520-720v200h200q17 0 28.5 11.5T760-480q0 17-11.5 28.5T720-440H520v200q0 17-11.5 28.5T480-200q-17 0-28.5-11.5T440-240v-200Z',
    check_circle: 'm424-408-86-86q-11-11-28-11t-28 11q-11 11-11 28t11 28l114 114q12 12 28 12t28-12l226-226q11-11 11-28t-11-28q-11-11-28-11t-28 11L424-408Zm56 328q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z',
    close: 'M480-424 284-228q-11 11-28 11t-28-11q-11-11-11-28t11-28l196-196-196-196q-11-11-11-28t11-28q11-11 28-11t28 11l196 196 196-196q11-11 28-11t28 11q11 11 11 28t-11 28L536-480l196 196q11 11 11 28t-11 28q-11 11-28 11t-28-11L480-424Z',
    delete: 'M280-120q-33 0-56.5-23.5T200-200v-520q-17 0-28.5-11.5T160-760q0-17 11.5-28.5T200-800h160q0-17 11.5-28.5T400-840h160q17 0 28.5 11.5T600-800h160q17 0 28.5 11.5T800-760q0 17-11.5 28.5T760-720v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM428.5-291.5Q440-303 440-320v-280q0-17-11.5-28.5T400-640q-17 0-28.5 11.5T360-600v280q0 17 11.5 28.5T400-280q17 0 28.5-11.5Zm160 0Q600-303 600-320v-280q0-17-11.5-28.5T560-640q-17 0-28.5 11.5T520-600v280q0 17 11.5 28.5T560-280q17 0 28.5-11.5ZM280-720v520-520Z',
    error: 'M508.5-291.5Q520-303 520-320t-11.5-28.5Q497-360 480-360t-28.5 11.5Q440-337 440-320t11.5 28.5Q463-280 480-280t28.5-11.5Zm0-160Q520-463 520-480v-160q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640v160q0 17 11.5 28.5T480-440q17 0 28.5-11.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z',
    extension: 'M352-120H200q-33 0-56.5-23.5T120-200v-152q48 0 84-30.5t36-77.5q0-47-36-77.5T120-568v-152q0-33 23.5-56.5T200-800h160q0-42 29-71t71-29q42 0 71 29t29 71h160q33 0 56.5 23.5T800-720v160q42 0 71 29t29 71q0 42-29 71t-71 29v160q0 33-23.5 56.5T720-120H568q0-50-31.5-85T460-240q-45 0-76.5 35T352-120Zm-152-80h85q24-66 77-93t98-27q45 0 98 27t77 93h85v-240h80q8 0 14-6t6-14q0-8-6-14t-14-6h-80v-240H480v-80q0-8-6-14t-14-6q-8 0-14 6t-6 14v80H200v88q54 20 87 67t33 105q0 57-33 104t-87 68v88Zm260-260Z',
    filter_list: 'M440-240q-17 0-28.5-11.5T400-280q0-17 11.5-28.5T440-320h80q17 0 28.5 11.5T560-280q0 17-11.5 28.5T520-240h-80ZM280-440q-17 0-28.5-11.5T240-480q0-17 11.5-28.5T280-520h400q17 0 28.5 11.5T720-480q0 17-11.5 28.5T680-440H280ZM160-640q-17 0-28.5-11.5T120-680q0-17 11.5-28.5T160-720h640q17 0 28.5 11.5T840-680q0 17-11.5 28.5T800-640H160Z',
    home: 'M240-200h120v-200q0-17 11.5-28.5T400-440h160q17 0 28.5 11.5T600-400v200h120v-360L480-740 240-560v360Zm-80 0v-360q0-19 8.5-36t23.5-28l240-180q21-16 48-16t48 16l240 180q15 11 23.5 28t8.5 36v360q0 33-23.5 56.5T720-120H560q-17 0-28.5-11.5T520-160v-200h-80v200q0 17-11.5 28.5T400-120H240q-33 0-56.5-23.5T160-200Zm320-270Z',
    memory: 'M360-400V-560Q360-577.2 371.6-588.4Q383.2-600 400-600h160q17.2 0 28.4 11.6T600-560v160q0 16.8-11.6 28.4T560-360H400q-16.8 0-28.4-11.6T360-400Zm80-40h80V-520H440v80ZM360-160V-200H280q-32.8 0-56.4-23.6T200-280V-360H160q-16.8 0-28.4-11.6T120-400t11.6-28.4T160-440H200V-520H160q-16.8 0-28.4-11.6Q120-542.8 120-560Q120-577.2 131.6-588.4T160-600H200V-680Q200-712.8 223.6-736.4T280-760H360V-800Q360-817.2 371.6-828.4Q383.2-840 400-840t28.4 11.6T440-800V-760h80V-800q0-17.2 11.6-28.4T560-840t28.4 11.6T600-800V-760h80q32.8 0 56.4 23.6Q760-712.8 760-680V-600h40q17.2 0 28.4 11.6T840-560t-11.6 28.4T800-520H760v80h40q17.2 0 28.4 11.6T840-400t-11.6 28.4T800-360H760v80q0 32.8-23.6 56.4T680-200H600v40q0 17.2-11.6 28.4T560-120t-28.4-11.6Q520-142.8 520-160V-200H440v40q0 17.2-11.6 28.4T400-120q-16.8 0-28.4-11.6Q360-142.8 360-160Zm320-120V-680H280V-280H680Zm-200-200Z',
    refresh: 'M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-70q0-17 11.5-28.5T760-800q17 0 28.5 11.5T800-760v200q0 17-11.5 28.5T760-520H560q-17 0-28.5-11.5T520-560q0-17 11.5-28.5T560-600h128q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q68 0 124.5-34.5T692-367q8-14 22.5-19.5t29.5-.5q16 5 23 21t-1 30q-41 80-117 128t-169 48Z',
    search: 'M380-320q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l224 224q11 11 11 28t-11 28q-11 11-28 11t-28-11L532-372q-30 24-69 38t-83 14Zm0-80q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z',
    settings: 'M433-80q-27 0-46.5-18T363-142l-9-66q-13-5-24.5-12T307-235l-62 26q-25 11-50 2t-39-32l-47-82q-14-23-8-49t27-43l53-40q-1-7-1-13.5v-27q0-6.5 1-13.5l-53-40q-21-17-27-43t8-49l47-82q14-23 39-32t50 2l62 26q11-8 23-15t24-12l9-66q4-26 23.5-44t46.5-18h94q27 0 46.5 18t23.5 44l9 66q13 5 24.5 12t22.5 15l62-26q25-11 50-2t39 32l47 82q14 23 8 49t-27 43l-53 40q1 7 1 13.5v27q0 6.5-2 13.5l53 40q21 17 27 43t-8 49l-48 82q-14 23-39 32t-50-2l-60-26q-11 8-23 15t-24 12l-9 66q-4 26-23.5 44T527-80h-94Zm7-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z',
    shield: 'M467-85q-6-1-12-3-135-45-215-166.5T160-516v-189q0-25 14.5-45t37.5-29l240-90q14-5 28-5t28 5l240 90q23 9 37.5 29t14.5 45v189q0 140-80 261.5T505-88q-6 2-12 3t-13 1q-7 0-13-1Zm13-79q104-33 172-132t68-220v-189l-240-90-240 90v189q0 121 68 220t172 132Zm0-316Z',
    devices: 'M480-540ZM440-160H120q-16.8 0-28.4-11.6Q80-182.8 80-200t11.6-28.4T120-240h320q17.2 0 28.4 11.6T480-200t-11.6 28.4T440-160ZM200-280q-33.2 0-56.4-23.6T120-360V-720Q120-752.8 143.6-776.4T200-800H800q17.2 0 28.4 11.6T840-760T828.4-731.6T800-720H200v360h240q17.2 0 28.4 11.6T480-320t-11.6 28.4T440-280H200Zm600 40V-560H640v320h160Zm-180 80q-25.2 0-42.4-17.6T560-220v-360q0-25.2 17.6-42.4T620-640h200q25.2 0 42.4 17.6T880-580v360q0 25.2-17.6 42.4T820-160h-200ZM720-460q12.8 0 21.6-9.2t8.4-20.8q0-13.2-8.4-21.6T720-520q-12 0-20.8 8.4q-9.2 8.4-9.2 21.6q0 12 9.2 20.8T720-460ZM720-400Z',
    edit: 'M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z',
    check: 'M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z'
};

const FILLED_ICON_PATHS = {
    extension: 'M352-120H200q-33 0-56.5-23.5T120-200v-152q48 0 84-30.5t36-77.5q0-47-36-77.5T120-568v-152q0-33 23.5-56.5T200-800h160q0-42 29-71t71-29q42 0 71 29t29 71h160q33 0 56.5 23.5T800-720v160q42 0 71 29t29 71q0 42-29 71t-71 29v160q0 33-23.5 56.5T720-120H568q0-50-31.5-85T460-240q-45 0-76.5 35T352-120Z',
    home: 'M160-200v-360q0-19 8.5-36t23.5-28l240-180q21-16 48-16t48 16l240 180q15 11 23.5 28t8.5 36v360q0 33-23.5 56.5T720-120H600q-17 0-28.5-11.5T560-160v-200q0-17-11.5-28.5T520-400h-80q-17 0-28.5 11.5T400-360v200q0 17-11.5 28.5T360-120H240q-33 0-56.5-23.5T160-200Z',
    settings: 'M433-80q-27 0-46.5-18T363-142l-9-66q-13-5-24.5-12T307-235l-62 26q-25 11-50 2t-39-32l-47-82q-14-23-8-49t27-43l53-40q-1-7-1-13.5v-27q0-6.5 1-13.5l-53-40q-21-17-27-43t8-49l47-82q14-23 39-32t50 2l62 26q11-8 23-15t24-12l9-66q4-26 23.5-44t46.5-18h94q27 0 46.5 18t23.5 44l9 66q13 5 24.5 12t22.5 15l62-26q25-11 50-2t39 32l47 82q14 23 8 49t-27 43l-53 40q1 7 1 13.5v27q0 6.5-2 13.5l53 40q21 17 27 43t-8 49l-48 82q-14 23-39 32t-50-2l-60-26q-11 8-23 15t-24 12l-9 66q-4 26-23.5 44T527-80h-94Zm49-260q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Z',
    shield: 'M467-85q-6-1-12-3-135-45-215-166.5T160-516v-189q0-25 14.5-45t37.5-29l240-90q14-5 28-5t28 5l240 90q23 9 37.5 29t14.5 45v189q0 140-80 261.5T505-88q-6 2-12 3t-13 1q-7 0-13-1Z'
};

const svgCache = {};
function setIcon(icon, name, variant = 'outline') {
    if (!icon) return;
    if (icon.dataset.icon === name && icon.dataset.iconVariant === variant) return;

    const pathData = (variant === 'filled' ? FILLED_ICON_PATHS[name] : null) || ICON_PATHS[name];
    if (!pathData) return;

    const cacheKey = `${name}_${variant}`;
    let svgMarkup = svgCache[cacheKey];
    if (!svgMarkup) {
        svgMarkup = `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="${pathData}"/></svg>`;
        svgCache[cacheKey] = svgMarkup;
    }

    icon.dataset.icon = name;
    icon.dataset.iconVariant = variant;
    if (!icon.hasAttribute('aria-hidden')) icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = svgMarkup;
}

function applyIcons() {
    document.querySelectorAll('md-icon').forEach(icon => {
        const name = icon.dataset.icon || (icon.textContent ? icon.textContent.trim() : null);
        if (name) setIcon(icon, name);
    });
}

function syncSystemBarTheme() {
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) return;

    const cs = getComputedStyle(document.documentElement);
    const surfaceColor = cs.getPropertyValue('--md-sys-color-background').trim() ||
                         cs.getPropertyValue('--md-sys-color-surface').trim();
    if (surfaceColor) metaTheme.setAttribute('content', surfaceColor);
}

const homeUI = {};
function getHomeElements() {
    if (!homeUI.kernel) {
        homeUI.stats = document.getElementById('injection-stats');
        homeUI.kernel = document.getElementById('kernel-version');
        homeUI.device = document.getElementById('device-model');
        homeUI.android = document.getElementById('android-ver');
        homeUI.statusTitle = document.getElementById('status-title');
        homeUI.statusLabel = document.getElementById('status-indicator');
        homeUI.statusCard = document.querySelector('.home-status-card');
        homeUI.statusIcon = document.getElementById('status-icon');
        homeUI.modeBadge = document.getElementById('nm-mode-badge');
    }
    return homeUI;
}

const UI = {};
let currentActiveViewId = 'view-home';
let currentActiveViewTitle = '';

let nmHistory = { level: 0, depth: 0 };
history.replaceState(nmHistory, '');

function nmPush(state) {
    nmHistory = { level: state.level, depth: nmHistory.depth + 1 };
    history.pushState(nmHistory, '');
}
function nmReplace(state) {
    nmHistory = { level: state.level, depth: nmHistory.depth };
    history.replaceState(nmHistory, '');
}

window.addEventListener('popstate', (e) => {
    const prev = nmHistory;
    const next = e.state || { level: 0, depth: 0 };

    if (prev.level === 3 && next.level < 3)
        closeUidModalFromHistory();
    if (prev.level === 2 && next.level < 2) {
        closeAppSelector(true);
        exitMultiSelectMode();
    }
    if (prev.level >= 1 && next.level === 0)
        switchToTab('view-home', false);

    nmHistory = next;
});

async function switchToTab(target, pushToHistory = true) {
    if (currentActiveViewId === target && document.getElementById(target)?.classList.contains('active')) return;

    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view-content');
    const fab = document.getElementById('fab-container');

    navItems.forEach(nav => {
        nav.classList.remove('active');
        const i = nav.querySelector('md-icon');
        if (i) setIcon(i, (i.dataset.icon || i.textContent.trim()), nav.dataset.target === target ? 'filled' : 'outline');
        if (nav.dataset.target === target) nav.classList.add('active');
    });

    views.forEach(v => v.classList.remove('active'));
    const targetView = document.getElementById(target);
    if (targetView) targetView.classList.add('active');

    currentActiveViewId = target;
    currentActiveViewTitle = targetView.querySelector('.header-title')?.textContent?.trim() || '';

    updateTopAppBar();
    if (fab) fab.classList.toggle('visible', target === 'view-exclusions');

    if (pushToHistory) {
        if (target === 'view-home') {
            if (nmHistory.depth > 0) history.go(-nmHistory.depth);
        } else {
            if (nmHistory.level === 0) nmPush({ level: 1 });
            else nmReplace({ level: 1 });
        }
    }

    if (!viewLoadState[target]) {
        await Promise.allSettled(document.querySelector('.bottom-nav').getAnimations({ subtree: true }).map(a => a.finished));
        if (currentActiveViewId !== target || viewLoadState[target]) return;
        refreshCurrentView();
    }
}

function updateTopAppBar() {
    if (!UI.c) {
        UI.c = document.querySelector('.page-container');
        UI.bar = document.getElementById('top-app-bar');
        UI.title = document.getElementById('top-app-bar-title');
    }

    if (currentActiveViewId !== 'view-modules' && currentActiveViewId !== 'view-exclusions') {
        if (UI.title.textContent !== '') UI.title.textContent = '';
        UI.bar.style.setProperty('--top-app-bar-opacity', '0');
        UI.bar.style.setProperty('--top-app-title-opacity', '0');
        UI.bar.classList.remove('show-title');
        UI.bar.setAttribute('aria-hidden', 'true');
        return;
    }

    const scrollTop = UI.c.scrollTop;
    const titleOpacity = Math.max(0, Math.min(1, (scrollTop - 18) / 24));

    if (UI.title.textContent !== currentActiveViewTitle)
        UI.title.textContent = currentActiveViewTitle;

    UI.bar.style.setProperty('--top-app-bar-opacity', scrollTop > 0.5 ? '1' : '0');
    UI.bar.style.setProperty('--top-app-title-opacity', titleOpacity.toFixed(3));
    UI.bar.classList.toggle('show-title', titleOpacity > 0);
    UI.bar.setAttribute('aria-hidden', titleOpacity > 0.5 ? 'false' : 'true');
}

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const iconEl = item.querySelector('md-icon');
        if (iconEl) {
            const iconName = iconEl.dataset.icon || iconEl.textContent.trim();
            setIcon(iconEl, iconName, item.classList.contains('active') ? 'filled' : 'outline');
        }
        item.addEventListener('click', () => switchToTab(item.dataset.target, true));
    });
}

// Home
function updateModuleStats(modules) {
    const count = modules.filter(mod => mod.fileCount > 0).length;
    requestAnimationFrame(() => {
        const stats = getHomeElements().stats;
        if (stats) stats.textContent = `已注入 ${formatNumber(count)} 个模块`;
    });
}

async function loadHome(readModuleInfo = readModules) {
    const cachedHome = localStorage.getItem('nm_home_cache');
    if (cachedHome) {
        try { applyHomeData(JSON.parse(cachedHome)); } catch (e) { console.error("Error loading cache:", e); }
    }

    const script = `
        uname -r; echo "|||"
        model=$(getprop ro.product.vendor.model)
        [ -n "$model" ] || model=$(getprop ro.product.model)
        printf '%s\\n' "$model"; echo "|||"
        getprop ro.build.version.release; echo "|||"
        getprop ro.build.version.sdk; echo "|||"
        sed -n 's/^versionCode=\\([^=]*\\).*/\\1/p' ${MOD_DIR}/nomount/module.prop; echo "|||"
        ${NM_BIN} version; driver_status=$?; echo "|||"
        if [ "$driver_status" -eq 0 ]; then grep -q '^nomount ' /proc/modules && echo lkm || echo built-in; fi
    `;

    try {
        await Promise.all([
            exec(script).then(({ stdout }) => {
                const parts = stdout.split('|||').map(s => s.trim());
                const unk = '未知';
                const raw = parts.slice(0, 6);
                const kVer = raw[0] || unk,
                      model = raw[1] || unk,
                      aRel = raw[2] || unk,
                      aSdk = raw[3] || unk,
                      mVer = raw[4] || unk,
                      dVer = raw[5] || unk;

                const nmMode = (parts[6] || '').toLowerCase();
                const homeData = {
                    kernelVer: kVer, deviceModel: model,
                    androidInfo: `Android ${aRel} (API ${aSdk})`,
                    versionFull: `${mVer}-${dVer.split('-')[0]}`,
                    active: dVer !== unk,
                    nmMode
                };

                requestAnimationFrame(() => {
                    applyHomeData(homeData);
                    localStorage.setItem('nm_home_cache', JSON.stringify(homeData));
                });
            }),
            readModuleInfo().then(updateModuleStats)
        ]);
    } catch (e) { console.error("Delayed Home update error:", e); }
}

function applyHomeData(data) {
    const el = getHomeElements();
    if (el.kernel) el.kernel.textContent = data.kernelVer || '未知';
    if (el.device) el.device.textContent = data.deviceModel || '未知';
    if (el.android) el.android.textContent = data.androidInfo || '未知';
    if (el.statusLabel) {
        const version = (data.versionFull || '未知').replace(/^v(?=\d)/i, '').split(' (')[0];
        el.statusLabel.textContent = `版本：${version}`;
    }

    if (el.statusTitle) el.statusTitle.textContent = data.active ? '已激活' : '未激活';
    [el.statusLabel, el.statusCard].forEach(e => {
        if (e) { e.classList.toggle('active', data.active); e.classList.toggle('inactive', !data.active); }
    });
    if (el.statusIcon) {
        el.statusIcon.classList.toggle('inactive', !data.active);
        setIcon(el.statusIcon, data.active ? 'check_circle' : 'error', 'outline');
    }

    if (el.modeBadge) {
        el.modeBadge.textContent = data.nmMode === 'lkm' ? 'LKM' : data.nmMode === 'built-in' ? 'Built-in' : '';
    }
}

// Modules
let currentRenderId = 0;

async function readModules() {
    const { errno, stdout, stderr } = await exec(`${NM_BIN} module list --json`);
    if (errno) throw new Error(stderr || 'Failed to read modules');

    return JSON.parse(stdout).mods.filter(mod => mod.hasInjectable || mod.fileCount > 0);
}

function moduleStatusText(loaded, disable, skipMount) {
    return `状态：${loaded
        ? (disable || skipMount ? '已加载' : '已激活')
        : (disable ? '已禁用' : skipMount ? '已跳过' : '未激活')}`;
}

function buildModuleCard({ modId, realName, disable, skipMount, hasInjectable, fileCount }) {
    const isLoaded = fileCount > 0;

    return el('div', { class: 'card module-card', dataset: { moduleId: modId }, 'data-skipped': !hasInjectable && skipMount },
        el('div', { class: 'module-header' },
            el('div', { class: 'module-info' },
                el('h3', {}, realName || modId),
                el('p', {}, moduleStatusText(isLoaded, disable, skipMount)),
                el('p', { class: 'file-count' }, el('span', {}, `已注入 ${formatNumber(fileCount)} 个文件`))
            ),
            el('label', { class: 'custom-switch' },
                el('input', { type: 'checkbox', class: 'switch-input', 'aria-label': 'Toggle module', checked: disable ? false : '' }),
                el('span', { class: 'switch-track' },
                    el('span', { class: 'switch-thumb' })
                )
            )
        ),
        ...(hasInjectable ? [
            el('div', { class: 'module-divider' }),
            el('div', { class: 'module-extension' },
                el('button', { class: `btn-skip-action${skipMount ? ' unskip' : ''}` },
                    el('span', {}, skipMount ? '取消跳过' : '跳过注入')
                ),
                el('button', { class: `btn-hot-action${isLoaded ? ' unload' : ''}` },
                    el('span', {}, isLoaded ? '热卸载' : '热加载')
                )
            )
        ] : [])
    );
}

async function loadModules(readModuleInfo = readModules) {
    const listContainer = document.getElementById('modules-list');
    if (!listContainer) return;
    const renderId = ++currentRenderId;
    viewLoadState['view-modules'] = true;

    try {
        const moduleInfo = await readModuleInfo();
        if (renderId !== currentRenderId) return;
        updateModuleStats(moduleInfo);
        if (moduleInfo.length === 0) {
            renderEmptyState(listContainer, '(._.)', '未找到需要挂载的模块');
            return;
        }
        const frag = document.createDocumentFragment();
        for (const mod of moduleInfo.sort((a, b) => b.hasInjectable - a.hasInjectable)) frag.appendChild(buildModuleCard(mod));
        listContainer.replaceChildren(frag);
    } catch (e) {
        if (renderId !== currentRenderId) return;
        viewLoadState['view-modules'] = false;
        renderTextState(listContainer, 'error-message', `Error: ${e.message}`);
    }
}

let initialModulesPromise;
const readInitialModules = () => initialModulesPromise ||= readModules().catch(e => { initialModulesPromise = null; throw e; });
readInitialModules();

// Apps & Exclusions
let allAppsCache = [], showSystemApps = localStorage.getItem('nm_show_system_apps') === 'true', appLoadingPromise = null, appListRenderIndex = 0,
    currentlyDisplayedApps = [], listObserver = null, filterTimeout, exclusionsLoadId = 0,
    isMultiSelectMode = false, selectedAppsMap = new Map();

async function readExclusionsJson() {
    const { stdout } = await exec(`cat ${FILES.exclusions} 2>/dev/null || echo "[]"`);
    return parseExclusionsJson(stdout);
}

function parseExclusionsJson(text) {
    try {
        const parsed = JSON.parse(text.trim());
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
}

async function writeExclusionsJson(dataArray) {
    const json = shellQuote(JSON.stringify(dataArray));
    const { errno, stderr } = await exec(`mkdir -p ${NM_DATA} && printf '%s' ${json} > ${FILES.exclusions}.tmp && mv -f ${FILES.exclusions}.tmp ${FILES.exclusions}`);
    if (errno) throw new Error(stderr || '保存排除列表失败');
}

function buildExclusionCard(uid, app) {
    const label = app ? app.label : `UID: ${uid}`;
    const pkg = app ? app.pkg : 'System/Unknown';
    const userId = Math.floor(Number(uid) / 100000);
    const deleteIcon = el('md-icon');
    setIcon(deleteIcon, 'delete', 'outline');

    return el('div', { class: 'card setting-item', dataset: { uid, label } },
        el('div', { class: 'exclusion-app' },
            el('img', { class: 'app-icon-img', src: `ksu://icon/${pkg}`, loading: 'lazy' }),
            el('div', { class: 'setting-text' },
                el('h3', {}, label, ...(userId !== 0 ? [' ', el('span', { class: 'system-chip' }, `User ${userId}`)] : [])),
                el('p', {}, pkg)
            )
        ),
        el('md-icon-button', { class: 'btn-delete', 'aria-label': 'Remove exclusion' }, deleteIcon)
    );
}

const NM_STATE_SEP = '<<<NMSTATE>>>';
let uiStatePromise = null;

function readUiState() {
    if (!uiStatePromise) {
        uiStatePromise = exec(
            `${NM_BIN} uid list 2>/dev/null || echo "[]"; echo "${NM_STATE_SEP}"; ` +
            `[ -f "${FILES.disable}" ] && echo yes || echo no; echo "${NM_STATE_SEP}"; ` +
            `cat "${FILES.exclusions}" 2>/dev/null || echo "[]"; echo "${NM_STATE_SEP}"; ` +
            `${NM_BIN} uid block_isolated 2>/dev/null`
        ).then(({ errno, stdout }) => {
            const parts = stdout.split(NM_STATE_SEP);
            const isolated = parts.pop().trim();
            return {
                errno, isolated,
                uids: parts[0].trim(),
                safeMode: parts[1].trim() === 'yes',
                exclusions: parts.slice(2).join(NM_STATE_SEP).trim(),
            };
        }).finally(() => { uiStatePromise = null; });
    }
    return uiStatePromise;
}

async function loadExclusions() {
    const listContainer = document.getElementById('exclusions-list');
    if (!listContainer) return;
    const loadId = ++exclusionsLoadId;
    viewLoadState['view-exclusions'] = true;

    try {
        const state = await readUiState();
        let blockedUids = [];
        try {
            const parsed = JSON.parse(state.uids);
            if (Array.isArray(parsed)) blockedUids = parsed.map(String);
        } catch (e) { console.warn("No UIDs found or parse error"); }

        const savedData = parseExclusionsJson(state.exclusions);
        const appsMap = new Map(savedData.map(app => [String(app.uid), app]));

        requestAnimationFrame(() => {
            if (loadId !== exclusionsLoadId) return;
            if (blockedUids.length === 0) {
                renderEmptyState(listContainer, '(._.)', '尚无排除项');
                return;
            }
            const frag = document.createDocumentFragment();
            for (const uid of blockedUids) frag.appendChild(buildExclusionCard(uid, appsMap.get(uid)));
            listContainer.replaceChildren(frag);
        });
    } catch (e) {
        if (loadId !== exclusionsLoadId) return;
        viewLoadState['view-exclusions'] = false;
        renderTextState(listContainer, 'error-message', '加载排除项出错');
        showToast('加载排除项出错');
    }
}

async function getRealUidEntries() {
    const entries = new Map();
    const { stdout } = await exec(
        '[ -r /data/system/packages.list ] && { cut -d" " -f1,2 /data/system/packages.list; echo -; ' +
        'for d in /data/user/*; do id=${d##*/}; [ "$id" != 0 ] && case "$id" in *[!0-9]*|"") ;; *) ls "$d" 2>/dev/null | sed "s/^/$id /";; esac; done; }'
    );
    if (!stdout) return entries;
    const [pkgs = '', users = ''] = stdout.split(/\n-(?:\n|$)/);
    const appIds = new Map();
    for (const line of pkgs.split('\n')) {
        const [pkg, uid] = line.split(' ');
        if (!pkg || !uid) continue;
        appIds.set(pkg, Number(uid) % 100000);
        entries.set(pkg, [{ uid, userId: '0' }]);
    }
    for (const line of users.split('\n')) {
        const [userId, pkg] = line.split(' ');
        const appId = appIds.get(pkg);
        if (appId != null) entries.get(pkg).push({ uid: String(Number(userId) * 100000 + appId), userId });
    }
    return entries;
}

async function ensureAppsCache(force = false) {
    if (!force && allAppsCache.length > 0) return;

    if (!force) {
        try {
            const cachedApps = JSON.parse(localStorage.getItem('nm_apps_cache'));
            if (Array.isArray(cachedApps)) {
                allAppsCache = cachedApps;
                if (Date.now() - (Number(localStorage.getItem('nm_apps_cache_ts')) || 0) >= 300000) {
                    ensureAppsCache(true).then(() => {
                        const modal = document.getElementById('app-selector-modal');
                        if (modal?.classList.contains('active')) {
                            filterAndRender(document.getElementById('app-search-input').value, true);
                        }
                    });
                }
                return;
            }
        } catch (e) {
            console.warn("Failed to load apps from LocalStorage, fetching fresh data...", e);
        }
    }

    if (appLoadingPromise) return appLoadingPromise;
    appLoadingPromise = (async () => {
        try {
            let ksuWait = 10;
            while ((typeof ksu === 'undefined' || (!ksu.pm && !ksu.listPackages)) && ksuWait > 0) {
                await delay(200); ksuWait--;
            }
            const pm = typeof ksu !== 'undefined' && typeof ksu.pm === 'function' ? ksu.pm() : null;
            const hasPm = Boolean(pm?.listPackages && pm?.getPackagesInfo);
            const api = hasPm ? pm : (typeof ksu !== 'undefined' && ksu.listPackages ? ksu : null);
            if (!api) throw new Error("KSU interface not ready");

            let pkgsRaw = api.listPackages("all");
            let retries = 6;
            while ((!pkgsRaw || pkgsRaw === '[]') && retries > 0) {
                await delay(500);
                pkgsRaw = api.listPackages("all");
                retries--;
            }

            if (!pkgsRaw || pkgsRaw === '[]') return;
            const pkgs = [...new Set(JSON.parse(pkgsRaw))];
            const chunkSize = 200;
            const tempCache = [];
            const uidEntriesPromise = hasPm ? null : getRealUidEntries();

            for (let i = 0; i < pkgs.length; i += chunkSize) {
                if (i) await delay(15);
                const chunkInfo = api.getPackagesInfo(JSON.stringify(pkgs.slice(i, i + chunkSize)));
                if (chunkInfo) tempCache.push(...JSON.parse(chunkInfo));
            }

            const uidEntries = uidEntriesPromise ? await uidEntriesPromise : null;
            const apps = [];
            for (const app of tempCache) {
                if (app.error) continue;
                const instances = uidEntries?.get(app.packageName);
                const label = app.appLabel || app.packageName;
                const search = label.toLowerCase() + app.packageName.toLowerCase();
                for (const row of instances || [app]) {
                    if (row.uid == null) continue;
                    const userId = row.userId != null ? String(row.userId) : String(Math.floor(Number(row.uid) / 100000));
                    apps.push({
                        uid: String(row.uid),
                        packageName: app.packageName,
                        appLabel: label,
                        isSystem: Boolean(app.isSystem),
                        isClone: userId !== '0',
                        userId,
                        _search: search
                    });
                }
            }
            allAppsCache = apps.sort((a, b) => a.appLabel < b.appLabel ? -1 : (a.appLabel > b.appLabel ? 1 : 0));

            try {
                localStorage.setItem('nm_apps_cache', JSON.stringify(allAppsCache));
                localStorage.setItem('nm_apps_cache_ts', String(Date.now()));
            } catch (e) {
                console.warn("Failed to save apps cache to LocalStorage. Data might be too large.", e);
            }

        } catch (e) {
            console.error("Error in ensureAppsCache:", e);
        }
    })().finally(() => { appLoadingPromise = null; });
    return appLoadingPromise;
}

function closeAppSelector(fromHistory = false) {
    const modal = document.getElementById('app-selector-modal');
    const content = modal?.querySelector('.modal-content');
    modal?.classList.remove('active');
    content?.classList.remove('viewport-locked');
    content?.style.removeProperty('--app-selector-top');
    content?.style.removeProperty('--app-selector-height');
    if (listObserver) listObserver.disconnect();
    listObserver = null;
    clearTimeout(filterTimeout);
    if (!fromHistory && nmHistory.level >= 2) history.back();
}

async function openAppSelector() {
    const modal = document.getElementById('app-selector-modal'), 
          container = document.getElementById('app-list-container'), 
          searchInput = document.getElementById('app-search-input');

    const systemToggle = document.getElementById('btn-filter-toggle');
    if (!modal) return;

    const content = modal.querySelector('.modal-content');
    const viewportHeight = document.documentElement.clientHeight;
    content.style.setProperty('--app-selector-top', `${Math.round(viewportHeight * 0.1)}px`);
    content.style.setProperty('--app-selector-height', `${Math.round(viewportHeight * 0.9)}px`);
    content.classList.add('viewport-locked');

    if (nmHistory.level < 2) nmPush({ level: 2 });
    if (listObserver) listObserver.disconnect();
    searchInput.value = '';
    systemToggle.setAttribute('aria-pressed', String(showSystemApps));
    systemToggle.onclick = () => {
        showSystemApps = !showSystemApps;
        systemToggle.setAttribute('aria-pressed', String(showSystemApps));
        localStorage.setItem('nm_show_system_apps', showSystemApps);
        if (allAppsCache.length) filterAndRender(searchInput.value);
    };

    container.classList.remove('content-enter');
    const observer = listObserver = new IntersectionObserver((entries) => {
        if (listObserver === observer && entries[0].isIntersecting) renderNextAppBatch();
    }, { root: container, rootMargin: '400px' });

    try {
        const ready = allAppsCache.length > 0;
        if (ready) filterAndRender();
        else container.replaceChildren(el('div', { class: 'loading-spinner' }, '加载中...'));
        modal.classList.add('active');
        if (!ready) {
            await Promise.allSettled(content.getAnimations().map(a => a.finished));
            if (listObserver !== observer) return;
            await ensureAppsCache();
            if (listObserver !== observer) return;
            filterAndRender(searchInput.value);
            container.classList.add('content-enter');
        }
        searchInput.oninput = () => {
            clearTimeout(filterTimeout);
            filterTimeout = setTimeout(() => filterAndRender(searchInput.value), 200);
        };
    } catch (e) {
        if (listObserver === observer) {
            modal.classList.add('active');
            renderTextState(container, 'error-message', '加载应用程序出错');
        }
    }
}

function filterAndRender(searchTerm = '', keepScroll = false) {
    clearTimeout(filterTimeout);
    const term = searchTerm.toLowerCase();
    currentlyDisplayedApps = allAppsCache.filter(app => app._search.includes(term) && (showSystemApps || !app.isSystem));
    const container = document.getElementById('app-list-container');
    const scrollTop = keepScroll ? container.scrollTop : 0;
    const count = keepScroll ? Math.max(25, appListRenderIndex) : 25;
    container.replaceChildren();
    appListRenderIndex = 0;
    renderNextAppBatch(count);
    container.scrollTop = scrollTop;
}

function renderNextAppBatch(count = 25) {
    if (listObserver) listObserver.disconnect();
    const container = document.getElementById('app-list-container');
    const batch = currentlyDisplayedApps.slice(appListRenderIndex, appListRenderIndex + count);

    if (batch.length === 0) {
        if (appListRenderIndex === 0) renderEmptyState(container, '(._.)', '未找到应用程序');
        return;
    }

    const frag = document.createDocumentFragment();
    for (const app of batch) {
        const meta = el('div', { class: 'app-meta' },
            el('div', { class: 'uid-label' }, `UID: ${app.uid}`),
            app.isSystem ? el('span', { class: 'system-chip' }, 'SYS') : null,
            app.isClone ? el('span', { class: 'system-chip' }, `User ${app.userId}`) : null
        );
        frag.appendChild(el('div', {
            class: `app-item segment-card${selectedAppsMap.has(app.uid) ? ' selected' : ''}`,
            dataset: { uid: String(app.uid), label: app.appLabel, pkg: app.packageName },
        },
            el('img', { class: 'app-icon-img', src: `ksu://icon/${app.packageName}`, loading: 'lazy', decoding: 'async' }),
            el('div', { class: 'app-details' }, el('div', { class: 'app-name' }, app.appLabel), el('div', { class: 'app-pkg' }, app.packageName)),
            meta
        ));
    }
    const last = frag.lastChild;
    container.appendChild(frag);
    appListRenderIndex += batch.length;
    if (listObserver && last) listObserver.observe(last);
}

async function removeExclusion(uid, name, domItem) {
    showToast(`正在解除排除 ${name}...`);
    try {
        const currentData = await readExclusionsJson();
        const newData = currentData.filter(app => String(app.uid) !== String(uid));
        if (newData.length !== currentData.length) await writeExclusionsJson(newData);
        const { errno, stderr } = await exec(`${NM_BIN} uid del ${uid}`);
        if (errno) throw new Error(stderr || '运行时解除排除失败');
        domItem.remove();
        const listContainer = document.getElementById('exclusions-list');
        if (listContainer.children.length === 0)
            renderEmptyState(listContainer, '(._.)', '尚无排除项');
    } catch (err) {
        showToast(err.message);
        domItem.style.opacity = '1';
        domItem.style.pointerEvents = 'auto';
    }
}

async function addExclusion(uid, label, pkg) {
    const uidStr = String(uid).trim();
    if (!uidStr) return showToast('排除出错');

    try {
        const currentData = await readExclusionsJson();
        const alreadySaved = currentData.some(app => String(app.uid) === uidStr);
        const blockResult = await exec(`${NM_BIN} uid add ${uidStr}`);
        if (!alreadySaved) {
            currentData.push({ uid: uidStr, label: label, pkg: pkg });
            await writeExclusionsJson(currentData);
        }

        if (alreadySaved) showToast('已排除');
        else if (blockResult.errno !== 0) showToast('已保存；运行时排除失败');
        else showToast(`已排除: ${label}`);
    } catch { showToast('排除出错'); }

    await loadExclusions();
}

// Options
async function loadOptions() {
    viewLoadState['view-options'] = true;
    const swSafe = document.querySelector('#setting-safemode input'),
          swIso = document.querySelector('#setting-isolated input'),
          swIsoCard = document.getElementById('setting-isolated-card'),
          btnClearRules = document.getElementById('btn-clear-rules-only'),
          btnClearUids = document.getElementById('btn-clear-uids-only'),
          btnClearAll = document.getElementById('btn-clear-all');

    const { errno, safeMode, isolated } = await readUiState();
    viewLoadState['view-options'] = errno === 0;

    if (swSafe) {
        swSafe.checked = safeMode;
        swSafe.onchange = e => exec(e.target.checked ? `touch ${FILES.disable}` : `rm ${FILES.disable}`);
    }

    if (swIso && swIsoCard) {
        if (errno === 0 && (isolated === '1' || isolated === '0')) {
            swIsoCard.style.display = '';
            swIso.checked = (isolated === '1');
            swIso.onchange = async (e) => {
                const isChecked = e.target.checked;
                swIsoCard.dataset.busy = 'true';
                await exec(`${NM_BIN} uid block_isolated ${isChecked ? 'on' : 'off'}`);
                await exec(isChecked ? `touch ${FILES.isolated}` : `rm ${FILES.isolated}`);
                delete swIsoCard.dataset.busy;
            };
        }
    }

    if (btnClearRules) {
        btnClearRules.onclick = async () => {
            showToast('正在清除所有规则...');
            try {
                const clearResult = await exec(`${NM_BIN} rule clear`);
                if (clearResult.errno !== 0) throw new Error(clearResult.stderr || 'Failed to clear runtime rules');
                showToast('所有规则已清除！');
                loadModules();
            } catch { showToast('保存失败'); }
        };
    }

    if (btnClearUids) {
        btnClearUids.onclick = async () => {
            showToast('正在清除所有 UID...');
            try {
                await writeExclusionsJson([]);
                const clearResult = await exec(`${NM_BIN} uid clear`);
                if (clearResult.errno !== 0) throw new Error(clearResult.stderr || 'Failed to clear runtime UIDs');
                showToast('所有 UID 已清除！');
                loadExclusions();
            } catch { showToast('保存失败'); }
        };
    }

    if (btnClearAll) {
        btnClearAll.onclick = async () => {
            showToast('正在清除所有规则和 UID...');
            try {
                await writeExclusionsJson([]);
                const clearResult = await exec(`${NM_BIN} clear all`);
                if (clearResult.errno !== 0) throw new Error(clearResult.stderr || 'Failed to clear runtime rules');
                showToast('所有规则和 UID 已清除！');
                loadModules();
                loadExclusions();
            } catch { showToast('保存失败'); }
        };
    }
}

let isGlobalLoading = false;

// Pull-to-Refresh
function attachPullToRefresh(containerSelector, indicatorSelector, threshold, refreshCallback, canRefresh = () => true) {
    const container = document.querySelector(containerSelector);
    const indicator = document.querySelector(indicatorSelector);
    const indicatorIcon = indicator?.querySelector('md-icon');
    if (!container || !indicator) return;

    let startY = 0, pullDist = 0;

    container.addEventListener('touchstart', (e) => {
        if (!isGlobalLoading && container.scrollTop <= 0 && canRefresh()) {
            startY = e.touches[0].pageY; 
            indicator.style.transition = 'none';
        } else {
            startY = 0;
        }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (startY === 0 || isGlobalLoading) return;
        pullDist = (e.touches[0].pageY - startY) * 0.4;
        
        if (pullDist > 0 && container.scrollTop <= 0) {
            if (e.cancelable) e.preventDefault(); 
            indicator.style.transform = `translate3d(0, ${Math.min(pullDist, threshold)}px, 0)`;
            indicator.style.opacity = Math.min(1, pullDist / threshold);
            if (indicatorIcon) indicatorIcon.style.transform = `rotate(${Math.min(180, (pullDist / threshold) * 180)}deg)`;
        }
    }, { passive: false });

    container.addEventListener('touchend', async () => {
        if (startY === 0 || isGlobalLoading) return;
        indicator.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

        if (pullDist >= threshold) {
            isGlobalLoading = true; 
            indicator.classList.add('refreshing');
            indicator.style.transform = `translate3d(0, ${threshold - 6}px, 0)`; 
            indicator.style.opacity = '1';

            try { 
                await refreshCallback(); 
                await delay(400);
            } catch { 
                showToast('刷新失败');
            } finally { 
                resetIndicator(); 
            }
        } else {
            resetIndicator();
        }
        startY = pullDist = 0;
    });

    function resetIndicator() {
        isGlobalLoading = false; 
        indicator.classList.remove('refreshing');
        indicator.style.transform = 'translate3d(0, 0, 0)'; 
        indicator.style.opacity = '0';
        setTimeout(() => { if (indicatorIcon) indicatorIcon.style.transform = 'rotate(0deg)'; }, 300);
    }
}

async function refreshCurrentView() {
    const id = currentActiveViewId;
    if (id === 'view-home') await loadHome();
    else if (id === 'view-modules') await loadModules();
    else if (id === 'view-exclusions') await loadExclusions();
    else if (id === 'view-options') await loadOptions();
}

let nmUidModalResolver = null;
let nmUidModalPendingValue = null;

function closeUidModalFromHistory() {
    const modal = document.getElementById('uid-input-modal');
    if (!modal?.classList.contains('active')) return;
    modal.classList.remove('active');
    document.getElementById('manual-uid-input')?.blur();
    const resolve = nmUidModalResolver;
    const value = nmUidModalPendingValue;
    nmUidModalResolver = null;
    nmUidModalPendingValue = null;
    resolve?.(value);
}

function getManualUid() {
    return new Promise(resolve => {
        nmUidModalResolver = resolve;
        nmUidModalPendingValue = null;
        const modalDialog = document.getElementById('uid-input-modal');
        const input = document.getElementById('manual-uid-input');
        const btnCancel = document.getElementById('btn-cancel-uid');
        const btnAdd = document.getElementById('btn-confirm-uid');
        modalDialog.classList.add('active');
        input.value = '';
        setTimeout(() => input.focus(), 150);
        nmPush({ level: 3 });
        btnCancel.onclick = () => history.back();
        btnAdd.onclick = () => { nmUidModalPendingValue = input.value; history.back(); };
        modalDialog.onclick = (e) => { if (e.target === modalDialog) history.back(); };
    });
}

function initDelegationAndAttach() {
    const handleIconError = (e) => {
        const img = e.target;
        if (!(img instanceof HTMLImageElement) || img.dataset.iconFallback) return;
        img.dataset.iconFallback = '1';
        img.src = APP_ICON_FALLBACK;
    };
    document.getElementById('app-list-container')?.addEventListener('error', handleIconError, true);
    document.getElementById('exclusions-list')?.addEventListener('error', handleIconError, true);

    document.getElementById('view-options')?.addEventListener('click', (e) => {
        const item = e.target.closest('.setting-item');
        if (item && !e.target.closest('.custom-switch')) item.querySelector('.switch-input')?.click();
    });

    const changeModule = async (card, load, persist = false) => {
        const modId = card.dataset.moduleId;
        const dir = shellQuote(`${MOD_DIR}/${modId}`);
        const action = load ? 'load' : 'unload';
        const hotBtn = card.querySelector('.btn-hot-action');
        const cmds = [];
        if (hotBtn) cmds.push(`${NM_BIN} module ${action} ${dir}`);
        if (persist) cmds.push(`${load ? 'rm -f' : 'touch'} ${dir}/disable`);
        const { errno, stdout, stderr } = await exec(cmds.join(' && '));
        if (errno) {
            showToast(`Error: ${stderr || stdout || `Failed to ${action} module`}`);
            return loadModules();
        }

        const status = card.querySelector('.module-info p');
        if (!hotBtn) {
            card.querySelector('.switch-input').defaultChecked = load;
            status.textContent = moduleStatusText(true, !load, card.hasAttribute('data-skipped'));
            return;
        }
        const modules = await readModules();
        updateModuleStats(modules);
        const mod = modules.find(m => m.modId === modId);
        const newFileCount = mod?.fileCount ?? 0;
        const nowLoaded = newFileCount > 0;
        const skipMount = card.querySelector('.btn-skip-action').classList.contains('unskip');
        if (mod) card.querySelector('.switch-input').defaultChecked = !mod.disable;
        card.querySelector('.file-count span').textContent = `已注入 ${formatNumber(newFileCount)} 个文件`;
        status.textContent = moduleStatusText(nowLoaded, mod?.disable, mod && skipMount);
        hotBtn.classList.toggle('unload', nowLoaded);
        hotBtn.querySelector('span').textContent = nowLoaded ? '热卸载' : '热加载';
    };

    document.getElementById('modules-list')?.addEventListener('change', async (e) => {
        const toggle = e.target.closest('.switch-input');
        if (!toggle) return;
        const labelContainer = toggle.closest('.custom-switch');
        if (labelContainer.dataset.busy) {
            e.preventDefault();
            return;
        }
        const card = toggle.closest('.module-card');
        labelContainer.dataset.busy = 'true';
        labelContainer.classList.add('switch-busy');
        const isChecked = toggle.checked;

        try {
            await Promise.allSettled(labelContainer.getAnimations({ subtree: true }).map(a => a.finished));
            await changeModule(card, isChecked, true);
        } catch (err) {
            showToast(`Error: ${err.message}`);
        } finally {
            labelContainer.classList.remove('switch-busy');
            delete labelContainer.dataset.busy;
        }
    });

    document.getElementById('modules-list')?.addEventListener('click', async (e) => {
        const hotBtn = e.target.closest('.btn-hot-action');
        if (hotBtn && !hotBtn.disabled) {
            hotBtn.disabled = true;
            const card = hotBtn.closest('.module-card');
            const isLoaded = hotBtn.classList.contains('unload');

            try {
                await changeModule(card, !isLoaded);
            }
            catch (err) {
                showToast(`Error: ${err.message}`);
            }
            finally {
                hotBtn.disabled = false;
            }
        }

        const skipBtn = e.target.closest('.btn-skip-action');
        if (skipBtn && !skipBtn.disabled) {
            skipBtn.disabled = true;
            const card = skipBtn.closest('.module-card');
            const modId = card.dataset.moduleId;
            const skipMount = !skipBtn.classList.contains('unskip');
            const skipFile = `${MOD_DIR}/${modId}/skip_mount`;

            try {
                const { errno, stderr } = await exec(skipMount ? `touch ${shellQuote(skipFile)}` : `rm -f ${shellQuote(skipFile)}`);
                if (errno) throw new Error(stderr || 'Failed to update skip flag');
                skipBtn.classList.toggle('unskip', skipMount);
                skipBtn.querySelector('span').textContent = skipMount ? '取消跳过' : '跳过注入';
                const loaded = card.querySelector('.btn-hot-action').classList.contains('unload');
                const disable = !card.querySelector('.switch-input').defaultChecked;
                card.querySelector('.module-info p').textContent = moduleStatusText(loaded, disable, skipMount);
            } catch (err) {
                showToast(`Error: ${err.message}`);
            } finally {
                skipBtn.disabled = false;
            }
        }
    });

    document.getElementById('exclusions-list')?.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.btn-delete');
        if (delBtn) {
            const item = delBtn.closest('.setting-item');
            const uid = item.dataset.uid;
            const label = item.dataset.label;
            item.style.opacity = '0.5';
            item.style.pointerEvents = 'none';
            removeExclusion(uid, label, item);
        }
    });

    let pressTimer, touchMoved = false;
    const exitMultiSelectMode = window.exitMultiSelectMode = () => {
        isMultiSelectMode = false;
        selectedAppsMap.clear();
        document.querySelectorAll('.app-item.selected').forEach(el => el.classList.remove('selected'));
        setIcon(document.getElementById('modal-fab-action')?.querySelector('md-icon'), 'edit');
    };

    const toggleAppSelection = (item) => {
        const uid = item.dataset.uid;
        if (selectedAppsMap.has(uid)) {
            selectedAppsMap.delete(uid);
            item.classList.remove('selected');
            if (selectedAppsMap.size === 0) exitMultiSelectMode();
        } else {
            selectedAppsMap.set(uid, { uid, label: item.dataset.label, pkg: item.dataset.pkg });
            item.classList.add('selected');
        }
    };

    const container = document.getElementById('app-list-container');
    container?.addEventListener('touchstart', (e) => {
        touchMoved = false;
        const item = e.target.closest('.app-item');
        if (!item || item.dataset.busy) return;
        pressTimer = setTimeout(() => {
            if (!isMultiSelectMode) {
                if (navigator.vibrate) navigator.vibrate(50);
                isMultiSelectMode = true;
                setIcon(document.getElementById('modal-fab-action')?.querySelector('md-icon'), 'check');
                toggleAppSelection(item);
            }
        }, 500);
    }, { passive: true });

    container?.addEventListener('touchmove', () => { touchMoved = true; clearTimeout(pressTimer); }, { passive: true });
    container?.addEventListener('touchend', () => clearTimeout(pressTimer));
    container?.addEventListener('click', (e) => {
        const item = e.target.closest('.app-item');
        if (!item || item.dataset.busy || touchMoved) return;

        if (isMultiSelectMode) {
            toggleAppSelection(item);
        } else {
            item.dataset.busy = 'true';
            const { uid, label, pkg } = item.dataset;
            closeAppSelector();
            setTimeout(async () => { await addExclusion(uid, label, pkg); }, 50);
        }
    });

    document.getElementById('modal-fab-action')?.addEventListener('click', async () => {
        if (isMultiSelectMode) {
            const appsToSave = new Map(selectedAppsMap);
            exitMultiSelectMode();
            closeAppSelector();
            if (appsToSave.size > 0) {
                try {
                    const currentData = await readExclusionsJson();
                    const existingUids = new Set(currentData.map(a => String(a.uid)));
                    let uidsBash = [];
                    appsToSave.forEach((app, uid) => {
                        if (!existingUids.has(uid)) currentData.push(app);
                        uidsBash.push(uid);
                    });

                    await writeExclusionsJson(currentData);
                    await exec(`${NM_BIN} uid add ${uidsBash.join(' ')}`);
                    showToast(`${appsToSave.size} apps added`);
                } catch { showToast('排除出错'); }
                await loadExclusions();
            }
        } else {
            const manualUid = await getManualUid();
            if (manualUid && /^\d+$/.test(manualUid.trim())) {
                closeAppSelector();
                await addExclusion(manualUid.trim(), `UID: ${manualUid.trim()}`, 'System/Manual');
            } else if (manualUid) {
                showToast('无效的 UID');
            }
        }
    });

    document.getElementById('app-selector-modal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            closeAppSelector();
            exitMultiSelectMode();
        }
    });

    document.getElementById('btn-close-modal')?.addEventListener('click', () => {
        closeAppSelector();
        exitMultiSelectMode();
    });

    document.getElementById('fab-add-exclusion')?.addEventListener('click', openAppSelector);

    attachPullToRefresh('.page-container', '.pull-to-refresh-indicator', 90, async () => { await refreshCurrentView(); },
    () => currentActiveViewId === 'view-modules' || currentActiveViewId === 'view-exclusions');

    attachPullToRefresh('#app-list-container', '#app-modal-refresh-indicator', 70, async () => {
        document.getElementById('app-list-container').replaceChildren(
            el('div', { class: 'loading-spinner' }, '加载中...')
        );
        await ensureAppsCache(true);
        filterAndRender(document.getElementById('app-search-input')?.value || '');
    });
}

function initScrollListener() {
    const pageContainer = document.querySelector('.page-container');
    if (pageContainer) {
        let isTicking = false;
        pageContainer.addEventListener('scroll', () => {
            if (!isTicking) {
                window.requestAnimationFrame(() => {
                    updateTopAppBar();
                    isTicking = false;
                });
                isTicking = true;
            }
        }, { passive: true });
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    applyIcons();
    syncSystemBarTheme();
    initNavigation();
    initDelegationAndAttach();
    initScrollListener();
    updateTopAppBar();
    viewLoadState['view-home'] = true;
    loadHome(readInitialModules).then(() => {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => ensureAppsCache());
        } else {
            setTimeout(() => ensureAppsCache(), 200);
        }
    });
    document.body.classList.remove('loading');

    loadModules(readInitialModules);
    loadExclusions();
    loadOptions();
});
