/**
 * Auto Translation Script for LSEMB
 * Automatically translates [AUTO] tagged keys using Google Translate API or DeepL
 * 
 * Usage: node scripts/auto_translate.js [language_code]
 * Example: node scripts/auto_translate.js tr
 * Or translate all: node scripts/auto_translate.js --all
 */

const fs = require('fs');
const path = require('path');
const { resolveApiKey, close: closeSettingsDb } = require('./db-settings');

// OpenAI key comes from the DB `settings` table (source of truth, Hard Rule #1), with
// OPENAI_API_KEY as a fallback. Resolved once and cached.
let _openAiKeyPromise;
function getOpenAiKey() {
    if (!_openAiKeyPromise) {
        _openAiKeyPromise = resolveApiKey('openai.apiKey', 'OPENAI_API_KEY').then((key) => {
            if (!key) {
                throw new Error('No OpenAI key — set settings.openai.apiKey in the DB (Settings UI) or export OPENAI_API_KEY');
            }
            return key;
        });
    }
    return _openAiKeyPromise;
}

// Configuration
const LOCALES_DIR = path.join(__dirname, '../frontend/public/locales');
const SOURCE_LANGUAGE = 'en'; // Base language for translations

// Language configurations with proper locale codes for translation APIs
const LANGUAGE_CONFIG = {
    ar: { name: 'Arabic', code: 'ar', rtl: true },
    de: { name: 'German', code: 'de', rtl: false },
    el: { name: 'Greek', code: 'el', rtl: false },
    en: { name: 'English', code: 'en', rtl: false },
    es: { name: 'Spanish', code: 'es', rtl: false },
    fr: { name: 'French', code: 'fr', rtl: false },
    ja: { name: 'Japanese', code: 'ja', rtl: false },
    km: { name: 'Khmer', code: 'km', rtl: false },
    ko: { name: 'Korean', code: 'ko', rtl: false },
    ru: { name: 'Russian', code: 'ru', rtl: false },
    th: { name: 'Thai', code: 'th', rtl: false },
    tr: { name: 'Turkish', code: 'tr', rtl: false },
    zh: { name: 'Chinese', code: 'zh-CN', rtl: false }
};

/**
 * Find all keys with [AUTO] tag in a translation object
 */
function findAutoKeys(obj, prefix = '') {
    const autoKeys = [];

    for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (typeof value === 'string' && value.includes('[AUTO]')) {
            autoKeys.push({
                key: fullKey,
                value: value,
                cleanValue: value.replace(/\[AUTO\]\s*/g, '').trim()
            });
        } else if (typeof value === 'object' && value !== null) {
            autoKeys.push(...findAutoKeys(value, fullKey));
        }
    }

    return autoKeys;
}

/**
 * Get value from nested object using dot notation
 */
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Set value in nested object using dot notation
 */
function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
        if (!current[key]) current[key] = {};
        return current[key];
    }, obj);
    target[lastKey] = value;
}

/**
 * Translate text using OpenAI GPT-4 (highest quality translation).
 * The API key is read from the DB `settings` table (key `openai.apiKey`, managed via the
 * Settings UI), falling back to the OPENAI_API_KEY env var. Never hardcode the key here —
 * this file used to embed a live key in plaintext.
 */
