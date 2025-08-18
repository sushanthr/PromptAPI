let errorShown = false;
const kFeatureFlagError = "Prompt API is not detected. Check feature flags are enabled, and that this is Canary.";
const kNoModelError = "Prompt API is available, feature flag is likely set correctly but no models are available.";
let sessionController = null;
var session = null;
let isStreaming = false;

function getLanguageModel() {
    // Try the new API first, then fall back to legacy
    return window.LanguageModel ? window.LanguageModel : window.ai.languageModel;
}

// Add model settings
let modelSettings = {
    temperature: 0.7,
    topK: 40,
    systemPrompt: localStorage.getItem("systemPrompt") || "",
    schemaConstraint: ""
};

function showError(message, isDownloading = false) {
    document.getElementById("model-status").innerText = message;
    if (isDownloading) {
        document.getElementById("model-icon").className = "material-icons text-yellow-400";
        document.getElementById("model-icon").innerText = "downloading";
        document.getElementById("download-btn").classList.add("hidden");
    } else {
        document.getElementById("model-icon").className = "material-icons text-red-400";
        document.getElementById("model-icon").innerText = "error";
        // Show download button for downloadable state
        if (message.includes("Downloadable")) {
            document.getElementById("download-btn").classList.remove("hidden");
        }
    }
}

function showSuccess() {
    document.getElementById("model-status").innerText = "Model: Available";
    document.getElementById("model-icon").className = "material-icons text-green-400";
    document.getElementById("model-icon").innerText = "check_circle";
    document.getElementById("download-btn").classList.add("hidden");
}

async function createSession() {
    sessionController = new AbortController();
    try {
        if (modelSettings.systemPrompt && modelSettings.systemPrompt.trim().length > 0) {
            session = await getLanguageModel().create({
                temperature: modelSettings.temperature,
                topK: modelSettings.topK,
                initialPrompts: [
                    { role: 'system', content: modelSettings.systemPrompt },
                ],
                signal: sessionController.signal
            });
        } else {
            session = await getLanguageModel().create({
                temperature: modelSettings.temperature,
                topK: modelSettings.topK,
                signal: sessionController.signal
            });
        }
        localStorage.setItem("systemPrompt", modelSettings.systemPrompt);
    } catch (e) {
        console.error("Failed to create session:", e);
    }
}

async function checkDownload() {
    try {
        let result = await getLanguageModel().availability();
        console.log(result);
        if (result !== 'available') {
            setTimeout(checkDownload, 100);
        } else {
            showSuccess();
            await createSession();
        }
    } catch (e) {
        console.error("Error checking download:", e);
    }
}

async function downloadModel() {
    try {
        showError("Initiating model download...", true);
        
        await getLanguageModel().create({
            monitor(m) {
                m.addEventListener("downloadprogress", e => {
                    const progress = Math.round(e.loaded * 100 / e.total);
                    showError(`Downloading model ${progress}% done.`, true);
                });
            }
        });
        
        checkDownload();
    } catch (e) {
        showError("Download failed: " + e.message);
    }
}

// Settings panel functionality
function initializeSettings() {
    const temperatureInput = document.getElementById("temperature");
    const topkInput = document.getElementById("topk");
    const systemPromptInput = document.getElementById("system-prompt");
    const schemaConstraintInput = document.getElementById("json-schema");
    
    // Set initial values
    temperatureInput.value = modelSettings.temperature;
    topkInput.value = modelSettings.topK;
    systemPromptInput.value = modelSettings.systemPrompt;
    
    // Update temperature display
    const temperatureDisplay = temperatureInput.nextElementSibling;
    if (temperatureDisplay) {
        temperatureDisplay.textContent = `Current: ${modelSettings.temperature}`;
    }
    
    temperatureInput.addEventListener("input", (e) => {
        modelSettings.temperature = parseFloat(e.target.value);
        const display = e.target.nextElementSibling;
        if (display) {
            display.textContent = `Current: ${e.target.value}`;
        }
        if (session) createSession();
    });

    topkInput.addEventListener("input", (e) => {
        modelSettings.topK = parseInt(e.target.value);
        if (session) createSession();
    });

    systemPromptInput.addEventListener("input", (e) => {
        modelSettings.systemPrompt = e.target.value;
        if (session) createSession();
    });

    schemaConstraintInput.addEventListener("input", (e) => {
        modelSettings.schemaConstraint = e.target.value;

        // Validate JSON when input changes
        if (e.target.value.trim()) {
            try {
                JSON.parse(e.target.value);
                e.target.style.border = "1px solid green";
            } catch (parseError) {
                e.target.style.border = "1px solid red";
            }
        } else {
            e.target.style.removeProperty("border");
        }
    });

    // Schema samples functionality
    const schemaSamplesBtn = document.getElementById("schema-samples-btn");
    const schemaDropdown = document.getElementById("schema-dropdown");
    const schemaOptions = document.querySelectorAll(".schema-option");

    const sampleSchemas = {
        rating: {
            type: "object",
            required: ["rating"],
            additionalProperties: false,
            properties: {
                rating: {
                    type: "number",
                    minimum: 0,
                    maximum: 5
                }
            }
        },
        answer: {
            "$schema": "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
                answer: {
                    type: "integer"
                },
                explanation: {
                    type: "string",
                    description: "Explanation of the answer"
                }
            },
            required: ["answer", "explanation"],
            additionalProperties: false
        }
    };

    schemaSamplesBtn.addEventListener("click", () => {
        schemaDropdown.classList.toggle("hidden");
    });

    schemaOptions.forEach(option => {
        option.addEventListener("click", () => {
            const schemaId = option.getAttribute("data-schema-id");
            
            if (schemaId === "clear") {
                schemaConstraintInput.value = "";
                modelSettings.schemaConstraint = "";
            } else if (sampleSchemas[schemaId]) {
                const formattedSchema = JSON.stringify(sampleSchemas[schemaId], null, 2);
                schemaConstraintInput.value = formattedSchema;
                modelSettings.schemaConstraint = formattedSchema;
                schemaConstraintInput.style.border = "1px solid green";
            }
            
            schemaDropdown.classList.add("hidden");
        });
    });

    document.addEventListener("click", (e) => {
        if (!schemaSamplesBtn.contains(e.target) && !schemaDropdown.contains(e.target)) {
            schemaDropdown.classList.add("hidden");
        }
    });
}

