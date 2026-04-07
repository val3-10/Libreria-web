/**
 * Rutas de autenticación (API de auth).
 *
 * Este archivo es parte del BACKEND. El frontend (login.html, register.html, etc.)
 * llama a estas rutas mediante fetch() con la URL base + /api/auth/...
 *
 * Flujo: Frontend (fetch POST) → Express recibe en esta ruta → lee req.body →
 * consulta la base de datos (config/database.js) → responde con res.json().
 *
 * ¿Por qué POST para login?
 * - El frontend envía correo y contraseña en el cuerpo (body) de la petición.
 * - POST es el método adecuado para "enviar" datos al servidor; GET pondría
 *   los datos en la URL (inseguro para contraseñas).
 */

const express = require('express');
const db = require('../config/database');

const { sql } = db;
const router = express.Router();

/**
 * Códigos de recuperación en memoria (demo). En producción: Redis + envío por correo.
 * Map: correo normalizado (minúsculas) → { code, expires, userId }
 */
const resetCodes = new Map();

function cleanupExpiredResetCodes() {
  const now = Date.now();
  for (const [k, v] of resetCodes.entries()) {
    if (!v || v.expires < now) resetCodes.delete(k);
  }
}

/** Correo en minúsculas y sin espacios al inicio/final (clave para recuperación / códigos). */
function emailNorm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase();
}

function resolveRegisterDbError(err, adminMode = false) {
  const msg = String((err && err.message) || '');
  if (/CK_Usuarios_FechaNacimiento|FechaNacimiento/i.test(msg)) {
    return 'La fecha de nacimiento no es válida. Debe ser hoy o una fecha anterior.';
  }
  if (/CK_Libros_Precio|Precio/i.test(msg)) {
    return 'El valor enviado no cumple las reglas de validación de la base de datos. Verifica los datos e inténtalo de nuevo.';
  }
  return adminMode
    ? 'Error interno al registrar el usuario administrativo.'
    : 'Error interno al registrar el usuario.';
}

/** Resuelve tipo de documento (texto del formulario) al Id de dbo.Documento */
async function resolveDocumentoId(pool, tipoDocumento) {
  if (!tipoDocumento || !String(tipoDocumento).trim()) return null;
  const t = String(tipoDocumento).trim();
  try {
    const r = await pool.request().input('t', sql.NVarChar(200), t).query(
      'SELECT TOP 1 Id FROM dbo.Documento WHERE Nombre = @t OR Codigo = @t',
    );
    return r.recordset && r.recordset[0] ? r.recordset[0].Id : null;
  } catch (e) {
    if (e && e.message && e.message.includes('Invalid object name')) return null;
    throw e;
  }
}

// POST /api/auth/login
// El frontend llama a esta ruta con fetch('.../api/auth/login', { method: 'POST', body: JSON.stringify({ correo, password }) })
router.post('/login', async (req, res) => {
  try {
    // Datos que envió el frontend en el body de la petición POST
    const { correo, password } = req.body || {};

    if (!correo || !password) {
      return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
    }

    if (!correo.endsWith('@booknest.com')) {
      return res.status(400).json({ error: 'Solo se permiten correos con el dominio @booknest.com.' });
    }

    // Conexión a la base de datos (SQL Server). El backend es quien habla con la BD;
    // el frontend nunca se conecta directamente.
    const pool = await db.getPool();
    const request = pool.request();

    // Misma convención que change-password / deactivate: PasswordHash almacena texto plano (ver insert-admin-usuario.sql).
    request.input('Correo', sql.NVarChar, correo);
    request.input('PasswordHash', sql.NVarChar, password);

    const result = await request.query(
      'SELECT TOP 1 Id, Nombre, Correo, Usuario, Rol, Activo ' +
        'FROM dbo.Usuarios ' +
        'WHERE Correo = @Correo AND PasswordHash = @PasswordHash AND Activo = 1',
    );

    const user = result.recordset && result.recordset[0];

    if (!user) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    // Respuesta que recibe el frontend: un JSON con los datos del usuario
    return res.json({
      user: {
        id: user.Id,
        nombre: user.Nombre,
        correo: user.Correo,
        usuario: user.Usuario,
        rol: user.Rol || 'cliente',
      },
    });
  } catch (err) {
    console.error('Error en /api/auth/login:', err);
    return res.status(500).json({ error: 'Error interno al intentar iniciar sesión.' });
  }
});

