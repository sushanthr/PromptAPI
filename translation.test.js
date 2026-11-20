const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { browserLanguage } = require("./translation.js");
const { PERF_SENTENCES, runTranslationBenchmark } = require("./translation-perf.js");

test("prefill is one Tamil paragraph with multiple sentences", () => {
    const { elements } = setup();
    const text = elements.get("translation-input").value;
    assert.match(text, /[\u0B80-\u0BFF]/);
    assert.doesNotMatch(text, /[\r\n]/);
    assert.ok(text.split(".").filter(sentence => sentence.trim()).length > 1);
});

function setup({ detectorAvailability = "available", pairAvailability = "available", detect, translate, translateStreaming } = {}) {
    const elements = new Map();
    const errors = [];
    let destroyed = 0;
    let detectorCreates = 0;
    for (const id of [
        "translation-input", "source-language", "target-language", "detection-status",
        "enable-detection", "translation-status", "translate-btn", "translate-label",
        "translation-result", "translation-output", "clear-text", "translation-form",
        "measure-perf", "perf-status", "perf-result", "perf-latency", "perf-cps",
        "perf-download", "perf-setup", "perf-summary", "perf-translations"
    ]) {
        const classes = new Set(["hidden"]);
        elements.set(id, {
            value: id === "source-language" ? "auto" : "",
            textContent: "", options: [], dataset: {}, events: {},
            classList: {
                add: name => classes.add(name),
                remove: name => classes.delete(name),
                contains: name => classes.has(name),
                toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }
            },
            add(option) { this.options.push(option); },
            addEventListener(name, callback) { this.events[name] = callback; },
            setAttribute() {},
            focus() {}
        });
    }
    elements.get("source-language").options.push({ value: "auto", textContent: "Detect automatically" });
    const context = vm.createContext({
        document: { getElementById: id => elements.get(id) },
        navigator: { language: "en-US", userActivation: { isActive: true } },
        window: {
            isSecureContext: true,
            addEventListener() {},
            LanguageDetector: {
                async availability() { return detectorAvailability; },
                async create() {
                    detectorCreates++;
                    return {
                        detect: detect || (async () => [
                            { detectedLanguage: "ta", confidence: 0.98 },
                            { detectedLanguage: "en", confidence: 0.02 }
                        ]),
                        destroy() {}
                    };
                }
            },
            Translator: {
                async availability() { return pairAvailability; },
                async create(options) {
                    options.monitor?.({ addEventListener(name, callback) {
                        assert.equal(name, "downloadprogress");
                        callback({ loaded: 0.5 });
                    } });
                    return {
                        translate: translate || (async text => `Translated: ${text}`),
                        translateStreaming,
                        destroy() { destroyed++; }
                    };
                }
            }
        },
        Intl, AbortController, setTimeout, clearTimeout, performance,
        Option: function(text, value) { this.textContent = text; this.value = value; },
        console: { error: (...args) => errors.push(args) }
    });
    for (const file of ["translation-perf.js", "translation.js"]) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), context);
    }
    return { elements, errors, destroyed: () => destroyed, detectorCreates: () => detectorCreates };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test("confidence appears in dropdown options without extra detected-language text", async () => {
    const state = setup();
    await settle();
    const source = state.elements.get("source-language");
    assert.match(source.options[0].textContent, /Tamil.*98%/);
    assert.match(source.options.find(option => option.value === "ta").textContent, /98%/);
    assert.match(source.options.find(option => option.value === "en").textContent, /2%/);
    assert.equal(state.elements.get("detection-status").textContent, "");
    assert.equal(state.elements.get("detection-status").classList.contains("hidden"), true);
    assert.equal(state.elements.get("translate-btn").disabled, false);
});

test("downloadable detection model waits for Install LID model click", async () => {
    const state = setup({ detectorAvailability: "downloadable" });
    await settle();
    assert.equal(state.detectorCreates(), 0);
    assert.equal(state.elements.get("enable-detection").classList.contains("hidden"), false);
    assert.equal(state.elements.get("translate-btn").disabled, true);
    state.elements.get("enable-detection").events.click();
    await settle();
    assert.equal(state.detectorCreates(), 1);
    assert.equal(state.elements.get("enable-detection").classList.contains("hidden"), true);
    assert.equal(state.elements.get("translate-btn").disabled, false);
});

test("unsupported detected pair stays disabled after detection completes", async () => {
    const state = setup({ pairAvailability: "unavailable" });
    await settle();
    assert.equal(state.elements.get("translate-btn").disabled, true);
    assert.match(state.elements.get("translation-status").textContent, /not supported/);
});

