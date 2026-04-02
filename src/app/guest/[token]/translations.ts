/* eslint-disable @typescript-eslint/no-explicit-any */
// ─── Guest Page Translations ───────────────────────
// Languages: EN, DE, CS, UK, PL, NL, FR (Belgian French)

export type Lang = 'en' | 'de' | 'cs' | 'uk' | 'pl' | 'nl' | 'fr';

export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  de: 'Deutsch',
  cs: 'Čeština',
  uk: 'Українська',
  pl: 'Polski',
  nl: 'Nederlands',
  fr: 'Français (BE)',
};

export const LANG_FLAGS: Record<Lang, string> = {
  en: '🇬🇧',
  de: '🇩🇪',
  cs: '🇨🇿',
  uk: '🇺🇦',
  pl: '🇵🇱',
  nl: '🇳🇱',
  fr: '🇧🇪',
};

export interface Translations {
  // Header
  wifi: string;
  // Hero
  checkIn: string;
  checkOut: string;
  nights: string;
  guests: string;
  adultsShort: string;
  childrenShort: string;
  price: string;
  payment: string;
  paid: string;
  remaining: string;
  // Payment statuses
  unpaid: string;
  paymentRequested: string;
  prepaid: string;
  paidFull: string;
  // Booking statuses
  draft: string;
  tentative: string;
  confirmed: string;
  checkedIn: string;
  checkedOut: string;
  cancelled: string;
  noShow: string;
  // Registration
  regIncomplete: string;
  regComplete: string;
  completeReg: string;
  editReg: string;
  regTitle: string;
  regInstructions: (total: number) => string;
  guestN: (n: number) => string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  residence: string;
  addGuest: string;
  save: string;
  saving: string;
  cancel: string;
  regSaved: string;
  // Sections
  amenities: string;
  services: string;
  territoryMap: string;
  usefulInfo: string;
  faq: string;
  rules: string;
  // WiFi card
  wifiNetwork: string;
  wifiPassword: string;
  copyPassword: string;
  copied: string;
  // Services
  order: string;
  ordered: string;
  menu: string;
  serviceOrdered: string;
  orderError: string;
  // Map
  openMap: string;
  // Footer
  footerLocation: string;
  // Misc
  loading: string;
  notFound: string;
  notFoundDesc: string;
  regError: string;
  perNight: string;
  perDay: string;
  perHour: string;
  perPerson: string;
}

