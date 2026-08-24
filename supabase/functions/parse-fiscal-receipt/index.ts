const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type UnknownRecord = Record<string, unknown>;

function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9а-я]/giu, "");
}

function findDeep(source: unknown, keys: string[]): unknown {
  const wanted = new Set(keys.map(normalizeKey));
  const visited = new Set<unknown>();

  function visit(value: unknown): unknown {
    if (!value || typeof value !== "object" || visited.has(value)) return undefined;
    visited.add(value);

    for (const [key, item] of Object.entries(value as UnknownRecord)) {
      if (wanted.has(normalizeKey(key)) && item !== null && item !== "") return item;
    }

    for (const item of Object.values(value as UnknownRecord)) {
      const found = visit(item);
      if (found !== undefined) return found;
    }

    return undefined;
  }

  return visit(source);
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#39;": "'",
    "&lt;": "<", "&gt;": ">", "&#x2F;": "/",
  };

  let result = value;
  for (const [entity, replacement] of Object.entries(named)) {
    result = result.replaceAll(entity, replacement);
  }

  result = result.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(Number(code))
  );
  result = result.replace(/&#x([0-9a-f]+);/gi, (_, code) =>
    String.fromCharCode(parseInt(code, 16))
  );

  return result;
}

function stripTags(value: string): string {
  return decodeEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:div|p|tr|li|h\d|td|th)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim()
  );
}

function parseNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.abs(value);

  if (value && typeof value === "object") {
    const record = value as UnknownRecord;
    const nested = record.amount ?? record.value ?? record.total;
    if (nested !== undefined) return parseNumber(nested);
  }

  let text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return 0;

  if (text.includes(",") && text.includes(".")) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  }

  text = text.replace(/[^0-9.-]/g, "");
  const result = Number(text);
  return Number.isFinite(result) ? Math.abs(result) : 0;
}

function parseDate(value: unknown): { date: string; dateTime: string } {
  const text = String(value ?? "").trim();
  if (!text) return { date: "", dateTime: "" };

  const reverse = text.match(
    /(\d{1,2})[./-](\d{1,2})[./-](20\d{2})[.,]?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );

  if (reverse) {
    const date = `${reverse[3]}-${reverse[2].padStart(2, "0")}-${reverse[1].padStart(2, "0")}`;
    const time = reverse[4]
      ? `${reverse[4].padStart(2, "0")}:${reverse[5]}${reverse[6] ? `:${reverse[6]}` : ""}`
      : "";
    return { date, dateTime: time ? `${date} ${time}` : date };
  }

  const direct = text.match(
    /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );

  if (direct) {
    const date = `${direct[1]}-${direct[2].padStart(2, "0")}-${direct[3].padStart(2, "0")}`;
    const time = direct[4]
      ? `${direct[4].padStart(2, "0")}:${direct[5]}${direct[6] ? `:${direct[6]}` : ""}`
      : "";
    return { date, dateTime: time ? `${date} ${time}` : date };
  }

  return { date: "", dateTime: text };
}

function normalizeLabel(value: string): string {
  return stripTags(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function extractHtmlLabelValue(
  html: string,
  possibleLabels: string[],
): string {
  const wanted = new Set(possibleLabels.map(normalizeLabel));

  // Pattern used by the Serbian fiscal verification page:
  // label and value are usually consecutive block elements.
  const blocks = [...html.matchAll(
    /<(?:div|p|span|label|strong|b|td|th)[^>]*>([\s\S]*?)<\/(?:div|p|span|label|strong|b|td|th)>/gi,
  )].map((match) => stripTags(match[1])).filter(Boolean);

  for (let i = 0; i < blocks.length; i++) {
    if (!wanted.has(normalizeLabel(blocks[i]))) continue;

    for (let j = i + 1; j < Math.min(blocks.length, i + 5); j++) {
      const candidate = blocks[j].trim();
      if (!candidate || wanted.has(normalizeLabel(candidate))) continue;
      return candidate;
    }
  }

  // More direct fallback when label and value are inside neighboring tags.
  for (const label of possibleLabels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `>${escaped}\\s*<[^>]+>[\\s\\S]{0,300}?<[^>]+>\\s*([^<]{1,250})\\s*<`,
      "i",
    );
    const match = html.match(regex);
    if (match?.[1]) return stripTags(match[1]);
  }

  return "";
}

function extractTextLabelValue(
  text: string,
  possibleLabels: string[],
): string {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const wanted = new Set(possibleLabels.map(normalizeLabel));

  for (let i = 0; i < lines.length; i++) {
    if (!wanted.has(normalizeLabel(lines[i]))) continue;
    const next = lines[i + 1]?.trim();
    if (next) return next;
  }

  return "";
}

function getField(
  payload: unknown,
  html: string,
  text: string,
  objectKeys: string[],
  labels: string[],
): unknown {
  return (
    findDeep(payload, objectKeys) ??
    extractHtmlLabelValue(html, labels) ??
    extractTextLabelValue(text, labels)
  );
}

function parseTableRows(html: string): UnknownRecord[] {
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)];
  let bestTable = "";

  for (const table of tables) {
    const text = normalizeLabel(table[1]);
    if (
      text.includes(normalizeLabel("Назив")) &&
      text.includes(normalizeLabel("Количина")) &&
      (
        text.includes(normalizeLabel("Укупна цена")) ||
        text.includes(normalizeLabel("Jed. cena sa PDV"))
      )
    ) {
      bestTable = table[1];
      break;
    }
  }

  if (!bestTable) return [];

  const rows = [...bestTable.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const result: UnknownRecord[] = [];

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => stripTags(cell[1]).trim());

    if (cells.length < 4) continue;
    if (
      normalizeLabel(cells[0]) === normalizeLabel("Назив") ||
      normalizeLabel(cells[0]) === normalizeLabel("Naziv")
    ) continue;

    const name = cells[0];
    const quantity = parseNumber(cells[1]);
    const unitPrice = parseNumber(cells[2]);
    const total = parseNumber(cells[3]);
    const base = parseNumber(cells[4]);
    const tax = parseNumber(cells[5]);
    const taxRate = cells[6] ?? "";

    if (!name || (!quantity && !unitPrice && !total)) continue;

    result.push({
      name,
      quantity,
      unitPrice,
      total,
      base,
      tax,
      taxRate,
    });
  }

  return result;
}


