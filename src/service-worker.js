// service-worker.js
const STORAGE_CLEANING_FLAG = 'isCleaning';
const DEBUG_LOGS = false; // toggle to enable verbose logs

function createCleaningTask(name, action) {
    return { name, action };
}

// --- Функции очистки (без изменений) ---
async function clearCookies(tab) { 
    if (!chrome.cookies) throw new Error("Worker: Missing 'cookies' permission."); 
    if (!tab || !tab.url) throw new Error("Worker: Invalid tab info for cookies."); 
    try { 
        let url; 
        try { 
            url = new URL(tab.url); 
        } catch (e) { 
            throw new Error("Worker: Invalid URL."); 
        } 
        if (!url.protocol.startsWith('http')) return `Cookies: Skipped (non-HTTP(S) page).`; 
        const domain = url.hostname; 
        if (!domain) throw new Error("Worker: Invalid domain."); 
        const cookies = await chrome.cookies.getAll({ domain: domain }); 
        if (cookies.length === 0) return `Cookies: No data found for ${domain}.`; 
        let removedCount = 0; 
        const promises = cookies.map(c => { 
            const cookieUrl = `${c.secure ? 'https' : 'http'}://${c.domain.replace(/^\./, '')}${c.path}`; 
            return chrome.cookies.remove({ url: cookieUrl, name: c.name }).then(d => { 
                if(d) removedCount++; 
            }).catch(e => console.warn(`Worker: Failed removing cookie ${c.name}`, e)); 
        }); 
        await Promise.allSettled(promises); 
        return `Cookies: Cleared ${removedCount}/${cookies.length} for ${domain}.`; 
    } catch (error) { 
        console.error("Worker: Error in clearCookies", error); 
        throw new Error(`Cookies: ${error.message}`); 
    } 
}

async function clearStorage(tabId, storageType) { 
    if (!chrome.scripting) throw new Error("Worker: Missing 'scripting' permission."); 
    if (!tabId) throw new Error("Worker: Invalid tabId for storage."); 
    const typeName = storageType === 'localStorage' ? 'Local Storage' : 'Session Storage';
    
    if (DEBUG_LOGS) console.log(`Worker: Attempting to clear ${typeName} for tab ${tabId}`);
    
    // Check if we can access the tab first
    try {
        const tab = await chrome.tabs.get(tabId);
        if (DEBUG_LOGS) console.log(`Worker: Tab URL: ${tab.url}`);
        
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('file://')) {
            if (DEBUG_LOGS) console.log(`Worker: Cannot access ${typeName} on restricted page type`);
            return `${typeName}: Cannot access storage on this type of page.`;
        }
    } catch (e) {
        if (DEBUG_LOGS) console.log(`Worker: Error accessing tab: ${e.message}`);
        return `${typeName}: Cannot access tab information.`;
    } 
    try { 
                if (DEBUG_LOGS) console.log(`Worker: Executing script for ${typeName}`);
        
        const results = await chrome.scripting.executeScript({ 
            target: { tabId: tabId }, 
            func: (sType) => { 
                try { 
                    console.log(`Content Script: Attempting to clear ${sType}`);
                    const st = window[sType]; 
                    
                    if (!st) {
                        console.log(`Content Script: ${sType} not available on this page`);
                        return { count: 0, success: true, message: `${sType} not available on this page` };
                    }
                    
                    // Get the count before clearing
                    let count = 0;
                    try {
                        count = st.length;
                        console.log(`Content Script: ${sType} length: ${count}`);
                    } catch (e) {
                        // Some storage objects might not have a length property
                        count = Object.keys(st).length;
                        console.log(`Content Script: ${sType} keys count: ${count}`);
                    }
                    
                    if (count > 0) {
                        st.clear();
                        console.log(`Content Script: Cleared ${sType}`);
                    }
                    
                    return { count: count, success: true }; 
                } catch (e) { 
                    console.error(`Content Script: Error clearing ${sType}:`, e);
                    return { error: e.message, success: false }; 
                } 
            }, 
            args: [storageType] 
        });
        
        if (DEBUG_LOGS) console.log(`Worker: Script execution results:`, results);
        
        if (!results || results.length === 0) throw new Error(`Cannot access tab data (${typeName}). Page may be restricted or closed.`); 
        const res = results[0]; 
        
        if (DEBUG_LOGS) console.log(`Worker: First result:`, res);
        
        if (res.error) throw new Error(`${typeName}: ${res.error.message || 'Script execution error'}`); 
        if (res.result?.success) { 
            if (DEBUG_LOGS) console.log(`Worker: Success result:`, res.result);
            if (res.result.message) {
                return `${typeName}: ${res.result.message}`;
            }
            return `${typeName}: ${res.result.count > 0 ? `Cleared ${res.result.count} item(s).` : 'No data found.'}`; 
        } else { 
            if (DEBUG_LOGS) console.log(`Worker: Unexpected result:`, res.result);
            throw new Error(`${typeName}: Unexpected script result.`); 
        } 
    } catch (error) { 
        console.error(`Worker: Error clearing ${storageType} for tab ${tabId}:`, error); 
        let message = error.message; 
        if (message.includes("No tab with id")) message = `Cannot access tab data (${typeName}). Tab may be closed.`; 
        else if (message.includes("Cannot access contents")) message = `Cannot access tab data (${typeName}). Page may be restricted.`; 
        throw new Error(`${typeName}: ${message}`); 
    } 
}

