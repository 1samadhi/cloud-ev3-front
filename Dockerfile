# Consola de operaciones de Pedidos360 — imagen de servido estatico.
#
# nginx y no "abrir el archivo": un archivo abierto con file:// tiene origen
# "null", y un origen null solo pasa el CORS con el comodin "*". Como el docente
# observo en la EV2 que el CORS debe declarar la ruta concreta del frontend,
# el front necesita un origen HTTP real. De ahi este contenedor.

FROM nginx:1.27-alpine

# Configuracion del sitio (reemplaza la default de la imagen).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# La pagina.
COPY consola.html /usr/share/nginx/html/consola.html

# El entrypoint genera config.js con las URL del entorno antes de arrancar nginx.
COPY docker-entrypoint.sh /docker-entrypoint-pedidos360.sh
RUN chmod +x /docker-entrypoint-pedidos360.sh

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost/salud || exit 1

ENTRYPOINT ["/docker-entrypoint-pedidos360.sh"]
