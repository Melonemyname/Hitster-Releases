/**
 * Passwort-Initialisierungsskript
 * Verwendung: node init-passwords.js <username> <passwort>
 * Beispiel:   node init-passwords.js host MeinPasswort123
 */

const bcrypt = require('bcryptjs')
const fs = require('fs')
const { dataPath } = require('./dataDir')

const USERS_FILE = dataPath('users.json')

async function main () {
  const [,, username, password] = process.argv

  if (!username || !password) {
    console.log('Verwendung: node init-passwords.js <username> <passwort>')
    console.log('Beispiel:   node init-passwords.js host MeinPasswort123')
    console.log('')
    console.log('Verfügbare Benutzer in users.json:')
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
    users.forEach(u => {
      const status = u.passwordHash ? '✓ Passwort gesetzt' : '✗ Kein Passwort'
      console.log(`  ${u.username} – ${status}`)
    })
    process.exit(0)
  }

  let users
  try {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
  } catch {
    console.error('Fehler: users.json konnte nicht gelesen werden.')
    process.exit(1)
  }

  const userIndex = users.findIndex(u => u.username === username)
  if (userIndex === -1) {
    console.error(`Fehler: Benutzer "${username}" nicht gefunden.`)
    console.log('Bekannte Benutzer:', users.map(u => u.username).join(', '))
    process.exit(1)
  }

  const hash = await bcrypt.hash(password, 10)
  users[userIndex].passwordHash = hash

  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))
  console.log(`✓ Passwort für "${username}" erfolgreich gesetzt.`)
}

main().catch(err => {
  console.error('Fehler:', err.message)
  process.exit(1)
})
