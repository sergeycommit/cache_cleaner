//// popup.js - Rewritten (v3)

// --- Constants ---
const STORAGE_KEYS = { PREFERENCES: 'preferences', USAGE_STATS: 'usageStats', THEME: 'theme', CLEANING_FLAG: 'isCleaning', RATING_SHOWN: 'ratingShown', LAST_RATING_PROMPT: 'lastRatingPrompt'};
const DEFAULT_PREFERENCES = { cookies: true, localStorage: true, sessionStorage: true, cache: false, indexedDB: false, clearHistory: false, reloadPage: true, confirmBeforeClean: false, timeRange: '3600000' };
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
    ratingDivider: '#ratingDivider',
    ratingStars: '.rating-star',
    ratingClose: '#ratingClose',
    // Share related selectors
    shareButton: '#shareButton',
    shareDialog: '#shareDialog',
    closeShareBtn: '#closeShareBtn',
    shareUrl: '#shareUrl',
    copyShareUrlBtn: '#copyShareUrlBtn',
    copyConfirmation: '#copyConfirmation',
    shareTwitterBtn: '#shareTwitterBtn',
    shareFacebookBtn: '#shareFacebookBtn',
    shareEmailBtn: '#shareEmailBtn',
};
const $ = {}; // Object to cache DOM elements

// Share links and information constants
const SHARE_INFO = {
    url: 'https://chromewebstore.google.com/detail/fgggiddcalbfbchppcmfaldmnfmmneof',
    title: 'Cache Cleaner - Browser Data Cleaner Extension',
    text: 'This browser extension quickly cleans cookies, local storage and other browser data with one click. Try it!'
};

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
let copyConfirmationTimeout = null;

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

