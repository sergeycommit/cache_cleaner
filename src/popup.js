/// popup.js - Rewritten (v3)

// --- Constants ---
const STORAGE_KEYS = { PREFERENCES: 'preferences', USAGE_STATS: 'usageStats', THEME: 'theme', CLEANING_FLAG: 'isCleaning', RATING_SHOWN: 'ratingShown', LAST_RATING_PROMPT: 'lastRatingPrompt', RELOAD_DEFAULT_APPLIED: 'reloadDefaultApplied', INSTALLATION_TIME: 'installationTime'};
const DEFAULT_PREFERENCES = { cookies: true, localStorage: true, sessionStorage: true, cache: false, indexedDB: false, clearHistory: false, reloadPage: false, confirmBeforeClean: false, disableRatingPrompts: false, timeRange: '3600000' };
const DEFAULT_USAGE_STATS = { cleanCount: 0 };
const SELECTORS = {
    themeToggle: '#themeToggle',
    appTitle: 'header h1',
    tabStatusMessage: '#tabStatusMessage',
    tabStatusText: '#tabStatusText',
    dataFetchError: '#dataFetchError',
    infoTooltip: '#infoTooltip',
    currentTabDataCard: '#currentTabDataCard',
    cookiesCheck: '#cookies',
    cookiesCount: '#cookiesCount',
    localStorageCheck: '#localStorage',
    localStorageCount: '#localStorageCount',
    sessionStorageCheck: '#sessionStorage',
    sessionStorageCount: '#sessionStorageCount',
    additionalOptionsCard: '#additionalOptionsCard',
    additionalOptionsHeader: '#additionalOptionsCard .collapsible-header',
    additionalOptionsContent: '#additionalOptionsContent',
    timeRangeSelect: '#timeRangeSelect',
    cacheCheck: '#cache',
    indexedDBCheck: '#indexedDB',
    clearHistoryCheck: '#clearHistory',
    reloadPageCheck: '#reloadPage',
    confirmBeforeCleanCheck: '#confirmBeforeClean',
    disableRatingPromptsCheck: '#disableRatingPrompts',
    showRatingBtn: '#showRatingBtn',
    optionRangeIndicators: '.option-range-indicator',
    cleanBtn: '#cleanBtn',
    cleanBtnText: '#cleanBtnText',
    reloadIndicator: '#reloadIndicator',
    confirmIndicator: '#confirmIndicator',
    summaryElement: '#summary',
    summaryListElement: '#summaryList',
    closeSummaryBtn: '#closeSummaryBtn',
    errorElement: '#errorCard',
    errorListElement: '#errorList',
    closeErrorBtn: '#closeErrorBtn',
    infoIcons: '.info-icon',
    optionRows: '.option-row',
    ratingSection: '#ratingSection',
    ratingStars: '.rating-group input'
};
const $ = {}; // Object to cache DOM elements

// --- State ---
let currentPreferences = { ...DEFAULT_PREFERENCES };
let usageStats = { ...DEFAULT_USAGE_STATS };
let activeTabInfo = null; // { id: number, url: string } | null
let isCleaningInProgress = false;
let isAwaitingConfirmation = false;
let tooltipTimeout = null;
let cleanBtnTimeout = null;
let currentTooltipTarget = null;
let ignoreNextStorageChange = false; // Flag to ignore next storage change event

// --- Minimal Inline SVG Icons ---
function getIconSvg(name) {
    // All icons are 24x24, stroke-based, inherit currentColor
    switch (name) {
        case 'sun':
            return '<svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
        case 'moon':
            return '<svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
        case 'info':
            return '<svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        case 'warning':
            return '<svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        case 'globe':
            return '<svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 0 20a15.3 15.3 0 0 1 0-20z"/></svg>';
        case 'sliders':
            return '<svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>';
        case 'chevronDown':
            return '<svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
        case 'zap':
            return '<svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
        case 'sparkles':
            return '<svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2 5l5 2l-5 2l-2 5l-2-5l-5-2l5-2l2-5z"/></svg>';
        case 'sync':
            return '<svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-15-6.7M3 12a9 9 0 0 0 15 6.7"/><polyline points="3 8 3 3 8 3"/><polyline points="21 16 21 21 16 21"/></svg>';
        case 'check':
            return '<svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
        case 'x':
            return '<svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        case 'checkCircle':
            return '<svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
        case 'share':
            return '<svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
        case 'star':
            return '<svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
        default:
            return '<svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg>';
    }
}

function renderStaticIcons() {
    document.querySelectorAll('i.icon[data-icon]').forEach((el) => {
        const name = el.getAttribute('data-icon');
        el.innerHTML = getIconSvg(name);
    });
}

// --- Helper Functions ---
function getElement(selector) { return document.querySelector(selector); }
function getAllElements(selector) { return document.querySelectorAll(selector); }
function getDomainName(url) { try { return new URL(url).hostname; } catch (e) { return null; } }
function getSinceTime(timeRangeValue) { const now = Date.now(); const range = parseInt(timeRangeValue, 10); if (range === 0) return 0; if (isNaN(range) || range < 0) return now - 3600000; return now - range; }
function getTimeRangeText(timeRangeValue) { const rangeMap = { '3600000': 'Last hour', '86400000': 'Last 24 hours', '604800000': 'Last 7 days', '2419200000': 'Last 4 weeks', '0': 'All time' }; return rangeMap[timeRangeValue] || 'Selected range'; }
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        cacheDOMElements();
        renderStaticIcons();
        const loadedTheme = await loadAppState();
        setupInitialUI(loadedTheme);
        await applyReloadDefaultMigration();
        await checkActiveTabAndUpdateUI();
        addEventListeners();
        addRuntimeMessageListener();
        addStorageListener();
        updateCleanButtonState();
        setupRatingStars();
        
        // Check if we should show the rating request (after 7 days)
        checkAndShowRateRequest();
    } catch (error) {
        console.error("Popup Initialization Failed:", error);
        displayFatalError(`Initialization failed: ${error.message}`);
    }
});

