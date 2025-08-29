/// popup.js - Rewritten (v3)

// --- Constants ---
const STORAGE_KEYS = { PREFERENCES: 'preferences', USAGE_STATS: 'usageStats', THEME: 'theme', CLEANING_FLAG: 'isCleaning', RATING_SHOWN: 'ratingShown', LAST_RATING_PROMPT: 'lastRatingPrompt'};
const DEFAULT_PREFERENCES = { cookies: true, localStorage: true, sessionStorage: true, cache: false, indexedDB: false, clearHistory: false, reloadPage: true, confirmBeforeClean: false, timeRange: '3600000' };
const DEFAULT_USAGE_STATS = { cleanCount: 0 };
const SELECTORS = {
    shareBtn: '#shareBtn',
    shareModal: '#shareModal',
    closeShareModal: '#closeShareModal',
    shareLinkInput: '#shareLinkInput',
    copyLinkBtn: '#copyLinkBtn',
    shareTwitter: '#shareTwitter',
    shareFacebook: '#shareFacebook',
    shareEmail: '#shareEmail',
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

// --- Permission Validation ---
async function checkAndValidatePermissions() {
    console.log("Popup: Checking API permissions and availability");
    
    const permissionIssues = [];
    const disabledFeatures = [];

    try {
        // Check cookies API
        if (typeof chrome.cookies?.getAll !== 'function') {
            console.warn("Popup: Cookies API unavailable");
            disabledFeatures.push('cookies');
            permissionIssues.push("Cookies management unavailable - missing permission");
        }

        // Check scripting API
        if (typeof chrome.scripting?.executeScript !== 'function') {
            console.warn("Popup: Scripting API unavailable");
            disabledFeatures.push('localStorage', 'sessionStorage');
            permissionIssues.push("Storage management unavailable - missing scripting permission");
        }

        // Check browsingData API
        if (typeof chrome.browsingData?.remove !== 'function') {
            console.warn("Popup: BrowsingData API unavailable");
            disabledFeatures.push('cache', 'indexedDB');
            permissionIssues.push("Browser cache/IndexedDB clearing unavailable - missing browsingData permission");
        }

        // Check history API
        if (typeof chrome.history?.deleteRange !== 'function') {
            console.warn("Popup: History API unavailable");
            disabledFeatures.push('clearHistory');
            permissionIssues.push("History clearing unavailable - missing history permission");
        }

        // Check tabs API
        if (typeof chrome.tabs?.query !== 'function') {
            console.warn("Popup: Tabs API unavailable");
            permissionIssues.push("Tab information unavailable - missing tabs permission");
        }

        // Check storage API
        if (typeof chrome.storage?.local?.get !== 'function') {
            console.error("Popup: Storage API unavailable - this is critical!");
            throw new Error("Extension storage unavailable - missing storage permission");
        }

        // Disable features that aren't available
        if (disabledFeatures.length > 0) {
            console.log(`Popup: Disabling features due to missing permissions: ${disabledFeatures.join(', ')}`);
            disableFeatures(disabledFeatures);
        }

        // Store permission status for reference
        chrome.storage.local.set({
            'permissionIssues': permissionIssues,
            'disabledFeatures': disabledFeatures,
            'lastPermissionCheck': Date.now()
        }).catch(err => console.error("Failed to save permission status:", err));

        if (permissionIssues.length > 0) {
            console.warn("Popup: Some features disabled due to permission issues:", permissionIssues);
            // Could show a warning to user if needed
        }

    } catch (error) {
        console.error("Popup: Critical error during permission check:", error);
        throw error; // Re-throw critical errors
    }
}

function disableFeatures(disabledFeatures) {
    disabledFeatures.forEach(feature => {
        const checkbox = $[`${feature}Check`];
        if (checkbox) {
            checkbox.disabled = true;
            checkbox.checked = false;
            
            const row = checkbox.closest('.option-row');
            if (row) {
                row.classList.add('disabled', 'permission-disabled');
                row.title = `${feature} clearing is not available - missing browser permission`;
                
                // Add visual indicator
                const label = row.querySelector('label');
                if (label && !label.querySelector('.permission-warning')) {
                    const warningIcon = document.createElement('i');
                    warningIcon.className = 'fas fa-exclamation-triangle permission-warning';
                    warningIcon.title = 'Feature disabled - missing permission';
                    warningIcon.style.color = '#ff6b6b';
                    warningIcon.style.marginLeft = '5px';
                    label.appendChild(warningIcon);
                }
            }
        }
    });
}
// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log("Popup: Starting initialization");
        cacheDOMElements();
        const loadedTheme = await loadAppState();
        
        // Check permissions and disable unavailable features
        await checkAndValidatePermissions();
        
        setupInitialUI(loadedTheme);
        await checkActiveTabAndUpdateUI();
        addEventListeners();
        addRuntimeMessageListener();
        addStorageListener();
        updateCleanButtonState();
        setupRatingStars();
        
        console.log("Popup: Initialization completed successfully");
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
        chrome.storage.local.get([STORAGE_KEYS.THEME, STORAGE_KEYS.PREFERENCES, STORAGE_KEYS.USAGE_STATS, STORAGE_KEYS.CLEANING_FLAG], (data) => {
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

        if (!tab.url || !tab.url.startsWith('http')) {
            const message = tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://') || tab.url?.startsWith('about:')
                ? "Cleaning options for this tab are disabled on browser internal pages."
                : tab.url?.startsWith('file://')
                    ? "Cleaning options for this tab are disabled on local files."
                    : "Cleaning options for this tab are disabled on this page type.";
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
            const errorIcon = document.createElement('i');
            errorIcon.className = 'fas fa-exclamation-triangle error-icon';
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
    $.shareBtn?.addEventListener('click', openShareModal);
    $.closeShareModal?.addEventListener('click', closeShareModal);
    $.copyLinkBtn?.addEventListener('click', copyShareLink);
    $.shareTwitter?.addEventListener('click', () => shareToTwitter());
    $.shareFacebook?.addEventListener('click', () => shareToFacebook());
    $.shareEmail?.addEventListener('click', () => shareToEmail());
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
    
    // Close share modal on overlay click
    $.shareModal?.addEventListener('click', (e) => {
        if (e.target === $.shareModal || e.target.classList.contains('share-modal-overlay')) {
            closeShareModal();
        }
    });
    
    // Close share modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && $.shareModal && !$.shareModal.classList.contains('hidden')) {
            closeShareModal();
        }
    });
}

