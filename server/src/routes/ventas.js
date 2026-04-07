/**
 * Registro de ventas en dbo.Ventas y actualización de stock en dbo.Libros.
 */

const express = require('express');
const db = require('../config/database');

const { sql } = db;
const router = express.Router();

// GET /api/ventas — listado (JOIN Usuarios). Opcional: ?usuarioId=n solo ventas de ese cliente (perfil).
router.get('/', async (req, res) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    const rawUid = req.query && req.query.usuarioId;
    let sqlText = `
      SELECT
        v.Id,
        v.UsuarioId,
        v.Fecha,
        v.Total,
        v.Detalle,
        u.Nombre AS ClienteNombre,
        u.Correo AS ClienteCorreo
      FROM dbo.Ventas v
      INNER JOIN dbo.Usuarios u ON u.Id = v.UsuarioId
    `;
    if (rawUid != null && String(rawUid).trim() !== '') {
      const uid = Number(rawUid);
      if (!Number.isInteger(uid) || uid <= 0) {
        return res.status(400).json({ error: 'usuarioId inválido.' });
      }
      request.input('Uid', sql.Int, uid);
      sqlText += ' WHERE v.UsuarioId = @Uid ';
    }
    sqlText += ' ORDER BY v.Fecha DESC, v.Id DESC';
    const result = await request.query(sqlText);

    const ventas = (result.recordset || []).map((row) => {
      let detalle = [];
      if (row.Detalle) {
        try {
          const parsed = JSON.parse(row.Detalle);
          detalle = Array.isArray(parsed) ? parsed : [];
        } catch {
          detalle = [];
        }
      }
      return {
        id: row.Id,
        usuarioId: row.UsuarioId,
        fecha: row.Fecha,
        total: row.Total != null ? Number(row.Total) : 0,
        clienteNombre: row.ClienteNombre || '',
        clienteCorreo: row.ClienteCorreo || '',
        detalle,
      };
    });

    return res.json({ ventas });
  } catch (err) {
    console.error('Error en GET /api/ventas:', err);
    return res.status(500).json({ error: err.message || 'No se pudieron obtener las ventas.' });
  }
});

// POST /api/ventas/checkout
// Body: { usuarioId, items: [{ libroId, cantidad }] } — nombre/correo del cliente salen de dbo.Usuarios
router.post('/checkout', async (req, res) => {
  const { usuarioId, items } = req.body || {};

  const userId = Number(usuarioId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'usuarioId no válido.' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Debe incluir al menos un ítem en la venta.' });
  }

  const merged = new Map();
  for (const raw of items) {
    const libroId = Number(raw.libroId);
    const cantidad = Number(raw.cantidad);
    if (!Number.isInteger(libroId) || libroId <= 0) {
      return res.status(400).json({ error: 'Cada ítem debe tener un libroId válido.' });
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      return res.status(400).json({ error: 'La cantidad de cada ítem debe ser mayor a cero.' });
    }
    merged.set(libroId, (merged.get(libroId) || 0) + cantidad);
  }
  const normalized = [...merged.entries()].map(([libroId, cantidad]) => ({ libroId, cantidad }));

  const pool = await db.getPool();

  const userReq = await pool
    .request()
    .input('Uid', sql.Int, userId)
    .query(
      'SELECT TOP 1 Id, Nombre, Correo FROM dbo.Usuarios WHERE Id = @Uid AND Activo = 1',
    );
  if (!userReq.recordset || !userReq.recordset[0]) {
    return res.status(400).json({ error: 'Usuario no encontrado o inactivo.' });
  }

  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const detalleLineas = [];
    let total = 0;

    for (const { libroId, cantidad } of normalized) {
      const reqSel = new sql.Request(transaction);
      reqSel.input('Id', sql.Int, libroId);
      const sel = await reqSel.query(
        'SELECT TOP 1 Id, Titulo, Stock, Precio FROM dbo.Libros WITH (UPDLOCK, ROWLOCK) WHERE Id = @Id',
      );
      const row = sel.recordset && sel.recordset[0];
      if (!row) {
        await transaction.rollback();
        return res.status(400).json({ error: `El libro con id ${libroId} no existe.` });
      }
      if (row.Stock < cantidad) {
        await transaction.rollback();
        return res.status(400).json({
          error: `Stock insuficiente para "${row.Titulo}". Disponible: ${row.Stock}, solicitado: ${cantidad}.`,
        });
      }

      const precio = row.Precio != null ? Number(row.Precio) : 0;
      const subtotal = precio * cantidad;
      total += subtotal;

      const reqUpd = new sql.Request(transaction);
      reqUpd.input('Id', sql.Int, libroId);
      reqUpd.input('Qty', sql.Int, cantidad);
      const upd = await reqUpd.query(
        'UPDATE dbo.Libros SET Stock = Stock - @Qty, FechaActualizacion = SYSUTCDATETIME() ' +
          'WHERE Id = @Id AND Stock >= @Qty',
      );
      const affected = upd.rowsAffected && upd.rowsAffected[0];
      if (!affected) {
        await transaction.rollback();
        return res.status(409).json({ error: `No se pudo actualizar el stock de "${row.Titulo}".` });
      }

      detalleLineas.push({
        libroId: row.Id,
        titulo: row.Titulo,
        cantidad,
        precio,
        subtotal,
      });
    }

    const detalleJson = JSON.stringify(detalleLineas);

    const reqIns = new sql.Request(transaction);
    reqIns.input('UsuarioId', sql.Int, userId);
    reqIns.input('Total', sql.Decimal(18, 2), total);
    reqIns.input('Detalle', sql.NVarChar(sql.MAX), detalleJson);

    const ins = await reqIns.query(
      'INSERT INTO dbo.Ventas (UsuarioId, Total, Detalle) ' +
        'OUTPUT INSERTED.Id AS Id ' +
        'VALUES (@UsuarioId, @Total, @Detalle)',
    );

    const ventaId = ins.recordset && ins.recordset[0] && ins.recordset[0].Id;

    for (const { libroId } of normalized) {
      const reqDel = new sql.Request(transaction);
      reqDel.input('UsuarioId', sql.Int, userId);
      reqDel.input('LibroId', sql.Int, libroId);
      try {
        await reqDel.query(
          'DELETE FROM dbo.Carrito WHERE UsuarioId = @UsuarioId AND LibroId = @LibroId',
        );
      } catch (e) {
        if (e && e.message && e.message.includes('Invalid object name')) {
          // Tabla Carrito no existe en esta BD; ignorar
        } else {
          throw e;
        }
      }
    }

    await transaction.commit();

    const stockReq = await pool.request();
    const ids = normalized.map((n) => n.libroId);
    const placeholders = ids.map((_, i) => `@id${i}`).join(', ');
    ids.forEach((id, i) => {
      stockReq.input(`id${i}`, sql.Int, id);
    });
    const stockRes = await stockReq.query(
      `SELECT Id, Stock FROM dbo.Libros WHERE Id IN (${placeholders})`,
    );
    const stockUpdates = (stockRes.recordset || []).map((r) => ({
      libroId: r.Id,
      stock: r.Stock,
    }));

    return res.status(201).json({
      message: 'Venta registrada correctamente.',
      ventaId,
      total,
      detalle: detalleLineas,
      stockUpdates,
    });
  } catch (err) {
    try {
      await transaction.rollback();
    } catch (_rollbackErr) {
      /* ignore */
    }
    console.error('Error en POST /api/ventas/checkout:', err);
    return res.status(500).json({ error: err.message || 'No se pudo completar la venta.' });
  }
});

module.exports = router;
