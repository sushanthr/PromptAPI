let errorShown = false;
const kFeatureFlagError = "Prompt API is not detected. Use a supporting browser and enable the API if required.";
const kNoModelError = "Prompt API is available, but no models are available. Is On-device AI enabled in chrome://settings/ai.";
let sessionController = null;
let creationController = null;
var session = null;
let sessionTools = new Map();
let isStreaming = false;

function getLanguageModel() {
    return window.LanguageModel;
}

// Add model settings
let modelSettings = {
    samplingMode: "balanced",
    systemPrompt: localStorage.getItem("systemPrompt") || "",
    jsonSchema: "",
    regexConstraint: ""
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

function getSessionOptions() {
    const options = { ...getSamplingOptions(modelSettings.samplingMode), ...getToolSessionOptions() };
    if (modelSettings.systemPrompt.trim()) {
        options.initialPrompts = [{ role: 'system', content: modelSettings.systemPrompt }];
    }
    return options;
}

async function createSession() {
    if (creationController) creationController.abort();
    const controller = new AbortController();
    creationController = controller;
    try {
        const options = getSessionOptions();
        const availability = await getModelAvailability(options);
        if (controller.signal.aborted) return;
        if (availability === "unavailable") {
            throw new Error(kNoModelError);
        }
        const created = await getLanguageModel().create({
            ...options,
            signal: controller.signal,
            monitor: monitorModelDownload
        });
        if (controller.signal.aborted) {
            created.destroy();
            return;
        }
        if (options.samplingMode && created.samplingMode !== options.samplingMode) {
            created.destroy();
            throw new Error("Sampling modes are not supported or enabled. Check browser flags or the sampling-parameters origin trial.");
        }
        if (session) session.destroy();
        session = created;
        sessionTools = new Map(appliedTools);
        localStorage.setItem("systemPrompt", modelSettings.systemPrompt);
        showSuccess();
    } catch (e) {
        if (controller.signal.aborted) return;
        if (session) session.destroy();
        session = null;
        sessionTools = new Map();
        console.error("Failed to create session:", e);
        showError("Failed to create session: " + e.message);
    }
    finally {
        if (creationController === controller) creationController = null;
    }
}

async function downloadModel() {
    updateModelAvailability("downloading");
    await createSession();
}

// Settings panel functionality
function initializeSettings() {
    document.querySelectorAll("[data-prompt-api-help]").forEach(message => {
        message.classList.toggle("hidden", Boolean(window.LanguageModel));
    });
    const samplingInput = document.getElementById("sampling-mode");
    const samplingEnabled = supportsSamplingMode();
    samplingInput.disabled = !samplingEnabled;
    document.getElementById("sampling-mode-controls").classList.toggle("hidden", !samplingEnabled);
    document.getElementById("sampling-mode-unavailable").classList.toggle("hidden", samplingEnabled);
    document.getElementById("sampling-mode-name").classList.toggle("text-blue-400", samplingEnabled);
    document.getElementById("sampling-mode-name").classList.toggle("text-gray-500", !samplingEnabled);
    const samplingModes = [
        { value: "most-predictable", label: "Most predictable", description: "Prioritizes consistency and reproducibility." },
        { value: "predictable", label: "Predictable", description: "Focused responses with minimal variation." },
        { value: "slightly-predictable", label: "Slightly predictable", description: "Focused responses with a little more variety." },
        { value: "balanced", label: "Balanced", description: "A balance of predictability and creativity." },
        { value: "slightly-creative", label: "Slightly creative", description: "More variety while keeping responses focused." },
        { value: "creative", label: "Creative", description: "Varied responses for creative tasks." },
        { value: "most-creative", label: "Most creative", description: "Prioritizes variety for brainstorming and exploration." }
    ];
    const systemPromptInput = document.getElementById("system-prompt");
    const schemaConstraintInput = document.getElementById("json-schema");
    const regexConstraintInput = document.getElementById("regex-constraint");
    
    // Set initial values
    systemPromptInput.value = modelSettings.systemPrompt;
    samplingInput.value = samplingModes.findIndex(mode => mode.value === modelSettings.samplingMode);
    samplingInput.addEventListener("input", () => {
        const mode = samplingModes[samplingInput.valueAsNumber];
        modelSettings.samplingMode = mode.value;
        samplingInput.setAttribute("aria-valuetext", mode.label);
        document.getElementById("sampling-mode-name").textContent = mode.label;
        document.getElementById("sampling-mode-description").textContent = mode.description;
        if (session || creationController) createSession();
    });

    systemPromptInput.addEventListener("input", (e) => {
        modelSettings.systemPrompt = e.target.value;
        if (session) createSession();
    });

    schemaConstraintInput.addEventListener("input", (e) => {
        modelSettings.jsonSchema = e.target.value;

        // Validate JSON when input changes
        if (e.target.value.trim()) {
            try {
                getResponseConstraint(e.target.value, "");
                e.target.style.border = "1px solid green";
            } catch (parseError) {
                e.target.style.border = "1px solid red";
            }
        } else {
            e.target.style.removeProperty("border");
        }
    });

    regexConstraintInput.addEventListener("input", event => {
        modelSettings.regexConstraint = event.target.value;
        if (event.target.value.trim()) {
            try {
                getResponseConstraint("", event.target.value);
                event.target.style.border = "1px solid green";
            } catch (error) {
                event.target.style.border = "1px solid red";
            }
        } else {
            event.target.style.removeProperty("border");
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
                modelSettings.jsonSchema = "";
                schemaConstraintInput.style.removeProperty("border");
            } else if (sampleSchemas[schemaId]) {
                const formattedSchema = JSON.stringify(sampleSchemas[schemaId], null, 2);
                schemaConstraintInput.value = formattedSchema;
                modelSettings.jsonSchema = formattedSchema;
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
function getResponseConstraint(jsonSchema, regexPattern) {
    const json = jsonSchema.trim();
    const regex = regexPattern.trim();
    if (json && regex) throw new Error("Use either a JSON constraint or a Regex constraint, not both.");
    if (json) {
        const schema = JSON.parse(json);
        if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
            throw new Error("JSON constraint must be a schema object.");
        }
        return schema;
    }
    if (regex) return new RegExp(regex);
    return null;
}

let currentCps = 0;
let initialDelay = null;
let startTime = null;
let postPrefillTime = null;
let postPrefillC = null;
let postPrefillT = null;
let tokenCount = 0;
let currentTps = 0;
let updateElement = null;

function renderStreamedText(response, chatOutput) {
    updateElement.innerHTML = marked.parse(response);
    tokenCount++;
    if (tokenCount >= 2) {
        if (postPrefillTime) {
            const seconds = (Date.now() - postPrefillTime) / 1000;
            if (seconds > 0) {
                currentCps = (updateElement.innerText.length - postPrefillC) / seconds;
                currentTps = (tokenCount - postPrefillT) / seconds;
            }
        } else {
            postPrefillTime = Date.now();
            postPrefillC = updateElement.innerText.length;
            postPrefillT = tokenCount;
        }
    }
    if (initialDelay === null) {
        initialDelay = Date.now() - startTime;
        document.getElementById("start-latency").textContent = initialDelay;
    }
    document.getElementById("chars-per-sec").textContent = Math.round(currentCps);
    document.getElementById("tokens-per-sec").textContent = Math.round(currentTps);
    chatOutput.scrollTop = chatOutput.scrollHeight;
}

async function sendMessage(input) {
    const chatOutput = document.getElementById("chat-output");
    document.getElementById("chat-empty-state")?.remove();
    
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
    const controller = new AbortController();
    try {
        sessionController = controller;
        let options = { signal: controller.signal };
        const constraint = getResponseConstraint(modelSettings.jsonSchema, modelSettings.regexConstraint);
        if (constraint) options.responseConstraint = constraint;
        
        tokenCount = 0;
        initialDelay = null;
        currentCps = 0;
        currentTps = 0;
        postPrefillTime = null;
        document.getElementById("start-latency").textContent = "0";
        document.getElementById("chars-per-sec").textContent = "0";
        document.getElementById("tokens-per-sec").textContent = "0";
        startTime = Date.now();
        if (sessionTools.size) {
            const invocations = new Map();
            await promptWithTools(session, input, options, sessionTools,
                text => renderStreamedText(text, chatOutput),
                (call, state) => {
                    let entry = invocations.get(call);
                    if (!entry) {
                        const details = document.createElement("details");
                        details.className = "tool-invocation text-sm";
                        const summary = document.createElement("summary");
                        summary.setAttribute("aria-live", "polite");
                        details.appendChild(summary);
                        const parametersLabel = document.createElement("p");
                        parametersLabel.className = "text-xs text-gray-400";
                        parametersLabel.textContent = "Parameters";
                        const parameters = document.createElement("pre");
                        parameters.textContent = JSON.stringify(call.arguments ?? {}, null, 2);
                        const responseLabel = document.createElement("p");
                        responseLabel.className = "text-xs text-gray-400";
                        responseLabel.textContent = "Response";
                        const response = document.createElement("pre");
                        details.append(parametersLabel, parameters, responseLabel, response);
                        botMessage.insertBefore(details, updateElement);
                        entry = { summary, response };
                        invocations.set(call, entry);
                    }
                    entry.summary.textContent = `Tool ${call.name} invoked (${state.status})`;
                    entry.response.textContent = state.status === "Completed"
                        ? JSON.stringify(state.result, null, 2)
                        : state.error ?? (state.status === "Stopped" ? "Tool execution stopped." : "Waiting for result...");
                    chatOutput.scrollTop = chatOutput.scrollHeight;
                });
            return;
        }
        stream = session.promptStreaming(input, options);
    } catch (e) {
        if (controller.signal.aborted) {
            if (updateElement.textContent === "...") updateElement.textContent = "Stopped.";
            return;
        }
        const message = (sessionTools.size ? "Error processing tools: " : "Error creating stream: ") + e.message;
        showError(message);
        updateElement.textContent = message;
        return;
    }
    
    try {
        let response = "";
        
        for await (const chunk of stream) {
            response += chunk;
            renderStreamedText(response, chatOutput);
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
        if (!session) return;
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
        let result = await getModelAvailability(getSessionOptions());
        
        if (result === 'unavailable') {
            showError(kNoModelError);
        } else if (result === 'downloadable') {
            updateModelAvailability(result);
            document.getElementById("download-btn").classList.remove("hidden");
        } else if (result === 'downloading') {
            updateModelAvailability(result);
            await createSession();
        } else if (result === 'available') {
            showSuccess();
            await createSession();
        } else {
            showError("Model status: " + result);
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
    initializeTools();
    initialize();
    
    // Event listeners
    document.getElementById("download-btn").addEventListener("click", downloadModel);
    document.getElementById("add-tool-btn").addEventListener("click", addCustomTool);
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
        applyButton.addEventListener("click", async () => {
            if (isStreaming) {
                showError("Stop the current response before applying settings.");
                return;
            }
            try {
                appliedTools = readToolSettings();
                if (supportsToolUse()) {
                    document.getElementById("tools-status").textContent = `Selected tools: ${appliedTools.size}.`;
                }
                await createSession();
            } catch (error) {
                console.error("Invalid tool settings:", error);
                document.getElementById("tools-status").textContent = "Invalid tool settings: " + error.message;
                showError("Invalid tool settings: " + error.message);
            }
        });
    }

});

