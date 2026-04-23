const Patient = require('../models/patient');
const PAGE_SIZE = 20;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parsePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function handleDbError(res, error, entityName) {
  if (error && error.code === 'VALIDATION_ERROR') {
    return res.status(400).json({ error: error.message });
  }

  if (error && error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Ya existe un registro con los mismos datos unicos' });
  }

  if (error && error.code === 'ER_BAD_NULL_ERROR') {
    return res.status(400).json({ error: 'Faltan datos obligatorios para crear el paciente' });
  }

  if (error && error.code === 'ER_TRUNCATED_WRONG_VALUE') {
    return res.status(400).json({ error: 'Uno de los valores del paciente tiene formato invalido' });
  }

  if (error && error.code === 'ER_DATA_TOO_LONG') {
    return res.status(422).json({ error: 'Uno de los campos del paciente supera la longitud permitida' });
  }

  if (error && error.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'Uno de los ids de relacion no existe en catalogos de paciente' });
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

exports.createPatient = async (req, res) => {
  try {
    const payload = req.body || {};
    const patient = await Patient.create(payload);
    return res.status(201).json({ patient });
  } catch (error) {
    return handleDbError(res, error, 'pacientes');
  }
};

exports.listPatients = async (req, res) => {
  try {
    const page = parsePage(req.query && req.query.page);
    const { items: patients, total } = await Patient.findAllPaginated({ page, limit: PAGE_SIZE });
    return res.status(200).json({
      patients,
      items: patients,
      total,
      page,
      limit: PAGE_SIZE,
      totalPages: Math.ceil(total / PAGE_SIZE)
    });
  } catch (error) {
    return handleDbError(res, error, 'pacientes');
  }
};

exports.getPatientById = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'El id del paciente es invalido' });
    }

    const patient = await Patient.findById(id);
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    return res.status(200).json({ patient });
  } catch (error) {
    return handleDbError(res, error, 'pacientes');
  }
};

exports.getPatientRelationsById = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'El id del paciente es invalido' });
    }

    const patient = await Patient.findById(id);
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    const relaciones = {
      pacienteId: patient.id,
      medicamentos: patient.medicamentos || [],
      medicamento_ids: patient.medicamento_ids || [],
      alergias: patient.alergias || [],
      alergia_ids: patient.alergia_ids || [],
      enfermedades: patient.enfermedades || [],
      enfermedad_ids: patient.enfermedad_ids || []
    };

    return res.status(200).json({ relaciones });
  } catch (error) {
    return handleDbError(res, error, 'pacientes');
  }
};

exports.searchPatients = async (req, res) => {
  try {
    const nombre = req.query && req.query.nombre != null ? String(req.query.nombre).trim() : '';
    const identificacion = req.query && req.query.identificacion != null ? String(req.query.identificacion).trim() : '';
    const page = parsePage(req.query && req.query.page);

    if (!nombre && !identificacion) {
      return res.status(400).json({ error: 'Debe enviar nombre o identificacion para buscar pacientes' });
    }

    const { items: patients, total } = await Patient.searchPaginated({
      nombre,
      identificacion,
      page,
      limit: PAGE_SIZE
    });
    return res.status(200).json({
      patients,
      items: patients,
      total,
      page,
      limit: PAGE_SIZE,
      totalPages: Math.ceil(total / PAGE_SIZE)
    });
  } catch (error) {
    return handleDbError(res, error, 'pacientes');
  }
};

exports.getMedicamentos = async (req, res) => {
  try {
    const medicamentos = await Patient.findMedicamentos();
    return res.status(200).json({ medicamentos, items: medicamentos, total: medicamentos.length });
  } catch (error) {
    return handleDbError(res, error, 'medicamentos');
  }
};

exports.getAlergias = async (req, res) => {
  try {
    const alergias = await Patient.findAlergias();
    return res.status(200).json({ alergias, items: alergias, total: alergias.length });
  } catch (error) {
    return handleDbError(res, error, 'alergias');
  }
};

exports.getEnfermedades = async (req, res) => {
  try {
    const enfermedades = await Patient.findEnfermedades();
    return res.status(200).json({ enfermedades, items: enfermedades, total: enfermedades.length });
  } catch (error) {
    return handleDbError(res, error, 'enfermedades');
  }
};