const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const { OpenAI } = require("openai");
const { createClient } = require("@supabase/supabase-js");
const Tesseract = require("tesseract.js");
const sharp = require("sharp"); // Biblioteca para preprocesar imágenes

// Inicialización de Express
const app = express();
app.use(bodyParser.json());

// Configuración de almacenamiento en memoria para imágenes
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Inicialización de OpenAI y Supabase
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY // Usa la variable de entorno
});
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

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
    // Preprocesar la imagen usando Sharp
    const preprocessedImage = await sharp(req.file.buffer)
      .grayscale() // Convertir a escala de grises
      .threshold(150) // Aplicar un umbral para eliminar ruido
      .toBuffer();

    // Procesar OCR directamente desde la imagen preprocesada
    const ocrResult = await Tesseract.recognize(preprocessedImage, "spa");
    const cleanedText = ocrResult.data.text.trim();
    console.log("Texto extraído (OCR):", cleanedText);

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
      Texto de la constancia: ${cleanedText}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }]
    });

    const rawContent = response.choices[0].message.content.trim();
    console.log("Respuesta de OpenAI:", rawContent);

    let extractedData = JSON.parse(rawContent);

    // Extraer el monto del texto OCR si falta en OpenAI
    const amountMatch = cleanedText.match(/(?:S\/\.?\s?)?(\d+(\.\d{1,2})?)/);
    extractedData.amount =
      extractedData.amount && extractedData.amount !== "No especificado"
        ? parseFloat(extractedData.amount).toFixed(2)
        : amountMatch ? parseFloat(amountMatch[1]).toFixed(2) : null;

    // Validar y formatear otros datos
    extractedData.telefono = extractedData.telefono?.includes("***")
      ? null
      : extractedData.telefono;
    extractedData.email =
      extractedData.email && extractedData.email.toLowerCase() !== "n/a"
        ? extractedData.email
        : null;

    // Verificar campos obligatorios
    if (!extractedData.nombre || !extractedData.medio_pago || !extractedData.numero_operacion) {
      throw new Error("Faltan campos obligatorios.");
    }

    // Inserción en Supabase
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
