/**
 * Catálogo dbo.Categorias (para selects en admin y filtros).
 */

const express = require('express');
const db = require('../config/database');

const router = express.Router();

// GET /api/categorias
router.get('/', async (_req, res) => {
  try {
    const pool = await db.getPool();
    const result = await pool.request().query(
      'SELECT Id AS id, Nombre AS nombre FROM dbo.Categorias ORDER BY Nombre',
    );
    return res.json({ categorias: result.recordset || [] });
  } catch (err) {
    console.error('Error en GET /api/categorias:', err);
    return res.status(500).json({ error: err.message || 'No se pudieron obtener las categorías.' });
  }
});

module.exports = router;
