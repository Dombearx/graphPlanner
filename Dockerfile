# --- etap budowania ---
FROM node:22-bookworm-slim AS build

# better-sqlite3 buduje się ze źródeł, gdy nie ma gotowej paczki dla danej platformy
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Podścieżka wdrożenia (np. "/planner/") wypieka się w zbudowanych plikach —
# musi być znana już na etapie `vite build`, stąd ARG zamiast zmiennej
# przekazywanej dopiero do kontenera w czasie działania.
ARG VITE_BASE_PATH
ENV VITE_BASE_PATH=$VITE_BASE_PATH

COPY vite.config.js ./
COPY client ./client
COPY server ./server
COPY shared ./shared
RUN npm run build && npm prune --omit=dev

# --- obraz produkcyjny ---
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY package.json ./
COPY deploy/entrypoint.js ./deploy/entrypoint.js

RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=4s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Wejście zaczyna się rootem i zrzuca uprawnienia do użytkownika `node` samo,
# zamiast `USER node` w tym miejscu. Powód jest w `deploy/entrypoint.js`:
# katalog `/data` przychodzi z hosta jako bind mount, dockerd tworzy go rootem,
# a montowanie przykrywa właściciela ustawionego wyżej przez `chown`. Serwer
# i tak kończy jako `node` - tyle że po ustawieniu właściciela katalogu.
ENTRYPOINT ["node", "deploy/entrypoint.js"]
CMD ["node", "server/index.js"]
