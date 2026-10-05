var BUSINESS_PROFILE_SHEET_NAME = "BusinessProfiles";
var BUSINESS_PROFILE_HEADERS = [
  "Business ID",
  "Business Name",
  "Contact Email",
  "Sender Alias",
  "QR Response Sheet ID",
  "Unsubscribe Response Sheet ID",
  "Logo URL",
  "Primary Color",
  "Background Color",
  "Accent Color",
  "Instagram URL",
  "Website URL",
  "Review URL",
  "Unsubscribe URL",
  "Created At",
  "Updated At"
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("MailWiz")
    .addItem("Dar de alta un negocio", "showBusinessOnboarding")
    .addItem("Validar código en caja", "showCashierRedemption")
    .addItem("Instalar trigger de formularios", "installMailWizFormSubmitTrigger")
    .addToUi();
}

function showBusinessOnboarding() {
  var html = HtmlService.createTemplateFromFile("business_onboarding")
    .evaluate()
    .setWidth(620)
    .setHeight(900);
  SpreadsheetApp.getUi().showModalDialog(html, "Alta de negocio");
}

function saveBusinessProfile(data) {
  var profile = normalizeBusinessProfile_(data);
  assertSenderAliasAvailable_(profile.senderAlias);
  assertResponseSheetExists_(profile.registrationSheetId, "QR response sheet");
  assertResponseSheetExists_(profile.unsubscribeSheetId, "unsubscribe response sheet");
  var sheet = businessProfileSheet_();
  var now = new Date();
  var businessId = String(data.businessId || "").trim();
  var rowValues;

  if (businessId) {
    var existingRow = businessProfileRow_(sheet, businessId);
    if (!existingRow) {
      throw new Error("The business profile to update was not found.");
    }
    var createdAt = sheet.getRange(existingRow, 15).getValue();
    rowValues = businessProfileRowValues_(businessId, profile, createdAt, now);
    sheet.getRange(existingRow, 1, 1, BUSINESS_PROFILE_HEADERS.length).setValues([rowValues]);
  } else {
    businessId = Utilities.getUuid();
    rowValues = businessProfileRowValues_(businessId, profile, now, now);
    sheet.appendRow(rowValues);
  }

  return {
    businessId: businessId,
    businessName: profile.businessName,
    senderAlias: profile.senderAlias
  };
}

function getBusinessProfile(businessId) {
  var sheet = businessProfileSheet_();
  var row = businessProfileRow_(sheet, String(businessId || "").trim());
  if (!row) {
    throw new Error("The requested business profile was not found.");
  }

  var values = sheet.getRange(row, 1, 1, BUSINESS_PROFILE_HEADERS.length).getValues()[0];
  return {
    businessId: values[0],
    businessName: values[1],
    contactEmail: values[2],
    senderAlias: values[3],
    registrationSheetId: values[4],
    unsubscribeSheetId: values[5],
    logoUrl: values[6],
    primaryColor: values[7],
    backgroundColor: values[8],
    accentColor: values[9],
    instagramUrl: values[10],
    websiteUrl: values[11],
    reviewUrl: values[12],
    unsubscribeUrl: values[13]
  };
}

function getBusinessProfileByResponseSheetId(sheetId, formType) {
  var normalizedSheetId = String(sheetId || "").trim();
  if (!/^\d+$/.test(normalizedSheetId)) {
    throw new Error("A valid form response sheet ID is required.");
  }
  var sheetIdColumn = formType === "unsubscribe" ? 6 : 5;

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet && spreadsheet.getSheetByName(BUSINESS_PROFILE_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    return null;
  }
  sheet = businessProfileSheet_();

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheetIdColumn).getDisplayValues();
  var matchingBusinessId = "";
  rows.forEach(function(row) {
    if (row[sheetIdColumn - 1] === normalizedSheetId) {
      if (matchingBusinessId) {
        throw new Error("More than one business uses this form response sheet.");
      }
      matchingBusinessId = row[0];
    }
  });

  if (!matchingBusinessId) {
    return null;
  }
  return getBusinessProfile(matchingBusinessId);
}

function listBusinessProfiles() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet && spreadsheet.getSheetByName(BUSINESS_PROFILE_SHEET_NAME);
  if (!sheet) {
    return [];
  }
  sheet = businessProfileSheet_();
  if (sheet.getLastRow() < 2) {
    return [];
  }

  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues()
    .filter(function(row) {
      return row[0] && row[1];
    })
    .map(function(row) {
      return {businessId: row[0], businessName: row[1]};
    });
}

