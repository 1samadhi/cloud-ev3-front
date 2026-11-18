# Consola de operaciones de Pedidos360 — imagen de servido estatico.
#
# nginx y no "abrir el archivo": un archivo abierto con file:// tiene origen
# "null", y un origen null solo pasa el CORS con el comodin "*". Como el CORS de
# los microservicios declara la ruta concreta del frontend, el front necesita un
# origen HTTP real. De ahi este contenedor.

# ---------- etapa 1: compilacion ----------
FROM node:22-alpine AS build

WORKDIR /app

# Se copian primero los manifiestos para que la capa de dependencias se reuse
# mientras no cambien: cambiar codigo no reinstala node_modules.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig*.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---------- etapa 2: servido ----------
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Solo el resultado de la compilacion: ni node_modules ni el codigo fuente
# llegan a la imagen final.
COPY --from=build /app/dist /usr/share/nginx/html

# El entrypoint genera config.js con las URL del entorno antes de arrancar nginx
# y sobrescribe el config.js de desarrollo que viene en dist/.
COPY docker-entrypoint.sh /docker-entrypoint-pedidos360.sh
RUN chmod +x /docker-entrypoint-pedidos360.sh

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost/salud || exit 1

ENTRYPOINT ["/docker-entrypoint-pedidos360.sh"]
