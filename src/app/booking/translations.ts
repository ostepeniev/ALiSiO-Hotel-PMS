/* eslint-disable @typescript-eslint/no-explicit-any */
// ─── Booking Form Translations (UK, EN, CS, DE) ─────────────

export type BookingLang = 'uk' | 'en' | 'cs' | 'de';

export const BOOKING_LANG_LABELS: Record<BookingLang, string> = {
  uk: 'Українська',
  en: 'English',
  cs: 'Čeština',
  de: 'Deutsch',
};

export const BOOKING_LANG_FLAGS: Record<BookingLang, string> = {
  uk: '🇺🇦',
  en: '🇬🇧',
  cs: '🇨🇿',
  de: '🇩🇪',
};

export interface BookingTranslations {
  // Header
  brandName: string;
  back: string;
  next: string;
  // Steps
  selectDates: string;
  checkInCheckOutDesc: string;
  notSelected: string;
  checkIn: string;
  checkOut: string;
  nightsShort: string;
  adults: string;
  children: string;
  // Step 2
  selectAccommodation: string;
  availableForDates: string;
  noUnitsFound: string;
  // Step 3
  guestInfoTitle: string;
  confirmationEmailNote: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  // Step 4
  addToStayTitle: string;
  everythingOptional: string;
  skipLink: string;
  // Step 5
  paymentTitle: string;
  securePaymentNote: string;
  additionalServices: string;
  total: string;
  payNow: string;
  processing: string;
  // Step 6
  bookedSuccess: string;
  bookingNumber: string;
  accommodation: string;
  supportContactNote: string;
  // CTA
  guestsShort: string;
  // Additional (for V3 and others)
  youSelected?: string;
  checkDetailsBelow?: string;
  from?: string;
  to?: string;
  duration?: string;
  nightsWord: (n: number) => string;
}