function extractJournalText(html: string, fullText: string): string {
  const preBlocks = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)]
    .map((match) => stripTags(match[1]))
    .filter(Boolean);

  if (preBlocks.length) {
    const fiscal = preBlocks.find((block) =>
      /ФИСКАЛНИ РАЧУН|FISKALNI RAČUN|FISKALNI RACUN/i.test(block)
    );
    if (fiscal) return fiscal;
    return preBlocks.join("\n");
  }

  const marker = fullText.search(/Журнал|Žurnal|Zurnal/i);
  return marker >= 0 ? fullText.slice(marker) : fullText;
}

function matchFirst(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function parseJournalItems(journal: string): UnknownRecord[] {
  const lines = journal
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const items: UnknownRecord[] = [];
  const start = lines.findIndex((line) => /^Артикли$|^Artikli$/i.test(line));
  if (start < 0) return items;

  for (let i = start + 1; i < lines.length - 1; i++) {
    const nameLine = lines[i];

    if (
      /Укупан износ|Ukupan iznos|Готовина|Gotovina|Картица|Kartica|Порез|Porez|ПФР време|PFR vreme/i.test(nameLine)
    ) break;

    if (
      /^[-=]+$/.test(nameLine) ||
      /Назив\s+Цена|Naziv\s+Cena/i.test(nameLine)
    ) continue;

    const numericLine = lines[i + 1];
    const numbers = numericLine?.match(
      /^\s*([0-9][0-9.\s]*,[0-9]{2}|[0-9]+(?:\.[0-9]{2})?)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9][0-9.\s]*,[0-9]{2}|[0-9]+(?:\.[0-9]{2})?)\s*$/
    );

    if (!numbers) continue;

    const cleanName = nameLine
      .replace(/\s*\([A-ZА-Я]\)\s*$/u, "")
      .trim();

    items.push({
      name: cleanName,
      unitPrice: parseNumber(numbers[1]),
      quantity: parseNumber(numbers[2]),
      total: parseNumber(numbers[3]),
      base: 0,
      tax: 0,
      taxRate: "",
    });

    i += 1;
  }

  return items;
}

