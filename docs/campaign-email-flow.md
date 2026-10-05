# Campaign-email flow

The reusable campaign template and helper are:

- [`../apps-script/campaign_email.html`](../apps-script/campaign_email.html)
- [`../apps-script/campaign_email.gs`](../apps-script/campaign_email.gs)
- [`../apps-script/mailwiz_utilities.gs`](../apps-script/mailwiz_utilities.gs) (shared URL, email, and name validation)

## Input contract

`renderCampaignEmail(data)` accepts the fields below. The explicit sender also
accepts `email` as an alias for `recipientEmail`:

| Field | Purpose | Requirement |
| --- | --- | --- |
| `subject` | Email subject/title | Required; replaces every `CLIENTE` token when `recipientName` is supplied. |
| `body` | Main message | Required; plain text, with line breaks preserved. |
| `conditions` | Offer terms | Optional plain text. |
| `footer` | Campaign close/social prompt | Optional plain text. |
| `recipientName` (`clientName` alias) | Replaces the `CLIENTE` placeholder | Required when the subject or body contains `CLIENTE`. |
| `businessName` (`cafName`) / `businessId` | Visible brand/profile lookup | A profile supplies business name, logo, colors, sender alias, and social links. `businessId` is required to enforce campaign opt-outs when sending. |
| `senderAlias` | Gmail sender alias | Optional; validated against aliases available to the executing account. |
| `unsubscribeUrl` | Campaign opt-out link | Required HTTPS URL. |
| `instagramUrl`, `websiteUrl` | Optional social links | Optional HTTPS URLs. |
| `trackingPixelUrl` | Optional 1×1 image URL | Optional HTTPS URL; this helper inserts it but does not generate its encrypted payload. |
| `logoUrl`, `primaryColor`, `backgroundColor`, `accentColor` | Brand rendering | Optional direct values; otherwise loaded from the selected business profile. |

Brand name, logo, colors, sender alias, and social URLs can come from the saved
business profile. See [`business-onboarding.md`](business-onboarding.md).

Template values use contextual Apps Script escaping and are rendered as text;
campaign fields are not treated as trusted HTML. `sendCampaignEmail(data)` sends
immediately to one recipient per call. It does not choose recipients, schedule
a date, deduplicate retries, or mark a campaign complete.

## Proposed weekly dispatch

1. Send the weekly brief form.
2. Validate that the requested send date is future-dated and belongs to the
   intended ISO week.
3. Route an accepted response to the appropriate campaign/account record and
   mark it accepted once.
4. At the approved send time, create a personalized message per recipient and
   use `sendCampaignEmail(data)`.
5. Persist each recipient's send result so a retry cannot silently duplicate
   messages.

The weekly controller should validate the response columns and approved
recipient range, own trigger configuration, and persist each recipient's send
status to make retries idempotent.

## Tracking

The template has an optional pixel slot. The caller supplies a complete HTTPS
tracking URL and owns its event/payload configuration. Pixel loads are not a
reliable measure of a person's attention because email clients may proxy or
block images.

Campaign unsubscribes are stored in a separate `CampaignSuppressions` sheet.
`onMailWizFormSubmit(e)` maps an unsubscribe response tab to its business
profile and records the address without deleting the form response or customer
record. `sendCampaignEmail(data)` skips recipients present in that list.
Import verified historical opt-outs with
`importCampaignSuppressions(businessId, emails)` before enabling campaign sends.
