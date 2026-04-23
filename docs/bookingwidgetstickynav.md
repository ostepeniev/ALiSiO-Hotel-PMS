# ALiSiO booking widget — sticky bottom nav buttons

Перенос кнопок "Назад / Далі" зі стартової позиції кожного кроку в sticky-footer на мобайлі. На десктопі — звичайний ряд у кінці кроку (без верхнього дубля). На Step 4 "Пропустити" винесена інлайн під картки сервісів.

---

## Файл 1 — `src/app/booking/page.tsx`

### Edit 1 — Step 1: видалити nav-bar з початку кроку

**old_string:**

```
          {/* ═══════ STEP 1: Your Choice (Dates) ═══════ */}
          {step === 1 && (
            <div className="booking-fade-in">
              {/* Nav Bar */}
              <div className="booking-nav-bar">
                <button className="booking-btn-back" disabled type="button">
                  ‹ {t.back}
                </button>
                <button
                  className="booking-btn-next"
                  onClick={goToStep2}
                  disabled={!checkIn || !checkOut || nights < 1}
                  type="button"
                >
                  {t.next} ›
                </button>
              </div>

              <div className="booking-content-card">
                <div className="booking-content-card-title">{t.enterStayData}</div>
```

**new_string:**

```
          {/* ═══════ STEP 1: Your Choice (Dates) ═══════ */}
          {step === 1 && (
            <div className="booking-fade-in">
              <div className="booking-content-card">
                <div className="booking-content-card-title">{t.enterStayData}</div>
```

### Edit 2 — Step 1: додати nav-bar у кінець кроку (зі sticky-mobile)

**old_string:**

```
                {promoMessage && (
                  <div className={`booking-alert ${promoMessage.type}`} style={{ marginTop: 12 }}>
                    <span className="booking-alert-icon">{promoMessage.type === 'success' ? '✓' : '✗'}</span>
                    {promoMessage.text}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════ STEP 2: House Selection ═══════ */}
```

**new_string:**

```
                {promoMessage && (
                  <div className={`booking-alert ${promoMessage.type}`} style={{ marginTop: 12 }}>
                    <span className="booking-alert-icon">{promoMessage.type === 'success' ? '✓' : '✗'}</span>
                    {promoMessage.text}
                  </div>
                )}
              </div>

              {/* Nav Bar (sticky on mobile) */}
              <div className="booking-nav-bar sticky-mobile">
                <button className="booking-btn-back" disabled type="button">
                  ‹ {t.back}
                </button>
                <button
                  className="booking-btn-next"
                  onClick={goToStep2}
                  disabled={!checkIn || !checkOut || nights < 1}
                  type="button"
                >
                  {t.next} ›
                </button>
              </div>
            </div>
          )}

          {/* ═══════ STEP 2: House Selection ═══════ */}
```

### Edit 3 — Step 2: видалити nav-bar з початку кроку

**old_string:**

```
          {/* ═══════ STEP 2: House Selection ═══════ */}
          {step === 2 && (
            <div className="booking-fade-in">
              <div className="booking-nav-bar">
                <button className="booking-btn-back" onClick={() => goToStep(1)} type="button">
                  ‹ {t.back}
                </button>
                <button
                  className="booking-btn-next"
                  onClick={goToStep3}
                  disabled={!selectedUnit}
                  type="button"
                >
                  {t.next} ›
                </button>
              </div>

              {/* Multi-house info tooltip */}
```

**new_string:**

```
          {/* ═══════ STEP 2: House Selection ═══════ */}
          {step === 2 && (
            <div className="booking-fade-in">
              {/* Multi-house info tooltip */}
```

### Edit 4 — Step 2: додати nav-bar у кінець кроку

**old_string:**

```
              {error && (
                <div className="booking-alert error" style={{ marginTop: 16 }}>
                  <span className="booking-alert-icon">✗</span>
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ═══════ STEP 3: Personal Info ═══════ */}
```

**new_string:**

```
              {error && (
                <div className="booking-alert error" style={{ marginTop: 16 }}>
                  <span className="booking-alert-icon">✗</span>
                  {error}
                </div>
              )}

              {/* Nav Bar (sticky on mobile) */}
              <div className="booking-nav-bar sticky-mobile">
                <button className="booking-btn-back" onClick={() => goToStep(1)} type="button">
                  ‹ {t.back}
                </button>
                <button
                  className="booking-btn-next"
                  onClick={goToStep3}
                  disabled={!selectedUnit}
                  type="button"
                >
                  {t.next} ›
                </button>
              </div>
            </div>
          )}

          {/* ═══════ STEP 3: Personal Info ═══════ */}
```

### Edit 5 — Step 3: видалити nav-bar з початку кроку

**old_string:**

