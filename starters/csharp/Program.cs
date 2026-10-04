// PlugChat starter for C# (ASP.NET Core minimal API, no extra packages).
// The two things your backend adds: a token endpoint, and a webhook receiver.
//
//   PLUGCHAT_SECRET=... dotnet run
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

var secret = Encoding.UTF8.GetBytes(Environment.GetEnvironmentVariable("PLUGCHAT_SECRET") ?? "");
if (secret.Length == 0) throw new InvalidOperationException("Set PLUGCHAT_SECRET (the same value PlugChat was started with).");
var port = Environment.GetEnvironmentVariable("PORT") ?? "8080";

var app = WebApplication.CreateBuilder(args).Build();

// Replace this with the person signed in to YOUR site (HttpContext.User, session).
// Never take the user id from the request's query string or body.
(string Id, string Name) CurrentUser(HttpContext context) => ("demo-user", "Demo User");

string B64(byte[] data) => Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');

// A short-lived token that tells PlugChat who this person is.
string ChatToken((string Id, string Name) user)
{
    var head = B64(JsonSerializer.SerializeToUtf8Bytes(new { alg = "HS256", typ = "JWT" }));
    var body = B64(JsonSerializer.SerializeToUtf8Bytes(new { sub = user.Id, name = user.Name, exp = DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 300 }));
    var signature = B64(HMACSHA256.HashData(secret, Encoding.ASCII.GetBytes($"{head}.{body}")));
    return $"{head}.{body}.{signature}";
}

// Did this webhook really come from your PlugChat?
bool SignedByPlugChat(byte[] rawBody, string? header)
{
    var expected = "sha256=" + Convert.ToHexString(HMACSHA256.HashData(secret, rawBody)).ToLowerInvariant();
    return CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(header ?? ""));
}

app.MapGet("/api/chat-token", (HttpContext context) =>
{
    context.Response.Headers.CacheControl = "no-store";
    return Results.Json(new { token = ChatToken(CurrentUser(context)) });
});

app.MapPost("/webhooks/plugchat", async (HttpContext context) =>
{
    using var buffer = new MemoryStream();
    await context.Request.Body.CopyToAsync(buffer);
    var raw = buffer.ToArray();
    if (!SignedByPlugChat(raw, context.Request.Headers["X-PlugChat-Signature"])) return Results.StatusCode(401);
    var type = JsonDocument.Parse(raw).RootElement.GetProperty("type").GetString();
    // e.g. type == "message.new": send your own push notification or email to the recipients
    Console.WriteLine($"plugchat event: {type}");
    return Results.StatusCode(204);
});

Console.WriteLine($"listening on http://localhost:{port}");
app.Run($"http://127.0.0.1:{port}");
