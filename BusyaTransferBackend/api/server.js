const express = require("express");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");
const vision = require('@google-cloud/vision'); // Importa el cliente de Google Vision

// Inicialización de Express
const app = express();
app.use(bodyParser.json());

// Inicialización de Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Inicialización de Google Cloud Vision
const client = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS, // Usa el archivo de credenciales de Google Cloud
});

app.post("/process-image", async (req, res) => {
  const { imageUrl, app: clientApp } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: "La URL de la imagen es obligatoria." });
  }

  // Restaurar la lista de aplicaciones permitidas (bancos)
  const allowedApps = [
    "com.bcp.innovacxion.yapeapp",
    "com.bbva.pe.bbvacontigo",
    "com.interbank.mobilebanking",
    "pe.scotiabank.banking",
    "pe.bn.movil",
    "com.banbif.mobilebanking"
  ];

  const app = allowedApps.includes(clientApp);
  if (!app) {
    return res.status(400).json({ error: "Aplicación no permitida." });
  }

  try {
    // Usar axios para obtener la imagen
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data, 'binary');

    // Usar Google Cloud Vision para procesar la imagen
    const [result] = await client.textDetection(imageBuffer);
    const detectedText = result.textAnnotations ? result.textAnnotations[0].description : '';

    if (!detectedText || detectedText === 'undefined') {
      return res.status(400).json({ error: "Texto extraído vacío o no válido." });
    }

    console.log("Texto extraído:", detectedText);

    // Procesar los datos extraídos (ejemplo con expresiones regulares)
    const extractedData = {
      amount: detectedText.match(/S\/\.\s(\d+\.\d{2})/) ? detectedText.match(/S\/\.\s(\d+\.\d{2})/)[1] : null,
      nombre: detectedText.match(/Nombre:\s([a-zA-Z\s]+)/) ? detectedText.match(/Nombre:\s([a-zA-Z\s]+)/)[1] : null,
      email: detectedText.match(/Email:\s([\w.-]+@[\w.-]+)/) ? detectedText.match(/Email:\s([\w.-]+@[\w.-]+)/)[1] : null,
      telefono: detectedText.match(/Telefono:\s(\d{9})/) ? detectedText.match(/Telefono:\s(\d{9})/)[1] : null,
      medio_pago: detectedText.match(/Medio de pago:\s([a-zA-Z\s]+)/) ? detectedText.match(/Medio de pago:\s([a-zA-Z\s]+)/)[1] : null,
      fecha_constancia: detectedText.match(/Fecha:\s([0-9]{4}-[0-9]{2}-[0-9]{2})/) ? detectedText.match(/Fecha:\s([0-9]{4}-[0-9]{2}-[0-9]{2})/)[1] : null,
      numero_operacion: detectedText.match(/N°\sde\soperación:\s(\d+)/) ? detectedText.match(/N°\sde\soperación:\s(\d+)/)[1] : null
    };

    // Insertar en Supabase
    const { data, error } = await supabase.from('acreditar').insert([extractedData]);

    if (error) {
      console.error("Error al insertar datos en Supabase:", error.message);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, data: data });

  } catch (error) {
    console.error("Error al procesar la imagen:", error);
    res.status(500).json({ error: "Error al procesar la imagen" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});
