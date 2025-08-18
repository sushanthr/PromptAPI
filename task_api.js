let errorShown = false;
let currentTask = null;
let summarizerSession = null;
let writerSession = null;
let rewriterSession = null;
let isProcessing = false;

// Task models availability tracking
let taskModelsStatus = {
    summarizer: 'unknown',
    writer: 'unknown', 
    rewriter: 'unknown'
};

function showError(message, isDownloading = false) {
    document.getElementById("model-status").innerText = message;
    if (isDownloading) {
        document.getElementById("model-icon").className = "material-icons text-yellow-400";
        document.getElementById("model-icon").innerText = "downloading";
        document.getElementById("download-btn").classList.add("hidden");
    } else {
        document.getElementById("model-icon").className = "material-icons text-red-400";
        document.getElementById("model-icon").innerText = "error";
        if (message.includes("downloadable")) {
            document.getElementById("download-btn").classList.remove("hidden");
        }
    }
}

function showSuccess() {
    document.getElementById("model-status").innerText = "Models: Available";
    document.getElementById("model-icon").className = "material-icons text-green-400";
    document.getElementById("model-icon").innerText = "check_circle";
    document.getElementById("download-btn").classList.add("hidden");
}

function updateTaskModelStatus(task, status) {
    taskModelsStatus[task] = status;
    
    // Update UI based on current task
    const currentSelectedTask = document.getElementById("task-selector").value;
    if (currentSelectedTask === task) {
        const statusIcon = document.getElementById("task-model-icon");
        const statusText = document.getElementById("task-model-status");
        
        switch(status) {
            case 'available':
                statusIcon.className = "material-icons text-green-400";
                statusIcon.innerText = "check_circle";
                statusText.innerText = "Ready";
                break;
            case 'downloadable':
                statusIcon.className = "material-icons text-yellow-400";
                statusIcon.innerText = "download";
                statusText.innerText = "Downloadable";
                break;
            case 'downloading':
                statusIcon.className = "material-icons text-yellow-400";
                statusIcon.innerText = "downloading";
                statusText.innerText = "Downloading...";
                break;
            case 'unavailable':
                statusIcon.className = "material-icons text-red-400";
                statusIcon.innerText = "error";
                statusText.innerText = "Unavailable";
                break;
            default:
                statusIcon.className = "material-icons text-gray-400";
                statusIcon.innerText = "help";
                statusText.innerText = "Unknown";
        }
    }
}

async function checkTaskAvailability(taskName, TaskAPI) {
    try {
        const result = await TaskAPI.availability();
        updateTaskModelStatus(taskName, result);
        return result;
    } catch (e) {
        console.error(`Error checking ${taskName} availability:`, e);
        updateTaskModelStatus(taskName, 'unavailable');
        return 'unavailable';
    }
}

async function createTaskSession(taskName, TaskAPI, options = {}) {
    try {
        const session = await TaskAPI.create({
            monitor(m) {
                m.addEventListener("downloadprogress", e => {
                    const progress = Math.round(e.loaded * 100 / e.total);
                    updateTaskModelStatus(taskName, 'downloading');
                    console.log(`${taskName} download ${progress}% done.`);
                });
            },
            ...options
        });
        updateTaskModelStatus(taskName, 'available');
        return session;
    } catch (e) {
        console.error(`Failed to create ${taskName} session:`, e);
        updateTaskModelStatus(taskName, 'unavailable');
        throw e;
    }
}

async function initializeSummarizer() {
    if (!window.Summarizer) {
        updateTaskModelStatus('summarizer', 'unavailable');
        return;
    }
    
    const availability = await checkTaskAvailability('summarizer', window.Summarizer);
    if (availability === 'available') {
        try {
            summarizerSession = await createTaskSession('summarizer', window.Summarizer, getSummarizerConfig());
        } catch (e) {
            console.error("Failed to initialize summarizer:", e);
        }
    }
}

async function initializeWriter() {
    if (!window.Writer) {
        updateTaskModelStatus('writer', 'unavailable');
        return;
    }
    
    const availability = await checkTaskAvailability('writer', window.Writer);
    if (availability === 'available') {
        try {
            writerSession = await createTaskSession('writer', window.Writer, getWriterConfig());
        } catch (e) {
            console.error("Failed to initialize writer:", e);
        }
    }
}

