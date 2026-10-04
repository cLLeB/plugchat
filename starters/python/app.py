# PlugChat starter for Python (standard library only; the same two functions
# drop into Django, Flask or FastAPI views unchanged).
# The two things your backend adds: a token endpoint, and a webhook receiver.
#
#   PLUGCHAT_SECRET=... python app.py
import base64
import hashlib
import hmac
import json
import os
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

SECRET = os.environ.get("PLUGCHAT_SECRET", "").encode()
PORT = int(os.environ.get("PORT", "8080"))
if not SECRET:
    raise SystemExit("Set PLUGCHAT_SECRET (the same value PlugChat was started with).")


def current_user(request):
    """Replace this with the person signed in to YOUR site (session, cookie, auth middleware).
    Never take the user id from the request's query string or body."""
    return {"id": "demo-user", "name": "Demo User"}


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def chat_token(user) -> str:
    """A short-lived token that tells PlugChat who this person is."""
    head = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = b64(json.dumps({"sub": user["id"], "name": user["name"], "exp": int(time.time()) + 300}).encode())
    signature = b64(hmac.new(SECRET, f"{head}.{body}".encode(), hashlib.sha256).digest())
    return f"{head}.{body}.{signature}"


def signed_by_plugchat(raw_body: bytes, header: str) -> bool:
    """Did this webhook really come from your PlugChat?"""
    expected = "sha256=" + hmac.new(SECRET, raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header or "")


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if urlparse(self.path).path != "/api/chat-token":
            return self.send_error(404)
        payload = json.dumps({"token": chat_token(current_user(self))}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        if urlparse(self.path).path != "/webhooks/plugchat":
            return self.send_error(404)
        raw = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        if not signed_by_plugchat(raw, self.headers.get("X-PlugChat-Signature")):
            self.send_response(401)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        event = json.loads(raw)
        # e.g. event["type"] == "message.new": send your own push notification or email to event["recipients"]
        print("plugchat event:", event["type"], flush=True)
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"listening on http://localhost:{PORT}", flush=True)
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
