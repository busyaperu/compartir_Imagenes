const express = require("express");
const multer = require("multer");
const { OpenAIApi } = require("openai");
const Tesseract = require("tesseract.js");

const app = express();

// Configuración de multer para almacenamiento en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Configuración de la API de OpenAI
const openai = new OpenAIApi({
  apiKey: process.env.OPENAI_API_KEY
});

const allowedApps = [
  "com.bcp.innovacxion.yapeapp",
  "com.bbva.pe.bbvacontigo",
  "com.interbank.mobilebanking",
  "pe.scotiabank.banking",
  "pe.bn.movil",
  "com.banbif.mobilebanking"
];

const PORT = process.env.PORT || 3000;

app.post("/process-image", upload.single('image'), async (req, res) => {
  const appID = req.body.app; // Supongamos que 'app' se envía como un campo en el formulario

  if (!req.file) {
    return res.status(400).send({ error: "Archivo de imagen no proporcionado." });
  }

  if (!allowedApps.includes(appID)) {
    return res.status(403).send({ error: "Aplicación no autorizada para este servicio." });
  }

  // OCR con Tesseract
  try {
    const { data: { text } } = await Tesseract.recognize(
      req.file.buffer,
      'spa',  // Asumiendo español, ajusta según necesidad
      { logger: m => console.log(m.status, m.progress) }
    );
    console.log("Texto OCR:", text);

    // Preparar el prompt para OpenAI
    const prompt = `
    Extrae y estructura los datos de la siguiente constancia de transferencia en formato JSON. Los campos requeridos son:
    - "amount": El monto transferido, representado por un número grande justo debajo del texto "¡Yapeaste!".
    - "nombre": El nombre del receptor de la transferencia, aparece justo debajo del monto.
    - "email": El correo electrónico del receptor, si está disponible.
    - "telefono": El número de teléfono del receptor, si está disponible.
    - "fecha": Fecha y hora de la operación, debería estar en formato "dd mmm yyyy-hhmm am/pm".
    - "medio_pago": Identificar el medio de pago utilizado, en este caso siempre será 'Yape'.
    - "numero_operacion": El número de la transacción, que se encuentra bajo la etiqueta "N° de operación".
    Texto de la constancia: ${text}
    `;

    // Llamada a la API de OpenAI para procesar el texto
    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: prompt,
      max_tokens: 1024
    });

    // Extraer y enviar los datos
    const openAiResponse = response.data.choices[0].text.trim();
    console.log("Respuesta de OpenAI:", openAiResponse);

    try {
      const extractedData = JSON.parse(openAiResponse);
      const { amount, nombre, email, telefono, medio_pago, numero_operacion } = extractedData;
      if (!amount || !nombre || !medio_pago || !numero_operacion) {
        throw new Error("Faltan campos obligatorios: amount, nombre, medio_pago o numero_operacion.");
      }
      if (!email && !telefono) {
        throw new Error("Debe incluirse al menos uno: email o teléfono.");
      }
      res.json({ success: true, data: extractedData });
    } catch (err) {
      console.error("Error al parsear JSON:", err);
      res.status(500).json({ error: "La respuesta de OpenAI no es un JSON válido." });
    }
  } catch (error) {
    console.error("Error durante OCR o llamada a OpenAI:", error);
    res.status(500).json({ error: "Error al procesar la imagen o la respuesta de OpenAI." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
