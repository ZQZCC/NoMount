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
const RULE_PATHS = `${MOD_DIR}/nomount/rule-paths.sh`;
const FILES = { disable: `${NM_DATA}/disable`, exclusions: `${NM_DATA}/.exclusion_list.json`, isolated: `${NM_DATA}/.block_isolated_uids` };
const APP_ICON_FALLBACK = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzgwODA4MCI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6bTAgMThjLTQuNDEgMC04LTMuNTktOC04czMuNTktOCA4LTggOCAzLjU5IDggOC0zLjU5IDgtOCA4eiIvPjwvc3ZnPg==";
const viewLoadState = { 'view-home': false, 'view-modules': false, 'view-exclusions': false, 'view-options': false };
const numberFormatter = new Intl.NumberFormat('zh-CN');
const formatNumber = value => numberFormatter.format(value);
const STATUS_TEXT = {
    status_active: '已激活',
    status_loaded: '已加载',
    status_disabled: '已禁用',
    status_skipped: '已跳过',
    status_inactive: '未激活'
};

const delay = ms => new Promise(r => setTimeout(r, ms));

function el(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k === 'checked' || k === 'disabled') node[k] = !!v;
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
        el('div', { class: 'empty-list-placeholder empty-state' }, el('div', { class: 'empty-face' }, face), el('div', { class: 'empty-text' }, text)
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
    memory: 'M360-400v-160q0-17 11.5-28.5T400-600h160q17 0 28.5 11.5T600-560v160q0 17-11.5 28.5T560-360H400q-17 0-28.5-11.5T360-400Zm80-40h80v-80h-80v80Zm-80 280v-40h-80q-33 0-56.5-23.5T200-280v-80h-40q-17 0-28.5-11.5T120-400q0-17 11.5-28.5T160-440h40v-80h-40q-17 0-28.5-11.5T120-560q0-17 11.5-28.5T160-600h40v-80q0-33 23.5-56.5T280-760h80v-40q0-17 11.5-28.5T400-840q17 0 28.5 11.5T440-800v40h80v-40q0-17 11.5-28.5T560-840q17 0 28.5 11.5T600-800v40h80q33 0 56.5 23.5T760-680v80h40q17 0 28.5 11.5T840-560q0 17-11.5 28.5T800-520h-40v80h40q17 0 28.5 11.5T840-400q0 17-11.5 28.5T800-360h-40v80q0 33-23.5 56.5T680-200h-80v40q0 17-11.5 28.5T560-120q-17 0-28.5-11.5T520-160v-40h-80v40q0 17-11.5 28.5T400-120q-17 0-28.5-11.5T360-160Zm320-120v-400H280v400h400ZM480-480Z',
    refresh: 'M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-70q0-17 11.5-28.5T760-800q17 0 28.5 11.5T800-760v200q0 17-11.5 28.5T760-520H560q-17 0-28.5-11.5T520-560q0-17 11.5-28.5T560-600h128q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q68 0 124.5-34.5T692-367q8-14 22.5-19.5t29.5-.5q16 5 23 21t-1 30q-41 80-117 128t-169 48Z',
    search: 'M380-320q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l224 224q11 11 11 28t-11 28q-11 11-28 11t-28-11L532-372q-30 24-69 38t-83 14Zm0-80q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z',
    settings: 'M433-80q-27 0-46.5-18T363-142l-9-66q-13-5-24.5-12T307-235l-62 26q-25 11-50 2t-39-32l-47-82q-14-23-8-49t27-43l53-40q-1-7-1-13.5v-27q0-6.5 1-13.5l-53-40q-21-17-27-43t8-49l47-82q14-23 39-32t50 2l62 26q11-8 23-15t24-12l9-66q4-26 23.5-44t46.5-18h94q27 0 46.5 18t23.5 44l9 66q13 5 24.5 12t22.5 15l62-26q25-11 50-2t39 32l47 82q14 23 8 49t-27 43l-53 40q1 7 1 13.5v27q0 6.5-2 13.5l53 40q21 17 27 43t-8 49l-48 82q-14 23-39 32t-50-2l-60-26q-11 8-23 15t-24 12l-9 66q-4 26-23.5 44T527-80h-94Zm7-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z',
    settings_suggest: 'm697-696-56-26q-12-5-12-18t12-18l56-26 26-56q5-12 18-12t18 12l26 56 56 26q12 5 12 18t-12 18l-56 26-26 56q-5 12-18 12t-18-12l-26-56Zm92 308-49-23q-6-3-6-9t6-9l49-23 23-49q3-6 9-6t9 6l23 49 49 23q6 3 6 9t-6 9l-49 23-23 49q-3 6-9 6t-9-6l-23-49ZM336-80q-15 0-26-10t-13-25l-8-59q-7-3-15-8t-13-10l-55 24q-14 6-28.5 1.5T155-185L91-297q-8-14-4.5-28.5T102-349l47-35v-32l-47-35q-12-9-15.5-23.5T91-503l64-112q8-14 22.5-18.5T206-632l55 24q5-5 13-10t15-8l8-59q2-15 13-25t26-10h130q15 0 26 10t13 25l8 59q7 3 15 8t13 10l55-24q14-6 28.5-1.5T647-615l64 112q8 14 4.5 28.5T700-451l-47 35v32l47 35q12 9 15.5 23.5T711-297l-64 112q-8 14-22.5 18.5T596-168l-55-24q-5 5-13 10t-15 8l-8 59q-2 15-13 25t-26 10H336Zm150-235q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35ZM371-160h60l8-72q29-8 49.5-20.5T529-286l66 30 28-50-58-44q8-23 8-50t-8-50l58-44-28-50-66 30q-20-21-40.5-33.5T439-568l-8-72h-60l-8 72q-29 8-49.5 20.5T273-514l-66-30-28 50 58 44q-8 23-8.5 50t8.5 50l-58 44 28 50 66-30q20 21 40.5 33.5T363-232l8 72Zm30-240Z',
    shield: 'M467-85q-6-1-12-3-135-45-215-166.5T160-516v-189q0-25 14.5-45t37.5-29l240-90q14-5 28-5t28 5l240 90q23 9 37.5 29t14.5 45v189q0 140-80 261.5T505-88q-6 2-12 3t-13 1q-7 0-13-1Zm13-79q104-33 172-132t68-220v-189l-240-90-240 90v189q0 121 68 220t172 132Zm0-316Z',
    smartphone: 'M680-920H280c-44 0-80 36-80 80v720c0 44 36 80 80 80h400c44 0 80-36 80-80v-720c0-44-36-80-80-80Zm0 720H280v-600h400v600Zm-120 80h-160v-40h160v40Z',
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
        UI.bar.classList.remove('visible', 'show-title');
        UI.bar.setAttribute('aria-hidden', 'true');
        return;
    }

    const scrollTop = UI.c.scrollTop;
    const titleOpacity = Math.max(0, Math.min(1, (scrollTop - 18) / 24));

    if (UI.title.textContent !== currentActiveViewTitle)
        UI.title.textContent = currentActiveViewTitle;
 
    UI.bar.style.setProperty('--top-app-bar-opacity', scrollTop > 0.5 ? '1' : '0');
    UI.bar.style.setProperty('--top-app-title-opacity', titleOpacity.toFixed(3));
    UI.bar.classList.toggle('visible', scrollTop > 0.5);
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
        if (stats) stats.textContent = count === 1 ? '1 个模块注入中' : `${formatNumber(count)} 个模块注入中`;
    });
}

