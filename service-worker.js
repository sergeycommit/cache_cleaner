// service-worker.js
const STORAGE_CLEANING_FLAG = 'isCleaning';

function createCleaningTask(name, action) {
    return { name, action };
}

// --- Функции очистки (улучшенные с лучшей обработкой ошибок) ---

async function clearCookies(tab) {
    if (!chrome.cookies) {
        throw new Error("Worker: Missing 'cookies' permission.");
    }
    
    if (!tab || !tab.url) {
        throw new Error("Worker: Invalid tab info for cookies.");
    }

    try {
        let url;
        try {
            url = new URL(tab.url);
        } catch (e) {
            throw new Error("Worker: Invalid URL format.");
        }

        if (!url.protocol.startsWith('http')) {
            return `Cookies: Skipped (non-HTTP(S) page).`;
        }

        const domain = url.hostname;
        if (!domain) {
            throw new Error("Worker: Invalid domain.");
        }

        console.log(`Worker: Getting cookies for domain: ${domain}`);
        
        // Получаем cookies для основного домена и всех поддоменов
        const [mainDomainCookies, subDomainCookies] = await Promise.all([
            chrome.cookies.getAll({ domain: domain }),
            chrome.cookies.getAll({ domain: `.${domain}` })
        ]);

        // Объединяем и удаляем дубликаты
        const allCookies = [...mainDomainCookies];
        subDomainCookies.forEach(cookie => {
            if (!allCookies.some(existing => existing.name === cookie.name && existing.domain === cookie.domain)) {
                allCookies.push(cookie);
            }
        });

        if (allCookies.length === 0) {
            return `Cookies: No data found for ${domain}.`;
        }

        console.log(`Worker: Found ${allCookies.length} cookies to remove`);
        let removedCount = 0;
        const errors = [];

        const promises = allCookies.map(async (cookie) => {
            try {
                // Строим правильный URL для удаления cookie
                const protocol = cookie.secure ? 'https' : 'http';
                const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
                const cookieUrl = `${protocol}://${cookieDomain}${cookie.path}`;
                
                const result = await chrome.cookies.remove({
                    url: cookieUrl,
                    name: cookie.name
                });
                
                if (result) {
                    removedCount++;
                } else {
                    console.warn(`Worker: Failed to remove cookie ${cookie.name} (no result)`);
                }
            } catch (e) {
                errors.push(`Failed removing cookie ${cookie.name}: ${e.message}`);
                console.warn(`Worker: Failed removing cookie ${cookie.name}`, e);
            }
        });

        await Promise.allSettled(promises);

        if (errors.length > 0 && removedCount === 0) {
            throw new Error(`Failed to remove any cookies: ${errors[0]}`);
        }

        return `Cookies: Cleared ${removedCount}/${allCookies.length} for ${domain}${errors.length > 0 ? ` (${errors.length} errors)` : ''}.`;
    } catch (error) {
        console.error("Worker: Error in clearCookies", error);
        throw new Error(`Cookies: ${error.message}`);
    }
}

