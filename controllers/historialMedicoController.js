const PDFDocument = require('pdfkit');
const HistorialMedico = require('../models/historialMedico');

function parseDoctorId(req) {
  const id = Number(req && req.user && req.user.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function safeText(value, fallback = 'N/A') {
  const text = String(value === undefined || value === null ? '' : value).trim();
  return text || fallback;
}

function formatDate(value) {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString('es-CR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function ensureSpace(doc, minSpace = 80) {
  if (doc.y > doc.page.height - minSpace) {
    doc.addPage();
  }
}

function printRelationLine(doc, title, items) {
  const values = (items || []).map((item) => item.nombre).filter(Boolean);
  doc.font('Helvetica-Bold').text(`${title}: `, { continued: true });
  doc.font('Helvetica').text(values.length ? values.join(', ') : 'Sin registros');
}

function printDocuments(doc, documentos) {
  if (!documentos || !documentos.length) {
    doc.text('Documentos: Sin registros');
    return;
  }

  doc.font('Helvetica-Bold').text('Documentos:');
  doc.moveDown(0.2);

  for (const documento of documentos) {
    ensureSpace(doc, 70);
    doc.font('Helvetica').text(`- ${safeText(documento.nombreArchivo, 'Documento')}`);
    doc.fontSize(9).fillColor('#444').text(`  Tipo: ${safeText(documento.tipo)}`);
    doc.fontSize(9).fillColor('#444').text(`  Ruta: ${safeText(documento.rutaArchivo)}`);
    doc.fontSize(10).fillColor('black');
  }
}

function buildFileName(paciente) {
  const base = `historial_${safeText(paciente.identificacion, 'paciente')}_${safeText(paciente.nombre, 'paciente')}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return `${base || 'historial_medico'}.pdf`;
}

function handleError(res, error) {
  if (error && error.code === 'VALIDATION_ERROR') {
    return res.status(400).json({ error: error.message });
  }

  if (error && error.code === 'FORBIDDEN') {
    return res.status(403).json({ error: error.message });
  }

  if (error && error.code === 'ER_NO_SUCH_TABLE') {
    return res.status(500).json({ error: 'Falta una tabla requerida para generar historial medico' });
  }

  if (error && error.code === 'ER_BAD_FIELD_ERROR') {
    return res.status(500).json({ error: 'Existe un campo invalido en las consultas de historial medico' });
  }

  console.error('Error generando historial medico PDF:', error.message, error.stack);
  return res.status(500).json({ error: 'Error interno generando historial medico en PDF' });
}

exports.downloadHistorialMedicoPdfByIdentificacion = async (req, res) => {
  try {
    const doctorId = parseDoctorId(req);
    if (!doctorId) {
      return res.status(401).json({ error: 'No se pudo identificar al doctor autenticado' });
    }

    const identificacion = String(req.params.identificacion || req.query.identificacion || '').trim();
    if (!identificacion) {
      return res.status(400).json({ error: 'identificacion es obligatoria' });
    }

    const data = await HistorialMedico.getByPacienteIdentificacionAndDoctor({
      identificacion,
      doctorId
    });

    if (!data) {
      return res.status(404).json({ error: 'No existe historial para ese paciente con el doctor autenticado' });
    }

    const fileName = buildFileName(data.paciente);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 45 });
    doc.pipe(res);

    doc.fontSize(18).font('Helvetica-Bold').text('Historial Medico del Paciente', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(`Generado: ${formatDate(new Date())}`, { align: 'right' });
    doc.moveDown(0.5);

    doc.fontSize(12).font('Helvetica-Bold').text('Datos del paciente');
    doc.font('Helvetica').fontSize(10);
    doc.text(`Nombre: ${safeText(data.paciente.nombre)}`);
    doc.text(`Identificacion: ${safeText(data.paciente.identificacion)}`);
    doc.text(`Email: ${safeText(data.paciente.email)}`);
    doc.text(`Telefono: ${safeText(data.paciente.telefono)}`);
    doc.text(`Fecha de nacimiento: ${safeText(data.paciente.fechaNacimiento)}`);
    doc.text(`Direccion: ${safeText(data.paciente.direccion)}`);
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').text('Resumen');
    doc.font('Helvetica');
    doc.text(`Total expedientes con este doctor: ${data.totalExpedientes}`);
    doc.text(`Total detalles registrados: ${data.totalDetalles}`);
    doc.text(`Total documentos adjuntos: ${data.totalDocumentos}`);
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(12).text('Detalle cronologico');
    doc.moveDown(0.4);

    if (!data.historial.length) {
      doc.font('Helvetica').fontSize(10).text('No existen detalles para este paciente con el doctor autenticado.');
    } else {
      for (let index = 0; index < data.historial.length; index += 1) {
        const detalle = data.historial[index];
        ensureSpace(doc, 140);

        doc.font('Helvetica-Bold').fontSize(11).text(`Detalle #${index + 1} (ID ${detalle.id})`);
        doc.font('Helvetica').fontSize(10);
        doc.text(`Fecha: ${formatDate(detalle.createdAt)}`);
        doc.text(`Doctor: ${safeText(detalle.doctorNombre, `ID ${detalle.doctorId}`)}`);
        doc.text(`Observaciones: ${safeText(detalle.observaciones, 'Sin observaciones')}`);

        printRelationLine(doc, 'Enfermedades', detalle.enfermedades);
        printRelationLine(doc, 'Medicamentos', detalle.medicamentos);
        printRelationLine(doc, 'Alergias', detalle.alergias);
        printDocuments(doc, detalle.documentos);

        doc.moveDown(0.8);
        doc.moveTo(doc.page.margins.left, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y)
          .strokeColor('#cccccc')
          .stroke();
        doc.moveDown(0.8);
      }
    }

    doc.end();
  } catch (error) {
    return handleError(res, error);
  }
};
