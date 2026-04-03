-- Añade saga/serie opcional a libros (instalaciones ya creadas sin la columna).
USE Booknest;
GO

IF COL_LENGTH('dbo.Libros', 'Saga') IS NULL
BEGIN
  ALTER TABLE dbo.Libros ADD Saga NVARCHAR(200) NULL;
  PRINT 'Columna Saga añadida a dbo.Libros.';
END
ELSE
  PRINT 'La columna Saga ya existe en dbo.Libros.';
GO
