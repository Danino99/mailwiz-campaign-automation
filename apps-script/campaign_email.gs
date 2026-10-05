function renderCampaignEmail(data) {
  var model = normalizeCampaignEmailData_(data);
  var template = HtmlService.createTemplateFromFile("campaign_email");

  Object.keys(model).forEach(function(key) {
    template[key] = model[key];
  });

  return {
    subject: model.subject,
    htmlBody: template.evaluate().getContent(),
    textBody: campaignPlainText_(model),
    senderName: model.senderName,
    senderAlias: model.senderAlias
  };
}

function sendCampaignEmail(data) {
  var recipientEmail = normalizeRecipientEmail_(data && (data.recipientEmail || data.email));
  var message = renderCampaignEmail(data);
  if (!message.businessId) {
    throw new Error("Business ID is required to enforce campaign opt-outs.");
  }
  if (isCampaignSuppressed_(message.businessId, recipientEmail)) {
    return {sent: false, status: "SUPPRESSED"};
  }
  var options = {
    htmlBody: message.htmlBody,
    name: message.senderName
  };
  applySenderAlias_(options, message.senderAlias);
  GmailApp.sendEmail(recipientEmail, message.subject, message.textBody, options);
  return {sent: true, status: "SENT"};
}

function normalizeCampaignEmailData_(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Campaign email data is required.");
  }

  var profile = resolveBusinessProfile_(data);
  var recipientName = String(configuredValue_(data, profile, "recipientName", ["clientName", "name"]) || "").trim();
  var businessName = String(configuredValue_(data, profile, "businessName", ["cafName", "senderName"]) || "").trim();
  var subject = String(data.subject || "").trim();
  var body = String(data.body || "");

  if (!subject || !body.trim()) {
    throw new Error("Campaign subject and body are required.");
  }
  if (!recipientName && (subject.indexOf("CLIENTE") !== -1 || body.indexOf("CLIENTE") !== -1)) {
    throw new Error("recipientName is required when campaign content contains CLIENTE.");
  }

  subject = personalizeCampaignText_(subject, recipientName);
  body = personalizeCampaignText_(body, recipientName);

  var senderName = String(configuredValue_(data, profile, "senderName", ["businessName", "cafName"]) || "").trim() || businessName || "MailWiz";

  return {
    subject: subject,
    businessId: String(configuredValue_(data, profile, "businessId") || "").trim(),
    recipientName: recipientName,
    businessName: businessName || senderName,
    senderName: senderName,
    senderAlias: String(configuredValue_(data, profile, "senderAlias") || "").trim(),
    logoUrl: normalizeHttpsUrl_(configuredValue_(data, profile, "logoUrl"), "logoUrl", false),
    primaryColor: normalizeHexColor_(configuredValue_(data, profile, "primaryColor"), "primaryColor", "#80651B"),
    backgroundColor: normalizeHexColor_(configuredValue_(data, profile, "backgroundColor"), "backgroundColor", "#D9D6C5"),
    accentColor: normalizeHexColor_(configuredValue_(data, profile, "accentColor"), "accentColor", "#ECE9DF"),
    brandInitial: initialFromNamePart_(businessName || senderName),
    body: body,
    conditions: String(data.conditions || "").trim(),
    footer: String(data.footer || "").trim(),
    instagramUrl: normalizeHttpsUrl_(configuredValue_(data, profile, "instagramUrl"), "instagramUrl", false),
    websiteUrl: normalizeHttpsUrl_(configuredValue_(data, profile, "websiteUrl"), "websiteUrl", false),
    unsubscribeUrl: normalizeHttpsUrl_(configuredValue_(data, profile, "unsubscribeUrl"), "unsubscribeUrl", true),
    trackingPixelUrl: normalizeHttpsUrl_(data.trackingPixelUrl, "trackingPixelUrl", false)
  };
}

function personalizeCampaignText_(text, clientName) {
  return String(text).replace(/CLIENTE/g, clientName);
}

function campaignPlainText_(model) {
  var lines = [model.subject, "", model.body];
  if (model.conditions) {
    lines.push("", model.conditions);
  }
  if (model.footer) {
    lines.push("", model.footer);
  }
  lines.push("", "Cancelar suscripción: " + model.unsubscribeUrl);
  return lines.join("\n");
}
