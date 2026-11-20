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
    for (const file of chat ? ["prompt-api.js", "prompt-tools.js", "prompt.js"] : ["prompt-api.js"]) {
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