async function clearBrowsingDataCache(sinceTime) { 
    if (!chrome.browsingData) throw new Error("Worker: Missing 'browsingData' permission."); 
    return new Promise((resolve, reject) => { 
        chrome.browsingData.remove({ since: sinceTime }, { "cache": true }, () => { 
            if (chrome.runtime.lastError) { 
                const msg = chrome.runtime.lastError.message; 
                if (msg?.includes("No browsing data")) resolve("Browser Cache: No data found."); 
                else reject(new Error(`Browser Cache: ${msg || 'Failed'}`)); 
            } else resolve("Browser Cache: Cleared successfully."); 
        }); 
    }); 
}

async function clearBrowsingDataIndexedDB(sinceTime) { 
    if (!chrome.browsingData) throw new Error("Worker: Missing 'browsingData' permission."); 
    return new Promise((resolve, reject) => { 
        chrome.browsingData.remove({ since: sinceTime }, { "indexedDB": true }, () => { 
            if (chrome.runtime.lastError) { 
                const msg = chrome.runtime.lastError.message; 
                if (msg?.includes("No browsing data")) resolve("IndexedDB: No data found."); 
                else reject(new Error(`IndexedDB: ${msg || 'Failed'}`)); 
            } else resolve("IndexedDB: Cleared successfully."); 
        }); 
    }); 
}

async function clearHistory(sinceTime) { 
    if (!chrome.history) throw new Error("Worker: Missing 'history' permission."); 
    return new Promise((resolve, reject) => { 
        chrome.history.deleteRange({ startTime: sinceTime, endTime: Date.now() }, () => { 
            if (chrome.runtime.lastError) reject(new Error(`History: ${chrome.runtime.lastError.message || 'Failed'}`)); 
            else resolve("History: Cleared successfully for range."); 
        }); 
    }); 
}

