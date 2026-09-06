# 📡 SatLocate LATAM

Plataforma web de alta conversión y microservicios para la **localización satelital asistida por SMS**, superando a la competencia directa en diseño, confianza y flujo de monetización. Optimizada para el mercado latinoamericano (Colombia, México, Perú, Chile, Argentina, Ecuador, Guatemala, etc.).

---

## 🚀 Características Principales

- **Frontend de Alta Conversión (CRO):**
  - **Landing Page (`index.html`):** Diseño futurista con paleta Slate Deep / Midnight (`#0b132b` / `#0f172a`) y acentos cian eléctrico (`#06b6d4`).
  - **Selector de Países LATAM:** Banderas y prefijos (+57 🇨🇴, +52 🇲🇽, +51 🇵🇪, +56 🇨🇱, +54 🇦🇷, etc.).
  - **Micro-interacción de Escaneo:** Secuencia animada de 4 fases (antenas locales, verificación de señal, triangulación y preparación de enlace).
  - **Transparencia en Monetización:** Modal de cobro informando prueba trial de $1.50 USD / 24h y suscripción posterior de $10.00 USD/mes.

- **Integraciones:**
  - **dLocal Go:** Checkout para tarjetas de crédito/débito (recurrencia automática $1.50 trial + $10/mes) y métodos de pago único (PSE, OXXO).
  - **Twilio SDK:** Disparo automatizado de SMS con enlace único de confirmación tras pago exitoso.
  - **Mapbox GL JS:** Renderización del mapa táctico a pantalla completa (`mapbox://styles/mapbox/dark-v11`), marcadores de pulso y animación `map.flyTo()`.

- **Suscripción y Cancelación en 1-Clic:**
  - Endpoint backend `POST /api/subscription/cancel`.
  - Botón directo en la barra superior del Dashboard del emisor.

- **Modo Sandbox / Demostración:**
  - Entorno de pruebas integrado para simular pagos y SMS sin requerir credenciales reales activas.

---

## 📦 Estructura del Proyecto

```
loca_telefonos/
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── server.js
└── public/
    ├── index.html       # Landing Page & Embudo CRO
    ├── track.html       # Vista Móvil del Destinatario (Geolocation API)
    └── dashboard.html   # Panel de Monitoreo en Tiempo Real (Mapbox GL JS)
```

---

## 🔧 Instalación y Configuración

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/alvaradogilbert130/satlocate-latam.git
   cd satlocate-latam
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar Variables de Entorno:**
   Crea un archivo `.env` tomando como base `.env.example`:
   ```env
   PORT=3000
   BASE_URL=http://localhost:3000
   DLOCAL_API_KEY=tu_clave_api_dlocal
   DLOCAL_SECRET_KEY=tu_secret_dlocal
   TWILIO_ACCOUNT_SID=tu_sid_twilio
   TWILIO_AUTH_TOKEN=tu_token_twilio
   TWILIO_PHONE_NUMBER=+15005550006
   MAPBOX_ACCESS_TOKEN=tu_token_mapbox
   ```

4. **Iniciar el servidor:**
   ```bash
   npm start
   ```

5. **Acceder en el navegador:**
   [http://localhost:3000](http://localhost:3000)

---

## 📜 Licencia

MIT © 2026 SatLocate LATAM Team
