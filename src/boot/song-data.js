import { boot } from "quasar/wrappers";
import { initSongData } from "../utils/songDataProvider";

/**
 * Befüllt den Song-Daten-Store VOR dem App-Mount. Quasar wartet async Boot-Files
 * ab, damit alle Komponenten/Composables die Editionen, Link-Listen und Metadaten
 * synchron aus dem Store lesen können (Web: Bundle, Electron: Songs-Ordner).
 */
export default boot(async () => {
  await initSongData();
});
