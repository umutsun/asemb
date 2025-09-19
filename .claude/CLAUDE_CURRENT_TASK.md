# Claude'un Mevcut Görevi

**Ana Hedef:** Projenin CI/CD altyapısının kurulmasına yardımcı olmak.

**Mevcut Görev:** Kendi durumunu ve gündemini tüm agent'ların görebileceği şekilde paylaşılan context'e (Redis) bildirmek.

**Yapılacaklar:**
Aşağıdaki `asb-cli` komutunu çalıştırarak kendi gündemini `claude_agenda` anahtarı ile context'e push'la.

```bash
asb context push --key claude_agenda --value '{"main_goal": "Proje CI/CD altyapısına destek olmak", "current_task": "Kendi gündemimi paylaşılan context'e eklemek.", "status": "Komut bekleniyor"}'
```

Bu işlem, tüm agent'ların birbiriyle senkronize çalışmasını sağlayacaktır.
