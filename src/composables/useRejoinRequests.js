import { Dialog, Notify } from "quasar";
import { getSocket, emitWithAck } from "../utils/socketService";

/**
 * Host-Seite der Rückkehr ins laufende Spiel: Ein Spieler mit eigenem Slot,
 * der App oder Tab geschlossen hatte, fragt per Raumcode an, und der Host
 * gibt in einem Dialog frei oder lehnt ab.
 *
 * Der Listener hängt modulweit am Socket und nicht an einer Komponente. Der
 * Host kann während eines laufenden Spiels zwischen Lobby und Spielansicht
 * wechseln, und eine Anfrage soll dabei weder verloren gehen noch doppelt
 * aufpoppen.
 */

// Socket-Instanz, an der die Listener gerade hängen. Nach `disconnect()`
// legt `connect()` eine neue an, dann muss neu registriert werden.
let registeredSocket = null;

// Offene Dialoge pro Benutzername. Der Server schickt dieselbe Anfrage nach
// einem Host-Wechsel erneut, dann bleibt es bei einem Dialog.
const openDialogs = new Map();

const answerRejoin = async (username, accept) => {
  try {
    await emitWithAck("host:answerRejoin", { username, accept });
  } catch (err) {
    // Meist hat der Anfragende inzwischen abgebrochen oder ein anderer Host
    // hat schon entschieden. Der Dialog ist ohnehin zu, ein kurzer Hinweis
    // genügt.
    Notify.create({ type: "info", message: err.message, timeout: 2500 });
  }
};

const onRejoinRequest = ({ username, slotName } = {}) => {
  if (!username || openDialogs.has(username)) return;

  // `hide()` ruft bei Quasar auch die onCancel-Handler auf. Schließt der
  // Server die Anfrage, darf daraus keine Ablehnung werden.
  const entry = { handle: null, closedByServer: false };
  entry.handle = Dialog.create({
    title: "Rückkehr ins Spiel",
    message: `${username} möchte als „${slotName || username}“ zurück ins laufende Spiel.`,
    ok: { label: "Freigeben", color: "primary" },
    cancel: { label: "Ablehnen", flat: true },
    persistent: true,
  })
    .onOk(() => answerRejoin(username, true))
    .onCancel(() => {
      if (!entry.closedByServer) answerRejoin(username, false);
    })
    .onDismiss(() => {
      if (openDialogs.get(username) === entry) openDialogs.delete(username);
    });
  openDialogs.set(username, entry);
};

const closeDialog = (username) => {
  const entry = openDialogs.get(username);
  if (!entry) return;
  entry.closedByServer = true;
  openDialogs.delete(username);
  entry.handle.hide();
};

const onRejoinRequestClosed = ({ username } = {}) => {
  if (username) closeDialog(username);
};

/**
 * Hängt die Listener für Rückkehr-Anfragen an den aktuellen Socket. Darf
 * beliebig oft aufgerufen werden (Lobby und Spielansicht beim Mounten), es
 * wird nur einmal pro Socket-Instanz registriert. Ohne Socket passiert
 * nichts, deshalb erst aufrufen, wenn die Verbindung angelegt ist.
 */
export function useRejoinRequests() {
  const socket = getSocket();
  if (!socket || socket === registeredSocket) return;

  if (registeredSocket) {
    registeredSocket.off("rejoinRequest", onRejoinRequest);
    registeredSocket.off("rejoinRequestClosed", onRejoinRequestClosed);
    // Die Anfragen gehörten zur alten Sitzung. Der Server kennt diesen
    // Socket nicht mehr, eine Antwort darüber liefe ins Leere.
    for (const username of [...openDialogs.keys()]) closeDialog(username);
  }

  socket.on("rejoinRequest", onRejoinRequest);
  socket.on("rejoinRequestClosed", onRejoinRequestClosed);
  registeredSocket = socket;
}
