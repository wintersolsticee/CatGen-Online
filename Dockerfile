FROM node:22-slim
WORKDIR /app
COPY . .
RUN npm ci && npm run build -w @catgen/client
ENV NODE_ENV=production \
    CLIENT_DIST=packages/client/dist \
    PORT=10000
EXPOSE 10000
CMD ["npm", "start"]
