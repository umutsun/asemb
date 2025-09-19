# Z.AI GLM-4.5 Coder

Z.AI'nin GLM-4.5 modelini kullanarak kod oluşturan bir Claude Code ajanı.

## Model Bilgileri

- **Model**: Z.AI GLM-4.5
- **API**: https://zai.ai/api/v1
- **Uzmanlık Alanları**: Kod oluşturma, refactoring, hata ayıklama
- **Desteklenen Diller**: TypeScript, JavaScript, Python, Java, C#, vb.
- **Desteklenen Framework'ler**: React, Express, Django, Flask, vb.

## Kullanım

Bu ajanı Claude Code'da kullanmak için:

```bash
claude --agent zai-glm45-coder
```

## Özellikler

- Kod oluşturma ve tamamlama
- Kod refactoring
- Hata ayıklama ve düzeltme
- Kod incelemesi ve optimizasyonu
- Çoklu dil desteği
- Framework entegrasyonu

## Örnek Kullanım

```
Kullanıcı: React'te bir kullanıcı profili componenti oluştur

Z.AI GLM-4.5 Coder:
```tsx
import React from 'react';

interface UserProfileProps {
  name: string;
  email: string;
  age: number;
  avatar?: string;
}

const UserProfile: React.FC<UserProfileProps> = ({ 
  name, 
  email, 
  age, 
  avatar 
}) => {
  return (
    <div className="user-profile">
      {avatar && (
        <img src={avatar} alt={`${name}'s avatar`} className="avatar" />
      )}
      <h2>{name}</h2>
      <p>Email: {email}</p>
      <p>Age: {age}</p>
    </div>
  );
};

export default UserProfile;
```
```

## Yapılandırma

Bu ajan, `.claude/settings.local.json` dosyasında aşağıdaki şekilde yapılandırılmıştır:

```json
{
  "models": {
    "zai-glm45": {
      "api_key": "${ZAI_API_KEY}",
      "api_base": "https://zai.ai/api/v1",
      "model": "glm-4.5"
    }
  },
  "default_model": "zai-glm45"
}
```

## Ortam Değişkenleri

- `ZAI_API_KEY`: Z.AI API anahtarınız