// --- Main Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "cleanData") {
        if (DEBUG_LOGS) console.log("Worker: Received cleanData message");
        const options = message.options;
        const tabInfo = message.tabInfo;
        const sinceTime = message.sinceTime;

        // Set flag immediately
        chrome.storage.local.set({ [STORAGE_CLEANING_FLAG]: true }, async () => {
            if (chrome.runtime.lastError) {
                console.error("Worker: Failed to set cleaning flag", chrome.runtime.lastError);
                // Send error message back
                chrome.runtime.sendMessage({ 
                    action: "cleaningComplete", 
                    success: false, 
                    summary: [], 
                    errors: ["Failed to initiate cleaning: Cannot set state flag."] 
                }).catch(e => {});
                return;
            }
            if (DEBUG_LOGS) console.log("Worker: isCleaning flag set to true.");

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
                    // Send completion message even if no tasks
                    chrome.runtime.sendMessage({ 
                        action: "cleaningComplete", 
                        success: true, 
                        summary: ["No cleaning options selected."], 
                        errors: [] 
                    }).catch(e => {});
                    // Clear flag
                    chrome.storage.local.remove(STORAGE_CLEANING_FLAG);
                    return; // Exit early
                }

                if (DEBUG_LOGS) console.log(`Worker: Executing ${tasks.length} tasks...`);
                const results = await Promise.allSettled(tasks.map(task => task.action()));
                if (DEBUG_LOGS) console.log("Worker: Cleaning results:", results);

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
            } finally {
                // --- ALWAYS DO THIS ---
                if (DEBUG_LOGS) console.log("Worker: Cleaning process finished. Clearing flag and sending completion message.");

                // 1. Clear the flag in storage
                chrome.storage.local.remove(STORAGE_CLEANING_FLAG, () => {
                    if (chrome.runtime.lastError) {
                        console.error("Worker: Failed to clear cleaning flag", chrome.runtime.lastError);
                    } else {
                        if (DEBUG_LOGS) console.log("Worker: isCleaning flag removed.");
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

if (DEBUG_LOGS) console.log("Cache Cleaner Service Worker Started.");

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        // Create context menu items
        setupContextMenus();
        // Optional: open local privacy page instead of remote
        chrome.tabs.create({ url: chrome.runtime.getURL('wp.html') });
    } else if (details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
        setupContextMenus();
    } else if (
        details.reason === chrome.runtime.OnInstalledReason.CHROME_UPDATE
    ) {
        // When browser is updated
    } else if (
        details.reason === chrome.runtime.OnInstalledReason.SHARED_MODULE_UPDATE
    ) {
        // When a shared module is updated
    }
});

// Context Menus
function setupContextMenus() {
    try {
        chrome.contextMenus.removeAll(() => {
            chrome.contextMenus.create({
                id: 'quick-clean',
                title: 'Quick Clean this site',
                contexts: ['page', 'action']
            });
            chrome.contextMenus.create({
                id: 'deep-clean',
                title: 'Deep Clean (cache + storage)',
                contexts: ['page', 'action']
            });
        });
    } catch (e) {
        console.warn('Context menus setup failed:', e?.message || e);
    }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) return;
    const isDeep = info.menuItemId === 'deep-clean';
    const sinceTime = Date.now() - 3600000; // default last hour
    const options = {
        cookies: true,
        localStorage: true,
        sessionStorage: true,
        cache: isDeep,
        indexedDB: isDeep,
        clearHistory: false,
        reloadPage: false
    };
    try {
        await chrome.runtime.sendMessage({
            action: 'cleanData',
            options,
            tabInfo: { id: tab.id, url: tab.url },
            sinceTime
        });
    } catch (e) {
        console.error('Failed to trigger cleaning from context menu:', e);
    }
});

// Commands (keyboard shortcuts)
chrome.commands?.onCommand.addListener(async (command) => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;
        const isDeep = command === 'deep-clean';
        const sinceTime = Date.now() - 3600000;
        const options = {
            cookies: true,
            localStorage: true,
            sessionStorage: true,
            cache: isDeep,
            indexedDB: isDeep,
            clearHistory: false,
            reloadPage: false
        };
        await chrome.runtime.sendMessage({ 
            action: 'cleanData', 
            options, 
            tabInfo: { id: tab.id, url: tab.url }, 
            sinceTime 
        });
    } catch (e) {
        console.error('Command handling failed:', e);
    }
});