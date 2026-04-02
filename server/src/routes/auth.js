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

    request.input('correo', sql.NVarChar, correo);
    request.input('password', sql.NVarChar, password);

    // Consulta SQL a la tabla Usuarios: buscar un usuario con ese correo y contraseña
    const result = await request.query(
      'SELECT TOP 1 Id, Nombre, Correo, Usuario, Rol, Activo ' +
        'FROM Usuarios ' +
        'WHERE Correo = @correo AND PasswordHash = @password AND Activo = 1',
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

    const reqInsert = pool.request();
    reqInsert.input('Nombre', sql.NVarChar, nombre);
    reqInsert.input('TipoDocumento', sql.NVarChar, tipo_documento || null);
    reqInsert.input('Documento', sql.NVarChar, documento || null);
    reqInsert.input('Correo', sql.NVarChar, correo);
    reqInsert.input('Telefono', sql.NVarChar, telefono || null);
    reqInsert.input('Direccion', sql.NVarChar, direccion || null);
    reqInsert.input('FechaNacimiento', sql.Date, fecha || null);
    reqInsert.input('Usuario', sql.NVarChar, usuario);
    reqInsert.input('PasswordHash', sql.NVarChar, password);
    reqInsert.input('Rol', sql.NVarChar, 'Cliente');

    await reqInsert.query(
      'INSERT INTO Usuarios (Nombre, TipoDocumento, Documento, Correo, Telefono, Direccion, FechaNacimiento, Usuario, PasswordHash, Rol, Activo) ' +
        'VALUES (@Nombre, @TipoDocumento, @Documento, @Correo, @Telefono, @Direccion, @FechaNacimiento, @Usuario, @PasswordHash, @Rol, 1);',
    );

    return res.status(201).json({ message: 'Cuenta creada correctamente.' });
  } catch (err) {
    console.error('Error en /api/auth/register:', err);
    return res.status(500).json({ error: 'Error interno al registrar el usuario.' });
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

    const reqInsert = pool.request();
    reqInsert.input('Nombre', sql.NVarChar, nombre);
    reqInsert.input('TipoDocumento', sql.NVarChar, tipo_documento || null);
    reqInsert.input('Documento', sql.NVarChar, documento || null);
    reqInsert.input('Correo', sql.NVarChar, correo);
    reqInsert.input('Telefono', sql.NVarChar, telefono || null);
    reqInsert.input('Direccion', sql.NVarChar, direccion || null);
    reqInsert.input('FechaNacimiento', sql.Date, fecha || null);
    reqInsert.input('Usuario', sql.NVarChar, usuario);
    reqInsert.input('PasswordHash', sql.NVarChar, password);
    reqInsert.input('Rol', sql.NVarChar, rol);

    await reqInsert.query(
      'INSERT INTO Usuarios (Nombre, TipoDocumento, Documento, Correo, Telefono, Direccion, FechaNacimiento, Usuario, PasswordHash, Rol, Activo) ' +
        'VALUES (@Nombre, @TipoDocumento, @Documento, @Correo, @Telefono, @Direccion, @FechaNacimiento, @Usuario, @PasswordHash, @Rol, 1);',
    );

    return res.status(201).json({ message: 'Cuenta administrativa creada correctamente.' });
  } catch (err) {
    console.error('Error en /api/auth/register-admin:', err);
    return res.status(500).json({ error: 'Error interno al registrar el usuario administrativo.' });
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
        'FROM Usuarios ' +
        'WHERE Correo = @Correo AND PasswordHash = @PasswordHash AND Activo = 1',
    );

    const user = selectResult.recordset && selectResult.recordset[0];

    if (!user) {
      return res.status(401).json({ error: 'Correo o contraseña actual incorrectos.' });
    }

    // Actualizar la contraseña del usuario.
    const reqUpdate = pool.request();
    reqUpdate.input('Id', sql.Int, user.Id);
    reqUpdate.input('PasswordHash', sql.NVarChar, passwordNueva);

    await reqUpdate.query(
      'UPDATE Usuarios ' +
        'SET PasswordHash = @PasswordHash, FechaActualizacion = SYSUTCDATETIME() ' +
        'WHERE Id = @Id',
    );

    return res.json({ message: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    console.error('Error en /api/auth/change-password:', err);
    return res.status(500).json({ error: 'Error interno al cambiar la contraseña.' });
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
      'SELECT TOP 1 Id, Rol FROM Usuarios ' +
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
      'UPDATE Usuarios SET Activo = 0, FechaActualizacion = SYSUTCDATETIME() WHERE Id = @Id',
    );

    return res.json({ message: 'Cuenta desactivada correctamente.' });
  } catch (err) {
    console.error('Error en /api/auth/deactivate-account:', err);
    return res.status(500).json({ error: 'Error interno al desactivar la cuenta.' });
  }
});

module.exports = router;

