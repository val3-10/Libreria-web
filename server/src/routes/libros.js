/**
 * Catálogo de libros desde SQL Server (dbo.Libros + dbo.Proveedores).
 *
 * POST /api/libros — una sola sentencia MERGE: COALESCE(Id por body.id, Id por título+autor) como UpsertId;
 * si hay coincidencia → WHEN MATCHED UPDATE; si no → WHEN NOT MATCHED BY TARGET INSERT.
 * PUT /:id — MERGE solo actualización por Id (`actualizarLibroPorId`).
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

/** Origen (USING) del MERGE de actualización: una fila con el Id objetivo y los campos a escribir. */
const MERGE_USING_LIBRO =
  'SELECT @Id AS Id, @Titulo AS Titulo, @Autor AS Autor, @Saga AS Saga, ' +
  '@Stock AS Stock, @Precio AS Precio, @CaratulaUrl AS CaratulaUrl, @ProveedorId AS ProveedorId, @CategoriaId AS CategoriaId';

/** Columnas del destino T que se asignan desde S en el WHEN MATCHED (UPDATE). */
const MERGE_UPDATE_SET =
  'T.Titulo = S.Titulo, T.Autor = S.Autor, T.Saga = S.Saga, ' +
  'T.Stock = S.Stock, T.Precio = S.Precio, T.CaratulaUrl = S.CaratulaUrl, T.ProveedorId = S.ProveedorId, T.CategoriaId = S.CategoriaId';

/**
 * Origen del MERGE POST: UpsertId = id del body (@BodyId) o fila existente por título+autor.
 * Parámetros: bindUpsertPostParams (BodyId, Titulo, Autor, Saga, …).
 */
const MERGE_USING_POST_UPSERT =
  'SELECT ' +
  'COALESCE(' +
  '(SELECT TOP 1 Id FROM dbo.Libros WHERE @BodyId IS NOT NULL AND Id = @BodyId), ' +
  '(SELECT TOP 1 Id FROM dbo.Libros WHERE Titulo = @Titulo AND (Autor = @Autor OR (Autor IS NULL AND @Autor IS NULL)))' +
  ') AS UpsertId, ' +
  '@Titulo AS Titulo, @Autor AS Autor, @Saga AS Saga, ' +
  '@Stock AS Stock, @Precio AS Precio, @CaratulaUrl AS CaratulaUrl, @ProveedorId AS ProveedorId, @CategoriaId AS CategoriaId';

function bindLibroPayload(req, libroId, { titulo, autor, saga, stockOk, precioOk, caratulaUrl, proveedorId, categoriaId }) {
  req.input('Id', sql.Int, libroId);
  req.input('Titulo', sql.NVarChar(300), titulo);
  req.input('Autor', sql.NVarChar(200), autor || null);
  req.input('Saga', sql.NVarChar(200), saga);
  req.input('Stock', sql.Int, stockOk);
  req.input('Precio', sql.Decimal(18, 2), precioOk);
  req.input('CaratulaUrl', sql.NVarChar(500), caratulaUrl || null);
  req.input('ProveedorId', sql.Int, proveedorId);
  req.input('CategoriaId', sql.Int, categoriaId);
}

function bindUpsertPostParams(req, bodyIdParam, { titulo, autor, saga, stockOk, precioOk, caratulaUrl, proveedorId, categoriaId }) {
  req.input('BodyId', sql.Int, bodyIdParam);
  req.input('Titulo', sql.NVarChar(300), titulo);
  req.input('Autor', sql.NVarChar(200), autor || null);
  req.input('Saga', sql.NVarChar(200), saga);
  req.input('Stock', sql.Int, stockOk);
  req.input('Precio', sql.Decimal(18, 2), precioOk);
  req.input('CaratulaUrl', sql.NVarChar(500), caratulaUrl || null);
  req.input('ProveedorId', sql.Int, proveedorId);
  req.input('CategoriaId', sql.Int, categoriaId);
}

