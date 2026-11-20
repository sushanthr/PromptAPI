## Translation demo

Open [Translation](translation.htm) to translate text using the standard
`LanguageDetector` and `Translator` APIs. Each page load prefills a Tamil
sample paragraph that can be cleared or replaced. The text area sizes itself to
fit the full paragraph, including wrapped lines on narrow screens. Automatic detection
can be overridden; the destination defaults to the browser language, or English.

Serve the site over HTTPS or localhost. A supporting browser is required, and
language-pair support varies by browser. Click **Install LID model** beside the
source dropdown when the detection model needs downloading.
Detection confidence is shown in the source-language options.
Choosing languages checks pack availability;
The action button changes to **Download language pack** when a pack is needed.
Clicking it downloads the pack, displays progress, and translates the text;
the button switches back to **Translate** once the pack is ready.
Unsupported pairs and download errors are reported without using a cloud fallback.
The browser manages downloaded packs; changing text or languages cancels pending
translation so stale results are not displayed.

**Measure Perf** translates 100 fixed English sentences individually to Simplified
Chinese, downloading the pack if needed. **Stop Perf** cancels setup or translation.
Initial latency is the time from submitting the first sentence to its first
nonempty streamed chunk, with that sentence's input character count reported.
Average output CPS is total Unicode output characters divided by the sum of the
100 translation durations, including their latency but excluding download,
setup, progress rendering, and inter-sentence bookkeeping.

Download/provisioning overhead is reported separately from translator setup.
Provisioning times the first `create()` when a download is needed, which includes
both download and first initialization because the API does not expose pure
download timing. Setup includes the availability check and a fresh `create()`
after the pack is ready. Already-installed packs have zero provisioning overhead.
The benchmark reuses that translator for all sentences and releases it afterward.
It does not replace the editor text or selected languages.

