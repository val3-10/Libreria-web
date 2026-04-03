/**
 * Catálogo dbo.Categorias (para selects en admin y filtros).
 */

const express = require('express');
const db = require('../config/database');

const router = express.Router();

function mapRow(row) {
  return {
    id: row.Id,
    nombre: row.Nombre != null ? String(row.Nombre) : '',
  };
}

// GET /api/categorias
router.get('/', async (_req, res) => {
  try {
    const pool = await db.getPool();
    const result = await pool.request().query(
      'SELECT Id, Nombre FROM dbo.Categorias ORDER BY Nombre',
    );
    const categorias = (result.recordset || []).map(mapRow);
    return res.json({ categorias });
  } catch (err) {
    console.error('Error en GET /api/categorias:', err);
    return res.status(500).json({ error: err.message || 'No se pudieron obtener las categorías.' });
  }
});

module.exports = router;
