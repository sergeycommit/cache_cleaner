function getDomainAndTLD(url) {
  const urlObj = new URL(url);
  const parts = urlObj.hostname.split(".");
  if (parts.length > 2) {
    return parts.slice(-2).join(".");
  }
  return urlObj.hostname;
}

chrome.action.onClicked.addListener((tab) => {
  const url = new URL(tab.url);
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
      function: clearStorages,
    },
    () => {
      // Show a notification to the user
      chrome.action.setBadgeText({ text: "Done", tabId: tab.id });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: "", tabId: tab.id });
      }, 2000);
    }
  );
});

function clearStorages() {
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
}
