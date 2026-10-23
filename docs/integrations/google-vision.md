# Google Cloud Vision (receipt OCR) - what was read and what was not

Read on 2026-10-23 (16.8). The web pages `cloud.google.com/vision/docs/*` redirect to `docs.cloud.google.com`, which this environment cannot reach (proxy answers 403). The official machine readable description of the API was reachable and was read instead: the Google API discovery document `https://vision.googleapis.com/$discovery/rest?version=v1` (title "Cloud Vision API", revision 20260918). Everything below comes from it. It is the reference for the request and response shapes; it carries no guides, prices or quotas.

## Read (used)

- Method `images.annotate`: `POST https://vision.googleapis.com/v1/images:annotate`, scopes `cloud-platform` or `cloud-vision`. Body `BatchAnnotateImagesRequest`: `requests[]` (required), optional `parent` (`projects/{project-id}/locations/{location-id}`; "if no parent is specified, a region will be chosen automatically"), optional `labels`.
- `AnnotateImageRequest`: `image`, `features[]`, optional `imageContext`.
- `Image`: `content` (base64 in JSON; it takes precedence over `source` when both are given) or `source.imageUri` (a `gs://` object or a public URL).
- `Feature`: `type` (`DOCUMENT_TEXT_DETECTION` = "dense text document OCR"; `TEXT_DETECTION` is for text inside a larger image; the first takes precedence when both are present), `model` (`builtin/stable` default, `builtin/latest`, `builtin/rc` for the two text types). `maxResults` does not apply to the text types.
- `ImageContext.languageHints[]`: "In most cases, an empty value yields the best results since it enables automatic language detection."
- Response `BatchAnnotateImagesResponse.responses[]` of `AnnotateImageResponse`: `fullTextAnnotation` (`text`, `pages[]`), `textAnnotations[]`, and `error` (a `Status`: `code`, `message`, `details`). "Filled-in image annotations are guaranteed to be correct, even when `error` is set." So an `error` inside one response is an error of that image, not of the call.
- `TextAnnotation` -> `Page` (`width`, `height`, `confidence` 0..1, `blocks[]`) -> `Block` (`blockType` TEXT, TABLE, PICTURE, RULER, BARCODE; `confidence`; `paragraphs[]`) -> `Paragraph` (`confidence`, `words[]`) -> `Word` (`confidence`, `symbols[]`) -> `Symbol` (`text`, `confidence` 0..1). `TextProperty.detectedBreak.type`: `SPACE`, `SURE_SPACE`, `EOL_SURE_SPACE` ("line-wrapping break"), `HYPHEN` ("end-line hyphen that is not present in text"), `LINE_BREAK` ("line break that ends a paragraph"). These are used to rebuild the lines of a receipt and a confidence for each line.
- Authentication, as listed in the common parameters: `key` ("API key. Required unless you provide an OAuth 2.0 token") or an OAuth 2.0 token. This platform uses an API key that each company brings and pastes; it is sent as the `key` query parameter (the only way the document shows). The address is therefore never logged and never put in an error text.

## Not read (not built)

- Prices, free tier, quotas and rate limits, the maximum size of an image or request, supported image formats beyond what Google's own pages say elsewhere, PDF and TIFF handling (`files.annotate`, `files.asyncBatchAnnotate`), error code meanings, service account / OAuth token flows, data location and retention terms, and the `X-Goog-Api-Key` header.
- So: only JPEG and PNG images are sent, at most 4 MB (our own cautious limit; the real limit is unknown to us), PDFs are not read (the job fails with a clear message and the expense service is told `null`), the daily limit per company is ours (default 200), and no `parent` is set (Google picks the region; the owner is told this when giving consent).
