/**
 * Katalog der mitgelieferten Song-Versionen (Editionen).
 *
 * Diese Liste ist Teil des Projekts (gebündelt). „Standardversionen" (custom:false)
 * können nur ausgeblendet, nicht gelöscht werden. „Selbst hinzugefügte" Versionen
 * (custom:true) dürfen gelöscht werden – beides wirkt rein gerätelokal.
 *
 * Später (siehe BACKLOG): eine Importierfunktion, mit der eigene Versionen
 * (custom:true) erstellt werden – die wären dann gerätelokal und löschbar.
 *
 * Die Icons werden als Vite-Assets importiert (aufgelöste URLs), damit sie in Web
 * UND Desktop-App (Electron, file://) funktionieren.
 */

import iconCustom from "../assets/versions/custom.png";
import iconRock from "../assets/versions/rock.png";
import iconStandart from "../assets/versions/standart.png";
import iconCelebration from "../assets/versions/celebration.png";
import iconSoundtrack from "../assets/versions/soundtrack.png";
import iconChristmas from "../assets/versions/christmas.png";
import iconBingo from "../assets/versions/bingo.png";
import iconBayern from "../assets/versions/bayern.png";
import iconPlatinum from "../assets/versions/platinum.png";
import iconBattle from "../assets/versions/battle-generations.png";
import iconGuilty from "../assets/versions/guilty.png";
import iconSummer from "../assets/versions/summer.png";
import iconHipHop from "../assets/versions/hiphop.png";
import iconSchlager from "../assets/versions/schlager.png";
import iconWacken from "../assets/versions/wacken.png";

// Auswählbare Cover (für eigene Versionen) + Auflösung gespeicherter Preset-Keys.
export const VERSION_ICONS = {
  custom: iconCustom,
  rock: iconRock,
  standart: iconStandart,
  celebration: iconCelebration,
  soundtrack: iconSoundtrack,
  christmas: iconChristmas,
  bingo: iconBingo,
  bayern: iconBayern,
  platinum: iconPlatinum,
  battle: iconBattle,
  guilty: iconGuilty,
  summer: iconSummer,
  hiphop: iconHipHop,
  schlager: iconSchlager,
  wacken: iconWacken,
};

// Löst ein gespeichertes Cover ({kind,ref}) in eine anzeigbare URL auf.
// Dieselben Regeln prüft der Server. Cover kommen auch aus geteilten Versionen
// anderer Spieler; was nicht passt, erscheint als „custom".
const COVER_PRESET_REF = /^[a-z0-9_-]{1,40}$/;
const COVER_UPLOAD_REF = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const COVER_UPLOAD_MAX = 400000;

export function resolveCover(cover) {
  if (!cover || typeof cover.ref !== "string") return VERSION_ICONS.custom;
  if (cover.kind === "upload") {
    // Nur echte Bild-Data-URLs, keine beliebigen Adressen.
    return cover.ref.length <= COVER_UPLOAD_MAX && COVER_UPLOAD_REF.test(cover.ref)
      ? cover.ref
      : VERSION_ICONS.custom;
  }
  // Nur eigene Schlüssel, sonst lieferte etwa "constructor" etwas aus dem Prototyp.
  if (
    cover.kind === "preset" &&
    COVER_PRESET_REF.test(cover.ref) &&
    Object.hasOwn(VERSION_ICONS, cover.ref)
  ) {
    return VERSION_ICONS[cover.ref];
  }
  return VERSION_ICONS.custom;
}

// Bild einer Version aus den Raum-Metadaten des Hosts. Neuere Clients
// schicken das Cover-Objekt mit, das hier lokal aufgelöst wird; ältere nur die
// aufgelöste Adresse (`icon`), die der Server auf Data-URLs und relative Pfade
// beschränkt.
export function metaIcon(meta) {
  if (!meta) return null;
  if (meta.cover) return resolveCover(meta.cover);
  return meta.icon || null;
}

// Hinweis: Die früher hier definierte `STANDARD_VERSIONS`-Liste kommt jetzt aus
// dem Editions-Manifest (`src/assets/songs/editions.json`) über den
// `songDataProvider` (`getStandardVersions()`). So sind Editionen an einer
// Stelle gepflegt und in der Desktop-App aus dem Songs-Ordner überschreibbar.
export { getStandardVersions } from "./songDataProvider";