function cacheDOMElements() {
    for (const key in SELECTORS) {
        try {
            const selector = SELECTORS[key];
            if (!selector) continue;

            // For IDs, get single element
            if (selector.startsWith('#')) {
                $[key] = document.querySelector(selector);
            }
            // For collections like .class or complex selectors, get NodeList
            else {
                const elements = document.querySelectorAll(selector);
                $[key] = elements.length === 1 ? elements[0] : elements;
            }

            if (!$[key] && selector.startsWith('#')) {
                console.debug(`No element found for selector: ${selector}`);
            }
        } catch (e) {
            console.error(`Error selecting key "${key}" with selector "${SELECTORS[key]}":`, e);
            $[key] = null;
        }
    }
}

async function loadAppState() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get([STORAGE_KEYS.THEME, STORAGE_KEYS.PREFERENCES, STORAGE_KEYS.USAGE_STATS, STORAGE_KEYS.CLEANING_FLAG, STORAGE_KEYS.INSTALLATION_TIME], (data) => {
            try {
                if (chrome.runtime.lastError) {
                    throw new Error(`Error loading app state: ${chrome.runtime.lastError.message}`);
                }
                currentPreferences = { ...DEFAULT_PREFERENCES, ...(data?.[STORAGE_KEYS.PREFERENCES] || {}) };
                usageStats = { ...DEFAULT_USAGE_STATS, ...(data?.[STORAGE_KEYS.USAGE_STATS] || {}) };
                isCleaningInProgress = data?.[STORAGE_KEYS.CLEANING_FLAG] === true;
                
                // Set installation time if not set
                if (!data?.[STORAGE_KEYS.INSTALLATION_TIME]) {
                    chrome.storage.local.set({ [STORAGE_KEYS.INSTALLATION_TIME]: Date.now() });
                }
                
                resolve(data?.[STORAGE_KEYS.THEME]);
            } catch (error) {
                console.error("Error processing loaded app state:", error);
                currentPreferences = { ...DEFAULT_PREFERENCES };
                usageStats = { ...DEFAULT_USAGE_STATS };
                isCleaningInProgress = false;
                reject(error);
            }
        });
    });
}

// One-time migration: force reloadPage default to false for existing users
async function applyReloadDefaultMigration() {
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEYS.RELOAD_DEFAULT_APPLIED, STORAGE_KEYS.PREFERENCES], (data) => {
            try {
                const alreadyApplied = data?.[STORAGE_KEYS.RELOAD_DEFAULT_APPLIED] === true;
                if (alreadyApplied) return resolve();

                const savedPrefs = data?.[STORAGE_KEYS.PREFERENCES] || {};
                // Set to false regardless of previous default
                const updated = { ...savedPrefs, reloadPage: false };
                currentPreferences = { ...currentPreferences, reloadPage: false };

                chrome.storage.local.set({
                    [STORAGE_KEYS.PREFERENCES]: updated,
                    [STORAGE_KEYS.RELOAD_DEFAULT_APPLIED]: true
                }, () => {
                    // Reflect in UI
                    if ($.reloadPageCheck) $.reloadPageCheck.checked = false;
                    updateSettingIndicators();
                    updateCleanButtonState();
                    resolve();
                });
            } catch (e) {
                resolve();
            }
        });
    });
}

function setupInitialUI(savedTheme) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme === 'dark' || (!savedTheme && prefersDark) ? 'dark' : 'light';
    document.body.classList.toggle('dark-mode', theme === 'dark');
    updateThemeToggleIcon();

    try {
        $.cookiesCheck && ($.cookiesCheck.checked = currentPreferences.cookies);
        $.localStorageCheck && ($.localStorageCheck.checked = currentPreferences.localStorage);
        $.sessionStorageCheck && ($.sessionStorageCheck.checked = currentPreferences.sessionStorage);
        $.cacheCheck && ($.cacheCheck.checked = currentPreferences.cache);
        $.indexedDBCheck && ($.indexedDBCheck.checked = currentPreferences.indexedDB);
        $.clearHistoryCheck && ($.clearHistoryCheck.checked = currentPreferences.clearHistory);
        $.reloadPageCheck && ($.reloadPageCheck.checked = currentPreferences.reloadPage);
        $.confirmBeforeCleanCheck && ($.confirmBeforeCleanCheck.checked = currentPreferences.confirmBeforeClean);
        $.disableRatingPromptsCheck && ($.disableRatingPromptsCheck.checked = currentPreferences.disableRatingPrompts);
        $.timeRangeSelect && ($.timeRangeSelect.value = currentPreferences.timeRange);
    } catch (error) {
        console.error("Error applying preferences to UI:", error);
    }

    updateSettingIndicators();
    updateOptionRangeIndicators();
}

function updateThemeToggleIcon() {
    const isDark = document.body.classList.contains('dark-mode');
    if ($.themeToggle) {
        $.themeToggle.innerHTML = isDark ? getIconSvg('sun') : getIconSvg('moon');
        $.themeToggle.title = isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme';
    }
}

function updateSettingIndicators() {
    $.reloadIndicator?.classList.toggle('hidden', !currentPreferences.reloadPage);
    $.confirmIndicator?.classList.toggle('hidden', !currentPreferences.confirmBeforeClean);
}

function updateOptionRangeIndicators() {
    const rangeText = `(${getTimeRangeText(currentPreferences.timeRange)})`;
    $.optionRangeIndicators?.forEach(indicator => {
        if (indicator) indicator.textContent = rangeText;
    });
}

// --- Tab Status & Data Counts ---

async function checkActiveTabAndUpdateUI() {
    hideResultCards();
    activeTabInfo = null;
    let tabError = null;

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0 || !tabs[0]?.id) { // Added optional chaining for id
            throw new Error("Could not get active tab information.");
        }
        const tab = tabs[0];
        activeTabInfo = { id: tab.id, url: tab.url };

        if (!tab.url || !tab.url.startsWith('http')) {
            const message = tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://') || tab.url?.startsWith('about:')
                ? "Cleaning options for this tab are disabled on browser internal pages."
                : tab.url?.startsWith('file://')
                    ? "Cleaning options for this tab are disabled on local files."
                    : "Cleaning options for this tab are disabled on this page type.";
            setTabSpecificOptionsEnabled(false, message);
            $.dataFetchError?.classList.add('hidden');
        } else if (isRestrictedUrl(tab.url)) {
            setTabSpecificOptionsEnabled(false, "Cleaning options for this site are disabled.");
            $.dataFetchError?.classList.add('hidden');
        } else {
            setTabSpecificOptionsEnabled(true);
            await fetchAndDisplayDataCounts(activeTabInfo);
        }
    } catch (error) {
        console.error("Error checking active tab:", error);
        tabError = error;
        setTabSpecificOptionsEnabled(false, "Could not access active tab information.");
        $.dataFetchError?.classList.add('hidden');
    } finally {
        updateCleanButtonState();
    }
}