function normalizeBusinessProfile_(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Business profile data is required.");
  }

  var businessName = String(data.businessName || "").trim();
  if (!businessName || businessName.length > 120) {
    throw new Error("Business name is required and must be 120 characters or fewer.");
  }
  if (/^[=+\-@]/.test(businessName)) {
    throw new Error("Business name cannot start with a spreadsheet formula character.");
  }

  var senderAlias = String(data.senderAlias || "").trim();
  senderAlias = normalizeRecipientEmail_(senderAlias);
  var registrationSheetId = String(data.registrationSheetId || "").trim();
  if (registrationSheetId && !/^\d+$/.test(registrationSheetId)) {
    throw new Error("QR response sheet ID must contain digits only.");
  }
  var unsubscribeSheetId = String(data.unsubscribeSheetId || "").trim();
  if (unsubscribeSheetId && !/^\d+$/.test(unsubscribeSheetId)) {
    throw new Error("Unsubscribe response sheet ID must contain digits only.");
  }

  return {
    businessName: businessName,
    contactEmail: normalizeRecipientEmail_(data.contactEmail),
    senderAlias: senderAlias,
    registrationSheetId: registrationSheetId,
    unsubscribeSheetId: unsubscribeSheetId,
    logoUrl: normalizeHttpsUrl_(data.logoUrl, "logoUrl", false),
    primaryColor: normalizeHexColor_(data.primaryColor, "primaryColor", "#80651B"),
    backgroundColor: normalizeHexColor_(data.backgroundColor, "backgroundColor", "#D9D6C5"),
    accentColor: normalizeHexColor_(data.accentColor, "accentColor", "#ECE9DF"),
    instagramUrl: normalizeHttpsUrl_(data.instagramUrl, "instagramUrl", false),
    websiteUrl: normalizeHttpsUrl_(data.websiteUrl, "websiteUrl", false),
    reviewUrl: normalizeHttpsUrl_(data.reviewUrl, "reviewUrl", true),
    unsubscribeUrl: normalizeHttpsUrl_(data.unsubscribeUrl, "unsubscribeUrl", true)
  };
}

function assertResponseSheetExists_(sheetId, label) {
  if (!sheetId) {
    return;
  }
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var exists = spreadsheet && spreadsheet.getSheets().some(function(sheet) {
    return String(sheet.getSheetId()) === String(sheetId);
  });
  if (!exists) {
    throw new Error(label + " must be a tab in this bound spreadsheet.");
  }
}

function businessProfileSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error("Bind the script to the spreadsheet that stores business profiles.");
  }

  var sheet = spreadsheet.getSheetByName(BUSINESS_PROFILE_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(BUSINESS_PROFILE_SHEET_NAME);
    sheet.getRange(1, 1, 1, BUSINESS_PROFILE_HEADERS.length).setValues([BUSINESS_PROFILE_HEADERS]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, BUSINESS_PROFILE_HEADERS.length).setValues([BUSINESS_PROFILE_HEADERS]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  var headers = sheet.getRange(1, 1, 1, BUSINESS_PROFILE_HEADERS.length).getDisplayValues()[0];
  if (BUSINESS_PROFILE_HEADERS.some(function(header, index) {
    return headers[index] !== header;
  })) {
    throw new Error("The BusinessProfiles sheet has unexpected columns; no data was changed.");
  }

  return sheet;
}

function businessProfileRow_(sheet, businessId) {
  if (!businessId || sheet.getLastRow() < 2) {
    return 0;
  }

  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === businessId) {
      return i + 2;
    }
  }
  return 0;
}

function businessProfileRowValues_(businessId, profile, createdAt, updatedAt) {
  return [
    businessId,
    profile.businessName,
    profile.contactEmail,
    profile.senderAlias,
    profile.registrationSheetId,
    profile.unsubscribeSheetId,
    profile.logoUrl,
    profile.primaryColor,
    profile.backgroundColor,
    profile.accentColor,
    profile.instagramUrl,
    profile.websiteUrl,
    profile.reviewUrl,
    profile.unsubscribeUrl,
    createdAt,
    updatedAt
  ];
}
