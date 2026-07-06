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

  function getRedfinListingData(jsonLdItems) {
    if (!/(^|\.)redfin\.com$/i.test(window.location.hostname)) {
      return null;
    }

    function getTestIdText(testId) {
      return cleanText(
        document.querySelector(`[data-rf-test-id="${testId}"]`)?.innerText
      );
    }

    function getJsonLdTypes(item) {
      return Array.isArray(item?.["@type"])
        ? item["@type"]
        : [item?.["@type"]].filter(Boolean);
    }

    const listing =
      jsonLdItems.find((item) => item?.url === sourceUrl) ||
      jsonLdItems.find((item) =>
        getJsonLdTypes(item).includes("RealEstateListing")
      ) ||
      {};
    const residence = listing.mainEntity || {};
    const structuredAddress = residence.address || {};
    const cityStateZip = [
      structuredAddress.addressLocality,
      structuredAddress.addressRegion
    ]
      .filter(Boolean)
      .join(", ");
    const address =
      [
        structuredAddress.streetAddress,
        [cityStateZip, structuredAddress.postalCode]
          .filter(Boolean)
          .join(" ")
      ]
        .filter(Boolean)
        .join(", ") ||
      getTestIdText("abp-homeinfo-homeaddress") ||
      getMeta("og:title").split(" - ")[0];
    const mainSummary = [...document.querySelectorAll(
      '[data-rf-test-id="mhi-housesummary"]'
    )]
      .map((element) => element.innerText || "")
      .join("\n");
    const detailsRoot = document.querySelector(
      '[data-rf-test-id="propertyDetails"]'
    );
    const detailItems = detailsRoot
      ? [...detailsRoot.querySelectorAll("li.entryItem")]
          .map((element) => cleanText(element.innerText))
          .filter(Boolean)
      : [];
    const detailText = detailItems.join("\n");
    const publicFactsText =
      document.querySelector(
        '[data-rf-test-id="public-facts-and-zoning-v2-expandable-preview"]'
      )?.innerText || "";
    const pageDescription =
      listing.description ||
      getTestIdText("listingRemarks") ||
      getMeta("description") ||
      getMeta("og:description");
    const mlsMatch =
      pageTitle.match(/\bMLS#\s*([A-Z0-9-]+)/i) ||
      mainSummary.match(/\bMLS Grid\s*#\s*([A-Z0-9-]+)/i) ||
      rawText.match(/\bMLS(?:\s*#|\s*Number|\s*ID)?\s*[:#]?\s*([A-Z0-9-]+)/i);
    const propertyTypeMatch =
      mainSummary.match(/([^\n]+)\s*\n?\s*Property Type/i) ||
      detailText.match(/(Multi-family property \([^)]+\))/i);
    const lotSizeMatch =
      mainSummary.match(/([\d,.]+\s*(?:sq\.?\s*ft\.?|acres?))\s*\n?\s*Lot Size/i) ||
      detailText.match(/([\d,.]+\s*x\s*[\d,.]+\s*lot dimensions)/i);
    const summaryParkingMatch = mainSummary.match(
      /([^\n]+)\s*\n?\s*Parking/i
    );
    const detailParking = detailItems.find((item) =>
      /garage|parking spaces?/i.test(item)
    );
    const daysOnMarketMatch = rawText.match(
      /\b(\d+)\s+days?\s+on\s+Redfin\b/i
    );
    const agentMatch =
      getTestIdText("agentInfoItem-agentDisplay").match(
        /Listed by\s+(.+?)(?:\s*•|$)/i
      ) || mainSummary.match(/Listed by\s+(.+?)(?:\s*•|$)/im);
    const heating =
      detailItems.find((item) => /\bheating\b/i.test(item)) || "";
    const basement =
      detailItems.find((item) => /\bbasement\b/i.test(item)) || "";
    const roof =
      detailItems.find((item) => /\broof\b/i.test(item)) || "";
    const exterior =
      detailItems.find((item) => /\b(?:siding|brick)\b.*\bexterior\b/i.test(item)) ||
      "";
    const parcelMatch =
      publicFactsText.match(/\bAPN\s*([A-Z0-9-]+)/i) ||
      rawText.match(/\bAPN\s*[:#]?\s*([A-Z0-9-]+)/i);
    const zoningMatch = rawText.match(/\b(RS-\d+)\b/i);
    const neighborhood =
      [...document.querySelectorAll('a[href*="/neighborhood/"]')]
        .map((element) => cleanText(element.textContent))
        .find(
          (text) =>
            text &&
            text.length <= 80 &&
            !/^neighbou?rhoods?$/i.test(text)
        ) || "";

    return {
      sourceSite: "redfin",
      neighborhood,
      address,
      listPrice: listing.offers?.price || getTestIdText("abp-price"),
      beds: residence.numberOfBedrooms || getTestIdText("abp-beds"),
      baths:
        residence.numberOfBathroomsTotal || getTestIdText("abp-baths"),
      sqft:
        residence.floorSize?.value ||
        getTestIdText("abp-sqFt").replace(/[—-]/g, ""),
      mlsNumber: mlsMatch?.[1] || "",
      propertyType: propertyTypeMatch?.[1] || "",
      yearBuilt: residence.yearBuilt || "",
      lotSize: lotSizeMatch?.[1] || "",
      daysOnMarket: daysOnMarketMatch?.[1] || "",
      parking: summaryParkingMatch?.[1] || detailParking || "",
      heating,
      cooling: "",
      parcelNumber: parcelMatch?.[1] || "",
      basement,
      roof,
      exterior,
      zoning: zoningMatch?.[1] || "",
      description: pageDescription,
      brokerRemarks: listing.description || getTestIdText("listingRemarks"),
      listingAgentName: agentMatch?.[1] || "",
      listingAgentPhone: "",
      allExtractedFields: {
        import_source: "redfin",
        redfin_url: sourceUrl,
        redfin_date_posted: listing.datePosted || "",
        redfin_last_reviewed: listing.lastReviewed || "",
        redfin_latitude: residence.geo?.latitude || "",
        redfin_longitude: residence.geo?.longitude || "",
        neighborhood,
        redfin_property_details: detailItems
      }
    };
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

  function getExactFromPairs(pairs, labels) {
    const pairEntries = Object.entries(pairs);
    const normalizedLabels = labels.map((label) =>
      label.toLowerCase().replace(/[:*]/g, "").replace(/\s+/g, " ").trim()
    );

    const found = pairEntries.find(([label]) =>
      normalizedLabels.includes(
        label.toLowerCase().replace(/[:*]/g, "").replace(/\s+/g, " ").trim()
      )
    );

    return found ? found[1] : "";
  }

  function findCurrentPriceNearAddress(addressText) {
    const normalizedAddress = cleanText(addressText);

    if (!normalizedAddress) return "";

    const pricePattern = /\$[\d,]{4,}(?:\.\d{2})?/g;
    const candidates = [];

    document.querySelectorAll("body *").forEach((element) => {
      const text = cleanText(element.innerText);

      if (!text || !text.includes(normalizedAddress)) return;

      let container = element;

      for (let depth = 0; depth < 6 && container; depth += 1) {
        const containerText = cleanText(container.innerText);
        const prices = containerText.match(pricePattern) || [];

        if (prices.length > 0 && containerText.length < 1500) {
          candidates.push({
            price: prices[0],
            textLength: containerText.length
          });
        }

        container = container.parentElement;
      }
    });

    candidates.sort((a, b) => a.textLength - b.textLength);

    return candidates[0]?.price || "";
  }

  function extractStreetAddress(value) {
    const text = cleanText(value);

    if (!text || /virtually staged|photos may be|received:|back to list/i.test(text)) {
      return "";
    }

    const streetSuffix =
      "Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Place|Pl|Court|Ct|Boulevard|Blvd|Lane|Ln|Way|Terrace|Ter|Circle|Cir";
    const addressPattern = new RegExp(
      `\\b\\d{1,6}\\s+(?:(?:N|S|E|W|North|South|East|West)\\s+)?[A-Za-z0-9'.-]+(?:\\s+[A-Za-z0-9'.-]+){0,6}\\s+(?:${streetSuffix})\\b`,
      "i"
    );
    const match = text.match(addressPattern);

    return match ? cleanText(match[0]) : "";
  }

  function findVisibleStreetAddress() {
    const candidates = [];

    document.querySelectorAll("body *").forEach((element) => {
      const text = cleanText(element.innerText);

      if (!text || text.length > 600) return;

      const address = extractStreetAddress(text);

      if (!address) return;

      const hasLocationContext = /\b[A-Z][a-z]+,\s*[A-Z]{2}\b|\b\d{5}(?:-\d{4})?\b/.test(text);

      candidates.push({
        address,
        score: (hasLocationContext ? 0 : 1000) + text.length
      });
    });

    candidates.sort((a, b) => a.score - b.score);

    return candidates[0]?.address || "";
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

    function getAdvertisedUnitCount() {
      const matches = [
        ...rawText.matchAll(/\b(\d{1,2})\s*(?:-\s*)?Units?\b/gi)
      ]
        .map((match) => Number(match[1]))
        .filter((count) => Number.isInteger(count) && count > 0 && count <= 50);

      return matches[0] || 0;
    }

    function makeRedfinUnits() {
      if (!/(^|\.)redfin\.com$/i.test(window.location.hostname)) {
        return [];
      }

      const detailsRoot = document.querySelector(
        '[data-rf-test-id="propertyDetails"]'
      );

      if (!detailsRoot) return [];

      const detailItems = [...detailsRoot.querySelectorAll("li.entryItem")]
        .map((element) => cleanText(element.innerText))
        .filter(Boolean);
      const detailText = detailItems.join("\n");
      const countMatch =
        detailText.match(/\b(\d{1,2})\s*(?:-\s*)?unit building\b/i) ||
        rawText.match(/\b(?:legal\s+)?(\d{1,2})\s*(?:-\s*)?unit\b/i);
      const bedroomMatch = detailText.match(
        /\bunits?\s*:\s*([\d,\sand]+?)\s+bedrooms?\b/i
      );
      const rentLine = detailItems.find((item) =>
        /^Unit rents?\s*\(current\)\s*:/i.test(item)
      );
      const applianceLine = detailItems.find((item) =>
        /Each unit includes/i.test(item)
      );
      const tenantPaysLine = detailItems.find((item) =>
        /tenants?\s+pay|tenants?\s+pay utilities/i.test(item)
      );
      const unitCount = Number(countMatch?.[1] || 0);
      const bedrooms = bedroomMatch
        ? [...bedroomMatch[1].matchAll(/\d+/g)].map((match) => match[0])
        : [];
      const rents = rentLine
        ? [...rentLine.matchAll(/\$([\d,]+)/g)].map((match) =>
            match[1].replace(/,/g, "")
          )
        : [];
      const parsedUnitCount = Math.max(unitCount, bedrooms.length, rents.length);

      if (parsedUnitCount === 0) return [];

      return Array.from({ length: parsedUnitCount }, (_, index) => ({
        ...makeEmptyUnit(),
        unitNumber: String(index + 1),
        bedrooms: bedrooms[index] || "",
        rent: rents[index] || "",
        appliancesFeatures: applianceLine || "",
        tenantPays: tenantPaysLine || ""
      }));
    }

    function withAdvertisedUnitCount(parsedUnits) {
      const advertisedUnitCount = getAdvertisedUnitCount();

      if (!advertisedUnitCount || parsedUnits.length >= advertisedUnitCount) {
        return parsedUnits;
      }

      const unitsByNumber = new Map(
        parsedUnits
          .filter((unit) => unit.unitNumber)
          .map((unit) => [String(unit.unitNumber), unit])
      );

      for (let unitNumber = 1; unitNumber <= advertisedUnitCount; unitNumber += 1) {
        const unitNumberText = String(unitNumber);

        if (!unitsByNumber.has(unitNumberText)) {
          unitsByNumber.set(unitNumberText, {
            ...makeEmptyUnit(),
            unitNumber: unitNumberText
          });
        }
      }

      return [...unitsByNumber.values()].sort(
        (a, b) => Number(a.unitNumber) - Number(b.unitNumber)
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

    function isUnitStart(value) {
      return /^\d+[A-Z]?$/.test(value);
    }

    function isMoneyish(value) {
      return /^\$?[\d,]+(?:\.\d{2})?$/.test(value);
    }

    function isLeaseDate(value) {
      return /^(?:M\/M|\d{1,2}\/\d{1,4})$/i.test(value);
    }

    function isSmallInteger(value) {
      return /^\d{1,2}$/.test(value);
    }

    function isLikelySqft(value) {
      const numericValue = Number(String(value || "").replace(/,/g, ""));
      return Number.isFinite(numericValue) && numericValue >= 100;
    }

    function makeUnitsFromColumnMajorLines(lines, tenantPaysIndex) {
      const values = lines.slice(tenantPaysIndex + 1);
      const parsedUnits = [];
      let lineIndex = 0;

      while (lineIndex < values.length) {
        if (!isUnitStart(values[lineIndex]) || !isSmallInteger(values[lineIndex + 1])) {
          break;
        }

        const unit = makeEmptyUnit();
        unit.unitNumber = values[lineIndex] || "";
        unit.floorNumber = values[lineIndex + 1] || "";
        lineIndex += 2;

        if (isLikelySqft(values[lineIndex])) {
          unit.sqft = values[lineIndex] || "";
          lineIndex += 1;
        }

        if (isSmallInteger(values[lineIndex])) {
          unit.rooms = values[lineIndex] || "";
          lineIndex += 1;
        }

        if (isSmallInteger(values[lineIndex])) {
          unit.bedrooms = values[lineIndex] || "";
          lineIndex += 1;
        }

        if (isSmallInteger(values[lineIndex])) {
          unit.fullBaths = values[lineIndex] || "";
          lineIndex += 1;
        }

        if (isSmallInteger(values[lineIndex])) {
          unit.halfBaths = values[lineIndex] || "";
          lineIndex += 1;
        }

        if (
          values[lineIndex] &&
          !isMoneyish(values[lineIndex]) &&
          !isLeaseDate(values[lineIndex])
        ) {
          unit.masterBedroomBath = values[lineIndex] || "";
          lineIndex += 1;
        }

        if (isMoneyish(values[lineIndex])) {
          unit.securityDeposit = values[lineIndex] || "";
          lineIndex += 1;
        }

        if (isMoneyish(values[lineIndex])) {
          unit.rent = values[lineIndex] || "";
          lineIndex += 1;
        }

        if (isLeaseDate(values[lineIndex])) {
          unit.leaseExpiration = values[lineIndex] || "";
          lineIndex += 1;
        }

        if (values[lineIndex] && !isUnitStart(values[lineIndex])) {
          unit.appliancesFeatures = values[lineIndex] || "";
          lineIndex += 1;
        }

        if (values[lineIndex] && !isUnitStart(values[lineIndex])) {
          unit.tenantPays = values[lineIndex] || "";
          lineIndex += 1;
        }

        if (unit.unitNumber && hasMeaningfulUnitData(unit)) {
          parsedUnits.push(unit);
        }

        if (parsedUnits.length > 50) break;
      }

      return parsedUnits;
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

    const redfinUnits = makeRedfinUnits();

    if (redfinUnits.length > 0) {
      return redfinUnits;
    }

    const lines = rawText
      .split("\n")
      .map(cleanText)
      .filter(Boolean);

    const startIndex = lines.findIndex((line) => /Unit Information/i.test(line));
    const transposedLineUnits =
      startIndex === -1 ? [] : makeUnitsFromTransposedLines(lines, startIndex);

    if (transposedLineUnits.length > 0) {
      return withAdvertisedUnitCount(transposedLineUnits);
    }

    const tenantPaysIndex = lines.findIndex(
      (line, index) => index > startIndex && /Tenant Pays/i.test(line)
    );
    const columnMajorUnits =
      tenantPaysIndex === -1 ? [] : makeUnitsFromColumnMajorLines(lines, tenantPaysIndex);

    if (columnMajorUnits.length > 0) {
      return withAdvertisedUnitCount(columnMajorUnits);
    }

    if (units.length > 0) {
      return withAdvertisedUnitCount(units);
    }

    return withAdvertisedUnitCount([]);
  }

  const jsonLdItems = parseJsonLd();
  const redfinListing = getRedfinListingData(jsonLdItems);
  const labelValuePairs = collectLabelValuePairs();

  const jsonListing =
    jsonLdItems.find((item) => item?.url === sourceUrl) ||
    jsonLdItems.find((item) => {
      const itemTypes = Array.isArray(item?.["@type"])
        ? item["@type"]
        : [item?.["@type"]];

      return itemTypes.includes("RealEstateListing");
    }) ||
    jsonLdItems.find((item) => item.address || item.offers || item.floorSize) ||
    {};

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

  const visibleStreetAddress = findVisibleStreetAddress();
  const pairStreetAddress = extractStreetAddress(
    getFromPairs(labelValuePairs, ["address", "property address"])
  );
  const metaTitleStreetAddress = extractStreetAddress(getMeta("og:title"));
  const matchedStreetAddress = extractStreetAddress(
    firstMatch([
      /^(.+\b(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Place|Pl|Court|Ct|Boulevard|Blvd|Lane|Ln|Way|Terrace|Ter|Circle|Cir).*)$/im
    ])
  );

  const address =
    redfinListing?.address ||
    jsonAddress ||
    visibleStreetAddress ||
    pairStreetAddress ||
    metaTitleStreetAddress ||
    matchedStreetAddress;

  const currentPriceNearAddress = findCurrentPriceNearAddress(address);

  const listPrice =
    redfinListing?.listPrice ||
    currentPriceNearAddress ||
    jsonListing.offers?.price ||
    getMeta("product:price:amount") ||
    getFromPairs(labelValuePairs, ["list price", "price"]) ||
    firstMatch([
      /\$([\d,]{4,})/i,
      /List Price\s*\$?([\d,]+)/i,
      /Price\s*\$?([\d,]+)/i
    ]);

  const beds =
    redfinListing?.beds ||
    getFromPairs(labelValuePairs, ["bedrooms", "beds", "bed"]) ||
    firstMatch([
      /(\d+(?:\.\d+)?)\s*(?:beds|bedrooms|bd)\b/i,
      /Beds?\s*(\d+(?:\.\d+)?)/i
    ]);

  const baths =
    redfinListing?.baths ||
    getFromPairs(labelValuePairs, ["bathrooms", "baths", "bath"]) ||
    firstMatch([
      /(\d+(?:\.\d+)?)\s*(?:baths|bathrooms|ba)\b/i,
      /Baths?\s*(\d+(?:\.\d+)?)/i
    ]);

  const sqft =
    redfinListing?.sqft ||
    getFromPairs(labelValuePairs, ["living area", "square feet", "sqft", "sq ft"]) ||
    firstMatch([
      /([\d,]+)\s*(?:sq\.?\s*ft\.?|square feet|sqft)\b/i,
      /Living Area\s*([\d,]+)/i
    ]);

  const mlsNumber =
    redfinListing?.mlsNumber ||
    getFromPairs(labelValuePairs, ["mls", "mls number", "listing id"]) ||
    firstMatch([
      /MLS(?:\s*#|\s*Number|\s*ID)?\s*[:#]?\s*([A-Z0-9-]+)/i,
      /Listing ID\s*[:#]?\s*([A-Z0-9-]+)/i
    ]);

  const propertyType =
    redfinListing?.propertyType ||
    getFromPairs(labelValuePairs, ["property type", "type", "style"]);

  const yearBuilt =
    redfinListing?.yearBuilt ||
    getFromPairs(labelValuePairs, ["year built", "built"]) ||
    firstMatch([
      /Year Built\s*[:\n]?\s*(\d{4})/i,
      /Built\s*[:\n]?\s*(\d{4})/i
    ]);

  const lotSize =
    redfinListing?.lotSize ||
    getFromPairs(labelValuePairs, ["lot size", "lot dimensions", "acres"]);

  const taxes = redfinListing
    ? ""
    : getFromPairs(labelValuePairs, [
        "taxes",
        "tax amount",
        "property tax",
        "annual tax"
      ]);

  const hoa = redfinListing
    ? ""
    : getFromPairs(labelValuePairs, [
        "hoa",
        "association fee",
        "monthly assessment"
      ]);

  const daysOnMarket =
    redfinListing?.daysOnMarket ||
    getFromPairs(labelValuePairs, [
      "days on market",
      "list mkt time",
      "listing market time",
      "dom"
    ]);
  const neighborhood =
    redfinListing?.neighborhood ||
    getFromPairs(labelValuePairs, [
      "neighborhood",
      "neighbourhood",
      "community area"
    ]);
  const parking =
    redfinListing?.parking ||
    getFromPairs(labelValuePairs, ["parking", "garage"]);
  const heating =
    redfinListing?.heating ||
    getFromPairs(labelValuePairs, ["heating", "heat"]);
  const cooling = redfinListing
    ? redfinListing.cooling
    : getFromPairs(labelValuePairs, ["cooling", "air conditioning"]);
  const parcelNumber =
    redfinListing?.parcelNumber ||
    getFromPairs(labelValuePairs, ["pin", "parcel", "apn", "tax id"]);

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

  const basement =
    redfinListing?.basement ||
    getFromPairs(labelValuePairs, ["basement", "basement description"]);

  const roof =
    redfinListing?.roof ||
    getFromPairs(labelValuePairs, ["roof", "roof type"]);

  const exterior =
    redfinListing?.exterior ||
    getFromPairs(labelValuePairs, [
      "exterior",
      "exterior building type",
      "exterior features"
    ]);

  const zoning =
    redfinListing
      ? redfinListing.zoning
      : getFromPairs(labelValuePairs, ["zoning", "zoning type"]);

  const brokerRemarks =
    redfinListing?.brokerRemarks ||
    getFromPairs(labelValuePairs, [
      "broker remarks",
      "agent remarks",
      "private remarks",
      "additional remarks"
    ]);

  const description =
    redfinListing?.description ||
    brokerRemarks ||
    getExactFromPairs(labelValuePairs, ["Public Remarks", "Remarks"]) ||
    getMeta("description") ||
    getMeta("og:description") ||
    "";

  const listingAgentName =
    redfinListing?.listingAgentName ||
    getFromPairs(labelValuePairs, [
      "listing agent",
      "list agent",
      "agent name",
      "broker name"
    ]);

  const listingAgentPhone = redfinListing
    ? redfinListing.listingAgentPhone
    : getFromPairs(labelValuePairs, [
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
    neighborhood: cleanText(neighborhood),
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

    sourceSite: redfinListing?.sourceSite || "",
    allExtractedFields: redfinListing
      ? redfinListing.allExtractedFields
      : {
          ...labelValuePairs,
          neighborhood: cleanText(neighborhood)
        },
    rawText: rawText.slice(0, 30000)
  };
}
