// Firebase settings for cloud sync. See FIREBASE.md for how to get them.
// Leave this as null and the app works on this device only, exactly as before.
//
// To turn sync on, replace null with the config Firebase shows you, for example:
// window.KEPOKKAW_FIREBASE = {
//   apiKey: "AIza...",
//   authDomain: "your-project.firebaseapp.com",
//   projectId: "your-project",
//   storageBucket: "your-project.firebasestorage.app",
//   messagingSenderId: "123456789",
//   appId: "1:123456789:web:abc123"
// };
// These values are not secret. The security rules in firestore.rules are what protect the data.
window.KEPOKKAW_FIREBASE = null;
