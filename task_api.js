let currentTask = 'summarizer';
let isProcessing = false;
let activeController = null;
const watermarkCounter = createWatermarkCounter();

const taskModels = {
    summarizer: { name: 'Summarizer', method: 'summarize', getConfig: getSummarizerConfig, session: null, configKey: null, status: 'unknown', version: 0 },
    writer: { name: 'Writer', method: 'write', getConfig: getWriterConfig, session: null, configKey: null, status: 'unknown', version: 0 },
    rewriter: { name: 'Rewriter', method: 'rewrite', getConfig: getRewriterConfig, session: null, configKey: null, status: 'unknown', version: 0 }
};

function showError(message) {
    document.getElementById("model-status").textContent = message;
    document.getElementById("model-icon").className = "material-icons text-red-400";
    document.getElementById("model-icon").textContent = "error";
}

function updateDownloadButton() {
    const downloadable = Object.values(taskModels).some(model =>
        model.status === 'downloadable' || model.status === 'downloading');
    const button = document.getElementById("download-btn");
    button.classList.toggle('hidden', !downloadable);
    button.disabled = isProcessing;
}

function updateSelectedTaskStatus() {
    const model = taskModels[currentTask];
    const states = {
        available: { icon: 'check_circle', color: 'text-green-400', text: 'Ready' },
        downloadable: { icon: 'download', color: 'text-yellow-400', text: 'Download required' },
        downloading: { icon: 'downloading', color: 'text-yellow-400', text: 'Downloading...' },
        unavailable: { icon: 'error', color: 'text-red-400', text: 'Unavailable' },
        unknown: { icon: 'help', color: 'text-gray-400', text: 'Checking...' }
    };
    const state = states[model.status];
    const text = model.status === 'downloading' && model.progress !== undefined
        ? `Downloading ${model.progress}%` : state.text;
    const icon = document.getElementById("model-icon");
    icon.className = `material-icons ${state.color}`;
    icon.textContent = state.icon;
    document.getElementById("model-status").textContent = `${model.name}: ${text}`;
    updateDownloadButton();
}

function updateTaskModelStatus(task, status, progress) {
    const model = taskModels[task];
    model.status = status;
    model.progress = progress;
    document.querySelector(`[data-task="${task}"]`).title = `${model.name}: ${status}`;
    updateSelectedTaskStatus();
}

async function checkTaskAvailability(task, options = taskModels[task].getConfig()) {
    const model = taskModels[task];
    const version = ++model.version;
    const API = window[model.name];
    if (!API) {
        updateTaskModelStatus(task, 'unavailable');
        return 'unavailable';
    }
    updateTaskModelStatus(task, 'unknown');
    try {
        const result = await API.availability(options);
        if (!['available', 'downloadable', 'downloading', 'unavailable'].includes(result)) {
            throw new Error(`Unexpected ${model.name} availability: ${result}`);
        }
        if (version === model.version) updateTaskModelStatus(task, result);
        return result;
    } catch (e) {
        if (version === model.version) {
            updateTaskModelStatus(task, 'unavailable');
            if (task === currentTask) showError(`Cannot check ${model.name} availability: ${e.message}`);
        }
        throw e;
    }
}

async function refreshTaskAvailability(task) {
    try {
        await checkTaskAvailability(task);
    } catch (e) {
        console.error(`Error checking ${task} availability:`, e);
    }
}

async function createTaskSession(task, options, signal) {
    const model = taskModels[task];
    const configKey = JSON.stringify(options);
    signal.throwIfAborted();
    if (model.session && model.configKey === configKey) {
        model.version++;
        updateTaskModelStatus(task, 'available');
        return model.session;
    }
    const availability = await checkTaskAvailability(task, options);
    signal.throwIfAborted();
    if (availability === 'unavailable') {
        throw new Error(`${model.name} is unavailable with the selected configuration.`);
    }
    model.version++;
    const controller = new AbortController();
    const abortCreation = () => controller.abort(signal.reason);
    signal.addEventListener('abort', abortCreation, { once: true });
    let created = null;
    try {
        created = await window[model.name].create({
            ...options,
            signal: controller.signal,
            monitor(m) {
                m.addEventListener("downloadprogress", e => {
                    updateTaskModelStatus(task, 'downloading', Math.round(e.loaded * 100));
                });
            }
        });
        signal.throwIfAborted();
        if (model.session) model.session.destroy();
        model.session = created;
        model.configKey = configKey;
        updateTaskModelStatus(task, 'available');
        return created;
    } catch (e) {
        if (created) created.destroy();
        throw e;
    } finally {
        // Stop cancels pending creation, not a successfully cached object's lifetime.
        signal.removeEventListener('abort', abortCreation);
    }
}

