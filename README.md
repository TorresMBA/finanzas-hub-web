# finanzas-hub-web

Frontend de PersonalHub. Angular 22, sin zonas, componentes standalone y signals.

```powershell
npm ci
npm start                    # http://localhost:4200, con proxy a la API en http://localhost:5166
```

| Script | Qué hace |
|---|---|
| `npm start` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm test` | Tests unitarios (Vitest); `npm test -- --watch=false` para una sola pasada |
| `npm run lint` | ESLint, incluidas las reglas de límites entre `core`, `shared`, `layout` y `features` |
| `npm run api:generate` | Regenera `src/app/core/api/schema.ts` desde `../docs/api/openapi.v1.json` |
| `npm run e2e` | Playwright. Requiere la API en marcha. Con `PW_CHANNEL=chrome` usa el Chrome instalado; si no, `npx playwright install chromium` |

Arquitectura, estructura de carpetas y convenciones: [../docs/architecture/frontend.md](../docs/architecture/frontend.md).