function setTabSpecificOptionsEnabled(enabled, message = "") {
    const optionsToToggle = [$.cookiesCheck, $.localStorageCheck, $.sessionStorageCheck];
    const countsToClear = [$.cookiesCount, $.localStorageCount, $.sessionStorageCount];

    optionsToToggle.forEach(checkbox => {
        if (checkbox) {
            const row = checkbox.closest('.option-row');
            checkbox.disabled = !enabled;
            row?.classList.toggle('disabled', !enabled);
            if (!enabled && checkbox.checked) {
                checkbox.checked = false;
            }
        }
    });

    if (enabled) {
        $.tabStatusMessage?.classList.add('hidden');
    } else {
        countsToClear.forEach(el => { if (el) el.textContent = ''; });
        if ($.tabStatusMessage && $.tabStatusText) {
            $.tabStatusText.textContent = message;
            $.tabStatusMessage.classList.remove('hidden');
        }
    }
}

async function fetchAndDisplayDataCounts(tab) {
    if (!tab || !tab.id) return;

    if (isRestrictedUrl(tab.url)) {
        // Show N/A for restricted pages without attempting scripting
        updateDataCountUI('cookiesCount', '(N/A)');
        updateDataCountUI('localStorageCount', '(N/A)');
        updateDataCountUI('sessionStorageCount', '(N/A)');
        $.dataFetchError?.classList.add('hidden');
        return;
    }

    let fetchErrorOccurred = false;
    let isErrorPage = false;
    const counts = { cookies: '...', localStorage: '...', sessionStorage: '...' };

    updateDataCountUI('cookiesCount', counts.cookies);
    updateDataCountUI('localStorageCount', counts.localStorage);
    updateDataCountUI('sessionStorageCount', counts.sessionStorage);

    const promises = [
        getCookieCount(tab).then(c => counts.cookies = c).catch(e => {
            console.warn("Count Error (Cookies):", e.message);
            counts.cookies = '?';
            fetchErrorOccurred = true;
            if (e.message.includes("error page")) isErrorPage = true;
        }),
        getStorageCount(tab.id, 'localStorage').then(c => counts.localStorage = c).catch(e => {
            console.warn("Count Error (Local):", e.message);
            counts.localStorage = '?';
            fetchErrorOccurred = true;
            if (e.message.includes("error page")) isErrorPage = true;
            if ($.localStorageCount) $.localStorageCount.dataset.errorType = e.message.includes("error page") ? 'error-page' : 'other-error';
        }),
        getStorageCount(tab.id, 'sessionStorage').then(c => counts.sessionStorage = c).catch(e => {
            console.warn("Count Error (Session):", e.message);
            counts.sessionStorage = '?';
            fetchErrorOccurred = true;
            if (e.message.includes("error page")) isErrorPage = true;
            if ($.sessionStorageCount) $.sessionStorageCount.dataset.errorType = e.message.includes("error page") ? 'error-page' : 'other-error';
        })
    ];

    try { await Promise.allSettled(promises); }
    catch (error) { console.error("Unexpected error during data count fetching:", error); fetchErrorOccurred = true; }

    updateDataCountUI('cookiesCount', counts.cookies);
    updateDataCountUI('localStorageCount', counts.localStorage);
    updateDataCountUI('sessionStorageCount', counts.sessionStorage);

    // Don't show error message for error pages
    $.dataFetchError?.classList.toggle('hidden', !fetchErrorOccurred || isErrorPage);
}

function isRestrictedUrl(url) {
    try {
        const u = new URL(url);
        const host = u.hostname || '';
        // Known restricted galleries and stores
        const restrictedHosts = [
            'chromewebstore.google.com',
            'chrome.google.com', // legacy Web Store paths
            'microsoftedge.microsoft.com',
            'addons.opera.com'
        ];
        if (restrictedHosts.some(h => host === h || host.endsWith('.' + h))) return true;
        // Disallow chrome-error pages as well
        if (url.includes('chrome-error:')) return true;
        return false;
    } catch {
        return false;
    }
}

function updateDataCountUI(elementId, count) {
    const element = $[elementId];
    if (!element) return;
    element.innerHTML = '';
    element.className = 'data-count';

    if (count === '...') {
        element.textContent = '...';
    }
    else if (count === '?') {
        if (activeTabInfo?.url && (
            activeTabInfo.url.includes('chrome-error:') ||
            element.dataset.errorType === 'error-page'
        )) {
            // Error page - show N/A
            element.textContent = '(N/A)';
            element.classList.add('unavailable');
        } else {
            // Other errors - show warning icon
            const errorIcon = document.createElement('span');
            errorIcon.className = 'error-icon';
            errorIcon.innerHTML = getIconSvg('warning');
            errorIcon.title = 'Could not retrieve count';
            element.appendChild(errorIcon);
            element.classList.add('error-icon');
        }
    }
    else if (typeof count === 'number' && count >= 0) {
        element.textContent = `(${count})`;
    }
    else {
        element.textContent = '(0)';
    }
}
// --- Event Listeners ---

function addEventListeners() {
    $.themeToggle?.addEventListener('click', handleThemeToggle);

    const preferenceElements = [
        $.cookiesCheck, $.localStorageCheck, $.sessionStorageCheck,
        $.cacheCheck, $.indexedDBCheck, $.clearHistoryCheck,
        $.reloadPageCheck, $.confirmBeforeCleanCheck, $.disableRatingPromptsCheck, $.timeRangeSelect
    ];
    preferenceElements.forEach(el => el?.addEventListener('change', handlePreferenceChange));

    document.body.addEventListener('click', handleBodyClick);
    document.body.addEventListener('mouseover', handleTooltipMouseover);
    document.body.addEventListener('mouseout', handleTooltipMouseout);
    document.body.addEventListener('focusin', handleTooltipFocusin);
    document.body.addEventListener('focusout', handleTooltipFocusout);
    $.infoTooltip?.addEventListener('mouseenter', () => clearTimeout(tooltipTimeout));
    $.infoTooltip?.addEventListener('mouseleave', () => { tooltipTimeout = setTimeout(hideTooltip, 150); });

    $.additionalOptionsHeader?.addEventListener('keydown', handleCollapsibleKeydown);
    $.additionalOptionsHeader?.addEventListener('click', () => setTimeout(repositionTooltip, 350));
    $.cleanBtn?.addEventListener('click', handleCleanButtonClick);
    $.cleanBtn?.addEventListener('mouseout', handleCleanButtonMouseout);
    $.closeSummaryBtn?.addEventListener('click', () => $.summaryElement?.classList.add('hidden'));
    $.closeErrorBtn?.addEventListener('click', () => $.errorElement?.classList.add('hidden'));
    $.showRatingBtn?.addEventListener('click', showRatingModal);
    document.body.addEventListener('scroll', handleBodyScroll, { capture: true, passive: true });
    
    // Quick presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', handlePresetClick);
    });
}