test("downloadable language pair changes the action label until the pack is ready", async () => {
    const state = setup({ pairAvailability: "downloadable" });
    await settle();
    assert.equal(state.elements.get("translate-label").textContent, "Download language pack");
    assert.equal(state.elements.get("translation-status").textContent, "");
    assert.equal(state.elements.get("translate-btn").disabled, false);
    await state.elements.get("translation-form").events.submit({ preventDefault() {} });
    assert.equal(state.elements.get("translate-label").textContent, "Translate");
    assert.match(state.elements.get("translation-output").textContent, /^Translated:/);
});

test("manual source selection is not overwritten by a pending detection", async () => {
    let finish;
    const state = setup({ detect: () => new Promise(resolve => { finish = resolve; }) });
    await settle();
    const source = state.elements.get("source-language");
    source.value = "fr";
    source.events.change();
    finish([{ detectedLanguage: "ta", confidence: 1 }]);
    await settle();
    assert.equal(source.value, "fr");
    assert.equal(source.options[0].textContent, "Detect automatically");
    assert.equal(state.elements.get("detection-status").textContent, "");
});

test("clearing text cancels pending translation and does not display stale output", async () => {
    let finish;
    const state = setup({ translate: () => new Promise(resolve => { finish = resolve; }) });
    await settle();
    const pending = state.elements.get("translation-form").events.submit({ preventDefault() {} });
    await settle();
    state.elements.get("clear-text").events.click();
    finish("Stale translation");
    await pending;
    assert.equal(state.elements.get("translation-output").textContent, "");
    assert.equal(state.elements.get("translation-result").classList.contains("hidden"), true);
    assert.equal(state.elements.get("translate-btn").disabled, true);
    assert.equal(state.destroyed(), 1);
});

test("translation failure is surfaced and translator resources are released", async () => {
    const state = setup({ translate: async () => { throw new Error("Pack failed"); } });
    await settle();
    await state.elements.get("translation-form").events.submit({ preventDefault() {} });
    assert.match(state.elements.get("translation-status").textContent, /Pack failed/);
    assert.equal(state.elements.get("translation-status").dataset.error, "true");
    assert.equal(state.destroyed(), 1);
    assert.equal(state.errors.length, 1);
});

test("destination follows browser language and preserves Chinese script", () => {
    for (const [browser, expected] of [
        ["en-US", "en"], ["ta-IN", "ta"], ["fr-CA", "fr"],
        ["zh-TW", "zh-Hant"], ["zh-HK", "zh-Hant"],
        ["zh-Hant-CN", "zh-Hant"], ["zh-Hans-CN", "zh-Hans"],
        ["zh-CN", "zh"], ["", "en"], [undefined, "en"],
        ["invalid_locale", "en"], ["zxx", "en"]
    ]) {
        assert.equal(browserLanguage(browser), expected, browser);
    }
});

function benchmarkApi({ downloadable = false, failAt = 0, empty = false, slowAt = 0 } = {}) {
    let time = 0;
    const calls = [];
    let creates = 0;
    let destroys = 0;
    const api = {
        async availability(options) {
            assert.deepEqual(options, { sourceLanguage: "en", targetLanguage: "zh-Hans" });
            time += 5;
            return downloadable ? "downloadable" : "available";
        },
        async create(options) {
            creates++;
            assert.equal(options.sourceLanguage, "en");
            assert.equal(options.targetLanguage, "zh-Hans");
            if (options.monitor) {
                options.monitor({ addEventListener(name, callback) {
                    assert.equal(name, "downloadprogress");
                    callback({ loaded: 0.5 });
                    callback({ loaded: 1 });
                } });
                time += 1000;
            } else {
                time += 20;
            }
            return {
                async *translateStreaming(text, { signal }) {
                    calls.push(text);
                    time += 10;
                    if (calls.length === slowAt) time += 40;
                    yield "";
                    signal.throwIfAborted();
                    if (calls.length === failAt) throw new Error("Stream failed");
                    time += 5;
                    if (!empty) yield "\u4f60";
                    time += 15;
                    if (!empty) yield "\u597d\u{1F600}";
                    time += 10;
                },
                destroy() { destroys++; }
            };
        }
    };
    return { api, calls, now: () => time, creates: () => creates, destroys: () => destroys };
}

