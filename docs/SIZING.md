# Sizing: what one server handles

PlugChat is one Node process and one database file on a server you own. This
page says what that carries, from a measurement rather than a guess, and how to
measure your own machine.

## Measured

Run on an ordinary laptop (Intel Core 5 120U, 12 logical cores, 16 GB, Windows
11, Node 24), with PlugChat in its own process and a load generator on the same
machine using real HTTP requests and real WebSocket connections.

| | 2,000 people connected | 10,000 people connected |
|---|---|---|
| Memory used by PlugChat | 84 MB | 165 MB |
| Memory per connected person | about 15 KB | about 11 KB |
| Time to accept all the connections | 1 second | 6 seconds |
| Messages stored and delivered per second (64 people sending at once, flat out) | 1,355 | 1,350 |
| A message is stored and acknowledged | half within 44 ms, 99% within 105 ms | half within 46 ms, 99% within 81 ms |
| A message reaches the other person's screen | 95% within 65 ms | 95% within 60 ms |
| A message to a large group reaches every member | 16 ms (500 members) | 32 ms (1,000 members) |
| Loading the last 50 messages | 95% within 13 ms | 95% within 21 ms |
| Loading the chat list | 95% within 26 ms | 95% within 49 ms |
| Failed requests | 0 | 0 |

At rest, with nobody connected, the process uses about 55 MB.

### With PostgreSQL instead of SQLite

The same test with 2,000 people connected and PostgreSQL 17 on the same
machine:

| | SQLite | PostgreSQL |
|---|---|---|
| Messages stored and delivered per second | 1,355 | 357 |
| A message is stored and acknowledged (half / 99%) | 44 ms / 105 ms | 182 ms / 236 ms |
| A message to a group of 500 reaches everyone | 16 ms | 16 ms |
| Loading the last 50 messages (95%) | 13 ms | 30 ms |
| Memory with 2,000 connected | 84 MB | 158 MB |

PostgreSQL is about a quarter of the speed per message, because every query
crosses a connection instead of being a call into a local file, and PlugChat
uses one connection per instance. It is still fifteen times the average load
of the 50,000-person example below. Choose it for what it gives you (your
existing database, your existing backups, instances on several machines), not
for speed. Raw output: [`bench/results-postgres.json`](../bench/results-postgres.json).
Measure your own with `BENCH_DATABASE=postgres://… node bench/load.mjs`.

The raw output is in [`bench/results.json`](../bench/results.json) and
[`bench/results-large.json`](../bench/results-large.json).

## What that means for a platform

- **Sending rate is the ceiling, not connections.** About 1,350 messages a
  second is what one process stores, whether 2,000 or 10,000 people are
  connected. The database write is the limit: it is done on one thread.
- **That ceiling is far above ordinary use.** A platform where 50,000 people a
  day each send 40 messages produces about 23 messages a second on average.
  Even a peak ten times that is under a fifth of what was measured.
- **Connections are cheap.** 10,000 connected people cost 165 MB. Memory is
  not what you will run out of.
- **Rough guide for one small server (2 cores, 2 GB):** tens of thousands of
  daily active people, several thousand connected at once. Measure it (below)
  rather than relying on this line: a server's disk matters more than its CPU.

## What the measurement does not cover

- The load generator shared the machine with PlugChat, and traffic never left
  the machine. Over a real network, add the network's own delay.
- No TLS: in production your reverse proxy terminates HTTPS, and that costs CPU
  on the proxy.
- No file uploads, encryption or calls. Encrypted messages cost the server the
  same as plain ones (the work is on people's devices); uploads are limited by
  your disk or bucket; calls are peer to peer or on your call vendor, and do
  not pass through PlugChat.
- Each run lasted seconds, not hours. It shows capacity, not endurance.
- One process. Several instances sharing a database were not load tested.
- The per-person write limit (5 a second by default) was lifted for the test.

## Measure your own server

```bash
node bench/load.mjs
```

takes about a minute, uses a throwaway database, and prints the same table for
the machine it runs on. Options: `--connections=5000`, `--senders=64`,
`--seconds=20`, `--group=500`, or `--quick` for a short check.

On Linux, raise the open-file limit before testing many connections
(`ulimit -n 65535`), and do the same for the real service.

## When one server is not enough

In the order to try them:

1. **A faster disk.** Message throughput follows how fast the disk confirms a
   write. An SSD is assumed.
2. **Keep uploads in a bucket** (`storage: { type: 's3', ... }`) so the server's
   disk only holds the database.
3. **A retention period** (`retentionDays`) if your platform does not need
   messages kept forever: the database stops growing.
4. **Several instances** (`cluster: true`) sharing one PostgreSQL database, or
   one SQLite file on the same machine. This spreads connections, not writes.

## Disk

A plain text message takes roughly 300 to 400 bytes in the database including
its indexes. A million messages is about 0.4 GB. Attachments are stored at
their own size, on disk or in your bucket.
