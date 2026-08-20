/**
 * App-weiter Profil-Zustand (Singleton), damit das Profilbild überall sofort
 * aktuell ist – insbesondere im FAB der MainLayout. Ohne diesen geteilten
 * Zustand aktualisierte sich das FAB-Icon erst nach einem Neustart, weil es
 * nur beim Login-Wechsel neu lud, nicht beim Ändern des Bildes im Profil.
 *
 * Quelle der Wahrheit bleibt der Server (fetchProfile); dieser Store spiegelt
 * das Ergebnis reaktiv und wird von der Profilseite bei Änderungen mitgepflegt.
 */
import { ref } from "vue";
import { fetchProfile } from "../utils/profileService";
import { isLoggedIn } from "../utils/authService";

// Modul-Singletons (über alle Komponenten geteilt).
const avatar = ref(null);
const username = ref(null);

export function useProfile() {
  // Profil frisch vom Server holen (nur eingeloggt).
  const refreshProfile = async () => {
    if (!isLoggedIn()) {
      avatar.value = null;
      username.value = null;
      return null;
    }
    try {
      const profile = await fetchProfile();
      avatar.value = profile.avatar || null;
      username.value = profile.username || null;
      return profile;
    } catch {
      // Bei einem Fehlschlag den bisherigen Stand BEHALTEN. Vorher wurde hier
      // geleert, und weil es keinen zweiten Versuch gab, blieb das FAB nach
      // einem einzigen misslungenen Aufruf dauerhaft ohne Bild – bis man
      // einmal die Profilseite öffnete, die selbst neu lädt.
      return null;
    }
  };

  /**
   * Profil sicher laden, mit Wiederholung.
   *
   * Beim Start ist der Server nicht immer sofort erreichbar, und die App holt
   * gleichzeitig die Versionen (mehrere hundert Songs pro Version). Ein
   * einzelner Fehlversuch darf nicht dazu führen, dass das Profilbild bis zum
   * nächsten Start fehlt.
   */
  const ensureProfile = async (versuche = 3, abstandMs = 2000) => {
    for (let versuch = 0; versuch < versuche; versuch += 1) {
      if (!isLoggedIn()) return null;
      const profile = await refreshProfile();
      if (profile) return profile;
      if (versuch < versuche - 1) {
        await new Promise((fertig) =>
          setTimeout(fertig, abstandMs * (versuch + 1)),
        );
      }
    }
    return null;
  };

  // Von der Profilseite nach einer Änderung (Upload/Entfernen/Username) direkt
  // übernehmen, ohne erneuten Server-Roundtrip.
  const applyProfile = (profile) => {
    if (!profile) return;
    avatar.value = profile.avatar || null;
    username.value = profile.username || null;
  };

  const clearProfile = () => {
    avatar.value = null;
    username.value = null;
  };

  return {
    avatar,
    username,
    refreshProfile,
    ensureProfile,
    applyProfile,
    clearProfile,
  };
}