async function translateText(text, targetLang, sourceLang = 'en') {
    const OPENAI_API_KEY = await getOpenAiKey();

    // Language name mapping for GPT-4
    const languageNames = {
        'ar': 'Arabic',
        'de': 'German',
        'el': 'Greek',
        'en': 'English',
        'es': 'Spanish',
        'fr': 'French',
        'ja': 'Japanese',
        'km': 'Khmer',
        'ko': 'Korean',
        'ru': 'Russian',
        'th': 'Thai',
        'tr': 'Turkish',
        'zh': 'Chinese (Simplified)',
        'zh-CN': 'Chinese (Simplified)'
    };

    const targetLanguageName = languageNames[targetLang] || targetLang;

    try {
        const https = require('https');

        const requestBody = JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a professional translator specializing in software localization. Translate the given text to ${targetLanguageName}. Rules:
1. Maintain the original meaning and tone
2. Use natural, native-sounding language
3. Keep technical terms appropriate for software UI
4. Preserve any placeholders like {{variable}} or %s
5. Return ONLY the translated text, nothing else
6. If the text is already in ${targetLanguageName}, return it as-is`
                },
                {
                    role: 'user',
                    content: text
                }
            ],
            temperature: 0.3,
            max_tokens: 500
        });

        const options = {
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody)
            }
        };

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);

                        if (response.error) {
                            reject(new Error(`OpenAI API error: ${response.error.message}`));
                            return;
                        }

                        if (response.choices && response.choices.length > 0) {
                            const translatedText = response.choices[0].message.content.trim();
                            resolve(translatedText);
                        } else {
                            reject(new Error('No translation returned'));
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse response: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.write(requestBody);
            req.end();
        });

    } catch (error) {
        console.warn(`   [WARNING] OpenAI API error: ${error.message}`);
        return `[NEEDS_TRANSLATION] ${text}`;
    }
}

/**
 * Process a single language file
 */
async function processLanguage(langCode) {
    const config = LANGUAGE_CONFIG[langCode];
    if (!config) {
        console.error(`❌ Unknown language code: ${langCode}`);
        return;
    }

    console.log(`\n🌍 Processing ${config.name} (${langCode})...`);

    const filePath = path.join(LOCALES_DIR, langCode, 'translation.json');

    if (!fs.existsSync(filePath)) {
        console.error(`❌ Translation file not found: ${filePath}`);
        return;
    }

    // Read translation file
    const translations = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Find all [AUTO] keys
    const autoKeys = findAutoKeys(translations);

    if (autoKeys.length === 0) {
        console.log(`✅ No [AUTO] keys found. Language is complete!`);
        return;
    }

    console.log(`📝 Found ${autoKeys.length} keys to translate`);

    // Read source (English) translations for reference
    const sourceFilePath = path.join(LOCALES_DIR, SOURCE_LANGUAGE, 'translation.json');
    const sourceTranslations = JSON.parse(fs.readFileSync(sourceFilePath, 'utf8'));

    let translatedCount = 0;
    let skippedCount = 0;

    // Process each auto key
    for (const autoKey of autoKeys) {
        const sourceValue = getNestedValue(sourceTranslations, autoKey.key);

        if (!sourceValue) {
            console.warn(`⚠️  No source value found for key: ${autoKey.key}`);
            skippedCount++;
            continue;
        }

        // Skip if source also has [AUTO] or [MISSING]
        if (sourceValue.includes('[AUTO]') || sourceValue.includes('[MISSING]')) {
            console.warn(`⚠️  Source value incomplete for key: ${autoKey.key}`);
            skippedCount++;
            continue;
        }

        try {
            console.log(`   Translating: ${autoKey.key}`);
            console.log(`   Source (${SOURCE_LANGUAGE}): "${sourceValue}"`);

            // Translate from source language to target language
            const translated = await translateText(
                sourceValue,
                config.code === 'zh-CN' ? 'zh-CN' : langCode,
                SOURCE_LANGUAGE
            );

            console.log(`   Target (${langCode}): "${translated}"`);

            // Update the translation
            setNestedValue(translations, autoKey.key, translated);
            translatedCount++;

            // Add small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
            console.error(`   ❌ Translation failed: ${error.message}`);
            skippedCount++;
        }
    }

    // Save updated translations
    fs.writeFileSync(
        filePath,
        JSON.stringify(translations, null, 2),
        'utf8'
    );

    console.log(`\n✅ ${config.name} (${langCode}) completed:`);
    console.log(`   - Translated: ${translatedCount} keys`);
    console.log(`   - Skipped: ${skippedCount} keys`);
    console.log(`   - File updated: ${filePath}`);
}

/**
 * Main execution
 */
async function main() {
    const args = process.argv.slice(2);

    console.log('🚀 LSEMB Auto Translation Tool\n');
    console.log('================================\n');

    if (args.length === 0 || args[0] === '--help') {
        console.log('Usage:');
        console.log('  node scripts/auto_translate.js [language_code]  - Translate specific language');
        console.log('  node scripts/auto_translate.js --all            - Translate all languages');
        console.log('  node scripts/auto_translate.js --report         - Show translation status\n');
        console.log('Available languages:', Object.keys(LANGUAGE_CONFIG).join(', '));
        return;
    }

    if (args[0] === '--report') {
        // Show status report
        console.log('📊 Translation Status Report:\n');
        for (const [langCode, config] of Object.entries(LANGUAGE_CONFIG)) {
            const filePath = path.join(LOCALES_DIR, langCode, 'translation.json');
            if (fs.existsSync(filePath)) {
                const translations = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const autoKeys = findAutoKeys(translations);
                const totalKeys = JSON.stringify(translations).split('"').length / 2;
                const completeness = ((totalKeys - autoKeys.length) / totalKeys * 100).toFixed(1);

                console.log(`${config.name.padEnd(15)} (${langCode}): ${autoKeys.length.toString().padStart(3)} [AUTO] keys | ${completeness}% complete`);
            }
        }
        return;
    }

    if (args[0] === '--all') {
        // Process all languages except source
        const languages = Object.keys(LANGUAGE_CONFIG).filter(lang => lang !== SOURCE_LANGUAGE);

        console.log(`Processing ${languages.length} languages...\n`);

        for (const langCode of languages) {
            await processLanguage(langCode);
        }

        console.log('\n🎉 All languages processed!');
    } else {
        // Process single language
        await processLanguage(args[0]);
    }
}

// Run the script
main()
    .catch(error => {
        console.error('❌ Fatal error:', error);
        process.exitCode = 1;
    })
    .finally(() => closeSettingsDb()); // release the settings DB pool so the process exits
