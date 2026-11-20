let appliedTools = new Map();
let customToolCount = 0;

const builtInTools = {
    getTime: {
        name: "getTime",
        description: "Get the current time and local time zone.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        execute: () => ({
            time: new Date().toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
    },
    getLocation: {
        name: "getLocation",
        description: "Get the user's current latitude and longitude with browser permission.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        execute: () => new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error("Geolocation is not available in this browser."));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                position => resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                }),
                error => reject(new Error(error.message)),
                { timeout: 10000 }
            );
        })
    }
};

function supportsToolUse() {
    return Boolean(window.LanguageModel && [
        "LanguageModelToolCall", "LanguageModelToolSuccess", "LanguageModelToolError"
    ].every(name => typeof window[name] === "function"));
}

function getToolSessionOptions(tools = appliedTools) {
    if (!tools.size) return {};
    if (!supportsToolUse()) throw new Error("Tool use is not available. Enable it in chrome://flags.");
    return {
        expectedInputs: [{ type: "text" }, { type: "tool-response" }],
        expectedOutputs: [{ type: "text" }, { type: "tool-call" }],
        tools: Array.from(tools.values(), ({ name, description, inputSchema }) =>
            ({ name, description, inputSchema }))
    };
}

async function initializeTools() {
    const status = document.getElementById("tools-status");
    const controls = document.getElementById("tool-controls");
    if (!supportsToolUse()) {
        status.textContent = "Tool use is not available. Enable it in chrome://flags.";
        return;
    }
    try {
        const options = getToolSessionOptions(new Map([["getTime", builtInTools.getTime]]));
        const availability = await getModelAvailability(options);
        controls.disabled = availability === "unavailable";
        status.textContent = controls.disabled
            ? "Tool use API is available, but no compatible model is available."
            : "Select tools, then press Apply Settings to create a tool-enabled session.";
    } catch (error) {
        console.error("Cannot check tool-use availability:", error);
        status.textContent = "Cannot check tool-use availability: " + error.message;
    }
}

function addCustomTool() {
    const id = `custom-tool-${++customToolCount}`;
    const entry = document.createElement("div");
    entry.className = "tool-entry custom-tool";
    entry.innerHTML = `
        <label class="tool-toggle"><input type="checkbox" class="tool-enabled"> Enable custom tool</label>
        <label class="block text-xs text-gray-400" for="${id}-name">Name</label>
        <input id="${id}-name" class="input-field tool-name text-sm" value="customTool${customToolCount}">
        <label class="block text-xs text-gray-400" for="${id}-description">Description</label>
        <input id="${id}-description" class="input-field tool-description text-sm" value="Return an example number.">
        <label class="block text-xs text-gray-400" for="${id}-schema">Input schema (JSON)</label>
        <textarea id="${id}-schema" class="input-field tool-schema text-xs" rows="3">{"type":"object","properties":{},"additionalProperties":false}</textarea>
        <label class="block text-xs text-gray-400" for="${id}-implementation">Implementation (async function body)</label>
        <textarea id="${id}-implementation" class="input-field tool-implementation text-xs" rows="3">return 42;</textarea>
        <p class="text-xs text-gray-400">Available variables: args and signal. Code runs in this page; only use code you trust.</p>
        <button type="button" class="btn btn-secondary text-xs">Remove tool</button>`;
    entry.querySelector("button").addEventListener("click", () => entry.remove());
    document.getElementById("tool-list").appendChild(entry);
}

function readToolSettings() {
    const tools = new Map();
    for (const entry of document.querySelectorAll("#tool-list > .tool-entry")) {
        if (!entry.querySelector(".tool-enabled").checked) continue;
        let tool;
        if (entry.dataset.builtin) {
            tool = builtInTools[entry.dataset.builtin];
        } else {
            const name = entry.querySelector(".tool-name").value.trim();
            const description = entry.querySelector(".tool-description").value.trim();
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
                throw new Error("Tool names must start with a letter or underscore and contain only letters, numbers, or underscores.");
            }
            if (!description) throw new Error(`${name}: enter a description.`);
            let inputSchema, execute;
            try {
                inputSchema = JSON.parse(entry.querySelector(".tool-schema").value);
                if (!inputSchema || inputSchema.type !== "object") {
                    throw new Error('Input schema must have type "object".');
                }
                const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
                execute = new AsyncFunction("args", "signal",
                    '"use strict";\n' + entry.querySelector(".tool-implementation").value);
            } catch (error) {
                throw new Error(`${name}: ${error.message}`);
            }
            tool = { name, description, inputSchema, execute };
        }
        if (tools.has(tool.name)) throw new Error(`Duplicate enabled tool name: ${tool.name}`);
        tools.set(tool.name, tool);
    }
    if (tools.size && !supportsToolUse()) {
        throw new Error("Tool use is not available. Enable it in chrome://flags.");
    }
    return tools;
}

async function runTool(tool, args, signal) {
    signal.throwIfAborted();
    let abort;
    const cancellation = new Promise((resolve, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
    });
    try {
        return await Promise.race([
            Promise.resolve().then(() => tool.execute(args, signal)),
            cancellation
        ]);
    } finally {
        signal.removeEventListener("abort", abort);
    }
}

async function promptWithTools(model, input, options, tools, onText, onTool) {
    let text = "";
    while (true) {
        options.signal.throwIfAborted();
        const calls = [];
        let receivedContent = false;
        // Streaming yields text deltas and complete tool-call dictionaries, not prompt() arrays.
        for await (const content of model.promptStreaming(input, options)) {
            options.signal.throwIfAborted();
            receivedContent = true;
            if (typeof content === "string") {
                text += content;
                onText(text);
            } else if (content.type === "text" && typeof content.value === "string") {
                text += content.value;
                onText(text);
            } else if (content.type === "tool-call") {
                calls.push(content.value);
            } else {
                throw new Error("Unexpected tool-enabled response type: " + content.type);
            }
        }
        options.signal.throwIfAborted();
        if (!receivedContent) throw new Error("The tool-enabled stream returned no content.");
        if (!calls.length) return text;
        const results = [];
        for (const call of calls) {
            options.signal.throwIfAborted();
            onTool(call, { status: "Running" });
            let result;
            try {
                const tool = tools.get(call.name);
                if (!tool) throw new Error("This tool is not enabled in the current session.");
                const value = await runTool(tool, call.arguments ?? {}, options.signal);
                const json = JSON.stringify(value, (key, item) => {
                    if (["undefined", "function", "symbol"].includes(typeof item) ||
                        (typeof item === "number" && !Number.isFinite(item))) {
                        throw new Error("Tool result must be JSON-serializable.");
                    }
                    return item;
                });
                result = new window.LanguageModelToolSuccess({
                    callId: call.callId, name: call.name,
                    result: [{ type: "object", value: JSON.parse(json) }]
                });
                onTool(call, { status: "Completed", result: result.result[0].value });
            } catch (error) {
                if (options.signal.aborted) {
                    onTool(call, { status: "Stopped" });
                    options.signal.throwIfAborted();
                }
                console.error(`Tool ${call.name} failed:`, error);
                onTool(call, { status: "Failed", error: error.message });
                result = new window.LanguageModelToolError({
                    callId: call.callId, name: call.name, errorMessage: error.message
                });
            }
            results.push({ type: "tool-response", value: result });
        }
        input = [{ role: "user", content: results }];
    }
}
