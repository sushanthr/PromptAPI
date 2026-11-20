function initializeSpeech() {
    const language = document.getElementById("input-language");
    const source = document.getElementById("audio-source");
    const onDevice = document.getElementById("on-device");
    const file = document.getElementById("media-file");
    const preview = document.getElementById("media-preview");
    const start = document.getElementById("start");
    const stop = document.getElementById("stop");
    const status = document.getElementById("speech-status");
    const finalOutput = document.getElementById("final-transcript");
    const interimOutput = document.getElementById("interim-transcript");
    const meter = document.getElementById("audio-meter");
    const meterBar = document.getElementById("audio-meter-bar");
    const meterHint = document.getElementById("audio-meter-hint");
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const supported = Boolean(window.isSecureContext && Recognition && AudioContext);
    const localSupported = supported &&
        "processLocally" in Recognition.prototype &&
        typeof Recognition.available === "function" && typeof Recognition.install === "function";
    let active = null;
    let fileURL = null;
    let media = null;

    function modeSupported() {
        return onDevice.checked ? localSupported : supported;
    }

    function showStatus(message, error = false) {
        status.textContent = message;
        status.dataset.error = String(error);
    }

    function updateControls() {
        const busy = Boolean(active);
        const available = modeSupported();
        onDevice.disabled = busy || !supported;
        document.getElementById("recognition-mode-label").textContent = onDevice.checked ? "On-device" : "Cloud";
        language.disabled = busy || !available;
        source.disabled = busy || !available;
        file.disabled = busy || !available || source.value !== "file";
        start.disabled = busy || !available || (source.value === "file" && !fileURL);
        stop.disabled = !busy || active.phase === "stopping";
        document.getElementById("audio-file-row").classList.toggle("hidden", source.value !== "file");
        preview.classList.toggle("hidden", source.value !== "file" || !fileURL);
    }

    function resetMeter() {
        meter.setAttribute("aria-valuenow", "0");
        meterBar.style.width = "0%";
        meterHint.textContent = "Idle";
    }

    function release(session) {
        cancelAnimationFrame(session.frame);
        session.media?.pause();
        session.stream?.getTracks().forEach(track => track.stop());
        session.context.close().catch(error => {
            console.error("Speech audio cleanup failed:", error);
            showStatus(`Could not release audio resources: ${error.message}`, true);
        });
        resetMeter();
    }

    function finish(session, message, error = false) {
        if (active !== session) return;
        active = null;
        session.recognition.onresult = null;
        session.recognition.onstart = null;
        session.recognition.onend = null;
        session.recognition.onerror = null;
        interimOutput.textContent = "";
        release(session);
        showStatus(message, error);
        updateControls();
    }

    function fail(session, error) {
        if (active !== session) return;
        console.error("Speech recognition failed:", error);
        finish(session, `Speech recognition failed: ${error.message}`, true);
        session.recognition.abort();
    }

    function createPreview() {
        media?.pause();
        media = document.createElement(file.files[0].type.startsWith("video/") ? "video" : "audio");
        media.controls = true;
        media.preload = "metadata";
        media.src = fileURL;
        preview.replaceChildren(media);
    }

    function clearFile() {
        media?.pause();
        if (media) {
            media.removeAttribute("src");
            media.load();
        }
        media = null;
        preview.replaceChildren();
        if (fileURL) URL.revokeObjectURL(fileURL);
        fileURL = null;
        file.value = "";
    }

    function animateMeter(session, analyser) {
        const samples = new Uint8Array(analyser.fftSize);
        let lastAnnouncement = 0;
        function draw(time) {
            if (active !== session) return;
            analyser.getByteTimeDomainData(samples);
            const rms = Math.sqrt(samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length);
            const level = Math.min(100, Math.round(rms * 200));
            meterBar.style.width = `${level}%`;
            if (time - lastAnnouncement >= 250) {
                meter.setAttribute("aria-valuenow", String(level));
                lastAnnouncement = time;
            }
            session.frame = requestAnimationFrame(draw);
        }
        meterHint.textContent = "Listening";
        session.frame = requestAnimationFrame(draw);
    }

    async function begin() {
        if (start.disabled) return;
        let session;
        try {
            session = {
                recognition: new Recognition(), context: new AudioContext(),
                phase: "preparing", stream: null, media: null, frame: 0,
                local: onDevice.checked
            };
            active = session;
            updateControls();
            // Resume while the click still supplies user activation, before checking the model.
            const resumed = session.context.resume();
            if (session.local) {
                const options = { langs: [language.value], processLocally: true };
                showStatus("Checking on-device language model...");
                const [availability] = await Promise.all([Recognition.available(options), resumed]);
                if (active !== session) return;
                if (availability === "downloadable" || availability === "downloading") {
                    showStatus(`Installing on-device model for ${language.value}...`);
                    const installed = await Recognition.install(options);
                    if (active !== session) return;
                    if (!installed) throw new Error("Language model installation failed. Click Start to retry.");
                } else if (availability !== "available") {
                    throw new Error("This language is not available for on-device speech recognition.");
                }
            } else {
                await resumed;
                if (active !== session) return;
            }

            const recognition = session.recognition;
            recognition.lang = language.value;
            if ("processLocally" in recognition) recognition.processLocally = session.local;
            recognition.continuous = true;
            recognition.interimResults = true;
            const analyser = session.context.createAnalyser();
            analyser.fftSize = 256;
            let audioNode;
            if (source.value === "file") {
                // A media element can only be attached to one MediaElementAudioSourceNode.
                createPreview();
                session.media = media;
                media.currentTime = 0;
                audioNode = session.context.createMediaElementSource(media);
                const destination = session.context.createMediaStreamDestination();
                audioNode.connect(destination);
                audioNode.connect(session.context.destination);
                session.stream = destination.stream;
                media.onended = () => {
                    if (active === session) requestStop();
                };
                media.onerror = () => fail(session, new Error("The selected media file could not be played."));
            } else {
                showStatus("Waiting for microphone permission...");
                if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone capture is not supported.");
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (active !== session) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }
                session.stream = stream;
                audioNode = session.context.createMediaStreamSource(stream);
            }
            audioNode.connect(analyser);
            const prefix = finalOutput.textContent;
            recognition.onresult = event => {
                if (active !== session) return;
                let finalText = "";
                let interimText = "";
                for (let i = 0; i < event.results.length; i++) {
                    const result = event.results[i];
                    if (result.isFinal) finalText += `${result[0].transcript} `;
                    else interimText += result[0].transcript;
                }
                finalOutput.textContent = prefix + finalText;
                interimOutput.textContent = interimText;
            };
            recognition.onerror = event => fail(session, new Error({
                "not-allowed": "Microphone or speech permission was denied.",
                "audio-capture": "No usable audio input was found.",
                "no-speech": "No speech was detected. Click Start to retry.",
                "language-not-supported": session.local ? "The on-device language model is not supported." :
                    "This language is not supported by the browser's cloud speech service.",
                "network": "The speech service could not be reached. Check your connection."
            }[event.error] || event.message || event.error));
            recognition.onend = () => finish(session, "Stopped. Click Start to continue.");
            recognition.onstart = async () => {
                if (active !== session || session.phase === "stopping") return;
                session.phase = "listening";
                showStatus(session.local ? "Listening on device..." :
                    "Listening in cloud mode. Audio is sent to your browser's speech service.");
                animateMeter(session, analyser);
                try {
                    await session.media?.play();
                    if (active !== session) session.media?.pause();
                } catch (error) {
                    fail(session, error);
                }
            };
            session.phase = "starting";
            recognition.start(session.stream.getAudioTracks()[0]);
        } catch (error) {
            if (session && active === session) fail(session, error);
            else if (!session) {
                console.error("Speech setup failed:", error);
                showStatus(`Could not set up speech recognition: ${error.message}`, true);
            }
        }
    }

    function requestStop() {
        const session = active;
        if (!session || session.phase === "stopping") return;
        if (session.phase === "preparing") {
            finish(session, "Stopped. Click Start to continue.");
            return;
        }
        session.phase = "stopping";
        session.media?.pause();
        showStatus("Stopping...");
        updateControls();
        try {
            session.recognition.stop();
        } catch (error) {
            fail(session, error);
        }
    }

    function cancel() {
        if (!active) return;
        const session = active;
        finish(session, "Ready. Click Start to begin.");
        session.recognition.abort();
    }

    start.addEventListener("click", begin);
    stop.addEventListener("click", requestStop);
    onDevice.addEventListener("change", () => {
        showSupport();
        updateControls();
    });
    source.addEventListener("change", () => {
        media?.pause();
        updateControls();
    });
    file.addEventListener("change", () => {
        const selected = file.files[0];
        if (fileURL) URL.revokeObjectURL(fileURL);
        fileURL = null;
        if (selected) {
            fileURL = URL.createObjectURL(selected);
            createPreview();
            showStatus(onDevice.checked ? "File selected. Click Start to transcribe on device." :
                "File selected. Click Start to send audio to your browser's speech service.");
        } else {
            clearFile();
        }
        updateControls();
    });
    document.getElementById("reset").addEventListener("click", () => {
        cancel();
        clearFile();
        finalOutput.textContent = "";
        interimOutput.textContent = "";
        resetMeter();
        showSupport();
        updateControls();
    });
    window.addEventListener("pagehide", () => {
        cancel();
        clearFile();
    });

    function showSupport() {
        showStatus(!window.isSecureContext ? "Speech recognition requires HTTPS or localhost." :
            !supported ? "SpeechRecognition is not available in this browser." :
                onDevice.checked ? !localSupported ?
                    "On-device SpeechRecognition is not available. Enable Speech Recognition with on-device model in edge://flags or select Cloud." :
                    "Ready. Click Start to begin; a language model will be downloaded if needed." :
                    "Cloud mode sends audio to your browser's speech service. Click Start to begin.",
        !modeSupported());
    }
    showSupport();
    updateControls();
}

if (typeof document !== "undefined") initializeSpeech();
