"use client";

import { useState } from "react";
import { Copy, Download, Share2 } from "lucide-react";

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

  function parseSummarySections() {
    const lines = summary.split("\n").map((line) => line.trim());
    const title = lines[0] || "Property Pipeline CRM Deal Summary";
    const currentIndex = lines.indexOf("Current View");
    const projectedIndex = lines.indexOf("Projected View");
    const unitsIndex = lines.indexOf("Units");
    const noteIndex = lines.findIndex((line) => line.startsWith("Planning note:"));
    const propertyLines = lines
      .slice(1, currentIndex === -1 ? undefined : currentIndex)
      .filter(Boolean);
    const currentLines = lines
      .slice(currentIndex + 1, projectedIndex)
      .filter(Boolean);
    const projectedLines = lines
      .slice(projectedIndex + 1, unitsIndex)
      .filter(Boolean);
    const unitLines = lines
      .slice(unitsIndex + 1, noteIndex === -1 ? undefined : noteIndex)
      .filter(Boolean);
    const note = noteIndex === -1 ? "" : lines[noteIndex];

    return {
      title,
      address: propertyLines[0] || "Untitled Property",
      propertyLines: propertyLines.slice(1),
      currentLines,
      projectedLines,
      unitLines,
      note,
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

  function makeTable(title: string, lines: string[], x: number, y: number) {
    const width = 250;
    const commands: string[] = [
      makeText(title, x, y, {
        font: "F2",
        size: 12,
        color: "0.08 0.11 0.18",
      }),
      makeRect(x, y - 10, 38, 2, { fill: "0.15 0.38 0.92" }),
      makeLine(x, y - 16, x + width, y - 16, "0.88 0.91 0.95"),
    ];
    let cursorY = y - 36;

    lines.forEach((line) => {
      const [label, value] = splitLabelValue(line);
      const valueLines = wrapSummaryLine(value, 28).slice(0, 3);
      const rowHeight = Math.max(24, valueLines.length * 11 + 10);

      commands.push(
        makeText(label, x + 10, cursorY, {
          font: "F2",
          size: 8,
          color: "0.42 0.49 0.60",
        }),
      );
      valueLines.forEach((valueLine, valueIndex) => {
        commands.push(
          makeText(valueLine, x + 126, cursorY - valueIndex * 11, {
            font: "F2",
            size: 9.5,
            color: "0.08 0.11 0.18",
          }),
        );
      });
      commands.push(makeLine(x, cursorY - rowHeight + 7, x + width, cursorY - rowHeight + 7, "0.93 0.95 0.97"));
      cursorY -= rowHeight;
    });

    return { commands, bottomY: cursorY };
  }

  function makeMetricCard(
    label: string,
    value: string,
    x: number,
    y: number,
    width: number,
    options: { accent?: string; dark?: boolean } = {},
  ) {
    const dark = options.dark === true;
    const fill = dark ? "0.08 0.11 0.18" : "0.98 0.99 1";
    const stroke = dark ? "0.08 0.11 0.18" : "0.92 0.95 0.98";
    const labelColor = dark ? "0.68 0.78 0.92" : "0.45 0.52 0.63";
    const valueColor = dark ? "1 1 1" : "0.08 0.11 0.18";
    const commands = [
      makeRect(x, y, width, 58, { fill, stroke }),
      makeRect(x, y + 56, width, 2, {
        fill: options.accent || (dark ? "0.15 0.38 0.92" : "0.86 0.91 0.98"),
      }),
      makeText(label.toUpperCase(), x + 12, y + 38, {
        font: "F2",
        size: 7,
        color: labelColor,
      }),
      makeText(value, x + 12, y + 17, {
        font: "F2",
        size: value.length > 14 ? 11 : 14,
        color: valueColor,
      }),
    ];

    return commands.join("\n");
  }

  async function buildPdfBlob() {
    const encoder = new TextEncoder();
    const pageWidth = 612;
    const pageHeight = 792;
    const marginX = 44;
    const bottomY = 54;
    const sections = parseSummarySections();
    const pdfPhoto = await getPdfPhoto();
    const pageCommands: string[] = [];
    const reportDate = new Date().toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const askingPrice = getLineValue(sections.currentLines, "Asking price");
    const projectedPurchasePrice = getLineValue(
      sections.projectedLines,
      "Projected purchase price",
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

    pageCommands.push(makeRect(0, 0, pageWidth, pageHeight, { fill: "1 1 1" }));
    pageCommands.push(makeRect(0, 692, pageWidth, 100, { fill: "0.06 0.09 0.16" }));
    pageCommands.push(makeRect(0, 688, pageWidth, 4, { fill: "0.15 0.38 0.92" }));
    pageCommands.push(makeText("PROPERTY PIPELINE CRM", marginX, 764, {
      font: "F2",
      size: 10,
      color: "0.68 0.78 0.92",
    }));
    pageCommands.push(makeText("Investment Deal Summary", marginX, 738, {
      font: "F2",
      size: 24,
      color: "1 1 1",
    }));
    pageCommands.push(makeText(`Prepared ${reportDate}`, 472, 764, {
      size: 8,
      color: "0.68 0.78 0.92",
    }));
    pageCommands.push(makeText(sections.address, marginX, 714, {
      font: "F2",
      size: 13,
      color: "0.88 0.93 1",
    }));

    let detailsY = 666;
    sections.propertyLines.slice(0, 4).forEach((line) => {
      pageCommands.push(makeText(line, marginX, detailsY, {
        size: 8,
        color: "0.45 0.52 0.63",
      }));
      detailsY -= 12;
    });

    const photoBox = { x: 390, y: 596, width: 178, height: 112 };
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
        makeText("Property photo", photoBox.x + 48, photoBox.y + 68, {
          font: "F2",
          size: 10,
          color: "0.31 0.38 0.49",
        }),
      );
      pageCommands.push(
        makeText("Listing or walkthrough image", photoBox.x + 30, photoBox.y + 50, {
          size: 8,
          color: "0.45 0.52 0.63",
        }),
      );
    }

    pageCommands.push(
      makeMetricCard("Asking Price", askingPrice, 44, 604, 104, {
        accent: "0.15 0.38 0.92",
      }),
    );
    pageCommands.push(
      makeMetricCard("Projected Price", projectedPurchasePrice, 158, 604, 114, {
        accent: "0.15 0.38 0.92",
      }),
    );
    pageCommands.push(
      makeMetricCard("Projected NOI", projectedNoi, 282, 604, 94, {
        dark: true,
      }),
    );
    pageCommands.push(makeText(
      `Projected cap ${projectedCapRate}   |   Debt service ${annualDebtService}   |   Rehab ${totalRehab}`,
      44,
      580,
      {
        font: "F2",
        size: 8.5,
        color: "0.42 0.49 0.60",
      },
    ));
    pageCommands.push(makeLine(44, 566, 376, 566, "0.88 0.91 0.95"));

    const currentTable = makeTable("Current View", sections.currentLines, 44, 526);
    const projectedTable = makeTable(
      "Projected View",
      sections.projectedLines,
      318,
      526,
    );
    pageCommands.push(...currentTable.commands, ...projectedTable.commands);

    let cursorY = Math.min(currentTable.bottomY, projectedTable.bottomY) - 24;

    pageCommands.push(makeText("Unit Rent Roll", marginX, cursorY, {
      font: "F2",
      size: 12,
      color: "0.08 0.11 0.18",
    }));
    pageCommands.push(makeLine(marginX, cursorY - 8, 568, cursorY - 8));
    cursorY -= 22;

    sections.unitLines.slice(0, 7).forEach((line, index) => {
      wrapSummaryLine(line.replace(/^- /, ""), 94).forEach((wrappedLine, lineIndex) => {
        if (cursorY < bottomY) return;
        if (lineIndex === 0) {
          pageCommands.push(
            makeRect(marginX, cursorY - 6, 524, 17, {
              fill: index % 2 === 0 ? "0.98 0.99 1" : "1 1 1",
            }),
          );
        }
        pageCommands.push(
          makeText(wrappedLine, marginX + 8, cursorY, {
            size: 8,
            color: "0.20 0.25 0.34",
          }),
        );
        cursorY -= 12;
      });
    });

    if (sections.note && cursorY > bottomY + 34) {
      cursorY -= 10;
      wrapSummaryLine(sections.note, 96).forEach((line) => {
        pageCommands.push(makeText(line, marginX, cursorY, {
          size: 8,
          color: "0.45 0.52 0.63",
        }));
        cursorY -= 11;
      });
    }

    pageCommands.push(makeText("Planning estimate - verify before making offers.", marginX, 28, {
      size: 7,
      color: "0.45 0.52 0.63",
    }));

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

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary);
      setMessage("Text summary copied.");
    } catch {
      setMessage("Could not copy summary.");
    }
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
          onClick={copySummary}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copy Text
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
