const D = require('better-sqlite3');
const db = new D('/root/projects/alisio-pms/data/alisio.db');

// Get org id
const org = db.prepare('SELECT id FROM organizations LIMIT 1').get();
if (!org) { console.log('No org!'); process.exit(1); }

const articles = [
  {
    topic: 'QA Glamping / Quiet Anomaly — зв\'язок з кемпінгом',
    keywords: 'quiet anomaly, glamping, qa glamping, domek, domečky, tiny house, будиночок, суміжна територія, connected, close',
    content: `QA Glamping (Quiet Anomaly) — наш глемпінг, розташований на суміжній території з кемпінгом Kemp Carlsbad.
Сайт: https://qa-glamping.eu/
- Tiny houses розраховані ТІЛЬКИ на 2 особи (максимум)
- Barn houses (4+2 осіб) ще не доступні — будуть пізніше
- Якщо гість хоче з дітьми в tiny house — уточни: чи діти мають жити окремо в іншому будиночку?
- Якщо потрібно більше місць — запропонуй 2 будиночки або Budova D/F як альтернативу
- Глемпінг і кемпінг — це один комплекс, одна адміністрація, один рецепшн`,
    category: 'properties',
  },
  {
    topic: 'Як дістатися / транспорт / таксі',
    keywords: 'дістатися, таксі, taxi, directions, jak se dostat, how to get, адреса, address, навігація, gps, airport, letiště, transfer, bus, autobus, vlak, train',
    content: `Адреса: Kemp Carlsbad, Sadová 478, 763 26 Luhačovice, Czech Republic
GPS: 49.1006°N, 17.7697°E
Google Maps: https://maps.app.goo.gl/WH2CKhTydtDx9EBe7

Як дістатися:
- Автомобілем: найзручніший варіант, безкоштовна парковка на території
- З Праги: автобус RegioJet або FlixBus до Luhačovice (3.5 год), далі 5 хвилин таксі
- З Brno: автобус або авто ~1.5 год
- Найближча залізнична станція: Luhačovice (5 хв від кемпінгу)
- Найближче летовище: Brno-Tuřany (BRQ) — 100 км
- Трансфер: можемо допомогти організувати, вартість за домовленістю`,
    category: 'logistics',
  },
  {
    topic: 'Тварини / домашні улюбленці',
    keywords: 'тварини, пес, собака, кіт, dog, cat, pet, zvíře, pes, kočka, animal, haustier, hund',
    content: `Тварини вітаються! Правила:
- Собаки, коти та інші домашні тварини допускаються
- Вартість: 50 Kč за тварину за ніч
- Тварини мають бути на повідку на території
- Прибирання за тваринами — відповідальність гостя
- У будівлях D/F тварини за попереднім узгодженням
- У tiny houses — за попереднім узгодженням`,
    category: 'rules',
  },
  {
    topic: 'WiFi / інтернет',
    keywords: 'wifi, internet, wi-fi, připojení, heslo, password, wlan',
    content: `WiFi доступний на всій території кемпінгу безкоштовно.
Мережа: ALiSiO_Guest
Пароль: ALiSiO2026!
Зверніть увагу: сигнал найсильніший біля рецепції та ресторану. На віддалених кемпінгових ділянках сигнал може бути слабшим.`,
    category: 'services',
  },
  {
    topic: 'Ресторан / харчування на території',
    keywords: 'ресторан, restaurant, restaurace, jídlo, food, bar, menu, jídelníček, pivo, beer, večeře, dinner, oběd, lunch, kavárna, café',
    content: `На території є ресторан "Carlsbad Restaurant":
- Працює щодня в сезон (травень-вересень)
- Чеська та міжнародна кухня
- Сніданки для гостей: 150 Kč (дорослий), 120 Kč (дитина) — замовляти заздалегідь
- Комплексний обід/вечеря: 200 Kč/особа — тільки для груп від 15 осіб
- Тераса з видом на річку
- Beer garden з крафтовим пивом`,
    category: 'services',
  },
  {
    topic: 'Check-in / check-out / рецепція',
    keywords: 'check-in, check-out, приїзд, виїзд, příjezd, odjezd, recepce, reception, рецепція, klíče, keys, ключі, early, late, ranní, pozdní',
    content: `Check-in: від 14:00
Check-out: до 11:00
Рецепція: працює 08:00–20:00 в сезон
- Ранній заїзд або пізній виїзд — за попереднім узгодженням і за наявності вільних місць
- При заїзді потрібен паспорт або ID для реєстрації (Ubyport)
- Якщо гість приїжджає після 20:00 — просимо повідомити заздалегідь`,
    category: 'rules',
  },
  {
    topic: 'Активності / що робити поруч',
    keywords: 'activities, aktivity, co dělat, what to do, výlety, hiking, túra, pěší, kolo, bike, bazén, pool, wellness, spa, lázně, sport, attractions',
    content: `Поруч з кемпінгом:
- Luhačovice — відомий курорт з мінеральними джерелами (5 хв)
- Wellness & Spa центри в місті
- Пішохідні маршрути в Білих Карпатах
- Велосипедні доріжки (прокат доступний)
- Дитячий майданчик на території кемпінгу
- Волейбольний майданчик
- Настільний теніс
- Річка поряд (НЕ рибалка — у нас немає рибалки!)
- Зоопарк Zlín (30 хв)
- Замки та палаци в околицях`,
    category: 'activities',
  },
];

const insert = db.prepare(`
  INSERT INTO crm_knowledge_base (organization_id, topic, keywords, content, category)
  VALUES (?, ?, ?, ?, ?)
`);

let count = 0;
for (const a of articles) {
  // Check if exists
  const existing = db.prepare('SELECT id FROM crm_knowledge_base WHERE topic = ?').get(a.topic);
  if (!existing) {
    insert.run(org.id, a.topic, a.keywords, a.content, a.category);
    count++;
  }
}

console.log(`Seeded ${count} knowledge articles (${articles.length - count} already existed)`);
const total = db.prepare('SELECT COUNT(*) as c FROM crm_knowledge_base').get();
console.log(`Total articles in DB: ${total.c}`);
