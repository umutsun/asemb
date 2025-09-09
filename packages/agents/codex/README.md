# .codex

Bu klasör, Codex CLI için başlangıç yapılandırmasını içerir. `config.yaml` şablon olarak tasarlanmıştır ve proje ihtiyaçlarına göre daraltılabilir/genişletilebilir.

Öne çıkan ilkeler:
- Güvenlik: Yıkıcı komutlar için onay, kritik klasörler için koruma.
- Performans: Büyük klasörler ve ikililer aramalardan dışlanır, dosya okumaları 250 satırla sınırlandırılır.
- Platform uyumu: `bash` yoksa `powershell/cmd` yedekleri, arama/listeme komutları için fallback.
- Hedefli otomasyon: Biçimlendirme/lint/test komutları değişen dosyaya veya dar kapsamlı hedefe uygulanır.

Özelleştirme önerileri:
- Node.js projeleri: Paket yöneticisi otomatik seçilir (pnpm/yarn/npm); format için önce `npm run -s format`, ardından `node_modules/.bin/prettier` tercih edilir. Linter olarak `eslint` (yoksa `biome`) zinciri kullanılır. Testlerde proje scripti, yoksa `vitest`/`jest`/`mocha` yerel ikilileri denenir. Type check için `npm run -s typecheck` ya da `tsc --noEmit`.
- Test komutlarını hız için paket/modül düzeyinde filtreleyin (ör. pattern bazlı çalıştırma).

Monorepo notu:
- Bu repo npm workspaces kullanıyor. `build/test/lint` kök scriptleri `--workspaces` ile tüm paketlerde çalışır. İhtiyaç halinde belirli bir pakete hedeflemek için `npm -w <paket_adı> run <script>` tercih edin.

Not: Bu dosya ve `config.yaml` bir şablondur; kullandığınız Codex CLI sürümüne göre alan adları uyarlanabilir.

## Next.js + Tailwind

- Lint: `packages/dashboard` içinde `lint` scripti `next lint` olarak tanımlı. `.codex` linter zinciri önce `npm run -s lint` çağırır (scope verilmez), ardından gerekirse `eslint`/`biome` fallback’lerini dener.
- Build: `build` için önce proje scripti, yoksa `next build` fallback devrede.
- Ignore: `.next/` ve `.next/cache/` zaten dışlanır; ek olarak oluşturulan statik dosyalar `.next/static/` altında kalır.
- Prettier: Tailwind sınıf sıralaması için `prettier-plugin-tailwindcss` önerilir. Kök `package.json`a devDependency ekleyip `.prettierrc` içine `plugins: ["prettier-plugin-tailwindcss"]` yazın.
- ESLint: `eslint-config-next` mevcut. İsterseniz `eslint-plugin-tailwindcss` de ekleyip className denetimlerini güçlendirebilirsiniz.
- TypeScript: `typecheck` scripti yoksa `tsc --noEmit` ekleyin; `.codex` bunu otomatik komutlar listesinde kullanabilir.
