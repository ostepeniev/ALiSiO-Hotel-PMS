# ALiSiO booking widget — Batch 2: overflow fix + remove gender + services-after-pay plan

Три правки:
- **A.** Technical plan для "Послуги після оплати" — потребує твого рішення по 3 питаннях, тільки після цього роблю код.
- **B.** Фікс overflow на Step 2 (текст вилазить праворуч) — 1 Edit, готовий до застосування.
- **C.** Прибрати поле "Стать" — 16 Edits у 4 файлах, готові до застосування.

---

# A. План "Послуги після оплати" (потребує підтвердження)

### Нова нумерація кроків

- Step 1 — дати, промо/сертифікат (без змін).
- Step 2 — вибір юніта (без змін).
- Step 3 — гість + підтвердження → **"Оплатити"** (тепер фінальна дія, викликає `submitBooking`).
- Step 4 — **upsell послуг** після успішної оплати номера (нова роль).
- Step 5 — фінальний success (із переліком куплених послуг).

### Що міняється в коді

1. `submitBooking` чиститься від послуг: викликає `/api/booking/reserve` тільки з даними номера/гостя/промо → Teya checkout з `amount = room + extraPerson + pet − discounts` (без `servicesTotal`) → редірект.
2. Блоки `if (saunaAdded) …`, `if (tubAdded) …`, `if (breakfastAdded) …`, `if (lateCheckout) …`, `if (earlyCheckin) …` виносяться у нову функцію `submitServices(reservationId)`, яка викликається зі Step 4.
3. `useEffect` на `?success=...&payment_status=success` ставить `setStep(4)` (не 5). Перед редіректом зберігаємо контекст брони (reservationId, checkIn/checkOut, unit, імʼя) у `sessionStorage["booking-return-ctx"]`; на поверненні відновлюємо стейт.
4. `fetchServices()` переноситься на вхід у Step 4 (всередині того ж useEffect, що ловить payment-return).
5. Step 4 UI: зверху банер "Бронь підтверджено, оплата пройшла"; свк-картки як зараз; у sticky-footer — "Пропустити" (→ Step 5 без послуг) і "Підтвердити послуги" (основна, якщо хоч один сервіс додано).
6. Оплата послуг — окремий Teya checkout з `amount = servicesTotal` + `payment_kind=services`; на повернення `setStep(5)`.
7. Step 5 (success) показує unit, дати, total за номер + (якщо є) перелік куплених сервісів.

### Питання перед кодом

**Q1.** Послуги оплачуються **другим Teya-платежем** чи **на рецепції при заселенні** (сервіси додаються як unpaid, персонал виставляє рахунок)? Другий варіант спрощує архітектуру (один платіж, сервіси лише як записи).

**Q2.** Якщо користувач закриє вкладку після оплати номера і не повернеться на upsell-крок — ок, що бронь є, але послуг нема? Можна додати follow-up email зі списком послуг.

**Q3.** Step 5 після F5 (refresh) — робимо `GET /api/booking/reservation?id=...` чи обходимось sessionStorage (зламається при приватному режимі Safari)?

Після відповідей повертаюсь з повним Edit-патчем для цієї правки.

---

# B. Фікс overflow на expanded card (Step 2)

Причина: на мобайлі `.booking-house-expanded-footer` лишається `flex-direction: row; justify-content: space-between` з двома дітьми (actions + dynamic-price). Price-блок не переноситься й виштовхує текст за правий край.

## Файл: `src/app/booking/booking.css`

### Edit B1

**old_string:**

```
  .booking-codes-row {
    flex-direction: column;
  }
```

**new_string:**

```
  .booking-codes-row {
    flex-direction: column;
  }

  /* Fix: expanded house-card footer on mobile was overflowing right.
     Stack price summary above the action buttons; make buttons share width. */
  .booking-house-expanded-footer {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .booking-house-dynamic-price {
    text-align: left;
    order: -1;
    width: 100%;
    min-width: 0;
  }

  .booking-house-dynamic-total {
    justify-content: flex-start;
  }

  .booking-house-expanded-actions {
    width: 100%;
  }

  .booking-house-expanded-actions > button {
    flex: 1 1 0;
    min-width: 0;
  }
```

---

# C. Прибрати поле "Стать" (Gender)

## Файл 1 — `src/app/booking/page.tsx`

### Edit C1 — видалити стейт `gender`

**old_string:**

```
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [gender, setGender] = useState<'female' | 'male' | 'other'>('male');

  // Calendar navigation
```

**new_string:**

```
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  // Calendar navigation
```

### Edit C2 — видалити gender з payload `/api/booking/reserve`

**old_string:**

```
          email: email.trim() || undefined,
          phone: phone.trim(),
          gender,
          promoCode: promoApplied || undefined,
```

**new_string:**

```
          email: email.trim() || undefined,
          phone: phone.trim(),
          promoCode: promoApplied || undefined,
```

### Edit C3 — прибрати `gender` з dependency array `submitBooking`

**old_string:**

