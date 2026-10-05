var BENEFIT_LEDGER_SHEET_NAME = "BenefitLedger";
var BENEFIT_LEDGER_HEADERS = [
  "Business ID",
  "Response ID",
  "Recipient Email",
  "Full Name",
  "Ordinal",
  "Benefit Code",
  "Decision",
  "Status",
  "Source",
  "Recorded At",
  "Issued At",
  "Sent At",
  "Redeemed At",
  "Last Error"
];

var CAMPAIGN_SUPPRESSION_SHEET_NAME = "CampaignSuppressions";
var CAMPAIGN_SUPPRESSION_HEADERS = [
  "Business ID",
  "Email",
  "Requested At",
  "Source",
  "Active"
];

function installMailWizFormSubmitTrigger() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error("Bind the script to the spreadsheet receiving the Forms responses.");
  }

  var exists = ScriptApp.getProjectTriggers().some(function(trigger) {
    return trigger.getHandlerFunction() === "onMailWizFormSubmit";
  });
  if (exists) {
    return {status: "ALREADY_INSTALLED"};
  }

  ScriptApp.newTrigger("onMailWizFormSubmit")
    .forSpreadsheet(spreadsheet)
    .onFormSubmit()
    .create();
  return {status: "INSTALLED"};
}

function showCashierRedemption() {
  var html = HtmlService.createTemplateFromFile("cashier_redemption")
    .evaluate()
    .setWidth(440)
    .setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, "Validar código de beneficio");
}

function onMailWizFormSubmit(e) {
  if (!e || !e.range) {
    throw new Error("This handler requires a spreadsheet form-submit event.");
  }

  var range = e.range;
  var responseSheet = range.getSheet();
  var rowNumber = range.getRow();
  if (rowNumber < 2) {
    return {status: "IGNORED_HEADER"};
  }

  var sheetId = responseSheet.getSheetId();
  var businessProfile = getBusinessProfileByResponseSheetId(sheetId, "registration");
  var unsubscribeProfile = getBusinessProfileByResponseSheetId(sheetId, "unsubscribe");
  if (businessProfile && unsubscribeProfile) {
    throw new Error("A response sheet cannot be mapped to both QR and unsubscribe forms.");
  }
  if (!businessProfile && !unsubscribeProfile) {
    return {status: "IGNORED_UNMAPPED_FORM"};
  }

  var values = Array.isArray(e.values)
    ? e.values
    : responseSheet.getRange(rowNumber, 1, 1, Math.max(3, responseSheet.getLastColumn())).getDisplayValues()[0];
  if (values.length < 2) {
    throw new Error("The form response is missing its email column.");
  }

  var email = normalizeRecipientEmail_(values[1]).toLowerCase();
  if (unsubscribeProfile) {
    return recordCampaignSuppression({
      businessId: unsubscribeProfile.businessId,
      email: email,
      source: "unsubscribe-form"
    });
  }

  if (values.length < 3) {
    throw new Error("The QR response must have timestamp, email, and full name in columns A-C.");
  }

  var fullName = String(values[2] || "").trim();
  var ordinal = rowNumber - 1;
  var responseId = formResponseId_(sheetId, rowNumber, values[0], email, fullName);
  return processQrRegistrationSubmission({
    businessId: businessProfile.businessId,
    responseId: responseId,
    recipientEmail: email,
    fullName: fullName,
    ordinal: ordinal
  });
}