// --- Event Handlers ---

// --- Notification Testing Function ---
async function testNotifications() {
    console.log("Popup: Testing notifications...");
    
    try {
        // Send test message to service worker
        await chrome.runtime.sendMessage({
            action: "testNotification"
        });
        console.log("Popup: Test notification message sent");
    } catch (error) {
        console.error("Popup: Failed to send test notification message:", error);
    }
}

// Make it available globally for easy testing
window.testNotifications = testNotifications;

// --- Share Modal Functions ---

function openShareModal() {
    if ($.shareModal) {
        $.shareModal.classList.remove('hidden');
        $.shareModal.setAttribute('aria-hidden', 'false');
        
        // Focus on modal for accessibility
        setTimeout(() => {
            $.closeShareModal?.focus();
        }, 100);
    }
}

function closeShareModal() {
    if ($.shareModal) {
        $.shareModal.classList.add('hidden');
        $.shareModal.setAttribute('aria-hidden', 'true');
        
        // Return focus to share button
        $.shareBtn?.focus();
    }
}

function copyShareLink() {
    const shareLink = $.shareLinkInput?.value || 'https://chromewebstore.google.com/detail/fgggiddcalbfbchppcmfaldmnfmmneof';
    
    navigator.clipboard.writeText(shareLink).then(() => {
        console.log('Share link copied to clipboard');
        
        // Show visual feedback
        if ($.copyLinkBtn) {
            $.copyLinkBtn.classList.add('copied');
            setTimeout(() => {
                $.copyLinkBtn.classList.remove('copied');
            }, 2000);
        }
    }).catch(err => {
        console.error('Failed to copy share link:', err);
        // Fallback: select text
        if ($.shareLinkInput) {
            $.shareLinkInput.select();
            $.shareLinkInput.setSelectionRange(0, 99999); // For mobile devices
        }
    });
}

