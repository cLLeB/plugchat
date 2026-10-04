// Type definitions for the PlugChat headless client.

export class PlugChatError extends Error {
  /** HTTP status, or 0 for errors raised on the device. */
  status: number;
  /** Machine-readable reason, e.g. 'forbidden', 'rate_limited', 'rejected', 'suspended', 'no_key'. */
  code: string;
}

export interface Privacy {
  readReceipts: boolean;
  presence: boolean;
}

export interface User {
  id: string;
  name: string;
  /** A picture reference: "pc:<id>" for one uploaded here, or a URL from the host. Pass it to avatarUrl(). */
  avatar: string | null;
  /** The short line under their name. */
  about: string | null;
  lastSeen: number | null;
  online: boolean;
  /** Only present for yourself, for admins, or when the host set handleVisibility to 'all'. */
  handles?: Record<string, string>;
}

export interface Me extends User {
  privacy: Privacy;
  /** The reason this account is suspended, or null. */
  suspended: string | null;
  /** What this platform offers. A feature it switched off is `false` and is refused by the server. */
  features: Record<FeatureName, boolean> & { requireEncryption: boolean; calls: 'p2p' | 'external' | false; linkPreviews: boolean };
  /** Look and wording the platform set for every page. */
  ui: UiConfig;
}

export type FeatureName =
  | 'groups' | 'directory' | 'files' | 'voiceNotes' | 'reactions' | 'replies' | 'editing' | 'deleting' | 'forwarding' | 'mentions'
  | 'pins' | 'stars' | 'search' | 'polls' | 'location' | 'viewOnce' | 'disappearing' | 'scheduled' | 'stories' | 'calls'
  | 'encryption' | 'invites' | 'reports' | 'profiles' | 'typing' | 'presence' | 'readReceipts' | 'blocking' | 'export' | 'personalization';

/** Design tokens. Each becomes the CSS variable --pc-<name> (camelCase or kebab-case both work). */
export interface ThemeTokens {
  accent?: string; accentFg?: string; bg?: string; surface?: string; chat?: string; fg?: string; muted?: string; border?: string;
  bubble?: string; bubbleFg?: string; bubbleOut?: string; bubbleOutFg?: string; danger?: string; online?: string;
  radius?: string; bubbleRadius?: string; avatarRadius?: string; controlRadius?: string; borderWidth?: string;
  font?: string; fontSize?: string; sidebarWidth?: string; height?: string; pattern?: string;
  [token: string]: string | undefined;
}

export interface UiConfig {
  /** Tokens for the light look; shape, type and accent tokens also carry over to the dark look. */
  theme?: ThemeTokens;
  /** Tokens that apply only to the dark look. */
  dark?: ThemeTokens;
  /** "bubbles" (default) or "flat": no bubbles, everyone on one side, names and pictures on every block. */
  layout?: 'bubbles' | 'flat';
  density?: 'comfortable' | 'compact';
  /** Replace any interface text, keyed by the English original. */
  strings?: Record<string, string>;
  /** Replace icons by name with your own <svg> markup. */
  icons?: Record<string, string>;
  /** Extra CSS applied inside the chat. */
  css?: string;
  /** The quick reactions offered first. */
  reactions?: string[];
  /** Title above the chat list. */
  heading?: string;
  /** Your own privacy policy: an https:// address or a path on your site. Linked from the chat's Privacy page. */
  privacyUrl?: string;
}

export interface Device {
  deviceId: string;
  publicKey: string;
  createdAt: number;
  lastSeen: number;
}

export type Role = 'owner' | 'admin' | 'member';

export interface Member {
  userId: string;
  name: string;
  avatar: string | null;
  role: Role;
  lastReadSeq: number;
  /** Encrypted conversations only. */
  devices?: { deviceId: string; publicKey: string; keyed: boolean }[];
}

export interface Conversation {
  id: string;
  type: 'dm' | 'group';
  title: string | null;
  /** A group's picture, if its admins set one. */
  avatar: string | null;
  description: string | null;
  encrypted: boolean;
  /** Disappearing-message timer, or null when off. */
  ttlSeconds: number | null;
  /** Only owners and admins may post. */
  announce: boolean;
  muted: boolean;
  archived: boolean;
  pinned: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  lastSeq: number;
  unread: number;
  members: Member[];
  lastMessage: Message | null;
  /** Encrypted conversations only. */
  keyEpoch?: number;
  rotatePending?: boolean;
}

export interface FileInfo {
  fileId: string;
  name: string;
  mime: string;
  size: number;
}

export type MessageKind = 'text' | 'poll' | 'location' | 'custom' | 'call' | 'system';

