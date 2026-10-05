# Business onboarding and branding

The Apps Script menu adds **MailWiz → Dar de alta un negocio** and
**MailWiz → Validar código en caja** to a bound spreadsheet. The onboarding
dialog collects a business profile and saves it to the
`BusinessProfiles` sheet. Existing profiles can be selected and updated. Each
profile can be loaded by its internal `businessId` in either email renderer.
That internal profile ID is only a lookup key; customer benefit codes remain
the readable initials-plus-ordinal format.

## Profile fields

- Business name and contact email.
- Gmail sender address (primary account or alias already authorized in Gmail).
- Optional QR-registration and unsubscribe response-tab IDs.
- Required HTTPS review and campaign opt-out URLs; optional logo, website, and
  Instagram URLs.
- Primary, background, and accent colors in six-digit hexadecimal format.

Email templates use the logo when supplied and otherwise render a monogram.
Colors are validated before insertion into template styles. A logo URL must be
reachable by email clients; the monogram remains the fallback when a remote
image cannot be loaded.

## Email input contracts

- **Registration:** pass the form's `name`, `email`, `clientNumber`, eligibility
  result, and `mapsLink`, plus `businessId` or a business profile object. The
  business profile provides sender identity, alias, brand, and social links.
- **Campaign:** pass `subject`, `body`, `conditions`, and `footer`; pass
  `recipientName` for the `CLIENTE` placeholder, and `businessId` or a profile
  object for business identity. This keeps recipient personalization separate
  from the business name shown as sender.

The onboarding dialog saves profile settings and can map QR/unsubscribe Forms
to response tabs in the same bound spreadsheet. After linking each Form to that
spreadsheet, copy the response tab's `gid` into its profile field. Create Forms
and Drive folders/calendars manually. A non-primary sender alias must already
be authorized in Gmail before the profile can be saved. Once response tabs are
mapped, run `installMailWizFormSubmitTrigger()` once to handle QR and
unsubscribe events.
