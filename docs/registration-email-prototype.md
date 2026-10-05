# Registration-email flow

[`../prototypes/registration-email-preview.html`](../prototypes/registration-email-preview.html)
provides a responsive preview of the two registration-email states. It uses
fictional names, brand mark, benefit code, and links.

The Apps Script implementation is in [`../apps-script/registration_email.gs`](../apps-script/registration_email.gs)
and [`../apps-script/registration_email.html`](../apps-script/registration_email.html),
with shared validation in [`../apps-script/mailwiz_utilities.gs`](../apps-script/mailwiz_utilities.gs).
Business name, logo, colors, sender alias, and social links can be loaded from
the profile registry described in [`business-onboarding.md`](business-onboarding.md).

## Input contract

The registration sender accepts the form values and a business profile:

| Field | Use | Notes |
| --- | --- | --- |
| `fullName` / `name` | Greeting and code initials | The code uses the first and last whitespace-separated words. |
| `ordinal` / `clientNumber` | Code sequence | On form submit this is `response row - 1`. |
| `email` / `recipientEmail` | Recipient | Normalized before sending. |
| `isEligible` | Selects confirmation or no-benefit email | Determined from `BenefitLedger`. |
| `businessId` / `business` | Brand and sender profile | Loads the name, alias, logo, colors, and links. |
| `reviewUrl` / `mapsLink` | Review link | Required for an eligible registration. |
| `instagramUrl`, `websiteUrl` | Optional footer links | Omitted if the recipient opted out of campaigns. |

The subject lines are `Confirmación de Registro` and
`No elegible para nuevo beneficio`. The registration flow has no unsubscribe
link; campaign opt-out is handled separately.

Campaign emails use a separate renderer with `subject`, `body`, `conditions`,
and `footer` fields.

## QR form-submit flow

1. Map the response tab ID to a business profile; read email from column B and
   full name from column C.
2. Check the separate `BenefitLedger` for a previous eligible issuance.
3. For a new eligible registration, calculate the code from the row ordinal,
   store it with the response ID, and send the HTML email.
4. For a prior recipient, record an ineligible result and send the notice with
   no code.
5. At redemption, `redeemBenefitCode(businessId, code)` marks the saved code as
   used instead of deriving it again from a row that may have moved.

The `.gs` files provide the code builder, renderer, and sender.
`sendRegistrationEmail` sends immediately when called. `onMailWizFormSubmit(e)`
routes mapped QR and unsubscribe response tabs;
`installMailWizFormSubmitTrigger()` creates one spreadsheet form-submit
trigger. The handler stores a pending ledger row before sending. Replayed events
reuse that response row/code; uncertain sends are held for manual review rather
than automatically sending a possible duplicate. The code helper uses the first
and last whitespace-separated words for initials, per the current flow decision.

QR response tabs use column A for timestamp, B for email, and C for full name.
The first submission creates `BenefitLedger`; the code is saved before email is
sent. `PENDING_SEND`, `SENDING`, `SENT`, `SEND_FAILED`, `REDEEMED`, and `IMPORTED`
statuses record the state. Uncertain sends require checking Gmail Sent and an
explicit `retryRegistrationEmailAfterManualCheck(...)` call.

Import a verified list of prior benefit recipients with
`importPriorBenefitRecipients(...)` before enabling eligibility checks. No
historical list is imported automatically.

The ordinal currently assumes row 1 is a header and passes `row - 1`. Store the
generated code at issuance if it must remain stable after sorting, deletion, or
row insertion.
