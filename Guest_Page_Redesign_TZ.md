# ТЗ на редизайн гостьової сторінки бронювання
## ALiSiO / Kemp Carlsbad — Guest Page v3

---

## Контекст

Поточна сторінка: `https://alisio.swipescape.eu/guest/{booking_id}`
Це SPA (single page application), яка створюється автоматично при створенні бронювання.

Проблема поточної версії: сторінка — це довгий лонгрід, де всі блоки (реєстрація, послуги, правила, інфо, FAQ) показані одночасно, незалежно від етапу гостя. Виглядає як адмін-панель, а не як сервіс для гостя.

Ціль редизайну: перетворити сторінку з "інфосторінки" на "гостьовий додаток" (app-like experience). Використати нативні мобільні патерни: bottom tabs, bottom sheets, stories, wallet-cards, chat.

Додаток-прототип (React JSX) прикріплений до цього файлу. Він є інтерактивним reference — кожен елемент в ньому клікабельний і демонструє точну поведінку.

---

## Загальна архітектура

### Layout

```
┌──────────────────────────────┐
│  Booking Card (wallet-style) │  ← завжди зверху
├──────────────────────────────┤
│  Stories Row (кружечки)      │  ← горизонтальний скрол
├──────────────────────────────┤
│  Контент вкладки             │  ← змінюється за активним табом
│  (Home / Services / Explore) │
├──────────────────────────────┤
│  Bottom Tab Bar              │  ← fixed, завжди видимий
└──────────────────────────────┘
```

### Навігація — Bottom Tab Bar (4 вкладки)

Фіксований внизу екрана. Blur-ефект фону (backdrop-filter: blur(20px)). Висота: ~60px + safe area inset знизу.

| Tab | Іконка | Поведінка |
|-----|--------|-----------|
| Home | 🏠 | Головний екран: статус, задачі, інфо |
| Services | ✨ | Каталог послуг |
| Explore | 🗺 | Місця, маршрути, околиці |
| Chat | 💬 | Відкриває bottom sheet з чатом |

