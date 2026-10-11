# Cloud sync with Firebase

Sync is optional. With `firebase-config.js` left as `null` the app keeps everything on one device, exactly as before. With a config filled in, every device signs in with its own account and sees the same orders, stock and expenses. Each device still works with no internet and uploads its changes when the connection comes back.

## Cost: free

Use the **Spark** plan, which is the default for a new Firebase project. It has no billing account and no card, so it cannot charge anything. If a daily limit were ever reached, sync would pause until the limits reset (about 3pm or 4pm Malaysia time, before the stall opens) and the cashier would keep selling offline in the meantime.

The free Firestore limits are 50,000 document reads, 20,000 writes and 20,000 deletes a day, plus 1 GiB of storage. One night of about 60 orders on two or three devices uses a few hundred writes and a few thousand reads at most. Orders are grouped one document per week, so opening the app reads roughly 52 small documents for each year of sales.

Do not upgrade the project to the Blaze plan. Nothing in this app needs it.

## Set up (about 15 minutes)

Firebase changes its screens from time to time, so a button label may differ slightly from what is written here.

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with the Google account that should own the shop data.
2. **Create a project.** Name it, for example `kepokkaw`. Google Analytics is not needed, so you can switch it off.
3. **Add a web app.** On the project overview page, tap the Web icon `</>`, give it a nickname, and leave Firebase Hosting unticked (the app stays on GitHub Pages). Firebase then shows a `firebaseConfig` block. Keep that page open.
4. **Turn on email sign in.** Open **Build > Authentication**, tap **Get started**, open **Sign-in method**, choose **Email/Password**, switch on the first toggle only, and save.
5. **Create the database.** Open **Build > Firestore Database** and tap **Create database**. Choose the location **asia-southeast1 (Singapore)**, the closest to Malaysia. This cannot be changed later. Start in **production mode**.
6. **Add the security rules.** In Firestore, open the **Rules** tab, delete what is there, paste the whole of [`firestore.rules`](firestore.rules) from this repo, and tap **Publish**. These rules are what stop staff accounts reading expenses or changing settings, so do not skip this step.
7. **Put the config in the app.** Edit `firebase-config.js` and replace `null` with the values from step 3:

   ```js
   window.KEPOKKAW_FIREBASE = {
     apiKey: "AIza...",
     authDomain: "kepokkaw.firebaseapp.com",
     projectId: "kepokkaw",
     storageBucket: "kepokkaw.firebasestorage.app",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```

   These values are meant to be public. The rules from step 6 protect the data.
8. **Bump `VERSION` in `sw.js`** (for example `kepokkaw-v12` to `kepokkaw-v13`) and push to GitHub. Devices pick up the change the next time the app is opened online, after tapping **Reload** on the banner.
9. **Create the owner account straight away.** Open the app on the owner's phone or the stall iPad. It shows **Set up the shop**. Enter the owner's name, email and a password. The first account created this way becomes the owner, so do this right after step 8.
   If that device already has sales saved, the app offers to upload them so every device can see them.
10. **Add staff.** As the owner, go to **Settings > Team**, enter each person's name, email and a password, and choose **Staff** or **Admin**. Give them the email and password. On their device they open the site, add it to the Home Screen, and sign in once with internet.

## Roles

| | Staff | Admin |
|---|---|---|
| Cashier, today's orders, stock levels | Yes | Yes |
| Cancel an order within 2 minutes | Yes | Yes |
| Void or delete any order | | Yes |
| Sales totals, dashboard, expenses, settings | | Yes |
| Add people and change roles | | Yes |

Setting someone to **Removed** in the Team list blocks them on every device straight away. The owner account cannot be removed or demoted by anyone.

## Good to know

* **Signing in needs internet once per device.** After that the device stays signed in and works offline.
* **Forgot password:** tap **Forgot password?** on the sign in screen to get a reset email.
* **Order numbers** still restart at 1 every trading day. If two devices complete an order in the very same moment, or both sell while offline, they can hand out the same number. The orders themselves are separate and both are kept.
* **Stock** counts from every device are added together, so two devices selling at once never overwrite each other. Two offline devices can sell the last pack twice; the stock then shows a negative number to correct with **Correct count**.
* **Backups** still work and are a good extra copy. **Restore** in sync mode replaces the cloud data on every device.
* **Turning sync off:** set `firebase-config.js` back to `null` and bump `VERSION`. Each device then goes back to its own local data from before sync was turned on, so take a backup first if you want to keep the cloud data.
* `firebase.js` is the Firebase SDK bundled into one file so the app opens offline. `firebase-entry.js` shows how it was built.
