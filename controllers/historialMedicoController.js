'use strict';

const PDFDocument = require('pdfkit');
const HistorialMedico = require('../models/historialMedico');
const path = require('path');
const fs = require('fs');

// ── Brand ────────────────────────────────────────────────────────────────────
const BRAND_NAME    = 'Consultorio Dra. Karla Astua';
const BRAND_TAGLINE = 'Consultorio Medico';
const LOGO_PATH     = path.join(__dirname, '..', 'assets', 'logo.png');

// Paleta de colores basada en el logo (teal)
const C = {
  primary:   '#1A9B8D',
  dark:      '#136B63',
  light:     '#E0F7F5',
  mid:       '#B0DDD9',
  pale:      '#F2FDFB',
  white:     '#FFFFFF',
  text:      '#1A2E2C',
  muted:     '#617B78',
  border:    '#C5E8E4',
  redTag:    '#B83228',
  orangeTag: '#C94E00',
};

const PAGE_W      = 595.28;
const PAGE_H      = 841.89;
const MARGIN      = 45;
const CW          = PAGE_W - MARGIN * 2;
const HEADER_H    = 104;
const CONTENT_TOP = HEADER_H + 4 + 14;
const FOOTER_Y    = PAGE_H - 30;

// ── Utilities ─────────────────────────────────────────────────────────────────
function safeText(value, fallback) {
  const fb = fallback !== undefined ? fallback : 'N/A';
  const text = String(value === undefined || value === null ? '' : value).trim();
  return text || fb;
}