// --- Event Handlers ---

function handleThemeToggle() {
    const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    document.body.classList.toggle('dark-mode', newTheme === 'dark');
    updateThemeToggleIcon();
    chrome.storage.local.set({ [STORAGE_KEYS.THEME]: newTheme }, () => {
        if (chrome.runtime.lastError) console.error("Error saving theme:", chrome.runtime.lastError);
    });
}

function handlePreferenceChange() {
    const checkElements = [
        $.cookiesCheck, $.localStorageCheck, $.sessionStorageCheck,
        $.cacheCheck, $.indexedDBCheck, $.clearHistoryCheck,
        $.reloadPageCheck, $.confirmBeforeCleanCheck, $.disableRatingPromptsCheck
    ];
    let changed = false;
    checkElements.forEach(el => {
        if (el) {
            const key = el.id;
            const newValue = el.checked;
            if (!el.disabled || ['reloadPage', 'confirmBeforeClean', 'disableRatingPrompts'].includes(key)) {
                if (currentPreferences[key] !== newValue) {
                    currentPreferences[key] = newValue;
                    changed = true;
                }
            }
        }
    });
    if ($.timeRangeSelect) {
        const newRange = $.timeRangeSelect.value;
        if (currentPreferences.timeRange !== newRange) {
            currentPreferences.timeRange = newRange;
            changed = true;
        }
    }

    if (changed) {
        updateSettingIndicators();
        updateOptionRangeIndicators();
        updateCleanButtonState();
        chrome.storage.local.set({ [STORAGE_KEYS.PREFERENCES]: currentPreferences }, () => {
            if (chrome.runtime.lastError) console.error("Error saving current settings:", chrome.runtime.lastError);
        });
    }
}

function handleBodyClick(e) {
    const labelTarget = e.target.closest('.option-row label:not([for="timeRangeSelect"])');
    const toggleTarget = e.target.closest('.toggle-switch');
    const infoIconTarget = e.target.closest('.info-icon');
    const collapsibleHeader = e.target.closest('.collapsible-header');
    const ratingLabel = e.target.closest('.rating-group label');
    const ratingInput = e.target.closest('.rating-group input');

    if (infoIconTarget || e.target === $.infoTooltip) { e.stopPropagation(); return; }
    if (collapsibleHeader) { toggleCollapsibleSection(collapsibleHeader); return; }

    // Handle rating input clicks
    if (ratingLabel) {
        e.preventDefault(); // Prevent default anchor behavior
        const inputId = ratingLabel.getAttribute('for');
        if (inputId) {
            const input = document.getElementById(inputId);
            if (input) {
                input.checked = true;

                // Record the rating
                if (input.value) {
                    recordRating(parseInt(input.value, 10));
                }

                // Open the link
                const anchor = ratingLabel.querySelector('a');
                if (anchor && anchor.href) {
                    window.open(anchor.href, '_blank');
                }
            }
        }
        return;
    }

    if (labelTarget || (toggleTarget && !e.target.matches('input[type="checkbox"]'))) {
        const row = e.target.closest('.option-row');
        const checkbox = row?.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox.disabled) {
            if (e.target !== checkbox) checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
}

function handleTooltipMouseover(e) {
    const icon = e.target.closest('.info-icon');
    if (icon && icon.dataset.tooltip) {
        clearTimeout(tooltipTimeout);
        if (icon !== currentTooltipTarget || !$.infoTooltip?.classList.contains('show')) {
            hideTooltip();
            showTooltip(icon, icon.dataset.tooltip);
        }
    }
}

function handleTooltipMouseout(e) {
    const icon = e.target.closest('.info-icon');
    if (icon && icon === currentTooltipTarget) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = setTimeout(hideTooltip, 150);
    }
}

function handleTooltipFocusin(e) {
    const icon = e.target.closest('.info-icon');
    if (icon && icon.dataset.tooltip) {
        clearTimeout(tooltipTimeout);
        hideTooltip();
        setTimeout(() => showTooltip(icon, icon.dataset.tooltip), 50);
    }
}

function handleTooltipFocusout(e) {
    const icon = e.target.closest('.info-icon');
    if (icon && icon === currentTooltipTarget) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = setTimeout(hideTooltip, 150);
    }
}

function handleCollapsibleKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleCollapsibleSection(e.target);
    }
}

function handleCleanButtonMouseout() {
    if (isAwaitingConfirmation) {
        resetConfirmationState();
        updateCleanButtonState();
    }
}

function handleBodyScroll() {
    if ($.infoTooltip?.classList.contains('show')) {
        repositionTooltip();
    }
}

function handlePresetClick(e) {
    const preset = e.currentTarget.dataset.preset;

    // Apply with subtle highlight to show what changed
    if (preset === 'quick') {
        animateToggleHighlight($.cookiesCheck, true);
        animateToggleHighlight($.localStorageCheck, true);
        animateToggleHighlight($.sessionStorageCheck, true);
        animateToggleHighlight($.cacheCheck, false);
        animateToggleHighlight($.indexedDBCheck, false);
        animateToggleHighlight($.clearHistoryCheck, false);
    } else if (preset === 'full') {
        animateToggleHighlight($.cookiesCheck, true);
        animateToggleHighlight($.localStorageCheck, true);
        animateToggleHighlight($.sessionStorageCheck, true);
        animateToggleHighlight($.cacheCheck, true);
        animateToggleHighlight($.indexedDBCheck, true);
        animateToggleHighlight($.clearHistoryCheck, false); // history off by default
    }

    // Persist once after batch updates
    handlePreferenceChange();

    // Button micro-feedback
    if (e.currentTarget && e.currentTarget.style) {
        e.currentTarget.style.transform = 'scale(0.95)';
        setTimeout(() => { if (e.currentTarget && e.currentTarget.style) { e.currentTarget.style.transform = ''; } }, 150);
    }
}