function getSummarizerConfig() {
    return {
        type: getSelectedButtonValue('sum-type'),
        format: getSelectedButtonValue('sum-format'),
        length: getSelectedButtonValue('sum-length')
    };
}

function getWriterConfig() {
    return {
        tone: getSelectedButtonValue('writer-tone'),
        format: getSelectedButtonValue('writer-format'),
        length: getSelectedButtonValue('writer-length')
    };
}

function getRewriterConfig() {
    return {
        tone: getSelectedButtonValue('rewriter-tone'),
        format: getSelectedButtonValue('rewriter-format'),
        length: getSelectedButtonValue('rewriter-length')
    };
}

function getSelectedButtonValue(groupName) {
    const button = document.querySelector(`[data-group="${groupName}"] .btn-option.active`);
    if (!button) throw new Error(`No configuration selected for ${groupName}.`);
    return button.dataset.value;
}

function setActiveButton(groupName, value) {
    const group = document.querySelector(`[data-group="${groupName}"]`);
    group.querySelectorAll('.btn-option').forEach(button => {
        const active = button.dataset.value === value;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
}

function switchTaskConfig() {
    document.querySelectorAll('.task-config').forEach(panel => {
        panel.classList.toggle('hidden', panel.id !== `${currentTask}-config`);
    });
    document.querySelectorAll('[data-task]').forEach(button => {
        const active = button.dataset.task === currentTask;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    updateSelectedTaskStatus();
}

function setBusy(busy) {
    isProcessing = busy;
    document.getElementById("process-icon").textContent = busy ? "stop" : "play_arrow";
    document.getElementById("process-text").textContent = busy ? "Stop" : "Process";
    document.querySelectorAll('#task-selector button, .task-config button, .task-config textarea, #clear-btn, #streaming-checkbox').forEach(control => {
        control.disabled = busy;
    });
    updateDownloadButton();
}

function setOutputMessage(message, isError = false) {
    const output = document.getElementById("output-content");
    output.textContent = message;
    output.classList.toggle('text-red-400', isError);
    output.classList.toggle('text-gray-400', !isError);
    output.classList.remove('whitespace-pre-wrap');
}

function renderOutput(result, format) {
    const output = document.getElementById("output-content");
    output.classList.remove('text-red-400', 'text-gray-400', 'text-gray-500');
    output.classList.toggle('whitespace-pre-wrap', format === 'plain-text');
    if (format === 'plain-text') {
        output.textContent = result;
    } else {
        output.innerHTML = marked.parse(result);
    }
    document.getElementById("watermark-count").textContent = watermarkCounter.update(result);
}

async function processText() {
    if (isProcessing) {
        activeController.abort();
        return;
    }
    const inputText = document.getElementById("input-text").value.trim();
    if (!inputText) {
        alert("Please enter some text to process.");
        return;
    }
    const task = currentTask;
    const model = taskModels[task];
    const config = model.getConfig();
    const contextIds = { summarizer: 'sum-context', writer: 'writer-context', rewriter: 'rewriter-context' };
    const context = document.getElementById(contextIds[task]).value.trim();
    const useStreaming = document.getElementById("streaming-checkbox").checked;
    const controller = new AbortController();
    activeController = controller;
    watermarkCounter.startResponse();
    setBusy(true);
    const startTime = Date.now();
    setOutputMessage("Applying configuration and processing...");
    try {
        const session = await createTaskSession(task, config, controller.signal);
        controller.signal.throwIfAborted();
        const options = { signal: controller.signal, ...(context ? { context } : {}) };
        let result = "";
        setOutputMessage("Processing...");
        if (useStreaming) {
            const stream = session[`${model.method}Streaming`](inputText, options);
            for await (const chunk of stream) {
                controller.signal.throwIfAborted();
                result += chunk;
                renderOutput(result, config.format);
            }
        } else {
            result = await session[model.method](inputText, options);
        }
        controller.signal.throwIfAborted();
        renderOutput(result, config.format);
        document.getElementById("processing-time").textContent = Date.now() - startTime;
        document.getElementById("input-chars").textContent = inputText.length;
        document.getElementById("output-chars").textContent = result.length;
    } catch (e) {
        if (controller.signal.aborted) {
            setOutputMessage("Processing stopped.");
        } else {
            setOutputMessage(`Error: ${e.message}`, true);
            showError(`${model.name} error: ${e.message}`);
            console.error("Processing error:", e);
        }
    } finally {
        activeController = null;
        setBusy(false);
        if (controller.signal.aborted) await refreshTaskAvailability(task);
    }
}

function clearContent() {
    document.getElementById("input-text").value = "";
    setOutputMessage("Choose a task and press Process to see the output here.");
    document.getElementById("processing-time").textContent = "0";
    document.getElementById("input-chars").textContent = "0";
    document.getElementById("output-chars").textContent = "0";
    watermarkCounter.reset();
    document.getElementById("watermark-count").textContent = "0";
}

async function downloadModels() {
    if (isProcessing) return;
    const tasks = Object.keys(taskModels).filter(task =>
        taskModels[task].status === 'downloadable' || taskModels[task].status === 'downloading');
    if (!tasks.length) return;
    const controller = new AbortController();
    activeController = controller;
    setBusy(true);
    setOutputMessage("Downloading models...");
    try {
        const results = await Promise.allSettled(tasks.map(task =>
            createTaskSession(task, taskModels[task].getConfig(), controller.signal)));
        controller.signal.throwIfAborted();
        const failures = [];
        results.forEach((result, i) => {
            if (result.status === 'rejected') {
                console.error(`Failed to download ${tasks[i]}:`, result.reason);
                failures.push(`${taskModels[tasks[i]].name}: ${result.reason.message}`);
            }
        });
        if (failures.length) throw new Error(failures.join('; '));
        setOutputMessage("Downloaded models are ready. Select a task and press Process.");
        updateSelectedTaskStatus();
    } catch (e) {
        if (controller.signal.aborted) {
            setOutputMessage("Downloads stopped.");
        } else {
            setOutputMessage(`Download failed: ${e.message}`, true);
            showError(`Download failed: ${e.message}`);
            console.error("Download error:", e);
        }
    } finally {
        activeController = null;
        setBusy(false);
        if (controller.signal.aborted) await initialize();
    }
}

async function initialize() {
    await Promise.all(Object.keys(taskModels).map(refreshTaskAvailability));
}

function initializeButtonGroups() {
    document.querySelectorAll('.task-config [data-group]').forEach(group => {
        const active = group.querySelector('.btn-option.active');
        setActiveButton(group.dataset.group, active.dataset.value);
    });
    document.querySelectorAll('.task-config .btn-option').forEach(button => {
        button.addEventListener('click', () => {
            setActiveButton(button.closest('[data-group]').dataset.group, button.dataset.value);
            refreshTaskAvailability(currentTask);
        });
    });
}

window.addEventListener("load", () => {
    switchTaskConfig();
    initializeButtonGroups();
    initialize();
    document.querySelectorAll('[data-task]').forEach(button => {
        button.addEventListener('click', () => {
            currentTask = button.dataset.task;
            switchTaskConfig();
            refreshTaskAvailability(currentTask);
        });
    });
    document.getElementById("process-btn").addEventListener("click", processText);
    document.getElementById("clear-btn").addEventListener("click", clearContent);
    document.getElementById("download-btn").addEventListener("click", downloadModels);
    document.getElementById("input-chars").textContent = document.getElementById("input-text").value.length;
    document.getElementById("input-text").addEventListener("input", e => {
        document.getElementById("input-chars").textContent = e.target.value.length;
    });
    document.getElementById("input-text").addEventListener("keypress", e => {
        if (e.key === "Enter" && e.ctrlKey) {
            e.preventDefault();
            processText();
        }
    });
});

window.addEventListener("pagehide", () => {
    if (activeController) activeController.abort();
    Object.values(taskModels).forEach(model => {
        if (model.session) model.session.destroy();
        model.session = null;
        model.configKey = null;
    });
});
