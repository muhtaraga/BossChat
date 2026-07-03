# BossChat 💬

Next.js (App Router) + socket.io ile gerçek zamanlı mesajlaşma uygulaması.

## Özellikler

- 📱 Telefon numarası + OTP ile kayıt/giriş (JWT session, httpOnly cookie)
- 👤 Profil: isim, avatar, durum mesajı
- 💬 Birebir ve grup sohbetleri (admin rolü, üye ekleme/çıkarma)
- ⚡ Gerçek zamanlı mesajlaşma (socket.io)
- ✏️ Mesaj düzenleme ve silme (herkes için, gerçek zamanlı yayılır)
- 🖼️ Resim ve dosya paylaşımı (yerel disk; S3'e taşınabilir yapıda)
- 🔔 Uygulama içi toast + tarayıcı bildirimleri + **Web Push** (uygulama kapalıyken bile, service worker ile)
- 🟢 Çevrimiçi/çevrimdışı ve "yazıyor..." göstergesi
- ✓✓ Okundu bilgisi (mavi tik)
- ♾️ Mesaj geçmişi ve sonsuz kaydırma
- 🐘 PostgreSQL desteği (tek satırlık şema geçişi + veri kopyalama scripti)

## Kurulum

> **Bu proje şu an PostgreSQL üzerinde çalışıyor** (docker-compose ile).
> Kurulum için "Veritabanı (PostgreSQL)" bölümüne bakın. Sıfır-kurulum SQLite'a
> dönmek isterseniz "SQLite'a geri dönüş" bölümü var.

```bash
npm install
docker compose up -d   # PostgreSQL'i başlatır (bosschat-pg, port 5433)
npm run db:migrate     # Postgres tablolarını oluşturur
npm run dev            # http://localhost:3000
```

Geliştirme modunda OTP kodları **sunucu konsoluna** yazılır. Prod'da `.env`
içinde `OTP_PROVIDER=twilio` + Twilio değişkenlerini ayarlayın
([lib/otp.ts](lib/otp.ts) içindeki sağlayıcı soyutlaması).

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu (custom server + socket.io) |
| `npm run build` && `npm start` | Prod derleme ve çalıştırma |
| `npm run db:generate` | Şema değişikliğinden SQLite migration üret |
| `npm run db:generate:pg` | Postgres migration üret |
| `npm run db:migrate` | Migration'ları uygula (DATABASE_URL'e göre SQLite/Postgres) |
| `npm run db:copy-to-pg` | SQLite verisini Postgres'e kopyala |
| `npm run db:studio` | Drizzle Studio (veritabanı arayüzü) |
| `npm run typecheck` | TypeScript kontrolü |

## Veritabanı (PostgreSQL)

Proje aktif olarak PostgreSQL kullanır. Yerel DB [docker-compose.yml](docker-compose.yml)
ile yönetilir (kalıcı volume, otomatik yeniden başlatma):

```bash
docker compose up -d     # başlat (bosschat-pg, host portu 5433)
docker compose down      # durdur (veri korunur)
docker compose down -v   # sıfırla (volume dahil siler)
```

İlgili `.env` ayarı:
`DATABASE_URL=postgres://bosschat:bosschat@localhost:5433/bosschat`

Sürücü, `DATABASE_URL`'den otomatik seçilir; [db/schema.ts](db/schema.ts) hangi
dialect şemasını export ederse (`schema.pg` / `schema.sqlite`) o dialect'e göre
tipler de derlenir. Şema ile URL uyuşmazsa uygulama açılışta açıklayıcı bir hatayla
durur.

**Sıfırdan Postgres migration'ı üretmek:** `npm run db:generate:pg`
(çıktı: `db/migrations-pg`).

### SQLite'a geri dönüş

1. [db/schema.ts](db/schema.ts) içinde `export * from "./schema.pg"` satırını
   yorumlayıp `export * from "./schema.sqlite"` satırını aç.
2. `.env` içinde `DATABASE_URL=file:./data/bosschat.db` yap.
3. `npm run db:migrate && npm run dev`.

### SQLite → Postgres veri taşıma

Mevcut bir SQLite veritabanını Postgres'e kopyalamak için (Postgres tabloları
`db:migrate` ile hazır olduktan sonra): `npm run db:copy-to-pg`
(kaynak SQLite dosyası `SQLITE_URL` ile değiştirilebilir; id sequence'ları otomatik
senkronlanır).

## Web Push

VAPID anahtarları `.env` içinde tanımlıysa (yoksa: `npx web-push generate-vapid-keys`),
kullanıcı bildirim izni verdiğinde tarayıcı [public/sw.js](public/sw.js) service
worker'ına abone olur ve abonelik veritabanına kaydedilir. Bir mesaj geldiğinde
**çevrimdışı** üyelere push gönderilir; sekme açıkken socket + toast devrededir.
Anahtarlar tanımlı değilse push sessizce devre dışı kalır.

## Mimari

```
app/            # Next.js sayfaları ve API route'ları
  api/          # auth, me, users, conversations, upload, files
  login/        # OTP giriş akışı
  chat/         # ana sohbet arayüzü
components/     # UI bileşenleri (Sidebar, ChatWindow, modallar...)
hooks/          # useSocket (tekil socket bağlantısı)
lib/            # auth (JWT), otp (sağlayıcı soyutlaması), dto, conversations
server/         # custom HTTP server + socket.io event handler'ları
db/             # Drizzle şeması, migration'lar, bağlantı
types/          # client/server ortak DTO ve socket event tipleri
```

- **Custom server** ([server/index.ts](server/index.ts)): Next.js ile socket.io
  aynı HTTP sunucusunu ve süreci paylaşır; API route'ları `getIO()` ile
  socket'e event yayınlayabilir.
- **Veritabanı**: SQLite (libsql) + Drizzle ORM, varsayılan. Postgres şeması
  ([db/schema.pg.ts](db/schema.pg.ts)) birebir hazır; yukarıdaki "PostgreSQL'e
  geçiş" bölümüne bakın.
- **Okundu bilgisi**: üye başına `lastReadMessageId`; bir mesaj, diğer tüm
  üyelerin bu değeri mesaj id'sine ulaştığında "mavi tik" alır.
- **OTP güvenliği**: kodlar SHA-256 ile hash'lenerek saklanır, 5 dk geçerlidir,
  kod başına 5 deneme ve 10 dk'da 5 kod limiti vardır.
