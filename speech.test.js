const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup({ availability = async () => "available", install = async () => true,
    getUserMedia, local = true, secure = true, startError } = {}) {
    const elements = new Map();
    const errors = [];
    const recognitions = [];
    const contexts = [];
    const streams = [];
    const revoked = [];
    const calls = { available: [], install: [] };
    function element() {
        const classes = new Set();
        return {
            value: "", textContent: "", dataset: {}, style: {}, files: [],
            events: {}, attributes: {}, children: [], disabled: false,
            classList: {
                toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
                contains: name => classes.has(name)
            },
            addEventListener(name, callback) { this.events[name] = callback; },
            setAttribute(name, value) { this.attributes[name] = value; },
            removeAttribute(name) { delete this[name]; },
            replaceChildren(...children) { this.children = children; },
            async play() { this.played = true; },
            pause() { this.paused = true; },
            load() {}
        };
    }
    for (const id of [
        "input-language", "audio-source", "media-file", "media-preview",
        "start", "stop", "reset", "speech-status", "final-transcript",
        "interim-transcript", "audio-meter", "audio-meter-bar", "audio-meter-hint",
        "audio-file-row", "on-device", "recognition-mode-label"
    ]) elements.set(id, element());
    elements.get("input-language").value = "en-US";
    elements.get("audio-source").value = "microphone";
    elements.get("on-device").checked = true;
    function stream() {
        const track = { stopped: false, stop() { this.stopped = true; } };
        const result = { getTracks: () => [track], getAudioTracks: () => [track], track };
        streams.push(result);
        return result;
    }
    class Recognition {
        constructor() { recognitions.push(this); }
        start(track) {
            if (startError) throw new Error(startError);
            this.track = track;
        }
        stop() { this.stopped = true; }
        abort() { this.aborted = true; this.onend?.(); }
        static async available(options) {
            calls.available.push(options);
            return availability();
        }
        static async install(options) {
            calls.install.push(options);
            return install();
        }
    }
    if (local) Recognition.prototype.processLocally = false;
    else {
        Recognition.available = undefined;
        Recognition.install = undefined;
    }
    const node = () => ({ connect() {} });
    class AudioContext {
        constructor() { contexts.push(this); this.destination = node(); }
        async resume() {}
        async close() { this.closed = true; }
        createAnalyser() {
            return { fftSize: 256, getByteTimeDomainData(samples) { samples.fill(160); } };
        }
        createMediaStreamSource() { return node(); }
        createMediaElementSource() { return node(); }
        createMediaStreamDestination() { return { stream: stream() }; }
    }
    let nextFrame = 0;
    const frames = new Map();
    const context = vm.createContext({
        document: { getElementById: id => elements.get(id), createElement: () => element() },
        window: {
            SpeechRecognition: Recognition, AudioContext, isSecureContext: secure,
            events: {}, addEventListener(name, callback) { this.events[name] = callback; }
        },
        navigator: { mediaDevices: { getUserMedia: getUserMedia || (async () => stream()) } },
        URL: { createObjectURL: () => "blob:test", revokeObjectURL: url => revoked.push(url) },
        Uint8Array,
        requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
        cancelAnimationFrame(id) { frames.delete(id); },
        console: { error: (...args) => errors.push(args) }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "speech.js"), "utf8"), context);
    return {
        elements, errors, recognitions, contexts, streams, calls, revoked, frames,
        window: context.window,
        click: id => elements.get(id).events.click(),
        change: id => elements.get(id).events.change()
    };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test("local-only support and secure context are required without cloud fallback", () => {
    for (const options of [{ local: false }, { secure: false }]) {
        const state = setup(options);
        assert.equal(state.elements.get("start").disabled, true);
        assert.equal(state.elements.get("speech-status").dataset.error, "true");
        assert.equal(state.recognitions.length, 0);
    }
});