/**
 * POST: un solo MERGE — si UpsertId resuelve fila → UPDATE; si UpsertId es NULL → INSERT.
 * @returns {{ id: number, wasUpdate: boolean }}
 */
async function upsertLibroPostUnaConsulta(pool, bodyId, payload) {
  let bodyIdParam = null;
  if (bodyId != null && bodyId !== '') {
    const p = parseInt(String(bodyId), 10);
    if (Number.isFinite(p) && p > 0) bodyIdParam = p;
  }

  const buildMergeSql = (includeFecha) => {
    const updateBranch = includeFecha
      ? `${MERGE_UPDATE_SET}, T.FechaActualizacion = SYSUTCDATETIME() `
      : `${MERGE_UPDATE_SET} `;
    return (
      'DECLARE @Out TABLE (MergeAction NVARCHAR(10), Id INT); ' +
      'MERGE dbo.Libros AS T ' +
      'USING (' +
      MERGE_USING_POST_UPSERT +
      ') AS S ' +
      'ON S.UpsertId IS NOT NULL AND T.Id = S.UpsertId ' +
      'WHEN MATCHED THEN UPDATE SET ' +
      updateBranch +
      'WHEN NOT MATCHED BY TARGET THEN ' +
      'INSERT (Titulo, Autor, Saga, Stock, Precio, CaratulaUrl, ProveedorId, CategoriaId) ' +
      'VALUES (S.Titulo, S.Autor, S.Saga, S.Stock, S.Precio, S.CaratulaUrl, S.ProveedorId, S.CategoriaId) ' +
      'OUTPUT $action AS MergeAction, INSERTED.Id AS Id INTO @Out; ' +
      'SELECT TOP 1 MergeAction, Id FROM @Out;'
    );
  };

  const run = async (includeFecha) => {
    const req = pool.request();
    bindUpsertPostParams(req, bodyIdParam, payload);
    return req.query(buildMergeSql(includeFecha));
  };

  let out;
  try {
    out = await run(true);
  } catch (eUp) {
    if (eUp && eUp.message && /Invalid column name 'FechaActualizacion'/i.test(eUp.message)) {
      out = await run(false);
    } else {
      throw eUp;
    }
  }

  const row = out.recordset && out.recordset[0];
  const libroId = row && row.Id != null ? row.Id : null;
  if (libroId == null) {
    throw new Error('MERGE POST no devolvió Id.');
  }
  const action = row && (row.MergeAction != null ? row.MergeAction : row.mergeaction);
  const wasUpdate = String(action || '').toUpperCase() === 'UPDATE';
  return { id: libroId, wasUpdate };
}

/**
 * UPDATE en dbo.Libros: MERGE con coincidencia por Id (`ON T.Id = S.Id` → `WHEN MATCHED THEN UPDATE SET …`).
 * No inserta filas nuevas.
 * @returns {ReturnType<typeof mapRow>}
 */
