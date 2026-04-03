/**
 * Catálogo de libros desde SQL Server (dbo.Libros + dbo.Proveedores).
 */

const express = require('express');
const db = require('../config/database');

const { sql } = db;
const router = express.Router();

const SELECT_BASE =
  'SELECT L.Id, L.Titulo, L.Autor, L.Saga, L.Estado, L.Stock, L.Precio, L.CaratulaUrl, L.ProveedorId, L.CategoriaId, ' +
  'P.Nombre AS ProveedorNombre, C.Nombre AS CategoriaNombre ' +
  'FROM dbo.Libros L ' +
  'LEFT JOIN dbo.Proveedores P ON P.Id = L.ProveedorId ' +
  'LEFT JOIN dbo.Categorias C ON C.Id = L.CategoriaId ';

/** Último segmento de ruta (nombre de archivo), sin query ni hash. */
function ultimoSegmentoArchivo(s) {
  const p = String(s).split('?')[0].split('#')[0].replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = p.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1].trim() : p.trim();
}

/** Solo extensión .jpg (no .jpeg, .png, etc.): se mira el último segmento del path. */
function terminaEnJpg(s) {
  let base;
  try {
    if (/^https?:\/\//i.test(s)) {
      base = ultimoSegmentoArchivo(new URL(s).pathname);
    } else {
      base = ultimoSegmentoArchivo(s);
    }
  } catch {
    return false;
  }
  if (!base) return false;
  const lower = base.toLowerCase();
  if (lower.endsWith('.jpeg') || lower.endsWith('.jpe')) return false;
  if (/\.(png|gif|webp|bmp|svg)$/i.test(base)) return false;
  return lower.endsWith('.jpg');
}

/**
 * Rutas locales: siempre bajo caratulas/ (sin duplicar el prefijo). URLs http(s) sin cambiar de carpeta.
 * Solo se acepta extensión .jpg. Vacío → cadena vacía (sin carátula).
 * @returns {{ url: string } | { error: string }}
 */
function normalizarCaratulaUrl(raw) {
  let s = raw != null ? String(raw).trim() : '';
  if (!s) return { url: '' };

  if (/^https?:\/\//i.test(s)) {
    if (!terminaEnJpg(s)) {
      return { error: 'La carátula en URL debe ser un archivo .jpg.' };
    }
    return { url: s.slice(0, 500) };
  }

  s = s.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
  const lower = s.toLowerCase();
  if (!lower.startsWith('caratulas/')) {
    s = `caratulas/${s}`;
  }
  if (!terminaEnJpg(s)) {
    return { error: 'La carátula debe ser un archivo .jpg (ej. milibro.jpg o caratulas/milibro.jpg).' };
  }
  return { url: s.slice(0, 500) };
}

function mapRow(row) {
  return {
    id: row.Id,
    titulo: row.Titulo,
    autor: row.Autor || '',
    estado: row.Estado,
    stock: row.Stock,
    precio: row.Precio != null ? Number(row.Precio) : 0,
    caratula: row.CaratulaUrl || '',
    saga: row.Saga != null ? String(row.Saga) : '',
    proveedorId: row.ProveedorId != null ? row.ProveedorId : null,
    proveedorNombre: row.ProveedorNombre || '',
    categoriaId: row.CategoriaId != null ? row.CategoriaId : null,
    categoriaNombre: row.CategoriaNombre || '',
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
    if (err && err.message && /Invalid column name 'Saga'/i.test(err.message)) {
      return res.status(500).json({
        error:
          'Falta la columna Saga en Libros. Ejecuta server/scripts/migrate-libros-saga.sql en la base Booknest.',
      });
    }
    return res.status(500).json({ error: 'No se pudieron obtener los libros.' });
  }
});

