Ти працюєш у проєкті ALiSiO PMS. Це модульний моноліт (Next.js 16 + SQLite).

ПЕРЕД будь-якою роботою прочитай:
1. CLAUDE.md — правила проєкту (модульність, імпорти, стиль)
2. ARCHITECTURE.md — карта модулів, зв'язки, event bus
3. README.md у src/modules/<назва_модуля>/ того модуля, який торкаєш

ГОЛОВНЕ ПРАВИЛО МОДУЛЬНОСТІ:
- Імпортуй тільки з публічного API модуля: @bookings, @guests, @properties, @pricing,
  @finance, @crm, @channels, @reports, @payments, @auth, @admin, @dashboard
- НІКОЛИ не імпортуй з @/modules/<x>/data/..., domain/..., events/..., ui/... — це порушення
- @core/db, @core/auth, @core/event-bus і @shared/* доступні всім
- app/ шар має бути тонким — тільки роутинг, бізнес-логіку виносити в модулі

ПЛАТЕЖІ — ОКРЕМИЙ ІЗОЛЬОВАНИЙ МОДУЛЬ:
Уся Teia-логіка живе в @payments. Перед будь-якою роботою з оплатами обов'язково
прочитай src/modules/payments/README.md — там повний опис API, env-змінних,
трьох окремих магазинів Teia, webhook-ключів, підтримуваних потоків.

Короткі правила для оплат:
- Для створення платіжної сесії використовуй createPaymentSession(intent) з @payments
- НЕ викликай createCheckoutSession з @/lib/teya (це shim, лишений для старих імпортів)
- НЕ дублюй webhook-логіку — вебхуки вже є в @payments (teyaWebhook, teyaBotWebhook)
- НЕ змінюй формат metadata (reservation_id, order_ids, source, deposit_percent,
  reservation_ids, lead_id, guest_name, company) — «висячі» сесії мають дограти
- НЕ змінюй webhook URLs (/api/webhooks/teya, /api/webhooks/teya-bot) — Teia налаштована саме на них
- НЕ чіпай схему БД без явного дозволу