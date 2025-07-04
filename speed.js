// Prompt API Speed Benchmark JavaScript

function getLanguageModel() {
    // Try the new API first, then fall back to legacy
    return window.LanguageModel ? window.LanguageModel : window.ai.languageModel;
}

const k1KTokenPrompt = `Summarize this text: The National Aeronautics and Space Administration (NASA /ˈnæsə/) is an independent agency of the U.S. federal government responsible for the civil space program, aeronautics research, and space research. Established in 1958, it succeeded the National Advisory Committee for Aeronautics (NACA) to give the U.S. space development effort a distinct civilian orientation, emphasizing peaceful applications in space science. It has since led most of America's space exploration programs, including Project Mercury, Project Gemini, the 1968–1972 Apollo Moon landing missions, the Skylab space station, and the Space Shuttle. Currently, NASA supports the International Space Station (ISS) along with the Commercial Crew Program, and oversees the development of the Orion spacecraft and the Space Launch System for the lunar Artemis program.

NASA's science division is focused on better understanding Earth through the Earth Observing System; advancing heliophysics through the efforts of the Science Mission Directorate's Heliophysics Research Program; exploring bodies throughout the Solar System with advanced robotic spacecraft such as New Horizons and planetary rovers such as Perseverance; and researching astrophysics topics, such as the Big Bang, through the James Webb Space Telescope, the four Great Observatories, and associated programs. The Launch Services Program oversees launch operations for its uncrewed launches.

History
Creation
Main articles: Creation of NASA and National Advisory Committee for Aeronautics

A U.S. Air Force Bell X-1 test flight
NASA traces its roots to the National Advisory Committee for Aeronautics (NACA). Despite being the birthplace of aviation, by 1914 the United States recognized that it was far behind Europe in aviation capability. Determined to regain American leadership in aviation, the United States Congress created the Aviation Section of the U.S. Army Signal Corps in 1914 and established NACA in 1915 to foster aeronautical research and development. Over the next forty years, NACA would conduct aeronautical research in support of the U.S. Air Force, U.S. Army, U.S. Navy, and the civil aviation sector. After the end of World War II, NACA became interested in the possibilities of guided missiles and supersonic aircraft, developing and testing the Bell X-1 in a joint program with the U.S. Air Force. NACA's interest in space grew out of its rocketry program at the Pilotless Aircraft Research Division.[4]


Launch of the Army Ballistic Missile Agency's Explorer 1, America's first satellite
The Soviet Union's launch of Sputnik 1 ushered in the Space Age and kicked off the Space Race. Despite NACA's early rocketry program, the responsibility for launching the first American satellite fell to the Naval Research Laboratory's Project Vanguard, whose operational issues ensured the Army Ballistic Missile Agency would launch Explorer 1, America's first satellite, on February 1, 1958.

The Eisenhower Administration decided to split the United States' military and civil spaceflight programs, which were organized together under the Defense Department's Advanced Research Projects Agency. NASA was established on July 29, 1958, with the signing of the National Aeronautics and Space Act and it began operations on October 1, 1958.[4]

As the United States' premier aeronautics agency, NACA formed the core of NASA's new structure by reassigning 8,000 employees and three major research laboratories. NASA also proceeded to absorb the Naval Research Laboratory's Project Vanguard, the Army's Jet Propulsion Laboratory (JPL), and the Army Ballistic Missile Agency under Wernher von Braun. This left NASA firmly as the United States' civil space lead and the Air Force as the military space lead.[4]

First orbital and hypersonic flights
Main article: Project Mercury

Launch of Friendship 7, NASA's first orbital flight, February 20, 1962
Plans for human spaceflight began in`;

