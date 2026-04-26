const Catalogo = require('../models/catalogo');

function handleDbError(res, error, entityName) {
  if (error && error.code === 'VALIDATION_ERROR') {
    return res.status(400).json({ error: error.message });
  }

  if (error && error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: `Ya existe un registro con el mismo nombre en ${entityName}` });
  }

  if (error && error.code === 'ER_BAD_NULL_ERROR') {
    return res.status(400).json({ error: `Faltan datos obligatorios para crear ${entityName}` });
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

function buildCatalogHandlers(tableName, responseKey) {
  return {
    async list(req, res) {
      try {
        const items = await Catalogo.findAll(tableName);
        return res.status(200).json({ [responseKey]: items, items, total: items.length });
      } catch (error) {
        return handleDbError(res, error, responseKey);
      }
    },

    async create(req, res) {
      try {
        const item = await Catalogo.create(tableName, req.body || {});
        return res.status(201).json({ [responseKey.slice(0, -1)]: item });
      } catch (error) {
        return handleDbError(res, error, responseKey);
      }
    }
  };
}

const medicamentosHandlers = buildCatalogHandlers('medicamentos', 'medicamentos');
const alergiasHandlers = buildCatalogHandlers('alergias', 'alergias');
const enfermedadesHandlers = buildCatalogHandlers('enfermedades', 'enfermedades');

module.exports = {
  listMedicamentos: medicamentosHandlers.list,
  createMedicamento: medicamentosHandlers.create,
  listAlergias: alergiasHandlers.list,
  createAlergia: alergiasHandlers.create,
  listEnfermedades: enfermedadesHandlers.list,
  createEnfermedad: enfermedadesHandlers.create
};