const translations: Record<BookingLang, any> = {
  uk: {
    brandName: 'QA Glamping',
    back: 'Назад',
    next: 'Далі',
    selectDates: 'Підтверди дати',
    checkInCheckOutDesc: 'Вибери період свого відпочинку.',
    notSelected: 'Не обрано',
    checkIn: 'Заїзд',
    checkOut: 'Виїзд',
    nightsShort: 'ночі',
    adults: 'Дорослі',
    children: 'Діти',
    selectAccommodation: 'Обери будинок',
    availableForDates: 'Доступні варіанти на твої дати.',
    noUnitsFound: 'На жаль, на ці дати немає вільних будинків.',
    guestInfoTitle: 'Твої контакти',
    confirmationEmailNote: 'Підтвердження прийде миттєво на email.',
    firstName: "Ім'я",
    lastName: 'Прізвище',
    email: 'Email',
    phone: 'Телефон',
    addToStayTitle: 'Додати до відпочинку?',
    everythingOptional: 'Все опційне. Можна пропустити і додати пізніше.',
    skipLink: 'Пропустити — не треба нічого',
    paymentTitle: 'Оплата',
    securePaymentNote: 'Захищена оплата Teya. Підтвердження миттєво.',
    additionalServices: 'Додаткові сервіси',
    total: 'Всього',
    payNow: 'Оплатити',
    processing: 'Обробка...',
    bookedSuccess: 'Заброньовано!',
    bookingNumber: 'Номер бронювання',
    accommodation: 'Будинок',
    supportContactNote: "Якщо щось — пиши на hello@qa-glamping.eu або +420 773 708 849",
    guestsShort: 'гостей',
    youSelected: 'Ти обрав',
    checkDetailsBelow: 'Перевір деталі нижче.',
    from: 'з',
    to: 'до',
    duration: 'Тривалість',
    nightsWord: (n: number) => n === 1 ? 'ніч' : n < 5 ? 'ночі' : 'ночей',
  },
  en: {
    brandName: 'QA Glamping',
    back: 'Back',
    next: 'Next',
    selectDates: 'Confirm dates',
    checkInCheckOutDesc: 'Choose your stay period.',
    notSelected: 'Not selected',
    checkIn: 'Check-in',
    checkOut: 'Check-out',
    nightsShort: 'nights',
    adults: 'Adults',
    children: 'Children',
    selectAccommodation: 'Choose house',
    availableForDates: 'Available options for your dates.',
    noUnitsFound: 'Sorry, no houses available for these dates.',
    guestInfoTitle: 'Your contacts',
    confirmationEmailNote: 'Confirmation will be sent instantly to your email.',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone',
    addToStayTitle: 'Add to your stay?',
    everythingOptional: 'Everything is optional. You can skip and add later.',
    skipLink: 'Skip — I don\'t need anything',
    paymentTitle: 'Payment',
    securePaymentNote: 'Secure Teya payment. Instant confirmation.',
    additionalServices: 'Additional services',
    total: 'Total',
    payNow: 'Pay Now',
    processing: 'Processing...',
    bookedSuccess: 'Booked!',
    bookingNumber: 'Booking Number',
    accommodation: 'House',
    supportContactNote: "If any questions — contact hello@qa-glamping.eu or +420 773 708 849",
    guestsShort: 'guests',
    youSelected: 'You selected',
    checkDetailsBelow: 'Check details below.',
    from: 'from',
    to: 'to',
    duration: 'Duration',
    nightsWord: (n: number) => n === 1 ? 'night' : 'nights',
  },
  cs: {
    brandName: 'QA Glamping',
    back: 'Zpět',
    next: 'Další',
    selectDates: 'Potvrdit termín',
    checkInCheckOutDesc: 'Vyberte si období svého pobytu.',
    notSelected: 'Nevybráno',
    checkIn: 'Příjezd',
    checkOut: 'Odjezd',
    nightsShort: 'noci',
    adults: 'Dospělí',
    children: 'Děti',
    selectAccommodation: 'Vyberte dům',
    availableForDates: 'Dostupné možnosti pro vaše termíny.',
    noUnitsFound: 'Bohužel na tyto termíny nejsou volné domy.',
    guestInfoTitle: 'Vaše kontakty',
    confirmationEmailNote: 'Potvrzení bude okamžitě zasláno na váš e-mail.',
    firstName: 'Jméno',
    lastName: 'Příjmení',
    email: 'Email',
    phone: 'Telefon',
    addToStayTitle: 'Přidat k pobytu?',
    everythingOptional: 'Vše je volitelné. Můžete přeskočit a přidat později.',
    skipLink: 'Přeskočit — nic nepotřebuji',
    paymentTitle: 'Platba',
    securePaymentNote: 'Zabezpečená platba Teya. Okamžité potvrzení.',
    additionalServices: 'Doplňkové služby',
    total: 'Celkem',
    payNow: 'Zaplatit',
    processing: 'Zpracování...',
    bookedSuccess: 'Rezervováno!',
    bookingNumber: 'Číslo rezervace',
    accommodation: 'Dům',
    supportContactNote: "V případě dotazů pište na hello@qa-glamping.eu nebo volejte +420 773 708 849",
    guestsShort: 'hostů',
    youSelected: 'Vybrali jste',
    checkDetailsBelow: 'Zkontrolujte podrobnosti níže.',
    from: 'od',
    to: 'do',
    duration: 'Délka',
    nightsWord: (n: number) => n === 1 ? 'noc' : n < 5 ? 'noci' : 'nocí',
  },
  de: {
    brandName: 'QA Glamping',
    back: 'Zurück',
    next: 'Weiter',
    selectDates: 'Termine bestätigen',
    checkInCheckOutDesc: 'Wählen Sie Ihren Aufenthaltszeitraum.',
    notSelected: 'Nicht ausgewählt',
    checkIn: 'Anreise',
    checkOut: 'Abreise',
    nightsShort: 'Nächte',
    adults: 'Erwachsene',
    children: 'Kinder',
    selectAccommodation: 'Haus wählen',
    availableForDates: 'Verfügbare Optionen für Ihre Termine.',
    noUnitsFound: 'Leider sind für diese Termine keine Häuser verfügbar.',
    guestInfoTitle: 'Ihre Kontakte',
    confirmationEmailNote: 'Die Bestätigung erfolgt sofort per E-Mail.',
    firstName: 'Vorname',
    lastName: 'Nachname',
    email: 'Email',
    phone: 'Telefon',
    addToStayTitle: 'Zu Ihrem Aufenthalt hinzufügen?',
    everythingOptional: 'Alles ist optional. Sie können überspringen und später hinzufügen.',
    skipLink: 'Überspringen — ich brauche nichts',
    paymentTitle: 'Zahlung',
    securePaymentNote: 'Sichere Teya-Zahlung. Sofortige Bestätigung.',
    additionalServices: 'Zusatzleistungen',
    total: 'Gesamt',
    payNow: 'Jetzt bezahlen',
    processing: 'Verarbeitung...',
    bookedSuccess: 'Gebucht!',
    bookingNumber: 'Buchungsnummer',
    accommodation: 'Haus',
    supportContactNote: "Bei Fragen — schreiben Sie an hello@qa-glamping.eu oder +420 773 708 849",
    guestsShort: 'Gäste',
    youSelected: 'Ausgewählt',
    checkDetailsBelow: 'Details unten prüfen.',
    from: 'ab',
    to: 'bis',
    duration: 'Dauer',
    nightsWord: (n: number) => n === 1 ? 'Nacht' : 'Nächte',
  },
};

export function getBookingTranslations(lang: BookingLang): BookingTranslations {
  return translations[lang] || translations.uk;
}