// POST /api/auth/register  (cliente)
router.post('/register', async (req, res) => {
  try {
    const {
      nombre,
      tipo_documento,
      documento,
      correo,
      telefono,
      direccion,
      fecha,
      usuario,
      password,
    } = req.body || {};

    if (!nombre || !correo || !usuario || !password) {
      return res.status(400).json({ error: 'Nombre, correo, usuario y contraseña son obligatorios.' });
    }

    if (!correo.endsWith('@booknest.com')) {
      return res.status(400).json({ error: 'Solo se permiten correos con el dominio @booknest.com.' });
    }

    const pool = await db.getPool();

    // Validar duplicados
    const dupReq = pool.request();
    dupReq.input('correo', sql.NVarChar, correo);
    dupReq.input('usuario', sql.NVarChar, usuario);
    const dupResult = await dupReq.query(
      'SELECT TOP 1 Correo, Usuario FROM Usuarios WHERE Correo = @correo OR Usuario = @usuario',
    );

    if (dupResult.recordset && dupResult.recordset.length > 0) {
      const existeCorreo = dupResult.recordset.some((u) => u.Correo === correo);
      const existeUsuario = dupResult.recordset.some((u) => u.Usuario === usuario);
      return res.status(409).json({
        error: existeCorreo
          ? 'El correo ya está registrado.'
          : existeUsuario
            ? 'El nombre de usuario ya está en uso.'
            : 'El usuario ya existe.',
      });
    }

    const documentoId = await resolveDocumentoId(pool, tipo_documento);

    const reqInsert = pool.request();
    reqInsert.input('Nombre', sql.NVarChar, nombre);
    reqInsert.input('DocumentoId', sql.Int, documentoId);
    reqInsert.input('NumeroDocumento', sql.NVarChar, documento || null);
    reqInsert.input('Correo', sql.NVarChar, correo);
    reqInsert.input('Telefono', sql.NVarChar, telefono || null);
    reqInsert.input('Direccion', sql.NVarChar, direccion || null);
    reqInsert.input('FechaNacimiento', sql.Date, fecha || null);
    reqInsert.input('Usuario', sql.NVarChar, usuario);
    reqInsert.input('PasswordHash', sql.NVarChar, password);
    reqInsert.input('Rol', sql.NVarChar, 'Cliente');

    await reqInsert.query(
      'INSERT INTO Usuarios (Nombre, DocumentoId, NumeroDocumento, Correo, Telefono, Direccion, FechaNacimiento, Usuario, PasswordHash, Rol, Activo) ' +
        'VALUES (@Nombre, @DocumentoId, @NumeroDocumento, @Correo, @Telefono, @Direccion, @FechaNacimiento, @Usuario, @PasswordHash, @Rol, 1);',
    );

    return res.status(201).json({ message: 'Cuenta creada correctamente.' });
  } catch (err) {
    console.error('Error en /api/auth/register:', err);
    return res.status(500).json({ error: resolveRegisterDbError(err, false) });
  }
});

// POST /api/auth/register-admin  (admin / empleado / proveedor)
router.post('/register-admin', async (req, res) => {
  try {
    const {
      nombre,
      tipo_documento,
      documento,
      correo,
      telefono,
      direccion,
      fecha,
      usuario,
      password,
      rol,
    } = req.body || {};

    if (!nombre || !correo || !usuario || !password || !rol) {
      return res
        .status(400)
        .json({ error: 'Nombre, correo, usuario, rol y contraseña son obligatorios.' });
    }

    if (!correo.endsWith('@booknest.com')) {
      return res.status(400).json({ error: 'Solo se permiten correos con el dominio @booknest.com.' });
    }

    const pool = await db.getPool();

    // Validar duplicados
    const dupReq = pool.request();
    dupReq.input('correo', sql.NVarChar, correo);
    dupReq.input('usuario', sql.NVarChar, usuario);
    const dupResult = await dupReq.query(
      'SELECT TOP 1 Correo, Usuario FROM Usuarios WHERE Correo = @correo OR Usuario = @usuario',
    );

    if (dupResult.recordset && dupResult.recordset.length > 0) {
      const existeCorreo = dupResult.recordset.some((u) => u.Correo === correo);
      const existeUsuario = dupResult.recordset.some((u) => u.Usuario === usuario);
      return res.status(409).json({
        error: existeCorreo
          ? 'El correo ya está registrado.'
          : existeUsuario
            ? 'El nombre de usuario ya está en uso.'
            : 'El usuario ya existe.',
      });
    }

    const documentoId = await resolveDocumentoId(pool, tipo_documento);

    const reqInsert = pool.request();
    reqInsert.input('Nombre', sql.NVarChar, nombre);
    reqInsert.input('DocumentoId', sql.Int, documentoId);
    reqInsert.input('NumeroDocumento', sql.NVarChar, documento || null);
    reqInsert.input('Correo', sql.NVarChar, correo);
    reqInsert.input('Telefono', sql.NVarChar, telefono || null);
    reqInsert.input('Direccion', sql.NVarChar, direccion || null);
    reqInsert.input('FechaNacimiento', sql.Date, fecha || null);
    reqInsert.input('Usuario', sql.NVarChar, usuario);
    reqInsert.input('PasswordHash', sql.NVarChar, password);
    reqInsert.input('Rol', sql.NVarChar, rol);

    await reqInsert.query(
      'INSERT INTO Usuarios (Nombre, DocumentoId, NumeroDocumento, Correo, Telefono, Direccion, FechaNacimiento, Usuario, PasswordHash, Rol, Activo) ' +
        'VALUES (@Nombre, @DocumentoId, @NumeroDocumento, @Correo, @Telefono, @Direccion, @FechaNacimiento, @Usuario, @PasswordHash, @Rol, 1);',
    );

    return res.status(201).json({ message: 'Cuenta administrativa creada correctamente.' });
  } catch (err) {
    console.error('Error en /api/auth/register-admin:', err);
    return res.status(500).json({ error: resolveRegisterDbError(err, true) });
  }
});