// POST /api/libros — alta (admin / integraciones)
// Body: titulo, autor?, saga?, estado?, stock?, precio?, caratula?, proveedorId?, categoriaId?
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const titulo = (body.titulo != null && String(body.titulo).trim()) || '';
    if (!titulo) {
      return res.status(400).json({ error: 'El título es obligatorio.' });
    }

    const autor = body.autor != null ? String(body.autor).trim() : null;
    const sagaRaw = body.saga != null ? String(body.saga).trim() : '';
    const saga = sagaRaw ? sagaRaw.slice(0, 200) : null;
    let estadoCatalogo = (body.estado != null && String(body.estado).trim()) || 'disponible';
    if (estadoCatalogo === 'agotado') estadoCatalogo = 'disponible';
    if (estadoCatalogo !== 'disponible' && estadoCatalogo !== 'venta') {
      estadoCatalogo = 'disponible';
    }
    const stock = Number(body.stock);
    const stockOk = Number.isInteger(stock) && stock >= 0 ? stock : 0;
    const precio = body.precio != null ? Number(body.precio) : 0;
    const precioOk = Number.isFinite(precio) && precio >= 0 ? precio : 0;

    const carNorm = normalizarCaratulaUrl(body.caratula != null ? body.caratula : '');
    if (carNorm.error) {
      return res.status(400).json({ error: carNorm.error });
    }
    let caratulaUrl = carNorm.url;

    let proveedorId = null;
    if (body.proveedorId != null && body.proveedorId !== '') {
      const pid = Number(body.proveedorId);
      if (!Number.isInteger(pid) || pid <= 0) {
        return res.status(400).json({ error: 'proveedorId no válido.' });
      }
      proveedorId = pid;
    }

    let categoriaId = null;
    if (body.categoriaId != null && body.categoriaId !== '') {
      const cid = parseInt(String(body.categoriaId), 10);
      if (!Number.isFinite(cid) || cid < 1) {
        return res.status(400).json({ error: 'categoriaId no válido.' });
      }
      categoriaId = cid;
    }

    const pool = await db.getPool();

    if (categoriaId != null) {
      const chkCat = await pool.request().input('Cid', sql.Int, categoriaId).query(
        'SELECT 1 AS Ok FROM dbo.Categorias WHERE Id = @Cid',
      );
      if (!chkCat.recordset || !chkCat.recordset[0]) {
        return res.status(400).json({ error: 'La categoría indicada no existe.' });
      }
    }

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
    request.input('Saga', sql.NVarChar(200), saga);
    request.input('EstadoCatalogo', sql.NVarChar(50), estadoCatalogo);
    request.input('Stock', sql.Int, stockOk);
    request.input('Precio', sql.Decimal(18, 2), precioOk);
    request.input('CaratulaUrl', sql.NVarChar(500), caratulaUrl || null);
    request.input('ProveedorId', sql.Int, proveedorId);
    request.input('CategoriaId', sql.Int, categoriaId);

    const ins = await request.query(
      'INSERT INTO dbo.Libros (Titulo, Autor, Saga, EstadoCatalogo, Stock, Precio, CaratulaUrl, ProveedorId, CategoriaId) ' +
        'OUTPUT INSERTED.Id ' +
        'VALUES (@Titulo, @Autor, @Saga, @EstadoCatalogo, @Stock, @Precio, @CaratulaUrl, @ProveedorId, @CategoriaId)',
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
    if (err && err.message && (err.message.includes('CategoriaId') || err.message.includes('Categorias'))) {
      return res.status(500).json({
        error:
          'Falta la tabla Categorias o la columna CategoriaId. Ejecuta server/scripts/migrate-evolucion-booknest.sql en Booknest.',
      });
    }
    if (err && err.message && err.message.includes('EstadoCatalogo')) {
      return res.status(500).json({
        error:
          'El esquema de Libros no tiene EstadoCatalogo/Estado calculado. Ejecuta migrate-evolucion-booknest.sql o crea la BD con create-database.sql.',
      });
    }
    if (err && err.message && /Invalid column name 'Saga'/i.test(err.message)) {
      return res.status(500).json({
        error:
          'Falta la columna Saga en Libros. Ejecuta server/scripts/migrate-libros-saga.sql en la base Booknest.',
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