async function actualizarLibroPorId(
  pool,
  libroId,
  { titulo, autor, saga, stockOk, precioOk, caratulaUrl, proveedorId, categoriaId },
) {
  const reqUp = pool.request();
  bindLibroPayload(reqUp, libroId, {
    titulo,
    autor,
    saga,
    stockOk,
    precioOk,
    caratulaUrl,
    proveedorId,
    categoriaId,
  });
  // UPDATE: solo la rama WHEN MATCHED (fila existente con ese Id).
  const mergeSql =
    'MERGE dbo.Libros AS T ' +
    'USING (' +
    MERGE_USING_LIBRO +
    ') AS S ' +
    'ON T.Id = S.Id ' +
    'WHEN MATCHED THEN UPDATE SET ' +
    MERGE_UPDATE_SET +
    ', T.FechaActualizacion = SYSUTCDATETIME();';
  try {
    await reqUp.query(mergeSql);
  } catch (eUp) {
    if (eUp && eUp.message && /Invalid column name 'FechaActualizacion'/i.test(eUp.message)) {
      const req2 = pool.request();
      bindLibroPayload(req2, libroId, {
        titulo,
        autor,
        saga,
        stockOk,
        precioOk,
        caratulaUrl,
        proveedorId,
        categoriaId,
      });
      await req2.query(
        'MERGE dbo.Libros AS T ' +
          'USING (' +
          MERGE_USING_LIBRO +
          ') AS S ' +
          'ON T.Id = S.Id ' +
          'WHEN MATCHED THEN UPDATE SET ' +
          MERGE_UPDATE_SET +
          ';',
      );
    } else {
      throw eUp;
    }
  }
  const sel = await pool.request().input('Id', sql.Int, libroId).query(SELECT_BASE + 'WHERE L.Id = @Id');
  const row = sel.recordset && sel.recordset[0];
  return mapRow(row);
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

/**
 * POST /api/libros — INSERT/UPDATE en una sola sentencia MERGE (`upsertLibroPostUnaConsulta`).
 */
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

    const payload = {
      titulo,
      autor,
      saga,
      stockOk,
      precioOk,
      caratulaUrl,
      proveedorId,
      categoriaId,
    };

    const { id: libroId, wasUpdate } = await upsertLibroPostUnaConsulta(pool, body.id, payload);
    const sel = await pool
      .request()
      .input('Id', sql.Int, libroId)
      .query(SELECT_BASE + 'WHERE L.Id = @Id');
    const row = sel.recordset && sel.recordset[0];
    const book = mapRow(row);
    if (wasUpdate) {
      return res.json({ book, merged: true });
    }
    return res.status(201).json({ book });
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
    if (err && err.message && /Invalid column name 'Saga'/i.test(err.message)) {
      return res.status(500).json({
        error:
          'Falta la columna Saga en Libros. Ejecuta server/scripts/migrate-libros-saga.sql en la base Booknest.',
      });
    }
    return res.status(500).json({ error: 'No se pudo crear el libro.' });
  }
});

/**
 * PUT /api/libros/:id — solo UPDATE (`actualizarLibroPorId` / MERGE WHEN MATCHED). No hace INSERT.
 * Mismo cuerpo de campos que POST; el Id viene de la URL.
 */
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Id de libro no válido.' });
    }

    const body = req.body || {};
    const titulo = (body.titulo != null && String(body.titulo).trim()) || '';
    if (!titulo) {
      return res.status(400).json({ error: 'El título es obligatorio.' });
    }

    const autor = body.autor != null ? String(body.autor).trim() : null;
    const sagaRaw = body.saga != null ? String(body.saga).trim() : '';
    const saga = sagaRaw ? sagaRaw.slice(0, 200) : null;
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

    const existePut = await pool.request().input('Id', sql.Int, id).query('SELECT 1 AS Ok FROM dbo.Libros WHERE Id = @Id');
    if (!existePut.recordset || !existePut.recordset[0]) {
      return res.status(404).json({ error: 'Libro no encontrado.' });
    }
    const book = await actualizarLibroPorId(pool, id, {
      titulo,
      autor,
      saga,
      stockOk,
      precioOk,
      caratulaUrl,
      proveedorId,
      categoriaId,
    });
    return res.json({ book });
  } catch (err) {
    console.error('Error en PUT /api/libros/:id:', err);
    if (err && err.message && err.message.includes('FK_Libros_Proveedor')) {
      return res.status(400).json({ error: 'Proveedor no válido.' });
    }
    if (err && err.message && /Invalid column name 'Saga'/i.test(err.message)) {
      return res.status(500).json({
        error:
          'Falta la columna Saga en Libros. Ejecuta server/scripts/migrate-libros-saga.sql en la base Booknest.',
      });
    }
    if (err && err.message && /Invalid column name 'FechaActualizacion'/i.test(err.message)) {
      return res.status(500).json({
        error:
          'El esquema de Libros no tiene FechaActualizacion. Ejecuta migrate-evolucion-booknest.sql o actualiza la tabla.',
      });
    }
    return res.status(500).json({ error: 'No se pudo actualizar el libro.' });
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
