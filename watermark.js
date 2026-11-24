function createWatermarkCounter() {
    const sequence = "\u200B\u034F\u2060\u200B";
    let completedCount = 0;
    let responseCount = 0;

    return {
        startResponse() {
            completedCount += responseCount;
            responseCount = 0;
        },
        update(text) {
            responseCount = text.split(sequence).length - 1;
            return completedCount + responseCount;
        },
        reset() {
            completedCount = 0;
            responseCount = 0;
        }
    };
}
