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
  bookingTitle: string;
  // Steps
  step1Title: string;
  step1Desc: string;
  step2Title: string;
  step2Desc: string;
  step3Title: string;
  step3Desc: string;
  // Step 1 - Dates
  selectDates: string;
  checkIn: string;
  checkOut: string;
  nights: string;
  adults: string;
  children: string;
  selectCheckIn: string;
  selectCheckOut: string;
  minNights: string;
  // Promo & Certificate
  promoCode: string;
  certificateCode: string;
  apply: string;
  promoApplied: string;
  promoInvalid: string;
  // Step 2 - Houses
  availableHouses: string;
  noAvailability: string;
  noAvailabilityDesc: string;
  perNight: string;
  totalFor: string;
  nightsWord: (n: number) => string;
  maxGuests: string;
  beds: string;
  bedsDouble: string;
  bedsSingle: string;
  select: string;
  selected: string;
  stubPricing: string;
  available: string;
  // Step 3 - Guest info
  guestInfo: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  bookingSummary: string;
  house: string;
  dates: string;
  price: string;
  discount: string;
  total: string;
  confirmBooking: string;
  processing: string;
  agreeTerms: string;
  // Success
  bookingSuccess: string;
  bookingSuccessDesc: string;
  bookingId: string;
  backToStart: string;
  weWillContact: string;
  // Navigation
  next: string;
  back: string;
  // Calendar
  monthNames: string[];
  dayNamesShort: string[];
  today: string;
  // Errors
  errorOccurred: string;
  tryAgain: string;
  noUnitsLeft: string;
  // Footer
  poweredBy: string;
}