test("benchmark translates exactly 100 distinct English sentences and measures first nonempty chunk and aggregate Unicode CPS", async () => {
    const state = benchmarkApi({ slowAt: 2 });
    const metrics = await runTranslationBenchmark(state.api, PERF_SENTENCES, {
        signal: new AbortController().signal, now: state.now
    });
    assert.equal(state.calls.length, 100);
    assert.equal(new Set(state.calls).size, 100);
    assert.ok(state.calls.every(sentence => /^[A-Za-z].*\.$/.test(sentence)));
    assert.equal(metrics.sentenceCount, 100);
    assert.equal(metrics.initialInputCharacters, PERF_SENTENCES[0].length);
    assert.equal(metrics.initialLatencyMs, 15);
    assert.equal(metrics.outputCharacters, 300);
    assert.equal(metrics.translationMs, 4040);
    assert.equal(metrics.averageCps, 300000 / 4040);
    assert.equal(metrics.setupMs, 25);
    assert.equal(metrics.downloadMs, 0);
    assert.equal(state.destroys(), 1);
});

test("download provisioning and setup are measured separately and excluded from latency and CPS", async () => {
    const state = benchmarkApi({ downloadable: true });
    const progress = [];
    const metrics = await runTranslationBenchmark(state.api, PERF_SENTENCES, {
        signal: new AbortController().signal,
        now: state.now,
        canDownload: () => true,
        onDownloadProgress: percent => progress.push(percent),
        onProgress: () => {}
    });
    assert.equal(metrics.downloadMs, 1000);
    assert.equal(metrics.setupMs, 25);
    assert.equal(metrics.initialLatencyMs, 15);
    assert.equal(metrics.averageCps, 75);
    assert.deepEqual(progress, [50, 100]);
    assert.equal(state.creates(), 2);
    assert.equal(state.destroys(), 2);
});

test("benchmark failure does not produce partial success metrics and releases its translator", async () => {
    const state = benchmarkApi({ failAt: 3 });
    await assert.rejects(runTranslationBenchmark(state.api, PERF_SENTENCES, {
        signal: new AbortController().signal, now: state.now
    }), /Stream failed/);
    assert.equal(state.calls.length, 3);
    assert.equal(state.destroys(), 1);
});

test("benchmark cancellation stops between sentences and releases the translator", async () => {
    const state = benchmarkApi();
    const controller = new AbortController();
    await assert.rejects(runTranslationBenchmark(state.api, PERF_SENTENCES, {
        signal: controller.signal, now: state.now,
        onProgress: message => { if (message.includes("sentence 3 ")) controller.abort(); }
    }), { name: "AbortError" });
    assert.equal(state.destroys(), 1);
    assert.ok(state.calls.length < 100);
});

test("benchmark reports empty streams and missing streaming support instead of fabricated latency", async () => {
    const state = benchmarkApi({ empty: true });
    await assert.rejects(runTranslationBenchmark(state.api, PERF_SENTENCES, {
        signal: new AbortController().signal, now: state.now
    }), /empty translation/);
    assert.equal(state.destroys(), 1);
    const ui = setup();
    await settle();
    await ui.elements.get("measure-perf").events.click();
    assert.match(ui.elements.get("perf-status").textContent, /translateStreaming/);
    assert.equal(ui.elements.get("perf-result").classList.contains("hidden"), true);
    assert.equal(ui.elements.get("perf-status").dataset.error, "true");
    assert.equal(ui.elements.get("translation-input").disabled, false);
});

test("Measure Perf reports metrics without changing editor text or language selections", async () => {
    const ui = setup({ translateStreaming: async function*(text) {
        await new Promise(resolve => setImmediate(resolve));
        yield "\u4f60\u597d";
    } });
    await settle();
    const input = ui.elements.get("translation-input");
    const source = ui.elements.get("source-language");
    const target = ui.elements.get("target-language");
    const original = [input.value, source.value, target.value];
    const pending = ui.elements.get("measure-perf").events.click();
    assert.equal(input.disabled, true);
    assert.equal(ui.elements.get("measure-perf").textContent, "Stop Perf");
    await pending;
    assert.deepEqual([input.value, source.value, target.value], original);
    assert.equal(input.disabled, false);
    assert.equal(ui.elements.get("perf-result").classList.contains("hidden"), false);
    assert.match(ui.elements.get("perf-latency").textContent, /ms for \d+ input characters/);
    assert.match(ui.elements.get("perf-cps").textContent, /chars\/s/);
    assert.match(ui.elements.get("perf-summary").textContent, /100 sentences/);
    assert.equal(ui.elements.get("perf-translations").textContent.split("\n\n").length, 100);
});
