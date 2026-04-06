/**
 * Favoritos por usuario (corazón) en SQL Server.
 */

const express = require('express');
const db = require('../config/database');

const { sql } = db;
const router = express.Router();

// POST /api/favoritos/toggle — debe ir antes de GET /:usuarioId
router.post('/toggle', async (req, res) => {
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
    const check = await pool
      .request()
      .input('UsuarioId', sql.Int, userId)
      .input('LibroId', sql.Int, bookId)
      .query(
        'SELECT 1 AS ok FROM dbo.Favoritos WHERE UsuarioId = @UsuarioId AND LibroId = @LibroId',
      );

    const exists = check.recordset && check.recordset.length > 0;

    if (exists) {
      await pool
        .request()
        .input('UsuarioId', sql.Int, userId)
        .input('LibroId', sql.Int, bookId)
        .query('DELETE FROM dbo.Favoritos WHERE UsuarioId = @UsuarioId AND LibroId = @LibroId');
      return res.json({ favorito: false, message: 'Eliminado de favoritos.' });
    }

    await pool
      .request()
      .input('UsuarioId', sql.Int, userId)
      .input('LibroId', sql.Int, bookId)
      .query('INSERT INTO dbo.Favoritos (UsuarioId, LibroId) VALUES (@UsuarioId, @LibroId)');

    return res.json({ favorito: true, message: 'Agregado a favoritos.' });
  } catch (err) {
    console.error('Error en POST /api/favoritos/toggle:', err);
    if (err && err.message && /Invalid object name/i.test(err.message)) {
      return res.status(503).json({
        error: 'Tabla de favoritos no disponible. Ejecuta server/scripts/migrate-favoritos.sql en la base.',
      });
    }
    return res.status(500).json({ error: 'No se pudo actualizar favoritos en base de datos.' });
  }
});

// GET /api/favoritos/:usuarioId — lista de LibroId y títulos (JOIN con Libros)
router.get('/:usuarioId', async (req, res) => {
  try {
    const userId = Number(req.params.usuarioId);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'usuarioId inválido.' });
    }

    const pool = await db.getPool();
    const r = await pool.request().input('UsuarioId', sql.Int, userId).query(
      'SELECT F.LibroId, L.Titulo ' +
        'FROM dbo.Favoritos F ' +
        'INNER JOIN dbo.Libros L ON L.Id = F.LibroId ' +
        'WHERE F.UsuarioId = @UsuarioId ' +
        'ORDER BY L.Titulo',
    );

    const rows = r.recordset || [];
    return res.json({
      libroIds: rows.map((x) => x.LibroId),
      titulos: rows.map((x) => x.Titulo),
    });
  } catch (err) {
    console.error('Error en GET /api/favoritos:', err);
    if (err && err.message && /Invalid object name/i.test(err.message)) {
      return res.status(503).json({
        error: 'Tabla de favoritos no disponible. Ejecuta server/scripts/migrate-favoritos.sql en la base.',
        libroIds: [],
        titulos: [],
      });
    }
    return res.status(500).json({ error: 'No se pudieron obtener los favoritos.' });
  }
});

module.exports = router;
