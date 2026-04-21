# ALiSiO booking — Batch 3: послуги ПІСЛЯ оплати номера

Архітектурна зміна. Застосовувати ПІСЛЯ Batch 1 (sticky nav) і Batch 2 (overflow + gender).

## Що робить патч

- Step 3 стає фінальним кроком з формою + оплатою. Кнопка "Оплатити бронь" викликає `submitBooking` → `/api/booking/reserve` + Teya checkout (тільки номер).
- Перед редіректом зберігаємо `booking-return-ctx` у sessionStorage як резервний кеш.
- Всі Teya `return_path` тепер несуть `payment_kind=room|services`.
- `useEffect` на повернення розрізняє `room` → Step 4, `services` → Step 5. Відновлює стейт через новий `GET /api/booking/reservation?id=...`, fallback — sessionStorage.
- Step 4 — upsell: зелений банер "Бронь підтверджена", ті самі svc-cards. Старий інлайн skip прибирається. Футер: "Пропустити" (→ Step 5 без записів) + "Підтвердити послуги" (→ `submitServices`).
- `submitServices` пише всі обрані послуги до існуючої брони (`/api/booking/services` з `reservationId`) + другий Teya checkout за `servicesTotal`.
- Step 5 — Дякую, показує деталі брони + (якщо є) перелік куплених послуг.
- Email-нотифікації — окремий патч (TODO внизу).

---

## Файл 1 (новий) — `src/app/api/booking/reservation/route.ts`

Створи новий файл, вміст:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// GET /api/booking/reservation?id=<reservationId>
// Returns the booking context used by Steps 4/5 after Teya redirect.
// Public read by id — no auth. Returns only minimal fields needed on the widget.
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400, headers: CORS_HEADERS });
    }

    const db = getDb();
    const r = db.prepare(`
      SELECT r.id, r.unit_id, r.check_in, r.check_out, r.nights,
             r.adults, r.children, r.status, r.payment_status, r.total_price,
             u.name AS unit_name,
             g.first_name, g.last_name, g.email, g.phone
      FROM reservations r
      LEFT JOIN units u ON u.id = r.unit_id
      LEFT JOIN guests g ON g.id = r.guest_id
      WHERE r.id = ?
    `).get(id) as any;

    if (!r) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS_HEADERS });
    }

    let services: any[] = [];
    try {
      services = db.prepare(`
        SELECT bso.id, bso.service_id, bso.quantity, bso.service_date,
               bso.unit_price, bso.total_price, bso.status, bso.payment_status,
               bso.options_json, bso.menu_item_id,
               s.name AS service_name
        FROM booking_service_orders bso
        LEFT JOIN additional_services s ON s.id = bso.service_id
        WHERE bso.reservation_id = ?
        ORDER BY bso.id
      `).all(id) as any[];
    } catch { /* optional table */ }

    return NextResponse.json({
      reservation: {
        id: r.id,
        unit_id: r.unit_id,
        unit_name: r.unit_name,
        check_in: r.check_in,
        check_out: r.check_out,
        nights: r.nights,
        adults: r.adults,
        children: r.children,
        status: r.status,
        payment_status: r.payment_status,
        total_price: r.total_price,
        guest: {
          first_name: r.first_name,
          last_name: r.last_name,
          email: r.email,
          phone: r.phone,
        },
      },
      services,
    }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('GET /api/booking/reservation error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to fetch reservation' }, { status: 500, headers: CORS_HEADERS });
  }
}
```

---

## Файл 2 — `src/app/booking/translations.ts`

### Edit 2.1 — додати нові типи у `BookingTranslations`

**old_string:**

```
  promoCode: string;
  certificateCode: string;
```

**new_string:**

```
  promoCode: string;
  certificateCode: string;
  // Step 3 → Pay action
  payAndConfirm: string;
  // Step 4 — upsell after room payment
  bookingConfirmedTitle: string;
  bookingConfirmedDesc: string;
  skipToThankYou: string;
  confirmServices: string;
  servicesOptional: string;
  // Step 5 — purchased services section
  purchasedServicesTitle: string;
