// PlugChat starter for Java (JDK only; the same two methods drop into a
// Spring controller unchanged).
// The two things your backend adds: a token endpoint, and a webhook receiver.
//
//   PLUGCHAT_SECRET=... java Server.java
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;

public class Server {
    static final byte[] SECRET = System.getenv().getOrDefault("PLUGCHAT_SECRET", "").getBytes(StandardCharsets.UTF_8);

    record User(String id, String name) {}

    // Replace this with the person signed in to YOUR site (session, Spring Security principal).
    // Never take the user id from the request's query string or body.
    static User currentUser(HttpExchange request) {
        return new User("demo-user", "Demo User");
    }

    static String b64(byte[] data) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data);
    }

    static byte[] hmac(byte[] data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET, "HmacSHA256"));
        return mac.doFinal(data);
    }

    static String json(String text) {
        return "\"" + text.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    /** A short-lived token that tells PlugChat who this person is. */
    static String chatToken(User user) throws Exception {
        String head = b64("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
        long expires = System.currentTimeMillis() / 1000 + 300;
        String claims = "{\"sub\":" + json(user.id()) + ",\"name\":" + json(user.name()) + ",\"exp\":" + expires + "}";
        String signing = head + "." + b64(claims.getBytes(StandardCharsets.UTF_8));
        return signing + "." + b64(hmac(signing.getBytes(StandardCharsets.UTF_8)));
    }

    /** Did this webhook really come from your PlugChat? */
    static boolean signedByPlugChat(byte[] rawBody, String header) throws Exception {
        String expected = "sha256=" + HexFormat.of().formatHex(hmac(rawBody));
        return header != null && MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), header.getBytes(StandardCharsets.UTF_8));
    }

    public static void main(String[] args) throws Exception {
        if (SECRET.length == 0) throw new IllegalStateException("Set PLUGCHAT_SECRET (the same value PlugChat was started with).");
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);

        server.createContext("/api/chat-token", exchange -> {
            try {
                byte[] body = ("{\"token\":" + json(chatToken(currentUser(exchange))) + "}").getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.getResponseHeaders().set("Cache-Control", "no-store");
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
            } catch (Exception e) {
                exchange.sendResponseHeaders(500, -1);
            } finally {
                exchange.close();
            }
        });

        server.createContext("/webhooks/plugchat", exchange -> {
            try {
                byte[] raw = exchange.getRequestBody().readAllBytes();
                boolean ok = exchange.getRequestMethod().equals("POST")
                        && signedByPlugChat(raw, exchange.getRequestHeaders().getFirst("X-PlugChat-Signature"));
                // Parse `raw` with your JSON library; e.g. type "message.new": send your own push notification or email.
                exchange.sendResponseHeaders(ok ? 204 : 401, -1);
            } catch (Exception e) {
                exchange.sendResponseHeaders(500, -1);
            } finally {
                exchange.close();
            }
        });

        server.start();
        System.out.println("listening on http://localhost:" + port);
    }
}
