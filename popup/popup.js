let allComments = [];
let currentIndex = 0;

function displayComments() {
    let commentsToShow = allComments.slice(currentIndex, currentIndex + 5).join("\n\n");
    let decodedContent = decodeHTMLEntities(commentsToShow);
    let sanitizedContent = DOMPurify.sanitize(decodedContent);
    document.getElementById("summary").innerHTML = sanitizedContent;

    document.getElementById("prev-comments").style.display = currentIndex > 0 ? "block" : "none";
    document.getElementById("more-comments").style.display = currentIndex + 5 < allComments.length ? "block" : "none";
}

chrome.runtime.onMessage.addListener((message) => {
    if (message.summary) {
        allComments = message.summary;
        currentIndex = 0;
        displayComments();
        if (allComments.length > 5) {
            document.getElementById("more-comments").style.display = "block";
        }
        // document.getElementById("summary").innerText = decodeHTMLEntities(comments);

        document.getElementById("allComments").value = decodeHTMLEntities(allComments.join("\n\n"));
        document.getElementById("get-ai-summary").disabled = false;
    }
});

function decodeHTMLEntities(text) {
    let textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
}

const MAX_TOKENS = 16000; // Safe buffer within 16385 limit
const APPROX_CHAR_PER_TOKEN = 4; // Rough estimate for English text
const MAX_CHARS = MAX_TOKENS * APPROX_CHAR_PER_TOKEN; // Limit input size

async function aiSummarizeText(comments, apiKey) {
    const truncatedComments = comments.length > MAX_CHARS 
    ? comments.slice(0, MAX_CHARS) + "..." 
    : comments;

    const model = document.getElementById("model-select").value; // Get selected model
    const prompt = `Summarise the following comments. Your response should contain two sections: 1. A para with the overall summary 2. A few bullet points highlighting the main opinions. Comments: ${truncatedComments}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content:  prompt}],
            max_tokens: 200,
        }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
    // return comments;
}

document.addEventListener("DOMContentLoaded", async () => {
    // const summaryDiv = document.getElementById("summary");
    const aiSummaryDiv = document.getElementById("ai-summary");
    const apiKeyInput = document.getElementById("api-key");
    const saveKeyBtn = document.getElementById("save-key");
    // const getSummaryBtn = document.getElementById("get-summary");
    const getAISummaryBtn = document.getElementById("get-ai-summary");
    const apiKeyTooltip = document.getElementById("api-key-tooltip");
    const moreCommentsBtn = document.getElementById("more-comments");
    const prevCommentsBtn = document.getElementById("prev-comments");
    const aiModelDropDown = document.getElementById("model-select");

    // Load API Key from Chrome Storage
    chrome.storage.local.get("hane_openai_key", (data) => {
        if (data.hane_openai_key) {
            apiKeyInput.value = "********"; // Hide actual key
            saveKeyBtn.textContent = "Edit";
        }
    });

    // Save API Key
    saveKeyBtn.addEventListener("click", () => {
        if (saveKeyBtn.textContent === "Edit") {
            apiKeyInput.value = "";
            apiKeyInput.focus();
            saveKeyBtn.textContent = "Save";
        } else {
            const key = apiKeyInput.value.trim();
            if (key) {
                chrome.storage.local.set({ "hane_openai_key": key }, () => {
                    alert("API Key saved!");
                    apiKeyInput.value = "********"; // Hide after saving
                    saveKeyBtn.textContent = "Edit";

                    apiKeyInput.classList.remove("error");
                    apiKeyTooltip.style.display = "none";
                });
            }
        }
    });

    // Get AI Summary (from OpenAI API)
    getAISummaryBtn.addEventListener("click", () => {
        chrome.storage.local.get("hane_openai_key", async (data) => {
            if (!data.hane_openai_key) {
                // aiSummaryDiv.textContent = "No API key saved. Please enter one.";
                
                apiKeyInput.classList.add("error");
                apiKeyTooltip.style.display = "block";
                apiKeyInput.focus();
                return;
            }
            apiKeyInput.classList.remove("error");
            apiKeyTooltip.style.display = "none";

            const model = aiModelDropDown.value; // Get selected model
            aiSummaryDiv.textContent = `Generating AI summary using model ${model}...`;
            getAISummaryBtn.style.display = "none";
            aiModelDropDown.style.display = "none";
            const allComments = document.getElementById("allComments").value;

            // chrome.runtime.sendMessage({ action: "fetch_ai_summary", apiKey: data.hane_openai_key, comments: allComments }, (response) => {
            //     aiSummaryDiv.textContent = response ? response.ai_summary : "Error generating AI summary.";
            //     getAISummaryBtn.style.display = "none";
            // });

            const summary = await aiSummarizeText(allComments, data.hane_openai_key);
            if (summary) {
                aiSummaryDiv.textContent = summary;
            } else {
                aiSummaryDiv.textContent = "Error generating AI summary.";
            }
            getAISummaryBtn.style.display = "block";
            aiModelDropDown.style.display = "block";
        });
    });

    moreCommentsBtn.addEventListener("click", () => {
        currentIndex += 5;
        // if (currentIndex + 5 >= allComments.length) {
        //     moreCommentsBtn.style.display = "none";
        // }
        displayComments();
    });

    prevCommentsBtn.addEventListener("click", () => {
        currentIndex = Math.max(0, currentIndex - 5);
        displayComments();
    });
});

