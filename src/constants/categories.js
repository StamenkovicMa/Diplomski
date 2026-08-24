export const EXPENSE_GROUPS = [
  {title:'Hrana i piće', icon:'🍽️', items:['Namirnice','Restorani','Fast food','Kafa','Dostava hrane','Pekara','Slatkiši','Piće']},
  {title:'Prevoz i vozilo', icon:'🚗', items:['Gorivo','Parking','Putarina','Servis automobila','Registracija vozila','Gume','Taksi','Autobus','Voz','Avion','Rent a car']},
  {title:'Stanovanje i računi', icon:'🏠', items:['Kirija','Stambeni kredit','Struja','Voda','Gas','Grejanje','Internet','Telefon','Komunalije','Nameštaj','Kućni aparati','Održavanje stana']},
  {title:'Kupovina', icon:'🛍️', items:['Odeća','Obuća','Kozmetika','Tehnika','Mobilni telefon','Računar','Pokloni','Knjige','Kućne potrepštine']},
  {title:'Zdravlje i nega', icon:'❤️', items:['Lekovi','Lekarski pregled','Stomatolog','Privatna klinika','Suplementi','Teretana','Wellness','Frizer','Lična nega']},
  {title:'Zabava i pretplate', icon:'🎬', items:['Bioskop','Pozorište','Koncert','Video igre','Steam','PlayStation','Netflix','Spotify','YouTube Premium','Izlasci','Hobi']},
  {title:'Porodica i ljubimci', icon:'👨‍👩‍👧', items:['Vrtić','Škola','Igračke','Dečja garderoba','Dečje aktivnosti','Hrana za ljubimce','Veterinar','Oprema za ljubimce','Higijena ljubimaca']},
  {title:'Obrazovanje i posao', icon:'🎓', items:['Kursevi','Fakultet','Školarina','Udžbenici','Sertifikati','Poslovni troškovi','Poslovna oprema','Kancelarijski materijal','Poslovna putovanja']},
  {title:'Putovanja', icon:'✈️', items:['Hotel','Apartman','Putne karte','Hrana na putu','Turističke aktivnosti','Putno osiguranje','Suveniri']},
  {title:'Finansije i obaveze', icon:'💳', items:['Bankarske naknade','Kamata na kredit','Porez','Kazne','Osiguranje vozila','Životno osiguranje','Zdravstveno osiguranje','Rata kredita','Vraćanje pozajmice']},
  {title:'Ostalo', icon:'•••', items:['Donacije','Humanitarna pomoć','Neočekivani troškovi','Ostali troškovi']},
];

export const INCOME_GROUPS = [
  {title:'Zarada od posla', icon:'💼', items:['Plata','Dodatna plata','Bonus','Prekovremeni rad','Provizija','Bakšiš','Dnevnica','Regres','Trinaesta plata']},
  {title:'Samostalni rad', icon:'💻', items:['Freelance','Honorari','Privatni posao','Konsultantske usluge','Autorska prava','Online posao','YouTube / društvene mreže','Prodaja digitalnih proizvoda']},
  {title:'Prodaja i izdavanje', icon:'🏷️', items:['Prodaja proizvoda','Prodaja stvari','Prodaja vozila','Prodaja nekretnine','Izdavanje nekretnine','Izdavanje vozila','Izdavanje opreme']},
  {title:'Investicije i štednja', icon:'📈', items:['Dividende','Kamata na štednju','Dobit od investicija','Kriptovalute','Prodaja akcija','Prihod od fondova','Obveznice']},
  {title:'Povraćaji i naknade', icon:'↩️', items:['Povraćaj novca','Povraćaj poreza','Refundacija troška','Osiguravajuća naknada','Naknada štete','Povraćaj depozita']},
  {title:'Državna i porodična primanja', icon:'🤝', items:['Stipendija','Penzija','Socijalna pomoć','Alimentacija','Dečji dodatak','Naknada za nezaposlene','Porodiljska naknada']},
  {title:'Pokloni i jednokratni prihodi', icon:'🎁', items:['Poklon','Nasledstvo','Pozajmica primljena','Nagrada','Dobitak','Prodaja poklona','Ostali prihodi']},
];

export const EXPENSE_CATEGORIES = EXPENSE_GROUPS.flatMap(group=>group.items);
export const INCOME_CATEGORIES = INCOME_GROUPS.flatMap(group=>group.items);
export const CATEGORIES = [...EXPENSE_CATEGORIES,...INCOME_CATEGORIES];

