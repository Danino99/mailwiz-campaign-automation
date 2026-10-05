function buildBenefitCode(fullName, ordinal) {
  var nameParts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  var customerOrdinal = Number(ordinal);

  if (nameParts.length < 2) {
    throw new Error("A first name and surname are required to create the benefit code.");
  }
  if (!Number.isInteger(customerOrdinal) || customerOrdinal < 1) {
    throw new Error("The customer ordinal must be a positive integer.");
  }

  var initials = [nameParts[0], nameParts[nameParts.length - 1]]
    .map(function(part) {
      return initialFromNamePart_(part);
    })
    .join("");

  return "#" + initials + customerOrdinal;
}

function renderRegistrationEmail(data) {
  var model = normalizeRegistrationEmailData_(data);
  var template = HtmlService.createTemplateFromFile("registration_email");

  Object.keys(model).forEach(function(key) {
    template[key] = model[key];
  });

  return {
    subject: model.isEligible
      ? "Confirmación de Registro"
      : "No elegible para nuevo beneficio",
    htmlBody: template.evaluate().getContent(),
    textBody: registrationPlainText_(model),
    senderName: model.senderName,
    senderAlias: model.senderAlias
  };
}

function sendRegistrationEmail(data) {
  var recipientEmail = normalizeRecipientEmail_(data && (data.recipientEmail || data.email));
  var message = renderRegistrationEmail(data);
  var options = {
    htmlBody: message.htmlBody,
    name: message.senderName
  };
  applySenderAlias_(options, message.senderAlias);
  GmailApp.sendEmail(recipientEmail, message.subject, message.textBody, options);
}

function normalizeRegistrationEmailData_(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Registration email data is required.");
  }

  var profile = resolveBusinessProfile_(data);
  var fullName = String(data.fullName || "").trim()
    || String(data.name || "").trim()
    || String(data.customerName || "").trim();
  var nameParts = fullName.split(/\s+/).filter(Boolean);
  if (!fullName) {
    throw new Error("The customer's name is required.");
  }

  var isEligible = data.isEligible === true;
  var customerOrdinal = data.ordinal || data.clientNumber;
  var benefitCode = "";
  var reviewUrl = "";

  if (isEligible) {
    benefitCode = String(data.benefitCode || buildBenefitCode(fullName, customerOrdinal)).trim();
    reviewUrl = normalizeHttpsUrl_(
      configuredValue_(data, profile, "reviewUrl", ["mapsLink"]),
      "reviewUrl",
      true
    );
  }

  var customerName = String(data.customerName || "").trim() || nameParts[0];
  var businessName = String(configuredValue_(data, profile, "businessName", ["clientName"]) || "").trim();
  var senderName = String(configuredValue_(data, profile, "senderName", ["clientName", "businessName"]) || "").trim() || "MailWiz";

  return {
    customerName: customerName,
    businessName: businessName || senderName,
    brandInitial: initialFromNamePart_(businessName || senderName),
    senderName: senderName,
    senderAlias: String(configuredValue_(data, profile, "senderAlias") || "").trim(),
    logoUrl: normalizeHttpsUrl_(configuredValue_(data, profile, "logoUrl"), "logoUrl", false),
    primaryColor: normalizeHexColor_(configuredValue_(data, profile, "primaryColor"), "primaryColor", "#80651B"),
    backgroundColor: normalizeHexColor_(configuredValue_(data, profile, "backgroundColor"), "backgroundColor", "#D9D6C5"),
    accentColor: normalizeHexColor_(configuredValue_(data, profile, "accentColor"), "accentColor", "#ECE9DF"),
    isEligible: isEligible,
    showMarketingLinks: data.showMarketingLinks !== false,
    benefitCode: benefitCode,
    reviewUrl: reviewUrl,
    instagramUrl: normalizeHttpsUrl_(configuredValue_(data, profile, "instagramUrl"), "instagramUrl", false),
    websiteUrl: normalizeHttpsUrl_(configuredValue_(data, profile, "websiteUrl"), "websiteUrl", false)
  };
}

function registrationPlainText_(model) {
  var lines = ["Hola, " + model.customerName + "!"];

  if (model.isEligible) {
    lines.push(
      "Agradecemos tu registro. A continuación te dejamos las instrucciones para que puedas cobrar tu beneficio:",
      "1. Deja tu opinión positiva: " + model.reviewUrl,
      "2. Muestra tu código único en caja: " + model.benefitCode
    );
  } else {
    lines.push(
      "Notamos que ya recibiste un beneficio de bienvenida anteriormente, por eso no puedes volver a recibirlo."
    );
  }

  if (model.showMarketingLinks) {
    lines.push("Síguenos para recibir promociones y beneficios todas las semanas.");
  }

  return lines.join("\n\n");
}
