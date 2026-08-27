/**
 * The one typeface a SkyQuotes document is set in.
 *
 * Grayson, 2026-08-27: "Remove font selection: all text should be montserrat."
 * So this isn't a default that a theme or a text selection can override — it's
 * the answer. The theme's heading/body font settings and the toolbar's
 * font-family dropdown are both gone, and the `fontFamily` mark is no longer
 * registered, so a template written when those existed renders in Montserrat
 * too rather than keeping whatever it was set to.
 *
 * Loaded in `index.html` alongside the app's own faces. The fallbacks matter
 * more than they look: a document is also rendered offscreen for signature
 * field measurement, and text measured in a fallback face is text placed
 * wrongly — the sender waits on `document.fonts.ready` before measuring for
 * exactly that reason (see `SignatureSender`).
 */
export const DOCUMENT_FONT = "'Montserrat', 'Helvetica Neue', Arial, sans-serif";
