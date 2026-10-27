<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-09.md -->
# Manual reading, part 9 (features 793 to 891, the lines that are Bengali only)

Read against the code on 2026-10-27; nothing was opened in a browser. Results: present, partial, not found, check in browser.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 794 | Subtotal calculation | present | `lib/invoice/calc.ts`; `scripts/verify/step09-calc.ts` |
| 797 | Compound and multi-tax calculation | present | `compound` flag per tax in `calc.ts` |
| 799 | Rounding adjustment line | present | `cashRoundingAdjustment` in `lib/invoice/rounding.ts`, shown in `components/invoice/totals-panel.tsx` |
| 800 | Grand total calculation | present | `calc.ts` |
| 802 | Banker's rounding option | present | `half_even` in `ROUNDING_MODES` |
| 803 | Line against total rounding policy | present | rounding settings in `components/invoice/tax-settings-form.tsx` |
| 807 | Discount before or after tax, configurable | present | `before_tax` and `after_tax` in `calc.ts` |
| 816 | Duplicate number check | present | unique index `uq_invoice_number` in `migrations/S09_002_invoices_core.sql` |
| 818 | Status "sent" | present | `lib/invoice/status.ts` |
| 827 | Manual status override, owner only | present | `/api/invoices/[id]/status`, permission `invoice.override_status` |
| 841 | Invoice category | present | `category` in `lib/invoice/input.ts` |
| 842 | Invoice project link | present | `projectId` in `lib/invoice/input.ts` |
| 864 | Print-perfect A4 | present | `paperSize` a4 or letter; PDF pages in `lib/pdf/invoice-pdf.tsx` |
| 867 | Real-time template preview | check in browser | four templates (classic, modern, minimal, detailed); whether the form previews them live was not read |
| 869 | Template save and load per tenant | partial | the template is a choice on each invoice, not a saved company template |
| 870 | Industry-specific template presets | not found | the four templates are generic |
| 871 | Branding auto-fill from owner settings | present | the PDF reads the company logo and address |
| 873 | Company name and address auto-fill | present | `lib/pdf/invoice-pdf.tsx` (`addressLines`) |
| 876 | Branded e-mail header | check in browser | same as 566 |
| 879 | Font embedding and Unicode support | partial | `lib/pdf/shared/fonts.ts` embeds a Unicode font only when `PDF_FONT_DIR` points to `regular.ttf` and `bold.ttf`; no font file is in the repository and the variable is empty, so PDFs use Helvetica (Western European text only) |
| 880 | Multi-page table with a repeated header | present | the table header is `fixed` in `invoice-pdf.tsx` |
| 882 | "Page X of Y" footer | present | `invoice-pdf.tsx`, `report-pdf.tsx` |
| 889 | Object stream compression (about 70 percent smaller) | check in browser | the PDF engine is react-pdf; the size was not measured |

## Not built: 870. Partly built: 869, 879.
