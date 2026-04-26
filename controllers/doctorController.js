const Doctor = require('../models/doctor');
const Agenda = require('../models/agenda');
const PAGE_SIZE = 20;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parsePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function parseYear(value) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return null;
  }
  return year;
}

function parseMonth(value) {
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return month;
}

function handleDbError(res, error, entityName) {
  if (error && error.code === 'VALIDATION_ERROR') {
    return res.status(400).json({ error: error.message });
  }

  if (error && error.code === 'ROLE_DOCTOR_NOT_FOUND') {
    return res.status(400).json({ error: error.message });
  }

  if (error && error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Ya existe un registro con los mismos datos unicos' });
  }

  if (error && error.code === 'ER_NO_SUCH_TABLE') {
    return res.status(500).json({ error: `La tabla de ${entityName} no existe en la base de datos` });
  }

  if (error && error.code === 'ER_BAD_FIELD_ERROR') {
    return res.status(500).json({ error: `Existe un campo invalido en la tabla de ${entityName}` });
  }

  console.error(`Error en ${entityName}:`, error.message, error.stack);
  return res.status(500).json({ error: `Error interno procesando ${entityName}` });
}

exports.createDoctor = async (req, res) => {
  try {
    const body = req.body || {};
    const nestedDoctor = body.doctor && typeof body.doctor === 'object' ? body.doctor : {};
    const payload = { ...body, ...nestedDoctor };

    const nombreRaw =
      payload.nombre ??
      payload.name ??
      payload.doctor_name ??
      payload.doctorName ??
      payload.nombreCompleto ??
      payload.fullName;
    const emailRaw =
      payload.email ??
      payload.correo ??
      payload.mail ??
      payload.correoElectronico;
    const identificacionRaw =
      payload.identificacion ??
      payload.identification ??
      payload.cedula ??
      payload.cedula_identidad ??
      payload.identificacionDoctor ??
      payload.idNumber;
    const passwordRaw =
      payload.password ??
      payload.contrasena ??
      payload.contraseña ??
      payload.contrasenia ??
      payload.clave ??
      payload.pass ??
      payload.claveAcceso;

    const nombre = nombreRaw != null ? String(nombreRaw).trim() : '';
    const email = emailRaw != null ? String(emailRaw).trim() : '';
    const identificacion = identificacionRaw != null ? String(identificacionRaw).trim() : '';
    const password = passwordRaw != null ? String(passwordRaw) : '';

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del doctor es obligatorio' });
    }

    if (!email || !identificacion || !password) {
      return res.status(400).json({
        error: 'email, identificacion y password son obligatorios',
        receivedKeys: Object.keys(payload),
        acceptedFields: {
          nombre: ['nombre', 'name', 'doctor_name', 'doctorName', 'nombreCompleto', 'fullName'],
          email: ['email', 'correo', 'mail', 'correoElectronico'],
          identificacion: ['identificacion', 'identification', 'cedula', 'cedula_identidad', 'identificacionDoctor', 'idNumber'],
          password: ['password', 'contrasena', 'contraseña', 'contrasenia', 'clave', 'pass', 'claveAcceso']
        }
      });
    }

    const especialidadInput =
      payload.especialidad_ids ??
      payload.especialidadIds ??
      payload.especialidades ??
      payload.especialidad_id ??
      payload.especialidadId ??
      payload.especialidad ??
      payload.especialidadSeleccionada ??
      payload.especialidadSeleccionadaId ??
      payload.especialidadValue ??
      payload.specialty_ids ??
      payload.specialtyIds ??
      payload.specialties ??
      payload.specialty;

    if (especialidadInput === undefined || especialidadInput === null || especialidadInput === '') {
      return res.status(400).json({
        error: 'Debe enviar al menos una especialidad para el doctor',
        receivedKeys: Object.keys(payload),
        acceptedFields: {
          especialidades: [
            'especialidad_ids',
            'especialidadIds',
            'especialidades',
            'especialidad_id',
            'especialidadId',
            'especialidad',
            'especialidadSeleccionada',
            'especialidadSeleccionadaId',
            'especialidadValue',
            'specialty_ids',
            'specialtyIds',
            'specialties',
            'specialty'
          ]
        }
      });
    }

    const doctor = await Doctor.create({
      ...payload,
      nombre,
      email,
      identificacion,
      password
    });
    return res.status(201).json({ doctor });
  } catch (error) {
    return handleDbError(res, error, 'doctores');
  }
};

