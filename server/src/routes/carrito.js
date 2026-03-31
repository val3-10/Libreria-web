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