const k1KTokenPrompt2 = `Summarize this text: In computer science, the Earley parser is an algorithm for parsing strings that belong to a given context-free language, though (depending on the variant) it may suffer problems with certain nullable grammars.[1] The algorithm, named after its inventor, Jay Earley, is a chart parser that uses dynamic programming; it is mainly used for parsing in computational linguistics. It was first introduced in his dissertation[2] in 1968 (and later appeared in an abbreviated, more legible, form in a journal[3]).

Earley parsers are appealing because they can parse all context-free languages, unlike LR parsers and LL parsers, which are more typically used in compilers but which can only handle restricted classes of languages. The Earley parser executes in cubic time in the general case 
O
(
n
3
)
{\displaystyle {O}(n^{3})}, where n is the length of the parsed string, quadratic time for unambiguous grammars 
O
(
n
2
)
{\displaystyle {O}(n^{2})},[4] and linear time for all deterministic context-free grammars. It performs particularly well when the rules are written left-recursively.

Earley recogniser
The following algorithm describes the Earley recogniser. The recogniser can be modified to create a parse tree as it recognises, and in that way can be turned into a parser.

The algorithm
In the following descriptions, α, β, and γ represent any string of terminals/nonterminals (including the empty string), X and Y represent single nonterminals, and a represents a terminal symbol.

Earley's algorithm is a top-down dynamic programming algorithm. In the following, we use Earley's dot notation: given a production X → αβ, the notation X → α • β represents a condition in which α has already been parsed and β is expected.

Input position 0 is the position prior to input. Input position n is the position after accepting the nth token. (Informally, input positions can be thought of as locations at token boundaries.) For every input position, the parser generates a state set. Each state is a tuple (X → α • β, i), consisting of

the production currently being matched (X → α β)
the current position in that production (visually represented by the dot •)
the position i in the input at which the matching of this production began: the origin position
(Earley's original algorithm included a look-ahead in the state; later research showed this to have little practical effect on the parsing efficiency, and it has subsequently been dropped from most implementations.)

A state is finished when its current position is the last position of the right side of the production, that is, when there is no symbol to the right of the dot • in the visual representation of the state.

The state set at input position k is called S(k). The parser is seeded with S(0) consisting of only the top-level rule. The parser then repeatedly executes three operations: prediction, scanning, and completion.

Prediction: For every state in S(k) of the form (X → α • Y β, j) (where j is the origin position as above), add (Y → • γ, k) to S(k) for every production in the grammar with Y on the left-hand side (Y → γ).
Scanning: If a is the next symbol in the input stream, for every state in S(k) of the form (X → α • a β, j), add (X → α a • β, j) to S(k+1).
Completion: For every state in S(k) of the form (Y → γ •, j), find all states in S(j) of the form (X → α • Y β, i) and add (X → α Y • β, i) to S(k).
Duplicate states are not added to the state set, only new ones. These three operations are repeated until no new states can be added to the set. The set is generally implemented as a queue of states to process, with the operation to be performed depending on what kind of state it is.

The algorithm accepts if (X → γ •, 0) ends up in S(n), where (X → γ) is the top level-rule and n the input length, otherwise it rejects.

Pse`;

// Error handling and utility functions
let success = true;
const kFeatureFlagError = "Prompt API is not detected. Check feature flags are enabled, and that this is Canary.</li>";
const kNoModelError = "Prompt API is available, feature flag is likely set correctly but no models are available.";
const kDownloadError = "Prompt API is available, but model hasn't downloaded. To run benchmark, please try after model download.";

function showError(message, isDownloading = false) {
    document.getElementById("model-status").innerText = message;
    if (isDownloading) {
        document.getElementById("model-icon").className = "material-icons text-yellow-400";
        document.getElementById("model-icon").innerText = "downloading";
        document.getElementById("download-btn").classList.add("hidden");
    } else {
        document.getElementById("model-icon").className = "material-icons text-red-400";
        document.getElementById("model-icon").innerText = "error";
        // Show download button for downloadable state
        if (message.includes("downloadable")) {
            document.getElementById("download-btn").classList.remove("hidden");
        }
    }
    showBusy(false);
    throw new Error(message);
}