```
          {/* ═══════ STEP 3: Personal Info ═══════ */}
          {step === 3 && (
            <div className="booking-fade-in">
              <div className="booking-nav-bar">
                <button className="booking-btn-back" onClick={() => goToStep(2)} type="button">
                  ‹ {t.back}
                </button>
                <button
                  className="booking-btn-next"
                  onClick={goToStep4}
                  disabled={!firstName.trim() || !lastName.trim() || !phone.trim()}
                  type="button"
                >
                  {`${t.next} ›`}
                </button>
              </div>

              <div className="booking-content-card">
                <div className="booking-content-card-title">{t.enterPersonalInfo}</div>
```

**new_string:**

```
          {/* ═══════ STEP 3: Personal Info ═══════ */}
          {step === 3 && (
            <div className="booking-fade-in">
              <div className="booking-content-card">
                <div className="booking-content-card-title">{t.enterPersonalInfo}</div>
```

### Edit 6 — Step 3: додати nav-bar у кінець кроку

**old_string:**

```
                <p className="booking-terms">{t.agreeTerms}</p>
              </div>

              {error && (
                <div className="booking-alert error" style={{ marginTop: 16 }}>
                  <span className="booking-alert-icon">✗</span>
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ═══════ STEP 4: Services (ULIS-Style) ═══════ */}
```

**new_string:**

```
                <p className="booking-terms">{t.agreeTerms}</p>
              </div>

              {error && (
                <div className="booking-alert error" style={{ marginTop: 16 }}>
                  <span className="booking-alert-icon">✗</span>
                  {error}
                </div>
              )}

              {/* Nav Bar (sticky on mobile) */}
              <div className="booking-nav-bar sticky-mobile">
                <button className="booking-btn-back" onClick={() => goToStep(2)} type="button">
                  ‹ {t.back}
                </button>
                <button
                  className="booking-btn-next"
                  onClick={goToStep4}
                  disabled={!firstName.trim() || !lastName.trim() || !phone.trim()}
                  type="button"
                >
                  {`${t.next} ›`}
                </button>
              </div>
            </div>
          )}

          {/* ═══════ STEP 4: Services (ULIS-Style) ═══════ */}
```

### Edit 7 — Step 4: видалити nav-bar з початку (разом зі Skip-кнопкою)

**old_string:**

```
          {/* ═══════ STEP 4: Services (ULIS-Style) ═══════ */}
          {step === 4 && (
            <div className="booking-fade-in">
              <div className="booking-nav-bar">
                <button className="booking-btn-back" onClick={() => goToStep(3)} type="button">
                  ‹ {t.back}
                </button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="booking-btn-back"
                    onClick={() => {
                      setSaunaAdded(false);
                      setBreakfastAdded(false);
                      submitBooking();
                    }}
                    type="button"
                  >
                    {t.servicesSkip} ›
                  </button>
                  <button
                    className="booking-btn-next"
                    onClick={submitBooking}
                    disabled={submitting || (!saunaAdded && !breakfastAdded)}
                    type="button"
                  >
                    {submitting ? t.processing : `${t.confirmBooking} ›`}
                  </button>
                </div>
              </div>

              {servicesLoading ? (
```

**new_string:**

```
          {/* ═══════ STEP 4: Services (ULIS-Style) ═══════ */}
          {step === 4 && (
            <div className="booking-fade-in">
              {servicesLoading ? (
```

### Edit 8 — Step 4: додати Skip інлайн + sticky nav-bar у кінець

**old_string:**

```
                  {/* Services Total */}
                  {servicesTotal > 0 && (
                    <div className="booking-alert info" style={{ marginTop: 8 }}>
                      <span className="booking-alert-icon">💰</span>
                      {t.serviceTotal}: <strong>{formatPrice(servicesTotal)} Kč</strong>
                    </div>
                  )}
                </>
              )}

              {error && (
                <div className="booking-alert error" style={{ marginTop: 16 }}>
                  <span className="booking-alert-icon">✗</span>
                  {error}
                </div>
              )}
            </div>
          )}


          {/* ═══════ STEP 5: Success ═══════ */}
```

**new_string:**

```
                  {/* Services Total */}
                  {servicesTotal > 0 && (
                    <div className="booking-alert info" style={{ marginTop: 8 }}>
                      <span className="booking-alert-icon">💰</span>
                      {t.serviceTotal}: <strong>{formatPrice(servicesTotal)} Kč</strong>
                    </div>
                  )}

                  {/* Inline skip link (moved out of the top nav-bar) */}
                  <div className="booking-services-skip">
                    <button
                      className="booking-btn-skip-link"
                      onClick={() => {
                        setSaunaAdded(false);
                        setBreakfastAdded(false);
                        submitBooking();
                      }}
                      type="button"
                    >
                      {t.servicesSkip} ›
                    </button>
                  </div>
                </>
              )}

              {error && (
                <div className="booking-alert error" style={{ marginTop: 16 }}>
                  <span className="booking-alert-icon">✗</span>
                  {error}
                </div>
              )}

              {/* Nav Bar (sticky on mobile) */}
              <div className="booking-nav-bar sticky-mobile">
                <button className="booking-btn-back" onClick={() => goToStep(3)} type="button">
                  ‹ {t.back}
                </button>
                <button
                  className="booking-btn-next"
                  onClick={submitBooking}
                  disabled={submitting || (!saunaAdded && !breakfastAdded)}
                  type="button"
                >
                  {submitting ? t.processing : `${t.confirmBooking} ›`}
                </button>
              </div>
            </div>
          )}


          {/* ═══════ STEP 5: Success ═══════ */}
```

