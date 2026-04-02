/**
 * Catálogo de libros desde SQL Server (dbo.Libros + dbo.Proveedores).
 */

const express = require('express');
const db = require('../config/database');

const { sql } = db;
const router = express.Router();

const SELECT_BASE =
  'SELECT L.Id, L.Titulo, L.Autor, L.Estado, L.Stock, L.Precio, L.CaratulaUrl, L.ProveedorId, ' +
  'P.Nombre AS ProveedorNombre ' +
  'FROM dbo.Libros L ' +
  'LEFT JOIN dbo.Proveedores P ON P.Id = L.ProveedorId ';

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
    proveedorId: row.ProveedorId != null ? row.ProveedorId : null,
    proveedorNombre: row.ProveedorNombre || '',
  };
}

// GET /api/libros  — listado; ?q= texto opcional (título o autor)
router.get('/', async (req, res) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    const q = (req.query.q || '').trim();

    let queryText = SELECT_BASE + 'ORDER BY L.Titulo';

    if (q) {
      request.input('q1', sql.NVarChar, `%${q}%`);
      request.input('q2', sql.NVarChar, `%${q}%`);
      queryText =
        SELECT_BASE + 'WHERE L.Titulo LIKE @q1 OR L.Autor LIKE @q2 ' + 'ORDER BY L.Titulo';
    }

    const result = await request.query(queryText);
    const books = (result.recordset || []).map(mapRow);
    return res.json({ books });
  } catch (err) {
    console.error('Error en GET /api/libros:', err);
    return res.status(500).json({ error: 'No se pudieron obtener los libros.' });
  }
});

// POST /api/libros — alta (admin / integraciones)
// Body: titulo, autor?, estado?, stock?, precio?, caratula? (texto o URL, máx. 500), proveedorId? (nullable)
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const titulo = (body.titulo != null && String(body.titulo).trim()) || '';
    if (!titulo) {
      return res.status(400).json({ error: 'El título es obligatorio.' });
    }

    const autor = body.autor != null ? String(body.autor).trim() : null;
    const estado = (body.estado != null && String(body.estado).trim()) || 'disponible';
    const stock = Number(body.stock);
    const stockOk = Number.isInteger(stock) && stock >= 0 ? stock : 0;
    const precio = body.precio != null ? Number(body.precio) : 0;
    const precioOk = Number.isFinite(precio) && precio >= 0 ? precio : 0;

    let caratulaUrl = body.caratula != null ? String(body.caratula).trim() : '';
    if (caratulaUrl.length > 500) {
      caratulaUrl = caratulaUrl.slice(0, 500);
    }

    let proveedorId = null;
    if (body.proveedorId != null && body.proveedorId !== '') {
      const pid = Number(body.proveedorId);
      if (!Number.isInteger(pid) || pid <= 0) {
        return res.status(400).json({ error: 'proveedorId no válido.' });
      }
      proveedorId = pid;
    }

    const pool = await db.getPool();

    if (proveedorId != null) {
      const chk = await pool.request().input('Pid', sql.Int, proveedorId).query(
        'SELECT 1 AS Ok FROM dbo.Proveedores WHERE Id = @Pid',
      );
      if (!chk.recordset || !chk.recordset[0]) {
        return res.status(400).json({ error: 'El proveedor indicado no existe.' });
      }
    }

    const request = pool.request();
    request.input('Titulo', sql.NVarChar(300), titulo);
    request.input('Autor', sql.NVarChar(200), autor || null);
    request.input('Estado', sql.NVarChar(50), estado);
    request.input('Stock', sql.Int, stockOk);
    request.input('Precio', sql.Decimal(18, 2), precioOk);
    request.input('CaratulaUrl', sql.NVarChar(500), caratulaUrl || null);
    request.input('ProveedorId', sql.Int, proveedorId);

    const ins = await request.query(
      'INSERT INTO dbo.Libros (Titulo, Autor, Estado, Stock, Precio, CaratulaUrl, ProveedorId) ' +
        'OUTPUT INSERTED.Id ' +
        'VALUES (@Titulo, @Autor, @Estado, @Stock, @Precio, @CaratulaUrl, @ProveedorId)',
    );

    const newId = ins.recordset && ins.recordset[0] && ins.recordset[0].Id;
    const sel = await pool
      .request()
      .input('Id', sql.Int, newId)
      .query(SELECT_BASE + 'WHERE L.Id = @Id');
    const row = sel.recordset && sel.recordset[0];
    return res.status(201).json({ book: mapRow(row) });
  } catch (err) {
    console.error('Error en POST /api/libros:', err);
    if (err && err.message && err.message.includes('FK_Libros_Proveedor')) {
      return res.status(400).json({ error: 'Proveedor no válido.' });
    }
    if (err && err.message && err.message.includes('ProveedorId')) {
      return res.status(500).json({
        error:
          'La columna ProveedorId no existe en Libros. Ejecuta server/scripts/migrate-libros-proveedor.sql en la base Booknest.',
      });
    }
    return res.status(500).json({ error: 'No se pudo crear el libro.' });
  }
});

// DELETE /api/libros/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Id de libro no válido.' });
    }

    const pool = await db.getPool();

    try {
      await pool.request().input('LibroId', sql.Int, id).query('DELETE FROM dbo.Carrito WHERE LibroId = @LibroId');
    } catch (e) {
      if (!e || !e.message || !e.message.includes('Invalid object name')) throw e;
    }
    try {
      await pool.request().input('LibroId', sql.Int, id).query('DELETE FROM dbo.Prestamos WHERE LibroId = @LibroId');
    } catch (e) {
      if (!e || !e.message || !e.message.includes('Invalid object name')) throw e;
    }

    const del = await pool.request().input('Id', sql.Int, id).query('DELETE FROM dbo.Libros WHERE Id = @Id');
    const affected = del.rowsAffected && del.rowsAffected[0];
    if (!affected) {
      return res.status(404).json({ error: 'Libro no encontrado.' });
    }

    return res.json({ message: 'Libro eliminado.' });
  } catch (err) {
    console.error('Error en DELETE /api/libros/:id:', err);
    return res.status(500).json({ error: 'No se pudo eliminar el libro.' });
  }
});

module.exports = router;