```
  }, [checkIn, checkOut, selectedUnit, cardAdults, cardChildren, cardHasPet, firstName, lastName, email, phone, gender, promoApplied, certInput, t, goToStep, saunaAdded, saunaDate, saunaStartHour, saunaHours, saunaBroom, tubAdded, tubDate, tubStartHour, tubHours, breakfastAdded, breakfastItems, lateCheckout, earlyCheckin, totalWithDiscount]);
```

**new_string:**

```
  }, [checkIn, checkOut, selectedUnit, cardAdults, cardChildren, cardHasPet, firstName, lastName, email, phone, promoApplied, certInput, t, goToStep, saunaAdded, saunaDate, saunaStartHour, saunaHours, saunaBroom, tubAdded, tubDate, tubStartHour, tubHours, breakfastAdded, breakfastItems, lateCheckout, earlyCheckin, totalWithDiscount]);
```

### Edit C4 — прибрати `setGender('male')` із `resetForm`

**old_string:**

```
    setAdults(2);
    setChildren(0);
    setGender('male');
    setPromoInput('');
```

**new_string:**

```
    setAdults(2);
    setChildren(0);
    setPromoInput('');
```

### Edit C5 — видалити JSX-блок "Gender" зі Step 3

**old_string:**

```
                {/* Gender */}
                <div className="booking-field" style={{ marginBottom: 16 }}>
                  <label className="booking-field-label">{t.gender} <span className="booking-field-required">*</span></label>
                  <div className="booking-gender-row">
                    {(['female', 'male', 'other'] as const).map(g => (
                      <button
                        key={g}
                        className={`booking-gender-option ${gender === g ? 'active' : ''}`}
                        onClick={() => setGender(g)}
                        type="button"
                      >
                        <div className="booking-gender-radio" />
                        {g === 'female' ? t.genderFemale : g === 'male' ? t.genderMale : t.genderOther}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Phone & Email */}
```

**new_string:**

```
                {/* Phone & Email */}
```

---

## Файл 2 — `src/app/booking/translations.ts`

### Edit C6 — прибрати з TypeScript-типу

**old_string:**

```
  firstName: string;
  lastName: string;
  gender: string;
  genderFemale: string;
  genderMale: string;
  genderOther: string;
  phone: string;
  email: string;
```

**new_string:**

```
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
```

### Edit C7 — український словник

**old_string:**

```
    firstName: "Ім'я",
    lastName: 'Прізвище',
    gender: 'Стать',
    genderFemale: 'Жіноча',
    genderMale: 'Чоловіча',
    genderOther: 'Інше',
    phone: 'Номер телефону',
```

**new_string:**

```
    firstName: "Ім'я",
    lastName: 'Прізвище',
    phone: 'Номер телефону',
```

### Edit C8 — англійський словник

**old_string:**

```
    firstName: 'First name',
    lastName: 'Last name',
    gender: 'Gender',
    genderFemale: 'Female',
    genderMale: 'Male',
    genderOther: 'Other',
    phone: 'Phone number',
```

**new_string:**

```
    firstName: 'First name',
    lastName: 'Last name',
    phone: 'Phone number',
```

### Edit C9 — чеський словник

**old_string:**

```
    firstName: 'Jméno',
    lastName: 'Příjmení',
    gender: 'Pohlaví',
    genderFemale: 'Žena',
    genderMale: 'Muž',
    genderOther: 'Jiné',
    phone: 'Telefonní číslo',
```

**new_string:**

```
    firstName: 'Jméno',
    lastName: 'Příjmení',
    phone: 'Telefonní číslo',
```

### Edit C10 — німецький словник

**old_string:**

```
    firstName: 'Vorname',
    lastName: 'Nachname',
    gender: 'Geschlecht',
    genderFemale: 'Weiblich',
    genderMale: 'Männlich',
    genderOther: 'Andere',
    phone: 'Telefonnummer',
```

**new_string:**

```
    firstName: 'Vorname',
    lastName: 'Nachname',
    phone: 'Telefonnummer',
```

---

## Файл 3 — `src/app/booking/booking.css`

### Edit C11 — прибрати всі gender-класи

**old_string:**

```
/* Gender Radio */
.booking-gender-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.booking-gender-option {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius-sm);
  cursor: pointer;
  font-size: 14px;
  font-family: var(--bk-font);
  transition: all 0.2s;
  background: var(--bk-card);
}

.booking-gender-option:hover {
  border-color: var(--bk-text-muted);
}

.booking-gender-option.active {
  border-color: var(--bk-primary);
  background: var(--bk-primary);
  color: #fff;
}

.booking-gender-radio {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--bk-border);
  background: var(--bk-card);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
}

.booking-gender-option.active .booking-gender-radio {
  border-color: #fff;
  background: #fff;
}

.booking-gender-option.active .booking-gender-radio::after {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--bk-primary);
}

/* ─── Step 5: Success ──────────────────────────────── */
```

**new_string:**

```
/* ─── Step 5: Success ──────────────────────────────── */
```

### Edit C12 — прибрати mobile override для gender

