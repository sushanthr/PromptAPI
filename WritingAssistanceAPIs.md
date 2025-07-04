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