const PERF_SENTENCES = [
    "The morning sunlight filled the kitchen.",
    "I opened the window to let in fresh air.",
    "My neighbor waved as she walked past the house.",
    "We prepared breakfast before leaving for work.",
    "The bus arrived at the station on time.",
    "A child watched the clouds from the window.",
    "The streets were quiet after the rain.",
    "I carried an umbrella in my blue backpack.",
    "The bakery served warm bread and fresh coffee.",
    "Everyone seemed ready for a new day.",
    "The library has a comfortable reading room.",
    "I borrowed a book about the history of music.",
    "The librarian helped me find a useful dictionary.",
    "Students worked together on a science project.",
    "Our teacher explained the problem with a drawing.",
    "Learning a new language takes patience and practice.",
    "We wrote short stories during the afternoon lesson.",
    "The classroom was decorated with colorful maps.",
    "She asked a thoughtful question about the experiment.",
    "I reviewed my notes before the examination.",
    "The garden is full of flowers in spring.",
    "A small bird built a nest near the fence.",
    "We planted a young tree beside the driveway.",
    "The leaves turned golden as autumn approached.",
    "A gentle breeze moved across the open field.",
    "The mountains looked beautiful in the evening light.",
    "We followed a narrow path through the forest.",
    "The river flowed quietly beneath the wooden bridge.",
    "Butterflies gathered around the purple flowers.",
    "The sky became clear after the storm passed.",
    "My family enjoys cooking dinner together.",
    "We bought fresh vegetables at the local market.",
    "The soup needed a little more salt.",
    "She sliced the apples and placed them in a bowl.",
    "I learned to make rice from my grandmother.",
    "The restaurant offered several vegetarian dishes.",
    "We shared a large table with our friends.",
    "The waiter brought a glass of water for everyone.",
    "A warm meal is especially welcome on a cold day.",
    "We cleaned the kitchen after finishing dinner.",
    "The train journey took less than two hours.",
    "I checked the timetable before buying a ticket.",
    "Our hotel was close to the city center.",
    "We visited a museum on the first afternoon.",
    "The guide described the history of the old palace.",
    "A map helped us find the nearest subway station.",
    "We took photographs of the harbor at sunset.",
    "The beach was peaceful early in the morning.",
    "I sent a postcard to my family back home.",
    "The trip gave us many wonderful memories.",
    "The team met to discuss the next release.",
    "I saved my changes before closing the application.",
    "The new software made the task much easier.",
    "She tested the feature on several different devices.",
    "A clear error message helped us solve the problem.",
    "We updated the documentation after the meeting.",
    "The computer finished the calculation quickly.",
    "Our website works well on small screens.",
    "He explained the design with a simple diagram.",
    "We celebrated when the project was completed.",
    "Regular exercise helps me feel more energetic.",
    "We walked around the park after lunch.",
    "She practices swimming every Saturday morning.",
    "The football match attracted a large crowd.",
    "I stretched my legs before starting the run.",
    "Our team encouraged each other throughout the game.",
    "A short break helped everyone regain their focus.",
    "The coach reminded us to drink enough water.",
    "We rode our bicycles along the riverside path.",
    "I slept well after spending the day outdoors.",
    "My brother called to share some good news.",
    "We planned a small party for her birthday.",
    "The children made a card for their grandfather.",
    "Our friends arrived earlier than we expected.",
    "We talked for hours about our school days.",
    "She helped me carry the boxes upstairs.",
    "A friendly conversation can brighten a difficult day.",
    "We thanked our neighbors for their kindness.",
    "Everyone contributed something to the celebration.",
    "I look forward to seeing my family next weekend.",
    "The concert began with a lively piano piece.",
    "I listened to music while organizing my desk.",
    "She painted a picture of the village square.",
    "The theater was crowded on opening night.",
    "We watched a film about life in the countryside.",
    "The artist used bright colors in the exhibition.",
    "He practiced the guitar for an hour after school.",
    "A good story can introduce us to new ideas.",
    "The audience applauded at the end of the performance.",
    "We discussed our favorite books on the way home.",
    "The city is building a new public playground.",
    "Volunteers collected litter from the neighborhood park.",
    "We sorted the paper and plastic for recycling.",
    "The community center offers classes for all ages.",
    "A new bus route connects the nearby villages.",
    "Local farmers sell their produce every Sunday.",
    "We attended a meeting about improving the town.",
    "The street lights make the road safer at night.",
    "Small acts of kindness can make a lasting difference.",
    "I hope tomorrow brings another opportunity to learn."
];

