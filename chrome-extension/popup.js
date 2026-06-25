const DEFAULT_APP_URL = "http://localhost:3000";

let capturedData = {};
let existingDeal = null;

document.addEventListener("DOMContentLoaded", async () => {
  const saved = await chrome.storage.local.get(["appUrl"]);
  document.getElementById("appUrl").value = saved.appUrl || DEFAULT_APP_URL;

  document.getElementById("captureBtn").addEventListener("click", captureCurrentPage);
  document.getElementById("saveBtn").addEventListener("click", saveToPropertyPipeline);

  await captureCurrentPage();
});

async function captureCurrentPage() {
  setStatus("Capturing page...");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    setStatus("Could not find active tab.");
    return;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractListingDataFromPage
    });

    capturedData = results?.[0]?.result || {};
    renderData(capturedData);

    await checkExistingDeal();

    const unitCount = capturedData.unitInformation?.length || 0;

    if (existingDeal?.exists) {
      if (unitCount > 0) {
        setStatus(`Existing deal found. Found ${unitCount} unit(s). Click Update Deal.`);
      } else {
        setStatus("Existing deal found. Click Update Deal.");
      }
    } else {
      if (unitCount > 0) {
        setStatus(`New deal. Found ${unitCount} unit(s). Click Import Deal.`);
      } else {
        setStatus("New deal. Click Import Deal.");
      }
    }
  } catch (error) {
    console.error(error);
    setStatus("Capture failed. Try refreshing the listing page.");
  }
}

function renderData(data) {
  document.getElementById("address").value = data.address || "";
  document.getElementById("price").value = data.listPrice || "";
  document.getElementById("beds").value = data.beds || "";
  document.getElementById("baths").value = data.baths || "";
  document.getElementById("sqft").value = data.sqft || "";
  document.getElementById("mlsNumber").value = data.mlsNumber || "";
  document.getElementById("description").value = data.description || "";
  document.getElementById("sourceUrl").value = data.sourceUrl || "";

  renderUnitPreview(data.unitInformation || []);
}

async function checkExistingDeal() {
  existingDeal = null;

  const saveButton = document.getElementById("saveBtn");
  const appUrl = document.getElementById("appUrl").value.replace(/\/$/, "");
  const mlsNumber = document.getElementById("mlsNumber").value.trim();
  const sourceUrl = document.getElementById("sourceUrl").value.trim();

  saveButton.textContent = "Import Deal";

  if (!appUrl || (!mlsNumber && !sourceUrl)) {
    return;
  }

  const params = new URLSearchParams();

  if (mlsNumber) {
    params.set("mlsNumber", mlsNumber);
  }

  if (sourceUrl) {
    params.set("sourceUrl", sourceUrl);
  }

  try {
    const response = await fetch(
      `${appUrl}/api/listings/check-existing?${params.toString()}`
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.warn("Existing deal check failed:", result);
      return;
    }

    existingDeal = result;

    if (result.exists) {
      saveButton.textContent = "Update Deal";
    } else {
      saveButton.textContent = "Import Deal";
    }
  } catch (error) {
    console.warn("Existing deal check failed:", error);
  }
}

