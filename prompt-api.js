function supportsSamplingMode() {
    const prototype = window.LanguageModel?.prototype;
    return Boolean(prototype && "samplingMode" in prototype);
}

function getSamplingOptions(samplingMode) {
    return supportsSamplingMode() ? { samplingMode } : {};
}

async function getModelAvailability(options = {}) {
    if (!window.LanguageModel) {
        throw new Error("Prompt API is not detected. Use a supporting browser and enable the API if required.");
    }
    const availability = await window.LanguageModel.availability(options);
    if (!["available", "downloadable", "downloading", "unavailable"].includes(availability)) {
        throw new Error("Unexpected model availability: " + availability);
    }
    return availability;
}

function updateModelAvailability(availability, progress) {
    const states = {
        available: { text: "Model: Available", icon: "check_circle", color: "text-green-400" },
        downloadable: { text: "Model: Downloadable", icon: "download", color: "text-yellow-400" },
        downloading: { text: "Model: Downloading (waiting for progress)", icon: "downloading", color: "text-yellow-400" },
        unavailable: { text: "Model: Unavailable", icon: "error", color: "text-red-400" }
    };
    const state = states[availability];
    document.getElementById("model-status").textContent = availability === "downloading" && progress !== undefined
        ? `Model: Downloading ${progress}%` : state.text;
    const icon = document.getElementById("model-icon");
    icon.textContent = state.icon;
    icon.className = "material-icons " + state.color;
    document.getElementById("download-btn").classList.toggle("hidden", availability !== "downloadable");
}

function monitorModelDownload(monitor) {
    monitor.addEventListener("downloadprogress", event => {
        const fraction = event.total > 0 ? event.loaded / event.total : event.loaded;
        updateModelAvailability("downloading", Math.round(fraction * 100));
    });
}

async function downloadBenchmarkModel(options) {
    updateModelAvailability("downloading");
    try {
        const session = await window.LanguageModel.create({ ...options, monitor: monitorModelDownload });
        session.destroy();
        updateModelAvailability("available");
    } catch (error) {
        console.error("Model download failed:", error);
        updateModelAvailability("unavailable");
        document.getElementById("model-status").textContent = "Download failed: " + error.message;
        document.getElementById("download-btn").classList.remove("hidden");
    }
}

async function initializeModelStatus(options) {
    document.getElementById("download-btn").onclick = () => downloadBenchmarkModel(options);
    const samplingStatus = document.getElementById("sampling-status");
    if (samplingStatus) {
        samplingStatus.textContent = options.samplingMode
            ? "Sampling mode: " + options.samplingMode + "."
            : "Sampling Parameters feature is not enabled; using browser defaults.";
    }
    try {
        const availability = await getModelAvailability(options);
        updateModelAvailability(availability);
        if (availability === "downloading") await downloadBenchmarkModel(options);
    } catch (e) {
        console.error("Cannot check model availability:", e);
        updateModelAvailability("unavailable");
        document.getElementById("model-status").textContent = "Cannot check model availability: " + e.message;
    }
}