```

### Edit 2.2 — український словник

**old_string:**

```
    promoCode: 'Промокод',
    certificateCode: 'Код сертифікату',
```

**new_string:**

```
    promoCode: 'Промокод',
    certificateCode: 'Код сертифікату',
    payAndConfirm: 'Оплатити бронь',
    bookingConfirmedTitle: 'Бронь підтверджена',
    bookingConfirmedDesc: 'Оплата за номер пройшла. За бажанням додайте послуги — оплата окремим платежем.',
    skipToThankYou: 'Пропустити',
    confirmServices: 'Підтвердити послуги',
    servicesOptional: 'Послуги опціональні — можна пропустити і замовити пізніше за посиланням з email.',
    purchasedServicesTitle: 'Замовлені послуги',
```

### Edit 2.3 — англійський словник

**old_string:**

```
    promoCode: 'Promo code',
    certificateCode: 'Certificate code',
```

**new_string:**

```
    promoCode: 'Promo code',
    certificateCode: 'Certificate code',
    payAndConfirm: 'Pay & book',
    bookingConfirmedTitle: 'Booking confirmed',
    bookingConfirmedDesc: 'Your room is paid. Add optional services — they are billed as a separate payment.',
    skipToThankYou: 'Skip',
    confirmServices: 'Confirm services',
    servicesOptional: 'Services are optional — you can skip and add them later via the link in your email.',
    purchasedServicesTitle: 'Purchased services',
```

### Edit 2.4 — чеський словник

**old_string:**

```
    promoCode: 'Slevový kód',
    certificateCode: 'Kód certifikátu',
```

**new_string:**

```
    promoCode: 'Slevový kód',
    certificateCode: 'Kód certifikátu',
    payAndConfirm: 'Zaplatit a rezervovat',
    bookingConfirmedTitle: 'Rezervace potvrzena',
    bookingConfirmedDesc: 'Pokoj je zaplacen. Volitelně přidejte služby — ty se platí zvlášť.',
    skipToThankYou: 'Přeskočit',
    confirmServices: 'Potvrdit služby',
    servicesOptional: 'Služby jsou volitelné — lze přeskočit a přidat později přes odkaz z e-mailu.',
    purchasedServicesTitle: 'Objednané služby',
```

### Edit 2.5 — німецький словник

**old_string:**

```
    promoCode: 'Aktionscode',
    certificateCode: 'Zertifikatscode',
```

**new_string:**

```
    promoCode: 'Aktionscode',
    certificateCode: 'Zertifikatscode',
    payAndConfirm: 'Bezahlen & buchen',
    bookingConfirmedTitle: 'Buchung bestätigt',
    bookingConfirmedDesc: 'Ihr Zimmer ist bezahlt. Optional können Sie Zusatzleistungen hinzufügen — separate Zahlung.',
    skipToThankYou: 'Überspringen',
    confirmServices: 'Leistungen bestätigen',
    servicesOptional: 'Leistungen sind optional — Sie können später über den Link in der E-Mail hinzufügen.',
    purchasedServicesTitle: 'Bestellte Leistungen',
