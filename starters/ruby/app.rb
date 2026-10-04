# PlugChat starter for Ruby (WEBrick: `gem install webrick`; the same two
# methods drop into a Rails or Sinatra controller unchanged).
# The two things your backend adds: a token endpoint, and a webhook receiver.
#
#   PLUGCHAT_SECRET=... ruby app.rb
require 'webrick'
require 'openssl'
require 'base64'
require 'json'

SECRET = ENV['PLUGCHAT_SECRET'].to_s
PORT = (ENV['PORT'] || '8080').to_i
abort 'Set PLUGCHAT_SECRET (the same value PlugChat was started with).' if SECRET.empty?

# Replace this with the person signed in to YOUR site (session, Devise, etc.).
# Never take the user id from the request's query string or body.
def current_user(_request)
  { id: 'demo-user', name: 'Demo User' }
end

def b64(data)
  Base64.urlsafe_encode64(data, padding: false)
end

# A short-lived token that tells PlugChat who this person is.
def chat_token(user)
  head = b64({ alg: 'HS256', typ: 'JWT' }.to_json)
  body = b64({ sub: user[:id], name: user[:name], exp: Time.now.to_i + 300 }.to_json)
  signature = b64(OpenSSL::HMAC.digest('SHA256', SECRET, "#{head}.#{body}"))
  "#{head}.#{body}.#{signature}"
end

# Did this webhook really come from your PlugChat?
def signed_by_plugchat?(raw_body, header)
  expected = 'sha256=' + OpenSSL::HMAC.hexdigest('SHA256', SECRET, raw_body)
  given = header.to_s
  given.bytesize == expected.bytesize && OpenSSL.fixed_length_secure_compare(given, expected)
end

server = WEBrick::HTTPServer.new(Port: PORT, BindAddress: '127.0.0.1', AccessLog: [], Logger: WEBrick::Log.new(File::NULL))

server.mount_proc '/api/chat-token' do |request, response|
  response['Content-Type'] = 'application/json'
  response['Cache-Control'] = 'no-store'
  response.body = { token: chat_token(current_user(request)) }.to_json
end

server.mount_proc '/webhooks/plugchat' do |request, response|
  raw = request.body.to_s
  unless request.request_method == 'POST' && signed_by_plugchat?(raw, request['X-PlugChat-Signature'])
    response.status = 401
    next
  end
  event = JSON.parse(raw)
  # e.g. event['type'] == 'message.new': send your own push notification or email to event['recipients']
  puts "plugchat event: #{event['type']}"
  response.status = 204
end

trap('INT') { server.shutdown }
puts "listening on http://localhost:#{PORT}"
$stdout.flush
server.start
