-- Migración: tabla Favoritos (usuarios y libros marcados con corazón)
-- Ejecutar en una base Booknest ya creada si la tabla no existe.

USE Booknest;
GO

IF OBJECT_ID('dbo.Favoritos', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Favoritos (
    UsuarioId INT NOT NULL,
    LibroId INT NOT NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Favoritos PRIMARY KEY (UsuarioId, LibroId),
    CONSTRAINT FK_Favoritos_Usuario FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuarios(Id),
    CONSTRAINT FK_Favoritos_Libro FOREIGN KEY (LibroId) REFERENCES dbo.Libros(Id)
  );
END
GO

PRINT 'Migración Favoritos aplicada (si faltaba).';
GO