```

---

## Файл 3 — `src/app/booking/page.tsx`

### Edit 3.1 — додати стейт `purchasedServices`

**old_string:**

```
  // Step 5 — Success
  const [reservation, setReservation] = useState<ReserveResponse | null>(null);
  const [redirectingToPayment, setRedirectingToPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'failed' | null>(null);
```

**new_string:**

```
  // Step 5 — Success
  const [reservation, setReservation] = useState<ReserveResponse | null>(null);
  const [redirectingToPayment, setRedirectingToPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'failed' | null>(null);
  const [purchasedServices, setPurchasedServices] = useState<any[]>([]);
```

### Edit 3.2 — замінити `useEffect` на payment-return

**old_string:**

```
  // Handle return from Teya payment
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const successId = params.get('success');
    const pStatus = params.get('payment_status');

    if (successId && pStatus === 'success') {
      // Returned from successful payment
      setReservation({
        success: true,
        reservationId: successId,
        unitName: '',
        checkIn: '',
        checkOut: '',
        nights: 0,
        totalPrice: 0,
        originalPrice: 0,
        promoDiscount: 0,
        certificateDiscount: 0,
        currency: 'CZK',
      });
      setPaymentStatus('success');
      setStep(5);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (pStatus === 'cancel') {
      setPaymentStatus('failed');
      setStep(5);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
```

**new_string:**

```
  // Handle return from Teya payment (room or services checkout)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const successId = params.get('success');
    const pStatus = params.get('payment_status');
    const kind = (params.get('payment_kind') || 'room') as 'room' | 'services';

    const cleanUrl = () => window.history.replaceState({}, '', window.location.pathname);

    if (!successId || (pStatus !== 'success' && pStatus !== 'cancel')) return;

    (async () => {
      let ctxSrv: any = null;
      try {
        const r = await fetch(`${API_BASE}/api/booking/reservation?id=${encodeURIComponent(successId)}`);
        if (r.ok) ctxSrv = await r.json();
      } catch { /* ignore */ }

      let ctxCache: any = null;
      try {
        const saved = sessionStorage.getItem('booking-return-ctx');
        if (saved) ctxCache = JSON.parse(saved);
      } catch { /* ignore */ }

      const resSrv = ctxSrv?.reservation;
      setReservation({
        success: true,
        reservationId: successId,
        unitName: resSrv?.unit_name || ctxCache?.unitName || '',
        checkIn: resSrv?.check_in || ctxCache?.checkIn || '',
        checkOut: resSrv?.check_out || ctxCache?.checkOut || '',
        nights: resSrv?.nights || ctxCache?.nights || 0,
        totalPrice: resSrv?.total_price || ctxCache?.totalPrice || 0,
        originalPrice: resSrv?.total_price || ctxCache?.totalPrice || 0,
        promoDiscount: 0,
        certificateDiscount: 0,
        currency: 'CZK',
      });

      const ci = resSrv?.check_in || ctxCache?.checkIn;
      const co = resSrv?.check_out || ctxCache?.checkOut;
      if (ci) setCheckIn(ci);
      if (co) setCheckOut(co);

      if (Array.isArray(ctxSrv?.services)) setPurchasedServices(ctxSrv.services);

      if (pStatus === 'success') {
        setPaymentStatus('success');
        if (kind === 'services') {
          setStep(5);
        } else {
          setStep(4);
          if (ci && co) fetchServices(ci, co);
        }
      } else {
        if (kind === 'services') {
          setPaymentStatus('failed');
          setStep(4);
          if (ci && co) fetchServices(ci, co);
        } else {
          setPaymentStatus('failed');
          setStep(5);
        }
      }
      cleanUrl();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

### Edit 3.3 — `fetchServices` приймає `ci/co` параметрами

**old_string:**

```
  const fetchServices = useCallback(async () => {
    if (!checkIn || !checkOut) return;
    setServicesLoading(true);
```

**new_string:**

```
  const fetchServices = useCallback(async (ciParam?: string, coParam?: string) => {
    const ci = ciParam || checkIn;
    const co = coParam || checkOut;
    if (!ci || !co) return;
    setServicesLoading(true);
```

### Edit 3.4 — підміна URL-параметрів у `fetchServices` (5 місць)

**old_string:**

```
      const bRes = await fetch(`${API_BASE}/api/booking/services?serviceId=svc_breakfast&checkIn=${checkIn}&checkOut=${checkOut}`);
```

**new_string:**

```
      const bRes = await fetch(`${API_BASE}/api/booking/services?serviceId=svc_breakfast&checkIn=${ci}&checkOut=${co}`);
```

**old_string:**

```
      const sRes = await fetch(`${API_BASE}/api/booking/services?serviceId=svc_sauna&checkIn=${checkIn}&checkOut=${checkOut}`);
```

**new_string:**

```
      const sRes = await fetch(`${API_BASE}/api/booking/services?serviceId=svc_sauna&checkIn=${ci}&checkOut=${co}`);
```

**old_string:**

```
      const tRes = await fetch(`${API_BASE}/api/booking/services?serviceId=svc_tub&checkIn=${checkIn}&checkOut=${checkOut}`);
```

**new_string:**

```
      const tRes = await fetch(`${API_BASE}/api/booking/services?serviceId=svc_tub&checkIn=${ci}&checkOut=${co}`);
```

**old_string:**

```
      const lcRes = await fetch(`${API_BASE}/api/booking/services?serviceId=svc_late_checkout&checkIn=${checkIn}&checkOut=${checkOut}`);
```

**new_string:**

```
      const lcRes = await fetch(`${API_BASE}/api/booking/services?serviceId=svc_late_checkout&checkIn=${ci}&checkOut=${co}`);
```

**old_string:**

```
      const ecRes = await fetch(`${API_BASE}/api/booking/services?serviceId=svc_early_checkin&checkIn=${checkIn}&checkOut=${checkOut}`);
```

**new_string:**

```
      const ecRes = await fetch(`${API_BASE}/api/booking/services?serviceId=svc_early_checkin&checkIn=${ci}&checkOut=${co}`);
```

**old_string:**

```
    setServicesLoading(false);
    // Default dates to check-in
    if (checkIn && !saunaDate) setSaunaDate(checkIn);
    if (checkIn && !tubDate) setTubDate(checkIn);
  }, [checkIn, checkOut, saunaDate, tubDate]);
```

**new_string:**

```
    setServicesLoading(false);
    if (ci && !saunaDate) setSaunaDate(ci);
    if (ci && !tubDate) setTubDate(ci);
  }, [checkIn, checkOut, saunaDate, tubDate]);
```

### Edit 3.5 — видалити `goToStep4`

**old_string:**

```
  const goToStep4 = useCallback(async () => {
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) return;
    await fetchServices();
    goToStep(4);
  }, [firstName, lastName, phone, fetchServices, goToStep]);

  // ─── Submit Booking (Step 4 → Step 5) ──────
```

**new_string:**

```
  // ─── Submit Booking (Step 3: create reservation + first Teya checkout for the room) ──────
```

### Edit 3.6 — початок `submitBooking` (додати typing на data)

**old_string:**

```
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      const data = await res.json();
```

**new_string:**

```
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      const data = await res.json() as ReserveResponse;
```

### Edit 3.7 — замінити хвіст `submitBooking` (видалити всі services-виклики + оновити Teya checkout + додати `submitServices`)

**old_string:**

```
      // Persist sauna booking if added
      if (saunaAdded && saunaDate) {
        try {
          await fetch(`${API_BASE}/api/booking/services`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'book-slots',
              serviceId: 'svc_sauna',
              date: saunaDate,
              startHour: saunaStartHour,
              hours: saunaHours,
              persons: cardAdults,
              reservationId: data.reservationId,
              addons: saunaBroom > 0 ? [{ id: 'addon_broom', quantity: saunaBroom }] : [],
            }),
          });
        } catch { /* sauna booking error — non-fatal */ }
      }

      // Persist tub booking if added
      if (tubAdded && tubDate) {
        try {
          await fetch(`${API_BASE}/api/booking/services`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'book-slots',
              serviceId: 'svc_tub',
              date: tubDate,
              startHour: tubStartHour,
              hours: tubHours,
              persons: cardAdults,
              reservationId: data.reservationId,
            }),
          });
        } catch { /* tub booking error — non-fatal */ }
      }

      // Persist breakfast booking if added
      if (breakfastAdded) {
        const breakfastOrder = Object.entries(breakfastItems)
          .filter(([, qty]) => qty > 0)
          .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
        if (breakfastOrder.length > 0) {
          try {
            await fetch(`${API_BASE}/api/booking/services`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'book-breakfast',
                reservationId: data.reservationId,
                items: breakfastOrder,
                serviceDate: checkIn,
              }),
            });
          } catch { /* breakfast booking error — non-fatal */ }
        }
      }

      // Persist late checkout if selected
      if (lateCheckout) {
        try {
          await fetch(`${API_BASE}/api/booking/services`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'book-toggle',
              serviceId: 'svc_late_checkout',
              reservationId: data.reservationId,
            }),
          });
        } catch { /* non-fatal */ }
      }

      // Persist early checkin if selected
      if (earlyCheckin) {
        try {
          await fetch(`${API_BASE}/api/booking/services`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'book-toggle',
              serviceId: 'svc_early_checkin',
              reservationId: data.reservationId,
            }),
          });
        } catch { /* non-fatal */ }
      }

      setReservation(data);

      // Create Teya checkout session for payment
      setRedirectingToPayment(true);
      try {
        const payRes = await fetch(`${API_BASE}/api/booking/checkout-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: totalWithDiscount,
            currency: 'CZK',
            description: `Booking ${data.reservationId} — ${data.unitName}`,
            reservation_id: data.reservationId,
            return_path: `/booking?success=${data.reservationId}`,
          }),
        });
        if (payRes.ok) {
          const payData = await payRes.json();
          if (payData.session_url) {
            window.location.href = payData.session_url;
            return; // Don't proceed, page will redirect
          }
        }
        // If checkout session fails, still show success (tentative booking)
        console.error('Checkout session creation failed, showing tentative booking');
        setRedirectingToPayment(false);
        goToStep(5);
      } catch (payErr) {
        console.error('Payment redirect error:', payErr);
        setRedirectingToPayment(false);
        goToStep(5);
      }
    } catch (e: any) {
      setError(e?.message || t.errorOccurred);
    }
    setSubmitting(false);
  }, [checkIn, checkOut, selectedUnit, cardAdults, cardChildren, cardHasPet, firstName, lastName, email, phone, promoApplied, certInput, t, goToStep, saunaAdded, saunaDate, saunaStartHour, saunaHours, saunaBroom, tubAdded, tubDate, tubStartHour, tubHours, breakfastAdded, breakfastItems, lateCheckout, earlyCheckin, totalWithDiscount]);
