// PlugChat starter for Go (standard library only).
// The two things your backend adds: a token endpoint, and a webhook receiver.
//
//	PLUGCHAT_SECRET=... go run main.go
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

var secret = []byte(os.Getenv("PLUGCHAT_SECRET"))

type user struct {
	ID   string
	Name string
}

// Replace this with the person signed in to YOUR site (session, cookie, auth middleware).
// Never take the user id from the request's query string or body.
func currentUser(r *http.Request) user {
	return user{ID: "demo-user", Name: "Demo User"}
}

func b64(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}

// A short-lived token that tells PlugChat who this person is.
func chatToken(u user) string {
	head, _ := json.Marshal(map[string]string{"alg": "HS256", "typ": "JWT"})
	body, _ := json.Marshal(map[string]any{"sub": u.ID, "name": u.Name, "exp": time.Now().Unix() + 300})
	signing := b64(head) + "." + b64(body)
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(signing))
	return signing + "." + b64(mac.Sum(nil))
}

// Did this webhook really come from your PlugChat?
func signedByPlugChat(rawBody []byte, header string) bool {
	mac := hmac.New(sha256.New, secret)
	mac.Write(rawBody)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(header))
}

func main() {
	if len(secret) == 0 {
		log.Fatal("Set PLUGCHAT_SECRET (the same value PlugChat was started with).")
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/api/chat-token", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(map[string]string{"token": chatToken(currentUser(r))})
	})

	http.HandleFunc("/webhooks/plugchat", func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		if r.Method != http.MethodPost || !signedByPlugChat(raw, r.Header.Get("X-PlugChat-Signature")) {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		var event struct {
			Type string `json:"type"`
		}
		json.Unmarshal(raw, &event)
		// e.g. event.Type == "message.new": send your own push notification or email to the recipients
		log.Println("plugchat event:", event.Type)
		w.WriteHeader(http.StatusNoContent)
	})

	// Optional: PlugChat asks before it stores a message, so you can check credits, moderate or veto.
	// Switch it on with hookUrl and hookEvents: ["message.before"].
	http.HandleFunc("/hooks/plugchat", func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		if r.Method != http.MethodPost || !signedByPlugChat(raw, r.Header.Get("X-PlugChat-Signature")) {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		var ask struct {
			Event   string `json:"event"`
			Message struct {
				Body string `json:"body"`
			} `json:"message"`
		}
		json.Unmarshal(raw, &ask)
		w.Header().Set("Content-Type", "application/json")
		if ask.Event == "message.before" && strings.Contains(ask.Message.Body, "[blocked]") { // your own rule goes here
			json.NewEncoder(w).Encode(map[string]any{"allow": false, "reason": "That message is not allowed here."})
			return
		}
		w.Write([]byte("{}"))
	})

	log.Printf("listening on http://localhost:%s", port)
	log.Fatal(http.ListenAndServe("127.0.0.1:"+port, nil))
}