// POST /api/auth/change-password
// Permite actualizar la contraseña de un usuario existente.
// Flujo esperado desde el frontend:
//   fetch('http://localhost:3000/api/auth/change-password', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       correo: 'usuario@booknest.com',
//       passwordActual: 'anterior',
//       passwordNueva: 'nueva',
//     }),
//   })
//     .then((r) => r.json())
//     .then(console.log);
router.post('/change-password', async (req, res) => {
  try {
    const { correo, passwordActual, passwordNueva } = req.body || {};

    if (!correo || !passwordActual || !passwordNueva) {
      return res
        .status(400)
        .json({ error: 'Correo, contraseña actual y contraseña nueva son obligatorios.' });
    }

    if (!correo.endsWith('@booknest.com')) {
      return res.status(400).json({ error: 'Solo se permiten correos con el dominio @booknest.com.' });
    }

    if (passwordActual === passwordNueva) {
      return res
        .status(400)
        .json({ error: 'La contraseña nueva debe ser diferente a la actual.' });
    }

    const pool = await db.getPool();

    // Verificar que el usuario exista y que la contraseña actual sea correcta.
    const reqSelect = pool.request();
    reqSelect.input('Correo', sql.NVarChar, correo);
    reqSelect.input('PasswordHash', sql.NVarChar, passwordActual);

    const selectResult = await reqSelect.query(
      'SELECT TOP 1 Id, Correo, Usuario, Activo ' +
        'FROM dbo.Usuarios ' +
        'WHERE Correo = @Correo AND PasswordHash = @PasswordHash AND Activo = 1',
    );

    const user = selectResult.recordset && selectResult.recordset[0];

    if (!user) {
      return res.status(401).json({ error: 'Correo o contraseña actual incorrectos.' });
    }

    const reqUpdate = pool.request();
    reqUpdate.input('Id', sql.Int, user.Id);
    reqUpdate.input('PasswordHash', sql.NVarChar, passwordNueva);

    await reqUpdate.query(
      'UPDATE dbo.Usuarios ' +
        'SET PasswordHash = @PasswordHash, FechaActualizacion = SYSUTCDATETIME() ' +
        'WHERE Id = @Id',
    );

    return res.json({ message: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    console.error('Error en /api/auth/change-password:', err);
    return res.status(500).json({ error: 'Error interno al cambiar la contraseña.' });
  }
});

// POST /api/auth/forgot-password  { correo } — comprueba dbo.Usuarios y genera código (demo: se devuelve en JSON)
router.post('/forgot-password', async (req, res) => {
  try {
    const { correo } = req.body || {};
    const trimmed = correo != null ? String(correo).trim() : '';
    if (!trimmed) {
      return res.status(400).json({ error: 'Correo es obligatorio.' });
    }
    if (!trimmed.toLowerCase().endsWith('@booknest.com')) {
      return res.status(400).json({ error: 'Solo se permiten correos con el dominio @booknest.com.' });
    }

    const norm = emailNorm(trimmed);

    cleanupExpiredResetCodes();
    const pool = await db.getPool();
    // Coincidencia exacta (como en login) o normalizada; Activo NULL se trata como activo (BD antigua)
    const result = await pool
      .request()
      .input('CorreoExacto', sql.NVarChar(320), trimmed)
      .input('CorreoNorm', sql.NVarChar(320), norm)
      .query(
        'SELECT TOP 1 Id, Correo, Activo FROM dbo.Usuarios ' +
          'WHERE (LTRIM(RTRIM(Correo)) = LTRIM(RTRIM(@CorreoExacto)) ' +
          '   OR LOWER(LTRIM(RTRIM(ISNULL(Correo, N\'\')))) = @CorreoNorm) ' +
          'ORDER BY Id',
      );

    const row = result.recordset && result.recordset[0];
    if (!row) {
      return res.status(404).json({
        error:
          'No hay ninguna cuenta activa con ese correo. Usa el mismo correo con el que inicias sesión (debe terminar en @booknest.com) y comprueba que el servidor apunte a la base Booknest correcta.',
      });
    }

    // BIT en SQL Server suele llegar como boolean; 0 en algunos drivers
    if (row.Activo === false || row.Activo === 0) {
      return res.status(403).json({
        error: 'Esa cuenta está desactivada. No se puede recuperar la contraseña desde aquí.',
      });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const key = norm;
    resetCodes.set(key, {
      code,
      expires: Date.now() + 15 * 60 * 1000,
      userId: row.Id,
    });

    return res.json({
      message: 'Código generado. En producción se enviaría por correo; aquí es solo para pruebas.',
      codigo: code,
    });
  } catch (err) {
    console.error('Error en /api/auth/forgot-password:', err);
    return res.status(500).json({ error: 'Error interno al solicitar recuperación.' });
  }
});

// POST /api/auth/reset-password  { correo, codigo, passwordNueva }
router.post('/reset-password', async (req, res) => {
  try {
    const { correo, codigo, passwordNueva } = req.body || {};
    const trimmed = correo != null ? String(correo).trim() : '';
    if (!trimmed || codigo == null || passwordNueva == null || String(passwordNueva) === '') {
      return res.status(400).json({ error: 'Correo, código y nueva contraseña son obligatorios.' });
    }
    if (!trimmed.toLowerCase().endsWith('@booknest.com')) {
      return res.status(400).json({ error: 'Solo se permiten correos con el dominio @booknest.com.' });
    }

    const key = emailNorm(trimmed);
    cleanupExpiredResetCodes();
    const entry = resetCodes.get(key);
    if (!entry || String(codigo).trim() !== String(entry.code)) {
      return res.status(401).json({ error: 'Código incorrecto o expirado. Solicita uno nuevo.' });
    }
    if (Date.now() > entry.expires) {
      resetCodes.delete(key);
      return res.status(401).json({ error: 'El código expiró. Solicita uno nuevo.' });
    }

    const pwd = String(passwordNueva);
    if (pwd.length < 4) {
      return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 4 caracteres.' });
    }

    const pool = await db.getPool();
    const reqUpdate = pool.request();
    reqUpdate.input('Id', sql.Int, entry.userId);
    reqUpdate.input('PasswordHash', sql.NVarChar, pwd);
    await reqUpdate.query(
      'UPDATE dbo.Usuarios ' +
        'SET PasswordHash = @PasswordHash, FechaActualizacion = SYSUTCDATETIME() ' +
        'WHERE Id = @Id AND Activo = 1',
    );

    resetCodes.delete(key);
    return res.json({ message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' });
  } catch (err) {
    console.error('Error en /api/auth/reset-password:', err);
    return res.status(500).json({ error: 'Error interno al restablecer la contraseña.' });
  }
});

// POST /api/auth/deactivate-account
// Desactiva la cuenta (Activo = 0). Requiere correo y contraseña.
router.post('/deactivate-account', async (req, res) => {
  try {
    const { correo, password } = req.body || {};

    if (!correo || !password) {
      return res.status(400).json({ error: 'Correo y contraseña son obligatorios para dar de baja la cuenta.' });
    }

    if (!correo.endsWith('@booknest.com')) {
      return res.status(400).json({ error: 'Solo se permiten correos con el dominio @booknest.com.' });
    }

    const pool = await db.getPool();
    const reqSelect = pool.request();
    reqSelect.input('Correo', sql.NVarChar, correo);
    reqSelect.input('PasswordHash', sql.NVarChar, password);

    const selectResult = await reqSelect.query(
      'SELECT TOP 1 Id, Rol FROM dbo.Usuarios ' +
        'WHERE Correo = @Correo AND PasswordHash = @PasswordHash AND Activo = 1',
    );

    const user = selectResult.recordset && selectResult.recordset[0];
    if (!user) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    const rol = String(user.Rol || '').toLowerCase();
    if (rol === 'admin' || rol === 'administrador') {
      return res.status(403).json({ error: 'Las cuentas de administrador no se pueden dar de baja desde aquí.' });
    }

    try {
      await pool.request().input('UsuarioId', sql.Int, user.Id).query('DELETE FROM dbo.Carrito WHERE UsuarioId = @UsuarioId');
    } catch (e) {
      if (!e || !e.message || !e.message.includes('Invalid object name')) throw e;
    }

    const reqUpd = pool.request();
    reqUpd.input('Id', sql.Int, user.Id);
    await reqUpd.query(
      'UPDATE dbo.Usuarios SET Activo = 0, FechaActualizacion = SYSUTCDATETIME() WHERE Id = @Id',
    );

    return res.json({ message: 'Cuenta desactivada correctamente.' });
  } catch (err) {
    console.error('Error en /api/auth/deactivate-account:', err);
    return res.status(500).json({ error: 'Error interno al desactivar la cuenta.' });
  }
});

module.exports = router;

