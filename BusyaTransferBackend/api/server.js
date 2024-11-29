const express = require("express");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");

const app = express();
app.use(bodyParser.json());

// Configuración de OpenAI utilizando la variable de entorno
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY // Usa la variable de entorno
});

// IDs permitidos para las aplicaciones de Yape, Plin y bancos
const allowedApps = [
  "com.bcp.innovacxion.yapeapp",       // Yape
  "com.bbva.pe.bbvacontigo",          // BBVA con Plin
  "com.interbank.mobilebanking",      // Interbank con Plin
  "pe.scotiabank.banking",            // Scotiabank con Plin
  "pe.bn.movil",                      // Banco de la Nación
  "com.banbif.mobilebanking"          // BanBIF con Plin
];

// Endpoint para procesar la imagen
app.post("/process-image", async (req, res) => {
  const { imageUrl, app } = req.body;

  try {
    // Verificar que la URL sea válida (enlace directo a la imagen)
    if (!imageUrl) {
      return res.status(400).json({ error: "La URL de la imagen es obligatoria." });
    }

    // Verificar si la app es permitida
    if (!allowedApps.includes(app)) {
      return res.status(400).json({ error: "Solo se permiten imágenes compartidas desde Yape, Plin o bancos." });
    }

    // Crear un prompt dinámico para extraer datos
    const prompt = `
      A continuación, recibirás información de una constancia de transferencia.
      Extrae y estructura los datos en un formato JSON con las siguientes claves estándar:
      - "amount" (puede aparecer como Pago exitoso, Te Yapearon).
      - "nombre" (puede aparecer como nombre, Enviado a).
      - "email" (puede aparecer como correo, email).
      - "telefono" (puede aparecer como teléfono, celular).
      - "medio_pago" (puede aparecer como Destino).
      - "fecha" (puede aparecer como Fecha y hora).
      - "numero_operacion" (puede aparecer como Código de operación, N° de operacion).
      Devuelve solo el JSON.
      URL de la constancia: ${imageUrl}
    `;

    // Solicitar a OpenAI que procese el prompt
    const response = await openai.chat.completions.create({
      model: "gpt-4o",  // Asegúrate de que el modelo sea el correcto
      messages: [{ role: "user", content: prompt }]
    });

    // Imprimir la respuesta cruda de OpenAI para depuración
      console.log("Respuesta cruda de OpenAI:", response);

    // Ahora intenta acceder al contenido
    //const rawContent = response.choices[0].message.content.trim();
    console.log("Contenido crudo:", rawContent);

    // Intentar analizar la respuesta
    let extractedData;
    try {
      extractedData = JSON.parse(rawContent);
    } catch (error) {
      throw new Error("Respuesta de OpenAI no es un JSON válido.");
    }

    // Validar campos obligatorios
    const { amount, nombre, email, telefono, medio_pago, numero_operacion } = extractedData;
    if (!amount || !nombre || !medio_pago || !numero_operacion) {
      throw new Error("Faltan campos obligatorios: amount, nombre, medio_pago o numero_operacion.");
    }

    // Verificar que al menos uno de los campos de contacto esté presente
    if (!email && !telefono) {
      throw new Error("Debe incluirse al menos uno: email o teléfono.");
    }

    res.json({ success: true, data: extractedData });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});