function shareToTwitter() {
    const shareLink = 'https://chromewebstore.google.com/detail/fgggiddcalbfbchppcmfaldmnfmmneof';
    const text = 'Keep your browser fast and clean with Cache Cleaner extension!';
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareLink)}`;
    
    window.open(twitterUrl, '_blank', 'width=550,height=420');
    closeShareModal();
}

function shareToFacebook() {
    const shareLink = 'https://chromewebstore.google.com/detail/fgggiddcalbfbchppcmfaldmnfmmneof';
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}`;
    
    window.open(facebookUrl, '_blank', 'width=580,height=470');
    closeShareModal();
}

function shareToEmail() {
    const shareLink = 'https://chromewebstore.google.com/detail/fgggiddcalbfbchppcmfaldmnfmmneof';
    const subject = 'Cache Cleaner - Clean & Fast Browsing Extension';
    const body = `Hi!

I wanted to share this awesome browser extension with you: Cache Cleaner

It helps keep your browser fast and clean by clearing cache, cookies, and other temporary data with just one click. Really useful for better browsing performance!

Check it out: ${shareLink}

Best regards!`;

    const emailUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    window.open(emailUrl);
    closeShareModal();
}

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

                // Open the link to Chrome Web Store reviews
                const rating = parseInt(input.value, 10);
                if (rating >= 4) {
                    window.open('https://chromewebstore.google.com/detail/cache-cleaner/fgggiddcalbfbchppcmfaldmnfmmneof/reviews', '_blank');
                } else {
                    window.open('https://docs.google.com/forms/d/e/1FAIpQLSfMhxA90yHeCzM--GsPpnqlf_d9Rjm8N5jB0c52YyOst9MWdg/viewform?usp=dialog', '_blank');
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
        // Проверяем необходимость показа рейтинга
        checkAndShowRateRequest();

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
    if (!$.cleanBtn || ($.cleanBtn.disabled && !isAwaitingConfirmation) || isCleaningInProgress) {
        console.log("Popup: Clean button click ignored - invalid state");
        return;
    }
    
    if (!isAnyCleaningOptionSelected() && !isAwaitingConfirmation) {
        console.log("Popup: Clean button click ignored - no options selected");
        return;
    }

    try {
        console.log("Popup: Clean button clicked, starting cleaning process");

        // Check if cleaning is already in progress via storage
        const storageData = await new Promise((resolve, reject) => {
            chrome.storage.local.get(STORAGE_KEYS.CLEANING_FLAG, (data) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(`Storage access error: ${chrome.runtime.lastError.message}`));
                } else {
                    resolve(data);
                }
            });
        });

        if (storageData?.[STORAGE_KEYS.CLEANING_FLAG] === true) {
            console.warn("Popup: Cleaning already in progress according to storage flag");
            isCleaningInProgress = true;
            setButtonVisualState('loading', 'Cleaning...');
            return;
        }

        // Handle confirmation state
        if (currentPreferences.confirmBeforeClean && !isAwaitingConfirmation) {
            console.log("Popup: Requesting confirmation before cleaning");
            isAwaitingConfirmation = true;
            setButtonVisualState('confirm', 'Confirm?');
            
            // Set up outside click handler with a small delay to prevent immediate triggering
            setTimeout(() => {
                document.addEventListener('click', handleOutsideConfirmClick, { once: true, capture: true });
            }, 100);
            return;
        }

        // Clean up confirmation state if active
        if (isAwaitingConfirmation) {
            document.removeEventListener('click', handleOutsideConfirmClick, { capture: true });
        }

        // Set cleaning states
        isAwaitingConfirmation = false;
        isCleaningInProgress = true;

        // Update UI to show loading state
        setButtonVisualState('loading', 'Cleaning...');
        hideResultCards();

        // Validate active tab info
        if (!activeTabInfo) {
            throw new Error("No active tab information available");
        }

        // Prepare cleaning options
        const optionsToSend = {
            cookies: !!($.cookiesCheck?.checked && !$.cookiesCheck?.disabled),
            localStorage: !!($.localStorageCheck?.checked && !$.localStorageCheck?.disabled),
            sessionStorage: !!($.sessionStorageCheck?.checked && !$.sessionStorageCheck?.disabled),
            cache: !!($.cacheCheck?.checked),
            indexedDB: !!($.indexedDBCheck?.checked),
            clearHistory: !!($.clearHistoryCheck?.checked),
            reloadPage: !!currentPreferences.reloadPage,
        };

        // Validate that at least one option is selected
        const hasSelectedOptions = Object.values(optionsToSend).some(option => option === true);
        if (!hasSelectedOptions) {
            throw new Error("No cleaning options are currently selected");
        }

        const sinceTime = getSinceTime(currentPreferences.timeRange);
        console.log(`Popup: Sending clean message with ${Object.keys(optionsToSend).filter(k => optionsToSend[k]).length} enabled options`);

        // Set flag to ignore next storage change event
        ignoreNextStorageChange = true;

        // Send cleaning message to service worker with timeout
        const cleaningMessage = {
            action: "cleanData",
            options: optionsToSend,
            tabInfo: activeTabInfo,
            sinceTime: sinceTime
        };

        const messagePromise = chrome.runtime.sendMessage(cleaningMessage);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Cleaning request timed out")), 10000);
        });

        const response = await Promise.race([messagePromise, timeoutPromise]);
        
        // Handle immediate error response from service worker
        if (response && response.success === false) {
            throw new Error(response.error || "Service worker reported failure");
        }

        console.log("Popup: Cleaning message sent successfully");

    } catch (error) {
        console.error("Popup: Error during cleaning process:", error);

        // Reset states immediately
        isCleaningInProgress = false;
        isAwaitingConfirmation = false;
        
        // Clear any pending ignore flag
        ignoreNextStorageChange = false;

        // Update UI with error state
        setButtonVisualState('error', 'Error');

        // Determine appropriate error message
        let errorMessage = 'An unexpected error occurred during cleaning.';
        let isConnectionError = false;

        if (error.message.includes('Could not establish connection') || 
            error.message.includes('Extension context invalidated') ||
            error.message.includes('message port closed')) {
            errorMessage = 'Cannot connect to background service. Try reloading the extension.';
            isConnectionError = true;
        } else if (error.message.includes('timed out')) {
            // Don't show timeout as error - operation continues in background
            console.log('Popup: Cleaning request timed out, but operation may continue in background');
            
            // Just reset UI state without showing error
            isCleaningInProgress = false;
            isAwaitingConfirmation = false;
            ignoreNextStorageChange = false;
            updateCleanButtonState();
            return; // Exit without showing error message
        } else if (error.message.includes('Storage access error')) {
            errorMessage = 'Cannot access extension storage. Please try again.';
        } else if (error.message.includes('No active tab')) {
            errorMessage = 'Cannot access current tab information.';
        } else if (error.message.includes('No cleaning options')) {
            errorMessage = 'Please select at least one cleaning option.';
        } else if (error.message.startsWith('Service worker reported')) {
            errorMessage = `Service error: ${error.message.replace('Service worker reported failure', 'Operation failed')}`;
        } else if (error.message && error.message !== 'An unexpected error occurred during cleaning.') {
            errorMessage = `Error: ${error.message}`;
        }

        // Show error to user
        displayResults(false, [], [errorMessage]);

        // For connection errors, suggest more specific actions
        if (isConnectionError) {
            displayResults(false, [], [
                errorMessage,
                "Try: 1) Refresh this page, 2) Reload the extension, 3) Restart your browser"
            ]);
        }

        // Clean up storage flag if needed
        try {
            await chrome.storage.local.remove(STORAGE_KEYS.CLEANING_FLAG);
            console.log("Popup: Cleaned up storage flag after error");
        } catch (storageError) {
            console.error("Popup: Failed to clean up storage flag:", storageError);
        }

        // Reset button state after delay
        resetAfterDelay(3000);
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

    // Make tooltip visible with smooth animation
    requestAnimationFrame(() => {
        $.infoTooltip.style.opacity = '';
    });
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
    if (isCleaningInProgress) { setButtonVisualState('loading', 'Cleaning...'); }
    else if (isAwaitingConfirmation) { setButtonVisualState('confirm', 'Confirm?'); }
    else if (!isAnyCleaningOptionSelected()) { setButtonVisualState('disabled', 'Select options'); }
    else { setButtonVisualState('default', 'Clean'); }
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
                    window.open('https://chromewebstore.google.com/detail/cache-cleaner/fgggiddcalbfbchppcmfaldmnfmmneof/reviews', '_blank');
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

    // Hide rating section after a small delay
    setTimeout(() => {
        if ($.ratingSection) {
            $.ratingSection.classList.add('hidden');
        }
    }, 500);
}