const translations: Record<Lang, Translations> = {
  en: {
    wifi: 'Wi-Fi',
    checkIn: '📅 Check-in',
    checkOut: '📅 Check-out',
    nights: '🌙 Nights',
    guests: '👥 Guests',
    adultsShort: 'ad.',
    childrenShort: 'ch.',
    price: '💰 Price',
    payment: '💳 Payment',
    paid: 'Paid',
    remaining: 'Remaining',
    unpaid: 'Unpaid',
    paymentRequested: 'Payment requested',
    prepaid: 'Prepaid',
    paidFull: 'Paid',
    draft: 'Draft',
    tentative: 'Tentative',
    confirmed: 'Confirmed',
    checkedIn: 'Checked in',
    checkedOut: 'Checked out',
    cancelled: 'Cancelled',
    noShow: 'No show',
    regIncomplete: 'Registration not completed',
    regComplete: 'Registration complete',
    completeReg: '📝 Complete registration',
    editReg: '✏️ Edit',
    regTitle: 'Guest registration',
    regInstructions: (t) => `Enter details for all guests (${t} ${t === 1 ? 'guest' : 'guests'}).`,
    guestN: (n) => `Guest ${n}`,
    firstName: 'First name *',
    lastName: 'Last name *',
    dateOfBirth: 'Date of birth',
    residence: 'Place of residence',
    addGuest: '+ Add guest',
    save: 'Save',
    saving: 'Saving...',
    cancel: 'Cancel',
    regSaved: 'Registration saved!',
    amenities: 'Amenities',
    services: '🎯 Additional services',
    territoryMap: '🗺️ Territory map',
    usefulInfo: '💡 Useful information',
    faq: '❓ FAQ',
    rules: '📜 House rules',
    wifiNetwork: 'Network',
    wifiPassword: 'Password',
    copyPassword: '📋 Copy password',
    copied: 'Copied!',
    order: 'Order',
    ordered: '✓ Ordered',
    menu: '📜 Menu',
    serviceOrdered: 'Service ordered!',
    orderError: 'Order error',
    openMap: 'Open map',
    footerLocation: 'Luhačovice, Czech Republic',
    loading: 'Loading...',
    notFound: 'Booking not found',
    notFoundDesc: 'Check the link or contact the administration.',
    regError: 'Registration error',
    perNight: '/night', perDay: '/day', perHour: '/hour', perPerson: '/person',
  },

  de: {
    wifi: 'WLAN',
    checkIn: '📅 Check-in',
    checkOut: '📅 Check-out',
    nights: '🌙 Nächte',
    guests: '👥 Gäste',
    adultsShort: 'Erw.',
    childrenShort: 'Ki.',
    price: '💰 Preis',
    payment: '💳 Zahlung',
    paid: 'Bezahlt',
    remaining: 'Restbetrag',
    unpaid: 'Unbezahlt',
    paymentRequested: 'Zahlung angefordert',
    prepaid: 'Vorauszahlung',
    paidFull: 'Bezahlt',
    draft: 'Entwurf',
    tentative: 'Vorläufig',
    confirmed: 'Bestätigt',
    checkedIn: 'Eingecheckt',
    checkedOut: 'Ausgecheckt',
    cancelled: 'Storniert',
    noShow: 'Nicht erschienen',
    regIncomplete: 'Registrierung nicht abgeschlossen',
    regComplete: 'Registrierung abgeschlossen',
    completeReg: '📝 Registrierung abschließen',
    editReg: '✏️ Bearbeiten',
    regTitle: 'Gästeregistrierung',
    regInstructions: (t) => `Geben Sie die Daten aller Gäste ein (${t} ${t === 1 ? 'Gast' : 'Gäste'}).`,
    guestN: (n) => `Gast ${n}`,
    firstName: 'Vorname *',
    lastName: 'Nachname *',
    dateOfBirth: 'Geburtsdatum',
    residence: 'Wohnort',
    addGuest: '+ Gast hinzufügen',
    save: 'Speichern',
    saving: 'Wird gespeichert...',
    cancel: 'Abbrechen',
    regSaved: 'Registrierung gespeichert!',
    amenities: 'Ausstattung',
    services: '🎯 Zusätzliche Leistungen',
    territoryMap: '🗺️ Geländekarte',
    usefulInfo: '💡 Nützliche Informationen',
    faq: '❓ Häufige Fragen',
    rules: '📜 Hausordnung',
    wifiNetwork: 'Netzwerk',
    wifiPassword: 'Passwort',
    copyPassword: '📋 Passwort kopieren',
    copied: 'Kopiert!',
    order: 'Bestellen',
    ordered: '✓ Bestellt',
    menu: '📜 Speisekarte',
    serviceOrdered: 'Leistung bestellt!',
    orderError: 'Bestellfehler',
    openMap: 'Karte öffnen',
    footerLocation: 'Luhačovice, Tschechien',
    loading: 'Wird geladen...',
    notFound: 'Buchung nicht gefunden',
    notFoundDesc: 'Überprüfen Sie den Link oder wenden Sie sich an die Rezeption.',
    regError: 'Registrierungsfehler',
    perNight: '/Nacht', perDay: '/Tag', perHour: '/Stunde', perPerson: '/Person',
  },

  cs: {
    wifi: 'Wi-Fi',
    checkIn: '📅 Příjezd',
    checkOut: '📅 Odjezd',
    nights: '🌙 Nocí',
    guests: '👥 Hostů',
    adultsShort: 'dosp.',
    childrenShort: 'dětí',
    price: '💰 Cena',
    payment: '💳 Platba',
    paid: 'Zaplaceno',
    remaining: 'Zbývá',
    unpaid: 'Nezaplaceno',
    paymentRequested: 'Očekává se platba',
    prepaid: 'Záloha',
    paidFull: 'Zaplaceno',
    draft: 'Koncept',
    tentative: 'Předběžná',
    confirmed: 'Potvrzeno',
    checkedIn: 'Ubytován',
    checkedOut: 'Odhlášen',
    cancelled: 'Zrušeno',
    noShow: 'Nedostavil se',
    regIncomplete: 'Registrace nedokončena',
    regComplete: 'Registrace dokončena',
    completeReg: '📝 Dokončit registraci',
    editReg: '✏️ Upravit',
    regTitle: 'Registrace hostů',
    regInstructions: (t) => `Zadejte údaje všech hostů (${t} ${t === 1 ? 'host' : t < 5 ? 'hosté' : 'hostů'}).`,
    guestN: (n) => `Host ${n}`,
    firstName: 'Jméno *',
    lastName: 'Příjmení *',
    dateOfBirth: 'Datum narození',
    residence: 'Místo bydliště',
    addGuest: '+ Přidat hosta',
    save: 'Uložit',
    saving: 'Ukládání...',
    cancel: 'Zrušit',
    regSaved: 'Registrace uložena!',
    amenities: 'Vybavení',
    services: '🎯 Doplňkové služby',
    territoryMap: '🗺️ Mapa areálu',
    usefulInfo: '💡 Užitečné informace',
    faq: '❓ Časté dotazy',
    rules: '📜 Pravidla pobytu',
    wifiNetwork: 'Síť',
    wifiPassword: 'Heslo',
    copyPassword: '📋 Kopírovat heslo',
    copied: 'Zkopírováno!',
    order: 'Objednat',
    ordered: '✓ Objednáno',
    menu: '📜 Menu',
    serviceOrdered: 'Služba objednána!',
    orderError: 'Chyba objednávky',
    openMap: 'Otevřít mapu',
    footerLocation: 'Luhačovice, Česká republika',
    loading: 'Načítání...',
    notFound: 'Rezervace nenalezena',
    notFoundDesc: 'Zkontrolujte odkaz nebo kontaktujte recepci.',
    regError: 'Chyba registrace',
    perNight: '/noc', perDay: '/den', perHour: '/hod', perPerson: '/os',
  },

  uk: {
    wifi: 'Wi-Fi',
    checkIn: '📅 Заїзд',
    checkOut: '📅 Виїзд',
    nights: '🌙 Ночей',
    guests: '👥 Гостей',
    adultsShort: 'дор.',
    childrenShort: 'діт.',
    price: '💰 Вартість',
    payment: '💳 Оплата',
    paid: 'Оплачено',
    remaining: 'Залишок',
    unpaid: 'Не оплачено',
    paymentRequested: 'Очікує оплати',
    prepaid: 'Передплата',
    paidFull: 'Оплачено',
    draft: 'Чернетка',
    tentative: 'Попереднє',
    confirmed: 'Підтверджено',
    checkedIn: 'Заселено',
    checkedOut: 'Виселено',
    cancelled: 'Скасовано',
    noShow: 'Не з\'явились',
    regIncomplete: 'Реєстрація не завершена',
    regComplete: 'Реєстрацію завершено',
    completeReg: '📝 Завершити реєстрацію',
    editReg: '✏️ Редагувати',
    regTitle: 'Реєстрація гостей',
    regInstructions: (t) => `Введіть дані всіх гостей для реєстрації (${t} ${t === 1 ? 'гість' : t < 5 ? 'гості' : 'гостей'}).`,
    guestN: (n) => `Гість ${n}`,
    firstName: "Ім'я *",
    lastName: 'Прізвище *',
    dateOfBirth: 'Дата народження',
    residence: 'Місце проживання',
    addGuest: '+ Додати гостя',
    save: 'Зберегти',
    saving: 'Збереження...',
    cancel: 'Скасувати',
    regSaved: 'Реєстрацію збережено!',
    amenities: 'Зручності',
    services: '🎯 Додаткові послуги',
    territoryMap: '🗺️ Карта території',
    usefulInfo: '💡 Корисна інформація',
    faq: '❓ Часті запитання',
    rules: '📜 Правила перебування',
    wifiNetwork: 'Мережа',
    wifiPassword: 'Пароль',
    copyPassword: '📋 Скопіювати пароль',
    copied: 'Скопійовано!',
    order: 'Замовити',
    ordered: '✓ Замовлено',
    menu: '📜 Меню',
    serviceOrdered: 'Послугу замовлено!',
    orderError: 'Помилка замовлення',
    openMap: 'Відкрити карту',
    footerLocation: 'Лугачовіце, Чеська Республіка',
    loading: 'Завантаження...',
    notFound: 'Бронювання не знайдено',
    notFoundDesc: 'Перевірте посилання або зверніться до адміністрації.',
    regError: 'Помилка реєстрації',
    perNight: '/ніч', perDay: '/день', perHour: '/год', perPerson: '/ос',
  },

  pl: {
    wifi: 'Wi-Fi',
    checkIn: '📅 Zameldowanie',
    checkOut: '📅 Wymeldowanie',
    nights: '🌙 Nocy',
    guests: '👥 Gości',
    adultsShort: 'dor.',
    childrenShort: 'dz.',
    price: '💰 Cena',
    payment: '💳 Płatność',
    paid: 'Zapłacono',
    remaining: 'Pozostało',
    unpaid: 'Nieopłacone',
    paymentRequested: 'Oczekuje płatności',
    prepaid: 'Przedpłata',
    paidFull: 'Zapłacono',
    draft: 'Szkic',
    tentative: 'Wstępna',
    confirmed: 'Potwierdzona',
    checkedIn: 'Zameldowany',
    checkedOut: 'Wymeldowany',
    cancelled: 'Anulowana',
    noShow: 'Nie pojawił się',
    regIncomplete: 'Rejestracja niezakończona',
    regComplete: 'Rejestracja zakończona',
    completeReg: '📝 Dokončit registraci',
    editReg: '✏️ Edytuj',
    regTitle: 'Rejestracja gości',
    regInstructions: (t) => `Wprowadź dane wszystkich gości (${t} ${t === 1 ? 'gość' : t < 5 ? 'gości' : 'gości'}).`,
    guestN: (n) => `Gość ${n}`,
    firstName: 'Imię *',
    lastName: 'Nazwisko *',
    dateOfBirth: 'Data urodzenia',
    residence: 'Miejsce zamieszkania',
    addGuest: '+ Dodaj gościa',
    save: 'Zapisz',
    saving: 'Zapisywanie...',
    cancel: 'Anuluj',
    regSaved: 'Rejestracja zapisana!',
    amenities: 'Udogodnienia',
    services: '🎯 Usługi dodatkowe',
    territoryMap: '🗺️ Mapa terenu',
    usefulInfo: '💡 Przydatne informacje',
    faq: '❓ FAQ',
    rules: '📜 Regulamin',
    wifiNetwork: 'Sieć',
    wifiPassword: 'Hasło',
    copyPassword: '📋 Kopiuj hasło',
    copied: 'Skopiowano!',
    order: 'Zamów',
    ordered: '✓ Zamówiono',
    menu: '📜 Menu',
    serviceOrdered: 'Usługa zamówiona!',
    orderError: 'Błąd zamówienia',
    openMap: 'Otwórz mapę',
    footerLocation: 'Luhačovice, Czechy',
    loading: 'Ładowanie...',
    notFound: 'Rezerwacja nie znaleziona',
    notFoundDesc: 'Sprawdź link lub skontaktuj się z recepcją.',
    regError: 'Błąd rejestracji',
    perNight: '/noc', perDay: '/dzień', perHour: '/godz', perPerson: '/os',
  },

  nl: {
    wifi: 'Wi-Fi',
    checkIn: '📅 Inchecken',
    checkOut: '📅 Uitchecken',
    nights: '🌙 Nachten',
    guests: '👥 Gasten',
    adultsShort: 'vol.',
    childrenShort: 'ki.',
    price: '💰 Prijs',
    payment: '💳 Betaling',
    paid: 'Betaald',
    remaining: 'Resterend',
    unpaid: 'Onbetaald',
    paymentRequested: 'Betaling gevraagd',
    prepaid: 'Vooruitbetaald',
    paidFull: 'Betaald',
    draft: 'Concept',
    tentative: 'Voorlopig',
    confirmed: 'Bevestigd',
    checkedIn: 'Ingecheckt',
    checkedOut: 'Uitgecheckt',
    cancelled: 'Geannuleerd',
    noShow: 'Niet verschenen',
    regIncomplete: 'Registratie niet voltooid',
    regComplete: 'Registratie voltooid',
    completeReg: '📝 Registratie voltooien',
    editReg: '✏️ Bewerken',
    regTitle: 'Gastenregistratie',
    regInstructions: (t) => `Voer de gegevens in van alle gasten (${t} ${t === 1 ? 'gast' : 'gasten'}).`,
    guestN: (n) => `Gast ${n}`,
    firstName: 'Voornaam *',
    lastName: 'Achternaam *',
    dateOfBirth: 'Geboortedatum',
    residence: 'Woonplaats',
    addGuest: '+ Gast toevoegen',
    save: 'Opslaan',
    saving: 'Opslaan...',
    cancel: 'Annuleren',
    regSaved: 'Registratie opgeslagen!',
    amenities: 'Voorzieningen',
    services: '🎯 Extra diensten',
    territoryMap: '🗺️ Plattegrond',
    usefulInfo: '💡 Nuttige informatie',
    faq: '❓ Veelgestelde vragen',
    rules: '📜 Huisregels',
    wifiNetwork: 'Netwerk',
    wifiPassword: 'Wachtwoord',
    copyPassword: '📋 Wachtwoord kopiëren',
    copied: 'Gekopieerd!',
    order: 'Bestellen',
    ordered: '✓ Besteld',
    menu: '📜 Menu',
    serviceOrdered: 'Dienst besteld!',
    orderError: 'Bestelfout',
    openMap: 'Kaart openen',
    footerLocation: 'Luhačovice, Tsjechië',
    loading: 'Laden...',
    notFound: 'Boeking niet gevonden',
    notFoundDesc: 'Controleer de link of neem contact op met de receptie.',
    regError: 'Registratiefout',
    perNight: '/nacht', perDay: '/dag', perHour: '/uur', perPerson: '/pers',
  },

  fr: {
    wifi: 'Wi-Fi',
    checkIn: '📅 Arrivée',
    checkOut: '📅 Départ',
    nights: '🌙 Nuits',
    guests: '👥 Hôtes',
    adultsShort: 'ad.',
    childrenShort: 'enf.',
    price: '💰 Prix',
    payment: '💳 Paiement',
    paid: 'Payé',
    remaining: 'Restant',
    unpaid: 'Non payé',
    paymentRequested: 'Paiement demandé',
    prepaid: 'Prépayé',
    paidFull: 'Payé',
    draft: 'Brouillon',
    tentative: 'Provisoire',
    confirmed: 'Confirmé',
    checkedIn: 'Arrivé',
    checkedOut: 'Parti',
    cancelled: 'Annulé',
    noShow: 'Non présenté',
    regIncomplete: 'Inscription non terminée',
    regComplete: 'Inscription terminée',
    completeReg: '📝 Terminer l\'inscription',
    editReg: '✏️ Modifier',
    regTitle: 'Inscription des hôtes',
    regInstructions: (t) => `Remplissez les données de tous les hôtes (${t} ${t === 1 ? 'hôte' : 'hôtes'}).`,
    guestN: (n) => `Hôte ${n}`,
    firstName: 'Prénom *',
    lastName: 'Nom *',
    dateOfBirth: 'Date de naissance',
    residence: 'Lieu de résidence',
    addGuest: '+ Ajouter un hôte',
    save: 'Enregistrer',
    saving: 'Enregistrement...',
    cancel: 'Annuler',
    regSaved: 'Inscription enregistrée!',
    amenities: 'Équipements',
    services: '🎯 Services supplémentaires',
    territoryMap: '🗺️ Plan du site',
    usefulInfo: '💡 Informations utiles',
    faq: '❓ Questions fréquentes',
    rules: '📜 Règlement intérieur',
    wifiNetwork: 'Réseau',
    wifiPassword: 'Mot de passe',
    copyPassword: '📋 Copier le mot de passe',
    copied: 'Copié!',
    order: 'Commander',
    ordered: '✓ Commandé',
    menu: '📜 Menu',
    serviceOrdered: 'Service commandé!',
    orderError: 'Erreur de commande',
    openMap: 'Ouvrir la carte',
    footerLocation: 'Luhačovice, République tchèque',
    loading: 'Chargement...',
    notFound: 'Réservation introuvable',
    notFoundDesc: 'Vérifiez le lien ou contactez la réception.',
    regError: 'Erreur d\'inscription',
    perNight: '/nuit', perDay: '/jour', perHour: '/heure', perPerson: '/pers',
  },
};

