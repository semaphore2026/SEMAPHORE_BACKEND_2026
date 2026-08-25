const ExcelJS = require("exceljs");

/**
 * Common color palette for professional Excel reports
 */
const PALETTE = {
  HEADER_BG: "1E293B", // Dark slate
  HEADER_FG: "FFFFFF", // White
  TITLE_BG: "312E81",  // Indigo dark
  TITLE_FG: "FFFFFF",  // White
  ACCENT_BG: "EEF2F6", // Soft gray-blue zebra stripe
  BORDER_COLOR: "CBD5E1", // Slate border
  APPROVED_BG: "DCFCE7", // Light green
  APPROVED_FG: "166534", // Dark green
  PENDING_BG: "FEF3C7",  // Light amber
  PENDING_FG: "92400E",  // Dark amber
  REJECTED_BG: "FEE2E2", // Light red
  REJECTED_FG: "991B1B", // Dark red
  UNPAID_BG: "F1F5F9",   // Slate gray
  UNPAID_FG: "475569",
};

/**
 * Standard thin border definition
 */
const THIN_BORDER = {
  top: { style: "thin", color: { argb: PALETTE.BORDER_COLOR } },
  left: { style: "thin", color: { argb: PALETTE.BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: PALETTE.BORDER_COLOR } },
  right: { style: "thin", color: { argb: PALETTE.BORDER_COLOR } },
};

/**
 * Format a worksheet with a title banner and metadata
 */
const addReportTitle = (worksheet, title, subtitle, totalColumns = 10) => {
  // Title Row
  const titleRow = worksheet.addRow([title]);
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, totalColumns);
  titleRow.font = { name: "Calibri", size: 16, bold: true, color: { argb: PALETTE.TITLE_FG } };
  titleRow.alignment = { vertical: "middle", horizontal: "center" };
  titleRow.height = 36;
  titleRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: PALETTE.TITLE_BG },
  };

  // Subtitle / Generated Timestamp Row
  const dateStr = `Generated on: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST | Semaphore 2026 Admin Portal`;
  const subRow = worksheet.addRow([subtitle ? `${subtitle} | ${dateStr}` : dateStr]);
  worksheet.mergeCells(subRow.number, 1, subRow.number, totalColumns);
  subRow.font = { name: "Calibri", size: 10, italic: true, color: { argb: "E0E7FF" } };
  subRow.alignment = { vertical: "middle", horizontal: "center" };
  subRow.height = 20;
  subRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "4338CA" },
  };

  // Blank spacer row
  const spaceRow = worksheet.addRow([]);
  spaceRow.height = 8;
};

/**
 * Format a header row for a table
 */
const formatHeaderRow = (row) => {
  row.height = 26;
  row.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: PALETTE.HEADER_FG } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: PALETTE.HEADER_BG },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = THIN_BORDER;
  });
};

/**
 * Style a data row with borders and optional zebra striping
 */
const formatDataRow = (row, isEven = false, alignments = {}) => {
  row.height = 22;
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { name: "Calibri", size: 10, color: { argb: "0F172A" } };
    cell.border = THIN_BORDER;
    
    // Check if column has custom alignment
    const colAlign = alignments[colNumber] || { vertical: "middle", horizontal: "left" };
    cell.alignment = colAlign;

    if (isEven) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: PALETTE.ACCENT_BG },
      };
    }
  });
};

/**
 * Apply status highlight style to a cell (Approved, Pending, Rejected, Unpaid)
 */
const applyStatusStyle = (cell, status) => {
  const s = String(status || "").toLowerCase().trim();
  cell.alignment = { vertical: "middle", horizontal: "center" };
  cell.font = { name: "Calibri", size: 10, bold: true };

  if (s === "approved" || s === "verified") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.APPROVED_BG } };
    cell.font = { ...cell.font, color: { argb: PALETTE.APPROVED_FG } };
  } else if (s === "pending" || s === "submitted") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.PENDING_BG } };
    cell.font = { ...cell.font, color: { argb: PALETTE.PENDING_FG } };
  } else if (s === "rejected") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.REJECTED_BG } };
    cell.font = { ...cell.font, color: { argb: PALETTE.REJECTED_FG } };
  } else {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.UNPAID_BG } };
    cell.font = { ...cell.font, color: { argb: PALETTE.UNPAID_FG } };
  }
};

/**
 * Auto-fit column widths based on maximum content length with minimum bounds
 */
const autoFitColumns = (worksheet, minWidths = {}) => {
  worksheet.columns.forEach((column, index) => {
    let maxLength = 10;
    const colIndex = index + 1;

    column.eachCell({ includeEmpty: false }, (cell) => {
      // Don't calculate width from merged banner rows (row 1 & 2)
      if (cell.row > 3) {
        const cellValue = cell.value ? String(cell.value) : "";
        if (cellValue.length > maxLength) {
          maxLength = Math.min(cellValue.length, 50); // Cap at 50 to avoid overly wide columns
        }
      }
    });

    const defaultMin = minWidths[colIndex] || 12;
    column.width = Math.max(maxLength + 4, defaultMin);
  });
};

/**
 * Clean sheet name to be valid for Excel (max 31 chars, no invalid characters)
 */
const sanitizeSheetName = (name, defaultName = "Sheet") => {
  if (!name) return defaultName;
  let clean = String(name).replace(/[:\\\/\?\*\[\]]/g, "_").trim();
  if (clean.length > 31) {
    clean = clean.substring(0, 31);
  }
  return clean || defaultName;
};

module.exports = {
  PALETTE,
  THIN_BORDER,
  addReportTitle,
  formatHeaderRow,
  formatDataRow,
  applyStatusStyle,
  autoFitColumns,
  sanitizeSheetName,
};
