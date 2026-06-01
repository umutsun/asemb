const fs = require('fs');
const path = require('path');

const LOCALES_DIR = 'frontend/public/locales';
const BASE_LOCALE = 'en';

// Tüm dil dosyalarını oku
const locales = ['en', 'tr', 'el'];

function loadTranslations(locale) {
    const filePath = path.join(LOCALES_DIR, locale, 'translation.json');
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return {};
}

function getAllKeys(obj, prefix = '') {
    let keys = [];
    for (const key in obj) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            keys = keys.concat(getAllKeys(obj[key], fullKey));
        } else {
            keys.push(fullKey);
        }
    }
    return keys;
}

function ensureKeyExists(translations, keyPath) {
    const keys = keyPath.split('.');
    let current = translations;

    // Walk intermediate segments only (setValue writes the leaf). If a segment
    // currently holds a string (a label/namespace collision), replace it with an
    // object so we never index into a primitive (which spread strings into chars).
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (typeof current[key] !== 'object' || current[key] === null) {
            current[key] = {};
        }
        current = current[key];
    }
}

function syncTranslations() {
    const baseTranslations = loadTranslations(BASE_LOCALE);
    const allKeys = getAllKeys(baseTranslations);

    locales.forEach(locale => {
        if (locale === BASE_LOCALE) return;

        const translations = loadTranslations(locale);
        let hasChanges = false;

        allKeys.forEach(key => {
            if (!getValue(translations, key)) {
                ensureKeyExists(translations, key);
                setValue(translations, key, `[${locale.toUpperCase()}] ${key}`);
                hasChanges = true;
            }
        });

        if (hasChanges) {
            const filePath = path.join(LOCALES_DIR, locale, 'translation.json');
            fs.writeFileSync(filePath, JSON.stringify(translations, null, 2));
            console.log(`✅ Updated ${locale} with missing keys`);
        }
    });
}

function getValue(obj, keyPath) {
    return keyPath.split('.').reduce((current, key) => current && current[key], obj);
}

function setValue(obj, keyPath, value) {
    const keys = keyPath.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => current[key], obj);
    target[lastKey] = value;
}

syncTranslations();
console.log('🎉 Translation sync completed!');