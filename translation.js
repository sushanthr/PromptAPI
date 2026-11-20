const TAMIL_SAMPLE_TEXT = "இன்று காலை எங்கள் ஊரில் மென்மையான மழை பெய்தது. மழை நின்றதும் பூங்காவுக்குச் சென்று சிறிது நேரம் நடந்தேன். மரங்களின் இலைகளில் நீர்த்துளிகள் மின்னின, பறவைகள் இனிமையாகப் பாடின. வீட்டிற்குத் திரும்பிய பிறகு குடும்பத்தினருடன் காலை உணவு சாப்பிட்டேன். அமைதியான இந்தக் காலை எனக்குப் புத்துணர்ச்சியையும் மகிழ்ச்சியையும் அளித்தது.";

const LANGUAGE_CODES = ("aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu zh-Hans zh-Hant").split(" ");

function browserLanguage(language) {
    if (!language) return "en";
    try {
        const locale = new Intl.Locale(language);
        if (locale.language === "zh" && (locale.script === "Hant" || ["TW", "HK", "MO"].includes(locale.region))) return "zh-Hant";
        if (locale.language === "zh" && locale.script === "Hans") return "zh-Hans";
        return LANGUAGE_CODES.includes(locale.language) ? locale.language : "en";
    } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        return "en";
    }
}

