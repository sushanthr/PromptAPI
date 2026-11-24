const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function setup(availability, chat = false) {
    const elements = new Map();
    for (const id of ["model-status", "model-icon", "download-btn"]) {
        const classes = new Set(["hidden"]);
        elements.set(id, {
            textContent: "",
            classList: {
                toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
                add(name) { classes.add(name); },
                remove(name) { classes.delete(name); },
                contains(name) { return classes.has(name); }
            },
            set innerText(value) { this.textContent = value; }
        });
    }
    let progress, finish, fail, destroyed = 0;
    const errors = [];
    const model = {
        prototype: {},
        async availability() { return availability; },
        create(options) {
            options.monitor({ addEventListener(name, callback) {
                assert.equal(name, "downloadprogress");
                progress = callback;
            } });
            return new Promise((resolve, reject) => {
                finish = () => resolve({ destroy() { destroyed++; } });
                fail = reject;
            });
        }
    };
    const context = vm.createContext({
        window: { LanguageModel: model, addEventListener() {} },
        document: { getElementById: id => elements.get(id) },
        console: { error: (...args) => errors.push(args) },
        localStorage: { getItem() { return null; }, setItem() {} },
        AbortController
    });
    for (const file of chat ? ["prompt-api.js", "prompt-tools.js", "watermark.js", "prompt.js"] : ["prompt-api.js"]) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), context);
    }
    return {
        context, elements, errors,
        progress: event => progress(event),
        finish: () => finish(),
        fail: error => fail(error),
        destroyed: () => destroyed
    };
}

test("benchmark download button reports progress and releases its session", async () => {
    const state = setup("downloadable");
    await state.context.initializeModelStatus({});
    const button = state.elements.get("download-btn");
    assert.equal(button.classList.contains("hidden"), false);
    const download = button.onclick();
    assert.equal(button.classList.contains("hidden"), true);
    state.progress({ loaded: 37, total: 100 });
    assert.equal(state.elements.get("model-status").textContent, "Model: Downloading 37%");
    state.progress({ loaded: 0.6 });
    assert.equal(state.elements.get("model-status").textContent, "Model: Downloading 60%");
    state.finish();
    await download;
    assert.equal(state.destroyed(), 1);
    assert.equal(state.elements.get("model-status").textContent, "Model: Available");
});

test("benchmark initialization joins an existing download instead of polling", async () => {
    const state = setup("downloading");
    const initialization = state.context.initializeModelStatus({});
    await new Promise(setImmediate);
    assert.equal(state.elements.get("model-status").textContent,
        "Model: Downloading (waiting for progress)");
    state.progress({ loaded: 0.42, total: 1 });
    assert.equal(state.elements.get("model-status").textContent, "Model: Downloading 42%");
    state.finish();
    await initialization;
    assert.equal(state.destroyed(), 1);
});

test("failed downloads show the error and allow retrying", async () => {
    const state = setup("downloadable");
    await state.context.initializeModelStatus({});
    const download = state.elements.get("download-btn").onclick();
    state.fail(new Error("Network disconnected"));
    await download;
    assert.equal(state.elements.get("model-status").textContent, "Download failed: Network disconnected");
    assert.equal(state.elements.get("download-btn").classList.contains("hidden"), false);
    assert.equal(state.errors.length, 1);
});

test("Chat initialization monitors an existing download and retains the session", async () => {
    const state = setup("downloading", true);
    const initialization = state.context.initialize();
    await new Promise(setImmediate);
    assert.equal(state.elements.get("model-status").textContent,
        "Model: Downloading (waiting for progress)");
    state.progress({ loaded: 0.73, total: 1 });
    assert.equal(state.elements.get("model-status").textContent, "Model: Downloading 73%");
    state.finish();
    await initialization;
    assert.equal(state.elements.get("model-status").textContent, "Model: Available");
    assert.equal(state.destroyed(), 0);
    assert.ok(state.context.session);
});

test("JSON and Regex fields create distinct constraints without implicit fallback", () => {
    const { context } = setup("available", true);
    assert.equal(context.getResponseConstraint('{"type":"object"}', "").type, "object");
    assert.equal(context.getResponseConstraint("", "^[A-Z]$").source, "^[A-Z]$");
    assert.equal(context.getResponseConstraint("", ""), null);
    assert.throws(() => context.getResponseConstraint("not JSON", ""), /JSON/);
    assert.throws(() => context.getResponseConstraint("", "["), /regular expression/i);
    assert.throws(() => context.getResponseConstraint('{"type":"object"}', ".*"), /not both/);
});