See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Translator_and_Language_Detector_APIs/Using)
and the [proposal](https://github.com/webmachinelearning/translation-api).
Run the focused tests with `node --test translation.test.js`.

## Speech demo

Open [Speech](speech.htm) for speech recognition from a microphone
or a local audio/video file. The page uses the same card layout and theme as
Translation, with input language and audio source selectors, a live audio meter,
media preview, and final/interim transcripts.

Serve over HTTPS or localhost and use a browser supporting local
`SpeechRecognition`, including `available()`, `install()`, `processLocally`,
and `start(audioTrack)`. In supporting Microsoft Edge builds, enable **Speech
Recognition with on-device model** in `edge://flags`.
See [setup and supported languages](https://learn.microsoft.com/microsoft-edge/web-platform/speech-recognition-api).
The **Recognition mode** toggle defaults to **On-device**. Switching to **Cloud**
uses the browser's speech service and may send audio off-device; it requires a
network connection and browser/service support. Cloud mode does not check or
install local models and works without the local-recognition API extensions.
There is no automatic cloud fallback, and the toggle is locked during setup
and recognition. **Start** checks and installs the selected language
model in On-device mode if necessary, then requests microphone permission or plays the selected
file. **Stop** retains final text; **Reset** cancels pending setup, clears the
transcript and file, and releases audio resources. The browser's model download
cannot be canceled by the page, but canceled setup will not start recognition.
File playback requires a browser that supports recognition from an audio track.
Run focused tests with `node --test speech.test.js`.

## Writing assistance interfaces

[Exposed=Window, SecureContext]
interface Summarizer {
  static Promise<Summarizer> create(optional SummarizerCreateOptions options = {});
  static Promise<Availability> availability(optional SummarizerCreateCoreOptions options = {});

  Promise<DOMString> summarize(
    DOMString input,
    optional SummarizerSummarizeOptions options = {}
  );
  ReadableStream summarizeStreaming(
    DOMString input,
    optional SummarizerSummarizeOptions options = {}
  );

  readonly attribute DOMString sharedContext;
  readonly attribute SummarizerType type;
  readonly attribute SummarizerFormat format;
  readonly attribute SummarizerLength length;

  readonly attribute FrozenArray<DOMString>? expectedInputLanguages;
  readonly attribute FrozenArray<DOMString>? expectedContextLanguages;
  readonly attribute DOMString? outputLanguage;

  Promise<double> measureInputUsage(
    DOMString input,
    optional SummarizerSummarizeOptions options = {}
  );
  readonly attribute unrestricted double inputQuota;
};
Summarizer includes DestroyableModel;

dictionary SummarizerCreateCoreOptions {
  SummarizerType type = "key-points";
  SummarizerFormat format = "markdown";
  SummarizerLength length = "short";

  sequence<DOMString> expectedInputLanguages;
  sequence<DOMString> expectedContextLanguages;
  DOMString outputLanguage;
};

dictionary SummarizerCreateOptions : SummarizerCreateCoreOptions {
  AbortSignal signal;
  CreateMonitorCallback monitor;

  DOMString sharedContext;
};

dictionary SummarizerSummarizeOptions {
  AbortSignal signal;
  DOMString context;
};

enum SummarizerType { "tldr", "teaser", "key-points", "headline" };
enum SummarizerFormat { "plain-text", "markdown" };
enum SummarizerLength { "short", "medium", "long" };

[Exposed=Window, SecureContext]
interface Writer {
  static Promise<Writer> create(optional WriterCreateOptions options = {});
  static Promise<Availability> availability(optional WriterCreateCoreOptions options = {});

  Promise<DOMString> write(
    DOMString input,
    optional WriterWriteOptions options = {}
  );
  ReadableStream writeStreaming(
    DOMString input,
    optional WriterWriteOptions options = {}
  );

  readonly attribute DOMString sharedContext;
  readonly attribute WriterTone tone;
  readonly attribute WriterFormat format;
  readonly attribute WriterLength length;

  readonly attribute FrozenArray<DOMString>? expectedInputLanguages;
  readonly attribute FrozenArray<DOMString>? expectedContextLanguages;
  readonly attribute DOMString? outputLanguage;

  Promise<double> measureInputUsage(
    DOMString input,
    optional WriterWriteOptions options = {}
  );
  readonly attribute unrestricted double inputQuota;
};
Writer includes DestroyableModel;

dictionary WriterCreateCoreOptions {
  WriterTone tone = "neutral";
  WriterFormat format = "markdown";
  WriterLength length = "short";

  sequence<DOMString> expectedInputLanguages;
  sequence<DOMString> expectedContextLanguages;
  DOMString outputLanguage;
};

dictionary WriterCreateOptions : WriterCreateCoreOptions {
  AbortSignal signal;
  CreateMonitorCallback monitor;

  DOMString sharedContext;
};

dictionary WriterWriteOptions {
  DOMString context;
  AbortSignal signal;
};

enum WriterTone { "formal", "neutral", "casual" };
enum WriterFormat { "plain-text", "markdown" };
enum WriterLength { "short", "medium", "long" };

[Exposed=Window, SecureContext]
interface Rewriter {
  static Promise<Rewriter> create(optional RewriterCreateOptions options = {});
  static Promise<Availability> availability(optional RewriterCreateCoreOptions options = {});

  Promise<DOMString> rewrite(
    DOMString input,
    optional RewriterRewriteOptions options = {}
  );
  ReadableStream rewriteStreaming(
    DOMString input,
    optional RewriterRewriteOptions options = {}
  );

  readonly attribute DOMString sharedContext;
  readonly attribute RewriterTone tone;
  readonly attribute RewriterFormat format;
  readonly attribute RewriterLength length;

  readonly attribute FrozenArray<DOMString>? expectedInputLanguages;
  readonly attribute FrozenArray<DOMString>? expectedContextLanguages;
  readonly attribute DOMString? outputLanguage;

  Promise<double> measureInputUsage(
    DOMString input,
    optional RewriterRewriteOptions options = {}
  );
  readonly attribute unrestricted double inputQuota;
};
Rewriter includes DestroyableModel;

dictionary RewriterCreateCoreOptions {
  RewriterTone tone = "as-is";
  RewriterFormat format = "as-is";
  RewriterLength length = "as-is";

  sequence<DOMString> expectedInputLanguages;
  sequence<DOMString> expectedContextLanguages;
  DOMString outputLanguage;
};

dictionary RewriterCreateOptions : RewriterCreateCoreOptions {
  AbortSignal signal;
  CreateMonitorCallback monitor;

  DOMString sharedContext;
};

dictionary RewriterRewriteOptions {
  DOMString context;
  AbortSignal signal;
};

enum RewriterTone { "as-is", "more-formal", "more-casual" };
enum RewriterFormat { "as-is", "plain-text", "markdown" };
enum RewriterLength { "as-is", "shorter", "longer" };

[Exposed=Window, SecureContext]
interface CreateMonitor : EventTarget {
  attribute EventHandler ondownloadprogress;
};

callback CreateMonitorCallback = undefined (CreateMonitor monitor);

enum Availability {
  "unavailable",
  "downloadable",
  "downloading",
  "available"
};

interface mixin DestroyableModel {
  undefined destroy();
};