# MailWiz workflow

MailWiz is a Google Workspace project for small-business campaign
email and registration follow-up.

## Business setup

1. Create or select a business profile through **MailWiz → Dar de alta un negocio**
   in the bound spreadsheet.
2. Configure the business name, Gmail sender alias, optional logo, palette, and
   campaign links.
3. Link the QR and unsubscribe Forms to the same spreadsheet and map their
   response-tab IDs on the business profile.
4. Install the spreadsheet form-submit trigger with
   `installMailWizFormSubmitTrigger()`.

Drive folders, campaign calendars, Forms, and Gmail alias permissions remain
manual provisioning steps.

## QR registration and cashier code

1. A form response appends a timestamp, email, and full name to the mapped
   response tab (columns A-C).
2. `onMailWizFormSubmit(e)` looks up the business by response-tab ID and checks
   `BenefitLedger` for an earlier eligible benefit for that email.
3. A first-time recipient receives a stored code built from the first/last
   initials and the response ordinal (`row - 1`). The HTML confirmation includes
   the business logo/colors and review link.
4. A prior recipient receives the no-benefit email without another code.
5. At the register, `redeemBenefitCode(businessId, code)` marks a sent code as
   redeemed.

The response fingerprint prevents a repeated form event from issuing another
code. A failed or uncertain send is held for manual review; a retry requires
checking Gmail Sent first. Prior recipients from an older list can be imported
after the list is verified.

## Weekly campaigns

1. Collect the campaign date, subject, body, conditions, and footer using the
   weekly brief form.
2. Validate the target ISO week and date, then route an accepted campaign to its
   business record.
3. For each recipient, replace `CLIENTE` with that recipient's name, apply the
   business profile, render the campaign email, and send it with the configured
   alias.
4. Store per-recipient send status in the caller/controller so retries do not
   duplicate messages.

`sendCampaignEmail(data)` renders and sends one recipient per call. It checks the
`CampaignSuppressions` list and skips opted-out addresses. An optional tracking
pixel can be included when a complete HTTPS URL is provided; the URL-generation
and event-receiver configuration must be supplied separately.

## Reporting and opt-outs

- The weekly report flow emails the account-level total for the week.
- An unsubscribe-form response adds the business/email pair to
  `CampaignSuppressions`; the form response and customer row are retained.
- Benefit history and campaign opt-outs use separate sheets and decisions.

The HTML templates, profiles, ledger, and suppression checks are implemented in
`apps-script/`. The weekly campaign controller, Drive/calendar provisioning,
and live Gmail setup remain separate tasks.