// Check if a URL is a restricted page like Chrome Web Store
function isRestrictedPage(url) {
    if (!url) return false;
    return url.includes('chrome.google.com/webstore') ||
        url.includes('chromewebstore.google.com') ||
        url.includes('addons.mozilla.org') ||
        url.includes('chrome://') ||
        url.includes('edge://') ||
        url.includes('about:') ||
        url.includes('file://');
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        cacheDOMElements();
        const loadedTheme = await loadAppState();
        setupInitialUI(loadedTheme);
        await checkActiveTabAndUpdateUI();
        addEventListeners();
        addRuntimeMessageListener();
        addStorageListener();
        updateCleanButtonState();
        initRatingSection();
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
        chrome.storage.local.get([STORAGE_KEYS.THEME, STORAGE_KEYS.PREFERENCES, STORAGE_KEYS.USAGE_STATS, STORAGE_KEYS.CLEANING_FLAG, STORAGE_KEYS.RATING_SHOWN], (data) => {
            try {
                if (chrome.runtime.lastError) {
                    throw new Error(`Error loading app state: ${chrome.runtime.lastError.message}`);
                }
                currentPreferences = { ...DEFAULT_PREFERENCES, ...(data?.[STORAGE_KEYS.PREFERENCES] || {}) };
                usageStats = { ...DEFAULT_USAGE_STATS, ...(data?.[STORAGE_KEYS.USAGE_STATS] || {}) };
                isCleaningInProgress = data?.[STORAGE_KEYS.CLEANING_FLAG] === true;
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
        $.themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
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

        if (!tab.url || !tab.url.startsWith('http') || isRestrictedPage(tab.url)) {
            let message = "Cleaning options for this tab are disabled.";

            if (tab.url) {
                if (tab.url.includes('chrome.google.com/webstore') || tab.url.includes('chromewebstore.google.com')) {
                    message = "Cleaning options are disabled on Chrome Web Store pages.";
                } else if (tab.url.includes('addons.mozilla.org')) {
                    message = "Cleaning options are disabled on Mozilla Add-ons pages.";
                } else if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
                    message = "Cleaning options are disabled on browser internal pages.";
                } else if (tab.url.startsWith('file://')) {
                    message = "Cleaning options are disabled on local files.";
                }
            }

            setTabSpecificOptionsEnabled(false, message);
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

    // Check if we're on a restricted page first
    if (tab.url && isRestrictedPage(tab.url)) {
        updateDataCountUI('cookiesCount', '(N/A)');
        updateDataCountUI('localStorageCount', '(N/A)');
        updateDataCountUI('sessionStorageCount', '(N/A)');
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
            if (e.message.includes("error page") || e.message.includes("cannot be scripted")) isErrorPage = true;
            if ($.localStorageCount) $.localStorageCount.dataset.errorType = e.message.includes("error page") || e.message.includes("cannot be scripted") ? 'error-page' : 'other-error';
        }),
        getStorageCount(tab.id, 'sessionStorage').then(c => counts.sessionStorage = c).catch(e => {
            console.warn("Count Error (Session):", e.message);
            counts.sessionStorage = '?';
            fetchErrorOccurred = true;
            if (e.message.includes("error page") || e.message.includes("cannot be scripted")) isErrorPage = true;
            if ($.sessionStorageCount) $.sessionStorageCount.dataset.errorType = e.message.includes("error page") || e.message.includes("cannot be scripted") ? 'error-page' : 'other-error';
        })
    ];

    try { await Promise.allSettled(promises); }
    catch (error) { console.error("Unexpected error during data count fetching:", error); fetchErrorOccurred = true; }

    updateDataCountUI('cookiesCount', counts.cookies);
    updateDataCountUI('localStorageCount', counts.localStorage);
    updateDataCountUI('sessionStorageCount', counts.sessionStorage);

    // Don't show error message for error pages or restricted pages
    $.dataFetchError?.classList.toggle('hidden', !fetchErrorOccurred || isErrorPage || isRestrictedPage(tab.url));
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
        if ((activeTabInfo?.url && (
            activeTabInfo.url.includes('chrome-error:') ||
            isRestrictedPage(activeTabInfo.url)
        )) || element.dataset.errorType === 'error-page') {
            // Error page or restricted page - show N/A
            element.textContent = '(N/A)';
            element.classList.add('unavailable');
        } else {
            // Other errors - show warning icon
            const errorIcon = document.createElement('i');
            errorIcon.className = 'fas fa-exclamation-triangle error-icon';
            errorIcon.title = 'Could not retrieve count';
            element.appendChild(errorIcon);
            element.classList.add('error-icon');
        }
    }
    else if (count === '(N/A)') {
        element.textContent = '(N/A)';
        element.classList.add('unavailable');
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
        $.reloadPageCheck, $.confirmBeforeCleanCheck, $.timeRangeSelect
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
    document.body.addEventListener('scroll', handleBodyScroll, { capture: true, passive: true });

    // Rating section event listeners
    $.ratingClose?.addEventListener('click', handleRatingClose);
    $.ratingStars?.forEach(star => {
        star.addEventListener('click', handleRatingClick);
    });

    // Share functionality event listeners
    $.shareButton?.addEventListener('click', handleShareButtonClick);
    $.closeShareBtn?.addEventListener('click', closeShareDialog);
    $.copyShareUrlBtn?.addEventListener('click', handleCopyShareUrl);
    $.shareTwitterBtn?.addEventListener('click', () => shareOnSocialMedia('twitter'));
    $.shareFacebookBtn?.addEventListener('click', () => shareOnSocialMedia('facebook'));
    $.shareEmailBtn?.addEventListener('click', () => shareOnSocialMedia('email'));

    // Close share dialog when clicking outside
    window.addEventListener('click', (e) => {
        if ($.shareDialog && !$.shareDialog.classList.contains('hidden') && e.target === $.shareDialog) {
            closeShareDialog();
        }
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
        $.reloadPageCheck, $.confirmBeforeCleanCheck
    ];
    let changed = false;
    checkElements.forEach(el => {
        if (el) {
            const key = el.id;
            const newValue = el.checked;
            if (!el.disabled || ['reloadPage', 'confirmBeforeClean'].includes(key)) {
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
    const ratingStarTarget = e.target.closest('.rating-star');

    if (ratingStarTarget) {
        // Rating functionality is handled separately
        return;
    }

    if (infoIconTarget || e.target === $.infoTooltip) { e.stopPropagation(); return; }
    if (collapsibleHeader) { toggleCollapsibleSection(collapsibleHeader); return; }

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

// --- Share Functions ---

function handleShareButtonClick() {
    if ($.shareDialog) {
        $.shareDialog.classList.remove('hidden');

        // Focus on the share URL input for better usability
        setTimeout(() => {
            if ($.shareUrl) {
                $.shareUrl.focus();
                $.shareUrl.select();
            }
        }, 100);
    }
}

function closeShareDialog() {
    if ($.shareDialog) {
        $.shareDialog.classList.add('hidden');
        if ($.copyConfirmation) {
            $.copyConfirmation.classList.add('hidden');
        }
    }
}

function handleCopyShareUrl() {
    if (!$.shareUrl || !$.copyConfirmation) return;

    const url = $.shareUrl.value;

    navigator.clipboard.writeText(url).then(() => {
        // Show copy confirmation message
        $.copyConfirmation.classList.remove('hidden');

        // Hide the confirmation after some time
        clearTimeout(copyConfirmationTimeout);
        copyConfirmationTimeout = setTimeout(() => {
            $.copyConfirmation.classList.add('hidden');
        }, 2000);
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

function shareOnSocialMedia(platform) {
    let shareUrl = '';
    const extensionUrl = encodeURIComponent(SHARE_INFO.url);
    const shareText = encodeURIComponent(SHARE_INFO.text);
    const shareTitle = encodeURIComponent(SHARE_INFO.title);

    switch (platform) {
        case 'twitter':
            shareUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${extensionUrl}`;
            break;
        case 'facebook':
            shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${extensionUrl}`;
            break;
        case 'email':
            shareUrl = `mailto:?subject=${shareTitle}&body=${shareText}%20${extensionUrl}`;
            break;
        default:
            return;
    }

    // Open the share URL in a new tab
    chrome.tabs.create({ url: shareUrl });

    // Close the share dialog
    closeShareDialog();
}

// --- Rating Functions ---

function initRatingSection() {
    if (!$.ratingSection) return;

    chrome.storage.local.get([STORAGE_KEYS.RATING_SHOWN, STORAGE_KEYS.LAST_RATING_PROMPT], (data) => {
        // If rating has been shown and acknowledged or dismissed before, don't show it again
        if (data[STORAGE_KEYS.RATING_SHOWN] === true) {
            $.ratingSection.classList.add('hidden');
            return;
        }

        // Check if we should show the rating prompt based on usage
        if (usageStats.cleanCount >= 3) {
            // Only show every 30 days if user hasn't rated yet
            const lastPrompt = data[STORAGE_KEYS.LAST_RATING_PROMPT] || 0;
            const daysSinceLastPrompt = (Date.now() - lastPrompt) / (1000 * 60 * 60 * 24);

            if (daysSinceLastPrompt >= 30 || !lastPrompt) {
                $.ratingSection.classList.remove('hidden');
                // Update the last prompt timestamp
                chrome.storage.local.set({ [STORAGE_KEYS.LAST_RATING_PROMPT]: Date.now() });
            } else {
                $.ratingSection.classList.add('hidden');
            }
        } else {
            // Not enough usage yet
            $.ratingSection.classList.add('hidden');
        }
    });
}

function handleRatingClick(e) {
    e.preventDefault();
    const starValue = parseInt(e.currentTarget.dataset.value || "0", 10);

    // Mark that rating has been shown and interacted with
    chrome.storage.local.set({ [STORAGE_KEYS.RATING_SHOWN]: true });

    // Hide the rating section
    $.ratingSection.classList.add('hidden');

    // Redirect based on rating value
    let redirectUrl = '';
    if (starValue >= 4) {
        redirectUrl = 'https://chromewebstore.google.com/detail/fgggiddcalbfbchppcmfaldmnfmmneof/reviews';
    } else {
        redirectUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfMhxA90yHeCzM--GsPpnqlf_d9Rjm8N5jB0c52YyOst9MWdg/viewform';
    }

    chrome.tabs.create({ url: redirectUrl });
}

function handleRatingClose() {
    // Just mark that prompt was shown but user chose not to rate
    chrome.storage.local.set({
        [STORAGE_KEYS.LAST_RATING_PROMPT]: Date.now() // Remember when we showed it
    });

    $.ratingSection.classList.add('hidden');
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
    if (activeTabInfo && activeTabInfo.id && activeTabInfo.url?.startsWith('http') && !isRestrictedPage(activeTabInfo.url)) {
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
            <i class="fas fa-times status-icon"></i>
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
            <i class="fas fa-check status-icon"></i>
            <span class="status-text">Success</span>
        `;
        usageStats.cleanCount++;
        saveUsageStats();

        // Check for rating prompt
        checkAndShowRatingPrompt();

        // Set timer to return to normal state
        cleanBtnTimeout = setTimeout(() => {
            console.log("Resetting from SUCCESS state");
            updateCleanButtonState();
        }, 2000);
    }
}

function checkAndShowRatingPrompt() {
    // If user has cleaned 3 or more times and hasn't rated yet, show the rating prompt
    chrome.storage.local.get([STORAGE_KEYS.RATING_SHOWN], (data) => {
        if (usageStats.cleanCount >= 3 && !data[STORAGE_KEYS.RATING_SHOWN]) {
            // Check if rating section should be shown
            initRatingSection();
        }
    });
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
        <i class="fas fa-broom"></i>
        <span id="cleanBtnText" class="btn-text">${text}</span>
        <div class="clean-btn-indicators">
            <span id="reloadIndicator" class="setting-indicator ${!currentPreferences.reloadPage ? 'hidden' : ''}" title="Page will reload"><i class="fas fa-sync-alt"></i></span>
            <span id="confirmIndicator" class="setting-indicator ${!currentPreferences.confirmBeforeClean ? 'hidden' : ''}" title="Confirmation needed"><i class="fas fa-check-double"></i></span>
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
            const iconClass = state === 'success' ? 'fa-check' : 'fa-times';
            btn.innerHTML = `
                <i class="fas ${iconClass} status-icon"></i>
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
                    if (!isCleaningInProgress && activeTabInfo?.url?.startsWith('http') && !isRestrictedPage(activeTabInfo.url)) {
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

        // Update usage stats
        usageStats.cleanCount++;
        saveUsageStats();

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
        chrome.storage.local.remove(STORAGE_KEYS.CLEANING_FLAG)
            .catch(err => console.error("Failed to remove cleaning flag:", err));
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
        content.style.maxHeight = content.scrollHeight + "px";
        card.classList.remove('collapsed');
        headerElement.setAttribute('aria-expanded', 'true');
        content.addEventListener('transitionend', function onExpandEnd() {
            content.removeEventListener('transitionend', onExpandEnd);
            if (!card.classList.contains('collapsed')) content.style.maxHeight = 'none';

            // After expanding, reinitialize icons inside
            refreshTooltipHandlers();
        }, { once: true });
    } else {
        content.style.maxHeight = content.scrollHeight + "px";
        requestAnimationFrame(() => {
            content.style.maxHeight = '0';
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
    $.infoTooltip.style.opacity = '0';
    $.infoTooltip.classList.add('show');

    positionTooltip(element);

    // Make tooltip visible
    $.infoTooltip.style.opacity = '';
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
    $.infoTooltip.style.position = 'fixed';
    $.infoTooltip.style.top = `${top}px`;
    $.infoTooltip.style.left = `${left}px`;
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

// --- Usage Stats ---
function saveUsageStats() {
    chrome.storage.local.set({ [STORAGE_KEYS.USAGE_STATS]: usageStats }, () => {
        if (chrome.runtime.lastError) console.error("Error saving usage stats:", chrome.runtime.lastError);
    });
}

// --- Data Count Fetching Functions ---
async function getCookieCount(tab) {
    if (typeof chrome.cookies?.getAll !== 'function') throw new Error("Missing 'cookies' permission or API unavailable.");
    if (!tab || !tab.url) throw new Error("Invalid tab info for cookie count.");

    // Don't try to count cookies on restricted pages
    if (isRestrictedPage(tab.url)) {
        return '(N/A)';
    }

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

    try {
        // Check if we can access the tab first
        const tab = await chrome.tabs.get(tabId);

        // Don't try to get storage count on restricted pages
        if (tab.url && isRestrictedPage(tab.url)) {
            return '(N/A)';
        }

        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId }, injectImmediately: true,
            func: (sType) => {
                try {
                    return { count: window[sType]?.length ?? 0, success: true };
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
        else if (msg.includes("cannot be scripted")) {
            msg = `Page cannot be scripted (${storageType}).`;
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