function animateToggleHighlight(toggleEl, newState) {
    if (!toggleEl) return;
    const row = toggleEl.closest('.option-row');
    // Set state
    toggleEl.checked = newState;
    // Visual cue
    if (row) {
        row.classList.add('highlight');
        setTimeout(() => row.classList.remove('highlight'), 800);
    }
}

// --- Message & Storage Listeners ---

function addRuntimeMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        try {
            if (!sender || sender.id !== chrome.runtime.id) {
                return false;
            }

            if (message.action === "cleaningComplete") {
                handleCleaningComplete(message);
                return true; // Indicate async handling
            }
            return false;
        } catch (error) { console.error("Error processing runtime message:", error, message); return false; }
    });
}

function handleCleaningComplete(message) {
    console.log("Cleaning complete received:", message);

    // Set the flag to ignore the next storage change event
    ignoreNextStorageChange = true;

    // Update state
    isCleaningInProgress = false;
    isAwaitingConfirmation = false;

    // Display results in cards
    displayResults(message.success, message.summary || [], message.errors || []);

    // Update data counts
    if (activeTabInfo && activeTabInfo.id && activeTabInfo.url?.startsWith('http')) {
        fetchAndDisplayDataCounts(activeTabInfo);
    }

    // Clear any existing button timers
    clearTimeout(cleanBtnTimeout);

    // Determine if there are errors
    const hasErrors = message.errors && message.errors.length > 0;

    // Explicitly set button state
    if (hasErrors) {
        console.log("Setting ERROR state");

        // Force remove all classes and set error class
        $.cleanBtn.className = 'clean-btn error';

        // Clear button content
        $.cleanBtn.innerHTML = `
            ${getIconSvg('x')}
            <span class="status-text">Error</span>
        `;

        // Set timer to return to normal state
        cleanBtnTimeout = setTimeout(() => {
            console.log("Resetting from ERROR state");
            updateCleanButtonState();
        }, 3000);
    } else {
        console.log("Setting SUCCESS state");

        // Force remove all classes and set success class
        $.cleanBtn.className = 'clean-btn success';

        // Clear button content
        $.cleanBtn.innerHTML = `
            ${getIconSvg('check')}
            <span class="status-text">Success</span>
        `;
        usageStats.cleanCount++;
        saveUsageStats();

        // Set timer to return to normal state
        cleanBtnTimeout = setTimeout(() => {
            console.log("Resetting from SUCCESS state");
            updateCleanButtonState();
        }, 2000);
    }
}

function setButtonVisualState(state, text = '') {
    const btn = $.cleanBtn;
    if (!btn) return;

    console.log(`Setting button state to: ${state} with text: ${text}`);

    if (state !== 'success' && state !== 'error') { clearTimeout(cleanBtnTimeout); }

    // First remove all state classes
    btn.classList.remove('loading', 'success', 'error', 'confirm');
    btn.disabled = false;

    // Fully restore original button structure
    btn.innerHTML = `
        ${getIconSvg('sparkles')}
        <span id="cleanBtnText" class="btn-text">${text}</span>
        <div class="clean-btn-indicators">
            <span id="reloadIndicator" class="setting-indicator ${!currentPreferences.reloadPage ? 'hidden' : ''}" title="Page will reload">${getIconSvg('sync')}</span>
            <span id="confirmIndicator" class="setting-indicator ${!currentPreferences.confirmBeforeClean ? 'hidden' : ''}" title="Confirmation needed">${getIconSvg('check')}</span>
        </div>
    `;

    // Now modify structure based on state
    switch (state) {
        case 'loading':
            btn.disabled = true;
            btn.classList.add('loading');
            btn.innerHTML = `
                <div class="loader"></div>
                <span class="status-text">${text}</span>
            `;
            break;
        case 'success': case 'error':
            btn.classList.add(state);
            const iconName = state === 'success' ? 'check' : 'x';
            btn.innerHTML = `
                ${getIconSvg(iconName)}
                <span class="status-text">${text}</span>
            `;
            break;
        case 'confirm':
            btn.classList.add('confirm');
            // Button already has needed structure, just update text
            break;
        case 'disabled':
            btn.disabled = true;
            // Button already has needed structure, just update text
            break;
        case 'default': default:
            // Button already has needed structure
            break;
    }
}

function addStorageListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
        try {
            if (area !== 'local') return;

            if (changes[STORAGE_KEYS.CLEANING_FLAG]) {
                // If we should ignore this event, do so and reset the flag
                if (ignoreNextStorageChange) {
                    console.log("Ignoring storage change event as requested");
                    ignoreNextStorageChange = false;
                    return;
                }

                const flagSaysIsCleaning = changes[STORAGE_KEYS.CLEANING_FLAG].newValue === true;
                if (flagSaysIsCleaning !== isCleaningInProgress) {
                    console.log(`Popup: Cleaning flag changed to ${flagSaysIsCleaning}. Syncing state.`);
                    isCleaningInProgress = flagSaysIsCleaning;
                    updateCleanButtonState();
                    if (!isCleaningInProgress && activeTabInfo?.url?.startsWith('http')) {
                        fetchAndDisplayDataCounts(activeTabInfo);
                    }
                }
            }
            if (changes[STORAGE_KEYS.PREFERENCES]) {
                currentPreferences = { ...DEFAULT_PREFERENCES, ...(changes[STORAGE_KEYS.PREFERENCES].newValue || {}) };
                setupInitialUI(null);
                updateCleanButtonState();
            }
            if (changes[STORAGE_KEYS.THEME]) {
                const newTheme = changes[STORAGE_KEYS.THEME].newValue;
                document.body.classList.toggle('dark-mode', newTheme === 'dark');
                updateThemeToggleIcon();
            }
        } catch (error) { console.error("Error processing storage change:", error, changes); }
    });
}

// --- Core Actions ---

