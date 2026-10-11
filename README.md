# Kepokkaw Cashier

Offline cashier and sales tracker for one Kepokkaw keropok lekor stall. It runs as a home-screen web app on iPad or iPhone.

By default all sales, expenses and stock are stored on the device only and nothing is sent anywhere. Use **Settings → Back up everything** daily.

**Optional cloud sync:** with Firebase (free Spark plan) several devices share the same sales, each person signs in with their own account, and staff accounts are limited by server rules. See [FIREBASE.md](FIREBASE.md) to turn it on.

**Install:** open the site in Safari, tap Share, then **Add to Home Screen**. After the first open it works with no internet.

**Update:** change the files, bump `VERSION` in `sw.js`, push. Devices pick up the new version the next time the app is opened online. This includes changes to `firebase-config.js`. A new file must also be added to the `FILES` list in `sw.js` (the tests check this).

## Where the code lives

There is no build step: GitHub Pages serves these files as they are.

| File | What it does |
|---|---|
| `index.html` | Page layout only |
| `css/app.css` | All styles, light and dark |
| `js/core.js` | Shared state, helpers, saving, sample data, screen renderer, theme, modal and toast |
| `js/cashier.js` | Cashier screen, payment (Cash or Online), cups, saving an order |
| `js/orders.js` | Orders screen, payment filter, order details, void, delete, Close day |
| `js/dashboard.js` | Dashboard, calendar heatmap, flavour trends |
| `js/expenses.js` | Expenses screen |
| `js/stock.js` | Stock screen |
| `js/settings.js` | Settings screen and the PIN lock screen |
| `js/reports.js` | WhatsApp reports, PDF, Excel, backup, restore, merge |
| `js/signin.js` | Cloud sign in, shop setup, team, sync status |
| `js/main.js` | Button and form handling, app start (loaded last) |
| `cloud.js` | Firestore sync |
| `sw.js` | Offline copy of the app |
| `pdf.js`, `xlsx.js` | Small PDF and Excel writers |
| `firebase.js` | Firebase SDK bundled for offline use (built from `firebase-entry.js`) |

The `js` files are plain scripts that share one scope and load in the order listed in `index.html`.

## Tests

Every pull request runs the tests on GitHub (the Tests check). A red cross means something would break, so don't merge until it's green.

To run them on a computer: `npm install`, then `npm test`. They cover the offline file list, a full day of selling in device only mode, cloud sync across two simulated devices (staff limits, payments, cups, void, delete, merge), and opening the app with no internet. `npm run test:rules` checks `firestore.rules` on the real Firestore emulator (needs Java): staff can't edit totals or old orders, the activity log can't be faked or erased, and staff can't see expenses. `npm run format` tidies the code layout.

Fonts: Barlow and Barlow Condensed, SIL Open Font License (see `fonts/OFL.txt`). Firebase JS SDK in `firebase.js`: Apache License 2.0.
