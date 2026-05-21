---
type: competitor
updated: 2026-05-21
sources: 2
---

# myBillBook — App Architecture & Data Model

Sister page to [[competitor/mybillbook]] (which covers positioning/marketing).
This page is the **product architecture teardown** we use as the blueprint for
AstraBill's full-ledger pivot. See [[decision/full-ledger-pivot]] for why.

**Sources so far:**
- 2026-05-21 — Four screenshots of `/app/home/add-party` (Create Party flow)
- 2026-05-21 — Address modal, Bank Account modal, Party Settings (Smart Greetings + Custom Fields), All Parties list, Party detail page

> **Research method:** copy everything they do first, document it here, then
> decide where AstraBill improves vs. matches. No "we'll improve it" notes in
> this page — those go in `decision/*` pages.

---

## App nav (sidebar observed)

```
GENERAL
  Dashboard
  Parties
    All Parties
    SharedLedger        [New badge]
  Items                 (expandable >)
  Sales                 (expandable >)
  Purchases             (expandable >)
  Reports

ACCOUNTING SOLUTIONS
  Cash & Bank
  E-Invoicing
  Automated Bills
  Expenses
  POS Billing
  (more, partly cut off)

SETTINGS
  Settings
```

**Top-of-sidebar:**
- Business name + phone (e.g. "Opryon Labs · 6396591516")
- **Create Sales Invoice** primary CTA button (with `+` icon and chevron — suggests dropdown to other doc types)

**Observations:**
- "Parties" is the unified bucket (not "Customers" + "Suppliers" as separate items)
- "Items" not "Products" — they cover both goods + services under one umbrella
- "Sales" and "Purchases" are siblings — symmetric model
- "Cash & Bank" is a first-class concept — implies they track bank accounts as ledger entities
- "E-Invoicing" is its own section — the IRN/QR generation for ₹5cr+ businesses
- "POS Billing" — fast-entry mode for shop-counter use
- "Expenses" — non-purchase outgoings (rent, salary, etc.)

---

## Create Party — full field map

URL pattern: `/app/home/add-party`

### Section 1 — General Details

| Field | Type | Required | Notes |
|---|---|---|---|
| Party Name | text | ✅ | Placeholder "Enter name" |
| Mobile Number | tel | ❌ | Placeholder "Enter mobile number" |
| Email | email | ❌ | Placeholder "Enter email" |
| **Opening Balance** | currency + side toggle | ❌ | ₹ input + dropdown: **To Collect** / To Pay |
| GSTIN | text | ❌ | Placeholder "ex: 29XXXXX9438X1XX" + **Get Details** button (autofill from GSTN public API) |
| PAN Number | text | ❌ | Placeholder "Enter party PAN Number" |

Helper text under the row: *"Note: You can auto populate party details from GSTIN"*

### Section 2 — Party classification

| Field | Type | Required | Options |
|---|---|---|---|
| **Party Type** | dropdown | ✅ | Customer / Supplier |
| **Party Category** | searchable dropdown | ❌ | "Search Categories" — appears to be user-extensible (no fixed list visible; inline-create implied) |

### Section 3 — Address (modal — CONFIRMED)

Clicking "Billing Address" textarea opens a modal titled **"Add Billing
Address"**:

| Field | Type | Required |
|---|---|---|
| Street Address | textarea | ✅ |
| State | searchable dropdown (magnifying-glass icon, "Enter State") | ❌ |
| Pincode | text | ❌ |
| City | text | ❌ |

Buttons: Cancel + **Save** (primary purple).

Shipping Address has a "**Same as Billing address**" checkbox (checked
by default). When unchecked, a separate "+ Add Another Shipping Address"
link appears (seen in Party Settings modal screenshot — `Add Another
Shipping Address` exists, suggesting **multiple shipping addresses per
party**).

The parent form's textarea is the summary view — modal is the canonical
edit surface.

### Section 4 — Credit Terms (inline on parent form)

| Field | Type | Default |
|---|---|---|
| Credit Period | number + "Days" suffix | 30 |
| Credit Limit | currency | 0 |

### Section 5 — Contact Person Details

| Field | Type | Notes |
|---|---|---|
| Contact Person Name | text | Placeholder "Ex: Ankit Mishra" |
| Date of Birth | date picker | Format `DD-MM-YYYY` |

