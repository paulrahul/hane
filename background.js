// Create the context menu on extension startup
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "hackedNewsPost",
        title: "Hacker News post",
        contexts: ["all"] // Show on all pages
    });

    chrome.contextMenus.create({
        id: "summary",
        title: "Summarise Hacker News comments",
        contexts: ["all"],  // Shows when clicking the extension icon
    });

});

async function getHNEntry(url) {
    async function searchHN(query) {
        const searchQuery = encodeURIComponent(query);
        let searchUrl = `https://hn.algolia.com/api/v1/search?query=${searchQuery}&tags=story&restrictSearchableAttributes=url`;
        let response = await fetch(searchUrl);
        let data = await response.json();
        return data.hits.length > 0 ? data.hits[0].objectID : null;
    }

    let hnStoryId = await searchHN(url);
    
    // If no result, retry by stripping query parameters from the URL
    // if (!hnStoryId) {
    //     let cleanUrl = url.split("?")[0];  // Remove query params
    //     hnStoryId = await searchHN(cleanUrl);
    // }

    return hnStoryId;
}

async function getArchiveLink(hnStoryId) {
    let hnUrl = `https://news.ycombinator.com/item?id=${hnStoryId}`;
    let response = await fetch(hnUrl);
    let text = await response.text();

    // Decode HTML entities (e.g., &#x2F; → /)
    function decodeHtmlEntities(encodedStr) {
        return encodedStr.replace(/&#x2F;/g, "/");
    }

    // Search for an archive link in the HTML
    let archiveLinkMatch = text.match(/href="(https?:&#x2F;&#x2F;archive\.[a-z]+&#x2F;[^"]+)"/i);

    if (archiveLinkMatch) {
        let encodedLink = archiveLinkMatch[1];  // Extract encoded URL
        return decodeHtmlEntities(encodedLink); // Decode and return the proper URL
    }

    return null;
}

function showNotification(title, message) {
    chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: title,
        message: message.substring(0, 2000) // Chrome notifications have a character limit
    });
}

function sendErrorReport(error) {
    const reportData = {
        access_key: "0b16b735-8eea-4343-ae9c-d607e1a00e79",
        subject: "HaNe Error Report",
        message: `Error: ${error.toString()}\nStack: ${error.stack || "No stack trace"}\nTime: ${new Date().toISOString()}`,
        replyTo: "hane.extension@gmail.com"
    };

    fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reportData)
    })
    .then(response => console.log("Error report sent:", response.status))
    .catch(err => console.error("Failed to send error report:", err));
}

async function doWithRetries(fn, retries = 2) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();  // Call the function passed as argument
        } catch (error) {
            if (attempt === retries) {
                showNotification("Error", "Encountered repeated errors, please retry later. Last error:" + error);
                sendErrorReport(error);
            } else {
                showNotification("Error", "An error occurred, retrying...");
            }
        }
    }
}

