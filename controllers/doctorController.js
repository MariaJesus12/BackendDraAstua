const Doctor = require('../models/doctor');

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
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
    const payload = req.body || {};
    const nombre = payload.nombre != null ? String(payload.nombre).trim() : '';
    const email = payload.email != null ? String(payload.email).trim() : '';
    const identificacion = payload.identificacion != null ? String(payload.identificacion).trim() : '';
    const password = payload.password != null ? String(payload.password) : '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del doctor es obligatorio' });
    }

    if (!email || !identificacion || !password) {
      return res.status(400).json({ error: 'email, identificacion y password son obligatorios' });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'El email del doctor no tiene un formato valido' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La password del doctor debe tener al menos 6 caracteres' });
    }

    const doctor = await Doctor.create({ ...payload, nombre, email, identificacion, password });
    return res.status(201).json({ doctor });
  } catch (error) {
    return handleDbError(res, error, 'doctores');
  }
};

exports.listDoctors = async (req, res) => {
  try {
    console.log('👨‍⚕️ listDoctors llamado');
    const doctors = await Doctor.findAll();
    console.log('✅ Doctores encontrados:', doctors.length);
    return res.status(200).json({
      doctors,
      items: doctors,
      total: doctors.length
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