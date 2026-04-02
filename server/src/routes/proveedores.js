/**
 * CRUD dbo.Proveedores; Libros referencian ProveedorId (FK).
 */

const express = require('express');
const db = require('../config/database');

const { sql } = db;
const router = express.Router();

function mapRow(row) {
  return {
    id: row.Id,
    nombre: row.Nombre,
    contacto: row.Contacto || '',
    fechaCreacion: row.FechaCreacion,
  };
}

// GET /api/proveedores
router.get('/', async (_req, res) => {
  try {
    const pool = await db.getPool();
    const result = await pool.request().query(
      'SELECT Id, Nombre, Contacto, FechaCreacion FROM dbo.Proveedores ORDER BY Nombre',
    );
    const proveedores = (result.recordset || []).map(mapRow);
    return res.json({ proveedores });
  } catch (err) {
    console.error('Error en GET /api/proveedores:', err);
    return res.status(500).json({ error: 'No se pudieron obtener los proveedores.' });
  }
});

// POST /api/proveedores  { nombre, contacto? }
router.post('/', async (req, res) => {
  try {
    const nombre = (req.body && req.body.nombre != null && String(req.body.nombre).trim()) || '';
    const contacto =
      req.body && req.body.contacto != null ? String(req.body.contacto).trim() : null;

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del proveedor es obligatorio.' });
    }

    const pool = await db.getPool();
    const request = pool.request();
    request.input('Nombre', sql.NVarChar(200), nombre);
    request.input('Contacto', sql.NVarChar(255), contacto || null);

    const ins = await request.query(
      'INSERT INTO dbo.Proveedores (Nombre, Contacto) OUTPUT INSERTED.Id, INSERTED.Nombre, INSERTED.Contacto, INSERTED.FechaCreacion ' +
        'VALUES (@Nombre, @Contacto)',
    );
    const row = ins.recordset && ins.recordset[0];
    return res.status(201).json({ proveedor: mapRow(row) });
  } catch (err) {
    console.error('Error en POST /api/proveedores:', err);
    return res.status(500).json({ error: 'No se pudo crear el proveedor.' });
  }
});

// PUT /api/proveedores/:id  { nombre, contacto? }
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Id de proveedor no válido.' });
    }

    const nombre = (req.body && req.body.nombre != null && String(req.body.nombre).trim()) || '';
    const contacto =
      req.body && req.body.contacto != null ? String(req.body.contacto).trim() : null;

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del proveedor es obligatorio.' });
    }

    const pool = await db.getPool();
    const request = pool.request();
    request.input('Id', sql.Int, id);
    request.input('Nombre', sql.NVarChar(200), nombre);
    request.input('Contacto', sql.NVarChar(255), contacto || null);

    const upd = await request.query(
      'UPDATE dbo.Proveedores SET Nombre = @Nombre, Contacto = @Contacto WHERE Id = @Id',
    );
    const affected = upd.rowsAffected && upd.rowsAffected[0];
    if (!affected) {
      return res.status(404).json({ error: 'Proveedor no encontrado.' });
    }

    const sel = await pool.request().input('Id', sql.Int, id).query(
      'SELECT Id, Nombre, Contacto, FechaCreacion FROM dbo.Proveedores WHERE Id = @Id',
    );
    const row = sel.recordset && sel.recordset[0];
    return res.json({ proveedor: mapRow(row) });
  } catch (err) {
    console.error('Error en PUT /api/proveedores/:id:', err);
    return res.status(500).json({ error: 'No se pudo actualizar el proveedor.' });
  }
});

// DELETE /api/proveedores/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Id de proveedor no válido.' });
    }

    const pool = await db.getPool();

    const check = await pool.request().input('Id', sql.Int, id).query(
      'SELECT COUNT(*) AS C FROM dbo.Libros WHERE ProveedorId = @Id',
    );
    const count = check.recordset && check.recordset[0] && Number(check.recordset[0].C);
    if (count > 0) {
      return res.status(409).json({
        error: `No se puede eliminar: hay ${count} libro(s) asociados a este proveedor.`,
      });
    }

    const del = await pool.request().input('Id', sql.Int, id).query('DELETE FROM dbo.Proveedores WHERE Id = @Id');
    const affected = del.rowsAffected && del.rowsAffected[0];
    if (!affected) {
      return res.status(404).json({ error: 'Proveedor no encontrado.' });
    }

    return res.json({ message: 'Proveedor eliminado.' });
  } catch (err) {
    console.error('Error en DELETE /api/proveedores/:id:', err);
    return res.status(500).json({ error: 'No se pudo eliminar el proveedor.' });
  }
});

module.exports = router;
