-- Ejecutar en Booknest si la BD ya existía sin ProveedorId en Libros.
-- Idempotente: no falla si la columna o la FK ya existen.

USE Booknest;
GO

IF COL_LENGTH('dbo.Libros', 'ProveedorId') IS NULL
BEGIN
  ALTER TABLE dbo.Libros ADD ProveedorId INT NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Libros_Proveedor' AND parent_object_id = OBJECT_ID('dbo.Libros')
)
BEGIN
  ALTER TABLE dbo.Libros
    ADD CONSTRAINT FK_Libros_Proveedor FOREIGN KEY (ProveedorId) REFERENCES dbo.Proveedores (Id);
END
GO

PRINT 'Migración Libros.ProveedorId aplicada (o ya estaba al día).';
GO