> **Важливо:** якщо ти застосовуєш Правку B (overflow) і цей Edit C12 в одному файлі, роби **C12 ПЕРШИМ**, потім B1. Інакше Edit B1 не знайде своєї `old_string`, бо C12 видалить `.booking-gender-row` перед `.booking-codes-row`. Якщо B1 вже застосовано, використовуй C12-alt нижче.

**old_string:**

```
  .booking-form-row {
    grid-template-columns: 1fr;
  }
  
  .booking-gender-row {
    grid-template-columns: 1fr;
  }

  .booking-codes-row {
    flex-direction: column;
  }
```

**new_string:**

```
  .booking-form-row {
    grid-template-columns: 1fr;
  }

  .booking-codes-row {
    flex-direction: column;
  }
```

#### C12-alt (якщо B1 вже застосовано)

**old_string:**

```
  .booking-form-row {
    grid-template-columns: 1fr;
  }
  
  .booking-gender-row {
    grid-template-columns: 1fr;
  }

  .booking-codes-row {
```

**new_string:**

```
  .booking-form-row {
    grid-template-columns: 1fr;
  }

  .booking-codes-row {
```

---

## Файл 4 — `src/app/api/booking/reserve/route.ts`

### Edit C13 — видалити `gender` із деструктуризації body

**old_string:**

```
      firstName, lastName, email, phone,
      gender,
      promoCode, certificateCode,
```

**new_string:**

```
      firstName, lastName, email, phone,
      promoCode, certificateCode,
```

### Edit C14 — прибрати `gender` з UPDATE-запиту

**old_string:**

```
        db.prepare(
          'UPDATE guests SET first_name = ?, last_name = ?, phone = COALESCE(?, phone), gender = COALESCE(?, gender), updated_at = datetime("now") WHERE id = ?'
        ).run(firstName, lastName, phone || null, gender || null, guestId);
```

**new_string:**

```
        db.prepare(
          'UPDATE guests SET first_name = ?, last_name = ?, phone = COALESCE(?, phone), updated_at = datetime("now") WHERE id = ?'
        ).run(firstName, lastName, phone || null, guestId);
```

### Edit C15 — прибрати `gender` з INSERT (гість з email)

**old_string:**

```
        guestId = `g_${Date.now()}`;
        db.prepare(
          'INSERT INTO guests (id, organization_id, first_name, last_name, email, phone, gender) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(guestId, org.id, firstName, lastName, email, phone || null, gender || null);
```

**new_string:**

```
        guestId = `g_${Date.now()}`;
        db.prepare(
          'INSERT INTO guests (id, organization_id, first_name, last_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(guestId, org.id, firstName, lastName, email, phone || null);
```

### Edit C16 — прибрати `gender` з INSERT (гість без email)

**old_string:**

```
      guestId = `g_${Date.now()}`;
      db.prepare(
        'INSERT INTO guests (id, organization_id, first_name, last_name, phone, gender) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(guestId, org.id, firstName, lastName, phone || null, gender || null);
```

**new_string:**

```
      guestId = `g_${Date.now()}`;
      db.prepare(
        'INSERT INTO guests (id, organization_id, first_name, last_name, phone) VALUES (?, ?, ?, ?, ?)'
      ).run(guestId, org.id, firstName, lastName, phone || null);
```

Колонка `gender` у таблиці `guests` лишається — просто перестаємо її писати. Якщо в CRM-адмінці десь читають gender — скажи, дам grep по `(dashboard)` компонентах і окремий патч.

---

## Тест-чеклист після Правок B + C

- **Step 3 (особисті дані):** блок "Стать" повністю зник; під "Прізвищем" одразу "Телефон/Email". Перехід до Step 4 працює при заповнених First/Last/Phone.
- **Step 2 expanded card на мобілі (< 768px):** розгорнути юніт, проскролити до низу картки — ціна й кнопки вміщаються у ширину, нічого не вилазить за правий край; "Закрити" і "Забронювати" стають двома рівними кнопками.
- **Step 2 expanded card на десктопі:** вигляд не змінюється — actions ліворуч, dynamic-price праворуч.
- **Submit брони:** запит у `/api/booking/reserve` не містить `gender`, відповідь 200, бронь створюється. У логах SQLite — нові записи в `guests` без gender.
- **Всі 4 мови:** перемкни uk/en/cs/de на Step 3 — TypeScript компілиться, Step 3 рендериться без помилки.
- **Lint/TS:** у `page.tsx` не лишилось жодної згадки `gender` / `setGender` / `t.gender*` (Ctrl+F по файлу).

---

## Як застосувати в Antigravity

1. Почати з **Edit C1–C16** (прибрати gender). Якщо хочеш застосовувати і B1 в один присід: **C12 → B1** в тому ж файлі `booking.css` (інакше використай C12-alt).
2. У кожному файлі: Ctrl/Cmd+F по `old_string`, Replace на `new_string`.
3. Зберегти, `npm run dev`, відкрити `/booking`.
4. Якщо якийсь `old_string` не знайдено — локальна версія відрізняється від `main`, скинь мені той шматок і я переформулюю.
