/* =========================================================================
   BizBooks — Tally-style Billing & Ledger Web App
   Pure HTML + CSS + Vanilla JS + LocalStorage. No frameworks, no backend.
   ========================================================================= */

(function () {
  "use strict";

  /* ============================= STORAGE ================================ */
  const STORAGE_KEY = "bizbooks_data_v1";
  const COMPANIES_KEY = "bizbooks_companies_v1";
  const ACTIVE_COMPANY_KEY = "bizbooks_active_company_v1";
  const THEME_KEY = "bizbooks_theme_v1";
  const SESSION_KEY = "bizbooks_session_v1";
  const ACCOUNTS = {
    Bhim: { password: "Bhim1999", role: "Admin" },
    Anil: { password: "Anil123", role: "User" }
  };

  const DEFAULT_SETTINGS = {
    companyName: "Your Company Name",
    companyGSTIN: "",
    state: "Delhi",
    stateCode: "07",
    companyMobile: "",
    companyEmail: "",
    companyAddress: "",
    bankName: "",
    bankAccount: "",
    ifsc: "",
    invoicePrefix: "INV-",
    receiptPrefix: "RCT-",
    purchasePrefix: "PUR-",
    paymentPrefix: "PAY-",
    invoiceNotes: "Thank you for your business. Payment due within 15 days."
  };

  /* ============================= INDIAN STATES / GST CODES =============== */
  const INDIAN_STATES = [
    ["01", "Jammu and Kashmir"], ["02", "Himachal Pradesh"], ["03", "Punjab"], ["04", "Chandigarh"],
    ["05", "Uttarakhand"], ["06", "Haryana"], ["07", "Delhi"], ["08", "Rajasthan"], ["09", "Uttar Pradesh"],
    ["10", "Bihar"], ["11", "Sikkim"], ["12", "Arunachal Pradesh"], ["13", "Nagaland"], ["14", "Manipur"],
    ["15", "Mizoram"], ["16", "Tripura"], ["17", "Meghalaya"], ["18", "Assam"], ["19", "West Bengal"],
    ["20", "Jharkhand"], ["21", "Odisha"], ["22", "Chhattisgarh"], ["23", "Madhya Pradesh"], ["24", "Gujarat"],
    ["26", "Dadra and Nagar Haveli and Daman and Diu"], ["27", "Maharashtra"], ["29", "Karnataka"],
    ["30", "Goa"], ["31", "Lakshadweep"], ["32", "Kerala"], ["33", "Tamil Nadu"], ["34", "Puducherry"],
    ["35", "Andaman and Nicobar Islands"], ["36", "Telangana"], ["37", "Andhra Pradesh"], ["38", "Ladakh"]
  ];
  const STATE_CODE_MAP = {};
  INDIAN_STATES.forEach(([code, name]) => (STATE_CODE_MAP[name] = code));

  function populateStateSelect(selectEl, selectedValue) {
    if (!selectEl) return;
    selectEl.innerHTML =
      `<option value="">-- Select State --</option>` +
      INDIAN_STATES.map(([code, name]) => `<option value="${name}">${name}</option>`).join("");
    if (selectedValue) selectEl.value = selectedValue;
  }

  // State-wise GST breakup: same state = CGST+SGST split; different state = IGST
  function showGstDetectionPopup(partyId) {
    const party = partyById(partyId);
    if (!party) return;
    const companyState = DB.settings.state || "-";
    const companyCode = DB.settings.stateCode || "";
    const partyState = party.state || "-";
    const partyCode = party.stateCode || "";
    const isInter = !!(companyCode && partyCode && companyCode !== partyCode);

    document.getElementById("gstDetectPartyName").textContent = party.partyName || "-";
    document.getElementById("gstDetectPartyState").textContent = partyState + (partyCode ? " (" + partyCode + ")" : "");
    document.getElementById("gstDetectCompanyState").textContent = companyState + (companyCode ? " (" + companyCode + ")" : "");

    const typeEl = document.getElementById("gstDetectType");
    const subEl = document.getElementById("gstDetectSubtype");
    if (isInter) {
      typeEl.textContent = "INTER-STATE GST";
      typeEl.className = "gst-detect-type inter";
      subEl.textContent = "IGST";
    } else {
      typeEl.textContent = "INTRA-STATE GST";
      typeEl.className = "gst-detect-type intra";
      subEl.textContent = "CGST + SGST";
    }
    document.getElementById("gstDetectionOverlay").classList.remove("hidden");
  }


  function computeGstBreakup(taxable, gstRate, companyStateCode, partyStateCode) {
    const totalGstAmount = round2((taxable * gstRate) / 100);
    const interState = !!(companyStateCode && partyStateCode && companyStateCode !== partyStateCode);
    if (interState) {
      return {
        taxType: "IGST",
        cgstRate: 0, cgstAmount: 0,
        sgstRate: 0, sgstAmount: 0,
        igstRate: gstRate, igstAmount: totalGstAmount,
        gstAmount: totalGstAmount
      };
    }
    const halfRate = round2(gstRate / 2);
    const halfAmount = round2(totalGstAmount / 2);
    const sgstAmount = round2(totalGstAmount - halfAmount);
    return {
      taxType: "CGST_SGST",
      cgstRate: halfRate, cgstAmount: halfAmount,
      sgstRate: halfRate, sgstAmount: sgstAmount,
      igstRate: 0, igstAmount: 0,
      gstAmount: totalGstAmount
    };
  }

  function defaultData() {
    return { parties: [], invoices: [], purchases: [], receipts: [], payments: [], notes: [], auditTrail: [], settings: { ...DEFAULT_SETTINGS } };
  }

  let activeCompanyId = "";
  let DB = loadData();

  function loadData() {
    try {
      let registry = JSON.parse(localStorage.getItem(COMPANIES_KEY) || "null");
      if (!registry || !Array.isArray(registry.companies)) {
        const raw = localStorage.getItem(STORAGE_KEY), legacy = raw ? JSON.parse(raw) : defaultData();
        const settings = legacy.settings || DEFAULT_SETTINGS, id = "company_" + Date.now().toString(36);
        registry = { companies: [{ id, companyName: settings.companyName && settings.companyName !== "Your Company Name" ? settings.companyName : "My Company", companyGSTIN: settings.companyGSTIN || "", state: settings.state || "Delhi", stateCode: settings.stateCode || "07", companyAddress: settings.companyAddress || "", companyMobile: settings.companyMobile || "", companyEmail: settings.companyEmail || "", financialYear: "", data: legacy }], activeCompanyId: id };
        localStorage.setItem(COMPANIES_KEY, JSON.stringify(registry));
      }
      activeCompanyId = localStorage.getItem(ACTIVE_COMPANY_KEY) || registry.activeCompanyId || registry.companies[0].id;
      let company = registry.companies.find(c => c.id === activeCompanyId) || registry.companies[0];
      activeCompanyId = company.id; localStorage.setItem(ACTIVE_COMPANY_KEY, activeCompanyId); registry.activeCompanyId = activeCompanyId; localStorage.setItem(COMPANIES_KEY, JSON.stringify(registry));
      const parsed = company.data || defaultData();
      return {
        parties: Array.isArray(parsed.parties) ? parsed.parties : [],
        invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
        purchases: Array.isArray(parsed.purchases) ? parsed.purchases : [],
        receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [],
        payments: Array.isArray(parsed.payments) ? parsed.payments : [],
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
        auditTrail: Array.isArray(parsed.auditTrail) ? parsed.auditTrail : [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }
      };
    } catch (e) {
      console.error("Failed to load data, starting fresh.", e);
      return defaultData();
    }
  }

  function saveData() {
    const registry = JSON.parse(localStorage.getItem(COMPANIES_KEY) || "{\"companies\":[]}");
    const company = registry.companies.find(c => c.id === activeCompanyId);
    if (company) { company.data = DB; Object.assign(company, { companyName: DB.settings.companyName, companyGSTIN: DB.settings.companyGSTIN, state: DB.settings.state, stateCode: DB.settings.stateCode, companyAddress: DB.settings.companyAddress, companyMobile: DB.settings.companyMobile, companyEmail: DB.settings.companyEmail }); registry.activeCompanyId = activeCompanyId; localStorage.setItem(COMPANIES_KEY, JSON.stringify(registry)); }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /* ============================= HELPERS ================================ */
  function fmtMoney(n) {
    n = Number(n) || 0;
    const neg = n < 0;
    n = Math.abs(n);
    const s = n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (neg ? "-" : "") + "₹" + s;
  }
  function fmtNum(n) {
    n = Number(n) || 0;
    return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDate(d) {
    if (!d) return "-";
    const dt = new Date(d + "T00:00:00");
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  function fmtServiceMonth(month) {
    if (!month) return "-";
    const parts = String(month).split("-");
    if (parts.length !== 2) return month;
    return new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }
  function fmtServicePeriod(inv) {
    return inv && (inv.serviceFrom || inv.serviceTo) ? fmtDate(inv.serviceFrom) + " to " + fmtDate(inv.serviceTo) : "-";
  }
  function todayISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }
  function escapeHtml(str) {
    if (str === undefined || str === null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function partyById(id) {
    return DB.parties.find((p) => p.id === id);
  }

  /* ============================= TOASTS ================================= */
  function toast(message, type) {
    type = type || "info";
    const container = document.getElementById("toastContainer");
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateX(30px)";
      el.style.transition = "all .2s ease";
      setTimeout(() => el.remove(), 220);
    }, 2600);
  }

  /* ============================= CONFIRM DIALOG ========================== */
  function confirmDialog(message, title) {
    return new Promise((resolve) => {
      const overlay = document.getElementById("confirmOverlay");
      document.getElementById("confirmTitle").textContent = title || "Are you sure?";
      document.getElementById("confirmMessage").textContent = message || "This action cannot be undone.";
      overlay.classList.remove("hidden");

      const okBtn = document.getElementById("confirmOkBtn");
      const cancelBtn = document.getElementById("confirmCancelBtn");

      function cleanup(result) {
        overlay.classList.add("hidden");
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
    });
  }

  /* ============================= CORE CALCULATIONS ======================= */
  // Invoice financial breakdown
  function computeInvoiceTotals(inv) {
    const taxable = Number(inv.taxableAmount) || 0;
    const gstRate = Number(inv.gstRate) || 0;
    const party = partyById(inv.partyId);
    const breakup = computeGstBreakup(taxable, gstRate, DB.settings.stateCode || "", party ? party.stateCode || "" : "");
    const gstAmount = breakup.gstAmount;
    const total = round2(taxable + gstAmount);
    let tdsAmount = 0;
    let netReceivable = total;
    if (inv.tdsApplicable === "Yes") {
      const tdsRate = Number(inv.tdsRate) || 0;
      tdsAmount = round2((total * tdsRate) / 100);
      netReceivable = round2(total - tdsAmount);
    }
    return { taxable, gstRate, gstAmount, total, tdsAmount, netReceivable, ...breakup };
  }
  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }
  function computeNoteTotals(note) {
    const taxable = Number(note.taxableAmount) || 0, gstRate = Number(note.gstRate) || 0;
    const party = partyById(note.partyId);
    const breakup = computeGstBreakup(taxable, gstRate, DB.settings.stateCode || "", party ? party.stateCode || "" : "");
    const total = round2(taxable + breakup.gstAmount), tdsAdjustment = Math.min(total, Number(note.tdsAdjustment) || 0);
    return { taxable, gstRate, total, tdsAdjustment, netAdjustment: round2(total - tdsAdjustment), ...breakup };
  }
  function remainingReversibleAmount(referenceType, referenceId, excludeNoteId) {
    const source = referenceType === "purchase" ? DB.purchases.find(p => p.id === referenceId) : DB.invoices.find(i => i.id === referenceId);
    if (!source) return 0;
    const original = referenceType === "purchase" ? computePurchaseTotals(source).total : computeInvoiceTotals(source).total;
    const used = DB.notes.filter(n => n.referenceType === referenceType && n.referenceId === referenceId && n.id !== excludeNoteId && n.status !== "VOID").reduce((sum, n) => sum + computeNoteTotals(n).total, 0);
    return Math.max(0, round2(original - used));
  }
  function addAudit(action, entity, id, details) { DB.auditTrail.push({ id: uid("audit"), at: new Date().toISOString(), action, entity, entityId: id, details: details || "" }); }

  // Total received against a party from receipts
  function totalReceivedForParty(partyId) {
    return DB.receipts
      .filter((r) => r.partyId === partyId)
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }

  // Net invoice value (after TDS) for a party - this is what's "billed" to ledger as debit
  function totalNetInvoicedForParty(partyId) {
    return DB.invoices
      .filter((i) => i.partyId === partyId)
      .reduce((sum, i) => sum + computeInvoiceTotals(i).netReceivable, 0) - DB.notes.filter(n => n.partyId === partyId && n.referenceType === "sales" && n.status !== "VOID").reduce((s, n) => s + computeNoteTotals(n).netAdjustment, 0);
  }
  function totalTdsForParty(partyId) {
    return DB.invoices
      .filter((i) => i.partyId === partyId)
      .reduce((sum, i) => sum + computeInvoiceTotals(i).tdsAmount, 0);
  }
  function totalInvoiceGrossForParty(partyId) {
    return DB.invoices
      .filter((i) => i.partyId === partyId)
      .reduce((sum, i) => sum + computeInvoiceTotals(i).total, 0);
  }

  function openingSignedValue(party) {
    const amt = Number(party.openingBalance) || 0;
    return party.openingType === "Cr" ? -amt : amt; // Dr = positive (receivable), Cr = negative
  }

  // Outstanding = Opening Balance + Net Invoices (after TDS) - Receipts
  function outstandingForParty(partyId) {
    const party = partyById(partyId);
    if (!party) return 0;
    const opening = openingSignedValue(party);
    const netInvoiced = totalNetInvoicedForParty(partyId);
    const received = totalReceivedForParty(partyId);
    return round2(opening + netInvoiced - received);
  }

  function outstandingStatus(balance, hasInvoices, received) {
    if (round2(balance) <= 0.004) return "Cleared";
    if (received > 0) return "Partially Received";
    return "Pending";
  }

  /* Build full Tally-style ledger entries for a party, sorted by date */
  function buildLedger(partyId, fromDate, toDate) {
    const party = partyById(partyId);
    if (!party) return { rows: [], openingBalance: 0 };

    const entries = [];

    DB.invoices
      .filter((i) => i.partyId === partyId)
      .forEach((i) => {
        const t = computeInvoiceTotals(i);
        entries.push({
          date: i.date,
          particular: "Sales Invoice",
          reference: i.invoiceNo,
          debit: t.netReceivable,
          credit: 0,
          sortKey: i.date + "_1_" + i.invoiceNo
        });
      });

    DB.receipts
      .filter((r) => r.partyId === partyId)
      .forEach((r) => {
        entries.push({
          date: r.date,
          particular: "Receipt (" + (r.paymentMode || "Cash") + ")",
          reference: r.receiptNo,
          debit: 0,
          credit: Number(r.amount) || 0,
          sortKey: r.date + "_2_" + r.receiptNo
        });
      });

    DB.notes.filter((n) => n.partyId === partyId && n.referenceType === "sales" && n.status !== "VOID").forEach((n) => {
      const t = computeNoteTotals(n);
      entries.push({ date:n.date, particular:n.noteType, reference:n.noteNo + " / " + n.referenceNo, debit:0, credit:t.netAdjustment, sortKey:n.date + "_3_" + n.noteNo });
    });

    entries.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));

    const opening = openingSignedValue(party);
    let running = opening;

    // Filter by date range for display, but opening balance always includes prior entries
    const filtered = [];
    entries.forEach((e) => {
      const beforeRange = fromDate && e.date < fromDate;
      running += e.debit - e.credit;
      if (beforeRange) return;
      if (toDate && e.date > toDate) return;
      filtered.push({ ...e, balanceAfter: running });
    });

    // Recompute opening balance shown = balance just before the filtered range starts
    let openingForRange = opening;
    if (fromDate) {
      entries.forEach((e) => {
        if (e.date < fromDate) openingForRange += e.debit - e.credit;
      });
    }

    return { rows: filtered, openingBalance: openingForRange, closingBalance: running };
  }

  /* ============================= PURCHASE CALCULATIONS ==================== */
  // Purchase financial breakdown (mirrors computeInvoiceTotals, payable-side)
  function computePurchaseTotals(pur) {
    const taxable = Number(pur.taxableAmount) || 0;
    const gstRate = Number(pur.gstRate) || 0;
    const party = partyById(pur.partyId);
    const breakup = computeGstBreakup(taxable, gstRate, DB.settings.stateCode || "", party ? party.stateCode || "" : "");
    const gstAmount = breakup.gstAmount;
    const total = round2(taxable + gstAmount);
    let tdsAmount = 0;
    let netPayable = total;
    if (pur.tdsApplicable === "Yes") {
      const tdsRate = Number(pur.tdsRate) || 0;
      tdsAmount = round2((total * tdsRate) / 100);
      netPayable = round2(total - tdsAmount);
    }
    return { taxable, gstRate, gstAmount, total, tdsAmount, netPayable, ...breakup };
  }

  function totalPaymentsForParty(partyId) {
    return DB.payments
      .filter((p) => p.partyId === partyId)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }
  function totalNetPayableForParty(partyId) {
    return DB.purchases
      .filter((p) => p.partyId === partyId)
      .reduce((sum, p) => sum + computePurchaseTotals(p).netPayable, 0) - DB.notes.filter(n => n.partyId === partyId && n.referenceType === "purchase" && n.status !== "VOID").reduce((s, n) => s + computeNoteTotals(n).netAdjustment, 0);
  }
  function totalPurchaseTdsForParty(partyId) {
    return DB.purchases
      .filter((p) => p.partyId === partyId)
      .reduce((sum, p) => sum + computePurchaseTotals(p).tdsAmount, 0);
  }
  function totalPurchaseGrossForParty(partyId) {
    return DB.purchases
      .filter((p) => p.partyId === partyId)
      .reduce((sum, p) => sum + computePurchaseTotals(p).total, 0);
  }

  // Payable = Net Payable (all purchases) - Payments made. No opening balance
  // is applied here since Party Master's opening balance/Dr-Cr belongs to Sales.
  function payableForParty(partyId) {
    const netPayable = totalNetPayableForParty(partyId);
    const paid = totalPaymentsForParty(partyId);
    return round2(netPayable - paid);
  }

  function payableStatus(balance, paid) {
    if (round2(balance) <= 0.004) return "Paid";
    if (paid > 0) return "Partially Paid";
    return "Pending";
  }

  /* Build Tally-style supplier ledger: Purchase = Credit (payable increases),
     Payment = Debit (payable decreases). Positive balance = Cr (we owe supplier). */
  function buildPurchaseLedger(partyId, fromDate, toDate) {
    const party = partyById(partyId);
    if (!party) return { rows: [], openingBalance: 0 };

    const entries = [];

    DB.purchases
      .filter((p) => p.partyId === partyId)
      .forEach((p) => {
        const t = computePurchaseTotals(p);
        entries.push({
          date: p.date,
          particular: "Purchase Invoice",
          reference: p.purchaseInvoiceNo,
          debit: 0,
          credit: t.netPayable,
          sortKey: p.date + "_1_" + p.purchaseInvoiceNo
        });
      });

    DB.payments
      .filter((p) => p.partyId === partyId)
      .forEach((p) => {
        entries.push({
          date: p.date,
          particular: "Payment (" + (p.paymentMode || "Cash") + ")",
          reference: p.paymentNo,
          debit: Number(p.amount) || 0,
          credit: 0,
          sortKey: p.date + "_2_" + p.paymentNo
        });
      });

    DB.notes.filter((n) => n.partyId === partyId && n.referenceType === "purchase" && n.status !== "VOID").forEach((n) => {
      const t = computeNoteTotals(n);
      entries.push({ date:n.date, particular:n.noteType, reference:n.noteNo + " / " + n.referenceNo, debit:t.netAdjustment, credit:0, sortKey:n.date + "_3_" + n.noteNo });
    });

    entries.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));

    const opening = 0; // no purchase-side opening balance field on Party Master
    let running = opening;

    const filtered = [];
    entries.forEach((e) => {
      const beforeRange = fromDate && e.date < fromDate;
      running += e.credit - e.debit; // credit-balance convention (payable)
      if (beforeRange) return;
      if (toDate && e.date > toDate) return;
      filtered.push({ ...e, balanceAfter: running });
    });

    let openingForRange = opening;
    if (fromDate) {
      entries.forEach((e) => {
        if (e.date < fromDate) openingForRange += e.credit - e.debit;
      });
    }

    return { rows: filtered, openingBalance: openingForRange, closingBalance: running };
  }

  /* ============================= ROUTER ================================= */
  const routes = [
    "dashboard", "parties", "invoices", "purchases", "purchase-report", "purchase-ledger",
    "payments", "receipts", "ledger", "outstanding", "credit-notes", "debit-notes", "tds", "gst", "backup", "settings"
  ];
  const routeTitles = {
    dashboard: "Dashboard",
    parties: "Party Master",
    invoices: "Sales Invoice",
    purchases: "Purchase Entry",
    "purchase-report": "Purchase Report",
    "purchase-ledger": "Purchase Ledger",
    payments: "Payments",
    receipts: "Receipts",
    ledger: "Party Ledger",
    outstanding: "Outstanding",
    "credit-notes": "Credit Note",
    "debit-notes": "Debit Note",
    tds: "TDS Report",
    gst: "GST Report",
    backup: "Backup / Restore",
    settings: "Settings"
  };

  function navigate(route) {
    if (!routes.includes(route)) route = "dashboard";
    routes.forEach((r) => {
      document.getElementById("view-" + r).classList.toggle("active", r === route);
    });
    document.querySelectorAll(".nav-item").forEach((a) => {
      a.classList.toggle("active", a.dataset.route === route);
    });
    document.getElementById("pageTitle").textContent = routeTitles[route];
    closeSidebarMobile();
    renderRoute(route);
  }

  function renderRoute(route) {
    switch (route) {
      case "dashboard": renderDashboard(); break;
      case "parties": renderPartyTable(); break;
      case "invoices": renderInvoiceTable(); break;
      case "purchases": renderPurchaseTable(); break;
      case "purchase-report": renderPurchaseReport(); break;
      case "purchase-ledger": renderPurchaseLedgerView(); break;
      case "payments": renderPaymentTable(); break;
      case "receipts": renderReceiptTable(); break;
      case "ledger": renderLedgerView(); break;
      case "outstanding": renderOutstandingTable(); renderPayableTable(); break;
      case "credit-notes": renderNoteTable("Credit Note"); break;
      case "debit-notes": renderNoteTable("Debit Note"); break;
      case "tds": renderTdsReport(); break;
      case "gst": renderGstReport(); break;
      case "settings": renderSettingsForm(); break;
      default: break;
    }
  }

  window.addEventListener("hashchange", () => {
    const route = location.hash.replace("#", "") || "dashboard";
    navigate(route);
  });

  /* ============================= SIDEBAR (mobile) ========================= */
  function openSidebarMobile() {
    document.getElementById("sidebar").classList.add("open");
    document.getElementById("sidebarBackdrop").classList.add("show");
  }
  function closeSidebarMobile() {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebarBackdrop").classList.remove("show");
  }

  /* ============================= DASHBOARD =============================== */
  function renderDashboard() {
    const totalSales = DB.invoices.reduce((s, i) => s + computeInvoiceTotals(i).total, 0);
    const totalReceivable = DB.parties.reduce((s, p) => s + Math.max(outstandingForParty(p.id), 0), 0);
    const totalReceived = DB.receipts.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const totalTds = DB.invoices.reduce((s, i) => s + computeInvoiceTotals(i).tdsAmount, 0);

    const cards = [
      { label: "Total Sales", value: fmtMoney(totalSales), cls: "" },
      { label: "Total Receivable", value: fmtMoney(totalReceivable), cls: "amber" },
      { label: "Total Received", value: fmtMoney(totalReceived), cls: "green" },
      { label: "Total TDS", value: fmtMoney(totalTds), cls: "red" },
      { label: "Parties", value: DB.parties.length, cls: "slate" },
      { label: "Invoices", value: DB.invoices.length, cls: "slate" }
    ];
    const cardsHtml = cards
      .map(
        (c) => `<div class="stat-card ${c.cls}">
          <div class="stat-label">${c.label}</div>
          <div class="stat-value">${c.value}</div>
        </div>`
      )
      .join("");
    document.getElementById("dashCards").innerHTML = cardsHtml;

    // Recent invoices
    const recentInv = [...DB.invoices].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
    const invBody = document.querySelector("#dashRecentInvoices tbody");
    invBody.innerHTML = recentInv.length
      ? recentInv
          .map((i) => {
            const p = partyById(i.partyId);
            const t = computeInvoiceTotals(i);
            return `<tr><td>${escapeHtml(i.invoiceNo)}</td><td>${fmtDate(i.date)}</td><td>${escapeHtml(p ? p.partyName : "-")}</td><td class="num">${fmtMoney(t.total)}</td></tr>`;
          })
          .join("")
      : `<tr class="empty-row"><td colspan="4">No invoices yet</td></tr>`;

    // Recent receipts
    const recentRcpt = [...DB.receipts].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
    const rcptBody = document.querySelector("#dashRecentReceipts tbody");
    rcptBody.innerHTML = recentRcpt.length
      ? recentRcpt
          .map((r) => {
            const p = partyById(r.partyId);
            return `<tr><td>${escapeHtml(r.receiptNo)}</td><td>${fmtDate(r.date)}</td><td>${escapeHtml(p ? p.partyName : "-")}</td><td class="num">${fmtMoney(r.amount)}</td></tr>`;
          })
          .join("")
      : `<tr class="empty-row"><td colspan="4">No receipts yet</td></tr>`;

    // Top outstanding
    const outstandingList = DB.parties
      .map((p) => ({ party: p, bal: outstandingForParty(p.id) }))
      .filter((x) => x.bal > 0.004)
      .sort((a, b) => b.bal - a.bal)
      .slice(0, 6);
    const outBody = document.querySelector("#dashOutstanding tbody");
    outBody.innerHTML = outstandingList.length
      ? outstandingList
          .map((x) => {
            const received = totalReceivedForParty(x.party.id);
            const status = outstandingStatus(x.bal, true, received);
            return `<tr><td>${escapeHtml(x.party.partyName)}</td><td class="num">${fmtMoney(x.bal)}</td><td>${statusBadge(status)}</td></tr>`;
          })
          .join("")
      : `<tr class="empty-row"><td colspan="3">No outstanding balances</td></tr>`;

    // ---- Purchase overview ----
    const totalPurchases = DB.purchases.reduce((s, p) => s + computePurchaseTotals(p).total, 0) - DB.notes.filter(n => n.referenceType === "purchase" && n.status !== "VOID").reduce((s, n) => s + computeNoteTotals(n).total, 0);
    const totalPurchaseGst = DB.purchases.reduce((s, p) => s + computePurchaseTotals(p).gstAmount, 0);
    const totalPurchaseTds = DB.purchases.reduce((s, p) => s + computePurchaseTotals(p).tdsAmount, 0);
    const totalPayable = DB.parties.reduce((s, p) => s + Math.max(payableForParty(p.id), 0), 0);

    const purCards = [
      { label: "Total Purchases", value: fmtMoney(totalPurchases), cls: "" },
      { label: "Total Purchase GST", value: fmtMoney(totalPurchaseGst), cls: "amber" },
      { label: "Total TDS", value: fmtMoney(totalPurchaseTds), cls: "red" },
      { label: "Total Payable", value: fmtMoney(totalPayable), cls: "slate" }
    ];
    document.getElementById("dashPurchaseCards").innerHTML = purCards
      .map((c) => `<div class="stat-card ${c.cls}"><div class="stat-label">${c.label}</div><div class="stat-value">${c.value}</div></div>`)
      .join("");

    const recentPur = [...DB.purchases].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
    const purBody = document.querySelector("#dashRecentPurchases tbody");
    purBody.innerHTML = recentPur.length
      ? recentPur
          .map((p) => {
            const party = partyById(p.partyId);
            const t = computePurchaseTotals(p);
            return `<tr><td>${escapeHtml(p.purchaseInvoiceNo)}</td><td>${fmtDate(p.date)}</td><td>${escapeHtml(party ? party.partyName : "-")}</td><td class="num">${fmtMoney(t.total)}</td></tr>`;
          })
          .join("")
      : `<tr class="empty-row"><td colspan="4">No purchases yet</td></tr>`;

    const topPayable = DB.parties
      .map((p) => ({ party: p, bal: payableForParty(p.id) }))
      .filter((x) => x.bal > 0.004)
      .sort((a, b) => b.bal - a.bal)
      .slice(0, 6);
    const payBody = document.querySelector("#dashTopPayable tbody");
    payBody.innerHTML = topPayable.length
      ? topPayable
          .map((x) => {
            const paid = totalPaymentsForParty(x.party.id);
            const status = payableStatus(x.bal, paid);
            return `<tr><td>${escapeHtml(x.party.partyName)}</td><td class="num">${fmtMoney(x.bal)}</td><td>${payableStatusBadge(status)}</td></tr>`;
          })
          .join("")
      : `<tr class="empty-row"><td colspan="3">No payable balances</td></tr>`;
  }

  function statusBadge(status) {
    const cls = status === "Cleared" ? "badge-cleared" : status === "Partially Received" ? "badge-partial" : "badge-pending";
    return `<span class="badge ${cls}">${status}</span>`;
  }

  function payableStatusBadge(status) {
    const cls = status === "Paid" ? "badge-cleared" : status === "Partially Paid" ? "badge-partial" : "badge-pending";
    return `<span class="badge ${cls}">${status}</span>`;
  }

  /* ============================= PARTY MASTER ============================= */
  function renderPartyTable() {
    const q = (document.getElementById("partySearch").value || "").toLowerCase().trim();
    const tbody = document.querySelector("#partyTable tbody");
    let list = [...DB.parties].sort((a, b) => a.partyName.localeCompare(b.partyName));
    if (q) {
      list = list.filter((p) =>
        [p.partyName, p.gstin, p.mobile, p.email, p.acTo].join(" ").toLowerCase().includes(q)
      );
    }
    tbody.innerHTML = list.length
      ? list
          .map((p) => {
            return `<tr>
              <td>${escapeHtml(p.partyName)}</td>
              <td>${escapeHtml(p.acTo || "-")}</td>
              <td>${escapeHtml(p.gstin || "-")}</td>
              <td>${escapeHtml(p.mobile || "-")}</td>
              <td class="num">${fmtMoney(p.openingBalance)}</td>
              <td>${p.openingType === "Cr" ? '<span class="badge badge-cr">Cr</span>' : '<span class="badge badge-dr">Dr</span>'}</td>
              <td class="actions-cell">
                <button class="btn btn-ghost btn-sm" data-action="edit-party" data-id="${p.id}">Edit</button>
                <button class="btn btn-ghost btn-sm" data-action="ledger-party" data-id="${p.id}">Ledger</button>
                <button class="btn btn-ghost btn-sm" data-action="print-party" data-id="${p.id}">Print</button>
                <button class="btn btn-danger btn-sm" data-action="delete-party" data-id="${p.id}">Delete</button>
              </td>
            </tr>`;
          })
          .join("")
      : `<tr class="empty-row"><td colspan="7">No parties found</td></tr>`;
  }

  function openPartyModal(partyId) {
    const overlay = document.getElementById("partyModalOverlay");
    const form = document.getElementById("partyForm");
    form.reset();
    populateStateSelect(document.getElementById("partyStateSelect"), "");
    document.getElementById("partyStateCode").value = "";
    document.getElementById("partyModalTitle").textContent = partyId ? "Edit Party" : "New Party";
    form.elements["id"].value = partyId || "";
    if (partyId) {
      const p = partyById(partyId);
      if (p) {
        form.elements["partyName"].value = p.partyName || "";
        form.elements["acTo"].value = p.acTo || "";
        form.elements["billTo"].value = p.billTo || "";
        form.elements["shipTo"].value = p.shipTo || "";
        form.elements["gstin"].value = p.gstin || "";
        form.elements["state"].value = p.state || "";
        form.elements["stateCode"].value = p.stateCode || "";
        form.elements["mobile"].value = p.mobile || "";
        form.elements["email"].value = p.email || "";
        form.elements["address"].value = p.address || "";
        form.elements["openingBalance"].value = p.openingBalance || 0;
        form.elements["openingType"].value = p.openingType || "Dr";
      }
    }
    overlay.classList.remove("hidden");
  }
  function closePartyModal() {
    document.getElementById("partyModalOverlay").classList.add("hidden");
  }

  function handlePartySubmit(e) {
    e.preventDefault();
    const form = e.target;
    const id = form.elements["id"].value;
    const data = {
      partyName: form.elements["partyName"].value.trim(),
      acTo: form.elements["acTo"].value.trim(),
      billTo: form.elements["billTo"].value.trim(),
      shipTo: form.elements["shipTo"].value.trim(),
      gstin: form.elements["gstin"].value.trim(),
      state: form.elements["state"].value,
      stateCode: form.elements["stateCode"].value.trim(),
      mobile: form.elements["mobile"].value.trim(),
      email: form.elements["email"].value.trim(),
      address: form.elements["address"].value.trim(),
      openingBalance: parseFloat(form.elements["openingBalance"].value) || 0,
      openingType: form.elements["openingType"].value
    };
    if (!data.partyName) {
      toast("Party Name is required", "error");
      return;
    }
    if (id) {
      const idx = DB.parties.findIndex((p) => p.id === id);
      if (idx > -1) DB.parties[idx] = { ...DB.parties[idx], ...data };
      toast("Party updated", "success");
    } else {
      DB.parties.push({ id: uid("party"), ...data, createdAt: new Date().toISOString() });
      toast("Party created", "success");
    }
    saveData();
    closePartyModal();
    renderPartyTable();
    refreshPartySelects();
    if (location.hash.replace("#", "") === "dashboard") renderDashboard();
  }

  async function deleteParty(id) {
    const used = DB.invoices.some((i) => i.partyId === id) || DB.receipts.some((r) => r.partyId === id);
    const msg = used
      ? "This party has linked invoices/receipts. Deleting will NOT remove those records but they will show as 'Unknown Party'. Continue?"
      : "Delete this party permanently?";
    const ok = await confirmDialog(msg, "Delete Party");
    if (!ok) return;
    DB.parties = DB.parties.filter((p) => p.id !== id);
    saveData();
    renderPartyTable();
    refreshPartySelects();
    toast("Party deleted", "success");
  }

  function refreshPartySelects() {
    const sortedParties = [...DB.parties].sort((a, b) => a.partyName.localeCompare(b.partyName));
    const options = sortedParties.map((p) => `<option value="${p.id}">${escapeHtml(p.partyName)}</option>`).join("");

    const invSel = document.getElementById("invoicePartySelect");
    const currentInv = invSel.value;
    invSel.innerHTML = `<option value="">-- Select Party --</option>` + options;
    if (currentInv) invSel.value = currentInv;
    const invoiceSearch = document.getElementById("invoicePartySearch");
    const invoiceOptions = document.getElementById("invoicePartyOptions");
    if (invoiceOptions) invoiceOptions.innerHTML = sortedParties.map((p) => `<option value="${escapeHtml(p.partyName)}" data-party-id="${p.id}" label="${escapeHtml([p.gstin, p.mobile].filter(Boolean).join(" · "))}"></option>`).join("");
    if (invoiceSearch && currentInv) { const selected = partyById(currentInv); invoiceSearch.value = selected ? selected.partyName : ""; }

    const rcptSel = document.querySelector('#receiptForm select[name="partyId"]');
    const currentRcpt = rcptSel.value;
    rcptSel.innerHTML = `<option value="">-- Select Party --</option>` + options;
    if (currentRcpt) rcptSel.value = currentRcpt;

    const ledgerSel = document.getElementById("ledgerPartySelect");
    const currentLedger = ledgerSel.value;
    ledgerSel.innerHTML = `<option value="">-- Select Party --</option>` + options;
    if (currentLedger) ledgerSel.value = currentLedger;

    const supplierOptions = sortedParties.map((p) => `<option value="${p.id}">${escapeHtml(p.partyName)}</option>`).join("");

    const purSel = document.getElementById("purchasePartySelect");
    const curPur = purSel.value;
    purSel.innerHTML = `<option value="">-- Select Supplier --</option>` + supplierOptions;
    if (curPur) purSel.value = curPur;

    const paySel = document.querySelector('#paymentForm select[name="partyId"]');
    const curPay = paySel.value;
    paySel.innerHTML = `<option value="">-- Select Supplier --</option>` + supplierOptions;
    if (curPay) paySel.value = curPay;

    const purLedgerSel = document.getElementById("purchaseLedgerPartySelect");
    const curPurLedger = purLedgerSel.value;
    purLedgerSel.innerHTML = `<option value="">-- Select Supplier --</option>` + supplierOptions;
    if (curPurLedger) purLedgerSel.value = curPurLedger;

    const purFilterSel = document.getElementById("purchasePartyFilter");
    const curPurFilter = purFilterSel.value;
    purFilterSel.innerHTML = `<option value="">All Suppliers</option>` + supplierOptions;
    if (curPurFilter) purFilterSel.value = curPurFilter;

    const purReportFilterSel = document.getElementById("purchaseReportPartyFilter");
    const curPurReportFilter = purReportFilterSel.value;
    purReportFilterSel.innerHTML = `<option value="">All Suppliers</option>` + supplierOptions;
    if (curPurReportFilter) purReportFilterSel.value = curPurReportFilter;
  }

  /* ============================= SALES INVOICE ============================ */
  function renderInvoiceTable() {
    const q = (document.getElementById("invoiceSearch").value || "").toLowerCase().trim();
    const dateFilter = document.getElementById("invoiceDateFilter").value;
    const tbody = document.querySelector("#invoiceTable tbody");
    let list = [...DB.invoices].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (q) {
      list = list.filter((i) => {
        const p = partyById(i.partyId);
        return [i.invoiceNo, p ? p.partyName : ""].join(" ").toLowerCase().includes(q);
      });
    }
    if (dateFilter) list = list.filter((i) => i.date === dateFilter);

    tbody.innerHTML = list.length
      ? list
          .map((i) => {
            const p = partyById(i.partyId);
            const t = computeInvoiceTotals(i);
            return `<tr>
              <td>${escapeHtml(i.invoiceNo)}</td>
              <td>${fmtDate(i.date)}</td>
              <td>${escapeHtml(p ? p.partyName : "Unknown Party")}</td>
              <td>${escapeHtml(fmtServiceMonth(i.serviceMonth || (i.serviceFrom || "").slice(0, 7)))}</td>
              <td>${escapeHtml(fmtServicePeriod(i))}</td>
              <td class="num">${fmtNum(t.taxable)}</td>
              <td class="num">${t.gstRate}%</td>
              <td class="num">${fmtNum(t.gstAmount)}</td>
              <td class="num">${fmtNum(t.total)}</td>
              <td class="num">${i.tdsApplicable === "Yes" ? fmtNum(t.tdsAmount) : "-"}</td>
              <td class="num">${fmtNum(t.netReceivable)}</td>
              <td>${i.status === "CANCELLED" ? '<span class="badge badge-dr">CANCELLED</span>' : '<span class="badge badge-cleared">POSTED</span>'}</td>
              <td class="actions-cell">
                <button class="btn btn-ghost btn-sm" data-action="print-invoice" data-id="${i.id}">Print</button>
                <button class="btn btn-ghost btn-sm" data-action="edit-invoice" data-id="${i.id}">Edit</button>
                ${i.status === "CANCELLED" ? '<span class="badge badge-dr">CANCELLED</span>' : `<button class="btn btn-ghost btn-sm" data-action="cancel-invoice" data-id="${i.id}">Cancel Invoice</button>`}
                <button class="btn btn-danger btn-sm" data-action="delete-invoice" data-id="${i.id}">Delete</button>
              </td>
            </tr>`;
          })
          .join("")
      : `<tr class="empty-row"><td colspan="13">No invoices found</td></tr>`;
  }

  function nextInvoiceNo() {
    const prefix = DB.settings.invoicePrefix || "INV-";
    const nums = DB.invoices
      .map((i) => i.invoiceNo)
      .filter((n) => n && n.startsWith(prefix))
      .map((n) => parseInt(n.slice(prefix.length), 10))
      .filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return prefix + String(next).padStart(4, "0");
  }

  function openInvoiceModal(invoiceId) {
    refreshPartySelects();
    const overlay = document.getElementById("invoiceModalOverlay");
    const form = document.getElementById("invoiceForm");
    form.reset();
    document.getElementById("invoiceModalTitle").textContent = invoiceId ? "Edit Invoice" : "New Invoice";
    form.elements["id"].value = invoiceId || "";

    if (invoiceId) {
      const inv = DB.invoices.find((i) => i.id === invoiceId);
      if (inv) {
        form.elements["invoiceNo"].value = inv.invoiceNo;
        form.elements["date"].value = inv.date;
        form.elements["partyId"].value = inv.partyId;
        document.getElementById("invoicePartySearch").value = (partyById(inv.partyId) || {}).partyName || "";
        form.elements["acTo"].value = inv.acTo || "";
        form.elements["billTo"].value = inv.billTo || "";
        form.elements["shipTo"].value = inv.shipTo || "";
        form.elements["description"].value = inv.description || "";
        form.elements["serviceMonth"].value = inv.serviceMonth || (inv.serviceFrom ? inv.serviceFrom.slice(0, 7) : "");
        form.elements["serviceFrom"].value = inv.serviceFrom || "";
        form.elements["serviceTo"].value = inv.serviceTo || "";
        form.elements["taxableAmount"].value = inv.taxableAmount;
        form.elements["gstRate"].value = inv.gstRate;
        form.querySelector(`input[name="tdsApplicable"][value="${inv.tdsApplicable}"]`).checked = true;
        form.elements["tdsRate"].value = inv.tdsRate || 1;
        toggleTdsFields(inv.tdsApplicable === "Yes");
      }
    } else {
      form.elements["invoiceNo"].value = nextInvoiceNo();
      form.elements["date"].value = todayISO();
      toggleTdsFields(false);
    }
    fillInvoicePartyDetails(form.elements["partyId"].value, false);
    recalcInvoicePreview();
    overlay.classList.remove("hidden");
  }
  function fillInvoicePartyDetails(partyId, overwriteDocumentFields) {
    const party = partyById(partyId), form = document.getElementById("invoiceForm");
    const field = (id, value) => { const el = document.getElementById(id); if (el) el.value = value || ""; };
    if (!party) { ["invPartyGstin","invPartyState","invPartyMobile","invPartyEmail","invPartyAddress"].forEach(id => field(id, "")); return; }
    field("invPartyGstin", party.gstin);
    field("invPartyState", [party.state, party.stateCode ? "(" + party.stateCode + ")" : ""].filter(Boolean).join(" "));
    field("invPartyMobile", party.mobile);
    field("invPartyEmail", party.email);
    field("invPartyAddress", party.address);
    if (overwriteDocumentFields) {
      form.elements["acTo"].value = party.acTo || party.partyName || "";
      form.elements["billTo"].value = party.billTo || party.address || party.partyName || "";
      form.elements["shipTo"].value = party.shipTo || party.billTo || party.address || "";
    }
  }
  function selectInvoicePartyFromSearch() {
    const search = document.getElementById("invoicePartySearch"), value = search.value.trim().toLowerCase();
    const party = DB.parties.find(p => p.partyName.toLowerCase() === value) || DB.parties.find(p => [p.partyName, p.gstin, p.mobile].filter(Boolean).join(" ").toLowerCase().includes(value));
    if (!party) return;
    const select = document.getElementById("invoicePartySelect");
    if (select.value === party.id) return;
    select.value = party.id;
    search.value = party.partyName;
    fillInvoicePartyDetails(party.id, true);
    recalcInvoicePreview();
    showGstDetectionPopup(party.id);
  }
  function closeInvoiceModal() {
    document.getElementById("invoiceModalOverlay").classList.add("hidden");
  }
  function setInvoiceServiceMonth(month) {
    if (!month) return;
    const form = document.getElementById("invoiceForm"), start = month + "-01", lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate(), end = month + "-" + String(lastDay).padStart(2, "0");
    form.elements["serviceFrom"].value = start;
    form.elements["serviceTo"].value = end;
  }

  function toggleTdsFields(show) {
    document.getElementById("tdsRateField").style.display = show ? "flex" : "none";
    document.getElementById("tdsAmtField").style.display = show ? "flex" : "none";
  }

  function toggleInvoiceGstFields(isInterState) {
    document.getElementById("invCgstRateField").style.display = isInterState ? "none" : "flex";
    document.getElementById("invCgstAmtField").style.display = isInterState ? "none" : "flex";
    document.getElementById("invSgstRateField").style.display = isInterState ? "none" : "flex";
    document.getElementById("invSgstAmtField").style.display = isInterState ? "none" : "flex";
    document.getElementById("invIgstRateField").style.display = isInterState ? "flex" : "none";
    document.getElementById("invIgstAmtField").style.display = isInterState ? "flex" : "none";
  }

  function recalcInvoicePreview() {
    const form = document.getElementById("invoiceForm");
    const taxable = parseFloat(form.elements["taxableAmount"].value) || 0;
    const gstRate = parseFloat(form.elements["gstRate"].value) || 0;
    const tdsApplicable = form.querySelector('input[name="tdsApplicable"]:checked').value;
    const tdsRate = parseFloat(form.elements["tdsRate"].value) || 0;
    const partyId = form.elements["partyId"].value;
    const party = partyById(partyId);

    const breakup = computeGstBreakup(taxable, gstRate, DB.settings.stateCode || "", party ? party.stateCode || "" : "");
    const gstAmount = breakup.gstAmount;
    const total = round2(taxable + gstAmount);
    let tdsAmount = 0;
    let net = total;
    if (tdsApplicable === "Yes") {
      tdsAmount = round2((total * tdsRate) / 100);
      net = round2(total - tdsAmount);
    }

    const isInterState = breakup.taxType === "IGST";
    toggleInvoiceGstFields(isInterState);
    document.getElementById("invTaxType").value = isInterState ? "INTER-STATE (IGST)" : "INTRA-STATE (CGST + SGST)";
    document.getElementById("invCgstRate").value = breakup.cgstRate + "%";
    document.getElementById("invCgstAmount").value = fmtNum(breakup.cgstAmount);
    document.getElementById("invSgstRate").value = breakup.sgstRate + "%";
    document.getElementById("invSgstAmount").value = fmtNum(breakup.sgstAmount);
    document.getElementById("invIgstRate").value = breakup.igstRate + "%";
    document.getElementById("invIgstAmount").value = fmtNum(breakup.igstAmount);
    document.getElementById("invGstAmount").value = fmtNum(gstAmount);
    document.getElementById("invTotal").value = fmtNum(total);
    document.getElementById("invTdsAmount").value = fmtNum(tdsAmount);
    document.getElementById("invNetReceivable").value = fmtNum(net);
  }

  function handleInvoiceSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const id = form.elements["id"].value;
    const partyId = form.elements["partyId"].value;
    if (!partyId) {
      toast("Please select a party", "error");
      return;
    }
    const data = {
      invoiceNo: form.elements["invoiceNo"].value.trim(),
      date: form.elements["date"].value,
      partyId,
      acTo: form.elements["acTo"].value.trim(),
      billTo: form.elements["billTo"].value.trim(),
      shipTo: form.elements["shipTo"].value.trim(),
      description: form.elements["description"].value.trim(),
      serviceMonth: form.elements["serviceMonth"].value,
      serviceFrom: form.elements["serviceFrom"].value,
      serviceTo: form.elements["serviceTo"].value,
      taxableAmount: parseFloat(form.elements["taxableAmount"].value) || 0,
      gstRate: parseFloat(form.elements["gstRate"].value) || 0,
      tdsApplicable: form.querySelector('input[name="tdsApplicable"]:checked').value,
      tdsRate: parseFloat(form.elements["tdsRate"].value) || 0
    };
    if (!data.invoiceNo) {
      toast("Invoice No is required", "error");
      return;
    }
    if (id) {
      const idx = DB.invoices.findIndex((i) => i.id === id);
      if (idx > -1) DB.invoices[idx] = { ...DB.invoices[idx], ...data };
      toast("Invoice updated", "success");
    } else {
      DB.invoices.push({ id: uid("inv"), ...data, createdAt: new Date().toISOString() });
      toast("Invoice saved", "success");
    }
    saveData();
    closeInvoiceModal();
    renderInvoiceTable();
    renderRoute(location.hash.replace("#", "") || "dashboard");
  }

  async function deleteInvoice(id) {
    if (DB.notes.some(n => n.referenceType === "sales" && n.referenceId === id)) return toast("Invoices linked to debit/credit notes cannot be deleted. Use Cancel Invoice.", "error");
    const ok = await confirmDialog("Delete this invoice? Ledger and reports will be updated.", "Delete Invoice");
    if (!ok) return;
    DB.invoices = DB.invoices.filter((i) => i.id !== id);
    saveData();
    renderInvoiceTable();
    toast("Invoice deleted", "success");
  }

  /* ============================= RECEIPTS ================================= */
  function receiptTotalForInvoice(invoiceId, excludeReceiptId) {
    return DB.receipts.filter(r => r.invoiceId === invoiceId && r.id !== excludeReceiptId).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }
  function invoiceReceiptDetails(inv, excludeReceiptId) {
    const t = computeInvoiceTotals(inv), received = receiptTotalForInvoice(inv.id, excludeReceiptId);
    return { total:t.total, tds:t.tdsAmount, net:t.netReceivable, received:round2(received), outstanding:Math.max(0, round2(t.netReceivable - received)) };
  }
  function syncInvoiceReceiptBalances() {
    DB.invoices.forEach(inv => { const d = invoiceReceiptDetails(inv); inv.receivedAmount = d.received; inv.remainingBalance = d.outstanding; });
  }
  function populateReceiptInvoices(partyId, selectedInvoiceId, excludeReceiptId) {
    const select = document.getElementById("receiptInvoiceSelect");
    const invoices = DB.invoices.filter(i => i.partyId === partyId && i.status !== "CANCELLED").map(i => ({ i, d:invoiceReceiptDetails(i, excludeReceiptId) })).filter(x => x.d.outstanding > .004).sort((a,b) => (a.i.date < b.i.date ? 1 : -1));
    select.innerHTML = '<option value="">-- Select outstanding invoice --</option>' + invoices.map(({i,d}) => `<option value="${i.id}">${escapeHtml(i.invoiceNo)} | ${fmtDate(i.date)} | ${fmtServiceMonth(i.serviceMonth || (i.serviceFrom || "").slice(0,7))} | Total ${fmtMoney(d.total)} | TDS ${fmtMoney(d.tds)} | Received ${fmtMoney(d.received)} | Outstanding ${fmtMoney(d.outstanding)}</option>`).join("");
    if (selectedInvoiceId) select.value = selectedInvoiceId;
  }
  function fillReceiptInvoiceDetails(setAmount) {
    const form = document.getElementById("receiptForm"), invoiceId = form.elements.invoiceId.value, inv = DB.invoices.find(i => i.id === invoiceId), put = (id, value) => document.getElementById(id).value = value;
    if (!inv) { ["receiptInvoiceDate","receiptServiceMonth","receiptServicePeriod","receiptOriginalAmount","receiptTdsAmount","receiptReceivedAmount","receiptOutstandingAmount"].forEach(id => put(id, "")); return; }
    const d = invoiceReceiptDetails(inv, form.elements.id.value);
    put("receiptInvoiceDate", fmtDate(inv.date)); put("receiptServiceMonth", fmtServiceMonth(inv.serviceMonth || (inv.serviceFrom || "").slice(0,7))); put("receiptServicePeriod", fmtServicePeriod(inv)); put("receiptOriginalAmount", fmtMoney(d.total)); put("receiptTdsAmount", fmtMoney(d.tds)); put("receiptReceivedAmount", fmtMoney(d.received)); put("receiptOutstandingAmount", fmtMoney(d.outstanding));
    if (setAmount) form.elements.amount.value = d.outstanding;
  }
  function renderReceiptTable() {
    const q = (document.getElementById("receiptSearch").value || "").toLowerCase().trim();
    const tbody = document.querySelector("#receiptTable tbody");
    let list = [...DB.receipts].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (q) {
      list = list.filter((r) => {
        const p = partyById(r.partyId);
        return [r.receiptNo, p ? p.partyName : ""].join(" ").toLowerCase().includes(q);
      });
    }
    tbody.innerHTML = list.length
      ? list
          .map((r) => {
            const p = partyById(r.partyId);
            return `<tr>
              <td>${escapeHtml(r.receiptNo)}</td>
              <td>${fmtDate(r.date)}</td>
              <td>${escapeHtml(p ? p.partyName : "Unknown Party")}</td>
              <td class="num">${fmtNum(r.amount)}</td>
              <td>${escapeHtml(r.paymentMode || "-")}</td>
              <td>${escapeHtml(r.bankCash || "-")}</td>
              <td>${escapeHtml(r.reference || "-")}</td>
              <td class="actions-cell">
                <button class="btn btn-ghost btn-sm" data-action="edit-receipt" data-id="${r.id}">Edit</button>
                <button class="btn btn-ghost btn-sm" data-action="print-receipt" data-id="${r.id}">Print</button>
                <button class="btn btn-danger btn-sm" data-action="delete-receipt" data-id="${r.id}">Delete</button>
              </td>
            </tr>`;
          })
          .join("")
      : `<tr class="empty-row"><td colspan="8">No receipts found</td></tr>`;
  }

  function nextReceiptNo() {
    const prefix = DB.settings.receiptPrefix || "RCT-";
    const nums = DB.receipts
      .map((r) => r.receiptNo)
      .filter((n) => n && n.startsWith(prefix))
      .map((n) => parseInt(n.slice(prefix.length), 10))
      .filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return prefix + String(next).padStart(4, "0");
  }

  function openReceiptModal(receiptId) {
    refreshPartySelects();
    const overlay = document.getElementById("receiptModalOverlay");
    const form = document.getElementById("receiptForm");
    form.reset();
    document.getElementById("receiptModalTitle").textContent = receiptId ? "Edit Receipt" : "New Receipt";
    form.elements["id"].value = receiptId || "";
    if (receiptId) {
      const r = DB.receipts.find((x) => x.id === receiptId);
      if (r) {
        form.elements["receiptNo"].value = r.receiptNo;
        form.elements["date"].value = r.date;
        form.elements["partyId"].value = r.partyId;
        populateReceiptInvoices(r.partyId, r.invoiceId, r.id);
        form.elements["invoiceId"].value = r.invoiceId || "";
        form.elements["amount"].value = r.amount;
        form.elements["paymentMode"].value = r.paymentMode || "Cash";
        form.elements["bankCash"].value = r.bankCash || "";
        form.elements["reference"].value = r.reference || "";
        form.elements["narration"].value = r.narration || "";
        fillReceiptInvoiceDetails(false);
      }
    } else {
      form.elements["receiptNo"].value = nextReceiptNo();
      form.elements["date"].value = todayISO();
      populateReceiptInvoices("");
    }
    overlay.classList.remove("hidden");
  }
  function closeReceiptModal() {
    document.getElementById("receiptModalOverlay").classList.add("hidden");
  }

  function handleReceiptSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const id = form.elements["id"].value;
    const partyId = form.elements["partyId"].value;
    if (!partyId) {
      toast("Please select a party", "error");
      return;
    }
    const data = {
      receiptNo: form.elements["receiptNo"].value.trim(),
      date: form.elements["date"].value,
      partyId,
      invoiceId: form.elements["invoiceId"].value,
      amount: parseFloat(form.elements["amount"].value) || 0,
      paymentMode: form.elements["paymentMode"].value,
      bankCash: form.elements["bankCash"].value.trim(),
      reference: form.elements["reference"].value.trim(),
      narration: form.elements["narration"].value.trim()
    };
    if (!data.receiptNo) {
      toast("Receipt No is required", "error");
      return;
    }
    if (data.invoiceId) {
      const invoice = DB.invoices.find(i => i.id === data.invoiceId);
      if (!invoice || invoice.partyId !== partyId) return toast("Select an invoice belonging to the selected party", "error");
      const remaining = invoiceReceiptDetails(invoice, id).outstanding;
      if (data.amount <= 0 || data.amount > remaining + .004) return toast("Receipt amount cannot exceed invoice outstanding amount: " + fmtMoney(remaining), "error");
    }
    if (id) {
      const idx = DB.receipts.findIndex((r) => r.id === id);
      if (idx > -1) DB.receipts[idx] = { ...DB.receipts[idx], ...data };
      toast("Receipt updated", "success");
    } else {
      DB.receipts.push({ id: uid("rcpt"), ...data, createdAt: new Date().toISOString() });
      toast("Receipt saved", "success");
    }
    syncInvoiceReceiptBalances();
    saveData();
    closeReceiptModal();
    renderReceiptTable();
    renderRoute(location.hash.replace("#", "") || "dashboard");
  }

  async function deleteReceipt(id) {
    const ok = await confirmDialog("Delete this receipt? Outstanding balances will be updated.", "Delete Receipt");
    if (!ok) return;
    DB.receipts = DB.receipts.filter((r) => r.id !== id);
    syncInvoiceReceiptBalances();
    saveData();
    renderReceiptTable();
    toast("Receipt deleted", "success");
  }

  /* ============================= LEDGER =================================== */
  function renderLedgerView() {
    refreshPartySelects();
    const partyId = document.getElementById("ledgerPartySelect").value;
    const from = document.getElementById("ledgerFrom").value;
    const to = document.getElementById("ledgerTo").value;
    const tbody = document.querySelector("#ledgerTable tbody");
    const summaryEl = document.getElementById("ledgerSummaryCards");

    if (!partyId) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Select a party to view ledger</td></tr>`;
      summaryEl.innerHTML = "";
      return;
    }

    const { rows, openingBalance, closingBalance } = buildLedger(partyId, from, to);

    let running = openingBalance;
    let rowsHtml = `<tr>
      <td>${from ? fmtDate(from) : "-"}</td>
      <td><strong>Opening Balance</strong></td>
      <td>-</td>
      <td class="num">-</td>
      <td class="num">-</td>
      <td class="num">${fmtNum(Math.abs(openingBalance))}</td>
      <td>${openingBalance >= 0 ? '<span class="badge badge-dr">Dr</span>' : '<span class="badge badge-cr">Cr</span>'}</td>
    </tr>`;

    rows.forEach((r) => {
      rowsHtml += `<tr>
        <td>${fmtDate(r.date)}</td>
        <td>${escapeHtml(r.particular)}</td>
        <td>${escapeHtml(r.reference)}</td>
        <td class="num">${r.debit ? fmtNum(r.debit) : "-"}</td>
        <td class="num">${r.credit ? fmtNum(r.credit) : "-"}</td>
        <td class="num">${fmtNum(Math.abs(r.balanceAfter))}</td>
        <td>${r.balanceAfter >= 0 ? '<span class="badge badge-dr">Dr</span>' : '<span class="badge badge-cr">Cr</span>'}</td>
      </tr>`;
    });

    tbody.innerHTML = rowsHtml;

    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    const closing = rows.length ? rows[rows.length - 1].balanceAfter : openingBalance;

    summaryEl.innerHTML = [
      { label: "Opening Balance", value: fmtMoney(Math.abs(openingBalance)) + (openingBalance >= 0 ? " Dr" : " Cr"), cls: "" },
      { label: "Total Debit", value: fmtMoney(totalDebit), cls: "amber" },
      { label: "Total Credit", value: fmtMoney(totalCredit), cls: "green" },
      { label: "Closing Balance", value: fmtMoney(Math.abs(closing)) + (closing >= 0 ? " Dr" : " Cr"), cls: closing >= 0 ? "red" : "green" }
    ]
      .map(
        (c) => `<div class="stat-card ${c.cls}"><div class="stat-label">${c.label}</div><div class="stat-value">${c.value}</div></div>`
      )
      .join("");
  }

  function printLedger() {
    const partyId = document.getElementById("ledgerPartySelect").value;
    if (!partyId) {
      toast("Select a party first", "error");
      return;
    }
    const party = partyById(partyId);
    const from = document.getElementById("ledgerFrom").value;
    const to = document.getElementById("ledgerTo").value;
    const { rows, openingBalance } = buildLedger(partyId, from, to);
    const closing = rows.length ? rows[rows.length - 1].balanceAfter : openingBalance;

    let rowsHtml = `<tr><td>${from ? fmtDate(from) : "-"}</td><td><strong>Opening Balance</strong></td><td>-</td><td class="num">-</td><td class="num">-</td><td class="num">${fmtNum(Math.abs(openingBalance))} ${openingBalance >= 0 ? "Dr" : "Cr"}</td></tr>`;
    rows.forEach((r) => {
      rowsHtml += `<tr><td>${fmtDate(r.date)}</td><td>${escapeHtml(r.particular)}</td><td>${escapeHtml(r.reference)}</td><td class="num">${r.debit ? fmtNum(r.debit) : "-"}</td><td class="num">${r.credit ? fmtNum(r.credit) : "-"}</td><td class="num">${fmtNum(Math.abs(r.balanceAfter))} ${r.balanceAfter >= 0 ? "Dr" : "Cr"}</td></tr>`;
    });

    const html = `
      <div class="inv-print-header">
        <div>
          <div class="co-name">${escapeHtml(DB.settings.companyName)}</div>
          <div class="co-meta">${escapeHtml(DB.settings.companyAddress || "")}<br>${escapeHtml(DB.settings.companyMobile || "")} ${DB.settings.companyEmail ? " · " + escapeHtml(DB.settings.companyEmail) : ""}</div>
        </div>
        <div class="inv-badge"><h2>Ledger Statement</h2><div class="co-meta">${from ? fmtDate(from) : "Beginning"} to ${to ? fmtDate(to) : "Date"}</div></div>
      </div>
      <div class="inv-meta-box" style="margin-bottom:18px;">
        <h4>Party</h4>
        <div><strong>${escapeHtml(party.partyName)}</strong><br>${escapeHtml(party.address || "")}<br>GSTIN: ${escapeHtml(party.gstin || "-")} · Mobile: ${escapeHtml(party.mobile || "-")}</div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Particular</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="print-totals">
        <table>
          <tr class="grand"><td>Closing Balance</td><td class="num">${fmtMoney(Math.abs(closing))} ${closing >= 0 ? "Dr" : "Cr"}</td></tr>
        </table>
      </div>
    `;
    document.getElementById("printArea").innerHTML = html;
    document.getElementById("printModalOverlay").classList.remove("hidden");
  }

  /* ============================= OUTSTANDING =============================== */
  function renderOutstandingTable() {
    const q = (document.getElementById("outstandingSearch").value || "").toLowerCase().trim();
    const statusFilter = document.getElementById("outstandingStatusFilter").value;
    const tbody = document.querySelector("#outstandingTable tbody");

    let rows = DB.parties.map((p) => {
      const invoiceAmount = totalInvoiceGrossForParty(p.id);
      const received = totalReceivedForParty(p.id);
      const tds = totalTdsForParty(p.id);
      const balance = outstandingForParty(p.id);
      const status = outstandingStatus(balance, DB.invoices.some((i) => i.partyId === p.id), received);
      const lastInvoice = balance > 0.004 ? DB.invoices.filter(i => i.partyId === p.id && i.status !== "CANCELLED").sort((a, b) => ((b.serviceTo || b.serviceFrom || b.date) || "").localeCompare((a.serviceTo || a.serviceFrom || a.date) || ""))[0] : null;
      return { party: p, invoiceAmount, received, tds, balance, status, lastInvoice };
    });

    if (q) rows = rows.filter((r) => r.party.partyName.toLowerCase().includes(q));
    if (statusFilter) rows = rows.filter((r) => r.status === statusFilter);
    rows.sort((a, b) => b.balance - a.balance);

    tbody.innerHTML = rows.length
      ? rows
          .map(
            (r) => `<tr>
              <td>${escapeHtml(r.party.partyName)}</td>
              <td class="num">${fmtMoney(r.invoiceAmount)}</td>
              <td class="num">${fmtMoney(r.received)}</td>
              <td class="num">${fmtMoney(r.tds)}</td>
              <td class="num">${fmtMoney(r.balance)}</td>
              <td>${escapeHtml(fmtServiceMonth(r.lastInvoice ? (r.lastInvoice.serviceMonth || (r.lastInvoice.serviceFrom || "").slice(0, 7)) : ""))}</td>
              <td>${escapeHtml(fmtServicePeriod(r.lastInvoice))}</td>
              <td>${statusBadge(r.status)}</td>
            </tr>`
          )
          .join("")
      : `<tr class="empty-row"><td colspan="8">No records found</td></tr>`;
  }

  function renderPayableTable() {
    const q = (document.getElementById("payableSearch").value || "").toLowerCase().trim();
    const statusFilter = document.getElementById("payableStatusFilter").value;
    const tbody = document.querySelector("#payableTable tbody");

    let rows = DB.parties.map((p) => {
      const purchaseAmount = totalPurchaseGrossForParty(p.id);
      const paid = totalPaymentsForParty(p.id);
      const tds = totalPurchaseTdsForParty(p.id);
      const balance = payableForParty(p.id);
      const status = payableStatus(balance, paid);
      return { party: p, purchaseAmount, paid, tds, balance, status };
    });

    if (q) rows = rows.filter((r) => r.party.partyName.toLowerCase().includes(q));
    if (statusFilter) rows = rows.filter((r) => r.status === statusFilter);
    rows.sort((a, b) => b.balance - a.balance);

    tbody.innerHTML = rows.length
      ? rows
          .map(
            (r) => `<tr>
              <td>${escapeHtml(r.party.partyName)}</td>
              <td class="num">${fmtMoney(r.purchaseAmount)}</td>
              <td class="num">${fmtMoney(r.paid)}</td>
              <td class="num">${fmtMoney(r.tds)}</td>
              <td class="num">${fmtMoney(r.balance)}</td>
              <td>${payableStatusBadge(r.status)}</td>
            </tr>`
          )
          .join("")
      : `<tr class="empty-row"><td colspan="6">No records found</td></tr>`;
  }

  function printPayableReport() {
    const q = document.getElementById("payableSearch").value.trim();
    const status = document.getElementById("payableStatusFilter").value;
    const subtitle = filterSubtitle([q ? `Search: "${q}"` : "", status ? "Status: " + status : "", "Generated: " + fmtDate(todayISO())]);
    printTableGeneric("payableTable", "Supplier Payable Report", subtitle);
  }


  let tdsReportMode = "sales";
  let gstReportMode = "sales";

  function renderTdsReport() {
    const q = (document.getElementById("tdsSearch").value || "").toLowerCase().trim();
    const from = document.getElementById("tdsFrom").value;
    const to = document.getElementById("tdsTo").value;
    const tbody = document.querySelector("#tdsTable tbody");
    const isPurchase = tdsReportMode === "purchase";

    let list = (isPurchase ? DB.purchases.filter((i) => i.tdsApplicable === "Yes") : DB.invoices.filter((i) => i.tdsApplicable === "Yes")).concat(DB.notes.filter(n => n.referenceType === (isPurchase ? "purchase" : "sales") && Number(n.tdsAdjustment) > 0 && n.status !== "VOID").map(n => ({...n, __note:true})));
    if (from) list = list.filter((i) => i.date >= from);
    if (to) list = list.filter((i) => i.date <= to);
    if (q) {
      list = list.filter((i) => {
        const p = partyById(i.partyId);
        const no = i.__note ? i.noteNo : (isPurchase ? i.purchaseInvoiceNo : i.invoiceNo);
        return [no, p ? p.partyName : ""].join(" ").toLowerCase().includes(q);
      });
    }
    list.sort((a, b) => (a.date < b.date ? 1 : -1));

    let totalTds = 0,
      totalNet = 0;
    tbody.innerHTML = list.length
      ? list
          .map((i) => {
            const p = partyById(i.partyId);
            const t = i.__note ? computeNoteTotals(i) : (isPurchase ? computePurchaseTotals(i) : computeInvoiceTotals(i));
            const net = i.__note ? t.netAdjustment : (isPurchase ? t.netPayable : t.netReceivable);
            const tds = i.__note ? t.tdsAdjustment : t.tdsAmount;
            totalTds += i.__note ? -tds : tds;
            totalNet += i.__note ? -net : net;
            return `<tr>
              <td>${fmtDate(i.date)}</td>
              <td>${escapeHtml(i.__note ? i.noteNo + " (Note)" : (isPurchase ? i.purchaseInvoiceNo : i.invoiceNo))}</td>
              <td>${escapeHtml(p ? p.partyName : "-")}</td>
              <td class="num">${fmtNum(t.total)}</td>
              <td class="num">${i.__note ? "Adjustment" : i.tdsRate + "%"}</td>
              <td class="num">${fmtNum(i.__note ? -tds : tds)}</td>
              <td class="num">${fmtNum(i.__note ? -net : net)}</td>
            </tr>`;
          })
          .join("")
      : `<tr class="empty-row"><td colspan="7">No TDS records found</td></tr>`;

    document.getElementById("tdsFoot").innerHTML = list.length
      ? `<tr><td colspan="5">Total</td><td class="num">${fmtNum(totalTds)}</td><td class="num">${fmtNum(totalNet)}</td></tr>`
      : "";
  }

  /* ============================= GST REPORT ================================ */
  function renderGstReport() {
    const q = (document.getElementById("gstSearch").value || "").toLowerCase().trim();
    const from = document.getElementById("gstFrom").value;
    const to = document.getElementById("gstTo").value;
    const tbody = document.querySelector("#gstTable tbody");
    const isPurchase = gstReportMode === "purchase";

    let list = (isPurchase ? [...DB.purchases] : [...DB.invoices]).concat(DB.notes.filter(n => n.referenceType === (isPurchase ? "purchase" : "sales") && n.status !== "VOID").map(n => ({...n, __note:true})));
    if (from) list = list.filter((i) => i.date >= from);
    if (to) list = list.filter((i) => i.date <= to);
    if (q) {
      list = list.filter((i) => {
        const p = partyById(i.partyId);
        const no = i.__note ? i.noteNo : (isPurchase ? i.purchaseInvoiceNo : i.invoiceNo);
        return [no, p ? p.partyName : ""].join(" ").toLowerCase().includes(q);
      });
    }
    list.sort((a, b) => (a.date < b.date ? 1 : -1));

    let totalTaxable = 0,
      totalCgst = 0,
      totalSgst = 0,
      totalIgst = 0,
      totalGst = 0,
      totalAmt = 0;
    tbody.innerHTML = list.length
      ? list
          .map((i) => {
            const p = partyById(i.partyId);
            const t = i.__note ? computeNoteTotals(i) : (isPurchase ? computePurchaseTotals(i) : computeInvoiceTotals(i));
            const isInterState = t.taxType === "IGST";
            const sign = i.__note ? -1 : 1;
            totalTaxable += sign * t.taxable;
            totalCgst += sign * t.cgstAmount;
            totalSgst += sign * t.sgstAmount;
            totalIgst += sign * t.igstAmount;
            totalGst += sign * t.gstAmount;
            totalAmt += sign * t.total;
            return `<tr>
              <td>${fmtDate(i.date)}</td>
              <td>${escapeHtml(i.__note ? i.noteNo + " (Note)" : (isPurchase ? i.purchaseInvoiceNo : i.invoiceNo))}</td>
              <td>${escapeHtml(p ? p.partyName : "-")}</td>
              <td class="num">${fmtNum(i.__note ? -t.taxable : t.taxable)}</td>
              <td>${isInterState ? '<span class="badge badge-partial">IGST</span>' : '<span class="badge badge-cleared">CGST+SGST</span>'}</td>
              <td class="num">${isInterState ? "-" : fmtNum(i.__note ? -t.cgstAmount : t.cgstAmount)}</td>
              <td class="num">${isInterState ? "-" : fmtNum(i.__note ? -t.sgstAmount : t.sgstAmount)}</td>
              <td class="num">${isInterState ? fmtNum(i.__note ? -t.igstAmount : t.igstAmount) : "-"}</td>
              <td class="num">${fmtNum(i.__note ? -t.gstAmount : t.gstAmount)}</td>
              <td class="num">${fmtNum(i.__note ? -t.total : t.total)}</td>
            </tr>`;
          })
          .join("")
      : `<tr class="empty-row"><td colspan="10">No records found</td></tr>`;

    document.getElementById("gstFoot").innerHTML = list.length
      ? `<tr><td colspan="3">Total</td><td class="num">${fmtNum(totalTaxable)}</td><td></td><td class="num">${fmtNum(totalCgst)}</td><td class="num">${fmtNum(totalSgst)}</td><td class="num">${fmtNum(totalIgst)}</td><td class="num">${fmtNum(totalGst)}</td><td class="num">${fmtNum(totalAmt)}</td></tr>`
      : "";
  }

  /* ============================= INVOICE PRINT ============================= */
  function printInvoice(invoiceId) {
    const inv = DB.invoices.find((i) => i.id === invoiceId);
    if (!inv) return;
    const party = partyById(inv.partyId) || {};
    const t = computeInvoiceTotals(inv);
    const s = DB.settings;

    const html = `
      <div class="inv-print-header">
        <div>
          <div class="co-name">${escapeHtml(s.companyName)}</div>
          <div class="co-meta">
            ${escapeHtml(s.companyAddress || "")}<br>
            ${s.companyGSTIN ? "GSTIN: " + escapeHtml(s.companyGSTIN) + "<br>" : ""}
            ${escapeHtml(s.companyMobile || "")} ${s.companyEmail ? " · " + escapeHtml(s.companyEmail) : ""}
          </div>
        </div>
        <div class="inv-badge">
          <h2>TAX INVOICE</h2>
          <div class="co-meta">Invoice No: <strong>${escapeHtml(inv.invoiceNo)}</strong><br>Date: ${fmtDate(inv.date)}</div>
        </div>
      </div>

      <div class="inv-meta-grid">
        <div class="inv-meta-box">
          <h4>Bill To</h4>
          <div>
            <strong>${escapeHtml(party.partyName || "-")}</strong><br>
            ${escapeHtml(inv.billTo || party.billTo || "")}<br>
            ${party.gstin ? "GSTIN: " + escapeHtml(party.gstin) + "<br>" : ""}
            ${party.mobile ? "Mobile: " + escapeHtml(party.mobile) : ""}
          </div>
        </div>
        <div class="inv-meta-box">
          <h4>Ship To</h4>
          <div>${escapeHtml(inv.shipTo || party.shipTo || "Same as Bill To")}</div>
          <h4 style="margin-top:10px;">A/C To</h4>
          <div>${escapeHtml(inv.acTo || party.acTo || "-")}</div>
        </div>
      </div>

      ${inv.serviceFrom || inv.serviceTo ? `<div class="inv-meta-box" style="margin-bottom:14px;"><h4>Service Period</h4><div><strong>${fmtDate(inv.serviceFrom)} to ${fmtDate(inv.serviceTo)}</strong></div></div>` : ""}

      <div class="inv-meta-box" style="margin-bottom:14px;">
        <h4>Place of Supply</h4>
        <div>
          <strong>${t.taxType === "IGST" ? "INTER-STATE (IGST)" : "INTRA-STATE (CGST + SGST)"}</strong><br>
          Company State: ${escapeHtml(s.state || "-")} (${escapeHtml(s.stateCode || "-")}) &nbsp;·&nbsp; Party State: ${escapeHtml(party.state || "-")} (${escapeHtml(party.stateCode || "-")})
        </div>
      </div>

      <table>
        <thead><tr><th>Description</th><th>Taxable Amount</th><th>GST %</th><th>GST Amount</th><th>Total</th></tr></thead>
        <tbody>
          <tr>
            <td>${escapeHtml(inv.description || "Sales / Services rendered")}</td>
            <td class="num">${fmtNum(t.taxable)}</td>
            <td class="num">${t.gstRate}%</td>
            <td class="num">${fmtNum(t.gstAmount)}</td>
            <td class="num">${fmtNum(t.total)}</td>
          </tr>
        </tbody>
      </table>

      <div class="print-totals">
        <table>
          <tr><td>Taxable Amount</td><td class="num">${fmtMoney(t.taxable)}</td></tr>
          ${
            t.taxType === "IGST"
              ? `<tr><td>IGST (${t.igstRate}%)</td><td class="num">${fmtMoney(t.igstAmount)}</td></tr>`
              : `<tr><td>CGST (${t.cgstRate}%)</td><td class="num">${fmtMoney(t.cgstAmount)}</td></tr>
                 <tr><td>SGST (${t.sgstRate}%)</td><td class="num">${fmtMoney(t.sgstAmount)}</td></tr>`
          }
          <tr><td><strong>Invoice Total</strong></td><td class="num"><strong>${fmtMoney(t.total)}</strong></td></tr>
          ${inv.tdsApplicable === "Yes" ? `<tr><td>TDS (${inv.tdsRate}%)</td><td class="num">- ${fmtMoney(t.tdsAmount)}</td></tr>` : ""}
          <tr class="grand"><td>Net Receivable</td><td class="num">${fmtMoney(t.netReceivable)}</td></tr>
        </table>
      </div>

      <div style="clear:both;"></div>

      ${
        s.bankName
          ? `<div class="inv-meta-box" style="margin-top:20px;max-width:340px;">
               <h4>Bank Details</h4>
               <div>Bank: ${escapeHtml(s.bankName)}<br>A/C No: ${escapeHtml(s.bankAccount || "-")}<br>IFSC: ${escapeHtml(s.ifsc || "-")}</div>
             </div>`
          : ""
      }

      <div class="print-footer">
        <div style="max-width:60%;">${escapeHtml(s.invoiceNotes || "")}<br><br><span>Designed by Bhim Mondal</span></div>
        <div class="print-sign">
          <div>For ${escapeHtml(s.companyName)}</div>
          <div class="line">Authorised Signatory</div>
        </div>
      </div>
    `;
    document.getElementById("printArea").innerHTML = html;
    document.getElementById("printModalOverlay").classList.remove("hidden");
  }

  /* ============================= PURCHASE ENTRY ============================= */
  function renderPurchaseTable() {
    const q = (document.getElementById("purchaseSearch").value || "").toLowerCase().trim();
    const partyFilter = document.getElementById("purchasePartyFilter").value;
    const dateFilter = document.getElementById("purchaseDateFilter").value;
    const tbody = document.querySelector("#purchaseTable tbody");
    let list = [...DB.purchases].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (q) {
      list = list.filter((p) => {
        const party = partyById(p.partyId);
        return [p.purchaseInvoiceNo, party ? party.partyName : ""].join(" ").toLowerCase().includes(q);
      });
    }
    if (partyFilter) list = list.filter((p) => p.partyId === partyFilter);
    if (dateFilter) list = list.filter((p) => p.date === dateFilter);

    tbody.innerHTML = list.length
      ? list
          .map((p) => {
            const party = partyById(p.partyId);
            const t = computePurchaseTotals(p);
            return `<tr>
              <td>${escapeHtml(p.purchaseInvoiceNo)}</td>
              <td>${fmtDate(p.date)}</td>
              <td>${escapeHtml(party ? party.partyName : "Unknown Supplier")}</td>
              <td class="num">${fmtNum(t.taxable)}</td>
              <td class="num">${t.gstRate}%</td>
              <td class="num">${fmtNum(t.gstAmount)}</td>
              <td class="num">${fmtNum(t.total)}</td>
              <td class="num">${p.tdsApplicable === "Yes" ? fmtNum(t.tdsAmount) : "-"}</td>
              <td class="num">${fmtNum(t.netPayable)}</td>
              <td>${payableStatusBadge(p.paymentStatus || "Pending")}</td>
              <td class="actions-cell">
                <button class="btn btn-ghost btn-sm" data-action="view-purchase" data-id="${p.id}">View</button>
                <button class="btn btn-ghost btn-sm" data-action="print-purchase" data-id="${p.id}">Print</button>
                <button class="btn btn-ghost btn-sm" data-action="edit-purchase" data-id="${p.id}">Edit</button>
                ${p.status === "CANCELLED" ? '<span class="badge badge-dr">CANCELLED</span>' : `<button class="btn btn-ghost btn-sm" data-action="cancel-purchase" data-id="${p.id}">Cancel Invoice</button>`}
                <button class="btn btn-danger btn-sm" data-action="delete-purchase" data-id="${p.id}">Delete</button>
              </td>
            </tr>`;
          })
          .join("")
      : `<tr class="empty-row"><td colspan="11">No purchases found</td></tr>`;
  }

  function nextPurchaseInvoiceNo() {
    const prefix = DB.settings.purchasePrefix || "PUR-";
    const nums = DB.purchases
      .map((p) => p.purchaseInvoiceNo)
      .filter((n) => n && n.startsWith(prefix))
      .map((n) => parseInt(n.slice(prefix.length), 10))
      .filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return prefix + String(next).padStart(4, "0");
  }

  function openPurchaseModal(purchaseId) {
    refreshPartySelects();
    const overlay = document.getElementById("purchaseModalOverlay");
    const form = document.getElementById("purchaseForm");
    form.reset();
    document.getElementById("purchaseModalTitle").textContent = purchaseId ? "Edit Purchase" : "New Purchase";
    form.elements["id"].value = purchaseId || "";

    if (purchaseId) {
      const p = DB.purchases.find((x) => x.id === purchaseId);
      if (p) {
        form.elements["purchaseInvoiceNo"].value = p.purchaseInvoiceNo;
        form.elements["date"].value = p.date;
        form.elements["partyId"].value = p.partyId;
        form.elements["acTo"].value = p.acTo || "";
        form.elements["billTo"].value = p.billTo || "";
        form.elements["shipTo"].value = p.shipTo || "";
        form.elements["description"].value = p.description || "";
        form.elements["taxableAmount"].value = p.taxableAmount;
        form.elements["gstRate"].value = p.gstRate;
        form.querySelector(`input[name="tdsApplicable"][value="${p.tdsApplicable}"]`).checked = true;
        form.elements["tdsRate"].value = p.tdsRate || 1;
        form.elements["paymentStatus"].value = p.paymentStatus || "Pending";
        form.elements["narration"].value = p.narration || "";
        togglePurchaseTdsFields(p.tdsApplicable === "Yes");
      }
    } else {
      form.elements["purchaseInvoiceNo"].value = nextPurchaseInvoiceNo();
      form.elements["date"].value = todayISO();
      togglePurchaseTdsFields(false);
    }
    recalcPurchasePreview();
    overlay.classList.remove("hidden");
  }
  function closePurchaseModal() {
    document.getElementById("purchaseModalOverlay").classList.add("hidden");
  }

  function togglePurchaseTdsFields(show) {
    document.getElementById("purTdsRateField").style.display = show ? "flex" : "none";
    document.getElementById("purTdsAmtField").style.display = show ? "flex" : "none";
  }

  function togglePurchaseGstFields(isInterState) {
    document.getElementById("purCgstRateField").style.display = isInterState ? "none" : "flex";
    document.getElementById("purCgstAmtField").style.display = isInterState ? "none" : "flex";
    document.getElementById("purSgstRateField").style.display = isInterState ? "none" : "flex";
    document.getElementById("purSgstAmtField").style.display = isInterState ? "none" : "flex";
    document.getElementById("purIgstRateField").style.display = isInterState ? "flex" : "none";
    document.getElementById("purIgstAmtField").style.display = isInterState ? "flex" : "none";
  }

  function recalcPurchasePreview() {
    const form = document.getElementById("purchaseForm");
    const taxable = parseFloat(form.elements["taxableAmount"].value) || 0;
    const gstRate = parseFloat(form.elements["gstRate"].value) || 0;
    const tdsApplicable = form.querySelector('input[name="tdsApplicable"]:checked').value;
    const tdsRate = parseFloat(form.elements["tdsRate"].value) || 0;
    const partyId = form.elements["partyId"].value;
    const party = partyById(partyId);

    const breakup = computeGstBreakup(taxable, gstRate, DB.settings.stateCode || "", party ? party.stateCode || "" : "");
    const gstAmount = breakup.gstAmount;
    const total = round2(taxable + gstAmount);
    let tdsAmount = 0;
    let net = total;
    if (tdsApplicable === "Yes") {
      tdsAmount = round2((total * tdsRate) / 100);
      net = round2(total - tdsAmount);
    }
    const isInterState = breakup.taxType === "IGST";
    togglePurchaseGstFields(isInterState);
    document.getElementById("purTaxType").value = isInterState ? "INTER-STATE (IGST)" : "INTRA-STATE (CGST + SGST)";
    document.getElementById("purCgstRate").value = breakup.cgstRate + "%";
    document.getElementById("purCgstAmount").value = fmtNum(breakup.cgstAmount);
    document.getElementById("purSgstRate").value = breakup.sgstRate + "%";
    document.getElementById("purSgstAmount").value = fmtNum(breakup.sgstAmount);
    document.getElementById("purIgstRate").value = breakup.igstRate + "%";
    document.getElementById("purIgstAmount").value = fmtNum(breakup.igstAmount);
    document.getElementById("purGstAmount").value = fmtNum(gstAmount);
    document.getElementById("purTotal").value = fmtNum(total);
    document.getElementById("purTdsAmount").value = fmtNum(tdsAmount);
    document.getElementById("purNetPayable").value = fmtNum(net);
  }

  function handlePurchaseSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const id = form.elements["id"].value;
    const partyId = form.elements["partyId"].value;
    if (!partyId) {
      toast("Please select a supplier", "error");
      return;
    }
    const data = {
      purchaseInvoiceNo: form.elements["purchaseInvoiceNo"].value.trim(),
      date: form.elements["date"].value,
      partyId,
      acTo: form.elements["acTo"].value.trim(),
      billTo: form.elements["billTo"].value.trim(),
      shipTo: form.elements["shipTo"].value.trim(),
      description: form.elements["description"].value.trim(),
      taxableAmount: parseFloat(form.elements["taxableAmount"].value) || 0,
      gstRate: parseFloat(form.elements["gstRate"].value) || 0,
      tdsApplicable: form.querySelector('input[name="tdsApplicable"]:checked').value,
      tdsRate: parseFloat(form.elements["tdsRate"].value) || 0,
      paymentStatus: form.elements["paymentStatus"].value,
      narration: form.elements["narration"].value.trim()
    };
    if (!data.purchaseInvoiceNo) {
      toast("Purchase Invoice No is required", "error");
      return;
    }
    if (id) {
      const idx = DB.purchases.findIndex((p) => p.id === id);
      if (idx > -1) DB.purchases[idx] = { ...DB.purchases[idx], ...data };
      toast("Purchase updated", "success");
    } else {
      DB.purchases.push({ id: uid("pur"), ...data, createdAt: new Date().toISOString() });
      toast("Purchase saved", "success");
    }
    saveData();
    closePurchaseModal();
    renderPurchaseTable();
    renderRoute(location.hash.replace("#", "") || "dashboard");
  }

  async function deletePurchase(id) {
    if (DB.notes.some(n => n.referenceType === "purchase" && n.referenceId === id)) return toast("Purchases linked to debit/credit notes cannot be deleted. Use Cancel Invoice.", "error");
    const ok = await confirmDialog("Delete this purchase? Ledger and reports will be updated.", "Delete Purchase");
    if (!ok) return;
    DB.purchases = DB.purchases.filter((p) => p.id !== id);
    saveData();
    renderPurchaseTable();
    toast("Purchase deleted", "success");
  }

  /* ============================= PURCHASE REPORT ============================= */
  function renderPurchaseReport() {
    const q = (document.getElementById("purchaseReportSearch").value || "").toLowerCase().trim();
    const partyFilter = document.getElementById("purchaseReportPartyFilter").value;
    const from = document.getElementById("purchaseReportFrom").value;
    const to = document.getElementById("purchaseReportTo").value;
    const tbody = document.querySelector("#purchaseReportTable tbody");

    let list = [...DB.purchases];
    if (from) list = list.filter((p) => p.date >= from);
    if (to) list = list.filter((p) => p.date <= to);
    if (partyFilter) list = list.filter((p) => p.partyId === partyFilter);
    if (q) {
      list = list.filter((p) => {
        const party = partyById(p.partyId);
        return [p.purchaseInvoiceNo, party ? party.partyName : ""].join(" ").toLowerCase().includes(q);
      });
    }
    list.sort((a, b) => (a.date < b.date ? 1 : -1));

    let totalTaxable = 0,
      totalGst = 0,
      totalTotal = 0,
      totalTds = 0,
      totalNet = 0;

    tbody.innerHTML = list.length
      ? list
          .map((p) => {
            const party = partyById(p.partyId);
            const t = computePurchaseTotals(p);
            totalTaxable += t.taxable;
            totalGst += t.gstAmount;
            totalTotal += t.total;
            totalTds += t.tdsAmount;
            totalNet += t.netPayable;
            return `<tr>
              <td>${fmtDate(p.date)}</td>
              <td>${escapeHtml(p.purchaseInvoiceNo)}</td>
              <td>${escapeHtml(party ? party.partyName : "Unknown Supplier")}</td>
              <td class="num">${fmtNum(t.taxable)}</td>
              <td class="num">${fmtNum(t.gstAmount)}</td>
              <td class="num">${fmtNum(t.total)}</td>
              <td class="num">${p.tdsApplicable === "Yes" ? fmtNum(t.tdsAmount) : "-"}</td>
              <td class="num">${fmtNum(t.netPayable)}</td>
              <td>${payableStatusBadge(p.paymentStatus || "Pending")}</td>
              <td class="actions-cell">
                <button class="btn btn-ghost btn-sm" data-action="view-purchase" data-id="${p.id}">View</button>
                <button class="btn btn-ghost btn-sm" data-action="print-purchase" data-id="${p.id}">Print</button>
                <button class="btn btn-ghost btn-sm" data-action="edit-purchase" data-id="${p.id}">Edit</button>
                <button class="btn btn-danger btn-sm" data-action="delete-purchase" data-id="${p.id}">Delete</button>
              </td>
            </tr>`;
          })
          .join("")
      : `<tr class="empty-row"><td colspan="10">No purchases found</td></tr>`;

    document.getElementById("purchaseReportFoot").innerHTML = list.length
      ? `<tr><td colspan="3">Total</td><td class="num">${fmtNum(totalTaxable)}</td><td class="num">${fmtNum(totalGst)}</td><td class="num">${fmtNum(totalTotal)}</td><td class="num">${fmtNum(totalTds)}</td><td class="num">${fmtNum(totalNet)}</td><td></td><td></td></tr>`
      : "";
  }

  /* ============================= PURCHASE LEDGER ============================= */
  function renderPurchaseLedgerView() {
    refreshPartySelects();
    const partyId = document.getElementById("purchaseLedgerPartySelect").value;
    const from = document.getElementById("purchaseLedgerFrom").value;
    const to = document.getElementById("purchaseLedgerTo").value;
    const tbody = document.querySelector("#purchaseLedgerTable tbody");
    const summaryEl = document.getElementById("purchaseLedgerSummaryCards");

    if (!partyId) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Select a supplier to view ledger</td></tr>`;
      summaryEl.innerHTML = "";
      return;
    }

    const { rows, openingBalance } = buildPurchaseLedger(partyId, from, to);

    let rowsHtml = `<tr>
      <td>${from ? fmtDate(from) : "-"}</td>
      <td><strong>Opening Balance</strong></td>
      <td>-</td>
      <td class="num">-</td>
      <td class="num">-</td>
      <td class="num">${fmtNum(Math.abs(openingBalance))}</td>
      <td>${openingBalance >= 0 ? '<span class="badge badge-cr">Cr</span>' : '<span class="badge badge-dr">Dr</span>'}</td>
    </tr>`;

    rows.forEach((r) => {
      rowsHtml += `<tr>
        <td>${fmtDate(r.date)}</td>
        <td>${escapeHtml(r.particular)}</td>
        <td>${escapeHtml(r.reference)}</td>
        <td class="num">${r.debit ? fmtNum(r.debit) : "-"}</td>
        <td class="num">${r.credit ? fmtNum(r.credit) : "-"}</td>
        <td class="num">${fmtNum(Math.abs(r.balanceAfter))}</td>
        <td>${r.balanceAfter >= 0 ? '<span class="badge badge-cr">Cr</span>' : '<span class="badge badge-dr">Dr</span>'}</td>
      </tr>`;
    });

    tbody.innerHTML = rowsHtml;

    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    const closing = rows.length ? rows[rows.length - 1].balanceAfter : openingBalance;

    summaryEl.innerHTML = [
      { label: "Opening Balance", value: fmtMoney(Math.abs(openingBalance)) + (openingBalance >= 0 ? " Cr" : " Dr"), cls: "" },
      { label: "Total Debit (Paid)", value: fmtMoney(totalDebit), cls: "green" },
      { label: "Total Credit (Purchases)", value: fmtMoney(totalCredit), cls: "amber" },
      { label: "Closing Balance", value: fmtMoney(Math.abs(closing)) + (closing >= 0 ? " Cr" : " Dr"), cls: closing >= 0 ? "red" : "green" }
    ]
      .map(
        (c) => `<div class="stat-card ${c.cls}"><div class="stat-label">${c.label}</div><div class="stat-value">${c.value}</div></div>`
      )
      .join("");
  }

  function printPurchaseLedger() {
    const partyId = document.getElementById("purchaseLedgerPartySelect").value;
    if (!partyId) {
      toast("Select a supplier first", "error");
      return;
    }
    const party = partyById(partyId);
    const from = document.getElementById("purchaseLedgerFrom").value;
    const to = document.getElementById("purchaseLedgerTo").value;
    const { rows, openingBalance } = buildPurchaseLedger(partyId, from, to);
    const closing = rows.length ? rows[rows.length - 1].balanceAfter : openingBalance;

    let rowsHtml = `<tr><td>${from ? fmtDate(from) : "-"}</td><td><strong>Opening Balance</strong></td><td>-</td><td class="num">-</td><td class="num">-</td><td class="num">${fmtNum(Math.abs(openingBalance))} ${openingBalance >= 0 ? "Cr" : "Dr"}</td></tr>`;
    rows.forEach((r) => {
      rowsHtml += `<tr><td>${fmtDate(r.date)}</td><td>${escapeHtml(r.particular)}</td><td>${escapeHtml(r.reference)}</td><td class="num">${r.debit ? fmtNum(r.debit) : "-"}</td><td class="num">${r.credit ? fmtNum(r.credit) : "-"}</td><td class="num">${fmtNum(Math.abs(r.balanceAfter))} ${r.balanceAfter >= 0 ? "Cr" : "Dr"}</td></tr>`;
    });

    const html = `
      ${printDocumentHeader("Purchase Ledger Statement", (from ? fmtDate(from) : "Beginning") + " to " + (to ? fmtDate(to) : "Date"))}
      <div class="inv-meta-box" style="margin-bottom:18px;">
        <h4>Supplier</h4>
        <div><strong>${escapeHtml(party.partyName)}</strong><br>${escapeHtml(party.address || "")}<br>GSTIN: ${escapeHtml(party.gstin || "-")} · Mobile: ${escapeHtml(party.mobile || "-")}</div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Particular</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="print-totals">
        <table>
          <tr class="grand"><td>Closing Balance</td><td class="num">${fmtMoney(Math.abs(closing))} ${closing >= 0 ? "Cr" : "Dr"}</td></tr>
        </table>
      </div>
    `;
    openPrintArea(html);
  }

  /* ============================= PURCHASE PRINT ============================= */
  function printPurchaseDocument(purchaseId, autoPrint) {
    const pur = DB.purchases.find((p) => p.id === purchaseId);
    if (!pur) {
      toast("Purchase not found", "error");
      return;
    }
    const party = partyById(pur.partyId) || {};
    const t = computePurchaseTotals(pur);
    const s = DB.settings;

    const html = `
      <div class="inv-print-header">
        <div>
          <div class="co-name">${escapeHtml(s.companyName)}</div>
          <div class="co-meta">
            ${escapeHtml(s.companyAddress || "")}<br>
            ${s.companyGSTIN ? "GSTIN: " + escapeHtml(s.companyGSTIN) + "<br>" : ""}
            ${escapeHtml(s.companyMobile || "")} ${s.companyEmail ? " · " + escapeHtml(s.companyEmail) : ""}
          </div>
        </div>
        <div class="inv-badge">
          <h2>PURCHASE INVOICE</h2>
          <div class="co-meta">Purchase Inv No: <strong>${escapeHtml(pur.purchaseInvoiceNo)}</strong><br>Date: ${fmtDate(pur.date)}</div>
        </div>
      </div>

      <div class="inv-meta-grid">
        <div class="inv-meta-box">
          <h4>Supplier Details</h4>
          <div>
            <strong>${escapeHtml(party.partyName || "-")}</strong><br>
            ${escapeHtml(pur.billTo || party.billTo || "")}<br>
            ${party.gstin ? "GSTIN: " + escapeHtml(party.gstin) + "<br>" : ""}
            ${party.mobile ? "Mobile: " + escapeHtml(party.mobile) : ""}
          </div>
        </div>
        <div class="inv-meta-box">
          <h4>Ship To</h4>
          <div>${escapeHtml(pur.shipTo || party.shipTo || "Same as Bill To")}</div>
          <h4 style="margin-top:10px;">A/C To</h4>
          <div>${escapeHtml(pur.acTo || party.acTo || "-")}</div>
        </div>
      </div>

      <div class="inv-meta-box" style="margin-bottom:14px;">
        <h4>Place of Supply</h4>
        <div>
          <strong>${t.taxType === "IGST" ? "INTER-STATE (IGST)" : "INTRA-STATE (CGST + SGST)"}</strong><br>
          Company State: ${escapeHtml(s.state || "-")} (${escapeHtml(s.stateCode || "-")}) &nbsp;·&nbsp; Supplier State: ${escapeHtml(party.state || "-")} (${escapeHtml(party.stateCode || "-")})
        </div>
      </div>

      <table>
        <thead><tr><th>Description</th><th>Taxable Amount</th><th>GST %</th><th>GST Amount</th><th>Total</th></tr></thead>
        <tbody>
          <tr>
            <td>${escapeHtml(pur.description || "Goods / Services purchased")}</td>
            <td class="num">${fmtNum(t.taxable)}</td>
            <td class="num">${t.gstRate}%</td>
            <td class="num">${fmtNum(t.gstAmount)}</td>
            <td class="num">${fmtNum(t.total)}</td>
          </tr>
        </tbody>
      </table>

      <div class="print-totals">
        <table>
          <tr><td>Taxable Amount</td><td class="num">${fmtMoney(t.taxable)}</td></tr>
          ${
            t.taxType === "IGST"
              ? `<tr><td>IGST (${t.igstRate}%)</td><td class="num">${fmtMoney(t.igstAmount)}</td></tr>`
              : `<tr><td>CGST (${t.cgstRate}%)</td><td class="num">${fmtMoney(t.cgstAmount)}</td></tr>
                 <tr><td>SGST (${t.sgstRate}%)</td><td class="num">${fmtMoney(t.sgstAmount)}</td></tr>`
          }
          <tr><td><strong>Invoice Total</strong></td><td class="num"><strong>${fmtMoney(t.total)}</strong></td></tr>
          ${pur.tdsApplicable === "Yes" ? `<tr><td>TDS (${pur.tdsRate}%)</td><td class="num">- ${fmtMoney(t.tdsAmount)}</td></tr>` : ""}
          <tr class="grand"><td>Net Payable</td><td class="num">${fmtMoney(t.netPayable)}</td></tr>
        </table>
      </div>

      <div style="clear:both;"></div>

      ${pur.narration ? `<div class="inv-meta-box" style="margin-top:20px;"><h4>Narration</h4><div>${escapeHtml(pur.narration)}</div></div>` : ""}

      <div class="print-footer">
        <div>Payment Status: <strong>${escapeHtml(pur.paymentStatus || "Pending")}</strong></div>
        <div class="print-sign">
          <div>For ${escapeHtml(s.companyName)}</div>
          <div class="line">Authorised Signatory</div>
        </div>
      </div>
    `;
    openPrintArea(html);
    if (autoPrint) {
      setTimeout(() => window.print(), 200);
    }
  }

  function printPurchaseList() {
    const q = document.getElementById("purchaseSearch").value.trim();
    const d = document.getElementById("purchaseDateFilter").value;
    const partyFilter = document.getElementById("purchasePartyFilter").value;
    const partyName = partyFilter ? (partyById(partyFilter) || {}).partyName : "";
    const subtitle = filterSubtitle([q ? `Search: "${q}"` : "", partyName ? "Supplier: " + partyName : "", d ? "Date: " + fmtDate(d) : "", "Generated: " + fmtDate(todayISO())]);
    printTableGeneric("purchaseTable", "Purchase List", subtitle);
  }

  function printPurchaseReportDoc() {
    const q = document.getElementById("purchaseReportSearch").value.trim();
    const partyFilter = document.getElementById("purchaseReportPartyFilter").value;
    const partyName = partyFilter ? (partyById(partyFilter) || {}).partyName : "";
    const from = document.getElementById("purchaseReportFrom").value;
    const to = document.getElementById("purchaseReportTo").value;
    const subtitle = filterSubtitle([q ? `Search: "${q}"` : "", partyName ? "Supplier: " + partyName : "", from ? "From: " + fmtDate(from) : "", to ? "To: " + fmtDate(to) : "", "Generated: " + fmtDate(todayISO())]);
    printTableGeneric("purchaseReportTable", "Purchase Report", subtitle);
  }

  /* ============================= PAYMENTS (Supplier) ========================= */
  function renderPaymentTable() {
    const q = (document.getElementById("paymentSearch").value || "").toLowerCase().trim();
    const tbody = document.querySelector("#paymentTable tbody");
    let list = [...DB.payments].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (q) {
      list = list.filter((p) => {
        const party = partyById(p.partyId);
        return [p.paymentNo, party ? party.partyName : ""].join(" ").toLowerCase().includes(q);
      });
    }
    tbody.innerHTML = list.length
      ? list
          .map((p) => {
            const party = partyById(p.partyId);
            return `<tr>
              <td>${escapeHtml(p.paymentNo)}</td>
              <td>${fmtDate(p.date)}</td>
              <td>${escapeHtml(party ? party.partyName : "Unknown Supplier")}</td>
              <td class="num">${fmtNum(p.amount)}</td>
              <td>${escapeHtml(p.paymentMode || "-")}</td>
              <td>${escapeHtml(p.bankCash || "-")}</td>
              <td>${escapeHtml(p.reference || "-")}</td>
              <td class="actions-cell">
                <button class="btn btn-ghost btn-sm" data-action="edit-payment" data-id="${p.id}">Edit</button>
                <button class="btn btn-ghost btn-sm" data-action="print-payment" data-id="${p.id}">Print</button>
                <button class="btn btn-danger btn-sm" data-action="delete-payment" data-id="${p.id}">Delete</button>
              </td>
            </tr>`;
          })
          .join("")
      : `<tr class="empty-row"><td colspan="8">No payments found</td></tr>`;
  }

  function nextPaymentNo() {
    const prefix = DB.settings.paymentPrefix || "PAY-";
    const nums = DB.payments
      .map((p) => p.paymentNo)
      .filter((n) => n && n.startsWith(prefix))
      .map((n) => parseInt(n.slice(prefix.length), 10))
      .filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return prefix + String(next).padStart(4, "0");
  }

  function openPaymentModal(paymentId) {
    refreshPartySelects();
    const overlay = document.getElementById("paymentModalOverlay");
    const form = document.getElementById("paymentForm");
    form.reset();
    document.getElementById("paymentModalTitle").textContent = paymentId ? "Edit Payment" : "New Payment";
    form.elements["id"].value = paymentId || "";
    if (paymentId) {
      const p = DB.payments.find((x) => x.id === paymentId);
      if (p) {
        form.elements["paymentNo"].value = p.paymentNo;
        form.elements["date"].value = p.date;
        form.elements["partyId"].value = p.partyId;
        form.elements["amount"].value = p.amount;
        form.elements["paymentMode"].value = p.paymentMode || "Cash";
        form.elements["bankCash"].value = p.bankCash || "";
        form.elements["reference"].value = p.reference || "";
        form.elements["narration"].value = p.narration || "";
      }
    } else {
      form.elements["paymentNo"].value = nextPaymentNo();
      form.elements["date"].value = todayISO();
    }
    overlay.classList.remove("hidden");
  }
  function closePaymentModal() {
    document.getElementById("paymentModalOverlay").classList.add("hidden");
  }

  function handlePaymentSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const id = form.elements["id"].value;
    const partyId = form.elements["partyId"].value;
    if (!partyId) {
      toast("Please select a supplier", "error");
      return;
    }
    const data = {
      paymentNo: form.elements["paymentNo"].value.trim(),
      date: form.elements["date"].value,
      partyId,
      amount: parseFloat(form.elements["amount"].value) || 0,
      paymentMode: form.elements["paymentMode"].value,
      bankCash: form.elements["bankCash"].value.trim(),
      reference: form.elements["reference"].value.trim(),
      narration: form.elements["narration"].value.trim()
    };
    if (!data.paymentNo) {
      toast("Payment No is required", "error");
      return;
    }
    if (id) {
      const idx = DB.payments.findIndex((p) => p.id === id);
      if (idx > -1) DB.payments[idx] = { ...DB.payments[idx], ...data };
      toast("Payment updated", "success");
    } else {
      DB.payments.push({ id: uid("pay"), ...data, createdAt: new Date().toISOString() });
      toast("Payment saved", "success");
    }
    saveData();
    closePaymentModal();
    renderPaymentTable();
    renderRoute(location.hash.replace("#", "") || "dashboard");
  }

  async function deletePayment(id) {
    const ok = await confirmDialog("Delete this payment? Payable balances will be updated.", "Delete Payment");
    if (!ok) return;
    DB.payments = DB.payments.filter((p) => p.id !== id);
    saveData();
    renderPaymentTable();
    toast("Payment deleted", "success");
  }

  function printPaymentVoucher(id) {
    const p = DB.payments.find((x) => x.id === id);
    if (!p) {
      toast("Payment not found", "error");
      return;
    }
    const party = partyById(p.partyId) || {};
    const html =
      printDocumentHeader("Payment Voucher", "Payment No: " + (p.paymentNo || "-") + "  ·  Date: " + fmtDate(p.date)) +
      `<div class="inv-meta-grid">
        <div class="inv-meta-box">
          <h4>Paid To</h4>
          <div>
            <strong>${escapeHtml(party.partyName || "Unknown Supplier")}</strong><br>
            ${escapeHtml(party.address || "")}<br>
            ${party.gstin ? "GSTIN: " + escapeHtml(party.gstin) + "<br>" : ""}
            ${party.mobile ? "Mobile: " + escapeHtml(party.mobile) : ""}
          </div>
        </div>
        <div class="inv-meta-box">
          <h4>Payment Details</h4>
          <div>
            Date: ${fmtDate(p.date)}<br>
            Payment Mode: ${escapeHtml(p.paymentMode || "-")}<br>
            Bank/Cash: ${escapeHtml(p.bankCash || "-")}<br>
            Reference: ${escapeHtml(p.reference || "-")}
          </div>
        </div>
      </div>
      <table>
        <thead><tr><th>Narration</th><th>Amount</th></tr></thead>
        <tbody><tr><td>${escapeHtml(p.narration || "Payment made")}</td><td class="num">${fmtMoney(p.amount)}</td></tr></tbody>
      </table>
      <div class="print-totals">
        <table><tr class="grand"><td>Amount Paid</td><td class="num">${fmtMoney(p.amount)}</td></tr></table>
      </div>
      <div class="print-footer">
        <div>Thank you.</div>
        <div class="print-sign"><div>For ${escapeHtml(DB.settings.companyName)}</div><div class="line">Authorised Signatory</div></div>
      </div>`;
    openPrintArea(html);
  }

  function printPaymentList() {
    const q = document.getElementById("paymentSearch").value.trim();
    const subtitle = filterSubtitle([q ? `Search: "${q}"` : "", "Generated: " + fmtDate(todayISO())]);
    printTableGeneric("paymentTable", "Payment List", subtitle);
  }

  /* ============================= GENERIC PRINT ENGINE ======================= */
  // Shared header block for every printable document (company + title + subtitle/date)
  function printDocumentHeader(title, subtitle) {
    const s = DB.settings;
    return `
      <div class="inv-print-header">
        <div>
          <div class="co-name">${escapeHtml(s.companyName)}</div>
          <div class="co-meta">
            ${escapeHtml(s.companyAddress || "")}<br>
            ${s.companyGSTIN ? "GSTIN: " + escapeHtml(s.companyGSTIN) + "<br>" : ""}
            ${escapeHtml(s.companyMobile || "")} ${s.companyEmail ? " · " + escapeHtml(s.companyEmail) : ""}
          </div>
        </div>
        <div class="inv-badge">
          <h2>${escapeHtml(title)}</h2>
          <div class="co-meta">${escapeHtml(subtitle || "Generated: " + fmtDate(todayISO()))}</div>
        </div>
      </div>`;
  }

  function openPrintArea(html) {
    document.getElementById("printArea").innerHTML = html + '<div class="print-footer" style="margin-top:18px"><div>Designed by Bhim Mondal</div></div>';
    document.getElementById("printModalOverlay").classList.remove("hidden");
  }

  // Clone a rendered <table> (by id) into a printable table, stripping any
  // "Actions" column and any leftover buttons, so only real data prints.
  function cloneTableForPrint(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return "<p>No data available.</p>";
    const clone = table.cloneNode(true);

    let actionsIdx = -1;
    clone.querySelectorAll("thead th").forEach((th, idx) => {
      if (th.textContent.trim().toLowerCase() === "actions") actionsIdx = idx;
    });
    if (actionsIdx > -1) {
      clone.querySelectorAll("tr").forEach((tr) => {
        const cell = tr.children[actionsIdx];
        if (cell) cell.remove();
      });
    }
    clone.querySelectorAll("button").forEach((b) => b.remove());
    return clone.outerHTML;
  }

  // Generic: print whatever is currently rendered/filtered in a given table.
  function printTableGeneric(tableId, title, subtitle) {
    const html = printDocumentHeader(title, subtitle) + cloneTableForPrint(tableId);
    openPrintArea(html);
  }

  function filterSubtitle(parts) {
    const clean = parts.filter(Boolean);
    return clean.length ? clean.join("  ·  ") : "Generated: " + fmtDate(todayISO());
  }

  /* ---------- Dashboard print ---------- */
  function printDashboard() {
    const totalSales = DB.invoices.reduce((s, i) => s + computeInvoiceTotals(i).total, 0) - DB.notes.filter(n => n.referenceType === "sales" && n.status !== "VOID").reduce((s, n) => s + computeNoteTotals(n).total, 0);
    const totalReceivable = DB.parties.reduce((s, p) => s + Math.max(outstandingForParty(p.id), 0), 0);
    const totalReceived = DB.receipts.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const totalTds = DB.invoices.reduce((s, i) => s + computeInvoiceTotals(i).tdsAmount, 0);

    const summaryTable = `
      <table>
        <thead><tr><th>Total Sales</th><th>Total Receivable</th><th>Total Received</th><th>Total TDS</th><th>Parties</th><th>Invoices</th></tr></thead>
        <tbody><tr>
          <td class="num">${fmtMoney(totalSales)}</td>
          <td class="num">${fmtMoney(totalReceivable)}</td>
          <td class="num">${fmtMoney(totalReceived)}</td>
          <td class="num">${fmtMoney(totalTds)}</td>
          <td class="num">${DB.parties.length}</td>
          <td class="num">${DB.invoices.length}</td>
        </tr></tbody>
      </table>`;

    const html =
      printDocumentHeader("Dashboard Summary", "Generated: " + fmtDate(todayISO())) +
      `<h4 style="margin-top:4px;">Key Metrics</h4>` + summaryTable +
      `<h4 style="margin-top:22px;">Recent Invoices</h4>` + cloneTableForPrint("dashRecentInvoices") +
      `<h4 style="margin-top:22px;">Recent Receipts</h4>` + cloneTableForPrint("dashRecentReceipts") +
      `<h4 style="margin-top:22px;">Top Outstanding Parties</h4>` + cloneTableForPrint("dashOutstanding");

    openPrintArea(html);
  }

  /* ---------- Party Master prints ---------- */
  function printPartyList() {
    const q = document.getElementById("partySearch").value.trim();
    const subtitle = filterSubtitle([q ? `Search: "${q}"` : "", "Generated: " + fmtDate(todayISO())]);
    printTableGeneric("partyTable", "Party List", subtitle);
  }

  function printPartyDetails(id) {
    const p = partyById(id);
    if (!p) {
      toast("Party not found", "error");
      return;
    }
    const opening = openingSignedValue(p);
    const invoiced = totalInvoiceGrossForParty(id);
    const received = totalReceivedForParty(id);
    const tds = totalTdsForParty(id);
    const outstanding = outstandingForParty(id);

    const html =
      printDocumentHeader("Party Details", "Generated: " + fmtDate(todayISO())) +
      `<div class="inv-meta-box" style="margin-bottom:18px;">
        <h4>Party Information</h4>
        <div>
          <strong>${escapeHtml(p.partyName)}</strong><br>
          A/C To: ${escapeHtml(p.acTo || "-")}<br>
          Bill To: ${escapeHtml(p.billTo || "-")}<br>
          Ship To: ${escapeHtml(p.shipTo || "-")}<br>
          GSTIN: ${escapeHtml(p.gstin || "-")}<br>
          Mobile: ${escapeHtml(p.mobile || "-")} ${p.email ? " · Email: " + escapeHtml(p.email) : ""}<br>
          Address: ${escapeHtml(p.address || "-")}
        </div>
      </div>
      <table>
        <thead><tr><th>Opening Balance</th><th>Total Invoiced</th><th>Total Received</th><th>Total TDS</th><th>Outstanding Balance</th></tr></thead>
        <tbody><tr>
          <td class="num">${fmtMoney(Math.abs(opening))} ${opening >= 0 ? "Dr" : "Cr"}</td>
          <td class="num">${fmtMoney(invoiced)}</td>
          <td class="num">${fmtMoney(received)}</td>
          <td class="num">${fmtMoney(tds)}</td>
          <td class="num">${fmtMoney(Math.abs(outstanding))} ${outstanding >= 0 ? "Dr" : "Cr"}</td>
        </tr></tbody>
      </table>`;

    openPrintArea(html);
  }

  /* ---------- Sales Invoice list print ---------- */
  function printInvoiceList() {
    const q = document.getElementById("invoiceSearch").value.trim();
    const d = document.getElementById("invoiceDateFilter").value;
    const subtitle = filterSubtitle([q ? `Search: "${q}"` : "", d ? "Date: " + fmtDate(d) : "", "Generated: " + fmtDate(todayISO())]);
    printTableGeneric("invoiceTable", "Sales Invoice List", subtitle);
  }

  /* ---------- Receipts prints ---------- */
  function printReceiptList() {
    const q = document.getElementById("receiptSearch").value.trim();
    const subtitle = filterSubtitle([q ? `Search: "${q}"` : "", "Generated: " + fmtDate(todayISO())]);
    printTableGeneric("receiptTable", "Receipt List", subtitle);
  }

  function printReceiptVoucher(id) {
    const r = DB.receipts.find((x) => x.id === id);
    if (!r) {
      toast("Receipt not found", "error");
      return;
    }
    const p = partyById(r.partyId) || {};
    const html =
      printDocumentHeader("Payment Receipt", "Receipt No: " + (r.receiptNo || "-") + "  ·  Date: " + fmtDate(r.date)) +
      `<div class="inv-meta-grid">
        <div class="inv-meta-box">
          <h4>Received From</h4>
          <div>
            <strong>${escapeHtml(p.partyName || "Unknown Party")}</strong><br>
            ${escapeHtml(p.address || "")}<br>
            ${p.gstin ? "GSTIN: " + escapeHtml(p.gstin) + "<br>" : ""}
            ${p.mobile ? "Mobile: " + escapeHtml(p.mobile) : ""}
          </div>
        </div>
        <div class="inv-meta-box">
          <h4>Receipt Details</h4>
          <div>
            Date: ${fmtDate(r.date)}<br>
            Payment Mode: ${escapeHtml(r.paymentMode || "-")}<br>
            Bank/Cash: ${escapeHtml(r.bankCash || "-")}<br>
            Reference: ${escapeHtml(r.reference || "-")}
          </div>
        </div>
      </div>
      <table>
        <thead><tr><th>Narration</th><th>Amount</th></tr></thead>
        <tbody><tr><td>${escapeHtml(r.narration || "Payment received")}</td><td class="num">${fmtMoney(r.amount)}</td></tr></tbody>
      </table>
      <div class="print-totals">
        <table><tr class="grand"><td>Amount Received</td><td class="num">${fmtMoney(r.amount)}</td></tr></table>
      </div>
      <div class="print-footer">
        <div>Thank you.</div>
        <div class="print-sign"><div>For ${escapeHtml(DB.settings.companyName)}</div><div class="line">Authorised Signatory</div></div>
      </div>`;
    openPrintArea(html);
  }

  /* ---------- Outstanding report print ---------- */
  function printOutstandingReport() {
    const q = document.getElementById("outstandingSearch").value.trim();
    const status = document.getElementById("outstandingStatusFilter").value;
    const subtitle = filterSubtitle([q ? `Search: "${q}"` : "", status ? "Status: " + status : "", "Generated: " + fmtDate(todayISO())]);
    printTableGeneric("outstandingTable", "Outstanding Report", subtitle);
  }

  /* ---------- TDS report print ---------- */
  function printTdsReportDoc() {
    const from = document.getElementById("tdsFrom").value;
    const to = document.getElementById("tdsTo").value;
    const subtitle = filterSubtitle([from ? "From: " + fmtDate(from) : "", to ? "To: " + fmtDate(to) : "", "Generated: " + fmtDate(todayISO())]);
    printTableGeneric("tdsTable", tdsReportMode === "purchase" ? "Purchase TDS Report" : "Sales TDS Report", subtitle);
  }

  /* ---------- GST report print ---------- */
  function printGstReportDoc() {
    const from = document.getElementById("gstFrom").value;
    const to = document.getElementById("gstTo").value;
    const subtitle = filterSubtitle([from ? "From: " + fmtDate(from) : "", to ? "To: " + fmtDate(to) : "", "Generated: " + fmtDate(todayISO())]);
    printTableGeneric("gstTable", gstReportMode === "purchase" ? "Purchase GST Report" : "Sales GST Report", subtitle);
  }

  /* ============================= SETTINGS ================================== */
  function renderSettingsForm() {
    const form = document.getElementById("settingsForm");
    populateStateSelect(document.getElementById("settingsStateSelect"), DB.settings.state || "");
    Object.keys(DEFAULT_SETTINGS).forEach((key) => {
      if (form.elements[key]) form.elements[key].value = DB.settings[key] || "";
    });
  }

  function handleSettingsSubmit(e) {
    e.preventDefault();
    const form = e.target;
    Object.keys(DEFAULT_SETTINGS).forEach((key) => {
      if (form.elements[key]) DB.settings[key] = form.elements[key].value.trim();
    });
    saveData();
    document.getElementById("brandCompanyName").textContent = DB.settings.companyName || "BizBooks";
    toast("Settings saved", "success");
  }

  /* ============================= BACKUP / RESTORE =========================== */
  function backupData() {
    const blob = new Blob([JSON.stringify(DB, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `bizbooks-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("Backup downloaded", "success");
  }

  async function restoreData() {
    const fileInput = document.getElementById("restoreFile");
    const file = fileInput.files[0];
    if (!file) {
      toast("Please choose a backup file first", "error");
      return;
    }
    const ok = await confirmDialog(
      "Restoring will overwrite ALL current data (parties, invoices, receipts, settings). This cannot be undone. Continue?",
      "Restore Data"
    );
    if (!ok) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid file");
      DB = {
        parties: Array.isArray(parsed.parties) ? parsed.parties : [],
        invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
        purchases: Array.isArray(parsed.purchases) ? parsed.purchases : [],
        receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [],
        payments: Array.isArray(parsed.payments) ? parsed.payments : [],
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
        auditTrail: Array.isArray(parsed.auditTrail) ? parsed.auditTrail : [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }
      };
      saveData();
      toast("Data restored successfully", "success");
      fileInput.value = "";
      refreshPartySelects();
      document.getElementById("brandCompanyName").textContent = DB.settings.companyName || "BizBooks";
      navigate("dashboard");
      location.hash = "dashboard";
    } catch (err) {
      console.error(err);
      toast("Failed to restore: invalid backup file", "error");
    }
  }

  async function resetAllData() {
    const ok = await confirmDialog("This will permanently erase ALL data. This cannot be undone. Continue?", "Erase All Data");
    if (!ok) return;
    DB = defaultData();
    saveData();
    refreshPartySelects();
    updateCompanyLabels();
    navigate("dashboard");
    location.hash = "dashboard";
    toast("All data erased", "success");
  }

  /* ============================= GLOBAL SEARCH ============================= */
  /* ============================= DEBIT / CREDIT NOTES ====================== */
  function nextNoteNo(type) {
    const prefix = type === "Debit Note" ? "DN-" : "CN-";
    const nums = DB.notes.filter(n => n.noteNo && n.noteNo.startsWith(prefix)).map(n => parseInt(n.noteNo.slice(prefix.length), 10)).filter(Number.isFinite);
    return prefix + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, "0");
  }
  function noteSourceType(type) { return type === "Debit Note" ? "purchase" : "sales"; }
  function refreshNoteReferences(type, selectedId) {
    const sourceType = noteSourceType(type), list = sourceType === "purchase" ? DB.purchases : DB.invoices;
    const select = document.getElementById("noteReferenceSelect");
    select.innerHTML = '<option value="">-- Select ' + (sourceType === "purchase" ? "Purchase" : "Sales") + ' Invoice --</option>' + list.map(x => {
      const no = sourceType === "purchase" ? x.purchaseInvoiceNo : x.invoiceNo;
      const remaining = remainingReversibleAmount(sourceType, x.id, document.getElementById("noteForm").elements.id.value);
      return `<option value="${x.id}" ${remaining <= 0 ? "disabled" : ""}>${escapeHtml(no)} — ${fmtMoney(remaining)} available</option>`;
    }).join("");
    if (selectedId) select.value = selectedId;
  }
  function updateNotePreview() {
    const form = document.getElementById("noteForm"), type = form.elements.noteType.value, sourceType = noteSourceType(type), id = form.elements.referenceId.value;
    const source = sourceType === "purchase" ? DB.purchases.find(x => x.id === id) : DB.invoices.find(x => x.id === id);
    const party = source && partyById(source.partyId), taxable = Number(form.elements.taxableAmount.value) || 0, rate = Number(form.elements.gstRate.value) || 0;
    const breakup = computeGstBreakup(taxable, rate, DB.settings.stateCode || "", party ? party.stateCode || "" : ""), total = round2(taxable + breakup.gstAmount), tds = Math.min(total, Number(form.elements.tdsAdjustment.value) || 0);
    document.getElementById("noteParty").value = party ? party.partyName : "";
    document.getElementById("noteTaxType").value = breakup.taxType === "IGST" ? "IGST" : "CGST + SGST";
    document.getElementById("noteGstBreakup").value = breakup.taxType === "IGST" ? "IGST " + fmtMoney(breakup.igstAmount) : "CGST " + fmtMoney(breakup.cgstAmount) + " + SGST " + fmtMoney(breakup.sgstAmount);
    document.getElementById("noteGstAmount").value = fmtMoney(breakup.gstAmount);
    document.getElementById("noteTotal").value = fmtMoney(total);
    document.getElementById("noteNetAdjustment").value = fmtMoney(total - tds);
    document.getElementById("noteRemaining").value = source ? fmtMoney(remainingReversibleAmount(sourceType, source.id, form.elements.id.value)) : "";
  }
  function openNoteModal(type, noteId) {
    const form = document.getElementById("noteForm"), note = noteId ? DB.notes.find(n => n.id === noteId) : null;
    form.reset(); form.elements.id.value = noteId || ""; form.elements.noteType.value = type;
    document.getElementById("noteModalTitle").textContent = (noteId ? "Edit " : "New ") + type;
    form.elements.noteNo.value = note ? note.noteNo : nextNoteNo(type); form.elements.date.value = note ? note.date : todayISO();
    refreshNoteReferences(type, note && note.referenceId);
    if (note) { ["reason","description","taxableAmount","gstRate","tdsAdjustment","narration"].forEach(k => form.elements[k].value = note[k] || (k === "tdsAdjustment" ? 0 : "")); }
    updateNotePreview(); document.getElementById("noteModalOverlay").classList.remove("hidden");
  }
  function closeNoteModal() { document.getElementById("noteModalOverlay").classList.add("hidden"); }
  function handleNoteSubmit(e) {
    e.preventDefault(); const form = e.target, fd = new FormData(form), data = Object.fromEntries(fd.entries()), type = data.noteType, referenceType = noteSourceType(type);
    const source = referenceType === "purchase" ? DB.purchases.find(x => x.id === data.referenceId) : DB.invoices.find(x => x.id === data.referenceId);
    if (!source) return toast("Select a valid reference invoice", "error");
    data.partyId = source.partyId; data.referenceType = referenceType; data.referenceNo = referenceType === "purchase" ? source.purchaseInvoiceNo : source.invoiceNo;
    const total = computeNoteTotals(data).total, remaining = remainingReversibleAmount(referenceType, source.id, data.id);
    if (total <= 0 || total > remaining + .004) return toast("Note amount cannot exceed remaining reversible amount: " + fmtMoney(remaining), "error");
    data.status = "POSTED"; data.taxableAmount = Number(data.taxableAmount); data.gstRate = Number(data.gstRate); data.tdsAdjustment = Number(data.tdsAdjustment) || 0;
    if (data.id) { const index = DB.notes.findIndex(n => n.id === data.id); DB.notes[index] = { ...DB.notes[index], ...data, updatedAt:new Date().toISOString() }; }
    else { data.id = uid("note"); data.createdAt = new Date().toISOString(); DB.notes.push(data); }
    addAudit(data.id ? "NOTE_SAVED" : "NOTE_CREATED", type, data.id, data.noteNo + " against " + data.referenceNo); saveData(); closeNoteModal(); renderNoteTable(type); renderDashboard(); toast(type + " saved and posted", "success");
  }
  function renderNoteTable(type) {
    const isDebit = type === "Debit Note", input = document.getElementById(isDebit ? "debitNoteSearch" : "creditNoteSearch"), tbody = document.querySelector(isDebit ? "#debitNoteTable tbody" : "#creditNoteTable tbody"), q = (input.value || "").toLowerCase();
    const list = DB.notes.filter(n => n.noteType === type && [n.noteNo,n.referenceNo,(partyById(n.partyId) || {}).partyName].join(" ").toLowerCase().includes(q)).sort((a,b) => b.date.localeCompare(a.date));
    tbody.innerHTML = list.length ? list.map(n => { const t=computeNoteTotals(n), p=partyById(n.partyId); return `<tr><td>${fmtDate(n.date)}</td><td>${escapeHtml(n.noteNo)}</td><td>${escapeHtml(n.referenceNo)}</td><td>${escapeHtml(p ? p.partyName : "-")}</td><td class="num">${fmtNum(t.total)}</td><td class="num">${fmtNum(t.gstAmount)}</td><td class="num">${fmtNum(t.netAdjustment)}</td><td><span class="badge badge-cleared">${n.status}</span></td><td class="actions-cell"><button class="btn btn-ghost btn-sm" data-action="print-note" data-id="${n.id}">Print</button><button class="btn btn-ghost btn-sm" data-action="edit-note" data-id="${n.id}">Edit</button></td></tr>`; }).join("") : '<tr class="empty-row"><td colspan="9">No notes found</td></tr>';
  }
  function printNote(noteId) { const n=DB.notes.find(x=>x.id===noteId); if(!n)return; const t=computeNoteTotals(n), p=partyById(n.partyId)||{}, s=DB.settings; openPrintArea(`<div class="inv-print-header"><div><div class="co-name">${escapeHtml(s.companyName)}</div><div class="co-meta">${escapeHtml(s.companyAddress||"")}<br>${s.companyGSTIN ? "GSTIN: "+escapeHtml(s.companyGSTIN):""}</div></div><div class="inv-badge"><h2>${n.noteType.toUpperCase()}</h2><div class="co-meta">Note No: <strong>${escapeHtml(n.noteNo)}</strong><br>Date: ${fmtDate(n.date)}</div></div></div><div class="inv-meta-grid"><div class="inv-meta-box"><h4>Party</h4><div>${escapeHtml(p.partyName||"")}<br>${escapeHtml(p.address||"")}</div></div><div class="inv-meta-box"><h4>Reference Invoice</h4><div>${escapeHtml(n.referenceNo)}<br>Reason: ${escapeHtml(n.reason)}</div></div></div><table><thead><tr><th>Description</th><th class="num">Taxable</th><th class="num">GST</th><th class="num">Total</th></tr></thead><tbody><tr><td>${escapeHtml(n.description||n.reason)}</td><td class="num">${fmtMoney(t.taxable)}</td><td class="num">${fmtMoney(t.gstAmount)}</td><td class="num">${fmtMoney(t.total)}</td></tr></tbody></table><div class="print-totals"><table><tr><td>TDS Adjustment</td><td class="num">${fmtMoney(t.tdsAdjustment)}</td></tr><tr class="grand"><td>Net Adjustment</td><td class="num">${fmtMoney(t.netAdjustment)}</td></tr></table></div><div class="print-footer"><div>${escapeHtml(n.narration||"")}</div><div class="print-sign"><div>For ${escapeHtml(s.companyName)}</div><div class="line">Authorised Signatory</div></div></div>`); }
  async function cancelInvoice(referenceType, id) {
    const source = referenceType === "purchase" ? DB.purchases.find(x=>x.id===id) : DB.invoices.find(x=>x.id===id); if (!source || source.status === "CANCELLED") return;
    const no = referenceType === "purchase" ? source.purchaseInvoiceNo : source.invoiceNo, remaining = remainingReversibleAmount(referenceType, id);
    if (remaining <= .004) return toast("This invoice already has a full reversal", "error");
    if (!await confirmDialog("Cancel " + no + " and create the required reversal note? The original remains visible.", "Cancel Invoice")) return;
    const total = referenceType === "purchase" ? computePurchaseTotals(source) : computeInvoiceTotals(source), taxable = round2(remaining / (1 + (Number(source.gstRate)||0)/100));
    const noteType = referenceType === "purchase" ? "Debit Note" : "Credit Note", note = {id:uid("note"),noteType,noteNo:nextNoteNo(noteType),date:todayISO(),partyId:source.partyId,referenceType,referenceId:id,referenceNo:no,reason:"Invoice cancellation",description:"Automatic reversal of cancelled invoice",taxableAmount:taxable,gstRate:Number(source.gstRate)||0,tdsAdjustment:round2((total.tdsAmount || 0) * remaining / (total.total || 1)),narration:"Auto-created on cancellation",status:"POSTED",createdAt:new Date().toISOString(),autoCreated:true};
    DB.notes.push(note); source.status="CANCELLED"; source.cancelledAt=new Date().toISOString(); source.cancelNoteId=note.id; addAudit("INVOICE_CANCELLED", referenceType, id, no + " reversed by " + note.noteNo); saveData(); renderInvoiceTable(); renderPurchaseTable(); renderDashboard(); toast(no + " cancelled and " + note.noteNo + " created", "success");
  }
  function handleGlobalSearch() {
    const q = (document.getElementById("globalSearch").value || "").toLowerCase().trim();
    if (!q) return;
    // Simple heuristic: jump to parties view and filter, also check invoices
    const partyMatch = DB.parties.some((p) => p.partyName.toLowerCase().includes(q));
    const invoiceMatch = DB.invoices.some((i) => i.invoiceNo.toLowerCase().includes(q));
    if (invoiceMatch && !partyMatch) {
      location.hash = "invoices";
      setTimeout(() => {
        document.getElementById("invoiceSearch").value = q;
        renderInvoiceTable();
      }, 0);
    } else {
      location.hash = "parties";
      setTimeout(() => {
        document.getElementById("partySearch").value = q;
        renderPartyTable();
      }, 0);
    }
  }

  /* ============================= EVENT WIRING =============================== */
  function wireEvents() {
    document.getElementById("themeToggle").addEventListener("click", toggleTheme);
    document.getElementById("switchCompanyBtn").addEventListener("click", openCompanyScreen);
    document.getElementById("logoutBtn").addEventListener("click", logout);
    document.getElementById("newCompanyBtn").addEventListener("click", () => openCompanyForm(null));
    document.getElementById("cancelCompanyBtn").addEventListener("click", () => document.getElementById("companyForm").classList.add("hidden"));
    document.getElementById("companyForm").addEventListener("submit", saveCompany);
    document.getElementById("companyList").addEventListener("click", companyAction);
    document.getElementById("companyStateSelect").addEventListener("change", e => document.getElementById("companyStateCode").value = STATE_CODE_MAP[e.target.value] || "");
    // Sidebar nav
    document.querySelectorAll(".nav-item").forEach((a) => {
      a.addEventListener("click", () => closeSidebarMobile());
    });
    document.getElementById("menuToggle").addEventListener("click", openSidebarMobile);
    document.getElementById("sidebarBackdrop").addEventListener("click", closeSidebarMobile);

    // Global search
    document.getElementById("globalSearch").addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleGlobalSearch();
    });

    /* ---------- Dashboard ---------- */
    document.getElementById("printDashboardBtn").addEventListener("click", printDashboard);

    /* ---------- Party Master ---------- */
    document.getElementById("printPartyListBtn").addEventListener("click", printPartyList);
    document.getElementById("addPartyBtn").addEventListener("click", () => openPartyModal(null));
    document.getElementById("partyModalClose").addEventListener("click", closePartyModal);
    document.getElementById("partyCancelBtn").addEventListener("click", closePartyModal);
    document.getElementById("partyForm").addEventListener("submit", handlePartySubmit);
    document.getElementById("partyStateSelect").addEventListener("change", (e) => {
      document.getElementById("partyStateCode").value = STATE_CODE_MAP[e.target.value] || "";
    });
    document.getElementById("partySearch").addEventListener("input", renderPartyTable);
    document.getElementById("partyTable").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === "edit-party") openPartyModal(id);
      if (btn.dataset.action === "delete-party") deleteParty(id);
      if (btn.dataset.action === "print-party") printPartyDetails(id);
      if (btn.dataset.action === "ledger-party") {
        location.hash = "ledger";
        setTimeout(() => {
          document.getElementById("ledgerPartySelect").value = id;
          renderLedgerView();
        }, 0);
      }
    });

    /* ---------- Invoices ---------- */
    document.getElementById("printInvoiceListBtn").addEventListener("click", printInvoiceList);
    document.getElementById("addInvoiceBtn").addEventListener("click", () => openInvoiceModal(null));
    document.getElementById("invoiceModalClose").addEventListener("click", closeInvoiceModal);
    document.getElementById("invoiceCancelBtn").addEventListener("click", closeInvoiceModal);
    document.getElementById("invoiceForm").addEventListener("submit", handleInvoiceSubmit);
    document.getElementById("invoiceSearch").addEventListener("input", renderInvoiceTable);
    document.getElementById("invoiceDateFilter").addEventListener("change", renderInvoiceTable);
    document.getElementById("invServiceMonth").addEventListener("change", (e) => setInvoiceServiceMonth(e.target.value));
    document.getElementById("invTaxable").addEventListener("input", recalcInvoicePreview);
    document.getElementById("invGstRate").addEventListener("change", recalcInvoicePreview);
    document.getElementById("invTdsRate").addEventListener("change", recalcInvoicePreview);
    document.getElementById("invoicePartySelect").addEventListener("change", (e) => {
      const party = partyById(e.target.value);
      document.getElementById("invoicePartySearch").value = party ? party.partyName : "";
      fillInvoicePartyDetails(e.target.value, true);
      recalcInvoicePreview();
      if (e.target.value) showGstDetectionPopup(e.target.value);
    });
    document.getElementById("invoicePartySearch").addEventListener("change", selectInvoicePartyFromSearch);
    document.getElementById("invoicePartySearch").addEventListener("input", () => {
      const search = document.getElementById("invoicePartySearch");
      const exact = DB.parties.find(p => p.partyName.toLowerCase() === search.value.trim().toLowerCase());
      if (exact) selectInvoicePartyFromSearch();
    });
    document.querySelectorAll('input[name="tdsApplicable"]').forEach((r) => {
      r.addEventListener("change", (e) => {
        toggleTdsFields(e.target.value === "Yes");
        recalcInvoicePreview();
      });
    });
    document.getElementById("invoiceTable").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === "edit-invoice") openInvoiceModal(id);
      if (btn.dataset.action === "delete-invoice") deleteInvoice(id);
      if (btn.dataset.action === "print-invoice") printInvoice(id);
      if (btn.dataset.action === "cancel-invoice") cancelInvoice("sales", id);
    });

    /* ---------- Receipts ---------- */
    document.getElementById("printReceiptListBtn").addEventListener("click", printReceiptList);
    document.getElementById("addReceiptBtn").addEventListener("click", () => openReceiptModal(null));
    document.getElementById("receiptModalClose").addEventListener("click", closeReceiptModal);
    document.getElementById("receiptCancelBtn").addEventListener("click", closeReceiptModal);
    document.getElementById("receiptForm").addEventListener("submit", handleReceiptSubmit);
    document.querySelector('#receiptForm select[name="partyId"]').addEventListener("change", (e) => {
      populateReceiptInvoices(e.target.value);
      fillReceiptInvoiceDetails(false);
    });
    document.getElementById("receiptInvoiceSelect").addEventListener("change", () => fillReceiptInvoiceDetails(true));
    document.getElementById("receiptSearch").addEventListener("input", renderReceiptTable);
    document.getElementById("receiptTable").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === "edit-receipt") openReceiptModal(id);
      if (btn.dataset.action === "delete-receipt") deleteReceipt(id);
      if (btn.dataset.action === "print-receipt") printReceiptVoucher(id);
    });

    /* ---------- Purchase Entry ---------- */
    document.getElementById("printPurchaseListBtn").addEventListener("click", printPurchaseList);
    document.getElementById("addPurchaseBtn").addEventListener("click", () => openPurchaseModal(null));
    document.getElementById("purchaseModalClose").addEventListener("click", closePurchaseModal);
    document.getElementById("purchaseCancelBtn").addEventListener("click", closePurchaseModal);
    document.getElementById("purchaseForm").addEventListener("submit", handlePurchaseSubmit);
    document.getElementById("purchaseSearch").addEventListener("input", renderPurchaseTable);
    document.getElementById("purchasePartyFilter").addEventListener("change", renderPurchaseTable);
    document.getElementById("purchaseDateFilter").addEventListener("change", renderPurchaseTable);
    document.getElementById("purTaxable").addEventListener("input", recalcPurchasePreview);
    document.getElementById("purGstRate").addEventListener("change", recalcPurchasePreview);
    document.getElementById("purTdsRate").addEventListener("change", recalcPurchasePreview);
    document.getElementById("purchasePartySelect").addEventListener("change", (e) => {
      recalcPurchasePreview();
      if (e.target.value) showGstDetectionPopup(e.target.value);
    });
    document.querySelectorAll('#purchaseForm input[name="tdsApplicable"]').forEach((r) => {
      r.addEventListener("change", (e) => {
        togglePurchaseTdsFields(e.target.value === "Yes");
        recalcPurchasePreview();
      });
    });
    document.getElementById("purchaseTable").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === "edit-purchase") openPurchaseModal(id);
      if (btn.dataset.action === "delete-purchase") deletePurchase(id);
      if (btn.dataset.action === "print-purchase") printPurchaseDocument(id, true);
      if (btn.dataset.action === "view-purchase") printPurchaseDocument(id, false);
      if (btn.dataset.action === "cancel-purchase") cancelInvoice("purchase", id);
    });

    /* ---------- Debit / Credit Notes ---------- */
    document.getElementById("addCreditNoteBtn").addEventListener("click", () => openNoteModal("Credit Note"));
    document.getElementById("addDebitNoteBtn").addEventListener("click", () => openNoteModal("Debit Note"));
    document.getElementById("creditNoteSearch").addEventListener("input", () => renderNoteTable("Credit Note"));
    document.getElementById("debitNoteSearch").addEventListener("input", () => renderNoteTable("Debit Note"));
    document.getElementById("printCreditNotesBtn").addEventListener("click", () => printTableGeneric("creditNoteTable", "Credit Note Report", "Posted credit notes"));
    document.getElementById("printDebitNotesBtn").addEventListener("click", () => printTableGeneric("debitNoteTable", "Debit Note Report", "Posted debit notes"));
    document.getElementById("noteModalClose").addEventListener("click", closeNoteModal);
    document.getElementById("noteCancelBtn").addEventListener("click", closeNoteModal);
    document.getElementById("noteForm").addEventListener("submit", handleNoteSubmit);
    ["noteTaxable","noteGstRate","noteTdsAdjustment"].forEach(id => document.getElementById(id).addEventListener(id === "noteGstRate" ? "change" : "input", updateNotePreview));
    document.getElementById("noteReferenceSelect").addEventListener("change", updateNotePreview);
    ["creditNoteTable", "debitNoteTable"].forEach(tableId => document.getElementById(tableId).addEventListener("click", (e) => { const b=e.target.closest("button[data-action]"); if(!b)return; const n=DB.notes.find(x=>x.id===b.dataset.id); if(!n)return; if(b.dataset.action === "print-note") printNote(n.id); if(b.dataset.action === "edit-note") openNoteModal(n.noteType,n.id); }));

    /* ---------- Purchase Report ---------- */
    document.getElementById("printPurchaseReportBtn").addEventListener("click", printPurchaseReportDoc);
    document.getElementById("purchaseReportSearch").addEventListener("input", renderPurchaseReport);
    document.getElementById("purchaseReportPartyFilter").addEventListener("change", renderPurchaseReport);
    document.getElementById("purchaseReportFrom").addEventListener("change", renderPurchaseReport);
    document.getElementById("purchaseReportTo").addEventListener("change", renderPurchaseReport);
    document.getElementById("purchaseReportTable").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === "edit-purchase") openPurchaseModal(id);
      if (btn.dataset.action === "delete-purchase") deletePurchase(id);
      if (btn.dataset.action === "print-purchase") printPurchaseDocument(id, true);
      if (btn.dataset.action === "view-purchase") printPurchaseDocument(id, false);
    });

    /* ---------- Purchase Ledger ---------- */
    document.getElementById("purchaseLedgerPartySelect").addEventListener("change", renderPurchaseLedgerView);
    document.getElementById("purchaseLedgerFrom").addEventListener("change", renderPurchaseLedgerView);
    document.getElementById("purchaseLedgerTo").addEventListener("change", renderPurchaseLedgerView);
    document.getElementById("purchaseLedgerPrintBtn").addEventListener("click", printPurchaseLedger);

    /* ---------- Payments ---------- */
    document.getElementById("printPaymentListBtn").addEventListener("click", printPaymentList);
    document.getElementById("addPaymentBtn").addEventListener("click", () => openPaymentModal(null));
    document.getElementById("paymentModalClose").addEventListener("click", closePaymentModal);
    document.getElementById("paymentCancelBtn").addEventListener("click", closePaymentModal);
    document.getElementById("paymentForm").addEventListener("submit", handlePaymentSubmit);
    document.getElementById("paymentSearch").addEventListener("input", renderPaymentTable);
    document.getElementById("paymentTable").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === "edit-payment") openPaymentModal(id);
      if (btn.dataset.action === "delete-payment") deletePayment(id);
      if (btn.dataset.action === "print-payment") printPaymentVoucher(id);
    });

    /* ---------- Ledger ---------- */
    document.getElementById("ledgerPartySelect").addEventListener("change", renderLedgerView);
    document.getElementById("ledgerFrom").addEventListener("change", renderLedgerView);
    document.getElementById("ledgerTo").addEventListener("change", renderLedgerView);
    document.getElementById("ledgerPrintBtn").addEventListener("click", printLedger);

    /* ---------- Outstanding ---------- */
    document.getElementById("outstandingSearch").addEventListener("input", renderOutstandingTable);
    document.getElementById("outstandingStatusFilter").addEventListener("change", renderOutstandingTable);
    document.getElementById("printOutstandingBtn").addEventListener("click", printOutstandingReport);
    document.getElementById("payableSearch").addEventListener("input", renderPayableTable);
    document.getElementById("payableStatusFilter").addEventListener("change", renderPayableTable);
    document.getElementById("printPayableBtn").addEventListener("click", printPayableReport);

    /* ---------- TDS / GST reports ---------- */
    document.getElementById("tdsSearch").addEventListener("input", renderTdsReport);
    document.getElementById("tdsFrom").addEventListener("change", renderTdsReport);
    document.getElementById("tdsTo").addEventListener("change", renderTdsReport);
    document.getElementById("printTdsBtn").addEventListener("click", printTdsReportDoc);
    document.getElementById("tdsModeSalesBtn").addEventListener("click", () => {
      tdsReportMode = "sales";
      document.getElementById("tdsModeSalesBtn").classList.add("active");
      document.getElementById("tdsModePurchaseBtn").classList.remove("active");
      renderTdsReport();
    });
    document.getElementById("tdsModePurchaseBtn").addEventListener("click", () => {
      tdsReportMode = "purchase";
      document.getElementById("tdsModePurchaseBtn").classList.add("active");
      document.getElementById("tdsModeSalesBtn").classList.remove("active");
      renderTdsReport();
    });

    document.getElementById("gstSearch").addEventListener("input", renderGstReport);
    document.getElementById("gstFrom").addEventListener("change", renderGstReport);
    document.getElementById("gstTo").addEventListener("change", renderGstReport);
    document.getElementById("printGstBtn").addEventListener("click", printGstReportDoc);
    document.getElementById("gstModeSalesBtn").addEventListener("click", () => {
      gstReportMode = "sales";
      document.getElementById("gstModeSalesBtn").classList.add("active");
      document.getElementById("gstModePurchaseBtn").classList.remove("active");
      renderGstReport();
    });
    document.getElementById("gstModePurchaseBtn").addEventListener("click", () => {
      gstReportMode = "purchase";
      document.getElementById("gstModePurchaseBtn").classList.add("active");
      document.getElementById("gstModeSalesBtn").classList.remove("active");
      renderGstReport();
    });

    /* ---------- Print modal ---------- */
    document.getElementById("printModalClose").addEventListener("click", () => {
      document.getElementById("printModalOverlay").classList.add("hidden");
    });
    document.getElementById("printNowBtn").addEventListener("click", () => window.print());

    /* ---------- GST Detection popup ---------- */
    document.getElementById("gstDetectionOkBtn").addEventListener("click", () => {
      document.getElementById("gstDetectionOverlay").classList.add("hidden");
    });
    document.getElementById("gstDetectionOverlay").addEventListener("click", (e) => {
      if (e.target.id === "gstDetectionOverlay") e.target.classList.add("hidden");
    });

    /* ---------- Backup / Restore ---------- */
    document.getElementById("backupBtn").addEventListener("click", backupData);
    document.getElementById("restoreBtn").addEventListener("click", restoreData);
    document.getElementById("resetAllBtn").addEventListener("click", resetAllData);

    /* ---------- Settings ---------- */
    document.getElementById("settingsForm").addEventListener("submit", handleSettingsSubmit);
    document.getElementById("settingsStateSelect").addEventListener("change", (e) => {
      document.getElementById("settingsStateCode").value = STATE_CODE_MAP[e.target.value] || "";
    });

    /* ---------- Close modals on overlay click ---------- */
    [
      ["partyModalOverlay", closePartyModal],
      ["invoiceModalOverlay", closeInvoiceModal],
      ["receiptModalOverlay", closeReceiptModal],
      ["purchaseModalOverlay", closePurchaseModal],
      ["paymentModalOverlay", closePaymentModal]
      ,["noteModalOverlay", closeNoteModal]
    ].forEach(([id, closer]) => {
      document.getElementById(id).addEventListener("click", (e) => {
        if (e.target.id === id) closer();
      });
    });
    document.getElementById("printModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "printModalOverlay") e.target.classList.add("hidden");
    });

    // Escape key closes modals
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      closePartyModal();
      closeInvoiceModal();
      closeReceiptModal();
      closePurchaseModal();
      closePaymentModal();
      closeNoteModal();
      document.getElementById("printModalOverlay").classList.add("hidden");
      document.getElementById("confirmOverlay").classList.add("hidden");
      document.getElementById("gstDetectionOverlay").classList.add("hidden");
    });
  }

  /* ============================= SEED DEMO DATA (first run) ================= */
  function seedIfEmpty() {
    if (DB.parties.length || DB.invoices.length || DB.receipts.length || DB.purchases.length || DB.payments.length) return;
    const p1 = { id: uid("party"), partyName: "Sharma Traders", acTo: "Sharma Traders", billTo: "Sharma Traders, Karol Bagh, Delhi", shipTo: "Same as Bill To", gstin: "07AAACS1234F1Z5", state: "Delhi", stateCode: "07", mobile: "9811122233", email: "sharma@traders.in", address: "Karol Bagh, Delhi", openingBalance: 5000, openingType: "Dr", createdAt: new Date().toISOString() };
    const p2 = { id: uid("party"), partyName: "Verma Enterprises", acTo: "Verma Enterprises", billTo: "Verma Enterprises, Sector 18, Gurugram", shipTo: "Same as Bill To", gstin: "06AAACV5678G1Z2", state: "Haryana", stateCode: "06", mobile: "9899988877", email: "contact@vermaent.in", address: "Sector 18, Gurugram", openingBalance: 0, openingType: "Dr", createdAt: new Date().toISOString() };
    DB.parties.push(p1, p2);

    const inv1 = { id: uid("inv"), invoiceNo: "INV-0001", date: todayISO(), partyId: p1.id, acTo: p1.acTo, billTo: p1.billTo, shipTo: p1.shipTo, description: "Consulting Services - August", taxableAmount: 50000, gstRate: 18, tdsApplicable: "Yes", tdsRate: 2, createdAt: new Date().toISOString() };
    const inv2 = { id: uid("inv"), invoiceNo: "INV-0002", date: todayISO(), partyId: p2.id, acTo: p2.acTo, billTo: p2.billTo, shipTo: p2.shipTo, description: "Product Sale - Batch 12", taxableAmount: 20000, gstRate: 12, tdsApplicable: "No", tdsRate: 0, createdAt: new Date().toISOString() };
    DB.invoices.push(inv1, inv2);

    const rcpt1 = { id: uid("rcpt"), receiptNo: "RCT-0001", date: todayISO(), partyId: p1.id, amount: 20000, paymentMode: "Bank Transfer", bankCash: "HDFC Bank", reference: "UTR123456", narration: "Advance received", createdAt: new Date().toISOString() };
    DB.receipts.push(rcpt1);

    const pur1 = { id: uid("pur"), purchaseInvoiceNo: "PUR-0001", date: todayISO(), partyId: p2.id, acTo: p2.acTo, billTo: p2.billTo, shipTo: p2.shipTo, description: "Raw Material Purchase", taxableAmount: 30000, gstRate: 18, tdsApplicable: "Yes", tdsRate: 1, paymentStatus: "Partially Paid", narration: "Monthly stock purchase", createdAt: new Date().toISOString() };
    DB.purchases.push(pur1);

    const pay1 = { id: uid("pay"), paymentNo: "PAY-0001", date: todayISO(), partyId: p2.id, amount: 10000, paymentMode: "Bank Transfer", bankCash: "HDFC Bank", reference: "UTR987654", narration: "Advance payment", createdAt: new Date().toISOString() };
    DB.payments.push(pay1);

    saveData();
  }

  /* ============================= INIT ======================================= */
  function initLogin() {
    const screen = document.getElementById("loginScreen"), form = document.getElementById("loginForm"), error = document.getElementById("loginError");
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (session && ACCOUNTS[session.username]) { screen.classList.add("hidden"); openCompanyScreen(); }
    } catch (_) { localStorage.removeItem(SESSION_KEY); }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const username = form.elements.username.value.trim(), password = form.elements.password.value;
      const account = ACCOUNTS[username];
      if (!account || account.password !== password) { error.classList.remove("hidden"); return; }
      localStorage.setItem(SESSION_KEY, JSON.stringify({ username, role: account.role, loggedInAt: new Date().toISOString() }));
      error.classList.add("hidden"); screen.classList.add("hidden"); openCompanyScreen();
    });
  }
  function applyTheme(theme) { const dark = theme === "dark"; document.documentElement.dataset.theme = dark ? "dark" : "normal"; localStorage.setItem(THEME_KEY, dark ? "dark" : "normal"); const button = document.getElementById("themeToggle"); if (button) button.textContent = dark ? "🌙 Dark" : "☀ Normal"; }
  function toggleTheme() { applyTheme(document.documentElement.dataset.theme === "dark" ? "normal" : "dark"); }
  function initTheme() { applyTheme(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "normal"); }
  function companyRegistry() { return JSON.parse(localStorage.getItem(COMPANIES_KEY) || "{\"companies\":[]}"); }
  function updateCompanyLabels() { const c = companyRegistry().companies.find(x => x.id === activeCompanyId); const name = c ? c.companyName : DB.settings.companyName; document.getElementById("brandCompanyName").textContent = name || "BizBooks"; document.getElementById("activeCompanyName").textContent = name || ""; }
  function renderCompanyList() { const list=document.getElementById("companyList"), registry=companyRegistry(); list.innerHTML=registry.companies.map(c => `<div class="company-row"><div><strong>${escapeHtml(c.companyName)}</strong><small>${escapeHtml(c.companyGSTIN || "No GSTIN")} · ${escapeHtml(c.financialYear || "Financial year not set")}</small></div><div class="company-actions"><button class="btn btn-primary btn-sm" data-company-action="select" data-id="${c.id}">${c.id===activeCompanyId ? "Active" : "Select"}</button><button class="btn btn-ghost btn-sm" data-company-action="edit" data-id="${c.id}">Edit</button><button class="btn btn-danger btn-sm" data-company-action="delete" data-id="${c.id}">Delete</button></div></div>`).join(""); }
  function openCompanyScreen() { document.getElementById("companyForm").classList.add("hidden"); renderCompanyList(); document.getElementById("companyScreen").classList.remove("hidden"); }
  function closeCompanyScreen() { document.getElementById("companyScreen").classList.add("hidden"); updateCompanyLabels(); }
  function openCompanyForm(id) { const form=document.getElementById("companyForm"), c=id ? companyRegistry().companies.find(x=>x.id===id) : null; form.reset(); populateStateSelect(document.getElementById("companyStateSelect"), c ? c.state : "Delhi"); form.elements.id.value=c ? c.id : ""; ["companyName","companyGSTIN","state","stateCode","companyAddress","companyMobile","companyEmail","financialYear"].forEach(k=>{if(c && form.elements[k]) form.elements[k].value=c[k]||"";}); form.classList.remove("hidden"); }
  function saveCompany(e) { e.preventDefault(); const form=e.target, registry=companyRegistry(), data=Object.fromEntries(new FormData(form).entries()); let c=registry.companies.find(x=>x.id===data.id); if(c) { Object.assign(c,data); Object.assign(c.data.settings,{...c.data.settings,...data}); } else { c={...data,id:"company_"+Date.now().toString(36),data:defaultData()}; Object.assign(c.data.settings,data); registry.companies.push(c); } registry.activeCompanyId=c.id; localStorage.setItem(COMPANIES_KEY,JSON.stringify(registry)); localStorage.setItem(ACTIVE_COMPANY_KEY,c.id); activeCompanyId=c.id; DB=loadData(); refreshPartySelects(); closeCompanyScreen(); navigate("dashboard"); }
  async function companyAction(e) { const b=e.target.closest("button[data-company-action]"); if(!b)return; const id=b.dataset.id, action=b.dataset.companyAction; if(action==="edit") return openCompanyForm(id); if(action==="delete") { const r=companyRegistry(); if(r.companies.length===1) return toast("At least one company is required", "error"); if(!await confirmDialog("Delete this company and its isolated data?", "Delete Company"))return; r.companies=r.companies.filter(c=>c.id!==id); if(r.activeCompanyId===id)r.activeCompanyId=r.companies[0].id; localStorage.setItem(COMPANIES_KEY,JSON.stringify(r)); localStorage.setItem(ACTIVE_COMPANY_KEY,r.activeCompanyId); activeCompanyId=r.activeCompanyId; DB=loadData(); refreshPartySelects(); return renderCompanyList(); } localStorage.setItem(ACTIVE_COMPANY_KEY,id); activeCompanyId=id; DB=loadData(); refreshPartySelects(); closeCompanyScreen(); navigate("dashboard"); }
  async function logout() { if(!await confirmDialog("Log out of BizBooks? Your company data will remain saved.", "Logout"))return; localStorage.removeItem(SESSION_KEY); document.getElementById("companyScreen").classList.add("hidden"); document.getElementById("loginForm").reset(); document.getElementById("loginScreen").classList.remove("hidden"); }
  function init() {
    initTheme();
    initLogin();
    seedIfEmpty();
    wireEvents();
    refreshPartySelects();
    document.getElementById("brandCompanyName").textContent = DB.settings.companyName || "BizBooks";

    // Default date filters not pre-set; ledger starts blank
    const route = location.hash.replace("#", "") || "dashboard";
    if (!location.hash) location.hash = "dashboard";
    navigate(route);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
