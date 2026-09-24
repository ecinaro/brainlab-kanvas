# BrainLab Kanvas

Bilgisayarında yerel çalışan, node tabanlı görsel ve video üretim kanvası. Node'ları kablolarla bağlayıp
üretim zincirleri kurarsın; modeller [Kie.ai](https://kie.ai) üzerinden, aracı servis olmadan çalışır.
API key yalnızca yerel sunucuda durur, tarayıcıya hiç gönderilmez. Tüm sonuçlar kendi diskine iner.

---

## Başlarken

### 1. Gereksinimler

- **Node.js 22.5 veya üstü** (yerleşik `node:sqlite` kullanılıyor). Kontrol: `node -v`
- Bir **Kie.ai API key**'i ve bakiye: https://kie.ai/api-key

### 2. Kurulum (bir kez)

Proje klasöründe:

```bash
npm install
```

Ardından `.env.example` dosyasını `.env` adıyla kopyala ve key'ini yapıştır:

```
KIE_API_KEY=buraya_key
SERVER_PORT=8787
```

`.env` git'e girmez ve tarayıcıya gönderilmez.

### 3. Çalıştırma

```bash
npm run dev
```

Tarayıcıda aç: **http://127.0.0.1:5173**

Kapatmak için terminalde `Ctrl+C`.

> **Kredi harcamadan denemek için:** `npm run dev:mock` → **http://127.0.0.1:5174**
> Gerçek Kie yerine taklit sunucu kullanılır, veriler ayrı `data-mock/` klasöründe durur,
> üst barda kırmızı **SAHTE MOD** etiketi görünür. Prompt'a `[fail]` yazarsan üretim başarısız olur,
> `[402]` yazarsan "kredi yetersiz" durumu tetiklenir.

### 4. İlk üretimin (yaklaşık 1 dakika, ~8 kredi)

1. **Projeler** ekranında **Yeni proje**'ye tıkla. Hazır bir zincir gelir: Prompt → Nano Banana 2 → Önizleme.
2. **Prompt** kutusuna ne istediğini yaz (İngilizce prompt'lar genelde daha iyi sonuç verir).
3. Model node'unda en-boy ve çözünürlüğü seç. Sağ üstteki rozet tahmini maliyeti gösterir (örn. `~8 kr`).
4. **Çalıştır**'a bas (ya da node seçiliyken `Ctrl+Enter`). Durum node'da canlı görünür.
5. Görsel hazır olunca model node'unda ve **Önizleme**'de görünür, dosya `data/media/` altına iner.

### 5. Görselden videoya

1. Sol raftan **Video** ekle (varsayılan: Kling 3.0).
2. Model node'unun sağındaki çıkış noktasını, video node'unun **Başlangıç karesi** girişine sürükle.
3. Bir Prompt node'u ekleyip videonun **Prompt** girişine bağla (hareketi tarif et).
4. Üst bardaki **Tümünü çalıştır**'a bas. Önce görsel, sonra video üretilir.
   Değişmemiş node'lar yeniden üretilmez (kredi harcanmaz).

> En ucuz video ayarı: Kling 3.0 · std · 3 sn · sessiz ≈ **42 kredi**. Video üretimi birkaç dakika sürebilir;
> bu sırada sayfayı kapatsan bile üretim sunucuda devam eder ve dosya iner.

---

## Kanvas kullanımı

### Node türleri

| Node | Ne yapar |
|---|---|
| **Prompt** | Metin girişi. Çıkışı turuncu (metin). |
| **Görsel** | Görsel yükle: tıkla, sürükle-bırak ya da `Ctrl+V` ile yapıştır (png, jpg, webp · en fazla 30 MB). Kanvasa görsel sürüklemek de otomatik bu node'u oluşturur. |
| **Model / Video** | Katalogdaki modellerden biri. Portlar ve ayarlar modele göre değişir. Açılır listeden model değiştirilebilir; uymayan kablolar otomatik kaldırılır. |
| **Önizleme** | Gelen görseli/videoyu büyük gösterir; yeni sekmede açma ve indirme. |
| **Not** | Yapışkan not; bağlantısı yoktur. |

**Port renkleri:** turuncu = metin · camgöbeği = görsel · mor = video. Uyumsuz portlar birbirine bağlanamaz;
döngü oluşturan bağlantılar reddedilir.

### Kısayollar

| Kısayol | İşlem |
|---|---|
| `Ctrl+Enter` | Seçili model node'larını çalıştır |
| `Ctrl+Shift+Enter` | Tümünü çalıştır |
| `Ctrl+Z` / `Ctrl+Shift+Z` veya `Ctrl+Y` | Geri al / yinele (yazma ve sürükleme tek adım sayılır) |
| `Ctrl+C` / `Ctrl+V` | Kopyala / yapıştır (projeler arası da çalışır) |
| `Ctrl+D` | Seçili node'ları çoğalt |
| `Delete` / `Backspace` | Seçili node'u veya kabloyu sil |
| `Esc` | Açık pencereyi kapat |

### Zincir, önbellek ve maliyet

- **Çalıştır** (node üzerinde): o node'u yeniden üretir. Güncel olmayan yukarı akış node'ları önce çalışır.
- **Tümünü çalıştır**: bütün zinciri sırayla çalıştırır. Bağımsız dallar paralel ilerler.
- **Önbellek:** Girdisi ve ayarları değişmemiş node yeniden üretilmez; "Önbellekten" yazar.
- **Tahmini maliyet** "Tümünü çalıştır" butonunun üstünde yazar (`~70 kr` ya da `güncel`).
- **Onay eşiği:** Tahmini toplam eşiği aşarsa, bir modelin fiyatı bilinmiyorsa ya da bakiye yetmiyorsa
  çalıştırmadan önce döküm gösterilir. Eşiği sağ üstteki **⚙** menüsünden değiştir (varsayılan 20 kredi).
- Bir node hata verirse ondan beslenen node'lar **Engellendi** olur ve gönderilmez.
- Key geçersizse (401) ya da kredi biterse (402) üstte turuncu bir **durdurma bandı** çıkar.
- Alttaki **Görevler** tepsisi her üretimin durumunu, süresini, gerçek harcanan krediyi ve hatasını gösterir.

### Karşılaştırma

- **Adet (×1–×4):** Model node'unun altındaki seçici. Aynı girdiyle N ayrı üretim yapar (her biri ayrı ücretlenir).
- **Karşılaştır:** Node'un birden fazla çıktısı varsa yan yana görüp **Bunu kullan** ile seç; seçilen çıktı aşağı akışa verilir.
- **+ Kardeş:** Aynı girdilerle farklı bir modeli yanına ekler.
- **Yan yana karşılaştır:** İki veya daha fazla model node'unu seçince üstte çıkar. **Kazanan**'ı seçince
  diğerlerinin çıkış bağlantıları kazanana taşınır (`Ctrl+Z` ile geri alınabilir).

### Projeler ve galeri

- **Projeler:** her proje ayrı kanvas, çıktı ve geçmiş. Ad üst barda tıklanarak değişir. Silinen proje
  `data/projects/.trash/` klasörüne taşınır (kalıcı silinmez, görseller kalır).
- **Dışa aktar:** projeyi tek `.json` dosyası olarak indirir. **İçe aktar** (Projeler ekranı) ile geri yüklenir.
  Medya dosyaları yol olarak eklenir; aynı bilgisayarda çıktılar görünür.
- **Galeri:** tüm projelerdeki çıktılar. Prompt/proje araması, model ve tür filtresi, ★ yıldız.
  Detayda prompt, parametreler, kredi ve taskId görünür. **Projeye kur**, o çıktıyı üreten zinciri
  (prompt, girdi görselleri, model, ayarlar) seçilen projeye geri kurar; çıktı sabitlenir, yeniden üretilmez.

---

## Modeller

| Tür | Modeller |
|---|---|
| Görsel | Nano Banana 2 ✓, Nano Banana Pro, GPT Image 2 ✓, Seedream 5 Pro |
| Video | Kling 3.0 ✓, Kling V3 Turbo, Seedance 2.5, Hailuo 2.3 Pro |
| Araç | Topaz Upscale, Arka Plan Sil (Recraft) |

✓ = gerçek key ile doğrulandı. Diğerleri "deneysel" etiketlidir: parametreleri Kie dokümanından alındı
ama henüz gerçek bir üretimde denenmedi. Fiyatlar tahminidir: `docs/pricing-notes.md`.

### Yeni model eklemek

Modeller kodda değil, `packages/catalog/src/models/` altındaki kayıtlarla tanımlıdır:

1. Modelin Kie dokümanını oku: `https://docs.kie.ai/market/<üretici>/<model>.md` (liste: https://docs.kie.ai/llms.txt).
2. `image.ts`, `video.ts` ya da `tools.ts` içine bir kayıt ekle: `model` adı (varyantlar), girdi portları
   (hangi port hangi Kie parametresine gider), ayarlar, kurallar, maliyet.
3. Kaydı dosyanın sonundaki listeye ekle; `npm test` katalog bütünlüğünü kontrol eder.
4. Gerçek bir üretimde çalıştıktan sonra `status: 'verified'` yap.

---

## Verilerin nerede?

```
data/
  canvas.db          görev kayıtları (SQLite)
  settings.json      onay eşiği
  projects/          her proje bir .json   (.trash/ = silinenler)
  uploads/           yüklediğin görseller (içerik hash'iyle adlandırılır)
  media/<proje>/<node>/<görev>_0.png|mp4   üretilen dosyalar
                     + <görev>.json        model, prompt, ayarlar, taskId, kredi (sidecar)
```

Yedeklemek için `data/` klasörünü kopyalaman yeterli. Kie tarafındaki sonuç bağlantıları kısa ömürlüdür;
yerel kopya kalıcıdır.

---

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Uygulamayı başlatır (http://127.0.0.1:5173) |
| `npm run dev:mock` | Sahte modda başlatır (http://127.0.0.1:5174, kredi harcanmaz) |
| `npm test` | Tüm testler (sahte Kie ile; kredi harcanmaz) |
| `npm run typecheck` | Tip kontrolü |
| `npm run build` | Ön yüzü derler |
| `npm run check:bundle` | Derlenmiş ön yüzde key ya da Kie adresi olmadığını doğrular (önce `build`) |

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| Üst barda "API key geçersiz veya eksik" | `.env` dosyasında `KIE_API_KEY` doğru mu? Değiştirdikten sonra `npm run dev`'i yeniden başlat. |
| Turuncu bant: "kredi yetersiz (402)" | https://kie.ai/billing üzerinden bakiye yükle, sonra bantta **Bakiyeyi yenile**. |
| "Yerel sunucuya ulaşılamadı" / sayfa "Yükleniyor…"da kalıyor | Terminalde sunucu çökmüş olabilir: `Ctrl+C` ile kapatıp `npm run dev` ile yeniden başlat. |
| Port kullanımda hatası | Başka bir `npm run dev` açık olabilir; kapat ya da `.env`'de `SERVER_PORT`'u değiştir. |
| Üretim uzun sürüyor | Video modelleri birkaç dakika sürebilir. Sınır: görsel 10 dk, video 20-25 dk. Aşılırsa taskId saklanır. |
| Yenileme sonrası zincirin kalanı başlamadı | Çalışan görev sunucuda biter; bekleyen sonraki adımlar için node'da tekrar **Çalıştır**'a bas. |

## Güvenlik

- Sunucu yalnızca `127.0.0.1` adresini dinler; ağdaki başka cihazlar erişemez.
- Başka web sitelerinin tarayıcın üzerinden bu sunucuya istek atması engellenir (Host/Origin kontrolü, özel başlık).
- API key sadece sunucuda kullanılır; `npm run check:bundle` ön yüzde olmadığını doğrular.
