const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const { OpenAI } = require("openai");
const { createClient } = require("@supabase/supabase-js");
const vision = require("@google-cloud/vision");

const app = express();
app.use(bodyParser.json());

// Configuración de almacenamiento en memoria para imágenes
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Inicialización de OpenAI y Supabase
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const fs = require("fs");

// Crear un archivo temporal para las credenciales
const credentialsPath = "/tmp/credentials.json";
fs.writeFileSync(credentialsPath, process.env.GOOGLE_APPLICATION_CREDENTIALS);

// Configuración del cliente de Google Cloud Vision
process.env.GOOGLE_APPLICATION_CREDENTIALS = "/app/credentials.json"; // Ruta para credenciales en Railway
const client = new vision.ImageAnnotatorClient();

const allowedApps = [
  "com.bcp.innovacxion.yapeapp",
  "com.bbva.pe.bbvacontigo",
  "com.interbank.mobilebanking",
  "pe.scotiabank.banking",
  "pe.bn.movil",
  "com.banbif.mobilebanking"
];

app.post("/process-image", upload.single("image"), async (req, res) => {
  const { app: clientApp } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: "La imagen es obligatoria." });
  }
  if (!allowedApps.includes(clientApp)) {
    return res.status(400).json({ error: "Aplicación no permitida." });
  }

  try {
    // Usar Google Cloud Vision para procesar la imagen
    const [result] = await client.textDetection(req.file.buffer);
    const detectedText = result.fullTextAnnotation?.text || "";
    console.log("Texto extraído (OCR):", detectedText);

    // Usar OpenAI GPT para procesar y extraer datos
    const prompt = `
      A continuación, recibirás información de una constancia de transferencia.
      Extrae y estructura los datos en un formato JSON con las siguientes claves estándar:
      - "amount" (puede aparecer como Pago exitoso, Te Yapearon, S/. <monto>).
      - "nombre" (puede aparecer como nombre, Enviado a).
      - "email" (puede aparecer como correo, email).
      - "telefono" (puede aparecer como teléfono, celular).
      - "medio_pago" (puede aparecer como Destino).
      - "fecha_constancia" (puede aparecer como Fecha y hora).
      - "numero_operacion" (puede aparecer como Código de operación, N° de operacion).
      Texto de la constancia: ${detectedText}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }]
    });

    const rawContent = response.choices[0].message.content.trim();
    console.log("Respuesta de OpenAI:", rawContent);

    let extractedData = JSON.parse(rawContent);

    // Limpieza y validación del monto
    const amountMatch = detectedText.match(/(?:S\/)?\s?(\d+(\.\d{1,2})?)/);
    extractedData.amount =
      extractedData.amount && extractedData.amount !== "No especificado"
        ? parseFloat(extractedData.amount).toFixed(2)
        : amountMatch ? parseFloat(amountMatch[1]).toFixed(2) : null;

    // Limpieza del teléfono
    extractedData.telefono = extractedData.telefono?.match(/\d{9}/)?.[0] || null;

    // Validar datos obligatorios
    if (!extractedData.amount || isNaN(extractedData.amount)) {
      console.error("Error: Monto inválido o no encontrado:", extractedData.amount);
      return res.status(400).json({ error: "Monto inválido o no encontrado." });
    }

    if (!extractedData.nombre || !extractedData.medio_pago || !extractedData.numero_operacion) {
      throw new Error("Faltan campos obligatorios.");
    }

    const { data, error } = await supabase.from("acreditar").insert([{
      amount: extractedData.amount,
      nombre: extractedData.nombre,
      email: extractedData.email,
      telefono: extractedData.telefono,
      medio_pago: extractedData.medio_pago,
      fecha_constancia: extractedData.fecha_constancia,
      numero_operacion: extractedData.numero_operacion,
    }]);

    if (error) {
      console.error("Error al insertar datos en Supabase:", error.message);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Error al estructurar los datos" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});
