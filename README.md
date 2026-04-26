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

Rutas de expedientes:

- `GET /api/expedientes/citas/:citaId/abrir` (requiere `Authorization: Bearer <token>` y rol `doctor`, `secretaria`, `admin` o `administrador`)
- `GET /api/expedientes/:id` (requiere `Authorization: Bearer <token>` y rol `doctor`, `secretaria`, `admin` o `administrador`)
- `POST /api/expedientes/:id/observaciones` (requiere `Authorization: Bearer <token>` y rol `doctor`, `admin` o `administrador`)
- `POST /api/expedientes/observaciones/:observacionId/documentos` (requiere `Authorization: Bearer <token>` y rol `doctor`, `admin` o `administrador`)

Tipos de documentos permitidos en `POST /api/expedientes/observaciones/:observacionId/documentos`:

- `application/pdf`
- `image/jpeg`
- `image/png`
- `image/webp`
- `text/plain`
- `application/msword`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `application/vnd.ms-excel`
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

Subida de uno o varios documentos:

- Documento unico: enviar `rutaArchivo` (o alias) y opcionalmente `tipo`, `nombreArchivo`
- Multiples documentos: enviar array en `documentos` (tambien soporta `documents`, `archivos`, `files`)
- Tambien se soporta `fileBase64` por documento o archivos en `multipart/form-data`
- Si `DOCUMENT_STORAGE_PROVIDER=azure`, los archivos se suben a Azure Blob y en `documentos.ruta_archivo` se guarda la URL del blob
- Si `DOCUMENT_STORAGE_PROVIDER=local`, los archivos se guardan en `uploads/expedientes` y en `documentos.ruta_archivo` se guarda `/uploads/expedientes/<archivo>`

Configuracion Azure Blob para documentos:

- `DOCUMENT_STORAGE_PROVIDER=azure`
- `USE_AZURE_BLOB_STORAGE=true`
- `AZURE_BLOB_SERVICE_SAS_URL=<sas_url_del_blob_service>`
- `AZURE_STORAGE_CONTAINER_NAME=documentos`
- `AZURE_STORAGE_ACCOUNT_NAME=<nombre_de_la_cuenta>` (requerido para generar SAS temporales desde backend)
- `AZURE_STORAGE_ACCOUNT_KEY=<account_key>` (requerido para generar SAS temporales desde backend)
- `AZURE_STORE_URL_WITH_SAS=true`
- `AZURE_AUTO_CREATE_CONTAINER=true` (opcional)

Notas Azure:

- Se recomienda SAS URL de Blob service con permisos de escritura para blobs.
- Si el contenedor no existe y `AZURE_AUTO_CREATE_CONTAINER=true`, la API intenta crearlo automaticamente.

Endpoint para generar SAS temporal de lectura desde backend:

- `GET /api/expedientes/documentos/sas-temporal?rutaArchivo=<url_blob>&expiresInMinutes=15`
- `POST /api/expedientes/documentos/sas-temporal`

Body para `POST /api/expedientes/documentos/sas-temporal`:

```json
{
   "rutaArchivo": "https://<account>.blob.core.windows.net/documentos/archivo.pdf",
   "expiresInMinutes": 15
}
```

Ejemplo de subida multiple:

```json
{
   "documentos": [
      {
         "nombreArchivo": "laboratorio.pdf",
         "tipo": "application/pdf",
         "fileBase64": "data:application/pdf;base64,JVBERi0xLjQK..."
      },
      {
         "nombreArchivo": "rayos_x.png",
         "tipo": "image/png",
         "rutaArchivo": "https://storage.example.com/rayos_x.png"
      }
   ]
}
```

Rutas de secretaria:

- `GET /api/secretaria/doctors` (requiere `Authorization: Bearer <token>`) – Retorna doctores con objeto completo (doctors, items, total)
- `GET /api/secretaria/getDoctors` (requiere `Authorization: Bearer <token>`) – Alias de doctors
- `GET /api/secretaria/getDoctorsList` (requiere `Authorization: Bearer <token>`) – Retorna array simple de doctores
- `GET /api/secretaria/consultorios` (requiere `Authorization: Bearer <token>` y rol `secretaria`, `admin` o `administrador`) – Retorna consultorios con objeto completo (consultorios, items, total)
- `GET /api/secretaria/getConsultorios` (requiere `Authorization: Bearer <token>` y rol `secretaria`, `admin` o `administrador`) – Alias de consultorios
- `GET /api/secretaria/getConsultoriosList` (requiere `Authorization: Bearer <token>` y rol `secretaria`, `admin` o `administrador`) – Retorna array simple de consultorios
- `GET /api/secretaria/doctor-visits?date=YYYY-MM-DD` (requiere `Authorization: Bearer <token>` y rol `secretaria`, `admin` o `administrador`) – Visitas por fecha usando query parameter
- `GET /api/secretaria/doctor-visits/:date` (requiere `Authorization: Bearer <token>` y rol `secretaria`, `admin` o `administrador`) – Visitas por fecha usando URL parameter (e.g., `/doctor-visits/2026-04-12`)
- `POST /api/secretaria/doctor-visits` (requiere `Authorization: Bearer <token>` y rol `secretaria`, `admin` o `administrador`)

Body para `POST /api/secretaria/doctor-visits`:

- `doctorId` (number, requerido)
- `consultorioId` (number, requerido)
- `date` (string `YYYY-MM-DD`, requerido)
- `startTime` (string `HH:MM`, requerido)
- `endTime` (string `HH:MM`, requerido)
- `status` (string opcional: `programada`, `completada`, `cancelada`; por defecto `programada`)
- `reason` (string, opcional)
- `notes` (string, opcional)

Aliases aceptados para compatibilidad de payload:

- `doctor_id` para `doctorId`
- `consultorio_id`, `roomId`, `room_id` para `consultorioId`
- `fecha` para `date`
- `hora_inicio` o `start_time` para `startTime`
- `hora_fin` o `end_time` para `endTime`
- `estado` para `status`
- `motivo` para `reason`
- `notas` para `notes`

Respuesta de `GET /api/secretaria/doctors` o `GET /api/secretaria/getDoctors`:

- `doctors` con el listado de doctores (array)
- `items` alias del mismo listado
- `total` cantidad de doctores

Respuesta de `GET /api/secretaria/getDoctorsList`:

- Retorna directamente el array de doctores sin envoltura

Respuesta de `GET /api/secretaria/consultorios`, `GET /api/secretaria/getConsultorios`:

- `consultorios` con el listado de consultorios (id, nombre)
- `items` alias del mismo listado
- `total` cantidad de consultorios

Respuesta de `GET /api/secretaria/getConsultoriosList`:

- Retorna directamente el array de consultorios sin envoltura

Respuesta de `GET /api/secretaria/doctor-visits?date=YYYY-MM-DD` o `GET /api/secretaria/doctor-visits/:date`:

- Retorna array directo de visitas del día especificado, incluyendo consultorio, doctor, horarios y estado
- Si no hay visitas, retorna array vacío `[]`

Notas de compatibilidad para secretaria:

- Las respuestas incluyen alias en snake_case y camelCase para evitar problemas de integración.
- La creación de visitas valida conflictos para evitar asignar dos doctores distintos al mismo consultorio en la misma fecha.
- `hora_fin` y `endTime` se toman directamente de la tabla `visitas`.

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