const translations: Record<BookingLang, BookingTranslations> = {
  uk: {
    brandName: 'ALiSiO Glamping',
    bookingTitle: 'Бронювання',
    step1Title: 'Дати та гості',
    step1Desc: 'Оберіть дати заїзду та виїзду',
    step2Title: 'Оберіть будиночок',
    step2Desc: 'Перегляньте доступні будиночки',
    step3Title: 'Ваші дані',
    step3Desc: 'Заповніть контактні дані',
    selectDates: 'Оберіть дати',
    checkIn: 'Заїзд',
    checkOut: 'Виїзд',
    nights: 'Ночей',
    adults: 'Дорослі',
    children: 'Діти',
    selectCheckIn: 'Оберіть дату заїзду',
    selectCheckOut: 'Оберіть дату виїзду',
    minNights: 'Мінімум 1 ніч',
    promoCode: 'Промокод',
    certificateCode: 'Код сертифікату',
    apply: 'Застосувати',
    promoApplied: 'Промокод застосовано!',
    promoInvalid: 'Промокод недійсний',
    availableHouses: 'Доступні будиночки',
    noAvailability: 'Немає доступних будиночків',
    noAvailabilityDesc: 'На обрані дати всі будиночки зайняті. Спробуйте інші дати.',
    perNight: '/ніч',
    totalFor: 'Усього за',
    nightsWord: (n) => n === 1 ? 'ніч' : n < 5 ? 'ночі' : 'ночей',
    maxGuests: 'Макс. гостей',
    beds: 'Ліжка',
    bedsDouble: 'двоспальних',
    bedsSingle: 'односпальних',
    select: 'Обрати',
    selected: '✓ Обрано',
    stubPricing: 'Орієнтовна ціна',
    available: 'вільних',
    guestInfo: 'Контактні дані',
    firstName: "Ім'я",
    lastName: 'Прізвище',
    email: 'Електронна пошта',
    phone: 'Телефон',
    bookingSummary: 'Ваше бронювання',
    house: 'Будиночок',
    dates: 'Дати',
    price: 'Вартість',
    discount: 'Знижка',
    total: 'До сплати',
    confirmBooking: 'Підтвердити бронювання',
    processing: 'Обробка...',
    agreeTerms: 'Натискаючи «Підтвердити», ви погоджуєтесь з умовами бронювання',
    bookingSuccess: 'Бронювання створено!',
    bookingSuccessDesc: 'Ваше бронювання очікує підтвердження. Ми зв\'яжемося з вами найближчим часом.',
    bookingId: 'Номер бронювання',
    backToStart: 'Нове бронювання',
    weWillContact: 'Ми зв\'яжемося з вами для підтвердження та оплати',
    next: 'Далі',
    back: 'Назад',
    monthNames: ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'],
    dayNamesShort: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    today: 'Сьогодні',
    errorOccurred: 'Виникла помилка',
    tryAgain: 'Спробувати ще раз',
    noUnitsLeft: 'На жаль, вільних будиночків цього типу не залишилось',
    poweredBy: 'ALiSiO PMS',
  },
  en: {
    brandName: 'ALiSiO Glamping',
    bookingTitle: 'Booking',
    step1Title: 'Dates & Guests',
    step1Desc: 'Select check-in and check-out dates',
    step2Title: 'Choose a House',
    step2Desc: 'Browse available glamping houses',
    step3Title: 'Your Details',
    step3Desc: 'Fill in your contact information',
    selectDates: 'Select dates',
    checkIn: 'Check-in',
    checkOut: 'Check-out',
    nights: 'Nights',
    adults: 'Adults',
    children: 'Children',
    selectCheckIn: 'Select check-in date',
    selectCheckOut: 'Select check-out date',
    minNights: 'Minimum 1 night',
    promoCode: 'Promo code',
    certificateCode: 'Certificate code',
    apply: 'Apply',
    promoApplied: 'Promo code applied!',
    promoInvalid: 'Invalid promo code',
    availableHouses: 'Available Houses',
    noAvailability: 'No houses available',
    noAvailabilityDesc: 'All houses are booked for the selected dates. Try different dates.',
    perNight: '/night',
    totalFor: 'Total for',
    nightsWord: (n) => n === 1 ? 'night' : 'nights',
    maxGuests: 'Max guests',
    beds: 'Beds',
    bedsDouble: 'double',
    bedsSingle: 'single',
    select: 'Select',
    selected: '✓ Selected',
    stubPricing: 'Estimated price',
    available: 'available',
    guestInfo: 'Guest Information',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone',
    bookingSummary: 'Your Booking',
    house: 'House',
    dates: 'Dates',
    price: 'Price',
    discount: 'Discount',
    total: 'Total',
    confirmBooking: 'Confirm Booking',
    processing: 'Processing...',
    agreeTerms: 'By clicking "Confirm", you agree to the booking terms',
    bookingSuccess: 'Booking Created!',
    bookingSuccessDesc: 'Your booking is awaiting confirmation. We will contact you shortly.',
    bookingId: 'Booking ID',
    backToStart: 'New Booking',
    weWillContact: 'We will contact you for confirmation and payment',
    next: 'Next',
    back: 'Back',
    monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    dayNamesShort: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    today: 'Today',
    errorOccurred: 'An error occurred',
    tryAgain: 'Try again',
    noUnitsLeft: 'Sorry, no units of this type are available',
    poweredBy: 'ALiSiO PMS',
  },
  cs: {
    brandName: 'ALiSiO Glamping',
    bookingTitle: 'Rezervace',
    step1Title: 'Termín a hosté',
    step1Desc: 'Vyberte datum příjezdu a odjezdu',
    step2Title: 'Vyberte domek',
    step2Desc: 'Prohlédněte si dostupné domky',
    step3Title: 'Vaše údaje',
    step3Desc: 'Vyplňte kontaktní údaje',
    selectDates: 'Vyberte termín',
    checkIn: 'Příjezd',
    checkOut: 'Odjezd',
    nights: 'Nocí',
    adults: 'Dospělí',
    children: 'Děti',
    selectCheckIn: 'Vyberte datum příjezdu',
    selectCheckOut: 'Vyberte datum odjezdu',
    minNights: 'Minimálně 1 noc',
    promoCode: 'Slevový kód',
    certificateCode: 'Kód certifikátu',
    apply: 'Použít',
    promoApplied: 'Slevový kód uplatněn!',
    promoInvalid: 'Neplatný slevový kód',
    availableHouses: 'Dostupné domky',
    noAvailability: 'Žádné dostupné domky',
    noAvailabilityDesc: 'Na vybrané datumy jsou všechny domky obsazeny. Zkuste jiné datumy.',
    perNight: '/noc',
    totalFor: 'Celkem za',
    nightsWord: (n) => n === 1 ? 'noc' : n < 5 ? 'noci' : 'nocí',
    maxGuests: 'Max. hostů',
    beds: 'Lůžka',
    bedsDouble: 'dvoulůžek',
    bedsSingle: 'jednolůžek',
    select: 'Vybrat',
    selected: '✓ Vybráno',
    stubPricing: 'Orientační cena',
    available: 'volných',
    guestInfo: 'Kontaktní údaje',
    firstName: 'Jméno',
    lastName: 'Příjmení',
    email: 'E-mail',
    phone: 'Telefon',
    bookingSummary: 'Vaše rezervace',
    house: 'Domek',
    dates: 'Termín',
    price: 'Cena',
    discount: 'Sleva',
    total: 'Celkem',
    confirmBooking: 'Potvrdit rezervaci',
    processing: 'Zpracování...',
    agreeTerms: 'Kliknutím na „Potvrdit" souhlasíte s podmínkami rezervace',
    bookingSuccess: 'Rezervace vytvořena!',
    bookingSuccessDesc: 'Vaše rezervace čeká na potvrzení. Brzy vás budeme kontaktovat.',
    bookingId: 'Číslo rezervace',
    backToStart: 'Nová rezervace',
    weWillContact: 'Budeme vás kontaktovat pro potvrzení a platbu',
    next: 'Další',
    back: 'Zpět',
    monthNames: ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'],
    dayNamesShort: ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'],
    today: 'Dnes',
    errorOccurred: 'Nastala chyba',
    tryAgain: 'Zkusit znovu',
    noUnitsLeft: 'Omlouváme se, žádné volné domky tohoto typu nejsou k dispozici',
    poweredBy: 'ALiSiO PMS',
  },
  de: {
    brandName: 'ALiSiO Glamping',
    bookingTitle: 'Buchung',
    step1Title: 'Termine & Gäste',
    step1Desc: 'Wählen Sie An- und Abreisedatum',
    step2Title: 'Haus wählen',
    step2Desc: 'Verfügbare Glamping-Häuser ansehen',
    step3Title: 'Ihre Daten',
    step3Desc: 'Kontaktdaten eingeben',
    selectDates: 'Termine wählen',
    checkIn: 'Anreise',
    checkOut: 'Abreise',
    nights: 'Nächte',
    adults: 'Erwachsene',
    children: 'Kinder',
    selectCheckIn: 'Anreisedatum wählen',
    selectCheckOut: 'Abreisedatum wählen',
    minNights: 'Mindestens 1 Nacht',
    promoCode: 'Aktionscode',
    certificateCode: 'Gutscheincode',
    apply: 'Anwenden',
    promoApplied: 'Aktionscode angewendet!',
    promoInvalid: 'Ungültiger Aktionscode',
    availableHouses: 'Verfügbare Häuser',
    noAvailability: 'Keine Häuser verfügbar',
    noAvailabilityDesc: 'Alle Häuser sind für die gewählten Daten ausgebucht. Versuchen Sie andere Termine.',
    perNight: '/Nacht',
    totalFor: 'Gesamt für',
    nightsWord: (n) => n === 1 ? 'Nacht' : 'Nächte',
    maxGuests: 'Max. Gäste',
    beds: 'Betten',
    bedsDouble: 'Doppel',
    bedsSingle: 'Einzel',
    select: 'Wählen',
    selected: '✓ Gewählt',
    stubPricing: 'Geschätzter Preis',
    available: 'verfügbar',
    guestInfo: 'Kontaktdaten',
    firstName: 'Vorname',
    lastName: 'Nachname',
    email: 'E-Mail',
    phone: 'Telefon',
    bookingSummary: 'Ihre Buchung',
    house: 'Haus',
    dates: 'Termine',
    price: 'Preis',
    discount: 'Rabatt',
    total: 'Gesamt',
    confirmBooking: 'Buchung bestätigen',
    processing: 'Verarbeitung...',
    agreeTerms: 'Mit Klick auf „Bestätigen" stimmen Sie den Buchungsbedingungen zu',
    bookingSuccess: 'Buchung erstellt!',
    bookingSuccessDesc: 'Ihre Buchung wartet auf Bestätigung. Wir werden Sie in Kürze kontaktieren.',
    bookingId: 'Buchungsnummer',
    backToStart: 'Neue Buchung',
    weWillContact: 'Wir kontaktieren Sie zur Bestätigung und Zahlung',
    next: 'Weiter',
    back: 'Zurück',
    monthNames: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    dayNamesShort: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    today: 'Heute',
    errorOccurred: 'Ein Fehler ist aufgetreten',
    tryAgain: 'Erneut versuchen',
    noUnitsLeft: 'Leider sind keine Häuser dieses Typs verfügbar',
    poweredBy: 'ALiSiO PMS',
  },
};

export function getBookingTranslations(lang: BookingLang): BookingTranslations {
  return translations[lang] || translations.uk;
}
