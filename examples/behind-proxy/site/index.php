<?php
// A stand-in for a platform that is not written in Node: a PHP site with its
// own "session", the token endpoint from starters/php, and the chat on a page.
// PlugChat runs as a separate process; nginx puts both behind one address.

$secret = getenv('PLUGCHAT_SECRET');
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// The platform's own idea of who is signed in (here: a cookie set by ?as=).
$members = ['ama' => 'Ama Owusu', 'kofi' => 'Kofi Mensah'];
if (isset($_GET['as'], $members[$_GET['as']])) {
    setcookie('member', $_GET['as'], ['path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
    header('Location: /');
    exit;
}
$me = $_COOKIE['member'] ?? '';
$me = isset($members[$me]) ? $me : null;

function b64(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

if ($path === '/api/chat-token') {
    if (!$me) {
        http_response_code(401);
        exit;
    }
    $head = b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $body = b64(json_encode(['sub' => $me, 'name' => $members[$me], 'exp' => time() + 300]));
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode(['token' => "$head.$body." . b64(hash_hmac('sha256', "$head.$body", $secret, true))]);
    exit;
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>A PHP site with PlugChat</title>
  <style>
    body { margin: 0; font: 15px system-ui, sans-serif; background: #f2f3f5; color: #2e3035; }
    header { padding: 12px 20px; background: #2e3035; color: #fff; display: flex; gap: 16px; align-items: center; }
    header a { color: #c4c9d0; }
    main { max-width: 1000px; margin: 16px auto; padding: 0 16px; }
    plug-chat { height: min(680px, calc(100vh - 100px)); }
  </style>
</head>
<body>
  <header>
    <strong>A PHP site</strong>
    <?php if ($me): ?>
      <span>Signed in as <?= htmlspecialchars($members[$me]) ?></span>
      <a href="/?as=<?= $me === 'ama' ? 'kofi' : 'ama' ?>">switch member</a>
    <?php endif; ?>
  </header>
  <main>
    <?php if ($me): ?>
      <script type="module" src="/plugchat/client/element.js"></script>
      <plug-chat server="/plugchat" token-url="/api/chat-token"></plug-chat>
    <?php else: ?>
      <p>Sign in as <a href="/?as=ama">Ama</a> or <a href="/?as=kofi">Kofi</a>.</p>
    <?php endif; ?>
  </main>
</body>
</html>
