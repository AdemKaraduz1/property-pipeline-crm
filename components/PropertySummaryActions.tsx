"use client";

import { useState } from "react";
import { Download, Eye, Share2 } from "lucide-react";

type PropertySummaryActionsProps = {
  propertyId: string;
  fileName: string;
  summary: string;
};

export function PropertySummaryActions({
  propertyId,
  fileName,
  summary,
}: PropertySummaryActionsProps) {
  const [message, setMessage] = useState("");
  const pdfFileName = getPdfFileName(fileName);

  function getPdfFileName(name: string) {
    const baseName = name
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9-]+/gi, "-")
      .replace(/^-|-$/g, "");

    return `${baseName || "property-deal-summary"}.pdf`;
  }

  function sanitizePdfText(value: string) {
    return value
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[–—]/g, "-")
      .replace(/•/g, "-")
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
  }

  function escapePdfText(value: string) {
    return sanitizePdfText(value)
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  function wrapSummaryLine(line: string, maxCharacters: number) {
    const sanitizedLine = sanitizePdfText(line);

    if (!sanitizedLine.trim()) return [""];

    const words = sanitizedLine.split(/\s+/);
    const lines: string[] = [];
    const bulletPrefix = sanitizedLine.startsWith("- ") ? "  " : "";
    let currentLine = "";

    for (const word of words) {
      const nextLine = currentLine ? `${currentLine} ${word}` : word;

      if (nextLine.length <= maxCharacters) {
        currentLine = nextLine;
        continue;
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      if (word.length > maxCharacters) {
        lines.push(word.slice(0, maxCharacters));
        currentLine = bulletPrefix + word.slice(maxCharacters);
      } else {
        currentLine = bulletPrefix + word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  function splitLabelValue(line: string): [string, string] {
    const separatorIndex = line.indexOf(":");

    if (separatorIndex === -1) return ["", line];

    return [
      line.slice(0, separatorIndex).trim(),
      line.slice(separatorIndex + 1).trim(),
    ];
  }

  function getLineValue(lines: string[], label: string) {
    const match = lines.find((line) =>
      line.toLowerCase().startsWith(`${label.toLowerCase()}:`),
    );

    return match ? splitLabelValue(match)[1] : "-";
  }

  function parseUnitLine(line: string) {
    const match = line
      .replace(/^-\s*/, "")
      .match(
        /^(.+?):\s*([\d.]+)\s*bed\s*\/\s*([\d.]+)\s*bath,\s*current\s*(.+?),\s*projected\s*(.+?),\s*rehab\s*(.+)$/i,
      );

    if (!match) return null;

    const [, label, beds, baths, current, projected, rehab] = match;

    return {
      label: label.trim(),
      bedsBaths: `${beds}bd / ${baths}ba`,
      current: current.trim(),
      projected: projected.trim(),
      rehab: rehab.trim(),
    };
  }

  function parseItemEntriesWithNotes(lines: string[]) {
    const entries: Array<{ label: string; value: string; note?: string }> = [];

    lines.forEach((line) => {
      const [label, value] = splitLabelValue(line);

      if (label.endsWith(" Note")) {
        const baseLabel = label.slice(0, -" Note".length);
        const target = entries.find((entry) => entry.label === baseLabel);

        if (target) {
          target.note = value;
        }

        return;
      }

      entries.push({ label, value });
    });

    return entries;
  }

  function parseSummarySections() {
    const lines = summary.split("\n").map((line) => line.trim());
    const title = lines[0] || "Property Pipeline CRM Deal Summary";
    const sectionHeadings = [
      "Current View",
      "Projected View",
      "Return Summary",
      "NOI Bridge",
      "Investment Position",
      "Property Details",
      "Common Area Rehab",
      "Additional Income",
      "Key Diligence Before Offer",
      "Units",
    ];
    const currentIndex = lines.indexOf("Current View");
    const firstSectionIndex =
      currentIndex === -1
        ? lines.findIndex((line) => sectionHeadings.includes(line))
        : currentIndex;
    const noteIndex = lines.findIndex((line) => line.startsWith("Planning note:"));
    const propertyLines = lines
      .slice(1, firstSectionIndex === -1 ? undefined : firstSectionIndex)
      .filter(Boolean);

    function getSectionLines(heading: string) {
      const startIndex = lines.indexOf(heading);

      if (startIndex === -1) return [];

      const nextHeadingIndex = lines.findIndex(
        (line, index) =>
          index > startIndex && sectionHeadings.includes(line),
      );
      const endIndex =
        nextHeadingIndex === -1
          ? noteIndex === -1
            ? undefined
            : noteIndex
          : nextHeadingIndex;

      return lines.slice(startIndex + 1, endIndex).filter(Boolean);
    }

    return {
      title,
      address: propertyLines[0] || "Untitled Property",
      propertyLines: propertyLines.slice(1),
      currentLines: getSectionLines("Current View"),
      projectedLines: getSectionLines("Projected View"),
      returnLines: getSectionLines("Return Summary"),
      noiBridgeLines: getSectionLines("NOI Bridge"),
      investmentLines: getSectionLines("Investment Position"),
      commonAreaRehabLines: getSectionLines("Common Area Rehab"),
      additionalIncomeLines: getSectionLines("Additional Income"),
      diligenceLines: getSectionLines("Key Diligence Before Offer"),
      unitLines: getSectionLines("Units"),
    };
  }

  async function getFirstWalkthroughPhotoUrl() {
    try {
      const response = await fetch(
        `/api/properties/${propertyId}/walkthrough/photos`,
      );
      const result = (await response.json()) as {
        success?: boolean;
        photos?: Array<{ url?: string | null }>;
      };

      if (!response.ok || !result.success) return null;

      return result.photos?.find((photo) => photo.url)?.url || null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function dataUrlToBytes(dataUrl: string) {
    const base64 = dataUrl.split(",")[1] || "";
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  async function imageBlobToPdfPhoto(blob: Blob) {
    try {
      const bitmap = await createImageBitmap(blob);
      const maxWidth = 900;
      const scale = Math.min(1, maxWidth / bitmap.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");

      if (!context) return null;

      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);

      return {
        width: canvas.width,
        height: canvas.height,
        bytes: dataUrlToBytes(dataUrl),
      };
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async function getPdfPhoto() {
    try {
      const response = await fetch(`/api/properties/${propertyId}/listing-photo`);

      if (response.ok) {
        const photo = await imageBlobToPdfPhoto(await response.blob());

        if (photo) return photo;
      }
    } catch (error) {
      console.error(error);
    }

    const photoUrl = await getFirstWalkthroughPhotoUrl();

    if (!photoUrl) return null;

    try {
      const response = await fetch(photoUrl);

      if (!response.ok) return null;

      return imageBlobToPdfPhoto(await response.blob());
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function makeText(
    text: string,
    x: number,
    y: number,
    options: { font?: "F1" | "F2"; size?: number; color?: string } = {},
  ) {
    const font = options.font || "F1";
    const size = options.size || 10;
    const color = options.color || "0.08 0.11 0.18";

    return `q ${color} rg BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET Q`;
  }

  function makeLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color = "0.84 0.88 0.93",
  ) {
    return `q ${color} RG ${x1} ${y1} m ${x2} ${y2} l S Q`;
  }

  function makeRect(
    x: number,
    y: number,
    width: number,
    height: number,
    options: { fill?: string; stroke?: string } = {},
  ) {
    const commands: string[] = [];

    if (options.fill) {
      commands.push(`q ${options.fill} rg ${x} ${y} ${width} ${height} re f Q`);
    }

    if (options.stroke) {
      commands.push(`q ${options.stroke} RG ${x} ${y} ${width} ${height} re S Q`);
    }

    return commands.join("\n");
  }

  function makeMetricCard(
    label: string,
    value: string,
    x: number,
    y: number,
    width: number,
    options: { accent?: string; dark?: boolean; height?: number } = {},
  ) {
    const dark = options.dark === true;
    const height = options.height ?? 58;
    const fill = dark ? "0.08 0.11 0.18" : "0.98 0.99 1";
    const stroke = dark ? "0.08 0.11 0.18" : "0.92 0.95 0.98";
    const labelColor = dark ? "0.68 0.78 0.92" : "0.45 0.52 0.63";
    const valueColor = dark ? "1 1 1" : "0.08 0.11 0.18";
    const commands = [
      makeRect(x, y, width, height, { fill, stroke }),
      makeRect(x, y + height - 2, width, 2, {
        fill: options.accent || (dark ? "0.15 0.38 0.92" : "0.86 0.91 0.98"),
      }),
      makeText(label.toUpperCase(), x + 12, y + height - 20, {
        font: "F2",
        size: 7,
        color: labelColor,
      }),
      makeText(value, x + 12, y + 17, {
        font: "F2",
        size: value.length > 12 ? 11 : 14,
        color: valueColor,
      }),
    ];

    return commands.join("\n");
  }

  function makeEqualColumns(count: number, totalWidth: number, gap: number) {
    const width = (totalWidth - gap * (count - 1)) / count;
    return Array.from({ length: count }, (_, index) => ({
      x: index * (width + gap),
      width,
    }));
  }

  function makeSectionHeading(title: string, x: number, y: number, width = 240) {
    return [
      makeText(title, x, y, {
        font: "F2",
        size: 10.5,
        color: "0.08 0.11 0.18",
      }),
      makeRect(x, y - 7, 32, 1.5, { fill: "0.15 0.38 0.92" }),
      makeLine(x, y - 12, x + width, y - 12, "0.90 0.93 0.96"),
    ].join("\n");
  }

  function makeKeyValueRows(
    lines: string[],
    x: number,
    y: number,
    options: {
      labelWidth?: number;
      width?: number;
      rowHeight?: number;
      labelSize?: number;
      valueSize?: number;
    } = {},
  ) {
    const commands: string[] = [];
    const labelWidth = options.labelWidth ?? 104;
    const width = options.width ?? 230;
    const rowHeight = options.rowHeight ?? 15;
    const labelSize = options.labelSize ?? 7.5;
    const valueSize = options.valueSize ?? 8.5;
    let cursorY = y;

    lines.forEach((line) => {
      const [label, value] = splitLabelValue(line);
      const valueLines = wrapSummaryLine(value, 34).slice(0, 2);
      const rowAdvance = Math.max(rowHeight, valueLines.length * 9 + 6);

      commands.push(
        makeText(label.toUpperCase(), x, cursorY, {
          font: "F2",
          size: labelSize,
          color: "0.45 0.52 0.63",
        }),
      );
      valueLines.forEach((valueLine, valueIndex) => {
        commands.push(
          makeText(valueLine, x + labelWidth, cursorY - valueIndex * 9, {
            font: "F2",
            size: valueSize,
            color: "0.08 0.11 0.18",
          }),
        );
      });
      commands.push(
        makeLine(
          x,
          cursorY - rowAdvance + 7,
          x + width,
          cursorY - rowAdvance + 7,
          "0.94 0.96 0.98",
        ),
      );
      cursorY -= rowAdvance;
    });

    return { commands, bottomY: cursorY };
  }

  async function buildPdfBlob() {
    const encoder = new TextEncoder();
    const pageWidth = 612;
    const pageHeight = 792;
    const marginX = 44;
    const contentWidth = pageWidth - marginX * 2;
    const sections = parseSummarySections();
    const pdfPhoto = await getPdfPhoto();
    const pageCommands: string[] = [];
    const reportDate = new Date().toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const askingPrice = getLineValue(sections.currentLines, "Asking price");
    const projectedAnnualRent = getLineValue(
      sections.projectedLines,
      "Projected annual rent",
    );
    const projectedNoi = getLineValue(sections.projectedLines, "Projected NOI");
    const projectedCapRate = getLineValue(
      sections.projectedLines,
      "Projected cap rate",
    );
    const annualDebtService = getLineValue(
      sections.projectedLines,
      "Annual debt service",
    );
    const totalRehab = getLineValue(sections.projectedLines, "Total rehab");
    const monthlyCashFlow = getLineValue(
      sections.returnLines,
      "Monthly cash flow",
    );
    const cashOnCash = getLineValue(
      sections.returnLines,
      "Cash-on-cash return",
    );
    const dscr = getLineValue(sections.returnLines, "DSCR");
    const cashRequired = getLineValue(
      sections.returnLines,
      "Total estimated cash required",
    );
    const startingOfferPrice = getLineValue(
      sections.investmentLines,
      "Starting offer price",
    );
    const maximumPrice = getLineValue(
      sections.investmentLines,
      "Maximum purchase price",
    );
    const latestOffer = getLineValue(sections.investmentLines, "Latest offer");
    const vacancy = getLineValue(sections.noiBridgeLines, "Vacancy");
    const additionalIncomeBridge = getLineValue(
      sections.noiBridgeLines,
      "Additional income",
    );
    const operatingExpenses = getLineValue(
      sections.noiBridgeLines,
      "Operating expenses",
    );
    const additionalIncomeTotal = getLineValue(
      sections.additionalIncomeLines,
      "Additional income total",
    );
    const additionalIncomeNotes = getLineValue(
      sections.additionalIncomeLines,
      "Income notes",
    );
    const additionalIncomeItemLines = sections.additionalIncomeLines.filter(
      (line) =>
        !line.toLowerCase().startsWith("additional income total:") &&
        !line.toLowerCase().startsWith("income notes:"),
    );
    const commonRehabContingency = getLineValue(
      sections.commonAreaRehabLines,
      "Contingency",
    );
    const commonRehabTotal = getLineValue(
      sections.commonAreaRehabLines,
      "Common area rehab total",
    );
    const commonRehabNotes = getLineValue(
      sections.commonAreaRehabLines,
      "Rehab notes",
    );
    const commonRehabItemLines = sections.commonAreaRehabLines.filter(
      (line) =>
        !line.toLowerCase().startsWith("contingency:") &&
        !line.toLowerCase().startsWith("common area rehab total:") &&
        !line.toLowerCase().startsWith("rehab notes:"),
    );
    const commonRehabEntries = parseItemEntriesWithNotes(commonRehabItemLines);

    // ---- Header ----
    const headerHeight = 156;
    const headerBottom = pageHeight - headerHeight;

    pageCommands.push(makeRect(0, 0, pageWidth, pageHeight, { fill: "1 1 1" }));
    pageCommands.push(
      makeRect(0, headerBottom, pageWidth, headerHeight, {
        fill: "0.06 0.09 0.16",
      }),
    );
    pageCommands.push(
      makeRect(0, headerBottom - 4, pageWidth, 4, { fill: "0.15 0.38 0.92" }),
    );
    pageCommands.push(
      makeText(
        `PROPERTY PIPELINE CRM   |   Prepared ${reportDate}`,
        marginX,
        764,
        { font: "F2", size: 9, color: "0.68 0.78 0.92" },
      ),
    );
    pageCommands.push(
      makeText("Investment Deal Summary", marginX, 735, {
        font: "F2",
        size: 23,
        color: "1 1 1",
      }),
    );
    pageCommands.push(
      makeText(sections.address, marginX, 705, {
        font: "F2",
        size: 14,
        color: "0.88 0.93 1",
      }),
    );

    const headerDetailLines = sections.propertyLines.filter(
      (line) =>
        !line.toLowerCase().startsWith("status:") &&
        !line.toLowerCase().startsWith("property type:"),
    );

    let detailsY = 684;
    headerDetailLines.slice(0, 4).forEach((line) => {
      pageCommands.push(
        makeText(line, marginX, detailsY, {
          size: 8,
          color: "0.58 0.66 0.78",
        }),
      );
      detailsY -= 11;
    });

    const photoBox = { x: 390, y: 650, width: 178, height: 128 };
    pageCommands.push(
      makeRect(photoBox.x, photoBox.y, photoBox.width, photoBox.height, {
        fill: "0.94 0.96 0.98",
        stroke: "0.74 0.79 0.86",
      }),
    );

    if (pdfPhoto) {
      const scale = Math.max(
        photoBox.width / pdfPhoto.width,
        photoBox.height / pdfPhoto.height,
      );
      const imageWidth = pdfPhoto.width * scale;
      const imageHeight = pdfPhoto.height * scale;
      const imageX = photoBox.x + (photoBox.width - imageWidth) / 2;
      const imageY = photoBox.y + (photoBox.height - imageHeight) / 2;

      pageCommands.push(
        `q ${photoBox.x} ${photoBox.y} ${photoBox.width} ${photoBox.height} re W n ${imageWidth.toFixed(2)} 0 0 ${imageHeight.toFixed(2)} ${imageX.toFixed(2)} ${imageY.toFixed(2)} cm /Im1 Do Q`,
      );
    } else {
      pageCommands.push(
        makeText("Property photo", photoBox.x + 48, photoBox.y + 74, {
          font: "F2",
          size: 10,
          color: "0.31 0.38 0.49",
        }),
      );
      pageCommands.push(
        makeText("Listing or walkthrough image", photoBox.x + 30, photoBox.y + 58, {
          size: 8,
          color: "0.45 0.52 0.63",
        }),
      );
    }

    // ---- Hero metrics ----
    const heroHeight = 58;
    const heroY = headerBottom - 4 - 16 - heroHeight;
    const heroColumns = makeEqualColumns(4, contentWidth, 10);
    const heroCards: Array<{
      label: string;
      value: string;
      options: { accent?: string; dark?: boolean };
    }> = [
      {
        label: "Asking Price",
        value: askingPrice,
        options: { accent: "0.15 0.38 0.92" },
      },
      {
        label: "Starting Offer",
        value: startingOfferPrice,
        options: { accent: "0.16 0.62 0.42" },
      },
      {
        label: "Maximum Price",
        value: maximumPrice,
        options: { accent: "0.15 0.38 0.92" },
      },
      { label: "Projected NOI", value: projectedNoi, options: { dark: true } },
    ];

    heroCards.forEach((card, index) => {
      const column = heroColumns[index];
      pageCommands.push(
        makeMetricCard(
          card.label,
          card.value,
          marginX + column.x,
          heroY,
          column.width,
          { ...card.options, height: heroHeight },
        ),
      );
    });

    pageCommands.push(
      makeText(
        `Projected cap ${projectedCapRate}   |   Debt service ${annualDebtService}   |   Rehab ${totalRehab}`,
        marginX,
        heroY - 20,
        { font: "F2", size: 8.5, color: "0.42 0.49 0.60" },
      ),
    );
    pageCommands.push(
      makeLine(
        marginX,
        heroY - 34,
        marginX + contentWidth,
        heroY - 34,
        "0.88 0.91 0.95",
      ),
    );

    // ---- Investment Position / Return Summary ----
    const boxesTop = heroY - 34 - 16;
    const keyValueBoxHeight = (rowCount: number) => 52 + 15 * rowCount;
    const investmentBoxHeight = keyValueBoxHeight(latestOffer !== "-" ? 4 : 3);
    const returnBoxHeight = keyValueBoxHeight(4);
    const boxColumnWidth = (contentWidth - 24) / 2;

    pageCommands.push(
      makeRect(
        marginX,
        boxesTop - investmentBoxHeight,
        boxColumnWidth,
        investmentBoxHeight,
        { fill: "0.98 0.99 1", stroke: "0.90 0.93 0.96" },
      ),
    );
    pageCommands.push(
      makeSectionHeading(
        "Investment Position",
        marginX + 14,
        boxesTop - 20,
        boxColumnWidth - 28,
      ),
    );
    pageCommands.push(
      ...makeKeyValueRows(
        [
          `Asking price: ${askingPrice}`,
          `Starting offer: ${startingOfferPrice}`,
          `Maximum price: ${maximumPrice}`,
          ...(latestOffer !== "-" ? [`Latest offer: ${latestOffer}`] : []),
        ],
        marginX + 14,
        boxesTop - 40,
        {
          width: boxColumnWidth - 28,
          labelWidth: 104,
          rowHeight: 15,
          valueSize: 8,
        },
      ).commands,
    );

    const returnBoxX = marginX + boxColumnWidth + 24;

    pageCommands.push(
      makeRect(returnBoxX, boxesTop - returnBoxHeight, boxColumnWidth, returnBoxHeight, {
        fill: "0.98 0.99 1",
        stroke: "0.90 0.93 0.96",
      }),
    );
    pageCommands.push(
      makeSectionHeading(
        "Return Summary",
        returnBoxX + 14,
        boxesTop - 20,
        boxColumnWidth - 28,
      ),
    );
    pageCommands.push(
      ...makeKeyValueRows(
        [
          `Monthly cash flow: ${monthlyCashFlow}`,
          `Cash-on-cash return: ${cashOnCash}`,
          `DSCR: ${dscr}`,
          `Cash required: ${cashRequired}`,
        ],
        returnBoxX + 14,
        boxesTop - 40,
        {
          width: boxColumnWidth - 28,
          labelWidth: 112,
          rowHeight: 15,
          valueSize: 7.8,
        },
      ).commands,
    );

    // ---- NOI calculation bar ----
    const boxesBottom =
      boxesTop - Math.max(investmentBoxHeight, returnBoxHeight);
    const noiBarHeight = 36;
    const noiBarTop = boxesBottom - 16;

    pageCommands.push(
      makeRect(marginX, noiBarTop - noiBarHeight, contentWidth, noiBarHeight, {
        fill: "0.96 0.98 1",
        stroke: "0.86 0.91 0.98",
      }),
    );
    pageCommands.push(
      makeText("NOI CALCULATION", marginX + 14, noiBarTop - 14, {
        font: "F2",
        size: 8,
        color: "0.25 0.34 0.47",
      }),
    );

    const hasAdditionalIncome =
      additionalIncomeBridge !== "-" && additionalIncomeBridge !== "$0";

    pageCommands.push(
      makeText(
        `Gross rent ${projectedAnnualRent}  |  Vacancy ${vacancy}${
          hasAdditionalIncome ? `  |  Other income ${additionalIncomeBridge}` : ""
        }  |  Operating expenses ${operatingExpenses}  |  NOI ${projectedNoi}`,
        marginX + 14,
        noiBarTop - 29,
        { font: "F2", size: 8.3, color: "0.08 0.11 0.18" },
      ),
    );

    // ---- Unit Rent Roll ----
    const unitsHeadingY = noiBarTop - noiBarHeight - 16;

    pageCommands.push(
      makeSectionHeading("Unit Rent Roll", marginX, unitsHeadingY, contentWidth),
    );

    const unitColumns = [
      { label: "UNIT", x: marginX, width: 90 },
      { label: "BD / BA", x: marginX + 90, width: 80 },
      { label: "CURRENT", x: marginX + 170, width: 110 },
      { label: "PROJECTED", x: marginX + 280, width: 110 },
      { label: "REHAB", x: marginX + 390, width: 134 },
    ];
    const unitsTableHeaderY = unitsHeadingY - 22;

    unitColumns.forEach((column) => {
      pageCommands.push(
        makeText(column.label, column.x, unitsTableHeaderY, {
          font: "F2",
          size: 7,
          color: "0.45 0.52 0.63",
        }),
      );
    });
    pageCommands.push(
      makeLine(
        marginX,
        unitsTableHeaderY - 6,
        marginX + contentWidth,
        unitsTableHeaderY - 6,
        "0.88 0.91 0.95",
      ),
    );

    const unitRowHeight = 17;
    let unitRowY = unitsTableHeaderY - 20;

    sections.unitLines.slice(0, 5).forEach((line, index) => {
      const parsed = parseUnitLine(line);

      pageCommands.push(
        makeRect(marginX, unitRowY - 5, contentWidth, unitRowHeight, {
          fill: index % 2 === 0 ? "0.98 0.99 1" : "1 1 1",
        }),
      );

      if (parsed) {
        pageCommands.push(
          makeText(parsed.label, unitColumns[0].x + 6, unitRowY, {
            font: "F2",
            size: 8,
            color: "0.15 0.20 0.28",
          }),
        );
        [parsed.bedsBaths, parsed.current, parsed.projected, parsed.rehab].forEach(
          (value, columnIndex) => {
            pageCommands.push(
              makeText(
                value,
                unitColumns[columnIndex + 1].x + 6,
                unitRowY,
                { size: 8, color: "0.30 0.37 0.47" },
              ),
            );
          },
        );
      } else {
        const wrapped = wrapSummaryLine(line.replace(/^- /, ""), 92).slice(0, 1);

        pageCommands.push(
          makeText(wrapped[0] || "", marginX + 6, unitRowY, {
            size: 7.8,
            color: "0.20 0.25 0.34",
          }),
        );
      }

      unitRowY -= unitRowHeight;
    });

    let cursorY = unitRowY - 3;

    if (additionalIncomeItemLines.length > 0) {
      const incomeHeadingY = cursorY - 14;

      pageCommands.push(
        makeSectionHeading("Additional Income", marginX, incomeHeadingY, 524),
      );

      const incomeColumns = 2;
      const incomeColumnWidth = 262;
      const incomeRowHeight = 14;
      const incomeContentY = incomeHeadingY - 22;

      additionalIncomeItemLines.slice(0, 8).forEach((line, index) => {
        const [label, value] = splitLabelValue(line);
        const column = index % incomeColumns;
        const row = Math.floor(index / incomeColumns);
        const x = marginX + column * incomeColumnWidth;
        const y = incomeContentY - row * incomeRowHeight;

        pageCommands.push(
          makeText(label, x, y, {
            font: "F2",
            size: 8,
            color: "0.35 0.42 0.53",
          }),
        );
        pageCommands.push(
          makeText(value, x + 170, y, {
            font: "F2",
            size: 8,
            color: "0.08 0.11 0.18",
          }),
        );
      });

      const incomeRowsUsed = Math.ceil(
        Math.min(additionalIncomeItemLines.length, 8) / incomeColumns,
      );
      const incomeSummaryY =
        incomeContentY - incomeRowsUsed * incomeRowHeight - 8;

      pageCommands.push(
        makeText(
          `Additional Income Total: ${additionalIncomeTotal}`,
          marginX,
          incomeSummaryY,
          { font: "F2", size: 8.5, color: "0.08 0.11 0.18" },
        ),
      );

      if (additionalIncomeNotes !== "-") {
        wrapSummaryLine(additionalIncomeNotes, 100)
          .slice(0, 2)
          .forEach((line, index) => {
            pageCommands.push(
              makeText(line, marginX, incomeSummaryY - 14 - index * 10, {
                size: 7.5,
                color: "0.42 0.49 0.60",
              }),
            );
          });
      }

      cursorY = incomeSummaryY - (additionalIncomeNotes !== "-" ? 34 : 10);
    }

    const hasCommonRehabContent =
      commonRehabEntries.length > 0 || commonRehabNotes !== "-";

    if (hasCommonRehabContent) {
      const rehabHeadingY = cursorY - 14;

      pageCommands.push(
        makeSectionHeading("Common Area Rehab", marginX, rehabHeadingY, 524),
      );

      let rehabY = rehabHeadingY - 22;

      if (commonRehabEntries.length > 0) {
        commonRehabEntries.slice(0, 8).forEach((entry) => {
          pageCommands.push(
            makeText(entry.label, marginX, rehabY, {
              font: "F2",
              size: 8,
              color: "0.20 0.25 0.34",
            }),
          );
          pageCommands.push(
            makeText(entry.value, marginX + 220, rehabY, {
              font: "F2",
              size: 8,
              color: "0.08 0.11 0.18",
            }),
          );

          const noteLines = entry.note
            ? wrapSummaryLine(entry.note, 100).slice(0, 2)
            : [];

          noteLines.forEach((noteLine, noteIndex) => {
            pageCommands.push(
              makeText(noteLine, marginX, rehabY - 11 - noteIndex * 10, {
                size: 7.5,
                color: "0.45 0.52 0.63",
              }),
            );
          });

          const rowAdvance = 16 + noteLines.length * 10;

          pageCommands.push(
            makeLine(
              marginX,
              rehabY - rowAdvance + 6,
              marginX + contentWidth,
              rehabY - rowAdvance + 6,
              "0.94 0.96 0.98",
            ),
          );

          rehabY -= rowAdvance;
        });

        pageCommands.push(
          makeText(
            `Contingency: ${commonRehabContingency}   |   Common Area Rehab Total: ${commonRehabTotal}`,
            marginX,
            rehabY - 4,
            { font: "F2", size: 8.5, color: "0.08 0.11 0.18" },
          ),
        );

        rehabY -= 18;
      }

      if (commonRehabNotes !== "-") {
        const overallNoteLines = wrapSummaryLine(commonRehabNotes, 100).slice(
          0,
          2,
        );

        overallNoteLines.forEach((line, index) => {
          pageCommands.push(
            makeText(line, marginX, rehabY - index * 10, {
              size: 7.5,
              color: "0.42 0.49 0.60",
            }),
          );
        });

        rehabY -= overallNoteLines.length * 10 + 6;
      }
    }

    const content = pageCommands.join("\n");
    const objects: Array<Uint8Array[]> = [
      [encoder.encode("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")],
      [
        encoder.encode(
          "2 0 obj\n<< /Type /Pages /Kids [5 0 R] /Count 1 >>\nendobj\n",
        ),
      ],
      [
        encoder.encode(
          "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        ),
      ],
      [
        encoder.encode(
          "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
        ),
      ],
      [
        encoder.encode(
          `5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${
            pdfPhoto ? " /XObject << /Im1 7 0 R >>" : ""
          } >> /Contents 6 0 R >>\nendobj\n`,
        ),
      ],
      [
        encoder.encode(
          `6 0 obj\n<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream\nendobj\n`,
        ),
      ],
    ];

    if (pdfPhoto) {
      objects.push([
        encoder.encode(
          `7 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pdfPhoto.width} /Height ${pdfPhoto.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pdfPhoto.bytes.length} >>\nstream\n`,
        ),
        pdfPhoto.bytes,
        encoder.encode("\nendstream\nendobj\n"),
      ]);
    }

    const chunks: Uint8Array[] = [encoder.encode("%PDF-1.4\n")];
    const offsets = [0];
    let byteLength = chunks[0].length;

    objects.forEach((objectChunks) => {
      offsets.push(byteLength);
      objectChunks.forEach((chunk) => {
        chunks.push(chunk);
        byteLength += chunk.length;
      });
    });

    const xrefOffset = byteLength;
    const xrefLines = [
      `xref\n0 ${objects.length + 1}`,
      "0000000000 65535 f ",
      ...offsets
        .slice(1)
        .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>`,
      `startxref\n${xrefOffset}`,
      "%%EOF",
    ];

    chunks.push(encoder.encode(`${xrefLines.join("\n")}\n`));

    const pdfByteLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const pdfBytes = new Uint8Array(pdfByteLength);
    let writeOffset = 0;

    chunks.forEach((chunk) => {
      pdfBytes.set(chunk, writeOffset);
      writeOffset += chunk.length;
    });

    return new Blob([pdfBytes.buffer as ArrayBuffer], {
      type: "application/pdf",
    });
  }

  function savePdfBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = pdfFileName;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("PDF saved.");
  }

  async function downloadPdf() {
    setMessage("Preparing PDF...");
    savePdfBlob(await buildPdfBlob());
  }

  async function previewPdf() {
    const previewWindow = window.open("", "_blank");

    setMessage("Preparing preview...");
    const blob = await buildPdfBlob();

    if (!previewWindow) {
      savePdfBlob(blob);
      return;
    }

    previewWindow.location.href = URL.createObjectURL(blob);
    setMessage("");
  }

  async function sharePdf() {
    setMessage("Preparing PDF...");
    const blob = await buildPdfBlob();
    const file = new File([blob], pdfFileName, { type: "application/pdf" });

    if (!navigator.share) {
      savePdfBlob(blob);
      return;
    }

    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Property deal summary",
          files: [file],
        });
        setMessage("PDF shared.");
        return;
      }

      await navigator.share({
        title: "Property deal summary",
        text: "Property deal summary PDF is ready to download from Property Pipeline CRM.",
      });
      savePdfBlob(blob);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Could not share PDF.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={previewPdf}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          Preview PDF
        </button>
        <button
          type="button"
          onClick={sharePdf}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Share PDF
        </button>
        <button
          type="button"
          onClick={downloadPdf}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Save PDF
        </button>
      </div>

      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}
