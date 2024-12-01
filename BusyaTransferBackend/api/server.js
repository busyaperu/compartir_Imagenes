const express = require("express");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");
const vision = require('@google-cloud/vision');
const fs = require('fs');

// Inicialización de Express
const app = express();
app.use(bodyParser.json());

// Inicialización de Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Configuración del cliente de Google Vision API
const client = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS // Asegúrate de haber subido las credenciales de Google Cloud
});

app.post("/process-image", async (req, res) => {
  const { imageUrl, app: clientApp } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: "La URL de la imagen es obligatoria." });
  }

  const allowedApps = ["com.bcp.innovacxion.yapeapp", "com.bbva.pe.bbvacontigo"];
  const app = allowedApps.includes(clientApp);
  if (!app) {
    return res.status(400).json({ error: "Aplicación no permitida." });
  }

  try {
    // Usar axios para obtener la imagen
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data, 'binary');
    
    // Procesar la imagen con Google Vision API
    const [result] = await client.textDetection(imageBuffer);
    const text = result.fullTextAnnotation ? result.fullTextAnnotation.text : '';
    
    if (!text) {
      return res.status(400).json({ error: "Texto no encontrado en la imagen." });
    }

    console.log("Texto extraído:", text);

    // Procesar los datos extraídos (ejemplo con expresiones regulares)
    const extractedData = {
      amount: text.match(/S\/\.\s(\d+\.\d{2})/) ? text.match(/S\/\.\s(\d+\.\d{2})/)[1] : null,
      nombre: text.match(/Enviado a:\s([a-zA-Z\s]+)/) ? text.match(/Enviado a:\s([a-zA-Z\s]+)/)[1] : null,
      telefono: text.match(/(\d{9})/) ? text.match(/(\d{9})/)[1] : null,
      medio_pago: text.match(/Destino:\s([a-zA-Z\s]+)/) ? text.match(/Destino:\s([a-zA-Z\s]+)/)[1] : null,
      fecha_constancia: text.match(/(\d{2}\s[a-zA-Z]+\s\d{4})/) ? text.match(/(\d{2}\s[a-zA-Z]+\s\d{4})/)[1] : null,
      numero_operacion: text.match(/Código de operación:\s(\d+)/) ? text.match(/Código de operación:\s(\d+)/)[1] : null
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