export function getTranslations(lang: Lang): Translations {
  return translations[lang] || translations.en;
}

// ─── Language Detection ──────────────────────────

// Country name → language code mapping
const COUNTRY_LANG_MAP: Record<string, Lang> = {
  // Ukrainian
  'ukraine': 'uk', 'україна': 'uk', 'ua': 'uk',
  // German
  'germany': 'de', 'deutschland': 'de', 'de': 'de',
  'austria': 'de', 'österreich': 'de', 'at': 'de',
  'switzerland': 'de', 'schweiz': 'de', 'ch': 'de',
  // Czech
  'czech republic': 'cs', 'czechia': 'cs', 'česko': 'cs', 'česká republika': 'cs', 'cz': 'cs',
  'slovakia': 'cs', 'slovensko': 'cs', 'sk': 'cs',
  // Polish
  'poland': 'pl', 'polska': 'pl', 'pl': 'pl',
  // Dutch
  'netherlands': 'nl', 'nederland': 'nl', 'nl': 'nl',
  // Belgian French
  'belgium': 'fr', 'belgique': 'fr', 'belgië': 'fr', 'be': 'fr',
  // French
  'france': 'fr', 'fr': 'fr',
};

// Phone prefix → language code mapping
const PHONE_LANG_MAP: Record<string, Lang> = {
  '+380': 'uk',  // Ukraine
  '+49': 'de',   // Germany
  '+43': 'de',   // Austria
  '+41': 'de',   // Switzerland
  '+420': 'cs',  // Czech Republic
  '+421': 'cs',  // Slovakia
  '+48': 'pl',   // Poland
  '+31': 'nl',   // Netherlands
  '+32': 'fr',   // Belgium
  '+33': 'fr',   // France
};