async function initializeRewriter() {
    if (!window.Rewriter) {
        updateTaskModelStatus('rewriter', 'unavailable');
        return;
    }
    
    const availability = await checkTaskAvailability('rewriter', window.Rewriter);
    if (availability === 'available') {
        try {
            rewriterSession = await createTaskSession('rewriter', window.Rewriter, getRewriterConfig());
        } catch (e) {
            console.error("Failed to initialize rewriter:", e);
        }
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
    const group = document.querySelector(`[data-group="${groupName}"]`);
    const activeButton = group.querySelector('.btn-option.active');
    return activeButton ? activeButton.dataset.value : null;
}

function setActiveButton(groupName, value) {
    const group = document.querySelector(`[data-group="${groupName}"]`);
    if (!group) return;
    
    // Remove active class from all buttons in group
    group.querySelectorAll('.btn-option').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Add active class to selected button
    const targetButton = group.querySelector(`[data-value="${value}"]`);
    if (targetButton) {
        targetButton.classList.add('active');
    }
}

function switchTaskConfig() {
    const selectedTask = document.getElementById("task-selector").value;
    
    // Hide all config panels
    document.querySelectorAll('.task-config').forEach(panel => {
        panel.classList.add('hidden');
    });
    
    // Show selected config panel
    document.getElementById(`${selectedTask}-config`).classList.remove('hidden');
    
    // Update task model status display
    updateTaskModelStatus(selectedTask, taskModelsStatus[selectedTask]);
}

async function processText() {
    const inputText = document.getElementById("input-text").value.trim();
    if (!inputText) {
        alert("Please enter some text to process.");
        return;
    }

    const selectedTask = document.getElementById("task-selector").value;
    const useStreaming = document.getElementById("streaming-checkbox").checked;
    const outputElement = document.getElementById("output-content");
    const processBtn = document.getElementById("process-btn");
    const processIcon = document.getElementById("process-icon");
    const processText = document.getElementById("process-text");

    if (isProcessing) {
        // Stop processing
        isProcessing = false;
        processIcon.innerText = "play_arrow";
        processText.innerText = "Process";
        return;
    }

    isProcessing = true;
    processIcon.innerText = "stop";
    processText.innerText = "Stop";

    const startTime = Date.now();
    outputElement.innerHTML = '<p class="text-gray-500 text-sm">Applying configuration and processing...</p>';

    try {
        // Apply configuration first
        await applyConfiguration();
        
        outputElement.innerHTML = '<p class="text-gray-500 text-sm">Processing...</p>';
        
        let result = "";
        let session = null;
        let options = {};

        // Get appropriate session and options
        switch (selectedTask) {
            case 'summarizer':
                session = summarizerSession;
                const sumContext = document.getElementById("sum-context").value.trim();
                if (sumContext) options.context = sumContext;
                break;
            case 'writer':
                session = writerSession;
                const writerContext = document.getElementById("writer-context").value.trim();
                if (writerContext) options.context = writerContext;
                break;
            case 'rewriter':
                session = rewriterSession;
                const rewriterContext = document.getElementById("rewriter-context").value.trim();
                if (rewriterContext) options.context = rewriterContext;
                break;
            default:
                throw new Error(`Unknown task: ${selectedTask}`);
        }

        if (!session) {
            throw new Error(`${selectedTask} session not available`);
        }

        if (useStreaming) {
            // Use streaming API
            let stream;
            switch (selectedTask) {
                case 'summarizer':
                    stream = session.summarizeStreaming(inputText, options);
                    break;
                case 'writer':
                    stream = session.writeStreaming(inputText, options);
                    break;
                case 'rewriter':
                    stream = session.rewriteStreaming(inputText, options);
                    break;
            }

            for await (const chunk of stream) {
                if (!isProcessing) break;
                result += chunk;
                outputElement.innerHTML = marked.parse(result);
            }
        } else {
            // Use non-streaming API
            switch (selectedTask) {
                case 'summarizer':
                    result = await session.summarize(inputText, options);
                    break;
                case 'writer':
                    result = await session.write(inputText, options);
                    break;
                case 'rewriter':
                    result = await session.rewrite(inputText, options);
                    break;
            }
            outputElement.innerHTML = marked.parse(result);
        }

        // Update metrics
        const processingTime = Date.now() - startTime;
        document.getElementById("processing-time").textContent = processingTime;
        document.getElementById("input-chars").textContent = inputText.length;
        document.getElementById("output-chars").textContent = result.length;

    } catch (e) {
        outputElement.innerHTML = `<p class="text-red-400 text-sm">Error: ${e.message}</p>`;
        console.error("Processing error:", e);
    } finally {
        isProcessing = false;
        processIcon.innerText = "play_arrow";
        processText.innerText = "Process";
    }
}

function clearContent() {
    document.getElementById("input-text").value = "";
    document.getElementById("output-content").innerHTML = '<p class="text-gray-500 text-sm">Output will appear here...</p>';
    document.getElementById("processing-time").textContent = "0";
    document.getElementById("input-chars").textContent = "0";
    document.getElementById("output-chars").textContent = "0";
}

async function applyConfiguration() {
    const selectedTask = document.getElementById("task-selector").value;
    
    try {
        switch (selectedTask) {
            case 'summarizer':
                if (summarizerSession) summarizerSession.destroy();
                summarizerSession = await createTaskSession('summarizer', window.Summarizer, getSummarizerConfig());
                break;
            case 'writer':
                if (writerSession) writerSession.destroy();
                writerSession = await createTaskSession('writer', window.Writer, getWriterConfig());
                break;
            case 'rewriter':
                if (rewriterSession) rewriterSession.destroy();
                rewriterSession = await createTaskSession('rewriter', window.Rewriter, getRewriterConfig());
                break;
        }
        console.log(`${selectedTask} configuration applied successfully`);
    } catch (e) {
        console.error(`Failed to apply ${selectedTask} configuration:`, e);
    }
}

async function downloadModels() {
    try {
        showError("Initiating model downloads...", true);
        
        // Try to download each available model
        const tasks = ['summarizer', 'writer', 'rewriter'];
        const APIs = [window.Summarizer, window.Writer, window.Rewriter];
        
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            const API = APIs[i];
            
            if (API && taskModelsStatus[task] === 'downloadable') {
                try {
                    await createTaskSession(task, API);
                } catch (e) {
                    console.error(`Failed to download ${task}:`, e);
                }
            }
        }
        
        // Check overall status
        const availableCount = Object.values(taskModelsStatus).filter(status => status === 'available').length;
        if (availableCount > 0) {
            showSuccess();
        } else {
            showError("Some models failed to download");
        }
        
    } catch (e) {
        showError("Download failed: " + e.message);
    }
}

