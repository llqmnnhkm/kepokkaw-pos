# Kepokkaw Cashier

Offline cashier and sales tracker for one Kepokkaw keropok lekor stall. It runs as a home-screen web app on iPad or iPhone.

By default all sales, expenses and stock are stored on the device only and nothing is sent anywhere. Use **Settings → Back up everything** daily.

**Optional cloud sync:** with Firebase (free Spark plan) several devices share the same sales, each person signs in with their own account, and staff accounts are limited by server rules. See [FIREBASE.md](FIREBASE.md) to turn it on.

**Install:** open the site in Safari, tap Share, then **Add to Home Screen**. After the first open it works with no internet.

**Update:** change the files, bump `VERSION` in `sw.js`, push. Devices pick up the new version the next time the app is opened online. This includes changes to `firebase-config.js`.

Fonts: Barlow and Barlow Condensed, SIL Open Font License (see `fonts/OFL.txt`). Firebase JS SDK in `firebase.js`: Apache License 2.0.