exports.listDoctors = async (req, res) => {
  try {
    console.log('👨‍⚕️ listDoctors llamado');
    const page = parsePage(req.query && req.query.page);
    const { items: doctors, total } = await Doctor.findAllPaginated({ page, limit: PAGE_SIZE });
    console.log('✅ Doctores encontrados:', doctors.length);
    return res.status(200).json({
      doctors,
      items: doctors,
      total,
      page,
      limit: PAGE_SIZE,
      totalPages: Math.ceil(total / PAGE_SIZE)
    });
  } catch (error) {
    console.error('❌ Error en listDoctors:', error.message, error.stack);
    return handleDbError(res, error, 'doctores');
  }
};

exports.getDoctorById = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'El id del doctor es invalido' });
    }

    const doctor = await Doctor.findById(id);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor no encontrado' });
    }

    return res.status(200).json({ doctor });
  } catch (error) {
    return handleDbError(res, error, 'doctores');
  }
};

exports.searchDoctors = async (req, res) => {
  try {
    const nombre = req.query && req.query.nombre != null ? String(req.query.nombre).trim() : '';
    const identificacion = req.query && req.query.identificacion != null ? String(req.query.identificacion).trim() : '';
    const page = parsePage(req.query && req.query.page);

    if (!nombre && !identificacion) {
      return res.status(400).json({ error: 'Debe enviar nombre o identificacion para buscar doctores' });
    }

    const { items: doctors, total } = await Doctor.searchPaginated({
      nombre,
      identificacion,
      page,
      limit: PAGE_SIZE
    });
    return res.status(200).json({
      doctors,
      items: doctors,
      total,
      page,
      limit: PAGE_SIZE,
      totalPages: Math.ceil(total / PAGE_SIZE)
    });
  } catch (error) {
    return handleDbError(res, error, 'doctores');
  }
};

exports.getEspecialidades = async (req, res) => {
  try {
    const especialidades = await Doctor.findEspecialidadesCatalog();
    return res.status(200).json({
      especialidades,
      items: especialidades,
      total: especialidades.length
    });
  } catch (error) {
    return handleDbError(res, error, 'especialidades');
  }
};

exports.getMyAgendasByMonth = async (req, res) => {
  try {
    const doctorId = parseId(req.user && req.user.id);
    if (!doctorId) {
      return res.status(401).json({ error: 'No se pudo identificar al doctor autenticado' });
    }

    const year = parseYear((req.query && (req.query.year ?? req.query.anio ?? req.query.año ?? req.query.anyo)));
    const month = parseMonth((req.query && (req.query.month ?? req.query.mes)));

    if (!year) {
      return res.status(400).json({
        error: 'year es obligatorio y debe estar entre 2000 y 2100',
        acceptedFields: ['year', 'anio', 'año', 'anyo']
      });
    }

    if (!month) {
      return res.status(400).json({
        error: 'month es obligatorio y debe estar entre 1 y 12',
        acceptedFields: ['month', 'mes']
      });
    }

    const agendas = await Agenda.findAgendasByMonth({ year, month, doctorId });
    const sortedAgendas = agendas
      .slice()
      .sort((left, right) => {
        const leftCreatedAt = new Date(left.created_at).getTime() || 0;
        const rightCreatedAt = new Date(right.created_at).getTime() || 0;
        return rightCreatedAt - leftCreatedAt || Number(right.id) - Number(left.id);
      });

    return res.status(200).json({
      agendas: sortedAgendas,
      items: sortedAgendas,
      total: sortedAgendas.length,
      year,
      month,
      doctorId,
      sortBy: 'created_at_desc'
    });
  } catch (error) {
    return handleDbError(res, error, 'agendas de doctor');
  }
};