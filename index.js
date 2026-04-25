const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const DbService = require('./config/database');
const userRoutes = require('./routes/userRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const patientRoutes = require('./routes/patientRoutes');
const secretariaRoutes = require('./routes/secretariaRoutes');
const agendaRoutes = require('./routes/agendaRoutes');
const expedienteRoutes = require('./routes/expedienteRoutes');
const authMiddleware = require('./middlewares/authMiddleware');
const requireRoles = require('./middlewares/roleMiddleware');
const doctorController = require('./controllers/doctorController');
const patientController = require('./controllers/patientController');
const userController = require('./controllers/userController');
const secretariaController = require('./controllers/secretariaController');
const agendaController = require('./controllers/agendaController');
const expedienteController = require('./controllers/expedienteController');

dotenv.config();

const app = express();
const db = DbService.getInstance();

const DEFAULT_CORS_ORIGINS = ['http://localhost:8082', 'http://localhost:8081'];
const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = configuredOrigins.length ? configuredOrigins : DEFAULT_CORS_ORIGINS;
const LOCALHOST_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const ALLOW_LOCALHOST_ANY_PORT = String(process.env.CORS_ALLOW_LOCALHOST_ANY_PORT || 'true').toLowerCase() === 'true';

const isAllowedOrigin = (origin) => {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  if (ALLOW_LOCALHOST_ANY_PORT && LOCALHOST_ORIGIN_REGEX.test(origin)) {
    return true;
  }

  return false;
};

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Origen no permitido por CORS' });
  }
  return next();
});

const corsOptions = {
  origin(origin, callback) {
    // Permite requests sin Origin (curl, healthchecks internos, server-to-server)
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
  credentials: false,
  maxAge: 86400
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1 AS ok');
    res.status(200).json({
      status: 'ok',
      database: process.env.DB_NAME || 'consultoriodraastua'
    });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      message: 'No se pudo conectar a la base de datos'
    });
  }
});

app.use('/api/users', userRoutes);
app.use('/api/doctores', doctorRoutes);
app.use('/api/pacientes', patientRoutes);
app.use('/api/secretaria', secretariaRoutes);
app.use('/api/secretaria', agendaRoutes);
app.use('/api/expedientes', expedienteRoutes);
app.get('/api/getRoleById/:id', authMiddleware, userController.getRoleById);
app.get('/api/roles/:id', authMiddleware, userController.getRoleById);

// Alias routes (frontend calls without /secretaria prefix)
const secretariaAccess = [authMiddleware, requireRoles(['secretaria', 'admin', 'administrador'])];
const agendaReadAccess = [authMiddleware, requireRoles(['doctor', 'secretaria', 'admin', 'administrador'])];
app.post('/api/doctors', authMiddleware, doctorController.createDoctor);
app.post('/api/patients', authMiddleware, patientController.createPatient);
app.get('/api/doctors', authMiddleware, secretariaController.getDoctors);
app.get('/api/doctors/mis-agendas/mes', authMiddleware, doctorController.getMyAgendasByMonth);
app.get('/api/doctors/me/agendas/mes', authMiddleware, doctorController.getMyAgendasByMonth);
app.get('/api/doctors/my-agendas/month', authMiddleware, doctorController.getMyAgendasByMonth);
app.get('/api/doctors/citas/:id/expediente', ...agendaReadAccess, expedienteController.openExpedienteByCita);
app.get('/api/doctors/especialidades', authMiddleware, doctorController.getEspecialidades);
app.get('/api/especialidades', authMiddleware, doctorController.getEspecialidades);
app.get('/api/getEspecialidades', authMiddleware, doctorController.getEspecialidades);
app.post('/api/agendas', ...secretariaAccess, agendaController.createAgenda);
app.get('/api/agendas/por-mes', ...agendaReadAccess, agendaController.listAgendasByMonth);
app.get('/api/agendas/mes', ...agendaReadAccess, agendaController.listAgendasByMonth);
app.get('/api/agendas/por-especialidad', ...agendaReadAccess, agendaController.listAgendasByEspecialidad);
app.get('/api/agendas/especialidad', ...agendaReadAccess, agendaController.listAgendasByEspecialidad);
app.get('/api/agendas', ...agendaReadAccess, agendaController.listAgendas);
app.get('/api/agendas/:id', ...agendaReadAccess, agendaController.getAgendaById);
app.get('/api/citas', ...agendaReadAccess, agendaController.listCitas);
app.patch('/api/citas/:id/asignar', ...secretariaAccess, agendaController.assignPacienteToCita);
app.patch('/api/citas/:id/estado', ...agendaReadAccess, agendaController.updateCitaEstado);
app.patch('/api/citas/:id', ...agendaReadAccess, agendaController.updateCita);
app.patch('/api/citas/:id/desasignar', ...secretariaAccess, agendaController.unassignPacienteFromCita);
app.get('/api/consultorios', ...secretariaAccess, secretariaController.getDoctorConsultorios);
app.get('/api/doctor-visits', ...secretariaAccess, (req, res, next) => {
  const date = req.query.date;
  if (date) {
    req.params.date = date;
    return secretariaController.getDoctorVisitsByDate(req, res, next);
  }
  return secretariaController.getDoctorVisits(req, res, next);
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido en el cuerpo de la solicitud' });
  }

  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = Number(process.env.PORT) || 3000;
const REQUIRE_DB_ON_START = String(process.env.REQUIRE_DB_ON_START || 'false').toLowerCase() === 'true';

async function startServer() {
  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`API ejecutandose en http://0.0.0.0:${PORT}`);

    const dbOk = await db.testConnection();
    if (!dbOk) {
      const message = 'No se pudo conectar a MySQL al iniciar la API.';
      if (REQUIRE_DB_ON_START) {
        console.error(`${message} Se detiene el proceso por REQUIRE_DB_ON_START=true.`);
        process.exit(1);
      }
      console.warn(`${message} La API permanece activa para responder preflight/health.`);
    }
  });
}

startServer();

process.on('SIGINT', async () => {
  await db.closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await db.closePool();
  process.exit(0);
});