// Chat functionality
let currentCps = 0;
let initialDelay = null;
let startTime = null;
let postPrefillTime = null;
let postPrefillC = null;
let postPrefillT = null;
let tokenCount = 0;
let currentTps = 0;
let updateElement = null;

async function sendMessage(input) {
    const chatOutput = document.getElementById("chat-output");
    
    // Create user message
    const userMessage = document.createElement("div");
    userMessage.className = "chat-message user-message";
    userMessage.innerHTML = `<p class="text-sm">${input}</p>`;
    chatOutput.appendChild(userMessage);
    
    // Create bot message placeholder
    const botMessage = document.createElement("div");
    botMessage.className = "chat-message bot-message";
    botMessage.innerHTML = `<p class="text-sm">...</p>`;
    chatOutput.appendChild(botMessage);
    updateElement = botMessage.querySelector("p");
    
    chatOutput.scrollTop = chatOutput.scrollHeight;
    
    let stream = null;
    try {
        sessionController = new AbortController();
        let constraintObj = null;
        let options = { signal: sessionController.signal };
        
        if (modelSettings.schemaConstraint && modelSettings.schemaConstraint.trim()) {
            try {
                constraintObj = JSON.parse(modelSettings.schemaConstraint);
                options.responseConstraint = constraintObj;
            } catch (parseError) {
                console.error("Failed to parse schema constraint JSON:", parseError);
            }
        }
        
        stream = session.promptStreaming(input, options);
    } catch (e) {
        updateElement.innerHTML = "Error creating stream: " + e.message;
        return;
    }
    
    try {
        let response = "";
        tokenCount = 0;
        startTime = Date.now();
        postPrefillTime = null;
        
        for await (const chunk of stream) {
            response += chunk;
            updateElement.innerHTML = marked.parse(response);
            tokenCount++;
            
            // Calculate metrics
            if (tokenCount >= 2) {
                if (postPrefillTime) {
                    const seconds = ((Date.now() - postPrefillTime) / 1000);
                    if (seconds > 0) {
                        currentCps = ((updateElement.innerText.length - postPrefillC) / seconds);
                        currentTps = ((tokenCount - postPrefillT) / seconds);
                    }
                } else {
                    postPrefillTime = Date.now();
                    postPrefillC = updateElement.innerText.length;
                    postPrefillT = tokenCount;
                }
            }
            
            if (initialDelay === null) {
                initialDelay = (Date.now() - startTime);
                document.getElementById("start-latency").textContent = initialDelay;
            }
            
            document.getElementById("chars-per-sec").textContent = Math.round(currentCps);
            document.getElementById("tokens-per-sec").textContent = Math.round(currentTps);
            
            chatOutput.scrollTop = chatOutput.scrollHeight;
        }
    } catch (e) {
        updateElement.innerHTML = "Stream error: " + e.message;
    }
}

async function onSend() {
    const sendButton = document.getElementById("send-btn");
    const sendIcon = document.getElementById("send-icon");
    const inputField = document.getElementById("chat-input");

    if (isStreaming) {
        sessionController.abort();
        sessionController = null;
        isStreaming = false;
        sendIcon.textContent = "send";
        return;
    }

    const inputText = inputField.value.trim();
    if (!inputText) return;

    if (!session) {
        await createSession();
    }

    isStreaming = true;
    sendIcon.textContent = "stop";
    inputField.value = "";

    await sendMessage(inputText);
    
    isStreaming = false;
    sendIcon.textContent = "send";
}

// Initialize everything
async function initialize() {
    try {
        let result = await getLanguageModel().availability();
        
        if (result === 'unavailable') {
            showError(kNoModelError);
        } else if (result === 'downloadable') {
            showError("Model: Downloadable - click to download");
            checkDownload();
        } else if (result === 'downloading') {
            showError("Model downloading...", true);
            checkDownload();
        } else if (result === 'available') {
            showSuccess();
            await createSession();
        } else {
            showError("Model status: " + result);
            checkDownload();
        }
    } catch (e) {
        if (e.name === "TypeError") {
            showError(kFeatureFlagError);
        } else {
            showError("Error: " + e.message);
        }
    }
}

window.addEventListener("load", () => {
    initializeSettings();
    initialize();
    
    // Event listeners
    document.getElementById("download-btn").addEventListener("click", downloadModel);
    document.getElementById("send-btn").addEventListener("click", onSend);
    document.getElementById("chat-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    });
    
    // Apply settings button
    const applyButton = document.querySelector('.btn.btn-secondary.w-90.mt-2');
    if (applyButton) {
        applyButton.addEventListener("click", () => {
            if (session) createSession();
        });
    }
});