function parseJournal(html: string, fullText: string): UnknownRecord {
  const journal = extractJournalText(html, fullText);

  const merchantTaxId = matchFirst(journal, [
    /(?:^|\n)\s*(\d{9})\s*(?:\n|$)/m,
    /ПИБ\s*[:\-]?\s*(\d{9})/i,
    /PIB\s*[:\-]?\s*(\d{9})/i,
  ]);

  const merchantCompany = matchFirst(journal, [
    /Предузеће\s*[:\-]?\s*([^\n]+)/i,
    /Preduzeće\s*[:\-]?\s*([^\n]+)/i,
    /Preduzece\s*[:\-]?\s*([^\n]+)/i,
  ]);

  const merchantPlace = matchFirst(journal, [
    /Место продаје\s*[:\-]?\s*([^\n]+)/i,
    /Име продајног места\s*[:\-]?\s*([^\n]+)/i,
    /Mesto prodaje\s*[:\-]?\s*([^\n]+)/i,
    /Ime prodajnog mesta\s*[:\-]?\s*([^\n]+)/i,
  ]);

  const totalAmount = parseNumber(matchFirst(journal, [
    /Укупан износ\s*[:\-]?\s*([0-9][0-9.\s]*,[0-9]{2})/i,
    /Ukupan iznos\s*[:\-]?\s*([0-9][0-9.\s]*,[0-9]{2})/i,
    /За уплату\s*[:\-]?\s*([0-9][0-9.\s]*,[0-9]{2})/i,
    /Za uplatu\s*[:\-]?\s*([0-9][0-9.\s]*,[0-9]{2})/i,
  ]));

  const totalTax = parseNumber(matchFirst(journal, [
    /Укупан износ пореза\s*[:\-]?\s*([0-9][0-9.\s]*,[0-9]{2})/i,
    /Ukupan iznos poreza\s*[:\-]?\s*([0-9][0-9.\s]*,[0-9]{2})/i,
    /Порез укупно\s*[:\-]?\s*([0-9][0-9.\s]*,[0-9]{2})/i,
    /Porez ukupno\s*[:\-]?\s*([0-9][0-9.\s]*,[0-9]{2})/i,
  ]));

  const dateTimeRaw = matchFirst(journal, [
    /ПФР време\s*[:\-]?\s*([^\n]+)/i,
    /PFR vreme\s*[:\-]?\s*([^\n]+)/i,
    /Време на безбедносном елементу\s*[:\-]?\s*([^\n]+)/i,
    /Vreme na bezbednosnom elementu\s*[:\-]?\s*([^\n]+)/i,
  ]);

  const invoiceNumber = matchFirst(journal, [
    /ПФР број рачуна\s*[:\-]?\s*([A-ZА-Я0-9\-]+)/iu,
    /PFR broj računa\s*[:\-]?\s*([A-Z0-9\-]+)/i,
    /Број рачуна\s*[:\-]?\s*([A-ZА-Я0-9\-]+)/iu,
    /Broj računa\s*[:\-]?\s*([A-Z0-9\-]+)/i,
  ]);

  const paymentMethod = matchFirst(journal, [
    /Начин плаћања\s*[:\-]?\s*([^\n]+)/i,
    /Način plaćanja\s*[:\-]?\s*([^\n]+)/i,
    /Nacin placanja\s*[:\-]?\s*([^\n]+)/i,
    /(Готовина|Gotovina|Картица|Kartica|Чек|Ček|Prenos na račun|Пренос на рачун)/i,
  ]);

  const address = matchFirst(journal, [
    /Адреса\s*[:\-]?\s*([^\n]+)/i,
    /Adresa\s*[:\-]?\s*([^\n]+)/i,
  ]);

  const municipality = matchFirst(journal, [
    /Општина\s*[:\-]?\s*([^\n]+)/i,
    /Opština\s*[:\-]?\s*([^\n]+)/i,
    /Opstina\s*[:\-]?\s*([^\n]+)/i,
  ]);

  const dateData = parseDate(dateTimeRaw);

  return {
    merchantTaxId,
    merchantCompany,
    merchantPlace,
    totalAmount,
    totalTax,
    date: dateData.date,
    dateTime: dateData.dateTime,
    invoiceNumber,
    paymentMethod,
    address,
    municipality,
    items: parseJournalItems(journal),
    journal,
  };
}

function isAllowedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    return (
      host === "suf.purs.gov.rs" ||
      host.endsWith(".suf.purs.gov.rs") ||
      host === "purs.gov.rs" ||
      host.endsWith(".purs.gov.rs")
    );
  } catch {
    return false;
  }
}

