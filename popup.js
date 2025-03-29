document.addEventListener('DOMContentLoaded', function() {
    // Theme toggle functionality
    const themeToggle = document.getElementById('themeToggle');
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

    // Check if user has saved theme preference
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'dark' || (!savedTheme && prefersDarkScheme.matches)) {
        document.body.classList.add('dark-mode');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }

    themeToggle.addEventListener('click', function() {
        document.body.classList.toggle('dark-mode');

        if (document.body.classList.contains('dark-mode')) {
            localStorage.setItem('theme', 'dark');
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            localStorage.setItem('theme', 'light');
            themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        }
    });

    // Clean button click handler
    const cleanBtn = document.getElementById('cleanBtn');
    const statusElement = document.getElementById('status');
    const statusTextElement = document.getElementById('statusText');
    const summaryElement = document.getElementById('summary');
    const summaryListElement = document.getElementById('summaryList');

    // Get all cleaning option checkboxes
    const cookies = document.getElementById('cookies');
    const localStorageCheckbox = document.getElementById('localStorage');
    const sessionStorageCheckbox = document.getElementById('sessionStorage');
    const indexedDB = document.getElementById('indexedDB');
    const clearHistory = document.getElementById('clearHistory');

    // Fix for toggle switches - add click event listeners to all toggle switches
    document.querySelectorAll('.toggle-switch').forEach(toggle => {
        toggle.addEventListener('click', function(e) {
            // Only handle clicks on the slider or container, not the label or checkbox itself
            if (!e.target.matches('input[type="checkbox"]')) {
                const checkbox = this.querySelector('input[type="checkbox"]');
                checkbox.checked = !checkbox.checked;

                // Trigger the change event manually
                const changeEvent = new Event('change', { bubbles: true });
                checkbox.dispatchEvent(changeEvent);
            }
        });
    });

    // Save user preferences
    function savePreferences() {
        chrome.storage.local.set({
            preferences: {
                cookies: cookies.checked,
                localStorage: localStorageCheckbox.checked,
                sessionStorage: sessionStorageCheckbox.checked,
                indexedDB: indexedDB.checked,
                clearHistory: clearHistory.checked
            }
        });
    }

    // Load user preferences
    function loadPreferences() {
        chrome.storage.local.get('preferences', function(data) {
            if (data.preferences) {
                cookies.checked = data.preferences.cookies;
                localStorageCheckbox.checked = data.preferences.localStorage;
                sessionStorageCheckbox.checked = data.preferences.sessionStorage;
                indexedDB.checked = data.preferences.indexedDB;
                clearHistory.checked = data.preferences.clearHistory;
            }
        });
    }

    // Save preferences when any option is changed
    cookies.addEventListener('change', savePreferences);
    localStorageCheckbox.addEventListener('change', savePreferences);
    sessionStorageCheckbox.addEventListener('change', savePreferences);
    indexedDB.addEventListener('change', savePreferences);
    clearHistory.addEventListener('change', savePreferences);

    // Load saved preferences when popup opens
    loadPreferences();

    // Clean button click handler
    cleanBtn.addEventListener('click', function() {
        // Show status and hide summary
        statusElement.classList.remove('hidden');
        summaryElement.classList.add('hidden');

        // Disable clean button during cleaning
        cleanBtn.disabled = true;
        cleanBtn.innerHTML = '<div class="loader"></div><span>Cleaning...</span>';

        // Keep track of completed operations
        const results = {
            cookies: false,
            localStorage: false,
            sessionStorage: false,
            indexedDB: false,
            history: false
        };

        // Keep track of what was actually cleaned
        const cleaned = [];

        // Get the active tab
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const activeTab = tabs[0];
            let completedOperations = 0;
            const totalOperations = calculateTotalOperations();

            // Update status to show progress
            function updateStatus() {
                completedOperations++;
                statusTextElement.textContent = `Cleaning... (${completedOperations}/${totalOperations})`;

                // If all operations are complete, show summary
                if (completedOperations === totalOperations) {
                    setTimeout(showSummary, 500);
                }
            }

            // Calculate total number of operations to perform
            function calculateTotalOperations() {
                let count = 0;
                if (cookies.checked) count++;
                if (localStorageCheckbox.checked) count++;
                if (sessionStorageCheckbox.checked) count++;
                if (indexedDB.checked) count++;
                if (clearHistory.checked) count++;
                return count;
            }

            // Show summary of cleaning
            function showSummary() {
                // Reset clean button
                cleanBtn.disabled = false;
                cleanBtn.innerHTML = '<i class="fas fa-broom"></i><span>Clean Now</span>';

                // Hide status
                statusElement.classList.add('hidden');

                // Generate summary list
                summaryListElement.innerHTML = '';
                cleaned.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = item;
                    summaryListElement.appendChild(li);
                });

                // Show summary
                summaryElement.classList.remove('hidden');

                // Create a notification only if the API is available
                if (chrome.notifications) {
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icon.png',
                        title: 'Cache Cleaner',
                        message: 'Cleaning complete!',
                        priority: 2
                    });
                }
            }

            // Clean cookies
            if (cookies.checked) {
                // Get the domain of the active tab
                const url = new URL(activeTab.url);
                const domain = url.hostname;

                // Use the cookies API to get and remove cookies
                chrome.cookies.getAll({domain: domain}, function(cookieList) {
                    const cookieCount = cookieList.length;

                    if (cookieCount > 0) {
                        let removedCount = 0;

                        cookieList.forEach(cookie => {
                            const protocol = url.protocol.includes('https') ? 'https://' : 'http://';
                            const cookieUrl = protocol + cookie.domain + cookie.path;

                            chrome.cookies.remove({
                                url: cookieUrl,
                                name: cookie.name
                            }, function() {
                                removedCount++;
                                if (removedCount === cookieCount) {
                                    cleaned.push(`Cleared ${cookieCount} cookies`);
                                    results.cookies = true;
                                    updateStatus();
                                }
                            });
                        });
                    } else {
                        cleaned.push('No cookies to clear');
                        results.cookies = true;
                        updateStatus();
                    }
                });
            }

            // Clean localStorage
            if (localStorageCheckbox.checked) {
                chrome.scripting.executeScript({
                    target: {tabId: activeTab.id},
                    func: () => {
                        const count = window.localStorage.length;
                        window.localStorage.clear();
                        return count;
                    }
                }).then(result => {
                    if (result && result[0] && result[0].result > 0) {
                        cleaned.push(`Cleared local storage (${result[0].result} items)`);
                    } else {
                        cleaned.push('No local storage to clear');
                    }
                    results.localStorage = true;
                    updateStatus();
                }).catch(error => {
                    console.error("Error clearing localStorage:", error);
                    cleaned.push('Failed to clear local storage');
                    results.localStorage = true;
                    updateStatus();
                });
            }

            // Clean sessionStorage
            if (sessionStorageCheckbox.checked) {
                chrome.scripting.executeScript({
                    target: {tabId: activeTab.id},
                    func: () => {
                        const count = window.sessionStorage.length;
                        window.sessionStorage.clear();
                        return count;
                    }
                }).then(result => {
                    if (result && result[0] && result[0].result > 0) {
                        cleaned.push(`Cleared session storage (${result[0].result} items)`);
                    } else {
                        cleaned.push('No session storage to clear');
                    }
                    results.sessionStorage = true;
                    updateStatus();
                }).catch(error => {
                    console.error("Error clearing sessionStorage:", error);
                    cleaned.push('Failed to clear session storage');
                    results.sessionStorage = true;
                    updateStatus();
                });
            }

            // Clean indexedDB
            if (indexedDB.checked) {
                chrome.scripting.executeScript({
                    target: {tabId: activeTab.id},
                    func: () => {
                        return new Promise((resolve) => {
                            if (!window.indexedDB) {
                                resolve(0);
                                return;
                            }

                            // For Manifest V3, we need to use a different approach
                            if (indexedDB.databases) {
                                indexedDB.databases().then(dbs => {
                                    if (!dbs || dbs.length === 0) {
                                        resolve(0);
                                        return;
                                    }

                                    let completed = 0;
                                    dbs.forEach(db => {
                                        const request = indexedDB.deleteDatabase(db.name);
                                        request.onsuccess = () => {
                                            completed++;
                                            if (completed === dbs.length) {
                                                resolve(dbs.length);
                                            }
                                        };
                                        request.onerror = () => {
                                            completed++;
                                            if (completed === dbs.length) {
                                                resolve(dbs.length);
                                            }
                                        };
                                    });
                                }).catch(() => resolve(0));
                            } else {
                                // Fallback for browsers that don't support indexedDB.databases()
                                resolve(0);
                            }
                        });
                    }
                }).then(result => {
                    if (result && result[0] && result[0].result > 0) {
                        cleaned.push(`Cleared IndexedDB (${result[0].result} databases)`);
                    } else {
                        cleaned.push('No IndexedDB to clear');
                    }
                    results.indexedDB = true;
                    updateStatus();
                }).catch(error => {
                    console.error("Error clearing indexedDB:", error);
                    cleaned.push('Failed to clear IndexedDB');
                    results.indexedDB = true;
                    updateStatus();
                });
            }

            // Clear browsing history for the last hour
            if (clearHistory.checked) {
                const oneHourAgo = new Date().getTime() - (60 * 60 * 1000);
                chrome.history.deleteRange(
                    {
                        startTime: oneHourAgo,
                        endTime: new Date().getTime()
                    },
                    () => {
                        if (chrome.runtime.lastError) {
                            cleaned.push('Failed to clear browsing history');
                        } else {
                            cleaned.push('Cleared browsing history (last hour)');
                        }
                        results.history = true;
                        updateStatus();
                    }
                );
            }

            // If no operations are selected, show a message
            if (totalOperations === 0) {
                statusTextElement.textContent = 'No cleaning options selected';
                setTimeout(() => {
                    statusElement.classList.add('hidden');
                    cleanBtn.disabled = false;
                    cleanBtn.innerHTML = '<i class="fas fa-broom"></i><span>Clean Now</span>';
                }, 1500);
            }
        });
    });

    // Add button hover effect with sound - safely handle sound files that might not exist
    cleanBtn.addEventListener('mouseenter', function() {
        try {
            const hoverSound = new Audio('hover.mp3');
            hoverSound.volume = 0.2;
            hoverSound.play().catch(() => {});  // Catch and ignore errors if sound can't play
        } catch (e) {
            // Ignore errors if the audio file doesn't exist
        }
    });

    // Add button click sound - safely handle sound files that might not exist
    cleanBtn.addEventListener('mousedown', function() {
        try {
            const clickSound = new Audio('click.mp3');
            clickSound.volume = 0.3;
            clickSound.play().catch(() => {});  // Catch and ignore errors if sound can't play
        } catch (e) {
            // Ignore errors if the audio file doesn't exist
        }
    });

    // Show "Ready to clean" tooltip on first load
    setTimeout(() => {
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.textContent = 'Ready to clean!';
        document.body.appendChild(tooltip);

        // Position tooltip near clean button
        const cleanBtnRect = cleanBtn.getBoundingClientRect();
        tooltip.style.top = (cleanBtnRect.top - 40) + 'px';
        tooltip.style.left = (cleanBtnRect.left + cleanBtnRect.width / 2 - 50) + 'px';

        // Add animation class
        setTimeout(() => {
            tooltip.classList.add('show');

            // Remove tooltip after a few seconds
            setTimeout(() => {
                tooltip.classList.remove('show');
                setTimeout(() => {
                    tooltip.remove();
                }, 500);
            }, 3000);
        }, 100);
    }, 800);
});