export function detectLanguage(guestPhone?: string | null, guestCountry?: string | null): Lang {
  // 1. Try guest country/address
  if (guestCountry) {
    const country = guestCountry.toLowerCase().trim();
    // Try full match
    if (COUNTRY_LANG_MAP[country]) return COUNTRY_LANG_MAP[country];
    // Try partial match (e.g. "Kyiv, Ukraine" → "ukraine")
    for (const [key, lang] of Object.entries(COUNTRY_LANG_MAP)) {
      if (country.includes(key)) return lang;
    }
  }

  // 2. Try phone prefix
  if (guestPhone) {
    const phone = guestPhone.replace(/\s/g, '');
    for (const [prefix, lang] of Object.entries(PHONE_LANG_MAP)) {
      if (phone.startsWith(prefix)) return lang;
    }
  }

  // 3. Fallback to English
  return 'en';
}

// ─── Brand Names ─────────────────────────────────

export function getBrandName(categoryType: string): string {
  return categoryType === 'glamping' ? 'QA Glamping' : 'Kemp Carlsbad';
}

// ─── Date Formatting per Language ────────────────

const DATE_LOCALES: Record<Lang, string> = {
  en: 'en-GB',
  de: 'de-DE',
  cs: 'cs-CZ',
  uk: 'uk-UA',
  pl: 'pl-PL',
  nl: 'nl-NL',
  fr: 'fr-BE',
};

export function formatDateLocalized(d: string, lang: Lang): string {
  if (!d) return '—';
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString(DATE_LOCALES[lang] || 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatPriceLocalized(n: number, cur = 'CZK'): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: cur, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}
