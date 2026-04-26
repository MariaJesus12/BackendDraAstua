const multer = require('multer');

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_FILES = toPositiveInt(process.env.EXPEDIENTE_DOCS_MAX_FILES, 10);
const MAX_FILE_SIZE_MB = toPositiveInt(process.env.EXPEDIENTE_DOCS_MAX_FILE_SIZE_MB, 15);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_FILES,
    fileSize: MAX_FILE_SIZE_BYTES
  }
});

function expedienteDocumentsUpload(req, res, next) {
  const middleware = upload.any();
  middleware(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: `El archivo supera el tamano maximo permitido de ${MAX_FILE_SIZE_MB}MB`
      });
    }

    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: `Se permiten maximo ${MAX_FILES} archivos por solicitud`
      });
    }

    return res.status(400).json({ error: 'Error procesando archivos adjuntos' });
  });
}

module.exports = {
  expedienteDocumentsUpload
};
