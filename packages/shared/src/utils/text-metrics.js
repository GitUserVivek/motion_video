"use strict";
/**
 * Small, dependency-free text measurement shared by the renderer and the
 * pre-render layout validator.
 *
 * The backend cannot load a browser font, but an approximate measurement is
 * enough to catch a title that would need six lines and cover the artwork. The
 * renderer uses the same numbers, so validation and the actual frame agree on
 * what “too long” means.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateTextWidth = estimateTextWidth;
exports.estimateTextBox = estimateTextBox;
exports.fitFontSize = fitFontSize;
/** Average advance width of a bold Segoe UI glyph, in em. */
const AVG_CHAR_EM = 0.55;
const LINE_HEIGHT = 1.3;
function estimateTextWidth(text, fontSize) {
    const longest = text
        .split(/\n+/)
        .reduce((max, line) => Math.max(max, line.trim().length), 0);
    return longest * fontSize * AVG_CHAR_EM;
}
function estimateTextBox(text, fontSize, maxWidth, lineHeight = LINE_HEIGHT) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return { width: 0, height: 0, lines: 0 };
    const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * AVG_CHAR_EM)));
    let lines = 1;
    let current = 0;
    for (const word of words) {
        const addition = (current > 0 ? 1 : 0) + word.length;
        if (current + addition > maxChars && current > 0) {
            lines++;
            current = word.length;
        }
        else {
            current += addition;
        }
    }
    return {
        width: Math.min(maxWidth, estimateTextWidth(text, fontSize)),
        height: lines * fontSize * lineHeight,
        lines,
    };
}
/** Shrink a long title until it fits the available box, never below `minSize`. */
function fitFontSize(text, maxWidth, maxHeight, preferred, minSize = 28) {
    let size = preferred;
    while (size > minSize && estimateTextBox(text, size, maxWidth).height > maxHeight) {
        size -= 2;
    }
    return size;
}
