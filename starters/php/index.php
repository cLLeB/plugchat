<?php
// PlugChat starter for PHP (no packages needed; the same two functions drop
// into a Laravel or Symfony controller unchanged).
// The two things your backend adds: a token endpoint, and a webhook receiver.
//
//   PLUGCHAT_SECRET=... php -S 127.0.0.1:8080 index.php

$secret = getenv('PLUGCHAT_SECRET');
if (!$secret) {
    http_response_code(500);
    exit('Set PLUGCHAT_SECRET (the same value PlugChat was started with).');
}

// Replace this with the person signed in to YOUR site (session, auth guard).
// Never take the user id from the request's query string or body.
function current_user(): array
{
    return ['id' => 'demo-user', 'name' => 'Demo User'];
}

function b64(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

/** A short-lived token that tells PlugChat who this person is. */
function chat_token(array $user, string $secret): string
{
    $head = b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $body = b64(json_encode(['sub' => $user['id'], 'name' => $user['name'], 'exp' => time() + 300]));
    $signature = b64(hash_hmac('sha256', "$head.$body", $secret, true));
    return "$head.$body.$signature";
}

/** Did this webhook really come from your PlugChat? */
function signed_by_plugchat(string $rawBody, ?string $header, string $secret): bool
{
    return hash_equals('sha256=' . hash_hmac('sha256', $rawBody, $secret), $header ?? '');
}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET' && $path === '/api/chat-token') {
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode(['token' => chat_token(current_user(), $secret)]);
    exit;
}

if ($method === 'POST' && $path === '/webhooks/plugchat') {
    $raw = file_get_contents('php://input');
    if (!signed_by_plugchat($raw, $_SERVER['HTTP_X_PLUGCHAT_SIGNATURE'] ?? null, $secret)) {
        http_response_code(401);
        exit;
    }
    $event = json_decode($raw, true);
    // e.g. $event['type'] === 'message.new': send your own push notification or email to $event['recipients']
    error_log('plugchat event: ' . $event['type']);
    http_response_code(204);
    exit;
}

http_response_code(404);
