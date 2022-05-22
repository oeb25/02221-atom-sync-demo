import React, { useEffect, useState } from "react";
import {
  AtomEffect,
  atomFamily,
  RecoilRoot,
  selectorFamily,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
  waitForAll,
} from "recoil";
import * as remote from "../types";
import deepEqual from "deep-equal";

function synchronizeList<K extends string | string[], T>(
  atomId: K,
  opts: { setOnLeave?: (key: K) => T } = {}
): AtomEffect<T> {
  return ({ setSelf, onSet }) => {
    const ws = new WebSocket(`ws://${window.location.hostname}:8080`);
    ws.onopen = () => {
      remote.send(ws, {
        type: "listen-to",
        atomId: typeof atomId == "string" ? atomId : atomId.join("/"),
      });

      remote.receive(ws, (msg) => {
        if (msg.type == "new-data") {
          setSelf(msg.newData);
        }
      });
      onSet((newValue, oldValue, isReset) => {
        if (deepEqual(newValue, oldValue)) {
          return;
        }

        remote.send(ws, {
          type: "new-data",
          msgId: Math.random().toString().substring(2),
          atomId: typeof atomId == "string" ? atomId : atomId.join("/"),
          newData: newValue,
        });
      });
    };
  };
}

export const App = () => {
  const [channelId, setChannelId] = useState<ChannelId>("Channel A");

  return (
    <RecoilRoot>
      <div
        className="grid h-screen gap-4 border p-2"
        style={{
          gridTemplateColumns: "1fr auto",
          gridTemplateRows: "auto 1fr",
        }}
      >
        <div className="col-span-full">
          <ChannelBar channelId={channelId} onChange={setChannelId} />
        </div>
        <ChannelView channelId={channelId} />
      </div>
    </RecoilRoot>
  );
};

const choosenUsernameState = atomFamily<null | string, ChannelId>({
  key: "choosenUsername",
  default: null,
});

const usersInChannelState = atomFamily<string[], ChannelId>({
  key: "usersInChannel",
  default: [],
  effects: (k) => [synchronizeList(["usersInChannel", k])],
});
type UserState = {
  lastActive: number;
};
const userState = atomFamily<UserState, [ChannelId, string]>({
  key: "user",
  default: {
    lastActive: Date.now(),
  },
  effects: ([cid, uid]) => [
    synchronizeList<[string, ChannelId, string], UserState>(["user", cid, uid]),
  ],
});

const ChannelView = ({ channelId }: { channelId: ChannelId }) => {
  const [userName, setUserName] = useRecoilState(
    choosenUsernameState(channelId)
  );
  const [_users, setUsers] = useRecoilState(usersInChannelState(channelId));

  if (!userName)
    return (
      <div className="grid min-h-0 place-items-center">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const input = (e.target as HTMLFormElement)
              .username as HTMLInputElement | void;

            if (!(input && input.value.trim())) return;
            setUserName(input.value);
            setUsers((us) =>
              us.includes(input.value) ? us : [input.value, ...us]
            );
          }}
        >
          <p className="italic text-gray-700">Choose a username:</p>
          <input className="rounded border px-2 py-1" name="username" />
          <button
            className="rounded border bg-blue-400 p-2 text-white"
            type="submit"
          >
            Join channel
          </button>
        </form>
      </div>
    );

  return (
    <>
      <ChannelChats channelId={channelId} />
      <Users channelId={channelId} userName={userName} />
    </>
  );
};

const ChannelChats = ({ channelId }: { channelId: ChannelId }) => {
  const chats = useRecoilValue(channelChatsState(channelId));

  return (
    <div className="grid grid-flow-col gap-4 overflow-hidden">
      {chats.map((chatId) => (
        <Chat
          key={chatId}
          channelId={channelId}
          chatId={`${channelId}/${chatId}`}
        />
      ))}
    </div>
  );
};

type Message = {
  author: string;
  content: string;
  timestamp: Date;
};

type ChannelId = string;
type ChatId = string;

const messagesState = atomFamily<Message[], ChatId>({
  key: "Messages",
  default: [],
  effects: (chatId) => [synchronizeList(["Messages", chatId])],
});

const channelChatsState = atomFamily<ChatId[], ChannelId>({
  key: "channelChats",
  default: ["General Chat"],
  effects: (channelId) => [synchronizeList(["channelChats", channelId])],
});

