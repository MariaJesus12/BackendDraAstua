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

  async findConsultorioById(consultorioId) {
    const rows = await db.query(
      `SELECT c.id, c.nombre
       FROM consultorios c
       WHERE c.id = ?
       LIMIT 1`,
      [consultorioId]
    );

    return rows.length ? rows[0] : null;
  },

  async findAllConsultorios() {
    return db.query(
      `SELECT c.id, c.nombre
       FROM consultorios c
       ORDER BY c.nombre ASC`
    );
  },

  async findDoctorConflictByRoomAndDate({ consultorioId, date, doctorId }) {
    const rows = await db.query(
      `SELECT v.id,
              v.doctor_id,
              u.nombre AS doctor_name,
              v.consultorio_id,
              c.nombre AS consultorio_nombre,
              DATE_FORMAT(v.fecha, '%Y-%m-%d') AS fecha
       FROM visitas v
       INNER JOIN usuarios u ON u.id = v.doctor_id
       INNER JOIN consultorios c ON c.id = v.consultorio_id
       WHERE v.consultorio_id = ?
         AND v.fecha = ?
         AND v.doctor_id <> ?
       LIMIT 1`,
      [consultorioId, date, doctorId]
    );

    return rows.length ? rows[0] : null;
  },

  async findDoctorVisitRowsByDate(date) {
    return db.query(
      `SELECT v.id,
              v.doctor_id,
              u.nombre AS doctor_name,
              DATE_FORMAT(v.fecha, '%Y-%m-%d') AS fecha,
              TIME_FORMAT(v.hora_inicio, '%H:%i') AS hora_inicio,
              TIME_FORMAT(v.hora_fin, '%H:%i') AS hora_fin,
              v.estado,
              NULL AS motivo,
              v.consultorio_id,
              co.nombre AS consultorio_nombre,
              NULL AS especialidad
       FROM visitas v
       INNER JOIN usuarios u ON u.id = v.doctor_id
       INNER JOIN consultorios co ON co.id = v.consultorio_id
       WHERE v.fecha = ?
       GROUP BY v.id, v.doctor_id, u.nombre, v.fecha, v.hora_inicio, v.hora_fin, v.estado, v.consultorio_id, co.nombre
       ORDER BY v.hora_inicio ASC, u.nombre ASC`,
      [date]
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
       WHERE tabla_afectada IN ('visitas', 'citas')
         AND registro_id IN (${placeholders})
       ORDER BY id DESC`,
      citaIds
    );
  },

  async createDoctorVisit(payload) {
    console.log('📝 Creando visita con payload:', JSON.stringify(payload));

    const insertResult = await db.query(
      `INSERT INTO visitas (doctor_id, consultorio_id, fecha, hora_inicio, hora_fin, estado, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        payload.doctorId,
        payload.consultorioId,
        payload.date,
        payload.startTime,
        payload.endTime,
        payload.status || 'programada'
      ]
    );

    console.log('📊 Resultado INSERT:', insertResult);
    
    if (!insertResult || !insertResult.insertId) {
      console.error('❌ InsertResult no tiene insertId:', insertResult);
      throw new Error('No se obtuvo el ID de la cita creada');
    }

    const visitaId = insertResult.insertId;
    console.log('✅ Visita creada con id:', visitaId);

    if (payload.createdBy) {
      try {
        await db.query(
          `INSERT INTO auditoria (usuario_id, tabla_afectada, accion, registro_id, descripcion)
           VALUES (?, 'visitas', 'INSERT', ?, ?)`,
          [
            payload.createdBy,
            visitaId,
            JSON.stringify({
              source: 'secretaria-doctor-visit',
              consultorioId: payload.consultorioId,
              endTime: payload.endTime,
              notes: payload.notes || null,
              reason: payload.reason || null,
              status: payload.status || 'programada'
            })
          ]
        );

        console.log('✅ Auditoría registrada para visita:', visitaId);
      } catch (auditError) {
        // La visita ya fue creada; la auditoria se trata como best-effort.
        console.warn('⚠️ No se pudo registrar auditoría para visita:', visitaId, auditError.code || auditError.message);
      }
    } else {
      console.warn('⚠️ Se omitió auditoría por falta de usuario creador válido para visita:', visitaId);
    }

    const rows = await db.query(
      `SELECT v.id,
              v.doctor_id,
              u.nombre AS doctor_name,
              DATE_FORMAT(v.fecha, '%Y-%m-%d') AS fecha,
              TIME_FORMAT(v.hora_inicio, '%H:%i') AS hora_inicio,
              TIME_FORMAT(v.hora_fin, '%H:%i') AS hora_fin,
              v.estado,
              NULL AS motivo,
              v.consultorio_id,
              co.nombre AS consultorio_nombre,
              NULL AS especialidad
       FROM visitas v
       INNER JOIN usuarios u ON u.id = v.doctor_id
       INNER JOIN consultorios co ON co.id = v.consultorio_id
       WHERE v.id = ?
       GROUP BY v.id, v.doctor_id, u.nombre, v.fecha, v.hora_inicio, v.hora_fin, v.estado, v.consultorio_id, co.nombre
       LIMIT 1`,
      [visitaId]
    );

    console.log('✅ Visita recuperada desde BD:', rows.length > 0 ? rows[0].id : 'NO ENCONTRADA');
    return rows.length ? rows[0] : null;
  }
};

module.exports = Secretaria;