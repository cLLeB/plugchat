// Type definitions for the PlugChat server.
import type { IncomingMessage, ServerResponse, Server } from 'node:http';
import type { Readable } from 'node:stream';

export interface TokenClaims {
  /** Your stable id for the user. */
  sub: string;
  name?: string;
  avatar?: string;
  email?: string;
  phone?: string;
  username?: string;
  /** Custom identifiers, e.g. { member_no: 'AA-0042' }. */
  handles?: Record<string, string>;
  /** Server-to-server token. Never give one to a browser. */
  admin?: boolean;
}

export function signToken(claims: TokenClaims, secret: string, ttlSeconds?: number): string;
export function verifyToken(token: string, secret: string): TokenClaims & { exp: number; iat?: number };
/** The value PlugChat puts in the x-plugchat-signature header of webhooks and hooks. */
export function signWebhook(rawBody: string, secret: string): string;

export interface Storage {
  put(id: string, data: Buffer): unknown | Promise<unknown>;
  stream(id: string): Readable | Promise<Readable>;
  remove(id: string): unknown | Promise<unknown>;
}
export function diskStorage(directory: string): Storage;

export interface Bus {
  publish(message: unknown): void;
  subscribe(listener: (message: any) => void): void;
  setPresence?(userId: string, online: boolean): void;
  isOnline?(userId: string): boolean;
  close?(): void;
}

export interface Verdict {
  /** false refuses the action; `reason` is shown to the user. */
  allow?: boolean;
  reason?: string;
}

export interface Hooks {
  'message.before'?(input: {
    message: { conversationId: string; senderId: string; kind: string; body: string; hasAttachment: boolean; mentions: string[]; viewOnce: boolean };
    conversation: { id: string; type: 'dm' | 'group'; encrypted: boolean; memberCount: number };
  }): (Verdict & { body?: string }) | void | Promise<(Verdict & { body?: string }) | void>;
  'conversation.before'?(input: { type: 'dm' | 'group'; creatorId: string; memberIds: string[]; encrypted: boolean }): Verdict | void | Promise<Verdict | void>;
  'upload.before'?(input: { userId: string; conversationId: string | null; name: string; mime: string; size: number }): Verdict | void | Promise<Verdict | void>;
  /** Fetch a link's title and description with your own fetcher. PlugChat never requests arbitrary URLs itself. */
  'link.preview'?(input: { url: string; userId: string }): { title?: string; description?: string; siteName?: string } | void | Promise<{ title?: string; description?: string; siteName?: string } | void>;
  /** Return how this user joins the call on your vendor: a url, vendor data (tokens), or both. */
  'call.join'?(input: {
    call: { id: string; conversationId: string; startedBy: string; video: boolean; createdAt: number };
    userId: string;
    user: { id: string; name: string };
    isStarter: boolean;
    memberIds: string[];
  }): (Verdict & { url?: string; data?: unknown }) | Promise<Verdict & { url?: string; data?: unknown }>;
}

export interface PlugChatServerOptions {
  /** Shared secret (at least 32 characters) your backend signs user tokens with. */
  secret: string;
  /** Outgoing secrets still accepted while you rotate. */
  previousSecrets?: string[];
  maxTokenLifetimeSeconds?: number;
  dataDir?: string;
  basePath?: string;
  /** Browser origins allowed to call the API and frame the embed page. */
  origins?: string[] | '*';
  webhookUrl?: string;
  directory?: boolean;
  handleVisibility?: 'none' | 'all';
  stories?: boolean;
  requireEncryption?: boolean;
  iceServers?: { urls: string | string[]; username?: string; credential?: string }[];
  maxFileBytes?: number;
  /** Delete every message and file older than this many days. 0 keeps everything. */
  retentionDays?: number;
  /** First retry delay for webhooks; doubles each attempt. Default 5000. */
  webhookRetryBaseMs?: number;
  /** Per-person upload allowance in bytes. 0 means unlimited. */
  userStorageBytes?: number;
  rateLimit?: { perSecond: number; burst: number };
  storage?: Storage;
  hooks?: Hooks;
  hookUrl?: string;
  hookEvents?: (keyof Hooks)[];
  hookTimeoutMs?: number;
  hookFailOpen?: boolean;
  /** Share realtime events between several instances that use the same database. */
  cluster?: boolean;
  bus?: Bus;
  log?: { error(...args: unknown[]): void };
}

export interface AdminApi {
  upsertUser(id: string, profile?: { name?: string; avatar?: string; handles?: Record<string, string> }): Promise<any>;
  deleteUser(id: string): Promise<{ deleted: true }>;
  exportUser(id: string): Promise<Record<string, unknown>>;
  suspend(id: string, reason?: string): Promise<{ userId: string; suspended: string }>;
  unsuspend(id: string): Promise<{ userId: string; suspended: null }>;
  unread(id: string): Promise<{ total: number; conversations: { id: string; type: string; title: string | null; unread: number; muted: boolean }[] }>;
  /** Drop a notice into a person's read-only "Notifications" conversation. */
  notify(id: string, text: string, options?: { title?: string }): Promise<any>;
  openDm(userA: string, userB: string): Promise<any>;
  createGroup(group: { title: string; memberIds: string[]; createdBy?: string; announce?: boolean; description?: string; ttlSeconds?: number }): Promise<any>;
  addMembers(conversationId: string, userIds: string[]): Promise<any>;
  removeMember(conversationId: string, userId: string): Promise<{ removed: true }>;
  /** A string posts a system notice; an object posts any message, e.g. { kind: 'text', senderId, body }. */
  post(conversationId: string, message: string | Record<string, unknown>): Promise<any>;
  deleteMessage(id: string): Promise<{ deleted: true }>;
  reports(): Promise<any[]>;
  stats(): Promise<{ users: number; conversations: number; messages: number; files: number; fileBytes: number; openReports: number }>;
}

export interface PlugChatServer {
  /** Resolves to false when the URL is not under basePath, so it can sit in front of your own routes. */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  /** Wire the realtime endpoint onto an existing http.Server. */
  attach(server: Server): Server;
  /** Run as a standalone service. */
  listen(port: number, host?: string): Promise<Server>;
  close(): void;
  basePath: string;
  signToken(claims: TokenClaims, ttlSeconds?: number): string;
  /** Call any JSON endpoint in-process with admin rights. */
  api(method: string, path: string, body?: unknown): Promise<any>;
  admin: AdminApi;
}

export function createPlugChat(options: PlugChatServerOptions): PlugChatServer;