async function clearStorage(tabId, storageType) {
    if (!chrome.scripting) {
        throw new Error("Worker: Missing 'scripting' permission.");
    }
    
    if (!tabId) {
        throw new Error("Worker: Invalid tabId for storage.");
    }

    const typeName = storageType === 'localStorage' ? 'Local Storage' : 'Session Storage';
    
    try {
        console.log(`Worker: Clearing ${storageType} for tab ${tabId}`);
        
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: (sType) => {
                try {
                    const storage = window[sType];
                    if (!storage) {
                        return { count: 0, success: true, message: `${sType} not available` };
                    }
                    
                    const count = storage.length;
                    if (count > 0) {
                        storage.clear();
                    }
                    
                    return { count: count, success: true };
                } catch (e) {
                    return { 
                        error: `Content Script Error (${sType}): ${e.message}`, 
                        success: false 
                    };
                }
            },
            args: [storageType]
        });

        if (!results || results.length === 0) {
            throw new Error(`Cannot access tab data (${typeName}). Page may be restricted or closed.`);
        }

        const result = results[0];
        
        if (result.error) {
            throw new Error(`${typeName}: Script execution failed - ${result.error}`);
        }

        if (result.result) {
            const { count, success, error, message } = result.result;
            
            if (!success) {
                throw new Error(`${typeName}: ${error || 'Unknown error'}`);
            }
            
            if (message) {
                return `${typeName}: ${message}`;
            }
            
            return `${typeName}: ${count > 0 ? `Cleared ${count} item(s).` : 'No data found.'}`;
        } else {
            throw new Error(`${typeName}: Unexpected script result format.`);
        }
    } catch (error) {
        console.error(`Worker: Error clearing ${storageType} for tab ${tabId}:`, error);
        
        let message = error.message;
        if (message.includes("No tab with id")) {
            message = `Cannot access tab data (${typeName}). Tab may be closed.`;
        } else if (message.includes("Cannot access contents") || message.includes("chrome-extension://")) {
            message = `Cannot access tab data (${typeName}). Page may be restricted.`;
        } else if (message.includes("Content Security Policy")) {
            message = `Cannot access tab data (${typeName}). Page CSP blocks script injection.`;
        }
        
        throw new Error(`${typeName}: ${message}`);
    }
}

async function clearBrowsingDataCache(sinceTime) {
    if (!chrome.browsingData) {
        throw new Error("Worker: Missing 'browsingData' permission.");
    }

    console.log(`Worker: Clearing browser cache since ${new Date(sinceTime).toISOString()}`);
    
    return new Promise((resolve, reject) => {
        chrome.browsingData.remove(
            { since: sinceTime }, 
            { "cache": true }, 
            () => {
                if (chrome.runtime.lastError) {
                    const msg = chrome.runtime.lastError.message;
                    console.error(`Worker: browsingData.remove cache error:`, msg);
                    
                    if (msg?.includes("No browsing data") || msg?.includes("no data")) {
                        resolve("Browser Cache: No data found.");
                    } else {
                        reject(new Error(`Browser Cache: ${msg || 'Failed to clear'}`));
                    }
                } else {
                    resolve("Browser Cache: Cleared successfully.");
                }
            }
        );
    });
}

async function clearBrowsingDataIndexedDB(sinceTime) {
    if (!chrome.browsingData) {
        throw new Error("Worker: Missing 'browsingData' permission.");
    }

    console.log(`Worker: Clearing IndexedDB since ${new Date(sinceTime).toISOString()}`);
    
    return new Promise((resolve, reject) => {
        chrome.browsingData.remove(
            { since: sinceTime }, 
            { "indexedDB": true }, 
            () => {
                if (chrome.runtime.lastError) {
                    const msg = chrome.runtime.lastError.message;
                    console.error(`Worker: browsingData.remove indexedDB error:`, msg);
                    
                    if (msg?.includes("No browsing data") || msg?.includes("no data")) {
                        resolve("IndexedDB: No data found.");
                    } else {
                        reject(new Error(`IndexedDB: ${msg || 'Failed to clear'}`));
                    }
                } else {
                    resolve("IndexedDB: Cleared successfully.");
                }
            }
        );
    });
}

async function clearHistory(sinceTime) {
    if (!chrome.history) {
        throw new Error("Worker: Missing 'history' permission.");
    }

    console.log(`Worker: Clearing history since ${new Date(sinceTime).toISOString()}`);
    
    return new Promise((resolve, reject) => {
        chrome.history.deleteRange(
            { 
                startTime: sinceTime, 
                endTime: Date.now() 
            }, 
            () => {
                if (chrome.runtime.lastError) {
                    const msg = chrome.runtime.lastError.message;
                    console.error(`Worker: history.deleteRange error:`, msg);
                    reject(new Error(`History: ${msg || 'Failed to clear'}`));
                } else {
                    resolve("History: Cleared successfully for range.");
                }
            }
        );
    });
}