test("cloud mode bypasses local model setup and explicitly selects remote recognition", async () => {
    const state = setup({ availability: async () => { throw new Error("Must not check local models"); } });
    state.elements.get("on-device").checked = false;
    state.change("on-device");
    assert.match(state.elements.get("speech-status").textContent, /sends audio/);
    await state.click("start");
    assert.equal(state.recognitions[0].processLocally, false);
    assert.equal(state.calls.available.length, 0);
    assert.equal(state.calls.install.length, 0);
    assert.equal(state.elements.get("on-device").disabled, true);
    await state.recognitions[0].onstart();
    assert.match(state.elements.get("speech-status").textContent, /cloud mode/);
    state.click("stop");
    state.recognitions[0].onend();
    assert.equal(state.elements.get("on-device").disabled, false);
    state.elements.get("on-device").checked = true;
    state.change("on-device");
    assert.match(state.elements.get("speech-status").textContent, /language model/);
});

test("cloud mode works without local API extensions but still requires a secure context", async () => {
    for (const secure of [true, false]) {
        const state = setup({ local: false, secure });
        state.elements.get("on-device").checked = false;
        state.change("on-device");
        assert.equal(state.elements.get("start").disabled, !secure);
        await state.click("start");
        assert.equal(state.recognitions.length, secure ? 1 : 0);
        assert.equal(state.calls.available.length, 0);
        if (secure) state.click("reset");
    }
});

test("reset preserves cloud selection and file status describes remote processing", () => {
    const state = setup();
    state.elements.get("on-device").checked = false;
    state.change("on-device");
    state.elements.get("audio-source").value = "file";
    state.change("audio-source");
    state.elements.get("media-file").files = [{ type: "audio/wav" }];
    state.change("media-file");
    assert.match(state.elements.get("speech-status").textContent, /send audio/);
    state.click("reset");
    assert.equal(state.elements.get("on-device").checked, false);
    assert.match(state.elements.get("speech-status").textContent, /Cloud mode sends audio/);
});

test("microphone recognition streams interim/final text and Stop retains final results", async () => {
    const state = setup();
    await state.click("start");
    const recognition = state.recognitions[0];
    assert.equal(recognition.processLocally, true);
    assert.equal(recognition.continuous, true);
    assert.equal(recognition.interimResults, true);
    assert.equal(recognition.track, state.streams[0].track);
    await recognition.onstart();
    const final = Object.assign([{ transcript: "Hello" }], { isFinal: true });
    const interim = Object.assign([{ transcript: "world" }], { isFinal: false });
    recognition.onresult({ results: [final, interim] });
    assert.equal(state.elements.get("final-transcript").textContent, "Hello ");
    assert.equal(state.elements.get("interim-transcript").textContent, "world");
    const [frameID, draw] = [...state.frames.entries()][0];
    state.frames.delete(frameID);
    draw(300);
    assert.ok(Number(state.elements.get("audio-meter").attributes["aria-valuenow"]) > 0);
    state.click("stop");
    assert.equal(recognition.stopped, true);
    assert.equal(state.elements.get("start").disabled, true);
    recognition.onend();
    assert.equal(state.elements.get("final-transcript").textContent, "Hello ");
    assert.equal(state.elements.get("interim-transcript").textContent, "");
    assert.equal(state.streams[0].track.stopped, true);
    assert.equal(state.contexts[0].closed, true);
    assert.equal(state.frames.size, 0);
    assert.equal(state.elements.get("audio-meter-bar").style.width, "0%");
    assert.equal(state.elements.get("start").disabled, false);
});

test("model installation is local and failures are shown before audio capture", async () => {
    const state = setup({ availability: async () => "downloadable", install: async () => false });
    await state.click("start");
    assert.deepEqual(JSON.parse(JSON.stringify(state.calls.install)), [
        { langs: ["en-US"], processLocally: true }
    ]);
    assert.equal(state.streams.length, 0);
    assert.match(state.elements.get("speech-status").textContent, /installation failed/);
    assert.equal(state.errors.length, 1);
    assert.equal(state.contexts[0].closed, true);
});

