/// service-worker.js
const STORAGE_CLEANING_FLAG = 'isCleaning';

function createCleaningTask(name, action) {
    return { name, action };
}

// --- Cleanup Functions (unchanged) ---
async function clearCookies(tab) { if (!chrome.cookies) throw new Error("Worker: Missing 'cookies' permission."); if (!tab || !tab.url) throw new Error("Worker: Invalid tab info for cookies."); try { let url; try { url = new URL(tab.url); } catch (e) { throw new Error("Worker: Invalid URL."); } if (!url.protocol.startsWith('http')) return `Cookies: Skipped (non-HTTP(S) page).`; const domain = url.hostname; if (!domain) throw new Error("Worker: Invalid domain."); const cookies = await chrome.cookies.getAll({ domain: domain }); if (cookies.length === 0) return `Cookies: No data found for ${domain}.`; let removedCount = 0; const promises = cookies.map(c => { const cookieUrl = `${c.secure ? 'https' : 'http'}://${c.domain.replace(/^\./, '')}${c.path}`; return chrome.cookies.remove({ url: cookieUrl, name: c.name }).then(d => { if(d) removedCount++; }).catch(e => console.warn(`Worker: Failed removing cookie ${c.name}`, e)); }); await Promise.allSettled(promises); return `Cookies: Cleared ${removedCount}/${cookies.length} for ${domain}.`; } catch (error) { console.error("Worker: Error in clearCookies", error); throw new Error(`Cookies: ${error.message}`); } }
async function clearStorage(tabId, storageType) { if (!chrome.scripting) throw new Error("Worker: Missing 'scripting' permission."); if (!tabId) throw new Error("Worker: Invalid tabId for storage."); const typeName = storageType === 'localStorage' ? 'Local Storage' : 'Session Storage'; try { const results = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: (sType) => { try { const st = window[sType]; const c = st.length; if (c > 0) st.clear(); return { count: c, success: true }; } catch (e) { throw new Error(`Content Script Error (${sType}): ${e.message}`); } }, args: [storageType] }); if (!results || results.length === 0) throw new Error(`Cannot access tab data (${typeName}). Page may be restricted or closed.`); const res = results[0]; if (res.error) throw new Error(`${typeName}: ${res.error.message || 'Script execution error'}`); if (res.result?.success) { return `${typeName}: ${res.result.count > 0 ? `Cleared ${res.result.count} item(s).` : 'No data found.'}`; } else { throw new Error(`${typeName}: Unexpected script result.`); } } catch (error) { console.error(`Worker: Error clearing ${storageType} for tab ${tabId}:`, error); let message = error.message; if (message.includes("No tab with id")) message = `Cannot access tab data (${typeName}). Tab may be closed.`; else if (message.includes("Cannot access contents")) message = `Cannot access tab data (${typeName}). Page may be restricted.`; throw new Error(`${typeName}: ${message}`); } }
async function clearBrowsingDataCache(sinceTime) {
    if (!chrome.browsingData) throw new Error("Worker: Missing 'browsingData' permission.");
    return new Promise((resolve, reject) => {
        chrome.browsingData.remove({ since: sinceTime }, { "cache": true }, () => {
            if (chrome.runtime.lastError) {
                const msg = chrome.runtime.lastError.message;
                if (msg?.includes("No browsing data")) resolve("Browser Cache: No data found.");
                else reject(new Error(`Browser Cache: ${msg || 'Failed'}`));
            } else {
                resolve("Browser Cache: Cleared successfully.");
            }
        });
    });
}
async function clearBrowsingDataIndexedDB(sinceTime) { if (!chrome.browsingData) throw new Error("Worker: Missing 'browsingData' permission."); return new Promise((resolve, reject) => { chrome.browsingData.remove({ since: sinceTime }, { "indexedDB": true }, () => { if (chrome.runtime.lastError) { const msg = chrome.runtime.lastError.message; if (msg?.includes("No browsing data")) resolve("IndexedDB: No data found."); else reject(new Error(`IndexedDB: ${msg || 'Failed'}`)); } else resolve("IndexedDB: Cleared successfully."); }); }); }
async function clearHistory(sinceTime) { if (!chrome.history) throw new Error("Worker: Missing 'history' permission."); return new Promise((resolve, reject) => { chrome.history.deleteRange({ startTime: sinceTime, endTime: Date.now() }, () => { if (chrome.runtime.lastError) reject(new Error(`History: ${chrome.runtime.lastError.message || 'Failed'}`)); else resolve("History: Cleared successfully for range."); }); }); }

