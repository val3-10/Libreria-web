-- Usuario administrador de prueba (contraseña en claro, igual que el resto del proyecto en auth.js).
-- Login: correo admin@booknest.com  |  contraseña Abc123
-- Solo inserta si no existe ese correo.


IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE Correo = N'admin@booknest.com')
BEGIN
  INSERT INTO dbo.Usuarios (
    Nombre,
    DocumentoId,
    NumeroDocumento,
    Correo,
    Telefono,
    Direccion,
    FechaNacimiento,
    Usuario,
    PasswordHash,
    Rol,
    Activo
  )
  VALUES (
    N'Administrador Booknest',
    NULL,
    NULL,
    N'admin@booknest.com',
    NULL,
    NULL,
    NULL,
    N'admin',
    N'Abc123',
    N'admin',
    1
  );
  PRINT 'Usuario admin creado: admin@booknest.com / Abc123';
END
ELSE
  PRINT 'Ya existe un usuario con admin@booknest.com; no se insertó de nuevo.';
GO