export const CATEGORY_ICONS = {
  'Namirnice':'🛒','Restorani':'🍴','Fast food':'🍔','Kafa':'☕','Dostava hrane':'🛵','Pekara':'🥐','Slatkiši':'🍰','Piće':'🥤',
  'Gorivo':'⛽','Parking':'🅿️','Putarina':'🛣️','Servis automobila':'🔧','Registracija vozila':'📄','Gume':'🛞','Taksi':'🚕','Autobus':'🚌','Voz':'🚆','Avion':'✈️','Rent a car':'🚙',
  'Kirija':'🔑','Stambeni kredit':'🏦','Struja':'⚡','Voda':'💧','Gas':'🔥','Grejanje':'♨️','Internet':'🌐','Telefon':'📱','Komunalije':'🧾','Nameštaj':'🛋️','Kućni aparati':'🔌','Održavanje stana':'🧰',
  'Odeća':'👕','Obuća':'👟','Kozmetika':'💄','Tehnika':'💻','Mobilni telefon':'📲','Računar':'🖥️','Pokloni':'🎁','Knjige':'📚','Kućne potrepštine':'🧹',
  'Lekovi':'💊','Lekarski pregled':'🩺','Stomatolog':'🦷','Privatna klinika':'🏥','Suplementi':'🧴','Teretana':'🏋️','Wellness':'🧖','Frizer':'✂️','Lična nega':'🧼',
  'Bioskop':'🎥','Pozorište':'🎭','Koncert':'🎵','Video igre':'🎮','Steam':'🕹️','PlayStation':'🎮','Netflix':'📺','Spotify':'🎧','YouTube Premium':'▶️','Izlasci':'🥂','Hobi':'🎨',
  'Vrtić':'🧸','Škola':'🏫','Igračke':'🪁','Dečja garderoba':'🧒','Dečje aktivnosti':'⚽','Hrana za ljubimce':'🐕','Veterinar':'🐾','Oprema za ljubimce':'🦴','Higijena ljubimaca':'🛁',
  'Kursevi':'🧑‍🏫','Fakultet':'🎓','Školarina':'💼','Udžbenici':'📖','Sertifikati':'📜','Poslovni troškovi':'💼','Poslovna oprema':'🖨️','Kancelarijski materijal':'✏️','Poslovna putovanja':'🧳',
  'Hotel':'🏨','Apartman':'🏡','Putne karte':'🎫','Hrana na putu':'🥪','Turističke aktivnosti':'🗺️','Putno osiguranje':'🛡️','Suveniri':'🗿',
  'Bankarske naknade':'🏦','Kamata na kredit':'📉','Porez':'🏛️','Kazne':'⚠️','Osiguranje vozila':'🚘','Životno osiguranje':'❤️','Zdravstveno osiguranje':'🏥','Rata kredita':'💳','Vraćanje pozajmice':'🤝',
  'Donacije':'🤲','Humanitarna pomoć':'❤️','Neočekivani troškovi':'⚡','Ostali troškovi':'•••',
  'Plata':'💼','Dodatna plata':'💵','Bonus':'🎉','Prekovremeni rad':'⏱️','Provizija':'📊','Bakšiš':'🪙','Dnevnica':'📅','Regres':'🏖️','Trinaesta plata':'1️⃣3️⃣',
  'Freelance':'💻','Honorari':'🧑‍💻','Privatni posao':'🏪','Konsultantske usluge':'🗣️','Autorska prava':'©️','Online posao':'🌐','YouTube / društvene mreže':'▶️','Prodaja digitalnih proizvoda':'📦',
  'Prodaja proizvoda':'📦','Prodaja stvari':'🏷️','Prodaja vozila':'🚗','Prodaja nekretnine':'🏠','Izdavanje nekretnine':'🏘️','Izdavanje vozila':'🚙','Izdavanje opreme':'🧰',
  'Dividende':'📈','Kamata na štednju':'🏦','Dobit od investicija':'💹','Kriptovalute':'₿','Prodaja akcija':'📊','Prihod od fondova':'📉','Obveznice':'📜',
  'Povraćaj novca':'↩️','Povraćaj poreza':'🧾','Refundacija troška':'💸','Osiguravajuća naknada':'🛡️','Naknada štete':'🔧','Povraćaj depozita':'🔐',
  'Stipendija':'📚','Penzija':'👤','Socijalna pomoć':'🤝','Alimentacija':'👨‍👩‍👧','Dečji dodatak':'🧒','Naknada za nezaposlene':'📋','Porodiljska naknada':'👶',
  'Poklon':'🎁','Nasledstvo':'📜','Pozajmica primljena':'🤲','Nagrada':'🏆','Dobitak':'🎯','Prodaja poklona':'🎀','Ostali prihodi':'•••'
};
export const CURRENCIES = [
  {code:'RSD',symbol:'RSD',label:'Dinar',defaultRate:1},
  {code:'EUR',symbol:'€',label:'Evro',defaultRate:117.2},
  {code:'USD',symbol:'$',label:'Dolar',defaultRate:108.5},
];
export const DEFAULT_RATES = {RSD:1,EUR:117.2,USD:108.5};