async function handleCleanButtonClick() {
    if (!$.cleanBtn || ($.cleanBtn.disabled && !isAwaitingConfirmation) || isCleaningInProgress) return;
    if (!isAnyCleaningOptionSelected() && !isAwaitingConfirmation) return;

    try {
        // Check cleaning flag in storage
        const data = await chrome.storage.local.get(STORAGE_KEYS.CLEANING_FLAG);
        if (data?.[STORAGE_KEYS.CLEANING_FLAG] === true) {
            console.warn("Popup: Cleaning flag is still true. Aborting.");
            isCleaningInProgress = true;
            setButtonVisualState('loading', 'Cleaning in progress...');
            return;
        }

        // Handle confirmation state
        if (currentPreferences.confirmBeforeClean && !isAwaitingConfirmation) {
            isAwaitingConfirmation = true;
            setButtonVisualState('confirm', 'Confirm Clean?');
            setTimeout(() => {
                document.addEventListener('click', handleOutsideConfirmClick, { once: true, capture: true });
            }, 0);
            return;
        }

        // Remove confirmation state if active
        if (isAwaitingConfirmation) {
            document.removeEventListener('click', handleOutsideConfirmClick, { capture: true });
        }

        // Ensure optional permissions (history) as needed
        await ensureOptionalPermissions({
            needsHistory: $.clearHistoryCheck?.checked === true,
            needsNotifications: false
        });

        // Set cleaning states
        isAwaitingConfirmation = false;
        isCleaningInProgress = true;

        // Update UI
        setButtonVisualState('loading', 'Cleaning in progress...');
        hideResultCards();

        // Prepare cleaning options
        const optionsToSend = {
            cookies: $.cookiesCheck?.checked && !$.cookiesCheck?.disabled,
            localStorage: $.localStorageCheck?.checked && !$.localStorageCheck?.disabled,
            sessionStorage: $.sessionStorageCheck?.checked && !$.sessionStorageCheck?.disabled,
            cache: $.cacheCheck?.checked,
            indexedDB: $.indexedDBCheck?.checked,
            clearHistory: $.clearHistoryCheck?.checked,
            reloadPage: currentPreferences.reloadPage,
        };

        const sinceTime = getSinceTime(currentPreferences.timeRange);

        // Set flag to ignore next storage change
        ignoreNextStorageChange = true;

        // Send cleaning message to service worker
        await chrome.runtime.sendMessage({
            action: "cleanData",
            options: optionsToSend,
            tabInfo: activeTabInfo,
            sinceTime: sinceTime
        });

        // Usage stats are incremented on successful completion only

    } catch (error) {
        console.error("Popup: Error during cleaning:", error);

        // Reset states
        isCleaningInProgress = false;
        isAwaitingConfirmation = false;

        // Update UI with error
        setButtonVisualState('error', 'Error');

        // Show appropriate error message
        let errorMessage = 'An unexpected error occurred.';
        if (error.message.includes('Could not establish connection')) {
            errorMessage = 'Service Error: Cannot connect. Try reloading extension.';
        } else {
            errorMessage = `Service Error: ${error.message}`;
        }

        displayResults(false, [], [errorMessage]);

        // Clean up and reset
        resetAfterDelay(3000);
        chrome.storage.local.remove(STORAGE_KEYS.CLEANING_FLAG, () => {
            if (chrome.runtime.lastError) {
                console.error("Failed to remove cleaning flag:", chrome.runtime.lastError);
            }
        });
    }
}

async function ensureOptionalPermissions({ needsHistory, needsNotifications }) {
    try {
        const toRequest = [];
        if (needsHistory) toRequest.push('history');
        // Note: notifications permission removed from manifest, so we don't request it
        if (toRequest.length === 0) return;

        // Filter already granted
        const granted = await chrome.permissions.getAll();
        const stillNeeded = toRequest.filter(p => !(granted?.permissions || []).includes(p));
        if (stillNeeded.length === 0) return;

        // Attempt request (must be user gesture; we're in a click handler)
        await chrome.permissions.request({ permissions: stillNeeded });
    } catch (e) {
        // Silently continue; features will degrade gracefully
        console.warn('Optional permissions request failed or denied:', e?.message || e);
    }
}

function handleOutsideConfirmClick(event) {
    if (isAwaitingConfirmation && $.cleanBtn && !$.cleanBtn.contains(event.target)) {
        event.preventDefault(); event.stopPropagation();
        resetConfirmationState();
        updateCleanButtonState();
    }
}

// --- UI Helpers ---

function toggleCollapsibleSection(headerElement) {
    const card = headerElement?.closest('.collapsible');
    if (!card) return;
    const content = card.querySelector('.card-content');
    if (!content) return;
    const isCollapsed = card.classList.contains('collapsed');

    if (isCollapsed) {
        if (content && content.style) content.style.maxHeight = content.scrollHeight + "px";
        card.classList.remove('collapsed');
        headerElement.setAttribute('aria-expanded', 'true');
        content.addEventListener('transitionend', function onExpandEnd() {
            content.removeEventListener('transitionend', onExpandEnd);
            if (!card.classList.contains('collapsed') && content && content.style) content.style.maxHeight = 'none';

            // After expanding, reinitialize icons inside
            refreshTooltipHandlers();
        }, { once: true });
    } else {
        if (content && content.style) content.style.maxHeight = content.scrollHeight + "px";
        requestAnimationFrame(() => {
            if (content && content.style) content.style.maxHeight = '0';
            card.classList.add('collapsed');
            headerElement.setAttribute('aria-expanded', 'false');
        });
    }
}

function refreshTooltipHandlers() {
    // Reinitialize event handlers for all tooltip icons
    getAllElements('.info-icon').forEach(icon => {
        if (icon.dataset.tooltipInitialized !== 'true') {
            icon.dataset.tooltipInitialized = 'true';
        }
    });

    // If there's an active tooltip, reposition it
    if (currentTooltipTarget && $.infoTooltip?.classList.contains('show')) {
        repositionTooltip();
    }
}

function displayResults(success, summaryItems, errorItems) {
    hideResultCards();
    const uniqueErrors = [...new Set(errorItems || [])];
    const uniqueSummary = [...new Set(summaryItems || [])];

    if (uniqueErrors.length > 0 && $.errorElement && $.errorListElement) {
        $.errorListElement.innerHTML = uniqueErrors.map(err => `<li>${escapeHtml(String(err))}</li>`).join('');
        $.errorElement.classList.remove('hidden');
    }
    if (uniqueSummary.length > 0 && $.summaryElement && $.summaryListElement) {
        $.summaryListElement.innerHTML = uniqueSummary.map(msg => `<li>${escapeHtml(String(msg))}</li>`).join('');
        $.summaryElement.classList.remove('hidden');
    }
    if (success && uniqueErrors.length === 0 && uniqueSummary.length === 0 && $.summaryElement?.classList.contains('hidden')) {
        if ($.summaryElement && $.summaryListElement) {
            $.summaryListElement.innerHTML = `<li>Finished. No specific data found or cleared.</li>`;
            $.summaryElement.classList.remove('hidden');
        }
    }
}

