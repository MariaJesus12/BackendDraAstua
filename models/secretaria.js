const DbService = require('../config/database');

const db = DbService.getInstance();

function buildInClauseParams(ids) {
  return ids.map(() => '?').join(', ');
}

const Secretaria = {
  async findDoctorById(doctorId) {
    const rows = await db.query(
      `SELECT u.id, u.nombre, u.activo, r.nombre AS rol_nombre
       FROM usuarios u
       INNER JOIN roles r ON r.id = u.rol_id
       WHERE u.id = ?
       LIMIT 1`,
      [doctorId]
    );

    return rows.length ? rows[0] : null;
  },

  async findDoctorPrimarySpecialtyId(doctorId) {
    const rows = await db.query(
      `SELECT de.especialidad_id
       FROM doctor_especialidad de
       WHERE de.doctor_id = ?
       ORDER BY de.especialidad_id ASC
       LIMIT 1`,
      [doctorId]
    );

    return rows.length ? rows[0].especialidad_id : null;
  },

  async findDoctorVisitRows(fromDate, toDate) {
    return db.query(
      `SELECT c.id,
              c.doctor_id,
              u.nombre AS doctor_name,
              c.fecha,
              TIME_FORMAT(c.hora, '%H:%i') AS hora_inicio,
              c.estado,
              c.motivo,
              COALESCE(es.nombre, esp.specialty) AS especialidad
       FROM citas c
       INNER JOIN usuarios u ON u.id = c.doctor_id
       LEFT JOIN especialidades es ON es.id = c.especialidad_id
       LEFT JOIN (
         SELECT de.doctor_id,
                GROUP_CONCAT(DISTINCT e.nombre ORDER BY e.nombre ASC SEPARATOR ', ') AS specialty
         FROM doctor_especialidad de
         INNER JOIN especialidades e ON e.id = de.especialidad_id
         GROUP BY de.doctor_id
       ) esp ON esp.doctor_id = c.doctor_id
       WHERE c.fecha BETWEEN ? AND ?
       ORDER BY c.fecha ASC, c.hora ASC, u.nombre ASC`,
      [fromDate, toDate]
    );
  },

  async findDoctorVisitRowsByDate(date) {
    return db.query(
      `SELECT c.id,
              c.doctor_id,
              u.nombre AS doctor_name,
              c.fecha,
              TIME_FORMAT(c.hora, '%H:%i') AS hora_inicio,
              c.estado,
              c.motivo,
              COALESCE(es.nombre, esp.specialty) AS especialidad
       FROM citas c
       INNER JOIN usuarios u ON u.id = c.doctor_id
       LEFT JOIN especialidades es ON es.id = c.especialidad_id
       LEFT JOIN (
         SELECT de.doctor_id,
                GROUP_CONCAT(DISTINCT e.nombre ORDER BY e.nombre ASC SEPARATOR ', ') AS specialty
         FROM doctor_especialidad de
         INNER JOIN especialidades e ON e.id = de.especialidad_id
         GROUP BY de.doctor_id
       ) esp ON esp.doctor_id = c.doctor_id
       WHERE c.fecha = ?
       ORDER BY c.hora ASC, u.nombre ASC`,
      [date]
    );
  },

  async findDoctorVisitsSummaryByMonth(month) {
    return db.query(
      `SELECT DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha,
              COUNT(*) AS cantidad
       FROM citas c
       WHERE DATE_FORMAT(c.fecha, '%Y-%m') = ?
       GROUP BY c.fecha
       ORDER BY c.fecha ASC`,
      [month]
    );
  },

  async findAuditMetadataByCitaIds(citaIds) {
    if (!citaIds.length) {
      return [];
    }

    const placeholders = buildInClauseParams(citaIds);
    return db.query(
      `SELECT id, registro_id AS cita_id, descripcion
       FROM auditoria
       WHERE tabla_afectada = 'citas'
         AND registro_id IN (${placeholders})
       ORDER BY id DESC`,
      citaIds
    );
  },

  async createDoctorVisit(payload) {
    console.log('📝 Creando visita con payload:', JSON.stringify(payload));
    
    const insertResult = await db.query(
      `INSERT INTO citas (expediente_id, doctor_id, especialidad_id, fecha, hora, estado, motivo)
       VALUES (?, ?, ?, ?, ?, 'pendiente', ?)`,
      [
        payload.expedienteId || null,
        payload.doctorId,
        payload.especialidadId || null,
        payload.date,
        payload.startTime,
        payload.reason || null
      ]
    );

    console.log('📊 Resultado INSERT:', insertResult);
    
    if (!insertResult || !insertResult.insertId) {
      console.error('❌ InsertResult no tiene insertId:', insertResult);
      throw new Error('No se obtuvo el ID de la cita creada');
    }

    const citaId = insertResult.insertId;
    console.log('✅ Cita creada con id:', citaId);

    await db.query(
      `INSERT INTO auditoria (usuario_id, tabla_afectada, accion, registro_id, descripcion)
       VALUES (?, 'citas', 'INSERT', ?, ?)`,
      [
        payload.createdBy,
        citaId,
        JSON.stringify({
          source: 'secretaria-doctor-visit',
          endTime: payload.endTime,
          notes: payload.notes || null
        })
      ]
    );

    console.log('✅ Auditoría registrada para cita:', citaId);

    const rows = await db.query(
      `SELECT c.id,
              c.doctor_id,
              u.nombre AS doctor_name,
              c.fecha,
              TIME_FORMAT(c.hora, '%H:%i') AS hora_inicio,
              c.estado,
              c.motivo,
              COALESCE(es.nombre, esp.specialty) AS especialidad
       FROM citas c
       INNER JOIN usuarios u ON u.id = c.doctor_id
       LEFT JOIN especialidades es ON es.id = c.especialidad_id
       LEFT JOIN (
         SELECT de.doctor_id,
                GROUP_CONCAT(DISTINCT e.nombre ORDER BY e.nombre ASC SEPARATOR ', ') AS specialty
         FROM doctor_especialidad de
         INNER JOIN especialidades e ON e.id = de.especialidad_id
         GROUP BY de.doctor_id
       ) esp ON esp.doctor_id = c.doctor_id
       WHERE c.id = ?
       LIMIT 1`,
      [citaId]
    );

    console.log('✅ Cita recuperada desde BD:', rows.length > 0 ? rows[0].id : 'NO ENCONTRADA');
    return rows.length ? rows[0] : null;
  }
};

module.exports = Secretaria;