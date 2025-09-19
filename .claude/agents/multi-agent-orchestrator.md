  <path>awesome-claude-code-agents/agents/multi-agent-orchestrator.md</path>
< <path>.claude/agents/multi-agent-orchestrator.md</path>
> <content lines="1-87">
  1 | # Multi-Agent Orchestrator
  2 | 
  3 | Claude Code CLI için çoklu agent orkestrasyon sistemi. Bu agent, Z.AI GLM-4.5 modelini kullanarak birden fazla uzman agent'ı koordine eder ve karmaşık görevleri otomatik olarak dağıtır.
  4 | 
  5 | ## Model Bilgileri
  6 | 
  7 | - **Model**: Z.AI GLM-4.5
  8 | - **API**: https://zai.ai/api/v1
  9 | - **Uzmanlık Alanları**: Multi-agent orkestrasyon, görev dağıtımı, iş akışı yönetimi
 10 | - **Desteklenen Agent'lar**: Kod Geliştirme, Kod İnceleme, Test Oluşturma, Dokümantasyon
 11 | 
 12 | ## Kullanım
 13 | 
 14 | Bu agent'ı Claude Code'da kullanmak için:
 15 | 
 16 | ```bash
 17 | claude --agent multi-agent-orchestrator
 18 | ```
 19 | 
 20 | ## Özellikler
 21 | 
 22 | - Çoklu agent orkestrasyonu
 23 | - Otomatik görev dağıtımı
 24 | - İş akışı yönetimi
 25 | - Paralel task çalıştırma
 26 | - Agent'lar arası iletişim
 27 | - Sonuç toplama ve raporlama
 28 | 
 29 | ## Örnek Kullanım
 30 | 
 31 | ```
 32 | Kullanıcı: React için bir kullanıcı profili componenti oluştur, kod inceleme yap ve testler oluştur
 33 | 
 34 | Multi-Agent Orchestrator:
 35 | 🔄 İş akışı oluşturuluyor...
 36 | 📋 Task 1: React component oluşturuluyor (Agent: zai-glm45-coder)
 37 | 📋 Task 2: Kod incelemesi yapılıyor (Agent: code-reviewer)
 38 | 📋 Task 3: Testler oluşturuluyor (Agent: test-generator)
 39 | 
 40 | ✅ İş akışı tamamlandı!
 41 | 
 42 | 📝 Oluşturulan Kod:
 43 | ```tsx
 44 | import React from 'react';
 45 | 
 46 | interface UserProfileProps {
 47 |   name: string;
 48 |   email: string;
 49 |   age: number;
 50 |   avatar?: string;
 51 | }
 52 | 
 53 | const UserProfile: React.FC<UserProfileProps> = ({ 
 54 |   name, 
 55 |   email, 
 56 |   age, 
 57 |   avatar 
 58 | }) => {
 59 |   return (
 60 |     <div className="user-profile">
 61 |       {avatar && (
 62 |         <img src={avatar} alt={`${name}'s avatar`} className="avatar" />
 63 |       )}
 64 |       <h2>{name}</h2>
 65 |       <p>Email: {email}</p>
 66 |       <p>Age: {age}</p>
 67 |     </div>
 68 |   );
 69 | };
 70 | 
 71 | export default UserProfile;
 72 | ```
 73 | 
 74 | 📋 Kod İnceleme Sonuçları:
 75 | - ✅ TypeScript tipleri doğru kullanılmış
 76 | - ✅ Component yapısı temiz ve okunabilir
 77 | - ⚠️ Props validation eklenmeli
 78 | - ✅ Export default doğru kullanılmış
 79 | 
 80 | 📝 Oluşturulan Testler:
 81 | ```tsx
 82 | import { render, screen } from '@testing-library/react';
 83 | import UserProfile from './UserProfile';
 84 | 
 85 | ana describe('UserProfile Component', () => {
 86 |   test('renders user information correctly', () => {
 87 |     const props = {
 88 |       name: 'John Doe',
 89 |       email: 'john@example.com',
 90 |       age: 30
 91 |     };
 92 |     
 93 |     render(<UserProfile {...props} />);
 94 |     
 95 |     expect(screen.getByText('John Doe')).toBeInTheDocument();
 96 |     expect(screen.getByText('Email: john@example.com')).toBeInTheDocument();
 97 |     expect(screen.getByText('Age: 30')).toBeInTheDocument();
 98 |   });
 99 | 
100 |   test('renders avatar when provided', () => {
101 |     const props = {
102 |       name: 'John Doe',
103 |       email: 'john@example.com',
104 |       age: 30,
105 |       avatar: 'avatar.jpg'
106 |     };
107 |     
108 |     render(<UserProfile {...props} />);
109 |     
110 |     const avatar = screen.getByAltText('John Doe\'s avatar');
111 |     expect(avatar).toBeInTheDocument();
112 |     expect(avatar).toHaveAttribute('src', 'avatar.jpg');
113 |   });
114 | });
115 | ```
116 | ```
117 | 
118 | ## Mevcut Agent'lar
119 | 
120 | ### 1. Z.AI GLM-4.5 Coder
121 | - **ID**: `zai-glm45-coder`
122 | - **Açıklama**: Z.AI GLM-4.5 modelini kullanarak kod oluşturan, düzenleyen ve analiz eden bir agent
123 | - **Yetenekler**: Kod oluşturma, kod refactoring, hata ayıklama
124 | - **Diller**: TypeScript, JavaScript, Python, Java, C#, Go, Rust
125 | - **Framework'ler**: React, Express, NextJS, Django, Flask, Spring
126 | 
127 | ### 2. Code Reviewer
128 | - **ID**: `code-reviewer`
129 | - **Açıklama**: Kod incelemesi yapan ve iyileştirme önerileri sunan bir agent
130 | - **Yetenekler**: Kod incelemesi, güvenlik analizi
131 | - **Diller**: TypeScript, JavaScript, Python, Java, C#
132 | - **Framework'ler**: React, Express, NextJS, Django, Flask
133 | 
134 | ### 3. Test Generator
135 | - **ID**: `test-generator`
136 | - **Açıklama**: Kod için test senaryoları oluşturan bir agent
137 | - **Yetenekler**: Birim testleri, entegrasyon testleri
138 | - **Diller**: TypeScript, JavaScript, Python, Java
139 | - **Framework'ler**: Jest, Mocha, Pytest, JUnit
140 | 
141 | ### 4. Documentation Generator
142 | - **ID**: `doc-generator`
143 | - **Açıklama**: Kod için dokümantasyon oluşturan bir agent
144 | - **Yetenekler**: API dokümantasyonu, kod dokümantasyonu
145 | - **Diller**: TypeScript, JavaScript, Python, Java, C#
146 | - **Framework'ler**: Express, NextJS, Django, Flask
147 | 
148 | ## İş Akışı Oluşturma
149 | 
150 | Bu agent, karmaşık görevleri otomatik olarak daha küçük task'lara böler ve uygun agent'lara dağıtır:
151 | 
152 | ```typescript
153 | // Örnek iş akışı
154 | const workflow = {
155 |   name: "React Component Geliştirme",
156 |   description: "React componenti oluştur, incele ve testler yaz",
157 |   tasks: [
158 |     {
159 |       title: "React Component Oluştur",
160 |       description: "UserProfile componenti oluştur",
161 |       agentId: "zai-glm45-coder",
162 |       priority: "high",
163 |       input: {
164 |         command: "generate-code",
165 |         prompt: "UserProfile componenti oluştur",
166 |         language: "typescript",
167 |         framework: "react"
168 |       }
169 |     },
170 |     {
171 |       title: "Kod İnceleme",
172 |       description: "Oluşturulan kodu incele",
173 |       agentId: "code-reviewer",
174 |       priority: "medium",
175 |       input: {
176 |         code: "// oluşturulan kod",
177 |         language: "typescript"
178 |       }
179 |     },
180 |     {
181 |       title: "Test Oluştur",
182 |       description: "Component için testler oluştur",
183 |       agentId: "test-generator",
184 |       priority: "medium",
185 |       input: {
186 |         code: "// oluşturulan kod",
187 |         language: "typescript",
188 |         framework: "jest"
189 |       }
190 |     }
191 |   ]
192 | };
193 | ```
194 | 
195 | ## Yapılandırma
196 | 
197 | Bu agent, `.claude/settings.local.json` dosyasında aşağıdaki şekilde yapılandırılmıştır:
198 | 
199 | ```json
200 | {
201 |   "models": {
202 |     "zai-glm45": {
203 |       "api_key": "${ZAI_API_KEY}",
204 |       "api_base": "https://zai.ai/api/v1",
205 |       "model": "glm-4.5"
206 |     }
207 |   },
208 |   "default_model": "zai-glm45"
209 | }
210 | ```
211 | 
212 | ## MCP Sunucusu Entegrasyonu
213 | 
214 | Bu agent, Claude Code MCP Sunucusu ile entegre çalışabilir. MCP sunucusu, multi-agent orkestrasyon sistemini HTTP API üzerinden kullanılabilir hale getirir.
215 | 
216 | ### MCP Araçları
217 | 
218 | - `create_agent_workflow`: Yeni bir multi-agent workflow'u oluşturur
219 | - `start_agent_workflow`: Belirtilen workflow'u başlatır
220 | - `get_workflow_status`: Workflow durumunu getirir
221 | - `list_agents`: Mevcut tüm agentları listeler
222 | - `list_workflows`: Mevcut tüm workflow'ları listeler
223 | - `add_custom_agent`: Özel bir agent ekler
224 | - `execute_agent_task`: Belirtilen agent ile tek bir task çalıştırır
225 | 
226 | ### Örnek MCP Kullanımı
227 | 
228 | ```bash
229 | # MCP sunucusunu başlat
230 | npx tsx claude-code-mcp-server.ts
231 | 
232 | # Claude Code ile MCP sunucusunu kullan
233 | claude --agent multi-agent-orchestrator
234 | ```
235 | 
236 | ## Ortam Değişkenleri
237 | 
238 | - `ZAI_API_KEY`: Z.AI API anahtarınız
239 | - `MCP_SERVER_URL`: MCP sunucusu URL'si (varsayılan: http://localhost:3000/mcp)
240 | 
241 | ## Sınırlamalar
242 | 
243 | - Maksimum eşzamanlı task sayısı: 3
244 | - Maksimum workflow başına task sayısı: 10
245 | - Desteklenen diller ve framework'ler sınırlıdır