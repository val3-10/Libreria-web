-- Booknest DDL (solo estructura)
-- Ejecutar primero. Luego correr insert.sql (DML).

USE master;
GO

IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'Booknest')
  CREATE DATABASE Booknest;
GO

USE Booknest;
GO

IF OBJECT_ID('dbo.Documento', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Documento (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Codigo NVARCHAR(20) NOT NULL UNIQUE,
    Nombre NVARCHAR(120) NOT NULL
  );
END
GO

IF OBJECT_ID('dbo.Categorias', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Categorias (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Nombre NVARCHAR(120) NOT NULL UNIQUE
  );
END
GO

IF OBJECT_ID('dbo.Proveedores', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Proveedores (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Nombre NVARCHAR(200) NOT NULL,
    Contacto NVARCHAR(255) NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END
GO

IF OBJECT_ID('dbo.Usuarios', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Usuarios (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Nombre NVARCHAR(200) NOT NULL,
    DocumentoId INT NULL,
    NumeroDocumento NVARCHAR(50) NULL,
    Correo NVARCHAR(255) NOT NULL UNIQUE,
    Telefono NVARCHAR(50) NULL,
    Direccion NVARCHAR(500) NULL,
    FechaNacimiento DATE NULL CHECK (FechaNacimiento <= CAST(SYSUTCDATETIME() AS DATE)),
    Usuario NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    Rol NVARCHAR(50) NOT NULL DEFAULT 'cliente',
    Activo BIT NOT NULL DEFAULT 1,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2 NULL,
    CONSTRAINT FK_Usuarios_Documento FOREIGN KEY (DocumentoId) REFERENCES dbo.Documento(Id)
  );
END
GO

IF OBJECT_ID('dbo.Libros', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Libros (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Titulo NVARCHAR(300) NOT NULL,
    Autor NVARCHAR(200) NULL,
    Saga NVARCHAR(200) NULL,
    Stock INT NOT NULL DEFAULT 0,
    Precio DECIMAL(18,2) NOT NULL CHECK (Precio > 0),
    CaratulaUrl NVARCHAR(500) NULL,
    ProveedorId INT NULL,
    CategoriaId INT NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2 NULL,
    Estado NVARCHAR(50) NOT NULL DEFAULT N'disponible',
    CONSTRAINT FK_Libros_Proveedor FOREIGN KEY (ProveedorId) REFERENCES dbo.Proveedores(Id),
    CONSTRAINT FK_Libros_Categoria FOREIGN KEY (CategoriaId) REFERENCES dbo.Categorias(Id)
  );
END
GO

CREATE OR ALTER TRIGGER dbo.trg_Libros_EstadoPorStock
ON dbo.Libros
AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE L
  SET Estado = CASE WHEN L.Stock <= 0 THEN N'agotado' ELSE N'disponible' END
  FROM dbo.Libros L
  INNER JOIN inserted i ON i.Id = L.Id;
END
GO

UPDATE dbo.Libros
SET Estado = CASE WHEN Stock <= 0 THEN N'agotado' ELSE N'disponible' END
WHERE Estado <> CASE WHEN Stock <= 0 THEN N'agotado' ELSE N'disponible' END
   OR Estado IS NULL;
GO

IF OBJECT_ID('dbo.Ventas', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Ventas (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    UsuarioId INT NOT NULL,
    Fecha DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    Total DECIMAL(18,2) NOT NULL DEFAULT 0,
    CONSTRAINT FK_Ventas_Usuario FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuarios(Id)
  );
END
GO

IF OBJECT_ID('dbo.VentaDetalle', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.VentaDetalle (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    VentaId INT NOT NULL,
    LibroId INT NOT NULL,
    Titulo NVARCHAR(300) NOT NULL,
    Cantidad INT NOT NULL DEFAULT 1,
    PrecioUnitario DECIMAL(18,2) NOT NULL DEFAULT 0,
    Subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_VentaDetalle_Venta FOREIGN KEY (VentaId) REFERENCES dbo.Ventas(Id),
    CONSTRAINT FK_VentaDetalle_Libro FOREIGN KEY (LibroId) REFERENCES dbo.Libros(Id)
  );
END
GO

IF OBJECT_ID('dbo.Prestamos', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Prestamos (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    UsuarioId INT NULL,
    LibroId INT NULL,
    Cantidad INT NOT NULL DEFAULT 1,
    FechaInicio DATETIME2 NOT NULL,
    FechaDevolucion DATETIME2 NOT NULL,
    Estado NVARCHAR(50) NOT NULL DEFAULT 'Activo',
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Prestamos_Usuario FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuarios(Id),
    CONSTRAINT FK_Prestamos_Libro FOREIGN KEY (LibroId) REFERENCES dbo.Libros(Id)
  );
END
GO

IF OBJECT_ID('dbo.Carrito', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Carrito (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    UsuarioId INT NOT NULL,
    LibroId INT NOT NULL,
    Cantidad INT NOT NULL DEFAULT 1,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2 NULL,
    CONSTRAINT FK_Carrito_Usuario FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuarios(Id),
    CONSTRAINT FK_Carrito_Libro FOREIGN KEY (LibroId) REFERENCES dbo.Libros(Id),
    CONSTRAINT UQ_Carrito_Usuario_Libro UNIQUE (UsuarioId, LibroId)
  );
END
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

PRINT 'DDL Booknest creado correctamente.';