---

## Файл 2 — `src/app/booking/booking.css`

### Edit 9 — базові стилі для Skip-лінка (після `.booking-btn-next:disabled`)

**old_string:**

```
.booking-btn-next:disabled {
  background: var(--bk-border);
  color: var(--bk-text-muted);
  cursor: default;
}

/* ─── Content Cards ────────────────────────────────── */
```

**new_string:**

```
.booking-btn-next:disabled {
  background: var(--bk-border);
  color: var(--bk-text-muted);
  cursor: default;
}

/* ─── Inline "skip services" link on Step 4 ────────── */
.booking-services-skip {
  display: flex;
  justify-content: flex-end;
  margin: 12px 0 4px;
}

.booking-btn-skip-link {
  background: transparent;
  border: none;
  padding: 6px 8px;
  font-family: var(--bk-font);
  font-size: 14px;
  font-weight: 500;
  color: var(--bk-text-muted);
  cursor: pointer;
  text-decoration: underline;
}

.booking-btn-skip-link:hover {
  color: var(--bk-text);
}

/* ─── Content Cards ────────────────────────────────── */
```

### Edit 10 — sticky-mobile всередині `@media (max-width: 768px)`

**old_string:**

```
  .booking-nav-bar {
    flex-direction: column-reverse;
    gap: 8px;
  }

  .booking-btn-back,
  .booking-btn-next {
    width: 100%;
    justify-content: center;
  }
}
```

**new_string:**

```
  .booking-nav-bar {
    flex-direction: column-reverse;
    gap: 8px;
  }

  .booking-btn-back,
  .booking-btn-next {
    width: 100%;
    justify-content: center;
  }

  /* Sticky-to-bottom variant: nav-bar with this class becomes a fixed
     footer on mobile so Back/Next are always under the thumb. */
  .booking-nav-bar.sticky-mobile {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 200;
    flex-direction: row;
    gap: 8px;
    margin: 0;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    background: var(--bk-card);
    border-top: 1px solid var(--bk-border);
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.06);
  }

  .booking-nav-bar.sticky-mobile .booking-btn-back,
  .booking-nav-bar.sticky-mobile .booking-btn-next {
    flex: 1 1 0;
    width: auto;
    padding: 14px 16px;
    justify-content: center;
  }

  /* On Step 1 the Back button is disabled — hide it so Next takes
     the full footer width. */
  .booking-nav-bar.sticky-mobile .booking-btn-back:disabled {
    display: none;
  }

  /* Reserve space at the bottom so sticky nav-bar doesn't cover content. */
  .booking-layout {
    padding-bottom: calc(88px + env(safe-area-inset-bottom));
  }
}
```

---

## Як застосувати в Antigravity

1. Відкрити `src/app/booking/page.tsx`. Для кожного Edit — скопіювати **old_string** у пошук (Ctrl/Cmd+F), Antigravity підсвітить ділянку, замінити на **new_string** (Replace). Рухатись послідовно Edit 1 → Edit 8.
2. Аналогічно для `src/app/booking/booking.css` — Edit 9 та Edit 10.
3. Зберегти обидва файли, запустити `npm run dev`, відкрити `/booking`.
4. Якщо якийсь `old_string` не знайдено — означає локальна версія файлу вже відрізняється від `main`. Надішли мені відповідний шматок — переформулюю.

---

## Як протестувати

- **Мобілка (DevTools → iPhone 14 Pro, або реальний iOS):** на кожному з Step 1–4 дві кнопки мають бути прибиті до низу екрана, видимі при скролі, займати 50/50. На Step 1 видно лише "Далі" на всю ширину. iOS: перевірити, що кнопки не налазять на home-indicator (safe-area).
- **Повний флоу на мобільному:** дати → вибір будиночка → особисті дані → сервіси → підтвердити. "Пропустити" тепер інлайн після списку сервісів, а не у футері.
- **Десктоп (≥ 769px):** кнопки внизу кроку, звичайний ряд space-between, як раніше — без sticky.
- **Overlap-check:** на мобайлі проскролити до самого низу Step 2, переконатись що остання картка не ховається за футер-баром (має бути запас ~88–96px).
- **Клавіатура (iOS):** Step 3, тап у поле "Телефон"; sticky-футер на iOS Safari може підніматись разом з клавіатурою — це норм, але переконатись, що не перекриває інпут.