// Serbian Cyrillic text is preserved as UTF-8; client normalizes only for categorization.
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const qrUrl = String(body?.qrUrl ?? "").trim();

    if (!isAllowedUrl(qrUrl)) {
      return new Response(
        JSON.stringify({
          error: "Dozvoljeni su samo fiskalni linkovi Poreske uprave.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
        },
      );
    }

    const response = await fetch(qrUrl, {
      method: "GET",
      headers: {
        "Accept-Language": "sr-Cyrl-RS,sr;q=0.9,en;q=0.5",
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 MoneyMate/1.3.2",
      },
      redirect: "follow",
    });

    const contentType = response.headers.get("content-type") ?? "";
    const raw = await response.text();

    if (!response.ok) {
      throw new Error(`Poreska uprava je vratila HTTP ${response.status}.`);
    }

    let payload: unknown = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {};
    }

    const text = stripTags(raw);
    const journalData = parseJournal(raw, text);

    const merchantTaxIdFromPage = String(getField(
      payload, raw, text,
      ["tin", "taxId", "pib", "merchantTaxId", "taxpayerId"],
      ["ПИБ", "PIB"],
    ) ?? "");

    const merchantNameFromPage = String(getField(
      payload, raw, text,
      ["businessName", "companyName", "merchantName", "sellerName",
       "traderName", "locationName", "shopName", "legalName"],
      [
        "Име продајног места", "Ime prodajnog mesta",
        "Назив обвезника", "Naziv obveznika",
        "Пословно име", "Poslovno ime",
      ],
    ) ?? "");

    const addressFromPage = String(getField(
      payload, raw, text,
      ["address", "businessAddress", "locationAddress", "shopAddress"],
      ["Адреса", "Adresa", "Адреса продајног места", "Adresa prodajnog mesta"],
    ) ?? "");

    const cityFromPage = String(getField(
      payload, raw, text,
      ["city", "town", "place"],
      ["Град", "Grad"],
    ) ?? "");

    const municipalityFromPage = String(getField(
      payload, raw, text,
      ["municipality"],
      ["Општина", "Opština", "Opstina"],
    ) ?? "");

    const totalAmountValueFromPage = getField(
      payload, raw, text,
      ["totalAmount", "invoiceTotal", "grandTotal", "totalPrice",
       "totalToPay", "paymentAmount", "amount", "total"],
      ["Укупан износ", "Ukupan iznos", "Укупно", "Ukupno"],
    );

    const issuedAtFromPage = getField(
      payload, raw, text,
      ["dateAndTimeOfIssue", "invoiceDate", "issueDate",
       "dateTime", "createdAt", "issuedAt", "date"],
      [
        "ПФР време (временска зона сервера)", "ПФР време",
        "PFR vreme (vremenska zona servera)", "PFR vreme",
        "Датум и време издавања", "Datum i vreme izdavanja",
      ],
    );

    const invoiceNumberFromPage = String(getField(
      payload, raw, text,
      ["invoiceNumber", "receiptNumber", "documentNumber",
       "invoiceId", "requestId", "verificationCode"],
      [
        "Затражио - Потписао - Бројач",
        "Zatražio - Potpisao - Brojač",
        "Zatrazio - Potpisao - Brojac",
        "Број рачуна", "Broj računa", "PFR broj računa",
      ],
    ) ?? "");

    const merchantTaxId =
      merchantTaxIdFromPage || String(journalData.merchantTaxId || "");

    const merchantName =
      merchantNameFromPage ||
      String(journalData.merchantPlace || "") ||
      String(journalData.merchantCompany || "");

    const address =
      addressFromPage || String(journalData.address || "");

    const city =
      cityFromPage || String(journalData.city || "");

    const municipality =
      municipalityFromPage || String(journalData.municipality || "");

    const totalAmountValue =
      parseNumber(totalAmountValueFromPage) > 0
        ? totalAmountValueFromPage
        : journalData.totalAmount;

    const issuedAt =
      issuedAtFromPage || journalData.dateTime || journalData.date;

    const invoiceNumber =
      invoiceNumberFromPage || String(journalData.invoiceNumber || "");

    const dateData = parseDate(issuedAt);

    const transactionType = String(getField(
      payload, raw, text,
      ["transactionType", "type"],
      ["Врста", "Vrsta"],
    ) ?? "");

    const transactionCounter = String(getField(
      payload, raw, text,
      ["transactionCounter"],
      ["Бројач по врсти трансакције", "Brojač po vrsti transakcije"],
    ) ?? "");

    const totalCounter = String(getField(
      payload, raw, text,
      ["totalCounter"],
      ["Бројач укупног броја", "Brojač ukupnog broja"],
    ) ?? "");

    const tableItems = parseTableRows(raw);
    const journalItems = Array.isArray(journalData.items)
      ? journalData.items as UnknownRecord[]
      : [];
    const items = tableItems.length ? tableItems : journalItems;

    const taxFromItems = items.reduce(
      (sum, item) => sum + Number(item.tax || 0),
      0,
    );
    const totalTax = taxFromItems > 0
      ? taxFromItems
      : Number(journalData.totalTax || 0);

    const receipt = {
      merchantName,
      merchantCompany: String(journalData.merchantCompany || ""),
      merchantTaxId,
      address,
      city,
      municipality,
      totalAmount: parseNumber(totalAmountValue),
      totalTax,
      date: dateData.date,
      dateTime: dateData.dateTime,
      invoiceNumber,
      transactionType,
      transactionCounter,
      totalCounter,
      paymentMethod: "",
      currency: "RSD",
      items,
      qrUrl,
      sourceContentType: contentType,
      parserVersion: "serbian-fiscal-universal-1.4.0",
      dataSource: tableItems.length ? "specification-table" : "journal-fallback",
    };

    return new Response(
      JSON.stringify({ receipt }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error
          ? error.message
          : "Greška pri čitanju fiskalnog računa.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  }
});
