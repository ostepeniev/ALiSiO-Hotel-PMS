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
  // Steps (5-step flow)
  step1: string; // Твій вибір
  step2: string; // Будинок
  step3: string; // Особисті дані
  step4: string; // Сервіси
  step5: string; // Оплата
  // Step 1 - Dates
  enterStayData: string;
  fillRequired: string;
  location: string;
  dates: string;
  checkIn: string;
  checkOut: string;
  duration: string;
  nights: string;
  nightsWord: (n: number) => string;
  adults: string;
  children: string;
  selectCheckIn: string;
  selectCheckOut: string;
  // Step 2 - Houses
  houseName: string;
  guests: string;
  guestsExtra: string;
  area: string;
  addHouse: string;
  selectedHouse: string;
  noAvailability: string;
  noAvailabilityDesc: string;
  perNight: string;
  totalFor: string;
  maxGuests: string;
  beds: string;
  bedsDouble: string;
  bedsSingle: string;
  stubPricing: string;
  unavailableDates: string;
  // Step 3 - Personal Info
  enterPersonalInfo: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  // Promo & Certificate
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
  apply: string;
  promoApplied: string;
  promoInvalid: string;
  // Summary / Sidebar
  yourChoice: string;
  yourHouse: string;
  housePlaceholder: string;
  price: string;
  discount: string;
  total: string;
  including: string;
  // Step 4 - Services
  additionalServices: string;
  selectServices: string;
  saunaTitle: string;
  saunaDesc: string;
  saunaDate: string;
  saunaTime: string;
  saunaHours: string;
  saunaMinHours: string;
  saunaBroom: string;
  saunaPersons: string;
  saunaPerHour: string;
  saunaAddToBooking: string;
  saunaSlotBooked: string;
  breakfastTitle: string;
  breakfastDesc: string;
  breakfastQuantity: string;
  breakfastAddToBooking: string;
  breakfastPerPerson: string;
  serviceTotal: string;
  servicesSkip: string;
  servicesEmpty: string;
  wantButton: string;
  bookService: string;
  closePopup: string;
  selectTime: string;
  slotBooked: string;
  myDishes: string;
  breakfastInfo: string;
  editService: string;
  removeService: string;
  totalLabel: string;
  // Step 5 - Confirmation
  confirmBooking: string;
  processing: string;
  agreeTerms: string;
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
  // Booking details (mobile)
  bookingDetails: string;
  // Step 2 — House Card
  petFriendly: string;
  petFriendlyDesc: string;
  petCheckbox: string;
  petPresence: string;
  extraPersonCharge: string;
  adultsCount: string;
  childrenCount: string;
  closeCard: string;
  bookHouse: string;
  multiHouseInfo: string;
  amenitiesTitle: string;
  // Step 4 — New services
  tubTitle: string;
  tubDesc: string;
  tubPerHour: string;
  tubAddToBooking: string;
  lateCheckoutTitle: string;
  lateCheckoutDesc: string;
  earlyCheckinTitle: string;
  earlyCheckinDesc: string;
  // Payment
  payNow: string;
  redirectingToPayment: string;
  paymentSuccess: string;
  paymentSuccessDesc: string;
  paymentFailed: string;
  paymentFailedDesc: string;
  viewBooking: string;
}

