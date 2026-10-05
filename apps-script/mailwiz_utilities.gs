function initialFromNamePart_(part) {
  var normalized = String(part || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "");

  if (!normalized) {
    throw new Error("Name parts must contain a letter or number.");
  }

  return normalized.charAt(0).toUpperCase();
}

function normalizeHttpsUrl_(value, fieldName, required) {
  var url = String(value || "").trim();
  if (!url && !required) {
    return "";
  }
  if (!/^https:\/\/[^\s<>"']+$/i.test(url)) {
    throw new Error(fieldName + " must be a valid HTTPS URL.");
  }
  return url;
}

function normalizeRecipientEmail_(value) {
  var email = String(value || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid recipient email is required.");
  }
  return email;
}

function normalizeHexColor_(value, fieldName, fallback) {
  var color = String(value || fallback).trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(color)) {
    throw new Error(fieldName + " must use six-digit hexadecimal format.");
  }
  return color;
}

function resolveBusinessProfile_(data) {
  if (data.business && typeof data.business === "object") {
    return data.business;
  }
  if (data.businessId) {
    return getBusinessProfile(data.businessId);
  }
  return data;
}

function configuredValue_(data, profile, fieldName, aliases) {
  var fields = [fieldName].concat(aliases || []);
  var sources = [data, profile];

  for (var i = 0; i < sources.length; i++) {
    for (var j = 0; j < fields.length; j++) {
      var value = sources[i][fields[j]];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return value;
      }
    }
  }

  return "";
}

function applySenderAlias_(options, senderAlias) {
  var alias = String(senderAlias || "").trim();
  if (!alias) {
    return;
  }

  assertSenderAliasAvailable_(alias);
  var primaryEmail = String(Session.getEffectiveUser().getEmail() || "").trim();
  if (alias.toLowerCase() !== primaryEmail.toLowerCase()) {
    options.from = alias;
  }
}

function assertSenderAliasAvailable_(senderAlias) {
  var alias = normalizeRecipientEmail_(senderAlias);
  var availableAliases = GmailApp.getAliases();
  var primaryEmail = String(Session.getEffectiveUser().getEmail() || "").trim();
  var isPrimaryAddress = alias.toLowerCase() === primaryEmail.toLowerCase();
  var isAlias = availableAliases.some(function(availableAlias) {
    return String(availableAlias).toLowerCase() === alias.toLowerCase();
  });
  if (!isPrimaryAddress && !isAlias) {
    throw new Error("The requested sender alias is not available in this account.");
  }
}