test("Reset during installation prevents late recognition from starting", async () => {
    let finishInstall;
    const state = setup({
        availability: async () => "downloadable",
        install: () => new Promise(resolve => { finishInstall = resolve; })
    });
    const pending = state.click("start");
    await settle();
    state.click("reset");
    finishInstall(true);
    await pending;
    assert.equal(state.recognitions[0].track, undefined);
    assert.equal(state.streams.length, 0);
    assert.equal(state.contexts[0].closed, true);
    assert.equal(state.elements.get("final-transcript").textContent, "");
});

test("downloadable models install successfully and repeated results do not duplicate text", async () => {
    const state = setup({ availability: async () => "downloadable" });
    await state.click("start");
    assert.equal(state.calls.install.length, 1);
    const final = Object.assign([{ transcript: "First" }], { isFinal: true });
    const recognition = state.recognitions[0];
    recognition.onresult({ results: [final] });
    recognition.onresult({ results: [final] });
    assert.equal(state.elements.get("final-transcript").textContent, "First ");
    state.click("stop");
    recognition.onend();
    await state.click("start");
    const second = Object.assign([{ transcript: "Second" }], { isFinal: true });
    state.recognitions[1].onresult({ results: [second] });
    assert.equal(state.elements.get("final-transcript").textContent, "First Second ");
    state.recognitions[1].onerror({ error: "not-allowed" });
    assert.match(state.elements.get("speech-status").textContent, /permission was denied/);
    assert.equal(state.streams[1].track.stopped, true);
});

test("Stop during microphone permission releases a late stream", async () => {
    let allow;
    const track = { stopped: false, stop() { this.stopped = true; } };
    const state = setup({ getUserMedia: () => new Promise(resolve => { allow = resolve; }) });
    const pending = state.click("start");
    await settle();
    state.click("stop");
    allow({ getTracks: () => [track], getAudioTracks: () => [track] });
    await pending;
    assert.equal(track.stopped, true);
    assert.equal(state.recognitions[0].track, undefined);
    assert.equal(state.elements.get("start").disabled, false);
});

test("file input creates a track, plays only after recognition starts, and ends gracefully", async () => {
    const state = setup();
    state.elements.get("audio-source").value = "file";
    state.change("audio-source");
    assert.equal(state.elements.get("start").disabled, true);
    state.elements.get("media-file").files = [{ type: "audio/wav" }];
    state.change("media-file");
    await state.click("start");
    const media = state.elements.get("media-preview").children[0];
    const recognition = state.recognitions[0];
    assert.equal(media.played, undefined);
    await recognition.onstart();
    assert.equal(media.played, true);
    media.onended();
    assert.equal(recognition.stopped, true);
    recognition.onend();
    await state.click("start");
    assert.notEqual(state.elements.get("media-preview").children[0], media);
    state.click("reset");
    assert.equal(state.streams.every(stream => stream.track.stopped), true);
    assert.equal(state.elements.get("media-preview").children.length, 0);
    assert.deepEqual(state.revoked, ["blob:test"]);
});

test("Stop before onstart does not restart file playback", async () => {
    const state = setup();
    state.elements.get("audio-source").value = "file";
    state.change("audio-source");
    state.elements.get("media-file").files = [{ type: "video/mp4" }];
    state.change("media-file");
    await state.click("start");
    state.click("stop");
    await state.recognitions[0].onstart();
    assert.equal(state.elements.get("media-preview").children[0].played, undefined);
    assert.match(state.elements.get("speech-status").textContent, /Stopping/);
    state.recognitions[0].onend();
});

test("recognition failures preserve error status and release resources", async () => {
    const state = setup({ startError: "Audio track recognition is unsupported" });
    await state.click("start");
    assert.match(state.elements.get("speech-status").textContent, /Audio track recognition is unsupported/);
    assert.equal(state.elements.get("speech-status").dataset.error, "true");
    assert.equal(state.streams[0].track.stopped, true);
    assert.equal(state.elements.get("start").disabled, false);
});

test("leaving the page releases microphone resources", async () => {
    const state = setup();
    await state.click("start");
    state.window.events.pagehide();
    assert.equal(state.recognitions[0].aborted, true);
    assert.equal(state.streams[0].track.stopped, true);
    assert.equal(state.contexts[0].closed, true);
});
