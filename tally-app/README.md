# BizBooks — Tally-style Billing & Ledger Web App

A complete, offline, browser-based billing and ledger accounting system built with **pure HTML, CSS, and Vanilla JavaScript**. No backend, no database, no build tools, no frameworks. All data is stored in the browser's **LocalStorage**.

## Project Structure

```
tally-app/
├── index.html          Main application shell (all views + modals)
├── css/
│   └── style.css       Professional blue/white/slate accounting theme, responsive
├── js/
│   └── app.js          Full application logic: storage, CRUD, calculations, rendering
└── README.md
```

## How to Run

No installation required.

1. Download / copy the `tally-app` folder.
2. Double-click `index.html` (or open it via **File → Open** in any modern browser: Chrome, Edge, Firefox, Safari).
3. The app loads instantly and seeds two sample parties, two sample invoices, and one sample receipt on first run so you can explore immediately.

That's it — everything runs client-side and persists in `localStorage` under the key `bizbooks_data_v1`.

## Modules

1. **Dashboard** — Total Sales, Total Receivable, Total Received, Total TDS, Party count, Invoice count, recent invoices/receipts, top outstanding parties.
2. **Party Master** — Full CRUD with Party Name, A/C To, Bill To, Ship To, GSTIN, Mobile, Email, Address, Opening Balance, Dr/Cr. Search by name/GSTIN/mobile.
3. **Sales Invoice** — Invoice No, Date, Party, A/C To, Bill To, Ship To, Description, Taxable Amount, GST% (0/5/12/18/28). Auto-calculates GST Amount, Invoice Total, optional TDS (1%/2%), TDS Amount, and Net Receivable.
4. **Receipts** — Receipt No, Date, Party, Amount, Payment Mode, Bank/Cash, Reference, Narration. Automatically reduces party outstanding.
5. **Party Ledger** — Tally-style statement: Date | Particular | Reference | Debit | Credit | Running Balance | Dr/Cr, with opening/closing balance summary cards, date-range filter, and print.
6. **Outstanding** — Party-wise Invoice Amount, Received, TDS, Balance, Status (Pending / Partially Received / Cleared), with search and status filter.
7. **TDS Report** — Date, Invoice No, Party, Invoice Total, TDS Rate, TDS Amount, Net, with totals row and filters.
8. **GST Report** — Date, Invoice No, Party, Taxable, GST Rate, GST Amount, Total, with totals row and filters.
9. **Invoice Print/PDF** — Professional A4-ready printable invoice with company header, Bill To/Ship To/A/C To, item table, GST & TDS breakdown, bank details, and signature block. Uses the browser's native Print → "Save as PDF".
10. **Backup/Restore** — Download entire dataset as a `.json` file; restore from a previously downloaded backup (with confirmation); or erase all data and start fresh.
11. **Settings** — Company Name, GSTIN, Mobile, Email, Address, Bank details, Invoice/Receipt numbering prefixes, and default invoice notes/terms.

## Core Business Logic

**Invoice calculations**
```
GST Amount      = Taxable Amount × GST%
Invoice Total   = Taxable Amount + GST Amount
(if TDS = Yes)
TDS Amount      = Invoice Total × TDS%
Net Receivable  = Invoice Total − TDS Amount
```

**Outstanding balance (per party)**
```
Outstanding = Opening Balance (signed by Dr/Cr) + Σ Net Receivable (all invoices) − Σ Receipts
```
A positive result is shown as **Dr** (amount receivable from the party); a negative result is **Cr**.

**Ledger**
Every invoice posts a **Debit** entry (Net Receivable) and every receipt posts a **Credit** entry, sorted chronologically per party, with a running balance carried from the opening balance.

Saving an invoice or a receipt automatically refreshes: Ledger, Outstanding, Dashboard, TDS Report, and GST Report — there is no separate "sync" step.

## Data Structure (LocalStorage)

```json
{
  "parties": [
    {
      "id": "party_xxx",
      "partyName": "Sharma Traders",
      "acTo": "Sharma Traders",
      "billTo": "Sharma Traders, Karol Bagh, Delhi",
      "shipTo": "Same as Bill To",
      "gstin": "07AAACS1234F1Z5",
      "mobile": "9811122233",
      "email": "sharma@traders.in",
      "address": "Karol Bagh, Delhi",
      "openingBalance": 5000,
      "openingType": "Dr"
    }
  ],
  "invoices": [
    {
      "id": "inv_xxx",
      "invoiceNo": "INV-0001",
      "date": "2026-08-25",
      "partyId": "party_xxx",
      "acTo": "...", "billTo": "...", "shipTo": "...",
      "description": "Consulting Services",
      "taxableAmount": 50000,
      "gstRate": 18,
      "tdsApplicable": "Yes",
      "tdsRate": 2
    }
  ],
  "receipts": [
    {
      "id": "rcpt_xxx",
      "receiptNo": "RCT-0001",
      "date": "2026-08-25",
      "partyId": "party_xxx",
      "amount": 20000,
      "paymentMode": "Bank Transfer",
      "bankCash": "HDFC Bank",
      "reference": "UTR123456",
      "narration": "Advance received"
    }
  ],
  "settings": {
    "companyName": "Your Company Name",
    "companyGSTIN": "", "companyMobile": "", "companyEmail": "", "companyAddress": "",
    "bankName": "", "bankAccount": "", "ifsc": "",
    "invoicePrefix": "INV-", "receiptPrefix": "RCT-",
    "invoiceNotes": "Thank you for your business. Payment due within 15 days."
  }
}
```

GST, GST Amount, Invoice Total, TDS Amount, and Net Receivable are **derived values** — they are computed on the fly from `taxableAmount`, `gstRate`, `tdsApplicable`, and `tdsRate` wherever needed (invoice table, ledger, reports, print), rather than being stored redundantly, so editing an invoice always keeps every dependent screen consistent.

## UI Features

- Fixed sidebar navigation (desktop) that collapses into a slide-in drawer with backdrop on mobile/tablet.
- Fully responsive layout: cards, tables, and forms reflow for small screens.
- Modal dialogs for creating/editing Parties, Invoices, and Receipts.
- Custom confirm dialog for all destructive actions (delete party/invoice/receipt, restore, reset).
- Toast notifications for success/error/info feedback.
- Live search and filters on every list/report view.
- Print-optimized invoice and ledger layouts (hides app chrome, prints only the document) — use the browser's Print dialog and choose "Save as PDF" for a PDF export.
- Blue / white / slate professional accounting color theme throughout.

## Browser Support

Any modern evergreen browser (Chrome, Edge, Firefox, Safari) with LocalStorage enabled. No internet connection required after the files are downloaded — the app has zero external dependencies.

## Notes

- All monetary values are stored and computed as plain numbers (rounded to 2 decimals) and displayed in Indian Rupee (₹) format with Indian digit grouping.
- Deleting a Party does not delete its historical Invoices/Receipts; they will simply display as "Unknown Party" in lists (data integrity is preserved for reporting).
- Use **Backup** regularly since all data lives only in this browser's LocalStorage (clearing browser data will erase it unless you have a backup file).