function processQrRegistrationSubmission(data) {
  var businessId = String(data && data.businessId || "").trim();
  var responseId = String(data && data.responseId || "").trim();
  var recipientEmail = normalizeRecipientEmail_(data && data.recipientEmail).toLowerCase();
  var fullName = String(data && data.fullName || "").trim();
  var ordinal = Number(data && data.ordinal);

  if (!businessId || !responseId) {
    throw new Error("Business ID and response ID are required.");
  }
  if (!fullName) {
    throw new Error("The customer's full name is required.");
  }
  if (!Number.isInteger(ordinal) || ordinal < 1) {
    throw new Error("The customer ordinal must be a positive integer.");
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    getBusinessProfile(businessId);
    var sheet = benefitLedgerSheet_();
    var ledgerRow = benefitLedgerRowByResponseId_(sheet, businessId, responseId);
    var decision;
    var status;
    var benefitCode;

    if (ledgerRow) {
      var priorSubmission = sheet.getRange(ledgerRow, 1, 1, BENEFIT_LEDGER_HEADERS.length).getValues()[0];
      status = priorSubmission[7];
      decision = priorSubmission[6];
      benefitCode = priorSubmission[5];
      if (status === "SENT" || status === "REDEEMED" || status === "IMPORTED") {
        return {status: "DUPLICATE_IGNORED", decision: decision};
      }
      if (status === "SENDING" || status === "SEND_FAILED") {
        return {status: "MANUAL_REVIEW_REQUIRED", decision: decision};
      }
      recipientEmail = priorSubmission[2];
      fullName = priorSubmission[3];
      ordinal = Number(priorSubmission[4]);
    } else {
      decision = hasPreviousBenefit_(sheet, businessId, recipientEmail)
        ? "INELIGIBLE"
        : "ELIGIBLE";
      benefitCode = decision === "ELIGIBLE" ? buildBenefitCode(fullName, ordinal) : "";
      status = "PENDING_SEND";
      var now = new Date();
      sheet.appendRow([
        businessId,
        responseId,
        recipientEmail,
        fullName,
        ordinal,
        benefitCode,
        decision,
        status,
        "QR_FORM",
        now,
        decision === "ELIGIBLE" ? now : "",
        "",
        "",
        ""
      ]);
      ledgerRow = sheet.getLastRow();
    }

    try {
      sheet.getRange(ledgerRow, 8).setValue("SENDING");
      sendRegistrationEmail({
        businessId: businessId,
        recipientEmail: recipientEmail,
        fullName: fullName,
        customerName: fullName.split(/\s+/)[0],
        ordinal: ordinal,
        benefitCode: benefitCode,
        isEligible: decision === "ELIGIBLE",
        showMarketingLinks: !isCampaignSuppressed_(businessId, recipientEmail)
      });
      sheet.getRange(ledgerRow, 8).setValue("SENT");
      sheet.getRange(ledgerRow, 12).setValue(new Date());
      sheet.getRange(ledgerRow, 14).clearContent();
      return {status: "SENT", decision: decision, benefitCode: benefitCode};
    } catch (error) {
      sheet.getRange(ledgerRow, 8).setValue("SEND_FAILED");
      sheet.getRange(ledgerRow, 14).setValue(String(error && error.message || "Send failed").slice(0, 300));
      throw new Error("Registration email failed. Retry this response after fixing the send configuration.");
    }
  } finally {
    lock.releaseLock();
  }
}

function retryRegistrationEmailAfterManualCheck(businessId, responseId, confirmedNotSent) {
  if (confirmedNotSent !== true) {
    throw new Error("Confirm the message is absent from Sent before retrying.");
  }

  var normalizedBusinessId = String(businessId || "").trim();
  var normalizedResponseId = String(responseId || "").trim();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var retryData;
  try {
    var sheet = benefitLedgerSheet_();
    var row = benefitLedgerRowByResponseId_(sheet, normalizedBusinessId, normalizedResponseId);
    if (!row) {
      throw new Error("Benefit response was not found.");
    }
    var values = sheet.getRange(row, 1, 1, BENEFIT_LEDGER_HEADERS.length).getValues()[0];
    if (values[7] !== "SEND_FAILED" && values[7] !== "SENDING") {
      throw new Error("Only an uncertain or failed send can be retried manually.");
    }
    sheet.getRange(row, 8).setValue("PENDING_SEND");
    sheet.getRange(row, 14).clearContent();
    retryData = {
      businessId: normalizedBusinessId,
      responseId: normalizedResponseId,
      recipientEmail: values[2],
      fullName: values[3],
      ordinal: values[4]
    };
  } finally {
    lock.releaseLock();
  }

  return processQrRegistrationSubmission(retryData);
}