async function initialize() {
    try {
        // Initialize all task APIs
        await Promise.all([
            initializeSummarizer(),
            initializeWriter(),
            initializeRewriter()
        ]);
        
        // Check overall status
        const availableCount = Object.values(taskModelsStatus).filter(status => status === 'available').length;
        const downloadableCount = Object.values(taskModelsStatus).filter(status => status === 'downloadable').length;
        
        if (availableCount === 3) {
            showSuccess();
        } else if (downloadableCount > 0) {
            showError("Some models are downloadable - click to download");
            setTimeout(initialize, 100);
        } else if (availableCount > 0) {
            showSuccess();
        } else {
            showError("Task APIs not available");
        }
        
    } catch (e) {
        console.error("Initialization error:", e);
        showError("Error: " + e.message);
    }
}

function initializeButtonGroups() {
    // Add click listeners to all button options
    document.querySelectorAll('.btn-option').forEach(button => {
        button.addEventListener('click', (e) => {
            const button = e.target;
            const group = button.closest('[data-group]');
            const groupName = group.dataset.group;
            const value = button.dataset.value;
            
            // Set this button as active
            setActiveButton(groupName, value);
        });
    });
}

window.addEventListener("load", () => {
    // Initialize UI
    switchTaskConfig();
    initialize();
    
    // Event listeners
    document.getElementById("task-selector").addEventListener("change", switchTaskConfig);
    document.getElementById("process-btn").addEventListener("click", processText);
    document.getElementById("clear-btn").addEventListener("click", clearContent);
    document.getElementById("download-btn").addEventListener("click", downloadModels);
    
    // Button group event listeners
    initializeButtonGroups();
    
    // Update input character count
    document.getElementById("input-chars").textContent = document.getElementById("input-text").value.length;
    document.getElementById("input-text").addEventListener("input", (e) => {
        document.getElementById("input-chars").textContent = e.target.value.length;
    });
    
    // Enter key support for processing
    document.getElementById("input-text").addEventListener("keypress", (e) => {
        if (e.key === "Enter" && e.ctrlKey) {
            e.preventDefault();
            processText();
        }
    });
});