export interface Message {
  id: string;
  conversationId: string;
  /** Position in the conversation; increases by one per message. */
  seq: number;
  senderId: string;
  kind: MessageKind;
  /** Readable text: the message, a poll's question, a location's label, a custom message's fallback. */
  text: string;
  /** What the server stores: plain text, JSON, or ciphertext. */
  body: string;
  file: FileInfo | null;
  replyTo: string | null;
  createdAt: number;
  editedAt: number | null;
  expiresAt: number | null;
  deleted: boolean;
  encrypted: boolean;
  /** True when this device has not (yet) been given the key for the message. */
  undecryptable: boolean;
  reactions: Record<string, string[]>;
  mentions: string[];
  forwarded: boolean;
  pinned: { at: number; by: string } | null;
  starred?: boolean;
  poll?: { question: string; options: string[]; multi: boolean };
  /** Option index -> user ids. */
  votes?: Record<number, string[]>;
  location?: { lat: number; lng: number; label?: string };
  custom?: { type: string; data: unknown };
  call?: { callId: string; video: boolean };
  viewOnce?: boolean;
  hasFile?: boolean;
  openedBy?: string[];
  consumed?: boolean;
}

export interface ScheduledMessage {
  id: string;
  conversationId: string;
  sendAt: number;
  text: string;
  /** Why it could not be sent, once its time came. */
  error: string | null;
}

export interface Story {
  id: string;
  userId: string;
  text: string;
  attachment: FileInfo | null;
  createdAt: number;
  expiresAt: number;
  seen: boolean;
  /** Present on your own stories only. */
  views?: { userId: string; at: number }[];
}

export interface CallJoin {
  /** A page to open for the call, when the host's vendor provides one. */
  url?: string;
  /** Whatever the host's call.join hook returned for this user, e.g. a vendor token. */
  data?: unknown;
}

export interface Invite {
  code: string;
  conversationId: string;
  createdBy: string;
  expiresAt: number | null;
  maxUses: number | null;
  uses: number;
}

export interface PlugChatOptions {
  /** Where PlugChat is mounted, e.g. https://chat.example.com/plugchat */
  url: string;
  /** A user token minted by the host backend. Prefer getToken, which can refresh. */
  token?: string;
  getToken?: () => Promise<string>;
  /** Set up this device for end-to-end encryption. Default true. */
  e2ee?: boolean;
  keyStore?: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> };
}

export interface PlugChatEvents {
  message: Message;
  'message.updated': Message;
  'message.deleted': { conversationId: string; messageId: string; expired?: boolean };
  reaction: { conversationId: string; messageId: string; reactions: Record<string, string[]> };
  star: { conversationId: string; messageId: string; starred: boolean };
  read: { conversationId: string; userId: string; seq: number };
  typing: { conversationId: string; userId: string };
  presence: { userId: string; online: boolean; lastSeen?: number };
  conversation: Conversation;
  'conversation.removed': { conversationId: string };
  connection: { state: 'connected' | 'disconnected'; reconnected?: boolean };
  'story.new': { userId: string; storyId: string };
  'story.deleted': { userId: string; storyId: string };
  'story.viewed': { userId: string; storyId: string };
  signal: { conversationId: string; from: string; data: Record<string, unknown> };
  'user.deleted': { userId: string };
}

export class PlugChat {
  constructor(options: PlugChatOptions);
  readonly url: string;
  /** The signed-in user, after connect(). */
  me: Me | null;
  /** Ids of contacts currently online. */
  online: Set<string>;

  connect(): Promise<Me>;
  close(): void;
  /** Subscribe to a realtime event. Returns a function that unsubscribes. */
  on<K extends keyof PlugChatEvents>(type: K, listener: (event: PlugChatEvents[K]) => void): () => void;

  // people
  searchUsers(query?: string): Promise<User[]>;
  user(id: string): Promise<User>;
  /** Exact lookup by email, phone, username or a custom handle kind. */
  findUser(handle: string, kind?: string): Promise<User>;
  block(userId: string): Promise<{ blocked: string[] }>;
  unblock(userId: string): Promise<{ blocked: string[] }>;
  blocked(): Promise<string[]>;
  setPrivacy(settings: Partial<Privacy>): Promise<Privacy>;
  /** Set your profile picture: a PNG, JPEG, WebP or GIF up to 600 KB (crop and shrink it first). */
  setAvatar(picture: Blob): Promise<Me>;
  removeAvatar(): Promise<Me>;
  setAbout(about: string): Promise<Me>;
  setGroupAvatar(conversationId: string, picture: Blob): Promise<Conversation>;
  removeGroupAvatar(conversationId: string): Promise<Conversation>;
  /** Turn an `avatar` value into a URL an <img> can show, or null when there is none. */
  avatarUrl(avatar: string | null): Promise<string | null>;
  exportMyData(): Promise<Record<string, unknown>>;
  /** Is there a key backup on the server, and does this device keep it current? */
  backupStatus(): Promise<{ exists: boolean; enabledHere: boolean }>;
  /** Seal this person's conversation keys under a passphrase and store them on the server. */
  enableBackup(passphrase: string): Promise<void>;
  /** Restore keys onto this device. Rejects with code 'wrong_passphrase'. Resolves with the number of conversations restored. */
  restoreBackup(passphrase: string): Promise<number>;
  disableBackup(): Promise<void>;
  devices(): Promise<Device[]>;
  removeDevice(deviceId: string): Promise<{ removed: true }>;