// --- Notification Helper ---
function showNotification(title, message, errorCount = 0) {
    const iconUrl = errorCount > 0 ? 'images/icon_error_128.png' : 'images/icon128.png';
    const notificationId = 'cache-cleaner-notification';
    try {
        chrome.notifications.create(notificationId, {
            type: 'basic',
            iconUrl: iconUrl,
            title: title,
            message: message,
            priority: errorCount > 0 ? 2 : 1
        });
    } catch (e) {
        console.error("Worker: Could not create notification:", e);
    }
}

// --- Main Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "cleanData") {
        console.log("Worker: Received cleanData message");
        const options = message.options;
        const tabInfo = message.tabInfo;
        const sinceTime = message.sinceTime;

        // Set flag immediately
        chrome.storage.local.set({ [STORAGE_CLEANING_FLAG]: true }, async () => {
            if (chrome.runtime.lastError) {
                console.error("Worker: Failed to set cleaning flag", chrome.runtime.lastError);
                // Should we still proceed? Maybe not.
                // Send error message back?
                chrome.runtime.sendMessage({ action: "cleaningComplete", success: false, summary: [], errors: ["Failed to initiate cleaning: Cannot set state flag."] }).catch(e => {});
                return;
            }
            console.log("Worker: isCleaning flag set to true.");

            let successDetails = [];
            let failureDetails = [];
            let errorCount = 0;
            let successCount = 0;
            const tasks = [];

            try { // Wrap the main cleaning logic
                // --- Build Task List ---
                if (options.cookies && tabInfo?.url) tasks.push(createCleaningTask('Cookies', () => clearCookies(tabInfo)));
                if (options.localStorage && tabInfo?.id) tasks.push(createCleaningTask('Local Storage', () => clearStorage(tabInfo.id, 'localStorage')));
                if (options.sessionStorage && tabInfo?.id) tasks.push(createCleaningTask('Session Storage', () => clearStorage(tabInfo.id, 'sessionStorage')));
                if (options.cache) tasks.push(createCleaningTask('Browser Cache', () => clearBrowsingDataCache(sinceTime)));
                if (options.indexedDB) tasks.push(createCleaningTask('IndexedDB', () => clearBrowsingDataIndexedDB(sinceTime)));
                if (options.clearHistory) tasks.push(createCleaningTask('History', () => clearHistory(sinceTime)));

                if (tasks.length === 0) {
                    showNotification("Cache Cleaner", "No cleaning options selected.");
                    // Send completion message even if no tasks
                    chrome.runtime.sendMessage({ action: "cleaningComplete", success: true, summary: ["No cleaning options selected."], errors: [] }).catch(e => {});
                    // Clear flag
                    chrome.storage.local.remove(STORAGE_CLEANING_FLAG); // Use remove
                    return; // Exit early
                }

                console.log(`Worker: Executing ${tasks.length} tasks...`);
                const results = await Promise.allSettled(tasks.map(task => task.action()));
                console.log("Worker: Cleaning results:", results);

                // --- Process Results ---
                results.forEach((result, index) => {
                    const taskName = tasks[index]?.name || 'Unknown Task';
                    if (result.status === 'fulfilled') {
                        successDetails.push(result.value);
                        if (!result.value?.toLowerCase().includes("no data found") && !result.value?.toLowerCase().includes("skipped")) {
                            successCount++;
                        }
                    } else {
                        errorCount++;
                        let simpleError = `${taskName}: Failed`;
                        if (result.reason instanceof Error && result.reason.message) {
                            const msg = result.reason.message;
                            simpleError = msg.startsWith(taskName + ':') ? msg : `${taskName}: ${msg}`;
                            if (msg.includes("permission")) simpleError = `${taskName}: Permission error.`;
                            else if (msg.includes("Cannot access") || msg.includes("restricted")) simpleError = `${taskName}: Access denied.`;
                            else if (msg.includes("No tab")) simpleError = `${taskName}: Tab closed?`;
                        }
                        failureDetails.push(simpleError);
                        console.error(`Worker: Task ${taskName} failed:`, result.reason);
                    }
                });

                // --- Prepare Notification ---
                let notificationTitle = "Cache Cleaner";
                let notificationMessage = "";
                if (errorCount > 0) {
                    notificationTitle = `Cache Cleaner: ${errorCount} Error(s)`;
                    notificationMessage = `Finished with ${errorCount} error(s) out of ${tasks.length} task(s). ${failureDetails.length > 0 ? failureDetails[0] : ''}`;
                } else if (successCount > 0) {
                    notificationMessage = `Successfully cleared data for ${successCount}/${tasks.length} task(s).`;
                } else {
                    notificationMessage = `Finished ${tasks.length} task(s). No data found to clear.`;
                }
                showNotification(notificationTitle, notificationMessage, errorCount);

                // --- Reload Page ---
                if (options.reloadPage && errorCount === 0 && successCount > 0 && tabInfo?.id) {
                    setTimeout(async () => {
                        try {
                            await chrome.tabs.get(tabInfo.id); // Verify tab exists
                            chrome.tabs.reload(tabInfo.id, { bypassCache: true });
                            console.log(`Worker: Reloading tab ${tabInfo.id}`);
                        } catch (reloadError) {
                            console.warn(`Worker: Tab ${tabInfo.id} likely closed, skipping reload:`, reloadError.message);
                        }
                    }, 500);
                }

            } catch (error) { // Catch unexpected errors during the overall process
                console.error("Worker: Unexpected error during cleaning process:", error);
                errorCount++;
                failureDetails.push(`Worker: Unexpected error - ${error.message}`);
                showNotification("Cache Cleaner: Error", "An unexpected error occurred during cleaning.", 1);
            } finally {
                // --- ALWAYS DO THIS ---
                console.log("Worker: Cleaning process finished. Clearing flag and sending completion message.");

                // 1. Clear the flag in storage
                chrome.storage.local.remove(STORAGE_CLEANING_FLAG, () => { // Use remove
                    if (chrome.runtime.lastError) {
                        console.error("Worker: Failed to clear cleaning flag", chrome.runtime.lastError);
                    } else {
                        console.log("Worker: isCleaning flag removed.");
                    }
                });

                // 2. Send completion message to popup (if open)
                let summaryMessages = successDetails.filter(msg => !msg.toLowerCase().includes("skipped") && !msg.toLowerCase().includes("no data found"));
                if (summaryMessages.length === 0 && successDetails.length > 0 && failureDetails.length === 0) {
                    summaryMessages = ["No data found for selected options."];
                } else if (summaryMessages.length === 0 && failureDetails.length === 0 && tasks.length > 0) {
                    summaryMessages = ["Finished tasks, no specific data cleared."];
                }

                chrome.runtime.sendMessage({
                    action: "cleaningComplete",
                    success: errorCount === 0,
                    summary: summaryMessages,
                    errors: failureDetails
                }).catch(e => {
                    // Expected if popup is closed
                });
            }
        });

        // Indicate async response
        return true;
    }
    // Handle other potential messages if needed
    return false;
});

console.log("Cache Cleaner Service Worker Started.");
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        // Code to be executed on first install
        chrome.tabs.create({
            url: "https://sergeycommit.github.io/cache_cleaner/",
        });
    }
});
const UNINSTALL_URL = "https://docs.google.com/forms/d/e/1FAIpQLSfGzVdWTAlzSibETmb8YaH8i9zQKLFCK_wPkIR5F2POeLjgvg/viewform";
chrome.runtime.setUninstallURL(UNINSTALL_URL);