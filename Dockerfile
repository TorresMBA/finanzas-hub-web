# Frontend de PersonalHub ya compilado (`npm run build`), servido por nginx sin privilegios en 8080.
# Contexto de build: dist/finanzas-hub-web/browser. Lo usa `mercury-ci package` del servidor Mercury,
# que lo prefiere a su plantilla `spa` por estar en el directorio desde el que se empaqueta.
#
# Además de servir el SPA, reenvía al API lo que el frontend pide con rutas relativas (/api, /hubs
# y el webhook de WhatsApp), así navegador y API comparten origen y la cookie de sesión funciona.
# API_UPSTREAM (obligatoria, en el .env de la app): host:puerto del API, p. ej. finanzas-hub-api-dev:8080.
ARG NGINX_VERSION=1.30
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}-alpine

# La imagen genera conf.d/default.conf desde templates/ con envsubst al arrancar: solo sustituye
# variables definidas, así que las de nginx ($uri, $host...) se quedan como están.
RUN rm -f /etc/nginx/conf.d/default.conf

# Sin API_UPSTREAM el contenedor no arranca y `mercury-ci deploy` falla con este mensaje.
COPY --chmod=755 <<'EOF' /docker-entrypoint.d/05-api-upstream.envsh
: "${API_UPSTREAM:?falta API_UPSTREAM (host:puerto del API) en el .env de la app}"
EOF

COPY <<'EOF' /etc/nginx/templates/default.conf.template
# WebSocket solo cuando el navegador lo pide
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      '';
}

server {
    listen 8080;
    root /usr/share/nginx/html;
    index index.html;
    server_tokens off;

    # Importación de archivos de banco: 10 MB más la cabecera del formulario
    client_max_body_size 11m;

    # DNS de Docker por petición: un contenedor del API recreado cambia de IP
    resolver 127.0.0.11 valid=10s ipv6=off;
    set $api http://${API_UPSTREAM};

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;

    location ^~ /api/ {
        proxy_pass $api;
    }

    location ^~ /webhooks/ {
        proxy_pass $api;
    }

    # SignalR: WebSocket de larga duración
    location ^~ /hubs/ {
        proxy_pass $api;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }

    # El build de Angular pone hash en el nombre de js, css y fuentes: no cambian nunca.
    # Lo de public/ (favicon, imágenes) no lleva hash y sigue la regla general.
    location ~* \.(?:js|css|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location / {
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;
    }
}
EOF

COPY . /usr/share/nginx/html
EXPOSE 8080
