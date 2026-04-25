const Expediente = require('../models/expediente');

const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

const DOCUMENT_EXTENSION_TO_MIME = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

const MIME_TYPE_ALIASES = {
  'image/jpg': 'image/jpeg',
  'application/x-pdf': 'application/pdf',
  'application/acrobat': 'application/pdf',
  'applications/vnd.pdf': 'application/pdf',
  'text/x-log': 'text/plain'
};

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

function normalizeMimeType(mimeType) {
  const normalized = String(mimeType || '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  const bareMime = normalized.split(';')[0].trim();
  return MIME_TYPE_ALIASES[bareMime] || bareMime;
}

function getMimeTypeFromFileName(fileNameOrPath) {
  const value = String(fileNameOrPath || '').trim();
  if (!value) {
    return '';
  }

  const withoutQuery = value.split('?')[0];
  const dotIndex = withoutQuery.lastIndexOf('.');
  if (dotIndex === -1) {
    return '';
  }

  const extension = withoutQuery.slice(dotIndex + 1).toLowerCase();
  return DOCUMENT_EXTENSION_TO_MIME[extension] || '';
}

function isAllowedDocumentType(mimeType) {
  const normalized = normalizeMimeType(mimeType);
  return ALLOWED_DOCUMENT_MIME_TYPES.has(normalized);
}

function resolveAllowedDocumentMimeType({ providedMimeType, fileName, filePath }) {
  const normalizedProvidedMime = normalizeMimeType(providedMimeType);
  const inferredByFileName = getMimeTypeFromFileName(fileName);
  const inferredByFilePath = getMimeTypeFromFileName(filePath);

  if (isAllowedDocumentType(normalizedProvidedMime)) {
    return normalizedProvidedMime;
  }

  // Some clients send application/octet-stream or generic values; extension is a safer fallback.
  if (isAllowedDocumentType(inferredByFileName)) {
    return inferredByFileName;
  }

  if (isAllowedDocumentType(inferredByFilePath)) {
    return inferredByFilePath;
  }

  return normalizedProvidedMime || inferredByFileName || inferredByFilePath || '';
}

function normalizeDocumentPayloadList(body) {
  const list = pickFirstDefined([
    body.documentos,
    body.documents,
    body.archivos,
    body.files
  ]);

  if (list === undefined || list === null || list === '') {
    return [];
  }

  let resolved = list;
  if (typeof resolved === 'string') {
    const trimmed = resolved.trim();
    if (!trimmed) {
      return [];
    }

    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        resolved = JSON.parse(trimmed);
      } catch (_error) {
        resolved = trimmed;
      }
    }
  }

  if (Array.isArray(resolved)) {
    return resolved;
  }

  if (typeof resolved === 'object') {
    return [resolved];
  }

  return [{ rutaArchivo: resolved }];
}

