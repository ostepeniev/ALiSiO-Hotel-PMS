# Промпт для онбордингу нових AI-сесій (AntiGravity, Claude, тощо)

Скопіюй цей блок на початку нового чату в AntiGravity або іншому AI-агенті, який працює над цим проєктом. Він дає агенту весь критичний контекст за один раз.

---

```
Ти працюєш у проєкті ALiSiO PMS. Це модульний моноліт (Next.js 16 + SQLite),
який автоматично деплоїться у прод при push у main.

ОБОВ'ЯЗКОВО ПЕРЕД РОБОТОЮ ПРОЧИТАЙ:
1. CLAUDE.md — правила проєкту (модульність, імпорти, стиль, deploy safety)
2. ARCHITECTURE.md — карта модулів і подій
3. docs/DEPLOY_SAFETY.md — як НЕ зламати прод
4. README.md того модуля, який торкаєш (у src/modules/<назва>/README.md)

DEPLOY SAFETY (критично — недотримання = впавший прод):
- НІКОЛИ не пуш напряму в main. Робиш гілку: git checkout -b fix/<short-name>
- Перед push: npx tsc --noEmit (нуль TS1xxx) і npm run build (успішно)
- Активуй pre-commit hook один раз: bash scripts/setup-hooks.sh
  (на Windows: scripts\setup-hooks.cmd)
- Якщо бачиш свої зміни синтаксис-помилок (лапки, JSX, дужки) — виправ ДО коміту
- Не використовуй --no-verify без явного дозволу користувача

МОДУЛЬНІСТЬ:
- Імпортуй ТІЛЬКИ з публічного API: @bookings, @guests, @properties, @pricing,
  @finance, @crm, @channels, @reports, @payments, @auth, @admin, @dashboard
- НІКОЛИ не імпортуй з @/modules/<x>/data/..., domain/..., events/..., ui/...
- @core/db, @core/auth, @core/event-bus і @shared/* доступні всім
- app/ шар тонкий — тільки роутинг, бізнес-логіка живе в модулях

ПЛАТЕЖІ — ОКРЕМИЙ ІЗОЛЬОВАНИЙ МОДУЛЬ @payments:
Уся Teia-логіка тут. Перед роботою з оплатами обов'язково:
- Прочитай src/modules/payments/README.md (повний API, env, потоки, 3 магазини Teia)
- Використовуй createPaymentSession(intent) з @payments
- НЕ викликай createCheckoutSession з @/lib/teya — це shim
- Webhook-handlers вже є в @payments (teyaWebhook, teyaBotWebhook), не дублюй
- НЕ змінюй формат metadata (reservation_id, order_ids, source, deposit_percent,
  reservation_ids, lead_id, guest_name) — висячі сесії мають дограти
- НЕ змінюй webhook URLs (/api/webhooks/teya, /api/webhooks/teya-bot)
- НЕ чіпай схему БД без явного дозволу

СТИЛЬ:
- На великих задачах — спочатку план, узгодження, потім код
- Маленькі атомарні коміти, кожен можна відкотити окремо
- Після правок: npx tsc --noEmit + npm run build (бажано)
- UI тексти українською
- Без зайвих коментарів і backwards-compat shims

РОБОЧИЙ ПРОЦЕС:
1. git checkout -b feature/<my-task>
2. <правки>
3. git commit (pre-commit hook ловить syntax errors)
4. git push origin feature/<my-task>
5. Створити PR на GitHub
6. CI запускається, має пройти `npm run build`
7. Після merge — auto-deploy на VPS
```

---

## Що ще треба зробити локально один раз

Якщо ти (Олег) налаштовуєш новий клон проєкту або новий ноутбук:

```bash
# 1. Активувати pre-commit hook
bash scripts/setup-hooks.sh    # або scripts\setup-hooks.cmd на Windows

# 2. (Тільки один раз для всього репо) Branch protection
gh auth login                                # OAuth, відкриє браузер
bash scripts/setup-branch-protection.sh      # активує захист main

# 3. Перевірити, що працює
git config --get core.hooksPath              # → .githooks
```
