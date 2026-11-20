const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function setup(supported = true) {
    const elements = {
        "tools-status": { textContent: "" },
        "tool-controls": { disabled: true }
    };
    let entries = [], locationCalls = 0;
    class ToolResult { constructor(value) { Object.assign(this, value); } }
    const context = vm.createContext({
        window: {
            LanguageModel: {},
            ...(supported ? {
                LanguageModelToolCall: ToolResult,
                LanguageModelToolSuccess: ToolResult,
                LanguageModelToolError: ToolResult
            } : {})
        },
        navigator: { geolocation: { getCurrentPosition(success, failure) {
            locationCalls++;
            failure({ message: "Location permission denied" });
        } } },
        document: {
            getElementById: id => elements[id],
            querySelectorAll: () => entries
        },
        console: { error() {} },
        getModelAvailability: async options => {
            assert.equal(options.expectedOutputs[1].type, "tool-call");
            return "available";
        }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "prompt-tools.js"), "utf8"), context);
    return {
        context, elements,
        setEntries: value => { entries = value; },
        locationCalls: () => locationCalls,
        builtin: name => vm.runInContext(`builtInTools.${name}`, context)
    };
}

function customEntry(name, schema = '{"type":"object"}', implementation = "return 42;") {
    const fields = {
        ".tool-enabled": { checked: true },
        ".tool-name": { value: name },
        ".tool-description": { value: "Example tool" },
        ".tool-schema": { value: schema },
        ".tool-implementation": { value: implementation }
    };
    return { dataset: {}, querySelector: selector => fields[selector] };
}

test("unsupported tool API shows flags guidance; no tools are configured by default", async () => {
    const state = setup(false);
    assert.equal(Object.keys(state.context.getToolSessionOptions()).length, 0);
    await state.context.initializeTools();
    assert.match(state.elements["tools-status"].textContent, /chrome:\/\/flags/);
    assert.equal(state.elements["tool-controls"].disabled, true);
});

test("capability check enables configuration without invoking location", async () => {
    const state = setup();
    await state.context.initializeTools();
    assert.equal(state.elements["tool-controls"].disabled, false);
    assert.equal(state.locationCalls(), 0);
    const options = state.context.getToolSessionOptions(new Map([["getTime", state.builtin("getTime")]]));
    assert.equal(options.expectedInputs[1].type, "tool-response");
    assert.equal(options.tools[0].name, "getTime");
    assert.equal("execute" in options.tools[0], false);
});

test("custom tools compile editable async bodies and reject invalid or duplicate declarations", async () => {
    const state = setup();
    state.setEntries([customEntry("answer")]);
    assert.equal(await state.context.readToolSettings().get("answer").execute({}), 42);
    state.setEntries([customEntry("answer", '{"type":"string"}')]);
    assert.throws(() => state.context.readToolSettings(), /type "object"/);
    state.setEntries([customEntry("answer"), customEntry("answer")]);
    assert.throws(() => state.context.readToolSettings(), /Duplicate/);
    state.setEntries([customEntry("answer", '{"type":"object"}', "return (;")]);
    assert.throws(() => state.context.readToolSettings(), /answer:/);
});

test("text streams before complete tool calls, with matching results and invocation details", async () => {
    const state = setup();
    const calls = [
        { type: "tool-call", value: { callId: "opaque-1", name: "getTime", arguments: null } },
        { type: "tool-call", value: { callId: "opaque-2", name: "answer", arguments: {} } }
    ];
    const tools = new Map([
        ["getTime", state.builtin("getTime")],
        ["answer", { execute: () => 42 }]
    ]);
    let turns = 0, rendered;
    const invocations = [];
    const model = { async *promptStreaming(input) {
        if (turns++ === 0) {
            yield "Checking ";
            assert.equal(rendered, "Checking ");
            yield "tools. ";
            yield* calls;
            assert.equal(invocations.length, 0);
            return;
        }
        assert.equal(input[0].role, "user");
        assert.equal(input[0].content[0].type, "tool-response");
        assert.equal(input[0].content[0].value.callId, "opaque-1");
        assert.match(input[0].content[0].value.result[0].value.time, /^\d{4}-/);
        assert.equal(input[0].content[1].value.result[0].value, 42);
        yield "The answer ";
        yield "is 42.";
    } };
    await state.context.promptWithTools(model, "Test", { signal: new AbortController().signal },
        tools, value => { rendered = value; }, (call, state) => invocations.push({ call, ...state }));
    assert.equal(rendered, "Checking tools. The answer is 42.");
    assert.equal(invocations[0].call.name, "getTime");
    assert.equal(invocations[0].status, "Running");
    assert.equal(invocations[3].call.callId, "opaque-2");
    assert.equal(invocations[3].status, "Completed");
    assert.equal(invocations[3].result, 42);
});

test("disabled tools are never executed and permission errors return tool errors", async () => {
    const state = setup();
    for (const enabled of [false, true]) {
        let turns = 0;
        const model = { async *promptStreaming(input) {
            if (turns++ === 0) {
                yield { type: "tool-call", value: { callId: "location-call", name: "getLocation", arguments: {} } };
                return;
            }
            const result = input[0].content[0].value;
            assert.equal(result.callId, "location-call");
            assert.match(result.errorMessage, enabled ? /permission denied/ : /not enabled/);
            yield "Location unavailable.";
        } };
        await state.context.promptWithTools(model, "Where am I?", { signal: new AbortController().signal },
            enabled ? new Map([["getLocation", state.builtin("getLocation")]]) : new Map(),
            () => {}, () => {});
    }
    assert.equal(state.locationCalls(), 1);
});

test("Stop cancels waiting for a custom tool that never resolves", async () => {
    const state = setup();
    const controller = new AbortController();
    const model = { async *promptStreaming() {
        yield { type: "tool-call", value: { name: "wait", callId: "wait-call", arguments: {} } };
    } };
    const statuses = [];
    const result = state.context.promptWithTools(model, "Wait", { signal: controller.signal },
        new Map([["wait", { execute: () => new Promise(() => {}) }]]),
        () => {}, (call, state) => statuses.push(state.status));
    await new Promise(setImmediate);
    controller.abort();
    await assert.rejects(result, { name: "AbortError" });
    assert.deepEqual(statuses, ["Running", "Stopped"]);
});
