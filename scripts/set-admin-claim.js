#!/usr/bin/env node
/**
 * Jednorázový skript pro nastavení admin oprávnění (custom claim) uživateli Firebase Auth.
 *
 * Použití:
 *   node scripts/set-admin-claim.js <email-nebo-uid>       — přidat admin oprávnění
 *   node scripts/set-admin-claim.js <email-nebo-uid> --revoke — odebrat admin oprávnění
 *   node scripts/set-admin-claim.js --list                 — vypsat všechny uživatele a kdo je admin
 *
 * Vyžaduje service account klíč z Firebase Console
 * (⚙️ Project settings → Service accounts → Generate new private key).
 * Klíč NIKDY necommitujte do gitu — uložte ho lokálně, buď jako
 * ./serviceAccountKey.json v kořeni repa (je v .gitignore), nebo kamkoliv
 * jinam a nastavte proměnnou prostředí GOOGLE_APPLICATION_CREDENTIALS
 * na jeho cestu.
 *
 * Žádný běžící server není potřeba — jde o jednorázový administrativní úkon.
 */
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const identifier = process.argv[2];
const revoke = process.argv[3] === '--revoke';
const listMode = identifier === '--list';

if (!identifier) {
  console.error('Použití: node scripts/set-admin-claim.js <email-nebo-uid> [--revoke]');
  console.error('   nebo: node scripts/set-admin-claim.js --list');
  process.exit(1);
}

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '..', 'serviceAccountKey.json');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !fs.existsSync(keyPath)) {
  console.error(`Nenalezen service account klíč na "${keyPath}".`);
  console.error('');
  console.error('Stáhněte ho ve Firebase Console:');
  console.error('  ⚙️ Project settings → Service accounts → Generate new private key');
  console.error('a uložte jako serviceAccountKey.json do kořene projektu,');
  console.error('nebo nastavte proměnnou GOOGLE_APPLICATION_CREDENTIALS na jeho cestu.');
  process.exit(1);
}

admin.initializeApp({
  credential: process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? admin.credential.applicationDefault()
    : admin.credential.cert(require(keyPath)),
});

async function listAllUsers() {
  console.log('Email                                    | Admin | UID');
  console.log('-'.repeat(70));
  let nextPageToken;
  let total = 0;
  let adminCount = 0;
  do {
    const page = await admin.auth().listUsers(1000, nextPageToken);
    page.users.forEach((u) => {
      const isAdmin = u.customClaims?.admin === true;
      if (isAdmin) adminCount++;
      total++;
      console.log(`${(u.email || '(bez e-mailu)').padEnd(40)} | ${isAdmin ? ' ANO ' : '  ne '} | ${u.uid}`);
    });
    nextPageToken = page.pageToken;
  } while (nextPageToken);
  console.log('-'.repeat(70));
  console.log(`Celkem uživatelů: ${total}, z toho admin: ${adminCount}`);
}

async function main() {
  if (listMode) {
    await listAllUsers();
    return;
  }

  const user = identifier.includes('@')
    ? await admin.auth().getUserByEmail(identifier)
    : await admin.auth().getUser(identifier);

  await admin.auth().setCustomUserClaims(user.uid, revoke ? {} : { admin: true });

  if (revoke) {
    console.log(`Hotovo: uživateli ${user.email} (${user.uid}) bylo odebráno admin oprávnění.`);
  } else {
    console.log(`Hotovo: uživatel ${user.email} (${user.uid}) má nyní admin oprávnění.`);
  }
  console.log('Uživatel se musí odhlásit a znovu přihlásit, aby se změna projevila.');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Chyba:', err.message);
    process.exit(1);
  });