function initializeTranslation() {
    const input = document.getElementById("translation-input");
    const source = document.getElementById("source-language");
    const target = document.getElementById("target-language");
    const detectionStatus = document.getElementById("detection-status");
    const enableDetection = document.getElementById("enable-detection");
    const status = document.getElementById("translation-status");
    const translateButton = document.getElementById("translate-btn");
    const translateLabel = document.getElementById("translate-label");
    const result = document.getElementById("translation-result");
    const output = document.getElementById("translation-output");
    const perfButton = document.getElementById("measure-perf");
    const perfStatus = document.getElementById("perf-status");
    const perfResult = document.getElementById("perf-result");
    let perfController = null;
    const names = new Intl.DisplayNames([navigator.language || "en"], { type: "language" });
    const languageName = code => `${names.of(code)} (${code})`;
    const languages = LANGUAGE_CODES.map(code => ({ code, label: languageName(code) }))
        .sort((a, b) => a.label.localeCompare(b.label, navigator.language || "en"));
    for (const { code, label } of languages) {
        source.add(new Option(label, code));
        target.add(new Option(label, code));
    }
    target.value = browserLanguage(navigator.language);
    input.value = TAMIL_SAMPLE_TEXT;

    let detectedLanguage = "";
    let detector = null;
    let detectorPromise = null;
    const detectorLifetime = new AbortController();
    let detectionController = null;
    let translationController = null;
    let revision = 0;
    let detectionTimer = null;
    let busy = false;
    let pairAvailability = null;
    let busyLabel = "Translating...";

    function showStatus(message, error = false) {
        status.textContent = message;
        status.dataset.error = String(error);
    }

    function showDetectionStatus(message = "") {
        detectionStatus.textContent = message;
        detectionStatus.classList.toggle("hidden", !message);
    }

    function resetConfidence() {
        source.options[0].textContent = "Detect automatically";
        for (const option of [...source.options].slice(1)) {
            option.textContent = languageName(option.value);
        }
    }

    function sourceLanguage() {
        return source.value === "auto" ? detectedLanguage : source.value;
    }

    function updateButton() {
        translateButton.disabled = busy || Boolean(perfController) || !input.value.trim() || !sourceLanguage() ||
            sourceLanguage() === target.value || pairAvailability === "unavailable" || !window.Translator;
        translateLabel.textContent = busy ? busyLabel :
            ["downloadable", "downloading"].includes(pairAvailability) ? "Download language pack" : "Translate";
        result.setAttribute("aria-busy", String(busy));
        perfButton.disabled = busy || !window.Translator || !window.isSecureContext;
        perfButton.textContent = perfController ? "Stop Perf" : "Measure Perf";
        perfResult.setAttribute("aria-busy", String(Boolean(perfController)));
        for (const control of [input, source, target, enableDetection, document.getElementById("clear-text")]) {
            control.disabled = Boolean(perfController);
        }
    }

    function monitorDownload(write, label, signal) {
        return monitor => monitor.addEventListener("downloadprogress", event => {
            if (!signal.aborted) write(`${label}: ${Math.round(event.loaded * 100)}%`);
        });
    }

    async function checkPair() {
        const current = revision;
        updateButton();
        if (!window.isSecureContext) {
            showStatus("Translation requires HTTPS or localhost.", true);
            return;
        }
        if (!window.Translator) {
            showStatus("Translator API is not available. Use a supporting browser and enable the API if required.", true);
            return;
        }
        if (!input.value.trim()) {
            showStatus("Enter text to translate.");
            return;
        }
        const sourceCode = sourceLanguage();
        if (!sourceCode) {
            showStatus("Detect the source language or select it manually.");
            return;
        }
        if (sourceCode === target.value) {
            showStatus("Choose a different destination language.", true);
            translateButton.disabled = true;
            return;
        }
        showStatus("Checking language packs...");
        try {
            const availability = await window.Translator.availability({ sourceLanguage: sourceCode, targetLanguage: target.value });
            if (current !== revision || busy) return;
            pairAvailability = availability;
            if (availability === "unavailable") {
                showStatus("This language pair is not supported by your browser. Choose another language.", true);
            } else {
                showStatus(availability === "available" ? "Ready to translate." : "");
            }
            updateButton();
        } catch (error) {
            if (current !== revision) return;
            console.error("Translation availability failed:", error);
            showStatus(`Could not check language packs: ${error.message}`, true);
        }
    }

    async function getDetector(allowDownload) {
        if (detector) return detector;
        if (detectorPromise) return detectorPromise;
        if (!window.LanguageDetector) throw new Error("LanguageDetector API is not available. Select the source language manually.");
        const availability = await window.LanguageDetector.availability();
        if (availability === "unavailable") throw new Error("Language detection is unavailable. Select the source language manually.");
        if (availability !== "available" && !allowDownload) {
            enableDetection.classList.remove("hidden");
            showDetectionStatus();
            return null;
        }
        if (availability !== "available" && !navigator.userActivation.isActive) {
            throw new Error("Click Install LID model to download the language detection model.");
        }
        // Retain one detector; per-input abort signals must not destroy it.
        if (!detectorPromise) {
            detectorPromise = window.LanguageDetector.create({
                signal: detectorLifetime.signal,
                monitor: monitorDownload(message => {
                    if (source.value === "auto") showDetectionStatus(message);
                }, "Downloading detection model", detectorLifetime.signal)
            }).then(created => {
                detector = created;
                enableDetection.classList.add("hidden");
                return created;
            }).finally(() => { detectorPromise = null; });
        }
        return detectorPromise;
    }

    async function detectLanguage(allowDownload = false) {
        const current = revision;
        if (source.value !== "auto" || !input.value.trim()) return;
        detectionController?.abort();
        const controller = new AbortController();
        detectionController = controller;
        showDetectionStatus();
        try {
            const activeDetector = await getDetector(allowDownload);
            if (!activeDetector || current !== revision || controller.signal.aborted) return;
            const matches = await activeDetector.detect(input.value, { signal: controller.signal });
            if (current !== revision || controller.signal.aborted) return;
            const match = matches[0];
            if (!match || match.detectedLanguage === "und") {
                throw new Error("Language could not be determined. Select the source language manually.");
            }
            detectedLanguage = match.detectedLanguage;
            if (![...source.options].some(option => option.value === detectedLanguage)) {
                source.add(new Option(languageName(detectedLanguage), detectedLanguage));
            }
            for (const candidate of matches) {
                if (candidate.detectedLanguage === "und") continue;
                let option = [...source.options].find(option => option.value === candidate.detectedLanguage);
                if (!option) {
                    option = new Option(languageName(candidate.detectedLanguage), candidate.detectedLanguage);
                    source.add(option);
                }
                option.textContent = `${languageName(candidate.detectedLanguage)} - ${Math.round(candidate.confidence * 100)}%`;
            }
            source.options[0].textContent = `Auto: ${languageName(detectedLanguage)} - ${Math.round(match.confidence * 100)}%`;
            showDetectionStatus();
            await checkPair();
        } catch (error) {
            if (controller.signal.aborted || current !== revision) return;
            console.error("Language detection failed:", error);
            showDetectionStatus(error.message);
            enableDetection.classList.toggle("hidden", !window.LanguageDetector);
        } finally {
            if (detectionController === controller) detectionController = null;
        }
    }

    function invalidate() {
        revision++;
        clearTimeout(detectionTimer);
        detectionController?.abort();
        translationController?.abort();
        translationController = null;
        busy = false;
        pairAvailability = null;
        result.classList.add("hidden");
        output.textContent = "";
        updateButton();
    }

    function inputChanged() {
        invalidate();
        detectedLanguage = "";
        resetConfidence();
        showDetectionStatus();
        if (source.value === "auto") detectionTimer = setTimeout(() => detectLanguage(), 350);
        void checkPair();
    }

    input.addEventListener("input", inputChanged);
    document.getElementById("clear-text").addEventListener("click", () => {
        input.value = "";
        inputChanged();
        input.focus();
    });
    source.addEventListener("change", () => {
        invalidate();
        enableDetection.classList.add("hidden");
        if (source.value === "auto") {
            detectedLanguage = "";
            void detectLanguage();
        } else {
            showDetectionStatus();
        }
        void checkPair();
    });
    target.addEventListener("change", () => {
        invalidate();
        void checkPair();
        if (source.value === "auto" && !detectedLanguage) void detectLanguage();
    });
    enableDetection.addEventListener("click", () => { void detectLanguage(true); });

    document.getElementById("translation-form").addEventListener("submit", async event => {
        event.preventDefault();
        if (busy || perfController) return;
        const sourceCode = sourceLanguage();
        const targetCode = target.value;
        const text = input.value;
        if (!text.trim() || !sourceCode || sourceCode === targetCode || !window.Translator) {
            showStatus("Enter text and choose different, supported source and destination languages.", true);
            return;
        }
        const current = revision;
        const controller = new AbortController();
        translationController = controller;
        busy = true;
        busyLabel = ["downloadable", "downloading"].includes(pairAvailability) ? "Downloading..." : "Translating...";
        updateButton();
        result.classList.add("hidden");
        output.textContent = "";
        let translator = null;
        try {
            const options = { sourceLanguage: sourceCode, targetLanguage: targetCode };
            const availability = await window.Translator.availability(options);
            if (controller.signal.aborted) return;
            pairAvailability = availability;
            if (availability === "unavailable") throw new Error("This language pair is not supported by your browser.");
            if (availability !== "available" && !navigator.userActivation.isActive) {
                throw new Error("Click Download language pack again to start the download.");
            }
            busyLabel = availability === "available" ? "Translating..." : "Downloading...";
            updateButton();
            showStatus(availability === "available" ? "Translating..." : "Downloading language packs...");
            translator = await window.Translator.create({
                ...options,
                signal: controller.signal,
                monitor: monitorDownload(showStatus, "Downloading language packs", controller.signal)
            });
            if (controller.signal.aborted) return;
            pairAvailability = "available";
            busyLabel = "Translating...";
            updateButton();
            showStatus("Translating...");
            const translated = await translator.translate(text, { signal: controller.signal });
            if (controller.signal.aborted || current !== revision) return;
            output.textContent = translated;
            output.lang = targetCode;
            result.classList.remove("hidden");
            showStatus(`Translated from ${languageName(sourceCode)} to ${languageName(targetCode)}.`);
        } catch (error) {
            if (controller.signal.aborted || current !== revision) return;
            console.error("Translation failed:", error);
            showStatus(`Translation failed: ${error.message}`, true);
        } finally {
            translator?.destroy();
            if (translationController === controller) {
                translationController = null;
                busy = false;
                updateButton();
            }
        }
    });

    perfButton.addEventListener("click", async () => {
        if (perfController) {
            perfController.abort();
            return;
        }
        if (busy) return;
        const controller = new AbortController();
        perfController = controller;
        detectionController?.abort();
        clearTimeout(detectionTimer);
        perfResult.classList.add("hidden");
        result.classList.add("hidden");
        perfStatus.classList.remove("hidden");
        perfStatus.dataset.error = "false";
        perfStatus.textContent = "Checking English to Chinese language pack...";
        updateButton();
        try {
            if (!window.Translator || !window.isSecureContext) throw new Error("This benchmark requires the Translator API over HTTPS or localhost.");
            const metrics = await runTranslationBenchmark(window.Translator, PERF_SENTENCES, {
                signal: controller.signal,
                onProgress: message => { if (!controller.signal.aborted) perfStatus.textContent = message; },
                onDownloadProgress: percent => { perfStatus.textContent = `Downloading English to Chinese language pack: ${percent}%`; }
            });
            if (controller.signal.aborted) return;
            document.getElementById("perf-latency").textContent = `${metrics.initialLatencyMs.toFixed(2)} ms for ${metrics.initialInputCharacters} input characters`;
            document.getElementById("perf-cps").textContent = `${metrics.averageCps.toFixed(2)} chars/s`;
            document.getElementById("perf-download").textContent = metrics.downloadRequired ? `${metrics.downloadMs.toFixed(2)} ms` : "Already installed (0 ms)";
            document.getElementById("perf-setup").textContent = `${metrics.setupMs.toFixed(2)} ms`;
            document.getElementById("perf-summary").textContent =
                `${metrics.sentenceCount} sentences individually; ${metrics.inputCharacters} input / ${metrics.outputCharacters} output characters. ` +
                "Latency is time to the first nonempty chunk of the first sentence. CPS excludes setup and download. " +
                (metrics.downloadRequired ? "Provisioning includes download and first initialization; pure download time is not exposed by the browser." : "");
            document.getElementById("perf-translations").textContent = metrics.translations.map((text, index) => `${index + 1}. ${text}`).join("\n\n");
            perfResult.classList.remove("hidden");
            perfStatus.textContent = "Performance measurement complete.";
        } catch (error) {
            if (controller.signal.aborted) {
                perfStatus.textContent = "Performance measurement canceled.";
            } else {
                console.error("Translation performance measurement failed:", error);
                perfStatus.dataset.error = "true";
                perfStatus.textContent = `Performance measurement failed: ${error.message}`;
            }
        } finally {
            if (perfController === controller) {
                perfController = null;
                updateButton();
                if (source.value === "auto" && !detectedLanguage) void detectLanguage();
            }
        }
    });

    window.addEventListener("pagehide", () => {
        perfController?.abort();
        invalidate();
        detectorLifetime.abort();
        detector?.destroy();
        detector = null;
    });
    void checkPair();
    void detectLanguage();
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { browserLanguage };
}
if (typeof document !== "undefined") initializeTranslation();
