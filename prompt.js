function ShowError(message)
{
    document.getElementById("model-status").innerText = message;
    document.getElementById("model-icon").className = "material-icons text-red-400";
    document.getElementById("model-icon").innerText = "error";
}

async function checkModelStatus(){
    try {
        let result = await LanguageModel.availability();
        document.getElementById("model-status").innerText = `Model: ${result}`;
    } catch (error) {
        ShowError(`Model: Prompt API Unavailable (Use Chrome/Edge Canary and check feature flags)`);
        setTimeout(() => {
            checkModelStatus();
        }, 1000); // Retry after 5 seconds
    }
}

window.onload = function() {
    // Check if the model is available
    checkModelStatus();
}