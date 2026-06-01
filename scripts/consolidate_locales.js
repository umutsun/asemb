const fs = require('fs');
const path = require('path');

// Resolve relative to this file so the script is portable (was a hardcoded
// Windows path, which broke it on the Linux VPS).
const localesDir = path.join(__dirname, '..', 'frontend', 'public', 'locales');

function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

// Max length of a char-fragment value in the spread-string corruption.
const FRAGMENT_MAX_LEN = 3;

// Strip char-index corruption ("status": { "0":"S","1":"t",..., notConfigured })
// that results from a key being used as BOTH a string label and a namespace.
// Only drops the numeric run when real named siblings exist (the proven corruption
// shape) — legitimate indexed lists (query.examples, *.items: long values, no named
// siblings; errors: keys like "404") are left untouched.
function stripCharIndex(obj) {
    if (!isObject(obj)) return obj;
    for (const key of Object.keys(obj)) {
        if (isObject(obj[key])) obj[key] = stripCharIndex(obj[key]);
    }
    let k = -1;
    while (Object.prototype.hasOwnProperty.call(obj, String(k + 1))) k++;
    if (k < 1) return obj; // need at least "0" and "1"
    for (let i = 0; i <= k; i++) {
        const v = obj[String(i)];
        if (typeof v !== 'string' || v.length > FRAGMENT_MAX_LEN) return obj;
    }
    const named = Object.keys(obj).filter(x => !/^\d+$/.test(x));
    if (named.length === 0) return obj; // pure numeric = legitimate list, keep it
    for (let i = 0; i <= k; i++) delete obj[String(i)];
    return obj;
}

// Flatten object to map of paths -> values
function flatten(obj, prefix = '', res = {}) {
    for (const key in obj) {
        const val = obj[key];
        const newKey = prefix ? `${prefix}.${key}` : key;
        if (isObject(val)) {
            flatten(val, newKey, res);
        } else {
            res[newKey] = val;
        }
    }
    return res;
}

// Unflatten map to object — collision-safe. If the same path is used as both a
// string leaf and a namespace, the NAMESPACE always wins (the leaf is dropped)
// rather than spreading the string into char-index keys. This is the bug that
// produced "status": { "0":"S", "1":"t", ... }.
function unflatten(data) {
    const result = {};
    for (const flatKey of Object.keys(data)) {
        const keys = flatKey.split('.');
        let node = result;
        for (let i = 0; i < keys.length; i++) {
            const e = keys[i];
            const last = i === keys.length - 1;
            if (last) {
                if (isObject(node[e])) continue; // don't clobber a namespace with a leaf
                node[e] = data[flatKey];
            } else {
                if (!isObject(node[e])) node[e] = {}; // never descend into a string primitive
                node = node[e];
            }
        }
    }
    return result;
}

function sortObjectKeys(obj) {
    if (!isObject(obj)) return obj;
    return Object.keys(obj)
        .sort()
        .reduce((res, key) => {
            res[key] = sortObjectKeys(obj[key]);
            return res;
        }, {});
}

async function main() {
    if (!fs.existsSync(localesDir)) {
        console.error(`Directory not found: ${localesDir}`);
        process.exit(1);
    }

    const languages = fs.readdirSync(localesDir).filter(f => {
        return fs.statSync(path.join(localesDir, f)).isDirectory();
    });

    console.log(`Found languages: ${languages.join(', ')}`);

    const allKeysSet = new Set();
    const langData = {};

    // 1. Read all files and collect all possible keys
    for (const lang of languages) {
        const filePath = path.join(localesDir, lang, 'translation.json');
        if (fs.existsSync(filePath)) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const json = stripCharIndex(JSON.parse(content)); // self-heal any pre-existing corruption
                langData[lang] = flatten(json);
                Object.keys(langData[lang]).forEach(k => allKeysSet.add(k));
            } catch (e) {
                console.error(`Error reading ${lang}:`, e.message);
                langData[lang] = {};
            }
        } else {
            langData[lang] = {};
        }
    }

    const allKeys = Array.from(allKeysSet).sort();
    console.log(`Total unique keys: ${allKeys.length}`);

    // 2. Fill missing keys
    for (const lang of languages) {
        const currentData = langData[lang];
        const enData = langData['en'] || {};
        let addedCount = 0;

        for (const key of allKeys) {
            if (currentData[key] === undefined) {
                // Key is missing in this language
                let defaultVal = enData[key];

                // If English also doesn't have it (rare but possible if key comes from another lang), find any value
                if (defaultVal === undefined) {
                    for (const l of languages) {
                        if (langData[l][key] !== undefined) {
                            defaultVal = langData[l][key];
                            break;
                        }
                    }
                }

                // If still undefined (shouldn't happen given allKeys), use key
                if (defaultVal === undefined) defaultVal = key;

                // Add with [AUTO] prefix if not English (or if English and missing?)
                // Usually we don't prefix English if we are syncing FROM English. 
                // But if English is missing a key present in TR, we might mark it.

                let newVal = defaultVal;
                if (typeof newVal === 'string' && !newVal.startsWith('[AUTO]') && !newVal.startsWith('[MISSING]')) {
                    newVal = `[AUTO] ${newVal}`;
                }

                currentData[key] = newVal;
                addedCount++;
            }
        }

        console.log(`Language ${lang}: Added ${addedCount} missing keys.`);

        // 3. Unflatten and Sort
        const structured = unflatten(currentData);
        const sorted = sortObjectKeys(structured);

        // 4. Write back
        const filePath = path.join(localesDir, lang, 'translation.json');
        fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2), 'utf8');
    }

    console.log('Consolidation complete.');
}

main();
