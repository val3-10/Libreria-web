/**
 * Catálogo de libros desde SQL Server (tabla dbo.Libros).
 */

const express = require('express');
const db = require('../config/database');

const { sql } = db;
const router = express.Router();

function mapRow(row) {
  return {
    id: row.Id,
    titulo: row.Titulo,
    autor: row.Autor || '',
    estado: row.Estado,
    stock: row.Stock,
    precio: row.Precio != null ? Number(row.Precio) : 0,
    caratula: row.CaratulaUrl || '',
    saga: '',
  };
}

// GET /api/libros  — listado; ?q= texto opcional (título o autor)
router.get('/', async (req, res) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    const q = (req.query.q || '').trim();

    let queryText =
      'SELECT Id, Titulo, Autor, Estado, Stock, Precio, CaratulaUrl ' +
      'FROM Libros ORDER BY Titulo';

    if (q) {
      request.input('q1', sql.NVarChar, `%${q}%`);
      request.input('q2', sql.NVarChar, `%${q}%`);
      queryText =
        'SELECT Id, Titulo, Autor, Estado, Stock, Precio, CaratulaUrl ' +
        'FROM Libros ' +
        'WHERE Titulo LIKE @q1 OR Autor LIKE @q2 ' +
        'ORDER BY Titulo';
    }

    const result = await request.query(queryText);
    const books = (result.recordset || []).map(mapRow);
    return res.json({ books });
  } catch (err) {
    console.error('Error en GET /api/libros:', err);
    return res.status(500).json({ error: 'No se pudieron obtener los libros.' });
  }
});

module.exports = router;
