# Design System

| | |
| --- | --- |
| Product | InvLab |
| Version | 0.1 (draft) |
| Date | 2026-10-12 |
| Related | [FRD.md](FRD.md), [ARCHITECTURE.md](ARCHITECTURE.md) |

## 1. Design intent

InvLab is a working tool used all day by people who count things: owners, warehouse managers and counter staff. The interface should feel calm, exact and trustworthy, like a well-kept ledger.

**The one memorable thing** is the way stock is shown. Quantities are set in tabular figures, each has a thin stock bar and a plain label (In stock, Low, Out of stock), so a manager can scan a table and read the state of a warehouse in seconds. Everything else stays quiet.

Principles:

1. **Numbers first.** Quantities and money are the content. They get alignment, tabular figures and consistent formatting.
2. **Structure carries meaning.** Borders, dividers and grouping exist only to show relationships. No decoration.
3. **Spend boldness once.** The stock bar and warehouse cards are the distinctive elements; the rest is disciplined.
4. **Fast for staff, rich for the owner.** The Staff interface has few controls and large targets; the Admin interface is denser.
5. **Plain words.** Sentence case, specific buttons, errors that say what to do next.

## 2. Colour

Colours are CSS variables, mapped into Tailwind. Components never use raw hex values.

### 2.1 Light theme (default)

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#F8F8F5` | Page background (warm ivory) |
| `--surface` | `#FFFFFF` | Cards, tables, dialogs |
| `--surface-2` | `#F1F1EC` | Table headers, hover rows, inset areas |
| `--border` | `#E3E1DA` | 1px borders and dividers |
| `--text` | `#202521` | Main text |
| `--text-muted` | `#5E6B63` | Secondary text and metadata |
| `--primary` | `#173D32` | Primary buttons, active navigation, key figures (deep forest green) |
| `--primary-fg` | `#FFFFFF` | Text on primary |
| `--sage` | `#D9E8DB` | Selected rows, soft highlights, chart fill |
| `--accent` | `#C77B55` | Icons, chart series and large text only (terracotta) |
| `--accent-text` | `#A85F3B` | Terracotta when used for small text |
| `--focus` | `#173D32` | Focus ring colour (2px, 2px offset) |

### 2.2 Semantic colours

| Meaning | Text and icon | Tint background | Use |
| --- | --- | --- | --- |
| Success | `#2F7D4F` | `#E6F2EA` | In stock, completed, received |
| Warning | `#9A5B00` | `#FBF0DC` | Low stock, in transit, variance |
| Error | `#B3261E` | `#FBE9E7` | Out of stock, failed, destructive actions |
| Info | `#1F5F8B` | `#E5EFF6` | Neutral notices, draft |

Colour is never the only signal: every status also has a label or icon.

### 2.3 Dark theme (v1.2)

Starting values; verify contrast before shipping.

| Token | Value |
| --- | --- |
| `--bg` | `#101512` |
| `--surface` | `#171D19` |
| `--surface-2` | `#1E2621` |
| `--border` | `#2B352F` |
| `--text` | `#E8ECE9` |
| `--text-muted` | `#9AA79F` |
| `--primary` | `#7FBF9C` (on dark, with `--primary-fg: #0E1A14`) |
| `--sage` | `#243A2F` |
| `--accent` / `--accent-text` | `#E0966F` |

The theme is chosen by a class on the root element, follows the system setting until the user chooses, and is applied by a small inline script before first paint so there is no flash.

### 2.4 Contrast rules

- Body text and small text: at least 4.5:1 against its background.
- Large text (24 px, or 18.66 px bold) and icons: at least 3:1.
- Terracotta (`--accent`) is not used for small text; use `--accent-text`.
- An automated axe check runs on the main pages in every theme.

## 3. Typography

| Role | Typeface | Notes |
| --- | --- | --- |
| Interface and content | Inter (variable); Geist is an acceptable alternative | One family keeps dense screens calm |
| Figures | Same family with `font-variant-numeric: tabular-nums` | Quantities, money, dates, IDs |

