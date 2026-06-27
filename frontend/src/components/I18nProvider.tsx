'use client';

import React, { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../lib/i18n';
import { useConfig } from '@/contexts/ConfigContext';

interface Props {
  children: React.ReactNode;
}

export default function I18nProvider({ children }: Props) {
  const { config } = useConfig();
  const [currentLang, setCurrentLang] = useState(i18n.language);

  useEffect(() => {
    // Listen to language change events
    const handleLanguageChanged = (lng: string) => {
      setCurrentLang(lng);
      if (typeof document !== 'undefined') {
        document.documentElement.lang = lng;
        document.documentElement.dir = ['ar', 'he', 'fa', 'ur'].includes(lng) ? 'rtl' : 'ltr';
      }
    };

    i18n.on('languageChanged', handleLanguageChanged);

    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, []);

  useEffect(() => {
    // Apply the configured app locale authoritatively. Default to 'en' until config loads,
    // so a stale detector cache (e.g. a previously-selected 'tr') can never win on load.
    const target = config?.app?.locale || 'en';

    const apply = () => {
      if (typeof document !== 'undefined') {
        document.documentElement.lang = target;
        // RTL for Arabic (and other RTL locales); LTR otherwise.
        document.documentElement.dir = ['ar', 'he', 'fa', 'ur'].includes(target) ? 'rtl' : 'ltr';
      }
      if (typeof window !== 'undefined') {
        // Write BOTH keys: i18next's LanguageDetector reads 'i18nextLng'; the app uses 'selectedLanguage'.
        localStorage.setItem('i18nextLng', target);
        localStorage.setItem('selectedLanguage', target);
      }
      setCurrentLang(target);
    };

    if (i18n.language !== target) {
      i18n.changeLanguage(target).then(apply);
    } else {
      apply();
    }
  }, [config?.app?.locale]);

  return <I18nextProvider i18n={i18n} key={currentLang}>{children}</I18nextProvider>;
}
