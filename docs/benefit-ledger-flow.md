# QR registration and benefit ledger

## Form mapping

Create the QR-registration and campaign-unsubscribe Forms separately, then link
their response tabs to the spreadsheet containing `BusinessProfiles`. Save each
response tab's sheet ID in the corresponding business profile and run
`installMailWizFormSubmitTrigger()` once for that spreadsheet.

The registration response tab uses timestamp in column A,
email in B, and full name in C. It calculates the customer ordinal as
`response row - 1` and creates a deterministic response fingerprint from the
response tab, row, timestamp, email, and name. Keep response tabs append-only so
the row-based ordinal stays meaningful. The profile sheet ID maps the event to
a business without asking the customer to enter a business code.

## Benefit decisions

`BenefitLedger` stores one row per registration response with the business ID,
response fingerprint, email, name, ordinal, code, decision, send state, and
timestamps. An eligible code is generated and stored before sending. Later
submissions for the same business/email are ineligible once an eligible benefit
has been issued or imported. The cashier can mark a sent code as redeemed with
the **MailWiz → Validar código en caja** dialog or
`redeemBenefitCode(businessId, code)`.

If the recipient opted out of campaigns, the registration/benefit message is
still sent but its promotional footer and social links are omitted.

Form-response retries reuse the same response row and code. A successful send
is not repeated. `PENDING_SEND`, `SENDING`, `SEND_FAILED`, `SENT`, `REDEEMED`, and
`IMPORTED` record the send/redemption state. If a send is uncertain or fails,
the ledger requires checking Gmail Sent; the explicit
`retryRegistrationEmailAfterManualCheck(...)` helper will retry only after the
caller confirms no message was sent. This avoids silently issuing another
ordinal code or automatically duplicating an email.

The old customer/benefit list is not read or modified by this flow. If its rows
are verified to represent prior benefits, an operator can seed the new ledger
with `importPriorBenefitRecipients(businessId, emails)`. That import creates
ineligible history without inventing old codes or dates.

## Campaign opt-outs

Unsubscribe-form responses use their own mapped sheet ID. The form-submit
handler records the business/email in `CampaignSuppressions`; it does not clear
customer rows or delete the form response. `sendCampaignEmail(data)` checks the
suppression list before sending and returns `SUPPRESSED` without sending to an
opted-out address.
Verified historical opt-outs can be added with
`importCampaignSuppressions(businessId, emails)` before campaign sending begins.

## Boundaries

Drive folders, Forms, and annual calendars are still provisioned separately.
The response tabs must be in the bound spreadsheet that holds the business
profiles and ledgers. The Gmail sender address/alias must be authorized before
profile setup, and the spreadsheet form-submit trigger must be installed.