// --- Enhanced Notification Helper with Diagnostics ---
async function showNotification(title, message, errorCount = 0) {
    console.log(`\n=== NOTIFICATION DEBUG START ===`);
    console.log(`Title: "${title}"`);
    console.log(`Message: "${message}"`);
    console.log(`Error Count: ${errorCount}`);
    
    // Check if notifications API is available
    if (!chrome.notifications) {
        console.error("❌ Chrome notifications API is not available");
        console.log(`=== NOTIFICATION DEBUG END ===\n`);
        return;
    }
    console.log("✅ Chrome notifications API is available");
    
    // Check permissions
    try {
        const permissions = await chrome.permissions.getAll();
        console.log("📋 Current permissions:", permissions.permissions);
        
        if (!permissions.permissions.includes('notifications')) {
            console.error("❌ 'notifications' permission is missing from current permissions");
            console.log(`=== NOTIFICATION DEBUG END ===\n`);
            return;
        }
        console.log("✅ 'notifications' permission is granted");
        
    } catch (permError) {
        console.error("❌ Error checking permissions:", permError);
    }
    
    // Use the same icon for all notifications
    const iconUrl = chrome.runtime.getURL('images/icon128.png');
    console.log("🖼️  Icon URL:", iconUrl);
    
    const notificationId = 'cache-cleaner-notification-' + Date.now();
    console.log("🆔 Notification ID:", notificationId);
    
    const notificationOptions = {
        type: 'basic',
        iconUrl: iconUrl,
        title: title,
        message: message,
        priority: errorCount > 0 ? 2 : 1,
        requireInteraction: false,
        silent: false // Make sure it's not silent
    };
    console.log("⚙️  Notification options:", notificationOptions);
    
    try {
        // First, try to clear any existing notifications
        chrome.notifications.clear('cache-cleaner-notification', () => {
            console.log("🧹 Cleared any existing notification");
        });
        
        // Create new notification
        chrome.notifications.create(notificationId, notificationOptions, (createdId) => {
            if (chrome.runtime.lastError) {
                console.error("❌ Notification creation failed:");
                console.error("   Error:", chrome.runtime.lastError.message);
                console.error("   Full error object:", chrome.runtime.lastError);
            } else {
                console.log("✅ Notification created successfully!");
                console.log("   Created ID:", createdId);
                
                // Verify the notification exists
                chrome.notifications.getAll((notifications) => {
                    console.log("📋 All active notifications:", Object.keys(notifications));
                    if (notifications[createdId]) {
                        console.log("✅ Our notification is in the active list");
                    } else {
                        console.warn("⚠️  Our notification is NOT in the active list");
                    }
                });
            }
            console.log(`=== NOTIFICATION DEBUG END ===\n`);
        });
        
    } catch (e) {
        console.error("❌ Exception creating notification:", e);
        console.log(`=== NOTIFICATION DEBUG END ===\n`);
    }
}

// --- Main Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "testNotification") {
        console.log("Worker: Received test notification request");
        showNotification("🧪 Test Notification", "This is a test to check if notifications are working!", 0);
        sendResponse({ success: true });
        return true;
    }
    
    if (message.action === "cleanData") {
        console.log("Worker: Received cleanData message");
        
        // Perform async operation and return true to indicate we'll send response asynchronously
        handleCleanData(message).then(result => {
            sendResponse(result);
        }).catch(error => {
            console.error("Worker: Error in handleCleanData:", error);
            sendResponse({ success: false, error: error.message });
        });
        
        return true; // Keep the message channel open for async response
    }
    
    return false;
});

