/**
 * Indicadores para administración: ventas desde dbo.Ventas (Detalle en JSON).
 * Incluye un listado con UNION ALL (clientes + proveedores, mismas columnas).
 */

const express = require('express');
const db = require('../config/database');

const { sql } = db;
const router = express.Router();

/** Lee el JSON de Detalle (array de líneas) sin OPENJSON en SQL. */
function lineasDesdeDetalle(detalle) {
  if (detalle == null || detalle === '') return [];
  const s = typeof detalle === 'string' ? detalle : String(detalle);
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Suma cantidad y subtotal por libroId a partir de las filas de Ventas (solo columna Detalle).
 * @returns {Map<number, { unidades: number, subtotal: number }>}
 */
function agregarVentasPorLibro(ventasConDetalle) {
  const porLibro = new Map();
  for (const row of ventasConDetalle) {
    for (const line of lineasDesdeDetalle(row.Detalle)) {
      const libroId = Number(line.libroId);
      if (!Number.isInteger(libroId) || libroId <= 0) continue;
      const cantidad = Number(line.cantidad);
      const sub = Number(line.subtotal);
      const qty = Number.isFinite(cantidad) && cantidad > 0 ? Math.floor(cantidad) : 0;
      const subtotal = Number.isFinite(sub) && sub >= 0 ? sub : 0;
      const cur = porLibro.get(libroId) || { unidades: 0, subtotal: 0 };
      cur.unidades += qty;
      cur.subtotal += subtotal;
      porLibro.set(libroId, cur);
    }
  }
  return porLibro;
}

// GET /api/reportes/resumen
// Top clientes, libros más vendidos, proveedor con más ventas vía libros, clientes sin compras
router.get('/resumen', async (_req, res) => {
  try {
    const pool = await db.getPool();

    const topClientesReq = await pool.request().query(`
      SELECT TOP 10
        u.Id AS usuarioId,
        u.Nombre AS nombre,
        u.Correo AS correo,
        CAST(SUM(v.Total) AS DECIMAL(18,2)) AS totalCompras,
        COUNT(v.Id) AS numVentas
      FROM dbo.Ventas v
      INNER JOIN dbo.Usuarios u ON u.Id = v.UsuarioId
      GROUP BY u.Id, u.Nombre, u.Correo
      ORDER BY totalCompras DESC;
    `);

    let librosMasVendidos = [];
    let mayorProveedor = null;
    try {
      const ventasDetReq = await pool.request().query(`
        SELECT Detalle FROM dbo.Ventas WHERE Detalle IS NOT NULL AND LTRIM(RTRIM(CAST(Detalle AS NVARCHAR(MAX)))) <> N''
      `);
      const porLibro = agregarVentasPorLibro(ventasDetReq.recordset || []);
      const idsLibro = [...porLibro.keys()];
      if (idsLibro.length > 0) {
        const ph = idsLibro.map((_, i) => `@id${i}`).join(', ');
        const metaReq = pool.request();
        idsLibro.forEach((id, i) => metaReq.input(`id${i}`, sql.Int, id));
        const metaRes = await metaReq.query(
          `SELECT Id, Titulo, Autor, ProveedorId FROM dbo.Libros WHERE Id IN (${ph})`,
        );
        const byId = new Map((metaRes.recordset || []).map((x) => [x.Id, x]));

        const ordenados = [...porLibro.entries()].sort((a, b) => b[1].unidades - a[1].unidades);
        const top10 = ordenados.slice(0, 10);
        librosMasVendidos = top10.map(([libroId, v]) => {
          const meta = byId.get(libroId);
          return {
            libroId,
            titulo: meta ? meta.Titulo : '(desconocido)',
            autor: meta ? meta.Autor || '' : '',
            unidadesVendidas: v.unidades,
            subtotalVentas: Math.round(v.subtotal * 100) / 100,
          };
        });

        const porProveedor = new Map();
        for (const [libroId, v] of porLibro) {
          const meta = byId.get(libroId);
          if (!meta || meta.ProveedorId == null) continue;
          const pid = meta.ProveedorId;
          const cur = porProveedor.get(pid) || { unidades: 0, ingresos: 0 };
          cur.unidades += v.unidades;
          cur.ingresos += v.subtotal;
          porProveedor.set(pid, cur);
        }
        if (porProveedor.size > 0) {
          const [[bestPid, bestVal]] = [...porProveedor.entries()].sort(
            (a, b) => b[1].unidades - a[1].unidades || b[1].ingresos - a[1].ingresos,
          );
          const nomReq = await pool
            .request()
            .input('Pid', sql.Int, bestPid)
            .query('SELECT TOP 1 Id, Nombre FROM dbo.Proveedores WHERE Id = @Pid');
          const pn = nomReq.recordset && nomReq.recordset[0];
          if (pn) {
            mayorProveedor = {
              proveedorId: pn.Id,
              nombre: pn.Nombre,
              unidadesVendidas: bestVal.unidades,
              ingresosAtribuidos: Math.round(bestVal.ingresos * 100) / 100,
            };
          }
        }
      }
    } catch (e) {
      console.warn('reportes agregación Detalle (JSON en Node):', e.message);
      librosMasVendidos = [];
      mayorProveedor = null;
    }

    const sinReq = await pool.request().query(`
      SELECT u.Id AS usuarioId, u.Nombre AS nombre, u.Correo AS correo, u.Usuario AS usuarioLogin
      FROM dbo.Usuarios u
      WHERE u.Activo = 1
        AND COALESCE(LOWER(LTRIM(RTRIM(u.Rol))), N'cliente') NOT IN (N'admin', N'administrador', N'empleado')
        AND NOT EXISTS (SELECT 1 FROM dbo.Ventas v WHERE v.UsuarioId = u.Id)
      ORDER BY u.Nombre;
    `);

    /** Directorio unificado: UNION ALL exige el mismo número y tipo de columnas en cada SELECT. */
    let contactosUnificados = [];
    try {
      const unionReq = await pool.request().query(`
        SELECT
          N'Cliente' AS tipo,
          u.Nombre AS nombre,
          u.Correo AS contacto
        FROM dbo.Usuarios u
        WHERE u.Activo = 1
          AND COALESCE(LOWER(LTRIM(RTRIM(u.Rol))), N'cliente') NOT IN (N'admin', N'administrador', N'empleado')

        UNION ALL

        SELECT
          N'Proveedor' AS tipo,
          p.Nombre,
          COALESCE(p.Contacto, N'—')
        FROM dbo.Proveedores p

        ORDER BY tipo, nombre;
      `);
      contactosUnificados = (unionReq.recordset || []).map((r) => ({
        tipo: r.tipo,
        nombre: r.nombre,
        contacto: r.contacto,
      }));
    } catch (e) {
      console.warn('reportes UNION contactos:', e.message);
    }

    const topClientes = (topClientesReq.recordset || []).map((r) => ({
      usuarioId: r.usuarioId,
      nombre: r.nombre,
      correo: r.correo,
      totalCompras: r.totalCompras != null ? Number(r.totalCompras) : 0,
      numVentas: r.numVentas,
    }));

    const clientesSinCompras = (sinReq.recordset || []).map((r) => ({
      usuarioId: r.usuarioId,
      nombre: r.nombre,
      correo: r.correo,
      usuarioLogin: r.usuarioLogin,
    }));

    return res.json({
      topClientes,
      librosMasVendidos,
      mayorProveedor,
      clientesSinCompras,
      contactosUnificados,
    });
  } catch (err) {
    console.error('Error en GET /api/reportes/resumen:', err);
    return res.status(500).json({ error: err.message || 'No se pudieron cargar los reportes.' });
  }
});

module.exports = router;
