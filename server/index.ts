import express from "express";
import expressWs from "express-ws";
import { AtomData, AtomId, Message } from "../types";
import * as remote from "../types";

const app = express();

const ews = expressWs(app);

const listenerMap: Record<AtomId, AtomData> = {};
const latestData: Record<AtomId, any> = {};

ews.app.ws("/", (ws) => {
  console.log("connection", ws.url);

  ws.on("message", (data) => {
    const msg: Message = JSON.parse(data.toString("utf-8"));

    console.log("Got message:", data);

    const connectionListeners: Record<AtomId, string> = {};

    switch (msg.type) {
      case "listen-to": {
        listenerMap[msg.atomId] ??= {};
        const listener = (newData: any) => {
          const newMsg: Message = {
            type: "new-data",
            msgId: Math.random().toString().substring(2),
            atomId: msg.atomId,
            newData,
          };

          remote.send(ws, newMsg);

          ws.send(JSON.stringify(newMsg));
        };
        let id = Math.random().toString().substring(2);
        listenerMap[msg.atomId][id] = listener;
        connectionListeners[msg.atomId] = id;

        if (msg.atomId in latestData) listener(latestData[msg.atomId]);

        break;
      }
      case "leave": {
        delete listenerMap[msg.atomId][connectionListeners[msg.atomId]];
        break;
      }
      case "new-data": {
        latestData[msg.atomId] = msg.newData;
        for (const listener of Object.values(listenerMap[msg.atomId] ?? {})) {
          listener(msg.newData);
        }
        break;
      }
    }
  });
});

const PORT = 8080;
app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