// --- Improved Clean Data Handler ---
async function handleCleanData(message) {
    const options = message.options;
    const tabInfo = message.tabInfo;
    const sinceTime = message.sinceTime;

    let successDetails = [];
    let failureDetails = [];
    let errorCount = 0;
    let successCount = 0;
    let cleaningStarted = false;

    try {
        // Check if cleaning is already in progress
        const currentState = await new Promise((resolve, reject) => {
            chrome.storage.local.get([STORAGE_CLEANING_FLAG], (data) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(data);
                }
            });
        });

        if (currentState[STORAGE_CLEANING_FLAG] === true) {
            console.warn("Worker: Cleaning already in progress, aborting new request");
            throw new Error("Cleaning already in progress");
        }

        // Set cleaning flag atomically
        await new Promise((resolve, reject) => {
            chrome.storage.local.set({ [STORAGE_CLEANING_FLAG]: true }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(`Failed to set cleaning flag: ${chrome.runtime.lastError.message}`));
                } else {
                    cleaningStarted = true;
                    console.log("Worker: Cleaning flag set to true");
                    resolve();
                }
            });
        });

        const tasks = [];

        try {
            // --- Build Task List ---
            if (options.cookies && tabInfo?.url) {
                tasks.push(createCleaningTask('Cookies', () => clearCookies(tabInfo)));
            }
            if (options.localStorage && tabInfo?.id) {
                tasks.push(createCleaningTask('Local Storage', () => clearStorage(tabInfo.id, 'localStorage')));
            }
            if (options.sessionStorage && tabInfo?.id) {
                tasks.push(createCleaningTask('Session Storage', () => clearStorage(tabInfo.id, 'sessionStorage')));
            }
            if (options.cache) {
                tasks.push(createCleaningTask('Browser Cache', () => clearBrowsingDataCache(sinceTime)));
            }
            if (options.indexedDB) {
                tasks.push(createCleaningTask('IndexedDB', () => clearBrowsingDataIndexedDB(sinceTime)));
            }
            if (options.clearHistory) {
                tasks.push(createCleaningTask('History', () => clearHistory(sinceTime)));
            }

            if (tasks.length === 0) {
                console.log("Worker: No cleaning options selected");
                showNotification("Cache Cleaner", "No cleaning options selected.");
                
                const result = {
                    success: true,
                    summary: ["No cleaning options selected."],
                    errors: []
                };
                
                // Send completion message
                await sendCleaningCompleteMessage(result);
                return result;
            }

            console.log(`Worker: Executing ${tasks.length} cleaning tasks...`);
            const results = await Promise.allSettled(tasks.map(task => task.action()));
            console.log("Worker: All cleaning tasks completed");

            // --- Process Results ---
            results.forEach((result, index) => {
                const taskName = tasks[index]?.name || 'Unknown Task';
                if (result.status === 'fulfilled') {
                    successDetails.push(result.value);
                    // Count as success if it actually cleared something
                    if (!result.value?.toLowerCase().includes("no data found") && 
                        !result.value?.toLowerCase().includes("skipped")) {
                        successCount++;
                    }
                } else {
                    errorCount++;
                    let simpleError = `${taskName}: Failed`;
                    if (result.reason instanceof Error && result.reason.message) {
                        const msg = result.reason.message;
                        simpleError = msg.startsWith(taskName + ':') ? msg : `${taskName}: ${msg}`;
                        
                        // Simplify common error messages
                        if (msg.includes("permission")) {
                            simpleError = `${taskName}: Permission denied.`;
                        } else if (msg.includes("Cannot access") || msg.includes("restricted")) {
                            simpleError = `${taskName}: Access denied.`;
                        } else if (msg.includes("No tab")) {
                            simpleError = `${taskName}: Tab closed.`;
                        } else if (msg.includes("Content Security Policy")) {
                            simpleError = `${taskName}: Blocked by page security.`;
                        }
                    }
                    failureDetails.push(simpleError);
                    console.error(`Worker: Task ${taskName} failed:`, result.reason);
                }
            });

            // --- Show Notification ---
            let notificationTitle = "Cache Cleaner";
            let notificationMessage = "";
            if (errorCount > 0) {
                notificationTitle = `Cache Cleaner: ${errorCount} Error(s)`;
                notificationMessage = `Finished with ${errorCount} error(s) out of ${tasks.length} task(s)`;
                if (failureDetails.length > 0) {
                    notificationMessage += `. ${failureDetails[0]}`;
                }
            } else if (successCount > 0) {
                notificationMessage = `Successfully cleared data in ${successCount}/${tasks.length} task(s).`;
            } else {
                notificationMessage = `Completed ${tasks.length} task(s). No data found to clear.`;
            }
            showNotification(notificationTitle, notificationMessage, errorCount);

            // --- Page Reload ---
            if (options.reloadPage && errorCount === 0 && successCount > 0 && tabInfo?.id) {
                // Add small delay to allow cleanup to complete
                setTimeout(async () => {
                    try {
                        await chrome.tabs.get(tabInfo.id); // Check if tab still exists
                        await chrome.tabs.reload(tabInfo.id, { bypassCache: true });
                        console.log(`Worker: Reloaded tab ${tabInfo.id}`);
                    } catch (reloadError) {
                        console.warn(`Worker: Failed to reload tab ${tabInfo.id}:`, reloadError.message);
                    }
                }, 500);
            }

        } catch (cleaningError) {
            // Handle unexpected errors during cleaning
            console.error("Worker: Unexpected error during cleaning process:", cleaningError);
            errorCount++;
            failureDetails.push(`Unexpected error: ${cleaningError.message}`);
            showNotification("Cache Cleaner: Error", "An unexpected error occurred during cleaning.", 1);
        }

        // --- Prepare Results ---
        let summaryMessages = successDetails.filter(msg => 
            !msg.toLowerCase().includes("skipped") && 
            !msg.toLowerCase().includes("no data found")
        );
        
        if (summaryMessages.length === 0 && successDetails.length > 0 && failureDetails.length === 0) {
            summaryMessages = ["No data found for selected options."];
        } else if (summaryMessages.length === 0 && failureDetails.length === 0 && tasks.length > 0) {
            summaryMessages = ["Finished tasks, no specific data cleared."];
        }

        const result = {
            success: errorCount === 0,
            summary: summaryMessages,
            errors: failureDetails
        };

        // Send completion message
        await sendCleaningCompleteMessage(result);
        return result;

    } catch (initError) {
        // Handle initialization errors (flag setting, etc.)
        console.error("Worker: Failed to initialize cleaning:", initError);
        
        if (cleaningStarted) {
            // If we managed to set the flag, clear it
            await clearCleaningFlag();
        }

        const result = {
            success: false,
            summary: [],
            errors: [`Failed to start cleaning: ${initError.message}`]
        };

        await sendCleaningCompleteMessage(result);
        return result;
    } finally {
        // Always clear the cleaning flag if it was set
        if (cleaningStarted) {
            await clearCleaningFlag();
        }
    }
}