function showBusy(busy) {
    const statusElement = document.getElementById("benchmark-status");
    const progressContainer = document.getElementById("progress-container");
    const progressBar = document.getElementById("progress-bar");
    
    if (busy) {
        statusElement.innerText = "Running";
        statusElement.className = "text-yellow-400";
        progressContainer.classList.remove("hidden");
        
        // Start continuous progress animation
        let progress = 0;
        const interval = setInterval(() => {
            progress = (progress + 2) % 100;
            progressBar.style.width = progress + "%";
        }, 50);
        
        // Store interval ID for cleanup
        progressContainer.dataset.intervalId = interval;
    } else {
        statusElement.innerText = "Ready";
        statusElement.className = "";
        progressContainer.classList.add("hidden");
        
        // Clear the progress animation
        const intervalId = progressContainer.dataset.intervalId;
        if (intervalId) {
            clearInterval(parseInt(intervalId));
            delete progressContainer.dataset.intervalId;
        }
        progressBar.style.width = "0%";
    }
}

// Benchmark functions
const kMillisecond = 1000;
let session_controller = null;

async function CheckCapabilitiesAndCreateSession() {
    try {
        result = await getLanguageModel().availability();
        if (result == 'unavailable') {
            showError(kNoModelError);
        }
        if (result == 'downloadable' || result == 'downloading') {
            // call the API to trigger download.
            showError(kDownloadError);
        }
        if (result != 'available') {
            showError("Cannot create model now - " + result);
        }
    }
    catch (e) {
        if (e.name === "TypeError") {
            showError(kFeatureFlagError);
        }
    }
    var session = null;
    try {
        session_controller = new AbortController();
        session = await getLanguageModel().create({temperature: 1.0, topK: 1, signal: session_controller.signal});
        return session;
    }
    catch (e) {
        showError("Cannot create session now - " + e);
    }
    return null;
}

async function MeasureLoadTime(prompt, element) {
    try {
        showBusy(true);
        let start = performance.now();
        // Check capabilities.
        let session = await CheckCapabilitiesAndCreateSession();
        let stream = session.promptStreaming(prompt);
        let end = start;
        let is_first_token = true;
        for await (const chunk of stream) {
            if (is_first_token) {
                is_first_token = false;
                end = performance.now();
            } else {
                session_controller.abort();
            }
        }
        showBusy(false);
        element.innerText = (end - start).toFixed(2);
        return (end - start);
    }
    catch (e) {
        showError("Something went wrong " + e);
    }
}

async function MeasureTPS(prompt, element1, element2, element3) {
    showBusy(true);
    let start = 0;
    let interval1 = 0;
    let interval2 = 0;
    // Check capabilities.
    let session = await CheckCapabilitiesAndCreateSession();
    let stream = session.promptStreaming(prompt);
    let count = 0;
    const num_ignore_tokens = 10;
    const num_initial_tokens = 50;
    const num_final_tokens = 100;
    element3.innerText = "";
    for await (const chunk of stream) {
        count ++;
        element3.innerText = chunk;
        if (count == num_ignore_tokens) {
            start = performance.now();
        }
        else if (count == num_initial_tokens) {
            let end = performance.now();
            interval1 = (((num_initial_tokens-num_ignore_tokens)*kMillisecond)/(end - start));
            element1.innerText = (interval1).toFixed(2);
            start = performance.now();
        }
        else if (count == num_final_tokens) {
            let end = performance.now();
            interval2 = (((num_final_tokens-num_initial_tokens)*kMillisecond)/(end - start));
            element2.innerText = (interval2).toFixed(2);
            break;
        }
    }
    for await (const chunk of stream) {
        // Drain the stream.
    }
    showBusy(false);
    if (interval1 == 0 || interval2 == 0) {
        showError("Failed to measure, response was likley < " + num_final_tokens + " tokens.");
    }
    return {interval1, interval2};
}

async function RunPrefillTest() {
    let duration = await MeasureLoadTime(k1KTokenPrompt2, document.getElementById("1kt1"));
    duration += await MeasureLoadTime(k1KTokenPrompt, document.getElementById("1kt2"));
    duration += await MeasureLoadTime(k1KTokenPrompt2, document.getElementById("1kt3"));
    duration += await MeasureLoadTime(k1KTokenPrompt, document.getElementById("1kt4"));
    duration += await MeasureLoadTime(k1KTokenPrompt2, document.getElementById("1kt5"));
    document.getElementById("time-to-prefill-1k").innerText = (duration / 5).toFixed(2);
}