const ChannelBar = ({
  channelId,
  onChange,
}: {
  channelId: ChannelId;
  onChange: (v: ChannelId) => void;
}) => (
  <div className="space-x-2 text-center text-2xl">
    <select
      value={channelId}
      className="rounded border-none text-center text-2xl"
      onChange={(e) => onChange(e.target.value)}
    >
      {["Channel A", "Channel B", "Channel C"].map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  </div>
);

const usePeriodicRerender = (ms: number) => {
  const [_, update] = useState(0);
  useEffect(() => {
    const i = setInterval(() => update(Math.random()), ms);
    return () => window.clearInterval(i);
  }, [ms]);
};

const AWAY_TIME = 10000;
const isActive = (u: UserState) => u.lastActive > Date.now() - AWAY_TIME;

const useActiveUsers = ({ channelId }: { channelId: ChannelId }) => {
  usePeriodicRerender(1000);

  const users = useRecoilValue(userStatesInChannelState(channelId));
  return users.filter((u) => isActive(u[1]));
};
const useInactiveUsers = ({ channelId }: { channelId: ChannelId }) => {
  usePeriodicRerender(1000);

  const users = useRecoilValue(userStatesInChannelState(channelId));
  return users.filter((u) => !isActive(u[1]));
};

const Chat = ({
  channelId,
  chatId,
}: {
  channelId: ChannelId;
  chatId: ChatId;
}) => {
  // const [chatId, setChatId] = useState(c);
  const [messages, setMessages] = useRecoilState(messagesState(chatId));
  const activeUsers = useActiveUsers({ channelId });

  const sendMessage = (author: string, content: string) =>
    setMessages((msgs) => [
      ...msgs,
      { author, content, timestamp: new Date() },
    ]);

  return (
    <div
      className="grid min-h-0 gap-2"
      style={{ gridTemplateRows: "auto 1fr auto" }}
    >
      <Heading2>
        <RoundBadge className="bg-green-300 text-sm text-gray-700">
          {activeUsers.length}
        </RoundBadge>
        <span className="capitalize">{chatId.split("/").reverse()[0]}</span>
        {/* <input onChange={(e) => setChatId(e.target.value)} value={chatId} /> */}
      </Heading2>

      <ChatMessages>
        {messages.map((msg, i) => (
          <ChatMessage key={i} channelId={channelId} author={msg.author}>
            {msg.content}
          </ChatMessage>
        ))}
      </ChatMessages>

      <ChatInput channelId={channelId} onSendMessage={sendMessage} />
    </div>
  );
};
const RoundBadge = ({
  className,
  children,
}: {
  className: string;
  children?: React.ReactNode | React.ReactNode[];
}) => (
  <div
    className={`grid aspect-1 w-[2em] place-items-center rounded-full font-bold not-italic ${className}`}
  >
    {children}
  </div>
);
const ChatInput = (props: {
  channelId: string;
  onSendMessage: (author: string, content: string) => void;
}) => {
  const userName = useRecoilValue(choosenUsernameState(props.channelId));
  const [content, setContent] = useState("");

  return (
    <form
      className="grid h-16 gap-2"
      style={{ gridTemplateColumns: "1fr auto" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (content.trim() == "") return;
        props.onSendMessage(userName!, content);
        setContent("");
      }}
    >
      <div className="grid rounded-lg bg-gray-200 focus-within:ring">
        <input
          className="bg-transparent p-4 focus:outline-none"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      <button
        className="aspect-1 w-16 rounded-full bg-gray-200"
        type="submit"
      />
    </form>
  );
};
const ChatMessages = ({
  children,
}: {
  children?: React.ReactNode | React.ReactNode[];
}) => (
  <div className="grid min-h-0 items-end overflow-auto rounded-lg bg-gray-200 p-4">
    <div className="grid items-end gap-4">{children}</div>
  </div>
);
const ChatMessage = ({
  channelId,
  author,
  children,
}: {
  channelId: string;
  author: string;
  children?: React.ReactNode | React.ReactNode[];
}) => {
  const status: Status = isActive(
    useRecoilValue(userState([channelId, author]))
  )
    ? "online"
    : "offline";

  usePeriodicRerender(1000);

  return (
    <div className="grid">
      <div className="px-2 pb-1 text-sm">
        <UserLine status={status} name={author} />
      </div>
      <div className="rounded-md bg-gray-50 px-2 py-1">{children}</div>
    </div>
  );
};

const userStatesInChannelState = selectorFamily<
  [string, UserState][],
  ChannelId
>({
  key: "onlineUsers",
  get:
    (channelId) =>
    ({ get }) => {
      const users = get(usersInChannelState(channelId));
      return get(waitForAll(users.map((u) => userState([channelId, u])))).map(
        (a, i) => [users[i], a]
      );
    },
});

const Users = ({
  channelId,
  userName,
}: {
  channelId: ChannelId;
  userName: string;
}) => {
  const setUser = useSetRecoilState(userState([channelId, userName]));
  const activeUsers = useActiveUsers({ channelId });
  const inactiveUsers = useInactiveUsers({ channelId });

  useEffect(() => {
    const i = setInterval(() => {
      setUser({ lastActive: Date.now() });
    }, 1000);

    return () => window.clearInterval(i);
  }, [setUser, channelId, userName]);

  return (
    <div className="grid w-64 items-start gap-4 place-self-start">
      <UsersSection title="Online">
        {activeUsers.map((u) => (
          <UserLine key={u[0]} status="online" name={u[0]} />
        ))}
      </UsersSection>
      <UsersSection title="Offline">
        {inactiveUsers.map((u) => (
          <UserLine key={u[0]} status="offline" name={u[0]} />
        ))}
      </UsersSection>
    </div>
  );
};

const UsersSection = ({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode | React.ReactNode[];
}) => (
  <div className="grid gap-2">
    <Heading2>{title}</Heading2>
    <div>{children}</div>
  </div>
);

const Heading2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="flex items-center space-x-2 border-b py-1 text-xl font-medium italic">
    {children}
  </h2>
);

type Status = "online" | "offline";
const UserLine = ({ status, name }: { status: Status; name: string }) => (
  <div className="flex items-center space-x-2">
    <div
      className={`aspect-1 w-3 rounded-full border border-gray-500/25 ${
        status == "online" ? "bg-green-300" : "bg-red-300"
      }`}
    />
    <span className={`${status == "offline" ? "italic opacity-50" : ""}`}>
      {name}
    </span>
  </div>
);