// --- Usage Stats & Rate Request ---
function saveUsageStats() {
    chrome.storage.local.set({ [STORAGE_KEYS.USAGE_STATS]: usageStats }, () => {
        if (chrome.runtime.lastError) console.error("Error saving usage stats:", chrome.runtime.lastError);
    });
}

// Check if we should show the rating request
function checkAndShowRateRequest() {
    // Show rating after 3+ cleans if it hasn't been shown before
    chrome.storage.local.get([STORAGE_KEYS.RATING_SHOWN], (data) => {
        const hasShownRating = data?.[STORAGE_KEYS.RATING_SHOWN] === true;

        if (usageStats.cleanCount >= 3 && !hasShownRating) {
            const ratingSection = document.getElementById('ratingSection');
            if (ratingSection && ratingSection.classList.contains('hidden')) {
                ratingSection.classList.remove('hidden');
            }
        }
    });
}

// --- Data Count Fetching Functions (Улучшенные) ---

async function getCookieCount(tab) {
    if (typeof chrome.cookies?.getAll !== 'function') {
        throw new Error("Missing 'cookies' permission or API unavailable.");
    }
    
    if (!tab || !tab.url) {
        throw new Error("Invalid tab info for cookie count.");
    }

    try {
        let url;
        try {
            url = new URL(tab.url);
        } catch (e) {
            throw new Error(`Invalid tab URL: ${tab.url}`);
        }

        // Skip non-HTTP URLs
        if (!url.protocol.startsWith('http')) {
            throw new Error("Cannot get cookies for non-HTTP(S) pages.");
        }

        const domain = url.hostname;
        if (!domain) {
            throw new Error("Invalid domain for cookie count.");
        }

        console.log(`Popup: Getting cookies count for domain: ${domain}`);

        // Create timeout promise to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Cookie count timeout")), 5000);
        });

        // Get cookies for both main domain and subdomains
        const cookiePromise = Promise.all([
            chrome.cookies.getAll({ domain: domain }),
            chrome.cookies.getAll({ domain: `.${domain}` })
        ]).then(([mainDomainCookies, subDomainCookies]) => {
            // Combine and remove duplicates
            const allCookies = [...mainDomainCookies];
            subDomainCookies.forEach(cookie => {
                if (!allCookies.some(existing => 
                    existing.name === cookie.name && existing.domain === cookie.domain)) {
                    allCookies.push(cookie);
                }
            });
            return allCookies.length;
        });

        return await Promise.race([cookiePromise, timeoutPromise]);

    } catch (error) {
        console.error(`Error getting cookie count for ${tab.url}:`, error);
        
        if (error.message.includes("timeout")) {
            throw new Error("Cookie count request timed out");
        }
        
        throw new Error(`Cookie count error: ${error.message}`);
    }
}

