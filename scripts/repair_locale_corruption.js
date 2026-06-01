/**
 * Repair char-index corruption in locale files.
 *
 * Background: a path-collision (a key used as BOTH a string label AND a namespace)
 * caused string values like "[AUTO] Status" to be spread character-by-character and
 * merged into the namespace object, producing entries like:
 *   "status": { "0": "[", "1": "A", ... , "notConfigured": "...", "unknown": "..." }
 *
 * This script surgically removes the numeric char-index keys:
 *   - MIXED object (numeric run + real sibling keys): drop the numeric keys, keep siblings.
 *   - PURE object (only a numeric run): replace the object with the rejoined string,
 *     stripped of a leading [AUTO]/[XX] placeholder tag.
 *
 * Usage:
 *   node scripts/repair_locale_corruption.js --dry   # report only, no writes
 *   node scripts/repair_locale_corruption.js          # apply repairs
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '../frontend/public/locales');
const DRY = process.argv.includes('--dry');

function isObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
}

// Max length of a char-fragment value. Real indexed lists (query.examples,
// *.items) hold full phrases; corruption holds single chars / short fragments.
const FRAGMENT_MAX_LEN = 3;

// Returns { keys: [...numericKeysInOrder], rejoined: string } if `obj` contains a
// contiguous char-index run "0".."k" (k>=1) whose values are all short string
// fragments (the spread-string corruption signature), else null.
//
// Deliberately does NOT match legitimate indexed lists:
//   - `errors` ({"404":"404","500":"500",...}) — no 0-based run, so excluded.
//   - `query.examples` / `*.items` ({"0":"Full sentence",...}) — values are long, so excluded.
function detectCharIndexRun(obj) {
    // Find the maximal contiguous run 0,1,2,...,k.
    let k = -1;
    while (Object.prototype.hasOwnProperty.call(obj, String(k + 1))) k++;
    if (k < 1) return null; // need at least "0" and "1"

    const keys = [];
    for (let i = 0; i <= k; i++) {
        const val = obj[String(i)];
        if (typeof val !== 'string' || val.length > FRAGMENT_MAX_LEN) return null;
        keys.push(String(i));
    }

    const rejoined = keys.map(rk => obj[rk]).join('');
    return { keys, rejoined };
}

function stripPlaceholderTag(s) {
    // "[AUTO] Status", "[EN] foo.bar", "[AUTO]6Status" -> best-effort clean string.
    return s.replace(/^\[[A-Z]+\]\s*/, '').replace(/^\d+/, '').trim();
}

const report = [];

// Recursively repair `obj` in place. `keyPath` is for reporting. Returns the value
// that should replace `obj` in its parent (the object itself, or a string for PURE case).
function repair(obj, keyPath) {
    if (!isObject(obj)) return obj;

    // Recurse into children first.
    for (const key of Object.keys(obj)) {
        if (isObject(obj[key])) {
            obj[key] = repair(obj[key], keyPath ? `${keyPath}.${key}` : key);
        }
    }

    const run = detectCharIndexRun(obj);
    if (!run) return obj;

    const realKeys = Object.keys(obj).filter(k => !/^\d+$/.test(k));

    if (realKeys.length > 0) {
        // MIXED: drop the numeric keys, keep real siblings.
        for (const k of run.keys) delete obj[k];
        report.push({ keyPath, action: 'dropped char-index run', rejoined: run.rejoined, kept: realKeys });
        return obj;
    }

    // PURE: replace the whole object with the cleaned rejoined string.
    const cleaned = stripPlaceholderTag(run.rejoined);
    report.push({ keyPath, action: 'object -> string', rejoined: run.rejoined, value: cleaned });
    return cleaned;
}

function main() {
    const langs = fs.readdirSync(LOCALES_DIR)
        .filter(d => fs.statSync(path.join(LOCALES_DIR, d)).isDirectory());

    let changedFiles = 0;

    for (const lang of langs) {
        const filePath = path.join(LOCALES_DIR, lang, 'translation.json');
        if (!fs.existsSync(filePath)) continue;

        const raw = fs.readFileSync(filePath, 'utf8');
        const hadTrailingNewline = /\n$/.test(raw);
        const usesCRLF = /\r\n/.test(raw); // preserve original line endings (Windows files are CRLF)
        let json;
        try {
            json = JSON.parse(raw);
        } catch (e) {
            console.error(`SKIP ${lang}: invalid JSON (${e.message})`);
            continue;
        }

        const before = report.length;
        const repaired = repair(json, '');
        const fixes = report.slice(before);

        if (fixes.length === 0) continue;

        console.log(`\n[${lang}] ${fixes.length} corrupted block(s):`);
        for (const f of fixes) {
            console.log(`  - ${f.keyPath}: ${f.action} (rejoined="${f.rejoined}"` +
                (f.kept ? `, kept=[${f.kept.join(', ')}]` : `, value="${f.value}"`) + ')');
        }

        if (!DRY) {
            let out = JSON.stringify(repaired, null, 2) + (hadTrailingNewline ? '\n' : '');
            if (usesCRLF) out = out.replace(/\n/g, '\r\n'); // preserve original CRLF
            fs.writeFileSync(filePath, out, 'utf8');
        }
        changedFiles++;
    }

    console.log(`\n${DRY ? '[DRY] would repair' : 'Repaired'} ${report.length} block(s) across ${changedFiles} file(s).`);
}

main();
