USE Booknest;
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

-- Migra ventas históricas que tenían Detalle en JSON hacia filas normalizadas.
-- Requiere SQL Server con soporte JSON (OPENJSON).
BEGIN TRY
  INSERT INTO dbo.VentaDetalle (VentaId, LibroId, Titulo, Cantidad, PrecioUnitario, Subtotal)
  SELECT
    v.Id AS VentaId,
    TRY_CAST(JSON_VALUE(j.value, '$.libroId') AS INT) AS LibroId,
    COALESCE(JSON_VALUE(j.value, '$.titulo'), N'') AS Titulo,
    COALESCE(TRY_CAST(JSON_VALUE(j.value, '$.cantidad') AS INT), 0) AS Cantidad,
    COALESCE(TRY_CAST(JSON_VALUE(j.value, '$.precio') AS DECIMAL(18,2)), 0) AS PrecioUnitario,
    COALESCE(TRY_CAST(JSON_VALUE(j.value, '$.subtotal') AS DECIMAL(18,2)), 0) AS Subtotal
  FROM dbo.Ventas v
  CROSS APPLY OPENJSON(v.Detalle) j
  WHERE v.Detalle IS NOT NULL
    AND LTRIM(RTRIM(CAST(v.Detalle AS NVARCHAR(MAX)))) <> N''
    AND NOT EXISTS (SELECT 1 FROM dbo.VentaDetalle vd WHERE vd.VentaId = v.Id);
END TRY
BEGIN CATCH
  PRINT 'No se pudo migrar desde JSON (OPENJSON no disponible o detalle inválido): ' + ERROR_MESSAGE();
END CATCH;
GO

PRINT 'Migración VentaDetalle completada.';