async function RunTPStest() {
    try {
        let result;
        let duration1 = 0;
        let duration2 = 0;
        let scratch = document.getElementById("scratch-tps");
        result = await MeasureTPS("Write me a poem about LLMs", document.getElementById("tps1-1"), document.getElementById("tps1-2"), scratch);
        duration1 += result.interval1;
        duration2 += result.interval2;
        result = await MeasureTPS("Tell me funny story.", document.getElementById("tps2-1"), document.getElementById("tps2-2"), scratch);
        duration1 += result.interval1;
        duration2 += result.interval2;
        result = await MeasureTPS("Explain thermodynamics in simple terms.", document.getElementById("tps3-1"), document.getElementById("tps3-2"), scratch);
        duration1 += result.interval1;
        duration2 += result.interval2;
        result = await MeasureTPS("Write me an essay about planet earth.", document.getElementById("tps4-1"), document.getElementById("tps4-2"), scratch);
        duration1 += result.interval1;
        duration2 += result.interval2;
        result = await MeasureTPS("Write me a poem about web browsers.", document.getElementById("tps5-1"), document.getElementById("tps5-2"), scratch);
        duration1 += result.interval1;
        duration2 += result.interval2;
        document.getElementById("tps-result").innerText = ((duration1 + duration2) / 10).toFixed(2);
        scratch.innerText = "";
    }
    catch (e) {
        showError("Something went wrong " + e);
    }
}

async function MeasureAll() {
    await MeasureLoadTime("Hi", document.getElementById("time-to-first-token"));
    await RunPrefillTest();
    await RunTPStest();
}

function saveResults() {
    const timeToFirstToken = document.getElementById('time-to-first-token').innerText;
    const timeToPrefill1k = document.getElementById('time-to-prefill-1k').innerText;
    const tpsResult = document.getElementById('tps-result').innerText;

    const browserInfo = getBrowserInfo();
    const gpuInfo = getGpuInfo();

    const [browserName, browserVersion] = browserInfo.split(' ');

    const data = [
        new Date().toLocaleDateString(), // Date
        browserName, // Browser
        browserVersion, // Browser Version
        gpuInfo, // GPU Info
        timeToFirstToken, // Time to first token
        timeToPrefill1k, // Time to prefill 1K tokens (ms)
        tpsResult // Time to generate tokens (tps)
    ];

    const clipboardData = data.join('\t');

    navigator.clipboard.writeText(clipboardData).then(() => {
        console.log('Results copied to clipboard');
    }).catch(err => {
        console.showError('Error copying to clipboard', err);
    });
}

function getBrowserInfo() {
    const userAgent = navigator.userAgent;
    let browserName = 'Unknown';
    let browserVersion = 'Unknown';

    if (userAgent.indexOf('Firefox') > -1) {
        browserName = 'Firefox';
        browserVersion = userAgent.match(/Firefox\/([0-9]+(?:\.[0-9]+)*)/)[1];
    } else if (userAgent.indexOf('Edg') > -1) {
        browserName = 'Edge';
        browserVersion = userAgent.match(/Edg\/([0-9]+(?:\.[0-9]+)*)/)[1];
    } else if (userAgent.indexOf('Chrome') > -1) {
        browserName = 'Chrome';
        browserVersion = userAgent.match(/Chrome\/([0-9]+(?:\.[0-9]+)*)/)[1];
    } else if (userAgent.indexOf('Safari') > -1) {
        browserName = 'Safari';
        browserVersion = userAgent.match(/Version\/([0-9]+(?:\.[0-9]+)*)/)[1];
    }

    return `${browserName} ${browserVersion}`;
}

function getGpuInfo() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
        return 'WebGL not supported';
    }
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
}
