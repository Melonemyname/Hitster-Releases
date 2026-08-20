/**
 * Läuft die App als Desktop-App (Electron) statt im Browser?
 *
 * In der Desktop-App gibt es keine „gleiche Herkunft" (file://) – dort muss für
 * den Online-Modus eine Server-Adresse gesetzt sein. Im Browser läuft alles über
 * die aufgerufene Adresse.
 */
export function isDesktopApp() {
  return (
    process.env.MODE === "electron" ||
    (typeof window !== "undefined" && window.location.protocol === "file:")
  );
}