function redeemBenefitCode(businessId, benefitCode) {
  var normalizedBusinessId = String(businessId || "").trim();
  var normalizedCode = String(benefitCode || "").trim().toUpperCase();
  if (!normalizedBusinessId || !normalizedCode) {
    throw new Error("Business ID and benefit code are required.");
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    getBusinessProfile(normalizedBusinessId);
    var sheet = benefitLedgerSheet_();
    if (sheet.getLastRow() < 2) {
      throw new Error("No benefit codes have been issued.");
    }
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][0] === normalizedBusinessId && String(rows[i][5]).toUpperCase() === normalizedCode) {
        var sheetRow = i + 2;
        if (rows[i][7] === "REDEEMED") {
          return {status: "ALREADY_REDEEMED"};
        }
        if (rows[i][6] !== "ELIGIBLE" || rows[i][7] !== "SENT") {
          throw new Error("Only a sent, eligible benefit can be redeemed.");
        }
        sheet.getRange(sheetRow, 8).setValue("REDEEMED");
        sheet.getRange(sheetRow, 13).setValue(new Date());
        return {status: "REDEEMED"};
      }
    }
    throw new Error("Benefit code not found for this business.");
  } finally {
    lock.releaseLock();
  }
}

function importPriorBenefitRecipients(businessId, emails) {
  var normalizedBusinessId = String(businessId || "").trim();
  if (!normalizedBusinessId || !Array.isArray(emails)) {
    throw new Error("Business ID and a list of prior-benefit emails are required.");
  }

  getBusinessProfile(normalizedBusinessId);
  var normalizedEmails = emails.map(function(email) {
    return normalizeRecipientEmail_(email).toLowerCase();
  });
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = benefitLedgerSheet_();
    var existingBenefitEmails = previousBenefitEmails_(sheet, normalizedBusinessId);
    var imported = 0;
    var skipped = 0;
    var now = new Date();
    normalizedEmails.forEach(function(email) {
      if (existingBenefitEmails[email]) {
        skipped++;
        return;
      }
      var responseId = "LEGACY-" + identifierHash_(normalizedBusinessId + "|" + email);
      sheet.appendRow([
        normalizedBusinessId,
        responseId,
        email,
        "",
        "",
        "",
        "ELIGIBLE",
        "IMPORTED",
        "LEGACY_IMPORT",
        now,
        "",
        "",
        "",
        ""
      ]);
      existingBenefitEmails[email] = true;
      imported++;
    });
    return {imported: imported, skipped: skipped};
  } finally {
    lock.releaseLock();
  }
}

function recordCampaignSuppression(data) {
  var businessId = String(data && data.businessId || "").trim();
  var email = normalizeRecipientEmail_(data && data.email).toLowerCase();
  if (!businessId) {
    throw new Error("Business ID is required to record an opt-out.");
  }

  getBusinessProfile(businessId);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = campaignSuppressionSheet_(true);
    if (isCampaignSuppressed_(businessId, email)) {
      return {status: "ALREADY_SUPPRESSED"};
    }
    sheet.appendRow([businessId, email, new Date(), String(data.source || "form"), true]);
    return {status: "SUPPRESSED"};
  } finally {
    lock.releaseLock();
  }
}