const translations: Record<BookingLang, BookingTranslations> = {
  uk: {
    brandName: 'QA Glamping',
    step1: 'Твій вибір',
    step2: 'Будинок',
    step3: 'Особиста інформація',
    step4: 'Сервіси',
    step5: 'Оплата',
    enterStayData: 'Введіть дані для проживання',
    fillRequired: "Заповни, будь ласка, обов'язкові поля (обов'язкові поля помічені символом *).",
    location: 'Локація',
    dates: 'Дати',
    checkIn: 'Заїзд',
    checkOut: 'Виїзд',
    duration: 'Тривалість',
    nights: 'Ночей',
    nightsWord: (n) => n === 1 ? 'доба' : n < 5 ? 'доби' : 'діб',
    adults: 'Дорослі',
    children: 'Діти',
    selectCheckIn: 'Оберіть дату заїзду',
    selectCheckOut: 'Оберіть дату виїзду',
    houseName: 'Будинок',
    guests: 'гостей',
    guestsExtra: '+1',
    area: 'м²',
    addHouse: 'Додати будинок',
    selectedHouse: '✓ Обрано',
    noAvailability: 'Немає доступних будиночків',
    noAvailabilityDesc: 'На обрані дати всі будиночки зайняті. Спробуйте інші дати.',
    perNight: '/ніч',
    totalFor: 'Усього за',
    maxGuests: 'Макс. гостей',
    beds: 'Ліжка',
    bedsDouble: 'двоспальних',
    bedsSingle: 'односпальних',
    stubPricing: 'Орієнтовна ціна',
    unavailableDates: 'На деякі з вибраних дат цей номер будинку зайнятий, можете перевірити доступність у календарі.',
    enterPersonalInfo: 'Введіть особисту інформацію',
    firstName: "Ім'я",
    lastName: 'Прізвище',
    phone: 'Номер телефону',
    email: 'Email',
    promoCode: 'Промокод',
    certificateCode: 'Код сертифікату',
    payAndConfirm: 'Оплатити бронь',
    bookingConfirmedTitle: 'Бронь підтверджена',
    bookingConfirmedDesc: 'Оплата за номер пройшла. За бажанням додайте послуги — оплата окремим платежем.',
    skipToThankYou: 'Пропустити',
    confirmServices: 'Підтвердити послуги',
    servicesOptional: 'Послуги опціональні — можна пропустити і замовити пізніше за посиланням з email.',
    purchasedServicesTitle: 'Замовлені послуги',
    apply: 'Застосувати',
    promoApplied: 'Промокод застосовано!',
    promoInvalid: 'Промокод недійсний',
    yourChoice: 'Твій вибір',
    yourHouse: 'Твій будинок',
    housePlaceholder: 'Тут буде вся інформація про обраний тобою будинок, кількість гостей та додаткові послуги.',
    price: 'Вартість',
    discount: 'Знижка',
    total: 'До сплати',
    including: 'Враховуючи сервіси',
    additionalServices: 'Додаткові послуги',
    selectServices: 'Оберіть додаткові послуги для вашого відпочинку',
    saunaTitle: 'Сауна',
    saunaDesc: 'Фінська сауна з дровами. Мінімальне бронювання — 2 години.',
    saunaDate: 'Оберіть дату',
    saunaTime: 'Час початку',
    saunaHours: 'Кількість годин',
    saunaMinHours: 'Мінімум 2 години',
    saunaBroom: 'Віник для сауни',
    saunaPersons: 'Кількість осіб',
    saunaPerHour: 'Kč/год',
    saunaAddToBooking: 'Додати сауну',
    saunaSlotBooked: 'Цей часовий слот вже зайнятий',
    breakfastTitle: 'Сніданок',
    breakfastDesc: 'Оберіть сніданок на кожний день проживання',
    breakfastQuantity: 'Кількість',
    breakfastAddToBooking: 'Додати сніданок',
    breakfastPerPerson: 'на людину',
    serviceTotal: 'Разом за послуги',
    servicesSkip: 'Пропустити',
    servicesEmpty: 'Ви можете додати послуги пізніше у гостьовому порталі',
    wantButton: 'Хочу',
    bookService: 'Забронювати',
    closePopup: 'Закрити',
    selectTime: 'Оберіть час',
    slotBooked: 'Зайнято',
    myDishes: 'Мої страви',
    breakfastInfo: 'Це твій сніданок на наступний день після заселення.',
    editService: 'Редагувати',
    removeService: 'Видалити сервіс',
    totalLabel: 'Всього',
    confirmBooking: 'Підтвердити і оплатити',
    processing: 'Обробка...',
    agreeTerms: 'Натискаючи «Підтвердити», ви погоджуєтесь з умовами бронювання',
    bookingSuccess: 'Бронювання підтверджено та оплачено!',
    bookingSuccessDesc: 'Деталі бронювання надіслані на вашу пошту.',
    bookingId: 'Номер бронювання',
    backToStart: 'Нове бронювання',
    weWillContact: 'Ваш будиночок чекає на вас!',
    payNow: '💳 Оплатити зараз',
    redirectingToPayment: 'Переадресація на сторінку оплати...',
    paymentSuccess: 'Оплата успішна!',
    paymentSuccessDesc: 'Ваше бронювання підтверджено та оплачено.',
    paymentFailed: 'Оплата не пройшла',
    paymentFailedDesc: 'Спробуйте ще раз або зв\'яжіться з нами.',
    viewBooking: 'Переглянути бронювання',
    next: 'Далі',
    back: 'Назад',
    monthNames: ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'],
    dayNamesShort: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    today: 'Сьогодні',
    errorOccurred: 'Виникла помилка',
    tryAgain: 'Спробувати ще раз',
    noUnitsLeft: 'На жаль, вільних будиночків не залишилось',
    poweredBy: 'ALiSiO PMS',
    bookingDetails: 'Деталі бронювання',
    // Step 2 — House Card
    petFriendly: '🐾 Ми pet-friendly!',
    petFriendlyDesc: 'Ми завжди раді вашим пухнастим друзям. Додаткове прибирання за пухнастиком.',
    petCheckbox: 'Я візьму тваринку з собою',
    petPresence: 'Наявність тварин',
    extraPersonCharge: 'за додаткового гостя/ніч',
    adultsCount: 'Дорослих',
    childrenCount: 'Дітей',
    closeCard: 'Закрити',
    bookHouse: 'Забронювати',
    multiHouseInfo: 'Щоб забронювати кілька будинків — зробіть окремі бронювання для кожного.',
    amenitiesTitle: 'Зручності',
    // Step 4 — New services
    tubTitle: 'Чан',
    tubDesc: 'Дерев\'яний чан під відкритим небом. Мінімальне бронювання — 2 години.',
    tubPerHour: '/Kč/год',
    tubAddToBooking: 'Додати чан',
    lateCheckoutTitle: 'Пізнє виселення',
    lateCheckoutDesc: 'Виселення до 14:00 замість 11:00',
    earlyCheckinTitle: 'Раннє заселення',
    earlyCheckinDesc: 'Заселення з 12:00 замість 15:00',
  },
  en: {
    brandName: 'QA Glamping',
    step1: 'Your Choice',
    step2: 'House',
    step3: 'Personal Info',
    step4: 'Services',
    step5: 'Payment',
    enterStayData: 'Enter your stay details',
    fillRequired: 'Please fill in required fields (required fields are marked with *).',
    location: 'Location',
    dates: 'Dates',
    checkIn: 'Check-in',
    checkOut: 'Check-out',
    duration: 'Duration',
    nights: 'Nights',
    nightsWord: (n) => n === 1 ? 'night' : 'nights',
    adults: 'Adults',
    children: 'Children',
    selectCheckIn: 'Select check-in date',
    selectCheckOut: 'Select check-out date',
    houseName: 'House',
    guests: 'guests',
    guestsExtra: '+1',
    area: 'm²',
    addHouse: 'Add house',
    selectedHouse: '✓ Selected',
    noAvailability: 'No houses available',
    noAvailabilityDesc: 'All houses are booked for the selected dates. Try different dates.',
    perNight: '/night',
    totalFor: 'Total for',
    maxGuests: 'Max guests',
    beds: 'Beds',
    bedsDouble: 'double',
    bedsSingle: 'single',
    stubPricing: 'Estimated price',
    unavailableDates: 'This house is booked for some of the selected dates. You can check availability in the calendar.',
    enterPersonalInfo: 'Enter personal information',
    firstName: 'First name',
    lastName: 'Last name',
    phone: 'Phone number',
    email: 'Email',
    promoCode: 'Promo code',
    certificateCode: 'Certificate code',
    payAndConfirm: 'Pay & book',
    bookingConfirmedTitle: 'Booking confirmed',
    bookingConfirmedDesc: 'Your room is paid. Add optional services — they are billed as a separate payment.',
    skipToThankYou: 'Skip',
    confirmServices: 'Confirm services',
    servicesOptional: 'Services are optional — you can skip and add them later via the link in your email.',
    purchasedServicesTitle: 'Purchased services',
    apply: 'Apply',
    promoApplied: 'Promo code applied!',
    promoInvalid: 'Invalid promo code',
    yourChoice: 'Your choice',
    yourHouse: 'Your house',
    housePlaceholder: 'All information about your selected house, number of guests and additional services will appear here.',
    price: 'Price',
    discount: 'Discount',
    total: 'Total',
    including: 'Including services',
    additionalServices: 'Additional Services',
    selectServices: 'Select additional services for your stay',
    saunaTitle: 'Sauna',
    saunaDesc: 'Finnish wood-fired sauna. Minimum booking — 2 hours.',
    saunaDate: 'Select date',
    saunaTime: 'Start time',
    saunaHours: 'Number of hours',
    saunaMinHours: 'Minimum 2 hours',
    saunaBroom: 'Sauna broom',
    saunaPersons: 'Number of persons',
    saunaPerHour: 'CZK/hr',
    saunaAddToBooking: 'Add sauna',
    saunaSlotBooked: 'This time slot is already booked',
    breakfastTitle: 'Breakfast',
    breakfastDesc: 'Choose breakfast for each day of your stay',
    breakfastQuantity: 'Quantity',
    breakfastAddToBooking: 'Add breakfast',
    breakfastPerPerson: 'per person',
    serviceTotal: 'Services total',
    servicesSkip: 'Skip',
    servicesEmpty: 'You can add services later in the guest portal',
    wantButton: 'I want',
    bookService: 'Book',
    closePopup: 'Close',
    selectTime: 'Select time',
    slotBooked: 'Booked',
    myDishes: 'My dishes',
    breakfastInfo: 'This is your breakfast for the next day after check-in.',
    editService: 'Edit',
    removeService: 'Remove service',
    totalLabel: 'Total',
    confirmBooking: 'Confirm & Pay',
    processing: 'Processing...',
    agreeTerms: 'By clicking "Confirm", you agree to the booking terms',
    bookingSuccess: 'Booking Confirmed & Paid!',
    bookingSuccessDesc: 'Booking details have been sent to your email.',
    bookingId: 'Booking ID',
    backToStart: 'New Booking',
    weWillContact: 'Your house is waiting for you!',
    payNow: '💳 Pay Now',
    redirectingToPayment: 'Redirecting to payment...',
    paymentSuccess: 'Payment Successful!',
    paymentSuccessDesc: 'Your booking is confirmed and paid.',
    paymentFailed: 'Payment Failed',
    paymentFailedDesc: 'Please try again or contact us.',
    viewBooking: 'View Booking',
    next: 'Next',
    back: 'Back',
    monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    dayNamesShort: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    today: 'Today',
    errorOccurred: 'An error occurred',
    tryAgain: 'Try again',
    noUnitsLeft: 'Sorry, no units are available',
    poweredBy: 'ALiSiO PMS',
    bookingDetails: 'Booking details',
    petFriendly: '🐾 We are pet-friendly!',
    petFriendlyDesc: 'We always welcome your furry friends. Extra cleaning fee applies.',
    petCheckbox: 'I\'ll bring a pet',
    petPresence: 'Pets',
    extraPersonCharge: 'per extra guest/night',
    adultsCount: 'Adults',
    childrenCount: 'Children',
    closeCard: 'Close',
    bookHouse: 'Book',
    multiHouseInfo: 'To book multiple houses — make a separate booking for each.',
    amenitiesTitle: 'Amenities',
    tubTitle: 'Hot Tub',
    tubDesc: 'Wooden hot tub outdoors. Minimum booking — 2 hours.',
    tubPerHour: '/CZK/hr',
    tubAddToBooking: 'Add tub',
    lateCheckoutTitle: 'Late Checkout',
    lateCheckoutDesc: 'Checkout until 14:00 instead of 11:00',
    earlyCheckinTitle: 'Early Check-in',
    earlyCheckinDesc: 'Check-in from 12:00 instead of 15:00',
  },
  cs: {
    brandName: 'QA Glamping',
    step1: 'Váš výběr',
    step2: 'Domek',
    step3: 'Osobní údaje',
    step4: 'Služby',
    step5: 'Platba',
    enterStayData: 'Zadejte údaje o pobytu',
    fillRequired: 'Prosím vyplňte povinná pole (povinná pole jsou označena *).',
    location: 'Lokalita',
    dates: 'Termín',
    checkIn: 'Příjezd',
    checkOut: 'Odjezd',
    duration: 'Délka',
    nights: 'Nocí',
    nightsWord: (n) => n === 1 ? 'noc' : n < 5 ? 'noci' : 'nocí',
    adults: 'Dospělí',
    children: 'Děti',
    selectCheckIn: 'Vyberte datum příjezdu',
    selectCheckOut: 'Vyberte datum odjezdu',
    houseName: 'Domek',
    guests: 'hostů',
    guestsExtra: '+1',
    area: 'm²',
    addHouse: 'Přidat domek',
    selectedHouse: '✓ Vybráno',
    noAvailability: 'Žádné dostupné domky',
    noAvailabilityDesc: 'Na vybrané datumy jsou všechny domky obsazeny. Zkuste jiné datumy.',
    perNight: '/noc',
    totalFor: 'Celkem za',
    maxGuests: 'Max. hostů',
    beds: 'Lůžka',
    bedsDouble: 'dvoulůžek',
    bedsSingle: 'jednolůžek',
    stubPricing: 'Orientační cena',
    unavailableDates: 'Na některé z vybraných datumů je tento domek obsazen. Dostupnost můžete zkontrolovat v kalendáři.',
    enterPersonalInfo: 'Zadejte osobní údaje',
    firstName: 'Jméno',
    lastName: 'Příjmení',
    phone: 'Telefonní číslo',
    email: 'E-mail',
    promoCode: 'Slevový kód',
    certificateCode: 'Kód certifikátu',
    payAndConfirm: 'Zaplatit a rezervovat',
    bookingConfirmedTitle: 'Rezervace potvrzena',
    bookingConfirmedDesc: 'Pokoj je zaplacen. Volitelně přidejte služby — ty se platí zvlášť.',
    skipToThankYou: 'Přeskočit',
    confirmServices: 'Potvrdit služby',
    servicesOptional: 'Služby jsou volitelné — lze přeskočit a přidat později přes odkaz z e-mailu.',
    purchasedServicesTitle: 'Objednané služby',
    apply: 'Použít',
    promoApplied: 'Slevový kód uplatněn!',
    promoInvalid: 'Neplatný slevový kód',
    yourChoice: 'Váš výběr',
    yourHouse: 'Váš domek',
    housePlaceholder: 'Zde se zobrazí informace o vybraném domku, počtu hostů a doplňkových službách.',
    price: 'Cena',
    discount: 'Sleva',
    total: 'Celkem',
    including: 'Včetně služeb',
    additionalServices: 'Doplňkové služby',
    selectServices: 'Vyberte doplňkové služby pro váš pobyt',
    saunaTitle: 'Sauna',
    saunaDesc: 'Finská sauna na dřevo. Minimální rezervace — 2 hodiny.',
    saunaDate: 'Vyberte datum',
    saunaTime: 'Čas začátku',
    saunaHours: 'Počet hodin',
    saunaMinHours: 'Minimálně 2 hodiny',
    saunaBroom: 'Saunová metla',
    saunaPersons: 'Počet osob',
    saunaPerHour: 'Kč/hod',
    saunaAddToBooking: 'Přidat saunu',
    saunaSlotBooked: 'Tento časový slot je již obsazen',
    breakfastTitle: 'Snídaně',
    breakfastDesc: 'Vyberte snídani na každý den pobytu',
    breakfastQuantity: 'Množství',
    breakfastAddToBooking: 'Přidat snídani',
    breakfastPerPerson: 'na osobu',
    serviceTotal: 'Služby celkem',
    servicesSkip: 'Přeskočit',
    servicesEmpty: 'Služby můžete přidat později na hostovském portálu',
    wantButton: 'Chci',
    bookService: 'Rezervovat',
    closePopup: 'Zavřít',
    selectTime: 'Vyberte čas',
    slotBooked: 'Obsazeno',
    myDishes: 'Mé pokrmy',
    breakfastInfo: 'Toto je vaše snídaně na další den po příjezdu.',
    editService: 'Upravit',
    removeService: 'Odebrat službu',
    totalLabel: 'Celkem',
    confirmBooking: 'Potvrdit a zaplatit',
    processing: 'Zpracování...',
    agreeTerms: 'Kliknutím na „Potvrdit" souhlasíte s podmínkami rezervace',
    bookingSuccess: 'Rezervace potvrzena a zaplacena!',
    bookingSuccessDesc: 'Detaily rezervace byly odeslány na váš e-mail.',
    bookingId: 'Číslo rezervace',
    backToStart: 'Nová rezervace',
    weWillContact: 'Váš domek na vás čeká!',
    payNow: '💳 Zaplatit nyní',
    redirectingToPayment: 'Přesměrování na platbu...',
    paymentSuccess: 'Platba úspěšná!',
    paymentSuccessDesc: 'Vaše rezervace je potvrzena a zaplacena.',
    paymentFailed: 'Platba se nezdařila',
    paymentFailedDesc: 'Zkuste to znovu nebo nás kontaktujte.',
    viewBooking: 'Zobrazit rezervaci',
    next: 'Další',
    back: 'Zpět',
    monthNames: ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'],
    dayNamesShort: ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'],
    today: 'Dnes',
    errorOccurred: 'Nastala chyba',
    tryAgain: 'Zkusit znovu',
    noUnitsLeft: 'Omlouváme se, žádné volné domky nejsou k dispozici',
    poweredBy: 'ALiSiO PMS',
    bookingDetails: 'Detaily rezervace',
    petFriendly: '🐾 Jsme pet-friendly!',
    petFriendlyDesc: 'Vaši chlupatí přátelé jsou vítáni. Účtuje se příplatek za úklid.',
    petCheckbox: 'Vezmu si mazlíčka',
    petPresence: 'Zvířata',
    extraPersonCharge: 'za dalšího hosta/noc',
    adultsCount: 'Dospělí',
    childrenCount: 'Děti',
    closeCard: 'Zavřít',
    bookHouse: 'Rezervovat',
    multiHouseInfo: 'Chcete-li rezervovat více domků — proveďte samostatnou rezervaci pro každý.',
    amenitiesTitle: 'Vybavení',
    tubTitle: 'Káď',
    tubDesc: 'Dřevěná káď venku. Minimální rezervace — 2 hodiny.',
    tubPerHour: '/Kč/hod',
    tubAddToBooking: 'Přidat káď',
    lateCheckoutTitle: 'Pozdní odhlášení',
    lateCheckoutDesc: 'Odhlášení do 14:00 místo 11:00',
    earlyCheckinTitle: 'Brzký příjezd',
    earlyCheckinDesc: 'Příjezd od 12:00 místo 15:00',
  },
  de: {
    brandName: 'QA Glamping',
    step1: 'Ihre Wahl',
    step2: 'Haus',
    step3: 'Persönliche Daten',
    step4: 'Services',
    step5: 'Zahlung',
    enterStayData: 'Geben Sie die Aufenthaltsdaten ein',
    fillRequired: 'Bitte füllen Sie die Pflichtfelder aus (Pflichtfelder sind mit * gekennzeichnet).',
    location: 'Standort',
    dates: 'Termine',
    checkIn: 'Anreise',
    checkOut: 'Abreise',
    duration: 'Dauer',
    nights: 'Nächte',
    nightsWord: (n) => n === 1 ? 'Nacht' : 'Nächte',
    adults: 'Erwachsene',
    children: 'Kinder',
    selectCheckIn: 'Anreisedatum wählen',
    selectCheckOut: 'Abreisedatum wählen',
    houseName: 'Haus',
    guests: 'Gäste',
    guestsExtra: '+1',
    area: 'm²',
    addHouse: 'Haus hinzufügen',
    selectedHouse: '✓ Gewählt',
    noAvailability: 'Keine Häuser verfügbar',
    noAvailabilityDesc: 'Alle Häuser sind für die gewählten Daten ausgebucht. Versuchen Sie andere Termine.',
    perNight: '/Nacht',
    totalFor: 'Gesamt für',
    maxGuests: 'Max. Gäste',
    beds: 'Betten',
    bedsDouble: 'Doppel',
    bedsSingle: 'Einzel',
    stubPricing: 'Geschätzter Preis',
    unavailableDates: 'An einigen der ausgewählten Daten ist dieses Haus belegt. Die Verfügbarkeit können Sie im Kalender prüfen.',
    enterPersonalInfo: 'Persönliche Daten eingeben',
    firstName: 'Vorname',
    lastName: 'Nachname',
    phone: 'Telefonnummer',
    email: 'E-Mail',
    promoCode: 'Aktionscode',
    certificateCode: 'Gutscheincode',
    payAndConfirm: 'Bezahlen & buchen',
    bookingConfirmedTitle: 'Buchung bestätigt',
    bookingConfirmedDesc: 'Ihr Zimmer ist bezahlt. Optional können Sie Zusatzleistungen hinzufügen — separate Zahlung.',
    skipToThankYou: 'Überspringen',
    confirmServices: 'Leistungen bestätigen',
    servicesOptional: 'Leistungen sind optional — Sie können später über den Link in der E-Mail hinzufügen.',
    purchasedServicesTitle: 'Bestellte Leistungen',
    apply: 'Anwenden',
    promoApplied: 'Aktionscode angewendet!',
    promoInvalid: 'Ungültiger Aktionscode',
    yourChoice: 'Ihre Wahl',
    yourHouse: 'Ihr Haus',
    housePlaceholder: 'Hier werden alle Informationen zu Ihrem ausgewählten Haus, Gästezahl und Zusatzleistungen angezeigt.',
    price: 'Preis',
    discount: 'Rabatt',
    total: 'Gesamt',
    including: 'Einschließlich Dienstleistungen',
    additionalServices: 'Zusätzliche Dienstleistungen',
    selectServices: 'Wählen Sie zusätzliche Dienstleistungen für Ihren Aufenthalt',
    saunaTitle: 'Sauna',
    saunaDesc: 'Finnische Holzsauna. Mindestbuchung — 2 Stunden.',
    saunaDate: 'Datum wählen',
    saunaTime: 'Startzeit',
    saunaHours: 'Stundenanzahl',
    saunaMinHours: 'Mindestens 2 Stunden',
    saunaBroom: 'Saunabesen',
    saunaPersons: 'Personenanzahl',
    saunaPerHour: 'CZK/Std',
    saunaAddToBooking: 'Sauna hinzufügen',
    saunaSlotBooked: 'Dieser Zeitslot ist bereits gebucht',
    breakfastTitle: 'Frühstück',
    breakfastDesc: 'Wählen Sie das Frühstück für jeden Tag Ihres Aufenthalts',
    breakfastQuantity: 'Menge',
    breakfastAddToBooking: 'Frühstück hinzufügen',
    breakfastPerPerson: 'pro Person',
    serviceTotal: 'Dienstleistungen gesamt',
    servicesSkip: 'Überspringen',
    servicesEmpty: 'Sie können Dienstleistungen später im Gästeportal hinzufügen',
    wantButton: 'Ich möchte',
    bookService: 'Buchen',
    closePopup: 'Schließen',
    selectTime: 'Zeit wählen',
    slotBooked: 'Gebucht',
    myDishes: 'Meine Gerichte',
    breakfastInfo: 'Dies ist Ihr Frühstück für den nächsten Tag nach dem Check-in.',
    editService: 'Bearbeiten',
    removeService: 'Service entfernen',
    totalLabel: 'Gesamt',
    confirmBooking: 'Bestätigen & Bezahlen',
    processing: 'Verarbeitung...',
    agreeTerms: 'Mit Klick auf „Bestätigen" stimmen Sie den Buchungsbedingungen zu',
    bookingSuccess: 'Buchung bestätigt & bezahlt!',
    bookingSuccessDesc: 'Buchungsdetails wurden an Ihre E-Mail gesendet.',
    bookingId: 'Buchungsnummer',
    backToStart: 'Neue Buchung',
    weWillContact: 'Ihr Haus wartet auf Sie!',
    payNow: '💳 Jetzt bezahlen',
    redirectingToPayment: 'Weiterleitung zur Zahlung...',
    paymentSuccess: 'Zahlung erfolgreich!',
    paymentSuccessDesc: 'Ihre Buchung ist bestätigt und bezahlt.',
    paymentFailed: 'Zahlung fehlgeschlagen',
    paymentFailedDesc: 'Bitte versuchen Sie es erneut oder kontaktieren Sie uns.',
    viewBooking: 'Buchung ansehen',
    next: 'Weiter',
    back: 'Zurück',
    monthNames: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    dayNamesShort: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    today: 'Heute',
    errorOccurred: 'Ein Fehler ist aufgetreten',
    tryAgain: 'Erneut versuchen',
    noUnitsLeft: 'Leider sind keine Häuser verfügbar',
    poweredBy: 'ALiSiO PMS',
    bookingDetails: 'Buchungsdetails',
    petFriendly: '🐾 Wir sind tierfreundlich!',
    petFriendlyDesc: 'Ihre pelzigen Freunde sind willkommen. Reinigungszuschlag wird berechnet.',
    petCheckbox: 'Ich bringe ein Haustier mit',
    petPresence: 'Haustiere',
    extraPersonCharge: 'pro Zusatzgast/Nacht',
    adultsCount: 'Erwachsene',
    childrenCount: 'Kinder',
    closeCard: 'Schließen',
    bookHouse: 'Buchen',
    multiHouseInfo: 'Um mehrere Häuser zu buchen — führen Sie für jedes eine separate Buchung durch.',
    amenitiesTitle: 'Ausstattung',
    tubTitle: 'Badefass',
    tubDesc: 'Holz-Badefass im Freien. Mindestbuchung — 2 Stunden.',
    tubPerHour: '/Kč/Std',
    tubAddToBooking: 'Badefass hinzufügen',
    lateCheckoutTitle: 'Später Check-out',
    lateCheckoutDesc: 'Check-out bis 14:00 statt 11:00',
    earlyCheckinTitle: 'Früher Check-in',
    earlyCheckinDesc: 'Check-in ab 12:00 statt 15:00',
  },
};

export function getBookingTranslations(lang: BookingLang): BookingTranslations {
  return translations[lang] || translations.uk;
}
