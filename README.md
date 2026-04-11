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

- `POST /api/users/loginUser`
- `GET /api/users/getProfile` (requiere `Authorization: Bearer <token>`)
- `GET /api/users/roles` (requiere `Authorization: Bearer <token>`)
- `GET /api/users/getRoles` (requiere `Authorization: Bearer <token>`)
- `GET /api/users/roles/:id` (requiere `Authorization: Bearer <token>`)
- `GET /api/users/getRoleById/:id` (requiere `Authorization: Bearer <token>`)
- `GET /api/getRoleById/:id` (alias de compatibilidad, requiere `Authorization: Bearer <token>`)
- `GET /api/roles/:id` (alias de compatibilidad, requiere `Authorization: Bearer <token>`)

Respuesta de `GET /api/getRoleById/:id`:

- `role` con el objeto completo del rol
- `nombre` con el nombre del rol
- `name` con el mismo valor para compatibilidad con frontend

Rutas de doctores:

- `POST /api/doctores` (requiere `Authorization: Bearer <token>`)
- `POST /api/doctores/createDoctor` (requiere `Authorization: Bearer <token>`)
- `GET /api/doctores` (requiere `Authorization: Bearer <token>`)
- `GET /api/doctores/getDoctors` (requiere `Authorization: Bearer <token>`)
- `GET /api/doctores/:id` (requiere `Authorization: Bearer <token>`)
- `GET /api/doctores/getDoctorById/:id` (requiere `Authorization: Bearer <token>`)

Payload recomendado para crear doctor:

- `nombre` (string, requerido)
- `email` (string, requerido)
- `identificacion` (string, requerido)
- `password` (string, requerido)
- `activo` (boolean opcional, por defecto `true`)
- `especialidad_ids` (array opcional de ids de `especialidades`)

Rutas de pacientes:

- `POST /api/pacientes` (requiere `Authorization: Bearer <token>`)
- `POST /api/pacientes/createPatient` (requiere `Authorization: Bearer <token>`)
- `GET /api/pacientes` (requiere `Authorization: Bearer <token>`)
- `GET /api/pacientes/getPatients` (requiere `Authorization: Bearer <token>`)
- `GET /api/pacientes/:id` (requiere `Authorization: Bearer <token>`)
- `GET /api/pacientes/getPatientById/:id` (requiere `Authorization: Bearer <token>`)

Payload recomendado para crear paciente:

- `nombre` (string, requerido)
- `identificacion` (string, requerido)
- `telefono` (string, opcional)
- `email` (string, opcional)
- `fecha_nacimiento` (date, opcional)
- `direccion` (text, opcional)
- `activo` (boolean opcional, por defecto `true`)

Rutas de secretaria:

- `GET /api/secretaria/agendas?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD` (requiere `Authorization: Bearer <token>` y rol `secretaria` o `admin`)
- `GET /api/secretaria/doctor-visits?date=YYYY-MM-DD` (requiere `Authorization: Bearer <token>` y rol `secretaria` o `admin`)
- `GET /api/secretaria/doctor-visits/summary?month=YYYY-MM` (requiere `Authorization: Bearer <token>` y rol `secretaria` o `admin`)
- `POST /api/secretaria/doctor-visits` (requiere `Authorization: Bearer <token>` y rol `secretaria` o `admin`)

Body para `POST /api/secretaria/doctor-visits`:

- `doctorId` (number, requerido)
- `date` (string `YYYY-MM-DD`, requerido)
- `startTime` (string `HH:MM`, requerido)
- `endTime` (string `HH:MM`, requerido)
- `reason` (string, opcional)
- `notes` (string, opcional)
- `expedienteId` (number, opcional)

Notas de compatibilidad para secretaria:

- Las respuestas incluyen alias en snake_case y camelCase para evitar problemas de integracion.
- `consultorio` y `room` se devuelven como `null` porque el esquema actual no tiene una columna de consultorio.
- `hora_fin` y `endTime` se guardan como metadato en `auditoria` para mantener compatibilidad con el frontend sin cambiar la tabla `citas`.

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
