const Expediente = require('../models/expediente');

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function pickFirstDefined(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return undefined;
}

function normalizeIdArray(value) {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string' && value.includes(',')) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return [value];
}

function parseBase64Input(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    return null;
  }

  const dataUriMatch = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUriMatch) {
    return {
      mimeType: dataUriMatch[1],
      base64: dataUriMatch[2]
    };
  }

  return {
    mimeType: null,
    base64: raw
  };
}

async function uploadToAzureIfPossible({ fileBase64, fileName, mimeType }) {
  const parsed = parseBase64Input(fileBase64);
  if (!parsed) {
    return null;
  }

  let azureStorage;
  try {
    azureStorage = require('../config/azureStorage');
  } catch (error) {
    const uploadError = new Error('No se puede usar subida a Azure porque falta la dependencia @azure/storage-blob');
    uploadError.code = 'AZURE_NOT_AVAILABLE';
    throw uploadError;
  }

  if (!azureStorage || !azureStorage.containerClient) {
    const uploadError = new Error('Azure Storage no esta configurado. Envie rutaArchivo directa o configure Azure.');
    uploadError.code = 'AZURE_NOT_CONFIGURED';
    throw uploadError;
  }

  const buffer = Buffer.from(parsed.base64, 'base64');
  if (!buffer.length) {
    const uploadError = new Error('fileBase64 es invalido');
    uploadError.code = 'VALIDATION_ERROR';
    throw uploadError;
  }

  const resolvedFileName = String(fileName || `documento_${Date.now()}`).trim();
  const resolvedMimeType = String(mimeType || parsed.mimeType || 'application/octet-stream').trim();
  const uploadedUrl = await azureStorage.uploadFile(buffer, resolvedFileName, resolvedMimeType);
  return {
    rutaArchivo: uploadedUrl,
    tipo: resolvedMimeType,
    nombreArchivo: resolvedFileName
  };
}

function handleError(res, error, fallbackMessage) {
  if (error && error.code === 'VALIDATION_ERROR') {
    return res.status(400).json({ error: error.message });
  }

  if (error && error.code === 'FORBIDDEN') {
    return res.status(403).json({ error: error.message });
  }

  if (error && (error.code === 'AZURE_NOT_CONFIGURED' || error.code === 'AZURE_NOT_AVAILABLE')) {
    return res.status(400).json({ error: error.message });
  }

  if (error && error.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'Uno de los ids enviados no existe o rompe una relacion requerida' });
  }

  if (error && error.code === 'ER_BAD_NULL_ERROR') {
    return res.status(400).json({ error: 'Faltan datos requeridos para completar la operacion' });
  }

  if (error && error.code === 'ER_NO_SUCH_TABLE') {
    return res.status(500).json({ error: 'Falta una tabla requerida para operar expedientes' });
  }

  if (error && error.code === 'ER_BAD_FIELD_ERROR') {
    return res.status(500).json({ error: 'Existe un campo invalido en consultas de expedientes' });
  }

  console.error(fallbackMessage, error.message, error.stack);
  return res.status(500).json({ error: fallbackMessage });
}

exports.openExpedienteByCita = async (req, res) => {
  try {
    const citaId = parsePositiveInt(req.params.citaId || req.params.id);
    if (!citaId) {
      return res.status(400).json({ error: 'El id de la cita es invalido' });
    }

    const payload = await Expediente.openByCita({
      citaId,
      actorUserId: req.user && req.user.id,
      actorRoleName: req.user && req.user.roleName
    });

    return res.status(200).json(payload);
  } catch (error) {
    return handleError(res, error, 'Error interno abriendo expediente por cita');
  }
};

exports.getExpedienteById = async (req, res) => {
  try {
    const expedienteId = parsePositiveInt(req.params.id);
    if (!expedienteId) {
      return res.status(400).json({ error: 'El id del expediente es invalido' });
    }

    const expediente = await Expediente.getByIdForUser({
      expedienteId,
      actorUserId: req.user && req.user.id,
      actorRoleName: req.user && req.user.roleName
    });

    if (!expediente) {
      return res.status(404).json({ error: 'Expediente no encontrado' });
    }

    return res.status(200).json({ expediente });
  } catch (error) {
    return handleError(res, error, 'Error interno obteniendo expediente');
  }
};

exports.createObservacion = async (req, res) => {
  try {
    const body = req.body || {};
    const expedienteId = parsePositiveInt(req.params.id);
    const citaId = parsePositiveInt(pickFirstDefined([body.citaId, body.cita_id]));
    const descripcion = pickFirstDefined([body.descripcion, body.observacion, body.notes, body.nota]);

    if (!expedienteId) {
      return res.status(400).json({ error: 'El id del expediente es invalido' });
    }

    const observacion = await Expediente.createObservacion({
      expedienteId,
      citaId,
      doctorId: req.user && req.user.id,
      descripcion,
      bloqueada: pickFirstDefined([body.bloqueada, body.locked]),
      editable: pickFirstDefined([body.editable]),
      enfermedadIds: normalizeIdArray(pickFirstDefined([body.enfermedadIds, body.enfermedad_ids, body.enfermedades])),
      medicamentoIds: normalizeIdArray(pickFirstDefined([body.medicamentoIds, body.medicamento_ids, body.medicamentos])),
      alergiaIds: normalizeIdArray(pickFirstDefined([body.alergiaIds, body.alergia_ids, body.alergias]))
    });

    return res.status(201).json({ observacion });
  } catch (error) {
    return handleError(res, error, 'Error interno creando observacion de expediente');
  }
};

exports.attachDocumento = async (req, res) => {
  try {
    const body = req.body || {};
    const observacionId = parsePositiveInt(req.params.observacionId || req.params.id);
    if (!observacionId) {
      return res.status(400).json({ error: 'El id de la observacion es invalido' });
    }

    const explicitRuta = pickFirstDefined([
      body.rutaArchivo,
      body.ruta_archivo,
      body.fileUrl,
      body.url,
      body.path
    ]);

    const fileBase64 = pickFirstDefined([body.fileBase64, body.base64, body.file]);
    let resolvedRuta = explicitRuta ? String(explicitRuta).trim() : '';
    let resolvedTipo = pickFirstDefined([body.tipo, body.mimeType, body.mimetype]);
    let resolvedNombre = pickFirstDefined([body.nombreArchivo, body.nombre_archivo, body.fileName, body.filename]);

    if (!resolvedRuta && fileBase64) {
      const uploaded = await uploadToAzureIfPossible({
        fileBase64,
        fileName: resolvedNombre,
        mimeType: resolvedTipo
      });
      resolvedRuta = uploaded.rutaArchivo;
      resolvedTipo = uploaded.tipo;
      resolvedNombre = uploaded.nombreArchivo;
    }

    if (!resolvedRuta) {
      return res.status(400).json({
        error: 'Debe enviar rutaArchivo o fileBase64 para adjuntar el documento',
        acceptedFields: ['rutaArchivo', 'ruta_archivo', 'fileUrl', 'url', 'path', 'fileBase64', 'base64', 'file']
      });
    }

    const documento = await Expediente.attachDocumento({
      observacionId,
      citaId: parsePositiveInt(pickFirstDefined([body.citaId, body.cita_id])),
      uploadedBy: req.user && req.user.id,
      nombreArchivo: resolvedNombre || 'documento',
      rutaArchivo: resolvedRuta,
      tipo: resolvedTipo || 'archivo'
    });

    return res.status(201).json({ documento });
  } catch (error) {
    return handleError(res, error, 'Error interno adjuntando documento al expediente');
  }
};