```

**new_string:**

```
      setReservation(data);

      // Persist return context (sessionStorage) so Step 4 hydrates after Teya
      try {
        sessionStorage.setItem('booking-return-ctx', JSON.stringify({
          reservationId: data.reservationId,
          unitName: data.unitName,
          checkIn: data.checkIn,
          checkOut: data.checkOut,
          nights: data.nights,
          totalPrice: data.totalPrice,
        }));
      } catch { /* private mode — ok */ }

      // Create Teya checkout for the ROOM only (no services yet)
      setRedirectingToPayment(true);
      try {
        const payRes = await fetch(`${API_BASE}/api/booking/checkout-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: data.totalPrice,
            currency: 'CZK',
            description: `Booking ${data.reservationId} — ${data.unitName}`,
            reservation_id: data.reservationId,
            return_path: `/booking?success=${data.reservationId}&payment_kind=room`,
          }),
        });
        if (payRes.ok) {
          const payData = await payRes.json();
          if (payData.session_url) {
            window.location.href = payData.session_url;
            return;
          }
        }
        console.error('Checkout session creation failed — tentative booking');
        setRedirectingToPayment(false);
        setPaymentStatus('failed');
        setStep(4);
        fetchServices(data.checkIn, data.checkOut);
      } catch (payErr) {
        console.error('Payment redirect error:', payErr);
        setRedirectingToPayment(false);
        setPaymentStatus('failed');
        setStep(4);
        fetchServices(data.checkIn, data.checkOut);
      }
    } catch (e: any) {
      setError(e?.message || t.errorOccurred);
    }
    setSubmitting(false);
  }, [checkIn, checkOut, selectedUnit, cardAdults, cardChildren, cardHasPet, firstName, lastName, email, phone, promoApplied, certInput, t, fetchServices]);

  // ─── Submit Services (Step 4: write services + second Teya checkout) ──────
  const submitServices = useCallback(async () => {
    const resId = reservation?.reservationId;
    if (!resId) return;
    const nothingPicked = !saunaAdded && !tubAdded && !breakfastAdded && !lateCheckout && !earlyCheckin;
    if (nothingPicked) { setStep(5); return; }

    setSubmitting(true);
    setError(null);
    try {
      const post = (body: any) => fetch(`${API_BASE}/api/booking/services`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (saunaAdded && saunaDate) {
        try { await post({
          action: 'book-slots', serviceId: 'svc_sauna',
          date: saunaDate, startHour: saunaStartHour, hours: saunaHours,
          persons: cardAdults, reservationId: resId,
          addons: saunaBroom > 0 ? [{ id: 'addon_broom', quantity: saunaBroom }] : [],
        }); } catch { /* non-fatal */ }
      }
      if (tubAdded && tubDate) {
        try { await post({
          action: 'book-slots', serviceId: 'svc_tub',
          date: tubDate, startHour: tubStartHour, hours: tubHours,
          persons: cardAdults, reservationId: resId,
        }); } catch { /* non-fatal */ }
      }
      if (breakfastAdded) {
        const items = Object.entries(breakfastItems)
          .filter(([, qty]) => qty > 0)
          .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
        if (items.length > 0) {
          try { await post({
            action: 'book-breakfast', reservationId: resId,
            items, serviceDate: checkIn,
          }); } catch { /* non-fatal */ }
        }
      }
      if (lateCheckout) {
        try { await post({ action: 'book-toggle', serviceId: 'svc_late_checkout', reservationId: resId }); } catch { /* */ }
      }
      if (earlyCheckin) {
        try { await post({ action: 'book-toggle', serviceId: 'svc_early_checkin', reservationId: resId }); } catch { /* */ }
      }

      if (servicesTotal > 0) {
        setRedirectingToPayment(true);
        const payRes = await fetch(`${API_BASE}/api/booking/checkout-session`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: servicesTotal,
            currency: 'CZK',
            description: `Services for reservation ${resId}`,
            reservation_id: resId,
            return_path: `/booking?success=${resId}&payment_kind=services`,
          }),
        });
        if (payRes.ok) {
          const payData = await payRes.json();
          if (payData.session_url) {
            window.location.href = payData.session_url;
            return;
          }
        }
        setRedirectingToPayment(false);
      }
      setStep(5);
    } catch (e: any) {
      setError(e?.message || t.errorOccurred);
      setRedirectingToPayment(false);
    }
    setSubmitting(false);
  }, [reservation, saunaAdded, saunaDate, saunaStartHour, saunaHours, saunaBroom, tubAdded, tubDate, tubStartHour, tubHours, breakfastAdded, breakfastItems, lateCheckout, earlyCheckin, cardAdults, checkIn, servicesTotal, t]);
```

### Edit 3.8 — у `resetForm` додати clear `purchasedServices` і sessionStorage

**old_string:**

```
    setReservation(null);
    setError(null);
    setCalMonthOffset(0);
```

**new_string:**

```
    setReservation(null);
    setError(null);
    setCalMonthOffset(0);
    setPurchasedServices([]);
    try { sessionStorage.removeItem('booking-return-ctx'); } catch { /* */ }
```

### Edit 3.9 — Step 3 nav-bar: "Далі" → "Оплатити бронь"

**old_string:**

```
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

**new_string:**

```
              {/* Nav Bar (sticky on mobile) — final Pay action on Step 3 */}
              <div className="booking-nav-bar sticky-mobile">
                <button className="booking-btn-back" onClick={() => goToStep(2)} type="button">
                  ‹ {t.back}
                </button>
                <button
                  className="booking-btn-next"
                  onClick={submitBooking}
                  disabled={submitting || !firstName.trim() || !lastName.trim() || !phone.trim()}
                  type="button"
                >
                  {submitting ? t.processing : `${t.payAndConfirm} ›`}
                </button>
              </div>
            </div>
          )}

          {/* ═══════ STEP 4: Upsell services (after room payment) ═══════ */}
