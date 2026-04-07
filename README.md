# Backend Dra Astua

API Node.js + Express con MySQL para el proyecto Consultorio Dra Astua.

## Variables de entorno

Puedes copiar `.env.example` y completar valores reales.

Variables minimas:

- `PORT`
- `JWT_SECRET`
- `DB_NAME=consultoriodraastua`
- `CORS_ORIGINS=http://localhost:8082,http://localhost:8081`

Para MySQL tienes dos opciones:

1. `DATABASE_URL` (recomendado en Dockploy)
2. `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

## Ejecutar local

```bash
npm install
npm start
```

Healthcheck:

- `GET /health`

Rutas de usuario:

- `POST /api/users/login`
- `GET /api/users/profile` (requiere `Authorization: Bearer <token>`)

Preflight/CORS:

- `OPTIONS` y `POST` habilitados para frontend web
- Headers permitidos: `Content-Type`, `Authorization`
- Endpoint liviano para gateway: `GET /healthz`

## Deploy en Dockploy

1. Crear servicio desde este repositorio.
2. Dockploy detectara el `Dockerfile` automaticamente.
3. Definir variables en Dockploy:
   - `NODE_ENV=production`
   - `PORT=3000`
   - `CORS_ORIGINS=http://localhost:8082,http://localhost:8081`
   - `JWT_SECRET=<secreto_fuerte>`
   - `DATABASE_URL=mysql://usuario:password@host:3306/consultoriodraastua`
   - `REQUIRE_DB_ON_START=false` (recomendado para evitar caidas por reconexion DB)
4. Exponer puerto `3000`.
5. Verificar `GET /health` despues del deploy.

## Notas

- La API valida conexion con MySQL al iniciar.
- Si la base no esta accesible, el contenedor termina con error para evitar estados inconsistentes.
