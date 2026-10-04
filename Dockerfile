# For platforms whose backend is not Node: run PlugChat as a side service.
#
#   docker build -t plugchat .
#   docker run -p 4400:4400 -v plugchat-data:/data \
#     -e PLUGCHAT_SECRET=... -e PLUGCHAT_ORIGINS=https://your-site.example plugchat
#
# Settings can also come from a file: add
#     -v ./plugchat.config.json:/app/plugchat.config.json:ro
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY bin ./bin
COPY server ./server
COPY client ./client
COPY starters ./starters
# The data folder must belong to the unprivileged user the server runs as.
RUN mkdir -p /data && chown node:node /data
ENV PORT=4400 HOST=0.0.0.0 PLUGCHAT_DATA=/data
VOLUME /data
EXPOSE 4400
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:4400/plugchat/health || exit 1
CMD ["node", "bin/plugchat.js", "start"]
