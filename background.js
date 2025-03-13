// This function is preserved for backward compatibility
// (in case the user clicks the extension icon without the popup)
function getDomainAndTLD(url) {
  const urlObj = new URL(url);
  const parts = urlObj.hostname.split(".");
  if (parts.length > 2) {
    return parts.slice(-2).join(".");
  }
  return urlObj.hostname;
}

// Listen for messages from popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getTabInfo") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        sendResponse({ url: tabs[0].url, tabId: tabs[0].id });
      } else {
        sendResponse({ error: "No active tab found" });
      }
    });
    return true; // Required for async sendResponse
  }
});

// Set badge color
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#4a90e2" });
});

// Legacy support: If the user clicks the extension icon directly (when popup is disabled)
chrome.action.onClicked.addListener((tab) => {
  // Only handle clicks if we couldn't show the popup for some reason
  if (!chrome.action.getPopup) {
    legacyCleanup(tab);
  }
});

// Function to handle the legacy cleaning process
function legacyCleanup(tab) {
  const domain = getDomainAndTLD(tab.url);

  // Clear cookies
  chrome.cookies.getAll({ domain: domain }, (cookies) => {
    for (let cookie of cookies) {
      const cookieUrl = `http${cookie.secure ? "s" : ""}://${cookie.domain}${
        cookie.path
      }`;
      chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
    }
  });

  // Clear local storage, session storage, and IndexedDB
  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      function: () => {
        // Clear localStorage
        localStorage.clear();

        // Clear sessionStorage
        sessionStorage.clear();

        // Clear IndexedDB
        if (window.indexedDB) {
          window.indexedDB.databases().then((dbs) => {
            dbs.forEach((db) => {
              window.indexedDB.deleteDatabase(db.name);
            });
          });
        }

        // Force a page reload to ensure all changes take effect
        location.reload();
      },
    },
    () => {
      // Show a notification to the user
      chrome.action.setBadgeText({ text: "Done", tabId: tab.id });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: "", tabId: tab.id });
      }, 2000);
    }
  );
}
