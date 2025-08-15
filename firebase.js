// firebase.js
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-service-account.json"); // generado en Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://supercomparardor-default-rtdb.europe-west1.firebasedatabase.app/" // reemplaza con tu URL real de Realtime Database
});

const db = admin.database();
module.exports = db;
