"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chunkText = chunkText;
function chunkText(text, options = {}) {
    var _a, _b;
    const maxChars = (_a = options.maxChars) !== null && _a !== void 0 ? _a : 1000;
    const overlap = Math.min((_b = options.overlap) !== null && _b !== void 0 ? _b : 100, Math.max(0, maxChars - 1));
    const result = [];
    if (!text)
        return result;
    let start = 0;
    while (start < text.length) {
        const end = Math.min(text.length, start + maxChars);
        result.push(text.slice(start, end));
        if (end >= text.length)
            break;
        start = end - overlap;
    }
    return result;
}
