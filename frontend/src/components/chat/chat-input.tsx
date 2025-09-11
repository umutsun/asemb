'use client';

import { useState, KeyboardEvent, useEffect } from 'react';
import { Send, Paperclip, Mic, Sparkles, RefreshCw } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [sampleQuestions, setSampleQuestions] = useState<string[]>([]);
  const [placeholder, setPlaceholder] = useState('Hukuki belgelerde arama yapın veya soru sorun...');
  
  // Hazır sorular havuzu
  const questionPool = [
    "KDV oranları nelerdir?",
    "Kira sözleşmesi nasıl hazırlanır?",
    "Gelir vergisi dilimi hesaplama",
    "İhracat KDV iadesi nasıl alınır?",
    "Damga vergisi oranları nedir?",
    "E-fatura zorunluluğu kimleri kapsar?",
    "Stopaj oranları nelerdir?",
    "Amortisman nasıl hesaplanır?",
    "ÖTV matrahı nasıl belirlenir?",
    "Kurumlar vergisi beyannamesi ne zaman verilir?",
    "Geçici vergi dönemleri nelerdir?",
    "KDV iadesi şartları nelerdir?",
    "Gider pusulası ne zaman kesilir?",
    "Özelge başvurusu nasıl yapılır?",
    "Vergi cezaları nelerdir?",
    "Muhtasar beyanname nedir?",
    "Vergi indirimi nasıl hesaplanır?",
    "Yıllık gelir vergisi beyannamesi nasıl verilir?",
    "KDV tevkifatı nedir?",
    "Özel tüketim vergisi nasıl hesaplanır?"
  ];
  
  // Rastgele soru seçme
  const getRandomQuestions = (count: number = 3) => {
    const shuffled = [...questionPool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };
  
  const refreshQuestions = () => {
    setSampleQuestions(getRandomQuestions());
  };
  
  useEffect(() => {
    refreshQuestions();
    // Fetch chatbot settings
    fetch('http://localhost:8083/api/v2/chatbot/settings')
      .then(res => res.json())
      .then(data => {
        if (data.placeholder) {
          setPlaceholder(data.placeholder);
        }
      })
      .catch(err => console.error('Failed to fetch chatbot settings:', err));
  }, []);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 bg-gradient-to-t from-white to-gray-50/50 dark:from-gray-800 dark:to-gray-900/50 backdrop-blur-sm">
      <div className="max-w-4xl mx-auto">
        {/* Hazır sorular */}
        {sampleQuestions.length > 0 && !message && (
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Örnek sorular:
            </span>
            {sampleQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => setMessage(q)}
                className="text-xs px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
              >
                {q}
              </button>
            ))}
            <button
              onClick={refreshQuestions}
              className="text-xs p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Yenile"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-3 bg-white dark:bg-gray-800 rounded-2xl p-3 shadow-lg border border-gray-200/80 dark:border-gray-700/80 backdrop-blur-sm">
          <button 
            className="p-2 text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-all duration-200 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 group"
            title="Attach file"
          >
            <Paperclip className="w-5 h-5 group-hover:rotate-12 transition-transform duration-200" />
          </button>
          
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 min-h-[52px] max-h-[160px] p-3 bg-transparent resize-none focus:outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-50 transition-all duration-200"
            rows={1}
            style={{ lineHeight: '1.6' }}
          />
          
          <div className="flex gap-2">
            <button 
              className="p-2 text-gray-400 hover:text-purple-500 dark:text-gray-500 dark:hover:text-purple-400 transition-all duration-200 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 group"
              title="Voice input"
            >
              <Mic className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" />
            </button>
            
            <button
              onClick={handleSend}
              disabled={disabled || !message.trim()}
              className="p-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 disabled:hover:scale-100 shadow-lg hover:shadow-xl disabled:shadow-md active:scale-95"
              title="Send message"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-3 px-3">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Enter ile gönder, Shift+Enter ile yeni satır
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            ASB RAG Sistemi
          </p>
        </div>
      </div>
    </div>
  );
}