function renderUnitPreview(units) {
  const container = document.getElementById("unitPreview");

  if (!container) return;

  if (!units || units.length === 0) {
    container.innerHTML = `
      <div class="unit-preview-empty">
        No unit information found.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="unit-preview-list">
      ${units
        .map(
          (unit) => `
            <div class="unit-preview-item">
              <strong>Unit ${escapeHtml(unit.unitNumber || "")}</strong>
              <div>Floor: ${escapeHtml(unit.floorNumber || "")}</div>
              <div>Sq Ft: ${escapeHtml(unit.sqft || "")}</div>
              <div>Rooms: ${escapeHtml(unit.rooms || "")}</div>
              <div>Beds: ${escapeHtml(unit.bedrooms || "")}</div>
              <div>Baths: ${escapeHtml(unit.fullBaths || "")} full / ${escapeHtml(
                unit.halfBaths || ""
              )} half</div>
              <div>Rent: ${unit.rent ? "$" + escapeHtml(unit.rent) : ""}</div>
              <div>Lease Exp: ${escapeHtml(unit.leaseExpiration || "")}</div>
              <div>Appliances: ${escapeHtml(unit.appliancesFeatures || "")}</div>
              <div>Tenant Pays: ${escapeHtml(unit.tenantPays || "")}</div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

async function saveToPropertyPipeline() {
  const appUrl = document.getElementById("appUrl").value.replace(/\/$/, "");

  await chrome.storage.local.set({ appUrl });

  const payload = {
    source: "chrome_extension",
    sourceUrl: document.getElementById("sourceUrl").value,
    pageTitle: capturedData.pageTitle || "",

    address: document.getElementById("address").value,
    listPrice: document.getElementById("price").value,
    beds: document.getElementById("beds").value,
    baths: document.getElementById("baths").value,
    sqft: document.getElementById("sqft").value,
    mlsNumber: document.getElementById("mlsNumber").value,
    description: document.getElementById("description").value,

    propertyType: capturedData.propertyType || "",
    yearBuilt: capturedData.yearBuilt || "",
    lotSize: capturedData.lotSize || "",
    taxes: capturedData.taxes || "",
    hoa: capturedData.hoa || "",
    daysOnMarket: capturedData.daysOnMarket || "",
    parking: capturedData.parking || "",
    heating: capturedData.heating || "",
    cooling: capturedData.cooling || "",
    parcelNumber: capturedData.parcelNumber || "",

    grossIncome: capturedData.grossIncome || "",
    operatingExpenses: capturedData.operatingExpenses || "",
    netOperatingIncome: capturedData.netOperatingIncome || "",
    basement: capturedData.basement || "",
    roof: capturedData.roof || "",
    exterior: capturedData.exterior || "",
    zoning: capturedData.zoning || "",
    brokerRemarks: capturedData.brokerRemarks || "",
    listingAgentName: capturedData.listingAgentName || "",
    listingAgentPhone: capturedData.listingAgentPhone || "",

    unitInformation: capturedData.unitInformation || [],

    allExtractedFields: capturedData.allExtractedFields || {},
    rawImport: capturedData.rawText || ""
  };

  setStatus("Sending to Property Pipeline...");

  try {
    const response = await fetch(`${appUrl}/api/listings/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || `Import failed with status ${response.status}`);
    }

    setStatus(
      result.action === "updated"
        ? "Deal updated successfully. Opening deal..."
        : "Deal imported successfully. Opening deal..."
    );

    if (result.propertyId) {
      const dealUrl = `${appUrl}/properties/${result.propertyId}`;

      await chrome.tabs.create({
        url: dealUrl
      });
    } else {
      setStatus("Imported successfully, but no property ID was returned.");
    }
  } catch (error) {
    console.error(error);
    setStatus("Import failed. Check your app URL and API endpoint.");
  }
}

function setStatus(message) {
  document.getElementById("status").textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function extractListingDataFromPage() {
  const sourceUrl = window.location.href;
  const pageTitle = document.title || "";
  const rawText = document.body?.innerText || "";

  function cleanText(value) {
    return (value || "")
      .replace(/\s+/g, " ")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  function cleanMoney(value) {
    if (!value) return "";
    const match = String(value).match(/\$?\s*([\d,]+(?:\.\d+)?)/);
    return match ? match[1].replace(/,/g, "") : "";
  }

  function cleanNumber(value) {
    if (!value) return "";
    const match = String(value).match(/([\d,]+(?:\.\d+)?)/);
    return match ? match[1].replace(/,/g, "") : "";
  }

  function getMeta(name) {
    return (
      document.querySelector(`meta[property="${name}"]`)?.content ||
      document.querySelector(`meta[name="${name}"]`)?.content ||
      ""
    );
  }

  function firstMatch(patterns) {
    for (const pattern of patterns) {
      const match = rawText.match(pattern);
      if (match?.[1]) return cleanText(match[1]);
    }
    return "";
  }

  function parseJsonLd() {
    const results = [];
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];

    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent);

        if (Array.isArray(parsed)) {
          results.push(...parsed);
        } else if (parsed["@graph"] && Array.isArray(parsed["@graph"])) {
          results.push(...parsed["@graph"]);
        } else {
          results.push(parsed);
        }
      } catch {
        // Ignore broken JSON-LD
      }
    }

    return results;
  }

  function collectLabelValuePairs() {
    const pairs = {};

    function addPair(label, value) {
      label = cleanText(label);
      value = cleanText(value);

      if (!label || !value) return;
      if (label.length > 80) return;
      if (value.length > 500) return;
      if (label === value) return;

      const normalizedLabel = label
        .replace(/[:*]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      if (!pairs[normalizedLabel]) {
        pairs[normalizedLabel] = value;
      }
    }

    document.querySelectorAll("dt").forEach((dt) => {
      const dd = dt.nextElementSibling;
      if (dd) addPair(dt.innerText, dd.innerText);
    });

    document.querySelectorAll("tr").forEach((row) => {
      const cells = [...row.querySelectorAll("th, td")];
      if (cells.length >= 2) {
        addPair(cells[0].innerText, cells.slice(1).map((c) => c.innerText).join(" "));
      }
    });

    const possibleLabelSelectors = [
      "[class*='label']",
      "[class*='Label']",
      "[class*='key']",
      "[class*='Key']",
      "[class*='title']",
      "[class*='Title']",
      "[data-testid*='label']",
      "[aria-label]"
    ];

    document.querySelectorAll(possibleLabelSelectors.join(",")).forEach((el) => {
      const label = el.getAttribute("aria-label") || el.innerText;
      const parent = el.parentElement;

      if (!parent) return;

      const siblings = [...parent.children].filter((child) => child !== el);
      const value = siblings.map((s) => s.innerText).join(" ");

      addPair(label, value);
    });

    const lines = rawText
      .split("\n")
      .map(cleanText)
      .filter(Boolean);

    for (let i = 0; i < lines.length - 1; i++) {
      const label = lines[i];
      const value = lines[i + 1];

      const likelyLabel =
        /price|beds?|baths?|sq|square|year|built|lot|tax|hoa|mls|days|garage|parking|type|style|county|subdivision|school|heating|cooling|water|sewer|zoning|parcel|pin|apn|unit|remarks|description|income|expense|noi|basement|roof|exterior|agent|broker|phone/i.test(label);

      if (likelyLabel) {
        addPair(label, value);
      }
    }

    return pairs;
  }

  function getFromPairs(pairs, labels) {
    const pairEntries = Object.entries(pairs);

    for (const wanted of labels) {
      const found = pairEntries.find(([label]) =>
        label.toLowerCase().includes(wanted.toLowerCase())
      );

      if (found) return found[1];
    }

    return "";
  }

  function parseUnitInformation() {
    function makeUnitFromCells(cells) {
      cells = cells.map(cleanText).filter(Boolean);

      if (cells.length < 10) return null;

      const unit = {
        unitNumber: cells[0] || "",
        floorNumber: cells[1] || "",
        sqft: cells[2] || "",
        rooms: cells[3] || "",
        bedrooms: cells[4] || "",
        fullBaths: cells[5] || "",
        halfBaths: cells[6] || "",
        masterBedroomBath: cells[7] || "",
        securityDeposit: "",
        rent: "",
        leaseExpiration: "",
        appliancesFeatures: "",
        tenantPays: ""
      };

      const remaining = cells.slice(8);

      if (remaining.length >= 5 && /\d{1,2}\/\d{2,4}/.test(remaining[2])) {
        unit.securityDeposit = remaining[0] || "";
        unit.rent = remaining[1] || "";
        unit.leaseExpiration = remaining[2] || "";
        unit.appliancesFeatures = remaining[3] || "";
        unit.tenantPays = remaining.slice(4).join(", ");
      } else if (remaining.length >= 4 && /\d{1,2}\/\d{2,4}/.test(remaining[1])) {
        unit.rent = remaining[0] || "";
        unit.leaseExpiration = remaining[1] || "";
        unit.appliancesFeatures = remaining[2] || "";
        unit.tenantPays = remaining.slice(3).join(", ");
      }

      return unit;
    }

    const units = [];

    document.querySelectorAll("table").forEach((table) => {
      const tableText = cleanText(table.innerText);

      const looksLikeUnitTable =
        /Unit\s*#/i.test(tableText) &&
        /Floor\s*#/i.test(tableText) &&
        /Tenant Pays/i.test(tableText);

      if (!looksLikeUnitTable) return;

      const rows = [...table.querySelectorAll("tr")];

      rows.forEach((row) => {
        const cells = [...row.querySelectorAll("td, th")].map((cell) =>
          cleanText(cell.innerText)
        );

        const isHeaderRow =
          cells.some((cell) => /Unit\s*#/i.test(cell)) ||
          cells.some((cell) => /Floor\s*#/i.test(cell)) ||
          cells.some((cell) => /Tenant Pays/i.test(cell));

        if (isHeaderRow) return;

        const unit = makeUnitFromCells(cells);

        if (unit?.unitNumber) {
          units.push(unit);
        }
      });
    });

    if (units.length > 0) {
      return units;
    }

    const lines = rawText
      .split("\n")
      .map(cleanText)
      .filter(Boolean);

    const startIndex = lines.findIndex((line) => /Unit Information/i.test(line));
    if (startIndex === -1) return [];

    const tenantPaysIndex = lines.findIndex(
      (line, index) => index > startIndex && /Tenant Pays/i.test(line)
    );

    if (tenantPaysIndex === -1) return [];

    let i = tenantPaysIndex + 1;

    function isUnitStart(value) {
      return /^\d+[A-Z]?$/.test(value);
    }

    function isMoneyish(value) {
      return /^\$?[\d,]+(?:\.\d{2})?$/.test(value);
    }

    function isLeaseDate(value) {
      return /^\d{1,2}\/\d{2,4}$/.test(value);
    }

    while (i < lines.length) {
      if (!isUnitStart(lines[i])) {
        break;
      }

      const firstEight = lines.slice(i, i + 8);

      if (firstEight.length < 8) break;

      const unit = {
        unitNumber: firstEight[0] || "",
        floorNumber: firstEight[1] || "",
        sqft: firstEight[2] || "",
        rooms: firstEight[3] || "",
        bedrooms: firstEight[4] || "",
        fullBaths: firstEight[5] || "",
        halfBaths: firstEight[6] || "",
        masterBedroomBath: firstEight[7] || "",
        securityDeposit: "",
        rent: "",
        leaseExpiration: "",
        appliancesFeatures: "",
        tenantPays: ""
      };

      i += 8;

      if (isMoneyish(lines[i]) && isMoneyish(lines[i + 1]) && isLeaseDate(lines[i + 2])) {
        unit.securityDeposit = lines[i];
        unit.rent = lines[i + 1];
        unit.leaseExpiration = lines[i + 2];
        i += 3;
      } else if (isMoneyish(lines[i]) && isLeaseDate(lines[i + 1])) {
        unit.rent = lines[i];
        unit.leaseExpiration = lines[i + 1];
        i += 2;
      }

      unit.appliancesFeatures = lines[i] || "";
      unit.tenantPays = lines[i + 1] || "";
      i += 2;

      units.push(unit);

      if (units.length > 50) break;
    }

    return units;
  }

  const jsonLdItems = parseJsonLd();
  const labelValuePairs = collectLabelValuePairs();

  const jsonListing =
    jsonLdItems.find((item) => item.address || item.offers || item.floorSize || item.name) || {};

  const jsonAddress =
    typeof jsonListing.address === "string"
      ? jsonListing.address
      : jsonListing.address
        ? [
            jsonListing.address.streetAddress,
            jsonListing.address.addressLocality,
            jsonListing.address.addressRegion,
            jsonListing.address.postalCode
          ]
            .filter(Boolean)
            .join(", ")
        : "";

  const description =
    getMeta("description") ||
    getMeta("og:description") ||
    getFromPairs(labelValuePairs, ["remarks", "description", "public remarks"]) ||
    "";

  const address =
    jsonAddress ||
    getMeta("og:title") ||
    getFromPairs(labelValuePairs, ["address", "property address"]) ||
    firstMatch([
      /^(.+\b(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Place|Pl|Court|Ct|Boulevard|Blvd|Lane|Ln|Way|Terrace|Ter|Circle|Cir).*)$/im
    ]);

  const listPrice =
    jsonListing.offers?.price ||
    getMeta("product:price:amount") ||
    getFromPairs(labelValuePairs, ["list price", "price"]) ||
    firstMatch([
      /\$([\d,]{4,})/i,
      /List Price\s*\$?([\d,]+)/i,
      /Price\s*\$?([\d,]+)/i
    ]);

  const beds =
    getFromPairs(labelValuePairs, ["bedrooms", "beds", "bed"]) ||
    firstMatch([
      /(\d+(?:\.\d+)?)\s*(?:beds|bedrooms|bd)\b/i,
      /Beds?\s*(\d+(?:\.\d+)?)/i
    ]);

  const baths =
    getFromPairs(labelValuePairs, ["bathrooms", "baths", "bath"]) ||
    firstMatch([
      /(\d+(?:\.\d+)?)\s*(?:baths|bathrooms|ba)\b/i,
      /Baths?\s*(\d+(?:\.\d+)?)/i
    ]);

  const sqft =
    getFromPairs(labelValuePairs, ["living area", "square feet", "sqft", "sq ft"]) ||
    firstMatch([
      /([\d,]+)\s*(?:sq\.?\s*ft\.?|square feet|sqft)\b/i,
      /Living Area\s*([\d,]+)/i
    ]);

  const mlsNumber =
    getFromPairs(labelValuePairs, ["mls", "mls number", "listing id"]) ||
    firstMatch([
      /MLS(?:\s*#|\s*Number|\s*ID)?\s*[:#]?\s*([A-Z0-9-]+)/i,
      /Listing ID\s*[:#]?\s*([A-Z0-9-]+)/i
    ]);

  const propertyType = getFromPairs(labelValuePairs, ["property type", "type", "style"]);

  const yearBuilt =
    getFromPairs(labelValuePairs, ["year built", "built"]) ||
    firstMatch([
      /Year Built\s*[:\n]?\s*(\d{4})/i,
      /Built\s*[:\n]?\s*(\d{4})/i
    ]);

  const lotSize = getFromPairs(labelValuePairs, ["lot size", "lot dimensions", "acres"]);

  const taxes = getFromPairs(labelValuePairs, [
    "taxes",
    "tax amount",
    "property tax",
    "annual tax"
  ]);

  const hoa = getFromPairs(labelValuePairs, [
    "hoa",
    "association fee",
    "monthly assessment"
  ]);

  const daysOnMarket = getFromPairs(labelValuePairs, ["days on market", "dom"]);
  const parking = getFromPairs(labelValuePairs, ["parking", "garage"]);
  const heating = getFromPairs(labelValuePairs, ["heating", "heat"]);
  const cooling = getFromPairs(labelValuePairs, ["cooling", "air conditioning"]);
  const parcelNumber = getFromPairs(labelValuePairs, ["pin", "parcel", "apn", "tax id"]);

  const grossIncome = getFromPairs(labelValuePairs, [
    "gross income",
    "annual gross income",
    "total income",
    "gross rental income"
  ]);

  const operatingExpenses = getFromPairs(labelValuePairs, [
    "operating expenses",
    "annual expenses",
    "total expenses",
    "expenses"
  ]);

  const netOperatingIncome = getFromPairs(labelValuePairs, [
    "net operating income",
    "noi",
    "net income"
  ]);

  const basement = getFromPairs(labelValuePairs, [
    "basement",
    "basement description"
  ]);

  const roof = getFromPairs(labelValuePairs, [
    "roof",
    "roof type"
  ]);

  const exterior = getFromPairs(labelValuePairs, [
    "exterior",
    "exterior building type",
    "exterior features"
  ]);

  const zoning = getFromPairs(labelValuePairs, [
    "zoning",
    "zoning type"
  ]);

  const brokerRemarks = getFromPairs(labelValuePairs, [
    "broker remarks",
    "agent remarks",
    "private remarks",
    "additional remarks"
  ]);

  const listingAgentName = getFromPairs(labelValuePairs, [
    "listing agent",
    "list agent",
    "agent name",
    "broker name"
  ]);

  const listingAgentPhone = getFromPairs(labelValuePairs, [
    "listing agent phone",
    "agent phone",
    "broker phone",
    "phone"
  ]);

  const unitInformation = parseUnitInformation();

  return {
    sourceUrl,
    pageTitle,

    address: cleanText(address),
    listPrice: cleanMoney(listPrice),
    beds: cleanNumber(beds),
    baths: cleanNumber(baths),
    sqft: cleanNumber(sqft),
    mlsNumber: cleanText(mlsNumber),

    propertyType: cleanText(propertyType),
    yearBuilt: cleanNumber(yearBuilt),
    lotSize: cleanText(lotSize),
    taxes: cleanMoney(taxes),
    hoa: cleanMoney(hoa),
    daysOnMarket: cleanNumber(daysOnMarket),
    parking: cleanText(parking),
    heating: cleanText(heating),
    cooling: cleanText(cooling),
    parcelNumber: cleanText(parcelNumber),

    grossIncome: cleanMoney(grossIncome),
    operatingExpenses: cleanMoney(operatingExpenses),
    netOperatingIncome: cleanMoney(netOperatingIncome),
    basement: cleanText(basement),
    roof: cleanText(roof),
    exterior: cleanText(exterior),
    zoning: cleanText(zoning),
    brokerRemarks: cleanText(brokerRemarks),
    listingAgentName: cleanText(listingAgentName),
    listingAgentPhone: cleanText(listingAgentPhone),

    description: cleanText(description),

    unitInformation,

    allExtractedFields: labelValuePairs,
    rawText: rawText.slice(0, 30000)
  };
}