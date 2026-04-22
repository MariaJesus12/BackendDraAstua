const Expediente = require('../models/expediente');
const fs = require('fs');
const path = require('path');

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

const MIME_TO_EXTENSION = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'text/plain': 'txt',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
};

const DOCUMENTS_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'expedientes');
const DOCUMENTS_PUBLIC_BASE_PATH = '/uploads/expedientes';

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

  return normalized.split(';')[0].trim();
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

function sanitizeFileName(fileName) {
  const normalized = String(fileName || '').trim();
  if (!normalized) {
    return '';
  }

  const safe = normalized
    .replace(/[/\\]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return safe || '';
}

function getExtensionFromMimeType(mimeType) {
  const normalized = normalizeMimeType(mimeType);
  return MIME_TO_EXTENSION[normalized] || '';
}

async function ensureDocumentsUploadDirectory() {
  await fs.promises.mkdir(DOCUMENTS_UPLOAD_DIR, { recursive: true });
}

async function saveBufferToLocalStorage({ fileBuffer, fileName, mimeType }) {
  if (!Buffer.isBuffer(fileBuffer) || !fileBuffer.length) {
    const uploadError = new Error('Archivo invalido para guardar localmente');
    uploadError.code = 'VALIDATION_ERROR';
    throw uploadError;
  }

  const normalizedMimeType = normalizeMimeType(mimeType) || 'application/octet-stream';
  const safeName = sanitizeFileName(fileName || '');
  const providedExt = safeName.includes('.') ? safeName.split('.').pop().toLowerCase() : '';
  const defaultExt = getExtensionFromMimeType(normalizedMimeType);
  const resolvedExt = providedExt || defaultExt || 'bin';
  const baseName = safeName
    ? safeName.replace(new RegExp(`\\.${providedExt}$`, 'i'), '')
    : 'documento';
  const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}_${baseName}.${resolvedExt}`;

  await ensureDocumentsUploadDirectory();
  const absolutePath = path.join(DOCUMENTS_UPLOAD_DIR, uniqueName);
  await fs.promises.writeFile(absolutePath, fileBuffer);

  return {
    rutaArchivo: `${DOCUMENTS_PUBLIC_BASE_PATH}/${uniqueName}`,
    tipo: normalizedMimeType,
    nombreArchivo: safeName || `documento.${resolvedExt}`
  };
}

async function saveBase64ToLocalStorage({ fileBase64, fileName, mimeType }) {
  const parsed = parseBase64Input(fileBase64);
  if (!parsed) {
    return null;
  }

  const buffer = Buffer.from(parsed.base64, 'base64');
  if (!buffer.length) {
    const uploadError = new Error('fileBase64 es invalido');
    uploadError.code = 'VALIDATION_ERROR';
    throw uploadError;
  }

  return saveBufferToLocalStorage({
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
    const observacionId = parsePositiveInt(req.params.observacionId || req.params.id);
    if (!observacionId) {
      return res.status(400).json({ error: 'El id de la observacion es invalido' });
    }

    const multipleDocuments = normalizeDocumentPayloadList(body);
    const hasBodyValues = Object.keys(body).length > 0;
    const documentsToProcess = multipleDocuments.length ? [...multipleDocuments] : (hasBodyValues ? [body] : []);

    for (const file of multipartFiles) {
      documentsToProcess.push({
        fileBuffer: file.buffer,
        nombreArchivo: file.originalname,
        tipo: file.mimetype
      });
    }

    if (!documentsToProcess.length) {
      return res.status(400).json({
        error: 'Debe enviar rutaArchivo o fileBase64 para adjuntar el documento',
        acceptedFields: ['rutaArchivo', 'ruta_archivo', 'fileUrl', 'url', 'path', 'fileBase64', 'base64', 'file']
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

      let resolvedRuta = explicitRuta ? String(explicitRuta).trim() : '';
      let resolvedTipo = getBodyValueFromDocument(docPayload, ['tipo', 'mimeType', 'mimetype']);
      let resolvedNombre = getBodyValueFromDocument(docPayload, ['nombreArchivo', 'nombre_archivo', 'fileName', 'filename']);

      if (!resolvedRuta && fileBase64) {
        const uploaded = await saveBase64ToLocalStorage({
          fileBase64,
          fileName: resolvedNombre,
          mimeType: resolvedTipo
        });
        resolvedRuta = uploaded.rutaArchivo;
        resolvedTipo = uploaded.tipo;
        resolvedNombre = uploaded.nombreArchivo;
      }

      if (!resolvedRuta && fileBuffer) {
        const uploaded = await saveBufferToLocalStorage({
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

      const inferredMimeType =
        normalizeMimeType(resolvedTipo) ||
        getMimeTypeFromFileName(resolvedNombre) ||
        getMimeTypeFromFileName(resolvedRuta);

      if (!isAllowedDocumentType(inferredMimeType)) {
        return res.status(400).json({
          error: 'Tipo de documento no permitido',
          allowedMimeTypes: Array.from(ALLOWED_DOCUMENT_MIME_TYPES)
        });
      }

      preparedDocuments.push({
        observacionId,
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
