/**
 * Translation Validation Script for LSEMB
 * Validates translation files for completeness, consistency, and quality
 * 
 * Usage: node scripts/validate_translations.js [options]
 * Options:
 *   --fix          Auto-fix common issues
 *   --strict       Enable strict validation
 *   --language=tr  Validate specific language only
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '../frontend/public/locales');
const SOURCE_LANGUAGE = 'en';

// Validation rules
const VALIDATION_RULES = {
    noAutoTags: {
        name: 'No [AUTO] tags',
        check: (value) => !value.includes('[AUTO]'),
        severity: 'warning'
    },
    noMissingTags: {
        name: 'No [MISSING] tags',
        check: (value) => !value.includes('[MISSING]'),
        severity: 'error'
    },
    noEmptyStrings: {
        name: 'No empty strings',
        check: (value) => value.trim().length > 0,
        severity: 'error'
    },
    noPlaceholderText: {
        name: 'No placeholder text',
        check: (value) => !value.toLowerCase().includes('todo') &&
            !value.toLowerCase().includes('placeholder') &&
            !value.includes('...'),
        severity: 'warning'
    },
    properCapitalization: {
        name: 'Proper capitalization',
        check: (value, key) => {
            // Button/action keys should start with capital
            if (key.includes('button') || key.includes('action') || key.includes('title')) {
                return /^[A-Z]/.test(value) || /^[^\w]/.test(value); // Starts with capital or non-word char
            }
            return true;
        },
        severity: 'info'
    },
    noHtmlTags: {
        name: 'No unescaped HTML tags',
        check: (value) => !/<[^>]+>/.test(value) || value.includes('&lt;') || value.includes('&gt;'),
        severity: 'warning'
    }
};

class TranslationValidator {
    constructor(options = {}) {
        this.options = options;
        this.errors = [];
        this.warnings = [];
        this.info = [];
        this.stats = {};
    }

    /**
     * Validate all translation files
     */
    validateAll() {
        const languages = fs.readdirSync(LOCALES_DIR)
            .filter(dir => fs.statSync(path.join(LOCALES_DIR, dir)).isDirectory());

        console.log(`🔍 Validating ${languages.length} languages...\n`);

        for (const lang of languages) {
            if (this.options.language && lang !== this.options.language) {
                continue;
            }
            this.validateLanguage(lang);
        }

        this.printReport();
    }

    /**
     * Validate a single language
     */
    validateLanguage(langCode) {
        const filePath = path.join(LOCALES_DIR, langCode, 'translation.json');

        if (!fs.existsSync(filePath)) {
            this.errors.push({
                language: langCode,
                type: 'file_missing',
                message: `Translation file not found: ${filePath}`
            });
            return;
        }

        console.log(`📝 Validating ${langCode}...`);

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const translations = JSON.parse(content);

            // Initialize stats
            this.stats[langCode] = {
                totalKeys: 0,
                validKeys: 0,
                autoTags: 0,
                missingTags: 0,
                errors: 0,
                warnings: 0
            };

            // Validate structure
            this.validateStructure(langCode, translations);

            // Validate against source language
            if (langCode !== SOURCE_LANGUAGE) {
                this.validateAgainstSource(langCode, translations);
            }

            console.log(`   ✅ ${langCode} validation complete\n`);

        } catch (error) {
            this.errors.push({
                language: langCode,
                type: 'parse_error',
                message: `Failed to parse JSON: ${error.message}`
            });
        }
    }

    /**
     * Validate translation structure and content
     */
    validateStructure(langCode, obj, prefix = '') {
        for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            this.stats[langCode].totalKeys++;

            if (typeof value === 'string') {
                this.validateValue(langCode, fullKey, value);
            } else if (typeof value === 'object' && value !== null) {
                this.validateStructure(langCode, value, fullKey);
            } else {
                this.warnings.push({
                    language: langCode,
                    key: fullKey,
                    type: 'invalid_type',
                    message: `Invalid value type: ${typeof value}`
                });
                this.stats[langCode].warnings++;
            }
        }
    }

    /**
     * Validate a single translation value
     */
    validateValue(langCode, key, value) {
        let isValid = true;

        // Check for [AUTO] tags
        if (value.includes('[AUTO]')) {
            this.stats[langCode].autoTags++;
            this.warnings.push({
                language: langCode,
                key: key,
                type: 'auto_tag',
                message: `Contains [AUTO] tag: "${value}"`
            });
            this.stats[langCode].warnings++;
            isValid = false;
        }

        // Check for [MISSING] tags
        if (value.includes('[MISSING]')) {
            this.stats[langCode].missingTags++;
            this.errors.push({
                language: langCode,
                key: key,
                type: 'missing_tag',
                message: `Contains [MISSING] tag: "${value}"`
            });
            this.stats[langCode].errors++;
            isValid = false;
        }

        // Run validation rules
        for (const [ruleName, rule] of Object.entries(VALIDATION_RULES)) {
            if (!rule.check(value, key)) {
                const issue = {
                    language: langCode,
                    key: key,
                    type: ruleName,
                    message: `${rule.name}: "${value}"`
                };

                if (rule.severity === 'error') {
                    this.errors.push(issue);
                    this.stats[langCode].errors++;
                    isValid = false;
                } else if (rule.severity === 'warning') {
                    this.warnings.push(issue);
                    this.stats[langCode].warnings++;
                } else {
                    this.info.push(issue);
                }
            }
        }

        if (isValid) {
            this.stats[langCode].validKeys++;
        }
    }

    /**
     * Validate against source language for completeness
     */
    validateAgainstSource(langCode, translations) {
        const sourceFilePath = path.join(LOCALES_DIR, SOURCE_LANGUAGE, 'translation.json');
        const sourceTranslations = JSON.parse(fs.readFileSync(sourceFilePath, 'utf8'));

        const sourceKeys = this.getAllKeys(sourceTranslations);
        const targetKeys = this.getAllKeys(translations);

        // Check for missing keys
        const missingKeys = sourceKeys.filter(key => !targetKeys.includes(key));
        if (missingKeys.length > 0) {
            this.errors.push({
                language: langCode,
                type: 'missing_keys',
                message: `Missing ${missingKeys.length} keys from source language`,
                keys: missingKeys.slice(0, 10) // Show first 10
            });
        }

        // Check for extra keys
        const extraKeys = targetKeys.filter(key => !sourceKeys.includes(key));
        if (extraKeys.length > 0) {
            this.warnings.push({
                language: langCode,
                type: 'extra_keys',
                message: `Has ${extraKeys.length} extra keys not in source language`,
                keys: extraKeys.slice(0, 10)
            });
        }
    }

    /**
     * Get all keys from nested object
     */
    getAllKeys(obj, prefix = '') {
        let keys = [];
        for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (typeof value === 'object' && value !== null) {
                keys.push(...this.getAllKeys(value, fullKey));
            } else {
                keys.push(fullKey);
            }
        }
        return keys;
    }

    /**
     * Print validation report
     */
    printReport() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 TRANSLATION VALIDATION REPORT');
        console.log('='.repeat(80) + '\n');

        // Summary by language
        console.log('📈 Summary by Language:\n');
        console.log('Language'.padEnd(15) + 'Total Keys'.padEnd(15) + 'Valid'.padEnd(15) + '[AUTO]'.padEnd(15) + 'Errors'.padEnd(15) + 'Warnings');
        console.log('-'.repeat(90));

        for (const [lang, stats] of Object.entries(this.stats)) {
            const completeness = stats.totalKeys > 0
                ? ((stats.validKeys / stats.totalKeys) * 100).toFixed(1)
                : 0;

            console.log(
                lang.padEnd(15) +
                stats.totalKeys.toString().padEnd(15) +
                `${stats.validKeys} (${completeness}%)`.padEnd(15) +
                stats.autoTags.toString().padEnd(15) +
                stats.errors.toString().padEnd(15) +
                stats.warnings.toString()
            );
        }

        // Overall statistics
        console.log('\n📊 Overall Statistics:\n');
        console.log(`   Total Errors:   ${this.errors.length}`);
        console.log(`   Total Warnings: ${this.warnings.length}`);
        console.log(`   Total Info:     ${this.info.length}`);

        // Show errors
        if (this.errors.length > 0) {
            console.log('\n❌ Errors:\n');
            this.errors.slice(0, 20).forEach(error => {
                console.log(`   [${error.language}] ${error.key || error.type}: ${error.message}`);
                if (error.keys) {
                    console.log(`      Examples: ${error.keys.slice(0, 3).join(', ')}`);
                }
            });
            if (this.errors.length > 20) {
                console.log(`   ... and ${this.errors.length - 20} more errors`);
            }
        }

        // Show warnings
        if (this.warnings.length > 0 && !this.options.strict) {
            console.log('\n⚠️  Warnings (first 10):\n');
            this.warnings.slice(0, 10).forEach(warning => {
                console.log(`   [${warning.language}] ${warning.key || warning.type}: ${warning.message}`);
            });
            if (this.warnings.length > 10) {
                console.log(`   ... and ${this.warnings.length - 10} more warnings`);
            }
        }

        // Recommendations
        console.log('\n💡 Recommendations:\n');

        const totalAutoTags = Object.values(this.stats).reduce((sum, s) => sum + s.autoTags, 0);
        if (totalAutoTags > 0) {
            console.log(`   1. Run auto-translation script to fix ${totalAutoTags} [AUTO] tags:`);
            console.log(`      node scripts/auto_translate.js --all`);
        }

        if (this.errors.length > 0) {
            console.log(`   2. Fix ${this.errors.length} critical errors before deployment`);
        }

        if (this.warnings.length > 50) {
            console.log(`   3. Review and fix ${this.warnings.length} warnings for better quality`);
        }

        console.log('\n' + '='.repeat(80) + '\n');

        // Exit code
        if (this.options.strict && (this.errors.length > 0 || this.warnings.length > 0)) {
            process.exit(1);
        } else if (this.errors.length > 0) {
            process.exit(1);
        }
    }
}

// Main execution
function main() {
    const args = process.argv.slice(2);
    const options = {
        fix: args.includes('--fix'),
        strict: args.includes('--strict'),
        language: args.find(arg => arg.startsWith('--language='))?.split('=')[1]
    };

    const validator = new TranslationValidator(options);
    validator.validateAll();
}

main();
