-- Script inicial para Booknest en SQL Server
-- Ejecutar en SSMS o sqlcmd conectado al servidor

USE master;
GO

IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'Booknest')
  CREATE DATABASE Booknest;
GO

USE Booknest;
GO

-- Catálogo de tipos de documento de identidad (relacionado con Usuarios.DocumentoId)
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

-- Categorías de libros (Libros.CategoriaId)
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

-- Proveedores (antes de Libros por la FK)
IF OBJECT_ID('dbo.Proveedores', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Proveedores (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Nombre NVARCHAR(200) NOT NULL,
    Contacto NVARCHAR(255) NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );

  INSERT INTO dbo.Proveedores (Nombre, Contacto) VALUES
    (N'Distribuidora Editorial Sur', N'compras@delsur.com.co'),
    (N'Libros & Más SAS', N'ventas@librosymas.com'),
    (N'Importadora Lector Global', N'logistica@lectorglobal.co'),
    (N'Casa del Libro Bogotá', N'proveedores@casadellibro-bog.com'),
    (N'Distribuidora Panamericana', N'comercial@panamericana.com.co'),
    (N'Editorial independiente Norte', N'contacto@edinorte.org');
END
GO

-- Usuarios (clientes y empleados). Nombre y correo para ventas: vía JOIN, no duplicados en Ventas.
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
    FechaNacimiento DATE NULL,
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

-- Libros
IF OBJECT_ID('dbo.Libros', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Libros (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Titulo NVARCHAR(300) NOT NULL,
    Autor NVARCHAR(200) NULL,
    EstadoCatalogo NVARCHAR(50) NOT NULL
      CONSTRAINT DF_Libros_EstadoCatalogo DEFAULT (N'disponible'),
    Stock INT NOT NULL DEFAULT 0,
    Precio DECIMAL(18,2) NULL DEFAULT 0,
    CaratulaUrl NVARCHAR(500) NULL,
    ProveedorId INT NULL,
    CategoriaId INT NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2 NULL,
    Estado AS (
      CASE WHEN Stock <= 0 THEN CONVERT(NVARCHAR(50), N'agotado') ELSE EstadoCatalogo END
    ) PERSISTED,
    CONSTRAINT FK_Libros_Proveedor FOREIGN KEY (ProveedorId) REFERENCES dbo.Proveedores(Id),
    CONSTRAINT FK_Libros_Categoria FOREIGN KEY (CategoriaId) REFERENCES dbo.Categorias(Id)
  );
END
GO

-- Ventas: cliente identificado solo por UsuarioId (nombre/correo en dbo.Usuarios)
IF OBJECT_ID('dbo.Ventas', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Ventas (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    UsuarioId INT NOT NULL,
    Fecha DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    Total DECIMAL(18,2) NOT NULL DEFAULT 0,
    Detalle NVARCHAR(MAX) NULL,
    CONSTRAINT FK_Ventas_Usuario FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuarios(Id)
  );
END
GO

-- Préstamos
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

-- Carrito de compras por usuario
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

-- Estado visible: columna calculada PERSISTED (Stock <= 0 => agotado; si no, EstadoCatalogo disponible|venta)

PRINT 'Base de datos Booknest y tablas creadas correctamente.';