  // conversations
  conversations(): Promise<Conversation[]>;
  conversation(id: string): Promise<Conversation>;
  openDm(userId: string, options?: { encrypted?: boolean; ttlSeconds?: number }): Promise<Conversation>;
  openDmByHandle(handle: string, options?: { encrypted?: boolean; ttlSeconds?: number }): Promise<Conversation>;
  createGroup(group: { title: string; memberIds: string[]; encrypted?: boolean; ttlSeconds?: number }): Promise<Conversation>;
  update(conversationId: string, patch: { title?: string; description?: string; announce?: boolean; ttlSeconds?: number | null }): Promise<Conversation>;
  settings(conversationId: string, prefs: { muted?: boolean; archived?: boolean; pinned?: boolean }): Promise<Conversation>;
  addMembers(conversationId: string, userIds: string[]): Promise<Conversation>;
  removeMember(conversationId: string, userId: string): Promise<{ removed: true }>;
  setRole(conversationId: string, userId: string, role: Role): Promise<Conversation>;
  leave(conversationId: string): Promise<{ removed: true }>;
  createInvite(conversationId: string, options?: { ttlSeconds?: number; maxUses?: number }): Promise<Invite>;
  invites(conversationId: string): Promise<Invite[]>;
  revokeInvite(conversationId: string, code: string): Promise<{ revoked: true }>;
  invite(code: string): Promise<{ title: string; description: string | null; memberCount: number; alreadyMember: boolean }>;
  joinByInvite(code: string): Promise<Conversation>;
  safetyCode(conversationId: string): Promise<string>;
  rotateKey(conversationId: string): Promise<Conversation>;

  // messages
  messages(conversationId: string, range?: { before?: number; after?: number; around?: number; limit?: number }): Promise<Message[]>;
  /** Send a text message later; it goes out as you, through the platform's usual checks at that moment. */
  schedule(conversationId: string, content: { text: string; replyTo?: string; mentions?: string[] }, sendAt: Date | number): Promise<ScheduledMessage>;
  scheduled(): Promise<ScheduledMessage[]>;
  cancelScheduled(id: string): Promise<{ cancelled: true }>;
  /** A link's title and description from the platform's own fetcher, or null. */
  preview(url: string): Promise<{ url: string; title: string; description?: string; siteName?: string } | null>;
  message(messageId: string): Promise<Message>;
  /** Messages in a conversation that carry a photo or file, newest first. */
  attachments(conversationId: string): Promise<Message[]>;
  send(conversationId: string, content: { text?: string; file?: Blob; replyTo?: string; mentions?: string[]; viewOnce?: boolean }): Promise<Message>;
  sendPoll(conversationId: string, poll: { question: string; options: string[]; multi?: boolean }): Promise<Message>;
  sendLocation(conversationId: string, location: { lat: number; lng: number; label?: string }): Promise<Message>;
  sendCustom(conversationId: string, custom: { type: string; data?: unknown; text?: string }): Promise<Message>;
  forward(message: Message, toConversationId: string): Promise<Message>;
  edit(message: Message, text: string): Promise<Message>;
  remove(messageId: string): Promise<{ deleted: true }>;
  react(messageId: string, emoji: string): Promise<{ reactions: Record<string, string[]> }>;
  unreact(messageId: string, emoji: string): Promise<{ reactions: Record<string, string[]> }>;
  vote(messageId: string, options: number[]): Promise<Message>;
  pin(messageId: string): Promise<Message>;
  unpin(messageId: string): Promise<Message>;
  pins(conversationId: string): Promise<Message[]>;
  star(messageId: string): Promise<{ starred: boolean }>;
  unstar(messageId: string): Promise<{ starred: boolean }>;
  starred(): Promise<Message[]>;
  /** Open a view-once message. Resolves once; a second call rejects with status 410. */
  open(messageId: string): Promise<Message>;
  report(messageId: string, reason: string): Promise<{ reportId: string }>;
  search(query: string, options?: { conversationId?: string }): Promise<Message[]>;
  read(conversationId: string, seq: number): Promise<{ ok: true }>;
  typing(conversationId: string): void;
  download(message: Message): Promise<Blob>;

  // stories
  stories(): Promise<{ user: Pick<User, 'id' | 'name' | 'avatar'>; stories: Story[] }[]>;
  postStory(story: { text?: string; file?: Blob; ttlSeconds?: number }): Promise<Story>;
  viewStory(storyId: string): Promise<{ ok: true }>;
  deleteStory(storyId: string): Promise<{ deleted: true }>;
  storyFile(story: Story): Promise<Blob>;

  // calls
  startCall(conversationId: string, options?: { video?: boolean }): Promise<{ call: { id: string; video: boolean }; message: Message; join: CallJoin }>;
  joinCall(callId: string): Promise<{ call: { id: string; video: boolean }; join: CallJoin }>;
  iceServers(): Promise<RTCIceServer[]>;
  signal(conversationId: string, to: string, data: Record<string, unknown>): void;
}
