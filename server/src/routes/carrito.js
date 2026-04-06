/**
 * Persistencia de carrito en SQL Server.
 */

const express = require('express');
const db = require('../config/database');

const { sql } = db;
const router = express.Router();

// POST /api/carrito/agregar
router.post('/agregar', async (req, res) => {
  try {
    const { usuarioId, libroId, cantidad } = req.body || {};

    const userId = Number(usuarioId);
    const bookId = Number(libroId);
    const qty = Number(cantidad) > 0 ? Number(cantidad) : 1;

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'usuarioId es obligatorio y debe ser válido.' });
    }

    if (!Number.isInteger(bookId) || bookId <= 0) {
      return res.status(400).json({ error: 'libroId es obligatorio y debe ser válido.' });
    }

    const pool = await db.getPool();
    const request = pool.request();

    request.input('UsuarioId', sql.Int, userId);
    request.input('LibroId', sql.Int, bookId);
    request.input('Cantidad', sql.Int, qty);

    await request.query(
      "IF EXISTS (SELECT 1 FROM dbo.Carrito WHERE UsuarioId = @UsuarioId AND LibroId = @LibroId) " +
        "BEGIN " +
        "  UPDATE dbo.Carrito " +
        "  SET Cantidad = Cantidad + @Cantidad, FechaActualizacion = SYSUTCDATETIME() " +
        "  WHERE UsuarioId = @UsuarioId AND LibroId = @LibroId; " +
        "END " +
        "ELSE " +
        "BEGIN " +
        "  INSERT INTO dbo.Carrito (UsuarioId, LibroId, Cantidad) " +
        "  VALUES (@UsuarioId, @LibroId, @Cantidad); " +
        "END",
    );

    return res.status(201).json({ message: 'Libro agregado al carrito en base de datos.' });
  } catch (err) {
    console.error('Error en POST /api/carrito/agregar:', err);
    return res.status(500).json({ error: 'No se pudo guardar el carrito en base de datos.' });
  }
});

// POST /api/carrito/cantidad — fija la cantidad absoluta de una línea (p. ej. al usar +/- en el carrito)
router.post('/cantidad', async (req, res) => {
  try {
    const { usuarioId, libroId, cantidad } = req.body || {};

    const userId = Number(usuarioId);
    const bookId = Number(libroId);
    const qty = Number(cantidad);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'usuarioId es obligatorio y debe ser válido.' });
    }

    if (!Number.isInteger(bookId) || bookId <= 0) {
      return res.status(400).json({ error: 'libroId es obligatorio y debe ser válido.' });
    }

    if (!Number.isInteger(qty) || qty < 0) {
      return res.status(400).json({ error: 'cantidad debe ser un entero >= 0.' });
    }

    const pool = await db.getPool();

    if (qty === 0) {
      const request = pool.request();
      request.input('UsuarioId', sql.Int, userId);
      request.input('LibroId', sql.Int, bookId);
      await request.query(
        'DELETE FROM dbo.Carrito WHERE UsuarioId = @UsuarioId AND LibroId = @LibroId',
      );
      return res.json({ message: 'Línea eliminada del carrito.', cantidad: 0 });
    }

    const runUpsert = (sqlText) =>
      pool
        .request()
        .input('UsuarioId', sql.Int, userId)
        .input('LibroId', sql.Int, bookId)
        .input('Cantidad', sql.Int, qty)
        .query(sqlText);

    const withFecha =
      'IF EXISTS (SELECT 1 FROM dbo.Carrito WHERE UsuarioId = @UsuarioId AND LibroId = @LibroId) ' +
      'BEGIN ' +
      '  UPDATE dbo.Carrito SET Cantidad = @Cantidad, FechaActualizacion = SYSUTCDATETIME() ' +
      '  WHERE UsuarioId = @UsuarioId AND LibroId = @LibroId; ' +
      'END ' +
      'ELSE ' +
      'BEGIN ' +
      '  INSERT INTO dbo.Carrito (UsuarioId, LibroId, Cantidad) VALUES (@UsuarioId, @LibroId, @Cantidad); ' +
      'END';

    const withoutFecha =
      'IF EXISTS (SELECT 1 FROM dbo.Carrito WHERE UsuarioId = @UsuarioId AND LibroId = @LibroId) ' +
      'BEGIN ' +
      '  UPDATE dbo.Carrito SET Cantidad = @Cantidad ' +
      '  WHERE UsuarioId = @UsuarioId AND LibroId = @LibroId; ' +
      'END ' +
      'ELSE ' +
      'BEGIN ' +
      '  INSERT INTO dbo.Carrito (UsuarioId, LibroId, Cantidad) VALUES (@UsuarioId, @LibroId, @Cantidad); ' +
      'END';

    try {
      await runUpsert(withFecha);
    } catch (e) {
      if (e && e.message && /FechaActualizacion|Invalid column/i.test(e.message)) {
        await runUpsert(withoutFecha);
      } else {
        throw e;
      }
    }

    return res.json({ message: 'Cantidad actualizada.', cantidad: qty });
  } catch (err) {
    console.error('Error en POST /api/carrito/cantidad:', err);
    return res.status(500).json({ error: 'No se pudo actualizar la cantidad en base de datos.' });
  }
});

// POST /api/carrito/eliminar  — quita una línea (UsuarioId + LibroId) de dbo.Carrito
router.post('/eliminar', async (req, res) => {
  try {
    const { usuarioId, libroId } = req.body || {};

    const userId = Number(usuarioId);
    const bookId = Number(libroId);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'usuarioId es obligatorio y debe ser válido.' });
    }

    if (!Number.isInteger(bookId) || bookId <= 0) {
      return res.status(400).json({ error: 'libroId es obligatorio y debe ser válido.' });
    }

    const pool = await db.getPool();
    const request = pool.request();

    request.input('UsuarioId', sql.Int, userId);
    request.input('LibroId', sql.Int, bookId);

    const result = await request.query(
      'DELETE FROM dbo.Carrito WHERE UsuarioId = @UsuarioId AND LibroId = @LibroId',
    );

    const affected = result.rowsAffected && result.rowsAffected[0];
    return res.json({
      message: affected
        ? 'Ítem eliminado del carrito en base de datos.'
        : 'No había fila en base de datos (carrito local sincronizado).',
      deleted: !!affected,
    });
  } catch (err) {
    console.error('Error en POST /api/carrito/eliminar:', err);
    return res.status(500).json({ error: 'No se pudo eliminar el ítem del carrito en base de datos.' });
  }
});

module.exports = router;