function hideResultCards() {
    $.summaryElement?.classList.add('hidden');
    $.errorElement?.classList.add('hidden');
    if ($.summaryListElement) $.summaryListElement.innerHTML = '';
    if ($.errorListElement) $.errorListElement.innerHTML = '';
}

function showTooltip(element, text) {
    if (!$.infoTooltip || !element) return;

    currentTooltipTarget = element;
    $.infoTooltip.textContent = text;
    $.infoTooltip.setAttribute('aria-hidden', 'false');

    // Temporarily make the tooltip visible but transparent for measurement
    if ($.infoTooltip.style) {
        $.infoTooltip.style.opacity = '0';
    }
    $.infoTooltip.classList.add('show');

    positionTooltip(element);

    // Make tooltip visible
    if ($.infoTooltip.style) {
        $.infoTooltip.style.opacity = '';
    }
}

function positionTooltip(element) {
    if (!$.infoTooltip || !element) return;

    // Get element's position relative to the viewport
    const rect = element.getBoundingClientRect();

    // Measure tooltip dimensions
    const tooltipWidth = $.infoTooltip.offsetWidth;
    const tooltipHeight = $.infoTooltip.offsetHeight;

    // Calculate initial position - center below the element
    let top = rect.bottom + 5;
    let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);

    const PADDING = 5;

    // Keep tooltip within viewport horizontally
    if (left < PADDING) left = PADDING;
    if (left + tooltipWidth > window.innerWidth - PADDING)
        left = window.innerWidth - tooltipWidth - PADDING;

    // If tooltip would go below viewport, position above the element instead
    if (top + tooltipHeight > window.innerHeight - PADDING) {
        top = rect.top - tooltipHeight - 5;
    }

    // Ensure tooltip is not positioned above viewport
    top = Math.max(top, PADDING);

    // Position tooltip absolutely relative to viewport, not the document
    if ($.infoTooltip.style) {
        $.infoTooltip.style.position = 'fixed';
        $.infoTooltip.style.top = `${top}px`;
        $.infoTooltip.style.left = `${left}px`;
    }
}

function repositionTooltip() {
    if (currentTooltipTarget && $.infoTooltip?.classList.contains('show')) {
        positionTooltip(currentTooltipTarget);
    }
}

function hideTooltip() {
    if ($.infoTooltip) {
        $.infoTooltip.classList.remove('show');
        $.infoTooltip.setAttribute('aria-hidden', 'true');
    }
    currentTooltipTarget = null;
}

function displayFatalError(message) {
    const body = document.body;
    if (body) {
        body.innerHTML = `<div style="padding: 15px; color: red; font-family: sans-serif;">Error: ${escapeHtml(message)} Please reload the extension.</div>`;
    }
}

// --- Button State Management ---

function isAnyCleaningOptionSelected() {
    return [$.cookiesCheck, $.localStorageCheck, $.sessionStorageCheck, $.cacheCheck, $.indexedDBCheck, $.clearHistoryCheck]
        .some(checkbox => checkbox?.checked && !checkbox?.disabled);
}

function updateCleanButtonState() {
    if (isCleaningInProgress) { setButtonVisualState('loading', 'Cleaning in progress...'); }
    else if (isAwaitingConfirmation) { setButtonVisualState('confirm', 'Confirm Clean?'); }
    else if (!isAnyCleaningOptionSelected()) { setButtonVisualState('disabled', 'Select options to clean'); }
    else { setButtonVisualState('default', 'Clean Now'); }
}

function resetConfirmationState() {
    if (isAwaitingConfirmation) {
        isAwaitingConfirmation = false;
        document.removeEventListener('click', handleOutsideConfirmClick, { capture: true });
    }
}

function resetAfterDelay(delayMs) {
    clearTimeout(cleanBtnTimeout);
    cleanBtnTimeout = setTimeout(() => {
        if (!isCleaningInProgress && !isAwaitingConfirmation) {
            updateCleanButtonState();
        }
    }, delayMs);
}

function resetButtonState() {
    resetConfirmationState();
    updateCleanButtonState();
}

// --- Rating Stars Functions ---
function setupRatingStars() {
    if (!$.ratingStars) return;

    // Make all ratings interactive
    const stars = document.querySelectorAll('.rating-group input');
    stars.forEach(star => {
        star.addEventListener('change', (e) => {
            const rating = parseInt(e.target.value, 10);
            if (!isNaN(rating)) {
                recordRating(rating);

                // Open appropriate URL
                if (rating >= 4) {
                    // Good rating - open Chrome Web Store
                    window.open('https://chromewebstore.google.com/detail/cache-cleaner/deadjnaenmndpdpakgchpbedlcdmmoai/reviews', '_blank');
                } else {
                    // Lower rating - open feedback form
                    window.open('https://docs.google.com/forms/d/e/1FAIpQLSfMhxA90yHeCzM--GsPpnqlf_d9Rjm8N5jB0c52YyOst9MWdg/viewform?usp=dialog', '_blank');
                }
            }
        });
    });
}

function recordRating(rating) {
    // Save the rating information to storage
    chrome.storage.local.set({
        [STORAGE_KEYS.RATING_SHOWN]: true,
        userRating: rating,
        ratingTimestamp: Date.now()
    }, () => {
        if (chrome.runtime.lastError) {
            console.error("Error saving rating data:", chrome.runtime.lastError);
        }
    });

    // Hide rating UI after a small delay
    setTimeout(() => {
        // legacy section
        if ($.ratingSection) $.ratingSection.classList.add('hidden');
        // new modal
        const modal = document.getElementById('rateModal');
        if (modal) modal.classList.add('hidden');
    }, 500);
}

// --- Usage Stats & Rate Request ---
function saveUsageStats() {
    chrome.storage.local.set({ [STORAGE_KEYS.USAGE_STATS]: usageStats }, () => {
        if (chrome.runtime.lastError) console.error("Error saving usage stats:", chrome.runtime.lastError);
    });
}

