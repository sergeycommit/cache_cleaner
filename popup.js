document.addEventListener("DOMContentLoaded", () => {
  const cleanBtn = document.getElementById("cleanBtn");
  const status = document.getElementById("status");
  const statusText = document.getElementById("statusText");
  const summary = document.getElementById("summary");
  const summaryList = document.getElementById("summaryList");

  // Get checkboxes
  const cookiesCheckbox = document.getElementById("cookies");
  const localStorageCheckbox = document.getElementById("localStorage");
  const sessionStorageCheckbox = document.getElementById("sessionStorage");
  const indexedDBCheckbox = document.getElementById("indexedDB");

  // Load saved preferences
  chrome.storage.local.get(["cleanPreferences"], (result) => {
    if (result.cleanPreferences) {
      cookiesCheckbox.checked = result.cleanPreferences.cookies;
      localStorageCheckbox.checked = result.cleanPreferences.localStorage;
      sessionStorageCheckbox.checked = result.cleanPreferences.sessionStorage;
      indexedDBCheckbox.checked = result.cleanPreferences.indexedDB;
    }
  });

  cleanBtn.addEventListener("click", () => {
    // Show loading state
    cleanBtn.disabled = true;
    status.classList.remove("hidden");
    summary.classList.add("hidden");

    // Save preferences
    const preferences = {
      cookies: cookiesCheckbox.checked,
      localStorage: localStorageCheckbox.checked,
      sessionStorage: sessionStorageCheckbox.checked,
      indexedDB: indexedDBCheckbox.checked,
    };

    chrome.storage.local.set({ cleanPreferences: preferences });

    // Get active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const url = new URL(tab.url);

      const cleanupResults = {
        cookies: 0,
        localStorage: 0,
        sessionStorage: 0,
        indexedDB: 0,
      };

      // Process each cleanup operation
      const cleanupPromises = [];

      // Clean cookies
      if (preferences.cookies) {
        const domain = getDomainAndTLD(tab.url);
        cleanupPromises.push(
          new Promise((resolve) => {
            chrome.cookies.getAll({ domain: domain }, (cookies) => {
              cleanupResults.cookies = cookies.length;
              for (let cookie of cookies) {
                const cookieUrl = `http${cookie.secure ? "s" : ""}://${
                  cookie.domain
                }${cookie.path}`;
                chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
              }
              resolve();
            });
          })
        );
      }

      // Clean storages
      if (
        preferences.localStorage ||
        preferences.sessionStorage ||
        preferences.indexedDB
      ) {
        cleanupPromises.push(
          new Promise((resolve) => {
            chrome.scripting.executeScript(
              {
                target: { tabId: tab.id },
                function: clearStorages,
                args: [preferences],
              },
              (results) => {
                if (results && results[0]) {
                  const result = results[0].result;
                  cleanupResults.localStorage = result.localStorage;
                  cleanupResults.sessionStorage = result.sessionStorage;
                  cleanupResults.indexedDB = result.indexedDB;
                }
                resolve();
              }
            );
          })
        );
      }

      // When all cleanup is done
      Promise.all(cleanupPromises).then(() => {
        // Update status
        statusText.textContent = "Completed!";

        // Show summary
        summaryList.innerHTML = "";
        if (preferences.cookies) {
          summaryList.innerHTML += `<li>${cleanupResults.cookies} cookies removed</li>`;
        }
        if (preferences.localStorage) {
          summaryList.innerHTML += `<li>Local storage cleared (${cleanupResults.localStorage} items)</li>`;
        }
        if (preferences.sessionStorage) {
          summaryList.innerHTML += `<li>Session storage cleared (${cleanupResults.sessionStorage} items)</li>`;
        }
        if (preferences.indexedDB) {
          summaryList.innerHTML += `<li>${cleanupResults.indexedDB} IndexedDB databases removed</li>`;
        }

        summary.classList.remove("hidden");

        // Enable the button after a short delay
        setTimeout(() => {
          cleanBtn.disabled = false;
          status.classList.add("hidden");
        }, 1000);

        // Show the badge on the extension icon
        chrome.action.setBadgeText({ text: "Done", tabId: tab.id });
        setTimeout(() => {
          chrome.action.setBadgeText({ text: "", tabId: tab.id });
        }, 2000);
      });
    });
  });
});

// Helper function to get domain and TLD
function getDomainAndTLD(url) {
  const urlObj = new URL(url);
  const parts = urlObj.hostname.split(".");
  if (parts.length > 2) {
    return parts.slice(-2).join(".");
  }
  return urlObj.hostname;
}

// Function to be injected into the page to clear storages
function clearStorages(preferences) {
  const result = {
    localStorage: 0,
    sessionStorage: 0,
    indexedDB: 0,
  };

  // Clear localStorage
  if (preferences.localStorage) {
    result.localStorage = localStorage.length;
    localStorage.clear();
  }

  // Clear sessionStorage
  if (preferences.sessionStorage) {
    result.sessionStorage = sessionStorage.length;
    sessionStorage.clear();
  }

  // Clear IndexedDB
  if (preferences.indexedDB && window.indexedDB) {
    window.indexedDB.databases().then((dbs) => {
      result.indexedDB = dbs.length;
      dbs.forEach((db) => {
        window.indexedDB.deleteDatabase(db.name);
      });
    });
  }

  return result;
}
