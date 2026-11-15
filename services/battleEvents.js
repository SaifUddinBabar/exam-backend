// In-process notifications for battle changes. The SSE stream (GET /api/battles/:id/stream)
// pushes immediately when a change happens in this process. With several server
// instances, changes made on another instance reach the stream on its next tick
// (every few seconds), so nothing depends on this emitter for correctness.
import { EventEmitter } from "events";

export const battleEvents = new EventEmitter();
battleEvents.setMaxListeners(0);

export const notifyBattle = (id) => {
  if (id) battleEvents.emit(String(id));
};