function getBodyValueFromDocument(documentPayload, keys) {
  if (!documentPayload || typeof documentPayload !== 'object') {
    return undefined;
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(documentPayload, key)) {
      const value = documentPayload[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
  }

  return undefined;
}

function hasDocumentLikeFields(documentPayload) {
  if (!documentPayload || typeof documentPayload !== 'object') {
    return false;
  }

  const documentFieldKeys = [
    'rutaArchivo',
    'ruta_archivo',
    'fileUrl',
    'url',
    'path',
    'fileBase64',
    'base64',
    'file'
  ];

  return documentFieldKeys.some((key) => {
    if (!Object.prototype.hasOwnProperty.call(documentPayload, key)) {
      return false;
    }

    const value = documentPayload[key];
    return value !== undefined && value !== null && String(value).trim() !== '';
  });
}

function isObjectPlaceholderString(value) {
  return typeof value === 'string' && value.trim() === '[object Object]';
}

async function saveBufferToAzureStorage({ fileBuffer, fileName, mimeType }) {
  let azureStorage;
  try {
    azureStorage = require('../config/azureStorage');
  } catch (error) {
    const uploadError = new Error('No se puede usar Azure Blob porque falta la dependencia @azure/storage-blob');
    uploadError.code = 'AZURE_NOT_AVAILABLE';
    throw uploadError;
  }

  if (!azureStorage || typeof azureStorage.isConfigured !== 'function' || !azureStorage.isConfigured()) {
    const uploadError = new Error('Azure Blob no esta configurado. Revise AZURE_BLOB_SERVICE_SAS_URL y AZURE_STORAGE_CONTAINER_NAME.');
    uploadError.code = 'AZURE_NOT_CONFIGURED';
    throw uploadError;
  }

  try {
    const resolvedFileName = String(fileName || `documento_${Date.now()}`).trim();
    const resolvedMimeType = normalizeMimeType(mimeType) || 'application/octet-stream';
    const uploadedUrl = await azureStorage.uploadFile(fileBuffer, resolvedFileName, resolvedMimeType);
    return {
      rutaArchivo: uploadedUrl,
      tipo: resolvedMimeType,
      nombreArchivo: resolvedFileName
    };
  } catch (error) {
    const uploadError = new Error(`Error subiendo archivo a Azure Blob: ${error.message}`);
    uploadError.code = 'AZURE_UPLOAD_ERROR';
    throw uploadError;
  }
}

async function saveBufferToConfiguredStorage({ fileBuffer, fileName, mimeType }) {
  if (!Buffer.isBuffer(fileBuffer) || !fileBuffer.length) {
    const uploadError = new Error('El buffer del archivo es invalido');
    uploadError.code = 'VALIDATION_ERROR';
    throw uploadError;
  }

  return saveBufferToAzureStorage({ fileBuffer, fileName, mimeType });
}

async function saveBase64DocumentToAzure({ fileBase64, fileName, mimeType }) {
  const parsed = parseBase64Input(fileBase64);
  if (!parsed) {
    const uploadError = new Error('El contenido base64 es invalido o no se pudo procesar');
    uploadError.code = 'VALIDATION_ERROR';
    throw uploadError;
  }

  const buffer = Buffer.from(parsed.base64, 'base64');
  if (!buffer.length) {
    const uploadError = new Error('fileBase64 es invalido (buffer vacio)');
    uploadError.code = 'VALIDATION_ERROR';
    throw uploadError;
  }

  return saveBufferToConfiguredStorage({
    fileBuffer: buffer,
    fileName,
    mimeType: mimeType || parsed.mimeType || 'application/octet-stream'
  });
}

function handleError(res, error, fallbackMessage) {
  if (error && error.code === 'VALIDATION_ERROR') {
    return res.status(400).json({ error: error.message });
  }

  if (error && error.code === 'FORBIDDEN') {
    return res.status(403).json({ error: error.message });
  }

  if (error && (error.code === 'AZURE_NOT_AVAILABLE' || error.code === 'AZURE_NOT_CONFIGURED' || error.code === 'AZURE_UPLOAD_ERROR')) {
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
      enfermedadIds: normalizeIdArray(
        pickFirstDefined([
          body.enfermedadIds,
          body.enfermedadesIds,
          body.enfermedad_ids,
          body.enfermedades_ids,
          body.enfermedades
        ])
      ),
      medicamentoIds: normalizeIdArray(
        pickFirstDefined([
          body.medicamentoIds,
          body.medicamentosIds,
          body.medicamento_ids,
          body.medicamentos_ids,
          body.medicamentos
        ])
      ),
      alergiaIds: normalizeIdArray(
        pickFirstDefined([
          body.alergiaIds,
          body.alergiasIds,
          body.alergia_ids,
          body.alergias_ids,
          body.alergias
        ])
      )
    });

    return res.status(201).json({ observacion });
  } catch (error) {
    return handleError(res, error, 'Error interno creando observacion de expediente');
  }
};

