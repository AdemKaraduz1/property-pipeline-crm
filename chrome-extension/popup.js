const DEFAULT_APP_URL = "https://property-pipeline-crm.vercel.app";

let capturedData = {};
let existingDeal = null;

document.addEventListener("DOMContentLoaded", async () => {
  const saved = await chrome.storage.local.get(["appUrl"]);
  document.getElementById("appUrl").value =
    normalizeAppUrl(saved.appUrl || DEFAULT_APP_URL) || DEFAULT_APP_URL;

  document.getElementById("captureBtn").addEventListener("click", captureCurrentPage);
  document.getElementById("saveBtn").addEventListener("click", saveToPropertyPipeline);

  await captureCurrentPage();
});

function normalizeAppUrl(value) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) return "";

  try {
    const url = new URL(trimmedValue);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }

    return url.origin;
  } catch {
    return "";
  }
}

async function parseApiResponse(response) {
  const responseText = await response.text();

  try {
    return JSON.parse(responseText);
  } catch {
    return {
      success: false,
      message:
        responseText && !responseText.trimStart().startsWith("<")
          ? responseText
          : `The app returned an invalid response (${response.status}).`
    };
  }
}

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
  const appUrl = normalizeAppUrl(document.getElementById("appUrl").value);
  const mlsNumber = document.getElementById("mlsNumber").value.trim();
  const sourceUrl = document.getElementById("sourceUrl").value.trim();

  saveButton.textContent = "Import Deal";

  if (!appUrl) {
    setStatus("Enter a valid Property Pipeline app URL.");
    return;
  }

  document.getElementById("appUrl").value = appUrl;

  if (!mlsNumber && !sourceUrl) {
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

    const result = await parseApiResponse(response);

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
  const appUrlInput = document.getElementById("appUrl");
  const appUrl = normalizeAppUrl(appUrlInput.value);

  if (!appUrl) {
    setStatus("Import failed: enter a valid Property Pipeline app URL.");
    return;
  }

  appUrlInput.value = appUrl;

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

    const result = await parseApiResponse(response);

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
    setStatus(
      `Import failed: ${
        error instanceof Error
          ? error.message
          : "check your app URL and API endpoint."
      }`
    );
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
    function makeEmptyUnit() {
      return {
        unitNumber: "",
        floorNumber: "",
        sqft: "",
        rooms: "",
        bedrooms: "",
        fullBaths: "",
        halfBaths: "",
        masterBedroomBath: "",
        securityDeposit: "",
        rent: "",
        leaseExpiration: "",
        appliancesFeatures: "",
        tenantPays: ""
      };
    }

    function assignUnitField(unit, label, value) {
      const normalizedLabel = cleanText(label)
        .toLowerCase()
        .replace(/[#$.]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      if (!normalizedLabel) return;

      if (/^unit\b/.test(normalizedLabel)) {
        unit.unitNumber = value;
      } else if (/^floor\b/.test(normalizedLabel)) {
        unit.floorNumber = value;
      } else if (/^sq ft\b|square feet|sqft/.test(normalizedLabel)) {
        unit.sqft = value;
      } else if (/rooms/.test(normalizedLabel)) {
        unit.rooms = value;
      } else if (/bdrms|bedrooms|beds/.test(normalizedLabel)) {
        unit.bedrooms = value;
      } else if (/full baths/.test(normalizedLabel)) {
        unit.fullBaths = value;
      } else if (/half baths/.test(normalizedLabel)) {
        unit.halfBaths = value;
      } else if (/master bedroom bath/.test(normalizedLabel)) {
        unit.masterBedroomBath = value;
      } else if (/sec deposit|security deposit/.test(normalizedLabel)) {
        unit.securityDeposit = value;
      } else if (/^rent\b/.test(normalizedLabel)) {
        unit.rent = value;
      } else if (/lease exp/.test(normalizedLabel)) {
        unit.leaseExpiration = value;
      } else if (/appliances|features/.test(normalizedLabel)) {
        unit.appliancesFeatures = value;
      } else if (/tenant pays/.test(normalizedLabel)) {
        unit.tenantPays = value;
      }
    }

    function hasMeaningfulUnitData(unit) {
      return Boolean(
        unit.floorNumber ||
          unit.sqft ||
          unit.rooms ||
          unit.bedrooms ||
          unit.fullBaths ||
          unit.halfBaths ||
          unit.masterBedroomBath ||
          unit.securityDeposit ||
          unit.rent ||
          unit.leaseExpiration ||
          unit.appliancesFeatures ||
          unit.tenantPays
      );
    }

    function makeUnitsFromTransposedRows(rows) {
      const rowCells = rows
        .map((row) => [...row.querySelectorAll("td, th")].map((cell) => cleanText(cell.innerText)))
        .filter((cells) => cells.length >= 2);

      const hasUnitNumberRow = rowCells.some((cells) => /^Unit\s*#?$/i.test(cells[0]));
      const hasTenantPaysRow = rowCells.some((cells) => /Tenant Pays/i.test(cells[0]));
      const hasRentRow = rowCells.some((cells) => /^Rent\s*\$?$/i.test(cells[0]));

      if (!hasUnitNumberRow || (!hasTenantPaysRow && !hasRentRow)) {
        return [];
      }

      const maxColumnCount = Math.max(...rowCells.map((cells) => cells.length));
      const transposedUnits = [];

      for (let columnIndex = 1; columnIndex < maxColumnCount; columnIndex += 1) {
        const unit = makeEmptyUnit();

        rowCells.forEach((cells) => {
          assignUnitField(unit, cells[0], cleanText(cells[columnIndex] || ""));
        });

        if (unit.unitNumber && hasMeaningfulUnitData(unit)) {
          transposedUnits.push(unit);
        }
      }

      return transposedUnits;
    }

    function makeUnitsFromTransposedLines(lines, startIndex) {
      const unitFieldLabels = [
        /^Unit\s*#?$/i,
        /^Floor\s*#?$/i,
        /^Sq\.?\s*Ft\.?$/i,
        /^#?\s*Of\s*Rooms$/i,
        /^#?\s*Of\s*Bdrms$/i,
        /^#?\s*Full Baths$/i,
        /^#?\s*Half Baths$/i,
        /^Master Bedroom Bath$/i,
        /^Sec Deposit\s*\$?$/i,
        /^Rent\s*\$?$/i,
        /^Lease Exp Date/i,
        /^Appliances\/Features$/i,
        /^Tenant Pays$/i
      ];

      function isUnitFieldLabel(value) {
        return unitFieldLabels.some((pattern) => pattern.test(value));
      }

      const labelRows = [];

      for (let lineIndex = startIndex + 1; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];

        if (!isUnitFieldLabel(line)) continue;

        const nextLabelIndex = lines.findIndex(
          (candidate, candidateIndex) =>
            candidateIndex > lineIndex && isUnitFieldLabel(candidate)
        );
        const valueEndIndex = nextLabelIndex === -1 ? lines.length : nextLabelIndex;
        const values = lines.slice(lineIndex + 1, valueEndIndex);

        labelRows.push({
          label: line,
          values
        });

        if (/^Tenant Pays$/i.test(line)) break;
      }

      const unitNumberRow = labelRows.find((row) => /^Unit\s*#?$/i.test(row.label));

      if (!unitNumberRow) return [];

      const unitNumbers = unitNumberRow.values.filter((value) => /^\d+[A-Z]?$/.test(value));

      if (unitNumbers.length === 0) return [];

      const transposedUnits = unitNumbers.map((unitNumber) => ({
        ...makeEmptyUnit(),
        unitNumber
      }));

      labelRows.forEach((row) => {
        const values = row.values.slice(0, transposedUnits.length);
        const minimumAlignedValueCount = Math.max(1, transposedUnits.length - 1);

        if (
          !/^Unit\s*#?$/i.test(row.label) &&
          transposedUnits.length > 1 &&
          values.length < minimumAlignedValueCount
        ) {
          return;
        }

        values.forEach((value, unitIndex) => {
          assignUnitField(transposedUnits[unitIndex], row.label, value);
        });
      });

      return transposedUnits.filter(
        (unit) => unit.unitNumber && hasMeaningfulUnitData(unit)
      );
    }

    function makeUnitFromCells(cells) {
      const cleanedCells = cells.map(cleanText);

      if (cleanedCells.length >= 13) {
        return {
          unitNumber: cleanedCells[0] || "",
          floorNumber: cleanedCells[1] || "",
          sqft: cleanedCells[2] || "",
          rooms: cleanedCells[3] || "",
          bedrooms: cleanedCells[4] || "",
          fullBaths: cleanedCells[5] || "",
          halfBaths: cleanedCells[6] || "",
          masterBedroomBath: cleanedCells[7] || "",
          securityDeposit: cleanedCells[8] || "",
          rent: cleanedCells[9] || "",
          leaseExpiration: cleanedCells[10] || "",
          appliancesFeatures: cleanedCells[11] || "",
          tenantPays: cleanedCells.slice(12).filter(Boolean).join(", ")
        };
      }

      const compactCells = cleanedCells.filter(Boolean);

      if (compactCells.length < 10) return null;

      const unit = {
        unitNumber: compactCells[0] || "",
        floorNumber: compactCells[1] || "",
        sqft: compactCells[2] || "",
        rooms: compactCells[3] || "",
        bedrooms: compactCells[4] || "",
        fullBaths: compactCells[5] || "",
        halfBaths: compactCells[6] || "",
        masterBedroomBath: compactCells[7] || "",
        securityDeposit: "",
        rent: "",
        leaseExpiration: "",
        appliancesFeatures: "",
        tenantPays: ""
      };

      const remaining = compactCells.slice(8);

      if (remaining.length >= 5 && /^\d{1,2}\/\d{1,4}$/.test(remaining[2])) {
        unit.securityDeposit = remaining[0] || "";
        unit.rent = remaining[1] || "";
        unit.leaseExpiration = remaining[2] || "";
        unit.appliancesFeatures = remaining[3] || "";
        unit.tenantPays = remaining.slice(4).join(", ");
      } else if (
        remaining.length >= 4 &&
        /^\d{1,2}\/\d{1,4}$/.test(remaining[1])
      ) {
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
      const transposedUnits = makeUnitsFromTransposedRows(rows);

      if (transposedUnits.length > 0) {
        units.push(...transposedUnits);
        return;
      }

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

    const lines = rawText
      .split("\n")
      .map(cleanText)
      .filter(Boolean);

    const startIndex = lines.findIndex((line) => /Unit Information/i.test(line));
    const transposedLineUnits =
      startIndex === -1 ? [] : makeUnitsFromTransposedLines(lines, startIndex);

    if (transposedLineUnits.length > 0) {
      return transposedLineUnits;
    }

    if (units.length > 0) {
      return units;
    }

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
      return /^\d{1,2}\/\d{1,4}$/.test(value);
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
