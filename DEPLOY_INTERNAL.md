# Despliegue interno operativo

Este artefacto está pensado para un entorno protegido. GitHub Pages sólo debe servir la configuración pública agregada.

## Opción archivo privado

1. Copiar el proyecto a un entorno institucional o privado.
2. Colocar la base original en `data/interno/base_original.xlsx` o `.csv`.
3. Generar la fuente operativa con:

```powershell
node scripts/build-producer-data.mjs "./data/interno/base_original.xlsx"
```

4. Ejecutar:

```powershell
node scripts/build-config.mjs internal
python -m http.server 8000 --directory dist
```

Para producción, reemplazar el servidor de prueba por un servidor institucional con autenticación, intranet o proxy de acceso.

## Opción API protegida

```powershell
node scripts/build-config.mjs internal `
  --data-url https://dominio-interno/api/productores `
  --locator-endpoint https://dominio-interno/api/secure-locator
```

La API debe autenticar al usuario, registrar auditoría y devolver sólo los campos operativos autorizados. No debe devolver titularidad, documentos, contactos ni datos individuales fuera del alcance del usuario.

## Verificación previa

- Confirmar que el dominio exige login o está dentro de la intranet.
- Confirmar que `dist/config.js` indica `APP_MODE: "internal"`.
- Confirmar que aparece “Modo interno operativo” y “Datos internos cargados”.
- Confirmar que la fuente individual no está en el repositorio público.
- No reutilizar el artefacto interno en el workflow de GitHub Pages.
