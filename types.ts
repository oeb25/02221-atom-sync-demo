export type AtomId = string;
export type AtomData = Record<string, (data: any) => void>;

export type Message =
  | { type: "listen-to"; atomId: AtomId }
  | { type: "leave"; msgId: string; atomId: AtomId }
  | { type: "new-data"; msgId: string; atomId: AtomId; newData: any };

type Ws = WebSocket | import("./server/node_modules/@types/ws").WebSocket;

export const send = (ws: Ws, msg: Message) => ws.send(JSON.stringify(msg));
export const receive = (ws: WebSocket, listener: (msg: Message) => void) =>
  ws.addEventListener("message", (data) => {
    const msg: Message = JSON.parse(data.data);
    listener(msg);
  });
