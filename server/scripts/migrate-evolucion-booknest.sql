-- Migración para bases Booknest ya creadas con el esquema anterior.
-- Ejecutar en SSMS sobre la base Booknest (una vez).
-- Incluye: Documento + Usuarios.DocumentoId/NumeroDocumento, Categorias + Libros.CategoriaId,
--          Ventas sin ClienteNombre/ClienteCorreo, trigger de stock/estado.

USE Booknest;
GO

-- 1) Tabla Documento y datos
IF OBJECT_ID('dbo.Documento', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Documento (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Codigo NVARCHAR(20) NOT NULL UNIQUE,
    Nombre NVARCHAR(120) NOT NULL
  );

  INSERT INTO dbo.Documento (Codigo, Nombre) VALUES
    (N'CC',  N'Cédula de Ciudadanía'),
    (N'CE',  N'Cédula de Extranjería'),
    (N'PA',  N'Pasaporte'),
    (N'TI',  N'Tarjeta de Identidad'),
    (N'NIT', N'NIT'),
    (N'DNI', N'DNI');
END
GO

-- 2) Usuarios: nuevas columnas y FK; quitar TipoDocumento/Documento duplicados
IF COL_LENGTH('dbo.Usuarios', 'DocumentoId') IS NULL
BEGIN
  ALTER TABLE dbo.Usuarios ADD DocumentoId INT NULL;
END
GO

IF COL_LENGTH('dbo.Usuarios', 'NumeroDocumento') IS NULL
BEGIN
  ALTER TABLE dbo.Usuarios ADD NumeroDocumento NVARCHAR(50) NULL;
END
GO

-- Copiar número de documento
IF COL_LENGTH('dbo.Usuarios', 'Documento') IS NOT NULL
BEGIN
  UPDATE dbo.Usuarios SET NumeroDocumento = Documento WHERE NumeroDocumento IS NULL AND Documento IS NOT NULL;
END
GO

-- Intentar enlazar tipo por texto previo
IF COL_LENGTH('dbo.Usuarios', 'TipoDocumento') IS NOT NULL
BEGIN
  UPDATE U
  SET U.DocumentoId = D.Id
  FROM dbo.Usuarios U
  INNER JOIN dbo.Documento D ON D.Nombre = U.TipoDocumento OR D.Codigo = U.TipoDocumento
  WHERE U.DocumentoId IS NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Usuarios_Documento'
)
BEGIN
  ALTER TABLE dbo.Usuarios
    ADD CONSTRAINT FK_Usuarios_Documento FOREIGN KEY (DocumentoId) REFERENCES dbo.Documento(Id);
END
GO

IF COL_LENGTH('dbo.Usuarios', 'TipoDocumento') IS NOT NULL
BEGIN
  ALTER TABLE dbo.Usuarios DROP COLUMN TipoDocumento;
END
GO

IF COL_LENGTH('dbo.Usuarios', 'Documento') IS NOT NULL
BEGIN
  ALTER TABLE dbo.Usuarios DROP COLUMN Documento;
END
GO

-- 3) Categorías
IF OBJECT_ID('dbo.Categorias', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Categorias (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Nombre NVARCHAR(120) NOT NULL UNIQUE
  );

  INSERT INTO dbo.Categorias (Nombre) VALUES
    (N'General'),
    (N'Ficción'),
    (N'No ficción'),
    (N'Infantil'),
    (N'Ciencia ficción'),
    (N'Terror');
END
GO

-- 4) Libros.CategoriaId
IF COL_LENGTH('dbo.Libros', 'CategoriaId') IS NULL
BEGIN
  ALTER TABLE dbo.Libros ADD CategoriaId INT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Libros_Categoria')
BEGIN
  ALTER TABLE dbo.Libros
    ADD CONSTRAINT FK_Libros_Categoria FOREIGN KEY (CategoriaId) REFERENCES dbo.Categorias(Id);
END
GO

DECLARE @Gen INT = (SELECT TOP 1 Id FROM dbo.Categorias WHERE Nombre = N'General');
IF @Gen IS NOT NULL
  UPDATE dbo.Libros SET CategoriaId = @Gen WHERE CategoriaId IS NULL;
GO

-- 5) Ventas: quitar columnas duplicadas del cliente
IF COL_LENGTH('dbo.Ventas', 'ClienteNombre') IS NOT NULL
BEGIN
  ALTER TABLE dbo.Ventas DROP COLUMN ClienteNombre;
END
GO

IF COL_LENGTH('dbo.Ventas', 'ClienteCorreo') IS NOT NULL
BEGIN
  ALTER TABLE dbo.Ventas DROP COLUMN ClienteCorreo;
END
GO

-- 6) Alinear estado con stock existente
UPDATE dbo.Libros SET Estado = N'agotado' WHERE Stock <= 0 AND (Estado IS NULL OR Estado <> N'agotado');
GO

-- 7) Trigger stock / estado
DROP TRIGGER IF EXISTS dbo.TR_Libros_EstadoPorStock;
GO

CREATE TRIGGER dbo.TR_Libros_EstadoPorStock ON dbo.Libros
AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE L
  SET L.Estado = N'agotado',
      L.FechaActualizacion = SYSUTCDATETIME()
  FROM dbo.Libros L
  INNER JOIN inserted i ON L.Id = i.Id
  WHERE L.Stock <= 0 AND (L.Estado IS NULL OR L.Estado <> N'agotado');

  UPDATE L
  SET L.Estado = N'disponible',
      L.FechaActualizacion = SYSUTCDATETIME()
  FROM dbo.Libros L
  INNER JOIN inserted i ON L.Id = i.Id
  WHERE L.Stock > 0 AND L.Estado = N'agotado';
END
GO

PRINT 'Migración migrate-evolucion-booknest.sql aplicada.';
GO