async function getStorageCount(tabId, storageType) {
    if (typeof chrome.scripting?.executeScript !== 'function') {
        throw new Error("Missing 'scripting' permission or API unavailable.");
    }
    
    if (!tabId) {
        throw new Error("Invalid tabId for storage count.");
    }

    try {
        console.log(`Popup: Getting ${storageType} count for tab ${tabId}`);

        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`${storageType} count timeout`)), 3000);
        });

        const scriptPromise = chrome.scripting.executeScript({
            target: { tabId: tabId },
            injectImmediately: true,
            func: (sType) => {
                try {
                    // Check if storage is available
                    if (typeof window[sType] === 'undefined') {
                        return { count: 0, success: true, message: `${sType} not available` };
                    }
                    
                    // Check if we can access it
                    const storage = window[sType];
                    if (!storage) {
                        return { count: 0, success: true, message: `${sType} is null` };
                    }
                    
                    // Try to get length
                    const count = storage.length ?? 0;
                    return { count: count, success: true };
                } catch (e) {
                    // Common errors and their handling
                    let errorType = 'unknown';
                    if (e.name === 'SecurityError') {
                        errorType = 'security';
                    } else if (e.message.includes('undefined')) {
                        errorType = 'unavailable';
                    } else if (e.message.includes('access')) {
                        errorType = 'access';
                    }
                    
                    return { 
                        error: e.message, 
                        errorType: errorType,
                        success: false 
                    };
                }
            },
            args: [storageType]
        });

        const results = await Promise.race([scriptPromise, timeoutPromise]);

        if (!results || results.length === 0 || !results[0]) {
            throw new Error(`Cannot inject script into tab ${tabId} for ${storageType}.`);
        }

        const frameResult = results[0];

        // Handle script execution errors
        if (frameResult.error) {
            const errorMsg = frameResult.error.message || frameResult.error;
            console.warn(`Script execution error for ${storageType}:`, errorMsg);
            
            if (errorMsg.includes("chrome-extension://") || errorMsg.includes("moz-extension://")) {
                throw new Error("Cannot access storage on extension pages");
            } else if (errorMsg.includes("Content Security Policy")) {
                throw new Error("Blocked by Content Security Policy");
            } else {
                throw new Error(`Script execution failed: ${errorMsg}`);
            }
        }

        const result = frameResult.result;
        if (!result) {
            throw new Error(`No result from storage script for ${storageType}`);
        }

        if (!result.success) {
            const errorType = result.errorType || 'unknown';
            switch (errorType) {
                case 'security':
                    throw new Error(`Security error accessing ${storageType}`);
                case 'unavailable':
                    throw new Error(`${storageType} is not available on this page`);
                case 'access':
                    throw new Error(`Cannot access ${storageType} on this page`);
                default:
                    throw new Error(`Cannot access ${storageType}: ${result.error || 'Unknown error'}`);
            }
        }

        if (result.message) {
            console.log(`Popup: ${storageType} count - ${result.message}`);
        }

        return result.count || 0;

    } catch (error) {
        let msg = error.message || "Unknown storage count error";

        console.error(`Error getting ${storageType} count for tab ${tabId}:`, error);

        // Categorize errors for better user experience
        if (msg.includes("No tab with id")) {
            msg = `Tab ${tabId} not found or closed.`;
        } else if (msg.includes("timeout")) {
            msg = `${storageType} count request timed out.`;
        } else if (msg.includes("showing error page")) {
            msg = `Cannot access ${storageType} on error pages.`;
        } else if (msg.includes("Cannot inject") || msg.includes("chrome://") || msg.includes("file://")) {
            msg = `Cannot access ${storageType} on protected pages.`;
        } else if (msg.includes("Content Security Policy")) {
            msg = `Page security policy blocks ${storageType} access.`;
        } else if (msg.includes("extension pages")) {
            msg = `Cannot access ${storageType} on extension pages.`;
        } else if (!msg.startsWith(storageType) && !msg.includes("Failed to get")) {
            msg = `Failed to get ${storageType} count: ${msg}`;
        }

        throw new Error(msg);
    }
}