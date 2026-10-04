# For platforms whose backend is not Node: run PlugChat as a sidecar.
#
#   docker build -t plugchat .
#   docker run -p 4400:4400 -v plugchat-data:/data \
#     -e PLUGCHAT_SECRET=... -e PLUGCHAT_ORIGINS=https://your-site.example plugchat
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY bin ./bin
COPY server ./server
COPY client ./client
ENV PORT=4400 HOST=0.0.0.0 PLUGCHAT_DATA=/data
VOLUME /data
EXPOSE 4400
USER node
CMD ["node", "bin/plugchat.js", "start"]