Fallback stack: `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.

| Style | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| Page title | 24 / 32 | 600 | One per page |
| Section heading | 18 / 28 | 600 | Card and section titles |
| Card title | 14 / 20 | 600 | Small headings inside cards |
| Body | 14 / 20 | 400 | Default |
| Table | 13 / 20 | 400 | Dense tables |
| Meta | 12 / 16 | 400 | Captions, helper text |
| Key figure | 28 / 32 | 600 | KPI numbers |

Rules: sentence case everywhere; no all-caps labels; no tracking changes; line length under 80 characters in running text; right-align numeric columns; indicate the unit in the column header, not in every cell.

## 4. Space, shape and depth

- Spacing uses a 4 px scale: 4, 8, 12, 16, 24, 32, 48.
- Radius: 6 px for inputs and buttons, 8 px for cards, dialogs and popovers, full for badges and avatars. Do not use one radius for everything.
- Depth comes from 1px borders. No resting shadows. Popovers and dialogs may use one soft shadow.
- No gradients, glows or decorative backgrounds.
- Table rows are 44 px (touch) or 40 px (dense, Admin and desktop).
- Page content width is capped at 1280 px; tables may scroll horizontally inside their own container.

## 5. Layout

### 5.1 App shell

```
┌────────────┬──────────────────────────────────────────────┐
│ InvLab     │  Page title                 [Warehouse ▾] [👤] │
│            ├──────────────────────────────────────────────┤
│ Dashboard  │                                              │
│ Sales      │   content                                    │
│ Stock      │                                              │
│ Transfers  │                                              │
│ Warehouses │                                              │
│ Users      │                                              │
│            │                                              │
│ Pune WH    │                                              │
└────────────┴──────────────────────────────────────────────┘
```

- Left sidebar, 240 px, collapsible to icons. Items are grouped (Operations, Catalogue, Administration) and filtered by role.
- Top bar: page title, warehouse selector (Admin only; Managers and Staff see their warehouse name instead), account menu with role badge.
- Tablet and phone: the sidebar becomes a drawer; the sale screen gets a bottom action bar with the total and Confirm.

### 5.2 Navigation by role

| Role | Items |
| --- | --- |
| Staff | Dashboard, New sale, My sales, Stock |
| Warehouse Manager | Dashboard, New sale, Sales, Stock, Ledger, Transfers, Products, Staff |
| Admin | Dashboard, Warehouses, Sales, Stock, Ledger, Transfers, Products, Categories, Users, Audit log |

### 5.3 Admin: Warehouses overview

```
┌ Warehouses ───────────────────────── [Search] [Status ▾] [New warehouse] ┐
│ Stock by warehouse (bar chart)       Sales, last 30 days (bar chart)     │
├──────────────────────────────────────────────────────────────────────────┤
│ Pune Warehouse  PUN01            ● Active                                │
│ 12 Mill Road, Pune 411001        Manager: Imran Shaikh · 98xxxxxx12      │
│ Staff 4   Products 58   Units 3,420   Low stock 6   Sales today ₹42,300  │
│ ▓▓▓▓▓▓▓▓░░ stock health                                   [Open ›]       │
├──────────────────────────────────────────────────────────────────────────┤
│ Mumbai Warehouse  MUM01 …                                                │
└──────────────────────────────────────────────────────────────────────────┘
```

Warehouse detail page tabs: Overview, Staff, Stock, Sales, Transfers, Ledger.

### 5.4 New sale (Staff, one-handed on a phone)

```
┌ New sale ─────────────────────────────┬ Summary ────────────┐
│ [ Search product by name or SKU     ] │ Steel Rack  2 × 1,200│
│                                       │ Padlock     1 × 1,050│
│ Results                               │ ─────────────────────│
│  Steel Rack  PUN-RK-01   12 in stock  │ Total       ₹3,450.00│
│  Padlock     PUN-PL-02    3 low       │ [ Confirm sale ]     │
└───────────────────────────────────────┴─────────────────────┘
```

On a phone the summary collapses into a bottom bar showing item count and total; tapping it opens the lines. The Confirm button is always reachable.

### 5.5 Page patterns

| Pattern | Used for | Structure |
| --- | --- | --- |
| List page | Products, sales, ledger, users | Page title, primary action at the right, filter bar, table, pagination |
| Detail page | Warehouse, product, sale, transfer | Title and status, summary cards, tabs |
| Form dialog | Create and edit | One column, labels above fields, actions at the bottom right |
| Confirm dialog | Destructive actions | States what will happen; button uses the action name |

## 6. Components

All live in `components/ui/` and cover every state listed.

| Component | States and notes |
| --- | --- |
| Button | Primary, secondary, ghost, destructive; hover, focus, disabled, loading (spinner, keeps width). Min height 36 px (44 px on touch layouts) |
| Input, Select, Combobox | Default, focus, error (message below), disabled; labels always visible |
| Quantity stepper | Minus, number input, plus; clamps to limits; keyboard arrows |
| Table | Sticky header, sortable columns, row hover, selected row (sage), empty and loading (skeleton rows), error with retry |
| Badge | Neutral, success, warning, error, info; always includes text |
| Stock indicator | Number (tabular), thin bar scaled to reorder level, label (In stock, Low, Out of stock) |
| Status chip | Transfer and sale statuses, with icon |
| Card | Surface, 1px border, 8 px radius |
| KPI card | Label, key figure, optional comparison; comparison only with enough history |
| Dialog and Drawer | Focus trap, Esc closes, returns focus to the trigger |
| Toast | Success and error; same verb as the action; auto-dismiss, pausable |
| Tabs | Underline indicator that slides between tabs |
| Page header | Title, description line, actions |
| Empty state | One sentence on what belongs here and one clear action |
| Skeleton | Matches final layout; subtle shimmer |
| Date range picker | Presets (today, 7, 30, 90 days) and custom range |
| Charts | Recharts reading CSS variables; axis labels, tooltips, empty message |

### 6.1 Stock indicator rules

| Condition | Label | Colour | Bar |
| --- | --- | --- | --- |
| Quantity above reorder level | In stock | Success | Filled in primary |
| Quantity at or below reorder level, above 0 | Low | Warning | Filled in warning |
| Quantity 0 | Out of stock | Error | Empty with an error outline |

## 7. Motion

Motion explains what changed. It does not decorate.

| Token | Value |
| --- | --- |
| `--dur-fast` | 150 ms (hover, focus, press) |
| `--dur-base` | 220 ms (dialogs, dropdowns, tabs) |
| `--dur-slow` | 400 ms (first chart draw only) |
| Easing | ease-out for entering, ease-in-out for moving |

Use motion for: dialog and drawer open and close, dropdowns, tab indicator, a row highlight (sage, fading) after a record is created, a brief colour flash on a quantity when it changes (green up, terracotta down), toasts, skeleton to content cross-fade, and one first-load chart draw.

Do not use motion for: staggered entrances on every section, hover lifts on every card, looping animations (except skeleton shimmer and spinners), parallax, or animated backgrounds.

`prefers-reduced-motion` is handled in one place: movement, count-ups and shimmer are turned off; simple fades or nothing remain. Nothing blocks input while animating, and animations never run on placeholder values.

## 8. Accessibility

- Meets WCAG 2.2 AA.
- Every function works with a keyboard. Visible focus ring on every interactive element.
- Targets are at least 44 by 44 px on touch layouts (sale screen especially).
- Form fields have visible labels and programmatic descriptions; errors are announced.
- Tables use proper headers; sortable columns announce their sort state.
- Dialogs trap focus and restore it; toasts use a polite live region.
- Status is shown by text or icon as well as colour.
- Charts have a text summary or a data table alternative.

## 9. Content and voice

- Sentence case. Plain verbs. No filler.
- Name things the way users do: "Receive stock", "Adjust stock", "Transfer", not "Inventory mutation".
- A button says what will happen: "Confirm sale", "Dispatch transfer", "Save changes". The toast uses the same verb: "Sale confirmed."
- Errors say what happened and what to do, and never apologise: "Only 4 units of Steel Rack are available. Reduce the quantity or receive more stock."
- Empty states invite an action: "No transfers yet. Create one to move stock to another warehouse."
- Currency is `₹1,25,000.00`; dates `12 Oct 2026, 3:11 pm`; quantities have no decimals.
- Avoid: ALL-CAPS labels, tracked-out eyebrows above headings, middle-dot strings joining metadata, arrows appended to buttons, numbered markers on content that is not a sequence.

## 10. Do and do not

| Do | Do not |
| --- | --- |
| Use tokens for every colour, size and duration | Hard-code hex values or pixel sizes in components |
| Right-align numbers and use tabular figures | Centre numeric columns |
| Show status with a label and colour | Rely on colour alone |
| Keep Staff screens minimal | Show Staff controls they cannot use |
| Use one icon set (lucide) at consistent sizes | Mix icon styles or use emoji as icons |
| Write specific button labels | Use "Submit" or "OK" |

## 11. Implementation notes

- Tokens live in `styles/tokens.css` as CSS variables and are mapped in `tailwind.config`. Dark values override them under the theme class.
- Components follow the shadcn/ui pattern on Radix primitives and are copied into the repo so they can be adjusted.
- Charts read colours with `getComputedStyle` or CSS variables so they follow the theme.
- Receipts and printed pages always use the light theme.
- Any new component must document its states here or in its Storybook-style example page before it is merged.