async function runTranslationBenchmark(api, sentences, {
    signal,
    now = () => performance.now(),
    canDownload = () => navigator.userActivation.isActive,
    onProgress = () => {},
    onDownloadProgress = () => {}
}) {
    const options = { sourceLanguage: "en", targetLanguage: "zh-Hans", signal };
    let translator = null;
    let provisioning = null;
    let downloadMs = 0;
    try {
        signal.throwIfAborted();
        const availabilityStart = now();
        const availability = await api.availability({ sourceLanguage: "en", targetLanguage: "zh-Hans" });
        const availabilityMs = now() - availabilityStart;
        signal.throwIfAborted();
        if (availability === "unavailable") throw new Error("English to Simplified Chinese is not supported by this browser.");
        if (availability !== "available") {
            if (!canDownload()) throw new Error("Click Measure Perf again to start the language pack download.");
            onProgress("Downloading English to Chinese language pack...");
            const downloadStart = now();
            provisioning = await api.create({
                ...options,
                monitor: monitor => monitor.addEventListener("downloadprogress", event => {
                    if (!signal.aborted) onDownloadProgress(Math.round(event.loaded * 100));
                })
            });
            downloadMs = now() - downloadStart;
            signal.throwIfAborted();
            provisioning.destroy();
            provisioning = null;
        }
        onProgress("Setting up translator...");
        const setupStart = now();
        translator = await api.create(options);
        const setupMs = availabilityMs + now() - setupStart;
        signal.throwIfAborted();
        if (typeof translator.translateStreaming !== "function") {
            throw new Error("This benchmark requires Translator.translateStreaming() to measure first-chunk latency.");
        }
        const translations = [];
        let initialLatencyMs = null;
        let inputCharacters = 0;
        let outputCharacters = 0;
        let translationMs = 0;
        for (const sentence of sentences) {
            signal.throwIfAborted();
            onProgress(`Translating sentence ${translations.length + 1} of ${sentences.length}...`);
            signal.throwIfAborted();
            let translated = "";
            const start = now();
            const stream = translator.translateStreaming(sentence, { signal });
            for await (const chunk of stream) {
                signal.throwIfAborted();
                if (chunk && initialLatencyMs === null) initialLatencyMs = now() - start;
                translated += chunk;
            }
            const duration = now() - start;
            if (!translated.trim()) throw new Error(`Sentence ${translations.length + 1} produced an empty translation.`);
            translations.push(translated);
            translationMs += duration;
            inputCharacters += Array.from(sentence).length;
            outputCharacters += Array.from(translated).length;
        }
        signal.throwIfAborted();
        if (initialLatencyMs === null || translationMs <= 0) {
            throw new Error("No measurable translation output was produced. Run the benchmark again.");
        }
        return {
            downloadRequired: availability !== "available",
            downloadMs, setupMs, initialLatencyMs,
            initialInputCharacters: Array.from(sentences[0]).length,
            inputCharacters, outputCharacters, translationMs,
            averageCps: outputCharacters * 1000 / translationMs,
            sentenceCount: translations.length,
            translations
        };
    } finally {
        provisioning?.destroy();
        translator?.destroy();
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { PERF_SENTENCES, runTranslationBenchmark };
}