chrome.action.onClicked.addListener(async (tab) => {
    // Show busy state
    chrome.action.setBadgeText({ text: "🔍", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#FF5733" });

    await doWithRetries(async () => {
        let hnStoryId = await getHNEntry(tab.url);
        
        if (hnStoryId) {
            let archiveLink = await getArchiveLink(hnStoryId);
            
            if (archiveLink) {
                chrome.tabs.create({ url: archiveLink, index: tab.index + 1 });
            } else {
                showNotification("No Archive Link Found", "No archive link found for this article");
            }
        } else {
            showNotification("Not Found", "No Hacker News post found for this link");
        }
    });

    // Clear busy state
    chrome.action.setBadgeText({ text: "" });
    chrome.action.setBadgeBackgroundColor({ color: [0, 0, 0, 0] });
});

async function summarizeHNComments(hnStoryId) {
    // const hnApiUrl = `https://hn.algolia.com/api/v1/items/${hnStoryId}`;
    const hnApiUrl = `https://hn.algolia.com/api/v1/search_by_date?tags=comment,story_${hnStoryId}&hitsPerPage=1000`
    const response = await fetch(hnApiUrl);
    const data = await response.json();

    if (!data.hits || data.hits.length === 0) {
        return ["No comments available."];
    }

    // const topComments = data.children
    //     .filter(comment => comment.text)
    //     .map(comment => comment.text.replace(/<\/?[^>]+(>|$)/g, "")) // Remove HTML tags

    const topComments = data.hits.map(entry => entry.comment_text)
    return topComments;
}

async function aiSummarizeText(comments, apiKey) {
    const prompt = `Summarise these comments: ${comments}`;

    // const response = await fetch("https://api.openai.com/v1/chat/completions", {
    //     method: "POST",
    //     headers: {
    //         "Content-Type": "application/json",
    //         "Authorization": `Bearer ${apiKey}`,
    //     },
    //     body: JSON.stringify({
    //         model: "gpt-4o",
    //         messages: [{ role: "user", content:  prompt}],
    //         max_tokens: 200,
    //     }),
    // });

    // const data = await response.json();
    // return data.choices?.[0]?.message?.content || "Error summarizing text.";

    return comments;
}

function showSummaryPopup(commentsSummary) {
    const summaryText = `📌 **HN Comments Summary:**\n${commentsSummary}`;
    showNotification("HN Comments Summary", summaryText);
}

let popupWindowId = null;

function createNewPopup() {
    chrome.windows.create({
      url: chrome.runtime.getURL("popup/popup.html"),
      type: "popup",
      width: 500,
      height: 500
    }, function(window) {
      // Store the new window ID
      popupWindowId = window.id;
      
      // Add an event listener to reset the ID when the window is closed
      chrome.windows.onRemoved.addListener(function onWindowRemoved(windowId) {
        if (windowId === popupWindowId) {
          popupWindowId = null;
          chrome.windows.onRemoved.removeListener(onWindowRemoved);
        }
      });
    });
}  

// Function to open a new popup
function openPopup() {
    // Close any existing popup first
    if (popupWindowId !== null) {
      chrome.windows.remove(popupWindowId, function() {
        // After closing, create the new popup
        createNewPopup();
      });
    } else {
      // No existing popup, just create a new one
      createNewPopup();
    }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "hackedNewsPost") {

        await doWithRetries(async () => {
            let hnStoryId = await getHNEntry(tab.url);
            
            if (hnStoryId) {
                let hnUrl = `https://news.ycombinator.com/item?id=${hnStoryId}`;
                chrome.tabs.create({ url: hnUrl, index: tab.index + 1 });
            } else {
                showNotification("Not Found", "No Hacker News post found for this link");
            }
        });
    } else if (info.menuItemId === "summary") {
        await doWithRetries(async () => {
            // Open the popup with the summary
            // chrome.windows.create({
            //     url: chrome.runtime.getURL("popup/popup.html"),
            //     type: "popup",
            //     width: 500,
            //     height: 500
            // });

            openPopup();
            let hnStoryId = await getHNEntry(tab.url);
            if (!hnStoryId) {
                showNotification("Not Found", "No Hacker News post found for this link");
                chrome.runtime.sendMessage({ summary: ["No Hacker News post found for this link"]});
                return;
            }

            let commentsSummary = await summarizeHNComments(hnStoryId);
            if (commentsSummary) {
                chrome.runtime.sendMessage({ summary: commentsSummary});
            }
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "fetch_ai_summary") {
        doWithRetries(async () => {
            try {
                let aiSummary = await aiSummarizeText(message.hnStoryId, message.apiKey);
                sendResponse({ ai_summary: aiSummary });
            } catch (error) {
                console.error("AI Summary error:", error);
                sendResponse({ ai_summary: "Error fetching AI summary." });
            }
        });

        return true; // Keep message channel open for async response
    }
});
