-- Script inicial para Booknest en SQL Server
-- Ejecutar en SSMS o sqlcmd conectado al servidor

USE master;
GO

IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'Booknest')
  CREATE DATABASE Booknest;
GO

USE Booknest;
GO

-- Usuarios (clientes y empleados registrados)
IF OBJECT_ID('dbo.Usuarios', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Usuarios (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Nombre NVARCHAR(200) NOT NULL,
    TipoDocumento NVARCHAR(50) NULL,
    Documento NVARCHAR(50) NULL,
    Correo NVARCHAR(255) NOT NULL UNIQUE,
    Telefono NVARCHAR(50) NULL,
    Direccion NVARCHAR(500) NULL,
    FechaNacimiento DATE NULL,
    Usuario NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    Rol NVARCHAR(50) NOT NULL DEFAULT 'cliente',
    Activo BIT NOT NULL DEFAULT 1,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2 NULL
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
    Estado NVARCHAR(50) NOT NULL DEFAULT 'disponible',
    Stock INT NOT NULL DEFAULT 0,
    Precio DECIMAL(18,2) NULL DEFAULT 0,
    CaratulaUrl NVARCHAR(500) NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2 NULL
  );
END
GO

-- Ventas / transacciones
IF OBJECT_ID('dbo.Ventas', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Ventas (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    UsuarioId INT NULL,
    ClienteNombre NVARCHAR(200) NULL,
    ClienteCorreo NVARCHAR(255) NULL,
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

-- Proveedores
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

PRINT 'Base de datos Booknest y tablas creadas correctamente.';