Likely powers their birthday-greeting automation (sends WhatsApp/SMS on contact's DOB).

### Section 6 — Party Bank Account (modal — CONFIRMED)

Empty illustration + "Add party bank information to manage transactions"

CTA: **+ Add Bank Account** → opens "Add Bank Account" modal with:

| Field | Type | Required | Notes |
|---|---|---|---|
| Bank Account Number | text | ✅ | Placeholder "ex: 123456789" |
| Re-Enter Bank Account Number | text | ✅ | **Anti-typo confirmation** — must match field above |
| IFSC Code | text | ❌ | Placeholder "ex: ICIC0001234" |
| Account Holder's Name | text | ❌ | Placeholder "ex: Babu Lal" |
| Bank Name | text | ❌ | Placeholder "ex: ICICI Bank" |
| Branch Name | text | ❌ | Placeholder "ex: Mumbai" |
| **UPI ID** | text | ❌ | Placeholder "ex: babulal@upi" |

Buttons: Cancel + **Submit** (greyed out until required fields filled).

**Observations:**
- The "Re-Enter" pattern is a great UI safety mechanism for account numbers — adopt for AstraBill.
- The **UPI ID** field is significant: a Customer party's UPI ID = where THEY pay from (could prefill UPI VPA verification); a Supplier party's UPI ID = where YOU send payments to.
- Likely **multiple bank accounts per party** allowed (the "+" suggests additive). Schema: `party_bank_accounts` 1-to-many.

### Section 7 — Custom Field — CONFIRMED simple

Empty state showing example field bubbles (License Number, Birthday,
Website Link) as faded illustration.

CTA: **Add Custom Fields** → opens Party Settings modal → Custom Fields tab.

**Custom Fields tab:**
- Empty state: "You don't have any custom fields created yet" + "+ Create custom field"
- Edit mode: a row with **Field Name** text input + trash icon, plus a dashed-border "+ Add New Field" button to add more rows.

**Critical simplification:** Custom fields are **name-only, free text**.
There is no field-type selector (no text/number/date/dropdown choice).
Just a label string. Schema for AstraBill can be as simple as a JSON
column on `parties` (e.g. `custom_fields jsonb`) keyed by the workspace's
defined field names.

Pattern: custom fields are **defined at workspace level** (via Party
Settings), then **filled per party** on the create/edit form.

### Top action bar

- **(Back arrow)** Create Party (page title)
- Right cluster: keyboard-shortcut icon · **Party Settings ⚙** · **Save & New** (outline) · **Save** (primary)

**Save & New** is critical for bulk entry — clears the form and stays on the page after a successful save.

---

## Party Settings (modal — accessed via gear icon on Create Party)

Two left-nav tabs inside the Party Settings modal:

### Tab A: Send Smart Greetings

WhatsApp automation feature — sends templated messages to parties.

| Greeting | Trigger | Default Template |
|---|---|---|
| **Invoice Milestones** | Every 10th / 25th / 50th / 100th invoice to this party | `Hey, {{MilestoneMessage}} with {{YourBusinessName}} — thank you, {{PartyName}}! 🎉 <View Invoice>` |
| **Birthday Wishes** | On contact person's DOB (or party DOB?) | `Happy Birthday, {{Party Name}}! 🎂 Wishing you success & smiles.` |

Both have per-greeting toggle + editable template dropdown (probably template variants to pick from).

**Implication for AstraBill:** The DOB field on Create Party exists primarily for the Birthday Wishes automation. Note the template uses `{{Party Name}}` not `{{Contact Person Name}}` — so the greeting goes to the party (business name), implying DOB might actually be the *business owner's* birthday, not the contact person's. (Worth confirming.)

**Not P0 for our V1** — this is CRM-lite, not core books. But explains the DOB field's existence.

### Tab B: Custom Fields

Already documented above (in Section 7 of Create Party form).

---

## All Parties list page (`/parties`)

### Page header

- Title: **Parties**
- Right cluster:
  - **SharedLedger Portal** button (with link icon — see below)
  - **Reports** dropdown (party-scoped reports)
  - Settings gear icon
  - Keyboard shortcut icon

### Top stats tiles (also act as filters)

Three tiles in a horizontal row:

| Tile | Value (live) | Notes |
|---|---|---|
| **All Parties** | `3` | Total count of parties. Highlighted/active state shown. |
| **To Collect** | `₹ 10,000` | Sum of all customer balances where customer owes you |
| **To Pay** | `₹ 40,000` | Sum of all supplier balances where you owe supplier |

Tiles double as filters — click "To Collect" to filter list to only parties with positive outstanding.

### Toolbar

- 🔍 Search input (icon-only initially, expands)
- **Search Categories** dropdown (filter by Party Category)
- **Bulk Action** dropdown (right-aligned) — bulk operations
- **Create Party** primary CTA

### Table

| Column | Sort | Notes |
|---|---|---|
| Party Name | ✅ | Name + optional icon (e.g. green paper-plane for "shared" status?) |
| Category | ❌ | The Party Category |
| Mobile Number | ❌ | Raw 10-digit |
| Party type | ❌ | "Customer" or "Supplier" — singular text, not a badge |
| Balance | ✅ | `↑ ₹ X,XXX` (red, you owe them) / `↓ ₹ X,XXX` (green, they owe you) / `₹ 0` (settled) |
| (kebab) | — | Per-row actions menu |

### Balance color/arrow semantics — IMPORTANT

| Display | Meaning |
|---|---|
| `↑ ₹ X` (red up arrow) | **You owe them** — outflow direction |
| `↓ ₹ X` (green down arrow) | **They owe you** — inflow direction |
| `₹ 0` (plain) | Settled, no outstanding |

This is "direction of money flow from your perspective". For schema, this is just `SUM(ledger_entries.amount)` with a sign convention — we'll lock that in the schema phase.

### Special "Cash Sale" party

A party named **"Cash Sale"** is auto-created — type Customer, no Category, mobile = the business owner's mobile. This is the walk-in fallback when no real customer exists.

**Implication for AstraBill:** auto-create a "Cash Sale" party per business on onboarding (or treat it as a virtual party type — needs decision).

### Bottom banner

"Add Multiple Parties at once — Bulk upload all your parties to myBillBook using excel" with **Upload Excel** CTA.

**Implication:** Excel import for parties is table-stakes for onboarding shop owners with existing customer lists in notebooks/Excel. P2 feature for us.

### SharedLedger banner (dismissible)

Top of page banner: *"Are you Tired of asking Party's Ledger? Access sharedledgers and turn invoices into purchases instantly."* with **View SharedLedgers** CTA.

**What SharedLedger is** (inferred): a cross-myBillBook reconciliation feature. When TWO myBillBook users are doing business together, the supplier's sales invoice to you can be **automatically converted into a purchase bill** in your books. This is a network-effect feature that only works because both parties are on myBillBook.

**Not relevant for AstraBill V1** — requires network of users on our platform first. Note for V3+.

---

## Party detail page (`/parties/[id]`)

### Layout: two-pane

- **Left rail (~240px):** Search Party input + scrollable party list as cards
  - Card content: Name (bold) + Balance + Type + arrow indicator
  - Currently-viewed party has purple-border highlight
  - Cards act as quick-navigation between parties without going back to list
- **Main pane:** the selected party's detail

### Main pane header

- `←` back arrow + **Party Name** (e.g. "shubh")
- Right cluster:
  - **Create Sales Invoice** primary CTA + dropdown (likely picks doc type)
  - **Edit** button (outline) — opens the Create Party form pre-filled
  - **Delete** (trash icon, red)
  - Keyboard shortcut icon

### Tabs (the foundation of the detail page)

| Tab | Purpose |
|---|---|
| **Transactions** | All financial documents that touch this party (sales invoices, purchase bills, credit/debit notes, payments) |
| **Profile** | The party's metadata (name, GSTIN, address, contact, bank, custom fields) — read-only summary; Edit reopens the form |
| **Ledger (Statement)** | Running balance over time — the chronological "khata" view |
| **Item Wise Report** | Which items were bought/sold from/to this party + aggregate |

### Profile tab — layout (CONFIRMED 2026-05-21)

Two-column card grid:

**Left column:**
- General Details card — Party Name · Party Type · Mobile · Party Category · Email · Opening Balance (with same `↓/↑` arrow as list view)
- Credit Details card — Credit Period (in Days) · Credit Limit
- Party Bank Details card — empty state with `+` to add (or list of bank accounts)

**Right column:**
- Business Details card — GSTIN · PAN · Billing Address (multi-line) · Shipping Address (multi-line) · **"Manage Shipping Addresses"** link (confirms multiple shipping addresses per party — B2 bonus answered)
- Contact Person Details card — Name · Date of Birth
- Custom Fields card — empty state with `+` (also describes adding fields like "Colour, Size, ID Number" — may share infra with Item custom fields)

### Transactions tab

Filters: date range (default "Last 365 Days") + transaction type + status.

Table columns: Date · Transaction Type · Transaction Number · Amount · Status

Empty state observed: party has ₹10,000 To-Collect balance but Transactions tab shows "No transactions for the selected time period". **Critical implication:** Opening Balance does NOT create a transaction row — it lives in the Ledger (Statement) tab instead. Confirms our schema hypothesis: **ledger_entries is a separate concept from documents/transactions**.

### Ledger (Statement) tab — CONFIRMED via CSV download

Header stats (4 tiles, labels swap per **balance sign**, NOT per
party type — confirmed 2026-05-21 by editing shubh to Supplier and
observing the tile label stayed as "Receivable" because balance was
still positive):

| Balance sign | Tile labels |
|---|---|
| Positive (balance > 0 — they owe you) | Total **Receivable** Amount · Overdue Amount · Total Sales Amount · Total Received Amount |
| Negative (balance < 0 — you owe them) | Total **Payable** Amount · Overdue Amount · Total Sales Amount · Total Received Amount |

Toolbar: date range · Download Excel · Print PDF · Share.

Columns (full ledger row shape, from CSV):
`Date · Voucher · Sr No · Payment Mode · Credit · Debit · Balance · Due Date (overdue by) · Payment Status`

**Live data captured (raw CSV rows):**

```
Party: Shubh (Customer, To Collect ₹10,000)
Voucher: Opening Balance  Credit: ""        Debit: 10000.0  Balance:  10000.0
Voucher: Closing Balance  Credit: ""        Debit: 10000.0  Balance:  10000.0

Party: Asmit (Supplier, To Pay ₹40,000)
Voucher: Opening Balance  Credit: 40000.0   Debit: ""       Balance: -40000.0
Voucher: Closing Balance  Credit: 40000.0   Debit: ""       Balance: -40000.0
```

### Accounting convention — DECISIVE for schema

myBillBook uses **explicit Debit/Credit columns** with the standard
Indian accounting sign convention (from the business's POV):

| Event | Column hit | Balance impact | Meaning |
|---|---|---|---|
| Customer opening balance (they owe us) | **Debit** | `+` (positive) | Sundry debtor receivable |
| Supplier opening balance (we owe them) | **Credit** | `+` (negative — i.e. shown as `-X`) | Sundry creditor payable |

Formula: `balance = sum(debit) − sum(credit)` from our (business) POV.

- **Positive balance** = party owes us (receivable / "To Collect")
- **Negative balance** = we owe party (payable / "To Pay")

The all-parties list arrows (`↑ red` / `↓ green`) are a display
abstraction over this same signed balance:

| Internal balance | Display |
|---|---|
| `+10000` | `↓ ₹10,000` (green) — they owe you, money flows IN to you |
| `-40000` | `↑ ₹40,000` (red) — you owe them, money flows OUT |
| `0` | `₹0` (plain) — settled |

### Implication for AstraBill schema

This is **single-entry from the per-party perspective** (not full
double-entry — no offsetting account row is shown to the user). The
underlying table shape this implies:

```
ledger_entries
  id
  business_id
  party_id        -- nullable for non-party rows like opening equity? unclear
  entry_date      -- nullable for "opening balance" entries
  voucher_type    -- enum: opening_balance | sales_invoice | purchase_bill |
                  --   payment_in | payment_out | credit_note | debit_note | ...
  doc_id          -- nullable; null for opening_balance entries
  debit_amount    -- nullable; one of debit/credit is set per row
  credit_amount   -- nullable; the other is set
  narration       -- optional free text
  created_at, updated_at
```

Running balance per party is `SUM(debit_amount) - SUM(credit_amount)`
across entries. We can either compute live or persist a `balance_after`
column for performance. Decision deferred to schema phase.

### Per-party-type action button (CONFIRMED)

The detail page's primary CTA respects party type:
- **Customer party:** "Create Sales Invoice" (with dropdown for other doc types)
- **Supplier party:** "Create Purchase Invoice" (with dropdown for other doc types)

The dropdown likely contains both sales and purchase doc types
regardless — defaulting to the most-likely action per type.

**This is the ONLY place party type affects behavior.** Everything
else (ledger entries, balance sign, arrow color, stats labels) is
computed from the ledger data itself, not from the type field.

---

## Open questions on the Create Party form (P0 — need before schema)

**Status legend:** ✅ answered · 🟡 partial · ❓ open

Q1. **Opening Balance — what does saving a non-zero value actually do?** ✅
    ANSWERED via CSV download (2026-05-21): creates a single row in
    the Ledger (Statement) tab with `Voucher = "Opening Balance"`,
    no date, no Sr No, no payment mode, and either Debit (Customer
    "To Collect") or Credit (Supplier "To Pay") populated. See the
    "Accounting convention" section above for the full schema
    implication. **Decision: AstraBill uses the same model — a
    `ledger_entries` row with `voucher_type='opening_balance'` and
    nullable `doc_id`.**

Q2. **Party Type — can ONE party be both customer AND supplier?** ✅
    ANSWERED (2026-05-21 test: edited shubh from Customer → Supplier):
    - Party Type dropdown has exactly **TWO options: Customer / Supplier**.
      No "Both" option, no toggle for multi-type.
    - Type change was allowed silently — no warning dialog, no data
      migration prompt.
    - **CRITICAL FINDING:** Changing the type did NOT flip the ledger
      entry. shubh's Opening Balance entry stayed in the **Debit**
      column with `Balance = +₹10,000` even after becoming a Supplier.
      The CSV export confirms identical row data pre- and post- type
      change.
    - What DID change after the type flip:
      1. Primary CTA: "Create Sales Invoice" → "**Create Purchase Invoice**"
      2. Party detail header pill / left-rail card now says "Supplier"
    - What did NOT change:
      1. Ledger Debit/Credit columns (data is immutable to type)
      2. Stats tile label — still "Total Receivable Amount ₹10,000"
         (because **the label is driven by balance SIGN, not by party type**)
      3. All Parties list arrow — still `↓ green ₹10,000`

    **The model: Party Type is pure UI metadata that drives the default
    primary CTA, nothing else. The ledger is the financial source of
    truth, independent of party type.**

    **Implication for AstraBill:**
    - `parties.type` is a simple enum (`customer | supplier`), no
      constraints, freely mutable, drives only UI defaults
    - All ledger sign / receivable / payable / arrow color is computed
      from `ledger_entries` balance sign, NOT from `parties.type`
    - A sales invoice can reference a party of either type; same for
      purchase bills — type doesn't gate doc creation, it just sets
      the default action
    - No need for a "Both" type — the data model naturally supports
      a party having both sales and purchase docs

Q3. **GSTIN "Get Details" — what fields autofill?** ✅
    ANSWERED (2026-05-21 test with GSTIN `05BXHPT2863D1ZE`):
    - **Party Name** — pulled from GSTN registry (legal/trade name)
    - **PAN Number** — derived from GSTIN positions 3-12 (BXHPT2863D)
    - **Billing Address** (full structured) — pulled from registry:
      e.g. `1, Subhash Nagar, Roorkee, Haridwar, Uttarakhand, Haridwar, Uttarakhand, 247667`
    - **State** — implicit from GSTIN's first 2 digits (state code) +
      address
    - The "Get Details" button greys out after a successful fetch
    - Shipping Address autofills as a copy of Billing when "Same as
      Billing" is checked (default behavior)

    **Implication for AstraBill:** call the GSTN public Search Taxpayer
    API on Get Details click. Map: legal_name → Party Name, derive PAN
    from GSTIN positions 3-12, parse pradr/aadr address blocks →
    structured address fields, derive state from positions 1-2.

Q4. **Address textarea vs. modal — which is canonical?** ✅
    ANSWERED: Modal is canonical. Parent textarea is the summary view.
    See Section 3 above.

Q5. **Party Category — default list or empty until user creates?** ✅
    ANSWERED: Empty by default. **Inline-creatable from the dropdown
    itself** — when user types a name not in the list, a "create
    category" affordance appears; on confirm, the category is created
    and immediately selectable. Categories are workspace-scoped (visible
    across all parties for that business). User confirmation 2026-05-21.
    **Schema:** `party_categories(id, business_id, name)` + `parties.category_id`.

Q6. **Save & New behavior — what carries over?** ✅
    ANSWERED (2026-05-21 user test): **Nothing carries over. Full reset.**
    Save & New behaves identically to Save + manually navigate back to
    Create Party. The only practical difference is one click saved.

    **Implication for AstraBill:** match this. No surprise persistence,
    no clever "keep Party Type" behavior. Users expect cleared form on
    Save & New. Keep it simple.

Q7. **Mobile number uniqueness — enforced?** ✅
    ANSWERED (2026-05-21 test): **Soft warning, NOT a hard block.**
    Inline yellow info banner appears as soon as the duplicate mobile
    is typed: *"One or More Party exists with same number. Ignore to
    create anyway."* with a **"View"** link to inspect existing matches.
    User can save anyway and the second party is created normally.

    **Implication for AstraBill:**
    - Mobile is **NOT a unique constraint** in the schema
    - Implement real-time lookup on mobile blur/change to find existing
      parties with same mobile (scoped to business)
    - Show non-blocking inline warning with "View" affordance to peek
      at matches (link to filtered parties list or a popover)
    - Wording: match myBillBook's neutral, non-judgmental phrasing

Q8. **Display name precedence — Party Name or Contact Person Name?** ✅
    ANSWERED (2026-05-21 rendered Sales Invoice #1):
    - **Bill To block uses `parties.name` (Party Name)** — the rendered
      PDF showed "Asmit" (Party Name), followed by the billing address
      and mobile from the party record.
    - **Contact Person Name is internal-only CRM metadata** — it never
      appears on the rendered invoice. Its purpose is to capture
      "who do I actually talk to at this business?" for ops, not for
      addressing the document.

    **Implication for AstraBill:** mirror this. Invoice "Bill To" always
    renders `parties.name`. Contact Person fields are exposed only in
    the party detail page and quick-actions (Call/WhatsApp).

Q9. **Custom Field types — what's supported?** ✅
    ANSWERED: Just **name-only, free text**. No type selector. Workspace-
    scoped. Defined in Party Settings → Custom Fields tab. See
    Section 7 above.

Q10. **Party Bank Account modal — fields?** ✅
     ANSWERED: Bank Account Number (required + re-enter for verification),
     IFSC, Account Holder Name, Bank Name, Branch Name, UPI ID. See
     Section 6 above.

---

## Bonus findings (2026-05-21)

**B1 — Multiple bank accounts per party?**
**No — myBillBook supports only ONE bank account per party.** After
adding one, there is no `+ Add Bank Account` button anymore. This
is a real constraint, not a UX guess. *For AstraBill, see decision
note below — we plan to allow multiple.*

**B3 — GSTIN uniqueness?**
**Not enforced. Same GSTIN can be saved on multiple parties without
any warning or block.** This is surprising — GSTIN is a legal unique
identifier and duplicates can mess up ITC reconciliation. *For
AstraBill, see decision note below.*

**B4 — Green paper-plane icon next to party name?**
Indicates the party is **also a myBillBook user** (i.e. they exist on
myBillBook's network, enabling the SharedLedger feature). Pure
network-effect signal. **Not relevant for AstraBill** — we have no
network of users yet, no analogue needed.

---

---

## Settings surface

### Sidebar — Settings sub-pages (`/app/settings/...`)

When you click "Settings" in the main app sidebar, the layout changes
to a Settings shell with its own left nav. The Settings nav has:

| Sub-page | Purpose |
|---|---|
| **Account** | User-level account (profile, password, etc.) |
| **Manage Business** | Business profile / company settings (one row per business) |
| **Invoice Settings** | Invoice-specific config (numbering, columns, defaults?) — TBD |
| **Print Settings** | Print template / format config — TBD |
| **Manage Users** | RBAC / team invites — TBD |
| **Reminders** | Auto-reminder scheduling — TBD |
| **CA Reports Sharing** | Send reports to your CA — TBD |
| **Pricing** | Plan / billing |
| **Refer & Earn** | Growth / affiliate |
| **Help And Support** | Support links |
| **Logout** | End session |

Top of Settings sidebar: business switcher (Opryon Labs · 6396591516)
+ **Back to Dashboard** button. Footer: app version (9.8.2) + 100% Secure + ISO Certified badges.

### Manage Business — full field map (top half captured 2026-05-21)

URL: `/app/settings/company`

Page header: **Business Settings · Edit Your Company Settings And
Information** + top-right toolbar:
- **Create new business** (orange CTA — multi-business support)
- Keyboard shortcut icon
- Chat Support
- **Close Financial Year** (locks current FY, starts new one)
- Cancel · Save Changes

#### Left column

| Field | Type | Required | Notes |
|---|---|---|---|
| Logo | image upload | ❌ | PNG/JPG, max 5MB |
| **Business Name** | text | ✅ | |
| Company Phone Number | tel | ❌ | |
| Company E-Mail | email | ❌ | |
| Billing Address | textarea | ❌ | Note: **plain textarea, NOT the structured modal** used on parties — inconsistency in myBillBook |
| State | searchable dropdown | ❌ | |
| Pincode | text | ❌ | |
| City | text | ❌ | |
| **Are you GST Registered?** | radio Yes/No | ✅ | If No, GST-dependent fields hide |
| Enable e-Invoicing | toggle | ❌ | "New" badge — for ≥₹5cr turnover businesses (IRN/QR) |
| PAN Number | text | ❌ | |
| Enable TDS | toggle | ❌ | Tax deducted at source — niche |
| Enable TCS | toggle | ❌ | Tax collected at source — niche |
| (more below the Enable TCS toggle — TBD, "Company Settings" header visible at bottom) |

#### Right column

| Field | Type | Notes |
|---|---|---|
| **Business Type** | multi-select checkbox dropdown | Retailer · Wholesaler · Distributor · Manufacturer · Services. **Plural allowed** (e.g. Retailer + Wholesaler). |
| **Industry Type** | searchable single-select | Huge seeded list: Accounting and Financial Services, Agriculture, Automobile, Battery, Broadband/cable/internet, Building Material and Construction, Cleaning and Pest Control, ... (50+ industries probably) |
| **Business Registration Type** | single-select dropdown | Private Limited Company · Public Limited Company · Partnerships Firm · Limited Liability Partnership · One Person Company · Sole Proprietorship · Section 8 Company · (more — Indian company forms) |
| **Signature** | dashed-box modal trigger | Two modes: **Upload Signature from Desktop** (image upload) OR **Show Empty Signature Box on Invoice** (placeholder for hand-signing post-print). Note: T&C and Signature both render on invoice. |
| **Add Business Details** | key=value pairs | Free-form: Website = www.website.com, MSME number = ..., etc. JSON-ish extension surface. |

### Observations / Implications

1. **Business Address is a plain textarea here** but a **structured modal**
   on the Parties form. This is a myBillBook inconsistency — we should
   pick ONE pattern (probably structured modal everywhere) and apply
   uniformly.

2. **GST Registered = Yes/No is a master toggle.** When No, the
   business can still use myBillBook for non-GST billing (cash receipts,
   estimates). Critical for shop owners under the GST threshold.

3. **Business Type is multi-select** — one business can be Retailer +
   Wholesaler. Schema: array column or join table.

4. **Industry Type list is huge** — likely 50+ values, searchable. Seed
   as reference table. Used for analytics/positioning, not core logic.

5. **Business Registration Type** is a closed enum of Indian company
   forms. Used on invoice header sometimes (e.g. "(P) Ltd").

6. **Signature has TWO modes** (upload OR empty-box-placeholder) — we
   should support both. Schema: `signature_image_url` nullable +
   `show_signature_box_on_invoice` bool.

7. **Additional Business Details = arbitrary key=value pairs** — easiest
   as JSONB. Used for MSME number, Website, etc.

8. **Close Financial Year** is a verb (button), not a field. Means
   myBillBook has a process for FY closure (lock prior FY data, start
   fresh numbering, snapshot reports). For V1 we can defer this — set
   FY start as April 1 by default, no closure flow.

9. **Multi-business is first-class** — "Create new business" is a
   primary header CTA. Matches AstraBill's existing model.

### Settings → Invoice Settings (`/app/settings/invoice`)

**This is the template/theme picker — NOT field-level invoice config.**

**Themes available (9+ templates observed 2026-05-21):**
- Stylish
- Luxury (with NEW badge — Indian palace artwork bg, decorative borders)
- Advanced GST (Tally) — table-heavy classic Tally look
- Advanced GST
- Billbook
- Advanced GST(A5)
- Billbook(A5)
- Modern
- Simple
- (+ See All link for more)

**Theme Styling (NEW)** — variants of a chosen theme:
- State-based chips: Uttar Pradesh ✕, Maharashtra, Gujarat (region-coded artwork)
- Industry-based chips: Electronics, etc.
- The "Luxury" theme has multiple regional/industry skins layered on top

**Create Custom Theme** — "Create your own theme" CTA. Visual builder for power users.

**Theme Settings (NEW)** — column/field visibility toggles:
- Show party balance in invoice  *(customer's running balance prints ON the invoice — interesting CRM trick)*
- Enable free item quantity  *(free items / buy-X-get-Y)*
- Show item description in invoice
- Show Alternate Unit in Invoice  *(dual-unit billing — we already have this)*
- Show phone number on Invoice
- Show time on Invoices
- Price History  *(show last-bought price for this party + item)*
- Auto-apply luxury theme for sharing  *(use a fancier template for WhatsApp share than for print)*

**Bottom accordion sections** for granular control:
- Invoice Details
- Party Details
- Item Table Columns
- Miscellaneous Details (NEW)

### Settings → Print Settings (`/app/settings/thermal-print`)

**Separate from Invoice Settings** — this is **physical printer** config, not screen/PDF.

Two tabs:
- **Thermal Printer** — for POS receipt printers
  - Paper width: 2 Inch / 3 Inch
  - Monochrome Business Logo upload (BMP, 210×70px) — separate asset from color logo
- **Barcode Printer** — for label/sticker printing

Strong design choice: don't conflate WYSIWYG (Invoice Settings) with hardware (Print Settings).

### Settings → Manage Users (`/app/settings/user-management`) — RBAC

Roles visible in the illustration:
- **Admin** (Full Vision)
- **Partner**
- **Salesman**
- **Stock Manager**
- **Delivery Boy**
- **CA** (separate "Add Your CA" CTA)

Empty-state stats: Number of Users · Activities Performed (Last 30 Days).

myBillBook tracks per-user activity (Staffwise Daybook Report, Activity Tracker icons visible). Real RBAC, not cosmetic.

### Settings → Reminders (`/app/settings/reminders`)

Two master toggles at top:
- **Send billing WhatsApp/SMS to Party** (default ON)
- **Get payment reminders on WhatsApp** (default OFF)

Two sub-sections (collapsible):

**TO PARTY (outbound — sent via SMS to customers):**
- Sales Invoice — collect payments on time
  - 3 days before due date ✓
  - On due date ✓
  - View sample SMS (link — preview exact message)

**TO YOU (inbound — sent to owner via mobile app + WhatsApp):**
- Sales Invoice — get reminded to collect (3 days before / on due)
- Purchase Invoice — get reminded to pay (3 days before / on due)
- Low Stock — when stock < low stock level (confirms inventory is part of model)
- Daily Summary — Outstanding Collections + Payments, Yesterday's Sales

Smart conceptual split: messages flowing OUT (to party) vs IN (to me). Two delivery channels (SMS for party, WhatsApp+app for owner).

---

## V1 vs V2 scope from this batch

| Feature seen | V1? | Why / why not |
|---|---|---|
| 2-3 invoice templates | ✅ V1 | Already in [[decision/invoice-design-system]] |
| Theme Styling (state/industry variants) | ❌ V2+ | Overkill, too much asset work |
| Custom Theme builder | ❌ V2+ | Power-user feature |
| Theme Settings toggles | 🟡 V1 partial | Pick 2-3 useful toggles only (show description, show phone) |
| Thermal printer support | ❌ V2 | Real feature for kirana/hardware shops but complex (separate layout, BMP logo, paper width) |
| Barcode printer | ❌ V3+ | Label printing — way out of scope |
| RBAC (Manage Users) | ❌ V2 | Single-user owner first |
| Reminders (all types) | ❌ V2 | We'll have basic WhatsApp-on-create only |
| Low-stock reminder | ❌ V2 | Needs full inventory threshold system |
| Daily Summary | ❌ V2 | Engagement feature, not foundation |
| SMS as a fallback channel | ❌ V2 | WhatsApp-only for V1 |

---

### Manage Business — bottom of page

Captured 2026-05-21. Below the Enable TCS toggle:

- **Company Settings** section (single feature):
  - **Data Export to Tally** (NEW badge) — "Transfer vouchers, items and parties to Tally"
  - *Insight: myBillBook acknowledges the CA still uses Tally and provides an export bridge. Smart positioning — don't fight Tally, integrate.*

- **Add New Business** section (alternate to the top-right "Create new business" CTA):
  - Illustration (Store 1 ↔ phone/PC ↔ Store 2)
  - Text: "Easily Manage all your businesses in one place"
  - **Create New Business** button

That's the entire Manage Business page. No invoice numbering config, no
tax rate config, no other hidden sections.

### Bank Account — lives in main-sidebar Cash & Bank (`/app/home/cash-bank`)

**Critical find (2026-05-21): the business's OWN bank accounts (where YOU
receive money) live in a separate top-level page, NOT in Settings.**

This is myBillBook's **money accounts** surface — distinct from party
bank accounts. Conceptually it tracks:

| Account type | Purpose |
|---|---|
| Cash | "Cash in hand" — the till / cash drawer |
| Bank Accounts | One or more bank accounts the business operates |
| Unlinked Transactions | Transactions whose money-account is unspecified (cleanup queue) |

**Page header CTAs:**
- **Add/Reduce Money** — manual adjustment on a chosen account (deposit cash, withdraw, opening balance)
- **Transfer Money** — between accounts (e.g. cash → bank deposit)
- **+ Add New Account** (primary purple CTA)

**Left panel (account list with running balances):**
- Total Balance (sum across all accounts)
- Cash → Cash in hand: ₹0
- Bank Accounts (list with `+ Add New Bank` link)
- Unlinked Transactions: ₹0

**Right panel:** Transactions log — date-filtered list of every cash/bank movement. Date filter default "Last 30 Days". Download icon (CSV/PDF export).

**Implication for AstraBill schema — `money_accounts` table:**

```
money_accounts
  id
  business_id
  name           -- required: "Cash in hand" (auto) or "ICICI Current A/c" etc.
  opening_balance
  opening_balance_as_of_date     -- defaults to today; user can backdate
  has_bank_details (bool)        -- toggle: when false, this is a "cash-like" account
  -- bank-specific (nullable when has_bank_details=false):
  bank_account_number
  ifsc
  account_holder_name
  bank_name
  branch_name
  upi_id
```

**Plus: every payment (in or out) MUST reference a `money_account_id`.**
A sale invoice gets paid → posts a `payment_in` row → debits the chosen
money_account (cash drawer or specific bank).

This is the missing link between:
- Party ledger ("Asmit owes ₹40,000")
- Cash flow ("ICICI bank shows ₹40,000 received from Asmit on date X")

### Add Bank Account modal (CONFIRMED 2026-05-21)

Title: **Add Bank Account**

Top fields (always visible):

| Field | Type | Required |
|---|---|---|
| Account Name | text | ✅ |
| Opening Balance | ₹ input | ❌ (default 0) |
| As of Date | date picker | ❌ (default today) |

**Add Bank Details** toggle — *default OFF*. When the user wants a
"cash-like" account (e.g. "Petty Cash", "Counter Drawer 2"), they leave
this off and submit with just the top three fields.

When toggle is ON, additional fields appear:

| Field | Type | Required |
|---|---|---|
| Bank Account Number | text | ✅ (with re-enter confirmation) |
| Re-Enter Bank Account Number | text | ✅ |
| Account Holders Name | text | ✅ |
| IFSC Code | text | ✅ |
| Bank Name | text | ✅ |
| Branch Name | text | ✅ |
| UPI ID | text | ❌ |

**This is much better than party-side bank modal** — for the *business's
own* bank, IFSC / Bank Name / Branch Name are ALL required (correctly).
For the party-side modal, only Account Number was required (a minor
inconsistency in myBillBook). AstraBill should make IFSC + Bank Name
required everywhere — see [[#flagged-mybillbook-quirks]].

**Notable: NO account-type field** (savings/current) — myBillBook
doesn't distinguish. AstraBill: skip too. **NO "set as default" toggle**
— default behavior likely picks first-created or last-used. We can add
an explicit `is_default` flag if needed.

### Add/Reduce Money modal — "Adjust Balance" (CONFIRMED 2026-05-21)

Title: **Adjust Balance**

| Field | Type | Notes |
|---|---|---|
| Adjust money in | dropdown | Pick which money_account to adjust |
| Add or Reduce | pill toggle | `+ Add Money` / `- Reduce Money` (mutually exclusive) |
| Current Balance | read-only | Shows balance of selected account |
| Date | date picker | Default today |
| Enter Amount | ₹ input | |
| New balance | read-only, computed | Updates live as user types |
| Add Remarks | expandable link | Optional notes |

Use case: opening cash drawer with ₹X, owner takes ₹Y for personal use,
bank charges deducted ₹Z, etc. — any manual movement that doesn't come
from a document.

### Transfer Money modal — "Transfer Balance" (CONFIRMED 2026-05-21)

Title: **Transfer Balance**

| Field | Type |
|---|---|
| Transfer money from | dropdown (source account) |
| Transfer money to | dropdown (destination account) |
| Current Balance | read-only — shows balance of source |
| Date | date picker (default today) |
| Enter Amount | ₹ input |
| Add Remarks | expandable link |

Use case: cash from till → deposit into bank account; transfer between
two bank accounts; etc.

### Money account ledger model — schema design

We use **the same ledger pattern as parties**, but for money accounts.

```
money_account_entries
  id
  business_id
  money_account_id
  entry_date                    -- nullable for opening_balance
  voucher_type                  -- enum: opening_balance | manual_adjustment |
                                --   transfer_in | transfer_out |
                                --   payment_in | payment_out | bank_charges | ...
  debit_amount, credit_amount   -- same convention as party ledger
  party_id                      -- nullable; set when this is the cash-side of a payment
  doc_id                        -- nullable; the invoice/bill if applicable
  transfer_pair_id              -- nullable; matches the other leg of a transfer
  remarks
```

**Operation mapping:**

| Action | Effect |
|---|---|
| Add money_account with opening balance | 1 entry, `voucher_type=opening_balance`, debit=balance (deposits) |
| Adjust Balance (+ Add Money ₹X) | 1 entry, `voucher_type=manual_adjustment`, debit=₹X |
| Adjust Balance (- Reduce Money ₹X) | 1 entry, `voucher_type=manual_adjustment`, credit=₹X |
| Transfer ₹X from A → B | 2 entries with shared `transfer_pair_id`: credit ₹X on A, debit ₹X on B |
| Sale Invoice paid ₹X cash | 1 entry on money_account (debit ₹X) + 1 entry on party ledger (credit ₹X, balance now closer to 0) |
| Purchase Bill paid ₹X bank transfer | 1 entry on money_account (credit ₹X) + 1 entry on party ledger (debit ₹X, balance closer to 0) |

### Sidebar — main app nav (additions discovered 2026-05-21)

I missed some items in the initial sidebar capture. Full list:

```
GENERAL
  Dashboard
  Parties
    All Parties · SharedLedger [New]
  Items
  Sales
  Purchases
  Reports

ACCOUNTING SOLUTIONS
  Cash & Bank
  E-Invoicing
  Automated Bills    (recurring billing? V2+ for AstraBill)
  Expenses           (non-purchase outgoings: rent, salary, utilities)
  POS Billing        (separate fast-entry counter mode — V2 for AstraBill)

BUSINESS TOOLS
  Staff Attendance & Payroll   (NEW — entire HR module — V3+ for AstraBill, way out of scope)
  (more — "Scroll for more options")

(footer)
  Settings
```

V1 vs V2 scope from this batch:

| Sidebar item | V1? |
|---|---|
| Cash & Bank | ✅ V1 — foundational |
| E-Invoicing | ❌ V2 — only required ≥₹5cr turnover |
| Automated Bills (recurring) | ❌ V2 — convenience feature |
| Expenses | 🟡 V1.5 — needed for ITC tracking eventually; defer to right after V1 launch |
| POS Billing | ❌ V2 — alternate UX, foundation can ship without it |
| Staff Attendance & Payroll | ❌ V3+ — full HR module, completely separate domain |

---

## Items model (CONFIRMED 2026-05-21)

### Items list page (`/app/home/items`)

Sidebar nav reveals sub-items under Items:
- **Inventory** (the items list — default)
- **Godown (Warehouse)** — multi-warehouse support (V3+ for AstraBill, defer)

Page header CTAs: **Manage Offer · Reports · Settings ⚙ · Keyboard shortcut**

Top banner (dismissible): "Launch Offers on Your Items" — promotional offers/discount campaigns feature. V2+.

Stats tiles: **Stock Value** · **Low Stock** (count of items below threshold)

Toolbar:
- 🔍 **Search by IMEI No.** (input includes barcode-scanner icon) — IMEI search is for mobile-phone shops; otherwise this is generic SKU/barcode search
- **Search Categories** dropdown
- **Low Stock** filter chip
- **Bulk Actions** dropdown
- **Create Item** primary CTA

Bottom (empty state): **Bulk Add Items** with "Add Items with excel" CTA — Excel import.

### Create New Item modal

Left-nav tabs:
- **Basic Details** * (required tab)
- Advance Details:
  - **Stock Details** (Product) / **Other Details** (Service)
  - **Pricing Details**
  - **Party Wise Prices**
  - **Custom Fields**

#### Tab 1 — Basic Details (Product)

| Field | Type | Required |
|---|---|---|
| **Item Type** | radio: Product / Service | ✅ |
| Category | searchable dropdown (inline-create) | ❌ |
| **Item Name** | text | ✅ |
| Show Item in Online Store | toggle | ❌ (V3+ — online store feature) |
| **Sales Price** | ₹ input + "With Tax / Without Tax" dropdown | ❌ |
| GST Tax Rate(%) | dropdown (see options below) | ❌ |
| **Measuring Unit** | searchable dropdown from huge seeded list | ❌ default "Pieces(PCS)" |
| Opening Stock | number + PCS unit suffix | ❌ |

#### Tab 1 — Basic Details (Service)

When Item Type = Service, fields change:

| Field | Change vs Product |
|---|---|
| Item Name → **Service Name** | renamed |
| Opening Stock → **Service Code** | replaced (services don't have stock) |
| (Stock Details tab disappears, replaced with "Other Details") | |
| (No image upload, no low-stock warning) | |

#### Tab 2 — Stock Details (Product only)

| Field | Notes |
|---|---|
| Item Code | text + **Generate Barcode** link |
| HSN code | text + **Find HSN Code** link (lookup tool) |
| Measuring Unit | searchable dropdown |
| **+ Alternative Unit** | toggle/link — secondary unit for dual-unit billing (we already have this) |
| Opening Stock | number + unit |
| As of Date | date picker, default today |
| **Enable Low stock quantity warning** | toggle + info |
| Description | textarea |
| **Images** | "drag and drop 5 files, PNG/JPEG, ≤5MB each" |

#### Tab 3 — Pricing Details

| Field | Notes |
|---|---|
| **Sales Price** | ₹ + "With Tax / Without Tax" |
| **Purchase Price** | ₹ + "With Tax / Without Tax" — *tracks margin* |
| GST Tax Rate(%) | dropdown |
| **Discount on Sales Price** | % input — default markdown |

#### Tab 4 — Party Wise Prices

Empty state: "To enable Party Wise Prices and set custom prices for parties, please save the item first."

**Once saved, you can set different sales/purchase prices PER PARTY.** This is a real feature for wholesale vs retail price tiers, B2B contracts, etc.

#### Tab 5 — Custom Fields

Same pattern as Party Custom Fields — workspace-defined name-only fields.

### GST Tax Rate options (CONFIRMED from dropdown)

Standard Indian GST slabs:
- GST @ 0%
- GST @ 0.1%
- GST @ 0.25%
- GST @ 1.5%
- GST @ 3%
- GST @ 5%
- GST @ 12%
- **GST @ 18%** (most common)
- GST @ 28%
- **Exempted** (legally exempt from GST)
- **None** (no GST — for non-GST-registered businesses)

Dropdown also shows "Recently Used" at top for fast picking.

### Measuring Unit (CONFIRMED from dropdown)

Seeded list of 50+ units, format `"Display Name(SHORT_CODE)"`:
- Pieces(PCS), Aana(ANA), Accessories (ACS), Acre(AC), Adult(ADL), Ampoule(AMP), Bags(BAG), Box(BOX), Kilogram(KG), Litre(L), Metre(M), Square Foot(SQF), Tonne(T)...

**Users can ALSO add custom units** (saw "Aaaaaaaaaaaa(G NEX)" — likely user-test entry).

Pattern for AstraBill: seed a comprehensive `item_units` reference table + allow workspace-level custom additions.

### Item detail page (`/app/home/items/[id]`)

Same two-pane layout as Party detail (left rail + right content with tabs):

**Tabs:** Item Details · Stock Details · Party Wise Report · Party Wise Prices

**Item Details tab — General Details card:**
- Item Name, Item Code, Current Stock (with unit), Low Stock Quantity, Category, Stock Value (₹), Low Stock Warning (Enabled/Disabled), Item Description

**Item Details tab — Pricing Details card:**
- Sales Price (with "With Tax" label), Purchase Price, GST Tax Rate, HSN Code, Secondary Unit

**Top-right CTAs:** **Adjust Stock** · Edit · Delete · Keyboard shortcut

### Adjust Stock Quantity modal

| Field | Notes |
|---|---|
| Date | default today |
| Add or Reduce Stock | dropdown: Add (+) / Reduce (-) |
| Adjust quantity | number + unit |
| Remarks | textarea, optional |

Right panel: Item Name + Stock Calculation (Current Stock display).

Creates a new stock_movement row.

### Stock movements CSV (CONFIRMED columns)

```
Date, Txn Type, Qty, Unit, Closing Stock, Notes

Sample row:
21/05/2026, opening_stock, 150.0, PCS, 150.0, ""
```

`Txn Type` values observed: `opening_stock` (others presumably: `sale`, `purchase`, `manual_adjustment`, `sales_return`, `purchase_return`).

### Schema implication — items + stock + prices

```
items
  id, business_id
  type enum: product | service
  name *
  category_id (nullable, FK)
  code -- item_code or service_code; nullable
  hsn_sac_code -- HSN for products, SAC for services
  -- pricing
  sales_price, sales_price_includes_tax
  purchase_price, purchase_price_includes_tax
  gst_rate enum (0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, EXEMPTED, NONE)
  discount_on_sales_price (% nullable)
  -- units
  measuring_unit_code -- FK to item_units
  alternative_unit_code (nullable)
  -- stock (products only)
  opening_stock decimal nullable
  opening_stock_as_of_date date nullable
  enable_low_stock_warning bool
  low_stock_threshold decimal nullable
  -- presentation
  description text nullable
  images jsonb -- array of URLs, max 5
  show_in_online_store bool
  -- meta
  is_active, created_at, updated_at

item_categories
  id, business_id, name

item_units (seeded reference)
  code (PK e.g. "PCS"), display_name, is_system bool, business_id (nullable; null = system-seeded)

item_party_prices
  id, item_id, party_id
  sales_price (nullable, overrides default)
  purchase_price (nullable, overrides default)

stock_movements
  id, item_id, business_id
  txn_date
  txn_type enum: opening_stock | sale | purchase | manual_adjustment | sales_return | purchase_return | transfer_in | transfer_out
  qty (signed: + for inflow, - for outflow)
  closing_stock_after -- snapshot for performance
  related_doc_id (nullable -- the invoice/bill)
  related_party_id (nullable)
  notes
```

### V1 vs V2 scope for Items

| Feature | V1 | Notes |
|---|---|---|
| Item type Product/Service in one table | ✅ | Core |
| Basic fields (name, code, HSN, unit, GST, price) | ✅ | Core |
| Measuring unit seeded list (50+) | ✅ | Seed at migration |
| Custom units per workspace | 🟡 V1.5 | Easy to add later |
| Alternative unit (dual-unit billing) | ✅ | We already have this on invoices |
| Stock tracking + Adjust Stock | ✅ | Core for traders |
| Low-stock threshold + warning | 🟡 V1.5 | Threshold field in V1, alerts in V2 |
| Multiple images (5) | 🟡 V1.5 | 1 image V1, multi V2 |
| Party Wise Prices | 🟡 V1.5 | Schema in V1, UI in V2 |
| Custom Fields per item | 🟡 V1.5 | Schema in V1, UI in V2 |
| Show in Online Store toggle | ❌ V3+ | No online store yet |
| Generate Barcode | ❌ V2 | Nice-to-have |
| Find HSN Code lookup | ❌ V2 | Needs HSN database — defer |
| Bulk Excel import | ❌ V2 | Onboarding feature |
| Godown / multi-warehouse | ❌ V3+ | Big surface, defer hard |
| Offers / promotions on items | ❌ V3+ | Marketing feature |
| Purchase Price tracking (margin) | ✅ | Two-price model in schema |

---

## Sales doc family (CONFIRMED 2026-05-21)

### Sidebar — Sales sub-items

```
Sales
  Sales Invoices       (the main one — tax invoice)
  Quotation / Estimate
  Payment In
  Sales Return
  Credit Note
  Delivery Challan
  Proforma Invoice
```

**7 sub-types confirmed.** Schema-wise these all share a base shape — same party, same line items, same totals, same GST math — but differ by `doc_type` enum and a few specifics (Delivery Challan = no GST, Proforma = no doc-number for audit, Credit Note = signed-negative against another invoice).

**Sales Return vs Credit Note distinction:** Both exist as separate sidebar items. Likely:
- Sales Return = the *physical event* (goods returned, may or may not generate a financial doc)
- Credit Note = the *formal GST doc* acknowledging the return + financial reversal

Indian GST law treats Credit Notes as the canonical doc; Sales Return is myBillBook's UI wrapper. For AstraBill we can collapse these into one `credit_note` doc_type and skip the separate "Sales Return" surface in V1.

### Sales Invoices list page (`/app/home/vouchers?voucher_type=sales_invoice`)

Stats tiles: **Total Sales** · **Paid** · **Unpaid** · **Cancelled** (count + sum).

Toolbar: search + date range (default Last 365 Days) + Bulk Actions + **Create Sales Invoice** primary CTA.

Table columns: Date · Invoice Number · Party Name · Due In · Amount · Status.

### Create Sales Invoice form (`/app/home/vouchers/invoice?voucher_type=sales_invoice`)

#### Top section

| Field | Type | Default | Notes |
|---|---|---|---|
| **Bill To** | "+ Add Party" dashed-box → opens party picker | empty | Once selected, shows party name, address, phone |
| **Ship To** | Auto-filled from party's shipping address | same as Bill To | If party has multiple shipping addresses, would offer picker |
| **Sales Invoice No** | text input | "1" (auto-incremented) | User can override — supports custom formats |
| **Sales Invoice Date** | date picker | today | |
| **Payment Terms** | number + "days" suffix | from party's `credit_period_days` or business default 30 | Has X icon to remove entirely (then no due date) |
| **Due Date** | date picker (auto-computed) | date + payment_terms | |

**Top-right CTAs:** Settings (with red-dot notification badge) · Save & New · Save.

#### Party picker dropdown

- Search by name or number
- Columns: Party Name | Balance (with same `↓ green` / `↑ red` indicators)
- All parties (regardless of type) appear here — **a Supplier party CAN be billed on a Sales Invoice** (confirmed via Asmit appearing in list)
- **+ Create Party** at bottom — **inline party creation directly from invoice form** ✅

#### Line items table

Columns: **NO · ITEMS/SERVICES · HSN/SAC · QTY · PRICE/ITEM (₹) · DISCOUNT · TAX · AMOUNT (₹)**

Per line:
- Item picker (opens "Add Items to Bill" modal — see below)
- Below item name: "Enter Description (optional)" textarea
- HSN/SAC autofills from item if set
- QTY: number + unit suffix
- PRICE/ITEM: pre-tax price (back-calculated if item is stored "With Tax")
- DISCOUNT: TWO fields — % AND ₹ (auto-syncs between them)
- TAX: % shown + auto-computed ₹ in brackets below
- **AMOUNT: GST-inclusive line total** (matches our existing AstraBill convention — see [[invoice-amount-column-post-gst]])

Below the table:
- **+ Add Item** dashed-box CTA
- **Scan Barcode** button (right side — for barcode-driven entry)
- **Subtotal row** showing totals across columns

#### Add Items to Bill modal

Rich item picker:
- Search by: **Item / Serial no. / HSN code / SKU / Custom Field / Category** + barcode-scan icon
- Filter: Select Category dropdown
- **+ Create New Item** button (top right) — **inline item creation** ✅
- Table: Item Name · Item Code · Stock · Sales Price · Purchase Price · Quantity (with `+ Add` button)
- Multi-select with quantity setting
- Keyboard shortcuts visible: **Enter** (change qty) · **↑/↓** (navigate) · **[ESC]** (cancel) · **[F7]** (add to bill)
- Footer: "Show N Item(s) Selected"

This is sophisticated POS-style UX — adopt the keyboard-driven flow for AstraBill V1.

#### Bottom-left action links

- **+ Add Notes** — text area for customer-facing notes
- **Terms and Conditions** — defaulted with: *"1. Goods once sold will not be taken back or exchanged. 2. All disputes are subject to [ENTER_YOUR_CITY_NAME] jurisdiction only"* — removable via X icon, editable
- **+ Add New Account** — *purpose unclear; likely picker/creator for money_account where amount-received will land*
- **+ Add Payment QR** — generate a UPI payment QR to print on the invoice

#### Bottom-right TOTALS panel

| Line | Notes |
|---|---|
| + Add Additional Charges | freight, packaging, etc. — ₹0 default |
| **Taxable Amount** | sum of line taxables (post-discount) |
| **IGST@18 / CGST@9 + SGST@9** | auto-computed; switches based on business vs party state |
| + Add Discount | bill-level discount (separate from line discount) |
| Auto Round Off | toggle + `+ Add / − Reduce` direction + custom amount |
| **Total Amount** | bold final value |
| Mark as fully paid | checkbox — one-click "received in full" |
| **Amount Received** | ₹ input + payment-mode dropdown (default "Cash") |
| **Balance Amount** | green text, auto-computed (Total − Amount Received) |

Last section: **Authorized signatory for {Business Name}** + dashed "+ Add Signature" placeholder.

#### GST classification confirmed

When Bill To is Asmit (Punjab `03`) and business is Opryon Labs (Uttarakhand `05`) → form auto-applies **IGST @ 18%** (interstate). For same-state party, would apply CGST + SGST. We have this in `lib/gst.ts` already.

### Schema implications — sales documents

```
documents
  id, business_id
  doc_type enum: sales_invoice | estimate | delivery_challan | credit_note |
                 proforma_invoice | purchase_bill | purchase_order | debit_note
  doc_number      -- string, business-scoped unique per type + FY
  doc_date
  party_id
  ship_to_address_id (nullable — FK to party_shipping_addresses)

  payment_terms_days (nullable)
  due_date (nullable, derived)

  -- snapshot totals (persisted for immutability)
  subtotal_amount
  total_discount_amount
  total_taxable_amount
  total_tax_amount
  total_additional_charges
  round_off_amount
  grand_total

  -- payment tracking
  amount_received_at_creation  -- payment recorded inline (nullable)
  money_account_id (nullable)  -- if amount received, where it went
  payment_mode (nullable)

  -- presentation
  notes (text)
  terms_conditions (text)
  signature_url (nullable — override of business default)

  -- meta
  status enum: draft | unpaid | partial_paid | paid | cancelled
  created_at, updated_at, cancelled_at

document_line_items
  id, document_id
  line_no
  item_id (nullable -- can be free-text line)
  -- snapshots (so renaming/repricing item later doesn't mutate history)
  item_name_snapshot
  hsn_sac_code_snapshot
  unit_code_snapshot
  description (line-level)
  qty (decimal)
  price_per_unit (decimal)
  price_includes_tax bool
  discount_percent (nullable)
  discount_amount (nullable)
  gst_rate_snapshot
  taxable_amount
  tax_amount
  line_amount  -- GST-inclusive

document_additional_charges
  id, document_id
  label
  amount
  taxable bool
  gst_rate (nullable)
```

### V1 vs V2 scope for Sales

| Feature | V1 | Notes |
|---|---|---|
| Sales Invoice | ✅ | Core (we have this) |
| Estimate | ✅ | We have this |
| Delivery Challan | ✅ | We have this |
| Credit Note | ✅ V1 | Required for returns — new for AstraBill |
| Purchase Bill | ✅ V1 | Required for ITC — new |
| Debit Note | ✅ V1 | Mirror of credit note |
| Proforma Invoice | 🟡 V1.5 | Pre-invoice document; easy to add later |
| Sales Return separate from Credit Note | ❌ | Collapse into Credit Note |
| Quotation as separate from Estimate | ❌ | Same thing, just one |
| Payment In / Payment Out | ✅ V1 | Core |
| Inline Party create from invoice form | ✅ V1 | UX-critical |
| Inline Item create from add-items modal | ✅ V1 | UX-critical |
| Barcode scanner in line entry | 🟡 V1.5 | Real shops need this |
| Add Payment QR | ✅ V1 | Already partially via our UPI deep links |
| Mark as fully paid checkbox | ✅ V1 | UX shortcut |
| Auto Round Off toggle | ✅ V1 | We have this |
| Authorized signatory image on invoice | ✅ V1 | Business default + per-invoice override |
| Default T&C with editable placeholder | ✅ V1 | Already on our invoice template |
| Item picker with keyboard shortcuts (F7, ESC, arrows) | 🟡 V1.5 | Power-user feature |

### Saved Sales Invoice — rendered view (CONFIRMED 2026-05-21)

After Save, redirects to `/app/home/vouchers/view/{uuid}?voucher_type=sales_invoice&from_create=true`.

**Top action bar (above the rendered preview):**
- Download PDF (dropdown — template variants)
- Print PDF (dropdown)
- info icon, Share (WhatsApp / Email / Copy link)
- **Generate E-way Bill** — deferred V2 (movements ≥ ₹50k)
- **Generate e-Invoice** — deferred V2 (IRN/QR ≥ ₹5cr turnover)
- **Record Payment In** — primary CTA (purple) when status = Unpaid

**Side rail:** status pill (e.g. **Unpaid** red), Profit Details button (defer V2), Payment History accordion.

**Rendered invoice layout** (this test used Varanasi/ghats themed template):

Top band: Business logo · Business name · PAN No · Phone · Email · Address. Top right: **TAX INVOICE** + **ORIGINAL FOR RECIPIENT** (GST-mandated label pair).

Meta strip: `Invoice No · Invoice Date · Due Date` (Due = Date + payment_terms_days).

**Bill To block:** Party Name → full billing address → Mobile.

Line-item table (this template): `No · Items · Qty · Rate · Tax · Total`. Subtotal row sums Qty, Tax, Total. **Column visibility is a per-template setting** — HSN, Description, Discount columns exist in form data but the Varanasi theme omits them. Data is always captured; templates pick what to render.

Two-column footer:
- LEFT: Terms & Conditions block (rendered verbatim — `[ENTER_YOUR_CITY_NAME]` placeholder is NOT auto-substituted by myBillBook).
- RIGHT: Taxable Amount · IGST@18% · **Total Amount** · Received Amount.

**Total Amount (in words)** line — English number-to-words ("Eight Thousand Rupees"). **GST regulation requires this on tax invoices.**

**Bank Details block:** Name (account holder) · IFSC · Account No · Bank Name (with branch).

**Payment QR Code block:** QR image + payment-provider strip (PhonePe · GPay · Paytm · UPI logos as static brand assets) + "UPI ID: {vpa}" caption.

**Signature block (bottom right):** uploaded signature image + "Signature" label + business name subtitle. Source = Business Settings signature upload (not per-invoice override unless explicitly set).

#### Key findings locked from this render

1. **UPI QR is computed at render time, never uploaded.** User entered only the UPI ID (`6396591516@hdfc`) in their Cash & Bank account; myBillBook generates the QR from a `upi://pay?pa={vpa}&pn={biz}&am={total}&cu=INR` URI. **AstraBill must do the same — never store QR images.** This was the user's surprise observation in the screenshot batch.

2. **Signature is business-level by default**, with optional per-invoice override (the form's "+ Add Signature" placeholder).

3. **Default Due Date = Invoice Date + 30 days** confirmed (21/05/2026 → 20/06/2026). Source: party's `credit_period_days` else business default.

4. **Total in words is mandatory** on tax invoices per GST law. AstraBill needs an INR num-to-words helper, including paise suffix when non-integer ("Eight Thousand Rupees and Fifty Paise Only").

5. **GST classification verified end-to-end.** Uttarakhand (`05`) business + Punjab (`03`) party → **IGST @ 18%**. Matches our existing `lib/gst.ts`.

6. **Template determines column visibility, not the data layer.** HSN/SAC, Description, Discount columns are *settings*, not schema. AstraBill schema stores them always; render template chooses what to print.

7. **Terms placeholder rendered verbatim** — `[ENTER_YOUR_CITY_NAME]` printed literally on the PDF. **AstraBill should be smarter** — pre-fill the default T&C with the business's actual city when the business is set up (one less manual edit for the owner).

8. **`TAX INVOICE` + `ORIGINAL FOR RECIPIENT` labels are GST-mandated** for tax invoices. Plan for "Original for Recipient / Duplicate for Transporter / Triplicate for Supplier" variants on print — common Indian requirement.

### Record Payment In modal (CONFIRMED 2026-05-21)

Triggered by **Record Payment In** button on a saved unpaid/partial-paid invoice.

| Field | Type | Default | Notes |
|---|---|---|---|
| Amount Received | ₹ number | Invoice pending amount | Allows partial pay |
| Payment In Discount | ₹ number | 0 | **Settlement discount** (write-off), separate from invoice discount |
| Payment Date | date picker | today | |
| Payment Mode | dropdown | Cash | Cash / Bank / UPI / Card / Cheque (full list TBD) |
| Notes | textarea | empty | optional |

**Right-side live recalculation panel:**
- Invoice meta (No, Amount, Party, Due Date)
- Invoice Pending Amt (red) · Amount Received · Payment In Discount · **Balance Amount** (auto)

CTAs: Close · **Save**.

**Schema implication — Payment In/Out:**

```
payment_entries
  id, business_id
  entry_type        -- enum: payment_in | payment_out
  entry_date
  party_id
  money_account_id  -- where cash lands / leaves
  amount
  discount_amount   -- settlement write-off
  payment_mode
  notes
  created_at

payment_entry_allocations  -- 1 payment can settle multiple invoices
  id, payment_entry_id
  document_id
  allocated_amount

-- Two-leg ledger post per payment_entry:
--   1. party_id ledger leg (credit on payment_in / debit on payment_out)
--   2. money_account ledger leg (debit on receipt / credit on outflow)
-- Settlement discount = third write-off leg on party ledger
```

The **two-leg post** is what keeps per-party balance AND Cash & Bank balance in sync from one user action. Settlement discount is a third party-ledger CREDIT row (`voucher_type='settlement_discount'`) — moves no cash but clears receivable.

**V1 vs V2:**

| Feature | V1 | Notes |
|---|---|---|
| Record Payment modal on saved invoice | ✅ | Core |
| Payment In Discount (settlement write-off) | ✅ | Real receivables need this |
| Partial payments | ✅ | Already in `decision/payment-recording` |
| Two-leg ledger post (party + money_account) | ✅ | Required for accurate Cash & Bank |
| One payment settling multiple invoices | 🟡 V1.5 | myBillBook allocates via party's outstanding view |
| Payment Mode dropdown | ✅ | Cash/Bank/UPI/Card/Cheque subset OK for V1 |

---

## AstraBill decisions vs myBillBook (where we deviate)

**D1 — Multiple bank accounts per party:** ALLOW MULTIPLE.
Real businesses often have multiple operating bank accounts. Costs
nothing in schema (already a sub-table `party_bank_accounts`), gains
real flexibility. myBillBook's single-account limit is a UX
constraint we don't need to inherit.

**D2 — GSTIN uniqueness:** WARN BUT ALLOW (same UX as the mobile
duplicate warning).
- GSTIN being non-unique in myBillBook is unusual but probably
  intentional — they don't want to block users who genuinely have
  edge cases (e.g. a head office party + a branch office party
  sharing GSTIN at different addresses).
- AstraBill matches with a soft warning: *"A party with this GSTIN
  already exists. View | Create anyway"* — non-blocking, informed
  choice. Mirrors our Q7 (mobile) approach for consistency.

## Quick Invoice Settings modal (CONFIRMED 2026-05-21)

Accessed via the **Settings ⚙ (red-dot)** button at top-right of any Create-Doc form. The red dot is a notification badge for "new" toggles (currently Price History).

| Toggle | Default | Notes |
|---|---|---|
| **Invoice Prefix & Sequence Number** | OFF | Toggle ON to show two text fields: `Prefix` (e.g. `INV-`) + `Sequence Number` (e.g. `001`). A **live preview** ("Invoice Number: INV-001") shows the assembled format as you type. Per-doc-type configuration. |
| **Show Purchase Price while adding Items** | ON | Internal-only display: when adding items to a sales invoice, the picker reveals the item's purchase price beside sales price (margin awareness). Doesn't render on the PDF. **Owner-first UX.** |
| **Show Item Image on Invoice** | OFF | When ON, prints the item image (uploaded at item creation) on the rendered invoice. Description: *"This will apply to all vouchers except for Payment In and Payment Out."* |
| **Price History** `[NEW]` | OFF | Shows the last 5 sales/purchase prices of the selected item **for the selected party** during line entry. Massive UX win for repeat orders ("last time we sold this to Asmit at ₹350"). |

Below the toggles:
- **Choose Invoice Theme** dropdown — catalog picker. Observed value: `Luxury` (the Varanasi/ghats theme rendered earlier). Themes are pre-built catalog entries, not user-built.
- Promo card: **"Now customise Invoice with ease — Full Invoice Settings →"** deep-links to `/app/settings/invoice` for column visibility, custom headers, font, etc.

CTAs: Cancel · **Save**.

### Implications for AstraBill

| Setting | V1 | Notes |
|---|---|---|
| Invoice Prefix + Sequence (per-doc-type, per-FY) | ✅ | Already in our schema plan; surface via this same modal pattern |
| Show Purchase Price (margin in picker) | 🟡 V1.5 | Smart but not core; requires purchase-price tracking on items |
| Show Item Image on Invoice | ❌ V2 | Item images themselves are V2 |
| Price History (last 5 prices per party) | ❌ V2 | Needs item × party price aggregation; later |
| Choose Theme dropdown | ✅ V1 | Covered by `decision/invoice-design-system` (Phase 2C templates) |
| Red-dot notification on settings gear | 🟡 V1.5 | Generic feature-discovery pattern; defer |

**The modal pattern itself is right** — quick toggles inline + deep link to full settings page. AstraBill should adopt this exact UX shape.

---

## Purchase Invoice form (CONFIRMED 2026-05-21)

URL: `/app/home/vouchers/invoice?voucher_type=purchase_record`. Sidebar item: **Purchases → Purchase Invoices**.

**myBillBook calls it "Purchase Invoice" (not "Purchase Bill")** — better term for non-accountant users. AstraBill should adopt the same naming.

Sidebar Purchases sub-items:
- Purchase Invoices
- Payment Out
- Purchase Return
- Debit Note
- Purchase Orders

### Structural diff vs Sales Invoice

| Sales Invoice | Purchase Invoice | Notes |
|---|---|---|
| "Bill To" | **"Bill From"** | Party label flips — supplier instead of customer |
| Sales Inv No | Purchase Inv No | own counter |
| Sales Inv Date | Purchase Inv Date | own date |
| *(none)* | **Original Inv No.** | **NEW field — supplier's own invoice number. Critical for ITC reconciliation: GSTR-2/3B cross-references your purchases against the supplier's GSTR-1 by this number.** |
| Amount Received | **Amount Paid** | Cashflow direction flip |
| Payment-mode default Cash | Payment-mode default Cash | same dropdown |

Everything else (line items columns, HSN/SAC, qty, price, discount, tax, amount; subtotal row; + Add Notes; T&C; + Add Additional Charges; Taxable Amount; + Add Discount; Auto Round Off; Total Amount; Mark as fully paid; Balance Amount; Authorized signatory) is **identical** to Sales.

**Sloppy myBillBook UX:** the default T&C *"Goods once sold will not be taken back or exchanged"* is from the *seller's* perspective but appears on the purchase form too. **AstraBill should ship per-doc-type T&C defaults** — purchase form should default to a buyer-perspective string (or empty).

### "Upload using Phone" feature (orange CTA, top of form)

myBillBook lets the user click "Upload using Phone" and receive a QR/link to scan/snap a photo of the supplier's paper bill, which is then OCR'd into the form (vendor + amount + items extracted). Cool UX. **Defer to V2.**

### Schema implications — purchases

The existing `documents` table model already handles this — purchase docs are sibling rows with different `doc_type`. One **new column required**:

```
documents
  ...
  original_doc_number  -- supplier's invoice number (purchase docs only)
  original_doc_date    -- supplier's invoice date (nullable; may differ from receive date)
```

Both fields nullable; mandatory only when `doc_type IN (purchase_bill, debit_note)`. App-layer validation, not DB constraint.

### V1 vs V2 scope for Purchases

| Feature | V1 | Notes |
|---|---|---|
| Create Purchase Invoice (full form) | ✅ | Core for ITC |
| Original Inv No. + Date capture | ✅ | Required for GSTR-2 / 3B |
| Purchase Return / Debit Note | ✅ | Mirror of Credit Note |
| Payment Out flow | ✅ | Mirror of Payment In |
| Purchase Orders | 🟡 V1.5 | Optional pre-purchase document |
| Upload using Phone (OCR bill scan) | ❌ V2 | Cool but not core |
| Per-doc-type T&C defaults | ✅ | Improvement on myBillBook |

---

## Quotation / Estimate form (CONFIRMED 2026-05-21)

URL: `/app/home/vouchers/invoice?voucher_type=quotation`. Sidebar item: **Sales → Quotation / Estimate** (one menu, two interchangeable terms).

**User insight (2026-05-21):** *"quotation is also largely used hmmm"* — Quotations are heavily used in Indian B2B and wholesale workflows. Buyers commonly request a written quote before issuing a purchase order. **Not a V1.5 deferral candidate — must ship in V1.**

### Structural diff vs Sales Invoice

| Sales Invoice | Quotation | Notes |
|---|---|---|
| Sales Inv No / Date | **Quotation No / Date** | own counter |
| Payment Terms (X days) | **Valid For (X days)** | semantic flip — quote expires |
| Due Date | **Validity Date** | when the quote expires |
| Mark as fully paid | *(removed)* | no payment dimension |
| Amount Received / Balance | *(removed)* | no payment dimension |
| Bank Details + Signature on PDF | **same, still rendered** | Useful: "if you accept, here's where to pay" |

Everything else (Bill To, line items, T&C, totals up to Total Amount, signature) is identical.

### Convert-to-Invoice flow (inferred, needs test)

myBillBook almost certainly has a **"Convert to Invoice"** button on a saved Quotation that creates a new Sales Invoice with all the line items copied. This is standard across Tally, Vyapar, Zoho. AstraBill V1 must ship this.

### Schema implications — quotations

The `documents` table handles it as another `doc_type='estimate'` row. Two columns serve double-duty:
- `payment_terms_days` → reused as "valid for X days" for quotations
- `due_date` → reused as `validity_date` for quotations

No new schema. Just app-layer label flip based on `doc_type`.

Plus one optional FK for the convert flow:
```
documents
  ...
  source_doc_id  -- nullable; when a Sales Invoice is created from a Quotation, points back
```

### V1 vs V2 scope for Quotations

| Feature | V1 | Notes |
|---|---|---|
| Create Quotation (full form) | ✅ | Indian B2B norm |
| "Convert to Invoice" button on saved Quotation | ✅ | Critical UX — one-click conversion |
| Valid For / Validity Date semantics | ✅ | Just label flip |
| Auto-expire quotations past validity | 🟡 V1.5 | Show "Expired" badge based on date |
| Quotation status tracking (Sent / Accepted / Rejected) | 🟡 V1.5 | Useful for B2B sales pipeline |
| Convert Quotation → Purchase Order (we receive) | ❌ V2 | Inverse flow |

---

## What we still need to research (broader)

Research is **functionally complete** for V1 schema design. Optional follow-ups (don't block schema draft):

- [ ] **Convert Quotation → Invoice** button — confirm exists, see UX
- [ ] **Full Invoice Settings** page (`/app/settings/invoice`) — column visibility per-template
- [ ] **Credit Note / Debit Note** form — confirm 90% mirror of Sales/Purchase (assumed)
- [ ] **E-way Bill** generate flow — V2 only, low priority
- [ ] **Reports library** — what's in `/reports`, what's V1 vs V2
- [ ] **SharedLedger banner** — confirm V2 deferral
- [ ] **Account tab in Settings** (subscription/billing) — irrelevant to AstraBill schema

Status: **moving to schema draft.**

---

## Related pages

- [[competitor/mybillbook]] — positioning, marketing, threat assessment
- [[decision/full-ledger-pivot]] — why we're going from billing-loop → full books
- [[competitor/vyapar]] — second reference for the model
- [[competitor/zoho-books]] — accountant-leaning reference
