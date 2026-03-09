const express = require('express');
const db = require('../config/database');

const { sql } = db;
const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { correo, password } = req.body || {};

    if (!correo || !password) {
      return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
    }

    if (!correo.endsWith('@booknest.com')) {
      return res.status(400).json({ error: 'Solo se permiten correos con el dominio @booknest.com.' });
    }

    const pool = await db.getPool();
    const request = pool.request();

    request.input('correo', sql.NVarChar, correo);
    request.input('password', sql.NVarChar, password);

    const result = await request.query(
      'SELECT TOP 1 Id, Nombre, Correo, Usuario, Rol, Activo ' +
        'FROM Usuarios ' +
        'WHERE Correo = @correo AND PasswordHash = @password AND Activo = 1',
    );

    const user = result.recordset && result.recordset[0];

    if (!user) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

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

module.exports = router;