test("clearing the chat releases conversation context, restores the empty state and resets metrics", () => {
    const state = setup("available", true);
    const output = {
        scrollTop: 100,
        children: [{ id: "old-message" }],
        replaceChildren(...children) { this.children = children; }
    };
    state.elements.set("chat-output", output);
    for (const id of ["chars-per-sec", "tokens-per-sec", "start-latency", "watermark-count"]) {
        state.elements.set(id, { textContent: "99" });
    }
    let destroyed = 0;
    state.context.session = { destroy() { destroyed++; } };
    vm.runInContext('watermarkCounter.update("\\u200B\\u034F\\u2060\\u200B");', state.context);
    vm.runInContext('chatEmptyState = { cloneNode() { return { id: "chat-empty-state" }; } };', state.context);
    state.context.clearChat();
    assert.equal(destroyed, 1);
    assert.equal(state.context.session, null);
    assert.equal(output.children.length, 1);
    assert.equal(output.children[0].id, "chat-empty-state");
    assert.equal(output.scrollTop, 0);
    for (const id of ["chars-per-sec", "tokens-per-sec", "start-latency", "watermark-count"]) {
        assert.equal(state.elements.get(id).textContent, "0");
    }
});

test("watermark counts accumulate across responses without recounting streamed prefixes", () => {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(__dirname, "watermark.js"), "utf8"), context);
    const counter = context.createWatermarkCounter();
    const watermark = "\u200B\u034F\u2060\u200B";
    const text = `First ${watermark} second ${watermark}${watermark}`;
    counter.startResponse();
    for (let end = 1; end <= text.length; end++) {
        assert.equal(counter.update(text.slice(0, end)),
            [text.indexOf(watermark) + 4, text.indexOf(watermark, 10) + 4, text.length]
                .filter(position => position <= end).length);
    }
    assert.equal(counter.update(text), 3);
    counter.startResponse();
    assert.equal(counter.update("No watermark \u200B\u2060\u034F\u200B"), 3);
    counter.startResponse();
    assert.equal(counter.update(watermark), 4);
    counter.reset();
    assert.equal(counter.update(""), 0);
    assert.equal(counter.update(watermark), 1);
});

test("chat rendering counts raw model output cumulatively, including split sequences", () => {
    const state = setup("available", true);
    for (const id of ["watermark-count", "chars-per-sec", "tokens-per-sec", "start-latency"]) {
        state.elements.set(id, { textContent: "" });
    }
    state.context.marked = { parse() { return "<p>Rendered output without watermark</p>"; } };
    vm.runInContext('updateElement = { innerText: "Rendered output" }; startTime = Date.now();', state.context);
    const output = { scrollHeight: 100 };
    const watermark = "\u200B\u034F\u2060\u200B";
    state.context.renderStreamedText(watermark.slice(0, 3), output);
    assert.equal(state.elements.get("watermark-count").textContent, 0);
    state.context.renderStreamedText(watermark, output);
    state.context.renderStreamedText(`${watermark} more text`, output);
    assert.equal(state.elements.get("watermark-count").textContent, 1);
    vm.runInContext("watermarkCounter.startResponse();", state.context);
    state.context.renderStreamedText(watermark + watermark, output);
    assert.equal(state.elements.get("watermark-count").textContent, 3);
});

test("writing assistance counts raw streaming and plain-text output and resets on clear", async () => {
    const state = setup("available");
    for (const id of ["watermark-count", "processing-time", "input-chars", "output-chars", "input-text"]) {
        state.elements.set(id, { textContent: "", value: "" });
    }
    state.elements.set("output-content", {
        classList: { remove() {}, toggle() {} }, textContent: "", innerHTML: ""
    });
    state.context.marked = { parse() { return "<p>Formatted output</p>"; } };
    for (const file of ["watermark.js", "task_api.js"]) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), state.context);
    }
    const watermark = "\u200B\u034F\u2060\u200B";
    state.context.renderOutput(watermark.slice(0, 2), "markdown");
    assert.equal(state.elements.get("watermark-count").textContent, 0);
    state.context.renderOutput(watermark, "markdown");
    state.context.renderOutput(watermark, "markdown");
    assert.equal(state.elements.get("watermark-count").textContent, 1);
    state.elements.get("input-text").value = watermark;
    state.elements.set("sum-context", { value: "" });
    const streaming = { checked: true };
    state.elements.set("streaming-checkbox", streaming);
    state.context.testSession = {
        async *summarizeStreaming() {
            yield watermark.slice(0, 2);
            yield watermark.slice(2);
            yield watermark;
        },
        async summarize() { return watermark; }
    };
    vm.runInContext(`
        taskModels.summarizer.getConfig = () => ({ format: "plain-text" });
        createTaskSession = async () => testSession;
        setBusy = () => {};
    `, state.context);
    await state.context.processText();
    assert.equal(state.elements.get("watermark-count").textContent, 3);
    streaming.checked = false;
    await state.context.processText();
    assert.equal(state.elements.get("watermark-count").textContent, 4);
    state.context.clearContent();
    assert.equal(state.elements.get("watermark-count").textContent, "0");
    state.context.renderOutput(watermark, "plain-text");
    assert.equal(state.elements.get("watermark-count").textContent, 1);
});
