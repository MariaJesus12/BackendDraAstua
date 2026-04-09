const Patient = require('../models/patient');

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function handleDbError(res, error, entityName) {
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

exports.createPatient = async (req, res) => {
  try {
    const payload = req.body || {};
    const nombre = payload.nombre != null ? String(payload.nombre).trim() : '';
    const identificacion = payload.identificacion != null ? String(payload.identificacion).trim() : '';

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del paciente es obligatorio' });
    }

    if (!identificacion) {
      return res.status(400).json({ error: 'La identificacion del paciente es obligatoria' });
    }

    const patient = await Patient.create({ ...payload, nombre, identificacion });
    return res.status(201).json({ patient });
  } catch (error) {
    if (error && error.message === 'No se recibieron campos validos para crear el paciente') {
      return res.status(400).json({ error: error.message });
    }

    return handleDbError(res, error, 'pacientes');
  }
};

exports.listPatients = async (req, res) => {
  try {
    const patients = await Patient.findAll();
    return res.status(200).json({ patients });
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