// --- Helper Functions for State Management ---
async function clearCleaningFlag() {
    return new Promise((resolve) => {
        chrome.storage.local.remove(STORAGE_CLEANING_FLAG, () => {
            if (chrome.runtime.lastError) {
                console.error("Worker: Failed to clear cleaning flag:", chrome.runtime.lastError);
            } else {
                console.log("Worker: Cleaning flag cleared");
            }
            resolve();
        });
    });
}

async function sendCleaningCompleteMessage(result) {
    try {
        await chrome.runtime.sendMessage({
            action: "cleaningComplete",
            ...result
        });
    } catch (e) {
        // Expected if popup is closed - not an error
        console.log("Worker: Popup may be closed, couldn't send completion message");
    }
}

console.log("Cache Cleaner Service Worker Started.");

// Test notification function for debugging
function testNotification() {
    console.log("Worker: Testing notification system...");
    showNotification("Cache Cleaner Test", "Notifications are working correctly!", 0);
}

chrome.runtime.onInstalled.addListener((details) => {
    console.log("Worker: Extension installed/updated, reason:", details.reason);
    
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        // Code to be executed on first install
        console.log("Worker: First install - testing notifications");
        
        // Test notification on install
        setTimeout(() => {
            showNotification("Cache Cleaner Installed", "Extension is ready to keep your browser clean!", 0);
        }, 1000);
        
        // Open welcome page
        chrome.tabs.create({
            url: "https://sergeycommit.github.io/cache_cleaner/",
        });
    } else if (details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
        // When extension is updated
        console.log("Worker: Extension updated");
    } else if (details.reason === chrome.runtime.OnInstalledReason.CHROME_UPDATE) {
        // When browser is updated
        console.log("Worker: Browser updated");
    } else if (details.reason === chrome.runtime.OnInstalledReason.SHARED_MODULE_UPDATE) {
        // When a shared module is updated
        console.log("Worker: Shared module updated");
    }
});

// Make test function available globally for debugging
self.testNotification = testNotification;