function importCampaignSuppressions(businessId, emails) {
  var normalizedBusinessId = String(businessId || "").trim();
  if (!normalizedBusinessId || !Array.isArray(emails)) {
    throw new Error("Business ID and a list of opted-out emails are required.");
  }
  getBusinessProfile(normalizedBusinessId);

  var normalizedEmails = Array.from(new Set(emails.map(function(email) {
    return normalizeRecipientEmail_(email).toLowerCase();
  })));
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = campaignSuppressionSheet_(true);
    var existing = {};
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, CAMPAIGN_SUPPRESSION_HEADERS.length)
        .getValues()
        .forEach(function(row) {
          if (row[0] === normalizedBusinessId && (row[4] === true || String(row[4]).toUpperCase() === "TRUE")) {
            existing[String(row[1]).trim().toLowerCase()] = true;
          }
        });
    }

    var imported = 0;
    var now = new Date();
    normalizedEmails.forEach(function(email) {
      if (existing[email]) return;
      sheet.appendRow([normalizedBusinessId, email, now, "LEGACY_IMPORT", true]);
      existing[email] = true;
      imported++;
    });
    return {imported: imported, skipped: normalizedEmails.length - imported};
  } finally {
    lock.releaseLock();
  }
}

function isCampaignSuppressed_(businessId, email) {
  if (!businessId || !email) {
    return false;
  }
  var sheet = campaignSuppressionSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) {
    return false;
  }

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, CAMPAIGN_SUPPRESSION_HEADERS.length).getValues();
  var normalizedEmail = String(email).trim().toLowerCase();
  return rows.some(function(row) {
    return row[0] === businessId
      && String(row[1]).trim().toLowerCase() === normalizedEmail
      && (row[4] === true || String(row[4]).toUpperCase() === "TRUE");
  });
}

function formResponseId_(sheetId, rowNumber, timestamp, email, fullName) {
  return "FORM-" + identifierHash_([
    sheetId,
    rowNumber,
    String(timestamp || ""),
    String(email || "").trim().toLowerCase(),
    String(fullName || "").trim().toLowerCase()
  ].join("|"));
}

function identifierHash_(value) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(byte) {
    return ("0" + ((byte + 256) % 256).toString(16)).slice(-2);
  }).join("");
}

function hasPreviousBenefit_(sheet, businessId, email) {
  return Boolean(previousBenefitEmails_(sheet, businessId)[String(email).trim().toLowerCase()]);
}

function previousBenefitEmails_(sheet, businessId) {
  var eligibleStatuses = ["PENDING_SEND", "SENDING", "SEND_FAILED", "SENT", "REDEEMED", "IMPORTED"];
  var emails = Object.create(null);
  if (sheet.getLastRow() < 2) {
    return emails;
  }

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  rows.forEach(function(row) {
    var email = String(row[2] || "").trim().toLowerCase();
    if (row[0] === businessId
      && email
      && row[6] === "ELIGIBLE"
      && eligibleStatuses.indexOf(row[7]) !== -1) {
      emails[email] = true;
    }
  });
  return emails;
}

function benefitLedgerRowByResponseId_(sheet, businessId, responseId) {
  if (sheet.getLastRow() < 2) {
    return 0;
  }
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === businessId && rows[i][1] === responseId) {
      return i + 2;
    }
  }
  return 0;
}

function benefitLedgerSheet_() {
  return getOrCreateTableSheet_(BENEFIT_LEDGER_SHEET_NAME, BENEFIT_LEDGER_HEADERS);
}

function campaignSuppressionSheet_(createIfMissing) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet && spreadsheet.getSheetByName(CAMPAIGN_SUPPRESSION_SHEET_NAME);
  if (!sheet && !createIfMissing) {
    return null;
  }
  return getOrCreateTableSheet_(CAMPAIGN_SUPPRESSION_SHEET_NAME, CAMPAIGN_SUPPRESSION_HEADERS);
}

function getOrCreateTableSheet_(sheetName, headers) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error("Bind the script to the spreadsheet that stores MailWiz data.");
  }
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  var existingHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (headers.some(function(header, index) {
    return existingHeaders[index] !== header;
  })) {
    throw new Error(sheetName + " has unexpected columns; no data was changed.");
  }
  return sheet;
}