// Show rating modal manually (for Rate Extension button)
function showRatingModal() {
    const modal = document.getElementById('rateModal');
    if (modal && modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        const closeBtn = document.getElementById('rateCloseBtn');
        const previouslyFocused = document.activeElement;
        // focus trap
        const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const firstEl = focusable[0];
        const lastEl = focusable[focusable.length - 1];
        if (firstEl) firstEl.focus();
        function onKeydown(ev) {
            if (ev.key === 'Escape') { hide(); }
            if (ev.key === 'Tab' && focusable.length > 0) {
                if (ev.shiftKey && document.activeElement === firstEl) { ev.preventDefault(); lastEl.focus(); }
                else if (!ev.shiftKey && document.activeElement === lastEl) { ev.preventDefault(); firstEl.focus(); }
            }
        }
        function hide() {
            modal.classList.add('hidden');
            document.removeEventListener('keydown', onKeydown, true);
            if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
        }
        if (closeBtn) closeBtn.onclick = hide;
        // Close on overlay click
        modal.addEventListener('click', (e) => { if (e.target === modal) hide(); }, { once: true });
        document.addEventListener('keydown', onKeydown, true);
    }
}

// Check if we should show the rating request
function checkAndShowRateRequest() {
    // Check if user has disabled rating prompts
    chrome.storage.local.get([STORAGE_KEYS.RATING_SHOWN, 'disableRatingPrompts', STORAGE_KEYS.INSTALLATION_TIME], (data) => {
        const hasShownRating = data?.[STORAGE_KEYS.RATING_SHOWN] === true;
        const ratingDisabled = data?.disableRatingPrompts === true;
        const installationTime = data?.[STORAGE_KEYS.INSTALLATION_TIME];
        
        // Don't show rating if user has disabled it or already rated
        if (hasShownRating || ratingDisabled) {
            return;
        }
        
        // Check if 7 days have passed since installation
        if (installationTime) {
            const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
            const timeSinceInstallation = Date.now() - installationTime;
            
            if (timeSinceInstallation < sevenDaysInMs) {
                return; // Not enough time has passed
            }
        }
        
        // Show rating modal after pressing Clean if user hasn't rated yet
        const modal = document.getElementById('rateModal');
        if (modal && modal.classList.contains('hidden')) {
            modal.classList.remove('hidden');
            const closeBtn = document.getElementById('rateCloseBtn');
            const previouslyFocused = document.activeElement;
            // focus trap
            const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            const firstEl = focusable[0];
            const lastEl = focusable[focusable.length - 1];
            if (firstEl) firstEl.focus();
            function onKeydown(ev) {
                if (ev.key === 'Escape') { hide(); }
                if (ev.key === 'Tab' && focusable.length > 0) {
                    if (ev.shiftKey && document.activeElement === firstEl) { ev.preventDefault(); lastEl.focus(); }
                    else if (!ev.shiftKey && document.activeElement === lastEl) { ev.preventDefault(); firstEl.focus(); }
                }
            }
            function hide() {
                modal.classList.add('hidden');
                document.removeEventListener('keydown', onKeydown, true);
                if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
            }
            if (closeBtn) closeBtn.onclick = hide;
            // Close on overlay click
            modal.addEventListener('click', (e) => { if (e.target === modal) hide(); }, { once: true });
            document.addEventListener('keydown', onKeydown, true);
        }
    });
}

// --- Data Count Fetching Functions ---
async function getCookieCount(tab) {
    if (typeof chrome.cookies?.getAll !== 'function') throw new Error("Missing 'cookies' permission or API unavailable.");
    if (!tab || !tab.url) throw new Error("Invalid tab info for cookie count.");
    try {
        let url; try { url = new URL(tab.url); } catch (e) { throw new Error(`Invalid tab URL: ${tab.url}`); }
        const queryDetails = url.protocol.startsWith('http') && url.hostname ? { domain: url.hostname } : { url: tab.url };
        const cookies = await chrome.cookies.getAll(queryDetails);
        return cookies.length;
    } catch (error) { console.error(`Error getting cookie count for ${tab.url}:`, error); throw new Error(`Cookie count error: ${error.message}`); }
}

async function getStorageCount(tabId, storageType) {
    if (typeof chrome.scripting?.executeScript !== 'function') throw new Error("Missing 'scripting' permission or API unavailable.");
    if (!tabId) throw new Error("Invalid tabId for storage count.");
    
    // Check if we can access the tab first
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('file://')) {
            return 0; // Cannot access storage on this type of page
        }
    } catch (e) {
        return 0; // Cannot access tab information
    }
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId }, injectImmediately: true,
            func: (sType) => {
                try {
                    const st = window[sType];
                    if (!st) {
                        return { count: 0, success: true };
                    }
                    
                    // Get the count safely
                    let count = 0;
                    try {
                        count = st.length;
                    } catch (e) {
                        // Some storage objects might not have a length property
                        count = Object.keys(st).length;
                    }
                    
                    return { count: count, success: true };
                } catch (e) {
                    return { error: e.message, success: false };
                }
            },
            args: [storageType]
        });

        // More robust results check
        if (!results || results.length === 0 || !results[0]) {
            throw new Error(`Cannot inject script into tab ${tabId} (${storageType}).`);
        }

        const frameResult = results[0];

        if (frameResult.error) {
            console.warn(`Script execution error for ${storageType}:`, frameResult.error);
            throw new Error(`${storageType} script error: ${frameResult.error.message || 'Unknown'}`);
        }

        const result = frameResult.result;

        if (!result.success) {
            throw new Error(`Cannot access ${storageType}: ${result.error || 'Context error'}`);
        }

        return result.count;
    } catch (error) {
        let msg = error.message || "Unknown executeScript error";

        // More specific error handling
        if (msg.includes("No tab with id")) {
            msg = `Tab ${tabId} not found.`;
        }
        else if (msg.includes("showing error page")) {
            msg = `Page is showing an error (${storageType}).`;
        }
        else if (msg.includes("Cannot inject") || msg.includes("Cannot access") ||
            msg.includes("chrome://") || msg.includes("file://")) {
            msg = `Page access denied (${storageType}).`;
        }
        else {
            msg = `Failed to get ${storageType} count: ${msg}`;
        }

        throw new Error(msg);
    }
}