async function loadHome(readModuleInfo = readModules) {
    try { applyHomeData(JSON.parse(localStorage.getItem('nm_home_cache'))); } catch (e) { console.error("Error loading cache:", e); }

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
const TARGET_PARTITIONS = "system system_ext vendor odm product apex oem optics prism mi_ext my_bigball my_carrier my_company my_engineering my_heytap my_manifest my_preload my_product my_region my_reserve my_stock";
async function readModules(onlyMods = null) {
    const filter = onlyMods ? `case " ${onlyMods.join(' ')} " in *" $mod "*) ;; *) continue ;; esac` : '';
    const script = `
        ${NM_BIN} rule list --json || exit $?; echo "|||"
        cd -P ${MOD_DIR} || exit 1
        set --
        for mod in *; do
            [ ! -d "$mod" ] && continue
            [ "$mod" = "nomount" ] && continue
            [ ! -f "$mod/module.prop" ] && continue
            ${filter}
            count=$#
            for p in ${TARGET_PARTITIONS}; do [ -d "$mod/$p" ] && { [ -d "/$p" ] || [ -d "/system/$p" ]; } && set -- "$@" "$mod/$p"; done
            name=""
            while IFS='=' read -r k v; do case "$k" in name) name="$v"; break;; esac; done < "$mod/module.prop"
            disable=false; [ -f "$mod/disable" ] && disable=true
            skip=false; [ -f "$mod/skip_mount" ] && skip=true
            root="\${PWD%/}/$mod"
            if [ -L "$mod" ]; then root=$(readlink -f "$mod") || exit 1; fi
            printf '@@M\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' "$mod" "$name" "$disable" "$skip" "$root" "$(( $# > count ))"
        done
        if [ "$#" -gt 0 ]; then
            sh "${RULE_PATHS}" links "$@" || exit 1
            find -H "$@" -type l -exec sh "${RULE_PATHS}" scan {} + || exit 1
        fi
    `;
    const { errno, stdout, stderr } = await exec(script);
    if (errno) throw new Error(stderr || 'Failed to read modules');
    const [jsonPart, modulesPart = ''] = stdout.split('|||');
    const rules = JSON.parse(jsonPart.trim() || '[]');
    const modules = new Map(), roots = new Map(), links = new Map();
    for (const line of modulesPart.split('\n')) {
        const [kind, modId, ...fields] = line.split('\t');
        if (kind === '@@M') {
            const [realName, disable, skipMount, root, injectable] = fields;
            const mod = { modId, realName, disable: disable === 'true', skipMount: skipMount === 'true', hasInjectable: injectable === '1', fileCount: 0 };
            modules.set(modId, mod);
            if (!roots.has(root)) roots.set(root, []);
            roots.get(root).push(mod);
        } else if (kind === '@@S') {
            const [virtual, real, dir] = fields;
            if (!links.has(virtual)) links.set(virtual, []);
            links.get(virtual).push({ mod: modules.get(modId), real, dir: dir === 'true' });
        }
    }
    for (const { virtual, real } of rules) {
        if (!real) continue;
        const owners = new Set();
        for (let path = real; path; path = path.slice(0, path.lastIndexOf('/'))) {
            for (const mod of roots.get(path) || []) owners.add(mod);
        }
        for (let path = links.size ? virtual : ''; path; path = path.slice(0, path.lastIndexOf('/'))) {
            const suffix = virtual.slice(path.length);
            for (const link of links.get(path) || []) {
                if ((link.dir || !suffix) && real === (suffix ? link.real.replace(/\/$/, '') + suffix : link.real)) owners.add(link.mod);
            }
        }
        for (const mod of owners) mod.fileCount++;
    }
    for (const mod of modules.values()) {
        const { fileCount, disable, skipMount } = mod;
        mod.statusKey = fileCount > 0 ? ((disable || skipMount) ? 'status_loaded' : 'status_active') : (disable ? 'status_disabled' : (skipMount ? 'status_skipped' : 'status_inactive'));
    }
    return [...modules.values()].filter(mod => mod.hasInjectable || mod.fileCount > 0);
}

function buildModuleCard({ modId, realName, disable, skipMount, hasInjectable, fileCount, statusKey }) {
    const isLoaded = fileCount > 0;

    return el('div', { class: 'card module-card', dataset: { moduleId: modId } },
        el('div', { class: 'module-header' },
            el('div', { class: 'module-info' },
                el('h3', {}, realName || modId),
                el('p', {}, `状态：${STATUS_TEXT[statusKey]}`),
                el('p', { class: 'file-count' }, el('span', {}, `已注入 ${formatNumber(fileCount)} 个文件`))
            ),
            el('label', { class: 'custom-switch' },
                el('input', { type: 'checkbox', class: 'switch-input', 'aria-label': 'Toggle module', checked: !disable }),
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

async function loadModule(modId) {
    const modPath = `${MOD_DIR}/${modId}`;
    const script = `
        cd "${modPath}" || { echo "nm_load_status=1" >&2; exit 0; }
        valid_dirs=""
        for p in ${TARGET_PARTITIONS}; do [ -d "$p" ] && { [ -d "/$p" ] || [ -d "/system/$p" ]; } && valid_dirs="$valid_dirs $p"; done
        [ -z "$valid_dirs" ] && { echo "nm_load_status=0" >&2; exit 0; }
        status=0

        find -L $valid_dirs '(' -type d -o -type c -o -name ".replace" -o -name ".remove" ')' \\
            -exec sh "${RULE_PATHS}" path "${modPath}" {} + 2>/dev/null \\
            | xargs -0 -r -n 200 ${NM_BIN} rule add --whiteout
        st=$?; [ "$st" -ne 0 ] && status=$st

        find -L $valid_dirs '(' -type d -o -name ".replace" ')' \\
            -exec sh "${RULE_PATHS}" opaque "${modPath}" {} + 2>/dev/null \\
            | xargs -0 -r -n 200 ${NM_BIN} rule add --opaque
        st=$?; [ "$st" -ne 0 ] && status=$st

        find -L $valid_dirs '(' -type f -o -type l ')' ! -name ".replace" ! -name ".remove" \\
            -exec sh "${RULE_PATHS}" pair "${modPath}" {} + 2>/dev/null \\
            | xargs -0 -r -n 200 ${NM_BIN} rule add
        st=$?; [ "$st" -ne 0 ] && status=$st

        echo "nm_load_status=$status" >&2
    `;

    const result = await exec(script);
    const m = (result.stderr || '').match(/nm_load_status=(\d+)/);
    if (!m) throw new Error('load script did not report status');
    if (parseInt(m[1], 10) !== 0) throw new Error(result.stderr || `load failed (status ${m[1]})`);
}

async function unloadModule(modId) {
    const modPath = `${MOD_DIR}/${modId}`;
    const script = `
        cd "${modPath}" || { echo "nm_unload_status=1" >&2; exit 0; }
        valid_dirs=""
        for p in ${TARGET_PARTITIONS}; do [ -d "$p" ] && { [ -d "/$p" ] || [ -d "/system/$p" ]; } && valid_dirs="$valid_dirs $p"; done
        [ -z "$valid_dirs" ] && { echo "nm_unload_status=0" >&2; exit 0; }
        status=0

        find -L $valid_dirs '(' -type f -o -type l -o -type c -o -type d ')' \\
            -exec sh "${RULE_PATHS}" del "${modPath}" {} + 2>/dev/null \\
            | xargs -0 -r -n 200 ${NM_BIN} rule del
        st=$?; [ "$st" -ne 0 ] && status=$st

        echo "nm_unload_status=$status" >&2
    `;

    const result = await exec(script);
    const m = (result.stderr || '').match(/nm_unload_status=(\d+)/);
    if (!m) throw new Error('unload script did not report status');
    if (parseInt(m[1], 10) !== 0) throw new Error(result.stderr || `unload failed (status ${m[1]})`);
}

// Apps & Exclusions
let allAppsCache = [], showSystemApps = localStorage.getItem('nm_show_system_apps') === 'true', appLoadingPromise = null, appListRenderIndex = 0,
    currentlyDisplayedApps = [], listObserver = null, filterTimeout, exclusionsLoadId = 0,
    isMultiSelectMode = false, selectedAppsMap = new Map();

async function readExclusionsJson() {
    try {
        const { stdout } = await exec(`cat ${FILES.exclusions} 2>/dev/null || echo "[]"`);
        const parsed = JSON.parse(stdout.trim());
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
}

async function writeExclusionsJson(dataArray) {
    const jsonStr = JSON.stringify(dataArray);
    const b64 = btoa(unescape(encodeURIComponent(jsonStr))); 
    const cmd = `mkdir -p ${NM_DATA} && echo "${b64}" | base64 -d > ${FILES.exclusions}.tmp && mv -f ${FILES.exclusions}.tmp ${FILES.exclusions}`;
    return await exec(cmd);
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

async function loadExclusions() {
    const listContainer = document.getElementById('exclusions-list');
    if (!listContainer) return;
    const loadId = ++exclusionsLoadId;
    viewLoadState['view-exclusions'] = true;

    try {
        const [{ stdout }, savedData] = await Promise.all([
            exec(`${NM_BIN} uid list 2>/dev/null`), readExclusionsJson()
        ]);
        let blockedUids = [];
        try {
            const parsed = JSON.parse(stdout.trim());
            if (Array.isArray(parsed)) blockedUids = parsed.map(String);
        } catch (e) { console.warn("No UIDs found or parse error"); }

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

// uses pm to resolve app UID
async function getRealUidEntries() {
    // entries: packageName -> [{ uid, userId }, ...]
    const entries = new Map();

    const { stdout: usersOut } = await exec('pm list users 2>/dev/null');
    let userIds = [...usersOut.matchAll(/UserInfo\{(\d+):/g)].map(m => m[1]);
    if (userIds.length === 0) userIds = ['0'];

    const { stdout } = await exec(userIds.map(id => `pm list packages -U --user ${id} 2>/dev/null`).join('\n'));
    for (const line of stdout.split('\n')) {
        const m = line.match(/^package:(\S+)\s+uid:(\d+)/);
        if (!m) continue;
        const [, pkgName, uid] = m;
        if (!entries.has(pkgName)) entries.set(pkgName, []);
        entries.get(pkgName).push({ uid, userId: String(Math.floor(Number(uid) / 100000)) });
    }
    return entries;
}

async function ensureAppsCache(force = false) {
    if (!force && allAppsCache.length > 0) return;

    if (!force) {
        try {
            const cachedApps = localStorage.getItem('nm_apps_cache');
            if (cachedApps) {
                allAppsCache = JSON.parse(cachedApps);
                return;
            }
        } catch (e) {
            console.warn("Failed to load apps from LocalStorage, fetching fresh data...", e);
        }
    }

    if (appLoadingPromise) {
        await appLoadingPromise;
        if (!force || allAppsCache.length > 0) return;
    }

    appLoadingPromise = (async () => {
        try {
            let ksuWait = 10;
            while ((typeof ksu === 'undefined' || !ksu.listPackages) && ksuWait > 0) {
                await delay(200); ksuWait--;
            }
            if (typeof ksu === 'undefined' || !ksu.listPackages) throw new Error("KSU interface not ready");

            let pkgsRaw = ksu.listPackages("all");
            let retries = 6;
            while ((!pkgsRaw || pkgsRaw === '[]') && retries > 0) {
                await delay(500);
                pkgsRaw = ksu.listPackages("all");
                retries--;
            }

            if (!pkgsRaw || pkgsRaw === '[]') return;
            const pkgs = [...new Set(JSON.parse(pkgsRaw))];
            const chunkSize = 200;
            const tempCache = [];
            const uidEntriesPromise = getRealUidEntries();

            for (let i = 0; i < pkgs.length; i += chunkSize) {
                if (i) await delay(15);
                const chunkInfo = ksu.getPackagesInfo(JSON.stringify(pkgs.slice(i, i + chunkSize)));
                if (chunkInfo) tempCache.push(...JSON.parse(chunkInfo));
            }

            // uses pm to list package uid per user, keep ksu's label/isSystem
            const uidEntries = await uidEntriesPromise;
            const apps = [];
            for (const app of tempCache) {
                const instances = uidEntries.get(app.packageName);
                const label = app.appLabel || app.packageName;
                const search = label.toLowerCase() + app.packageName.toLowerCase();
                for (const row of instances || [app]) {
                    apps.push({
                        uid: String(row.uid),
                        packageName: app.packageName,
                        appLabel: label,
                        isSystem: Boolean(app.isSystem),
                        isClone: instances ? row.userId !== '0' : Boolean(app.isClone),
                        userId: row.userId,
                        _search: search
                    });
                }
            }
            allAppsCache = apps.sort((a, b) => a.appLabel < b.appLabel ? -1 : (a.appLabel > b.appLabel ? 1 : 0));

            try {
                localStorage.setItem('nm_apps_cache', JSON.stringify(allAppsCache));
            } catch (e) {
                console.warn("Failed to save apps cache to LocalStorage. Data might be too large.", e);
            }

        } catch (e) {
            console.error("Error in ensureAppsCache:", e);
        } finally { 
            appLoadingPromise = null; 
        }
    })();
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

function filterAndRender(searchTerm = '') {
    clearTimeout(filterTimeout);
    const term = searchTerm.toLowerCase();
    currentlyDisplayedApps = allAppsCache.filter(app => app._search.includes(term) && (showSystemApps || !app.isSystem));
    const container = document.getElementById('app-list-container');
    container.replaceChildren();
    container.scrollTop = 0;
    appListRenderIndex = 0;
    renderNextAppBatch();
}

function renderNextAppBatch() {
    if (listObserver) listObserver.disconnect();
    const container = document.getElementById('app-list-container');
    const batch = currentlyDisplayedApps.slice(appListRenderIndex, appListRenderIndex + 25);

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
        const unblockResult = await exec(`${NM_BIN} uid del ${uid}`);
        if (unblockResult.errno !== 0) throw new Error(unblockResult.stderr || 'Failed to unblock UID');
        const currentData = await readExclusionsJson();
        const newData = currentData.filter(app => String(app.uid) !== String(uid));
        await writeExclusionsJson(newData);
        domItem.remove();
        const listContainer = document.getElementById('exclusions-list');
        if (listContainer.children.length === 0)
            renderEmptyState(listContainer, '(._.)', '尚无排除项');
    } catch {
        showToast('解除排除出错');
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
            const persistResult = await writeExclusionsJson(currentData);
            if (persistResult.errno !== 0) throw new Error(persistResult.stderr || 'Failed to save exclusion metadata');
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

    const { errno, stdout } = await exec(`
        [ -f ${FILES.disable} ] && echo yes; echo "|||"
        ${NM_BIN} uid block_isolated
    `);
    viewLoadState['view-options'] = errno === 0;
    const [safeMode, isolated] = stdout.split('|||').map(s => s.trim());

    if (swSafe) {
        swSafe.checked = safeMode.includes('yes');
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
                const persistResult = await writeExclusionsJson([]); 
                if (persistResult.errno !== 0) throw new Error(persistResult.stderr || 'Failed to clear exclusions cache');
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
                const persistResult = await writeExclusionsJson([]); 
                if (persistResult.errno !== 0) throw new Error(persistResult.stderr || 'Failed to clear exclusions cache');
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
                await new Promise(resolve => setTimeout(resolve, 400)); 
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

    const updateModuleCardDOM = async (card, modId, modules) => {
        const mod = (modules || await readModules([modId])).find(m => m.modId === modId);
        const newFileCount = mod?.fileCount ?? 0;
        const statusKey = mod?.statusKey ?? 'status_inactive';
        const nowLoaded = newFileCount > 0;
        card.querySelector('.file-count span').textContent = `已注入 ${formatNumber(newFileCount)} 个文件`;
        card.querySelector('.module-info p').textContent = `状态：${STATUS_TEXT[statusKey]}`;
        const hotBtn = card.querySelector('.btn-hot-action');
        if (!hotBtn) return;
        hotBtn.classList.toggle('unload', nowLoaded);
        hotBtn.querySelector('span').textContent = nowLoaded ? '热卸载' : '热加载';
    };

    document.getElementById('modules-list')?.addEventListener('change', async (e) => {
        const toggle = e.target.closest('.switch-input');
        if (toggle) {
            const labelContainer = toggle.closest('.custom-switch');
            if (labelContainer.dataset.busy) {
                e.preventDefault();
                return;
            }
            const card = toggle.closest('.module-card');
            const modId = card.dataset.moduleId;
            labelContainer.dataset.busy = 'true';
            labelContainer.classList.add('switch-busy');
            const isChecked = toggle.checked;

            try {
                await Promise.allSettled(labelContainer.getAnimations({ subtree: true }).map(a => a.finished));
                if (isChecked) { await exec(`rm ${MOD_DIR}/${modId}/disable`); await loadModule(modId); }
                else { await unloadModule(modId); await exec(`touch ${MOD_DIR}/${modId}/disable`); }
                const modules = await readModules();
                await updateModuleCardDOM(card, modId, modules);
                updateModuleStats(modules);
            } catch (err) {
                showToast(`Error: ${err.message}`);
                toggle.checked = !isChecked;
                loadHome();
            } finally {
                labelContainer.classList.remove('switch-busy');
                delete labelContainer.dataset.busy;
            }
        }
    });

    document.getElementById('modules-list')?.addEventListener('click', (e) => {
        const hotBtn = e.target.closest('.btn-hot-action');
        if (hotBtn && !hotBtn.disabled) {
            hotBtn.disabled = true;
            const card = hotBtn.closest('.module-card');
            const modId = card.dataset.moduleId;
            const isLoaded = hotBtn.classList.contains('unload');
            const btnSpan = hotBtn.querySelector('span');
            const originalText = btnSpan.textContent;
            btnSpan.textContent = '加载中...';

            setTimeout(async () => {
                try {
                    isLoaded ? await unloadModule(modId) : await loadModule(modId);
                    const modules = await readModules();
                    await updateModuleCardDOM(card, modId, modules);
                    updateModuleStats(modules);
                }
                catch (err) {
                    showToast(`Error: ${err.message}`);
                    btnSpan.textContent = originalText;
                    loadHome();
                }
                finally {
                    hotBtn.disabled = false;
                }
            }, 0);
        }

        const skipBtn = e.target.closest('.btn-skip-action');
        if (skipBtn && !skipBtn.disabled) {
            skipBtn.disabled = true;
            const card = skipBtn.closest('.module-card');
            const modId = card.dataset.moduleId;
            const wasSkipped = skipBtn.classList.contains('unskip');
            const skipFile = `${MOD_DIR}/${modId}/skip_mount`;

            setTimeout(async () => {
                try {
                    await exec(wasSkipped ? `rm -f ${skipFile}` : `touch ${skipFile}`);
                    skipBtn.classList.toggle('unskip', !wasSkipped);
                    skipBtn.querySelector('span').textContent = !wasSkipped ? '取消跳过' : '跳过注入';
                    await updateModuleCardDOM(card, modId);
                } catch (err) {
                    showToast(`Error: ${err.message}`);
                } finally {
                    skipBtn.disabled = false;
                }
            }, 0);
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
            setTimeout(() => {
                removeExclusion(uid, label, item);
            }, 0);
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
            requestIdleCallback(() => ensureAppsCache(true));
        } else {
            setTimeout(() => ensureAppsCache(true), 200);
        }
    });
    document.body.classList.remove('loading');

    loadModules(readInitialModules);
    loadExclusions();
    loadOptions();
});