function formatDateLong(value) {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString('es-CR', {
    year: 'numeric', month: 'long', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDateShort(value) {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('es-CR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function logoExists() {
  try { return fs.existsSync(LOGO_PATH); } catch (_) { return false; }
}

function buildFileName(paciente) {
  const base = `historial_${safeText(paciente.identificacion, 'paciente')}_${safeText(paciente.nombre, 'paciente')}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return `${base || 'historial_medico'}.pdf`;
}

function parseDoctorId(req) {
  const id = Number(req && req.user && req.user.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function handleError(res, error) {
  if (error && error.code === 'VALIDATION_ERROR')   return res.status(400).json({ error: error.message });
  if (error && error.code === 'FORBIDDEN')          return res.status(403).json({ error: error.message });
  if (error && error.code === 'ER_NO_SUCH_TABLE')   return res.status(500).json({ error: 'Falta una tabla requerida para generar historial' });
  if (error && error.code === 'ER_BAD_FIELD_ERROR') return res.status(500).json({ error: 'Campo invalido en historial medico' });
  console.error('Error generando historial medico PDF:', error.message, error.stack);
  return res.status(500).json({ error: 'Error interno generando historial medico en PDF' });
}

// ── Primitivos de dibujo ──────────────────────────────────────────────────────
function fillRect(doc, x, y, w, h, color) {
  doc.save().rect(x, y, w, h).fillColor(color).fill().restore();
}

function strokeRect(doc, x, y, w, h, color, lw) {
  doc.save().rect(x, y, w, h).lineWidth(lw || 0.6).strokeColor(color || C.border).stroke().restore();
}

function hLine(doc, y, x1, x2, color, lw) {
  doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(lw || 0.5).strokeColor(color || C.mid).stroke().restore();
}

// ── Encabezado de página ──────────────────────────────────────────────────────
function drawHeader(doc, pageNum) {
  // Banda teal
  fillRect(doc, 0, 0, PAGE_W, HEADER_H, C.primary);
  // Acento oscuro inferior
  fillRect(doc, 0, HEADER_H, PAGE_W, 4, C.dark);

  // Logo
  const hasLogo = logoExists();
  const LOGO_SIZE = 82;
  const logoX = MARGIN;
  const logoY = (HEADER_H - LOGO_SIZE) / 2;

  if (hasLogo) {
    doc.image(LOGO_PATH, logoX, logoY, { width: LOGO_SIZE, height: LOGO_SIZE });
  }

  // Textos del encabezado
  const textX = hasLogo ? logoX + LOGO_SIZE + 14 : MARGIN;
  const textW  = PAGE_W - textX - MARGIN - 60;

  doc.save()
    .fillColor(C.white)
    .font('Helvetica').fontSize(7.5).characterSpacing(2)
    .text(BRAND_TAGLINE.toUpperCase(), textX, 26, { width: textW, lineBreak: false })
    .font('Helvetica-Bold').fontSize(18).characterSpacing(0)
    .text(BRAND_NAME, textX, 38, { width: textW })
    .font('Helvetica').fontSize(9).fillColor('#C8EFEB')
    .text('Historial Medico del Paciente', textX, 66, { width: textW })
    .restore();

  // Numero de pagina (esquina derecha del header)
  doc.save()
    .fillColor(C.white).font('Helvetica').fontSize(8)
    .text(`Pag. ${pageNum}`, PAGE_W - MARGIN - 40, HEADER_H - 18, { width: 40, align: 'right' })
    .restore();
}

// ── Footer de página ──────────────────────────────────────────────────────────
function drawFooter(doc) {
  hLine(doc, FOOTER_Y, MARGIN, PAGE_W - MARGIN, C.mid, 0.5);
  doc.save()
    .fillColor(C.muted).font('Helvetica').fontSize(7.5)
    .text(`${BRAND_NAME}  \u2022  Documento Confidencial`, MARGIN, FOOTER_Y + 7, {
      width: CW, align: 'center',
    })
    .restore();
}

// ── Etiqueta de sección ───────────────────────────────────────────────────────
function drawSectionLabel(doc, title) {
  const y = doc.y;
  fillRect(doc, MARGIN, y, CW, 24, C.light);
  fillRect(doc, MARGIN, y, 4, 24, C.primary);
  doc.save()
    .fillColor(C.dark).font('Helvetica-Bold').fontSize(9.5).characterSpacing(0.8)
    .text(title.toUpperCase(), MARGIN + 14, y + 7, { width: CW - 20 })
    .restore();
  doc.y = y + 24 + 8;
}

// ── Caja de datos del paciente ────────────────────────────────────────────────
function drawPatientBox(doc, paciente, generatedAt) {
  const y     = doc.y;
  const PAD   = 14;
  const COL_W = (CW - PAD * 3) / 2;

  // Fondo y borde
  fillRect(doc, MARGIN, y, CW, 108, C.pale);
  strokeRect(doc, MARGIN, y, CW, 108, C.border, 0.7);
  // Franja izquierda decorativa
  fillRect(doc, MARGIN, y, 4, 108, C.primary);

  function field(label, value, fx, fy) {
    doc.save()
      .fillColor(C.muted).font('Helvetica').fontSize(7.5)
      .text(label.toUpperCase(), fx, fy, { width: COL_W, lineBreak: false })
      .fillColor(C.text).font('Helvetica-Bold').fontSize(9.5)
      .text(value, fx, fy + 10, { width: COL_W })
      .restore();
  }

  const c1 = MARGIN + PAD;
  const c2 = MARGIN + PAD + COL_W + PAD;
  let fy = y + 12;

  field('Nombre completo',      safeText(paciente.nombre),           c1, fy);
  field('Identificacion',       safeText(paciente.identificacion),   c2, fy);
  fy += 30;
  field('Fecha de nacimiento',  formatDateShort(paciente.fechaNacimiento), c1, fy);
  field('Telefono',             safeText(paciente.telefono),         c2, fy);
  fy += 30;
  field('Correo electronico',   safeText(paciente.email),            c1, fy);
  field('Direccion',            safeText(paciente.direccion),        c2, fy);
  fy += 30;
  field('Fecha de generacion',  formatDateLong(generatedAt),         c1, fy);

  doc.y = y + 108 + 12;
}

// ── Fila de estadísticas ──────────────────────────────────────────────────────
function drawStatsRow(doc, expedientes, detalles, documentos) {
  const stats = [
    { value: String(expedientes), label: 'Expedientes' },
    { value: String(detalles),    label: 'Consultas' },
    { value: String(documentos),  label: 'Documentos' },
  ];

  const BOX_H = 50;
  const GAP   = 8;
  const BOX_W = (CW - GAP * 2) / 3;
  const y     = doc.y;

  for (let i = 0; i < stats.length; i++) {
    const bx = MARGIN + i * (BOX_W + GAP);
    fillRect(doc, bx, y, BOX_W, BOX_H, C.pale);
    strokeRect(doc, bx, y, BOX_W, BOX_H, C.border, 0.6);
    fillRect(doc, bx, y, BOX_W, 3, C.primary);

    doc.save()
      .fillColor(C.primary).font('Helvetica-Bold').fontSize(22)
      .text(stats[i].value, bx, y + 10, { width: BOX_W, align: 'center' })
      .fillColor(C.muted).font('Helvetica').fontSize(7.5).characterSpacing(0.5)
      .text(stats[i].label.toUpperCase(), bx, y + 36, { width: BOX_W, align: 'center' })
      .restore();
  }

  doc.y = y + BOX_H + 14;
}

// ── Card de consulta ──────────────────────────────────────────────────────────
function drawConsultationCard(doc, detalle, index, onNewPage) {
  if (doc.y > FOOTER_Y - 140) {
    onNewPage();
  }

  const cx = MARGIN;
  const cy = doc.y;

  // Cabecera de la card (teal)
  const HDR_H = 28;
  fillRect(doc, cx, cy, CW, HDR_H, C.primary);

  // Badge con número de consulta
  fillRect(doc, cx, cy, 32, HDR_H, C.dark);
  doc.save()
    .fillColor(C.white).font('Helvetica-Bold').fontSize(11)
    .text(String(index + 1).padStart(2, '0'), cx, cy + 8, { width: 32, align: 'center', lineBreak: false })
    .restore();

  // Fecha y doctor en cabecera
  const halfW = (CW - 36) / 2;
  doc.save()
    .fillColor(C.white).font('Helvetica-Bold').fontSize(8.5)
    .text(formatDateLong(detalle.createdAt), cx + 38, cy + 4, {
      width: halfW - 4, lineBreak: false,
    })
    .fillColor('#C8EFEB').font('Helvetica').fontSize(8)
    .text(`Dr(a). ${safeText(detalle.doctorNombre, 'Sin asignar')}`,
      cx + 38 + halfW, cy + 6, { width: halfW - 6, align: 'right', lineBreak: false })
    .restore();

  // Franja decorativa bajo cabecera
  fillRect(doc, cx, cy + HDR_H, CW, 5, C.light);

  // Cuerpo de la card
  const bodyY = cy + HDR_H + 5 + 10;
  doc.y = bodyY;

  // Observaciones
  doc.save()
    .fillColor(C.muted).font('Helvetica').fontSize(7.5).characterSpacing(0.4)
    .text('OBSERVACIONES', MARGIN + 10, doc.y)
    .restore();
  doc.moveDown(0.25);
  doc.save()
    .fillColor(C.text).font('Helvetica').fontSize(9.5)
    .text(safeText(detalle.observaciones, 'Sin observaciones registradas'),
      MARGIN + 10, doc.y, { width: CW - 20, align: 'justify', lineGap: 1.5 })
    .restore();
  doc.moveDown(0.5);

  // Tags de enfermedades, medicamentos, alergias
  function tagLine(label, items, color) {
    const names = (items || []).map((i) => i.nombre).filter(Boolean);
    if (!names.length) return;
    doc.save()
      .fillColor(C.muted).font('Helvetica').fontSize(8)
      .text(`${label}: `, MARGIN + 10, doc.y, { continued: true, lineBreak: false })
      .fillColor(color || C.dark).font('Helvetica-Bold').fontSize(8.5)
      .text(names.join('  |  '))
      .restore();
    doc.moveDown(0.3);
  }

  tagLine('Enfermedades', detalle.enfermedades, C.redTag);
  tagLine('Medicamentos',  detalle.medicamentos,  C.dark);
  tagLine('Alergias',      detalle.alergias,      C.orangeTag);

  // Documentos adjuntos (solo nombre y tipo, sin IDs ni rutas)
  const docs = (detalle.documentos || []);
  if (docs.length) {
    doc.save()
      .fillColor(C.muted).font('Helvetica').fontSize(7.5).characterSpacing(0.4)
      .text(`DOCUMENTOS ADJUNTOS (${docs.length})`, MARGIN + 10, doc.y)
      .restore();
    doc.moveDown(0.25);
    for (const d of docs) {
      doc.save()
        .fillColor(C.dark).font('Helvetica').fontSize(9)
        .text(`\u2022  ${safeText(d.nombreArchivo, 'Archivo')}`, MARGIN + 18, doc.y, { continued: true })
        .fillColor(C.muted).font('Helvetica').fontSize(8)
        .text(`  [${safeText(d.tipo, 'archivo')}]`)
        .restore();
      doc.moveDown(0.25);
    }
  }

  doc.moveDown(0.5);

  // Borde exterior de la card
  const cardEndY = doc.y;
  strokeRect(doc, cx, cy, CW, cardEndY - cy, C.mid, 0.6);

  doc.y = cardEndY + 10;
}

// ── Controlador principal ─────────────────────────────────────────────────────
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

    const data = await HistorialMedico.getByPacienteIdentificacionAndDoctor({ identificacion, doctorId });
    if (!data) {
      return res.status(404).json({ error: 'No existe historial para ese paciente con el doctor autenticado' });
    }

    const fileName = buildFileName(data.paciente);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Bufferear en memoria para poder enviar Content-Length
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    doc.on('data', (chunk) => chunks.push(chunk));

    await new Promise((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);

      let pageNum = 0;

      function newPage() {
        pageNum += 1;
        doc.addPage({ size: 'A4', margin: 0 });
        drawHeader(doc, pageNum);
        drawFooter(doc);
        doc.y = CONTENT_TOP;
        doc.x = MARGIN;
      }

      newPage();

      // ── Datos del paciente
      drawSectionLabel(doc, 'Datos del Paciente');
      drawPatientBox(doc, data.paciente, new Date());

      // ── Estadísticas
      drawSectionLabel(doc, 'Resumen');
      drawStatsRow(doc, data.totalExpedientes, data.totalDetalles, data.totalDocumentos);

      // ── Consultas
      drawSectionLabel(doc, 'Detalle de Consultas');

      if (!data.historial.length) {
        doc.save()
          .fillColor(C.muted).font('Helvetica').fontSize(10)
          .text('No existen consultas registradas para este paciente con el doctor autenticado.',
            MARGIN + 10, doc.y, { width: CW - 20 })
          .restore();
      } else {
        for (let i = 0; i < data.historial.length; i++) {
          drawConsultationCard(doc, data.historial[i], i, () => {
            newPage();
            drawSectionLabel(doc, 'Detalle de Consultas (cont.)');
          });
        }
      }

      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    return handleError(res, error);
  }
};