exports.attachDocumento = async (req, res) => {
  try {
    const body = req.body || {};
    const multipartFiles = Array.isArray(req.files) ? req.files : [];
    const detalleId = parsePositiveInt(
      req.params.detalleId
      || req.params.observacionId
      || req.params.id
      || body.detalleId
      || body.detalle_id
      || body.observacionId
    );
    if (!detalleId) {
      return res.status(400).json({ error: 'El id del detalle del expediente es invalido' });
    }

    // Build documents list: real multipart files always take priority over body fields.
    // This avoids the [object Object] problem when the client appends a non-File value to FormData.
    const documentsToProcess = [];

    if (multipartFiles.length) {
      // Files from device (multipart/form-data) — ignore body.documentos entirely
      for (const file of multipartFiles) {
        documentsToProcess.push({
          fileBuffer: file.buffer,
          nombreArchivo: file.originalname,
          tipo: file.mimetype
        });
      }
    } else {
      // No multipart files — try JSON body (documentos array or direct fields)
      const multipleDocuments = normalizeDocumentPayloadList(body);
      if (multipleDocuments.length) {
        documentsToProcess.push(...multipleDocuments);
      } else if (hasDocumentLikeFields(body)) {
        documentsToProcess.push(body);
      }
    }

    if (!documentsToProcess.length) {
      return res.status(400).json({
        error: 'No se recibio ningun archivo. Envie archivos en multipart/form-data o fileBase64 en JSON.',
        acceptedMethods: [
          'multipart/form-data con archivos reales (input de archivo / DocumentPicker)',
          'JSON con campo fileBase64 (data URI base64)',
          'JSON con campo rutaArchivo (URL publica)'
        ]
      });
    }

    const preparedDocuments = [];
    const createdDocuments = [];
    const rootCitaId = parsePositiveInt(pickFirstDefined([body.citaId, body.cita_id]));

    for (const rawDocument of documentsToProcess) {
      const docPayload = (rawDocument && typeof rawDocument === 'object')
        ? rawDocument
        : { rutaArchivo: rawDocument };

      const explicitRuta = getBodyValueFromDocument(docPayload, ['rutaArchivo', 'ruta_archivo', 'fileUrl', 'url', 'path']);
      const fileBase64 = getBodyValueFromDocument(docPayload, ['fileBase64', 'base64', 'file']);
      const fileBuffer = Buffer.isBuffer(docPayload.fileBuffer) ? docPayload.fileBuffer : null;

      if (isObjectPlaceholderString(explicitRuta) || isObjectPlaceholderString(fileBase64)) {
        return res.status(400).json({
          error: 'El campo documentos llego como [object Object]. Debe enviar archivos reales en multipart/form-data.',
          detail: 'En web envie File/Blob en FormData. En React Native envie { uri, name, type } en FormData.',
          acceptedFields: ['documentos (archivo)', 'files (archivo)', 'fileBase64', 'rutaArchivo']
        });
      }

      let resolvedRuta = explicitRuta ? String(explicitRuta).trim() : '';
      let resolvedTipo = getBodyValueFromDocument(docPayload, ['tipo', 'mimeType', 'mimetype']);
      let resolvedNombre = getBodyValueFromDocument(docPayload, ['nombreArchivo', 'nombre_archivo', 'fileName', 'filename']);

      if (!resolvedRuta && fileBase64) {
        const uploaded = await saveBase64DocumentToAzure({
          fileBase64,
          fileName: resolvedNombre,
          mimeType: resolvedTipo
        });
        resolvedRuta = uploaded.rutaArchivo;
        resolvedTipo = uploaded.tipo;
        resolvedNombre = uploaded.nombreArchivo;
      }

      if (!resolvedRuta && fileBuffer) {
        const uploaded = await saveBufferToConfiguredStorage({
          fileBuffer,
          fileName: resolvedNombre,
          mimeType: resolvedTipo
        });
        resolvedRuta = uploaded.rutaArchivo;
        resolvedTipo = uploaded.tipo;
        resolvedNombre = uploaded.nombreArchivo;
      }

      if (!resolvedRuta) {
        return res.status(400).json({
          error: 'Cada documento debe incluir rutaArchivo o fileBase64',
          acceptedFields: ['rutaArchivo', 'ruta_archivo', 'fileUrl', 'url', 'path', 'fileBase64', 'base64', 'file']
        });
      }

      const inferredMimeType = resolveAllowedDocumentMimeType({
        providedMimeType: resolvedTipo,
        fileName: resolvedNombre,
        filePath: resolvedRuta
      });

      if (!isAllowedDocumentType(inferredMimeType)) {
        return res.status(400).json({
          error: 'Tipo de documento no permitido',
          allowedMimeTypes: Array.from(ALLOWED_DOCUMENT_MIME_TYPES)
        });
      }

      preparedDocuments.push({
        detalleId,
        citaId: parsePositiveInt(pickFirstDefined([
          docPayload.citaId,
          docPayload.cita_id,
          rootCitaId
        ])),
        uploadedBy: req.user && req.user.id,
        nombreArchivo: resolvedNombre || `documento_${Date.now()}`,
        rutaArchivo: resolvedRuta,
        tipo: inferredMimeType
      });
    }

    for (const preparedDocument of preparedDocuments) {
      const documento = await Expediente.attachDocumento(preparedDocument);
      createdDocuments.push(documento);
    }

    if (createdDocuments.length === 1) {
      return res.status(201).json({ documento: createdDocuments[0] });
    }

    return res.status(201).json({
      documentos: createdDocuments,
      total: createdDocuments.length
    });
  } catch (error) {
    return handleError(res, error, 'Error interno adjuntando documento al expediente');
  }
};

exports.getDocumentoTemporarySas = async (req, res) => {
  try {
    let azureStorage;
    try {
      azureStorage = require('../config/azureStorage');
    } catch (_error) {
      return res.status(500).json({ error: 'No se pudo cargar la configuracion de Azure Blob' });
    }

    const url = pickFirstDefined([
      req.query && req.query.rutaArchivo,
      req.query && req.query.ruta_archivo,
      req.query && req.query.url,
      req.body && req.body.rutaArchivo,
      req.body && req.body.ruta_archivo,
      req.body && req.body.url
    ]);

    if (!url) {
      return res.status(400).json({
        error: 'Debe enviar la URL del documento',
        acceptedFields: ['rutaArchivo', 'ruta_archivo', 'url']
      });
    }

    const expiresInMinutesRaw = pickFirstDefined([
      req.query && req.query.expiresInMinutes,
      req.query && req.query.expiraEnMinutos,
      req.body && req.body.expiresInMinutes,
      req.body && req.body.expiraEnMinutos
    ]);

    const expiresInMinutes = expiresInMinutesRaw !== undefined
      ? Math.max(1, Math.min(1440, Number(expiresInMinutesRaw) || 15))
      : 15;

    const temporary = await azureStorage.generateTemporaryBlobUrl(String(url).trim(), {
      expiresInMinutes,
      permissions: 'r'
    });

    return res.status(200).json({
      sasUrl: temporary.url,
      expiresOn: temporary.expiresOn,
      expiresInMinutes: temporary.expiresInMinutes
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo generar el SAS temporal' });
  }
};