```

### Edit 3.10 — Step 4: банер "Бронь підтверджена"

**old_string:**

```
          {/* ═══════ STEP 4: Upsell services (after room payment) ═══════ */}
          {step === 4 && (
            <div className="booking-fade-in">
              {servicesLoading ? (
```

**new_string:**

```
          {/* ═══════ STEP 4: Upsell services (after room payment) ═══════ */}
          {step === 4 && (
            <div className="booking-fade-in">
              <div className="booking-alert success booking-confirmed-banner">
                <span className="booking-alert-icon">✓</span>
                <div>
                  <strong>{t.bookingConfirmedTitle}</strong>
                  <div style={{ fontSize: 13, marginTop: 2, color: 'var(--bk-text-muted)' }}>
                    {t.bookingConfirmedDesc}
                  </div>
                </div>
              </div>

              {servicesLoading ? (
```

### Edit 3.11 — видалити старий інлайн skip-link (тепер у footer)

**old_string:**

```
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
```

**new_string:**

```
                </>
              )}
```

### Edit 3.12 — Step 4 footer: Skip + Confirm services

**old_string:**

```
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

**new_string:**

```
              {/* Nav Bar (sticky on mobile) — Skip vs Confirm services */}
              <div className="booking-nav-bar sticky-mobile">
                <button
                  className="booking-btn-back"
                  onClick={() => setStep(5)}
                  type="button"
                >
                  {t.skipToThankYou}
                </button>
                <button
                  className="booking-btn-next"
                  onClick={submitServices}
                  disabled={submitting || (!saunaAdded && !tubAdded && !breakfastAdded && !lateCheckout && !earlyCheckin)}
                  type="button"
                >
                  {submitting ? t.processing : `${t.confirmServices} ›`}
                </button>
              </div>
            </div>
          )}


          {/* ═══════ STEP 5: Success ═══════ */}
```

### Edit 3.13 — Step 5: перелік куплених послуг

Знайди блок перед кнопкою "Нова броня" у Step 5 success-гілці й додай `purchasedServices`-секцію.

**old_string:**

```
                  <button className="booking-btn-next" onClick={resetForm} type="button" style={{ marginTop: 16 }}>
                    {t.newBooking}
                  </button>
                </>
              )}
```

**new_string:**

```
                  {purchasedServices.length > 0 && (
                    <div className="booking-purchased-services">
                      <div className="booking-purchased-services-title">{t.purchasedServicesTitle}</div>
                      <ul>
                        {purchasedServices.map((s) => (
                          <li key={s.id}>
                            <span>{s.service_name || s.service_id}</span>
                            <strong>{formatPrice(s.total_price || 0)} Kč</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button className="booking-btn-next" onClick={resetForm} type="button" style={{ marginTop: 16 }}>
                    {t.newBooking}
                  </button>
                </>
              )}
```

Якщо `old_string` не унікальний (є два success-блоки — success і fail) — уточни контекст, або додай Edit двічі з довшим сусіднім рядком зверху.

---

## Файл 4 — `src/app/booking/booking.css`

### Edit 4.1 — стилі для банера Step 4 і purchased-services Step 5

**old_string:**

```
/* ─── Step 5: Success ──────────────────────────────── */
```

**new_string:**

```
/* ─── Step 4 "Booking confirmed" banner ───────────── */
.booking-alert.success {
  background: #eafaf1;
  border-left: 4px solid #34a85a;
  color: #0f5132;
}

.booking-alert.success .booking-alert-icon {
  color: #34a85a;
}

.booking-confirmed-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 16px;
  border-radius: var(--bk-radius-sm);
}

/* ─── Step 5: Purchased services list ──────────────── */
.booking-purchased-services {
  margin-top: 20px;
  padding: 12px 14px;
  background: var(--bk-bg);
  border-radius: var(--bk-radius-sm);
  text-align: left;
}

.booking-purchased-services-title {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--bk-text-muted);
  margin-bottom: 8px;
}

.booking-purchased-services ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.booking-purchased-services li {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--bk-border-light);
  font-size: 14px;
}

.booking-purchased-services li:last-child {
  border-bottom: none;
}

/* ─── Step 5: Success ──────────────────────────────── */
```

Якщо `.booking-alert.success` вже існує у файлі — не дублюй його, лиши тільки `.booking-confirmed-banner` + `.booking-purchased-services*`.

---

## Email TODO (окремий патч)

Зараз `sendEmail` з `src/lib/channels/email.ts` ніде в booking flow не використовується. Наступний патч:

1. У `src/app/api/booking/payment-return/route.ts` на успішний room-return — після `UPDATE reservations SET status='confirmed'` викликати `sendEmail({ to: guest.email, ... })` з темою "Бронь підтверджена" + переліком доступних послуг + посиланням `https://<site>/booking/services?r=<reservationId>&token=<hmac>`.
2. Додати ендпоінт `/api/booking/services-token` (або прийом token-а в існуючому `/api/booking/services`), дозволити post-payment додавання послуг без активної сесії (HMAC по reservationId, TTL 30 днів).
3. Нова сторінка `src/app/booking/services/page.tsx` — спрощений Step 4 без header/stepper, читає `?r=&token=`, hydrate через `/api/booking/reservation?id=...`, Teya-флоу через `submitServices`.

Скажи коли робимо.

---

## Як протестувати

1. **Бронь**: Step 1 → Step 2 → Step 3 → "Оплатити бронь" → редірект Teya. Network: `POST /api/booking/reserve` + `POST /api/booking/checkout-session` з `return_path` `...&payment_kind=room`.
2. **Успіх номера**: `/booking?success=<id>&payment_status=success&payment_kind=room` → widget відновлює стейт через `GET /api/booking/reservation?id=...`, відкриває **Step 4** із зеленим банером, підтягує svc-cards. `reservations.status = confirmed`, `payment_status = paid`.
3. **Skip**: Step 4 → "Пропустити" → Step 5 без додаткових запитів.
4. **Services add**: Step 4, обрати сауну/сніданок → "Підтвердити послуги" → `POST /api/booking/services` x N + `POST /api/booking/checkout-session` з `payment_kind=services` → редірект Teya.
5. **Success services**: `?success=<id>&payment_status=success&payment_kind=services` → Step 5 із секцією "Замовлені послуги". `booking_service_orders.payment_status = paid`.
6. **Cancel services**: `payment_status=cancel&payment_kind=services` → Step 4 з `paymentStatus=failed`. Записи у `booking_service_orders` зі статусом `pending` (персонал на рецепції).
7. **Закриття вкладки після room-оплати**: бронь є, послуг нема — ок.
8. **Мобільні sticky-футери** працюють з Batch 1: Step 3 — "Назад / Оплатити бронь", Step 4 — "Пропустити / Підтвердити послуги".

Якщо `old_string` не збігається — надішли поточний блок, переформулюю.