Активна вкладка підсвічується кольором бренду (#2E6B4F). Chat — не окрема вкладка, а відкриває bottom sheet поверх будь-якої вкладки.

---

## Компоненти

### 1. Booking Card (wallet-style)

Розташування: зверху сторінки, під будь-якою вкладкою (Home).
Стиль: темний градієнт (background: linear-gradient(145deg, #2E6B4F, #1E4A36)), білий текст, border-radius: 16px, padding: 18px 20px.

Вміст:
- Верхній рядок: "KEMP CARLSBAD" (маленький, uppercase, opacity 0.6) + назва будинку великим (22px, bold)
- Правий верхній кут: перемикач мови (EN / CZ / DE) — маленькі пілюлі
- Середній рядок: три колонки — CHECK-IN (дата + час) | NIGHTS (число) | CHECK-OUT (дата + час)
- Нижній рядок: розділений лінією (rgba white 0.15), показує контекстне повідомлення залежно від етапу:
  - До заїзду: "🗓 X days to go"
  - День заїзду: "🌟 Today is the day!"
  - Під час проживання: "🌿 Day N — enjoy the forest"
  - Виїзд: "👋 Check-out today"
- Праворуч внизу: ім'я гостя (opacity 0.5)

Дані: {house_name}, {check_in_date}, {check_in_time}, {check_out_date}, {check_out_time}, {nights_count}, {guest_name}, {days_until_checkin}, {current_day_of_stay}

### 2. Stories Row

Розташування: під booking card, горизонтальний скрол.
Стиль: кружечки 56x56px з emoji всередині. Якщо елемент "активний" (є контент) — обводка градієнтом (як непереглянута Stories в Instagram). Під кружком — підпис 10px.

Елементи (зліва направо):
1. 📍 Directions → відкриває bottom sheet "How to get here"
2. 🔑 Entry → bottom sheet "Entry instructions"
3. 📶 Wi-Fi → bottom sheet "Wi-Fi"
4. 🅿️ Parking → bottom sheet "Parking"
5. 🍽 Restaurant → bottom sheet "Restaurant"
6. 🥾 Hiking → bottom sheet "Hiking trails"

Кожен елемент при натисканні відкриває відповідний bottom sheet (опис нижче).

### 3. Bottom Sheet (universal component)

Стиль: Apple Maps / Uber pattern.
- Overlay: rgba(0,0,0,0.35) + backdrop-filter: blur(4px)
- Sheet: білий, border-radius: 16px 16px 0 0, max-height: 85vh
- Drag handle: сіра пілюля 36x5px зверху по центру
- Заголовок: 20px bold + кнопка закриття (сіре коло 30px з ✕)
- Контент: скролиться всередині sheet
- Анімація: slide up знизу (0.3s ease)
- Закриття: натиск на overlay або кнопку ✕

Цей компонент використовується для ВСЬОГО додаткового контенту: Wi-Fi, маршрути, послуги, чат, реєстрація.

### 4. Bottom Sheet: Directions

Вміст:
- Карта (placeholder або Google Maps embed)
- Адреса, GPS координати, інфо про паркування
- Блок "🎥 Watch the last 500m video guide" (зелений фон, посилання на відео)
- Кнопка "Open in Google Maps" (full width, зелена)

### 5. Bottom Sheet: Wi-Fi

Вміст (центрований):
- Великий emoji 📶
- "Network" (сірий підпис) + назва мережі (великий bold)
- "Password" (сірий підпис) + пароль (великий bold, monospace)
- Кнопка "Copy Password" (копіює в буфер обміну)

### 6. Bottom Sheet: Entry Instructions

Вміст:
- Фото входу / lockbox (placeholder)
- Пронумеровані кроки: 1. Знайти кабіну → 2. Lockbox справа → 3. Код (великий, monospace, зелений) → 4. Повернути ключ
- Блок для пізнього заїзду: "🌙 Arriving after dark? Pathway lights turn on automatically" (помаранчевий фон)

### 7. Bottom Sheet: Service Detail

Відкривається при натисканні на будь-який сервіс.
Вміст (центрований):
- Великий emoji (56px)
- Ціна (24px bold)
- Одиниця виміру (13px, сірий)
- Опис (15px)
- Кнопка "Add to My Stay" (full width, зелена)

### 8. Bottom Sheet: Chat

iMessage-style чат.
Вміст:
- Список повідомлень: бабли з border-radius: 18px
  - Повідомлення від хоста: сірий фон, ліворуч
  - Повідомлення від гостя: зелений фон (#2E6B4F), білий текст, праворуч
  - Під кожним бабл — час (10px, сірий)
- Поле введення: border-radius: 22px, сірий бордер, placeholder "Type a message..."
- Кнопка відправки: круглий зелений 44px з ↑
- При відкритті чату — автоматичне перше привітальне повідомлення від хоста

Повідомлення надсилається адміністратору (push + Telegram). Відповідь адміністратора з'являється в цьому ж чаті.

---

## Контент вкладки HOME (змінюється за етапом)

### Етап визначається автоматично за датами бронювання:
- **before**: check_in_date мінус 2+ днів
- **checkin_day**: check_in_date (сьогодні)
- **during**: між check_in і check_out
- **checkout**: check_out_date (сьогодні) або останній день

### Блок "What to do now" / "Your stay" / "Before you leave"

iOS Settings style — білий блок з border-radius: 14px, list rows всередині.

**Етап BEFORE (до заїзду):**
- ✅ Booking confirmed (без дії)
- ⚠️ Guest registration → "Required" → натискання відкриває реєстрацію
- 🔒 Check-in instructions → "Mar 1" (заблокований, буде доступний пізніше)

**Етап CHECKIN_DAY:**
- ✅ Registration complete
- 🔑 Entry instructions → відкриває bottom sheet Entry
- 📍 How to get here → відкриває bottom sheet Directions

**Етап DURING:**
- 🔥 Order firewood → відкриває sheet сервісу
- 🧖 Book sauna → відкриває sheet сервісу
- 🥐 Breakfast for tomorrow → відкриває sheet сервісу

**Етап CHECKOUT:**
- ☐ Close windows & lights (чек-ліст, без дії)
- ☐ Key in the lockbox
- ⏰ Late check-out until 14:00 → 400 Kč → відкриває sheet сервісу

### Блок "Good to know"

iOS Settings style list. Завжди видимий на HOME.

| Icon | Label | Value | Дія |
|------|-------|-------|-----|
| 🕐 | Check-in | 15:00 | — |
| 🕚 | Check-out | 11:00 | — |
| 📶 | Wi-Fi | Tap to copy | Відкриває Wi-Fi sheet |
| 🐕 | Pets | Welcome | — |
| 📞 | Support | +420 773 708 849 | Click-to-call |

### Блок "Your cabin"

Chips/pills з amenities: 🛏 Queen bed, 🚿 Shower, 🔥 Heating, ❄️ A/C, 📶 Wi-Fi, 🍳 Kitchen, ☕ Coffee, 🧺 Towels, 🧴 Toiletries

### Блок "House rules"

Компактний, одним блоком:
```
🌙 Quiet after 23:00 · 🚭 Smoke-free cabins
🔥 Fire pits only · 🐕 Leash in common areas
🚗 10 km/h · ♻️ Sort waste · 🧖 Reserve sauna
```

Тон позитивний, не заборонний.

### Блок "Feedback" (тільки CHECKOUT)

- "💚 How was your stay?"
- "What's the one thing you'll remember?"
- Textarea (placeholder: "The campfire under the stars...")
- Кнопка "Send"

### Погода (CHECKIN_DAY + DURING)

Білий блок з emoji погоди (⛅), температура, короткий коментар ("Great day for the river trail 🌲").
Дані: з OpenWeatherMap API або ручне введення адміністратором.

---

## Контент вкладки SERVICES

Заголовок: "Services" (28px bold) + підзаголовок "Add something special to your stay" (14px, сірий).

Список сервісів — кожен як окрема картка (білий блок, border-radius: 14px):
- Ліворуч: emoji в квадраті 48x48 на пісочному фоні
- Центр: назва (15px bold) + опис (12px сірий)
- Праворуч: ціна (15px bold зелений) + одиниця (10px сірий)
- Натискання на картку → відкриває bottom sheet з деталями + кнопка "Add to My Stay"

Список сервісів:
1. 🥐 Breakfast — 250 Kč/person
2. 🧖 Sauna — 800 Kč/session
3. 🔥 Campfire Set — 250 Kč/set
4. ❤️ Romantic Package — 800 Kč/pkg
5. 🚲 Bicycle — 350 Kč/day
6. ⚡ E-Bike — 600 Kč/day
7. ⏰ Late Check-out — 400 Kč
8. 🐶 Dog Kit — 150 Kč

Внизу: блок Restaurant Carlsbad з розкладом + кнопка "View Menu →"

---

## Контент вкладки EXPLORE

Заголовок: "Explore" (28px bold) + "Discover what's around you" (14px, сірий).

Картки місць:
1. 🥾 Hiking trails — River walk (30 min) · Forest loop (1.5h) · Lookout (2h) → "View routes →"
2. 🚴 Cycling routes → "Open Mapy.cz →"
3. 🌅 Sunset spot — "Best view from the hill behind cabin A — 5 min walk"
4. 🛒 Nearest shop — Večerka Březová, 800m → "Navigate →"
5. 💊 Pharmacy — Dr. Max Loketská → "Navigate →"
6. 🚗 Karlovy Vary — 15 min drive → "Navigate →"

Посилання "Navigate →" — deep link на Google Maps / Mapy.cz.

---

## Реєстрація (Registration Flow)

Відкривається як full-screen overlay (не bottom sheet — повний екран).

### Верхня панель:
- Кнопка "← Back"
- "Step X of 3"
- Progress bar (4px, заповнюється зеленим)

### Крок 1: Guest Details
Поля:
- Full name (required, autocomplete="name")
- Email (required, autocomplete="email")
- Phone (optional — підпис "only for check-in day contact", autocomplete="tel")
- Date of birth (required, autocomplete="bday")

### Крок 2: ID Document
- Пояснення навіщо: "Required by Czech law for all accommodation guests"
- Блок безпеки: "🔒 Your data is stored securely and used only for mandatory guest registration"
- Document type (select: Passport / National ID / Driving licence)
- Document number (текстове поле)
- Nationality (текстове поле, autocomplete="country-name")
- Помилки: конкретні, наприклад "Document number seems too short — usually 8-9 characters"

### Крок 3: Confirm
- Таблиця всіх введених даних для перевірки
- Зелений блок: "✅ That's it! After confirming, you'll receive check-in instructions."
- Кнопка "Confirm Registration ✓"

### Sticky CTA внизу кожного кроку:
- "Continue →" (кроки 1-2)
- "Confirm Registration ✓" (крок 3)
- "← Go back" (кроки 2-3, secondary)

Після завершення: overlay закривається, на HOME задача "Guest registration" міняється на ✅.

---

## Дизайн-система

### Кольори
| Назва | Hex | Використання |
|-------|-----|--------------|
| Background | #F2F2F7 | Фон сторінки (iOS system gray 6) |
| Card | #FFFFFF | Всі картки, блоки |
| Text | #000000 | Основний текст |
| Secondary | #8E8E93 | Підписи, мета-текст |
| Separator | #E5E5EA | Розділювачі між рядками |
| Tint / Brand | #2E6B4F | Бренд-колір, кнопки, активні елементи |
| Forest Light | #E8F5EE | Фон акцентних блоків |
| Sand | #F5F0E8 | Фон emoji-контейнерів в сервісах |
| iOS Blue | #007AFF | Текстові посилання |
| Orange | #FF9500 | Попередження, warnings |
| Green | #34C759 | Статус "done" |
| Red | #FF3B30 | Помилки |

### Типографіка
- Шрифт: -apple-system, SF Pro Text, Helvetica Neue, sans-serif (системний iOS)
- Заголовок секції: 20px, weight 700
- Заголовок вкладки: 28px, weight 700
- Body: 15px, weight 400
- Secondary: 13px, weight 400, колір #8E8E93
- Small: 10-11px

### Радіуси
- Картки: 14px
- Кнопки: 10-12px
- Pills/chips: 14-16px
- Bottom sheet: 16px 16px 0 0
- Stories кружки: 50%
- Chat bubbles: 18px (з заокругленням 4px на стороні відправника)

### Тіні
- Картки: box-shadow: 0 1px 3px rgba(0,0,0,0.06) — мінімальна, ледь помітна
- Bottom sheet overlay: rgba(0,0,0,0.35) + blur(4px)
- Tab bar: border-top 0.5px solid #E5E5EA + blur(20px)

### Touch targets
- Мінімальний розмір кнопки: 44x44px
- Tab bar кнопки: мінімум 48px зона натискання
- Stories кружки: 56x56px
- List rows: мінімум 44px висоти

---

## Поведінка та стани

### Мультимовність
- Перемикач EN/CZ/DE на booking card
- Весь контент сторінки змінюється при зміні мови
- Збереження вибору в localStorage або за мовою бронювання

### Stage-based content
Сторінка автоматично змінює контент на основі поточної дати vs дати check-in/check-out:
- `current_date < check_in_date - 1` → before
- `current_date == check_in_date` → checkin_day
- `check_in_date < current_date < check_out_date` → during
- `current_date == check_out_date` → checkout

### Замовлення сервісів
При натисканні "Add to My Stay" → замовлення зберігається в PMS → адміністратор отримує push/Telegram → гість бачить підтвердження в чаті.

### Чат
Реал-тайм або near-real-time повідомлення між гостем і адміністратором. Мінімальний варіант: повідомлення від гостя надсилається в Telegram адміністратору, відповідь адміністратора з'являється в чаті на сторінці.

---

## Що НЕ змінювати

- URL-структура: `/guest/{booking_id}` залишається
- Бекенд API: використовувати ті ж самі endpoints для даних бронювання, реєстрації, послуг
- Логіка реєстрації: ті ж поля, та ж валідація — змінюється лише UI (розбивка на кроки, пояснення, autofill)

---

## Пріоритет реалізації

### Фаза 1 (must have):
1. Bottom tab bar (Home / Services / Explore / Chat)
2. Booking card (wallet-style)
3. Stage-based контент на HOME
4. Bottom sheet компонент
5. Stories row з основними sheets (Directions, Entry, Wi-Fi)
6. Реєстрація в 3 кроки

### Фаза 2 (should have):
7. Chat (bottom sheet, з'єднання з Telegram адміна)
8. Service ordering (bottom sheets + "Add to My Stay")
9. Мультимовність
10. Погода

### Фаза 3 (nice to have):
11. Feedback форма (checkout)
12. Анімації (slide up для sheets, transitions між табами)
13. Copy password to clipboard
14. Deep links на Google Maps / Mapy.cz
